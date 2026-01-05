'use server'

import { createClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'

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

  revalidatePath(`/kits/${kitId}`)
}

export async function removeItemFromKit(contentId: string, kitId: string, formData: FormData) {
  const supabase = createServerSupabase()
  const { error } = await supabase.from('kit_contents').delete().eq('id', contentId)
  
  if (error) {
      console.error(error)
      return { error: 'Failed to remove item' }
  }

  revalidatePath(`/kits/${kitId}`)
}

export async function updateKitItemQuantity(contentId: string, quantity: number) {
    const supabase = createServerSupabase()
    const { error } = await supabase.from('kit_contents').update({ quantity }).eq('id', contentId)
    
    if (error) {
        console.error(error)
        throw new Error('Failed to update quantity')
    }
    
    // We can't easily retrieve kitId here without fetching, but revalidating all kits paths might be excessive?
    // A better approach would be to pass kitId from the component.
    // For now, let's just assume we might need to refresh the page. 
    // BUT since we are in a server action called from a client component on a dynamic route, 
    // revalidatePath with 'page' type usually works if we knew the URL.
    // Without kitId, we can't be specific. Let's make the user pass kitId?
    // Or just revalidate everything under /kits which is acceptable for this scale.
    revalidatePath('/kits', 'layout')
}
