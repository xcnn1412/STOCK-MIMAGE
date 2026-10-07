// type ของโมดูลใบจัดของ — ตาราง pickup_spots / packing_lists / packing_list_items (migration 20261012)
// ยังไม่อยู่ใน types/database.types.ts จึงเขียนมือ (ใช้คู่กับ .overrideTypes ที่ขอบเขต query)
import type { CategoryUnits, LeadPackageRow, UnitKind } from '../packages/types'

/** สถานะใบจัดของ — เลือกของ → กำลังหยิบ → พร้อมรับ → ออกงาน → คืนแล้ว → คืนชั้นแล้ว */
export type PackingStatus = 'selecting' | 'picking' | 'ready' | 'out' | 'returned' | 'done'

/** สภาพตอนคืนของ (เฟส 4) */
export type ReturnCondition = 'available' | 'damaged' | 'maintenance' | 'lost'

/** แถว packing_lists */
export interface PackingListRow {
  id: string
  event_id: string
  lead_id: string | null
  status: PackingStatus
  packed_at: string | null
  packed_by: string | null
  photo_urls: string[]
  spot_id: string | null
  staged_at: string | null
  handed_over_at: string | null
  handed_over_by: string | null
  returned_at: string | null
  returned_by: string | null
  return_note: string | null
  return_photo_urls: string[]
  restocked_at: string | null
  restocked_by: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

export const PACKING_LIST_COLUMNS =
  'id, event_id, lead_id, status, packed_at, packed_by, photo_urls, spot_id, staged_at, handed_over_at, handed_over_by, returned_at, returned_by, return_note, return_photo_urls, restocked_at, restocked_by, created_by, created_at, updated_at'

/** แถว packing_list_items (บรรทัดใบจัดของ = หน่วยอุปกรณ์หนึ่งหน่วย) */
export interface PackingLineRow {
  id: string
  list_id: string
  /** package_id + category_id ว่างทั้งคู่ = ของเสริมนอกแพ็กเกจ */
  package_id: string | null
  category_id: string | null
  item_id: string | null
  kit_id: string | null
  /** แบบประกอบ (ป้ายบอกเท่านั้น) */
  variant: string | null
  /** ทีมขายเลือกชิ้นเอง (ตู้) — ทีมจัดของเปลี่ยนไม่ได้ */
  locked: boolean
  picked_at: string | null
  picked_by: string | null
  handed_over_at: string | null
  returned_at: string | null
  return_condition: ReturnCondition | null
  return_note: string | null
  restocked_at: string | null
  restocked_by: string | null
  created_at: string
}

export const PACKING_LINE_COLUMNS =
  'id, list_id, package_id, category_id, item_id, kit_id, variant, locked, picked_at, picked_by, handed_over_at, returned_at, return_condition, return_note, restocked_at, restocked_by, created_at'

/** แถว pickup_spots (จุดรับของ) */
export interface PickupSpot {
  id: string
  name: string
  code: string
  note: string | null
  is_active: boolean
  sort_order: number
  created_at: string
}

export const PICKUP_SPOT_COLUMNS = 'id, name, code, note, is_active, sort_order, created_at'

/** ฟอร์มจุดรับของ (createPickupSpot / updatePickupSpot) */
export interface PickupSpotInput {
  name: string
  code: string
  note?: string | null
  is_active?: boolean
}

/** บรรทัดที่หน้าเลือกของส่งให้ setPackingLines — แทนที่ทั้งชุด (ยกเว้นบรรทัด locked) */
export interface PackingLineInput {
  packageId?: string | null
  categoryId?: string | null
  /** ข้อกำหนดของแพ็กเกจ — ไม่ส่ง/ว่าง + ไม่มี packageId = ของเสริม */
  requirementId?: string | null
  itemId?: string | null
  kitId?: string | null
  variant?: string | null
}

/** บรรทัดที่ตรวจแล้ว พร้อมเขียนลง packing_list_items (ไม่รวม locked) */
export interface CheckedPackingLine {
  packageId: string | null
  categoryId: string | null
  itemId: string | null
  kitId: string | null
  variant: string | null
}

/** ชิ้นที่ทีมขายเลือกไว้ของข้อกำหนดหนึ่ง (จะเป็นบรรทัด locked ตอนเปิดใบ) */
export interface ScaffoldLockedUnit {
  unitId: string
  kind: UnitKind
  unitName: string
  variant: string | null
  locked: true
}

/** โครงของใบ: ข้อกำหนดหนึ่งของแพ็กเกจหนึ่งของงาน × จำนวนชุด */
export interface ScaffoldRequirement {
  /** lead_packages.id */
  leadPackageId: string
  packageId: string
  packageName: string
  requirementId: string
  categoryId: string
  categoryName: string
  /** จำนวนหน่วยที่ต้องเลือก = quantity × จำนวนชุด */
  slots: number
  salesPick: boolean
  variants: string[]
  /** id หน่วยในตัวเลือก — null = ทุกหน่วยในประเภท */
  optionUnitIds: string[] | null
  lockedUnits: ScaffoldLockedUnit[]
}

/** ข้อมูลหน่วยเท่าที่การตรวจบรรทัดต้องใช้ (setPackingLines) */
export interface UnitInfo {
  id: string
  kind: UnitKind
  name: string
  status: string
  /** อุปกรณ์อยู่ในกระเป๋า (kit_contents) — เป็นบรรทัดเดี่ยวไม่ได้ */
  inKit: boolean
}

/** ตำแหน่งบนชั้นของหน่วย — ห้อง › ตู้ › ระดับ (ไม่อยู่ในห้อง = roomName/rackCode null) */
export interface ShelfPlace {
  shelfId: string
  shelfCode: string
  roomName: string | null
  rackCode: string | null
  level: number | null
}

/** กลุ่มในเส้นทางหยิบ (pickRoute) */
export interface PickRouteGroup<L> {
  /** shelfId หรือ 'none' (ยังไม่มีชั้น) */
  key: string
  /** เช่น "ห้องเก็บของ › ตู้ R1 › ชั้น 2" / "ยังไม่มีชั้น" */
  label: string
  place: ShelfPlace | null
  lines: L[]
}

/** ป้ายความว่างของหน่วยสำหรับทีมจัดของ (หัวข้อ 5.2) */
export type LineAvailabilityStatus = 'free' | 'queued' | 'clash' | 'unavailable' | 'out'

/** การจองหน่วยของอีเวนต์อื่น (บรรทัดใบจัดของที่ยังไม่คืนชั้น + event_kits ของงานที่ยังไม่ปิด) */
export interface LineBooking {
  unitId: string
  eventId: string
  eventName: string
  eventDate: string | null
  eventTime?: string | null
  eventEndTime?: string | null
}

export interface LineAvailability {
  status: LineAvailabilityStatus
  /** ชน: เวลาทับ (conflict) หรือฝั่งใดไม่มีเวลา (unknown) */
  clashKind?: 'conflict' | 'unknown'
  /** ชื่ออีเวนต์อื่นที่ชน/ต่อคิว */
  eventNames: string[]
  /** เลือกได้ไหม (ไม่พร้อม = ไม่ได้) */
  selectable: boolean
  /** หยิบได้ไหมตอนนี้ (ออกงานอยู่/ไม่พร้อม = ไม่ได้) */
  pickable: boolean
}

/** ชิ้นในกระเป๋าเท่าที่ canPickLine ต้องใช้ */
export interface KitItemState {
  id: string
  name: string
  status: string
  is_consumable?: boolean | null
  /** in_use อยู่กับอีเวนต์อื่น (ไม่ได้นำออกให้อีเวนต์ของใบนี้) */
  outElsewhere?: boolean
}

// --- ข้อมูลที่ loader ส่งให้หน้าจอ (รอบ B) -----------------------------------------

/** สรุปใบจัดของต่ออีเวนต์ — snapshot หน้าติดตามงาน (ความพร้อม + ชิปสถานะใบ) */
export interface PackingListSummary {
  id: string
  eventId: string
  leadId: string | null
  status: PackingStatus
  /** จำนวนบรรทัดทั้งหมด / ที่หยิบแล้ว */
  lineCount: number
  pickedCount: number
  spotId: string | null
}

/** บรรทัดพร้อมข้อมูลหน่วยที่หน้าใบจัดของใช้ */
export interface PackingLineView extends PackingLineRow {
  kind: UnitKind
  unitId: string
  /** ชื่อหน่วย (ไม่พบแล้ว = 'ชิ้นที่ถูกลบ') */
  unitName: string
  serial: string | null
  /** สถานะ items.status · กระเป๋า = 'in_use' ถ้ามีชิ้นออกงานอยู่ ไม่งั้น 'available' */
  unitStatus: string
  categoryName: string | null
  packageName: string | null
  place: ShelfPlace | null
  /** ชิ้นในกระเป๋า (เฉพาะบรรทัดกระเป๋า) */
  kitItems?: KitItemState[]
  /** หยิบได้ไหม + เหตุผล (เฉพาะบรรทัดที่ยังไม่หยิบ) */
  pickBlock: string | null
}

/** หน้าใบจัดของ /packing/[id] — loadPackingListDetail */
export interface PackingListDetail {
  list: PackingListRow
  event: {
    id: string
    name: string
    event_date: string | null
    event_time: string | null
    event_end_time: string | null
    location: string | null
    status: string | null
  }
  lead: { id: string; customer_name: string | null; event_location: string | null } | null
  leadPackages: LeadPackageRow[]
  scaffold: ScaffoldRequirement[]
  lines: PackingLineView[]
  spot: PickupSpot | null
  /** การจองหน่วยของอีเวนต์อื่นวันเดียวกัน — ใช้กับ lineAvailability */
  bookings: LineBooking[]
  /** หน่วยของทุกประเภทในโครงใบ (รวม inKit — หน้าเลือกกรองด้วย allowedUnits) */
  unitsByCategory: CategoryUnits
}

/** การ์ดในคิว /packing */
export interface PackingQueueCard {
  leadId: string
  eventId: string
  customerName: string | null
  eventName: string
  eventDate: string | null
  eventTime: string | null
  eventEndTime: string | null
  location: string | null
  packageNames: string[]
  /** null = ยังไม่มีใบ (กลุ่ม "รอเปิดใบ") */
  list: PackingListSummary | null
  spotName: string | null
}

/** คิว /packing — loadPackingQueue */
export interface PackingQueue {
  awaiting: PackingQueueCard[]
  active: PackingQueueCard[]
  ready: PackingQueueCard[]
}
