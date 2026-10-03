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

// --- ตรวจนับชั้น (เฟส 2) -------------------------------------------------------

/** ชั้นที่ไม่ได้ตรวจนับเกินกี่วัน = เลยกำหนด */
// ponytail: ค่าคงที่ระบบเดียว — ย้ายไป app_settings เมื่อเจ้าของอยากตั้งเอง
export const AUDIT_DUE_DAYS = 30

export interface AuditTarget {
  kind: 'kit' | 'item'
  id: string
  name: string
}
export type AuditSkip = AuditTarget & { reason: string }

export const auditKey = (t: { kind: string; id: string }) => `${t.kind}:${t.id}`

/**
 * ของที่ "ควรเจอ" บนชั้นตอนตรวจนับ — กระเป๋าที่ไม่ได้ออกงาน + อุปกรณ์แยกชิ้นที่ไม่ได้ออกงาน/ไม่ได้แจ้งหายไว้
 * ที่เหลือ (skipped) แสดงให้เห็นแต่ไม่นับเป็นของขาด
 */
export function auditTargets(
  kits: { id: string; name: string; itemStatuses: string[] }[],
  items: { id: string; name: string; status: string }[]
): { expected: AuditTarget[]; skipped: AuditSkip[] } {
  const expected: AuditTarget[] = []
  const skipped: AuditSkip[] = []
  for (const k of kits) {
    const t: AuditTarget = { kind: 'kit', id: k.id, name: k.name }
    if (k.itemStatuses.includes('in_use')) skipped.push({ ...t, reason: 'ออกงานอยู่' })
    else expected.push(t)
  }
  for (const i of items) {
    const t: AuditTarget = { kind: 'item', id: i.id, name: i.name }
    if (i.status === 'in_use') skipped.push({ ...t, reason: 'ออกงานอยู่' })
    else if (i.status === 'lost') skipped.push({ ...t, reason: 'แจ้งหายไว้แล้ว' })
    else expected.push(t)
  }
  return { expected, skipped }
}

/** ของที่ควรเจอแต่ไม่ได้ติ๊กว่าเจอ — foundKeys ที่ไม่อยู่ใน expected ถูกทิ้ง */
export function auditMissing(expected: AuditTarget[], foundKeys: string[]): AuditTarget[] {
  const found = new Set(foundKeys)
  return expected.filter(t => !found.has(auditKey(t)))
}

export type AuditDue = { kind: 'never' } | { kind: 'ok' | 'overdue'; days: number }

/** ตรวจครั้งล่าสุดกี่วันก่อน และเลยกำหนดหรือยัง */
export function auditDue(lastAuditAt: string | null, now: Date, dueDays = AUDIT_DUE_DAYS): AuditDue {
  if (!lastAuditAt) return { kind: 'never' }
  const days = Math.floor((now.getTime() - new Date(lastAuditAt).getTime()) / 86_400_000)
  return { kind: days > dueDays ? 'overdue' : 'ok', days }
}
