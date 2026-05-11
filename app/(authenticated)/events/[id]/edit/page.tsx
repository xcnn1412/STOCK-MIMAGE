import { cookies } from 'next/headers'
import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import { notFound, redirect } from 'next/navigation'
import EditEventForm from './edit-event-form'
import { getCrmSettings } from '../../../crm/actions'
import type { EventLog } from '../../events-log-sheet'

import type { Kit } from '@/types'

export const revalidate = 0

export default async function EditEventPage(props: { params: Promise<{ id: string }> }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (role !== 'admin') redirect('/events')

  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // 1. Get kits ALREADY assigned to this event
  const { data: assignedKits } = await supabase
    .from('kits')
    .select('id, name')
    .eq('event_id', event.id)
    .order('name')

  // 2. Get available kits (not assigned to any event)
  const { data: availableKits } = await supabase
    .from('kits')
    .select('id, name')
    .is('event_id', null)
    .order('name')

  // 3. Fetch all user profiles for staff/seller selection
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  // 4. Fetch event_staff junction table records
  const serviceClient = createServiceClient()
  // 4. Fetch staff — Single Table approach
  let eventStaff: any[] = []
  if (event.crm_lead_id) {
    // CRM-linked: read from crm_lead_staff
    const { data } = await serviceClient
      .from('crm_lead_staff')
      .select('id, user_id, role, profiles:user_id(full_name)')
      .eq('lead_id', event.crm_lead_id)
      .order('created_at', { ascending: true })
    eventStaff = data || []
  } else {
    // Standalone: read from event_staff
    const { data } = await serviceClient
      .from('event_staff')
      .select('id, user_id, role, profiles:user_id(full_name)')
      .eq('event_id', event.id)
      .order('created_at', { ascending: true })
    eventStaff = data || []
  }

  // 5. Fetch staff role settings
  const { data: allSettings } = await getCrmSettings()
  const staffRoles = (allSettings || []).filter((s: any) => s.category === 'staff_role' && s.is_active)

  // Combine them for the UI list
  const assignedList = (assignedKits || []) as Kit[]
  const availableList = (availableKits || []) as Kit[]
  
  const allDisplayKits = [...assignedList, ...availableList].sort((a, b) => a.name.localeCompare(b.name))
  const assignedKitIds = assignedList.map(k => k.id)

  // Map event staff to assignments
  let staffAssignments = (eventStaff || []).map((s: any) => ({
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
  const { data: crmLeads } = await serviceClient
    .from('crm_leads')
    .select('id, customer_name, event_date, package_name')
    .order('created_at', { ascending: false })

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

  const eventLogs = (rawLogs || []).filter((log: any) => {
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
      profiles={profiles || []}
      staffAssignments={staffAssignments}
      staffRoles={staffRoles as any[]}
      crmLeads={(crmLeads || []).map(l => ({ id: l.id, customer_name: l.customer_name, event_date: l.event_date, package_name: l.package_name }))}
      logs={eventLogs}
    />
  )
}
