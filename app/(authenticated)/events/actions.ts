'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { requireAuth } from '@/lib/auth'
import { getEventManager, EVENT_PERMISSION_KEYS } from '@/lib/event-permissions'
import { loadBookingsForEvent, recomputeKitPointers } from '@/lib/kit-bookings'
import type { ActionState, KitContent, Item, Database } from '@/types'
import { isClosedEvent } from '../jobs/tracking/tracking-logic'
import { planReturnUse } from '../shelves/consumable-logic'
import { moveStock } from '@/lib/stock'

// แถวกระเป๋า + ของในกระเป๋า ที่ processEventReturn select มา (items เป็น object เดียวต่อแถว)
type CloseKitContent = {
  quantity: number | null
  items: Pick<Item, 'id' | 'name' | 'serial_number' | 'status' | 'image_url' | 'is_consumable' | 'unit'> | null
}
type CloseKitRow = { id: string; name: string; kit_contents: CloseKitContent[] | null }


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
  const kitIds = formData.getAll('kits') as string[]
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

  // กระเป๋า = การจอง (event_kits, ADR-0003) — กระเป๋าชนเวลาแค่เตือนในฟอร์ม ไม่บล็อก
  if (kitIds.length > 0) {
      const { error: kitsError } = await supabase
          .from('event_kits')
          .upsert(kitIds.map(kit_id => ({ event_id: event.id, kit_id })), { onConflict: 'event_id,kit_id' })

      if (kitsError) {
          console.error('Assign kits error:', kitsError)
          return { error: 'Event created but failed to assign kits' }
      }
      await recomputeKitPointers(supabase, kitIds)
  }

  await logActivity('CREATE_EVENT', { 
      name, 
      location, 
      kitIds 
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
  // These are the kits that SHOULD be assigned now
  const selectedKitIds = formData.getAll('kits') as string[]

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

  // กระเป๋าเดิมของอีเวนต์นี้ = การจอง (event_kits)
  const { data: oldKitsRaw } = await supabase
      .from('event_kits')
      .select('kit_id, kits(name)')
      .eq('event_id', id)
  const oldKits = ((oldKitsRaw || []) as unknown as { kit_id: string; kits: { name: string } | null }[])
      .map(r => ({ id: r.kit_id, name: r.kits?.name || r.kit_id }))

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

  // 2. Sync Kits — เทียบการจองเดิมกับที่เลือกใหม่ แตะเฉพาะกระเป๋าที่เปลี่ยน
  {
      const selected = new Set(selectedKitIds)
      const before = new Set(oldKits.map(k => k.id))
      const removed = oldKits.map(k => k.id).filter(kid => !selected.has(kid))
      const added = selectedKitIds.filter(kid => !before.has(kid))

      if (removed.length > 0) {
          // กระเป๋าที่ถูกเอาออกและกำลังอยู่กับอีเวนต์นี้ → อุปกรณ์ที่นำออกไปแล้วกลับเป็น "ว่าง"
          const { data: outKits } = await supabase
              .from('kits')
              .select('id, kit_contents(item_id)')
              .in('id', removed)
              .eq('event_id', id)
          const itemIds = (outKits || []).flatMap(k => (k.kit_contents || []).map(kc => kc.item_id)).filter(Boolean)
          if (itemIds.length > 0) {
              await supabase.from('items').update({ status: 'available' }).in('id', itemIds).eq('status', 'in_use')
          }
          await supabase.from('event_kits').delete().eq('event_id', id).in('kit_id', removed)
      }
      if (added.length > 0) {
          await supabase
              .from('event_kits')
              .upsert(added.map(kit_id => ({ event_id: id, kit_id })), { onConflict: 'event_id,kit_id' })
      }
      // เวลาเปลี่ยนก็อาจเปลี่ยนลำดับว่ากระเป๋าอยู่กับงานไหนก่อน — คำนวณใหม่ทุกใบที่เกี่ยว
      await recomputeKitPointers(supabase, [...before, ...added])
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

  // Kit diff
  const oldKitIdSet = new Set(oldKits.map(k => k.id))
  const newKitIdSet = new Set(selectedKitIds)
  const oldKitMap = new Map(oldKits.map(k => [k.id, k.name]))
  const addedKitIds = selectedKitIds.filter(kid => !oldKitIdSet.has(kid))
  const removedKitIds = oldKits.filter(k => !newKitIdSet.has(k.id)).map(k => k.id)

  let addedKits: { id: string; name: string }[] = []
  if (addedKitIds.length > 0) {
      const { data: addedKitsData } = await supabase
          .from('kits')
          .select('id, name')
          .in('id', addedKitIds)
      addedKits = (addedKitsData || []) as { id: string; name: string }[]
  }
  const removedKits = removedKitIds.map(kid => ({
      id: kid,
      name: oldKitMap.get(kid) || kid,
  }))

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

  const logDetails: Record<string, unknown> = { id, name, kitIds: selectedKitIds }
  if (Object.keys(fieldChanges).length > 0) logDetails.changes = fieldChanges
  if (addedKits.length > 0 || removedKits.length > 0) {
      logDetails.kits = { added: addedKits, removed: removedKits }
  }
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


/** สถานะที่เลือกได้ตอนรับคืนอุปกรณ์ (ใช้ร่วมกับแท็บรับคืนในหน้าเช็คของ) */
const RETURN_STATUSES = ['available', 'damaged', 'maintenance', 'lost']

/** สถานะใบงานที่ถือว่าจบแล้ว — ตรงกับ POOL_DONE_STATUSES ใน jobs/tracking/tracking-logic.ts */
const POOL_FINISHED_STATUSES = ['done', 'skipped']

/**
 * ใบงานหน้างานของงานที่ผูกอีเวนต์นี้จบเอง เมื่ออีเวนต์ถูกปิดจากการคืนกระเป๋า
 * — ไม่คืน error และไม่ throw ออกไป: การคืนกระเป๋าต้องสำเร็จอยู่ดีแม้ใบงานจะอัปเดตพลาด
 * — leadId ว่าง (อีเวนต์ที่ไม่ได้มาจากงาน CRM) → ข้ามเงียบๆ
 * — งานหนึ่งงานมีได้หลายอีเวนต์ (เช่น พรีเวดดิ้ง + วันงานจริง) แต่ใบงานหน้างานมีใบเดียวต่อทั้งงาน
 *   จึงปิดได้ต่อเมื่อ "ทุกอีเวนต์" ของงานนี้ปิดครบแล้ว ไม่ใช่แค่ใบที่เพิ่งคืนกระเป๋า
 *   (งานที่มีอีเวนต์เดียว = ใบที่เพิ่งปิดคือใบสุดท้ายอยู่แล้ว พฤติกรรมเหมือนเดิม)
 */
async function autoFinishOnsiteJobs(leadId: string | null, actorId: string) {
    if (!leadId) return

    const supabase = createServiceClient()

    const { data: leadEvents, error: eventsErr } = await supabase
        .from('events')
        .select('id, status')
        .eq('crm_lead_id', leadId)

    if (eventsErr) {
        console.error('[events] auto-finish onsite: fetch events failed:', eventsErr.message)
        return
    }
    // ยังมีอีเวนต์ที่ไม่ปิด → งานหน้างานยังไม่จบ (ไม่มีอีเวนต์เลย = ไม่ควรเกิด แต่ก็ไม่ปิดให้)
    if (!leadEvents || leadEvents.length === 0) return
    if (leadEvents.some(e => !isClosedEvent(e.status as string | null))) return

    const { data: jobs, error } = await supabase
        .from('jobs')
        .select('id, status')
        .eq('crm_lead_id', leadId)
        .eq('job_type', 'onsite')

    if (error) {
        console.error('[events] auto-finish onsite: fetch failed:', error.message)
        return
    }

    for (const job of jobs || []) {
        const oldStatus = (job.status as string) || ''
        if (POOL_FINISHED_STATUSES.includes(oldStatus)) continue

        const { error: updErr } = await supabase
            .from('jobs')
            .update({ status: 'done', updated_at: new Date().toISOString() })
            .eq('id', job.id)
        if (updErr) {
            console.error('[events] auto-finish onsite: update failed:', updErr.message)
            continue
        }

        // ไทม์ไลน์ของใบงาน (job_activities) แบบเดียวกับที่พูลงานบันทึกตอนรับ/คืน/ข้าม
        await supabase.from('job_activities').insert({
            job_id: job.id,
            created_by: actorId,
            activity_type: 'status_change',
            description: 'จบอัตโนมัติ: ปิดอีเวนต์แล้ว',
            old_status: oldStatus,
            new_status: 'done',
        })
        await logActivity('AUTO_FINISH_POOL_JOB', {
            jobId: job.id,
            jobType: 'onsite',
            leadId,
            oldStatus,
        })
        revalidatePath(`/jobs/${job.id}`)
    }

    revalidatePath('/jobs')
    revalidatePath('/jobs/tracking')
}

export async function processEventReturn(
    eventId: string,
    itemStatuses: { itemId: string, status: string }[],
    imageUrls: string[] = [],
    consumableUse: { kitId: string; itemId: string; used: number }[] = []
): Promise<{ error: string } | { success: true }> {
     const manager = await getEventManager('close')
     if (!manager) return { error: 'ไม่มีสิทธิ์ปิดงานอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า' }
     const userId = manager.userId

     const supabase = createServiceClient()

     // Fetch event details before processing
     const { data: event } = await supabase
         .from('events')
         .select('*')
         .eq('id', eventId)
         .single()

     if (event?.status === 'completed') {
         return { error: 'อีเวนต์นี้ปิดงานไปแล้ว' }
     }

     // กระเป๋าของอีเวนต์นี้ = การจอง (event_kits)
     const bookedKitIds = (await loadBookingsForEvent(supabase, eventId)).map(b => b.kitId)
     const { data: kits } = bookedKitIds.length === 0 ? { data: [] } : await supabase
         .from('kits')
         .select(`
             id,
             name,
             kit_contents(
                 quantity,
                 items(id, name, serial_number, status, image_url, is_consumable, unit)
             )
         `)
         .in('id', bookedKitIds)
         .overrideTypes<CloseKitRow[], { merge: false }>()

     const contentsOf = (k: CloseKitRow) => (k.kit_contents || []).filter((kc): kc is CloseKitContent & { items: NonNullable<CloseKitContent['items']> } => !!kc.items?.id)
     // วัสดุสิ้นเปลืองไม่มีสถานะรับคืน — ใช้ไปเท่าไรตัดยอดผ่าน consumableUse
     const consumableIds = new Set(
         (kits || []).flatMap(k => contentsOf(k).filter(kc => kc.items.is_consumable).map(kc => kc.items.id as string))
     )
     if (itemStatuses.some(s => consumableIds.has(s.itemId))) {
         return { error: 'วัสดุสิ้นเปลืองไม่ต้องเลือกสถานะ — กรอกจำนวนที่ใช้ไปแทน' }
     }

     // รับคืนได้แค่ ใช้ได้ / เสียหาย / ซ่อมบำรุง / หาย และเฉพาะอุปกรณ์ปกติในกระเป๋าของงานนี้
     const allowedItemIds = new Set(
         (kits || []).flatMap(k => contentsOf(k).filter(kc => !kc.items.is_consumable).map(kc => kc.items.id as string))
     )
     if (itemStatuses.some(s => !RETURN_STATUSES.includes(s.status) || !allowedItemIds.has(s.itemId))) {
         return { error: 'สถานะอุปกรณ์ไม่ถูกต้อง — เลือกได้แค่ ใช้ได้ / เสียหาย / ซ่อมบำรุง / หาย' }
     }

     // วัสดุสิ้นเปลือง: ตัดยอดที่ใช้ไป "ก่อน" บันทึกปิดงาน — ล้มกลางทาง = ยังไม่ปิดงาน กดยืนยันซ้ำได้
     // คู่ (กระเป๋า, ของ) ที่งานนี้ตัดไปแล้วถูกข้าม จึงไม่ตัดซ้ำ
     const { data: usedRows } = await supabase
         .from('stock_movements')
         .select('kit_id, item_id, delta')
         .eq('event_id', eventId)
         .eq('reason', 'use')
     const alreadyCut = (usedRows || [])
         .filter(r => r.kit_id)
         .map(r => ({ kitId: r.kit_id as string, itemId: r.item_id, used: -r.delta }))
     const kitConsumables = (kits || []).flatMap(k =>
         contentsOf(k).filter(kc => kc.items.is_consumable).map(kc => ({ kitId: k.id, itemId: kc.items.id as string, name: kc.items.name as string }))
     )
     const plan = planReturnUse(kitConsumables, consumableUse, alreadyCut)
     if ('error' in plan) return { error: plan.error }

     for (const cut of plan.cuts) {
         const name = kitConsumables.find(c => c.kitId === cut.kitId && c.itemId === cut.itemId)?.name || 'วัสดุสิ้นเปลือง'
         const res = await moveStock(supabase, {
             itemId: cut.itemId,
             delta: -cut.used,
             reason: 'use',
             eventId,
             kitId: cut.kitId,
             userId,
             note: `ปิดงาน ${event?.name || ''}`.trim(),
         })
         if ('error' in res) return { error: `ตัดยอด ${name} ไม่สำเร็จ: ${res.error} — ยังไม่ได้ปิดงาน` }
         await logActivity('DRAW_STOCK', { itemId: cut.itemId, name, delta: -cut.used, balance: res.balance, eventId, kitId: cut.kitId })
     }
     if (plan.cuts.length > 0) {
         revalidatePath('/items')
         revalidatePath('/shelves')
         revalidatePath('/stock/dashboard')
     }
     // จำนวนใช้ไปจริงของงานนี้ต่อคู่: ที่ตัดไว้ก่อนหน้า > ที่ส่งมา > 0
     const usedFor = (kitId: string, itemId: string) =>
         alreadyCut.find(c => c.kitId === kitId && c.itemId === itemId)?.used
         ?? consumableUse.find(c => c.kitId === kitId && c.itemId === itemId)?.used
         ?? 0

     // Build kits snapshot
     const kitsSnapshot = kits?.map(kit => ({
         kitId: kit.id,
         kitName: kit.name,
         items: kit.kit_contents?.map((kc) => ({
             itemId: kc.items?.id,
             itemName: kc.items?.name,
             serialNumber: kc.items?.serial_number,
             status: itemStatuses.find(s => s.itemId === kc.items?.id)?.status || kc.items?.status,
             quantity: kc.quantity,
             imageUrl: kc.items?.image_url,
             ...(kc.items?.is_consumable ? { isConsumable: true, used: usedFor(kit.id, kc.items.id) } : {})
         })) || []
     })) || []

     // 1. Save to event_closures table
     const { error: closureError } = await supabase
         .from('event_closures')
         .insert({
             event_name: event?.name || 'Unknown Event',
             event_date: event?.event_date,
             event_location: event?.location,
             closed_by: userId,
             kits_snapshot: kitsSnapshot,
             image_urls: imageUrls
         })

     if (closureError) {
         console.error('Failed to save closure record:', closureError)
         // Continue anyway - don't block the return process
     }

     // 2. Update item statuses (optimized batch update)
     const statusGroups: Record<string, string[]> = {}
     for (const { itemId, status } of itemStatuses) {
         if (!statusGroups[status]) statusGroups[status] = []
         statusGroups[status].push(itemId)
     }

     await Promise.all(
         Object.entries(statusGroups).map(([status, ids]) => 
             supabase.from('items').update({ status }).in('id', ids)
         )
     )

     // 4. Soft-close the event — keep the row so event_staff / staff_checkins /
     //    job_cost_events links survive. Status flips to 'completed'.
     const { error } = await supabase
        .from('events')
        .update({ status: 'completed' })
        .eq('id', eventId)

     if (error) {
         console.error("Close event failed", error)
         return { error: 'ปิดงานไม่สำเร็จ' }
     }

     // 3. ปล่อยกระเป๋า — ชี้ไปงานถัดไปที่จองไว้ (ไม่มี = ว่าง) การจองของงานนี้เก็บไว้เป็นประวัติ
     await recomputeKitPointers(supabase, bookedKitIds)

     await logActivity('CLOSE_EVENT', {
         eventId,
         name: event?.name || 'Unknown Event',
         closureRecorded: !closureError
     }, undefined)

     // 5. ปิดอีเวนต์แล้ว → ใบงานหน้างานของงานที่ผูกอีเวนต์นี้จบเอง (หายจากแท็บหน้างาน)
     //    จงใจไม่ให้ล้มการคืนกระเป๋า: อีเวนต์ปิดสำเร็จไปแล้ว ใบงานพลาดก็แค่บันทึกไว้ใน console
     //    อีเวนต์ที่ไม่ได้ผูกกับงาน CRM (crm_lead_id ว่าง) ข้ามเงียบๆ
     try {
         await autoFinishOnsiteJobs((event?.crm_lead_id as string) ?? null, userId)
     } catch (e) {
         console.error('[events] auto-finish onsite jobs threw:', e)
     }

     revalidatePath('/events')
     revalidatePath('/items')
     revalidatePath('/kits')
     revalidatePath('/events/event-closures')
     revalidatePath('/events/calendar')
     revalidatePath('/crm')

     return { success: true }
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
