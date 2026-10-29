/**
 * คอลัมน์โปรไฟล์ที่ฟอร์ม /profile และ /users แก้ได้ — ที่เดียวที่กำหนด
 * ค่าที่ client ส่งมาเป็น object ทั้งก้อน type ของ TypeScript ไม่มีผลตอน runtime
 * จึงต้องกรองคีย์ก่อน `.update()` ไม่งั้นใครก็ส่ง `role: 'admin'` มาได้ (C1 ในรายงาน 2026-10-29)
 */
export const PROFILE_FIELDS = [
  'full_name',
  'nickname',
  'department',
  'national_id',
  'address',
  'bank_name',
  'bank_account_number',
  'account_holder_name',
] as const

export type ProfileField = (typeof PROFILE_FIELDS)[number]
export type ProfilePatch = Partial<Record<ProfileField, string | null>>

/** เก็บเฉพาะ 8 คีย์ข้างบน และเฉพาะค่าที่เป็น string (null ได้เฉพาะ department) — คีย์อื่นทิ้งเงียบๆ */
export function pickProfileFields(input: unknown): ProfilePatch {
  const out: ProfilePatch = {}
  if (!input || typeof input !== 'object') return out
  const src = input as Record<string, unknown>
  for (const key of PROFILE_FIELDS) {
    if (!(key in src)) continue
    const v = src[key]
    if (typeof v === 'string') out[key] = v
    else if (v === null && key === 'department') out[key] = null
  }
  return out
}

export const USER_ROLES = ['admin', 'staff'] as const
export const isUserRole = (v: unknown): v is (typeof USER_ROLES)[number] =>
  typeof v === 'string' && (USER_ROLES as readonly string[]).includes(v)
