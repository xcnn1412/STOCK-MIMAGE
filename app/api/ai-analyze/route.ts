import { cookies } from 'next/headers'
import { NextRequest } from 'next/server'

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

function fmt(n: number): string {
  return n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
}

function buildDataPayload(events: any[], sections: string[]): string {
  const sectionSet = new Set(sections)
  let payload = ''

  if (sectionSet.has('financial')) {
    const totalRevenue = events.reduce((s: number, e: any) => s + e.revenue, 0)
    const totalCost = events.reduce((s: number, e: any) => s + e.totalCost, 0)
    const totalProfit = totalRevenue - totalCost
    const margin = totalRevenue > 0 ? (totalProfit / totalRevenue * 100) : 0
    payload += `\n## ภาพรวมการเงิน\n`
    payload += `- จำนวนอีเวนต์: ${events.length}\n`
    payload += `- รายรับรวม: ฿${fmt(totalRevenue)}\n`
    payload += `- ต้นทุนรวม: ฿${fmt(totalCost)} (${totalRevenue > 0 ? (totalCost / totalRevenue * 100).toFixed(1) : 0}% ของรายรับ)\n`
    payload += `- กำไรรวม: ฿${fmt(totalProfit)}\n`
    payload += `- Gross Margin: ${margin.toFixed(1)}%\n`
    payload += `- กำไรเฉลี่ย/อีเวนต์: ฿${fmt(totalProfit / (events.length || 1))}\n`
  }

  if (sectionSet.has('cost_breakdown')) {
    const costAgg: Record<string, number> = {}
    events.forEach((e: any) => {
      Object.entries(e.costByCategory || {}).forEach(([k, v]) => { costAgg[k] = (costAgg[k] || 0) + (v as number) })
    })
    const totalCost = Object.values(costAgg).reduce((s, v) => s + v, 0)
    payload += `\n## ต้นทุนแยกหมวด\n`
    Object.entries(costAgg).sort(([, a], [, b]) => b - a).forEach(([cat, val]) => {
      payload += `- ${COST_LABELS[cat] || cat}: ฿${fmt(val)} (${totalCost > 0 ? (val / totalCost * 100).toFixed(1) : 0}%)\n`
    })
  }

  if (sectionSet.has('per_event')) {
    payload += `\n## รายละเอียดรายอีเวนต์\n`
    payload += `| อีเวนต์ | วันที่ | เซล | ราคาขาย | ต้นทุน | กำไร | Margin | เบิกจ่าย | เช็คอิน |\n`
    payload += `|---|---|---|---|---|---|---|---|---|\n`
    events.forEach((e: any) => {
      payload += `| ${e.name} | ${e.date || '—'} | ${e.seller || '—'} | ฿${fmt(e.revenue)} | ฿${fmt(e.totalCost)} | ฿${fmt(e.profit)} | ${e.margin.toFixed(0)}% | ฿${fmt(e.expenseTotal)} (${e.expenseCount}ครั้ง) | ${e.checkinCount}คน |\n`
    })
    payload += `\n### ต้นทุนแต่ละอีเวนต์\n`
    events.forEach((e: any) => {
      if (Object.keys(e.costByCategory || {}).length > 0) {
        payload += `**${e.name}**: `
        payload += Object.entries(e.costByCategory).map(([cat, val]) => `${COST_LABELS[cat] || cat} ฿${fmt(val as number)}`).join(', ')
        payload += `\n`
      }
    })
  }

  if (sectionSet.has('sellers')) {
    const sellerMap = new Map<string, { revenue: number; cost: number; count: number }>()
    events.forEach((e: any) => {
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

  if (sectionSet.has('expenses')) {
    const totalExp = events.reduce((s: number, e: any) => s + e.expenseTotal, 0)
    const totalPaid = events.reduce((s: number, e: any) => s + e.expensePaid, 0)
    const totalCount = events.reduce((s: number, e: any) => s + e.expenseCount, 0)
    payload += `\n## ข้อมูลเบิกจ่าย\n`
    payload += `- เบิกจ่ายรวม: ฿${fmt(totalExp)} (${totalCount} ครั้ง)\n`
    payload += `- จ่ายแล้ว: ฿${fmt(totalPaid)} (${totalExp > 0 ? (totalPaid / totalExp * 100).toFixed(0) : 0}%)\n`
    payload += `- ค้างจ่าย: ฿${fmt(totalExp - totalPaid)}\n`
    events.filter((e: any) => e.expenseCount > 0).forEach((e: any) => {
      payload += `- ${e.name}: ฿${fmt(e.expenseTotal)} (${e.expenseCount}ครั้ง, จ่ายแล้ว ฿${fmt(e.expensePaid)})\n`
    })
  }

  if (sectionSet.has('checkins')) {
    payload += `\n## ข้อมูลเช็คอิน\n`
    events.filter((e: any) => e.checkinCount > 0).forEach((e: any) => {
      payload += `- ${e.name}: ${e.checkinCount} เช็คอิน, ${e.checkinUniqueStaff} คนไม่ซ้ำ, ${e.checkinHours.toFixed(1)} ชม.\n`
    })
  }

  if (sectionSet.has('graphics')) {
    const gfxMap = new Map<string, number>()
    events.forEach((e: any) => (e.graphicsNames || []).forEach((g: string) => gfxMap.set(g, (gfxMap.get(g) || 0) + 1)))
    if (gfxMap.size > 0) {
      payload += `\n## Graphic Designers\n`
      Array.from(gfxMap.entries()).sort(([, a], [, b]) => b - a).forEach(([name, count]) => {
        payload += `- ${name}: ${count} อีเวนต์\n`
      })
    }
  }

  return payload
}

export async function POST(request: NextRequest) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (role !== 'admin') {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_API_KEY not configured' }), { status: 500 })
  }

  const { events, includeSections, customPrompt } = await request.json()
  const dataPayload = buildDataPayload(events, includeSections)

  let userPrompt = `จากข้อมูลอีเวนต์ต่อไปนี้ (${events.length} อีเวนต์):\n${dataPayload}\n\n`
  if (customPrompt?.trim()) {
    userPrompt += `คำถามเพิ่มเติม: ${customPrompt}\n\n`
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
      maxOutputTokens: 65536,
    },
  }

  // Use model from env as first choice, then fallback to stable models
  const envModel = process.env.GEMINI_MODEL
  const fallbackModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash']
  const models = envModel
    ? [envModel, ...fallbackModels.filter(m => m !== envModel)]
    : fallbackModels

  const errors: string[] = []
  for (const modelName of models) {
    try {
      // Use streaming endpoint
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`
      console.log(`[AI] Trying model: ${modelName}`)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errBody = await res.text().catch(() => '')
        const msg = `[AI] Model ${modelName} failed: HTTP ${res.status} - ${errBody.slice(0, 200)}`
        console.error(msg)
        errors.push(msg)
        continue
      }
      if (!res.body) {
        console.error(`[AI] Model ${modelName}: no response body`)
        continue
      }

      console.log(`[AI] Model ${modelName} connected successfully, streaming...`)
      // Stream back to client
      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''

          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) break

              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''

              for (const line of lines) {
                if (line.startsWith('data: ')) {
                  const jsonStr = line.slice(6).trim()
                  if (!jsonStr || jsonStr === '[DONE]') continue
                  try {
                    const parsed = JSON.parse(jsonStr)
                    const text = parsed?.candidates?.[0]?.content?.parts?.[0]?.text
                    if (text) {
                      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`))
                    }
                  } catch {
                    // Skip unparseable chunks
                  }
                }
              }
            }
          } catch (err) {
            console.error('Stream error:', err)
          } finally {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            controller.close()
          }
        }
      })

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      })
    } catch (err) {
      const msg = `[AI] Model ${modelName} exception: ${err instanceof Error ? err.message : String(err)}`
      console.error(msg)
      errors.push(msg)
      continue
    }
  }

  console.error('[AI] All models failed:', errors)
  
  // Check if all errors were quota/rate-limit related
  const isQuotaError = errors.some(e => e.includes('429') || e.includes('RESOURCE_EXHAUSTED'))
  const errorMessage = isQuotaError
    ? 'API quota เต็มแล้ว กรุณาสร้าง API Key ใหม่ที่ Google AI Studio หรือรอ quota reset'
    : 'ไม่สามารถเชื่อมต่อ Gemini ได้ กรุณาลองใหม่'
  
  return new Response(JSON.stringify({ error: errorMessage, details: errors }), { status: isQuotaError ? 429 : 500 })
}
