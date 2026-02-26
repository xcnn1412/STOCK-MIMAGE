'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { cookies } from 'next/headers'
import type { ActionState, Database } from '@/types'


export async function createItem(prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const serial_number = formData.get('serial_number') as string
  const status = formData.get('status') as string
  const price = formData.get('price') as string
  const quantity = formData.get('quantity') as string
  
  // Handle multiple images
  const images = formData.getAll('images') as File[]
  const validImages = images.filter(img => img.size > 0).slice(0, 4) // Limit to 4

  const supabase = createServiceClient()
  const imageUrls: string[] = []
  let uploadErrors: string[] = []

  for (const image of validImages) {
      const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${image.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      
      const arrayBuffer = await image.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      const { error } = await supabase
        .storage
        .from('item-images')
        .upload(filename, buffer, {
          contentType: image.type,
          upsert: true
        })
      
      if (error) {
         console.error('Upload error', error)
         uploadErrors.push(error.message)
      } else {
         const { data: publicUrlData } = supabase.storage.from('item-images').getPublicUrl(filename)
         imageUrls.push(publicUrlData.publicUrl)
      }
  }

  if (uploadErrors.length > 0 && imageUrls.length === 0) {
      return { error: `Failed to upload images: ${uploadErrors.join(', ')}` }
  }

  // Store as JSON string if multiple, or null
  const image_url = imageUrls.length > 0 ? JSON.stringify(imageUrls) : null

// ... existing code ...

  const { data: newItem, error } = await supabase.from('items').insert({
    name,
    category,
    serial_number,
    description: (formData.get('description') as string) || null,
    status: status || 'available',
    price: price ? parseFloat(price) : null,
    quantity: quantity ? parseInt(quantity) : 1,
    image_url
  }).select().single()

  if (error) {
     console.error('Insert error', error)
     return { error: error.message }
  }

  await logActivity('CREATE_ITEM', { 
      name, 
      category, 
      serial_number, 
      quantity,
      image_url 
  }, undefined)

  revalidatePath('/items')
  redirect('/items')
}
