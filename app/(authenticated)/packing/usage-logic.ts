// ตรรกะนับของแดชบอร์ดการใช้งานอุปกรณ์ (/stock/usage) — pure ล้วน (ไม่มี React ไม่มี IO) ทดสอบด้วย usage-logic.check.ts
//
// นิยามที่ล็อกไว้ใน docs/specs/equipment-flow.md (หัวข้อ 2, 6 และ "เฟส 5 — แผนและเกณฑ์ที่ล็อก") — ห้ามเปลี่ยนโดยไม่แก้ spec:
//   จำนวนครั้งใช้งาน = บรรทัดใบจัดของที่ handed_over_at ไม่ว่าง (ถึงขั้นรับของ)
//   ชั่วโมงใช้งาน    = returned_at − handed_over_at · ขาดเวลาใดเวลาหนึ่ง → ช่วงเวลาอีเวนต์ (event_time → event_end_time
//                     ของวันงาน · จบ ≤ เริ่ม = ข้ามเที่ยงคืน ยืดถึง 24:00 แบบ kitWindow) · ไม่มีทั้งคู่ = 0 ชั่วโมงแต่ยังนับครั้ง
//   ทศนิยม           = ปัด 1 ตำแหน่ง — ยอดรวมบวกค่าดิบก่อนแล้วปัดครั้งเดียว (ไม่สะสมเศษจากการปัดรายบรรทัด)
//   ช่วงของแดชบอร์ด  = ภาพรวม / เดือนนี้ / 3 เดือน (เดือนนี้ + 2 เดือนก่อน ถึงวันนี้) / ปีนี้ อิงวันของ handed_over_at ตามเวลาไทย
import { kitWindow } from '../jobs/tracking/tracking-logic'
import { periodRange, type DateRange } from '../reports/report-stats'

export type { DateRange }

/** บรรทัดใบจัดของหนึ่งบรรทัด (หน่วยอุปกรณ์หนึ่งหน่วยในใบหนึ่ง) พร้อมข้อมูลอีเวนต์ที่ใช้ fallback ชั่วโมง */
export interface UsageLine {
  unitId: string
  kind: 'item' | 'kit'
  unitName: string
  serial?: string | null
  /** ประเภทของหน่วย (items/kits.category_id · ไม่มี = ประเภทของบรรทัด) — null = ไม่ระบุประเภท */
  categoryId: string | null
  categoryName: string | null
  listId: string
  leadId: string | null
  customerName: string | null
  /** YYYY-MM-DD */
  eventDate: string | null
  /** HH:MM(:SS) */
  eventTime: string | null
  eventEndTime: string | null
  /** timestamptz ISO */
  handedOverAt: string | null
  returnedAt: string | null
  /** แบบประกอบ (ป้ายบอก) */
  variant: string | null
}

/** ใบจัดของหนึ่งใบ — เฉพาะช่องที่นับคน/สถานะ */
export interface UsageList {
  id: string
  status: string
  eventDate: string | null
  packedBy: string | null
  packedAt: string | null
  handedOverBy: string | null
  handedOverAt: string | null
  returnedBy: string | null
  returnedAt: string | null
  restockedBy: string | null
  restockedAt: string | null
  leadId: string | null
}

/** แพ็กเกจที่ขายให้งานหนึ่งงาน (lead_packages ของงานที่ตอบรับแล้ว) */
export interface SoldPackage {
  packageId: string
  packageName: string
  /** จำนวนชุด */
  quantity: number
  eventDate: string | null
  leadId: string
  /** งานนี้มีใบจัดของแล้วอย่างน้อย 1 ใบ */
  hasList: boolean
}

// ---------------------------------------------------------------------------
// ช่วงเวลา
// ---------------------------------------------------------------------------

export type UsagePeriod = 'all' | 'month' | 'quarter' | 'year'

export const USAGE_PERIODS: readonly UsagePeriod[] = ['all', 'month', 'quarter', 'year']

export const USAGE_PERIOD_LABELS_TH: Record<UsagePeriod, string> = {
  all: 'ภาพรวม',
  month: 'เดือนนี้',
  quarter: '3 เดือน',
  year: 'ปีนี้',
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * ช่วงวัน (ปิดหัวปิดท้าย YYYY-MM-DD) ของชิป · 'all' หรือ today รูปแบบผิด = null (ไม่กรอง)
 * month / year = ทั้งเดือน / ทั้งปีปฏิทิน (ชุดเดียวกับ /reports) · quarter = วันที่ 1 ของเดือน (today − 2 เดือน) ถึง today
 */
export function usagePeriodRange(period: UsagePeriod, today: string): DateRange | null {
  if (period === 'all') return null
  const m = YMD.exec(today)
  if (!m) return null
  if (period === 'quarter') {
    const from = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 - 2, 1)).toISOString().slice(0, 10)
    return { from, to: today }
  }
  return periodRange(period, today)
}

