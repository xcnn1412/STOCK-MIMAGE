// ใบจัดของ (เฟส 3 รอบ B) — render หน้าจอแบบ static ด้วยข้อมูลสังเคราะห์ ตรวจว่าไม่ throw และมีข้อความ/ลิงก์/ปุ่มสำคัญ
// ครอบ: คิว /packing · หน้าใบ /packing/[id] 3 สถานะ (เลือกของ / กำลังหยิบ / พร้อมรับ) · แผ่นพิมพ์ · /pickup/[id] · หัวข้อจุดรับของในตั้งค่าคลัง
//       · ช่อง "จัดของ" (KitSummary) ในหน้าติดตามงาน 3 กรณี (มีใบ / มีแพ็กเกจแต่ยังไม่มีใบ / ไม่มีแพ็กเกจ)
// Run: npx tsx scripts/packing-render.check.ts · ไม่แตะเครือข่าย/ฐานข้อมูล (server actions, sonner, next/navigation ถูกแทนด้วยตัวจำลอง)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "packing-render: ผ่านทั้งหมด"
process.env.TZ = 'Asia/Bangkok'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const noopActions = () => new Proxy({}, { get: (_t, key) => (key === '__esModule' ? true : typeof key === 'string' ? async () => ({ success: true }) : undefined) })
const toast = Object.assign(() => {}, { error() {}, success() {}, info() {}, warning() {} })
const ACTIONS = new Set(['./actions', '../actions', '../../packing/actions', '../../../packing/actions'])
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (ACTIONS.has(request)) return noopActions()
  if (request === 'sonner') return { toast, Toaster: () => null }
  if (request === 'next/navigation') {
    const real = realLoad.call(this, request, ...rest) as object
    return { ...real, useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} }) }
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const PackingQueueView = require('../app/(authenticated)/packing/packing-queue-view').default
const PackingListView = require('../app/(authenticated)/packing/[id]/packing-list-view').default
const { PackingSheet } = require('../app/(authenticated)/packing/[id]/print/print-view')
const PickupView = require('../app/(authenticated)/pickup/[id]/pickup-view').default
const HandoverSheet = require('../app/(authenticated)/pickup/[id]/handover-sheet').default
const ReturnSheet = require('../app/(authenticated)/pickup/[id]/return-sheet').default
const { PackingCloseView, PackingNotReturned } = require('../app/(authenticated)/events/[id]/return/packing-close-view')
const PickupSpotsSection = require('../app/(authenticated)/stock/settings/pickup-spots-section').default
const SettingsView = require('../app/(authenticated)/stock/settings/settings-view').default
const { KitSummary } = require('../app/(authenticated)/jobs/tracking/pool-tabs')
/* eslint-enable @typescript-eslint/no-require-imports */

let checks = 0
const has = (html: string, list: string[], where: string) => {
  for (const s of list) {
    assert.ok(html.includes(s), `${where} ต้องมี "${s}"`)
    checks++
  }
}
const lacks = (html: string, list: string[], where: string) => {
  for (const s of list) {
    assert.ok(!html.includes(s), `${where} ต้องไม่มี "${s}"`)
    checks++
  }
}
const all: string[] = []
const render = (el: ReturnType<typeof createElement>) => {
  const html = renderToStaticMarkup(el)
  all.push(html)
  return html
}

