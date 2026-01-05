import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import EditEventForm from './edit-event-form'

export const revalidate = 0

export default async function EditEventPage(props: { params: Promise<{ id: string }> }) {
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

  // Combine them for the UI list
  // We want to show the assigned ones as Checked
  const assignedList = assignedKits || []
  const availableList = availableKits || []
  
  const allDisplayKits = [...assignedList, ...availableList].sort((a, b) => a.name.localeCompare(b.name))
  const assignedKitIds = assignedList.map(k => k.id)

  return (
    <EditEventForm event={event} availableKits={allDisplayKits} assignedKitIds={assignedKitIds} />
  )
}
