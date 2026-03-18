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

  // ─── ดึงราคาขายจาก CRM Lead ───────────────────────────
  let revenue = 0
  let revenueSource = ''

  // 1. หา CRM lead ที่ link ด้วย event_id
  const { data: leadByEventId } = await supabase
    .from('crm_leads')
    .select('id, confirmed_price, quoted_price')
    .eq('event_id', eventId)
    .maybeSingle()

  if (leadByEventId) {
    revenue = Number(leadByEventId.confirmed_price || leadByEventId.quoted_price || 0)
    revenueSource = 'crm_lead_event_id'
  }

  // 2. ถ้ายัง 0 → ลอง match ด้วย event_date
  if (revenue === 0 && event.event_date) {
    const { data: leadByDate } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name')
      .eq('event_date', event.event_date)
      .not('confirmed_price', 'is', null)
      .gt('confirmed_price', 0)
      .limit(5)

    if (leadByDate && leadByDate.length > 0) {
      // ลอง match ด้วยชื่อ event กับ customer_name
      const eventNameClean = event.name.replace(/[🔴🟡🟢⚪📍·\-–—]/g, '').trim().toLowerCase()
      const matched = leadByDate.find(l => {
        const customerClean = (l.customer_name || '').trim().toLowerCase()
        return eventNameClean.includes(customerClean) || customerClean.includes(eventNameClean.split(' ')[0])
      })

      if (matched) {
        revenue = Number(matched.confirmed_price || matched.quoted_price || 0)
        revenueSource = 'crm_lead_date_match'
      } else if (leadByDate.length === 1) {
        // ถ้ามี lead เดียวในวันนั้น ใช้เลย
        revenue = Number(leadByDate[0].confirmed_price || leadByDate[0].quoted_price || 0)
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
      imported_by: userId,
    })
    .select('id')
    .single()

  if (insertErr) return { error: 'เกิดข้อผิดพลาดในการนำเข้า' }

  await logActivity('IMPORT_EVENT_TO_COSTS', {
    eventId,
    jobEventId: created?.id,
    eventName: event.name,
    revenue,
    revenueSource: revenueSource || 'none',
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

/** Sync revenue จาก CRM Lead สำหรับ cost event ที่ยังไม่มีราคาขาย */
export async function syncRevenueFromCRM(jobEventId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึงข้อมูล cost event
  const { data: jobEvent, error: fetchErr } = await supabase
    .from('job_cost_events')
    .select('id, source_event_id, event_name, event_date')
    .eq('id', jobEventId)
    .single()

  if (fetchErr || !jobEvent) return { error: 'ไม่พบข้อมูล' }

  let revenue = 0
  let matchedLeadName = ''

  // 1. Match ด้วย event_id
  if (jobEvent.source_event_id) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name')
      .eq('event_id', jobEvent.source_event_id)
      .maybeSingle()

    if (lead && (Number(lead.confirmed_price) > 0 || Number(lead.quoted_price) > 0)) {
      revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
      matchedLeadName = lead.customer_name || ''
    }
  }

  // 2. Match ด้วย event_date + customer_name
  if (revenue === 0 && jobEvent.event_date) {
    const { data: leads } = await supabase
      .from('crm_leads')
      .select('id, confirmed_price, quoted_price, customer_name')
      .eq('event_date', jobEvent.event_date)
      .not('confirmed_price', 'is', null)
      .gt('confirmed_price', 0)
      .limit(10)

    if (leads && leads.length > 0) {
      // ลอง match ชื่อ
      const matched = leads.find(l => {
        const cn = (l.customer_name || '').trim().toLowerCase()
        const en = jobEvent.event_name.toLowerCase()
        return cn.length > 3 && en.includes(cn)
      })

      if (matched) {
        revenue = Number(matched.confirmed_price || matched.quoted_price || 0)
        matchedLeadName = matched.customer_name || ''
      } else if (leads.length === 1) {
        revenue = Number(leads[0].confirmed_price || leads[0].quoted_price || 0)
        matchedLeadName = leads[0].customer_name || ''
      }
    }
  }

  if (revenue === 0) {
    return { error: 'ไม่พบข้อมูลราคาขายจาก CRM ที่ตรงกัน' }
  }

  // อัปเดต revenue
  const { error: updateErr } = await supabase
    .from('job_cost_events')
    .update({ revenue })
    .eq('id', jobEventId)

  if (updateErr) return { error: 'เกิดข้อผิดพลาดในการอัปเดต' }

  revalidatePath('/costs')
  return { success: true, revenue, matchedLeadName }
}

/** Bulk sync revenue จาก CRM สำหรับ cost events ทั้งหมดที่ยังไม่มีราคาขาย */
export async function bulkSyncRevenueFromCRM() {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServiceClient()

  // ดึง cost events ที่ revenue = 0
  const { data: events, error: fetchErr } = await supabase
    .from('job_cost_events')
    .select('id, source_event_id, event_name, event_date')
    .or('revenue.is.null,revenue.eq.0')

  if (fetchErr || !events) return { error: 'ดึงข้อมูลไม่ได้' }
  if (events.length === 0) return { success: true, syncedCount: 0, skippedCount: 0 }

  // ดึง CRM leads ทั้งหมดที่มี confirmed_price > 0
  const { data: leads } = await supabase
    .from('crm_leads')
    .select('id, event_id, event_date, confirmed_price, quoted_price, customer_name')
    .not('confirmed_price', 'is', null)
    .gt('confirmed_price', 0)

  if (!leads || leads.length === 0) {
    return { success: true, syncedCount: 0, skippedCount: events.length }
  }

  let syncedCount = 0
  const syncedNames: string[] = []

  for (const event of events) {
    let revenue = 0

    // 1. Match by event_id
    if (event.source_event_id) {
      const lead = leads.find(l => l.event_id === event.source_event_id)
      if (lead) {
        revenue = Number(lead.confirmed_price || lead.quoted_price || 0)
      }
    }

    // 2. Match by event_date + customer_name
    if (revenue === 0 && event.event_date) {
      const dateLeads = leads.filter(l => l.event_date === event.event_date)
      if (dateLeads.length > 0) {
        const matched = dateLeads.find(l => {
          const cn = (l.customer_name || '').trim().toLowerCase()
          const en = event.event_name.toLowerCase()
          return cn.length > 3 && en.includes(cn)
        })
        if (matched) {
          revenue = Number(matched.confirmed_price || matched.quoted_price || 0)
        } else if (dateLeads.length === 1) {
          revenue = Number(dateLeads[0].confirmed_price || dateLeads[0].quoted_price || 0)
        }
      }
    }

    if (revenue > 0) {
      await supabase
        .from('job_cost_events')
        .update({ revenue })
        .eq('id', event.id)
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
