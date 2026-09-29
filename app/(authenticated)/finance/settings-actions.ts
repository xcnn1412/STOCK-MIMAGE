'use server'

// ไฟล์ 'use server' — ทุก export เป็น endpoint ที่ใครก็เรียกได้จากเบราว์เซอร์ ต้องตรวจตัวตนและค่าที่รับเอง
// บทบาทมาจาก getFinanceViewer() (token ที่เซ็น + บทบาทในฐานข้อมูล) ห้ามอ่านบทบาทจาก cookie แบบเก่าที่ไม่ได้เซ็น

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { getFinanceViewer } from './viewer'

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
  nickname: string | null
  role: string | null
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
}

export interface StaffBankDetails {
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
}

// ============================================================================
// ตรวจค่าที่รับ — รับเฉพาะคอลัมน์ที่รู้จัก ชนิดถูก (กันส่ง id / created_at / คอลัมน์อื่นเข้ามาเขียนทับ)
// ============================================================================

const ADMIN_ONLY = 'เฉพาะแอดมินเท่านั้น'
const INVALID = 'ข้อมูลไม่ถูกต้อง'
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i
// 'vehicle' เป็นค่าเก่าที่ยังมีในฐานข้อมูล — แก้หมวดเดิมแล้วต้องไม่ error
const DETAIL_SOURCES = new Set(['none', 'custom', 'staff', 'vehicle'])
const MAX_REORDER = 500

type Invalid = typeof INVALID
type Patch = Record<string, string | boolean>

const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID_RE.test(v)
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

/** สตริงที่ตัดช่องว่างหัวท้ายแล้วยาว 1..max ตัว · ผิด = INVALID */
function text(v: unknown, max: number): string | Invalid {
  if (typeof v !== 'string') return INVALID
  const s = v.trim()
  return s.length >= 1 && s.length <= max ? s : INVALID
}

/**
 * คัดเฉพาะคอลัมน์ที่อนุญาตจาก data — คีย์อื่นทิ้ง · คีย์ที่อนุญาตแต่ค่าผิดชนิด = INVALID ทั้งก้อน
 * rules: คอลัมน์ → ตัวแปลงค่า (คืน INVALID เมื่อผิด)
 */
function pick(data: unknown, rules: Record<string, (v: unknown) => string | boolean>): Patch | Invalid {
  if (!isPlainObject(data)) return INVALID
  const out: Patch = {}
  for (const [col, convert] of Object.entries(rules)) {
    if (!Object.hasOwn(data, col) || data[col] === undefined) continue
    const value = convert(data[col])
    if (value === INVALID) return INVALID
    out[col] = value
  }
  return out
}

/** เหมือน text แต่ว่างได้ — ชื่อภาษาอังกฤษของหมวดเป็นช่องไม่บังคับ (หน้าจอใช้ชื่อไทยแทนเมื่อว่าง) */
function optionalText(v: unknown, max: number): string | Invalid {
  if (typeof v !== 'string') return INVALID
  const s = v.trim()
  return s.length <= max ? s : INVALID
}

const asBoolean = (v: unknown): boolean | Invalid => (typeof v === 'boolean' ? v : INVALID)
const asColor = (v: unknown): string | Invalid => (typeof v === 'string' && COLOR_RE.test(v.trim()) ? v.trim() : INVALID)
const asDetailSource = (v: unknown): string | Invalid => (typeof v === 'string' && DETAIL_SOURCES.has(v) ? v : INVALID)

const CATEGORY_UPDATE_RULES = {
  label: (v: unknown) => optionalText(v, 100),
  label_th: (v: unknown) => text(v, 100),
  color: asColor,
  is_active: asBoolean,
  detail_source: asDetailSource,
}
const ITEM_UPDATE_RULES = {
  label: (v: unknown) => text(v, 200),
  is_active: asBoolean,
}

/** แอดมินที่ยืนยันแล้วเท่านั้น — cookie บทบาทที่ผู้ใช้แก้เองได้ไม่มีผล */
async function isVerifiedAdmin(): Promise<boolean> {
  const viewer = await getFinanceViewer()
  return viewer?.isAdmin === true
}

