'use server'

// ============================================================================
// ตั้งค่าเงินเดือน (admin เท่านั้น) — 3 ส่วน:
//   1. ค่าตั้งค่างวด  → app_settings (key-value เดิม ไม่มีตารางใหม่)
//   2. rate card หน้าที่หน้างาน → salary_duties (code คงที่ห้ามแก้/ห้ามลบ ปิดใช้งานแทน)
//   3. โปรไฟล์เงินเดือนต่อคน   → salary_profiles (แยกจาก profiles เพราะ /users select('*'))
//
// types/database.types.ts ยังไม่มีตารางเหล่านี้ (stale) → cast แบบเดียวกับโมดูลเอกสาร
// ============================================================================

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { requireAdmin } from '../session'
import type { DutyInput, EmploymentType } from '../compute'

const CUTOFF_KEY = 'salary_cutoff_day'
const OOP_RATE_KEY = 'salary_out_of_province_rate'
const DEFAULT_CUTOFF_DAY = 25
const DEFAULT_OOP_RATE = 300

const DUTY_CODE_RE = /^[a-z0-9_]{2,40}$/
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const PAY_MODES: DutyInput['pay_mode'][] = ['per_checkin', 'manual_daily']
const EMPLOYMENT_TYPES: EmploymentType[] = ['fulltime', 'freelance']

function refresh() {
  revalidatePath('/salary/settings')
  revalidatePath('/salary')
}

/** 'HH:MM:SS' จาก Postgres time → 'HH:MM' ที่ input type="time" ใช้ได้ */
function toClock(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback
  const m = /^(\d{2}):(\d{2})/.exec(value)
  return m ? `${m[1]}:${m[2]}` : fallback
}

// ────────────────────────────────────────────────────────────────────────────
// 1. ค่าตั้งค่างวด
// ────────────────────────────────────────────────────────────────────────────

export interface SalarySettings {
  /** วันตัดรอบงวด 1-28 */
  cutoff_day: number
  /** อัตราเบิ้ลต่างจังหวัดต่อเช็คอิน (บาท) */
  out_of_province_rate: number
}

/** อ่านค่าตั้งค่า — ค่าที่อ่านไม่ได้/เพี้ยน ตกกลับไปใช้ค่าเริ่มต้นตาม migration */
export async function getSalarySettings(): Promise<SalarySettings> {
  const fallback: SalarySettings = {
    cutoff_day: DEFAULT_CUTOFF_DAY,
    out_of_province_rate: DEFAULT_OOP_RATE,
  }

  const auth = await requireAdmin()
  if ('error' in auth) return fallback

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [CUTOFF_KEY, OOP_RATE_KEY])

  const map = new Map(
    ((data || []) as unknown as { key: string; value: string | null }[]).map(r => [r.key, r.value])
  )

  const cutoff = Math.trunc(Number(map.get(CUTOFF_KEY)))
  const rate = Number(map.get(OOP_RATE_KEY))

  return {
    cutoff_day: Number.isFinite(cutoff) && cutoff >= 1 && cutoff <= 28 ? cutoff : fallback.cutoff_day,
    out_of_province_rate: Number.isFinite(rate) && rate >= 0 ? rate : fallback.out_of_province_rate,
  }
}

