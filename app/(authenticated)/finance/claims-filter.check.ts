// ตรวจตัวกรองหน้าใบเบิก — ข้อมูลสังเคราะห์ทั้งหมด ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claims-filter.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claims-filter: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import type { ExpenseClaim } from '../costs/types'
import {
  EMPTY_FILTERS, categoryValues, filterClaims, filtersFromQuery, filtersToQuery, financeListHref,
  hasFilters, initialFilters, listQuery, monthOptions, sanitizeFilters, submitterOptions, thaiMonth,
} from './claims-filter'

const claim = (over: Partial<ExpenseClaim>): ExpenseClaim => ({
  id: 'c', claim_number: 'EXP-202609-001', claim_type: 'event', title: 'ค่าเดินทาง', category: 'travel',
  amount: 100, status: 'pending', submitted_by: 'u1', expense_date: '2026-09-10', paid_at: null,
  receipt_urls: ['r.jpg'], submitter: { id: 'u1', full_name: 'พนักงาน หนึ่ง' },
  ...over,
} as ExpenseClaim)

const claims = [
  claim({ id: 'a' }),
  claim({ id: 'b', claim_number: 'EXP-202609-002', submitted_by: 'u2', submitter: { id: 'u2', full_name: 'พนักงาน สอง' }, category: 'food', claim_type: 'other', title: 'อาหารทีมงาน', expense_date: '2026-08-31' }),
  claim({ id: 'c', claim_number: 'EXP-202609-003', receipt_urls: [], job_event: { id: 'e', event_name: 'งานแต่ง Riverside' } }),
  // จ่ายตี 1 วันที่ 1 ต.ค. เวลาไทย = 18:30 ของ 30 ก.ย. ตามเวลา UTC
  claim({ id: 'd', claim_number: 'EXP-202609-004', status: 'paid', paid_at: '2026-09-30T18:30:00+00:00' }),
]
const ids = (list: ExpenseClaim[]) => list.map(c => c.id).join('')
const only = (patch: Partial<typeof EMPTY_FILTERS>, field: 'expense_date' | 'paid_at' = 'expense_date') =>
  ids(filterClaims(claims, { ...EMPTY_FILTERS, ...patch }, field))

// (a) ไม่กรอง = ได้ครบ
assert.equal(only({}), 'abcd')

// (b) กรองทีละอย่าง
assert.equal(only({ by: 'u2' }), 'b', 'ผู้เบิก')
assert.equal(only({ type: 'other' }), 'b', 'ประเภท')
assert.equal(only({ category: 'travel' }), 'acd', 'หมวดหมู่')
assert.equal(only({ incomplete: true }), 'c', 'เอกสารไม่ครบ = ไม่มีใบเสร็จ')
assert.equal(only({ month: '2026-08' }), 'b', 'เดือนตามวันที่ใช้จ่าย')

// (c) ค้นหา: เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน — ไม่สนตัวพิมพ์และช่องว่างหัวท้าย
assert.equal(only({ q: '  exp-202609-002 ' }), 'b')
assert.equal(only({ q: 'อาหาร' }), 'b')
assert.equal(only({ q: 'สอง' }), 'b')
assert.equal(only({ q: 'riverside' }), 'c')
assert.equal(only({ q: 'ไม่มีคำนี้' }), '')

// (d) หลายตัวกรองพร้อมกัน = ต้องผ่านทุกข้อ
assert.equal(only({ by: 'u1', category: 'travel', incomplete: true }), 'c')
assert.equal(only({ by: 'u2', type: 'event' }), '')

// (e) เดือนตามเวลาไทย: จ่ายตี 1 ของวันที่ 1 ต.ค. นับเป็นตุลาคม ไม่ใช่กันยายน
assert.equal(thaiMonth('2026-09-30T18:30:00+00:00'), '2026-10')
assert.equal(thaiMonth('2026-09-30T16:59:59+00:00'), '2026-09')
assert.equal(thaiMonth('2026-09-10'), '2026-09')
assert.equal(thaiMonth(null), '')
assert.equal(thaiMonth('ไม่ใช่วันที่'), '')
assert.equal(only({ month: '2026-10' }, 'paid_at'), 'd')
assert.equal(only({ month: '2026-09' }, 'paid_at'), '', 'ใบที่ยังไม่จ่ายไม่มีเดือนจ่าย')

// (f) query string ไป-กลับได้ค่าเดิม และหน้าที่ไม่กรองไม่มี query
const full = { status: 'pending', type: 'advance' as const, by: 'u2', category: 'food', month: '2026-09', incomplete: true, q: 'ค่า เดินทาง' }
assert.deepEqual(filtersFromQuery(new URLSearchParams(filtersToQuery(full))), full)
assert.equal(filtersToQuery(EMPTY_FILTERS), '')
assert.equal(filtersToQuery({ ...EMPTY_FILTERS, q: '   ' }), '')

// (g) ค่าแปลกใน URL ถูกทิ้ง
assert.deepEqual(
  filtersFromQuery(new URLSearchParams('status=hacked&type=x&month=2026-13&docs=1&q=' + 'ก'.repeat(300))),
  { ...EMPTY_FILTERS, q: 'ก'.repeat(100) },
)

