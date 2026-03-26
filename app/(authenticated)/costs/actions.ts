'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'


async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  return { userId, role }
}

// ============================================================================
// Helpers — Name Normalization + Date Conversion
// ============================================================================

/** Strip emojis, date/time info, and special chars for fuzzy matching */
function normalizeName(name: string): string {
  return name
    .replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F000}-\u{1FFFF}]/gu, '')
    .replace(/วัน(จันทร์|อังคาร|พุธ|พฤหัสบดี|ศุกร์|เสาร์|อาทิตย์)ที่\s*\d+.*$/i, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\d{1,2}:\d{2}\s*[–-]\s*\d{1,2}:\d{2}/g, '')
    .replace(/เวลา\s*\d{1,2}:\d{2}/g, '')
    .replace(/[·\-–—|]/g, ' ')
    .replace(/[🔴🟡🟢⚪🟠🟣📍]/g, '')
    .replace(/\(ปิดงาน\)/g, '')
    .replace(/ระบบใหม่/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Extract keywords from a name for partial matching */
function extractKeywords(name: string): string[] {
  const normalized = normalizeName(name)
  return normalized.split(/\s+/).filter(w => w.length > 1)
}

/** Score how well two names match (0 = no match, higher = better) */
function matchScore(eventName: string, customerName: string): number {
  const en = normalizeName(eventName)
  const cn = normalizeName(customerName)
  if (!cn || cn.length < 2) return 0
  
  // Exact substring match
  if (en.includes(cn)) return 100
  if (cn.includes(en)) return 90
  
  // Keyword overlap
  const enWords = extractKeywords(eventName)
  const cnWords = extractKeywords(customerName)
  const overlap = cnWords.filter(w => enWords.some(ew => ew.includes(w) || w.includes(ew)))
  if (overlap.length > 0 && overlap.length >= cnWords.length * 0.5) {
    return 50 + (overlap.length / cnWords.length) * 40
  }
  
  // Check if customer name initials/short name appears in event
  // e.g. K.Boat, K.Pea, K.Goi
  const kMatch = cn.match(/k\.\s*(\S+)/i) || cn.match(/^(\S{2,})$/)
  if (kMatch) {
    const shortName = kMatch[1].toLowerCase()
    if (shortName.length >= 2 && en.includes(shortName)) return 70
  }
  
  return 0
}

/** Convert Buddhist Era date string to Gregorian if needed */
function toBEGregorian(dateStr: string | null): string | null {
  if (!dateStr) return null
  const year = parseInt(dateStr.split('-')[0])
  if (year > 2500) {
    return `${year - 543}${dateStr.substring(4)}`
  }
  return dateStr
}

// ============================================================================
// Import Event — นำเข้า Event เข้าระบบ Costs
// ============================================================================

/** Import Event จากตาราง events (งานที่ยังเปิดอยู่) */
export async function importEventFromStock(eventId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ตรวจว่า import ซ้ำหรือเปล่า
  const { data: existing } = await supabase
    .from('job_cost_events')
    .select('id')
    .eq('source_event_id', eventId)
    .maybeSingle()

  if (existing) return { error: 'อีเวนต์นี้ถูกนำเข้าแล้ว', existingId: existing.id }

  // ดึงข้อมูล Event
  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('*')
    .eq('id', eventId)
    .single()

  if (eventErr || !event) return { error: 'ไม่พบอีเวนต์' }

  // ─── ดึงราคาขายจาก CRM Lead (4-Tier Matching) ───────────
  let revenue = 0
  let revenueSource = ''
  let revenueVatMode = 'none'
  let revenueWhtRate = 0
  let linkedLeadId: string | null = null

  // 1. หา CRM lead ที่ link ด้วย event_id (events table)
  const { data: leadByEventId } = await supabase
    .from('crm_leads')
    .select('id, confirmed_price, quoted_price, vat_mode, wht_rate')
    .eq('event_id', eventId)
    .maybeSingle()

  if (leadByEventId && (Number(leadByEventId.confirmed_price) > 0 || Number(leadByEventId.quoted_price) > 0)) {
    revenue = Number(leadByEventId.confirmed_price || leadByEventId.quoted_price || 0)
    revenueVatMode = leadByEventId.vat_mode || 'none'
    revenueWhtRate = Number(leadByEventId.wht_rate || 0)
    linkedLeadId = leadByEventId.id
    revenueSource = 'crm_lead_event_id'
  }

  // 2. ถ้ายัง 0 → ลอง match ด้วย event_date + name scoring
  if (revenue === 0 && event.event_date) {
    const eventDateStr = toBEGregorian(event.event_date) || event.event_date
    const { data: leadByDate } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name, vat_mode, wht_rate')
      .eq('event_date', eventDateStr)
      .or('confirmed_price.gt.0,quoted_price.gt.0')
      .limit(20)

    if (leadByDate && leadByDate.length > 0) {
      // Score each lead by name similarity
      const scored = leadByDate.map(l => ({ ...l, score: matchScore(event.name, l.customer_name || '') }))
      scored.sort((a, b) => b.score - a.score)

      if (scored[0].score >= 50) {
        revenue = Number(scored[0].confirmed_price || scored[0].quoted_price || 0)
        revenueVatMode = scored[0].vat_mode || 'none'
        revenueWhtRate = Number(scored[0].wht_rate || 0)
        linkedLeadId = scored[0].id
        revenueSource = 'crm_lead_date_name_match'
      } else if (leadByDate.length === 1) {
        revenue = Number(leadByDate[0].confirmed_price || leadByDate[0].quoted_price || 0)
        revenueVatMode = leadByDate[0].vat_mode || 'none'
        revenueWhtRate = Number(leadByDate[0].wht_rate || 0)
        linkedLeadId = leadByDate[0].id
        revenueSource = 'crm_lead_date_single'
      }
    }
  }

  // สร้าง job_cost_event
  const { data: created, error: insertErr } = await supabase
    .from('job_cost_events')
    .insert({
      source_event_id: eventId,
      event_name: event.name,
      event_date: event.event_date,
      event_location: event.location,
      staff: event.staff,
      seller: (event as any).seller,
      revenue,
      revenue_vat_mode: revenueVatMode,
      revenue_wht_rate: revenueWhtRate,
      linked_lead_id: linkedLeadId,
      imported_by: userId,
    })
    .select('id')
    .single()

  if (insertErr) return { error: 'เกิดข้อผิดพลาดในการนำเข้า' }

  // ถ้า link ได้ ให้ update CRM lead.event_id ด้วย (bidirectional link)
  if (linkedLeadId && created?.id) {
    await supabase
      .from('crm_leads')
      .update({ event_id: created.id })
      .eq('id', linkedLeadId)
      .is('event_id', null)
  }

  await logActivity('IMPORT_EVENT_TO_COSTS', {
    eventId,
    jobEventId: created?.id,
    eventName: event.name,
    revenue,
    revenueSource: revenueSource || 'none',
    linkedLeadId,
  }, undefined)

  revalidatePath('/costs')
  return { success: true, id: created?.id }
}

/** Import Event จากตาราง event_closures (งานที่ปิดแล้ว) */
export async function importEventFromClosure(closureId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึงข้อมูล Closure
  const { data: closure, error: closureErr } = await supabase
    .from('event_closures')
    .select('*')
    .eq('id', closureId)
    .single()

  if (closureErr || !closure) return { error: 'ไม่พบข้อมูลปิดอีเวนต์' }

  // ตรวจว่า import ซ้ำหรือเปล่า (เช็ค event_name + event_date)
  const { data: existing } = await supabase
    .from('job_cost_events')
    .select('id')
    .eq('event_name', closure.event_name)
    .eq('event_date', closure.event_date)
    .maybeSingle()

  if (existing) return { error: 'อีเวนต์นี้ถูกนำเข้าแล้ว', existingId: existing.id }

  // สร้าง job_cost_event
  const { data: created, error: insertErr } = await supabase
    .from('job_cost_events')
    .insert({
      event_name: closure.event_name,
      event_date: closure.event_date,
      event_location: closure.event_location,
      imported_by: userId,
    })
    .select('id')
    .single()

  if (insertErr) return { error: 'เกิดข้อผิดพลาดในการนำเข้า' }

  await logActivity('IMPORT_CLOSURE_TO_COSTS', {
    closureId,
    jobEventId: created?.id,
    eventName: closure.event_name,
  }, undefined)

  revalidatePath('/costs')
  return { success: true, id: created?.id }
}

/** Sync revenue จาก CRM Lead สำหรับ cost event (4-Tier Matching) */
export async function syncRevenueFromCRM(jobEventId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึงข้อมูล cost event
  const { data: jobEvent, error: fetchErr } = await supabase
    .from('job_cost_events')
    .select('id, source_event_id, event_name, event_date, linked_lead_id')
    .eq('id', jobEventId)
    .single()

  if (fetchErr || !jobEvent) return { error: 'ไม่พบข้อมูล' }

  let revenue = 0
  let matchedLeadName = ''
  let matchedLeadId: string | null = null
  let vatMode = 'none'
  let whtRate = 0
  let matchMethod = ''

  // ─── Tier 1: Match ด้วย linked_lead_id (Manual Link / เคย link แล้ว) ───
  if (jobEvent.linked_lead_id) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name, vat_mode, wht_rate')
      .eq('id', jobEvent.linked_lead_id)
      .single()

    if (lead && (Number(lead.confirmed_price) > 0 || Number(lead.quoted_price) > 0)) {
      revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
      matchedLeadName = lead.customer_name || ''
      matchedLeadId = lead.id
      vatMode = lead.vat_mode || 'none'
      whtRate = Number(lead.wht_rate || 0)
      matchMethod = 'linked_lead_id'
    }
  }

  // ─── Tier 2: Match ด้วย CRM event_id → jobEvent.id (CRM created this event) ───
  if (revenue === 0) {
    const { data: leadByCrmEventId } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name, vat_mode, wht_rate')
      .eq('event_id', jobEventId)
      .maybeSingle()

    if (leadByCrmEventId && (Number(leadByCrmEventId.confirmed_price) > 0 || Number(leadByCrmEventId.quoted_price) > 0)) {
      revenue = Number(leadByCrmEventId.confirmed_price || leadByCrmEventId.quoted_price || 0)
      matchedLeadName = leadByCrmEventId.customer_name || ''
      matchedLeadId = leadByCrmEventId.id
      vatMode = leadByCrmEventId.vat_mode || 'none'
      whtRate = Number(leadByCrmEventId.wht_rate || 0)
      matchMethod = 'crm_event_id'
    }
  }

  // ─── Tier 3: Match ด้วย source_event_id (events table link) ───
  if (revenue === 0 && jobEvent.source_event_id) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name, vat_mode, wht_rate')
      .eq('event_id', jobEvent.source_event_id)
      .maybeSingle()

    if (lead && (Number(lead.confirmed_price) > 0 || Number(lead.quoted_price) > 0)) {
      revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
      matchedLeadName = lead.customer_name || ''
      matchedLeadId = lead.id
      vatMode = lead.vat_mode || 'none'
      whtRate = Number(lead.wht_rate || 0)
      matchMethod = 'source_event_id'
    }
  }

  // ─── Tier 4: Fuzzy Match ด้วย event_date + name scoring ───
  if (revenue === 0 && jobEvent.event_date) {
    const eventDateStr = toBEGregorian(jobEvent.event_date) || jobEvent.event_date
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name, vat_mode, wht_rate, event_date')
      .eq('event_date', eventDateStr)
      .or('confirmed_price.gt.0,quoted_price.gt.0')
      .limit(20)

    if (leads && leads.length > 0) {
      // Score each lead
      const scored = leads.map(l => ({ ...l, score: matchScore(jobEvent.event_name, l.customer_name || '') }))
      scored.sort((a, b) => b.score - a.score)

      if (scored[0].score >= 50) {
        revenue = Number(scored[0].confirmed_price || scored[0].quoted_price || 0)
        matchedLeadName = scored[0].customer_name || ''
        matchedLeadId = scored[0].id
        vatMode = scored[0].vat_mode || 'none'
        whtRate = Number(scored[0].wht_rate || 0)
        matchMethod = `fuzzy_score_${scored[0].score}`
      } else if (leads.length === 1) {
        revenue = Number(leads[0].confirmed_price || leads[0].quoted_price || 0)
        matchedLeadName = leads[0].customer_name || ''
        matchedLeadId = leads[0].id
        vatMode = leads[0].vat_mode || 'none'
        whtRate = Number(leads[0].wht_rate || 0)
        matchMethod = 'date_single'
      }
    }
  }

  if (revenue === 0) {
    return { error: 'ไม่พบข้อมูลราคาขายจาก CRM ที่ตรงกัน' }
  }

  // อัปเดต revenue + VAT/WHT + linked_lead_id
  const updateData: Record<string, unknown> = {
    revenue,
    revenue_vat_mode: vatMode,
    revenue_wht_rate: whtRate,
  }
  if (matchedLeadId && !jobEvent.linked_lead_id) {
    updateData.linked_lead_id = matchedLeadId
  }

  const { error: updateErr } = await supabase
    .from('job_cost_events')
    .update(updateData)
    .eq('id', jobEventId)

  if (updateErr) return { error: 'เกิดข้อผิดพลาดในการอัปเดต' }

  await logActivity('SYNC_REVENUE_FROM_CRM', {
    jobEventId,
    revenue,
    matchedLeadName,
    matchedLeadId,
    matchMethod,
  }, undefined)

  revalidatePath('/costs')
  return { success: true, revenue, matchedLeadName, matchMethod }
}

