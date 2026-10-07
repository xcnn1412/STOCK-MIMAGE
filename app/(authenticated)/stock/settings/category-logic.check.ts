// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/stock/settings/category-logic.check.ts"
import assert from 'node:assert/strict'
import { canDeleteCategory, MAX_NAME, parseCategoryForm, sortCategories } from './category-logic'

// ชื่อ: trim, ว่าง = error, ยาวเกิน = error
assert.deepEqual(parseCategoryForm({ name: '  กล้อง  ', sales_pick: false, variants: '' }), { name: 'กล้อง', sales_pick: false, variants: [] })
assert.ok('error' in parseCategoryForm({ name: '   ', sales_pick: false, variants: '' }))
assert.ok('error' in parseCategoryForm({ name: 'ก'.repeat(MAX_NAME + 1), sales_pick: false, variants: '' }))
assert.ok(!('error' in parseCategoryForm({ name: 'ก'.repeat(MAX_NAME), sales_pick: false, variants: '' })))

// แบบประกอบ: แยกด้วยขึ้นบรรทัด/จุลภาค, trim, ตัดว่าง, ตัดซ้ำ เก็บลำดับแรก
const booth = parseCategoryForm({ name: 'ตู้ประกอบ', sales_pick: 'on', variants: ' ประกอบ 1 \n\nประกอบ 2, ประกอบ 1 ,ประกอบ 3\n' })
assert.deepEqual(booth, { name: 'ตู้ประกอบ', sales_pick: true, variants: ['ประกอบ 1', 'ประกอบ 2', 'ประกอบ 3'] })
assert.deepEqual(parseCategoryForm({ name: 'x', sales_pick: true, variants: ['b', ' a', 'b', ''] }), { name: 'x', sales_pick: true, variants: ['b', 'a'] })
// ไม่เกิน 20 แบบ
const twenty = Array.from({ length: 20 }, (_, i) => `แบบ ${i + 1}`)
assert.ok(!('error' in parseCategoryForm({ name: 'x', sales_pick: false, variants: twenty.join('\n') })))
const tooMany = parseCategoryForm({ name: 'x', sales_pick: false, variants: [...twenty, 'แบบ 21'].join('\n') })
assert.ok('error' in tooMany && /20/.test(tooMany.error))
// ซ้ำนับหลังตัดซ้ำ — 21 แถวที่ซ้ำ 1 แถวยังผ่าน
assert.ok(!('error' in parseCategoryForm({ name: 'x', sales_pick: false, variants: [...twenty, 'แบบ 1'].join(',') })))

// ลบได้เมื่อไม่มีของอ้างถึง · ข้อความระบุจำนวน
assert.deepEqual(canDeleteCategory({ items: 0, kits: 0 }), { ok: true })
const usedItems = canDeleteCategory({ items: 3, kits: 0 })
assert.ok('error' in usedItems && usedItems.error.includes('อุปกรณ์ 3 ชิ้น') && !usedItems.error.includes('กระเป๋า'))
const usedBoth = canDeleteCategory({ items: 2, kits: 1 })
assert.ok('error' in usedBoth && usedBoth.error.includes('อุปกรณ์ 2 ชิ้น') && usedBoth.error.includes('กระเป๋า 1 ใบ'))
const usedKits = canDeleteCategory({ items: 0, kits: 4 })
assert.ok('error' in usedKits && usedKits.error.includes('กระเป๋า 4 ใบ'))

// เรียง sort_order แล้วชื่อไทย · ไม่แก้ array เดิม
const list = [
  { sort_order: 1, name: 'ปริ้นเตอร์' },
  { sort_order: 0, name: 'กล้อง' },
  { sort_order: 1, name: 'คอมพิวเตอร์' },
  { sort_order: 0, name: 'กระเป๋าอุปกรณ์' },
]
assert.deepEqual(sortCategories(list).map(c => c.name), ['กระเป๋าอุปกรณ์', 'กล้อง', 'คอมพิวเตอร์', 'ปริ้นเตอร์'])
assert.equal(list[0].name, 'ปริ้นเตอร์')

console.log('category-logic.check: ผ่านทั้งหมด')
