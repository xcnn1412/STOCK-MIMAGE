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
  
  const items: string[] = []
  for (const [key, value] of Array.from(formData.entries())) {
      if (key.startsWith('item-') && typeof value === 'string' && value.trim() !== '') {
          items.push(value.trim())
      }
  }

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
      const contents = items.map(itemName => ({
          template_id: template.id,
          item_name: itemName
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
