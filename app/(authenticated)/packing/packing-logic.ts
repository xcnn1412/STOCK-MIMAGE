// กติกาบริสุทธิ์ของใบจัดของ (ไม่แตะ next / supabase) — ตรวจด้วย packing-logic.check.ts
// ศัพท์ตาม docs/specs/equipment-flow.md หัวข้อ 2: ใบจัดของ, เลือกของ/กำลังหยิบ/พร้อมรับ, หยิบของ, ยืนยันจัดของ, จุดรับของ
import { PACKED_LIST_STATUSES, resourceClashes } from '../jobs/tracking/tracking-logic'
import { allowedUnits, isUsableStatus } from '../packages/package-logic'
import type { CategoryUnits, LeadPackageRow, PickerPackage } from '../packages/types'
import type {
  CheckedPackingLine,
  KitItemState,
  ParsedReturn,
  LineAvailability,
  LineBooking,
  PackingLineInput,
  PackingStatus,
  PickRouteGroup,
  PickupSpotInput,
  RestockPlan,
  ReturnCondition,
  ScaffoldRequirement,
  ShelfPlace,
  UnitInfo,
} from './types'

/** สถานะใบจัดของตามลำดับ */
export const PACKING_STATUSES: readonly PackingStatus[] = ['selecting', 'picking', 'ready', 'out', 'returned', 'done']

export const PACKING_STATUS_LABELS: Record<PackingStatus, string> = {
  selecting: 'เลือกของ',
  picking: 'กำลังหยิบ',
  ready: 'พร้อมรับ',
  out: 'ออกงาน',
  returned: 'คืนแล้ว',
  done: 'คืนชั้นแล้ว',
}

/** สถานะที่นับว่า "จัดของแล้ว" (พร้อมรับขึ้นไป) — ความพร้อมข้อ "จัดของ" ผ่าน */
export const PACKED_STATUSES: readonly string[] = PACKED_LIST_STATUSES

export const isPackingStatus = (value: unknown): value is PackingStatus =>
  typeof value === 'string' && (PACKING_STATUSES as readonly string[]).includes(value)

/** ใบนี้ถึง "พร้อมรับ" ขึ้นไปแล้วไหม (ไม่ขาด "จัดของ") */
export const isPackedStatus = (status: string): boolean => PACKED_STATUSES.includes(status)

/** ใบที่ยังไม่ปิดกระบวนการ (ยังไม่คืนชั้น) — หน่วยในใบยังถือว่าถูกใช้ */
export const isOpenPackingStatus = (status: string): boolean => status !== 'done'

/**
 * การเปลี่ยนสถานะที่ทำได้: เดินหน้า เลือกของ→กำลังหยิบ→พร้อมรับ→ออกงาน (รับของ)→คืนแล้ว (คืนของ)→คืนชั้นแล้ว
 * ถอย พร้อมรับ→กำลังหยิบ, กำลังหยิบ→เลือกของ · ตั้งแต่ออกงานถอยไม่ได้
 */
const TRANSITIONS: Partial<Record<PackingStatus, PackingStatus[]>> = {
  selecting: ['picking'],
  picking: ['ready', 'selecting'],
  ready: ['picking', 'out'],
  out: ['returned'],
  returned: ['done'],
}

export function canTransition(from: PackingStatus | string, to: PackingStatus | string): boolean {
  return (TRANSITIONS[from as PackingStatus] ?? []).includes(to as PackingStatus)
}

/** ยกเลิกใบได้เฉพาะ เลือกของ/กำลังหยิบ */
export const canCancelList = (status: string): boolean => status === 'selecting' || status === 'picking'

/** key ของข้อกำหนดในใบ — บรรทัดเก็บ package_id + category_id (ข้อกำหนด UNIQUE (package_id, category_id)) */
export const requirementKey = (packageId: string | null | undefined, categoryId: string | null | undefined): string =>
  `${packageId ?? ''}:${categoryId ?? ''}`

/**
 * โครงบรรทัดจากแพ็กเกจของงาน — ต่อข้อกำหนดของแต่ละแพ็กเกจ: slots = quantity × จำนวนชุด
 * lockedUnits = ชิ้นที่ทีมขายเลือกไว้ (lead_package_units) ของประเภทที่ทีมขายเลือกชิ้นเอง พร้อมแบบประกอบ
 * แพ็กเกจที่ไม่อยู่ใน packages (ถูกลบ) ข้ามไป · ลำดับ = ลำดับแพ็กเกจของงาน แล้วลำดับข้อกำหนด
 */
