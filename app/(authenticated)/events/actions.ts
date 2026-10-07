'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { requireAuth } from '@/lib/auth'
import { getEventManager, EVENT_PERMISSION_KEYS } from '@/lib/event-permissions'
import { recomputeKitPointers } from '@/lib/kit-bookings'
import type { ActionState, KitContent, Database } from '@/types'
import { closeEventCore } from './close-core'


// Recompute crm_leads.assigned_* roll-up arrays as the UNION of every linked event's
// event_staff. Staff now lives per-event (event_staff keyed by event_id), but the
// Kanban board still filters leads by these lead-level arrays, so we keep them in sync
// whenever a CRM-linked event's staff changes. Best-effort — never blocks the caller.
export async function syncLeadArraysFromEvents(supabase: ReturnType<typeof createServiceClient>, leadId: string) {
  try {
    const { data: evs } = await supabase.from('events').select('id').eq('crm_lead_id', leadId)
    const eventIds = (evs || []).map((e: { id: string }) => e.id)
    let staffRows: { user_id: string; role: string }[] = []
    if (eventIds.length > 0) {
      const { data } = await supabase.from('event_staff').select('user_id, role').in('event_id', eventIds)
      staffRows = (data || []) as { user_id: string; role: string }[]
    }
    const uniq = (arr: string[]) => Array.from(new Set(arr))
    const assigned_sales = uniq(staffRows.filter(s => s.role === 'sale').map(s => s.user_id))
    const assigned_graphics = uniq(staffRows.filter(s => s.role === 'graphic').map(s => s.user_id))
    const assigned_staff = uniq(staffRows.filter(s => s.role !== 'sale' && s.role !== 'graphic').map(s => s.user_id))
    await supabase.from('crm_leads').update({
      assigned_sales,
      assigned_graphics,
      assigned_staff,
    }).eq('id', leadId)
  } catch (e) {
    console.error('syncLeadArraysFromEvents error:', e)
  }
}


// ============================================================================
// เวลาเปิด / เวลาปิด อีเวนต์ (optional, HH:mm)
// ============================================================================

const TIME_HHMM_RE = /^\d{2}:\d{2}$/
const INVALID_TIME_ERROR = 'รูปแบบเวลาไม่ถูกต้อง (HH:mm)'
const MISSING_TIME_COLUMN_ERROR =
  'ยังไม่ได้เปิดใช้ช่องเวลาอีเวนต์ในฐานข้อมูล — รัน migration 20260927_events_event_time.sql ก่อน'

/** อ่านเวลาจากฟอร์ม: คืน '' เมื่อไม่กรอก, คืน null เมื่อรูปแบบผิด */
function readTimeField(formData: FormData, key: string): string | null {
  const raw = String(formData.get(key) ?? '').trim()
  if (!raw) return ''
  return TIME_HHMM_RE.test(raw) ? raw : null
}

/**
 * ฐานข้อมูลที่ยังไม่ได้รัน migration จะตอบ PGRST204 / 42703 เมื่อเจอคอลัมน์เวลา
 * — แปลงเป็นข้อความบอกให้รัน migration แทน error ดิบ
 */
function isMissingTimeColumnError(error: { code?: string | null; message?: string | null } | null): boolean {
  if (!error) return false
  if (error.code !== 'PGRST204' && error.code !== '42703') return false
  const msg = error.message || ''
  return msg.includes('event_time') || msg.includes('event_end_time')
}

