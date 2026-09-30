// ตรวจชุดสถานะและเงื่อนไขกลางของใบเบิก (lib/finance/conditions.ts) — ข้อมูลสังเคราะห์ ไม่แตะฐานข้อมูล
// Run:  npx tsx lib/finance/conditions.check.ts
//
// เทียบกับสูตรเดิมที่พิมพ์ซ้ำอยู่ในโค้ด (คัดลอกมาไว้ในไฟล์นี้ — ไม่ import จากไฟล์เดิม เพราะไฟล์เดิมจะย้ายมาใช้ conditions.ts):
//   - claims-list-view.tsx (activeClaims): สถานะยังไม่จบ || ทดลองจ่ายยังไม่เคลียร์ || วงเงินสดย่อยยังเปิด
//   - actions.ts getClaims({ open: true }): สามชุดของ PostgREST (not.in / is null) — ความหมายแบบ SQL
//   - queue-data.ts OPEN_STATUSES และ getPaidMonths / หน้าคลังเก็บ ['paid', 'refund_confirmed']
// ชุดทดสอบ = ทุกค่ารวมกันของ สถานะ × ประเภท × actual_spent_amount × pettycash_fund_id × pettycash_closed_at
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "conditions: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { CLAIM_STATUSES } from '../../app/(authenticated)/costs/types'
import {
  OPEN_STATUSES, PAID_STATUSES, TERMINAL_STATUSES, isOpenClaim, isOpenFund, isPaidLike, isUnsettledAdvance,
  type ClaimConditionFields,
} from './conditions'

const pass = (label: string) => console.log(`PASS  ${label}`)

// ── ชุดสถานะ ────────────────────────────────────────────────────────────────
const ALL = CLAIM_STATUSES.map(s => s.value as string)
for (const [name, list] of [['TERMINAL_STATUSES', TERMINAL_STATUSES], ['PAID_STATUSES', PAID_STATUSES], ['OPEN_STATUSES', OPEN_STATUSES]] as const) {
  assert.equal(new Set(list).size, list.length, `${name}: มีค่าซ้ำ`)
  for (const s of list) assert.ok(ALL.includes(s), `${name}: ไม่รู้จักสถานะ ${s}`)
}
assert.deepEqual([...TERMINAL_STATUSES], ['paid', 'cancelled', 'refund_confirmed'], 'ตรงกับ not.in.(paid,cancelled,refund_confirmed) ของ getClaims')
assert.deepEqual([...PAID_STATUSES], ['paid', 'refund_confirmed'], 'ตรงกับ getPaidMonths / หน้าคลังเก็บ')
assert.deepEqual(
  [...OPEN_STATUSES],
  ['draft', 'pending', 'approved', 'waiting_tax_invoice', 'pending_month_end', 'awaiting_payment'],
  'ตรงกับ OPEN_STATUSES เดิมของ queue-data.ts',
)
assert.ok(PAID_STATUSES.every(s => TERMINAL_STATUSES.includes(s)), 'จ่ายแล้วเป็นสถานะจบ')
assert.ok(OPEN_STATUSES.every(s => !TERMINAL_STATUSES.includes(s)), 'สถานะในคิวไม่ใช่สถานะจบ')
assert.deepEqual(
  [...new Set([...OPEN_STATUSES, ...TERMINAL_STATUSES, 'rejected'])].sort(),
  [...ALL].sort(),
  'คิว + จบ + ปฏิเสธ = ทุกสถานะ (ไม่มีสถานะตกหล่น)',
)
pass(`ชุดสถานะ: TERMINAL ${TERMINAL_STATUSES.length} · PAID ${PAID_STATUSES.length} (อยู่ใน TERMINAL) · OPEN ${OPEN_STATUSES.length} (ไม่ทับ TERMINAL) · OPEN + TERMINAL + rejected = ${ALL.length} สถานะของ CLAIM_STATUSES`)

// ── สูตรเดิม (คัดลอก) ───────────────────────────────────────────────────────────
type Row = ClaimConditionFields

/** claims-list-view.tsx — isUnsettledAdvance / isOpenPettyCash / activeClaims */
const viewUnsettled = (c: Row) => c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount == null
const viewOpenPetty = (c: Row) =>
  c.claim_type === 'petty_cash' && !c.pettycash_fund_id && c.status === 'paid' && c.pettycash_closed_at == null
const viewActive = (c: Row) =>
  (c.status !== 'paid' && c.status !== 'cancelled' && c.status !== 'refund_confirmed') || viewUnsettled(c) || viewOpenPetty(c)