export function scaffoldLines(leadPackages: LeadPackageRow[], packages: PickerPackage[]): ScaffoldRequirement[] {
  const byId = new Map(packages.map(p => [p.id, p]))
  const out: ScaffoldRequirement[] = []
  for (const lp of leadPackages) {
    const pkg = byId.get(lp.packageId)
    if (!pkg) continue
    for (const r of pkg.requirements) {
      out.push({
        leadPackageId: lp.id,
        packageId: pkg.id,
        packageName: pkg.name,
        requirementId: r.id,
        categoryId: r.categoryId,
        categoryName: r.categoryName,
        slots: r.quantity * lp.quantity,
        salesPick: r.salesPick,
        variants: r.variants,
        optionUnitIds: r.optionUnitIds,
        lockedUnits: r.salesPick
          ? lp.units
              .filter(u => u.requirementId === r.id && u.unitId)
              .map(u => ({ unitId: u.unitId, kind: u.kind, unitName: u.unitName, variant: u.variant, locked: true as const }))
          : [],
      })
    }
  }
  return out
}

type LineKey = { packageId?: string | null; categoryId?: string | null; package_id?: string | null; category_id?: string | null; itemId?: string | null; kitId?: string | null; item_id?: string | null; kit_id?: string | null }

const lineUnitId = (l: LineKey): string | null => l.itemId ?? l.item_id ?? l.kitId ?? l.kit_id ?? null
const lineReqKey = (l: LineKey): string => requirementKey(l.packageId ?? l.package_id, l.categoryId ?? l.category_id)

/**
 * สร้างใบจัดของ (เลือกของ → กำลังหยิบ) ได้ไหม — ทุกข้อกำหนดต้องมีหน่วยครบจำนวน (ของเสริมไม่นับ)
 * รับบรรทัดได้ทั้งรูปแถว DB (package_id/item_id) และรูป input (packageId/itemId)
 */
