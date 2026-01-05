import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import CheckKitsView from './check-kits-view'

export default async function EventKitsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // Fetch kits assigned to this event
  const { data: kits } = await supabase
    .from('kits')
    .select('*')
    .eq('event_id', event.id)

  return <CheckKitsView event={event} kits={kits || []} />
}
