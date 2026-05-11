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
    .in('action_type', ['CREATE_EVENT', 'UPDATE_EVENT', 'DELETE_EVENT', 'LINK_EVENT_TO_CRM', 'UNLINK_EVENT_FROM_CRM'])
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <EventsView
      events={events || []}
      isAdmin={isAdmin}
      logs={(logs || []) as unknown as EventLog[]}
    />
  )
}
