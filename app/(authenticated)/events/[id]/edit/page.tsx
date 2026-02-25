import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import EditEventForm from './edit-event-form'

import type { Kit } from '@/types'

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

  // 3. Fetch all user profiles for staff/seller selection
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  // Combine them for the UI list
  const assignedList = (assignedKits || []) as Kit[]
  const availableList = (availableKits || []) as Kit[]
  
  const allDisplayKits = [...assignedList, ...availableList].sort((a, b) => a.name.localeCompare(b.name))
  const assignedKitIds = assignedList.map(k => k.id)

  return (
    <EditEventForm
      event={event}
      availableKits={allDisplayKits}
      assignedKitIds={assignedKitIds}
      profiles={profiles || []}
    />
  )
}
