// ============================================================================
// ชุดสถานะและเงื่อนไขของใบเบิกที่หลายไฟล์ใช้ร่วมกัน — ที่เดียวแทนรายการสถานะที่เคยพิมพ์ซ้ำในแต่ละไฟล์
// ไฟล์กติกาล้วน: ไม่ import next/*, supabase หรือ react — ใช้ได้ทั้ง server, client และในชุดตรวจ
// ตรวจด้วย:  npx tsx lib/finance/conditions.check.ts
// ============================================================================

/** สถานะที่ใบเบิกจบแล้ว (ไม่มีงานต่อ) — ยกเว้นทดลองจ่ายที่ยังไม่เคลียร์และวงเงินสดย่อยที่ยังเปิด (ดู isOpenClaim) */
export const TERMINAL_STATUSES: readonly string[] = ['paid', 'cancelled', 'refund_confirmed']

/** สถานะ "จ่ายแล้ว" — คลังเก็บ เดือนที่จ่าย และส่วนชำระเงินแล้วของหน้าแรกแอดมิน */
export const PAID_STATUSES: readonly string[] = ['paid', 'refund_confirmed']

/**
 * สถานะที่ยังมีงานรอแอดมิน (คิวใบเบิก — แบบร่างอยู่ในคิวเพื่อหาใบที่ค้างนาน)
 * ไม่รวม rejected: ใบที่ถูกปฏิเสธรอผู้เบิกแก้ ไม่ใช่งานของแอดมิน (แต่ยังเป็นใบที่ "ยังไม่จบ" ของผู้เบิก — isOpenClaim)
 */
export const OPEN_STATUSES: readonly string[] = [
  'draft', 'pending', 'approved', 'waiting_tax_invoice', 'pending_month_end', 'awaiting_payment',
]

/** ช่องที่เงื่อนไขในไฟล์นี้อ่าน — ค่าจากฐานข้อมูลเป็น null ได้ แถวที่เลือกคอลัมน์ไม่ครบให้ถือว่าว่าง */
export interface ClaimConditionFields {
  status?: string | null
  claim_type?: string | null
  actual_spent_amount?: number | null
  pettycash_fund_id?: string | null
  pettycash_closed_at?: string | null
}

/** เงินทดลองจ่ายที่จ่ายแล้วแต่ผู้เบิกยังไม่เคลียร์ค่าใช้จ่ายจริง (actual_spent_amount ว่าง — 0 คือเคลียร์แล้ว) */
export function isUnsettledAdvance(c: ClaimConditionFields): boolean {
  return c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount == null
}

/** วงเงินสดย่อย (ใบแม่ — ไม่มี pettycash_fund_id) ที่จ่ายแล้วและยังไม่ปิดเดือน · เติมเงินและรายการในกล่องไม่นับ */
export function isOpenFund(c: ClaimConditionFields): boolean {
  return c.claim_type === 'petty_cash' && !c.pettycash_fund_id && c.status === 'paid' && c.pettycash_closed_at == null
}

/**
 * ใบที่ยังไม่จบ (รายการของพนักงาน / getClaims({ open: true })) =
 * สถานะยังไม่จบ + ทดลองจ่ายที่ยังไม่เคลียร์ + วงเงินสดย่อยที่ยังเปิด
 */
export function isOpenClaim(c: ClaimConditionFields): boolean {
  return !TERMINAL_STATUSES.includes(c.status ?? '') || isUnsettledAdvance(c) || isOpenFund(c)
}

/** จ่ายแล้ว (paid หรือ refund_confirmed) */
export function isPaidLike(c: ClaimConditionFields): boolean {
  return PAID_STATUSES.includes(c.status ?? '')
}
