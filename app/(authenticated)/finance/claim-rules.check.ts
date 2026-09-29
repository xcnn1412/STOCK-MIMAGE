// ตรวจกติกาของใบเบิก (claim-rules.ts) — ข้อมูลสังเคราะห์ทั้งหมด ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claim-rules.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-rules: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { COST_ITEM_STATUSES, canSeeWorkPanel, claimIdFromCostNote, costItemNote, shouldHaveCostItem } from './claim-rules'

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

console.log('claim-rules: ผ่านทั้งหมด')
