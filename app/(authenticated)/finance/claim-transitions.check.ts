// ตรวจตารางการเปลี่ยนสถานะใบเบิก (claim-transitions.ts) — ข้อมูลสังเคราะห์ ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claim-transitions.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-transitions: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { CLAIM_STATUSES } from '../costs/types'
import { BULK_TRANSITIONS, CLAIM_TRANSITIONS, findTransition, transitionsFor, type TransitionKey } from './claim-transitions'

const statuses = CLAIM_STATUSES.map(s => s.value as string)
const all = Object.values(CLAIM_TRANSITIONS)
const keysOf = (list: { key: TransitionKey }[]) => list.map(t => t.key)

// (a) ทุกแถว: ชื่อตรงกับคีย์ · from/to เป็นสถานะที่มีจริง
assert.equal(all.length, 10)
for (const [key, t] of Object.entries(CLAIM_TRANSITIONS)) {
  assert.equal(t.key, key, `${key}: key ต้องตรงกับชื่อแถว`)
  assert.ok(t.from.length > 0, `${key}: from ต้องไม่ว่าง`)
  for (const s of t.from) assert.ok(statuses.includes(s), `${key}: from '${s}' ไม่ใช่สถานะใน CLAIM_STATUSES`)
  assert.ok(statuses.includes(t.to), `${key}: to '${t.to}' ไม่ใช่สถานะใน CLAIM_STATUSES`)
  assert.ok(!(t.from as readonly string[]).includes(t.to), `${key}: from ต้องไม่รวมสถานะปลายทาง`)
  assert.ok(t.labelTh && t.labelEn && t.wrongStatusError && t.logAction, `${key}: ข้อความต้องครบ`)
}

// (b) ผู้เบิกไม่เห็นการกระทำของแอดมิน · แอดมินที่ไม่ใช่เจ้าของไม่เห็นการกระทำของเจ้าของ
for (const status of statuses) {
  assert.ok(transitionsFor(status, { isAdmin: false, isOwner: true }).every(t => t.actor === 'owner'), `${status}: เจ้าของใบได้การกระทำของแอดมิน`)
  assert.ok(transitionsFor(status, { isAdmin: true, isOwner: false }).every(t => t.actor === 'admin'), `${status}: แอดมินได้การกระทำของเจ้าของ`)
  assert.deepEqual(transitionsFor(status, { isAdmin: false, isOwner: false }), [], `${status}: คนอื่นต้องไม่ได้อะไรเลย`)
}
assert.deepEqual(keysOf(transitionsFor('pending', { isAdmin: true, isOwner: false })), ['approve', 'approve_month_end', 'reject', 'send_back'])
assert.deepEqual(keysOf(transitionsFor('draft', { isAdmin: false, isOwner: true })), ['submit', 'cancel'])
assert.deepEqual(keysOf(transitionsFor('pending', { isAdmin: false, isOwner: true })), ['cancel'])
assert.deepEqual(keysOf(transitionsFor('rejected', { isAdmin: false, isOwner: true })), ['reopen'])
assert.deepEqual(keysOf(transitionsFor('approved', { isAdmin: true, isOwner: false })), ['send_back', 'request_tax_invoice', 'defer_month_end', 'pay'])
for (const status of ['paid', 'refund_confirmed', 'cancelled']) {
  assert.deepEqual(transitionsFor(status, { isAdmin: true, isOwner: true }), [], `${status}: ไม่มีการกระทำในตาราง`)
}

// (c) ส่งกลับให้แก้ และ จ่าย
assert.deepEqual([...CLAIM_TRANSITIONS.send_back.from], ['pending', 'approved', 'waiting_tax_invoice', 'pending_month_end'])
assert.equal(CLAIM_TRANSITIONS.send_back.reason, 'required')
assert.equal(CLAIM_TRANSITIONS.send_back.to, 'draft')
assert.equal(CLAIM_TRANSITIONS.send_back.activity, 'SEND_BACK_EXPENSE_CLAIM')
assert.deepEqual([...CLAIM_TRANSITIONS.pay.from], ['approved', 'awaiting_payment', 'pending_month_end', 'waiting_tax_invoice'])
assert.equal(CLAIM_TRANSITIONS.reject.reason, 'optional')

