'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { getKitManager, itemsOutInKit } from '@/lib/kit-bookings'
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
     return { error: error.message }
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
    
    // Fetch details before delete
    const { data: kit } = await supabase.from('kits').select('name').eq('id', id).single()

    const { error } = await supabase.from('kits').delete().eq('id', id)
    
 if (error) return { error: error.message }
    
    await logActivity('DELETE_KIT', { 
        name: kit?.name || 'Unknown Kit',
        id 
    }, undefined)
    
    revalidatePath('/kits')
    return {}
}