/** timestamptz → YYYY-MM-DD ตามเวลาไทย (UTC+7 ไม่มีเวลาออมแสง) · ว่าง/ผิดรูป = null */
export function bangkokDayOf(ts: string | null | undefined): string | null {
  if (!ts) return null
  const ms = Date.parse(ts)
  if (Number.isNaN(ms)) return null
  return new Date(ms + 7 * 3_600_000).toISOString().slice(0, 10)
}

/** วัน YYYY-MM-DD อยู่ในช่วงไหม · range null = ทุกวัน (รวมวันที่ไม่รู้) · ไม่รู้วัน = นอกช่วงที่กรอง */
export function inDateRange(day: string | null, range: DateRange | null): boolean {
  if (!range) return true
  return !!day && day >= range.from && day <= range.to
}

/**
 * บรรทัด/ใบ อยู่ในช่วงไหม — อิงวันของ handedOverAt (เวลาไทย)
 * ใบที่ยังไม่รับของใช้ packedAt แทน · ไม่มีวันอ้างอิง = นับเฉพาะภาพรวม
 */
export function inUsagePeriod(x: UsageLine | UsageList, range: DateRange | null): boolean {
  if (!range) return true
  const ts = x.handedOverAt ?? ('packedAt' in x ? x.packedAt : null)
  return inDateRange(bangkokDayOf(ts), range)
}

// ---------------------------------------------------------------------------
// ชั่วโมงใช้งาน
// ---------------------------------------------------------------------------

/** ปัดทศนิยม 1 ตำแหน่ง */
export const round1 = (n: number): number => Math.round(n * 10) / 10

/** ชั่วโมงดิบ (ไม่ปัด) ตามนิยามที่ล็อก */
function rawLineHours(line: UsageLine): number {
  const start = line.handedOverAt ? Date.parse(line.handedOverAt) : NaN
  const end = line.returnedAt ? Date.parse(line.returnedAt) : NaN
  if (!Number.isNaN(start) && !Number.isNaN(end)) return Math.max(0, (end - start) / 3_600_000)
  const win = kitWindow({ eventTime: line.eventTime, eventEndTime: line.eventEndTime })
  return win ? (win[1] - win[0]) / 60 : 0
}

/** ชั่วโมงใช้งานของบรรทัด (ทศนิยม 1 ตำแหน่ง) · ยังไม่รับของ = 0 (ยังไม่ออกงาน) */
export function lineHours(line: UsageLine): number {
  if (!line.handedOverAt) return 0
  return round1(rawLineHours(line))
}

const handed = (lines: UsageLine[]) => lines.filter(l => !!l.handedOverAt)
const sumHours = (lines: UsageLine[]) => round1(lines.reduce((s, l) => s + rawLineHours(l), 0))
const byName = (a: string, b: string) => a.localeCompare(b, 'th', { numeric: true })

// ---------------------------------------------------------------------------
// ส่วนต่างๆ ของแดชบอร์ด
// ---------------------------------------------------------------------------

export interface UnitUsageRow {
  unitId: string
  kind: 'item' | 'kit'
  unitName: string
  serial: string | null
  categoryName: string | null
  count: number
  hours: number
  /** handedOverAt ล่าสุด (ISO) */
  lastUsedAt: string | null
}

/** หน่วยที่ใช้บ่อย — นับเฉพาะบรรทัดที่รับของแล้ว · เรียงครั้งมาก → ชั่วโมงมาก → ชื่อ */
export function unitUsage(lines: UsageLine[]): UnitUsageRow[] {
  const groups = new Map<string, UsageLine[]>()
  for (const l of handed(lines)) {
    const g = groups.get(l.unitId)
    if (g) g.push(l)
    else groups.set(l.unitId, [l])
  }
  const out: UnitUsageRow[] = []
  for (const [unitId, g] of groups) {
    const first = g[0]
    let last: string | null = null
    for (const l of g) if (l.handedOverAt && (!last || Date.parse(l.handedOverAt) > Date.parse(last))) last = l.handedOverAt
    out.push({
      unitId,
      kind: first.kind,
      unitName: first.unitName,
      serial: first.serial ?? null,
      categoryName: first.categoryName,
      count: g.length,
      hours: sumHours(g),
      lastUsedAt: last,
    })
  }
  return out.sort((a, b) => b.count - a.count || b.hours - a.hours || byName(a.unitName, b.unitName))
}

