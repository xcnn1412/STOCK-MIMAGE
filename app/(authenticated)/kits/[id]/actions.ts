'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export async function addItemToKit(kitId: string, itemId: string, quantity: number = 1) {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('kit_contents').insert({
    kit_id: kitId,
    item_id: itemId,
    quantity
  })

  if (error) {
    console.error(error)
    return { error: 'Failed to add item' }
  }

  await logActivity('ADD_KIT_ITEM', { kitId, itemId, quantity }, undefined)

  revalidatePath(`/kits/${kitId}`)
}

export async function removeItemFromKit(contentId: string, kitId: string, formData: FormData) {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('kit_contents').delete().eq('id', contentId)
  
  if (error) {
      console.error(error)
      return { error: 'Failed to remove item' }
  }

  await logActivity('REMOVE_KIT_ITEM', { contentId, kitId }, undefined)

  revalidatePath(`/kits/${kitId}`)
}

export async function updateKitItemQuantity(contentId: string, quantity: number) {
    const supabase = createServerSupabase()
    const { error } = await supabase.from('kit_contents').update({ quantity }).eq('id', contentId)
    
    if (error) {
        console.error(error)
        throw new Error('Failed to update quantity')
    }
    
    await logActivity('UPDATE_KIT_ITEM', { contentId, quantity }, undefined)

    revalidatePath('/kits', 'layout')
}
