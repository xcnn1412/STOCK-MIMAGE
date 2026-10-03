// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/shelves/shelf-logic.check.ts"
import assert from 'node:assert/strict'
import { countProblems, groupByZone, kitShelfState } from './shelf-logic'

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

console.log('shelf-logic.check: all passed')