// (d) ทำทีละหลายใบ: เฉพาะการกระทำของแอดมินที่ bulk: true และครบทุกแถวที่ bulk: true
assert.deepEqual([...BULK_TRANSITIONS], ['approve', 'approve_month_end', 'request_tax_invoice', 'defer_month_end', 'pay'])
for (const key of BULK_TRANSITIONS) {
  assert.equal(CLAIM_TRANSITIONS[key].bulk, true, `${key}: ต้อง bulk: true`)
  assert.equal(CLAIM_TRANSITIONS[key].actor, 'admin', `${key}: ต้องเป็นของแอดมิน`)
}
assert.deepEqual(all.filter(t => t.bulk).map(t => t.key).sort(), [...BULK_TRANSITIONS].sort())

// (e) findTransition: สถานะไม่ตรง / ชื่อไม่รู้จัก → null · ไม่ใส่ from → แถวของชื่อนั้น
assert.equal(findTransition('approve', 'pending'), CLAIM_TRANSITIONS.approve)
assert.equal(findTransition('approve', 'approved'), null)
assert.equal(findTransition('approve', null), null)
assert.equal(findTransition('approve'), CLAIM_TRANSITIONS.approve)
assert.equal(findTransition('pay', 'waiting_tax_invoice'), CLAIM_TRANSITIONS.pay)
for (const bad of ['delete', '', 'constructor', 'toString', '__proto__', 'hasOwnProperty']) {
  assert.equal(findTransition(bad), null, `ชื่อ '${bad}' ต้องได้ null`)
  assert.equal(findTransition(bad, 'pending'), null)
}

// (f) ข้อความสถานะไม่ตรง = ข้อความเดิมของ action (มีแค่ send_back ที่ใหม่)
assert.deepEqual(Object.fromEntries(all.map(t => [t.key, t.wrongStatusError])), {
  submit: 'ยื่นได้เฉพาะใบเบิกที่อยู่ในสถานะ "แบบร่าง" เท่านั้น',
  cancel: 'ยกเลิกได้เฉพาะใบเบิกที่อยู่ในสถานะ "แบบร่าง" หรือ "รออนุมัติ" เท่านั้น',
  approve: 'อนุมัติได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น',
  approve_month_end: 'อนุมัติได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น',
  reject: 'ปฏิเสธได้เฉพาะใบเบิกที่อยู่ในสถานะ "รออนุมัติ" เท่านั้น',
  send_back: 'ส่งกลับให้แก้ได้เฉพาะใบที่รออนุมัติ อนุมัติแล้ว รอใบกำกับภาษี หรือรอจ่ายสิ้นเดือน',
  reopen: 'เปิดกลับมาแก้ไขได้เฉพาะใบเบิกที่ถูกปฏิเสธ',
  request_tax_invoice: 'ขอใบกำกับภาษีได้เฉพาะใบเบิกที่อยู่ในสถานะ "อนุมัติแล้ว" เท่านั้น',
  defer_month_end: 'เลื่อนจ่ายสิ้นเดือนได้เฉพาะใบเบิกที่อนุมัติแล้วเท่านั้น',
  pay: 'ชำระเงินได้เฉพาะใบเบิกที่อนุมัติแล้วเท่านั้น',
})
// ค่าในประวัติ (expense_claim_logs.action) ตรงกับที่ action เคยเขียน
assert.deepEqual(Object.fromEntries(all.map(t => [t.key, t.logAction])), {
  submit: 'submit', cancel: 'cancel', approve: 'approve', approve_month_end: 'approve_month_end', reject: 'reject',
  send_back: 'send_back', reopen: 'reopen', request_tax_invoice: 'waiting_tax_invoice', defer_month_end: 'defer_month_end', pay: 'mark_paid',
})

console.log('claim-transitions: ผ่านทั้งหมด')
