// ตรรกะล้วนของชั้นเก็บของ (ไม่แตะฐานข้อมูล) — เทสต์ที่ shelf-logic.check.ts

/** สถานะอุปกรณ์ที่ถือว่า "มีปัญหา" ต้องดูแล */
export const PROBLEM_STATUSES = ['damaged', 'maintenance', 'lost']

export type KitShelfState =
  /** อุปกรณ์อย่างน้อยหนึ่งชิ้นถูกนำออกงาน — กระเป๋าไม่อยู่บนชั้น */
  | { kind: 'out'; eventName: string | null }
  /** อยู่บนชั้น มีงานจองไว้ข้างหน้า */
  | { kind: 'booked'; eventName: string; eventDate: string | null }
  /** อยู่บนชั้น ว่าง */
  | { kind: 'home' }

/**
 * กระเป๋าใบนี้ตอนนี้อยู่ไหน — ดูจากสถานะอุปกรณ์ข้างใน (in_use = ออกงาน) + งานที่กระเป๋าผูกอยู่ (kits.event_id)
 * kits.event_id = งานที่ยังไม่ปิดที่เร็วที่สุด (ADR-0003) จึงเป็นทั้ง "งานที่ออกไป" และ "งานที่จองไว้"
 */
export function kitShelfState(
  itemStatuses: string[],
  event: { name: string | null; event_date: string | null } | null
): KitShelfState {
  if (itemStatuses.some(s => s === 'in_use')) return { kind: 'out', eventName: event?.name ?? null }
  if (event) return { kind: 'booked', eventName: event.name || 'ไม่ระบุชื่องาน', eventDate: event.event_date }
  return { kind: 'home' }
}

/** จำนวนอุปกรณ์ที่มีปัญหา (เสียหาย / ซ่อมบำรุง / หาย) */
export const countProblems = (itemStatuses: string[]) => itemStatuses.filter(s => PROBLEM_STATUSES.includes(s)).length

/** จัดกลุ่มชั้นตามโซน — โซนเรียงตามตัวอักษร ชั้นในโซนเรียงตามรหัส (A-2 มาก่อน A-10) */
export function groupByZone<T extends { zone: string; code: string }>(shelves: T[]): { zone: string; shelves: T[] }[] {
  const cmp = (a: string, b: string) => a.localeCompare(b, 'th', { numeric: true })
  const zones = [...new Set(shelves.map(s => s.zone))].sort(cmp)
  return zones.map(zone => ({ zone, shelves: shelves.filter(s => s.zone === zone).sort((a, b) => cmp(a.code, b.code)) }))
}
