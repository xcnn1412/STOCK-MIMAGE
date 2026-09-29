'use server'
import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'



export async function checkoutItems(eventId: string, kitId: string, itemIds: string[]) {
  const session = await requireAuth()
  const userId = session?.userId

  if (!userId) return { error: "Unauthorized" }

  const supabase = createServiceClient()

  // 1. Update items status to 'in_use'
  const { error: updateError } = await supabase
    .from('items')
    .update({ status: 'in_use' })
    .in('id', itemIds)

  if (updateError) return { error: updateError.message }

  // 2. Insert logs
  const logs = itemIds.map(id => ({
    event_id: eventId,
    item_id: id,
    kit_id: kitId,
    user_id: userId,
    action: 'checkout',
    condition: 'good'
  }))

  const { error: logError } = await supabase.from('event_logs').insert(logs)
  
  if (logError) return { error: logError.message }

  revalidatePath(`/kits/${kitId}/check`)
}

export async function checkinItem(eventId: string, kitId: string, itemId: string, condition: 'good' | 'damaged' | 'lost', note?: string) {
    const session = await requireAuth()
    const userId = session?.userId

    if (!userId) return { error: "Unauthorized" }

    const supabase = createServiceClient()

    // Determine new status
    let newStatus = 'available'
    if (condition === 'damaged') newStatus = 'maintenance'
    if (condition === 'lost') newStatus = 'lost'

    // Update item
    const { error: updateError } = await supabase
        .from('items')
        .update({ status: newStatus })
        .eq('id', itemId)
    
    if (updateError) return { error: updateError.message }

    // Log
    const { error: logError } = await supabase.from('event_logs').insert({
        event_id: eventId,
        item_id: itemId,
        kit_id: kitId,
        user_id: userId,
        action: 'checkin',
        condition,
        note
    })

    if (logError) return { error: logError.message }

    revalidatePath(`/kits/${kitId}/check`)
}
