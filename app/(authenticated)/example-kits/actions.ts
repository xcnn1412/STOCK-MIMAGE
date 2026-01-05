'use server'

import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { persistSession: false } }
    )
}

export async function createTemplate(prevState: any, formData: FormData) {
  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const itemsString = formData.get('items') as string // Helper input, comma separated or similar? 
  // User asked for "add item names only". Let's handle dynamic inputs. 
  // We can get all input keys starting with 'item-'
  
  // Collect items and their quantities
  const itemsMap = new Map<string, { name: string, qty: number }>()

  for (const [key, value] of Array.from(formData.entries())) {
      if (key.startsWith('item-name-') && typeof value === 'string' && value.trim() !== '') {
          const id = key.replace('item-name-', '')
          const current = itemsMap.get(id) || { name: '', qty: 1 }
          current.name = value.trim()
          itemsMap.set(id, current)
      } else if (key.startsWith('item-qty-') && value) {
          const id = key.replace('item-qty-', '')
          const current = itemsMap.get(id) || { name: '', qty: 1 }
          current.qty = parseInt(value.toString()) || 1
          itemsMap.set(id, current)
      }
  }

  const items = Array.from(itemsMap.values()).filter(i => i.name !== '')

  const supabase = createServerSupabase()

  // Transaction-like insert
  const { data: template, error } = await supabase.from('kit_templates').insert({
    name,
    description
  }).select().single()

  if (error) {
     return { error: error.message }
  }

  if (items.length > 0) {
      const contents = items.map(item => ({
          template_id: template.id,
          item_name: item.name,
          quantity: item.qty
      }))
      
      const { error: contentError } = await supabase.from('kit_template_contents').insert(contents)
      if (contentError) {
          // Cleanup? Or just report error?
          console.error(contentError)
      }
  }

  revalidatePath('/example-kits')
  redirect('/example-kits')
}

export async function deleteTemplate(id: string) {
    const supabase = createServerSupabase()
    await supabase.from('kit_templates').delete().eq('id', id)
    revalidatePath('/example-kits')
}
