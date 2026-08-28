// ============================================================================
// ตัวช่วยเล็กๆ ของมุมมองรายวัน — ใช้ร่วมกันทั้งตารางเดสก์ท็อปและการ์ดมือถือ
// pure ล้วน (ไม่มี state/DOM) จึงไม่ต้องเป็น client component
// ============================================================================

import { shiftDay, type SalaryLine } from '../../compute'
import type { SlipCheckinRow } from '../../actions'

export const CHECK_TYPE_LABEL: Record<SlipCheckinRow['check_type'], string> = {
  office: 'ออฟฟิศ',
  onsite: 'หน้างาน',
  remote: 'นอกสถานที่',
}

const BANGKOK_OFFSET = 7 * 60 * 60 * 1000

/** instant → (วันไทย, เวลาไทย) สำหรับใส่ใน <input type="time"> */
export function bkkParts(iso: string): { date: string; time: string } {
  const s = new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString()
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}

/** (วันไทย, เวลาไทย) → instant */
export function toISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+07:00`).toISOString()
}

/**
 * วันของเวลาออกเมื่อแก้เฉพาะ "เวลา" ในแถว — เวลาออกที่ไม่มากกว่าเวลาเข้าถือเป็นกะข้ามคืน
 * (มุมมองรายวันมีช่องเวลาอย่างเดียว ไม่มีช่องวันที่ออกแยกเหมือนไดอะล็อกเดิม)
 */
export function checkoutDateFor(inDate: string, inTime: string, outTime: string): string {
  return outTime <= inTime ? shiftDay(inDate, 1) : inDate
}

/** บรรทัดที่ยังไม่มียอด (รันเนอร์ที่ยังไม่กรอก) */
export function isMissing(l: SalaryLine): boolean {
  return l.amount === null || l.amount === undefined
}
