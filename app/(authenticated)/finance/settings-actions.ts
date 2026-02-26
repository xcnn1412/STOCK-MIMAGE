'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  return { userId, role }
}

// ============================================================================
// Types
// ============================================================================

export interface FinanceCategory {
  id: string
  value: string
  label: string
  label_th: string
  icon: string
  color: string
  sort_order: number
  is_active: boolean
  detail_source: string // 'none' | 'custom' | 'staff'
}

export interface CategoryItem {
  id: string
  category_id: string
  label: string
  is_active: boolean
  sort_order: number
}

export interface StaffProfile {
  id: string
  full_name: string
  role: string | null
}

// ============================================================================
// Categories — CRUD
// ============================================================================

export async function getFinanceCategories(activeOnly = true): Promise<FinanceCategory[]> {
  const supabase = createServiceClient()
  let query = supabase
    .from('finance_categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (activeOnly) query = query.eq('is_active', true)

  const { data } = await query
  return (data || []) as FinanceCategory[]
}

export async function createCategory(data: {
  value: string; label: string; label_th: string; color: string; detail_source?: string
}) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: maxRow } = await supabase
    .from('finance_categories')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('finance_categories')
    .insert({
      value: data.value, label: data.label, label_th: data.label_th,
      color: data.color, detail_source: data.detail_source || 'none',
      sort_order: (maxRow?.sort_order || 0) + 1,
    })

  if (error) {
    if (error.code === '23505') return { error: 'ค่า key ซ้ำ' }
    return { error: 'เกิดข้อผิดพลาด' }
  }

  revalidatePath('/finance/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

export async function updateCategory(id: string, data: {
  label?: string; label_th?: string; color?: string;
  is_active?: boolean; detail_source?: string
}) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_categories').update(data).eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidatePath('/finance/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

export async function deleteCategory(id: string) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_categories').delete().eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด (อาจมีข้อมูลอ้างอิงอยู่)' }

  revalidatePath('/finance/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Category Items — รายการย่อยของแต่ละหมวด (ใช้เป็น dropdown เมื่อ detail_source=custom)
// ============================================================================

export async function getAllCategoryItems(): Promise<CategoryItem[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('finance_category_items')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (data || []) as CategoryItem[]
}

export async function createCategoryItem(data: { category_id: string; label: string }) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()

  const { data: maxRow } = await supabase
    .from('finance_category_items')
    .select('sort_order')
    .eq('category_id', data.category_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('finance_category_items')
    .insert({ ...data, sort_order: (maxRow?.sort_order || 0) + 1 })

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidatePath('/finance/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

export async function updateCategoryItem(id: string, data: { label?: string; is_active?: boolean }) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_category_items').update(data).eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidatePath('/finance/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

export async function deleteCategoryItem(id: string) {
  const { role } = await getSession()
  if (role !== 'admin') return { error: 'Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_category_items').delete().eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidatePath('/finance/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Staff Profiles — ดึงจาก profiles (read-only)
// ============================================================================

export async function getStaffProfiles(): Promise<StaffProfile[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name', { ascending: true })

  return (data || []) as StaffProfile[]
}