/** Bulk sync revenue จาก CRM สำหรับ cost events ทั้งหมดที่ยังไม่มีราคาขาย (4-Tier) */
export async function bulkSyncRevenueFromCRM() {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึง cost events ที่ revenue = 0
  const { data: events, error: fetchErr } = await supabase
    .from('job_cost_events')
    .select('id, source_event_id, event_name, event_date, linked_lead_id')
    .or('revenue.is.null,revenue.eq.0')

  if (fetchErr || !events) return { error: 'ดึงข้อมูลไม่ได้' }
  if (events.length === 0) return { success: true, syncedCount: 0, skippedCount: 0 }

  // ดึง CRM leads ทั้งหมดที่มี price > 0
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, event_id, event_date, confirmed_price, quoted_price, customer_name, vat_mode, wht_rate')
    .or('confirmed_price.gt.0,quoted_price.gt.0')

  if (!leads || leads.length === 0) {
    return { success: true, syncedCount: 0, skippedCount: events.length }
  }

  let syncedCount = 0
  const syncedNames: string[] = []

  for (const event of events) {
    let revenue = 0
    let vatMode = 'none'
    let whtRate = 0
    let matchedLeadId: string | null = null

    // Tier 1: linked_lead_id
    if (event.linked_lead_id) {
      const lead = leads.find(l => l.id === event.linked_lead_id)
      if (lead) {
        revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
        vatMode = lead.vat_mode || 'none'
        whtRate = Number(lead.wht_rate || 0)
        matchedLeadId = lead.id
      }
    }

    // Tier 2: CRM event_id → cost event id
    if (revenue === 0) {
      const lead = leads.find(l => l.event_id === event.id)
      if (lead) {
        revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
        vatMode = lead.vat_mode || 'none'
        whtRate = Number(lead.wht_rate || 0)
        matchedLeadId = lead.id
      }
    }

    // Tier 3: source_event_id
    if (revenue === 0 && event.source_event_id) {
      const lead = leads.find(l => l.event_id === event.source_event_id)
      if (lead) {
        revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
        vatMode = lead.vat_mode || 'none'
        whtRate = Number(lead.wht_rate || 0)
        matchedLeadId = lead.id
      }
    }

    // Tier 4: Fuzzy date + name matching
    if (revenue === 0 && event.event_date) {
      const eventDateStr = toBEGregorian(event.event_date) || event.event_date
      const dateLeads = leads.filter(l => l.event_date === eventDateStr)
      if (dateLeads.length > 0) {
        const scored = dateLeads.map(l => ({ ...l, score: matchScore(event.event_name, l.customer_name || '') }))
        scored.sort((a, b) => b.score - a.score)

        if (scored[0].score >= 50) {
          revenue = Number(scored[0].confirmed_price || scored[0].quoted_price || 0)
          vatMode = scored[0].vat_mode || 'none'
          whtRate = Number(scored[0].wht_rate || 0)
          matchedLeadId = scored[0].id
        } else if (dateLeads.length === 1) {
          revenue = Number(dateLeads[0].confirmed_price || dateLeads[0].quoted_price || 0)
          vatMode = dateLeads[0].vat_mode || 'none'
          whtRate = Number(dateLeads[0].wht_rate || 0)
          matchedLeadId = dateLeads[0].id
        }
      }
    }

    if (revenue > 0) {
      const updateData: Record<string, unknown> = { revenue, revenue_vat_mode: vatMode, revenue_wht_rate: whtRate }
      if (matchedLeadId && !event.linked_lead_id) {
        updateData.linked_lead_id = matchedLeadId
      }
      await supabase.from('job_cost_events').update(updateData).eq('id', event.id)
      syncedCount++
      syncedNames.push(event.event_name)
    }
  }

  revalidatePath('/costs')
  return {
    success: true,
    syncedCount,
    skippedCount: events.length - syncedCount,
    totalMissing: events.length,
    syncedNames,
  }
}

