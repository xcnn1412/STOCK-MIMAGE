import { supabaseServer as supabase } from '@/lib/supabase-server'
import EventsView from './events-view'

export const revalidate = 0

export default async function EventsPage() {
  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: false })

  return (
    <EventsView events={events || []} />
  )
}
