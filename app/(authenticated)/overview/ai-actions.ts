'use server'

import { cookies } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'

async function getSession() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user')?.value || ''
  return { role, userId }
}

const COST_LABELS: Record<string, string> = {
  staff: 'ค่าแรง', travel: 'ค่าเดินทาง', electrical_equipment: 'อุปกรณ์ไฟฟ้า',
  struture: 'โครงสร้าง', service_fee: 'ค่าบริการ', other: 'อื่นๆ',
}

const SYSTEM_PROMPT = `คุณคือนักวิเคราะห์ธุรกิจอีเวนต์อาวุโส (Senior Event Business Analyst) ที่มีประสบการณ์ 15 ปี
มีความเชี่ยวชาญด้าน:
- การวิเคราะห์ต้นทุน กำไร และอัตรากำไรขั้นต้น (Gross Margin)
- การประเมินประสิทธิภาพทีมขาย (Sales Performance) 
- การวิเคราะห์โครงสร้างต้นทุน (Cost Structure Analysis)
- การวางแผนกลยุทธ์เพิ่มกำไร

กฎ:
1. ตอบเป็นภาษาไทยเท่านั้น
2. ใช้ตัวเลขจากข้อมูลจริงเท่านั้น ห้ามเดาหรือสมมุติตัวเลข
3. จัดรูปแบบด้วย markdown (หัวข้อ, bullet, bold, ตาราง)
4. ใส่ emoji เพื่อให้อ่านง่าย
5. ให้คำแนะนำที่ actionable ทำได้ทันที
6. เปรียบเทียบอีเวนต์ที่ดีที่สุดกับแย่ที่สุด
7. ถ้าพบปัญหา ให้ระบุชื่ออีเวนต์และตัวเลขที่ชัดเจน
8. สรุปท้ายด้วยคำแนะนำเร่งด่วน 3 ข้อ`

export interface AiAnalysisRequest {
  events: Array<{
    name: string
    date: string | null
    location: string | null
    seller: string
    customerName: string
    packageName: string
    revenue: number
    totalCost: number
    costByCategory: Record<string, number>
    profit: number
    margin: number
    expenseTotal: number
    expenseCount: number
    expensePaid: number
    checkinCount: number
    checkinUniqueStaff: number
    checkinHours: number
    graphicsNames: string[]
    staff: string
    status: string | null
  }>
  includeSections: string[]
  customPrompt: string
}

