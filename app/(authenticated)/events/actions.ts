'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { ActionState, KitContent, Item, Database } from '@/types'

function createServerSupabase() {
    return createClient<Database>(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export async function createEvent(prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const staff = formData.get('staff') as string
  const kitIds = formData.getAll('kits') as string[] 
  
  if (!name) {
      return { error: 'Event name is required' }
  }

  const supabase = createServerSupabase()
  
  const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
          name,
          location,
          staff,
          event_date: formData.get('event_date') as string || new Date().toISOString()
      })
      .select()
      .single()

  if (eventError) {
      console.error('Create event error:', eventError)
      return { error: 'Failed to create event' }
  }

  if (kitIds.length > 0) {
      const { error: kitsError } = await supabase
          .from('kits')
          .update({ event_id: event.id })
          .in('id', kitIds)
      
      if (kitsError) {
          console.error('Assign kits error:', kitsError)
          return { error: 'Event created but failed to assign kits' }
      }
  }

  await logActivity('CREATE_EVENT', { 
      name, 
      location, 
      kitIds 
  }, undefined)

  revalidatePath('/events')
  redirect('/events')
}


export async function updateEvent(id: string, prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const staff = formData.get('staff') as string
  // These are the kits that SHOULD be assigned now
  const selectedKitIds = formData.getAll('kits') as string[] 

  if (!name) return { error: 'Event name is required' }

  const supabase = createServerSupabase()

  // 1. Update basic info
  const { error: updateError } = await supabase
      .from('events')
      .update({ name, location, staff })
      .eq('id', id)
  
  if (updateError) return { error: 'Failed to update event details' }

  // 2. Sync Kits
  // Strategy:
  // a. Clear ALL kits currently assigned to this event (set event_id = null)
  // b. Set event_id = id for the selectedKitIds
  // (Alternatively: diff them, but full reset is safer and simpler for small scale)

  // However, we must be careful not to unset kits that belong to OTHER events if the UI was somehow manipulated, 
  // but here we act on kits currently assigned to THIS event or being set TO this event.
  
  // First, release all kits currently assigned to this event
  await supabase
      .from('kits')
      .update({ event_id: null })
      .eq('event_id', id)

  // Then, assign the new selection
  if (selectedKitIds.length > 0) {
      await supabase
          .from('kits')
          .update({ event_id: id })
          .in('id', selectedKitIds)
  }

  await logActivity('UPDATE_EVENT', { 
      id, 
      name, 
      kitIds: selectedKitIds 
  }, undefined)

  revalidatePath('/events')
  revalidatePath(`/events/${id}/edit`)
  redirect('/events')
}


export async function processEventReturn(eventId: string, itemStatuses: { itemId: string, status: string }[]) {
     const cookieStore = await cookies()
     const userId = cookieStore.get('session_user_id')?.value
     if (!userId) {
         throw new Error('Unauthorized: No active session')
     }

     const supabase = createServerSupabase()

     // Fetch event details before processing
     const { data: event } = await supabase
         .from('events')
         .select('*')
         .eq('id', eventId)
         .single()

     // Fetch kits and their items for snapshot
     const { data: kits } = await supabase
         .from('kits')
         .select(`
             id,
             name,
             kit_contents(
                 quantity,
                 items(id, name, serial_number, status, image_url)
             )
         `)
         .eq('event_id', eventId)

     // Build kits snapshot
     const kitsSnapshot = kits?.map(kit => ({
         kitId: kit.id,
         kitName: kit.name,
         // eslint-disable-next-line @typescript-eslint/no-explicit-any
         items: kit.kit_contents?.map((kc: any) => ({
             itemId: kc.items?.id,
             itemName: kc.items?.name,
             serialNumber: kc.items?.serial_number,
             status: itemStatuses.find(s => s.itemId === kc.items?.id)?.status || kc.items?.status,
             quantity: kc.quantity,
             imageUrl: kc.items?.image_url
         })) || []
     })) || []

     // 1. Save to event_closures table
     const { error: closureError } = await supabase
         .from('event_closures')
         .insert({
             event_name: event?.name || 'Unknown Event',
             event_date: event?.event_date,
             event_location: event?.location,
             closed_by: userId,
             kits_snapshot: kitsSnapshot
         })

     if (closureError) {
         console.error('Failed to save closure record:', closureError)
         // Continue anyway - don't block the return process
     }

     // 2. Update item statuses
     for (const item of itemStatuses) {
         await supabase
             .from('items')
             .update({ status: item.status })
             .eq('id', item.itemId)
     }

     // 3. Release kits (set event_id to null)
     await supabase
        .from('kits')
        .update({ event_id: null })
        .eq('event_id', eventId)

     // 4. Delete the event
     const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

     if (error) {
         console.error("Delete event failed", error)
     }

     await logActivity('DELETE_EVENT', { 
         eventId, 
         name: event?.name || 'Unknown Event',
         reason: 'return',
         closureRecorded: !closureError
     }, undefined)

     revalidatePath('/events')
     revalidatePath('/items')
     revalidatePath('/kits')
     revalidatePath('/event-closures')
}

