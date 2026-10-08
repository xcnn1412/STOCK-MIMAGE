import { supabaseServer as supabase } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import { loadCategories } from '../stock/categories'
import ItemsView from './items-view'

import type { Item } from '@/types'

export const revalidate = 3600 

export default async function ItemsPage() {
  const { data: items } = await supabase
    .from('items')
    .select(`
        *,
        shelves ( code ),
        kit_contents (
            id,
            quantity,
            kits (
                id,
                name,
                shelves ( code ),
                events (
                    id,
                    name
                )
            )
        )
    `)
    .order('name')

  // ตัวเลือกสำหรับแก้ด่วนในตาราง: ประเภท · กระเป๋า (ชื่อเรียงตามตัวอักษร) · สิทธิ์ย้ายของเข้า/ออกกระเป๋า
  const [categories, { data: kits }, manager] = await Promise.all([
    loadCategories(supabase),
    supabase.from('kits').select('id, name').order('name'),
    getKitManager(),
  ])

  return (
    <ItemsView items={(items || []) as Item[]} categories={categories} kits={kits || []} canManageKits={!!manager} />
  )
}
