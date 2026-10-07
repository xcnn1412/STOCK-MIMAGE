'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { getKitManager, itemsOutInKit } from '@/lib/kit-bookings'
import { MAX_QTY, onShelf, parseQty, shortage } from '@/app/(authenticated)/shelves/consumable-logic'



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
          .overrideTypes<{ kit_id: string; quantity: number; kits: { name: string } | null }[], { merge: false }>()
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
          const assignedKitName = existingAssignment.kits?.name || 'กระเป๋าใบอื่น'
          return { error: `อุปกรณ์นี้อยู่ใน${assignedKitName}แล้ว — เอาออกจากใบนั้นก่อน` }
      }
  }

  const { error } = await supabase.from('kit_contents').insert({
    kit_id: kitId,
    item_id: itemId,
    quantity
  })

  if (error) {
    console.error(error)
    return { error: 'เพิ่มของเข้ากระเป๋าไม่สำเร็จ' }
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
    .overrideTypes<{ quantity: number; kits: { name: string } | null; items: { name: string } | null }, { merge: false }>()

  const { error } = await supabase.from('kit_contents').delete().eq('id', contentId)
  
  if (error) {
      console.error(error)
      return { error: 'เอาของออกจากกระเป๋าไม่สำเร็จ' }
  }

  // safely cast nested relations
  const kitName = content?.kits?.name || 'Unknown Kit'
  const itemName = content?.items?.name || 'Unknown Item'

  await logActivity('REMOVE_KIT_ITEM', { 
      kitName, 
      itemName,
      contentId,
      kitId
  }, undefined)

  revalidatePath(`/kits/${kitId}`)
}

export async function updateKitItemQuantity(
    contentId: string,
    quantity: number
): Promise<{ error: string } | { success: true; warning?: string }> {
    if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

    const supabase = createServiceClient()

    // Fetch details before update
    const { data } = await supabase.from('kit_contents')
        .select('kit_id, item_id, quantity, items(name, is_consumable, quantity, unit), kits(name)')
        .eq('id', contentId)
        .maybeSingle()
    const content = data as unknown as {
        kit_id: string
        item_id: string
        quantity: number | null
        items: { name: string; is_consumable: boolean | null; quantity: number | null; unit: string | null } | null
        kits: { name: string } | null
    } | null
    if (!content) return { error: 'ไม่พบรายการนี้ในกระเป๋า — รีเฟรชหน้าแล้วลองใหม่' }

    const out = await itemsOutInKit(supabase, content.kit_id)
    if (out.length > 0) return { error: `กระเป๋านี้ยังออกงานอยู่ (${out.join(', ')}) — รับคืนหรือปิดงานก่อนจึงแก้ของในกระเป๋าได้` }

    const qty = parseQty(quantity)
    if (qty == null) return { error: `จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_QTY.toLocaleString()}` }

    const { error } = await supabase.from('kit_contents').update({ quantity: qty }).eq('id', contentId)

    if (error) {
        console.error(error)
        return { error: 'บันทึกจำนวนไม่สำเร็จ' }
    }

    const item = content.items
    await logActivity('UPDATE_KIT_ITEM', {
        kitName: content.kits?.name || 'Unknown Kit',
        itemName: item?.name || 'Unknown Item',
        oldQuantity: content.quantity,
        newQuantity: qty,
        contentId
    }, undefined)

    revalidatePath('/kits', 'layout')

    // วัสดุสิ้นเปลือง: ผลรวมจำนวนประจำกระเป๋าทุกใบเกินยอดคงเหลือ = บันทึกได้ แต่เตือนว่ากระเป๋าจะขาด
    if (item?.is_consumable) {
        const { data: rows } = await supabase.from('kit_contents').select('quantity').eq('item_id', content.item_id)
        const inKits = (rows || []).reduce((sum, r) => sum + (r.quantity || 0), 0)
        const total = item.quantity ?? 0
        if (shortage(total, inKits) > 0) {
            return {
                success: true,
                warning: `บันทึกแล้ว แต่${item.name}ในกระเป๋าทุกใบรวม ${inKits} ${item.unit || ''} มากกว่ายอดคงเหลือ ${total} — กระเป๋าจะขาดจนกว่าจะเติมของ`.replace(/\s+/g, ' '),
            }
        }
    }
    return { success: true }
}

export async function updateKitDetails(kitId: string, name: string, description: string, categoryId: string | null = null) {
  if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

  const supabase = createServiceClient()

  // ประเภทอุปกรณ์ของกระเป๋า — ต้องมีอยู่จริงเมื่อไม่ใช่ "ไม่ระบุ"
  if (categoryId) {
    const { data: cat } = await supabase.from('equipment_categories').select('id').eq('id', categoryId).maybeSingle()
    if (!cat) return { error: 'ไม่พบประเภทอุปกรณ์ที่เลือก — โหลดหน้าใหม่แล้วเลือกอีกครั้ง' }
  }
  
  // Fetch old details for logging
  const { data: oldKit } = await supabase.from('kits').select('name, description, category_id').eq('id', kitId).single()

  const { error } = await supabase.from('kits').update({ 
    name, 
    description,
    category_id: categoryId || null,
  }).eq('id', kitId)

  if (error) {
    console.error(error)
    return { error: 'บันทึกชื่อ/รายละเอียดกระเป๋าไม่สำเร็จ' }
  }

  await logActivity('UPDATE_KIT', { 
      kitId,
      oldName: oldKit?.name,
      newName: name,
      oldDescription: oldKit?.description,
      newDescription: description,
      oldCategoryId: oldKit?.category_id ?? null,
      newCategoryId: categoryId || null,
      action: 'UPDATE_DETAILS'
  }, undefined)

  revalidatePath(`/kits/${kitId}`)
  revalidatePath('/kits') 
}