export function canStartPicking(lines: LineKey[], scaffold: ScaffoldRequirement[]): { ok: true } | { error: string } {
  if (scaffold.length === 0) return { error: 'งานนี้ยังไม่มีแพ็กเกจ — ให้ทีมขายเลือกแพ็กเกจก่อน' }
  const counts = new Map<string, number>()
  for (const l of lines) {
    if (!lineUnitId(l)) continue
    const key = lineReqKey(l)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const short = scaffold
    .map(r => ({ r, missing: r.slots - (counts.get(requirementKey(r.packageId, r.categoryId)) ?? 0) }))
    .filter(x => x.missing > 0)
  if (short.length === 0) return { ok: true }
  return { error: `ยังเลือกของไม่ครบ: ${short.map(x => `${x.r.categoryName} (${x.r.packageName}) ขาด ${x.missing}`).join(', ')}` }
}

/**
 * ตรวจบรรทัดที่หน้าเลือกของส่งมาทั้งชุด (pure — setPackingLines เรียกก่อนเขียน) คืนบรรทัดที่ไม่ใช่ locked หรือ { error } ไทย
 * - บรรทัดต้องมี itemId หรือ kitId อย่างใดอย่างหนึ่ง · หน่วยซ้ำในใบ = error (รวมกับบรรทัด locked)
 * - บรรทัดของข้อกำหนด: ต้องเป็นข้อกำหนดของงานนี้ · หน่วยต้องอยู่ในตัวเลือก (allowedUnits) · ไม่เกินจำนวนช่อง (นับรวม locked)
 * - ของเสริม (ไม่มี packageId/requirementId/categoryId): หน่วยต้องมีอยู่จริง
 * - อุปกรณ์ที่อยู่ในกระเป๋าเป็นบรรทัดเดี่ยวไม่ได้ · บรรทัดที่ตรงกับหน่วย locked ถูกข้าม (locked เปลี่ยนไม่ได้)
 * - แบบประกอบเก็บได้เฉพาะค่าที่อยู่ในแบบของประเภท (ไม่ใช่ = ตัดทิ้ง)
 */
export function checkPackingLines(
  raw: unknown,
  scaffold: ScaffoldRequirement[],
  unitsByCategory: CategoryUnits,
  unitInfo: Record<string, UnitInfo>,
  locked: { item_id: string | null; kit_id: string | null; package_id: string | null; category_id: string | null }[] = [],
): CheckedPackingLine[] | { error: string } {
  if (!Array.isArray(raw)) return { error: 'รายการของไม่ถูกต้อง' }
  const lockedIds = new Set(locked.map(l => l.item_id ?? l.kit_id).filter((id): id is string => !!id))
  const seen = new Set<string>(lockedIds)
  const counts = new Map<string, number>()
  for (const l of locked) counts.set(requirementKey(l.package_id, l.category_id), (counts.get(requirementKey(l.package_id, l.category_id)) ?? 0) + 1)

  const out: CheckedPackingLine[] = []
  for (const [i, item] of raw.entries()) {
    const l = (item ?? {}) as PackingLineInput
    const itemId = String(l.itemId ?? '').trim() || null
    const kitId = String(l.kitId ?? '').trim() || null
    if (!itemId === !kitId) return { error: `บรรทัดที่ ${i + 1}: เลือกอุปกรณ์หรือกระเป๋าอย่างใดอย่างหนึ่ง` }
    const unitId = (itemId ?? kitId) as string
    if (lockedIds.has(unitId)) continue // บรรทัด locked มีอยู่แล้ว เปลี่ยนไม่ได้

    const info = unitInfo[unitId]
    if (!info || info.kind !== (itemId ? 'item' : 'kit')) return { error: `บรรทัดที่ ${i + 1}: ไม่พบอุปกรณ์นี้แล้ว — โหลดหน้าใหม่แล้วเลือกอีกครั้ง` }
    if (info.inKit) return { error: `"${info.name}" อยู่ในกระเป๋า เลือกเป็นบรรทัดเดี่ยวไม่ได้ — เลือกกระเป๋าทั้งใบแทน` }
    if (seen.has(unitId)) return { error: `"${info.name}" อยู่ในใบนี้แล้ว — หน่วยเดียวกันใส่ได้บรรทัดเดียว` }
    seen.add(unitId)

    const reqId = String(l.requirementId ?? '').trim()
    const pkgId = String(l.packageId ?? '').trim()
    const catId = String(l.categoryId ?? '').trim()
    const isExtra = !reqId && !pkgId && !catId
    if (isExtra) {
      out.push({ packageId: null, categoryId: null, itemId, kitId, variant: null })
      continue
    }

    const req = scaffold.find(r => (reqId ? r.requirementId === reqId : r.packageId === pkgId && r.categoryId === catId))
    if (!req) return { error: `บรรทัดที่ ${i + 1}: ข้อกำหนดของแพ็กเกจเปลี่ยนไปแล้ว — โหลดหน้าใหม่แล้วเลือกอีกครั้ง` }
    // ประเภทที่ทีมขายเลือกชิ้นเอง: ชิ้นที่ทีมขายเลือกเป็นบรรทัด locked อยู่แล้ว — ช่องที่ทีมขายยังไม่เลือก ทีมจัดของเติมได้ (นับรวมในจำนวนช่อง)
    const allowed = allowedUnits(req, unitsByCategory[req.categoryId] ?? [])
    if (!allowed.some(u => u.id === unitId)) {
      return { error: `"${info.name}" ไม่ได้อยู่ในตัวเลือกของ ${req.categoryName} ใน "${req.packageName}"` }
    }
    const key = requirementKey(req.packageId, req.categoryId)
    const count = (counts.get(key) ?? 0) + 1
    if (count > req.slots) return { error: `${req.categoryName} ใน "${req.packageName}" เลือกได้ไม่เกิน ${req.slots} หน่วย` }
    counts.set(key, count)
    const variant = String(l.variant ?? '').trim() || null
    out.push({ packageId: req.packageId, categoryId: req.categoryId, itemId, kitId, variant: variant && req.variants.includes(variant) ? variant : null })
  }
  return out
}

/**
 * หยิบบรรทัดนี้ได้ไหม — อุปกรณ์เดี่ยวต้อง "ใช้ได้" (available) · กระเป๋าต้องมีชิ้น available ≥1 และไม่มีชิ้นที่ออกงานอยู่กับอีเวนต์อื่น
 * หยิบแล้ว = หยิบซ้ำไม่ได้ · วัสดุสิ้นเปลืองในกระเป๋าไม่นับ
 */
export function canPickLine(
  line: { item_id?: string | null; kit_id?: string | null; picked_at?: string | null },
  state: { itemStatus?: string | null; kitItems?: KitItemState[] },
): { ok: true } | { error: string } {
  if (line.picked_at) return { error: 'บรรทัดนี้หยิบไปแล้ว' }
  if (line.item_id) {
    const status = state.itemStatus
    if (!status) return { error: 'ไม่พบอุปกรณ์นี้แล้ว' }
    if (status === 'available') return { ok: true }
    if (status === 'in_use') return { error: 'อุปกรณ์นี้ออกงานอยู่ — หยิบไม่ได้จนกว่าจะคืนชั้น เปลี่ยนเป็นหน่วยอื่นแทน' }
    return { error: `อุปกรณ์นี้สถานะ "${statusLabel(status)}" หยิบไม่ได้ — เปลี่ยนเป็นหน่วยอื่นแทน` }
  }
  if (line.kit_id) {
    const items = (state.kitItems ?? []).filter(i => !i.is_consumable)
    const elsewhere = items.filter(i => i.status === 'in_use' && i.outElsewhere)
    if (elsewhere.length > 0) return { error: `กระเป๋านี้มีของออกงานอยู่กับงานอื่น: ${elsewhere.map(i => i.name).join(', ')} — หยิบไม่ได้จนกว่าจะคืน` }
    if (!items.some(i => i.status === 'available')) return { error: 'กระเป๋านี้ไม่มีอุปกรณ์ที่ใช้ได้ให้หยิบ' }
    return { ok: true }
  }
  return { error: 'บรรทัดนี้ไม่มีอุปกรณ์' }
}

const STATUS_LABELS: Record<string, string> = {
  available: 'ใช้ได้',
  in_use: 'ออกงาน',
  damaged: 'เสียหาย',
  maintenance: 'ซ่อม',
  lost: 'หาย',
  purchasing: 'กำลังซื้อ',
  out_of_stock: 'หมด',
}
export const statusLabel = (status: string): string => STATUS_LABELS[status] ?? status

/**
 * ยืนยันจัดของ (กำลังหยิบ → พร้อมรับ) ได้ไหม — ทุกบรรทัดหยิบแล้ว + รูป ≥1 + ระบุจุดรับของ · error ไทยแยกกรณี
 */
export function canConfirmReady(
  list: { status: string; photo_urls?: string[] | null; spot_id?: string | null },
  lines: { picked_at: string | null }[],
): { ok: true } | { error: string } {
  if (list.status !== 'picking') return { error: 'ยืนยันจัดของได้เฉพาะใบที่อยู่ในขั้นกำลังหยิบ' }
  if (lines.length === 0) return { error: 'ใบนี้ยังไม่มีของ' }
  const picked = lines.filter(l => l.picked_at).length
  if (picked < lines.length) return { error: `ยังหยิบไม่ครบ (หยิบแล้ว ${picked}/${lines.length})` }
  if ((list.photo_urls ?? []).length < 1) return { error: 'ถ่ายรูปชุดที่จัดเสร็จอย่างน้อย 1 รูปก่อนยืนยัน' }
  if (!list.spot_id) return { error: 'เลือกจุดรับของที่วางของไว้ก่อนยืนยัน' }
  return { ok: true }
}

const NO_SHELF_LABEL = 'ยังไม่มีชั้น'

/** ป้ายกลุ่ม "ห้อง › ตู้ › ชั้น" */
export function shelfPlaceLabel(place: ShelfPlace | null): string {
  if (!place) return NO_SHELF_LABEL
  const parts = [place.roomName, place.rackCode ? `ตู้ ${place.rackCode}` : null, place.level !== null ? `ชั้น ${place.level}` : null].filter(Boolean)
  return parts.length ? `${parts.join(' › ')} (${place.shelfCode})` : `ชั้น ${place.shelfCode}`
}

const byText = (a: string | null, b: string | null) => {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return a.localeCompare(b, 'th', { numeric: true })
}

/**
 * เส้นทางเดินหยิบ: จัดกลุ่มบรรทัดตามชั้น เรียง ห้อง → รหัสตู้ → ระดับ (ตัวเลข) → รหัสชั้น · ในกลุ่มเรียงชื่อ
 * shelfOf = id หน่วย (items.id / kits.id) → ตำแหน่ง · อุปกรณ์ที่อยู่ในกระเป๋า (kitOfItem) ใช้ชั้นของกระเป๋า
 * บรรทัดไม่มีชั้น = กลุ่ม "ยังไม่มีชั้น" ท้ายสุด
 */
export function pickRoute<L extends { item_id?: string | null; kit_id?: string | null; unitName?: string; name?: string }>(
  lines: L[],
  shelfOf: Record<string, ShelfPlace | null | undefined>,
  kitOfItem: Record<string, string> = {},
): PickRouteGroup<L>[] {
  const placeOf = (l: L): ShelfPlace | null => {
    if (l.kit_id) return shelfOf[l.kit_id] ?? null
    if (l.item_id) return shelfOf[l.item_id] ?? (kitOfItem[l.item_id] ? shelfOf[kitOfItem[l.item_id]] ?? null : null)
    return null
  }
  const groups = new Map<string, PickRouteGroup<L>>()
  for (const l of lines) {
    const place = placeOf(l)
    const key = place?.shelfId ?? 'none'
    const g = groups.get(key) ?? { key, label: shelfPlaceLabel(place), place, lines: [] }
    g.lines.push(l)
    groups.set(key, g)
  }
  const nameOf = (l: L) => l.unitName ?? l.name ?? ''
  for (const g of groups.values()) g.lines.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'th', { numeric: true }))
  return [...groups.values()].sort((a, b) => {
    if (!a.place || !b.place) return a.place ? -1 : b.place ? 1 : 0
    return (
      byText(a.place.roomName, b.place.roomName) ||
      byText(a.place.rackCode, b.place.rackCode) ||
      (a.place.level ?? Number.MAX_SAFE_INTEGER) - (b.place.level ?? Number.MAX_SAFE_INTEGER) ||
      byText(a.place.shelfCode, b.place.shelfCode)
    )
  })
}

