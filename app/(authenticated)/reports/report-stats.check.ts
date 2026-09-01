// Runnable self-check for report-stats.ts (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/reports/report-stats.check.ts"
import assert from 'node:assert/strict'
import {
    aggregateStats,
    emptyTotals,
    filterByPeriod,
    periodRange,
    personLabel,
    STAT_KINDS,
    STAT_LABELS_TH,
    STAT_PERIOD_LABELS_TH,
    STAT_PERIODS,
    STAT_SHORT_LABELS_TH,
    type ReportPerson,
    type StatRow,
} from './report-stats'

const person = (id: string, fullName: string, nickname: string | null = null, department: string | null = null): ReportPerson =>
    ({ id, fullName, nickname, department })

const row = (userId: string, kind: StatRow['kind'], date: string | null = '2026-08-30'): StatRow =>
    ({ userId, kind, date })

// --- ป้าย / ค่าคงที่ ---------------------------------------------------------
assert.deepEqual([...STAT_KINDS], ['onsite', 'staffing', 'vehicle', 'kits', 'graphic'])
assert.deepEqual(STAT_KINDS.map(k => STAT_LABELS_TH[k]), ['ออกงานอีเวนต์', 'จัดคน', 'จัดรถ', 'จัดกระเป๋า', 'รับงานกราฟิก'])
assert.deepEqual(STAT_KINDS.map(k => STAT_SHORT_LABELS_TH[k]), ['ออกงาน', 'จัดคน', 'จัดรถ', 'จัดกระเป๋า', 'กราฟิก'])
assert.deepEqual(emptyTotals(), { onsite: 0, staffing: 0, vehicle: 0, kits: 0, graphic: 0 })

// --- personLabel -----------------------------------------------------------
assert.equal(personLabel(person('u1', 'สมชาย ใจดี', 'ชาย')), 'ชาย | สมชาย ใจดี')
assert.equal(personLabel(person('u1', 'สมชาย ใจดี')), 'สมชาย ใจดี')
assert.equal(personLabel(person('u1', 'สมชาย ใจดี', '   ')), 'สมชาย ใจดี') // ชื่อเล่นว่างเปล่า = ไม่มีชื่อเล่น
assert.equal(personLabel(person('abcdefgh-1234', '')), 'abcdefgh') // ไม่มีชื่อเต็ม → id 8 ตัวแรก

// --- aggregateStats: นับตามประเภท -------------------------------------------
const people = [
    person('u1', 'สมชาย ใจดี', 'ชาย', 'ช่าง'),
    person('u2', 'นิคม ตั้งใจ', 'นิค', 'ฝ่ายออกแบบ'),
    person('u3', 'อารีย์ ขยัน', null, null),
]
const rows: StatRow[] = [
    row('u1', 'onsite'), row('u1', 'onsite'), row('u1', 'onsite'),
    row('u1', 'staffing'), row('u1', 'vehicle'), row('u1', 'kits'), row('u1', 'graphic'),
    row('u2', 'onsite'), row('u2', 'graphic'),
    row('u9', 'onsite'), // ไม่อยู่ในรายชื่อที่อนุมัติแล้ว → ทิ้ง
]
const agg = aggregateStats(rows, people)

assert.deepEqual(agg.people.map(p => p.userId), ['u1', 'u2']) // u3 ทุกช่อง 0 → ไม่แสดง
assert.deepEqual(agg.people[0], {
    userId: 'u1', name: 'ชาย | สมชาย ใจดี', department: 'ช่าง',
    onsite: 3, staffing: 1, vehicle: 1, kits: 1, graphic: 1, total: 7,
})
assert.deepEqual(agg.people[1], {
    userId: 'u2', name: 'นิค | นิคม ตั้งใจ', department: 'ฝ่ายออกแบบ',
    onsite: 1, staffing: 0, vehicle: 0, kits: 0, graphic: 1, total: 2,
})

// คนนอกรายชื่อไม่ถูกนับในยอดรวมทีมด้วย (u9 หายไปทั้งตารางและการ์ด)
assert.deepEqual(agg.totals, { onsite: 4, staffing: 1, vehicle: 1, kits: 1, graphic: 2 })
// ยอดรวมทีม = ผลรวมของคอลัมน์ในตารางเสมอ
for (const kind of STAT_KINDS) {
    assert.equal(agg.totals[kind], agg.people.reduce((sum, p) => sum + p[kind], 0))
}
// total ของแต่ละคน = ผลรวมช่องของตัวเอง
for (const p of agg.people) {
    assert.equal(p.total, STAT_KINDS.reduce((sum, k) => sum + p[k], 0))
}

