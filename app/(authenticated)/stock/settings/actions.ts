'use server'

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { getKitManager } from '@/lib/kit-bookings'
import { canDeleteCategory, parseCategoryForm } from './category-logic'

const NO_ACCESS = 'เฉพาะ admin และแผนกที่ดูแลอุปกรณ์เท่านั้นที่ตั้งค่าประเภทอุปกรณ์ได้'
const DUPLICATE = 'มีประเภทอุปกรณ์ชื่อนี้อยู่แล้ว'

export interface CategoryInput {
  name: string
  sales_pick: boolean
  /** แบบประกอบ — ข้อความ 1 บรรทัดต่อแบบ */
  variants: string
  is_active: boolean
}

type Result = { error: string } | { success: true }

function revalidateAll() {
  revalidatePath('/stock/settings')
  revalidatePath('/items')
  revalidatePath('/items/new')
}

export async function createCategory(input: CategoryInput): Promise<{ error: string } | { id: string }> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  const parsed = parseCategoryForm(input)
  if ('error' in parsed) return parsed

  const db = createServiceClient()
  // ต่อท้ายรายการ
  const { data: last } = await db.from('equipment_categories').select('sort_order').order('sort_order', { ascending: false }).limit(1)
  const sort_order = ((last?.[0]?.sort_order as number | undefined) ?? -1) + 1

  const { data, error } = await db
    .from('equipment_categories')
    .insert({ ...parsed, is_active: input.is_active !== false, sort_order })
    .select('id')
    .single<{ id: string }>()
  if (error || !data) {
    if (error?.code === '23505') return { error: DUPLICATE }
    console.error('createCategory', error)
    return { error: 'เพิ่มประเภทอุปกรณ์ไม่สำเร็จ' }
  }

  await logActivity('CREATE_EQUIPMENT_CATEGORY', { id: data.id, ...parsed, is_active: input.is_active !== false })
  revalidateAll()
  return { id: data.id }
}

export async function updateCategory(id: string, input: CategoryInput): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  const parsed = parseCategoryForm(input)
  if ('error' in parsed) return parsed

  const db = createServiceClient()
  const { data: old } = await db.from('equipment_categories').select('name, sales_pick, variants, is_active').eq('id', id).maybeSingle()
  if (!old) return { error: 'ไม่พบประเภทอุปกรณ์นี้' }

  const updates = { ...parsed, is_active: input.is_active !== false }
  const { error } = await db.from('equipment_categories').update(updates).eq('id', id)
  if (error) {
    if (error.code === '23505') return { error: DUPLICATE }
    console.error('updateCategory', error)
    return { error: 'บันทึกประเภทอุปกรณ์ไม่สำเร็จ' }
  }

  // ชื่อเปลี่ยน → ข้อความประเภทของอุปกรณ์ (items.category) ตามไปด้วย ให้โค้ดเดิมที่อ่านข้อความยังตรง
  if (old.name !== parsed.name) {
    const { error: syncError } = await db.from('items').update({ category: parsed.name }).eq('category_id', id)
    if (syncError) console.error('updateCategory sync items.category', syncError)
  }

  await logActivity('UPDATE_EQUIPMENT_CATEGORY', { id, from: old, to: updates })
  revalidateAll()
  return { success: true }
}

export async function deleteCategory(id: string): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  const db = createServiceClient()

  const { data: cat } = await db.from('equipment_categories').select('name').eq('id', id).maybeSingle()
  if (!cat) return { error: 'ไม่พบประเภทอุปกรณ์นี้' }

  const [items, kits] = await Promise.all([
    db.from('items').select('id', { count: 'exact', head: true }).eq('category_id', id),
    db.from('kits').select('id', { count: 'exact', head: true }).eq('category_id', id),
  ])
  if (items.error || kits.error) return { error: 'ตรวจของในประเภทไม่สำเร็จ ลองใหม่อีกครั้ง' }
  const allowed = canDeleteCategory({ items: items.count ?? 0, kits: kits.count ?? 0 })
  if ('error' in allowed) return allowed

  const { error } = await db.from('equipment_categories').delete().eq('id', id)
  if (error) {
    console.error('deleteCategory', error)
    return { error: 'ลบประเภทอุปกรณ์ไม่สำเร็จ' }
  }

  await logActivity('DELETE_EQUIPMENT_CATEGORY', { id, name: cat.name })
  revalidateAll()
  return { success: true }
}

/** เรียงใหม่ — ids = ลำดับใหม่ทั้งรายการ (sort_order = ตำแหน่ง) */
export async function reorderCategories(ids: string[]): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_ACCESS }
  if (!Array.isArray(ids) || ids.length === 0 || new Set(ids).size !== ids.length) return { error: 'ลำดับประเภทไม่ถูกต้อง' }

  const db = createServiceClient()
  const results = await Promise.all(ids.map((id, i) => db.from('equipment_categories').update({ sort_order: i }).eq('id', id)))
  if (results.some(r => r.error)) return { error: 'เรียงประเภทอุปกรณ์ไม่สำเร็จ' }

  await logActivity('REORDER_EQUIPMENT_CATEGORIES', { ids })
  revalidateAll()
  return { success: true }
}