export async function updateSalarySettings(
  input: SalarySettings
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const cutoff = Math.trunc(Number(input.cutoff_day))
  if (!Number.isFinite(cutoff) || cutoff < 1 || cutoff > 28) {
    return { error: 'วันตัดรอบต้องเป็นจำนวนเต็ม 1-28' }
  }

  const rate = Number(input.out_of_province_rate)
  if (!Number.isFinite(rate) || rate < 0) {
    return { error: 'อัตราเบิ้ลต่างจังหวัดต้องเป็นตัวเลขไม่ติดลบ' }
  }

  const supabase = createServiceClient()
  const updated_at = new Date().toISOString()
  const { error } = await supabase.from('app_settings').upsert([
    { key: CUTOFF_KEY, value: String(cutoff), updated_at },
    { key: OOP_RATE_KEY, value: String(rate), updated_at },
  ])
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message} (ตรวจว่ารัน migration เงินเดือนแล้ว)` }

  await logActivity('UPDATE_SALARY_SETTINGS', { cutoff_day: cutoff, out_of_province_rate: rate })
  refresh()
  return { success: true }
}

// ────────────────────────────────────────────────────────────────────────────
// 2. Rate card หน้าที่หน้างาน
// ────────────────────────────────────────────────────────────────────────────

/** แถวใน rate card — ต่อยอดจาก DutyInput ที่เครื่องคำนวณใช้ (compute.ts) */
export interface SalaryDutyRow extends DutyInput {
  sort_order: number
}

export async function listDuties(): Promise<SalaryDutyRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_duties')
    .select('code, name_th, rate, pay_mode, is_active, sort_order')
    .order('sort_order', { ascending: true })
    .order('code', { ascending: true })

  return ((data || []) as unknown as SalaryDutyRow[]).map(d => ({
    ...d,
    rate: Number(d.rate || 0),
    sort_order: Number(d.sort_order || 0),
  }))
}

export interface DutyFormInput {
  code: string
  name_th: string
  rate: number
  pay_mode: DutyInput['pay_mode']
  is_active: boolean
  sort_order: number
}

/** ตรวจฟิลด์ที่ create/update ใช้ร่วมกัน — คืนแถวที่พร้อมเขียน หรือข้อความ error */
function validateDuty(
  input: DutyFormInput
): { error: string } | { row: Omit<DutyFormInput, 'code'> } {
  const name_th = (input.name_th || '').trim()
  if (!name_th) return { error: 'กรุณากรอกชื่อหน้าที่' }

  const rate = Number(input.rate)
  if (!Number.isFinite(rate) || rate < 0) return { error: 'อัตราต้องเป็นตัวเลขไม่ติดลบ' }

  if (!PAY_MODES.includes(input.pay_mode)) return { error: 'โหมดการจ่ายไม่ถูกต้อง' }

  const sort_order = Math.trunc(Number(input.sort_order))
  if (!Number.isFinite(sort_order)) return { error: 'ลำดับต้องเป็นจำนวนเต็ม' }

  return {
    row: { name_th, rate, pay_mode: input.pay_mode, is_active: !!input.is_active, sort_order },
  }
}

export async function createSalaryDuty(
  input: DutyFormInput
): Promise<{ error?: string; code?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const code = (input.code || '').trim().toLowerCase()
  if (!DUTY_CODE_RE.test(code)) {
    return { error: 'รหัสหน้าที่ต้องเป็น a-z, 0-9 หรือ _ ยาว 2-40 ตัว' }
  }

  const checked = validateDuty(input)
  if ('error' in checked) return { error: checked.error }

  const supabase = createServiceClient()
  const { data: dupe } = await supabase
    .from('salary_duties')
    .select('code')
    .eq('code', code)
    .maybeSingle()
  if (dupe) return { error: `รหัส ${code} ถูกใช้แล้ว` }

  const { error } = await supabase.from('salary_duties').insert({ code, ...checked.row })
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  await logActivity('UPDATE_SALARY_DUTY', { code, mode: 'create', ...checked.row })
  refresh()
  return { code }
}

/** code เปลี่ยนไม่ได้ (ถูกอ้างใน staff_checkins.duties + snapshot ในสลิป) และไม่มีการลบ */
export async function updateSalaryDuty(
  input: DutyFormInput
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const code = (input.code || '').trim().toLowerCase()
  if (!DUTY_CODE_RE.test(code)) return { error: 'รหัสหน้าที่ไม่ถูกต้อง' }

  const checked = validateDuty(input)
  if ('error' in checked) return { error: checked.error }

  const supabase = createServiceClient()
  const { data: existing } = await supabase
    .from('salary_duties')
    .select('code')
    .eq('code', code)
    .maybeSingle()
  if (!existing) return { error: 'ไม่พบหน้าที่นี้' }

  const { error } = await supabase.from('salary_duties').update(checked.row).eq('code', code)
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  await logActivity('UPDATE_SALARY_DUTY', { code, mode: 'update', ...checked.row })
  refresh()
  return { success: true }
}

// ────────────────────────────────────────────────────────────────────────────
// 3. โปรไฟล์เงินเดือนต่อคน
// ────────────────────────────────────────────────────────────────────────────

export interface SalaryProfileListRow {
  user_id: string
  full_name: string | null
  nickname: string | null
  department: string | null
  role: string | null
  /** false = ยังไม่มีแถวใน salary_profiles (ค่าที่เห็นเป็นค่าเริ่มต้น) */
  configured: boolean
  employment_type: EmploymentType
  base_salary: number
  /** 'HH:MM' */
  work_start: string
  work_end: string
  ot_rate: number
  position: string | null
  start_date: string | null
}

/**
 * ผู้ใช้ที่ยังไม่ถูกลบทั้งหมด + โปรไฟล์เงินเดือน (ถ้ามี)
 * ponytail: 2 query แล้ว join ฝั่ง JS — salary_profiles มี FK ไป profiles สองเส้น
 * (user_id + updated_by) การ embed ของ PostgREST จึงกำกวมต้องใส่ hint
 */
export async function listSalaryProfiles(): Promise<SalaryProfileListRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const [usersRes, profilesRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, nickname, department, role')
      .is('deleted_at', null)
      .order('full_name', { ascending: true }),
    supabase
      .from('salary_profiles')
      .select('user_id, employment_type, base_salary, work_start, work_end, ot_rate, position, start_date'),
  ])

  type UserRaw = {
    id: string
    full_name: string | null
    nickname: string | null
    department: string | null
    role: string | null
  }
  type ProfileRaw = {
    user_id: string
    employment_type: EmploymentType
    base_salary: number | string | null
    work_start: string | null
    work_end: string | null
    ot_rate: number | string | null
    position: string | null
    start_date: string | null
  }

  const byUser = new Map(
    ((profilesRes.data || []) as unknown as ProfileRaw[]).map(p => [p.user_id, p])
  )

  return ((usersRes.data || []) as unknown as UserRaw[]).map(u => {
    const p = byUser.get(u.id)
    return {
      user_id: u.id,
      full_name: u.full_name,
      nickname: u.nickname,
      department: u.department,
      role: u.role,
      configured: !!p,
      employment_type: (p?.employment_type === 'freelance' ? 'freelance' : 'fulltime') as EmploymentType,
      base_salary: Number(p?.base_salary || 0),
      work_start: toClock(p?.work_start, '10:00'),
      work_end: toClock(p?.work_end, '19:00'),
      ot_rate: Number(p?.ot_rate || 0),
      position: p?.position ?? null,
      start_date: p?.start_date ?? null,
    }
  })
}

export interface SalaryProfileFormInput {
  user_id: string
  employment_type: EmploymentType
  base_salary: number
  work_start: string
  work_end: string
  ot_rate: number
  position?: string | null
  start_date?: string | null
}

export async function upsertSalaryProfile(
  input: SalaryProfileFormInput
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const user_id = (input.user_id || '').trim()
  if (!user_id) return { error: 'ไม่พบผู้ใช้' }

  if (!EMPLOYMENT_TYPES.includes(input.employment_type)) {
    return { error: 'ประเภทการจ้างไม่ถูกต้อง' }
  }

  const base_salary = Number(input.base_salary)
  if (!Number.isFinite(base_salary) || base_salary < 0) {
    return { error: 'เงินเดือนฐานต้องเป็นตัวเลขไม่ติดลบ' }
  }

  const ot_rate = Number(input.ot_rate)
  if (!Number.isFinite(ot_rate) || ot_rate < 0) {
    return { error: 'อัตรา OT ต้องเป็นตัวเลขไม่ติดลบ' }
  }

  const work_start = (input.work_start || '').slice(0, 5)
  const work_end = (input.work_end || '').slice(0, 5)
  if (!TIME_RE.test(work_start) || !TIME_RE.test(work_end)) {
    return { error: 'เวลาทำงานต้องอยู่ในรูปแบบ HH:MM' }
  }
  // เครื่องคำนวณนับ OT จากช่วง "ก่อนเริ่ม" และ "หลังเลิก" ของวันเดียวกัน
  if (work_end <= work_start) return { error: 'เวลาเลิกงานต้องหลังเวลาเริ่มงาน' }

  const start_date = (input.start_date || '').trim() || null
  if (start_date && !DATE_RE.test(start_date)) return { error: 'วันเริ่มงานไม่ถูกต้อง' }

  const supabase = createServiceClient()
  const { data: target } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!target) return { error: 'ไม่พบผู้ใช้ หรือผู้ใช้ถูกลบไปแล้ว' }

  const row = {
    user_id,
    employment_type: input.employment_type,
    base_salary,
    work_start,
    work_end,
    ot_rate,
    position: (input.position || '').trim() || null,
    start_date,
    updated_at: new Date().toISOString(),
    updated_by: auth.userId,
  }

  const { error } = await supabase.from('salary_profiles').upsert(row, { onConflict: 'user_id' })
  if (error) {
    return { error: `บันทึกไม่สำเร็จ: ${error.message} (ตรวจว่ารัน migration เงินเดือนแล้ว)` }
  }

  await logActivity(
    'UPDATE_SALARY_PROFILE',
    {
      employment_type: row.employment_type,
      base_salary: row.base_salary,
      work_start: row.work_start,
      work_end: row.work_end,
      ot_rate: row.ot_rate,
      position: row.position,
      start_date: row.start_date,
    },
    user_id
  )

  refresh()
  return { success: true }
}