/** /finance/settings เป็นแค่ทางต่อไป /settings — หน้าที่ต้องสร้างใหม่จริงคือ /settings */
function revalidateCategoryPages() {
  revalidatePath('/settings')
  revalidatePath('/finance')
  revalidatePath('/costs')
}

// ============================================================================
// Categories — CRUD
// ============================================================================

export async function getFinanceCategories(activeOnly = true): Promise<FinanceCategory[]> {
  const viewer = await getFinanceViewer()
  if (!viewer) return []

  const supabase = createServiceClient()
  let query = supabase
    .from('finance_categories')
    .select('*')
    .order('sort_order', { ascending: true })

  if (activeOnly !== false) query = query.eq('is_active', true)

  const { data } = await query
  return (data || []) as FinanceCategory[]
}

export async function createCategory(data: {
  value: string; label: string; label_th: string; color: string; detail_source?: string
}) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }

  if (!isPlainObject(data)) return { error: INVALID }
  const value = text(data.value, 50)
  const label = optionalText(data.label, 100)
  const labelTh = text(data.label_th, 100)
  const color = asColor(data.color)
  const detailSource = data.detail_source === undefined ? 'none' : asDetailSource(data.detail_source)
  if ([value, label, labelTh, color, detailSource].includes(INVALID)) return { error: INVALID }

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
      value, label, label_th: labelTh, color, detail_source: detailSource,
      sort_order: (Number(maxRow?.sort_order) || 0) + 1,
    })

  if (error) {
    if (error.code === '23505') return { error: 'ค่า key ซ้ำ' }
    return { error: 'เกิดข้อผิดพลาด' }
  }

  revalidateCategoryPages()
  return { success: true }
}

export async function updateCategory(id: string, data: {
  label?: string; label_th?: string; color?: string;
  is_active?: boolean; detail_source?: string
}) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }

  if (!isUuid(id)) return { error: INVALID }
  const patch = pick(data, CATEGORY_UPDATE_RULES)
  if (patch === INVALID) return { error: INVALID }
  if (Object.keys(patch).length === 0) return { error: 'ไม่มีข้อมูลที่จะแก้ไข' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_categories').update(patch).eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidateCategoryPages()
  return { success: true }
}

export async function deleteCategory(id: string) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }
  if (!isUuid(id)) return { error: INVALID }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_categories').delete().eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด (อาจมีข้อมูลอ้างอิงอยู่)' }

  revalidateCategoryPages()
  return { success: true }
}

export async function reorderCategories(orderedIds: string[]) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }

  if (!Array.isArray(orderedIds) || orderedIds.length === 0 || orderedIds.length > MAX_REORDER) return { error: INVALID }
  if (!orderedIds.every(isUuid)) return { error: INVALID }
  if (new Set(orderedIds.map(id => id.toLowerCase())).size !== orderedIds.length) return { error: INVALID }

  const supabase = createServiceClient()
  const results = await Promise.all(orderedIds.map((id, index) =>
    supabase.from('finance_categories').update({ sort_order: index + 1 }).eq('id', id)
  ))

  revalidateCategoryPages()
  if (results.some(r => r.error)) return { error: 'เกิดข้อผิดพลาด' }
  return { success: true }
}

// ============================================================================
// Category Items — รายการย่อยของแต่ละหมวด (ใช้เป็น dropdown เมื่อ detail_source=custom)
// ============================================================================

export async function getAllCategoryItems(): Promise<CategoryItem[]> {
  const viewer = await getFinanceViewer()
  if (!viewer) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('finance_category_items')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (data || []) as CategoryItem[]
}

export async function createCategoryItem(data: { category_id: string; label: string }) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }

  if (!isPlainObject(data) || !isUuid(data.category_id)) return { error: INVALID }
  const categoryId = data.category_id
  const label = text(data.label, 200)
  if (label === INVALID) return { error: INVALID }

  const supabase = createServiceClient()

  const { data: maxRow } = await supabase
    .from('finance_category_items')
    .select('sort_order')
    .eq('category_id', categoryId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await supabase
    .from('finance_category_items')
    .insert({ category_id: categoryId, label, sort_order: (Number(maxRow?.sort_order) || 0) + 1 })

  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidateCategoryPages()
  return { success: true }
}