// ============================================================================
// Job Cost Events — CRUD
// ============================================================================

/** อัปเดต Revenue / Status / Notes */
export async function updateJobEvent(id: string, data: {
  revenue?: number
  revenue_vat_mode?: string
  revenue_wht_rate?: number
  status?: string
  notes?: string
  event_name?: string
  event_date?: string
  event_location?: string
  staff?: string
}) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('job_cost_events')
    .update(data)
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await logActivity('UPDATE_JOB_EVENT', {
    id,
    changes: Object.keys(data).join(', '),
    ...(data.revenue !== undefined && { revenue: data.revenue }),
    ...(data.status && { status: data.status }),
  }, undefined)

  revalidatePath('/costs')
  return { success: true }
}

/** ลบ Job Event + cost items ทั้งหมด (CASCADE) */
export async function deleteJobEvent(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถลบได้' }

  const supabase = createServiceClient()

  // ดึงข้อมูลก่อนลบ
  const { data: event } = await supabase
    .from('job_cost_events')
    .select('event_name')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from('job_cost_events')
    .delete()
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการลบ' }

  await logActivity('DELETE_JOB_EVENT', {
    id,
    eventName: event?.event_name || '-',
  }, undefined)

  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Job Cost Items — CRUD รายการต้นทุน
// ============================================================================

/** เพิ่มรายการต้นทุน */
export async function createCostItem(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const jobEventId = formData.get('job_event_id') as string
  const title = formData.get('title') as string || null
  const category = formData.get('category') as string
  const description = formData.get('description') as string
  const amount = Number(formData.get('amount')) || 0
  const unitPrice = Number(formData.get('unit_price')) || 0
  const unit = formData.get('unit') as string || 'บาท'
  const quantity = Number(formData.get('quantity')) || 1
  const vatMode = (formData.get('vat_mode') as string) || 'none'
  const includeVat = vatMode !== 'none'
  const withholdingTaxRate = Number(formData.get('withholding_tax_rate')) || 0
  const costDate = formData.get('cost_date') as string || null
  const notes = formData.get('notes') as string || null

  const { error } = await supabase
    .from('job_cost_items')
    .insert({
      job_event_id: jobEventId,
      title,
      category,
      description,
      amount,
      unit_price: unitPrice,
      unit,
      quantity,
      include_vat: includeVat,
      vat_mode: vatMode,
      withholding_tax_rate: withholdingTaxRate,
      cost_date: costDate || null,
      recorded_by: userId,
      notes,
    })

  if (error) return { error: 'เกิดข้อผิดพลาดในการเพิ่มรายการ' }

  await logActivity('CREATE_COST_ITEM', {
    jobEventId,
    category,
    description: description || '-',
    amount,
  }, undefined)

  revalidatePath('/costs')
  return { success: true }
}

/** อัปเดตรายการต้นทุน */
export async function updateCostItem(id: string, data: {
  title?: string | null
  category?: string
  description?: string
  amount?: number
  unit_price?: number
  unit?: string
  quantity?: number
  include_vat?: boolean
  vat_mode?: string
  withholding_tax_rate?: number
  cost_date?: string | null
  notes?: string | null
}) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถแก้ไขได้' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('job_cost_items')
    .update(data)
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await logActivity('UPDATE_COST_ITEM', {
    id,
    changes: Object.keys(data).join(', '),
    ...(data.category && { category: data.category }),
    ...(data.amount !== undefined && { amount: data.amount }),
  }, undefined)

  revalidatePath('/costs')
  return { success: true }
}

