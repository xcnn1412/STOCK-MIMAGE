// ============================================================================
// กติกาของใบเบิกแบบไม่มี I/O — server action (actions.ts) และหน้าใบเบิก (claim-detail-view.tsx) ใช้ชุดเดียวกัน
// ห้าม import next/*, supabase หรือ react ที่นี่: ไฟล์นี้ต้องรันได้ทั้งฝั่ง server, client และในชุดตรวจ
// ตรวจด้วย claim-rules.check.ts ข้างไฟล์นี้
// ============================================================================

/** สถานะที่ใบเบิกซึ่งผูกงานต้องมีรายการต้นทุน (อนุมัติแล้วขึ้นไป) */
export const COST_ITEM_STATUSES: readonly string[] = [
  'approved',
  'pending_month_end',
  'waiting_tax_invoice',
  'awaiting_payment',
  'paid',
  'refund_confirmed',
]

/** ใบเบิกนี้ต้องมีรายการต้นทุนหนึ่งรายการหรือไม่ — ผูกงาน และอนุมัติแล้วขึ้นไป */
export function shouldHaveCostItem(claim: { job_event_id: string | null; status: string }): boolean {
  return !!claim.job_event_id && COST_ITEM_STATUSES.includes(claim.status)
}

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