export interface CategoryUnitCount {
  categoryId: string
  categoryName: string
  /** จำนวนหน่วยทั้งหมดในประเภท (ไม่รวมอุปกรณ์ที่อยู่ในกระเป๋า) */
  unitCount: number
}

export interface CategoryUsageRow {
  /** null = บรรทัดที่หน่วยไม่มีประเภท */
  categoryId: string | null
  categoryName: string
  unitCount: number
  count: number
  hours: number
  /** หน่วยในประเภทที่ไม่ได้ออกงานเลยในช่วง = unitCount − หน่วยไม่ซ้ำที่ใช้ (ไม่ติดลบ) */
  unusedUnits: number
}

export const NO_CATEGORY_TH = 'ไม่ระบุประเภท'

/**
 * ตามประเภท — ทุกประเภทใน unitsByCategory (ลำดับตามที่ส่งมา) แม้ไม่ได้ใช้เลย
 * ต่อท้ายด้วยประเภทที่มีในบรรทัดแต่ไม่อยู่ในรายการ (เช่นปิดใช้แล้ว หรือไม่ระบุประเภท) — unitCount 0
 */
export function categoryUsage(lines: UsageLine[], unitsByCategory: CategoryUnitCount[]): CategoryUsageRow[] {
  const used = handed(lines)
  const keyOf = (id: string | null) => id ?? ''
  const groups = new Map<string, UsageLine[]>()
  for (const l of used) {
    const k = keyOf(l.categoryId)
    const g = groups.get(k)
    if (g) g.push(l)
    else groups.set(k, [l])
  }
  const row = (categoryId: string | null, categoryName: string, unitCount: number): CategoryUsageRow => {
    const g = groups.get(keyOf(categoryId)) ?? []
    const distinct = new Set(g.map(l => l.unitId)).size
    return { categoryId, categoryName, unitCount, count: g.length, hours: sumHours(g), unusedUnits: Math.max(0, unitCount - distinct) }
  }
  const out = unitsByCategory.map(c => row(c.categoryId, c.categoryName, c.unitCount))
  const known = new Set(unitsByCategory.map(c => c.categoryId))
  const extras = [...groups.entries()]
    .filter(([k]) => !known.has(k))
    .map(([k, g]) => row(k || null, (k && g[0].categoryName) || NO_CATEGORY_TH, 0))
    .sort((a, b) => (a.categoryId === null ? 1 : b.categoryId === null ? -1 : byName(a.categoryName, b.categoryName)))
  return [...out, ...extras]
}

export interface PackageSalesRow {
  packageId: string
  packageName: string
  /** จำนวนชุดที่ขาย (งานที่วันงาน ≤ today) */
  soldSets: number
  /** จำนวนงาน (ที่วันงาน ≤ today) ที่มีใบจัดของแล้ว */
  listed: number
}

/**
 * ตามแพ็กเกจ — นับเฉพาะงานที่วันงานถึงแล้ว (eventDate ≤ today · ไม่รู้วันงาน = ไม่นับ)
 * range (ไม่บังคับ) = กรองวันงานตามชิปช่วงเพิ่ม · เรียงชุดมาก → ชื่อ · แพ็กเกจที่ไม่เหลือแถวไม่แสดง
 */
export function packageSales(sold: SoldPackage[], today: string, range: DateRange | null = null): PackageSalesRow[] {
  const map = new Map<string, PackageSalesRow>()
  for (const s of sold) {
    const day = s.eventDate ? s.eventDate.slice(0, 10) : null
    if (!day || day > today || !inDateRange(day, range)) continue
    const r = map.get(s.packageId) ?? { packageId: s.packageId, packageName: s.packageName, soldSets: 0, listed: 0 }
    r.soldSets += Math.max(0, s.quantity || 0)
    if (s.hasList) r.listed += 1
    map.set(s.packageId, r)
  }
  return [...map.values()].sort((a, b) => b.soldSets - a.soldSets || byName(a.packageName, b.packageName))
}

export interface BoothUsageRow {
  unitId: string
  unitName: string
  count: number
  /** เรียงครั้งมาก → ชื่อแบบ · ไม่ระบุแบบ = 'ไม่ระบุแบบ' */
  byVariant: { variant: string; count: number }[]
}

export const NO_VARIANT_TH = 'ไม่ระบุแบบ'