/** ลบรายการต้นทุน */
export async function deleteCostItem(id: string) {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถลบได้' }

  const supabase = createServiceClient()

  const { error } = await supabase
    .from('job_cost_items')
    .delete()
    .eq('id', id)

  if (error) return { error: 'เกิดข้อผิดพลาดในการลบ' }

  await logActivity('DELETE_COST_ITEM', {
    id,
  }, undefined)

  revalidatePath('/costs')
  return { success: true }
}

/** สร้าง Job Event แบบ Manual (ไม่ import จากระบบ) */
export async function createJobEventManual(formData: FormData) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  const eventName = formData.get('event_name') as string
  const eventDate = formData.get('event_date') as string || null
  const eventLocation = formData.get('event_location') as string || null
  const staff = formData.get('staff') as string || null
  const seller = formData.get('seller') as string || null
  const revenue = Number(formData.get('revenue')) || 0
  const notes = formData.get('notes') as string || null

  if (!eventName) return { error: 'กรุณากรอกชื่ออีเวนต์' }

  const { data: created, error } = await supabase
    .from('job_cost_events')
    .insert({
      event_name: eventName,
      event_date: eventDate || null,
      event_location: eventLocation || null,
      staff: staff || null,
      seller: seller || null,
      revenue,
      notes: notes || null,
      imported_by: userId,
    })
    .select('id')
    .single()

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  await logActivity('CREATE_JOB_EVENT_MANUAL', {
    jobEventId: created?.id,
    eventName,
  }, undefined)

  revalidatePath('/costs')
  return { success: true, id: created?.id }
}

