// แดชบอร์ดการใช้งานอุปกรณ์ (/stock/usage) — render UsageView แบบ static ด้วยข้อมูลสังเคราะห์ 2 ชุด (มีข้อมูล / ว่าง)
// ตรวจข้อความสำคัญ ตัวเลขทศนิยม 1 ตำแหน่ง ส่วนที่ซ่อน/แสดง และไม่มี min-width คงที่เกิน 360px
// Run: npx tsx scripts/usage-render.check.ts · ไม่แตะเครือข่าย/ฐานข้อมูล (recharts ถูกแทนด้วย component ว่าง — SSR วัดขนาดไม่ได้)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "usage-render: ผ่านทั้งหมด"
process.env.TZ = 'Asia/Bangkok'
import assert from 'node:assert/strict'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
let chartRendered = 0
// ทุก export ของ recharts = component ที่ไม่วาดอะไร (ResponsiveContainer ส่ง children ต่อ · BarChart นับครั้งไว้ตรวจว่ากราฟถูกเรียก)
const recharts = new Proxy(
  {},
  {
    get: (_t, key) => {
      if (key === '__esModule') return true
      if (key === 'BarChart') return () => (chartRendered++, null)
      if (key === 'ResponsiveContainer') return ({ children }: { children?: unknown }) => children ?? null
      return typeof key === 'string' ? () => null : undefined
    },
  },
)
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === 'recharts') return recharts
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const UsageView = require('../app/(authenticated)/stock/usage/usage-view').default
/* eslint-enable @typescript-eslint/no-require-imports */

let checks = 0
const has = (html: string, s: string, what: string) => {
  assert.ok(html.includes(s), `${what}: ต้องมี "${s}"`)
  checks++
}
const lacks = (html: string, s: string, what: string) => {
  assert.ok(!html.includes(s), `${what}: ต้องไม่มี "${s}"`)
  checks++
}
/** ไม่มี min-width คงที่เกิน 360px (class min-w-[Npx] หรือ style min-width) */
const noWideMin = (html: string, what: string) => {
  for (const m of html.matchAll(/min-w-\[(\d+)px\]|min-width:\s*(\d+)px/g)) {
    assert.ok(Number(m[1] ?? m[2]) <= 360, `${what}: พบ min-width ${m[0]} เกิน 360px`)
  }
  checks++
}

const line = (o: Record<string, unknown>) => ({
  unitId: 'u1',
  kind: 'item',
  unitName: 'กล้อง Canon R6',
  serial: 'SN-001',
  categoryId: 'cam',
  categoryName: 'กล้อง',
  listId: 'L1',
  leadId: 'lead1',
  customerName: 'บริษัท ก',
  eventDate: '2026-10-01',
  eventTime: '10:00:00',
  eventEndTime: '18:00:00',
  handedOverAt: '2026-10-01T02:00:00Z',
  returnedAt: '2026-10-01T12:30:00Z',
  variant: null,
  ...o,
})
const list = (o: Record<string, unknown>) => ({
  id: 'L1',
  status: 'done',
  eventDate: '2026-10-01',
  packedBy: null,
  packedAt: null,
  handedOverBy: null,
  handedOverAt: null,
  returnedBy: null,
  returnedAt: null,
  restockedBy: null,
  restockedAt: null,
  leadId: 'lead1',
  ...o,
})