/** actions.ts getClaims({ open: true }) ตามความหมายของ SQL: NULL ไม่ผ่าน not.in / eq · undefined = ไม่ได้อ่านคอลัมน์ = NULL */
const isNull = (v: unknown) => v === null || v === undefined
const sqlOpen = (c: Row) =>
  (!isNull(c.status) && !['paid', 'cancelled', 'refund_confirmed'].includes(c.status as string))
  || (c.claim_type === 'advance' && c.status === 'paid' && isNull(c.actual_spent_amount))
  || (c.claim_type === 'petty_cash' && isNull(c.pettycash_fund_id) && c.status === 'paid' && isNull(c.pettycash_closed_at))

// ── ชุดทดสอบ: ทุกค่ารวมกัน ─────────────────────────────────────────────────────
const STATUS_VALUES: (string | null | undefined)[] = [...ALL, 'unknown', '', null, undefined]
const TYPE_VALUES: (string | null | undefined)[] = ['event', 'other', 'advance', 'petty_cash', 'ADVANCE', null, undefined]
const SPENT_VALUES: (number | null | undefined)[] = [null, undefined, 0, 50]
const FUND_VALUES: (string | null | undefined)[] = [null, undefined, '', '00000000-0000-4000-8000-000000000099']
const CLOSED_VALUES: (string | null | undefined)[] = [null, undefined, '2026-09-30T10:00:00+00:00']

const corpus: Row[] = []
for (const status of STATUS_VALUES) for (const claim_type of TYPE_VALUES) for (const actual_spent_amount of SPENT_VALUES)
  for (const pettycash_fund_id of FUND_VALUES) for (const pettycash_closed_at of CLOSED_VALUES)
    corpus.push({ status, claim_type, actual_spent_amount, pettycash_fund_id, pettycash_closed_at })

let open = 0, unsettled = 0, openFunds = 0, paidLike = 0, sqlCompared = 0
for (const c of corpus) {
  const label = JSON.stringify(c)
  assert.equal(isUnsettledAdvance(c), viewUnsettled(c), `isUnsettledAdvance ${label}`)
  assert.equal(isOpenFund(c), viewOpenPetty(c), `isOpenFund ${label}`)
  assert.equal(isOpenClaim(c), viewActive(c), `isOpenClaim ≠ สูตรของ claims-list-view ${label}`)
  assert.equal(isPaidLike(c), c.status === 'paid' || c.status === 'refund_confirmed', `isPaidLike ${label}`)
  // แถวจริงจากฐานข้อมูล: status ไม่ว่าง (NOT NULL) และ pettycash_fund_id เป็น uuid หรือ NULL — ความหมายแบบ SQL ต้องตรงด้วย
  if (!isNull(c.status) && c.pettycash_fund_id !== '') {
    assert.equal(isOpenClaim(c), sqlOpen(c), `isOpenClaim ≠ สามชุดของ getClaims({ open: true }) ${label}`)
    sqlCompared++
  }
  if (isOpenClaim(c)) open++
  if (isUnsettledAdvance(c)) unsettled++
  if (isOpenFund(c)) openFunds++
  if (isPaidLike(c)) paidLike++
}
assert.ok(unsettled > 0 && openFunds > 0 && open > unsettled + openFunds && paidLike > 0, 'ชุดทดสอบต้องมีทุกกิ่ง')
// จุดที่ต่างกันง่าย: 0 คือเคลียร์แล้ว · เติมเงิน (มี fund_id) ไม่ใช่วงเงินที่เปิด · ปิดเดือนแล้วไม่เปิด
assert.equal(isUnsettledAdvance({ claim_type: 'advance', status: 'paid', actual_spent_amount: 0 }), false)
assert.equal(isOpenClaim({ claim_type: 'advance', status: 'paid', actual_spent_amount: 0 }), false)
assert.equal(isOpenClaim({ claim_type: 'petty_cash', status: 'paid', pettycash_fund_id: 'f' }), false)
assert.equal(isOpenClaim({ claim_type: 'petty_cash', status: 'paid', pettycash_closed_at: '2026-09-30T10:00:00+00:00' }), false)
assert.equal(isOpenClaim({ claim_type: 'petty_cash', status: 'paid' }), true)
assert.equal(isOpenClaim({ claim_type: 'event', status: 'rejected' }), true, 'ปฏิเสธยังไม่จบ (รอผู้เบิกแก้)')
assert.equal(isOpenClaim({ claim_type: 'advance', status: 'refund_confirmed', actual_spent_amount: null }), false)
pass(`isOpenClaim / isUnsettledAdvance / isOpenFund / isPaidLike ตรงกับสูตรของ claims-list-view ทุกกรณี (${corpus.length} แบบ) และตรงกับสามชุดของ getClaims({ open: true }) ${sqlCompared} แบบ (แถวที่ status ไม่ว่าง) · ยังไม่จบ ${open} · ทดลองจ่ายค้าง ${unsettled} · วงเงินเปิด ${openFunds}`)

console.log('\nconditions: ผ่านทั้งหมด')