export async function createEvent(prevState: ActionState, formData: FormData) {
  const manager = await getEventManager('edit')
  if (!manager) return { error: 'ไม่มีสิทธิ์สร้าง/แก้ไขอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }
  const userId = manager.userId

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const staff = formData.get('staff') as string
  const seller = formData.get('seller') as string
  const fromCrm = formData.get('from_crm') as string | null
  const phaseRaw = formData.get('phase') as string | null
  const phase = phaseRaw && ['setup', 'main', 'teardown', 'delivery', 'other'].includes(phaseRaw) ? phaseRaw : null

  if (!name) {
      return { error: 'Event name is required' }
  }

  // เวลาเปิด / เวลาปิด — ไม่บังคับ; ไม่ตรวจว่าเปิดก่อนปิด (งานข้ามเที่ยงคืนได้)
  const eventTime = readTimeField(formData, 'event_time')
  const eventEndTime = readTimeField(formData, 'event_end_time')
  if (eventTime === null || eventEndTime === null) {
      return { error: INVALID_TIME_ERROR }
  }

  const supabase = createServiceClient()

  // ใส่คีย์เวลาเฉพาะตอนที่กรอกมา — ฐานข้อมูลที่ยังไม่ได้รัน migration จะยังสร้างอีเวนต์ได้
  const insertPayload: Record<string, unknown> = {
      name,
      location,
      staff,
      seller,
      event_date: formData.get('event_date') as string || new Date().toISOString(),
      crm_lead_id: fromCrm || null,
      phase,
  }
  if (eventTime) insertPayload.event_time = eventTime
  if (eventEndTime) insertPayload.event_end_time = eventEndTime

  const { data: event, error: eventError } = await supabase
      .from('events')
      .insert(insertPayload)
      .select()
      .single()

  if (eventError) {
      console.error('Create event error:', eventError)
      if (isMissingTimeColumnError(eventError)) return { error: MISSING_TIME_COLUMN_ERROR }
      return { error: 'Failed to create event' }
  }

  // Staff assignments — event_staff (keyed by event_id) is the single source of truth
  // for EVERY event, CRM-linked or standalone. This is what keeps sub-events under the
  // same CRM lead independent of each other. (Kanban roll-up arrays are recomputed from
  // the union of all the lead's events further below, inside the `if (fromCrm)` block.)
  const staffAssignmentsJson = formData.get('staff_assignments') as string
  if (staffAssignmentsJson) {
    try {
      const staffAssignments = JSON.parse(staffAssignmentsJson) as { user_id: string; role: string }[]
      if (staffAssignments.length > 0) {
        const rows = staffAssignments.map(a => ({
          event_id: event.id,
          user_id: a.user_id,
          role: a.role,
        }))
        await supabase.from('event_staff').insert(rows)
      }
    } catch (e) {
      console.error('Parse staff_assignments error:', e)
    }
  }

  // อุปกรณ์/กระเป๋าของอีเวนต์จัดผ่านใบจัดของ (เฟส 6 ถอดการจองกระเป๋าตรงจากฟอร์ม)
  await logActivity('CREATE_EVENT', {
      name,
      location,
  }, undefined)

  // If created from CRM, log activity (link is via events.crm_lead_id above) and
  // auto-create the paired cost event so it shows in the lead's combined cost
  // summary without a manual "Import to Costs" step.
  if (fromCrm) {
    await supabase.from('crm_activities').insert({
      lead_id: fromCrm,
      created_by: userId,
      activity_type: 'note',
      description: `เปิดอีเวนต์แล้ว: ${name}`,
    })
    await supabase.from('crm_leads').update({ updated_at: new Date().toISOString() }).eq('id', fromCrm)

    // Keep the Kanban roll-up arrays in sync with this lead's per-event staff.
    await syncLeadArraysFromEvents(supabase, fromCrm)

    // Auto-create paired job_cost_events (mirrors importEventFromStock, but we
    // already know the lead, so we read its revenue/tax directly).
    // Best-effort: a failure here must NOT block event creation.
    try {
      const { data: existingCost } = await supabase
        .from('job_cost_events')
        .select('id')
        .eq('source_event_id', event.id)
        .maybeSingle()

      if (!existingCost) {
        const { data: lead } = await supabase
          .from('crm_leads')
          .select('confirmed_price, quoted_price, vat_mode, wht_rate')
          .eq('id', fromCrm)
          .maybeSingle()

        const revenue = Number(lead?.confirmed_price || lead?.quoted_price || 0)

        const { data: costEvent, error: costErr } = await supabase
          .from('job_cost_events')
          .insert({
            source_event_id: event.id,
            event_name: name,
            event_date: event.event_date,
            event_location: location,
            staff,
            seller,
            revenue,
            revenue_vat_mode: lead?.vat_mode || 'none',
            revenue_wht_rate: Number(lead?.wht_rate || 0),
            linked_lead_id: fromCrm,
            phase,
            status: 'draft',
            imported_by: userId,
          })
          .select('id')
          .single()

        if (costEvent && !costErr) {
          await logActivity('IMPORT_EVENT_TO_COSTS', {
            eventId: event.id,
            jobEventId: costEvent.id,
            eventName: name,
            revenue,
            revenueSource: 'auto_from_crm_event',
            linkedLeadId: fromCrm,
            auto: true,
          }, undefined)
        }
      }
    } catch (e) {
      console.error('Auto-create cost event from CRM error:', e)
    }

    revalidatePath('/crm')
    revalidatePath(`/crm/${fromCrm}`)
    revalidatePath('/costs/events')
    revalidatePath('/costs/dashboard')
  }

  revalidatePath('/events')
  redirect('/events')
}

// ============================================================================
// Link / Unlink Event ↔ CRM Lead
// ============================================================================

export async function linkEventToCrm(eventId: string, leadId: string) {
  if (!(await getEventManager('edit'))) return { error: 'ไม่มีสิทธิ์สร้าง/แก้ไขอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }

  const supabase = createServiceClient()

  // Set events.crm_lead_id (1 lead can have many operational events: setup / main / teardown / etc.)
  const { error: e1 } = await supabase
    .from('events')
    .update({ crm_lead_id: leadId })
    .eq('id', eventId)
  if (e1) return { error: e1.message }

  // This event's staff now contributes to the lead — refresh Kanban roll-up arrays.
  await syncLeadArraysFromEvents(supabase, leadId)

  await logActivity('LINK_EVENT_TO_CRM', { eventId, leadId })
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}/edit`)
  revalidatePath('/crm')
  revalidatePath(`/crm/${leadId}`)
  return { success: true }
}

export async function unlinkEventFromCrm(eventId: string) {
  if (!(await getEventManager('edit'))) return { error: 'ไม่มีสิทธิ์สร้าง/แก้ไขอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }

  const supabase = createServiceClient()

  // Get current lead id before unlinking
  const { data: event } = await supabase.from('events').select('crm_lead_id').eq('id', eventId).single()
  const leadId = event?.crm_lead_id

  await supabase.from('events').update({ crm_lead_id: null }).eq('id', eventId)

  // This event no longer contributes to the lead — refresh Kanban roll-up arrays.
  if (leadId) await syncLeadArraysFromEvents(supabase, leadId)

  await logActivity('UNLINK_EVENT_FROM_CRM', { eventId, leadId })
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}/edit`)
  if (leadId) {
    revalidatePath('/crm')
    revalidatePath(`/crm/${leadId}`)
  }
  return { success: true }
}

