'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { getKitManager, itemsOutInKit } from '@/lib/kit-bookings'
import { MAX_QTY, onShelf, parseQty } from '@/app/(authenticated)/shelves/consumable-logic'



export async function addItemToKit(kitId: string, itemId: string, quantity: number = 1) {
  if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

  const supabase = createServiceClient()

  const out = await itemsOutInKit(supabase, kitId)
  if (out.length > 0) return { error: `กระเป๋านี้ยังออกงานอยู่ (${out.join(', ')}) — รับคืนหรือปิดงานก่อนจึงแก้ของในกระเป๋าได้` }
  
  // Fetch details for logging
  const [ { data: kit }, { data: item }, { data: assignments } ] = await Promise.all([
      supabase.from('kits').select('name').eq('id', kitId).single(),
      supabase.from('items').select('name, is_consumable, unit, quantity').eq('id', itemId).single(),
      supabase.from('kit_contents').select('kit_id, quantity, kits(name)').eq('item_id', itemId)
  ])

  let warning: string | undefined
  if (item?.is_consumable) {
      // วัสดุสิ้นเปลือง: อยู่ได้หลายกระเป๋า แต่ใบเดียวกันซ้ำไม่ได้ · ไม่ล้างชั้น (ชั้น = ที่เก็บของที่เหลือ)
      if ((assignments || []).some(a => a.kit_id === kitId)) {
          return { error: `${item.name} อยู่ในกระเป๋านี้แล้ว — แก้จำนวนในรายการแทน` }
      }
      const qty = parseQty(quantity)
      if (qty == null) return { error: `จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_QTY.toLocaleString()}` }
      quantity = qty
      const inKits = (assignments || []).reduce((sum, a) => sum + (a.quantity || 0), 0)
      const left = onShelf(item.quantity ?? 0, inKits)
      if (quantity > left) {
          warning = `เพิ่มแล้ว แต่บนชั้นเหลือ ${left} ${item.unit || ''} ไม่พอ ${quantity} — กระเป๋าจะขาดจนกว่าจะเติมของ`.replace(/\s+/g, ' ')
      }
  } else {
      const existingAssignment = assignments?.[0]
      // Check if item is already in a kit
      if (existingAssignment) {
          const assignedKitName = (existingAssignment.kits as any)?.name || 'another kit'
          return { error: `Item is already in ${assignedKitName}` }
      }
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

  // อุปกรณ์ในกระเป๋าอยู่ตามกระเป๋า — ไม่มีชั้นของตัวเอง (ยกเว้นวัสดุสิ้นเปลือง)
  if (!item?.is_consumable) await supabase.from('items').update({ shelf_id: null }).eq('id', itemId)

  await logActivity('ADD_KIT_ITEM', { 
      kitName: kit?.name || 'Unknown Kit', 
      itemName: item?.name || 'Unknown Item',
      quantity,
      kitId, 
      itemId 
  }, undefined)

  revalidatePath(`/kits/${kitId}`)
  if (warning) return { warning }
}

export async function removeItemFromKit(contentId: string, kitId: string) {
  if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

  const supabase = createServiceClient()

  const out = await itemsOutInKit(supabase, kitId)
  if (out.length > 0) return { error: `กระเป๋านี้ยังออกงานอยู่ (${out.join(', ')}) — รับคืนหรือปิดงานก่อนจึงแก้ของในกระเป๋าได้` }
  
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
    if (!(await getKitManager())) throw new Error('เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น')

    const supabase = createServiceClient()

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

export async function updateKitDetails(kitId: string, name: string, description: string) {
  if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

  const supabase = createServiceClient()
  
  // Fetch old details for logging
  const { data: oldKit } = await supabase.from('kits').select('name, description').eq('id', kitId).single()

  const { error } = await supabase.from('kits').update({ 
    name, 
    description 
  }).eq('id', kitId)

  if (error) {
    console.error(error)
    return { error: 'Failed to update kit details' }
  }

  await logActivity('UPDATE_KIT', { 
      kitId,
      oldName: oldKit?.name,
      newName: name,
      oldDescription: oldKit?.description,
      newDescription: description,
      action: 'UPDATE_DETAILS'
  }, undefined)

  revalidatePath(`/kits/${kitId}`)
  revalidatePath('/kits') 
}

