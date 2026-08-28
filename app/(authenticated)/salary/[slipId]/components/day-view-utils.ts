// ============================================================================
// ตัวช่วยเล็กๆ ของมุมมองรายวัน — ใช้ร่วมกันทั้งตารางเดสก์ท็อปและการ์ดมือถือ
// pure ล้วน (ไม่มี state/DOM) จึงไม่ต้องเป็น client component
//
// การแปลงเวลา/การเช็ค "ยังไม่กรอกยอด" อยู่ที่ compute.ts ตัวเดียว
// (bangkokParts / isMissingAmount) — ที่นี่เหลือแค่ของเฉพาะหน้าจอ
// ============================================================================

import type { SlipCheckinRow } from '../../actions'

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
