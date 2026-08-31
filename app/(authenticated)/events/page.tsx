import { cookies } from 'next/headers'
import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import EventsView from './events-view'
import type { EventLog } from './events-log-sheet'

export const revalidate = 0

export default async function EventsPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const isAdmin = role === 'admin'

  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: false })

  // งานต้นทาง (CRM) ของแต่ละอีเวนต์ — ลิงก์กลับจากการ์ดอีเวนต์ไปหางาน/พูลงาน
  const leadIds = [...new Set(
    (events || []).map(e => (e as { crm_lead_id?: string | null }).crm_lead_id).filter((v): v is string => !!v)
  )]
  const leadByEvent: Record<string, { leadId: string; customerName: string | null }> = {}
  if (leadIds.length > 0) {
    const serviceForLeads = createServiceClient()
    const { data: leads } = await serviceForLeads
      .from('crm_leads').select('id, customer_name').in('id', leadIds)
    const nameById = new Map((leads || []).map(l => [l.id as string, (l.customer_name as string | null) ?? null]))
    for (const e of events || []) {
      const lid = (e as { crm_lead_id?: string | null }).crm_lead_id
      if (lid && nameById.has(lid)) leadByEvent[e.id] = { leadId: lid, customerName: nameById.get(lid) ?? null }
    }
  }

  const serviceClient = createServiceClient()
  const { data: logs } = await serviceClient
    .from('activity_logs')
    .select(`
      id,
      action_type,
      details,
      created_at,
      user:user_id (full_name, role)
    `)
    .in('action_type', ['CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT', 'CLOSE_EVENT', 'LINK_EVENT_TO_CRM', 'UNLINK_EVENT_FROM_CRM'])
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <EventsView
      events={events || []}
      isAdmin={isAdmin}
      logs={(logs || []) as unknown as EventLog[]}
      leadByEvent={leadByEvent}
    />
  )
}