// --- การเรียง: ยอดรวมมากสุดก่อน แล้วชื่อไทย ----------------------------------
const tie = aggregateStats(
    [row('a', 'onsite'), row('b', 'onsite'), row('c', 'onsite'), row('c', 'kits')],
    [person('a', 'สมหญิง'), person('b', 'กมล'), person('c', 'อารี')]
)
assert.deepEqual(tie.people.map(p => p.name), ['อารี', 'กมล', 'สมหญิง']) // c=2 มาก่อน แล้ว a/b เท่ากัน → เรียงชื่อไทย
assert.deepEqual(tie.people.map(p => p.total), [2, 1, 1])

// --- ขอบ -------------------------------------------------------------------
assert.deepEqual(aggregateStats([], people), { people: [], totals: emptyTotals() })
assert.deepEqual(aggregateStats(rows, []), { people: [], totals: emptyTotals() }) // ไม่มีรายชื่อ = ไม่นับอะไรเลย
// ประเภทแปลกปลอมจาก DB ไม่ทำให้ total เพี้ยน
assert.deepEqual(
    aggregateStats([{ userId: 'u1', kind: 'weird' as StatRow['kind'], date: null }, row('u1', 'kits')], people).people[0].total,
    1
)
// date เป็น null ก็ยังนับ (ยอดรวมภาพรวมไม่สนวันที่)
assert.equal(aggregateStats([row('u1', 'onsite', null)], people).totals.onsite, 1)
// department ว่างเปล่า → null (ตารางไม่ต้องแสดงบรรทัดว่าง)
assert.equal(aggregateStats([row('u1', 'kits')], [person('u1', 'สมชาย', null, '  ')]).people[0].department, null)

// --- ช่วงเวลา: ป้าย / ค่าคงที่ ------------------------------------------------
assert.deepEqual([...STAT_PERIODS], ['all', 'week', 'month', 'year'])
assert.deepEqual(STAT_PERIODS.map(p => STAT_PERIOD_LABELS_TH[p]), ['ภาพรวม', 'สัปดาห์นี้', 'เดือนนี้', 'ปีนี้'])

// --- periodRange: สัปดาห์เริ่มวันจันทร์ ----------------------------------------
// 2026-09-01 = อังคาร → สัปดาห์ จ.31 ส.ค. ถึง อา.6 ก.ย.
assert.deepEqual(periodRange('week', '2026-09-01'), { from: '2026-08-31', to: '2026-09-06' })
// วันจันทร์เองเป็นวันแรกของสัปดาห์ตัวเอง (ไม่ถอยไปสัปดาห์ก่อน)
assert.deepEqual(periodRange('week', '2026-08-31'), { from: '2026-08-31', to: '2026-09-06' })
// **ขอบสำคัญ**: วันอาทิตย์ 2026-09-06 อยู่สัปดาห์ที่เริ่มวันจันทร์ก่อนหน้า ไม่ใช่เริ่มสัปดาห์ใหม่
assert.deepEqual(periodRange('week', '2026-09-06'), { from: '2026-08-31', to: '2026-09-06' })
// อาทิตย์ 2026-08-30 → สัปดาห์ก่อนหน้า (จ.24 – อา.30 ส.ค.) คนละสัปดาห์กับ 2026-08-31
assert.deepEqual(periodRange('week', '2026-08-30'), { from: '2026-08-24', to: '2026-08-30' })
// สัปดาห์คร่อมสิ้นปี: จันทร์ 2025-12-29 → อาทิตย์ 2026-01-04
assert.deepEqual(periodRange('week', '2026-01-01'), { from: '2025-12-29', to: '2026-01-04' })
// ทุกช่วงสัปดาห์ยาว 7 วันเสมอ และเริ่มวันจันทร์เสมอ
for (let i = 0; i < 40; i++) {
    const day = new Date(Date.UTC(2026, 1, 1 + i)).toISOString().slice(0, 10)
    const r = periodRange('week', day)!
    assert.equal(new Date(r.from + 'T00:00:00Z').getUTCDay(), 1, `${day}: from ต้องเป็นวันจันทร์`)
    assert.equal((Date.parse(r.to) - Date.parse(r.from)) / 86_400_000, 6, `${day}: สัปดาห์ต้องยาว 7 วัน`)
    assert.ok(day >= r.from && day <= r.to, `${day}: ต้องอยู่ในสัปดาห์ของตัวเอง`)
}

