// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/shelves/room-logic.check.ts"
import assert from 'node:assert/strict'
import { cameraView, cellsOf, clampToRoom, firstFreeSpot, footprint, levelCode, nextRotation, overlapping, LEVEL_H, type RackPlacement } from './room-logic'

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

// --- มุมกล้อง ---
const R = { width: 8, depth: 6 }
const dist = (v: { pos: number[]; target: number[] }) => Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2])

// ภาพรวม: มองกลางห้องจากด้านหน้า-บน · จอแคบ (มือถือ) ถอยไกลกว่าจอกว้าง
const wide = cameraView(R, null, null, 2.4)
const narrow = cameraView(R, null, null, 0.8)
assert.deepEqual(wide.target, [4, 0.5, 3])
assert.ok(wide.pos[1] > 3 && wide.pos[2] > 6, 'overview camera is above and in front of the room')
assert.ok(dist(narrow) > dist(wide) * 1.3, 'narrow screens back off further')

// focus ตู้: กล้องอยู่ด้านที่หันเข้าหากลางห้อง
const back = cameraView(R, { x: 4, y: 0, rotation: 0, width: 2, levels: 4 }, null, 2)
assert.deepEqual(back.target, [5, (4 * LEVEL_H) / 2, 0.5])
assert.ok(back.pos[2] > 0.5, 'rack on the back wall is viewed from the room side')
const front = cameraView(R, { x: 4, y: 5, rotation: 0, width: 2, levels: 4 }, null, 2)
assert.ok(front.pos[2] < 5.5, 'rack on the front wall is viewed from the room side')
// ตู้หมุน 90° ชิดผนังซ้าย → หน้าตู้อยู่แกน X กล้องอยู่ฝั่งขวาของตู้
const left = cameraView(R, { x: 0, y: 2, rotation: 90, width: 2, levels: 3 }, null, 2)
assert.deepEqual(left.target.map(n => +n.toFixed(3)), [0.5, +((3 * LEVEL_H) / 2).toFixed(3), 3])
assert.ok(left.pos[0] > 0.5 && Math.abs(left.pos[0] - 0.5) > Math.abs(left.pos[2] - 3), 'rotated rack is viewed along X')
// ใกล้กว่าภาพรวมมาก
assert.ok(dist(back) < dist(wide) / 2)

// focus ระดับ: มองที่ความสูงของระดับนั้น และใกล้กว่า focus ทั้งตู้
const lv3 = cameraView(R, { x: 4, y: 0, rotation: 0, width: 2, levels: 4 }, 3, 0.8)
const whole = cameraView(R, { x: 4, y: 0, rotation: 0, width: 2, levels: 4 }, null, 0.8)
assert.equal(+lv3.target[1].toFixed(3), +(2 * LEVEL_H + LEVEL_H / 2).toFixed(3))
assert.ok(dist(lv3) <= dist(whole))
assert.ok(lv3.pos[1] > lv3.target[1], 'level is viewed from slightly above')

console.log('room-logic.check: all passed')