// ============================================================================
// Manual CRM Link — เชื่อม Cost Event กับ CRM Lead ด้วยมือ
// ============================================================================

/** ค้นหา CRM Leads เพื่อเลือก link กับ Cost Event */
export async function searchCRMLeadsForLink(query: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized', data: [] }

  const supabase = createServiceClient()

  let qb = supabase
    .from('crm_leads')
    .select('id, customer_name, event_date, quoted_price, confirmed_price, package_name, status, vat_mode, wht_rate')
    .is('archived_at', null)
    .order('event_date', { ascending: false, nullsFirst: false })
    .limit(20)

  if (query && query.trim().length > 0) {
    qb = qb.ilike('customer_name', `%${query.trim()}%`)
  }

  const { data, error } = await qb
  if (error) return { error: error.message, data: [] }
  return { data: data || [] }
}

/** Link Cost Event กับ CRM Lead (Manual) + ดึง revenue มาเลย */
export async function linkCostEventToCRM(jobEventId: string, leadId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึง CRM lead data
  const { data: lead, error: leadErr } = await supabase
    .from('crm_leads')
    .select('id, customer_name, confirmed_price, quoted_price, vat_mode, wht_rate')
    .eq('id', leadId)
    .single()

  if (leadErr || !lead) return { error: 'ไม่พบ CRM Lead' }

  const revenue = Number(lead.confirmed_price || lead.quoted_price || 0)

  // อัปเดต cost event
  const updateData: Record<string, unknown> = {
    linked_lead_id: leadId,
  }
  if (revenue > 0) {
    updateData.revenue = revenue
    updateData.revenue_vat_mode = lead.vat_mode || 'none'
    updateData.revenue_wht_rate = Number(lead.wht_rate || 0)
  }

  const { error: updateErr } = await supabase
    .from('job_cost_events')
    .update(updateData)
    .eq('id', jobEventId)

  if (updateErr) return { error: 'เกิดข้อผิดพลาดในการ link' }

  // อัปเดต CRM lead → event_id ให้ชี้กลับมาที่ cost event
  await supabase
    .from('crm_leads')
    .update({ event_id: jobEventId })
    .eq('id', leadId)
    .is('event_id', null)

  await logActivity('LINK_COST_EVENT_TO_CRM', {
    jobEventId,
    leadId,
    customerName: lead.customer_name,
    revenue,
  }, undefined)

  revalidatePath('/costs')
  revalidatePath(`/costs/events/${jobEventId}`)
  return { success: true, revenue, customerName: lead.customer_name }
}

/** Unlink CRM Lead จาก Cost Event */
export async function unlinkCostEventFromCRM(jobEventId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึง current linked_lead_id
  const { data: jobEvent } = await supabase
    .from('job_cost_events')
    .select('linked_lead_id')
    .eq('id', jobEventId)
    .single()

  // ลบ link
  const { error } = await supabase
    .from('job_cost_events')
    .update({ linked_lead_id: null })
    .eq('id', jobEventId)

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  // ลบ reverse link ด้วย
  if (jobEvent?.linked_lead_id) {
    await supabase
      .from('crm_leads')
      .update({ event_id: null })
      .eq('id', jobEvent.linked_lead_id)
      .eq('event_id', jobEventId)
  }

  await logActivity('UNLINK_COST_EVENT_FROM_CRM', { jobEventId }, undefined)

  revalidatePath('/costs')
  return { success: true }
}
