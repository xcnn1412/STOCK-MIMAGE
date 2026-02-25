import { supabase } from '@/lib/supabase'
import CreateEventForm from './create-event-form'

export const revalidate = 0

export default async function NewEventPage() {
  // Fetch kits that are not currently assigned to an event
  const { data: availableKits } = await supabase
    .from('kits')
    .select('id, name')
    .is('event_id', null)
    .order('name')

  // Fetch all user profiles for staff/seller selection
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  return (
    <CreateEventForm
      availableKits={availableKits || []}
      profiles={profiles || []}
    />
  )
}