export const LINE_AVAILABILITY_LABELS: Record<LineAvailability['status'], string> = {
  free: 'ว่าง',
  queued: 'ต่อคิว',
  clash: 'ชน',
  unavailable: 'ไม่พร้อม',
  out: 'ออกงานอยู่',
}

/**
 * ป้ายความว่างของหน่วยสำหรับทีมจัดของ (หัวข้อ 5.2) — เทียบกับการจองของอีเวนต์อื่นด้วย resourceClashes
 * ไม่พร้อม (เสีย/ซ่อม/หาย/กำลังซื้อ/หมด) = เลือกไม่ได้ · ออกงานอยู่ (in_use ที่ไม่ได้หยิบให้ใบนี้) = เลือกได้แต่หยิบไม่ได้
 * ชน (เวลาทับ / ฝั่งใดไม่มีเวลา) = เลือกได้แต่ต้องยืนยัน · ต่อคิว = วันเดียวกันเวลาไม่ทับ · ว่าง = ไม่มีอีเวนต์อื่นวันเดียวกัน
 * opts.pickedHere = หน่วยนี้หยิบให้ใบนี้แล้ว (in_use เพราะใบนี้ ไม่ใช่ออกงานอยู่)
 */
export function lineAvailability(
  unit: { id: string; status: string },
  event: { eventId: string; eventDate: string | null; eventTime?: string | null; eventEndTime?: string | null },
  otherLineBookings: LineBooking[],
  opts: { pickedHere?: boolean } = {},
): LineAvailability {
  if (!isUsableStatus(unit.status)) return { status: 'unavailable', eventNames: [], selectable: false, pickable: false }
  const mine = otherLineBookings.filter(b => b.unitId === unit.id && b.eventId !== event.eventId)
  const clashes = resourceClashes(
    mine.map(b => ({ resourceId: b.unitId, eventId: b.eventId, eventDate: b.eventDate, eventTime: b.eventTime, eventEndTime: b.eventEndTime })),
    { resourceId: unit.id, eventId: event.eventId, eventDate: event.eventDate, eventTime: event.eventTime, eventEndTime: event.eventEndTime },
  )
  const nameOf = (eventId: string) => mine.find(b => b.eventId === eventId)?.eventName ?? 'อีเวนต์อื่น'
  if (unit.status === 'in_use' && !opts.pickedHere) {
    return { status: 'out', eventNames: clashes.map(c => nameOf(c.eventId)), selectable: true, pickable: false }
  }
  const hard = clashes.filter(c => c.status !== 'queued')
  if (hard.length) {
    return {
      status: 'clash',
      clashKind: hard.some(c => c.status === 'conflict') ? 'conflict' : 'unknown',
      eventNames: hard.map(c => nameOf(c.eventId)),
      selectable: true,
      pickable: true,
    }
  }
  if (clashes.length) return { status: 'queued', eventNames: clashes.map(c => nameOf(c.eventId)), selectable: true, pickable: true }
  return { status: 'free', eventNames: [], selectable: true, pickable: true }
}