// (h) ผู้เบิก/หมวดที่ไม่มีในข้อมูล และแท็บชำระแล้วของคนที่ไม่ใช่แอดมิน ถูกตัดออก
assert.deepEqual(
  sanitizeFilters({ ...EMPTY_FILTERS, status: 'paid', by: 'nobody', category: 'ghost', month: '2026-09' }, claims, false),
  { ...EMPTY_FILTERS, month: '2026-09' },
)
assert.deepEqual(
  sanitizeFilters({ ...EMPTY_FILTERS, status: 'paid', by: 'u2', category: 'food' }, claims, true),
  { ...EMPTY_FILTERS, status: 'paid', by: 'u2', category: 'food' },
)

// (i) hasFilters ไม่นับแท็บสถานะ
assert.equal(hasFilters({ ...EMPTY_FILTERS, status: 'pending' }), false)
assert.equal(hasFilters({ ...EMPTY_FILTERS, by: 'u1' }), true)
assert.equal(hasFilters({ ...EMPTY_FILTERS, q: '  ' }), false)

// (j) ตัวเลือก: รายชื่อมาจากข้อมูลทั้งหมด จำนวนนับจากชุดที่แสดง · เดือนใหม่ → เก่า รวมเดือนที่เลือกอยู่
assert.deepEqual(submitterOptions(claims, claims.slice(0, 1)), [
  { id: 'u2', name: 'พนักงาน สอง', count: 0 },
  { id: 'u1', name: 'พนักงาน หนึ่ง', count: 1 },
])
assert.deepEqual(monthOptions(claims, 'expense_date', ''), ['2026-09', '2026-08'])
assert.deepEqual(monthOptions(claims, 'expense_date', '2026-01'), ['2026-09', '2026-08', '2026-01'])
assert.deepEqual(monthOptions(claims, 'paid_at', ''), ['2026-10'])
assert.deepEqual(categoryValues(claims).sort(), ['food', 'travel'])

// (k) ไม่มี sessionStorage (ฝั่ง server / ปิด storage) → กลับหน้ารายการแบบไม่กรอง ไม่ล้ม
assert.equal(financeListHref(), '/finance')

// (l) listQuery: แท็บชำระแล้วใส่เดือนที่ server โหลดมา (ไม่ใช่เดือนที่ใช้จ่ายที่ค้างใน state) · แท็บอื่นใช้เดือนที่ใช้จ่าย
const paidTab = { ...EMPTY_FILTERS, status: 'paid', month: '2026-08', by: 'u2', q: 'ค่า' }
const paidQuery = new URLSearchParams(listQuery(paidTab, '2026-09'))
assert.equal(paidQuery.get('status'), 'paid')
assert.equal(paidQuery.get('month'), '2026-09', 'เดือนใน URL ของแท็บชำระแล้ว = เดือนที่โหลดอยู่')
assert.equal(paidQuery.get('by'), 'u2', 'ตัวกรองอื่นยังอยู่ครบ')
assert.equal(listQuery({ ...EMPTY_FILTERS, status: 'paid', month: '2026-08' }, ''), '?status=paid', 'ยังไม่มีเดือนที่จ่าย = ไม่มี month')
assert.equal(listQuery({ ...EMPTY_FILTERS, month: '2026-08' }, '2026-09'), '?month=2026-08', 'แท็บอื่นไม่สนเดือนที่โหลด')
assert.equal(listQuery({ ...EMPTY_FILTERS, status: 'pending' }, '2026-09'), '?status=pending')
assert.equal(listQuery(EMPTY_FILTERS, '2026-09'), '')

// (m) initialFilters: month ใน URL ของแท็บชำระแล้วคือเดือนที่จ่าย — ห้ามกลายเป็นตัวกรองเดือนที่ใช้จ่าย
const fromUrl = (qs: string, isAdmin: boolean) => initialFilters(new URLSearchParams(qs), claims, isAdmin)
assert.deepEqual(fromUrl('status=paid&month=2026-05', true), { ...EMPTY_FILTERS, status: 'paid' })
assert.equal(fromUrl('status=paid&month=2026-05', true).month, '')
// คนที่ไม่ใช่แอดมินตกไปแท็บ "ทั้งหมด" และต้องไม่ได้ตัวกรองเดือนที่ใช้จ่าย 2026-05 ติดมา
assert.deepEqual(fromUrl('status=paid&month=2026-05', false), EMPTY_FILTERS)
// แท็บอื่น: month คือเดือนที่ใช้จ่ายตามเดิม · ค่าอื่นผ่าน sanitizeFilters เหมือนเดิม
assert.deepEqual(fromUrl('status=pending&month=2026-05&by=u2&cat=ghost', false), { ...EMPTY_FILTERS, status: 'pending', month: '2026-05', by: 'u2' })
assert.deepEqual(fromUrl('month=2026-05', true), { ...EMPTY_FILTERS, month: '2026-05' })
// ไป-กลับ: URL ที่ listQuery สร้างให้แท็บชำระแล้ว อ่านกลับได้ตัวกรองเดิมยกเว้นเดือน
assert.deepEqual(fromUrl(listQuery(paidTab, '2026-09').slice(1), true), { ...paidTab, month: '' })

console.log('claims-filter: ผ่านทั้งหมด')
