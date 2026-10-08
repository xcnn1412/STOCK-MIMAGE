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
import { addItemToKit, removeItemFromKit } from '@/app/(authenticated)/kits/[id]/actions'
import { QUICK_STATUSES } from './quick-statuses'
import type { ActionState } from '@/types'


export async function createItem(prevState: ActionState, formData: FormData) {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) {
      return { error: 'Unauthorized: No active session' }
  }

  const name = formData.get('name') as string
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
  const cat = await resolveCategory(supabase, formData.get('category_id'))
  if ('error' in cat) return cat
  const { category_id, category } = cat

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
    category_id,
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
    category_id,
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
      category_id,
      serial_number,
      quantity,
      image_url,
      ...(consumable ? { is_consumable: true, unit: consumable.unit, min_quantity: consumable.min_quantity } : {})
  }, undefined)

  revalidatePath('/items')
  redirect('/items')
}

/**
 * แก้ด่วนจากตาราง /items ทีละช่อง: ประเภท · สถานะ · กระเป๋า (ส่งมาเฉพาะช่องที่เปลี่ยน)
 * กระเป๋า = ย้ายผ่าน addItemToKit/removeItemFromKit ของหน้ากระเป๋า (สิทธิ์ + กติกาออกงานอยู่ที่นั่น)
 * วัสดุสิ้นเปลืองแก้ได้เฉพาะประเภท (ยอด/สถานะ/กระเป๋าหลายใบจัดการที่หน้าชั้นและหน้ากระเป๋า)
 */
export async function quickUpdateItem(
  itemId: string,
  patch: { category_id?: string | null; status?: string; kit_id?: string | null },
): Promise<{ error?: string; warning?: string }> {
  const session = await requireAuth()
  if (!session?.userId) return { error: 'Unauthorized: No active session' }

  const supabase = createServiceClient()
  const { data: item } = await supabase
    .from('items')
    .select('id, name, status, category, is_consumable, kit_contents(id, kit_id)')
    .eq('id', itemId)
    .maybeSingle<{ id: string; name: string; status: string | null; category: string | null; is_consumable: boolean | null; kit_contents: { id: string; kit_id: string }[] }>()
  if (!item) return { error: 'ไม่พบอุปกรณ์ — โหลดหน้าใหม่แล้วลองอีกครั้ง' }

  if ('category_id' in patch) {
    const cat = await resolveCategory(supabase, patch.category_id ?? '')
    if ('error' in cat) return cat
    const { error } = await supabase.from('items').update(cat).eq('id', itemId)
    if (error) return { error: 'บันทึกประเภทไม่สำเร็จ' }
    await logActivity('UPDATE_ITEM', { itemId, name: item.name, field: 'category', from: item.category, to: cat.category })
  }

  if (patch.status !== undefined) {
    if (item.is_consumable) return { error: 'วัสดุสิ้นเปลืองไม่มีสถานะ — ดูระดับสต็อกที่หน้าชั้น' }
    if (!(QUICK_STATUSES as readonly string[]).includes(patch.status)) return { error: 'สถานะนี้ตั้งเองไม่ได้ — "กำลังใช้งาน" เปลี่ยนตามการหยิบ/คืนของ' }
    const { error } = await supabase.from('items').update({ status: patch.status }).eq('id', itemId)
    if (error) return { error: 'บันทึกสถานะไม่สำเร็จ' }
    await logActivity('UPDATE_ITEM', { itemId, name: item.name, field: 'status', from: item.status, to: patch.status })
  }

  let warning: string | undefined
  if ('kit_id' in patch) {
    if (item.is_consumable) return { error: 'วัสดุสิ้นเปลืองอยู่ได้หลายกระเป๋า — จัดการที่หน้ากระเป๋า' }
    const current = item.kit_contents[0]
    const next = patch.kit_id || null
    if (current?.kit_id !== next) {
      if (current) {
        const removed = await removeItemFromKit(current.id, current.kit_id)
        if (removed?.error) return removed
      }
      if (next) {
        const added = await addItemToKit(next, itemId, 1)
        if (added?.error) return added
        warning = added?.warning
      }
    }
  }

  revalidatePath('/items')
  return warning ? { warning } : {}
}
