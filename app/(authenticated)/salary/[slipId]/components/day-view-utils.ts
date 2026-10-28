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

/** สีป้ายประเภทเช็คอิน — หน้างานเด่นสุด (มีเงินผูก) ออฟฟิศกลางๆ · ข้อความยังบอกประเภทเอง ไม่ได้พึ่งสีอย่างเดียว */
export const CHECK_TYPE_CLASS: Record<SlipCheckinRow['check_type'], string> = {
  office: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300',
  onsite: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300',
  remote: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300',
}

/**
 * สีป้ายหน้าที่ — salary_duties ไม่มีคอลัมน์สี จึงไล่สีตามลำดับหน้าที่ในตั้งค่า (คงที่ทุกแถว/ทุกหน้า)
 * ponytail: ถ้าแอดมินอยากเลือกสีเอง ค่อยเพิ่มคอลัมน์ color ใน salary_duties + ช่องสีในหน้าตั้งค่า
 */
const DUTY_PALETTE = ['#2563eb', '#16a34a', '#ea580c', '#7c3aed', '#db2777', '#0d9488', '#ca8a04', '#dc2626']
export function dutyColor(code: string, duties: { code: string }[]): string {
  const i = duties.findIndex(d => d.code === code)
  return i < 0 ? '#71717a' : DUTY_PALETTE[i % DUTY_PALETTE.length]
}

/** style ป้ายสีแบบเดียวกับแท็กบนบอร์ดวันงาน (/jobs) — พื้นจาง ตัวอักษรเข้ม ขอบบางสีเดียวกัน */
export function chipStyle(color: string) {
  return { backgroundColor: `${color}15`, color, boxShadow: `inset 0 0 0 1.5px ${color}30` }
}

/**
 * ช่วงเวลาที่ตั้งไว้ในอีเวนต์ ("12:00:00" → "12:00") ไว้เทียบกับเวลาเช็คอินจริง
 * รูปแบบเดียวกับ eventTimeLabel ของหน้าติดตามงาน
 */
export function eventScheduleLabel(c: { event_time: string | null; event_end_time: string | null }): string {
  if (!c.event_time) return 'ยังไม่ใส่เวลาในอีเวนต์'
  return `${c.event_time.slice(0, 5)}${c.event_end_time ? '–' + c.event_end_time.slice(0, 5) : ''} น.`
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
    const opt = patch.event_id ? events.find(e => e.id === patch.event_id) : undefined
    next.event_name = opt?.name ?? null
    next.event_time = opt?.event_time ?? null
    next.event_end_time = opt?.event_end_time ?? null
    next.crm_name = opt?.crm_name ?? null
    next.crm_location = opt?.crm_location ?? null
  }
  return next
}