export async function updateEvent(id: string, prevState: ActionState, formData: FormData) {
  const manager = await getEventManager('edit')
  if (!manager) return { error: 'ไม่มีสิทธิ์สร้าง/แก้ไขอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }
  const userId = manager.userId

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const staff = formData.get('staff') as string
  const seller = formData.get('seller') as string
  const phaseRaw = formData.get('phase') as string | null
  const phase = phaseRaw && ['setup', 'main', 'teardown', 'delivery', 'other'].includes(phaseRaw) ? phaseRaw : null

  if (!name) return { error: 'Event name is required' }

  // เวลาเปิด / เวลาปิด — ไม่บังคับ; ค่าว่าง = ล้างเวลาที่เคยกรอกไว้
  const eventTime = readTimeField(formData, 'event_time')
  const eventEndTime = readTimeField(formData, 'event_end_time')
  if (eventTime === null || eventEndTime === null) {
      return { error: INVALID_TIME_ERROR }
  }

  const supabase = createServiceClient()

  // === Capture BEFORE state for change tracking ===
  // select('*') โดยตั้งใจ — ทนฐานข้อมูลที่ยังไม่มีคอลัมน์เวลา (ระบุชื่อคอลัมน์จะ error ทั้งก้อน)
  const { data: oldEvent } = await supabase
      .from('events')
      .select('*')
      .eq('id', id)
      .single()

  // เวลาเดิมในฐานข้อมูล (time มาเป็น 'HH:mm:ss' — ตัดเหลือ HH:mm เวลาเทียบ)
  const hhmm = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 5) : '')
  const oldEventTime = hhmm((oldEvent as { event_time?: unknown } | null)?.event_time)
  const oldEventEndTime = hhmm((oldEvent as { event_end_time?: unknown } | null)?.event_end_time)

  // Staff now lives per-event in event_staff for every event (CRM-linked or not).
  let oldStaff: { user_id: string; full_name: string; role: string }[] = []
  {
      const { data: rows } = await supabase
          .from('event_staff')
          .select('user_id, role, profiles:user_id(full_name)')
          .eq('event_id', id)
          .overrideTypes<{ user_id: string; role: string; profiles: { full_name: string | null } | null }[], { merge: false }>()
      oldStaff = (rows || []).map((s) => ({
          user_id: s.user_id,
          full_name: s.profiles?.full_name || '',
          role: s.role,
      }))
  }

  // 1. Update basic info
  // ใส่คีย์เวลาเมื่อกรอกมา หรือเมื่อแถวเดิมมีค่าอยู่แล้ว (เพื่อให้ "ล้างเวลา" ทำงาน)
  // — ฐานข้อมูลที่ยังไม่มีคอลัมน์เวลาและไม่มีค่าเดิม จะไม่เห็นคีย์นี้เลย
  const updatePayload: Record<string, unknown> = { name, location, staff, seller, phase }
  if (eventTime || oldEventTime) updatePayload.event_time = eventTime || null
  if (eventEndTime || oldEventEndTime) updatePayload.event_end_time = eventEndTime || null

  const { error: updateError } = await supabase
      .from('events')
      .update(updatePayload)
      .eq('id', id)

  if (updateError) {
      console.error('Update event error:', updateError)
      if (isMissingTimeColumnError(updateError)) return { error: MISSING_TIME_COLUMN_ERROR }
      return { error: 'Failed to update event details' }
  }

  // 2. กระเป๋า = การจองของใบจัดของ (ฟอร์มไม่แตะ event_kits แล้ว) — แต่เวลาเปลี่ยนอาจเปลี่ยนลำดับ
  // ว่ากระเป๋าอยู่กับงานไหนก่อน → คำนวณตัวชี้ใหม่ให้กระเป๋าที่จองให้อีเวนต์นี้
  if (oldEventTime !== (eventTime || '') || oldEventEndTime !== (eventEndTime || '')) {
      const { data: bookedRows } = await supabase.from('event_kits').select('kit_id').eq('event_id', id)
      const bookedKitIds = (bookedRows || []).map(r => r.kit_id as string)
      if (bookedKitIds.length > 0) await recomputeKitPointers(supabase, bookedKitIds)
  }

  // 3. Sync staff — event_staff (keyed by event_id) is the single source of truth for
  // every event, CRM-linked or not. Always delete+insert THIS event's own rows, so
  // sub-events sharing the same CRM lead never overwrite each other's staff.
  const staffAssignmentsJson = formData.get('staff_assignments') as string
  if (staffAssignmentsJson) {
    try {
      const staffAssignments = JSON.parse(staffAssignmentsJson) as { user_id: string; role: string }[]

      await supabase.from('event_staff').delete().eq('event_id', id)
      if (staffAssignments.length > 0) {
        const rows = staffAssignments.map(a => ({
          event_id: id,
          user_id: a.user_id,
          role: a.role,
        }))
        const { error: insErr } = await supabase.from('event_staff').insert(rows)
        if (insErr) console.error('Insert event_staff err:', insErr)
      }

      // If CRM-linked, refresh the lead's Kanban roll-up arrays from the union of all
      // its events' staff (this event included).
      if (oldEvent?.crm_lead_id) {
        await syncLeadArraysFromEvents(supabase, oldEvent.crm_lead_id)
      }
    } catch (e) {
      console.error('Sync staff error:', e)
    }
  }

  // === Compute diff for activity log ===
  const fieldChanges: Record<string, { from: string | null; to: string | null }> = {}
  if ((oldEvent?.name || '') !== (name || '')) {
      fieldChanges.name = { from: oldEvent?.name || null, to: name || null }
  }
  if ((oldEvent?.location || '') !== (location || '')) {
      fieldChanges.location = { from: oldEvent?.location || null, to: location || null }
  }
  if ((oldEvent?.staff || '') !== (staff || '')) {
      fieldChanges.staff = { from: oldEvent?.staff || null, to: staff || null }
  }
  if ((oldEvent?.seller || '') !== (seller || '')) {
      fieldChanges.seller = { from: oldEvent?.seller || null, to: seller || null }
  }
  if (oldEventTime !== (eventTime || '')) {
      fieldChanges.event_time = { from: oldEventTime || null, to: eventTime || null }
  }
  if (oldEventEndTime !== (eventEndTime || '')) {
      fieldChanges.event_end_time = { from: oldEventEndTime || null, to: eventEndTime || null }
  }

  // Staff diff
  let addedStaff: { user_id: string; full_name: string; role: string }[] = []
  let removedStaff: { user_id: string; full_name: string; role: string }[] = []
  const staffAssignmentsRaw = formData.get('staff_assignments') as string
  if (staffAssignmentsRaw) {
      try {
          const newStaff = JSON.parse(staffAssignmentsRaw) as { user_id: string; role: string }[]
          const oldStaffKeys = new Set(oldStaff.map(s => `${s.user_id}::${s.role}`))
          const newStaffKeys = new Set(newStaff.map(s => `${s.user_id}::${s.role}`))

          const addedRaw = newStaff.filter(s => !oldStaffKeys.has(`${s.user_id}::${s.role}`))
          removedStaff = oldStaff.filter(s => !newStaffKeys.has(`${s.user_id}::${s.role}`))

          if (addedRaw.length > 0) {
              const { data: profileRows } = await supabase
                  .from('profiles')
                  .select('id, full_name')
                  .in('id', addedRaw.map(s => s.user_id))
              const profMap = new Map(((profileRows || []) as { id: string; full_name: string | null }[]).map((p): [string, string] => [p.id, p.full_name || '']))
              addedStaff = addedRaw.map(s => ({
                  user_id: s.user_id,
                  full_name: profMap.get(s.user_id) || '',
                  role: s.role,
              }))
          }
      } catch (e) {
          console.error('Compute staff diff error:', e)
      }
  }

  const logDetails: Record<string, unknown> = { id, name }
  if (Object.keys(fieldChanges).length > 0) logDetails.changes = fieldChanges
  if (addedStaff.length > 0 || removedStaff.length > 0) {
      logDetails.staff_assignments = { added: addedStaff, removed: removedStaff }
  }

  await logActivity('UPDATE_EVENT', logDetails, undefined)

  revalidatePath('/events')
  revalidatePath(`/events/${id}/edit`)
  // Also revalidate CRM if linked
  const { data: ev } = await supabase.from('events').select('crm_lead_id').eq('id', id).single()
  if (ev?.crm_lead_id) {
    revalidatePath('/crm')
    revalidatePath(`/crm/${ev.crm_lead_id}`)
  }
  redirect('/events')
}


