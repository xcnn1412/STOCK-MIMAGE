// ============================================================================
// กติกาของใบเบิกแบบไม่มี I/O — server action (actions.ts) และหน้าใบเบิก (claim-detail-view.tsx) ใช้ชุดเดียวกัน
// ห้าม import next/*, supabase หรือ react ที่นี่: ไฟล์นี้ต้องรันได้ทั้งฝั่ง server, client และในชุดตรวจ
// ตรวจด้วย claim-rules.check.ts ข้างไฟล์นี้
// ============================================================================

import type { ExpenseClaim } from '../costs/types'

/** สถานะที่ใบเบิกซึ่งผูกงานต้องมีรายการต้นทุน (อนุมัติแล้วขึ้นไป) */
export const COST_ITEM_STATUSES: readonly string[] = [
  'approved',
  'pending_month_end',
  'waiting_tax_invoice',
  'awaiting_payment',
  'paid',
  'refund_confirmed',
]

/** ใบเบิกนี้ต้องมีรายการต้นทุนหนึ่งรายการหรือไม่ — ผูกงาน และอนุมัติแล้วขึ้นไป · ใบที่ถูกซ่อนไม่มีรายการต้นทุน */
export function shouldHaveCostItem(claim: { job_event_id: string | null; status: string; deleted_at?: string | null }): boolean {
  if (claim.deleted_at) return false
  return !!claim.job_event_id && COST_ITEM_STATUSES.includes(claim.status)
}

/** ใบที่แอดมินซ่อนไว้ (แทนการลบ) — ไม่อยู่ในรายการและคิว กู้คืนได้ */
export const isHiddenClaim = (c: { deleted_at?: string | null }) => !!c.deleted_at

