// แพ็กเกจของงาน — render PackagePicker (โหมดดู/แก้) และ CapacityPanel แบบ static ด้วยข้อมูลสังเคราะห์ ตรวจว่าไม่ throw และมีข้อความสำคัญ
// Run: npx tsx scripts/package-picker-render.check.ts · ไม่แตะเครือข่าย/ฐานข้อมูล (server actions, sonner, next/navigation ถูกแทนด้วยตัวจำลอง)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "package-picker-render: ผ่านทั้งหมด"
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
const PackagePicker = require('../app/(authenticated)/packages/package-picker').default
const CapacityPanel = require('../components/dashboard-alerts/capacity-panel').default
const { buildCapacityRows, canSeeCapacity } = require('../components/dashboard-alerts/capacity-warnings') as typeof import('../components/dashboard-alerts/capacity-warnings')
/* eslint-enable @typescript-eslint/no-require-imports */

const packages = [
  { id: 'p1', name: 'Selfie studio booth', price: 15000, is_active: true, requirements: [{ id: 'r1', categoryId: 'c1', categoryName: 'คอมพิวเตอร์', quantity: 1, salesPick: false, variants: [], optionUnitIds: null }] },
  { id: 'p2', name: 'ตู้ประกอบ', price: 20000, is_active: true, requirements: [{ id: 'r2', categoryId: 'c3', categoryName: 'ตู้ประกอบ', quantity: 1, salesPick: true, variants: ['ประกอบ 1', 'ประกอบ 2'], optionUnitIds: null }] },
]
const categoryUnits = { c3: [{ id: 'u1', kind: 'item', name: 'ตู้ประกอบ ชุด 1', status: 'available' }, { id: 'u2', kind: 'item', name: 'ตู้ประกอบ ชุด 2', status: 'damaged' }] }
const value = [
  { id: 'lp1', packageId: 'p1', packageName: 'Selfie studio booth', price: 15000, isActive: true, quantity: 2, units: [] },
  { id: 'lp2', packageId: 'p2', packageName: 'ตู้ประกอบ', price: 20000, isActive: true, quantity: 1, units: [{ requirementId: 'r2', unitId: 'u1', kind: 'item', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2' }] },
]
const warnings = [{ categoryId: 'c1', categoryName: 'คอมพิวเตอร์', packageName: 'Selfie studio booth', level: 'yellow', need: 2, capacity: 2, demandSure: 0, demandPlanned: 1, message: 'คอมพิวเตอร์ อาจไม่พอ — ต้องใช้ 2 มีที่ใช้ได้ 2 และงานอื่นที่เวลาทับอาจใช้อีก 1', leadIds: ['L2'] }]
const event = { date: '2026-10-20', time: '10:00', endTime: '18:00' }

const view = renderToStaticMarkup(createElement(PackagePicker, { leadId: 'L1', event, value, packages, categoryUnits, warnings, canEdit: false }))
for (const s of ['Selfie studio booth', '×2', 'ตู้ประกอบ ชุด 1', 'ประกอบ 2', 'อุปกรณ์อาจไม่พอ']) assert.ok(view.includes(s), `โหมดดูต้องมี "${s}"`)
assert.ok(!view.includes('แก้แพ็กเกจ') && !view.includes('เลือกแพ็กเกจ'), 'canEdit=false ไม่มีปุ่มแก้')

const edit = renderToStaticMarkup(createElement(PackagePicker, { leadId: 'L1', event, value, packages, categoryUnits, warnings, canEdit: true }))
assert.ok(edit.includes('แก้แพ็กเกจ'), 'canEdit=true มีปุ่มแก้แพ็กเกจ')
const empty = renderToStaticMarkup(createElement(PackagePicker, { leadId: 'L1', event, value: [], packages, categoryUnits, canEdit: true, legacyName: 'Premium Booth + Video' }))
assert.ok(empty.includes('เลือกแพ็กเกจ') && empty.includes('Premium Booth + Video'), 'ยังไม่เลือก = ปุ่มเลือก + ชื่อเดิม')
assert.ok(!/min-w-\[(4|5|6|7|8|9)\d\d/.test(edit), 'ไม่มี min-width คงที่เกิน 360px')

// แผงบน dashboard: ผู้เห็น + ช่วงวัน + เรียง
const today = new Date('2026-10-07T03:00:00Z')
const input = {
  leads: [
    { id: 'L1', customer_name: 'ลูกค้า ก', event_name: null, event_date: '2026-10-20' },
    { id: 'L2', customer_name: 'ลูกค้า ข', event_name: null, event_date: '2026-10-09' },
    { id: 'L3', customer_name: 'ไกลเกิน', event_name: null, event_date: '2026-12-01' },
  ],
  warningsByLead: { L1: warnings, L2: warnings, L3: warnings },
  leadCreatedBy: { L1: 'sales-1', L2: 'sales-2', L3: 'sales-1' },
  kitDepartments: ['ทีมจัดของ'],
  viewer: { userId: 'sales-1', department: 'ฝ่ายขาย', isAdmin: false, canManagePool: false },
  today,
}
const rows = buildCapacityRows(input)
assert.deepEqual(rows.map(r => r.leadId), ['L1'], 'ผู้สร้างการ์ดเห็นเฉพาะงานตัวเองในช่วง 30 วัน')
assert.deepEqual(buildCapacityRows({ ...input, viewer: { ...input.viewer, isAdmin: true } }).map(r => r.leadId), ['L2', 'L1'], 'แอดมินเห็นทุกงานในช่วง เรียงวันใกล้ก่อน')
assert.ok(canSeeCapacity({ userId: 'x', department: 'ทีมจัดของ', isAdmin: false, canManagePool: false }, 'someone', ['ทีมจัดของ']), 'ทีมจัดของเห็น')
const panel = renderToStaticMarkup(createElement(CapacityPanel, { rows }))
assert.ok(panel.includes('แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ') && panel.includes('/jobs/tracking?lead=L1') && panel.includes('ลูกค้า ก'), 'แผงมีหัวข้อ ลิงก์ และชื่อลูกค้า')
assert.equal(renderToStaticMarkup(createElement(CapacityPanel, { rows: [] })), '', 'ว่าง = ไม่ render')

console.log('package-picker-render: ผ่านทั้งหมด')
