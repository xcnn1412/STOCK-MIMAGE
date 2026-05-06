import { cookies } from 'next/headers'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import EventsView from './events-view'

export const revalidate = 0

export default async function EventsPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const isAdmin = role === 'admin'

  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: false })

  return (
    <EventsView events={events || []} isAdmin={isAdmin} />
  )
}