// แกนการปิดงาน (ตรวจ → ตัดยอดวัสดุสิ้นเปลือง → snapshot → สถานะอุปกรณ์ → ปิดอีเวนต์ → ใบงานหน้างานจบเอง)
// อยู่ใน ./close-core.ts ใช้ร่วมกับใบจัดของ (packing/actions.ts) — หน้านี้ส่ง keepItemStatuses: false = พฤติกรรมเดิมทุกอย่าง
export async function processEventReturn(
    eventId: string,
    itemStatuses: { itemId: string, status: string }[],
    imageUrls: string[] = [],
    consumableUse: { kitId: string; itemId: string; used: number }[] = []
): Promise<{ error: string } | { success: true }> {
     const manager = await getEventManager('close')
     if (!manager) return { error: 'ไม่มีสิทธิ์ปิดงานอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }

     return closeEventCore(createServiceClient(), {
         eventId,
         userId: manager.userId,
         itemStatuses,
         imageUrls,
         consumableUse,
         keepItemStatuses: false,
     })
}

// Upload a closure photo. The browser client is `anon` (this app uses a custom
// cookie session, not Supabase Auth), and the `event_closures` bucket only allows
// INSERT for `authenticated` — so uploads must go through the service-role client here.
export async function uploadClosureImage(formData: FormData): Promise<{ url?: string; error?: string }> {
    if (!(await getEventManager('close'))) return { error: 'ไม่มีสิทธิ์ปิดงานอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }

    const file = formData.get('file') as File | null
    const eventId = formData.get('eventId') as string | null

    if (!file || typeof file === 'string') return { error: 'ไม่พบไฟล์' }
    if (!eventId) return { error: 'ไม่พบอีเวนต์' }
    if (!file.type?.startsWith('image/')) return { error: 'รองรับเฉพาะไฟล์รูปภาพ' }
    if (file.size > 5 * 1024 * 1024) return { error: 'ไฟล์ใหญ่เกิน 5MB' }

    const sanitizedName = (file.name || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${eventId}/${Date.now()}_${sanitizedName}`

    const supabase = createServiceClient()
    const { error: uploadError } = await supabase.storage
        .from('event_closures')
        .upload(path, file, { contentType: file.type })

    if (uploadError) {
        console.error('Upload closure image error:', uploadError)
        return { error: 'อัปโหลดรูปไม่สำเร็จ' }
    }

    const { data } = supabase.storage.from('event_closures').getPublicUrl(path)
    return { url: data.publicUrl }
}


// ตั้งค่าผู้มีสิทธิ์อีเวนต์ 2 ชุด (หน้า /settings) — admin เท่านั้น; admin มีสิทธิ์อยู่แล้วจึงไม่ต้องอยู่ในรายชื่อ
export async function saveEventManagers(input: { edit: string[]; close: string[] }): Promise<{ error?: string; success?: boolean }> {
    const session = await requireAuth()
    if (session?.role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }

    const clean = (ids: unknown) => Array.isArray(ids) ? [...new Set(ids.filter((id): id is string => typeof id === 'string' && !!id))] : []
    const edit = clean(input?.edit)
    const close = clean(input?.close)
    const updated_at = new Date().toISOString()
    const { error } = await createServiceClient().from('app_settings').upsert([
        { key: EVENT_PERMISSION_KEYS.edit, value: JSON.stringify(edit), updated_at },
        { key: EVENT_PERMISSION_KEYS.close, value: JSON.stringify(close), updated_at },
    ])
    if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

    await logActivity('UPDATE_EVENT_MANAGERS', { edit, close })
    revalidatePath('/events')
    revalidatePath('/settings')
    return { success: true }
}
