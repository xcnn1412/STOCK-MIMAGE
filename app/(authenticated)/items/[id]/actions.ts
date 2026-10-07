'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { requireAuth } from '@/lib/auth'
import { getKitManager } from '@/lib/kit-bookings'
import { moveStock } from '@/lib/stock'
import { parseConsumableFields } from '@/app/(authenticated)/shelves/consumable-logic'
import { resolveCategory } from '@/app/(authenticated)/stock/categories'
import type { ActionState } from '@/types'


export async function updateItem(id: string, prevState: ActionState, formData: FormData) {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) {
      return { error: 'Unauthorized: No active session found' }
  }

  const name = formData.get('name') as string
  const serial_number = formData.get('serial_number') as string
  const status = formData.get('status') as string
  const price = formData.get('price') as string
  const quantity = formData.get('quantity') as string
  const description = formData.get('description') as string
  
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

  const supabase = createServiceClient()
  const cat = await resolveCategory(supabase, formData.get('category_id'))
  if ('error' in cat) return cat
  const { category_id, category } = cat

  // Fetch current state for logging (+ กติกาวัสดุสิ้นเปลือง)
  const { data: currentItem } = await supabase.from('items').select('*').eq('id', id).single()

  // วัสดุสิ้นเปลือง: แก้/แปลงได้เฉพาะผู้ดูแลกระเป๋า · ยอดและสถานะไม่แก้ผ่านฟอร์มนี้ (เปลี่ยนผ่าน moveStock)
  const wantConsumable = formData.get('is_consumable') === 'on'
  const wasConsumable = !!currentItem?.is_consumable
  let consumable: { unit: string | null; min_quantity: number | null } | null = null
  if (wantConsumable || wasConsumable) {
      if (!(await getKitManager())) {
          return { error: 'วัสดุสิ้นเปลืองแก้ได้เฉพาะ admin และแผนกที่ดูแลกระเป๋า' }
      }
      if (wantConsumable) {
          const parsed = parseConsumableFields(formData, false)
          if ('error' in parsed) return parsed
          consumable = { unit: parsed.unit, min_quantity: parsed.min_quantity }
      }
      if (wantConsumable && !wasConsumable && currentItem?.status === 'in_use') {
          return { error: 'อุปกรณ์นี้ออกงานอยู่ — รับคืนก่อนจึงเปลี่ยนเป็นวัสดุสิ้นเปลืองได้' }
      }
      if (!wantConsumable && wasConsumable) {
          const { data: inKits } = await supabase.from('kit_contents').select('id').eq('item_id', id).limit(1)
          if (inKits && inKits.length > 0) {
              return { error: 'วัสดุสิ้นเปลืองนี้ยังอยู่ในกระเป๋า — นำออกจากทุกกระเป๋าก่อนจึงเปลี่ยนเป็นอุปกรณ์ปกติได้' }
          }
      }
  }

  // Validate 'in_use' status - item must be in a kit assigned to an event
  if (status === 'in_use' && !wantConsumable) {
      const { data: kitAssignment } = await supabase
          .from('kit_contents')
          .select(`
              kit_id,
              kits(event_id, name)
          `)
          .eq('item_id', id)
          .not('kits.event_id', 'is', null)
          .maybeSingle()
      
      if (!kitAssignment) {
          return { 
              error: 'ไม่สามารถตั้งสถานะเป็น "กำลังใช้งาน" ได้ - อุปกรณ์นี้ไม่ได้อยู่ใน Event ที่กำลังดำเนินการ' 
          }
      }
  }

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

  const updates: Record<string, string | number | boolean | null> = consumable ? {
    // วัสดุสิ้นเปลือง: ไม่ส่ง quantity/status/serial — แปลงจากอุปกรณ์ปกติ = ตั้ง 0 แล้วบันทึกยอดเดิมผ่าน moveStock ด้านล่าง
    name,
    category,
    category_id,
    description: description || null,
    price: price ? parseFloat(price) : null,
    image_url: finalImages.length > 0 ? JSON.stringify(finalImages) : null,
    is_consumable: true,
    unit: consumable.unit,
    min_quantity: consumable.min_quantity,
    ...(wasConsumable ? {} : { quantity: 0 }),
  } : {
    name,
    category,
    category_id,
    serial_number,
    status,
    description: description || null,
    price: price ? parseFloat(price) : null,
    // สิ้นเปลือง → ปกติ: ฟอร์มไม่ส่งจำนวนมา = คงยอดเดิม (ไม่รีเซ็ตเป็น 1)
    quantity: quantity ? parseInt(quantity) : wasConsumable ? Number(currentItem?.quantity) || 0 : 1,
    image_url: finalImages.length > 0 ? JSON.stringify(finalImages) : null,
    ...(wasConsumable ? { is_consumable: false, status: status || 'available' } : {}),
  }

  const { error } = await supabase.from('items').update(updates).eq('id', id)

  if (error) {
     return { error: error.message }
  }

  // ปกติ → สิ้นเปลือง: ยอดเดิมกลายเป็นยอดตั้งต้น (มีประวัติ)
  const startQty = Number(currentItem?.quantity) || 0
  if (consumable && !wasConsumable && startQty > 0) {
      const moved = await moveStock(supabase, { itemId: id, delta: startQty, reason: 'adjust', note: 'ยอดตั้งต้น', userId })
      if ('error' in moved) {
          revalidatePath('/items')
          return { error: `เปลี่ยนเป็นวัสดุสิ้นเปลืองแล้ว แต่บันทึกยอดตั้งต้น ${startQty} ไม่สำเร็จ (${moved.error}) — ปรับยอดที่หน้าชั้นอีกครั้ง` }
      }
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {}
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
    const session = await requireAuth()
    const userId = session?.userId
    if (!userId) {
        throw new Error('Unauthorized: No active session found')
    }

    const supabase = createServiceClient()
    
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
