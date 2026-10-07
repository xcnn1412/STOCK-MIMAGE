// แพ็กเกจ (/packages, /packages/[id]) — render PackagesView / PackageEditor / OptionsPicker แบบ static ด้วยข้อมูลสังเคราะห์ ตรวจว่าไม่ throw และมีข้อความสำคัญ
// Run: npx tsx scripts/packages-render.check.ts · ไม่แตะเครือข่าย/ฐานข้อมูล (server actions, sonner, next/navigation ถูกแทนด้วยตัวจำลอง)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "packages-render: ผ่านทั้งหมด"
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
  if (request === './actions' || request === '../actions') return noopActions()
  if (request === 'sonner') return { toast, Toaster: () => null }
  if (request === 'next/navigation') {
    const real = realLoad.call(this, request, ...rest) as object
    return { ...real, useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} }) }
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const PackagesView = require('../app/(authenticated)/packages/packages-view').default
const PackageEditor = require('../app/(authenticated)/packages/[id]/package-editor').default
const OptionsPicker = require('../app/(authenticated)/packages/[id]/options-picker').default
/* eslint-enable @typescript-eslint/no-require-imports */

const packages = [
  { id: 'p1', name: 'Selfie studio booth', description: 'ตู้ถ่ายรูปพร้อมไฟ', price: 15000, sort_order: 0, is_active: true, requirements: [{ category_id: 'c1', category_name: 'คอมพิวเตอร์', quantity: 1 }, { category_id: 'c2', category_name: 'กล้อง', quantity: 2 }] },
  { id: 'p2', name: 'ตู้ประกอบ', description: null, price: null, sort_order: 1, is_active: false, requirements: [] },
]
const list = renderToStaticMarkup(createElement(PackagesView, { packages, canEdit: true }))
for (const s of ['แพ็กเกจ', 'Selfie studio booth', '15,000 บาท', 'คอมพิวเตอร์ ×1 · กล้อง ×2', 'ยังไม่ตั้งอุปกรณ์', 'ปิดใช้', 'เพิ่มแพ็กเกจ', '/packages/p1', 'คัดลอกแพ็กเกจ', 'เลื่อนขึ้น']) {
  assert.ok(list.includes(s), `packages-view ต้องมี "${s}"`)
}
const readonly = renderToStaticMarkup(createElement(PackagesView, { packages, canEdit: false }))
assert.ok(!readonly.includes('เพิ่มแพ็กเกจ') && !readonly.includes('/packages/p1'), 'อ่านอย่างเดียว = ไม่มีปุ่มแก้/ลิงก์')
assert.ok(!/min-w-\[(4|5|6|7|8|9)\d\d/.test(list), 'ไม่มี min-width คงที่เกิน 360px')

const categories = [
  { id: 'c1', name: 'คอมพิวเตอร์', sort_order: 0, is_active: true, sales_pick: false, variants: [] },
  { id: 'c2', name: 'กล้อง', sort_order: 1, is_active: true, sales_pick: false, variants: [] },
  { id: 'c3', name: 'ตู้ประกอบ', sort_order: 2, is_active: true, sales_pick: true, variants: ['ประกอบ 1', 'ประกอบ 2'] },
]
const units = {
  c1: [{ id: 'i1', kind: 'item', name: 'Asus notebook 1', serial: 'A1', status: 'available' }, { id: 'i2', kind: 'item', name: 'Asus notebook 2', serial: null, status: 'damaged' }],
  c2: [{ id: 'i3', kind: 'item', name: 'Canon r50', status: 'available' }, { id: 'i4', kind: 'item', name: 'ในกระเป๋า', status: 'available', inKit: true }],
  c3: [{ id: 'i5', kind: 'item', name: 'ตู้ประกอบ ชุด 1', status: 'available' }, { id: 'i6', kind: 'item', name: 'ตู้ประกอบ ชุด 2', status: 'available' }],
}
const pkg = {
  ...packages[0],
  requirements: [
    { id: 'r1', package_id: 'p1', category_id: 'c1', quantity: 1, note: null, sort_order: 0, category_name: 'คอมพิวเตอร์', category_active: true, sales_pick: false, optionItemIds: ['i1'], optionKitIds: [] },
    { id: 'r3', package_id: 'p1', category_id: 'c3', quantity: 1, note: null, sort_order: 1, category_name: 'ตู้ประกอบ', category_active: true, sales_pick: true, optionItemIds: [], optionKitIds: [] },
  ],
}
const editor = renderToStaticMarkup(createElement(PackageEditor, { pkg, categories, units }))
for (const s of ['ข้อกำหนด', 'ตัวเลือก: เลือกแล้ว 1 ชิ้น', 'ตัวเลือก: ทุกชิ้นในประเภท (2 ชิ้น)', 'ทีมขายเลือกชิ้นเอง', 'บันทึกข้อกำหนด', 'Selfie studio booth', 'เปิดใช้']) {
  assert.ok(editor.includes(s), `package-editor ต้องมี "${s}"`)
}
assert.ok(!/min-w-\[(4|5|6|7|8|9)\d\d/.test(editor), 'editor ไม่มี min-width คงที่เกิน 360px')

// Radix Dialog ไม่ render เนื้อหาใน SSR (portal) — แค่ต้องไม่ throw
const picker = renderToStaticMarkup(createElement(OptionsPicker, { categoryName: 'กล้อง', units: units.c2, itemIds: [], kitIds: [], onApply() {}, onClose() {} }))
assert.equal(typeof picker, 'string')

console.log('packages-render: ผ่านทั้งหมด')