/** ใบจัดของของอีเวนต์ต่างๆ ของงานหนึ่ง → ขาด "จัดของ" ไหม (สะดวกกับหน้าที่ไม่มี KitReadiness เต็ม) — กติกาเดียวกับ isMissingKits */
export function isMissingPacking(openEventIds: string[], lists: { eventId: string; status: string }[]): boolean {
  return openEventIds.some(id => {
    const list = lists.find(l => l.eventId === id)
    return !list || !isPackedStatus(list.status)
  })
}

export const MAX_SPOT_NAME = 60
export const MAX_SPOT_CODE = 20

/** ตรวจฟอร์มจุดรับของ · ชื่อ 1–60 · รหัส 1–20 (ตัดช่องว่างหัวท้าย) · หมายเหตุว่าง = null */
export function parsePickupSpotForm(input: Partial<PickupSpotInput>): { name: string; code: string; note: string | null; is_active: boolean } | { error: string } {
  const name = String(input.name ?? '').trim()
  if (!name) return { error: 'กรอกชื่อจุดรับของ' }
  if (name.length > MAX_SPOT_NAME) return { error: `ชื่อจุดรับของยาวเกิน ${MAX_SPOT_NAME} ตัวอักษร` }
  const code = String(input.code ?? '').trim()
  if (!code) return { error: 'กรอกรหัสจุดรับของ' }
  if (code.length > MAX_SPOT_CODE) return { error: `รหัสจุดรับของยาวเกิน ${MAX_SPOT_CODE} ตัวอักษร` }
  const note = String(input.note ?? '').trim() || null
  if (note && note.length > 200) return { error: 'หมายเหตุยาวเกิน 200 ตัวอักษร' }
  return { name, code, note, is_active: input.is_active !== false }
}

