import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import { readAllRows } from '@/lib/read-all-rows'
import { loadCategories } from '../categories'
import SettingsView, { type CategoryCounts } from './settings-view'

export const revalidate = 0

/** ตั้งค่าคลัง — admin และแผนกที่ดูแลอุปกรณ์เท่านั้น */
export default async function StockSettingsPage() {
  if (!(await getKitManager())) redirect('/stock/dashboard')

  const db = createServiceClient()
  const ownedBy = (table: 'items' | 'kits') =>
    readAllRows<{ category_id: string }>((from, to) =>
      db.from(table).select('category_id').not('category_id', 'is', null).order('created_at').order('id').range(from, to),
    )
  const [categories, items, kits] = await Promise.all([loadCategories(db, { includeInactive: true }), ownedBy('items'), ownedBy('kits')])

  // นับในหน่วยความจำ — อ่านครั้งเดียวต่อตาราง ไม่ query ต่อประเภท
  const counts: Record<string, CategoryCounts> = {}
  for (const c of categories) counts[c.id] = { items: 0, kits: 0 }
  for (const r of items.rows) if (counts[r.category_id]) counts[r.category_id].items++
  for (const r of kits.rows) if (counts[r.category_id]) counts[r.category_id].kits++

  return <SettingsView categories={categories} counts={counts} />
}
