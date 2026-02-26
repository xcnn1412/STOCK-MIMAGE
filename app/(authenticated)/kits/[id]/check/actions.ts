'use server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export async function checkoutItems(eventId: string, kitId: string, itemIds: string[]) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value

  if (!userId) return { error: "Unauthorized" }

  const supabase = createServerSupabase()

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
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value

    if (!userId) return { error: "Unauthorized" }

    const supabase = createServerSupabase()

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
