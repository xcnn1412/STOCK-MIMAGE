import type { createServiceClient } from '@/lib/supabase-server'
import { sortCategories } from './settings/category-logic'

type Db = ReturnType<typeof createServiceClient>

/** ประเภทอุปกรณ์หนึ่งแถว (ตาราง equipment_categories — ยังไม่อยู่ใน database.types.ts) */
export interface EquipmentCategory {
  id: string
  name: string
  sort_order: number
  is_active: boolean
  /** ทีมขายเลือกชิ้นเอง (ประเภทตู้) */
  sales_pick: boolean
  /** แบบประกอบ — ว่าง = ไม่มีแบบ */
  variants: string[]
}

export const CATEGORY_COLUMNS = 'id, name, sort_order, is_active, sales_pick, variants'

/**
 * โหลดประเภทอุปกรณ์ เรียงตาม sort_order แล้วชื่อ · ค่าเริ่มต้น = เฉพาะที่เปิดใช้
 * ponytail: ไม่วน readAllRows — ประเภทมีหลักสิบ ไม่ถึงเพดาน 1,000 แถว
 */
export async function loadCategories(db: Db, opts: { includeInactive?: boolean } = {}): Promise<EquipmentCategory[]> {
  let query = db.from('equipment_categories').select(CATEGORY_COLUMNS)
  if (!opts.includeInactive) query = query.eq('is_active', true)
  const { data } = await query.overrideTypes<EquipmentCategory[], { merge: false }>()
  return sortCategories((data ?? []).map(c => ({ ...c, variants: c.variants ?? [] })))
}

/**
 * ประเภทอุปกรณ์จากฟอร์ม (field category_id) → { category_id, category } ที่จะเขียนคู่กัน
 * ค่าว่าง = ไม่ระบุทั้งคู่ · id ที่ไม่มีในตาราง = error
 *
 * items.category (text) เป็นค่า derived จาก category_id → equipment_categories.name — เขียนได้สองทางเท่านั้น:
 * ฟังก์ชันนี้ (ตอนสร้าง/แก้อุปกรณ์ใน items/actions, items/[id]/actions) และ stock/settings/actions.ts::updateCategory
 * (เปลี่ยนชื่อประเภทแล้ว sync ข้อความตาม) · ห้ามเขียนชื่อประเภทตรงๆ หรือ hardcode รายชื่อประเภทในโค้ด
 */
export async function resolveCategory(db: Db, raw: FormDataEntryValue | null): Promise<{ category_id: string | null; category: string | null } | { error: string }> {
  const id = typeof raw === 'string' ? raw.trim() : ''
  if (!id) return { category_id: null, category: null }
  const { data } = await db.from('equipment_categories').select('id, name').eq('id', id).maybeSingle<{ id: string; name: string }>()
  if (!data) return { error: 'ไม่พบประเภทอุปกรณ์ที่เลือก — โหลดหน้าใหม่แล้วเลือกอีกครั้ง' }
  return { category_id: data.id, category: data.name }
}