// --- ข้อมูลสังเคราะห์ -------------------------------------------------------------
const place = { shelfId: 's1', shelfCode: 'A-2', roomName: 'ห้องเก็บของ', rackCode: 'R1', level: 2 }
const placeB = { shelfId: 's2', shelfCode: 'B-1', roomName: 'ห้องเก็บของ', rackCode: 'R2', level: 1 }
const spot = { id: 'S1', name: 'หน้าห้องเก็บของ', code: 'P1', note: 'ชั้นวางสีเขียว', is_active: true, sort_order: 0, created_at: '2026-10-01T00:00:00Z' }
const spotOff = { ...spot, id: 'S2', name: 'โต๊ะหน้าประตู', code: 'P2', note: null, is_active: false }
const event = { id: 'E1', name: 'งานแต่งคุณเอ', event_date: '2026-10-20', event_time: '10:00', event_end_time: '18:00', location: 'โรงแรมริมน้ำ', status: 'planned' }
const lead = { id: 'L1', customer_name: 'คุณเอ', event_location: 'โรงแรมริมน้ำ' }
const leadPackages = [
  {
    id: 'lp1',
    packageId: 'p1',
    packageName: 'Selfie studio booth',
    price: 15000,
    isActive: true,
    quantity: 1,
    units: [{ requirementId: 'r2', unitId: 'booth1', kind: 'item', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2' }],
  },
]
const req = (id: string, categoryId: string, categoryName: string, extra: object = {}) => ({
  leadPackageId: 'lp1',
  packageId: 'p1',
  packageName: 'Selfie studio booth',
  requirementId: id,
  categoryId,
  categoryName,
  slots: 1,
  salesPick: false,
  variants: [] as string[],
  optionUnitIds: null,
  lockedUnits: [] as object[],
  ...extra,
})
const scaffold = [
  req('r1', 'c1', 'คอมพิวเตอร์'),
  req('r2', 'c2', 'ตู้ประกอบ', { salesPick: true, variants: ['ประกอบ 1', 'ประกอบ 2'], lockedUnits: [{ unitId: 'booth1', kind: 'item', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2', locked: true }] }),
  req('r3', 'c3', 'กระเป๋าอุปกรณ์'),
]
const unitsByCategory = {
  c1: [
    { id: 'pc1', kind: 'item', name: 'PC-01', serial: 'SN-001', status: 'available' },
    { id: 'pc2', kind: 'item', name: 'PC-02', serial: null, status: 'damaged' },
  ],
  c2: [{ id: 'booth1', kind: 'item', name: 'ตู้ประกอบ ชุด 1', serial: null, status: 'available' }],
  c3: [{ id: 'kit1', kind: 'kit', name: 'กระเป๋า A', serial: null, status: 'available' }],
}
const extraUnits = [
  { id: 'led1', kind: 'item', name: 'ไฟ LED', serial: null, status: 'available', inKit: false },
  { id: 'kit2', kind: 'kit', name: 'กระเป๋า B', serial: null, status: 'available', inKit: false },
]
const bookings = [{ unitId: 'pc1', eventId: 'E2', eventName: 'งานบริษัท บี', eventDate: '2026-10-20', eventTime: '09:00', eventEndTime: '12:00' }]

const line = (id: string, o: Record<string, unknown>) => ({
  id,
  list_id: 'PL1',
  package_id: 'p1',
  category_id: null,
  item_id: null,
  kit_id: null,
  variant: null,
  locked: false,
  picked_at: null,
  picked_by: null,
  handed_over_at: null,
  returned_at: null,
  return_condition: null,
  return_note: null,
  restocked_at: null,
  restocked_by: null,
  created_at: '2026-10-07T01:00:00Z',
  kind: 'item',
  unitId: '',
  unitName: '',
  serial: null,
  unitStatus: 'available',
  categoryName: null,
  packageName: 'Selfie studio booth',
  place: null,
  pickBlock: null,
  ...o,
})
const boothLine = (o: object = {}) =>
  line('ln-booth', { category_id: 'c2', item_id: 'booth1', unitId: 'booth1', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2', locked: true, categoryName: 'ตู้ประกอบ', place, ...o })
const pcLine = (o: object = {}) => line('ln-pc', { category_id: 'c1', item_id: 'pc1', unitId: 'pc1', unitName: 'PC-01', serial: 'SN-001', categoryName: 'คอมพิวเตอร์', place, ...o })
const kitLine = (o: object = {}) =>
  line('ln-kit', {
    category_id: 'c3',
    kit_id: 'kit1',
    kind: 'kit',
    unitId: 'kit1',
    unitName: 'กระเป๋า A',
    categoryName: 'กระเป๋าอุปกรณ์',
    kitItems: [
      { id: 'cam1', name: 'กล้อง Canon', status: 'in_use', outElsewhere: true },
      { id: 'cbl1', name: 'สายไฟ', status: 'available' },
    ],
    ...o,
  })
const extraLine = (o: object = {}) => line('ln-led', { package_id: null, item_id: 'led1', unitId: 'led1', unitName: 'ไฟ LED', packageName: null, place: placeB, ...o })

const listRow = (o: object = {}) => ({
  id: 'PL1',
  event_id: 'E1',
  lead_id: 'L1',
  status: 'selecting',
  packed_at: null,
  packed_by: null,
  photo_urls: [] as string[],
  spot_id: null,
  staged_at: null,
  handed_over_at: null,
  handed_over_by: null,
  returned_at: null,
  returned_by: null,
  return_note: null,
  return_photo_urls: [] as string[],
  restocked_at: null,
  restocked_by: null,
  created_by: 'U1',
  created_at: '2026-10-07T01:00:00Z',
  updated_at: '2026-10-07T01:00:00Z',
  ...o,
})
const people = { U1: 'น้องจัด', U2: 'พี่หน้างาน', U3: 'น้องคืนชั้น' }
const detail = (list: object, lines: object[], o: object = {}) => ({ list: listRow(list), event, lead, leadPackages, scaffold, lines, spot: null, bookings, unitsByCategory, consumables: [], people, ...o })

// --- 1) คิว /packing -------------------------------------------------------------
const card = (o: object) => ({
  leadId: 'L1',
  eventId: 'E1',
  customerName: 'คุณเอ',
  eventName: 'งานแต่งคุณเอ',
  eventDate: '2026-10-20',
  eventTime: '10:00',
  eventEndTime: '18:00',
  location: 'โรงแรมริมน้ำ',
  packageNames: ['Selfie studio booth', '360DSLR ×2'],
  list: null,
  spotName: null,
  ...o,
})
const summary = (o: object) => ({ id: 'PL1', eventId: 'E1', leadId: 'L1', status: 'picking', lineCount: 5, pickedCount: 2, spotId: null, ...o })
const queue = {
  awaiting: [card({ leadId: 'L9', eventId: 'E9', customerName: 'คุณรอเปิด' })],
  active: [card({ list: summary({}) })],
  ready: [card({ eventId: 'E3', customerName: 'คุณพร้อม', list: summary({ id: 'PL3', eventId: 'E3', status: 'ready', pickedCount: 5, spotId: 'S1' }), spotName: 'หน้าห้องเก็บของ' })],
  out: [card({ eventId: 'E5', customerName: 'คุณออกงานคิว', eventDate: '2026-10-21', list: summary({ id: 'PL5', eventId: 'E5', status: 'out', pickedCount: 5 }) })],
  returned: [card({ eventId: 'E6', customerName: 'คุณรอคืนชั้น', eventDate: '2026-10-22', list: summary({ id: 'PL6', eventId: 'E6', status: 'returned', pickedCount: 5 }) })],
}
const q = render(createElement(PackingQueueView, { queue }))
has(q, ['ใบจัดของ', 'รอเปิดใบ', 'กำลังทำ', 'พร้อมรับ', 'คุณรอเปิด', 'เปิดใบจัดของ', 'คุณเอ', 'งานแต่งคุณเอ', '20 ต.ค. 2569 · 10:00–18:00', 'โรงแรมริมน้ำ', 'Selfie studio booth', '360DSLR ×2', 'กำลังหยิบ · หยิบแล้ว 2/5', 'หยิบแล้ว 5/5', 'หน้าห้องเก็บของ', 'href="/packing/PL1"', 'href="/packing/PL3"', 'min-h-11'], 'คิว')
has(q, ['>ออกงาน <', '>รอคืนชั้น <', 'คุณออกงานคิว', 'คุณรอคืนชั้น', 'href="/packing/PL5"', 'href="/packing/PL6"', 'คืนแล้ว'], 'คิว (ออกงาน + รอคืนชั้น)')
// กลุ่มเรียง: พร้อมรับ → ออกงาน → รอคืนชั้น
assert.ok(q.indexOf('คุณพร้อม') < q.indexOf('คุณออกงานคิว') && q.indexOf('คุณออกงานคิว') < q.indexOf('คุณรอคืนชั้น'), 'กลุ่มออกงาน/รอคืนชั้นต่อท้ายพร้อมรับ')
checks++
assert.ok(q.includes('sm:grid-cols-2'), 'คิวเป็นคอลัมน์เดียวบนจอแคบ')
const qEmpty = render(createElement(PackingQueueView, { queue: { awaiting: [], active: [], ready: [], out: [], returned: [] } }))
has(qEmpty, ['ยังไม่มีงานให้จัดของ', 'ไม่มีงานที่รอเปิดใบ', 'ไม่มีใบที่กำลังทำ', 'ยังไม่มีใบที่พร้อมรับ', 'ไม่มีใบที่ออกงานอยู่', 'ไม่มีใบที่รอคืนชั้น'], 'คิวว่าง')
const qErr = render(createElement(PackingQueueView, { queue: { awaiting: [], active: [], ready: [] }, loadError: 'โหลดคิวใบจัดของไม่สำเร็จ' }))
has(qErr, ['โหลดคิวใบจัดของไม่สำเร็จ'], 'คิวโหลดพัง')

// --- 2) หน้าใบ: เลือกของ -----------------------------------------------------------
const sel = render(createElement(PackingListView, { detail: detail({ status: 'selecting' }, [boothLine(), pcLine()]), extraUnits, spots: [spot] }))
has(
  sel,
  ['คุณเอ', 'งานแต่งคุณเอ', '20 ต.ค. 2569 · 10:00–18:00', 'โรงแรมริมน้ำ', 'Selfie studio booth', 'aria-current="step"', 'เลือกของ', 'คอมพิวเตอร์', 'ตู้ประกอบ ชุด 1', 'ประกอบ 2', 'ทีมขายเลือกไว้', 'กระเป๋าอุปกรณ์', 'เลือกแล้ว 0/1', 'ของเสริม', 'ค้นหาชื่ออุปกรณ์', 'บันทึกรายการ', 'สร้างใบจัดของ', 'ยกเลิกใบ', 'เลือกตามแพ็กเกจแล้ว 2/3'],
  'ขั้นเลือกของ',
)
lacks(sel, ['ตู้ที่ขายไว้ใช้ไม่ได้', 'พิมพ์ใบจัดของ', 'ยืนยันจัดของ'], 'ขั้นเลือกของ')
// ตู้ที่ทีมขายเลือกเสีย → ป้ายแดงให้แจ้งทีมขาย
const selBad = render(createElement(PackingListView, { detail: detail({ status: 'selecting' }, [boothLine({ unitStatus: 'damaged' })]), extraUnits, spots: [spot] }))
has(selBad, ['ตู้ที่ขายไว้ใช้ไม่ได้ แจ้งทีมขายเปลี่ยน', 'ไม่พร้อม'], 'ตู้ที่ขายไว้เสีย')
// งานไม่มีแพ็กเกจ (โครงว่าง) → แจ้งให้ทีมขายเลือก และปุ่มสร้างใบกดไม่ได้
const selNone = render(createElement(PackingListView, { detail: detail({ status: 'selecting' }, [], { scaffold: [], leadPackages: [] }), extraUnits, spots: [] }))
has(selNone, ['ให้ทีมขายเลือกแพ็กเกจก่อน'], 'ไม่มีแพ็กเกจ')

// --- 3) หน้าใบ: กำลังหยิบ (+ ส่วนยืนยัน) ------------------------------------------------
const blocked = 'กระเป๋านี้มีของออกงานอยู่กับงานอื่น: กล้อง Canon — หยิบไม่ได้จนกว่าจะคืน'
const pick = render(
  createElement(PackingListView, {
    detail: detail({ status: 'picking' }, [boothLine(), pcLine({ picked_at: '2026-10-07T02:00:00Z' }), kitLine({ pickBlock: blocked }), extraLine()]),
    extraUnits,
    spots: [spot],
  }),
)
has(
  pick,
  ['กำลังหยิบ · หยิบแล้ว 1/4', 'ห้องเก็บของ › ตู้ R1 › ชั้น 2 (A-2)', 'ห้องเก็บของ › ตู้ R2 › ชั้น 1 (B-1)', 'ยังไม่มีชั้น', 'หยิบแล้ว', 'ยกเลิกหยิบ', 'เปลี่ยนของ', blocked, 'S/N SN-001', 'ของเสริม', 'ทีมขายเลือก', 'ของในกระเป๋า 2 ชิ้น', 'หยิบแล้ว 1/4', 'พิมพ์ใบจัดของ', 'href="/packing/PL1/print"', 'ยกเลิกใบ', 'ยืนยันจัดของ', 'ถ่ายรูป / เลือกรูป', 'accept="image/*"', 'จุดรับของ', 'หยิบครบทุกบรรทัด (1/4)', 'ถ่ายรูปชุดที่จัดเสร็จอย่างน้อย 1 รูป'],
  'ขั้นกำลังหยิบ',
)
// เส้นทางหยิบ: ห้อง › ตู้ R1 ก่อน R2 · "ยังไม่มีชั้น" ท้ายสุด
assert.ok(pick.indexOf('ตู้ R1 › ชั้น 2') < pick.indexOf('ตู้ R2 › ชั้น 1') && pick.indexOf('ตู้ R2 › ชั้น 1') < pick.indexOf('ยังไม่มีชั้น'), 'กลุ่มเรียง ห้อง › ตู้ › ชั้น และยังไม่มีชั้นท้ายสุด')
checks++
// ปุ่มยืนยันกดไม่ได้จนกว่าจะครบ (ยังหยิบไม่ครบ + ไม่มีรูป)
assert.match(pick, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*ยืนยันจัดของ<\/button>/, 'ปุ่มยืนยันจัดของ disabled')
checks++
assert.ok(!pick.includes('กลับไปแก้รายการ'), 'มีของที่หยิบแล้ว = ไม่มีปุ่มกลับไปแก้รายการ')
checks++
// หยิบครบ + มีรูป + จุดเดียว (เลือกให้เอง) → ปุ่มยืนยันกดได้
const pickDone = render(
  createElement(PackingListView, {
    detail: detail({ status: 'picking', photo_urls: ['https://x.supabase.co/storage/v1/object/public/packing-photos/PL1/1_a.jpg'] }, [pcLine({ picked_at: '2026-10-07T02:00:00Z' })]),
    extraUnits,
    spots: [spot],
  }),
)
has(pickDone, ['หยิบครบทุกบรรทัด (1/1)', 'ถ่ายรูปแล้ว 1 รูป', 'เลือกจุดรับของแล้ว', 'packing-photos/PL1/1_a.jpg', 'ลบรูปนี้'], 'พร้อมยืนยัน')
assert.doesNotMatch(pickDone, /<button[^>]*disabled=""[^>]*>(?:(?!<\/button>)[\s\S])*ยืนยันจัดของ<\/button>/, 'ครบแล้วปุ่มยืนยันกดได้')
checks++
const pickZero = render(createElement(PackingListView, { detail: detail({ status: 'picking' }, [pcLine()]), extraUnits, spots: [] }))
has(pickZero, ['กลับไปแก้รายการ', 'ยังไม่มีจุดรับของที่เปิดใช้', 'href="/stock/settings"'], 'ยังไม่หยิบ + ไม่มีจุด')

// --- 4) หน้าใบ: พร้อมรับ -----------------------------------------------------------
const readyLines = [boothLine({ picked_at: 'x' }), pcLine({ picked_at: 'x' }), kitLine({ picked_at: 'x' })]
const ready = render(
  createElement(PackingListView, {
    detail: detail({ status: 'ready', packed_at: '2026-10-07T07:05:00Z', spot_id: 'S1', photo_urls: ['https://x.supabase.co/p/PL1/1.jpg'] }, readyLines, { spot }),
    extraUnits: [],
    spots: [spot],
  }),
)
has(ready, ['พร้อมรับ — วางไว้ที่ หน้าห้องเก็บของ', 'จัดเสร็จเมื่อ', 'https://x.supabase.co/p/PL1/1.jpg', 'แก้ไข (ถอยเป็นกำลังหยิบ)', 'พิมพ์ใบจัดของ', 'ตู้ประกอบ ชุด 1', 'data-testid="packing-ready"'], 'ขั้นพร้อมรับ')
lacks(ready, ['ยกเลิกใบ', 'ยืนยันจัดของ', 'บันทึกรายการ'], 'ขั้นพร้อมรับ')
const closed = render(createElement(PackingListView, { detail: detail({ status: 'ready', spot_id: 'S1' }, readyLines, { spot, event: { ...event, status: 'completed' } }), extraUnits: [], spots: [] }))
has(closed, ['อีเวนต์นี้ปิดงานไปแล้ว'], 'อีเวนต์ปิดแล้ว')
lacks(closed, ['แก้ไข (ถอยเป็นกำลังหยิบ)'], 'อีเวนต์ปิดแล้ว')
// stepper 6 ขั้น (3 คอลัมน์บนมือถือ · 6 คอลัมน์จอกว้าง)
has(ready, ['grid-cols-3', 'sm:grid-cols-6', 'ออกงาน', 'คืนแล้ว', 'คืนชั้นแล้ว'], 'stepper 6 ขั้น')
assert.equal((ready.match(/<li[^>]*class="flex min-w-0 items-center justify-center/g) ?? []).length, 6, 'stepper มี 6 ขั้น')
checks++

// บรรทัดที่ออกงานแล้ว: กระเป๋ามีชิ้นที่ออกงานให้อีเวนต์นี้ (in_use, ไม่ outElsewhere) + วัสดุสิ้นเปลือง
const outKitLine = (o: object = {}) =>
  kitLine({
    picked_at: 'x',
    handed_over_at: '2026-10-20T01:00:00Z',
    kitItems: [
      { id: 'cam1', name: 'กล้อง Canon', status: 'in_use', outElsewhere: false },
      { id: 'cbl1', name: 'สายไฟ', status: 'in_use', outElsewhere: false },
      { id: 'paper', name: 'กระดาษโฟโต้', status: 'available', is_consumable: true },
    ],
    ...o,
  })
const consumables = [
  { kitId: 'kit1', itemId: 'paper', name: 'กระดาษโฟโต้', unit: 'แผ่น', kitQuantity: 100, alreadyUsed: null },
  { kitId: 'kit1', itemId: 'ink', name: 'หมึก', unit: 'ตลับ', kitQuantity: 2, alreadyUsed: 1 },
]

// --- 4.1) หน้าใบ: ออกงาน — สรุป + รับของเมื่อ … โดย … + จุด · ไม่มีปุ่มแก้ไข/ยกเลิก -------------------
const outList = { status: 'out', packed_at: '2026-10-19T07:00:00Z', packed_by: 'U1', handed_over_at: '2026-10-20T01:30:00Z', handed_over_by: 'U2', spot_id: 'S1', photo_urls: ['https://x.supabase.co/p/PL1/1.jpg'] }
const outLines = [boothLine({ picked_at: 'x', handed_over_at: 'x' }), pcLine({ picked_at: 'x', handed_over_at: 'x' }), outKitLine()]
const outView = render(createElement(PackingListView, { detail: detail(outList, outLines, { spot }), extraUnits: [], spots: [spot] }))
has(outView, ['data-testid="packing-out"', 'ออกงาน — ทีมหน้างานรับของไปแล้ว', 'รับของเมื่อ', 'โดย พี่หน้างาน', 'จากจุด หน้าห้องเก็บของ', 'href="/pickup/S1"', 'จัดเสร็จ', 'โดย น้องจัด', 'ตู้ประกอบ ชุด 1', 'PC-01', 'กระเป๋า A', 'aria-current="step"'], 'ขั้นออกงาน')
lacks(outView, ['ยกเลิกใบ', 'แก้ไข (ถอยเป็นกำลังหยิบ)', 'คืนชั้นทั้งหมด', 'อีเวนต์นี้ปิดงานไปแล้ว'], 'ขั้นออกงาน')
assert.ok(/aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*ออกงาน/.test(outView), 'stepper ชี้ขั้นออกงาน')
checks++

// --- 4.2) หน้าใบ: คืนแล้ว — ขั้นคืนชั้น -----------------------------------------------------
const retList = { ...outList, status: 'returned', returned_at: '2026-10-20T12:00:00Z', returned_by: 'U2', return_note: 'สายไฟขาด 1 เส้น', return_photo_urls: ['https://x.supabase.co/p/PL1/return_1.jpg'] }
const retLines = [
  pcLine({ picked_at: 'x', handed_over_at: 'x', returned_at: 'x', return_condition: 'damaged', return_note: 'จอแตก' }),
  outKitLine({ returned_at: 'x', return_condition: 'available', kitItems: [{ id: 'cam1', name: 'กล้อง Canon', status: 'in_use' }, { id: 'cbl1', name: 'สายไฟ', status: 'maintenance' }] }),
  extraLine({ picked_at: 'x', handed_over_at: 'x', returned_at: 'x', return_condition: 'available', restocked_at: '2026-10-21T02:00:00Z', restocked_by: 'U3' }),
]
const rs = render(createElement(PackingListView, { detail: detail(retList, retLines, { spot }), extraUnits: [], spots: [spot] }))
has(
  rs,
  ['data-testid="restock-step"', 'คืนแล้ว — รอคืนชั้น', 'คืนของเมื่อ', 'ของวางอยู่ที่ หน้าห้องเก็บของ', 'data-testid="event-open"', 'อีเวนต์ยังไม่ปิด — รอผู้มีสิทธิ์ปิดงาน', 'data-testid="restock-problems"', 'ของที่มีปัญหา 2 รายการ', 'PC-01 — เสียหาย', 'สายไฟ (ใน กระเป๋า A) — ซ่อม', 'เสียหาย', 'ใช้ได้', 'หมายเหตุ: จอแตก', 'สายไฟขาด 1 เส้น', 'return_1.jpg', 'สถานะคงเป็นเสียหาย', 'ของในกระเป๋า 1 ชิ้นกลับเป็นใช้ได้', 'คืนชั้นแล้ว 1/3', 'คืนชั้นทั้งหมด', 'โดย น้องคืนชั้น'],
  'ขั้นคืนชั้น',
)
lacks(rs, ['ยกเลิกใบ', 'แก้ไข (ถอยเป็นกำลังหยิบ)', 'อีเวนต์นี้ปิดงานไปแล้ว'], 'ขั้นคืนชั้น')
// ปุ่ม "คืนชั้นแล้ว" ≥44px เฉพาะบรรทัดที่ยังไม่คืนชั้น (2 จาก 3) · เรียงเส้นทางตามชั้นบ้าน (R1 ก่อน R2 · ยังไม่มีชั้นท้ายสุด)
assert.equal((rs.match(/<button[^>]*class="[^"]*min-h-11[^"]*"[^>]*>(?:(?!<\/button>)[\s\S])*คืนชั้นแล้ว<\/button>/g) ?? []).length, 2, 'ปุ่มคืนชั้นแล้วเฉพาะบรรทัดที่เหลือ')
assert.ok(rs.indexOf('ตู้ R1 › ชั้น 2') < rs.indexOf('ตู้ R2 › ชั้น 1') && rs.indexOf('ตู้ R2 › ชั้น 1') < rs.indexOf('ยังไม่มีชั้น'), 'คืนชั้นเรียงตามชั้นบ้าน')
checks += 2
const rsClosed = render(createElement(PackingListView, { detail: detail(retList, retLines, { spot, event: { ...event, status: 'completed' } }), extraUnits: [], spots: [] }))
has(rsClosed, ['คืนชั้นทั้งหมด'], 'ขั้นคืนชั้น (อีเวนต์ปิดแล้ว — ยังคืนชั้นได้)')
lacks(rsClosed, ['อีเวนต์ยังไม่ปิด', 'อีเวนต์นี้ปิดงานไปแล้ว'], 'ขั้นคืนชั้น (อีเวนต์ปิดแล้ว)')
const rsAll = render(createElement(PackingListView, { detail: detail(retList, retLines.map(l => ({ ...l, restocked_at: 'x', restocked_by: 'U3' })), { spot }), extraUnits: [], spots: [] }))
has(rsAll, ['คืนชั้นแล้ว 3/3'], 'คืนชั้นครบ (รอโหลดใหม่)')
lacks(rsAll, ['คืนชั้นทั้งหมด'], 'คืนชั้นครบ (รอโหลดใหม่)')

// --- 4.3) หน้าใบ: คืนชั้นแล้ว — สรุปจบ + รูปตอนคืน ----------------------------------------------
const doneList = { ...retList, status: 'done', restocked_at: '2026-10-21T03:00:00Z', restocked_by: 'U3' }
const dn = render(createElement(PackingListView, { detail: detail(doneList, retLines.map(l => ({ ...l, restocked_at: 'x' })), { spot, event: { ...event, status: 'completed' } }), extraUnits: [], spots: [] }))
has(dn, ['data-testid="packing-done"', 'คืนชั้นแล้ว — จบกระบวนการ', 'คืนชั้นครบเมื่อ', 'โดย น้องคืนชั้น', 'มีของเสีย/ซ่อม/หาย 1 รายการ', 'รูปตอนคืน', 'return_1.jpg', 'หมายเหตุตอนคืน:', 'เสียหาย', 'รับของ', 'คืนของ', 'คืนชั้นครบ'], 'ขั้นคืนชั้นแล้ว')
lacks(dn, ['คืนชั้นทั้งหมด', 'ยกเลิกใบ', 'แก้ไข (ถอยเป็นกำลังหยิบ)', 'อีเวนต์นี้ปิดงานไปแล้ว'], 'ขั้นคืนชั้นแล้ว')
assert.ok(/aria-current="step"[^>]*>(?:(?!<\/li>)[\s\S])*คืนชั้นแล้ว<\/span>/.test(dn), 'stepper ชี้ขั้นคืนชั้นแล้ว (ขั้นสุดท้าย)')
checks++

// --- 4.4) หน้าปิดงาน /events/[id]/return: ปิดจากใบ / ใบยังไม่คืนของ -----------------------------
const closeDetail = detail(retList, retLines, { spot, consumables: [{ ...consumables[0], alreadyUsed: 12 }, consumables[1], { ...consumables[0], itemId: 'p0', name: 'สติกเกอร์', alreadyUsed: 0 }] })
const cv = render(createElement(PackingCloseView, { detail: closeDetail }))
has(
  cv,
  ['data-testid="packing-close-view"', 'ปิดงานอีเวนต์ (จากใบจัดของ)', 'คุณเอ', 'งานแต่งคุณเอ', '20 ต.ค. 2569 · 10:00–18:00', 'โรงแรมริมน้ำ', 'ทีมหน้างานคืนของแล้ว — ตรวจสรุปแล้วกดปิดงาน', '3 รายการ · มีของเสีย/ซ่อม/หาย 1 รายการ', 'วัสดุสิ้นเปลืองที่ตัดยอดแล้ว', 'กระดาษโฟโต้', 'ใช้ไป 12 แผ่น', 'หมึก', 'ใช้ไป 1 ตลับ', 'รูปตอนคืน', 'return_1.jpg', 'สายไฟขาด 1 เส้น', 'รายการและสภาพตอนคืน', 'PC-01', 'เสียหาย', 'ปิดงาน', 'min-h-11', 'href="/events"'],
  'หน้าปิดงานจากใบ',
)
lacks(cv, ['สติกเกอร์'], 'หน้าปิดงานจากใบ (ใช้ไป 0 ไม่แสดง)')
const cvNone = render(createElement(PackingCloseView, { detail: detail(retList, [pcLine({ return_condition: 'available' })], { spot }) }))
has(cvNone, ['1 รายการ · ใช้ได้ทั้งหมด', 'ไม่มีการตัดยอดวัสดุสิ้นเปลือง'], 'หน้าปิดงานจากใบ (ไม่มีของเสีย)')
const nr = render(createElement(PackingNotReturned, { list: { id: 'PL1', status: 'out' }, eventName: 'งานแต่งคุณเอ' }))
has(nr, ['data-testid="packing-not-returned"', 'ใบจัดของยังไม่คืนของ — ให้ทีมหน้างานคืนของที่จุดรับของก่อน', 'งานแต่งคุณเอ', '“ออกงาน”', 'href="/packing/PL1"', 'เปิดใบจัดของ'], 'ใบยังไม่คืนของ')
lacks(nr, ['ปิดงาน</button>', 'ยืนยันการคืน'], 'ใบยังไม่คืนของ — ไม่มีฟอร์มปิดงาน')

// --- 5) แผ่นพิมพ์ ----------------------------------------------------------------
const sheet = render(createElement(PackingSheet, { detail: detail({ status: 'picking' }, [boothLine(), pcLine({ picked_at: 'x' }), extraLine()]), qrUrl: 'https://stk.example.com/packing/PL1' }))
has(sheet, ['ใบจัดของ', 'คุณเอ', '20 ต.ค. 2569 · 10:00–18:00', 'สถานที่: โรงแรมริมน้ำ', 'แพ็กเกจ: Selfie studio booth', '☐', '☑', 'ห้องเก็บของ › ตู้ R1 › ชั้น 2 (A-2)', 'สแกนเพื่อเปิดใบบนมือถือ', '<svg', 'ผู้จัด'], 'แผ่นพิมพ์')

// --- 6) /pickup/[id] ------------------------------------------------------------
const pickup = (o: object) => ({ ...card({}), lines: [], consumables: [], isMine: false, eventClosed: false, ...o })
const readyCard = pickup({ list: summary({ status: 'ready', lineCount: 2, pickedCount: 2, spotId: 'S1' }), lines: [pcLine({ picked_at: 'x' }), kitLine({ picked_at: 'x' })], isMine: true })
const outCard = pickup({
  eventId: 'E4',
  customerName: 'คุณออกงาน',
  list: summary({ id: 'PL4', eventId: 'E4', status: 'out', lineCount: 2, pickedCount: 2, spotId: 'S1' }),
  lines: [pcLine({ list_id: 'PL4', picked_at: 'x', handed_over_at: 'x' }), outKitLine({ list_id: 'PL4' })],
  consumables,
})
const returnedCard = pickup({ eventId: 'E7', customerName: 'คุณคืนแล้ว', list: summary({ id: 'PL7', eventId: 'E7', status: 'returned', lineCount: 1, pickedCount: 1, spotId: 'S1' }), lines: [pcLine({ list_id: 'PL7' })] })

// 6.1 หลายใบที่จุด (ผู้รับของ): การ์ดปิดอยู่ กดเปิดเช็กลิสต์ · ใบคืนแล้ว = รอคืนชั้น + รอผู้มีสิทธิ์ปิดงาน
const pk = render(createElement(PickupView, { spot, lists: [readyCard, outCard, returnedCard], canOpenLists: true, canAct: true }))
has(
  pk,
  ['จุดรับของ', 'หน้าห้องเก็บของ', 'P1', 'ชั้นวางสีเขียว', 'คุณเอ', 'คุณออกงาน', 'คุณคืนแล้ว', 'งานของคุณ', 'พร้อมรับ', 'ออกงาน', 'รับของ (2 รายการ)', 'คืนของ (2 รายการ)', 'คืนแล้ว — รอทีมจัดของคืนชั้น', 'อีเวนต์ยังไม่ปิด — รอผู้มีสิทธิ์ปิดงาน', 'href="/packing/PL1"', 'href="/packing/PL4"', '2 รายการ'],
  'หน้าจุดรับของ',
)
lacks(pk, ['ยืนยันรับของ', 'ยืนยันคืนของ', 'ดูได้อย่างเดียว', 'รุ่นถัดไป'], 'หน้าจุดรับของ (การ์ดปิด)')
assert.ok(pk.indexOf('คุณเอ') < pk.indexOf('คุณออกงาน') && pk.indexOf('คุณออกงาน') < pk.indexOf('คุณคืนแล้ว'), 'กลุ่มพร้อมรับ → ออกงาน → คืนแล้ว')
checks++
const pkClosedEvent = render(createElement(PickupView, { spot, lists: [{ ...returnedCard, eventClosed: true }], canOpenLists: false, canAct: true }))
has(pkClosedEvent, ['คืนแล้ว — รอทีมจัดของคืนชั้น'], 'ใบคืนแล้ว อีเวนต์ปิดแล้ว')
lacks(pkClosedEvent, ['รอผู้มีสิทธิ์ปิดงาน', 'href="/packing/'], 'ใบคืนแล้ว อีเวนต์ปิดแล้ว')
// 6.2 ไม่ใช่ผู้รับของ = ดูอย่างเดียว
const pkView = render(createElement(PickupView, { spot, lists: [readyCard, outCard], canOpenLists: false, canAct: false }))
has(pkView, ['ดูได้อย่างเดียว', 'พร้อมรับ — รอผู้มีสิทธิ์กดรับของ', 'ออกงานอยู่ — รอผู้มีสิทธิ์กดคืนของ'], 'จุดรับของ (ดูอย่างเดียว)')
lacks(pkView, ['รับของ (', 'คืนของ (', 'ยืนยันรับของ', 'ยืนยันคืนของ', 'href="/packing/'], 'จุดรับของ (ดูอย่างเดียว)')
const pkEmpty = render(createElement(PickupView, { spot: spotOff, lists: [], canOpenLists: true, canAct: true }))
has(pkEmpty, ['ยังไม่มีของวางที่จุดนี้', 'จุดนี้ปิดใช้แล้ว'], 'จุดรับของว่าง')
const pkErr = render(createElement(PickupView, { spot, lists: [], canOpenLists: true, canAct: true, loadError: 'โหลดใบจัดของที่จุดนี้ไม่สำเร็จ' }))
has(pkErr, ['โหลดใบจัดของที่จุดนี้ไม่สำเร็จ'], 'จุดรับของโหลดพัง')
lacks(pkErr, ['ยังไม่มีของวางที่จุดนี้'], 'จุดรับของโหลดพัง')

// 6.3 ใบเดียวที่จุด = เปิดเช็กลิสต์รับของให้เลย: checkbox ≥44px ทุกบรรทัด + ครบทุกชิ้น + ยืนยัน disabled จนติ๊กครบ
const BTN = (label: string) => new RegExp(`<button[^>]*disabled=""[^>]*>(?:(?!</button>)[\\s\\S])*${label}</button>`)
const ho = render(createElement(PickupView, { spot, lists: [readyCard], canOpenLists: true, canAct: true }))
has(ho, ['data-testid="handover-sheet"', 'รับของ — ติ๊กทุกชิ้นขณะขึ้นรถ', 'ติ๊กแล้ว 0/2', 'role="checkbox"', 'aria-checked="false"', 'PC-01', 'S/N SN-001', 'อุปกรณ์ · คอมพิวเตอร์ · Selfie studio booth', 'กระเป๋า A', 'กระเป๋า · กระเป๋าอุปกรณ์', 'ครบทุกชิ้น', 'ยืนยันรับของ'], 'เช็กลิสต์รับของ')
assert.equal((ho.match(/role="checkbox"/g) ?? []).length, 2, 'checkbox ครบทุกบรรทัด')
assert.ok(/<button[^>]*role="checkbox"[^>]*class="[^"]*min-h-11/.test(ho), 'checkbox สูง ≥44px')
assert.match(ho, BTN('ยืนยันรับของ'), 'ยืนยันรับของ disabled จนติ๊กครบ')
checks += 3
const hoDirect = render(createElement(HandoverSheet, { card: readyCard }))
has(hoDirect, ['รับของ (2 รายการ)'], 'การ์ดรับของ (ปิด)')
lacks(hoDirect, ['ยืนยันรับของ'], 'การ์ดรับของ (ปิด)')

// 6.4 ใบเดียวที่ออกงาน = เปิดเช็กลิสต์คืนของ: สภาพต่อบรรทัด (ค่าเริ่มต้นใช้ได้) + ใช้ได้ทั้งหมด + รายชิ้นในกระเป๋า + วัสดุสิ้นเปลือง + รูป + หมายเหตุ
const rt = render(createElement(PickupView, { spot, lists: [outCard], canOpenLists: true, canAct: true }))
has(
  rt,
  ['data-testid="return-sheet"', 'คืนของ — ระบุสภาพทุกรายการ', 'ใช้ได้ทั้งหมด', 'aria-label="สภาพของ PC-01"', 'aria-label="สภาพของ กระเป๋า A"', 'ระบุสภาพรายชิ้น (2 ชิ้น)', 'aria-expanded="false"', 'วัสดุสิ้นเปลือง — ใช้ไปกี่ชิ้น', 'กระดาษโฟโต้', 'ประจำกระเป๋า 100 แผ่น', 'aria-label="ใช้ไป กระดาษโฟโต้"', 'inputMode="numeric"', 'ตัดยอดแล้ว 1 ตลับ', 'รูปตอนคืน (ไม่บังคับ)', 'ถ่ายรูป / เลือกรูป', 'accept="image/*"', 'หมายเหตุ (ไม่บังคับ)', 'ยืนยันคืนของ'],
  'เช็กลิสต์คืนของ',
)
lacks(rt, ['aria-label="ใช้ไป หมึก"', 'มีของสภาพไม่ปกติ', 'over-kit-quantity'], 'เช็กลิสต์คืนของ (ค่าเริ่มต้นใช้ได้ทั้งหมด)')
assert.equal((rt.match(/aria-label="สภาพของ /g) ?? []).length, 2, 'ช่องสภาพครบทุกบรรทัด (รายชิ้นยังไม่ขยาย)')
assert.ok(/<button[^>]*aria-label="สภาพของ PC-01"[^>]*class="[^"]*h-11/.test(rt) || /<button[^>]*class="[^"]*h-11[^"]*"[^>]*aria-label="สภาพของ PC-01"/.test(rt), 'ช่องสภาพสูง 44px')
assert.doesNotMatch(rt, BTN('ยืนยันคืนของ'), 'ค่าเริ่มต้นครบ = ยืนยันคืนของกดได้')
checks += 3
const rtDirect = render(createElement(ReturnSheet, { card: outCard }))
has(rtDirect, ['คืนของ (2 รายการ)'], 'การ์ดคืนของ (ปิด)')
lacks(rtDirect, ['ยืนยันคืนของ'], 'การ์ดคืนของ (ปิด)')

// --- 7) ตั้งค่าคลัง: จุดรับของ ----------------------------------------------------------
const spots = render(createElement(PickupSpotsSection, { spots: [spot, spotOff] }))
has(spots, ['จุดรับของ', 'เพิ่มจุดรับของ', 'พิมพ์ QR จุดรับของ', 'href="/stock/settings/pickup-print"', 'หน้าห้องเก็บของ', 'P1', 'ชั้นวางสีเขียว', 'โต๊ะหน้าประตู', 'ปิดใช้', 'เปิดใช้', 'แก้ไข', 'ลบ', 'href="/pickup/S1"'], 'หัวข้อจุดรับของ')
const spotsEmpty = render(createElement(PickupSpotsSection, { spots: [] }))
has(spotsEmpty, ['ยังไม่มีจุดรับของ'], 'จุดรับของว่าง')
const settings = render(createElement(SettingsView, { categories: [], counts: {}, spots: [spot] }))
has(settings, ['ตั้งค่าคลัง', 'ประเภทอุปกรณ์', 'จุดรับของ', 'หน้าห้องเก็บของ'], 'ตั้งค่าคลัง + จุดรับของ')
lacks(render(createElement(SettingsView, { categories: [], counts: {} })), ['พิมพ์ QR จุดรับของ'], 'ตั้งค่าคลังแบบเดิม (ไม่ส่ง spots)')

// --- 8) หน้าติดตามงาน: ช่อง "จัดของ" ----------------------------------------------------
const trackingLead = {
  id: 'L1',
  customer_name: 'คุณเอ',
  event_name: null,
  event_date: '2026-10-20',
  event_end_date: null,
  event_time: '10:00',
  event_end_time: '18:00',
  design_status: 'pending',
  supplier_note: null,
  backdrop_note: null,
  tracking_checklist: [],
  required_roles: {},
  events: [{ id: 'E1', name: 'งานแต่งคุณเอ', event_date: '2026-10-20', status: 'planned', event_time: '10:00', event_end_time: '18:00' }],
  staff: [],
}
const kitBookings = [{ eventId: 'E1', kitId: 'kit1', packed: false, eventName: 'งานแต่งคุณเอ', eventDate: '2026-10-20' }]
const withList = render(
  createElement(KitSummary, { lead: trackingLead, bookings: kitBookings, packing: { lists: [summary({})], packageLeadIds: new Set(['L1']), canPack: true } }),
)
has(withList, ['จัดของ', 'กำลังหยิบ · หยิบแล้ว 2/5', 'เปิดใบ', 'href="/packing/PL1"'], 'ช่องจัดของ (มีใบ)')
lacks(withList, ['ยังไม่จอง', 'จองแล้ว', 'จองไว้แบบเดิม', 'เปิดใบจัดของ', 'เลือกแพ็กเกจก่อน'], 'ช่องจัดของ (มีใบ) — ไม่มีการจองกระเป๋าตรง')
const withListViewer = render(
  createElement(KitSummary, { lead: trackingLead, bookings: [], packing: { lists: [summary({ status: 'ready', pickedCount: 5 })], packageLeadIds: new Set(['L1']), canPack: false } }),
)
has(withListViewer, ['พร้อมรับ'], 'ช่องจัดของ (มีใบ, คนนอกทีม)')
lacks(withListViewer, ['href="/packing/'], 'ช่องจัดของ (มีใบ, คนนอกทีม) — ไม่มีลิงก์ที่เข้าไม่ได้')
const noList = render(createElement(KitSummary, { lead: trackingLead, bookings: [], packing: { lists: [], packageLeadIds: new Set(['L1']), canPack: true } }))
has(noList, ['จัดของ', 'เปิดใบจัดของ'], 'ช่องจัดของ (มีแพ็กเกจ ยังไม่มีใบ)')
lacks(noList, ['ยังไม่จอง', 'จองไว้แบบเดิม', 'เลือกแพ็กเกจก่อน'], 'ช่องจัดของ (มีแพ็กเกจ ยังไม่มีใบ) — ไม่มีปุ่มจองกระเป๋า')
const noListOther = render(createElement(KitSummary, { lead: trackingLead, bookings: [], packing: { lists: [], packageLeadIds: new Set(['L1']), canPack: false } }))
has(noListOther, ['ยังไม่เปิดใบจัดของ'], 'ช่องจัดของ (มีแพ็กเกจ, คนนอกทีม)')
lacks(noListOther, ['<button'], 'ช่องจัดของ (มีแพ็กเกจ, คนนอกทีม) — ไม่มีปุ่ม')
const legacy = render(createElement(KitSummary, { lead: trackingLead, bookings: kitBookings, packing: { lists: [], packageLeadIds: new Set(), canPack: true } }))
has(legacy, ['เลือกแพ็กเกจก่อน จึงเปิดใบจัดของได้', 'จองไว้แบบเดิม 1 ใบ · จัดแล้ว 0/1', 'href="/events/E1/check-kits"', 'data-testid="legacy-kits"'], 'ช่องจัดของ (ไม่มีแพ็กเกจ + การจองแบบเดิม)')
lacks(legacy, ['เปิดใบจัดของ<', 'data-testid="packing-row"', '<button'], 'ช่องจัดของ (ไม่มีแพ็กเกจ + การจองแบบเดิม) — อ่านอย่างเดียว')
const noPackingProp = render(createElement(KitSummary, { lead: trackingLead, bookings: [] }))
has(noPackingProp, ['เลือกแพ็กเกจก่อน จึงเปิดใบจัดของได้'], 'ช่องจัดของ (ไม่ส่ง packing)')
lacks(noPackingProp, ['จองไว้แบบเดิม', '<button'], 'ช่องจัดของ (ไม่ส่ง packing)')

// --- 9) ทั่วไป: จอแคบ + ไม่มี confirm/alert ของเบราว์เซอร์ -----------------------------------
for (const html of all) assert.ok(!/min-w-\[(3[6-9]\d|[4-9]\d\d|\d{4,})px\]/.test(html), 'ไม่มี min-width คงที่เกิน 360px')
checks++
const root = join(__dirname, '..', 'app', '(authenticated)')
const files: string[] = []
const walk = (dir: string) => {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.tsx?$/.test(f) && !f.endsWith('.check.ts')) files.push(p)
  }
}
walk(join(root, 'packing'))
walk(join(root, 'pickup'))
files.push(join(root, 'events', '[id]', 'return', 'packing-close-view.tsx'), join(root, 'events', '[id]', 'return', 'page.tsx'))
files.push(join(root, 'stock', 'settings', 'pickup-spots-section.tsx'))
for (const f of files) {
  // ตัดคอมเมนต์ก่อนตรวจ (คอมเมนต์อธิบายกติกา เช่น "ไม่ใช้ .or()" ไม่นับ)
  const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  assert.ok(!/window\.(confirm|alert)\s*\(|[^.\w]alert\s*\(/.test(src), `${f}: ห้าม window.confirm/alert (ใช้ useConfirm + toast)`)
  assert.ok(!/\.or\(/.test(src), `${f}: ห้าม .or()`)
  checks++
}
for (const f of [join(root, 'packing', '[id]', 'confirm-step.tsx'), join(root, 'pickup', '[id]', 'return-sheet.tsx')]) {
  const src = readFileSync(f, 'utf8')
  assert.ok(/compressImage\(/.test(src) && /from '@\/lib\/utils'/.test(src), `${f}: อัปโหลดรูปผ่าน compressImage ของ lib/utils`)
  checks++
}
// ช่องวัสดุสิ้นเปลืองตอนคืนของใช้ parseCount ตัวเดียวกับหน้าปิดงานเดิม
assert.ok(/parseCount\(/.test(readFileSync(join(root, 'pickup', '[id]', 'return-sheet.tsx'), 'utf8')), 'return-sheet ใช้ parseCount')
checks++

console.log(`ตรวจ ${checks} ข้อ`)
console.log('packing-render: ผ่านทั้งหมด')
