// ชุดตรวจกติกาบริสุทธิ์ของใบจัดของ — ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/packing/packing-logic.check.ts"
import assert from 'node:assert/strict'
import {
  PACKING_STATUSES,
  PACKING_STATUS_LABELS,
  canCancelList,
  canConfirmReady,
  canPickLine,
  canStartPicking,
  canTransition,
  checkPackingLines,
  isMissingPacking,
  isPackedStatus,
  lineAvailability,
  parsePickupSpotForm,
  pickRoute,
  scaffoldLines,
  shelfPlaceLabel,
} from './packing-logic'
import type { CategoryUnits, LeadPackageRow, PickerPackage } from '../packages/types'
import type { ShelfPlace, UnitInfo } from './types'

let n = 0
const ok = (cond: unknown, msg: string) => { assert.ok(cond, msg); n++ }
const eq = <T>(a: T, b: T, msg: string) => { assert.deepEqual(a, b, msg); n++ }

// --- สถานะ / transition -------------------------------------------------------
eq([...PACKING_STATUSES], ['selecting', 'picking', 'ready', 'out', 'returned', 'done'], 'ลำดับสถานะ')
eq(PACKING_STATUSES.map(s => PACKING_STATUS_LABELS[s]), ['เลือกของ', 'กำลังหยิบ', 'พร้อมรับ', 'ออกงาน', 'คืนแล้ว', 'คืนชั้นแล้ว'], 'ป้ายไทย')
ok(canTransition('selecting', 'picking'), 'เลือกของ → กำลังหยิบ')
ok(canTransition('picking', 'ready'), 'กำลังหยิบ → พร้อมรับ')
ok(canTransition('ready', 'picking'), 'ถอย พร้อมรับ → กำลังหยิบ')
ok(canTransition('picking', 'selecting'), 'ถอย กำลังหยิบ → เลือกของ')
ok(!canTransition('selecting', 'ready'), 'ข้ามขั้นไม่ได้')
ok(!canTransition('ready', 'out'), 'รับของยังไม่เปิดในเฟสนี้')
ok(!canTransition('ready', 'selecting'), 'พร้อมรับถอยไปเลือกของตรงๆ ไม่ได้')
ok(!canTransition('done', 'selecting'), 'คืนชั้นแล้วแก้ไม่ได้')
ok(canCancelList('selecting') && canCancelList('picking') && !canCancelList('ready'), 'ยกเลิกได้เฉพาะเลือกของ/กำลังหยิบ')
ok(isPackedStatus('ready') && isPackedStatus('done') && !isPackedStatus('picking'), 'พร้อมรับขึ้นไปนับว่าจัดของแล้ว')

