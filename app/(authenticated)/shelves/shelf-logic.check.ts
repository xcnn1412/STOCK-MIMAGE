// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/shelves/shelf-logic.check.ts"
import assert from 'node:assert/strict'
import { auditDue, auditMissing, auditTargets, countProblems, groupByZone, kitShelfState } from './shelf-logic'

const ev = { name: 'งาน A', event_date: '2026-10-10' }
// มีชิ้นที่นำออก → ออกงาน (บอกชื่องาน)
assert.deepEqual(kitShelfState(['available', 'in_use'], ev), { kind: 'out', eventName: 'งาน A' })
assert.deepEqual(kitShelfState(['in_use'], null), { kind: 'out', eventName: null })
// อยู่ครบแต่มีงานจอง → จองไว้
assert.deepEqual(kitShelfState(['available'], ev), { kind: 'booked', eventName: 'งาน A', eventDate: '2026-10-10' })
// ไม่มีงาน → อยู่บนชั้น (กระเป๋าว่างก็เช่นกัน)
assert.deepEqual(kitShelfState(['available', 'damaged'], null), { kind: 'home' })
assert.deepEqual(kitShelfState([], null), { kind: 'home' })

assert.equal(countProblems(['available', 'damaged', 'maintenance', 'lost', 'in_use']), 3)

// โซนเรียงตามตัวอักษร ชั้นเรียงแบบตัวเลข
assert.deepEqual(
  groupByZone([
    { zone: 'B', code: 'B-01' },
    { zone: 'A', code: 'A-10' },
    { zone: 'A', code: 'A-2' },
  ]),
  [
    { zone: 'A', shelves: [{ zone: 'A', code: 'A-2' }, { zone: 'A', code: 'A-10' }] },
    { zone: 'B', shelves: [{ zone: 'B', code: 'B-01' }] },
  ]
)

// --- ตรวจนับ ---
const plan = auditTargets(
  [
    { id: 'k1', name: 'กระเป๋า 1', itemStatuses: ['available'] },
    { id: 'k2', name: 'กระเป๋า 2', itemStatuses: ['available', 'in_use'] },
  ],
  [
    { id: 'i1', name: 'ขาตั้ง', status: 'available' },
    { id: 'i2', name: 'ไฟ', status: 'damaged' },
    { id: 'i3', name: 'สาย', status: 'lost' },
    { id: 'i4', name: 'ฉาก', status: 'in_use' },
  ]
)
// ออกงาน / แจ้งหายไว้แล้ว ไม่นับ — ของเสียยังต้องอยู่บนชั้น
assert.deepEqual(plan.expected.map(t => t.id), ['k1', 'i1', 'i2'])
assert.deepEqual(plan.skipped.map(t => [t.id, t.reason]), [['k2', 'ออกงานอยู่'], ['i3', 'แจ้งหายไว้แล้ว'], ['i4', 'ออกงานอยู่']])
// ไม่ได้ติ๊ก = ขาด · key แปลกปลอมถูกทิ้ง
assert.deepEqual(auditMissing(plan.expected, ['kit:k1', 'item:i2', 'item:zzz']).map(t => t.id), ['i1'])
assert.deepEqual(auditMissing(plan.expected, ['kit:k1', 'item:i1', 'item:i2']), [])
// วัสดุสิ้นเปลือง: เหลือบนชั้น 0 → skipped · เหลือ > 0 นับปกติ · ไม่ส่ง onShelf = อุปกรณ์ปกติ
const cplan = auditTargets([], [
  { id: 'c1', name: 'เทป', status: 'available', onShelf: 0 },
  { id: 'c2', name: 'ถ่าน', status: 'available', onShelf: 5 },
  { id: 'i5', name: 'ขาตั้ง', status: 'available' },
])
assert.deepEqual(cplan.expected.map(t => t.id), ['c2', 'i5'])
assert.deepEqual(cplan.skipped.map(t => [t.id, t.reason]), [['c1', 'ของหมดบนชั้น']])
// กำหนดตรวจ 30 วัน
const now = new Date('2026-10-31T12:00:00Z')
assert.deepEqual(auditDue(null, now), { kind: 'never' })
assert.deepEqual(auditDue('2026-10-01T12:00:00Z', now), { kind: 'ok', days: 30 })
assert.deepEqual(auditDue('2026-09-30T12:00:00Z', now), { kind: 'overdue', days: 31 })

console.log('shelf-logic.check: all passed')
