'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { ActionState, KitContent, Item, Database } from '@/types'


export async function createEvent(prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }
  if (role !== 'admin') {
      return { error: 'เฉพาะ admin เท่านั้นที่สร้างอีเวนต์ได้' }
  }

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const staff = formData.get('staff') as string
  const seller = formData.get('seller') as string
  const kitIds = formData.getAll('kits') as string[] 
  const fromCrm = formData.get('from_crm') as string | null
  
  if (!name) {
      return { error: 'Event name is required' }
  }

  const supabase = createServiceClient()
  
  const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
          name,
          location,
          staff,
          seller,
          event_date: formData.get('event_date') as string || new Date().toISOString(),
          crm_lead_id: fromCrm || null,
      })
      .select()
      .single()

  if (eventError) {
      console.error('Create event error:', eventError)
      return { error: 'Failed to create event' }
  }

  // Staff assignments — Single Table approach
  const staffAssignmentsJson = formData.get('staff_assignments') as string
  if (staffAssignmentsJson) {
    try {
      const staffAssignments = JSON.parse(staffAssignmentsJson) as { user_id: string; role: string }[]
      if (staffAssignments.length > 0) {
        if (fromCrm) {
          // CRM-linked: sync to crm_lead_staff (delete old + insert new)
          await supabase.from('crm_lead_staff').delete().eq('lead_id', fromCrm)
          const rows = staffAssignments.map(a => ({
            lead_id: fromCrm,
            user_id: a.user_id,
            role: a.role,
          }))
          await supabase.from('crm_lead_staff').insert(rows)

          // Sync old text arrays on crm_leads for Kanban board
          const assigned_sales = staffAssignments.filter(a => a.role === 'sale').map(a => a.user_id)
          const assigned_graphics = staffAssignments.filter(a => a.role === 'graphic').map(a => a.user_id)
          const assigned_staff = staffAssignments.filter(a => a.role !== 'sale' && a.role !== 'graphic').map(a => a.user_id)
          await supabase.from('crm_leads').update({
            assigned_sales,
            assigned_graphics,
            assigned_staff,
          }).eq('id', fromCrm)
        } else {
          // Standalone event: use event_staff
          const rows = staffAssignments.map(a => ({
            event_id: event.id,
            user_id: a.user_id,
            role: a.role,
          }))
          await supabase.from('event_staff').insert(rows)
        }
      }
    } catch (e) {
      console.error('Parse staff_assignments error:', e)
    }
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

  // If created from CRM, link the event back to the CRM lead
  if (fromCrm) {
    await supabase
      .from('crm_leads')
      .update({ event_id: event.id, updated_at: new Date().toISOString() })
      .eq('id', fromCrm)
    
    // Log activity on the CRM lead
    const cookieStore2 = await cookies()
    const uid = cookieStore2.get('session_user_id')?.value
    await supabase.from('crm_activities').insert({
      lead_id: fromCrm,
      created_by: uid,
      activity_type: 'note',
      description: `เปิดอีเวนต์แล้ว: ${name}`,
    })

    revalidatePath('/crm')
    revalidatePath(`/crm/${fromCrm}`)
  }

  revalidatePath('/events')
  redirect('/events')
}

// ============================================================================
// Link / Unlink Event ↔ CRM Lead
// ============================================================================

