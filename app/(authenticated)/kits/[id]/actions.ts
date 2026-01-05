'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export async function addItemToKit(kitId: string, itemId: string, quantity: number = 1) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const supabase = createServerSupabase()
  
  // Fetch details for logging
  const [ { data: kit }, { data: item }, { data: existingAssignment } ] = await Promise.all([
      supabase.from('kits').select('name').eq('id', kitId).single(),
      supabase.from('items').select('name').eq('id', itemId).single(),
      supabase.from('kit_contents').select('kit_id, kits(name)').eq('item_id', itemId).maybeSingle()
  ])

  // Check if item is already in a kit
  if (existingAssignment) {
      const assignedKitName = (existingAssignment.kits as any)?.name || 'another kit'
      return { error: `Item is already in ${assignedKitName}` }
  }

  const { error } = await supabase.from('kit_contents').insert({
    kit_id: kitId,
    item_id: itemId,
    quantity
  })

  if (error) {
    console.error(error)
    return { error: 'Failed to add item' }
  }

  await logActivity('ADD_KIT_ITEM', { 
      kitName: kit?.name || 'Unknown Kit', 
      itemName: item?.name || 'Unknown Item',
      quantity,
      kitId, 
      itemId 
  }, undefined)

  revalidatePath(`/kits/${kitId}`)
}

export async function removeItemFromKit(contentId: string, kitId: string) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const supabase = createServerSupabase()
  
  // Fetch details before delete
  const { data: content } = await supabase.from('kit_contents')
    .select('quantity, kits(name), items(name)')
    .eq('id', contentId)
    .single()

  const { error } = await supabase.from('kit_contents').delete().eq('id', contentId)
  
  if (error) {
      console.error(error)
      return { error: 'Failed to remove item' }
  }

  // safely cast nested relations
  const kitName = (content?.kits as any)?.name || 'Unknown Kit'
  const itemName = (content?.items as any)?.name || 'Unknown Item'

  await logActivity('REMOVE_KIT_ITEM', { 
      kitName, 
      itemName,
      contentId,
      kitId
  }, undefined)

  revalidatePath(`/kits/${kitId}`)
}

export async function updateKitItemQuantity(contentId: string, quantity: number) {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value
    if (!userId) {
        throw new Error('Unauthorized: No active session')
    }

    const supabase = createServerSupabase()

    // Fetch details before update
    const { data: content } = await supabase.from('kit_contents')
        .select('quantity, kits(name), items(name)')
        .eq('id', contentId)
        .single()

    const { error } = await supabase.from('kit_contents').update({ quantity }).eq('id', contentId)
    
    if (error) {
        console.error(error)
        throw new Error('Failed to update quantity')
    }

    const kitName = (content?.kits as any)?.name || 'Unknown Kit'
    const itemName = (content?.items as any)?.name || 'Unknown Item'
    
    await logActivity('UPDATE_KIT_ITEM', { 
        kitName,
        itemName,
        oldQuantity: content?.quantity,
        newQuantity: quantity,
        contentId
    }, undefined)

    revalidatePath('/kits', 'layout')
}
