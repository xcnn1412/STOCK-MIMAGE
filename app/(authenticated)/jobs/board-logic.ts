// Pure logic seam ของ "บอร์ดวันงาน" (/jobs) — ไม่มี React, ไม่มี I/O
// ทุกอย่างเป็นฟังก์ชันของ jobs[] + "วันนี้" (string YYYY-MM-DD โซนเวลา Asia/Bangkok)
// ตรวจด้วย: npx tsx "app/(authenticated)/jobs/board-logic.check.ts"
import { addDays, POOL_DONE_STATUSES } from './tracking/tracking-logic'

/** ประเภทใบงานที่ขึ้นบอร์ดวันงาน — บอร์ดนี้เป็นของใบงานหน้างานอย่างเดียว (ฝั่งกราฟิกอยู่ในพูลงาน) */
export const ONSITE_JOB_TYPE = 'onsite'

/** สถานะ "ออกหน้างาน" ในไปป์ไลน์ status_onsite — ปลายทางของการขยับอัตโนมัติเมื่อทีมเช็คอินหน้างาน */
export const ONSITE_ARRIVED_STATUS = 'onsite'

/** ชิปช่วงวันเหนือบอร์ด — ค่าเริ่มต้นคือ week7 */
export type DayChip = 'week7' | 'today' | 'all'

export const DEFAULT_DAY_CHIP: DayChip = 'week7'

/** จำนวนวันของแต่ละชิป (all = ไม่กรองช่วงวัน) */
const CHIP_DAYS: Record<Exclude<DayChip, 'all'>, number> = {
  today: 0,
  week7: 7,
}

/** YYYY-MM-DD ตามโซนเวลา Asia/Bangkok — เทียบกับ jobs.event_date (DATE) ได้ตรงตัวแบบ string */
export function bangkokToday(now: Date = new Date()): string {
  return now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/**
 * วันงานอยู่ในช่วง [today, today + days] หรือไม่ (ละเอียดระดับวัน)
 * ไม่มีวันงาน = ไม่อยู่ในช่วง (ใบงานไม่ระบุวันไม่ขึ้นบอร์ดหลัก)
 */
export function inDayWindow(eventDate: string | null | undefined, today: string, days: number): boolean {
  if (!eventDate) return false
  // ponytail: slice(0,10) — บางแถวเก็บเป็น timestamp เต็ม ไม่ใช่ YYYY-MM-DD เพียวๆ
  const day = eventDate.slice(0, 10)
  return day >= today && day <= addDays(today, days)
}

/** ชิปช่วงวัน: "ทั้งหมด" ไม่กรองอะไรเลย (ใบงานไม่ระบุวันเห็นได้เฉพาะชิปนี้) */
export function inDayChip(eventDate: string | null | undefined, today: string, chip: DayChip): boolean {
  if (chip === 'all') return true
  return inDayWindow(eventDate, today, CHIP_DAYS[chip])
}

/** ใบงานลอย = ใบงานที่ไม่ผูก CRM (พูลงานมองไม่เห็นโดยดีไซน์) */
export function isFloatingJob(job: { crm_lead_id: string | null }): boolean {
  return job.crm_lead_id === null
}

/** แยกใบงานลอยออกจากใบงานที่มาจาก CRM — ทุกประเภทงาน ไม่กรองสถานะ */
export function splitFloating<T extends { crm_lead_id: string | null }>(jobs: T[]): { linked: T[]; floating: T[] } {
  const linked: T[] = []
  const floating: T[] = []
  for (const job of jobs) {
    if (isFloatingJob(job)) floating.push(job)
    else linked.push(job)
  }
  return { linked, floating }
}

/** ใบงานที่ขึ้นบอร์ดวันงาน: หน้างานเท่านั้น + อยู่ในช่วงของชิป */
export function boardJobs<T extends { job_type: string; event_date: string | null }>(
  jobs: T[],
  today: string,
  chip: DayChip,
): T[] {
  return jobs.filter((j) => j.job_type === ONSITE_JOB_TYPE && inDayChip(j.event_date, today, chip))
}

/**
 * ใบงานหน้างานใบนี้ควรขยับเป็น "ออกหน้างาน" อัตโนมัติหรือไม่ เมื่อทีมเช็คอินหน้างานของอีเวนต์ที่ผูกงานนี้
 *
 * `orderedStatuses` = ค่าสถานะของไปป์ไลน์ status_onsite เรียงตาม sort_order (แอดมินแก้ชุดสถานะได้)
 * เงื่อนไขเดียว: สถานะปัจจุบันต้องอยู่ "ก่อน" ออกหน้างานในลำดับนั้น — ห้ามถอยหลังเด็ดขาด
 * - สถานะปัจจุบันไม่อยู่ในลำดับ (สถานะแปลกปลอม/ถูกลบทิ้ง) → ไม่แตะ
 * - ไม่มี 'onsite' ในลำดับ (แอดมินตัดขั้นนี้ออก) → ไม่มีปลายทางให้ขยับ → ไม่แตะ
 * - จบแล้ว/ถูกข้าม → ไม่แตะ แม้จะถูกจัดลำดับไว้ก่อนออกหน้างานก็ตาม
 */
export function shouldAdvanceToOnsite(currentStatus: string, orderedStatuses: string[]): boolean {
  if (POOL_DONE_STATUSES.includes(currentStatus)) return false
  const target = orderedStatuses.indexOf(ONSITE_ARRIVED_STATUS)
  if (target === -1) return false
  const current = orderedStatuses.indexOf(currentStatus)
  if (current === -1) return false
  return current < target
}

/** เรียงใบงานลอย: มีวันงานก่อน (วันใกล้สุดขึ้นก่อน) แล้วค่อยใบที่ยังไม่ระบุวัน */
export function sortFloating<T extends { event_date: string | null; title: string }>(jobs: T[]): T[] {
  return jobs.slice().sort((a, b) => {
    const byDate = (a.event_date ?? '9999-12-31').localeCompare(b.event_date ?? '9999-12-31')
    return byDate !== 0 ? byDate : a.title.localeCompare(b.title)
  })
}
