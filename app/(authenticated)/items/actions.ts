'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { requireAuth } from '@/lib/auth'
import { getKitManager } from '@/lib/kit-bookings'
import { moveStock } from '@/lib/stock'
import { parseConsumableFields } from '@/app/(authenticated)/shelves/consumable-logic'
import type { ActionState, Database } from '@/types'


export async function createItem(prevState: ActionState, formData: FormData) {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const name = formData.get('name') as string
  const category = formData.get('category') as string
  const serial_number = formData.get('serial_number') as string
  const status = formData.get('status') as string
  const price = formData.get('price') as string
  const quantity = formData.get('quantity') as string

  // วัสดุสิ้นเปลือง: เฉพาะผู้ดูแลกระเป๋า · ยอดตั้งต้นเข้าผ่าน moveStock (แทรก quantity 0 ก่อน)
  const isConsumable = formData.get('is_consumable') === 'on'
  let consumable: { unit: string | null; min_quantity: number | null; initial: number } | null = null
  if (isConsumable) {
    if (!(await getKitManager())) return { error: 'วัสดุสิ้นเปลืองสร้างได้เฉพาะ admin และแผนกที่ดูแลกระเป๋า' }
    const parsed = parseConsumableFields(formData, true)
    if ('error' in parsed) return parsed
    consumable = parsed
  }

  // Handle multiple images
  const images = formData.getAll('images') as File[]
  const validImages = images.filter(img => img.size > 0).slice(0, 4) // Limit to 4

  const supabase = createServiceClient()
  const imageUrls: string[] = []
  const uploadErrors: string[] = []

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

  const { data: newItem, error } = await supabase.from('items').insert(consumable ? {
    name,
    category,
    serial_number: serial_number || null,
    description: (formData.get('description') as string) || null,
    status: 'available',
    price: price ? parseFloat(price) : null,
    quantity: 0,
    image_url,
    is_consumable: true,
    unit: consumable.unit,
    min_quantity: consumable.min_quantity,
  } : {
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

  if (consumable && consumable.initial > 0) {
    const moved = await moveStock(supabase, {
      itemId: newItem.id,
      delta: consumable.initial,
      reason: 'restock',
      note: 'ยอดตั้งต้น',
      userId,
    })
    if ('error' in moved) {
      revalidatePath('/items')
      return { error: `สร้างรายการแล้ว แต่บันทึกยอดตั้งต้นไม่สำเร็จ (${moved.error}) — เติมยอดที่หน้าชั้นอีกครั้ง` }
    }
  }

  await logActivity('CREATE_ITEM', {
      name,
      category,
      serial_number,
      quantity,
      image_url,
      ...(consumable ? { is_consumable: true, unit: consumable.unit, min_quantity: consumable.min_quantity } : {})
  }, undefined)

  revalidatePath('/items')
  redirect('/items')
}