export async function linkEventToCrm(eventId: string, leadId: string) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }

  const supabase = createServiceClient()

  // Set events.crm_lead_id
  const { error: e1 } = await supabase
    .from('events')
    .update({ crm_lead_id: leadId })
    .eq('id', eventId)
  if (e1) return { error: e1.message }

  // Set crm_leads.event_id
  await supabase
    .from('crm_leads')
    .update({ event_id: eventId, updated_at: new Date().toISOString() })
    .eq('id', leadId)

  await logActivity('LINK_EVENT_TO_CRM', { eventId, leadId })
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}/edit`)
  revalidatePath('/crm')
  revalidatePath(`/crm/${leadId}`)
  return { success: true }
}

export async function unlinkEventFromCrm(eventId: string) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }

  const supabase = createServiceClient()

  // Get current lead id before unlinking
  const { data: event } = await supabase.from('events').select('crm_lead_id').eq('id', eventId).single()
  const leadId = event?.crm_lead_id

  // Clear events.crm_lead_id
  await supabase.from('events').update({ crm_lead_id: null }).eq('id', eventId)

  // Clear crm_leads.event_id  
  if (leadId) {
    await supabase
      .from('crm_leads')
      .update({ event_id: null, updated_at: new Date().toISOString() })
      .eq('id', leadId)
  }

  await logActivity('UNLINK_EVENT_FROM_CRM', { eventId, leadId })
  revalidatePath('/events')
  revalidatePath(`/events/${eventId}/edit`)
  if (leadId) {
    revalidatePath('/crm')
    revalidatePath(`/crm/${leadId}`)
  }
  return { success: true }
}

export async function updateEvent(id: string, prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }
  if (role !== 'admin') {
      return { error: 'เฉพาะ admin เท่านั้นที่แก้ไขอีเวนต์ได้' }
  }

  const name = formData.get('name') as string
  const location = formData.get('location') as string
  const staff = formData.get('staff') as string
  const seller = formData.get('seller') as string
  // These are the kits that SHOULD be assigned now
  const selectedKitIds = formData.getAll('kits') as string[] 

  if (!name) return { error: 'Event name is required' }

  const supabase = createServiceClient()

  // === Capture BEFORE state for change tracking ===
  const { data: oldEvent } = await supabase
      .from('events')
      .select('name, location, staff, seller, crm_lead_id')
      .eq('id', id)
      .single()

  const { data: oldKitsRaw } = await supabase
      .from('kits')
      .select('id, name')
      .eq('event_id', id)
  const oldKits = (oldKitsRaw || []) as { id: string; name: string }[]

  let oldStaff: { user_id: string; full_name: string; role: string }[] = []
  if (oldEvent?.crm_lead_id) {
      const { data: rows } = await supabase
          .from('crm_lead_staff')
          .select('user_id, role, profiles:user_id(full_name)')
          .eq('lead_id', oldEvent.crm_lead_id)
      oldStaff = ((rows || []) as any[]).map((s: any) => ({
          user_id: s.user_id,
          full_name: s.profiles?.full_name || '',
          role: s.role,
      }))
  } else {
      const { data: rows } = await supabase
          .from('event_staff')
          .select('user_id, role, profiles:user_id(full_name)')
          .eq('event_id', id)
      oldStaff = ((rows || []) as any[]).map((s: any) => ({
          user_id: s.user_id,
          full_name: s.profiles?.full_name || '',
          role: s.role,
      }))
  }

  // 1. Update basic info
  const { error: updateError } = await supabase
      .from('events')
      .update({ name, location, staff, seller })
      .eq('id', id)

  if (updateError) return { error: 'Failed to update event details' }

  // 2. Sync Kits
  // Strategy:
  // a. Clear ALL kits currently assigned to this event (set event_id = null)
  // b. Set event_id = id for the selectedKitIds
  // (Alternatively: diff them, but full reset is safer and simpler for small scale)

  // However, we must be careful not to unset kits that belong to OTHER events if the UI was somehow manipulated, 
  // but here we act on kits currently assigned to THIS event or being set TO this event.
  
  // BEFORE releasing kits, reset item statuses to prevent orphaned items
  const { data: kitsToRelease } = await supabase
      .from('kits')
      .select(`
          id,
          kit_contents(item_id)
      `)
      .eq('event_id', id)

  if (kitsToRelease && kitsToRelease.length > 0) {
      // Collect all item IDs from kits being released
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const itemIds = kitsToRelease
          .flatMap(kit => (kit.kit_contents as any)?.map((kc: any) => kc.item_id) || [])
          .filter(Boolean)
      
      // Reset items to 'available' if they were 'in_use'
      if (itemIds.length > 0) {
          await supabase
              .from('items')
              .update({ status: 'available' })
              .in('id', itemIds)
              .eq('status', 'in_use')  // Only reset if currently in_use
      }
  }
  
  // Then, release all kits currently assigned to this event
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

  // 3. Sync staff — Single Table approach
  const staffAssignmentsJson = formData.get('staff_assignments') as string
  if (staffAssignmentsJson) {
    try {
      const staffAssignments = JSON.parse(staffAssignmentsJson) as { user_id: string; role: string }[]
      
      // Check if event is CRM-linked
      const { data: eventData } = await supabase.from('events').select('crm_lead_id').eq('id', id).single()
      const crmLeadId = eventData?.crm_lead_id

      console.log('--- DEBUG updateEvent ---')
      console.log('eventId:', id)
      console.log('crmLeadId:', crmLeadId)
      console.log('staffAssignments:', staffAssignments)

      if (crmLeadId) {
        // CRM-linked: sync to crm_lead_staff
        const { error: delErr } = await supabase.from('crm_lead_staff').delete().eq('lead_id', crmLeadId)
        if (delErr) console.error('Delete CRM staff err:', delErr)

        if (staffAssignments.length > 0) {
          const rows = staffAssignments.map(a => ({
            lead_id: crmLeadId,
            user_id: a.user_id,
            role: a.role,
          }))
          const { error: insErr } = await supabase.from('crm_lead_staff').insert(rows)
          if (insErr) console.error('Insert CRM staff err:', insErr)
          else console.log('Inserted CRM staff rows successfully:', rows.length)
        }

        // Sync old text arrays on crm_leads for Kanban board
        const assignedSales = staffAssignments.filter(a => a.role === 'sale').map(a => a.user_id)
        const assignedGraphics = staffAssignments.filter(a => a.role === 'graphic').map(a => a.user_id)
        const assignedStaff = staffAssignments.filter(a => a.role !== 'sale' && a.role !== 'graphic').map(a => a.user_id)
        await supabase.from('crm_leads').update({
          assigned_sales: assignedSales,
          assigned_graphics: assignedGraphics,
          assigned_staff: assignedStaff,
        }).eq('id', crmLeadId)
      } else {
        // Standalone event: sync to event_staff
        await supabase.from('event_staff').delete().eq('event_id', id)
        if (staffAssignments.length > 0) {
          const rows = staffAssignments.map(a => ({
            event_id: id,
            user_id: a.user_id,
            role: a.role,
          }))
          await supabase.from('event_staff').insert(rows)
        }
      }
    } catch (e) {
      console.error('Sync staff error:', e)
    }
  }

  // === Compute diff for activity log ===
  const fieldChanges: Record<string, { from: string | null; to: string | null }> = {}
  if ((oldEvent?.name || '') !== (name || '')) {
      fieldChanges.name = { from: oldEvent?.name || null, to: name || null }
  }
  if ((oldEvent?.location || '') !== (location || '')) {
      fieldChanges.location = { from: oldEvent?.location || null, to: location || null }
  }
  if ((oldEvent?.staff || '') !== (staff || '')) {
      fieldChanges.staff = { from: oldEvent?.staff || null, to: staff || null }
  }
  if ((oldEvent?.seller || '') !== (seller || '')) {
      fieldChanges.seller = { from: oldEvent?.seller || null, to: seller || null }
  }

  // Kit diff
  const oldKitIdSet = new Set(oldKits.map(k => k.id))
  const newKitIdSet = new Set(selectedKitIds)
  const oldKitMap = new Map(oldKits.map(k => [k.id, k.name]))
  const addedKitIds = selectedKitIds.filter(kid => !oldKitIdSet.has(kid))
  const removedKitIds = oldKits.filter(k => !newKitIdSet.has(k.id)).map(k => k.id)

  let addedKits: { id: string; name: string }[] = []
  if (addedKitIds.length > 0) {
      const { data: addedKitsData } = await supabase
          .from('kits')
          .select('id, name')
          .in('id', addedKitIds)
      addedKits = (addedKitsData || []) as { id: string; name: string }[]
  }
  const removedKits = removedKitIds.map(kid => ({
      id: kid,
      name: oldKitMap.get(kid) || kid,
  }))

  // Staff diff
  let addedStaff: { user_id: string; full_name: string; role: string }[] = []
  let removedStaff: { user_id: string; full_name: string; role: string }[] = []
  const staffAssignmentsRaw = formData.get('staff_assignments') as string
  if (staffAssignmentsRaw) {
      try {
          const newStaff = JSON.parse(staffAssignmentsRaw) as { user_id: string; role: string }[]
          const oldStaffKeys = new Set(oldStaff.map(s => `${s.user_id}::${s.role}`))
          const newStaffKeys = new Set(newStaff.map(s => `${s.user_id}::${s.role}`))

          const addedRaw = newStaff.filter(s => !oldStaffKeys.has(`${s.user_id}::${s.role}`))
          removedStaff = oldStaff.filter(s => !newStaffKeys.has(`${s.user_id}::${s.role}`))

          if (addedRaw.length > 0) {
              const { data: profileRows } = await supabase
                  .from('profiles')
                  .select('id, full_name')
                  .in('id', addedRaw.map(s => s.user_id))
              const profMap = new Map(((profileRows || []) as any[]).map((p: any) => [p.id, p.full_name || '']))
              addedStaff = addedRaw.map(s => ({
                  user_id: s.user_id,
                  full_name: profMap.get(s.user_id) || '',
                  role: s.role,
              }))
          }
      } catch (e) {
          console.error('Compute staff diff error:', e)
      }
  }

  const logDetails: Record<string, any> = { id, name, kitIds: selectedKitIds }
  if (Object.keys(fieldChanges).length > 0) logDetails.changes = fieldChanges
  if (addedKits.length > 0 || removedKits.length > 0) {
      logDetails.kits = { added: addedKits, removed: removedKits }
  }
  if (addedStaff.length > 0 || removedStaff.length > 0) {
      logDetails.staff_assignments = { added: addedStaff, removed: removedStaff }
  }

  await logActivity('UPDATE_EVENT', logDetails, undefined)

  revalidatePath('/events')
  revalidatePath(`/events/${id}/edit`)
  // Also revalidate CRM if linked
  const { data: ev } = await supabase.from('events').select('crm_lead_id').eq('id', id).single()
  if (ev?.crm_lead_id) {
    revalidatePath('/crm')
    revalidatePath(`/crm/${ev.crm_lead_id}`)
  }
  redirect('/events')
}


export async function deleteEvent(eventId: string) {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    if (!userId) {
        return { error: 'Unauthorized: No active session' }
    }

    const supabase = createServiceClient()

    const { data: event } = await supabase
        .from('events')
        .select('name, crm_lead_id')
        .eq('id', eventId)
        .single()

    // Reset items currently in_use via this event's kits back to available
    const { data: kitsToRelease } = await supabase
        .from('kits')
        .select(`id, kit_contents(item_id)`)
        .eq('event_id', eventId)

    if (kitsToRelease && kitsToRelease.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const itemIds = kitsToRelease
            .flatMap(kit => (kit.kit_contents as any)?.map((kc: any) => kc.item_id) || [])
            .filter(Boolean)

        if (itemIds.length > 0) {
            await supabase
                .from('items')
                .update({ status: 'available' })
                .in('id', itemIds)
                .eq('status', 'in_use')
        }
    }

    // Release kits
    await supabase
        .from('kits')
        .update({ event_id: null })
        .eq('event_id', eventId)

    // Clear CRM lead reference
    await supabase
        .from('crm_leads')
        .update({ event_id: null })
        .eq('event_id', eventId)

    const { error } = await supabase
        .from('events')
        .delete()
        .eq('id', eventId)

    if (error) {
        console.error('Delete event failed', error)
        return { error: 'Failed to delete event' }
    }

    await logActivity('DELETE_EVENT', {
        eventId,
        name: event?.name || 'Unknown Event',
        reason: 'manual',
    }, undefined)

    revalidatePath('/events')
    revalidatePath('/items')
    revalidatePath('/kits')
    if (event?.crm_lead_id) {
        revalidatePath('/crm')
        revalidatePath(`/crm/${event.crm_lead_id}`)
    }

    return { success: true }
}


export async function processEventReturn(eventId: string, itemStatuses: { itemId: string, status: string }[], imageUrls: string[] = []) {
     const cookieStore = await cookies()
     const userId = cookieStore.get('session_user_id')?.value
     if (!userId) {
         throw new Error('Unauthorized: No active session')
     }

     const supabase = createServiceClient()

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
             kits_snapshot: kitsSnapshot,
             image_urls: imageUrls
         })

     if (closureError) {
         console.error('Failed to save closure record:', closureError)
         // Continue anyway - don't block the return process
     }

     // 2. Update item statuses (optimized batch update)
     const statusGroups: Record<string, string[]> = {}
     for (const { itemId, status } of itemStatuses) {
         if (!statusGroups[status]) statusGroups[status] = []
         statusGroups[status].push(itemId)
     }

     await Promise.all(
         Object.entries(statusGroups).map(([status, ids]) => 
             // eslint-disable-next-line @typescript-eslint/no-explicit-any
             supabase.from('items').update({ status } as any).in('id', ids)
         )
     )

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
     revalidatePath('/events/event-closures')

     // 6. Clear event_id on CRM leads that referenced this event
     await supabase
       .from('crm_leads')
       .update({ event_id: null })
       .eq('event_id', eventId)
     revalidatePath('/crm')
}