// --- ชุดที่ 1: มีข้อมูล --------------------------------------------------------
const full = {
  today: '2026-10-07',
  lines: [
    line({}),
    line({ listId: 'L2', handedOverAt: '2026-10-03T02:00:00Z', returnedAt: '2026-10-03T03:20:00Z' }),
    line({ unitId: 'k1', kind: 'kit', unitName: 'กระเป๋าไฟ A', serial: null, categoryId: 'bag', categoryName: 'กระเป๋าอุปกรณ์', returnedAt: null }),
    line({ unitId: 'b1', unitName: 'ตู้ประกอบ ชุด 1', serial: null, categoryId: 'booth', categoryName: 'ตู้ประกอบ', variant: 'ประกอบ 2' }),
  ],
  lists: [
    list({ id: 'L1', status: 'done', packedBy: 'p1', handedOverBy: 'p2', handedOverAt: '2026-10-01T02:00:00Z', returnedBy: 'p2', restockedBy: 'p1' }),
    list({ id: 'L2', status: 'out', packedBy: 'p1', handedOverBy: 'p2', handedOverAt: '2026-10-03T02:00:00Z' }),
    list({ id: 'L3', status: 'ready', packedBy: 'p1', packedAt: '2026-10-06T02:00:00Z' }),
    list({ id: 'L4', status: 'returned', packedBy: 'p1' }),
  ],
  sold: [
    { packageId: 'pk1', packageName: 'Selfie studio booth', quantity: 2, eventDate: '2026-10-01', leadId: 'lead1', hasList: true },
    { packageId: 'pk2', packageName: '360DSLR', quantity: 1, eventDate: '2026-12-01', leadId: 'lead2', hasList: false },
  ],
  unitsByCategory: [
    { categoryId: 'cam', categoryName: 'กล้อง', unitCount: 3 },
    { categoryId: 'bag', categoryName: 'กระเป๋าอุปกรณ์', unitCount: 2 },
    { categoryId: 'booth', categoryName: 'ตู้ประกอบ', unitCount: 2 },
    { categoryId: 'pc', categoryName: 'คอมพิวเตอร์', unitCount: 4 },
  ],
  salesPickCategoryIds: ['booth'],
  people: [
    { id: 'p1', name: 'เอ | สมชาย' },
    { id: 'p2', name: 'บี | สมหญิง' },
  ],
}
chartRendered = 0
const html = renderToStaticMarkup(createElement(UsageView, full))
const W = 'มีข้อมูล'
for (const s of [
  'การใช้งานอุปกรณ์',
  'ภาพรวม', 'เดือนนี้', '3 เดือน', 'ปีนี้',
  'พร้อมรับ', 'ออกงาน', 'รอคืนชั้น', 'href="/packing"',
  'ชั่วโมงใช้งานต่อเดือน (12 เดือน)',
  'หน่วยที่ใช้บ่อย', 'ค้นหาชื่อหรือ serial', 'กล้อง Canon R6', 'SN-001',
  '11.8', // 10.5 + 1.333 ชม. ปัดผลรวม
  '8.0', // กระเป๋าไม่มีเวลาคืน → ช่วงอีเวนต์ 10:00–18:00 (ทศนิยม 1 ตำแหน่งเสมอ)
  '3 ต.ค. 69', // ใช้ล่าสุดตามเวลาไทย พ.ศ.
  'ตามประเภท', 'คอมพิวเตอร์', 'ไม่ได้ใช้',
  'ตามแพ็กเกจ', 'Selfie studio booth',
  'ตู้และแบบประกอบ', 'ตู้ประกอบ ชุด 1', 'ประกอบ 2 × 1',
  'คน', 'เอ | สมชาย', 'บี | สมหญิง',
]) has(html, s, W)
lacks(html, '360DSLR', W) // วันงานยังไม่ถึง → ไม่นับว่าขายแล้ว
lacks(html, 'ยังไม่มีการใช้งานใน 12 เดือนล่าสุด', W)
assert.equal(chartRendered, 1, 'มีข้อมูล: ต้องวาดกราฟแท่ง 1 รูป')
checks++
// ตอนนี้: พร้อมรับ 1 · ออกงาน 1 · รอคืนชั้น 1
assert.equal((html.match(/>1<\/div><div class="text-\[11px\][^"]*">ใบ · ดูใบจัดของ/g) ?? []).length, 3, 'ตอนนี้: 3 ช่องต้องเป็น 1 ใบ')
checks++
// ตารางห่อ overflow-x-auto ทุกตาราง
assert.equal((html.match(/<table/g) ?? []).length, (html.match(/overflow-x-auto[^"]*"><table/g) ?? []).length, 'ทุกตารางต้องอยู่ใน overflow-x-auto')
checks++
noWideMin(html, W)

// --- ชุดที่ 2: ว่าง (ยังไม่มีใบจัดของ / ไม่มีประเภทตู้) --------------------------------
chartRendered = 0
const empty = renderToStaticMarkup(
  createElement(UsageView, { today: '2026-10-07', lines: [], lists: [], sold: [], unitsByCategory: [], salesPickCategoryIds: [], people: [] }),
)
const E = 'ว่าง'
for (const s of [
  'การใช้งานอุปกรณ์',
  'ยังไม่มีการใช้งานใน 12 เดือนล่าสุด',
  'ยังไม่มีอุปกรณ์ที่ออกงาน',
  'ยังไม่มีประเภทอุปกรณ์',
  'ยังไม่มีแพ็กเกจที่ขาย',
  'ยังไม่มีใครจัดของหรือคืนของ',
]) has(empty, s, E)
lacks(empty, 'ตู้และแบบประกอบ', E) // ไม่มีประเภท sales_pick → ซ่อนส่วนตู้
lacks(empty, '<table', E)
assert.equal(chartRendered, 0, 'ว่าง: ไม่วาดกราฟ')
checks++
assert.equal((empty.match(/>0<\/div>/g) ?? []).length, 3, 'ว่าง: ตอนนี้ 3 ช่องเป็น 0')
checks++
noWideMin(empty, E)

console.log(`usage-render (${checks} ข้อ)`)
console.log('usage-render: ผ่านทั้งหมด')
