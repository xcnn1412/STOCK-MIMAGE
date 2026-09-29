// ตรวจตัวกรองหน้าใบเบิก — ข้อมูลสังเคราะห์ทั้งหมด ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claims-filter.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claims-filter: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import type { ExpenseClaim } from '../costs/types'
import {
  EMPTY_FILTERS, categoryValues, filterClaims, filtersFromQuery, filtersToQuery, financeListHref,
  hasFilters, initialFilters, listQuery, monthOptions, sanitizeFilters, submitterOptions, thaiMonth,
  MAX_BUNDLE_SELECTION, bundleUrl, chunkClaims, claimFileCount, filedState, selectableIds,
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
const full = { status: 'pending', type: 'advance' as const, by: 'u2', category: 'food', month: '2026-09', incomplete: true, q: 'ค่า เดินทาง', filed: 'all' as const }
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

// ── จับชุดเอกสาร + เข้าแฟ้ม ──────────────────────────────────────────────────

// (n) claimFileCount: รวมสี่ช่อง · '' (ใบกำกับที่มีแต่เลขที่) และค่าที่ไม่ใช่สตริงไม่นับ · ช่องที่เป็น null = 0
assert.equal(claimFileCount({ receipt_urls: ['r1', 'r2'], actual_receipt_urls: ['s1'], tax_invoice_urls: ['t1', ''], refund_slip_urls: ['f1'] }), 5)
assert.equal(claimFileCount({ receipt_urls: [], actual_receipt_urls: null, tax_invoice_urls: null, refund_slip_urls: null }), 0)
assert.equal(claimFileCount({ receipt_urls: ['  ', null, 3, 'r'] }), 1)
assert.equal(claimFileCount({}), 0)

// (o) filedState: none / filed / changed
const FILED_AT = '2026-09-29T03:00:00+00:00'
assert.equal(filedState(claim({})), 'none', 'ฐานข้อมูลที่ยังไม่มีคอลัมน์ = ยังไม่เข้าแฟ้ม')
assert.equal(filedState(claim({ filed_at: null, filed_file_count: null })), 'none')
assert.equal(filedState(claim({ filed_at: FILED_AT, filed_file_count: 1 })), 'filed', 'receipt_urls 1 ไฟล์ = ตอนเข้าแฟ้ม')
assert.equal(filedState(claim({ receipt_urls: [], filed_at: FILED_AT, filed_file_count: 0 })), 'filed', 'เข้าแฟ้มตอนไม่มีไฟล์ และยังไม่มีไฟล์ = filed')
assert.equal(filedState(claim({ receipt_urls: ['r1', 'r2'], filed_at: FILED_AT, filed_file_count: 1 })), 'changed', 'ไฟล์เพิ่มหลังเข้าแฟ้ม')
assert.equal(filedState(claim({ receipt_urls: [], filed_at: FILED_AT, filed_file_count: 1 })), 'changed', 'ไฟล์ถูกลบหลังเข้าแฟ้ม')
assert.equal(filedState(claim({ tax_invoice_urls: ['t1'], filed_at: FILED_AT, filed_file_count: 1 })), 'changed', 'นับใบกำกับภาษีด้วย')
assert.equal(filedState(claim({ tax_invoice_urls: [''], tax_invoice_numbers: ['IV-1'], filed_at: FILED_AT, filed_file_count: 1 })), 'filed', 'ใส่เลขที่ใบกำกับอย่างเดียวไม่ใช่ไฟล์')

// (p) ตัวกรอง filed
const filedSet = [
  claim({ id: 'n' }),                                                                   // ยังไม่เข้าแฟ้ม
  claim({ id: 'f', filed_at: FILED_AT, filed_file_count: 1 }),                          // เข้าแฟ้มแล้ว
  claim({ id: 'z', receipt_urls: [], filed_at: FILED_AT, filed_file_count: 0 }),        // เข้าแฟ้มแล้ว ไม่มีไฟล์
  claim({ id: 'x', receipt_urls: ['a', 'b'], filed_at: FILED_AT, filed_file_count: 1 }), // ไฟล์เปลี่ยน
]
const filedIds = (filed: typeof EMPTY_FILTERS['filed']) => ids(filterClaims(filedSet, { ...EMPTY_FILTERS, filed }, 'expense_date'))
assert.equal(filedIds('all'), 'nfzx')
assert.equal(filedIds('no'), 'n', 'filed=no = เฉพาะใบที่ filed_at ว่าง')
assert.equal(filedIds('yes'), 'fzx', 'filed=yes รวมใบที่ไฟล์เปลี่ยน')
assert.equal(filedIds('changed'), 'x', 'filed=changed = เฉพาะจำนวนไฟล์ ≠ filed_file_count')
assert.equal(ids(filterClaims(claims, { ...EMPTY_FILTERS, filed: 'no' }, 'expense_date')), 'abcd', 'ข้อมูลที่ไม่มีคอลัมน์ = ยังไม่เข้าแฟ้มทั้งหมด')
assert.equal(hasFilters({ ...EMPTY_FILTERS, filed: 'no' }), true)
assert.equal(hasFilters({ ...EMPTY_FILTERS, filed: 'all' }), false)
assert.equal(filtersToQuery({ ...EMPTY_FILTERS, filed: 'changed' }), '?filed=changed')
assert.equal(filtersToQuery({ ...EMPTY_FILTERS, filed: 'all' }), '', 'all ไม่ลง URL')
for (const v of ['no', 'yes', 'changed'] as const) {
  assert.equal(filtersFromQuery(new URLSearchParams(filtersToQuery({ ...EMPTY_FILTERS, filed: v }))).filed, v)
}
assert.equal(filtersFromQuery(new URLSearchParams('filed=maybe')).filed, 'all', 'ค่าแปลกถูกทิ้ง')
assert.equal(filtersFromQuery(new URLSearchParams('filed=YES')).filed, 'all')

// (q) chunkClaims: เรียงเลขที่ใบเบิกน้อย → มาก แล้วแบ่งกลุ่มละ 20 · 45 ใบ → 20 / 20 / 5
const numbered = (n: number) => ({ id: `id-${n}`, claim_number: `EXP-202609-${String(n).padStart(3, '0')}` })
const shuffled = Array.from({ length: 45 }, (_, i) => numbered(((i * 17) % 45) + 1))
const snapshot = JSON.stringify(shuffled)
const chunks = chunkClaims(shuffled)
assert.deepEqual(chunks.map(g => g.length), [20, 20, 5])
assert.deepEqual(chunks.flat().map(c => c.claim_number), Array.from({ length: 45 }, (_, i) => numbered(i + 1).claim_number))
assert.equal(JSON.stringify(shuffled), snapshot, 'ไม่แก้ array ที่ส่งเข้ามา')
assert.deepEqual(chunkClaims([]), [])
assert.deepEqual(chunkClaims(shuffled.slice(0, 7), 3).map(g => g.length), [3, 3, 1])
assert.deepEqual(chunkClaims([numbered(1)]), [[numbered(1)]])
// เลขที่ยาวเกิน 3 หลัก เทียบแบบตัวเลข
assert.deepEqual(
  chunkClaims([{ claim_number: 'EXP-202609-1000' }, { claim_number: 'EXP-202609-999' }, { claim_number: 'EXP-202608-500' }]).flat().map(c => c.claim_number),
  ['EXP-202608-500', 'EXP-202609-999', 'EXP-202609-1000'],
)

// (r) bundleUrl
assert.equal(bundleUrl(['a', 'b'], { layout: 'two', duplex: true }), '/api/pdf/claim-bundle?ids=a,b&layout=two&duplex=1')
assert.equal(bundleUrl(['a', 'b'], { layout: 'two', duplex: false }), '/api/pdf/claim-bundle?ids=a,b&layout=two')
assert.equal(bundleUrl(['a'], { layout: 'one', duplex: false }), '/api/pdf/claim-bundle?ids=a&layout=one')
assert.ok(!bundleUrl(['a'], { layout: 'one', duplex: false }).includes('duplex'))

// (s) selectableIds: 250 ใบ (สลับลำดับ) → 200 ใบแรกตามเลขที่ใบเบิก
const many = Array.from({ length: 250 }, (_, i) => numbered(((i * 101) % 250) + 1))
assert.equal(new Set(many.map(c => c.id)).size, 250)
assert.equal(MAX_BUNDLE_SELECTION, 200)
assert.deepEqual(selectableIds(many), Array.from({ length: 200 }, (_, i) => `id-${i + 1}`))
assert.deepEqual(selectableIds(many.slice(0, 3)), [...many.slice(0, 3)].sort((a, b) => a.claim_number.localeCompare(b.claim_number)).map(c => c.id))
assert.deepEqual(selectableIds([]), [])

console.log('claims-filter: ผ่านทั้งหมด')