function fmt(n: number): string {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function buildDataPayload(req: AiAnalysisRequest): string {
  const events = req.events
  const sections = new Set(req.includeSections)
  let payload = ''

  // ── Financial Summary ──
  if (sections.has('financial')) {
    const totalRevenue = events.reduce((s, e) => s + e.revenue, 0)
    const totalCost = events.reduce((s, e) => s + e.totalCost, 0)
    const totalProfit = totalRevenue - totalCost
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0
    payload += `\n## ภาพรวมการเงิน\n`
    payload += `- จำนวนอีเวนต์: ${events.length}\n`
    payload += `- รายรับรวม: ฿${fmt(totalRevenue)}\n`
    payload += `- ต้นทุนรวม: ฿${fmt(totalCost)} (${(totalCost / totalRevenue * 100).toFixed(1)}% ของรายรับ)\n`
    payload += `- กำไรรวม: ฿${fmt(totalProfit)}\n`
    payload += `- Gross Margin: ${margin.toFixed(1)}%\n`
    payload += `- กำไรเฉลี่ย/อีเวนต์: ฿${fmt(totalProfit / (events.length || 1))}\n`
  }

  // ── Cost Breakdown ──
  if (sections.has('cost_breakdown')) {
    const costAgg: Record<string, number> = {}
    events.forEach(e => {
      Object.entries(e.costByCategory).forEach(([k, v]) => { costAgg[k] = (costAgg[k] || 0) + v })
    })
    const totalCost = Object.values(costAgg).reduce((s, v) => s + v, 0)
    payload += `\n## ต้นทุนแยกหมวด\n`
    Object.entries(costAgg).sort(([, a], [, b]) => b - a).forEach(([cat, val]) => {
      payload += `- ${COST_LABELS[cat] || cat}: ฿${fmt(val)} (${(val / totalCost * 100).toFixed(1)}%)\n`
    })
  }

  // ── Per-Event Details ──
  if (sections.has('per_event')) {
    payload += `\n## รายละเอียดรายอีเวนต์\n`
    payload += `| อีเวนต์ | วันที่ | เซล | ราคาขาย | ต้นทุน | กำไร | Margin | เบิกจ่าย | เช็คอิน |\n`
    payload += `|---|---|---|---|---|---|---|---|---|\n`
    events.forEach(e => {
      payload += `| ${e.name} | ${e.date || '—'} | ${e.seller || '—'} | ฿${fmt(e.revenue)} | ฿${fmt(e.totalCost)} | ฿${fmt(e.profit)} | ${e.margin.toFixed(0)}% | ฿${fmt(e.expenseTotal)} (${e.expenseCount}ครั้ง) | ${e.checkinCount}คน |\n`
    })
    // Per-event cost detail
    payload += `\n### ต้นทุนแต่ละอีเวนต์\n`
    events.forEach(e => {
      if (Object.keys(e.costByCategory).length > 0) {
        payload += `**${e.name}**: `
        payload += Object.entries(e.costByCategory).map(([cat, val]) => `${COST_LABELS[cat] || cat} ฿${fmt(val)}`).join(', ')
        payload += `\n`
      }
    })
  }

  // ── Sellers ──
  if (sections.has('sellers')) {
    const sellerMap = new Map<string, { revenue: number; cost: number; count: number }>()
    events.forEach(e => {
      if (e.seller) {
        const prev = sellerMap.get(e.seller) || { revenue: 0, cost: 0, count: 0 }
        prev.revenue += e.revenue; prev.cost += e.totalCost; prev.count++
        sellerMap.set(e.seller, prev)
      }
    })
    payload += `\n## ประสิทธิภาพเซล\n`
    payload += `| เซล | อีเวนต์ | รายรับ | ต้นทุน | กำไร | Margin |\n`
    payload += `|---|---|---|---|---|---|\n`
    Array.from(sellerMap.entries()).sort(([, a], [, b]) => b.revenue - a.revenue).forEach(([name, v]) => {
      const profit = v.revenue - v.cost
      const margin = v.revenue > 0 ? (profit / v.revenue * 100) : 0
      payload += `| ${name} | ${v.count} | ฿${fmt(v.revenue)} | ฿${fmt(v.cost)} | ฿${fmt(profit)} | ${margin.toFixed(0)}% |\n`
    })
  }

  // ── Expenses ──
  if (sections.has('expenses')) {
    const totalExp = events.reduce((s, e) => s + e.expenseTotal, 0)
    const totalPaid = events.reduce((s, e) => s + e.expensePaid, 0)
    const totalCount = events.reduce((s, e) => s + e.expenseCount, 0)
    payload += `\n## ข้อมูลเบิกจ่าย\n`
    payload += `- เบิกจ่ายรวม: ฿${fmt(totalExp)} (${totalCount} ครั้ง)\n`
    payload += `- จ่ายแล้ว: ฿${fmt(totalPaid)} (${totalExp > 0 ? (totalPaid / totalExp * 100).toFixed(0) : 0}%)\n`
    payload += `- ค้างจ่าย: ฿${fmt(totalExp - totalPaid)}\n`
    // Per event
    events.filter(e => e.expenseCount > 0).forEach(e => {
      payload += `- ${e.name}: ฿${fmt(e.expenseTotal)} (${e.expenseCount}ครั้ง, จ่ายแล้ว ฿${fmt(e.expensePaid)})\n`
    })
  }

  // ── Checkins ──
  if (sections.has('checkins')) {
    payload += `\n## ข้อมูลเช็คอิน\n`
    events.filter(e => e.checkinCount > 0).forEach(e => {
      payload += `- ${e.name}: ${e.checkinCount} เช็คอิน, ${e.checkinUniqueStaff} คนไม่ซ้ำ, ${e.checkinHours.toFixed(1)} ชม.\n`
    })
  }

  // ── Graphics ──
  if (sections.has('graphics')) {
    const gfxMap = new Map<string, number>()
    events.forEach(e => e.graphicsNames.forEach(g => gfxMap.set(g, (gfxMap.get(g) || 0) + 1)))
    if (gfxMap.size > 0) {
      payload += `\n## Graphic Designers\n`
      Array.from(gfxMap.entries()).sort(([, a], [, b]) => b - a).forEach(([name, count]) => {
        payload += `- ${name}: ${count} อีเวนต์\n`
      })
    }
  }

  return payload
}

export async function analyzeOverview(req: AiAnalysisRequest): Promise<{ success: boolean; result?: string; error?: string }> {
  const { role } = await getSession() // eslint-disable-line @typescript-eslint/no-unused-vars -- used below
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return { success: false, error: 'GEMINI_API_KEY not configured' }

  try {
    const dataPayload = buildDataPayload(req)

    let userPrompt = `จากข้อมูลอีเวนต์ต่อไปนี้ (${req.events.length} อีเวนต์):\n${dataPayload}\n\n`

    if (req.customPrompt.trim()) {
      userPrompt += `คำถามเพิ่มเติม: ${req.customPrompt}\n\n`
    }

    userPrompt += `กรุณาวิเคราะห์ข้อมูลข้างต้นอย่างละเอียด ตามหัวข้อต่อไปนี้:

1. 📊 **สรุปภาพรวม** — สุขภาพทางการเงินเป็นอย่างไร ดี/ไม่ดี เพราะอะไร
2. 📈 **แนวโน้ม** — จากข้อมูลที่มี รายรับ/กำไร มีแนวโน้มเป็นอย่างไร
3. ⚠️ **จุดเสี่ยง** — อีเวนต์ไหนที่ margin ต่ำหรือขาดทุน ระบุชื่อและสาเหตุ
4. 💰 **โครงสร้างต้นทุน** — หมวดไหนสูงผิดปกติ ควรปรับลดอย่างไร
5. 🏆 **ประสิทธิภาพทีม** — เซล/กราฟฟิกใครทำผลงานดี/ไม่ดี
6. 📋 **การเบิกจ่าย** — มีปัญหาอะไรที่ต้องติดตาม
7. 🔍 **วินิจฉัยปัญหาและแนวทางแก้ไข** — สำหรับแต่ละปัญหาที่พบ ให้ระบุ:
   - สาเหตุรากของปัญหา (Root Cause) คืออะไร
   - แนวทางแก้ไขเฉพาะเจาะจง พร้อมขั้นตอนปฏิบัติที่ชัดเจน
   - ผลลัพธ์ที่คาดหวังหลังแก้ไข (เช่น ลดต้นทุนได้กี่ % หรือเพิ่มกำไรได้เท่าไหร่)
   - ระยะเวลาที่ควรเห็นผล
8. 📌 **แผนปฏิบัติการ (Action Plan)** — สรุปเป็นตาราง:
   - ระยะเร่งด่วน (ทำทันที ภายใน 1 สัปดาห์) — 3 ข้อ
   - ระยะกลาง (ภายใน 1 เดือน) — 2-3 ข้อ
   - ระยะยาว (ภายใน 3 เดือน) — 1-2 ข้อ
   - แต่ละข้อให้ระบุ: สิ่งที่ต้องทำ, ผู้รับผิดชอบ (ถ้าระบุได้), KPI ที่ใช้วัดผล`

    const body = {
      contents: [
        { role: 'user', parts: [{ text: SYSTEM_PROMPT + '\n\n' + userPrompt }] }
      ],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 8192,
      },
    }

    // Try models in order: env model → stable fallbacks
    const envModel = process.env.GEMINI_MODEL
    const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
    const models = envModel
      ? [envModel, ...fallbackModels.filter(m => m !== envModel)]
      : fallbackModels
    
    let lastError: any = null
    for (const modelName of models) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })

          if (res.status === 404) {
            // Model not found, try next model
            break
          }

          if (res.status === 429) {
            // Rate limited, wait and retry
            if (attempt < 1) {
              await new Promise(resolve => setTimeout(resolve, 3000))
              continue
            }
            break // Try next model
          }

          if (!res.ok) {
            const errData = await res.text()
            throw new Error(`API error ${res.status}: ${errData}`)
          }

          const data = await res.json()
          const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
          if (text) {
            return { success: true, result: text }
          }
          throw new Error('No response from model')
        } catch (err: any) {
          lastError = err
          if (err.message?.includes('404')) break // Try next model
        }
      }
    }

    throw lastError || new Error('All models failed')
  } catch (err: any) {
    console.error('Gemini API error:', err)
    const msg = err.message || 'AI analysis failed'
    if (msg.includes('429')) {
      return { success: false, error: 'เกิน rate limit ของ Gemini กรุณารอ 10-15 วินาทีแล้วลองใหม่' }
    }
    return { success: false, error: msg }
  }
}

