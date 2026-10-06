// ตรวจกติกาของคิวใบเบิก (claim-queue.ts) — ข้อมูลสังเคราะห์ ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claim-queue.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-queue: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { paymentLock } from './claim-rules'
import { CLAIM_TRANSITIONS } from './claim-transitions'
import type { QueueClaim } from './queue-data'
import {
  BULK_MAX, EMPTY_QUEUE_FILTERS, QUEUE_GROUPS, STALE_DAYS, advanceState, ageAnchor, ageDays, ageText, applyBulkResults,
  bulkEligible, bulkToastText, filterQueue, groupClaims, isStale, nextInGroup, oldestFirst, primaryGroup, queueCounts,
  queueSubmitters, waitingOnAdmin,
} from './claim-queue'

const NOW = new Date('2026-09-30T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 60 * 60 * 1000).toISOString()
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let seq = 0
/** ใบสังเคราะห์ — อายุคิดจาก status_changed_at (ages วัน) เว้นแต่ใส่ทับ */
function claim(status: string, ages: number, over: Partial<QueueClaim> = {}): QueueClaim {
  seq += 1
  return {
    id: uid(seq), claim_number: `EXP-202609-${String(seq).padStart(3, '0')}`, claim_type: 'event',
    title: `ใบทดสอบ ${seq}`, amount: 1000 + seq, vat_mode: 'none', withholding_tax_rate: 0,
    status: status as QueueClaim['status'], category: 'food', submitted_by: uid(900), submitted_at: null,
    approved_at: null, paid_at: null, created_at: ago(100), expense_date: '2026-09-01', funding_source: 'company',
    job_event_id: null, receipt_urls: ['https://fake.test/r.jpg'], actual_receipt_urls: null, tax_invoice_urls: null,
    tax_invoice_numbers: null, refund_slip_urls: null, refund_amount: null, refund_confirmed_at: null,
    actual_spent_amount: null, advance_settled_at: null, pettycash_fund_id: null, reject_reason: null,
    bank_name: null, bank_account_number: null, account_holder_name: null,
    submitter: { id: uid(900), full_name: 'ผู้เบิกทดสอบ' }, job_event: null,
    status_changed_at: ago(ages), deleted_at: null, submitter_outstanding: 0,
    ...over,
  }
}
const ids = (list: { id: string }[]) => list.map(c => c.id)

// ── กลุ่มและลำดับ ────────────────────────────────────────────────────────────
assert.deepEqual(QUEUE_GROUPS.map(g => g.key), ['review', 'tax_invoice', 'pay', 'advance', 'stale'])
assert.deepEqual(QUEUE_GROUPS.map(g => g.labelTh), ['ต้องตรวจ', 'รอใบกำกับภาษี', 'รอจ่าย', 'รอเคลียร์เงินทดลองจ่าย', 'ค้างนาน'])
assert.deepEqual({ ...STALE_DAYS }, { draft: 30, pending: 7, approved: 30, waiting_tax_invoice: 30, pending_month_end: 45, advance_unsettled: 30 })
assert.equal(BULK_MAX, 50)

// ── primaryGroup / advanceState ─────────────────────────────────────────────
assert.equal(primaryGroup(claim('pending', 1)), 'review')
assert.equal(primaryGroup(claim('waiting_tax_invoice', 1)), 'tax_invoice')
for (const s of ['approved', 'pending_month_end', 'awaiting_payment']) assert.equal(primaryGroup(claim(s, 1)), 'pay', s)
const unsettled = claim('paid', 3, { claim_type: 'advance', actual_spent_amount: null })
assert.equal(primaryGroup(unsettled), 'advance')
assert.equal(advanceState(unsettled), 'unsettled')
const refundPending = claim('paid', 3, { claim_type: 'advance', actual_spent_amount: 1500, refund_amount: 500, refund_confirmed_at: null })
assert.equal(primaryGroup(refundPending), 'advance')
assert.equal(advanceState(refundPending), 'refund_pending')
assert.equal(advanceState(claim('paid', 3, { claim_type: 'advance', actual_spent_amount: 2000, refund_amount: 0 })), null)
assert.equal(advanceState(claim('paid', 3, { claim_type: 'advance', actual_spent_amount: 1500, refund_amount: 500, refund_confirmed_at: ago(1) })), null)
assert.equal(advanceState(claim('paid', 3)), null, 'ใบที่ไม่ใช่ทดลองจ่าย')
assert.equal(advanceState(claim('approved', 3, { claim_type: 'advance' })), null, 'ทดลองจ่ายที่ยังไม่จ่าย')
assert.equal(primaryGroup(claim('draft', 1)), null)
assert.equal(primaryGroup(claim('paid', 1)), null)
console.log('PASS  primaryGroup / advanceState')

// ── ค้างนาน ─────────────────────────────────────────────────────────────────
const draftOld = claim('draft', 31)
const draftNew = claim('draft', 29)
const taxOld = claim('waiting_tax_invoice', 31)
const pending3 = claim('pending', 3)
const pending8 = claim('pending', 8)
const pme44 = claim('pending_month_end', 44)
const pme46 = claim('pending_month_end', 46)
const approved31 = claim('approved', 31)
const unsettledOld = claim('paid', 31, { claim_type: 'advance', actual_spent_amount: null })
const all = [pending8, draftOld, draftNew, taxOld, pending3, pme44, pme46, approved31, unsettled, unsettledOld, refundPending]
const groups = groupClaims(all, NOW)
assert.deepEqual(ids(groups.stale).sort(), ids([draftOld, taxOld, pending8, pme46, approved31, unsettledOld]).sort())
assert.ok(!Object.entries(groups).some(([k, list]) => k !== 'stale' && list.includes(draftOld)), 'แบบร่าง 31 วันอยู่เฉพาะกลุ่มค้างนาน')
assert.ok(!Object.values(groups).some(list => list.includes(draftNew)), 'แบบร่าง 29 วันไม่อยู่ในคิว')
assert.ok(groups.tax_invoice.includes(taxOld) && groups.stale.includes(taxOld), 'รอใบกำกับ 31 วันอยู่ทั้งกลุ่มหลักและค้างนาน')
assert.ok(!isStale(pending3, NOW) && isStale(pending8, NOW))
assert.ok(isStale(claim('pending', 7), NOW), 'ครบ 7 วันพอดี = ค้างนาน')
assert.ok(!isStale(pme44, NOW) && isStale(pme46, NOW))
assert.deepEqual(ids(groups.review), ids([pending8, pending3]), 'เรียงเก่าสุดก่อน')
assert.deepEqual(ids(groups.pay), ids([pme46, pme44, approved31]))
// อายุเท่ากัน (3 วัน) → เรียงตามเลขที่ใบเบิก
assert.deepEqual(ids(groups.advance), ids([unsettledOld, unsettled, refundPending]))
for (const [key, list] of Object.entries(groups)) {
  const times = list.map(c => new Date(ageAnchor(c)).getTime())
  assert.deepEqual(times, [...times].sort((a, b) => a - b), `${key}: ต้องเรียงเก่าสุดก่อน`)
}
assert.deepEqual(queueCounts(groups), { review: 2, tax_invoice: 1, pay: 3, advance: 3, stale: 6 })
assert.equal(waitingOnAdmin(groups), 2 + 1 + 3 + 1, 'ทดลองจ่ายนับเฉพาะใบที่รอยืนยันเงินคืน')
console.log('PASS  groupClaims / isStale / เรียงเก่าสุดก่อน / นับงานที่รอคุณ')

// ── อายุ ────────────────────────────────────────────────────────────────────
const base = { status: 'pending', submitted_at: ago(2), approved_at: ago(1), paid_at: ago(0, 5), created_at: ago(9) }
assert.equal(ageAnchor({ ...base, status_changed_at: ago(4) }), ago(4), 'status_changed_at มาก่อน')
assert.equal(ageAnchor({ ...base, status_changed_at: null }), ago(2), 'รออนุมัติ → submitted_at')
assert.equal(ageAnchor({ ...base, status: 'approved', status_changed_at: null }), ago(1), 'อนุมัติแล้ว → approved_at')
assert.equal(ageAnchor({ ...base, status: 'pending_month_end', status_changed_at: null }), ago(1))
assert.equal(ageAnchor({ ...base, status: 'paid', status_changed_at: null }), ago(0, 5), 'จ่ายแล้ว → paid_at')
assert.equal(ageAnchor({ ...base, status: 'draft', status_changed_at: null }), ago(9), 'อื่นๆ → created_at')
assert.equal(ageAnchor({ ...base, submitted_at: null, status_changed_at: null }), ago(9), 'ไม่มีเวลายื่น → created_at')
assert.equal(ageDays({ ...base, status_changed_at: ago(12, 23) }, NOW), 12)
assert.equal(ageText(ago(0, 2), NOW, false), '2 ชม.')
assert.equal(ageText(ago(1, 6), NOW, false), '1 วัน')
assert.equal(ageText(ago(12), NOW, false), '12 วัน')
assert.equal(ageText(new Date(NOW.getTime() - 25 * 60000).toISOString(), NOW, false), '25 นาที')
assert.equal(ageText(new Date(NOW.getTime() + DAY).toISOString(), NOW, false), '1 นาที', 'เวลาในอนาคตไม่ติดลบ')
assert.equal(ageText('not-a-date', NOW, false), '1 นาที')
assert.equal(ageText(ago(12), NOW, true), '12 days')
assert.equal(ageText(ago(1, 1), NOW, true), '1 day')
console.log('PASS  ageAnchor / ageDays / ageText')

// ── ทำทีละหลายใบ ──────────────────────────────────────────────────────────────
const locked = claim('approved', 2, { receipt_urls: [] })
const approvedOk = claim('approved', 2)
const pendingOne = claim('pending', 2)
const pay = bulkEligible('pay', [locked, approvedOk, pendingOne])
assert.deepEqual(ids(pay.eligible), [approvedOk.id])
assert.equal(pay.skipped.length, 2)
assert.deepEqual(pay.skipped.map(s => [s.claim.id, s.reason]), [
  [locked.id, paymentLock(locked).message],
  [pendingOne.id, CLAIM_TRANSITIONS.pay.wrongStatusError],
])
// ข้อความล็อกมีที่ claim-rules.ts ที่เดียว — ชุดตรวจประกอบจากส่วนย่อย (เทคนิคเดียวกับ claim-rules.check.ts)
const LOCK = ['เอกสารไม่ครบ', 'ยังจ่ายไม่ได้'].join(' — ')
assert.equal(paymentLock(locked).message, `${LOCK} (ขาด: ใบเสร็จ)`)
const approve = bulkEligible('approve', [locked, approvedOk, pendingOne])
assert.deepEqual(ids(approve.eligible), [pendingOne.id])
assert.ok(approve.skipped.every(s => s.reason === CLAIM_TRANSITIONS.approve.wrongStatusError))
assert.deepEqual(ids(bulkEligible('request_tax_invoice', [locked, approvedOk]).eligible), [locked.id, approvedOk.id], 'ล็อกการจ่ายไม่กันขอใบกำกับ')
assert.deepEqual(ids(bulkEligible('defer_month_end', [taxOld, pme44, approvedOk]).eligible), [taxOld.id, approvedOk.id])
// ผลลัพธ์: ใบที่สำเร็จออกจากที่เลือก ใบที่ไม่สำเร็จค้างไว้พร้อมข้อความ (server ส่ง id ตัวเล็ก)
const upper = uid(777).toUpperCase()
const sel = new Set([approvedOk.id, locked.id, pendingOne.id, upper])
const applied = applyBulkResults(sel, [
  { id: approvedOk.id, claimNumber: approvedOk.claim_number, ok: true },
  { id: locked.id, claimNumber: locked.claim_number, ok: false, error: `${LOCK} (ขาด: ใบเสร็จ)` },
  { id: upper.toLowerCase(), claimNumber: 'EXP-X', ok: true },
])
assert.deepEqual([...applied.selected].sort(), [locked.id, pendingOne.id].sort(), 'เหลือใบที่ไม่สำเร็จ + ใบที่ไม่ได้ส่ง')
assert.deepEqual([...applied.errors], [[locked.id, `${LOCK} (ขาด: ใบเสร็จ)`]])
assert.deepEqual([...applied.succeeded].sort(), [approvedOk.id, upper].sort())
assert.equal(bulkToastText('อนุมัติ', 'Approve', 2, 1, false), 'อนุมัติแล้ว 2 ใบ · ไม่สำเร็จ 1 ใบ')
assert.equal(bulkToastText('จ่าย', 'Pay', 3, 0, false), 'จ่ายแล้ว 3 ใบ')
console.log('PASS  bulkEligible / applyBulkResults / bulkToastText')

// ── ใบถัดไป · ตัวกรอง ─────────────────────────────────────────────────────────
const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
assert.equal(nextInGroup(list, 'a'), 'b')
assert.equal(nextInGroup(list, 'c'), null, 'ใบสุดท้าย → null')
assert.equal(nextInGroup(list, 'zz'), null)
assert.equal(nextInGroup([], 'a'), null)
const other = claim('pending', 1, { submitted_by: uid(901), submitter: { id: uid(901), full_name: 'ก ทดสอบ' }, claim_type: 'advance', amount: 99999, job_event: { id: 'j', event_name: 'งานริมน้ำ' } })
const pool = oldestFirst([pending8, pending3, other])
assert.deepEqual(ids(filterQueue(pool, { ...EMPTY_QUEUE_FILTERS, q: 'ริมน้ำ' })), [other.id], 'ค้นชื่องาน')
assert.deepEqual(ids(filterQueue(pool, { ...EMPTY_QUEUE_FILTERS, q: pending3.claim_number.toLowerCase() })), [pending3.id], 'ค้นเลขที่')
assert.deepEqual(ids(filterQueue(pool, { ...EMPTY_QUEUE_FILTERS, by: uid(901) })), [other.id])
assert.deepEqual(ids(filterQueue(pool, { ...EMPTY_QUEUE_FILTERS, type: 'advance' })), [other.id])
assert.deepEqual(ids(filterQueue(pool, EMPTY_QUEUE_FILTERS)), ids(pool), 'ค่าเริ่มต้น = เก่าสุดก่อน')
assert.deepEqual(ids(filterQueue(pool, { ...EMPTY_QUEUE_FILTERS, sort: 'newest' })), ids(pool).reverse())
assert.equal(filterQueue(pool, { ...EMPTY_QUEUE_FILTERS, sort: 'amount' })[0].id, other.id)
assert.deepEqual(queueSubmitters(pool).map(p => [p.name, p.count]), [['ก ทดสอบ', 1], ['ผู้เบิกทดสอบ', 2]])
console.log('PASS  nextInGroup / filterQueue / queueSubmitters')

console.log('claim-queue: ผ่านทั้งหมด')
