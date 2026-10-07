// ตั้งค่าคลัง (/stock/settings) — render SettingsView / CategoryDialog / CategorySelect แบบ static ด้วยข้อมูลสังเคราะห์ ตรวจว่าไม่ throw และมีข้อความสำคัญ
// Run: npx tsx scripts/stock-settings-render.check.ts · ไม่แตะเครือข่าย/ฐานข้อมูล (server actions และ sonner ถูกแทนด้วยตัวจำลอง)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "stock-settings-render: ผ่านทั้งหมด"
process.env.TZ = 'Asia/Bangkok'
import assert from 'node:assert/strict'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const noopActions = () => new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : typeof key === 'string' ? async () => ({ success: true }) : undefined) })
const toast = Object.assign(() => {}, { error() {}, success() {}, info() {}, warning() {} })
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === './actions') return noopActions()
  if (request === 'sonner') return { toast, Toaster: () => null }
  return realLoad.call(this, request, ...rest)
}

// วางใน scripts/ เพื่อให้ alias @/ ใน tsconfig ทำงาน
/* eslint-disable @typescript-eslint/no-require-imports */
const SettingsView = require('../app/(authenticated)/stock/settings/settings-view').default
const CategoryDialog = require('../app/(authenticated)/stock/settings/category-dialog').default
const { CategorySelect } = require('../app/(authenticated)/items/category-select')
/* eslint-enable @typescript-eslint/no-require-imports */

const cats = [
  { id: 'c1', name: 'ตู้ประกอบ', sort_order: 0, is_active: true, sales_pick: true, variants: ['ประกอบ 1', 'ประกอบ 2', 'ประกอบ 3'] },
  { id: 'c2', name: 'กล้อง', sort_order: 1, is_active: true, sales_pick: false, variants: [] },
  { id: 'c3', name: 'ของเก่า', sort_order: 2, is_active: false, sales_pick: false, variants: [] },
]
const html = renderToStaticMarkup(createElement(SettingsView, { categories: cats, counts: { c1: { items: 2, kits: 0 }, c2: { items: 5, kits: 1 } } }))
for (const s of ['ตั้งค่าคลัง', 'ประเภทอุปกรณ์', 'ตู้ประกอบ', 'ทีมขายเลือกชิ้นเอง', 'ประกอบ 3', 'อุปกรณ์ 2 · กระเป๋า 0', 'อุปกรณ์ 5 · กระเป๋า 1', 'ปิดใช้', '/items/new?category=c1', 'เพิ่มประเภท', 'เลื่อนขึ้น', 'แก้ไข', 'ลบ']) {
  assert.ok(html.includes(s), `settings-view ต้องมี "${s}"`)
}
assert.ok(!/min-w-\[(4|5|6|7|8|9)\d\d/.test(html), 'ไม่มี min-width คงที่เกิน 360px')
assert.ok(html.includes('sm:flex-row') && html.includes('flex-wrap'), 'แถวประเภทซ้อนแนวตั้งบนจอแคบ')

const dialog = renderToStaticMarkup(createElement(CategoryDialog, { category: cats[0], onClose() {} }))
// Radix Dialog ไม่ render เนื้อหาใน SSR (portal) — แค่ต้องไม่ throw
assert.equal(typeof dialog, 'string')

const empty = renderToStaticMarkup(createElement(SettingsView, { categories: [], counts: {} }))
assert.ok(empty.includes('ยังไม่มีประเภทอุปกรณ์'), 'สถานะว่าง')

const sel = renderToStaticMarkup(createElement(CategorySelect, { categories: cats.filter(c => c.is_active), defaultValue: 'c2', id: 'category' }))
assert.ok(sel.includes('name="category_id"') && sel.includes('value="c2"'), 'CategorySelect ส่ง hidden category_id = ค่าเริ่มต้น')
const selNone = renderToStaticMarkup(createElement(CategorySelect, { categories: cats, defaultValue: null }))
assert.ok(selNone.includes('name="category_id"') && selNone.includes('value=""'), 'ไม่ระบุ = ค่าว่าง')

console.log('stock-settings-render: ผ่านทั้งหมด')