/** ข้อความในช่อง notes ของ job_cost_items ที่ผูกรายการต้นทุนกับใบเบิก: "<claim_number>::<claim id>" */
export function costItemNote(claim: { id: string; claim_number: string }): string {
  return `${claim.claim_number}::${claim.id}`
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** id ของใบเบิกจากช่อง notes (null เมื่อไม่ใช่รายการที่มาจากใบเบิก) — จับคู่ด้วย id เท่านั้น เลขที่ใบเบิกเปลี่ยนได้ */
export function claimIdFromCostNote(notes: string | null | undefined): string | null {
  if (typeof notes !== 'string') return null
  const at = notes.lastIndexOf('::')
  if (at < 0) return null
  // รายการที่กรอกมืออาจมี "::" ในข้อความ — นับเฉพาะเมื่อท้ายข้อความเป็น uuid จริง
  const id = notes.slice(at + 2)
  return UUID_RE.test(id) ? id : null
}

/** สถานะที่ใบเบิกจบแล้ว — ผู้ใช้ทั่วไปไม่มีปุ่มขั้นตอนงานให้กด */
const TERMINAL_STATUSES: readonly string[] = ['paid', 'rejected', 'cancelled', 'refund_confirmed']

/** ผู้ใช้เห็นแผงทำงานของหน้าใบเบิกหรือไม่ (ปุ่มขั้นตอนงาน + แผงวงเงินสดย่อย) */
export function canSeeWorkPanel(input: {
  editing: boolean
  status: string
  isAdmin: boolean
  canSettleAdvance: boolean
  canManagePettyFund: boolean
}): boolean {
  if (input.editing) return false
  // วงเงินสดย่อยใช้งานได้เฉพาะตอน "จ่ายแล้ว" (สถานะจบ) — ผู้ถือวงเงินที่ไม่ใช่แอดมินต้องเห็นแผงนี้ด้วย
  return !TERMINAL_STATUSES.includes(input.status) || input.isAdmin || input.canSettleAdvance || input.canManagePettyFund
}

/** ประเภทที่ยื่นได้โดยยังไม่แนบใบเสร็จ — ทดลองจ่ายและเงินสดย่อยแนบทีหลังตอนเคลียร์ */
export const RECEIPT_OPTIONAL_TYPES: readonly string[] = ['advance', 'petty_cash']

/** ต้องแนบใบเสร็จอย่างน้อย 1 ไฟล์ก่อนยื่นหรือไม่ */
export function receiptRequiredForSubmit(claimType: string): boolean {
  return !RECEIPT_OPTIONAL_TYPES.includes(claimType)
}

const filled = (list: readonly (string | null)[] | null | undefined) => (list ?? []).some(v => typeof v === 'string' && v.trim() !== '')

/**
 * ล็อกการจ่าย — เอกสารไม่ครบจ่ายไม่ได้ทุกทาง (ปุ่มจ่าย · จ่ายหลายใบ · หน้าสรุปยอดจ่าย) ยกเว้นแอดมินบังคับเปลี่ยนสถานะพร้อมเหตุผล
 * ใบเสร็จ: ประเภทที่ต้องแนบก่อนยื่น (receiptRequiredForSubmit) ต้องมีใบเสร็จหรือใบเสร็จตอนเคลียร์อย่างน้อย 1 ไฟล์
 *   (ทดลองจ่าย/เงินสดย่อยแนบทีหลังตอนเคลียร์ จึงไม่ล็อก)
 * ใบกำกับภาษี: ใบที่รอใบกำกับ หรือเคยมีรายการใบกำกับ ต้องมีไฟล์หรือเลขที่อย่างน้อย 1 รายการ
 * ข้อความนี้เป็นที่เดียวของข้อความล็อก — หน้าจอและ server แสดง message ตรงๆ
 */
export function paymentLock(
  claim: Pick<ExpenseClaim, 'claim_type' | 'status' | 'receipt_urls' | 'actual_receipt_urls' | 'tax_invoice_urls' | 'tax_invoice_numbers'>,
): { locked: boolean; missing: string[]; message: string } {
  const missing: string[] = []
  const hasReceipt = (claim.receipt_urls?.length ?? 0) > 0 || (claim.actual_receipt_urls?.length ?? 0) > 0
  if (receiptRequiredForSubmit(claim.claim_type) && !hasReceipt) missing.push('ใบเสร็จ')
  const taxRequired = claim.status === 'waiting_tax_invoice'
    || (claim.tax_invoice_urls?.length ?? 0) > 0 || (claim.tax_invoice_numbers?.length ?? 0) > 0
  if (taxRequired && !filled(claim.tax_invoice_urls) && !filled(claim.tax_invoice_numbers)) missing.push('ใบกำกับภาษี')
  const locked = missing.length > 0
  return { locked, missing, message: locked ? `เอกสารไม่ครบ — ยังจ่ายไม่ได้ (ขาด: ${missing.join(', ')})` : '' }
}

/** ลำดับสถานะตามขั้นตอนงาน — ค่ามากกว่า = ไปข้างหน้า · สถานะขั้นเดียวกันมีค่าเท่ากัน (ย้ายระหว่างกันไม่นับว่าถอย) */
export const STATUS_RANK: Readonly<Record<string, number>> = {
  draft: 0,
  pending: 1,
  approved: 2,
  awaiting_payment: 3,
  waiting_tax_invoice: 3,
  pending_month_end: 3,
  paid: 4,
  refund_confirmed: 5,
}

/** ใบที่ปิดแล้ว (อยู่นอกลำดับขั้นตอน) */
const CLOSED_STATUSES: readonly string[] = ['rejected', 'cancelled']
/** เงินออกไปแล้ว */
const MONEY_MOVED_STATUSES: readonly string[] = ['paid', 'refund_confirmed']

/**
 * ถอยสถานะหรือไม่ — เปิดใบที่ปิดแล้วกลับมา = ถอย · ปิดใบ (ปฏิเสธ/ยกเลิก) = ไม่ถอย
 * สถานะที่ไม่รู้จัก = ถือว่าถอย (ให้ต้องมีเหตุผลไว้ก่อน)
 */
export function isBackwardTransition(from: string, to: string): boolean {
  if (CLOSED_STATUSES.includes(from)) return true
  if (CLOSED_STATUSES.includes(to)) return false
  const a = STATUS_RANK[from]
  const b = STATUS_RANK[to]
  if (a === undefined || b === undefined) return true
  return b < a
}

/** แอดมินเปลี่ยนสถานะเอง ต้องพิมพ์เหตุผลหรือไม่ — ถอยสถานะ หรือปฏิเสธ/ยกเลิกใบที่เงินออกไปแล้ว */
export function reasonRequiredForTransition(from: string, to: string): boolean {
  return isBackwardTransition(from, to) || (CLOSED_STATUSES.includes(to) && MONEY_MOVED_STATUSES.includes(from))
}

/** แก้ข้อมูลใบเบิก ต้องพิมพ์เหตุผลหรือไม่ — เฉพาะใบที่เงินออกไปแล้ว */
export function reasonRequiredForEdit(status: string): boolean {
  return MONEY_MOVED_STATUSES.includes(status)
}