// --- periodRange: เดือน / ปี ---------------------------------------------------
assert.deepEqual(periodRange('month', '2026-09-01'), { from: '2026-09-01', to: '2026-09-30' })
assert.deepEqual(periodRange('month', '2026-09-30'), { from: '2026-09-01', to: '2026-09-30' })
assert.deepEqual(periodRange('month', '2026-12-31'), { from: '2026-12-01', to: '2026-12-31' }) // เดือนคร่อมปี
assert.deepEqual(periodRange('month', '2026-02-15'), { from: '2026-02-01', to: '2026-02-28' }) // ปีปกติ
assert.deepEqual(periodRange('month', '2024-02-15'), { from: '2024-02-01', to: '2024-02-29' }) // ปีอธิกสุรทิน
assert.deepEqual(periodRange('year', '2026-09-01'), { from: '2026-01-01', to: '2026-12-31' })
assert.deepEqual(periodRange('year', '2026-01-01'), { from: '2026-01-01', to: '2026-12-31' })
assert.deepEqual(periodRange('year', '2026-12-31'), { from: '2026-01-01', to: '2026-12-31' })
assert.equal(periodRange('all', '2026-09-01'), null) // ภาพรวม = ไม่กรอง
assert.equal(periodRange('week', 'ไม่ใช่วันที่'), null) // รูปแบบผิด → ไม่กรอง (หน้าไม่พัง)

// --- filterByPeriod: ขอบสัปดาห์ / เดือน / ปี -----------------------------------
const today = '2026-09-01' // อังคาร · สัปดาห์ 2026-08-31 ถึง 2026-09-06
const dated = (date: string | null): StatRow => ({ userId: 'u1', kind: 'onsite', date })
const dates = (rs: StatRow[]) => rs.map(r => r.date)

const spread: StatRow[] = [
    dated('2025-12-31'), // ปีก่อน
    dated('2026-08-30'), // อาทิตย์ก่อนหน้า = นอกสัปดาห์นี้ แต่ยังอยู่ในเดือน ส.ค.
    dated('2026-08-31'), // จันทร์ = วันแรกของสัปดาห์นี้ (เดือนก่อน)
    dated('2026-09-01'), // วันนี้
    dated('2026-09-06'), // อาทิตย์ = วันสุดท้ายของสัปดาห์นี้
    dated('2026-09-07'), // จันทร์ถัดไป = นอกสัปดาห์นี้
    dated('2026-09-30'), // วันสุดท้ายของเดือนนี้
    dated('2026-10-01'), // เดือนหน้า
    dated('2026-12-31'), // สิ้นปีนี้
    dated('2027-01-01'), // ปีหน้า
    dated(null),         // ไม่รู้วันที่
]

assert.deepEqual(dates(filterByPeriod(spread, 'all', today)), dates(spread)) // ภาพรวม = ครบทุกแถว รวม null
assert.deepEqual(dates(filterByPeriod(spread, 'week', today)), ['2026-08-31', '2026-09-01', '2026-09-06'])
assert.deepEqual(dates(filterByPeriod(spread, 'month', today)), ['2026-09-01', '2026-09-06', '2026-09-07', '2026-09-30'])
assert.deepEqual(
    dates(filterByPeriod(spread, 'year', today)),
    ['2026-08-30', '2026-08-31', '2026-09-01', '2026-09-06', '2026-09-07', '2026-09-30', '2026-10-01', '2026-12-31']
)

// แถว date = null นับ **เฉพาะ** ภาพรวม (วางในช่วงไหนไม่ได้)
const nulls = [dated(null), dated(null)]
assert.equal(filterByPeriod(nulls, 'all', today).length, 2)
for (const p of ['week', 'month', 'year'] as const) {
    assert.equal(filterByPeriod(nulls, p, today).length, 0, `${p}: แถวไม่มีวันที่ต้องไม่ถูกนับ`)
}

// --- filterByPeriod + aggregateStats ทำงานร่วมกัน ------------------------------
const periodPeople = [person('u1', 'สมชาย'), person('u2', 'นิคม')]
const periodRows: StatRow[] = [
    { userId: 'u1', kind: 'onsite', date: '2026-09-01' },   // สัปดาห์นี้
    { userId: 'u1', kind: 'kits', date: '2026-08-30' },     // เดือนก่อน แต่ยังในปีนี้
    { userId: 'u2', kind: 'graphic', date: null },          // ภาพรวมเท่านั้น
    { userId: 'u2', kind: 'staffing', date: '2025-06-01' }, // ปีก่อน
]
const inWeek = aggregateStats(filterByPeriod(periodRows, 'week', today), periodPeople)
assert.deepEqual(inWeek.totals, { onsite: 1, staffing: 0, vehicle: 0, kits: 0, graphic: 0 })
assert.deepEqual(inWeek.people.map(p => p.userId), ['u1']) // u2 ทุกช่อง 0 ในสัปดาห์นี้ → ไม่แสดง

const inYear = aggregateStats(filterByPeriod(periodRows, 'year', today), periodPeople)
assert.deepEqual(inYear.totals, { onsite: 1, staffing: 0, vehicle: 0, kits: 1, graphic: 0 })

const inAll = aggregateStats(filterByPeriod(periodRows, 'all', today), periodPeople)
assert.deepEqual(inAll.totals, { onsite: 1, staffing: 1, vehicle: 0, kits: 1, graphic: 1 })

console.log('report-stats.check.ts: ผ่านทั้งหมด ✓')