// --- เฟส 4: รับของ / คืนของ / คืนชั้น ------------------------------------------------

/** สภาพตอนคืนของ (ค่าเริ่มต้นหน้าจอ = available) */
export const RETURN_CONDITIONS: readonly ReturnCondition[] = ['available', 'damaged', 'maintenance', 'lost']

export const RETURN_CONDITION_LABELS: Record<ReturnCondition, string> = {
  available: 'ใช้ได้',
  damaged: 'เสียหาย',
  maintenance: 'ซ่อม',
  lost: 'หาย',
}

export const isReturnCondition = (value: unknown): value is ReturnCondition =>
  typeof value === 'string' && (RETURN_CONDITIONS as readonly string[]).includes(value)

/** event_logs.condition ของการรับคืน — เก็บ good/damaged/lost (ซ่อมนับเป็น damaged) แบบเดียวกับ kit-check-core */
export const returnLogCondition = (status: ReturnCondition): 'good' | 'damaged' | 'lost' =>
  status === 'available' ? 'good' : status === 'lost' ? 'lost' : 'damaged'

/**
 * รับของ (พร้อมรับ → ออกงาน) ได้ไหม — ใบต้องพร้อมรับ · lineIds ถ้าส่งต้องติ๊กครบทุกบรรทัด (ขาด = error ระบุจำนวน)
 * id ที่ไม่ใช่บรรทัดของใบถูกข้าม
 */
export function canHandOver(
  list: { status: string },
  lines: { id: string }[],
  lineIds?: string[] | null,
): { ok: true } | { error: string } {
  if (list.status !== 'ready') {
    if (list.status === 'out') return { error: 'ใบนี้รับของไปแล้ว' }
    return { error: 'รับของได้เฉพาะใบที่พร้อมรับ' }
  }
  if (lines.length === 0) return { error: 'ใบนี้ยังไม่มีของ' }
  if (Array.isArray(lineIds)) {
    const ticked = new Set(lineIds)
    const missing = lines.filter(l => !ticked.has(l.id)).length
    if (missing > 0) return { error: `ยังติ๊กของไม่ครบ (ขาด ${missing} รายการ) — ติ๊กทุกบรรทัดก่อนยืนยันรับของ` }
  }
  return { ok: true }
}

