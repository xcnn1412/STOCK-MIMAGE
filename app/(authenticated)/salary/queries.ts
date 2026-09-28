// ============================================================================
// แกนอ่านข้อมูลของโมดูลเงินเดือนที่ "ไม่ตรวจสิทธิ์" — ใช้ข้ามไฟล์ action
//
// ห้ามใส่ 'use server' ในไฟล์นี้: ทุก export ของไฟล์ 'use server' กลายเป็น endpoint
// ที่ client เรียกตรงได้ แต่ฟังก์ชันพวกนี้ไม่ตรวจสิทธิ์เอง — ผู้เรียก (server action ที่
// ตรวจ admin แล้ว หรือ getSlipForView ที่ตรวจสิทธิ์ของตัวเองแล้ว) เป็นคนรับผิดชอบ
// spec: docs/specs/salary-slip-smooth-edit.md §B
// ============================================================================

import type { createServiceClient } from '@/lib/supabase-server'
import type { SalaryDutyRow, SalarySettings } from './settings/actions'

type ServiceClient = ReturnType<typeof createServiceClient>

export const CUTOFF_KEY = 'salary_cutoff_day'
export const OOP_RATE_KEY = 'salary_out_of_province_rate'
const DEFAULT_CUTOFF_DAY = 25
const DEFAULT_OOP_RATE = 300

/** ค่าเริ่มต้นตาม migration — ใช้ตอนอ่านไม่ได้/ค่าเพี้ยน หรือผู้เรียกไม่ใช่ admin */
export const DEFAULT_SALARY_SETTINGS: SalarySettings = {
  cutoff_day: DEFAULT_CUTOFF_DAY,
  out_of_province_rate: DEFAULT_OOP_RATE,
}

/** อ่านค่าตั้งค่างวด — ค่าที่อ่านไม่ได้/เพี้ยน ตกกลับไปใช้ค่าเริ่มต้น */
export async function readSalarySettings(supabase: ServiceClient): Promise<SalarySettings> {
  const fallback = DEFAULT_SALARY_SETTINGS
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

/**
 * rate card ทั้งใบ รวมหน้าที่ที่ปิดใช้งานแล้ว — ตั้งใจ: สลิปเก่าอาจอ้างรหัสที่เพิ่งปิดไป
 * และหน้าสลิปต้องแปลรหัสของเช็คอินเก่าเป็นชื่อไทยได้
 */
export async function readDuties(supabase: ServiceClient): Promise<SalaryDutyRow[]> {
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
