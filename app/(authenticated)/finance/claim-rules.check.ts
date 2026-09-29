// ตรวจกติกาของใบเบิก (claim-rules.ts) — ข้อมูลสังเคราะห์ทั้งหมด ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claim-rules.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-rules: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { COST_ITEM_STATUSES, canSeeWorkPanel, claimIdFromCostNote, costItemNote, shouldHaveCostItem } from './claim-rules'
import { STATUS_RANK, isBackwardTransition, reasonRequiredForEdit, reasonRequiredForTransition, receiptRequiredForSubmit } from './claim-rules'

const ID = '00000000-0000-4000-8000-000000000101'
const EVENT = '00000000-0000-4000-8000-000000000901'

// (a) สถานะที่ต้องมีรายการต้นทุน — อนุมัติแล้วขึ้นไปเท่านั้น
assert.deepEqual([...COST_ITEM_STATUSES].sort(), [
  'approved', 'awaiting_payment', 'paid', 'pending_month_end', 'refund_confirmed', 'waiting_tax_invoice',
])
for (const status of COST_ITEM_STATUSES) {
  assert.equal(shouldHaveCostItem({ job_event_id: EVENT, status }), true, `ผูกงาน + ${status} → ต้องมี`)
  assert.equal(shouldHaveCostItem({ job_event_id: null, status }), false, `ไม่ผูกงาน + ${status} → ไม่ต้องมี`)
}
for (const status of ['draft', 'pending', 'rejected', 'cancelled', '']) {
  assert.equal(shouldHaveCostItem({ job_event_id: EVENT, status }), false, `ผูกงาน + ${status || '(ว่าง)'} → ไม่ต้องมี`)
}
assert.equal(shouldHaveCostItem({ job_event_id: '', status: 'paid' }), false, 'job_event_id ว่าง = ไม่ผูกงาน')

// (b) notes ของรายการต้นทุน: "<เลขที่>::<id>" · อ่านกลับได้ id เดิม
assert.equal(costItemNote({ id: ID, claim_number: 'EXP-202609-012' }), `EXP-202609-012::${ID}`)
assert.equal(claimIdFromCostNote(costItemNote({ id: ID, claim_number: 'EXP-202609-012' })), ID)
// เลขที่ต่างจากปัจจุบัน (ใบที่ถูกเปลี่ยนเลข) ก็ยังได้ id เดียวกัน
assert.equal(claimIdFromCostNote(`EXP-202604-012-2::${ID}`), ID)
assert.equal(claimIdFromCostNote(`EXP-202604-012::${ID}`), ID)
// "::" หลายตัว → ใช้ตัวสุดท้าย
assert.equal(claimIdFromCostNote(`ค่ารถ::ไปกลับ::${ID}`), ID)
// ไม่ใช่รายการจากใบเบิก
for (const notes of [null, undefined, '', 'ค่าอาหารทีมงาน', 'EXP-202609-012', `EXP-202609-012::`, 'ค่ารถ::ไปกลับ', `${ID}`, `EXP::${ID}x`, `EXP::${ID} `]) {
  assert.equal(claimIdFromCostNote(notes), null, `notes ${JSON.stringify(notes)} → null`)
}

// (c) แผงทำงานของหน้าใบเบิก (P0-B12)
const panel = (over: Partial<Parameters<typeof canSeeWorkPanel>[0]>) =>
  canSeeWorkPanel({ editing: false, status: 'paid', isAdmin: false, canSettleAdvance: false, canManagePettyFund: false, ...over })
// ผู้ถือวงเงินสดย่อยที่ไม่ใช่แอดมิน ของวงเงินที่จ่ายแล้วและยังเปิดอยู่ → เห็น (เพิ่มค่าใช้จ่าย / เติมเงิน / ปิดเดือน)
assert.equal(panel({ status: 'paid', canManagePettyFund: true }), true, 'ผู้ถือวงเงิน (ไม่ใช่แอดมิน) ของวงเงินที่เปิด → true')
// ผู้ใช้ทั่วไปดูใบปกติที่จ่ายแล้วของคนอื่น → ไม่เห็น
assert.equal(panel({ status: 'paid' }), false, 'ผู้ใช้ทั่วไป ใบปกติที่จ่ายแล้ว → false')
for (const status of ['rejected', 'cancelled', 'refund_confirmed']) assert.equal(panel({ status }), false, `ผู้ใช้ทั่วไป ${status} → false`)
// แอดมินเห็นทุกสถานะ
for (const status of ['draft', 'pending', 'approved', 'paid', 'rejected', 'cancelled', 'refund_confirmed']) {
  assert.equal(panel({ status, isAdmin: true }), true, `แอดมิน ${status} → true`)
}
// ใบที่ยังไม่จบ → เห็น (ปุ่มแต่ละปุ่มมีเงื่อนไขของตัวเองข้างใน)
for (const status of ['draft', 'pending', 'approved', 'pending_month_end', 'waiting_tax_invoice']) assert.equal(panel({ status }), true, `${status} → true`)
// เจ้าของใบทดลองจ่ายที่จ่ายแล้ว (ยังเคลียร์ได้) → เห็น
assert.equal(panel({ status: 'paid', canSettleAdvance: true }), true)
// กำลังแก้ไข → ไม่เห็น ไม่ว่าใคร
for (const over of [{ isAdmin: true }, { canManagePettyFund: true }, { canSettleAdvance: true }, { status: 'draft' }]) {
  assert.equal(panel({ ...over, editing: true }), false, `กำลังแก้ไข ${JSON.stringify(over)} → false`)
}

