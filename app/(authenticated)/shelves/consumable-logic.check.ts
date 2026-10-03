// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/shelves/consumable-logic.check.ts"
import assert from 'node:assert/strict'
import {
  isPacked,
  onShelf,
  parseConsumableFields,
  parseCount,
  parseQty,
  planReturnUse,
  shortage,
  stockLevel,
  totalFromShelfCount,
} from './consumable-logic'

// --- บนชั้น / ขาด ---
assert.equal(onShelf(10, 4), 6)
assert.equal(onShelf(3, 5), 0)
assert.equal(shortage(10, 4), 0)
assert.equal(shortage(3, 5), 2)

// --- ระดับสต็อก ---
assert.equal(stockLevel(0, 0, null), 'out')
assert.equal(stockLevel(0, 2, 5), 'out')
// ขาด (ของในกระเป๋ามากกว่ายอด) = ใกล้หมด แม้ไม่ได้ตั้งขั้นต่ำ
assert.equal(stockLevel(3, 5, null), 'low')
// ไม่ตั้งขั้นต่ำ = ไม่เตือน แม้บนชั้นเหลือ 0
assert.equal(stockLevel(5, 5, null), 'ok')
assert.equal(stockLevel(10, 0, null), 'ok')
// เทียบกับเหลือบนชั้น ไม่ใช่ยอดรวม: รวม 10 ในกระเป๋า 7 → บนชั้น 3 ≤ 3
assert.equal(stockLevel(10, 7, 3), 'low')
assert.equal(stockLevel(10, 6, 3), 'ok')
assert.equal(stockLevel(10, 10, 0), 'low')

// --- ช่องกรอกจำนวน ---
assert.equal(parseQty('5'), 5)
assert.equal(parseQty(' 12 '), 12)
assert.equal(parseQty(7), 7)
assert.equal(parseQty('100000'), 100000)
assert.equal(parseQty('0'), null)
assert.equal(parseQty(0), null)
assert.equal(parseQty('-1'), null)
assert.equal(parseQty(-3), null)
assert.equal(parseQty('1.5'), null)
assert.equal(parseQty(2.5), null)
assert.equal(parseQty('abc'), null)
assert.equal(parseQty('3 ม้วน'), null)
assert.equal(parseQty(''), null)
assert.equal(parseQty('1e3'), null)
assert.equal(parseQty('100001'), null)
assert.equal(parseQty(null), null)
assert.equal(parseQty(undefined), null)
// 0 ใช้ได้กับยอดตั้งต้น/ขั้นต่ำ/ปรับยอด
assert.equal(parseCount('0'), 0)
assert.equal(parseCount('-1'), null)
assert.equal(parseCount('2.0'), null)

// --- ช่องวัสดุสิ้นเปลืองในฟอร์มอุปกรณ์ ---
const form = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null })
assert.deepEqual(parseConsumableFields(form({ unit: ' ม้วน ', min_quantity: '2', quantity: '10' }), true), {
  unit: 'ม้วน', min_quantity: 2, initial: 10,
})
assert.deepEqual(parseConsumableFields(form({}), true), { unit: null, min_quantity: null, initial: 0 })
// แก้ไข: ไม่อ่าน quantity
assert.deepEqual(parseConsumableFields(form({ quantity: 'abc', min_quantity: '0' }), false), {
  unit: null, min_quantity: 0, initial: 0,
})
assert.ok('error' in parseConsumableFields(form({ min_quantity: '-1' }), true))
assert.ok('error' in parseConsumableFields(form({ quantity: '1.5' }), true))

// --- ปรับยอดจากการนับบนชั้น ---
assert.equal(totalFromShelfCount(4, 6), 10)
assert.equal(totalFromShelfCount(0, 0), 0)

// --- จัดครบ ---
assert.equal(isPacked([]), false)
// มีแต่วัสดุสิ้นเปลือง = ไม่มีสถานะจัดครบ
assert.equal(isPacked([{ status: 'available', is_consumable: true }]), false)
assert.equal(isPacked([{ status: 'in_use', is_consumable: true }]), false)
// วัสดุสิ้นเปลืองไม่ถูกนับ
assert.equal(isPacked([{ status: 'in_use' }, { status: 'available', is_consumable: true }]), true)
assert.equal(isPacked([{ status: 'in_use', is_consumable: false }, { status: 'available', is_consumable: false }]), false)

// --- ใช้ไปตอนปิดงาน ---
const contents = [
  { kitId: 'k1', itemId: 'tape' },
  { kitId: 'k1', itemId: 'bag' },
  { kitId: 'k2', itemId: 'tape' },
]
// คู่ที่ไม่อยู่ในกระเป๋าที่จอง
assert.ok('error' in planReturnUse(contents, [{ kitId: 'k2', itemId: 'bag', used: 1 }], []))
assert.ok('error' in planReturnUse(contents, [{ kitId: 'k9', itemId: 'tape', used: 1 }], []))
// ไม่ใช่จำนวนเต็ม ≥ 0
assert.ok('error' in planReturnUse(contents, [{ kitId: 'k1', itemId: 'tape', used: -1 }], []))
assert.ok('error' in planReturnUse(contents, [{ kitId: 'k1', itemId: 'tape', used: 1.5 }], []))
assert.ok('error' in planReturnUse(contents, [{ kitId: 'k1', itemId: 'tape', used: Number.NaN }], []))
assert.ok('error' in planReturnUse(contents, [{ kitId: 'k1', itemId: 'tape', used: '2' as unknown as number }], []))
// คู่ซ้ำ
assert.ok(
  'error' in planReturnUse(contents, [
    { kitId: 'k1', itemId: 'tape', used: 1 },
    { kitId: 'k1', itemId: 'tape', used: 2 },
  ], [])
)
// ข้ามคู่ที่ตัดแล้วและ used = 0 · ของชิ้นเดียวกันคนละกระเป๋าเป็นคนละคู่
assert.deepEqual(
  planReturnUse(
    contents,
    [
      { kitId: 'k1', itemId: 'tape', used: 2 },
      { kitId: 'k1', itemId: 'bag', used: 0 },
      { kitId: 'k2', itemId: 'tape', used: 3 },
    ],
    [{ kitId: 'k2', itemId: 'tape' }]
  ),
  { cuts: [{ kitId: 'k1', itemId: 'tape', used: 2 }] }
)
assert.deepEqual(planReturnUse(contents, [], []), { cuts: [] })

console.log('consumable-logic.check: all passed')
