// ============================================================================
// ตัวช่วยเล็กๆ ของมุมมองรายวัน — ใช้ร่วมกันทั้งตารางเดสก์ท็อปและการ์ดมือถือ
// pure ล้วน (ไม่มี state/DOM) จึงไม่ต้องเป็น client component
//
// การแปลงเวลา/การเช็ค "ยังไม่กรอกยอด" อยู่ที่ compute.ts ตัวเดียว
// (bangkokParts / isMissingAmount) — ที่นี่เหลือแค่ของเฉพาะหน้าจอ
// ============================================================================

import type { SlipCheckinPatch, SlipCheckinRow, SlipEventOption } from '../../actions'

export const CHECK_TYPE_LABEL: Record<SlipCheckinRow['check_type'], string> = {
  office: 'ออฟฟิศ',
  onsite: 'หน้างาน',
  remote: 'นอกสถานที่',
}

/** (วันไทย, เวลาไทย) → instant */
export function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}

/**
 * เวลาออกที่ "ไม่มากกว่า" เวลาเข้า = กะข้ามคืน (ต้องบันทึกเป็นวันถัดไป)
 * มุมมองรายวันมีช่องเวลาอย่างเดียว ไม่มีช่องวันที่ออกแยกเหมือนไดอะล็อกเดิม
 * จึงต้องถามยืนยันก่อนบันทึกเสมอ — ห้ามเดา +1 วันให้เงียบๆ
 */
export function isOvernight(inTime: string, outTime: string): boolean {
  return !!outTime && outTime <= inTime
}

/**
 * แถวเช็คอินหลังแก้ — ใช้แพตช์ state ฝั่ง client ทันทีก่อน server ตอบ (ภาพตัวอย่าง)
 * กติกาเดียวกับ adminEditCheckin: เปลี่ยนประเภทออกจาก onsite = ล้างหน้าที่ + ตจว.
 * ponytail: ชื่ออีเวนต์หาได้เฉพาะจากลิสต์ที่โหลดมา — นอกลิสต์ = null ชั่วคราว
 * (ป้ายค่าสตาฟขึ้น "ไม่ระบุอีเวนต์" จนกว่า server ตอบ ตัวเลขไม่เปลี่ยน)
 */
export function applyCheckinPatch(
  c: SlipCheckinRow,
  patch: SlipCheckinPatch,
  events: SlipEventOption[]
): SlipCheckinRow {
  const next: SlipCheckinRow = { ...c }
  const leavingOnsite = !!patch.check_type && patch.check_type !== 'onsite'

  if (patch.check_type) next.check_type = patch.check_type
  if (patch.checked_in_at !== undefined) next.checked_in_at = patch.checked_in_at
  if (patch.checked_out_at !== undefined) next.checked_out_at = patch.checked_out_at
  if (patch.duties) next.duties = patch.duties
  if (patch.out_of_province !== undefined && !leavingOnsite) next.out_of_province = patch.out_of_province
  if (leavingOnsite) {
    next.duties = []
    next.out_of_province = false
  }
  if (patch.event_id !== undefined) {
    next.event_id = patch.event_id
    next.event_name = patch.event_id ? (events.find(e => e.id === patch.event_id)?.name ?? null) : null
  }
  return next
}
