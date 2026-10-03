'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { getKitManager, itemsOutInKit, loadBookingsForKits } from '@/lib/kit-bookings'
import type { ActionState, Database } from '@/types'


export async function createKit(prevState: ActionState, formData: FormData) {
  if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

  const name = formData.get('name') as string
  const description = formData.get('description') as string

  const supabase = createServiceClient()
  const { data: newKit, error } = await supabase.from('kits').insert({
    name,
    description
  }).select().single()

  if (error) {
     console.error(error)
     return { error: 'สร้างกระเป๋าไม่สำเร็จ' }
  }

  await logActivity('CREATE_KIT', { name, description }, undefined, undefined)

  revalidatePath('/kits')
  redirect('/kits')
}

export async function deleteKit(id: string): Promise<{ error?: string }> {
    if (!(await getKitManager())) return { error: 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น' }

    const supabase = createServiceClient()

    // กระเป๋าที่ยังออกงานอยู่ลบไม่ได้ — อุปกรณ์จะค้างสถานะ "กำลังใช้งาน"
    const out = await itemsOutInKit(supabase, id)
    if (out.length > 0) return { error: `กระเป๋านี้ยังออกงานอยู่ (${out.join(', ')}) — รับคืนหรือปิดงานก่อน` }
    
    // จองให้งานที่ยังไม่ปิดอยู่ = ลบไม่ได้ (ไม่งั้นการจองหายไปเงียบๆ)
    const open = (await loadBookingsForKits(supabase, [id])).filter(b => !b.closed)
    if (open.length > 0) {
        const names = [...new Set(open.map(b => b.eventName))].join(', ')
        return { error: `กระเป๋านี้ยังถูกจองให้งาน ${names} — ยกเลิกการจองก่อนจึงลบได้` }
    }

    // Fetch details before delete
    const { data: kit } = await supabase.from('kits').select('name').eq('id', id).single()

    // ลบรายการของในกระเป๋าก่อน (ตัวอุปกรณ์ไม่ถูกลบ) — ไม่พึ่งกติกา FK ของ kit_contents
    const { data: removed, error: contentsError } = await supabase.from('kit_contents').delete().eq('kit_id', id).select('id')
    if (contentsError) {
        console.error(contentsError)
        return { error: 'ลบกระเป๋าไม่สำเร็จ' }
    }

    const { error } = await supabase.from('kits').delete().eq('id', id)
    if (error) {
        console.error(error)
        return { error: 'ลบกระเป๋าไม่สำเร็จ' }
    }

    await logActivity('DELETE_KIT', {
        name: kit?.name || 'Unknown Kit',
        id,
        removedItems: removed?.length ?? 0
    }, undefined)
    
    revalidatePath('/kits')
    return {}
}