const MAX_RETURN_NOTE = 500

/**
 * ตรวจข้อมูลคืนของ (pure — returnPackingList เรียกก่อนเขียน) คืน ParsedReturn หรือ { error } ไทย
 * - ทุกบรรทัดของใบต้องมีสภาพ (ขาด = error ระบุชื่อ) · สภาพ ∈ ใช้ได้/เสียหาย/ซ่อม/หาย · บรรทัดซ้ำ/ไม่ใช่ของใบ = error
 * - kitItems อ้างได้เฉพาะชิ้นในกระเป๋าของบรรทัดกระเป๋า (ไม่ใช่วัสดุสิ้นเปลือง ไม่ได้ออกงานอยู่กับงานอื่น) ไม่ซ้ำ
 * - กระเป๋าที่ไม่ได้ระบุชิ้นใดเลย + สภาพบรรทัด ≠ ใช้ได้ = ทุกชิ้นที่ออกงานให้อีเวนต์นี้ได้สภาพนั้น (เช่น กระเป๋าหายทั้งใบ)
 *   ระบุบางชิ้น = ชิ้นที่ไม่ระบุถือว่าใช้ได้ · ผลลัพธ์ kitItems มีเฉพาะชิ้นที่สภาพ ≠ ใช้ได้
 * - consumableUse ตรวจรูปแบบที่นี่ (จำนวนเต็ม ≥ 0) ส่วนคู่ที่อนุญาต/ตัดแล้วตรวจด้วย planReturnUse ตอนตัดยอด
 */