// --- โครงบรรทัดจากแพ็กเกจ -------------------------------------------------------
const packages: PickerPackage[] = [
  {
    id: 'P1', name: 'Selfie', price: 1000, is_active: true,
    requirements: [
      { id: 'R1', categoryId: 'COMP', categoryName: 'คอมพิวเตอร์', quantity: 1, salesPick: false, variants: [], optionUnitIds: ['I1', 'I2'] },
      { id: 'R2', categoryId: 'BOOTH', categoryName: 'ตู้ประกอบ', quantity: 1, salesPick: true, variants: ['ประกอบ 1', 'ประกอบ 2'], optionUnitIds: null },
      { id: 'R3', categoryId: 'BAG', categoryName: 'กระเป๋าอุปกรณ์', quantity: 1, salesPick: false, variants: [], optionUnitIds: null },
    ],
  },
]
const leadPackages: LeadPackageRow[] = [
  { id: 'LP1', packageId: 'P1', packageName: 'Selfie', price: 1000, isActive: true, quantity: 2, units: [{ requirementId: 'R2', unitId: 'B1', kind: 'item', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2' }] },
  { id: 'LP2', packageId: 'GONE', packageName: 'แพ็กเกจที่ถูกลบ', price: null, isActive: false, quantity: 1, units: [] },
]
const scaffold = scaffoldLines(leadPackages, packages)
eq(scaffold.map(r => [r.requirementId, r.slots]), [['R1', 2], ['R2', 2], ['R3', 2]], 'slots = จำนวน × จำนวนชุด · แพ็กเกจที่ถูกลบข้าม')
eq(scaffold[1].lockedUnits, [{ unitId: 'B1', kind: 'item', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2', locked: true }], 'ตู้ที่ทีมขายเลือก = locked พร้อมแบบประกอบ')
eq(scaffold[0].lockedUnits, [], 'ประเภททั่วไปไม่มี locked')

// --- ตรวจบรรทัด (setPackingLines) ---------------------------------------------
const units: CategoryUnits = {
  COMP: [
    { id: 'I1', kind: 'item', name: 'คอม 1', status: 'available' },
    { id: 'I2', kind: 'item', name: 'คอม 2', status: 'available' },
    { id: 'I3', kind: 'item', name: 'คอม 3', status: 'available' },
    { id: 'I9', kind: 'item', name: 'คอมในกระเป๋า', status: 'available', inKit: true },
  ],
  BOOTH: [{ id: 'B1', kind: 'item', name: 'ตู้ประกอบ ชุด 1', status: 'available' }, { id: 'B2', kind: 'item', name: 'ตู้ประกอบ ชุด 2', status: 'available' }],
  BAG: [{ id: 'K1', kind: 'kit', name: 'กระเป๋า A', status: 'available' }, { id: 'K2', kind: 'kit', name: 'กระเป๋า B', status: 'available' }],
}
const info: Record<string, UnitInfo> = {}
for (const list of Object.values(units)) for (const u of list) info[u.id] = { id: u.id, kind: u.kind, name: u.name, status: u.status, inKit: !!u.inKit }
info.X1 = { id: 'X1', kind: 'item', name: 'ไฟเสริม', status: 'available', inKit: false }
const locked = [{ item_id: 'B1', kit_id: null, package_id: 'P1', category_id: 'BOOTH' }]

const good = checkPackingLines(
  [
    { requirementId: 'R1', itemId: 'I1' },
    { packageId: 'P1', categoryId: 'COMP', itemId: 'I2' },
    { requirementId: 'R3', kitId: 'K1' },
    { requirementId: 'R2', itemId: 'B1' }, // ตรงกับ locked → ข้าม
    { itemId: 'X1' }, // ของเสริม
  ],
  scaffold, units, info, locked,
)
ok(Array.isArray(good) && good.length === 4, 'บรรทัดถูกต้อง 4 บรรทัด (ข้ามบรรทัด locked)')
eq(Array.isArray(good) ? good[3] : null, { packageId: null, categoryId: null, itemId: 'X1', kitId: null, variant: null }, 'ของเสริม package/category ว่าง')
const err = (r: unknown) => (r && typeof r === 'object' && 'error' in r ? (r as { error: string }).error : '')
ok(err(checkPackingLines([{ requirementId: 'R1', itemId: 'I3' }], scaffold, units, info, locked)).includes('ไม่ได้อยู่ในตัวเลือก'), 'หน่วยนอกตัวเลือก = error')
ok(err(checkPackingLines([{ itemId: 'I9' }], scaffold, units, info, locked)).includes('อยู่ในกระเป๋า'), 'อุปกรณ์ในกระเป๋าเป็นบรรทัดเดี่ยวไม่ได้ (แม้เป็นของเสริม)')
ok(err(checkPackingLines([{ requirementId: 'R1', itemId: 'I1' }, { itemId: 'I1' }], scaffold, units, info, locked)).includes('อยู่ในใบนี้แล้ว'), 'หน่วยซ้ำ = error')
ok(err(checkPackingLines([{ requirementId: 'R2', itemId: 'B2' }, { requirementId: 'R2', itemId: 'I1' }], scaffold, units, info, locked)) !== '', 'หน่วยต่างประเภท = error')
ok(err(checkPackingLines([{ requirementId: 'R2', itemId: 'B2' }], scaffold, { ...units, BOOTH: [...units.BOOTH, { id: 'B3', kind: 'item', name: 'ชุด 3', status: 'available' }] }, { ...info, B3: { id: 'B3', kind: 'item', name: 'ชุด 3', status: 'available', inKit: false } }, locked)) === '', 'ช่องตู้ที่ทีมขายยังไม่เลือก ทีมจัดของเติมได้')
const over = checkPackingLines(
  [{ requirementId: 'R2', itemId: 'B2' }, { requirementId: 'R2', itemId: 'B3' }],
  scaffold, { ...units, BOOTH: [...units.BOOTH, { id: 'B3', kind: 'item', name: 'ชุด 3', status: 'available' }] },
  { ...info, B3: { id: 'B3', kind: 'item', name: 'ชุด 3', status: 'available', inKit: false } }, locked,
)
ok(err(over).includes('ไม่เกิน 2'), 'เกินจำนวนช่อง (นับรวม locked) = error')
ok(err(checkPackingLines([{ requirementId: 'R1', itemId: 'I1', kitId: 'K1' }], scaffold, units, info, locked)) !== '', 'ใส่ทั้งอุปกรณ์และกระเป๋า = error')
ok(err(checkPackingLines('x', scaffold, units, info, locked)) !== '', 'ข้อมูลไม่ใช่ array = error')

// --- สร้างใบจัดของ (ครบข้อกำหนด) ------------------------------------------------
const lockedRow = { package_id: 'P1', category_id: 'BOOTH', item_id: 'B1', kit_id: null }
ok(err(canStartPicking([lockedRow], scaffold)).includes('คอมพิวเตอร์ (Selfie) ขาด 2'), 'ยังไม่ครบ = error ระบุประเภทที่ขาด')
ok(err(canStartPicking([], [])).includes('ยังไม่มีแพ็กเกจ'), 'ไม่มีโครงใบ = error')
const full = [
  lockedRow,
  { package_id: 'P1', category_id: 'BOOTH', item_id: 'B2', kit_id: null },
  { package_id: 'P1', category_id: 'COMP', item_id: 'I1', kit_id: null },
  { package_id: 'P1', category_id: 'COMP', item_id: 'I2', kit_id: null },
  { package_id: 'P1', category_id: 'BAG', item_id: null, kit_id: 'K1' },
  { package_id: 'P1', category_id: 'BAG', item_id: null, kit_id: 'K2' },
]
eq(canStartPicking(full, scaffold), { ok: true }, 'ครบทุกข้อกำหนด = ok')
eq(canStartPicking([...full, { package_id: null, category_id: null, item_id: 'X1', kit_id: null }], scaffold), { ok: true }, 'ของเสริมไม่นับ/ไม่ขวาง')

// --- หยิบของ --------------------------------------------------------------------
eq(canPickLine({ item_id: 'I1' }, { itemStatus: 'available' }), { ok: true }, 'อุปกรณ์เดี่ยวใช้ได้ = หยิบได้')
ok(err(canPickLine({ item_id: 'I1' }, { itemStatus: 'in_use' })).includes('ออกงานอยู่'), 'in_use = หยิบไม่ได้')
ok(err(canPickLine({ item_id: 'I1' }, { itemStatus: 'damaged' })).includes('เสียหาย'), 'เสียหาย = หยิบไม่ได้')
ok(err(canPickLine({ item_id: 'I1', picked_at: 'x' }, { itemStatus: 'available' })).includes('หยิบไปแล้ว'), 'หยิบซ้ำไม่ได้')
eq(canPickLine({ kit_id: 'K1' }, { kitItems: [{ id: 'a', name: 'a', status: 'available' }, { id: 'b', name: 'b', status: 'damaged' }] }), { ok: true }, 'กระเป๋ามีชิ้นใช้ได้ = หยิบได้')
ok(err(canPickLine({ kit_id: 'K1' }, { kitItems: [{ id: 'a', name: 'กล้อง', status: 'in_use', outElsewhere: true }, { id: 'b', name: 'b', status: 'available' }] })).includes('กล้อง'), 'กระเป๋ามีชิ้นออกกับงานอื่น = หยิบไม่ได้')
ok(err(canPickLine({ kit_id: 'K1' }, { kitItems: [{ id: 'a', name: 'a', status: 'damaged' }, { id: 'c', name: 'c', status: 'available', is_consumable: true }] })).includes('ไม่มีอุปกรณ์ที่ใช้ได้'), 'กระเป๋าไม่มีชิ้นใช้ได้ (วัสดุสิ้นเปลืองไม่นับ) = หยิบไม่ได้')

// --- ยืนยันจัดของ ---------------------------------------------------------------
const picked = [{ picked_at: 't' }, { picked_at: 't' }]
eq(canConfirmReady({ status: 'picking', photo_urls: ['u'], spot_id: 's' }, picked), { ok: true }, 'ครบ + รูป + จุด = ok')
ok(err(canConfirmReady({ status: 'picking', photo_urls: [], spot_id: 's' }, picked)).includes('รูป'), 'ไม่มีรูป = error')
ok(err(canConfirmReady({ status: 'picking', photo_urls: ['u'], spot_id: null }, picked)).includes('จุดรับของ'), 'ไม่มีจุด = error')
ok(err(canConfirmReady({ status: 'picking', photo_urls: ['u'], spot_id: 's' }, [{ picked_at: 't' }, { picked_at: null }])).includes('1/2'), 'ยังหยิบไม่ครบ = error บอก x/y')
ok(err(canConfirmReady({ status: 'selecting', photo_urls: ['u'], spot_id: 's' }, picked)) !== '', 'ขั้นเลือกของยืนยันไม่ได้')

// --- เส้นทางหยิบ ----------------------------------------------------------------
const place = (shelfId: string, roomName: string | null, rackCode: string | null, level: number | null, shelfCode = shelfId): ShelfPlace => ({ shelfId, shelfCode, roomName, rackCode, level })
const shelfOf: Record<string, ShelfPlace> = {
  A: place('S-A2', 'ห้อง ก', 'R2', 1),
  B: place('S-A10', 'ห้อง ก', 'R10', 1),
  C: place('S-A2-L10', 'ห้อง ก', 'R2', 10),
  D: place('S-A2-L2', 'ห้อง ก', 'R2', 2),
  K: place('S-B', 'ห้อง ข', 'R1', 1),
}
const route = pickRoute(
  [
    { item_id: 'NOSHELF', unitName: 'ไม่มีชั้น' },
    { item_id: 'B', unitName: 'บี' },
    { item_id: 'C', unitName: 'ซี' },
    { kit_id: 'K', unitName: 'กระเป๋า' },
    { item_id: 'A', unitName: 'เอ' },
    { item_id: 'D', unitName: 'ดี' },
    { item_id: 'INKIT', unitName: 'ของในกระเป๋า' },
  ],
  shelfOf,
  { INKIT: 'K' },
)
eq(route.map(g => g.key), ['S-A2', 'S-A2-L2', 'S-A2-L10', 'S-A10', 'S-B', 'none'], 'เรียง ห้อง → ตู้ (ตัวเลขในรหัส) → ระดับ (ตัวเลข) · ไม่มีชั้นท้ายสุด')
eq(route.find(g => g.key === 'S-B')?.lines.map(l => l.unitName), ['กระเป๋า', 'ของในกระเป๋า'], 'อุปกรณ์ในกระเป๋าใช้ชั้นของกระเป๋า')
eq(route[route.length - 1].label, 'ยังไม่มีชั้น', 'ป้ายกลุ่มไม่มีชั้น')
eq(shelfPlaceLabel(place('S1', 'ห้อง ก', 'R2', 3, 'A-03')), 'ห้อง ก › ตู้ R2 › ชั้น 3 (A-03)', 'ป้าย ห้อง › ตู้ › ชั้น')
eq(shelfPlaceLabel(place('S1', null, null, null, 'A-03')), 'ชั้น A-03', 'ชั้นที่ไม่อยู่ในห้อง')

// --- ป้ายความว่าง ---------------------------------------------------------------
const ev = { eventId: 'E1', eventDate: '2026-10-20', eventTime: '10:00', eventEndTime: '14:00' }
const other = (eventId: string, eventTime: string | null, eventEndTime: string | null, eventDate = '2026-10-20') => ({ unitId: 'U', eventId, eventName: `งาน ${eventId}`, eventDate, eventTime, eventEndTime })
eq(lineAvailability({ id: 'U', status: 'available' }, ev, []).status, 'free', 'ไม่มีงานอื่น = ว่าง')
eq(lineAvailability({ id: 'U', status: 'available' }, ev, [other('E2', '14:00', '18:00')]).status, 'queued', 'วันเดียวกันเวลาไม่ทับ = ต่อคิว')
const clash = lineAvailability({ id: 'U', status: 'available' }, ev, [other('E2', '12:00', '16:00')])
eq([clash.status, clash.clashKind, clash.eventNames, clash.selectable], ['clash', 'conflict', ['งาน E2'], true], 'เวลาทับ = ชน (เลือกได้แต่ยืนยัน)')
eq(lineAvailability({ id: 'U', status: 'available' }, ev, [other('E2', null, null)]).clashKind, 'unknown', 'ฝั่งใดไม่มีเวลา = ชน/เช็คเวลาไม่ได้')
eq(lineAvailability({ id: 'U', status: 'available' }, ev, [other('E2', '12:00', '16:00', '2026-10-21')]).status, 'free', 'คนละวัน = ว่าง')
eq(lineAvailability({ id: 'U', status: 'available' }, ev, [other('E1', '12:00', '16:00')]).status, 'free', 'การจองของอีเวนต์ตัวเองไม่นับ')
const broken = lineAvailability({ id: 'U', status: 'maintenance' }, ev, [])
eq([broken.status, broken.selectable, broken.pickable], ['unavailable', false, false], 'ซ่อม = ไม่พร้อม เลือกไม่ได้')
const out = lineAvailability({ id: 'U', status: 'in_use' }, ev, [])
eq([out.status, out.selectable, out.pickable], ['out', true, false], 'ออกงานอยู่ = เลือกได้แต่หยิบไม่ได้')
eq(lineAvailability({ id: 'U', status: 'in_use' }, ev, [], { pickedHere: true }).status, 'free', 'in_use เพราะหยิบให้ใบนี้ ≠ ออกงานอยู่')

// --- ความพร้อม (ทางลัด) + ฟอร์มจุดรับของ -------------------------------------------
ok(!isMissingPacking(['E1'], [{ eventId: 'E1', status: 'ready' }]), 'ใบพร้อมรับ = ไม่ขาด')
ok(isMissingPacking(['E1', 'E2'], [{ eventId: 'E1', status: 'ready' }]), 'อีเวนต์ไม่มีใบ = ขาด')
eq(parsePickupSpotForm({ name: '  จุดรับของ A ', code: ' A ' }), { name: 'จุดรับของ A', code: 'A', note: null, is_active: true }, 'ตัดช่องว่าง')
ok(err(parsePickupSpotForm({ name: '', code: 'A' })).includes('ชื่อ'), 'ไม่มีชื่อ = error')
ok(err(parsePickupSpotForm({ name: 'A', code: '' })).includes('รหัส'), 'ไม่มีรหัส = error')

console.log(`${n} assertions`)
console.log('packing-logic: ผ่านทั้งหมด')
