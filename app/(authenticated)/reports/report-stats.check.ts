// Runnable self-check for report-stats.ts (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/reports/report-stats.check.ts"
import assert from 'node:assert/strict'
import {
    aggregateStats,
    emptyTotals,
    personLabel,
    STAT_KINDS,
    STAT_LABELS_TH,
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

console.log('report-stats.check.ts: ผ่านทั้งหมด ✓')