// (d) ใบเสร็จก่อนยื่น (v1.25.0) — ใบงานอีเวนต์/ค่าอื่นๆ ต้องแนบ · ทดลองจ่าย/เงินสดย่อยแนบทีหลังได้
for (const type of ['event', 'other']) assert.equal(receiptRequiredForSubmit(type), true, `${type} → ต้องแนบก่อนยื่น`)
for (const type of ['advance', 'petty_cash']) assert.equal(receiptRequiredForSubmit(type), false, `${type} → ไม่บังคับ`)

// (e) ลำดับสถานะ — ขั้นเดียวกันมีค่าเท่ากัน
assert.equal(STATUS_RANK.draft < STATUS_RANK.pending && STATUS_RANK.pending < STATUS_RANK.approved, true)
assert.equal(STATUS_RANK.waiting_tax_invoice, STATUS_RANK.pending_month_end)
assert.equal(STATUS_RANK.awaiting_payment, STATUS_RANK.pending_month_end)
assert.equal(STATUS_RANK.pending_month_end < STATUS_RANK.paid && STATUS_RANK.paid < STATUS_RANK.refund_confirmed, true)

// (f) แอดมินเปลี่ยนสถานะเอง: เดินหน้า/ปิดใบที่เงินยังไม่ออก ไม่ต้องมีเหตุผล · ถอย/เปิดใบที่ปิดแล้ว/ปิดใบที่จ่ายแล้ว ต้องมี
const forward: [string, string][] = [
  ['draft', 'pending'], ['draft', 'approved'], ['draft', 'paid'], ['pending', 'approved'], ['pending', 'paid'],
  ['approved', 'waiting_tax_invoice'], ['approved', 'pending_month_end'], ['approved', 'paid'], ['waiting_tax_invoice', 'paid'],
  ['pending_month_end', 'paid'], ['pending_month_end', 'waiting_tax_invoice'], ['paid', 'refund_confirmed'],
  ['pending', 'rejected'], ['pending', 'cancelled'], ['draft', 'cancelled'], ['approved', 'cancelled'],
]
for (const [from, to] of forward) {
  assert.equal(reasonRequiredForTransition(from, to), false, `${from} → ${to}: ไม่ต้องมีเหตุผล`)
}
const needsReason: [string, string][] = [
  ['waiting_tax_invoice', 'draft'], ['approved', 'pending'], ['pending', 'draft'], ['pending_month_end', 'approved'],
  ['paid', 'approved'], ['paid', 'pending_month_end'], ['paid', 'draft'], ['refund_confirmed', 'paid'],
  ['paid', 'cancelled'], ['paid', 'rejected'], ['refund_confirmed', 'cancelled'],
  ['rejected', 'draft'], ['rejected', 'pending'], ['cancelled', 'draft'], ['cancelled', 'pending'], ['x', 'paid'],
]
for (const [from, to] of needsReason) {
  assert.equal(reasonRequiredForTransition(from, to), true, `${from} → ${to}: ต้องมีเหตุผล`)
}
// ถอยจริง vs ปิดใบที่จ่ายแล้ว (ไม่ใช่การถอย แต่ต้องมีเหตุผล)
assert.equal(isBackwardTransition('approved', 'pending'), true)
assert.equal(isBackwardTransition('pending_month_end', 'waiting_tax_invoice'), false, 'ขั้นเดียวกัน ไม่นับว่าถอย')
assert.equal(isBackwardTransition('paid', 'cancelled'), false, 'ปิดใบ ไม่นับว่าถอย')
assert.equal(isBackwardTransition('rejected', 'pending'), true, 'เปิดใบที่ปิดแล้ว = ถอย')
assert.equal(isBackwardTransition('x', 'paid'), true, 'สถานะที่ไม่รู้จัก = ถอย')

// (g) แก้ข้อมูลใบเบิก ต้องมีเหตุผลเฉพาะใบที่เงินออกไปแล้ว
for (const status of ['paid', 'refund_confirmed']) assert.equal(reasonRequiredForEdit(status), true, `แก้ใบ ${status} → ต้องมีเหตุผล`)
for (const status of ['draft', 'pending', 'approved', 'waiting_tax_invoice', 'pending_month_end', 'rejected']) {
  assert.equal(reasonRequiredForEdit(status), false, `แก้ใบ ${status} → ไม่ต้องมีเหตุผล`)
}

console.log('claim-rules: ผ่านทั้งหมด')