export function parseReturnInput(
  raw: unknown,
  lines: { id: string; item_id: string | null; kit_id: string | null; unitName?: string | null }[],
  kitItemStates: Record<string, KitItemState[]>,
): ParsedReturn | { error: string } {
  const input = (raw ?? {}) as Record<string, unknown>
  const rawLines = Array.isArray(input.lines) ? input.lines : null
  if (!rawLines) return { error: 'ข้อมูลคืนของไม่ถูกต้อง' }

  const nameOf = (l: { unitName?: string | null }) => l.unitName || 'รายการ'
  const byId = new Map(lines.map(l => [l.id, l]))
  const given = new Map<string, { condition: ReturnCondition; note: string | null }>()
  for (const r of rawLines) {
    const row = (r ?? {}) as Record<string, unknown>
    const lineId = String(row.lineId ?? '')
    const line = byId.get(lineId)
    if (!line) return { error: 'มีรายการที่ไม่อยู่ในใบนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง' }
    if (given.has(lineId)) return { error: `"${nameOf(line)}" ระบุสภาพซ้ำ` }
    if (!isReturnCondition(row.condition)) return { error: `"${nameOf(line)}" สภาพไม่ถูกต้อง — เลือกได้แค่ ใช้ได้ / เสียหาย / ซ่อม / หาย` }
    const note = String(row.note ?? '').trim() || null
    if (note && note.length > MAX_RETURN_NOTE) return { error: `หมายเหตุของ "${nameOf(line)}" ยาวเกิน ${MAX_RETURN_NOTE} ตัวอักษร` }
    given.set(lineId, { condition: row.condition, note })
  }
  const missing = lines.filter(l => !given.has(l.id))
  if (missing.length > 0) return { error: `ยังไม่ได้ระบุสภาพ: ${missing.map(nameOf).join(', ')}` }

  // ชิ้นในกระเป๋า: itemId → กระเป๋าในใบ
  const kitLines = lines.filter(l => l.kit_id)
  const kitOfItem = new Map<string, { kitId: string; state: KitItemState }>()
  for (const l of kitLines) for (const st of kitItemStates[l.kit_id as string] ?? []) kitOfItem.set(st.id, { kitId: l.kit_id as string, state: st })

  const rawKitItems = input.kitItems == null ? [] : input.kitItems
  if (!Array.isArray(rawKitItems)) return { error: 'ข้อมูลสภาพรายชิ้นไม่ถูกต้อง' }
  const perItem = new Map<string, ReturnCondition>()
  for (const r of rawKitItems) {
    const row = (r ?? {}) as Record<string, unknown>
    const itemId = String(row.itemId ?? '')
    const hit = kitOfItem.get(itemId)
    if (!hit) return { error: 'มีชิ้นที่ไม่อยู่ในกระเป๋าของใบนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง' }
    if (hit.state.is_consumable) return { error: `"${hit.state.name}" เป็นวัสดุสิ้นเปลือง — กรอกจำนวนที่ใช้ไปแทนสภาพ` }
    if (hit.state.outElsewhere) return { error: `"${hit.state.name}" ออกงานอยู่กับงานอื่น — ระบุสภาพจากใบนี้ไม่ได้` }
    if (perItem.has(itemId)) return { error: `"${hit.state.name}" ระบุสภาพซ้ำ` }
    if (!isReturnCondition(row.condition)) return { error: `"${hit.state.name}" สภาพไม่ถูกต้อง — เลือกได้แค่ ใช้ได้ / เสียหาย / ซ่อม / หาย` }
    perItem.set(itemId, row.condition)
  }

  const kitItems: ParsedReturn['kitItems'] = []
  for (const l of kitLines) {
    const kitId = l.kit_id as string
    const states = (kitItemStates[kitId] ?? []).filter(st => !st.is_consumable && !st.outElsewhere)
    const anyGiven = states.some(st => perItem.has(st.id))
    const lineCondition = given.get(l.id)!.condition
    for (const st of states) {
      const condition = perItem.get(st.id) ?? (!anyGiven && st.status === 'in_use' ? lineCondition : 'available')
      if (condition !== 'available') kitItems.push({ kitId, itemId: st.id, condition })
    }
  }

  const rawUse = input.consumableUse == null ? [] : input.consumableUse
  if (!Array.isArray(rawUse)) return { error: 'ข้อมูลวัสดุสิ้นเปลืองไม่ถูกต้อง' }
  const consumableUse: ParsedReturn['consumableUse'] = []
  for (const r of rawUse) {
    const row = (r ?? {}) as Record<string, unknown>
    const used = Number(row.used)
    if (!Number.isInteger(used) || used < 0) return { error: 'จำนวนที่ใช้ไปต้องเป็นจำนวนเต็มตั้งแต่ 0' }
    consumableUse.push({ kitId: String(row.kitId ?? ''), itemId: String(row.itemId ?? ''), used })
  }

  const note = String(input.note ?? '').trim() || null
  if (note && note.length > MAX_RETURN_NOTE) return { error: `หมายเหตุยาวเกิน ${MAX_RETURN_NOTE} ตัวอักษร` }

  return {
    lines: lines.map(l => ({ lineId: l.id, ...given.get(l.id)! })),
    kitItems,
    consumableUse,
    note,
  }
}

/**
 * แผนคืนชั้นของบรรทัดหนึ่ง (pure) — อุปกรณ์เดี่ยว: สถานะ = สภาพตอนคืน (ไม่ระบุ = ใช้ได้)
 * กระเป๋า: ชิ้นที่ยังออกงาน (in_use) ให้อีเวนต์นี้ → ใช้ได้ (ชิ้นที่ตั้งเสีย/ซ่อม/หายตอนคืนไม่แตะ · วัสดุสิ้นเปลืองไม่นับ)
 * คืนชั้นแล้ว = error
 */
export function restockPlan(
  line: { item_id: string | null; kit_id: string | null; return_condition: ReturnCondition | null; restocked_at: string | null },
  kitItems: KitItemState[] = [],
): RestockPlan | { error: string } {
  if (line.restocked_at) return { error: 'บรรทัดนี้คืนชั้นแล้ว' }
  if (line.item_id) return { kind: 'item', itemId: line.item_id, itemStatus: line.return_condition ?? 'available' }
  if (line.kit_id) {
    return {
      kind: 'kit',
      kitId: line.kit_id,
      kitItemIds: kitItems.filter(i => !i.is_consumable && i.status === 'in_use' && !i.outElsewhere).map(i => i.id),
    }
  }
  return { error: 'บรรทัดนี้ไม่มีอุปกรณ์' }
}

/** คืนชั้นครบทุกบรรทัดแล้วไหม (ใบที่ไม่มีบรรทัด = ครบ) */
export const isRestockComplete = (lines: { restocked_at: string | null }[]): boolean => lines.every(l => !!l.restocked_at)