// ============================================================================
// AI Analysis History — CRUD
// ============================================================================

export interface AiHistoryRecord {
  id: string
  created_at: string
  event_count: number
  date_from: string | null
  date_to: string | null
  sections: string[]
  custom_prompt: string | null
  data_snapshot: Record<string, unknown>
  ai_result: string
  model_used: string | null
}

export async function saveAiAnalysis(params: {
  eventCount: number
  dateFrom: string
  dateTo: string
  sections: string[]
  customPrompt: string
  dataSnapshot: Record<string, unknown>
  aiResult: string
  modelUsed?: string
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const { role, userId } = await getSession()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ai_analysis_history')
    .insert({
      created_by: userId,
      event_count: params.eventCount,
      date_from: params.dateFrom || null,
      date_to: params.dateTo || null,
      sections: params.sections,
      custom_prompt: params.customPrompt || null,
      data_snapshot: params.dataSnapshot,
      ai_result: params.aiResult,
      model_used: params.modelUsed || null,
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }
  return { success: true, id: data.id }
}

export async function getAiAnalysisHistory(): Promise<{ data: Omit<AiHistoryRecord, 'ai_result' | 'data_snapshot'>[]; error?: string }> {
  const { role } = await getSession()
  if (role !== 'admin') return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ai_analysis_history')
    .select('id, created_at, event_count, date_from, date_to, sections, custom_prompt, model_used')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return { data: [], error: error.message }
  return { data: (data || []) as Omit<AiHistoryRecord, 'ai_result' | 'data_snapshot'>[] }
}

export async function getAiAnalysisDetail(id: string): Promise<{ data: AiHistoryRecord | null; error?: string }> {
  const { role } = await getSession()
  if (role !== 'admin') return { data: null, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('ai_analysis_history')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as AiHistoryRecord }
}

export async function deleteAiAnalysis(id: string): Promise<{ success: boolean; error?: string }> {
  const { role } = await getSession()
  if (role !== 'admin') return { success: false, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { error } = await supabase
    .from('ai_analysis_history')
    .delete()
    .eq('id', id)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
