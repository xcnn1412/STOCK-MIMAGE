// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/shelves/room-logic.check.ts"
import assert from 'node:assert/strict'
import { cellsOf, clampToRoom, firstFreeSpot, footprint, levelCode, nextRotation, overlapping, type RackPlacement } from './room-logic'

const rack = (id: string, x: number, y: number, width = 2, rotation: RackPlacement['rotation'] = 0): RackPlacement => ({ id, x, y, width, rotation })
const room = { width: 6, depth: 4 }

// หมุน 90/270 = ด้านยาวไปทางลึก
assert.deepEqual(footprint({ rotation: 0, width: 3 }), { w: 3, d: 1 })
assert.deepEqual(footprint({ rotation: 90, width: 3 }), { w: 1, d: 3 })
assert.deepEqual(footprint({ rotation: 270, width: 3 }), { w: 1, d: 3 })

// ลากเกินขอบ → ดึงกลับเข้าห้องทั้งตู้
assert.deepEqual(clampToRoom(rack('a', 5, 9, 2), room), rack('a', 4, 3, 2))
assert.deepEqual(clampToRoom(rack('a', -3, -1, 2), room), rack('a', 0, 0, 2))
assert.deepEqual(clampToRoom(rack('a', 5, 3, 3, 90), room), rack('a', 5, 1, 3, 90))

assert.deepEqual(cellsOf(rack('a', 1, 2, 2)), ['1,2', '2,2'])
assert.deepEqual(cellsOf(rack('a', 1, 0, 2, 90)), ['1,0', '1,1'])

// ทับกัน → เตือนทั้งสองตู้ · ชิดกันไม่ทับ
assert.deepEqual([...overlapping([rack('a', 0, 0, 2), rack('b', 1, 0, 2), rack('c', 4, 0, 2)])].sort(), ['a', 'b'])
assert.deepEqual([...overlapping([rack('a', 0, 0, 2), rack('b', 2, 0, 2)])], [])

// ที่ว่างแรกจากหน้าซ้าย
assert.deepEqual(firstFreeSpot(room, [], 2), { x: 0, y: 0 })
assert.deepEqual(firstFreeSpot(room, [rack('a', 0, 0, 2)], 2), { x: 2, y: 0 })
assert.deepEqual(firstFreeSpot(room, [rack('a', 0, 0, 3), rack('b', 3, 0, 3)], 2), { x: 0, y: 1 })
// เต็ม → มุมซ้ายหน้า
assert.deepEqual(firstFreeSpot({ width: 2, depth: 1 }, [rack('a', 0, 0, 2)], 2), { x: 0, y: 0 })

assert.equal(levelCode('A', 2), 'A-2')
assert.equal(nextRotation(270), 0)
assert.equal(nextRotation(90), 180)

console.log('room-logic.check: all passed')
