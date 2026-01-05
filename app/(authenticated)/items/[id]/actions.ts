'use server'

import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'

function createServerSupabase() {
    return createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: { persistSession: false }
        }
    )
}

export async function updateItem(id: string, prevState: any, formData: FormData) {
  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const serial_number = formData.get('serial_number') as string
  const status = formData.get('status') as string
  const price = formData.get('price') as string
  const quantity = formData.get('quantity') as string
  
  // Existing images from hidden input or state management could be passed, 
  // but for simplicity we might just look at what's in the DB and append/replace?
  // Ideally, the client sends the 'current_images' (array of urls to keep).
  // Let's rely on a hidden input 'existing_images' which contains JSON of URLs to KEEP.
  const existingImagesJson = formData.get('existing_images') as string
  let finalImages: string[] = []
  
  try {
      finalImages = existingImagesJson ? JSON.parse(existingImagesJson) : []
  } catch (e) {
      console.error("Failed to parse existing images", e)
  }

  const newImages = formData.getAll('new_images') as File[]
  const validNewImages = newImages.filter(img => img.size > 0)

  // Validate total count
  if (finalImages.length + validNewImages.length > 4) {
      return { error: 'Maximum 4 images allowed.' }
  }

  const supabase = createServerSupabase()
  
  // Fetch current state for logging
  const { data: currentItem } = await supabase.from('items').select('*').eq('id', id).single()

  for (const image of validNewImages) {

    const filename = `${Date.now()}-${Math.random().toString(36).substring(7)}-${image.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
    
    const arrayBuffer = await image.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    
    const { error } = await supabase.storage.from('item-images').upload(filename, buffer, {
        contentType: image.type,
        upsert: true
    })
    
    if (error) {
       console.error("Upload failed", error)
       // We continue even if one fails, or return partial error? 
       // For now, simple logging.
    } else {
       const { data: publicUrlData } = supabase.storage.from('item-images').getPublicUrl(filename)
       finalImages.push(publicUrlData.publicUrl)
    }
  }

  const updates: any = {
    name,
    category,
    serial_number,
    status,
    price: price ? parseFloat(price) : null,
    quantity: quantity ? parseInt(quantity) : 1,
    image_url: finalImages.length > 0 ? JSON.stringify(finalImages) : null
  }

  const { error } = await supabase.from('items').update(updates).eq('id', id)

  if (error) {
     return { error: error.message }
  }

  const changes: any = {}
  if (currentItem) {
      Object.keys(updates).forEach(key => {
          if (JSON.stringify(updates[key]) !== JSON.stringify(currentItem[key])) {
              changes[key] = { from: currentItem[key], to: updates[key] }
          }
      })
  }

  await logActivity('UPDATE_ITEM', { 
      id,
      name: updates.name,
      changes
  }, undefined)

  revalidatePath('/items')
  
  const returnTo = formData.get('returnTo') as string
  if (returnTo) {
      revalidatePath(returnTo)
      redirect(returnTo)
  }
  
  redirect('/items')
}

export async function deleteItem(id: string) {
    const supabase = createServerSupabase()
    
    // Fetch item details before deletion for logging
    const { data: item } = await supabase.from('items').select('name, image_url').eq('id', id).single()

    // Delete images from storage. 
    if (item?.image_url) {
        let imageUrls: string[] = []
        try {
             if (item.image_url.startsWith('[')) {
                 imageUrls = JSON.parse(item.image_url)
             } else {
                 imageUrls = [item.image_url]
             }
        } catch (e) {
             console.error("Error parsing image_url for deletion", e)
        }

        if (imageUrls.length > 0) {
             const paths = imageUrls.map(url => {
                 const parts = url.split('/item-images/')
                 if (parts.length > 1) return parts[1]
                 return null
             }).filter(p => p !== null) as string[]
             
             if (paths.length > 0) {
                 const { error: storageError } = await supabase.storage.from('item-images').remove(paths)
                 if (storageError) {
                     console.error("Failed to delete images from storage", storageError)
                 }
             }
        }
    }
    

    // Clean up kit contents relationships
    const { error: kitRefError } = await supabase.from('kit_contents').delete().eq('item_id', id)
    if (kitRefError) {
        console.error("Failed to cleanup kit references", kitRefError)
        // We might want to stop here? Or try to proceed? 
        // If the FK is restrict, the next delete will fail anyway.
    }

    const { error } = await supabase.from('items').delete().eq('id', id)
    if (error) {
        throw new Error(error.message)
    }

    await logActivity('DELETE_ITEM', { 
        id, 
        name: item?.name || 'Unknown Item',
        images: item?.image_url
    }, undefined)
    revalidatePath('/items')
}
