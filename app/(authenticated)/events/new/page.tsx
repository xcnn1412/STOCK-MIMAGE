import { supabase } from '@/lib/supabase'
import CreateEventForm from './create-event-form'

export const revalidate = 0

export default async function NewEventPage() {
  // Fetch kits that are not currently assigned to an event
  // We assume 'event_id' is null for available kits
  const { data: availableKits } = await supabase
    .from('kits')
    .select('id, name')
    .is('event_id', null)
    .order('name')

  return (
    <CreateEventForm availableKits={availableKits || []} />
  )
}