export async function updateCategoryItem(id: string, data: { label?: string; is_active?: boolean }) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }

  if (!isUuid(id)) return { error: INVALID }
  const patch = pick(data, ITEM_UPDATE_RULES)
  if (patch === INVALID) return { error: INVALID }
  if (Object.keys(patch).length === 0) return { error: 'ไม่มีข้อมูลที่จะแก้ไข' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_category_items').update(patch).eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidateCategoryPages()
  return { success: true }
}

export async function deleteCategoryItem(id: string) {
  if (!(await isVerifiedAdmin())) return { error: ADMIN_ONLY }
  if (!isUuid(id)) return { error: INVALID }

  const supabase = createServiceClient()
  const { error } = await supabase.from('finance_category_items').delete().eq('id', id)
  if (error) return { error: 'เกิดข้อผิดพลาด' }

  revalidateCategoryPages()
  return { success: true }
}

// ============================================================================
// Staff Profiles — ดึงจาก profiles (read-only)
// ============================================================================

/**
 * รายชื่อพนักงานสำหรับตัวเลือกผู้รับเงิน
 * แอดมินได้บัญชีธนาคารของทุกคน · คนอื่นได้ชื่อทุกคน แต่บัญชีธนาคารเฉพาะของตัวเอง
 * (บัญชีของเพื่อนร่วมงานขอทีละคนผ่าน getStaffBankDetails ซึ่งลงประวัติทุกครั้ง)
 */
export async function getStaffProfiles(): Promise<StaffProfile[]> {
  const viewer = await getFinanceViewer()
  if (!viewer) return []

  const supabase = createServiceClient()

  if (viewer.isAdmin) {
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, nickname, role, bank_name, bank_account_number, account_holder_name')
      .order('full_name', { ascending: true })
    return (data || []) as StaffProfile[]
  }

  // ไม่ดึงคอลัมน์ธนาคารของคนอื่นขึ้นมาจากฐานข้อมูลเลย — อ่านรายชื่อกับบัญชีของตัวเองแยกกัน
  const [{ data: people }, { data: own }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, nickname, role')
      .order('full_name', { ascending: true }),
    supabase
      .from('profiles')
      .select('bank_name, bank_account_number, account_holder_name')
      .eq('id', viewer.userId)
      .maybeSingle(),
  ])

  return ((people || []) as Pick<StaffProfile, 'id' | 'full_name' | 'nickname' | 'role'>[]).map(p => {
    const mine = p.id === viewer.userId
    return {
      id: p.id,
      full_name: p.full_name,
      nickname: p.nickname ?? null,
      role: p.role ?? null,
      bank_name: mine ? (own?.bank_name as string | null) ?? null : null,
      bank_account_number: mine ? (own?.bank_account_number as string | null) ?? null : null,
      account_holder_name: mine ? (own?.account_holder_name as string | null) ?? null : null,
    }
  })
}

/**
 * บัญชีธนาคารของพนักงานหนึ่งคน — ใช้เมื่อสร้างใบเบิกแทนเพื่อนร่วมงาน (ผู้รับเงินเป็นคนอื่น)
 * ดูบัญชีของคนอื่น = ลง VIEW_STAFF_BANK_DETAILS ทุกครั้ง
 */
export async function getStaffBankDetails(profileId: string): Promise<StaffBankDetails | { error: string }> {
  // ตรวจรูปแบบก่อนแตะฐานข้อมูล (ไม่ต้องรู้ว่าเป็นใครก็ปฏิเสธได้ และไม่บอกอะไรเกี่ยวกับข้อมูล)
  if (!isUuid(profileId)) return { error: 'รหัสพนักงานไม่ถูกต้อง' }

  const viewer = await getFinanceViewer()
  if (!viewer) return { error: 'กรุณาเข้าสู่ระบบ' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('bank_name, bank_account_number, account_holder_name')
    .eq('id', profileId)
    .maybeSingle()

  if (error) return { error: 'เกิดข้อผิดพลาด' }
  if (!data) return { error: 'ไม่พบพนักงาน' }

  if (profileId.toLowerCase() !== viewer.userId.toLowerCase()) {
    await logActivity('VIEW_STAFF_BANK_DETAILS', { profileId }, profileId)
  }

  return {
    bank_name: (data.bank_name as string | null) ?? null,
    bank_account_number: (data.bank_account_number as string | null) ?? null,
    account_holder_name: (data.account_holder_name as string | null) ?? null,
  }
}
