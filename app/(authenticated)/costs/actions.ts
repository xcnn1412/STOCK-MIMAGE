'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database.types'

function createServerSupabase() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  )
}

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

  const supabase = createServerSupabase()

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
      imported_by: userId,
    })
    .select('id')
    .single()

  if (insertErr) return { error: 'เกิดข้อผิดพลาดในการนำเข้า' }

  await logActivity('IMPORT_EVENT_TO_COSTS', {
    eventId,
    jobEventId: created?.id,
    eventName: event.name,
  }, undefined)

  revalidatePath('/costs')
  return { success: true, id: created?.id }
}

/** Import Event จากตาราง event_closures (งานที่ปิดแล้ว) */
export async function importEventFromClosure(closureId: string) {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServerSupabase()

  // ดึงข้อมูล Closure
  const { data: closure, error: closureErr } = await supabase
    .from('event_closures')
    .select('*')
    .eq('id', closureId)
    .single()

  if (closureErr || !closure) return { error: 'ไม่พบข้อมูลปิดอีเวนต์' }

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

  const supabase = createServerSupabase()

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
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServerSupabase()

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

  const supabase = createServerSupabase()

  const jobEventId = formData.get('job_event_id') as string
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
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServerSupabase()

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
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const supabase = createServerSupabase()

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

  const supabase = createServerSupabase()

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