/** ตู้และแบบประกอบ — เฉพาะหน่วยในประเภทที่ทีมขายเลือกชิ้นเอง (sales_pick) ที่รับของแล้ว */
export function boothUsage(lines: UsageLine[], salesPickCategoryIds: string[]): BoothUsageRow[] {
  const pick = new Set(salesPickCategoryIds)
  const map = new Map<string, { unitName: string; count: number; variants: Map<string, number> }>()
  for (const l of handed(lines)) {
    if (!l.categoryId || !pick.has(l.categoryId)) continue
    const r = map.get(l.unitId) ?? { unitName: l.unitName, count: 0, variants: new Map<string, number>() }
    r.count += 1
    const v = (l.variant || '').trim() || NO_VARIANT_TH
    r.variants.set(v, (r.variants.get(v) ?? 0) + 1)
    map.set(l.unitId, r)
  }
  return [...map.entries()]
    .map(([unitId, r]) => ({
      unitId,
      unitName: r.unitName,
      count: r.count,
      byVariant: [...r.variants.entries()]
        .map(([variant, count]) => ({ variant, count }))
        .sort((a, b) => b.count - a.count || byName(a.variant, b.variant)),
    }))
    .sort((a, b) => b.count - a.count || byName(a.unitName, b.unitName))
}

export interface UsagePerson {
  id: string
  name: string
}

export interface PeopleUsageRow {
  userId: string
  name: string
  /** ใบที่ยืนยันจัดของ (packed_by · สถานะ ≥ พร้อมรับ — นิยามเดียวกับถ้วยนักจัดของ) */
  packed: number
  /** ใบที่คืนชั้นครบ (restocked_by · สถานะ done — นิยามเดียวกับถ้วยนักคืนของ) */
  restocked: number
  handedOver: number
  returned: number
}

const PACKED_STATUSES = new Set(['ready', 'out', 'returned', 'done'])

/** คน — นับต่อใบ · เฉพาะคนในรายชื่อ (อนุมัติแล้ว) · เรียงรวมมาก → ชื่อ · ตัดคนที่ทุกช่อง 0 */
export function peopleUsage(lists: UsageList[], people: UsagePerson[]): PeopleUsageRow[] {
  const map = new Map<string, PeopleUsageRow>(people.map(p => [p.id, { userId: p.id, name: p.name, packed: 0, restocked: 0, handedOver: 0, returned: 0 }]))
  const bump = (id: string | null, key: 'packed' | 'restocked' | 'handedOver' | 'returned') => {
    const r = id ? map.get(id) : undefined
    if (r) r[key] += 1
  }
  for (const l of lists) {
    if (PACKED_STATUSES.has(l.status)) bump(l.packedBy, 'packed')
    if (l.status === 'done') bump(l.restockedBy, 'restocked')
    bump(l.handedOverBy, 'handedOver')
    bump(l.returnedBy, 'returned')
  }
  const total = (r: PeopleUsageRow) => r.packed + r.restocked + r.handedOver + r.returned
  return [...map.values()].filter(r => total(r) > 0).sort((a, b) => total(b) - total(a) || byName(a.name, b.name))
}

/** ตอนนี้ — นับใบตามสถานะปัจจุบัน (ไม่ขึ้นกับชิปช่วง) */
export function currentCounts(lists: UsageList[]): { ready: number; out: number; returned: number } {
  const c = { ready: 0, out: 0, returned: 0 }
  for (const l of lists) if (l.status === 'ready' || l.status === 'out' || l.status === 'returned') c[l.status] += 1
  return c
}

/** ชั่วโมงใช้งานต่อเดือน `months` เดือนล่าสุด (รวมเดือนของ today) เรียงเก่า → ใหม่ · เดือนอิง handedOverAt ตามเวลาไทย */
export function hoursByMonth(lines: UsageLine[], today: string, months = 12): { month: string; hours: number; count: number }[] {
  const m = YMD.exec(today)
  if (!m || months <= 0) return []
  const y = Number(m[1])
  const mo = Number(m[2]) - 1
  const keys: string[] = []
  for (let i = months - 1; i >= 0; i--) keys.push(new Date(Date.UTC(y, mo - i, 1)).toISOString().slice(0, 7))
  const raw = new Map<string, { hours: number; count: number }>(keys.map(k => [k, { hours: 0, count: 0 }]))
  for (const l of handed(lines)) {
    const k = bangkokDayOf(l.handedOverAt)?.slice(0, 7)
    const r = k ? raw.get(k) : undefined
    if (!r) continue
    r.hours += rawLineHours(l)
    r.count += 1
  }
  return keys.map(k => ({ month: k, hours: round1(raw.get(k)!.hours), count: raw.get(k)!.count }))
}

/** ชั่วโมงแสดงผล: ทศนิยม 1 ตำแหน่งเสมอ (เช่น 12.0) */
export const formatHours = (h: number): string => round1(h).toFixed(1)
