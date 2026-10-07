import { getEventManager } from '@/lib/event-permissions'
import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import { notFound, redirect } from 'next/navigation'
import EditEventForm from './edit-event-form'
import { loadBookingsForEvent, loadOpenBookings } from '@/lib/kit-bookings'
import { getCrmSettings } from '../../../crm/actions'
import type { EventLog } from '../../events-log-sheet'
import { readAllRows } from '@/lib/read-all-rows'

import type { Kit } from '@/types'
import type { CrmSettingRow, StaffAssignment } from '../../event-form-types'

export const revalidate = 0

type EventStaffRow = { id: string; user_id: string; role: string; profiles: { full_name: string | null } | null }

export default async function EditEventPage(props: { params: Promise<{ id: string }> }) {
  if (!(await getEventManager('edit'))) redirect('/events')

  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // 1–2. กระเป๋าทุกใบ + การจองของงานที่ยังไม่ปิด (event_kits) — ใบที่จองให้อีเวนต์นี้ติ๊กไว้ก่อน
  const [{ data: allKits }, kitBookings, ownBookings] = await Promise.all([
    supabase.from('kits').select('id, name').order('name'),
    loadOpenBookings(createServiceClient()),
    loadBookingsForEvent(createServiceClient(), event.id),
  ])

  // 3. Fetch all user profiles for staff/seller selection
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  // 4. Fetch staff — event_staff (keyed by event_id) is the single source of truth for
  // every event, CRM-linked or not. Each sub-event under a shared CRM lead has its own
  // independent staff list.
  const serviceClient = createServiceClient()
  const { data: eventStaffData } = await serviceClient
    .from('event_staff')
    .select('id, user_id, role, profiles:user_id(full_name)')
    .eq('event_id', event.id)
    .order('created_at', { ascending: true })
    .overrideTypes<EventStaffRow[], { merge: false }>()
  const eventStaff: EventStaffRow[] = eventStaffData || []

  // 5. Fetch staff role settings
  const { data: allSettings } = await getCrmSettings()
  const staffRoles = ((allSettings || []) as CrmSettingRow[]).filter((s) => s.category === 'staff_role' && s.is_active)

  const allDisplayKits = (allKits || []) as Kit[]
  const assignedKitIds = ownBookings.map(b => b.kitId)

  // Map event staff to assignments
  let staffAssignments: StaffAssignment[] = (eventStaff || []).map((s) => ({
    user_id: s.user_id,
    full_name: s.profiles?.full_name || '',
    role: s.role,
  }))

  // Fallback B: if event_staff is empty, parse legacy text columns
  if (staffAssignments.length === 0) {
    const profileList = profiles || []
    const parseAndMatch = (text: string | null | undefined, role: string) => {
      if (!text) return []
      return text.split(',').map(n => n.trim()).filter(Boolean).map(name => {
        const match = profileList.find(p => p.full_name === name)
        return match
          ? { user_id: match.id, full_name: match.full_name || name, role }
          : { user_id: `legacy_${name}`, full_name: name, role }
      })
    }
    const sellerAssignments = parseAndMatch(event.seller, 'sale')
    const staffTextAssignments = parseAndMatch(event.staff, 'general')
    // Deduplicate by name+role
    const seen = new Set<string>()
    staffAssignments = [...sellerAssignments, ...staffTextAssignments].filter(a => {
      const key = `${a.full_name}::${a.role}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }

  // 6. Fetch CRM leads list for "เชื่อมกับ CRM" dropdown
  // PostgREST ตัดที่ 1,000 แถวต่อคำขอ → อ่านทีละหน้าให้ครบทุกราย (เรียง created_at + id ให้คงที่)
  const { rows: crmLeads } = await readAllRows<{ id: string; customer_name: string; event_date: string | null; package_name: string | null }>((from, to) => serviceClient
    .from('crm_leads')
    .select('id, customer_name, event_date, package_name')
    .order('created_at', { ascending: false })
    .order('id')
    .range(from, to))

  // 7. Fetch logs specific to this event
  const { data: rawLogs } = await serviceClient
    .from('activity_logs')
    .select(`
      id,
      action_type,
      details,
      created_at,
      user:user_id (full_name, role)
    `)
    .in('action_type', ['CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT', 'LINK_EVENT_TO_CRM', 'UNLINK_EVENT_FROM_CRM'])
    .order('created_at', { ascending: false })
    .limit(500)

  const eventLogs = (rawLogs || []).filter((log: { action_type: string; details: Record<string, unknown> | null }) => {
    const d = log.details || {}
    if (log.action_type === 'UPDATE_EVENT') return d.id === event.id
    if (log.action_type === 'DELETE_EVENT') return d.eventId === event.id
    if (log.action_type === 'LINK_EVENT_TO_CRM' || log.action_type === 'UNLINK_EVENT_FROM_CRM') return d.eventId === event.id
    if (log.action_type === 'CREATE_EVENT') return d.name === event.name
    return false
  }) as unknown as EventLog[]

  return (
    <EditEventForm
      event={event}
      availableKits={allDisplayKits}
      assignedKitIds={assignedKitIds}
      kitBookings={kitBookings}
      profiles={profiles || []}
      staffAssignments={staffAssignments}
      staffRoles={staffRoles}
      crmLeads={(crmLeads || []).map(l => ({ id: l.id, customer_name: l.customer_name, event_date: l.event_date, package_name: l.package_name }))}
      logs={eventLogs}
    />
  )
}
