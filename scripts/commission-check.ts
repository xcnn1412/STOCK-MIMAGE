// สรุปค่าคอมแอดมิน — ตรวจกติกาการนับใน commission-logic.ts (ไม่มี test runner ใน repo)
// Run:  npx tsx scripts/commission-check.ts
// ไม่แตะ DB — fixture สังเคราะห์ทั้งหมด (ห้ามใช้ชื่อลูกค้าจริง)

import assert from 'node:assert/strict'
import {
  buildCommission, buildExportSheet, buildLockDates, commissionPeriod, defaultPeriodMonth,
  bangkokDay, isWonStatus, mergeTargets,
  type CommissionLead, type StatusActivity,
} from '../app/(authenticated)/sales-board/commission-logic'

let failed = 0
function check(id: string, name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${id} ${name}`)
  } catch (e) {
    failed++
    console.log(`FAIL  ${id} ${name} — ${(e as Error).message}`)
  }
}

const lead = (id: string, over: Partial<CommissionLead> = {}): CommissionLead => ({
  id, status: 'accepted', customer_name: `ลูกค้า ${id}`, customer_line: null,
  event_date: '2026-07-01', event_end_date: null, work_type: 'event', unit_count: null,
  quotation_ref: `QT-${id}`, created_at: '2026-01-01T03:00:00Z', ...over,
})
const act = (lead_id: string, created_at: string, new_status: string): StatusActivity =>
  ({ lead_id, created_at, new_status, activity_type: 'status_change' })
const JUN = { from: '2026-05-25', to: '2026-06-25' }
const JUL = { from: '2026-06-25', to: '2026-07-25' }
const run = (leads: CommissionLead[], acts: StatusActivity[], range = JUN) =>
  buildCommission({ leads, lockDates: buildLockDates(acts), ...range })
const codesOf = (leadId: string, r: ReturnType<typeof run>) =>
  r.warnings.filter((w) => w.leadId === leadId).map((w) => w.code).sort()

check('C1', 'commissionPeriod', () => {
  assert.deepEqual(commissionPeriod('2026-06'), JUN)
  assert.deepEqual(commissionPeriod('2026-07'), JUL)
  assert.deepEqual(commissionPeriod('2026-01'), { from: '2025-12-25', to: '2026-01-25' })
  assert.equal(commissionPeriod('2026-13'), null)
  assert.equal(commissionPeriod('2026-6'), null)
  assert.equal(commissionPeriod('abc'), null)
})

check('C2', 'defaultPeriodMonth', () => {
  assert.equal(defaultPeriodMonth('2026-06-25'), '2026-06')
  assert.equal(defaultPeriodMonth('2026-06-26'), '2026-07')
  assert.equal(defaultPeriodMonth('2026-12-26'), '2027-01')
})

check('C3', 'วันล็อคคิว = ตอบรับครั้งแรก · Success ตัวพิมพ์ใหญ่ = won', () => {
  const m = buildLockDates([
    act('a', '2026-06-01T03:00:00Z', 'quotation_sent'),
    act('a', '2026-06-03T03:00:00Z', 'accepted'),
    act('a', '2026-06-10T03:00:00Z', 'Success'),
    act('b', '2026-06-05T03:00:00Z', 'Success'),
  ])
  assert.equal(m.get('a'), '2026-06-03')
  assert.equal(m.get('b'), '2026-06-05')
  assert.equal(isWonStatus('Success'), true)
  assert.equal(isWonStatus('ปิด'), true)
  assert.equal(isWonStatus('Quotation_Sent'), false)
  // ลำดับ input ไม่มีผล
  assert.equal(buildLockDates([act('c', '2026-06-10T03:00:00Z', 'accepted'), act('c', '2026-06-02T03:00:00Z', 'DR')]).get('c'), '2026-06-02')
})

check('C4', 'ขอบงวด 05-25 และ 06-25 นับ · 05-24 และ 06-26 ไม่นับ', () => {
  const r = run(
    [lead('start'), lead('end'), lead('before'), lead('after')],
    [
      act('start', '2026-05-25T00:00:00Z', 'accepted'),   // 25 พ.ค. 07:00 เวลาไทย
      act('end', '2026-06-25T10:00:00Z', 'accepted'),
      act('before', '2026-05-24T10:00:00Z', 'accepted'),
      act('after', '2026-06-26T03:00:00Z', 'accepted'),
    ],
  )
  assert.deepEqual(r.events.map((x) => x.leadId), ['start', 'end'])
})

check('C5', 'โซนเวลาไทย', () => {
  assert.equal(bangkokDay('2026-06-25T17:30:00Z'), '2026-06-26')
  assert.equal(bangkokDay('2026-06-25T16:59:59+00:00'), '2026-06-25')
  assert.equal(buildLockDates([act('z', '2026-06-25T17:30:00Z', 'accepted')]).get('z'), '2026-06-26')
  assert.equal(run([lead('z')], [act('z', '2026-06-25T17:30:00Z', 'accepted')]).eventCount, 0)
})

check('C6', 'สถานะปัจจุบันไม่ใช่ won → ไม่นับ', () => {
  const acts = ['r', 'q', 'l'].map((id) => act(id, '2026-06-01T03:00:00Z', 'accepted'))
  const r = run([lead('r', { status: 'rejected' }), lead('q', { status: 'quotation_sent' }), lead('l', { status: 'lead' })], acts)
  assert.equal(r.events.length + r.booths.length + r.unclassified.length, 0)
})

check('C7', 'เลื่อนกลับเป็น lead แล้วตอบรับใหม่ → ใช้ครั้งแรก', () => {
  const acts = [
    act('x', '2026-05-20T03:00:00Z', 'accepted'),
    act('x', '2026-06-01T03:00:00Z', 'lead'),
    act('x', '2026-06-10T03:00:00Z', 'accepted'),
  ]
  assert.equal(buildLockDates(acts).get('x'), '2026-05-20')
  assert.equal(run([lead('x')], acts).eventCount, 0) // ล็อคก่อนงวด → ไม่นับในงวดนี้
})

check('C8', 'ไม่มีประวัติ → วันสร้างการ์ด + no_history', () => {
  const r = run([lead('n', { created_at: '2026-06-10T18:00:00Z' })], [])
  assert.equal(r.events.length, 1)
  assert.equal(r.events[0].lockDate, '2026-06-11')
  assert.ok(codesOf('n', r).includes('no_history'))
})

check('C9', 'จำนวนตู้', () => {
  const ids = ['s3', 'snull', 's0', 'sneg']
  const r = run(
    [lead('s3', { work_type: 'sale', unit_count: 3 }), lead('snull', { work_type: 'sale', unit_count: null }),
      lead('s0', { work_type: 'sale', unit_count: 0 }), lead('sneg', { work_type: 'sale', unit_count: -2 })],
    ids.map((id) => act(id, '2026-06-01T03:00:00Z', 'accepted')),
  )
  const units = Object.fromEntries(r.booths.map((b) => [b.leadId, b.units]))
  assert.deepEqual(units, { s3: 3, snull: 1, s0: 1, sneg: 1 })
  assert.equal(r.boothUnits, 6)
})

check('C10', 'GP ไม่ปรากฏ · ไม่ระบุประเภท → unclassified + no_work_type', () => {
  const r = run(
    [lead('g', { work_type: 'gp' }), lead('u', { work_type: null })],
    [act('g', '2026-06-01T03:00:00Z', 'accepted'), act('u', '2026-06-01T03:00:00Z', 'accepted')],
  )
  const everywhere = [...r.booths, ...r.events, ...r.unclassified].map((x) => x.leadId)
  assert.ok(!everywhere.includes('g'))
  assert.ok(!r.warnings.some((w) => w.leadId === 'g'))
  assert.deepEqual(r.unclassified.map((x) => x.leadId), ['u'])
  assert.equal(r.eventCount, 0)
  assert.equal(r.boothUnits, 0)
  assert.ok(codesOf('u', r).includes('no_work_type'))
})

check('C11', 'คำเตือนข้อมูลผิดปกติ', () => {
  const leads = [
    lead('e1', { event_date: '2026-07-10', event_end_date: '2026-07-05' }),
    lead('e2', { event_date: null }),
    lead('e3', { quotation_ref: '   ' }),
    lead('d1', { quotation_ref: 'QT-100' }),
    lead('d2', { quotation_ref: '  qt-100 ', work_type: 'sale' }),
    lead('p1', { customer_line: 'ลูกค้า A', event_date: '2026-07-20' }),
    lead('p2', { customer_line: '  ลูกค้า a ', event_date: '2026-07-20' }),
    lead('ok', {}),
  ]
  const r = run(leads, leads.map((l) => act(l.id, '2026-06-01T03:00:00Z', 'accepted')))
  assert.deepEqual(codesOf('e1', r), ['end_before_start'])
  assert.deepEqual(codesOf('e2', r), ['no_event_date'])
  assert.deepEqual(codesOf('e3', r), ['no_quotation_ref'])
  assert.deepEqual(codesOf('d1', r), ['dup_quotation_ref'])
  assert.deepEqual(codesOf('d2', r), ['dup_quotation_ref'])
  assert.deepEqual(codesOf('p1', r), ['possible_duplicate'])
  assert.deepEqual(codesOf('p2', r), ['possible_duplicate'])
  assert.deepEqual(codesOf('ok', r), [])
  assert.equal(r.events.find((x) => x.leadId === 'p2')?.customer, 'ลูกค้า a') // trim แล้ว
})

check('C12', 'เรียงตามวันล็อคคิว → วันจัดงาน · no เริ่ม 1', () => {
  const leads = [
    lead('c', { event_date: '2026-07-01' }),
    lead('a', { event_date: '2026-08-01' }),
    lead('b', { event_date: '2026-07-15' }),
    lead('d', { event_date: '2026-06-30' }),
  ]
  const r = run(leads, [
    act('c', '2026-06-05T03:00:00Z', 'accepted'),
    act('a', '2026-06-01T03:00:00Z', 'accepted'),
    act('b', '2026-06-01T03:00:00Z', 'accepted'),
    act('d', '2026-06-10T03:00:00Z', 'accepted'),
  ])
  assert.deepEqual(r.events.map((x) => x.leadId), ['b', 'a', 'c', 'd'])
  assert.deepEqual(r.events.map((x) => x.no), [1, 2, 3, 4])
})

check('C13', 'mergeTargets', () => {
  const existing = { sales: 500000, deals: 10, cm_booths: 10, cm_events: 40 }
  assert.deepEqual(mergeTargets(existing, { cm_booths: 12, cm_events: null }, 'commission'),
    { sales: 500000, deals: 10, cm_booths: 12 })
  assert.deepEqual(mergeTargets(existing, { cm_events: 0 }, 'commission'),
    { sales: 500000, deals: 10, cm_booths: 10 })
  assert.deepEqual(mergeTargets(existing, { sales: 600000 }, 'board'),
    { cm_booths: 10, cm_events: 40, sales: 600000 })
  assert.deepEqual(mergeTargets(existing, {}, 'board'), { cm_booths: 10, cm_events: 40 })
  assert.deepEqual(mergeTargets(existing, { cm_booths: 99 }, 'board'), { cm_booths: 10, cm_events: 40 })
})

check('C14', 'buildExportSheet', () => {
  const leads = [
    lead('s1', { work_type: 'sale', unit_count: 2 }),
    lead('e1'), lead('e2'), lead('e3'),
  ]
  const r = run(leads, leads.map((l) => act(l.id, '2026-06-01T03:00:00Z', 'accepted')))
  const sheet = buildExportSheet(r, { booths: 10, events: 40 }, JUN)
  assert.match(String(sheet[0][1]), /^เป้าหมายแอดมิน ขายตู้ 10 ตู้ ขายงานอีเวนต์ 40 งาน กำหนดเวลา 25\/5\/2569 - 25\/6\/2569$/)
  assert.equal(sheet[4].length, 12)
  assert.equal(sheet[4][0], 'ลำดับ')
  assert.equal(sheet[4][2], 'จำนวนตู้ที่สั่งผลิต')
  assert.equal(sheet[4][6], 'ลำดับ')
  assert.equal(sheet[4][8], 'วันที่จัดงาน')
  const data = sheet.slice(5)
  assert.equal(data.length, Math.max(r.booths.length, r.events.length))
  assert.equal(data[0][2], 2)           // ตู้อยู่ A–F
  assert.equal(data[0][9], 'ลูกค้า e1') // อีเวนต์อยู่ G–L
  assert.equal(data[1][0], '')          // ตู้หมดแล้ว → ช่องว่าง
  assert.equal(data[2][6], 3)
  for (const row of data) assert.equal(row.length, 12)
})

check('C15', 'วันที่ 25 อยู่สองงวด — นับทั้งสองงวด และติดคำเตือน cutoff_day', () => {
  const leads = [lead('on25'), lead('on24')]
  const acts = [act('on25', '2026-06-25T03:00:00Z', 'accepted'), act('on24', '2026-06-24T03:00:00Z', 'accepted')]
  const jun = run(leads, acts, JUN)
  const jul = run(leads, acts, JUL)
  assert.deepEqual(jun.events.map((x) => x.leadId), ['on24', 'on25'])
  assert.deepEqual(jul.events.map((x) => x.leadId), ['on25'])
  assert.deepEqual(codesOf('on25', jun), ['cutoff_day'])
  assert.deepEqual(codesOf('on25', jul), ['cutoff_day'])
  assert.deepEqual(codesOf('on24', jun), [])
})

if (failed > 0) {
  console.log(`\n${failed} case(s) FAILED`)
  process.exit(1)
}
console.log('\ncommission-check: ผ่านทั้งหมด (C1–C15)')
