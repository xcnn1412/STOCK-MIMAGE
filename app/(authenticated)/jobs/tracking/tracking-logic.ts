// Pure logic seam for /jobs/tracking — readiness, time bucketing, chip counts.
// No React, no I/O: everything is a function of TrackingLead[] + "today".

export interface TrackingLead {
  id: string
  customer_name: string | null
  event_name: string | null
  event_date: string | null // YYYY-MM-DD
  event_end_date: string | null // YYYY-MM-DD
  event_time: string | null // HH:mm
  event_end_time: string | null // HH:mm
  design_status: string
  supplier_note: string | null
  /** สีฉาก / โทนสี / รายละเอียดฉาก — บันทึกอิสระเหมือน supplier_note */
  backdrop_note: string | null
  tracking_checklist: string[] // may contain vehicle keys 'car_triton' | 'car_champ'
  /** ตำแหน่งที่ต้องการ: { "<staff_role value>": จำนวนคน } — {} = ยังไม่กำหนด */
  required_roles: Record<string, number>
  /** อีเวนต์ที่ผูกกับงานนี้ (ไม่รวมที่ปิดแล้ว) — ที่สำหรับจัดคน */
  events: { id: string; name: string; event_date: string | null; status: string | null; event_time?: string | null; event_end_time?: string | null }[]
  /** คนที่จัดแล้ว รวมทุกอีเวนต์ของงาน — event_id บอกว่าอยู่ในชุดของอีเวนต์ไหน */
  staff: { user_id: string; name: string; nickname: string | null; role: string; event_id: string }[]
  /** สิ่งที่ตั้งว่า "ไม่ต้องจัด" ของงานนี้ (จาก key skip_* ใน tracking_checklist ดิบ) — ไม่ส่ง = ไม่มี */
  waived?: MissingItem[]
}

export const VEHICLES = [
  { key: 'car_triton', label: 'Mitsubishi Triton' },
  { key: 'car_champ', label: 'Toyota Champ' },
] as const

/**
 * การจองรถหนึ่งครั้ง (event_vehicles) — รถผูกกับ "อีเวนต์" ไม่ใช่งาน (ADR-0004)
 * งานที่มีหลายอีเวนต์จึงจัดรถคนละคันต่ออีเวนต์ได้ · cache ระดับงาน (tracking_checklist) ยังถือได้คันเดียว
 */
export interface EventVehicle {
  eventId: string
  vehicleKey: string
}

export const READY_DESIGN_STATUSES = ['sent_email_cf', 'completed']

/**
 * สถานะของอีเวนต์ที่ "ปิดแล้ว" — closeEvent เขียน 'completed' (ดู app/(authenticated)/events/actions.ts)
 * รับ 'closed' ไว้ด้วยเผื่อข้อมูลเก่า/สคริปต์เดิมที่เคยเขียนคำนี้
 */
export const CLOSED_EVENT_STATUSES = ['completed', 'closed']

/** อีเวนต์ใบนี้ปิดแล้วไหม — ปิดแล้ว = แตะไม่ได้ (จัดคน/จองกระเป๋า) และไม่นับเป็นการจองที่ยังใช้งานอยู่ */
export const isClosedEvent = (status: string | null | undefined): boolean =>
  !!status && CLOSED_EVENT_STATUSES.includes(status)

export type MissingItem = 'design' | 'staff' | 'vehicle' | 'time' | 'kits'

export const MISSING_LABELS: Record<MissingItem, string> = {
  design: 'ออกแบบ',
  staff: 'จัดคน',
  vehicle: 'จัดรถ',
  time: 'เวลาเริ่ม',
  kits: 'กระเป๋า',
}

// --- ไม่ต้องจัด (waiver): งานที่ไม่ต้องใช้ออกแบบ/คน/รถ/กระเป๋า ---------------------

/** สิ่งที่ตั้ง "ไม่ต้องจัด" ได้ — เวลาเริ่มตั้งไม่ได้ (ทุกงานต้องมีเวลา) */
export type WaivableItem = Exclude<MissingItem, 'time'>

/** สิ่งที่ตั้งไม่ต้องจัดได้ → key ที่เก็บใน crm_leads.tracking_checklist (ไม่ต้องเปลี่ยน schema) */
export const WAIVER_KEYS: Record<WaivableItem, string> = {
  design: 'skip_design',
  staff: 'skip_staff',
  vehicle: 'skip_vehicle',
  kits: 'skip_kits',
}

export const WAIVER_LABELS: Record<WaivableItem, string> = {
  design: 'ไม่ต้องออกแบบ',
  staff: 'ไม่ต้องจัดคน',
  vehicle: 'ไม่ต้องจัดรถ',
  kits: 'ไม่ต้องจัดกระเป๋า',
}

/** ค่าที่ส่งมาเป็นสิ่งที่ตั้งไม่ต้องจัดได้จริงไหม (กันค่าที่ client ส่งมามั่ว รวมถึง 'time') */
export function isWaivableItem(value: string): value is WaivableItem {
  return Object.prototype.hasOwnProperty.call(WAIVER_KEYS, value)
}

/** key skip_* ไหม — ใช้แยก key ไม่ต้องจัดออกจาก key รถตอนเขียน tracking_checklist */
export const isWaiverKey = (key: string): boolean => Object.values(WAIVER_KEYS).includes(key)

/** tracking_checklist ดิบ → สิ่งที่ตั้งไม่ต้องจัดไว้ (เรียงตามลำดับเกณฑ์ความพร้อม) */
export function parseWaived(checklist: string[] | null | undefined): WaivableItem[] {
  const keys = Array.isArray(checklist) ? checklist : []
  return (Object.keys(WAIVER_KEYS) as WaivableItem[]).filter((item) => keys.includes(WAIVER_KEYS[item]))
}

/** ตำแหน่งที่ยังมีคนไม่ครบ 1 รายการ */
export interface RoleGap {
  role: string
  need: number
  have: number
}

/** true เมื่องานกำหนดตำแหน่งที่ต้องการไว้อย่างน้อยหนึ่งตำแหน่ง (จำนวน ≤ 0 = ไม่ได้กำหนด) */
export function hasRequiredRoles(lead: TrackingLead): boolean {
  return Object.values(lead.required_roles || {}).some((n) => n >= 1)
}

/**
 * จำนวนคนไม่ซ้ำ (user_id) ต่อตำแหน่ง ตามลำดับที่เจอ — `extra` = คนที่ยังไม่บันทึก (ร่าง) นับรวมด้วย
 */
export function staffedCounts(
  lead: TrackingLead,
  extra?: { user_id: string; role: string }[]
): Record<string, number> {
  const byRole = new Map<string, Set<string>>()
  for (const s of extra ? [...lead.staff, ...extra] : lead.staff) {
    const set = byRole.get(s.role)
    if (set) set.add(s.user_id)
    else byRole.set(s.role, new Set([s.user_id]))
  }
  return Object.fromEntries([...byRole].map(([role, ids]) => [role, ids.size]))
}

/**
 * ตำแหน่งที่ยังมีคนไม่ครบ ตามลำดับที่กำหนดไว้ใน required_roles
 * — นับคนไม่ซ้ำ (user_id) ต่อตำแหน่ง; คนเกินหรือตำแหน่งอื่นที่เพิ่มเข้ามาไม่มีผล
 */
export function missingRoles(lead: TrackingLead): RoleGap[] {
  const counts = staffedCounts(lead)
  const gaps: RoleGap[] = []
  for (const [role, need] of Object.entries(lead.required_roles || {})) {
    if (!(need >= 1)) continue
    const have = counts[role] ?? 0
    if (have < need) gaps.push({ role, need, have })
  }
  return gaps
}

/** กำหนดตำแหน่งแล้ว = ครบทุกตำแหน่ง; ยังไม่กำหนด = มีคนอย่างน้อย 1 คน (กติกาเดิม) */
export function isFullyStaffed(lead: TrackingLead): boolean {
  if (!hasRequiredRoles(lead)) return lead.staff.length >= 1
  return missingRoles(lead).length === 0
}

/**
 * สิ่งที่ยังขาดของงานหนึ่ง เรียงตามลำดับเกณฑ์ความพร้อม: ออกแบบ, จัดคน, จัดรถ, เวลาเริ่ม, กระเป๋า
 * `kit` = ข้อมูลกระเป๋าของงานนี้ (เกณฑ์ข้อ 5) — ไม่ส่ง = ไม่ตัดสินข้อกระเป๋าเลย (ผู้เรียกที่ยังไม่มีข้อมูล)
 * `designReady` = ข้อออกแบบตัดสินจาก "ใบงานกราฟิกทุกใบ" (designReadyByLead) — ไม่ส่ง = ใช้ lead.design_status
 * ตามเดิม (ผู้เรียกที่ยังไม่มีข้อมูลใบงาน)
 */
export function getMissing(lead: TrackingLead, kit?: KitReadiness, designReady?: boolean): MissingItem[] {
  const missing: MissingItem[] = []
  const designOk = designReady ?? READY_DESIGN_STATUSES.includes(lead.design_status)
  if (!designOk) missing.push('design')
  if (!isFullyStaffed(lead)) missing.push('staff')
  if (!VEHICLES.some((v) => lead.tracking_checklist.includes(v.key))) missing.push('vehicle')
  if (!lead.event_time) missing.push('time')
  if (kit && isMissingKits(kit)) missing.push('kits')
  // สิ่งที่ตั้งว่า "ไม่ต้องจัด" ไม่นับว่าขาด
  const waived = lead.waived ?? []
  return waived.length > 0 ? missing.filter((m) => !waived.includes(m)) : missing
}

export function isReady(lead: TrackingLead, kit?: KitReadiness, designReady?: boolean): boolean {
  return getMissing(lead, kit, designReady).length === 0
}

/** ป้ายของสิ่งที่ยังขาด — 'staff' ต่อท้ายด้วยตำแหน่งที่ขาด เช่น `จัดคน (ผู้ช่วย 1, ช่างกล้อง 2)` */
export function missingLabel(
  item: MissingItem,
  lead: TrackingLead,
  roleLabels: Record<string, string>
): string {
  if (item !== 'staff') return MISSING_LABELS[item]
  const gaps = missingRoles(lead)
  if (gaps.length === 0) return MISSING_LABELS.staff
  return `${MISSING_LABELS.staff} (${gaps.map((g) => `${roleLabels[g.role] || g.role} ${g.need - g.have}`).join(', ')})`
}

/** YYYY-MM-DD → Date เที่ยงคืนเวลาท้องถิ่น (new Date('YYYY-MM-DD') จะได้ UTC — อย่าใช้) */
export function parseDate(dateStr: string): Date {
  // ponytail: slice(0,10) — บางคอลัมน์ (events.event_date) เป็น timestamp เต็ม ไม่ใช่ YYYY-MM-DD เพียวๆ
  const [y, m, d] = dateStr.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(dateStr: string, today: Date): number {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const target = parseDate(dateStr)
  return Math.round((target.getTime() - start.getTime()) / 86400000)
}

export function isPast(lead: TrackingLead, today: Date): boolean {
  if (!lead.event_date) return false
  return daysUntil(lead.event_end_date ?? lead.event_date, today) < 0
}

export type Bucket = 'today' | 'week' | 'next' | `month:${string}`

export function bucketOf(lead: TrackingLead, today: Date): Bucket | null {
  if (!lead.event_date) return null
  const d = daysUntil(lead.event_date, today)
  if (d === 0) return 'today'
  if (d >= 1 && d <= 7) return 'week'
  if (d >= 8 && d <= 14) return 'next'
  return `month:${lead.event_date.slice(0, 7)}`
}

export const BUCKET_LABELS: Record<'today' | 'week' | 'next', string> = {
  today: 'วันนี้',
  week: '7 วันนี้',
  next: '7 วันถัดไป',
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleDateString('th-TH', { month: 'short', year: 'numeric' })
}

export function groupLeads(
  leads: TrackingLead[],
  today: Date
): { key: Bucket; label: string; leads: TrackingLead[] }[] {
  const map = new Map<Bucket, TrackingLead[]>()
  for (const lead of leads) {
    const key = bucketOf(lead, today)
    if (!key) continue
    const list = map.get(key)
    if (list) list.push(lead)
    else map.set(key, [lead])
  }

  const months = [...map.keys()]
    .filter((k): k is `month:${string}` => k.startsWith('month:'))
    .sort()
  const order: Bucket[] = (['today', 'week', 'next'] as Bucket[])
    .filter((k) => map.has(k))
    .concat(months)

  return order.map((key) => ({
    key,
    label: key.startsWith('month:') ? monthLabel(key.slice(6)) : BUCKET_LABELS[key as 'today' | 'week' | 'next'],
    leads: map.get(key)!.slice().sort(compareLeads),
  }))
}

function compareLeads(a: TrackingLead, b: TrackingLead): number {
  const byDate = (a.event_date ?? '').localeCompare(b.event_date ?? '')
  if (byDate !== 0) return byDate
  if (a.event_time === b.event_time) return 0
  if (!a.event_time) return 1
  if (!b.event_time) return -1
  return a.event_time.localeCompare(b.event_time)
}

export type Chip = 'today' | 'week7' | 'month'

export function inChip(lead: TrackingLead, chip: Chip, today: Date): boolean {
  if (!lead.event_date) return false
  if (chip === 'month') {
    return lead.event_date.slice(0, 7) === `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  }
  const d = daysUntil(lead.event_date, today)
  return chip === 'today' ? d === 0 : d >= 0 && d <= 7
}

/**
 * `kits` = ข้อมูลกระเป๋าต่องาน (leadId → KitReadiness) — ไม่ส่ง = ไม่ตัดสินเกณฑ์ข้อกระเป๋า
 * `designReady` = ความพร้อมออกแบบต่องาน (designReadyByLead) — ไม่ส่ง = ใช้ lead.design_status ตามเดิม
 */
export function chipCounts(
  leads: TrackingLead[],
  today: Date,
  kits?: Map<string, KitReadiness>,
  designReady?: Map<string, boolean>
): Record<Chip, { total: number; notReady: number }> {
  const counts: Record<Chip, { total: number; notReady: number }> = {
    today: { total: 0, notReady: 0 },
    week7: { total: 0, notReady: 0 },
    month: { total: 0, notReady: 0 },
  }
  for (const lead of leads) {
    const ready = isReady(lead, kits?.get(lead.id), designReady?.get(lead.id))
    for (const chip of ['today', 'week7', 'month'] as Chip[]) {
      if (!inChip(lead, chip, today)) continue
      counts[chip].total++
      if (!ready) counts[chip].notReady++
    }
  }
  return counts
}

export function isUrgent(
  lead: TrackingLead,
  today: Date,
  kit?: KitReadiness,
  designReady?: boolean
): boolean {
  if (!lead.event_date) return false
  return !isReady(lead, kit, designReady) && daysUntil(lead.event_date, today) <= 7
}

// --- resource clashes (รถ / คน ถูกใช้ซ้ำข้ามงาน) -----------------------------

export type Availability = 'free' | 'queued' | 'conflict' | 'unknown'

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  free: 'ว่าง',
  queued: 'ต่อคิว',
  conflict: 'ชน',
  unknown: 'เช็คเวลาไม่ได้',
}

export interface Conflict {
  kind: 'vehicle' | 'staff'
  key: string // vehicle key or user_id
  label: string // car label or nickname||name
  withLeadId: string
  withLabel: string // other job's customer_name || 'ไม่ระบุลูกค้า'
  withTime: string // 'HH:mm–HH:mm' | 'HH:mm' | ''
  status: Exclude<Availability, 'free'>
}

/** true when [event_date, event_end_date ?? event_date] of both leads overlap (inclusive); false if either lacks event_date. */
export function dateRangesOverlap(a: TrackingLead, b: TrackingLead): boolean {
  if (!a.event_date || !b.event_date) return false
  const aEnd = a.event_end_date ?? a.event_date
  const bEnd = b.event_end_date ?? b.event_date
  return a.event_date <= bEnd && b.event_date <= aEnd
}

/** งานที่ยังใส่เวลาไม่ครบ (ขาดเวลาเริ่ม หรือ เวลาสิ้นสุด) — เทียบเวลากับงานอื่นไม่ได้ ('เช็คเวลาไม่ได้') */
export function lacksTime(lead: TrackingLead): boolean {
  return !lead.event_time || !lead.event_end_time
}

/** how two date-overlapping leads clash in time: 'conflict' (overlap), 'queued' (same day, no overlap), 'unknown' (a time is missing). */
export function timeStatus(a: TrackingLead, b: TrackingLead): 'conflict' | 'queued' | 'unknown' {
  if (!dateRangesOverlap(a, b)) return 'queued'
  // เขียนเต็มแทน lacksTime() เพื่อให้ TS แคบชนิดให้บรรทัดเทียบเวลาข้างล่าง
  if (!a.event_time || !a.event_end_time || !b.event_time || !b.event_end_time) return 'unknown'
  const aSingle = !a.event_end_date || a.event_end_date === a.event_date
  const bSingle = !b.event_end_date || b.event_end_date === b.event_date
  // multi-day overlap (or one job spanning the other) can't be reduced to one time window
  if (!aSingle || !bSingle || a.event_date !== b.event_date) return 'conflict'
  // same single day: [start, end) overlap → ชน; touching (end === start) → ต่อคิว
  return a.event_time < b.event_end_time && b.event_time < a.event_end_time ? 'conflict' : 'queued'
}

/** the VEHICLES key assigned to this lead, or null. */
export function vehicleOf(lead: TrackingLead): string | null {
  return VEHICLES.find((v) => lead.tracking_checklist.includes(v.key))?.key ?? null
}

function timeRangeLabel(lead: TrackingLead): string {
  if (!lead.event_time) return ''
  return lead.event_end_time ? `${lead.event_time}–${lead.event_end_time}` : lead.event_time
}

const AVAILABILITY_RANK: Record<Availability, number> = { free: 0, queued: 1, unknown: 2, conflict: 3 }

function worst(a: Availability, b: Availability): Availability {
  return AVAILABILITY_RANK[b] > AVAILABILITY_RANK[a] ? b : a
}

/** every clash of this lead's car or staff with another date-overlapping job — vehicle first, then staff in lead.staff order. */
export function getConflicts(lead: TrackingLead, all: TrackingLead[]): Conflict[] {
  const others = all.filter((o) => o.id !== lead.id && dateRangesOverlap(lead, o))
  const out: Conflict[] = []

  const vKey = vehicleOf(lead)
  if (vKey) {
    const vLabel = VEHICLES.find((v) => v.key === vKey)!.label
    for (const other of others) {
      if (vehicleOf(other) !== vKey) continue
      out.push({
        kind: 'vehicle',
        key: vKey,
        label: vLabel,
        withLeadId: other.id,
        withLabel: other.customer_name || 'ไม่ระบุลูกค้า',
        withTime: timeRangeLabel(other),
        status: timeStatus(lead, other),
      })
    }
  }

  for (const person of lead.staff) {
    for (const other of others) {
      if (!other.staff.some((s) => s.user_id === person.user_id)) continue
      out.push({
        kind: 'staff',
        key: person.user_id,
        label: person.nickname || person.name,
        withLeadId: other.id,
        withLabel: other.customer_name || 'ไม่ระบุลูกค้า',
        withTime: timeRangeLabel(other),
        status: timeStatus(lead, other),
      })
    }
  }

  return out
}

/** worst availability of one person across other date-overlapping jobs (ignores `lead` itself). */
export function availabilityOf(userId: string, lead: TrackingLead, all: TrackingLead[]): Availability {
  let result: Availability = 'free'
  for (const other of all) {
    if (other.id === lead.id || !dateRangesOverlap(lead, other)) continue
    if (!other.staff.some((s) => s.user_id === userId)) continue
    result = worst(result, timeStatus(lead, other))
  }
  return result
}

/** every other date-overlapping job this person is already on (ignores `lead` itself), in `all` order. */
export function personClashes(
  userId: string,
  lead: TrackingLead,
  all: TrackingLead[]
): { withLeadId: string; withLabel: string; withTime: string; status: Exclude<Availability, 'free'> }[] {
  const out: { withLeadId: string; withLabel: string; withTime: string; status: Exclude<Availability, 'free'> }[] = []
  for (const other of all) {
    if (other.id === lead.id || !dateRangesOverlap(lead, other)) continue
    if (!other.staff.some((s) => s.user_id === userId)) continue
    out.push({
      withLeadId: other.id,
      withLabel: other.customer_name || 'ไม่ระบุลูกค้า',
      withTime: timeRangeLabel(other),
      status: timeStatus(lead, other),
    })
  }
  return out
}

/** worst availability of one car across other date-overlapping jobs (ignores `lead` itself). */
export function vehicleAvailability(vehicleKey: string, lead: TrackingLead, all: TrackingLead[]): Availability {
  let result: Availability = 'free'
  for (const other of all) {
    if (other.id === lead.id || !dateRangesOverlap(lead, other)) continue
    if (vehicleOf(other) !== vehicleKey) continue
    result = worst(result, timeStatus(lead, other))
  }
  return result
}

// --- timeline layout (ไทม์ไลน์: เลน / แถบงาน) --------------------------------

/** คนที่อนุมัติแล้วหนึ่งคน = หนึ่งเลนคนในไทม์ไลน์ */
export interface Person {
  id: string
  name: string
  nickname: string | null
  department: string | null
}

/** ลำดับกลุ่มแผนกในเลนคน — ค่าเดียวกับ DEPARTMENTS ใน lib/departments.ts เรียงใหม่ตามที่ไทม์ไลน์ใช้ */
// ponytail: restates lib/departments.ts in planning order; import+reorder if departments become dynamic
export const DEPARTMENT_ORDER: readonly string[] = [
  'ช่าง',
  'ฝ่ายประสานงาน',
  'ฝ่ายออกแบบ',
  'ฝ่ายแอดมิน',
  'ผู้บริหาร',
  'นักศึกษาฝึกงาน',
]

/** แผนกที่ไม่รู้จัก/ยังไม่ตั้ง — เรียงท้ายสุด */
export const NO_DEPARTMENT_LABEL = 'ไม่ระบุแผนก'

/** ขนาด palette; UI แปลง colorIdx เป็น class เอง */
export const BAR_COLORS = 10

const NO_CUSTOMER_LABEL = 'ไม่ระบุลูกค้า'
const DAY_END_MIN = 24 * 60
const DEFAULT_HOUR_START = 6
const NO_END_SPAN_MIN = 120

export type BarTiming = 'exact' | 'no_end' | 'no_time' | 'multi_day'

export interface Bar {
  leadId: string
  label: string
  /** ป้ายตำแหน่งในงาน — เฉพาะเลนคน */
  role?: string
  /** ค่า role ดิบของ `role` (ไม่แปลป้าย) — เฉพาะเลนคน ใช้ตอนเอาคนออกจากงาน */
  roleValue?: string
  startMin: number
  endMin: number
  timing: BarTiming
  layer: number
  colorIdx: number
  conflict: boolean
  /** เฉพาะเลนงาน: ยังไม่จัดทั้งคนและรถ */
  unassigned: boolean
  /** เฉพาะเลนกระเป๋า: การจองนี้จัดกระเป๋าครบแล้วหรือยัง (ไม่ใช่เลนกระเป๋า = undefined) */
  packed?: boolean
}

export type LaneKind = 'jobs' | 'vehicle' | 'kit' | 'person'

export interface Lane {
  kind: LaneKind
  key: string
  label: string
  /** แผนก — เฉพาะเลนคน */
  sublabel?: string
  bars: Bar[]
  layers: number
}

/** ตัวเลือกของไทม์ไลน์ — ไม่ส่ง kits = ไม่มีเลนกระเป๋า */
export interface TimelineOptions {
  /** แผนกที่เลือกไว้ในชิป — ว่าง/ไม่ส่ง = ทุกแผนก (กรองเฉพาะเลนคน) */
  departments?: string[]
  /** กระเป๋าทั้งหมด — หนึ่งใบ = หนึ่งเลน ตามลำดับที่ส่งมา */
  kits?: Kit[]
  /** การจองกระเป๋าที่เอามาวาดเป็นแถบในเลนกระเป๋า (รวมของอีเวนต์อื่นด้วย เพื่อให้เห็นว่าชน) */
  kitBookings?: KitBookingDetail[]
}

export interface DayLayout {
  date: string
  hourStart: number
  hourEnd: number
  lanes: Lane[]
  colorByLead: Record<string, number>
}

/** บล็อกงานหนึ่งช่องในโหมดสัปดาห์ */
export interface WeekCell {
  leadId: string
  label: string
  colorIdx: number
  conflict: boolean
  /** ยังไม่จัดทั้งคนและรถ (กฎเดียวกับเลนงานโหมดวัน) */
  unassigned: boolean
  role?: string
  /** เฉพาะเลนกระเป๋า: การจองนี้จัดกระเป๋าครบแล้วหรือยัง */
  packed?: boolean
}

export interface WeekLane {
  kind: LaneKind
  key: string
  label: string
  sublabel?: string
  /** วันที่ (YYYY-MM-DD) → บล็อกงานของเลนนั้นในวันนั้น (ครบทั้ง 7 วันเสมอ) */
  cells: Record<string, WeekCell[]>
}

export interface WeekLayout {
  days: string[]
  lanes: WeekLane[]
  colorByLead: Record<string, number>
}

/** บวก/ลบวันบนสตริง YYYY-MM-DD (เวลาท้องถิ่น) */
export function addDays(date: string, n: number): string {
  const d = parseDate(date)
  d.setDate(d.getDate() + n)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function coversDate(lead: TrackingLead, date: string): boolean {
  if (!lead.event_date) return false
  return lead.event_date <= date && date <= (lead.event_end_date ?? lead.event_date)
}

function compareTimeline(a: TrackingLead, b: TrackingLead): number {
  const byDateTime = compareLeads(a, b)
  return byDateTime !== 0 ? byDateTime : a.id.localeCompare(b.id)
}

/** งานที่วันที่นั้นอยู่ในช่วง [event_date, event_end_date ?? event_date] — เรียงวัน แล้วเวลา (ไม่มีเวลาไว้ท้าย) แล้ว id */
export function leadsOnDate(leads: TrackingLead[], date: string): TrackingLead[] {
  return leads.filter((l) => coversDate(l, date)).sort(compareTimeline)
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + (m || 0)
}

function timingOf(lead: TrackingLead, date: string): BarTiming {
  if (lead.event_date !== date) return 'multi_day' // วันต่อเนื่องของงานหลายวัน
  if (lead.event_end_date && lead.event_end_date > date) return 'multi_day'
  if (!lead.event_time) return 'no_time'
  if (!lead.event_end_time) return 'no_end'
  return toMinutes(lead.event_end_time) <= toMinutes(lead.event_time) ? 'no_end' : 'exact'
}

function spanOf(
  lead: TrackingLead,
  timing: BarTiming,
  hourStart: number
): { startMin: number; endMin: number } {
  if (timing === 'multi_day' || timing === 'no_time') {
    return { startMin: hourStart * 60, endMin: DAY_END_MIN }
  }
  const startMin = Math.max(hourStart * 60, Math.min(toMinutes(lead.event_time!), DAY_END_MIN))
  if (timing === 'no_end') return { startMin, endMin: Math.min(startMin + NO_END_SPAN_MIN, DAY_END_MIN) }
  return { startMin, endMin: Math.min(toMinutes(lead.event_end_time!), DAY_END_MIN) }
}

/** 06:00 เป็นค่าตั้งต้น ขยับลงเป็นชั่วโมงเต็มถ้ามีงานเริ่มก่อนหน้านั้น */
function hourStartFor(onDate: TrackingLead[], date: string): number {
  let hour = DEFAULT_HOUR_START
  for (const lead of onDate) {
    const timing = timingOf(lead, date)
    if ((timing !== 'exact' && timing !== 'no_end') || !lead.event_time) continue
    hour = Math.min(hour, Math.floor(toMinutes(lead.event_time) / 60))
  }
  return hour
}

/** greedy: เรียงตามเวลาเริ่ม แล้ววางในชั้นต่ำสุดที่ว่าง (ชิดกันได้) — คืนจำนวนชั้น (อย่างน้อย 1) */
function assignLayers(bars: Bar[]): number {
  bars.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  const lastEnd: number[] = []
  for (const bar of bars) {
    const layer = lastEnd.findIndex((end) => end <= bar.startMin)
    if (layer === -1) {
      bar.layer = lastEnd.length
      lastEnd.push(bar.endMin)
    } else {
      bar.layer = layer
      lastEnd[layer] = bar.endMin
    }
  }
  return lastEnd.length || 1
}

/** ธงชนในเลนเดียว: มีแถบของ "งานอื่น" ที่ timeStatus = conflict (ต่อคิว/ไม่รู้เวลา = ไม่ติดธง) */
function markConflicts(bars: Bar[], byId: Map<string, TrackingLead>): void {
  for (const bar of bars) {
    const lead = byId.get(bar.leadId)!
    bar.conflict = bars.some(
      (other) => other.leadId !== bar.leadId && timeStatus(lead, byId.get(other.leadId)!) === 'conflict'
    )
  }
}

function departmentRank(department: string | null): number {
  const i = department ? DEPARTMENT_ORDER.indexOf(department) : -1
  return i === -1 ? DEPARTMENT_ORDER.length : i
}

function personLabel(person: Person): string {
  return person.nickname || person.name
}

/** ป้ายแผนกของคนหนึ่ง (null → ไม่ระบุแผนก) */
function departmentLabel(person: Person): string {
  return person.department ?? NO_DEPARTMENT_LABEL
}

/** คนเรียงตามกลุ่มแผนก (ไม่ระบุแผนกท้ายสุด) แล้วชื่อ — กรองด้วย opts.departments ถ้ามี */
function sortPeople(people: Person[], departments?: string[]): Person[] {
  const keep = departments && departments.length > 0 ? new Set(departments) : null
  return people
    .filter((p) => !keep || keep.has(departmentLabel(p)))
    .sort(
      (a, b) =>
        departmentRank(a.department) - departmentRank(b.department) ||
        personLabel(a).localeCompare(personLabel(b), 'th')
    )
}

/** ตำแหน่งทุกตำแหน่งที่คนนี้ถูกจัดไว้ในงานนี้ — value ดิบ + ป้ายที่แปลแล้ว */
function rolesOf(
  lead: TrackingLead,
  personId: string,
  roleLabels: Record<string, string>
): { value: string; label: string }[] {
  return lead.staff
    .filter((s) => s.user_id === personId)
    .map((s) => ({ value: s.role, label: roleLabels[s.role] || s.role }))
}

function leadLabel(lead: TrackingLead): string {
  return lead.customer_name || NO_CUSTOMER_LABEL
}

/**
 * เลนและแถบงานของหนึ่งวัน: เลนงาน → เลนรถ (ตาม VEHICLES) → เลนกระเป๋า → เลนคน (ตามแผนก แล้วชื่อ).
 * ตำแหน่ง (นาทีจาก 00:00), ชั้นซ้อน, สี, ธงชน, ธงยังไม่จัด คำนวณให้ครบ — UI แค่ map เป็น div.
 */
export function layoutDay(
  leads: TrackingLead[],
  date: string,
  people: Person[],
  roleLabels: Record<string, string>,
  opts?: TimelineOptions
): DayLayout {
  const onDate = leadsOnDate(leads, date)
  const byId = new Map(onDate.map((l) => [l.id, l]))
  const colorByLead: Record<string, number> = {}
  onDate.forEach((lead, i) => {
    colorByLead[lead.id] = i % BAR_COLORS
  })
  const hourStart = hourStartFor(onDate, date)

  const makeBar = (
    lead: TrackingLead,
    extra: { role?: string; roleValue?: string; unassigned?: boolean } = {}
  ): Bar => {
    const timing = timingOf(lead, date)
    const { startMin, endMin } = spanOf(lead, timing, hourStart)
    const bar: Bar = {
      leadId: lead.id,
      label: leadLabel(lead),
      startMin,
      endMin,
      timing,
      layer: 0,
      colorIdx: colorByLead[lead.id],
      conflict: false,
      unassigned: extra.unassigned ?? false,
    }
    if (extra.role !== undefined) bar.role = extra.role
    if (extra.roleValue !== undefined) bar.roleValue = extra.roleValue
    return bar
  }

  const lanes: Lane[] = []

  // เลนงาน — ทุกงานของวันโดยไม่ผูกทรัพยากร; ไม่ติดธงชน (ที่นี่สนใจ "ยังไม่จัด")
  const jobBars = onDate.map((lead) =>
    makeBar(lead, { unassigned: lead.staff.length === 0 && !vehicleOf(lead) })
  )
  lanes.push({ kind: 'jobs', key: 'jobs', label: 'งาน', bars: jobBars, layers: assignLayers(jobBars) })

  for (const vehicle of VEHICLES) {
    const bars = onDate.filter((lead) => vehicleOf(lead) === vehicle.key).map((lead) => makeBar(lead))
    markConflicts(bars, byId)
    lanes.push({ kind: 'vehicle', key: vehicle.key, label: vehicle.label, bars, layers: assignLayers(bars) })
  }

  // เลนกระเป๋า — แถบคือ "การจอง" ไม่ใช่งาน: ยืดตามเวลาของงานที่จองเมื่องานนั้นอยู่ในวันนี้และมีเวลา
  // ไม่งั้นพาดทั้งวันแบบลายทาง (เหมือนงานที่ยังไม่ใส่เวลา) · ชน = กระเป๋าใบเดียวกันวันเดียวกันคนละอีเวนต์
  const bookings = opts?.kitBookings ?? []
  const makeKitBar = (b: KitBookingDetail): Bar => {
    const lead = b.leadId ? byId.get(b.leadId) : undefined
    const timing = lead ? timingOf(lead, date) : 'no_time'
    const { startMin, endMin } = lead
      ? spanOf(lead, timing, hourStart)
      : { startMin: hourStart * 60, endMin: DAY_END_MIN }
    return {
      leadId: b.leadId ?? '',
      label: b.eventName,
      startMin,
      endMin,
      timing,
      layer: 0,
      colorIdx: lead ? colorByLead[lead.id] : 0,
      conflict: kitBookingConflict(bookings, b).length > 0,
      unassigned: false,
      packed: b.packed,
    }
  }
  for (const kit of opts?.kits ?? []) {
    const bars = bookings.filter((b) => b.kitId === kit.id && b.eventDate === date).map(makeKitBar)
    lanes.push({ kind: 'kit', key: kit.id, label: kit.name, bars, layers: assignLayers(bars) })
  }

  for (const person of sortPeople(people, opts?.departments)) {
    const bars: Bar[] = []
    for (const lead of onDate) {
      for (const role of rolesOf(lead, person.id, roleLabels))
        bars.push(makeBar(lead, { role: role.label, roleValue: role.value }))
    }
    markConflicts(bars, byId)
    lanes.push({
      kind: 'person',
      key: person.id,
      label: personLabel(person),
      sublabel: departmentLabel(person),
      bars,
      layers: assignLayers(bars),
    })
  }

  return { date, hourStart, hourEnd: 24, lanes, colorByLead }
}

/** 7 วันนับจาก startDate (rolling) — แต่ละเลนมีบล็อกงานต่อวัน */
export function layoutWeek(
  leads: TrackingLead[],
  startDate: string,
  people: Person[],
  roleLabels: Record<string, string>,
  opts?: TimelineOptions
): WeekLayout {
  const days = Array.from({ length: 7 }, (_, i) => addDays(startDate, i))
  const perDay = days.map((day) => leadsOnDate(leads, day))

  const colorByLead: Record<string, number> = {}
  let seen = 0
  for (const dayLeads of perDay) {
    for (const lead of dayLeads) {
      if (lead.id in colorByLead) continue
      colorByLead[lead.id] = seen % BAR_COLORS
      seen++
    }
  }

  /** cells ของเลนหนึ่ง: สมาชิกต่อวันมาจาก pick, ธงชนคิดกันเองภายในช่องนั้น */
  const buildCells = (
    pick: (lead: TrackingLead) => boolean,
    role: (lead: TrackingLead) => string | undefined,
    flagConflicts: boolean
  ): Record<string, WeekCell[]> => {
    const cells: Record<string, WeekCell[]> = {}
    days.forEach((day, i) => {
      const members = perDay[i].filter(pick)
      cells[day] = members.map((lead) => {
        const cell: WeekCell = {
          leadId: lead.id,
          label: leadLabel(lead),
          colorIdx: colorByLead[lead.id],
          conflict:
            flagConflicts &&
            members.some((other) => other.id !== lead.id && timeStatus(lead, other) === 'conflict'),
          unassigned: lead.staff.length === 0 && !vehicleOf(lead),
        }
        const r = role(lead)
        if (r !== undefined) cell.role = r
        return cell
      })
    })
    return cells
  }

  /** cells ของเลนกระเป๋าหนึ่งใบ: บล็อกคือ "การจอง" ในวันของอีเวนต์นั้น (ชน = วันเดียวกันคนละอีเวนต์) */
  const bookings = opts?.kitBookings ?? []
  const kitCells = (kitId: string): Record<string, WeekCell[]> => {
    const cells: Record<string, WeekCell[]> = {}
    for (const day of days) {
      cells[day] = bookings
        .filter((b) => b.kitId === kitId && b.eventDate === day)
        .map((b) => ({
          leadId: b.leadId ?? '',
          label: b.eventName,
          colorIdx: b.leadId ? colorByLead[b.leadId] ?? 0 : 0,
          conflict: kitBookingConflict(bookings, b).length > 0,
          unassigned: false,
          packed: b.packed,
        }))
    }
    return cells
  }

  const lanes: WeekLane[] = [
    { kind: 'jobs', key: 'jobs', label: 'งาน', cells: buildCells(() => true, () => undefined, false) },
    ...VEHICLES.map((vehicle) => ({
      kind: 'vehicle' as const,
      key: vehicle.key as string,
      label: vehicle.label as string,
      cells: buildCells((lead) => vehicleOf(lead) === vehicle.key, () => undefined, true),
    })),
    ...(opts?.kits ?? []).map((kit) => ({
      kind: 'kit' as const,
      key: kit.id,
      label: kit.name,
      cells: kitCells(kit.id),
    })),
  ]

  for (const person of sortPeople(people, opts?.departments)) {
    lanes.push({
      kind: 'person',
      key: person.id,
      label: personLabel(person),
      sublabel: departmentLabel(person),
      cells: buildCells(
        (lead) => lead.staff.some((s) => s.user_id === person.id),
        (lead) => rolesOf(lead, person.id, roleLabels)[0]?.label,
        true
      ),
    })
  }

  return { days, lanes, colorByLead }
}

// --- ภาระงาน / สรุปแผนก -------------------------------------------------------

/** จำนวนงานไม่ซ้ำที่คนนี้ถูกจัด และคร่อมวันใดวันหนึ่งใน 7 วันนับจาก fromDate */
export function workloadOf(personId: string, leads: TrackingLead[], fromDate: string): number {
  const last = addDays(fromDate, 6)
  let count = 0
  for (const lead of leads) {
    if (!lead.event_date) continue
    if (lead.event_date > last || (lead.event_end_date ?? lead.event_date) < fromDate) continue
    if (lead.staff.some((s) => s.user_id === personId)) count++
  }
  return count
}

// --- โฟกัสงาน (ตัวเลือก / แถบเวลา) --------------------------------------------

/** ช่วงเวลาของงานโฟกัสในหนึ่งวัน — สแปนเดียวกับแถบงานในเลน (ใช้วาดแถบพาดทุกเลน) */
export function focusWindow(
  lead: TrackingLead,
  date: string,
  hourStart: number
): { startMin: number; endMin: number; timing: BarTiming } {
  const timing = timingOf(lead, date)
  return { ...spanOf(lead, timing, hourStart), timing }
}

/** คนหนึ่งคนเมื่อมองจากงานที่โฟกัสอยู่ */
export interface Candidate {
  person: Person
  availability: Availability
  /** จำนวนงานใน 7 วันนับจาก fromDate */
  workload: number
  /** งานที่ชน/ต่อคิวใบแรก — ไม่มีเมื่อว่าง */
  clash?: { withLabel: string; withTime: string }
  /** ตำแหน่ง (ค่าดิบ ไม่ซ้ำ) ที่คนนี้ถืออยู่ในงานโฟกัสแล้ว */
  assignedRoles: string[]
}

/**
 * ตัวเลือกของงานโฟกัส: `candidates` = ใช้ได้ (ว่าง/ต่อคิว/เช็คเวลาไม่ได้), `busy` = ชน.
 * คนที่จัดเข้างานนี้แล้วอยู่ต้นรายการ `candidates` เสมอ (แม้จะชน) เพื่อให้กดเอาออกได้
 * เรียง: ความว่าง (ว่าง → ต่อคิว → เช็คเวลาไม่ได้) → ภาระงานน้อยก่อน → ชื่อ
 */
export function focusCandidates(
  lead: TrackingLead,
  people: Person[],
  leads: TrackingLead[],
  fromDate: string,
  opts?: { departments?: string[] }
): { candidates: Candidate[]; busy: Candidate[] } {
  const all = sortPeople(people, opts?.departments).map((person): Candidate => {
    const availability = availabilityOf(person.id, lead, leads)
    const candidate: Candidate = {
      person,
      availability,
      workload: workloadOf(person.id, leads, fromDate),
      assignedRoles: [
        ...new Set(lead.staff.filter((s) => s.user_id === person.id).map((s) => s.role)),
      ],
    }
    const first = availability === 'free' ? undefined : personClashes(person.id, lead, leads)[0]
    if (first) candidate.clash = { withLabel: first.withLabel, withTime: first.withTime }
    return candidate
  })

  const byLoad = (a: Candidate, b: Candidate) =>
    a.workload - b.workload || personLabel(a.person).localeCompare(personLabel(b.person), 'th')
  const byAvailability = (a: Candidate, b: Candidate) =>
    AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability] || byLoad(a, b)

  const assigned = all.filter((c) => c.assignedRoles.length > 0).sort(byAvailability)
  const rest = all.filter((c) => c.assignedRoles.length === 0)

  return {
    candidates: [...assigned, ...rest.filter((c) => c.availability !== 'conflict').sort(byAvailability)],
    busy: rest.filter((c) => c.availability === 'conflict').sort(byLoad),
  }
}

/** จำนวนคน/จำนวนคนว่างของหนึ่งแผนก */
export interface DepartmentSummary {
  label: string
  total: number
  free: number
}

/** สรุปเลนคนต่อแผนก ตามลำดับที่แผนกโผล่ในเลน — ว่าง = ไม่มีแถบ (วัน) / ไม่มีบล็อกงานเลย (สัปดาห์) */
export function departmentSummary(lanes: (Lane | WeekLane)[]): DepartmentSummary[] {
  const byLabel = new Map<string, DepartmentSummary>()
  for (const lane of lanes) {
    if (lane.kind !== 'person') continue
    const label = lane.sublabel ?? NO_DEPARTMENT_LABEL
    let entry = byLabel.get(label)
    if (!entry) {
      entry = { label, total: 0, free: 0 }
      byLabel.set(label, entry)
    }
    entry.total++
    const busy =
      'bars' in lane ? lane.bars.length > 0 : Object.values(lane.cells).some((cells) => cells.length > 0)
    if (!busy) entry.free++
  }
  return [...byLabel.values()]
}

/** ระดับสีของตัวเลขภาระงาน: 0 ไม่แสดง, 1–2 เทา, 3–4 เหลือง, ≥5 แดง */
export function workloadTone(n: number): 'none' | 'low' | 'mid' | 'high' {
  if (n <= 0) return 'none'
  if (n <= 2) return 'low'
  if (n <= 4) return 'mid'
  return 'high'
}

// --- พูลงาน: ใบงานเข้าแท็บฝ่าย -------------------------------------------------

/**
 * ใบงานหนึ่งใบ (แถวในตาราง jobs) เท่าที่พูลงานต้องใช้
 * — ข้อมูลลูกค้า/วันงานไม่อยู่ที่นี่ ต้อง join กลับผ่าน crm_lead_id (ADR-0002)
 */
export interface PoolJob {
  id: string
  /** 'graphic' = ใบงานกราฟิก, 'onsite' = ใบงานหน้างาน — ค่าอื่นไม่เข้าแท็บใดเลย */
  job_type: string
  status: string
  title: string
  /** คนที่เกี่ยวข้องกับใบงาน (uuid) — รวมผู้รับด้วย */
  assigned_to: string[]
  /** ผู้รับใบงาน (กราฟิก = เจ้าของงานออกแบบ, หน้างาน = หัวหน้างาน) — null = ยังไม่มีผู้รับ */
  claimed_by: string | null
  /** งานที่ใบงานนี้แตกออกมา */
  crm_lead_id: string | null
  /**
   * สถานะออกแบบของ "ใบนี้" (เฉพาะใบงานกราฟิก) — null/undefined = ยังไม่เคยตั้งค่า
   * (ใบเก่าก่อนแยกรายใบ · งานหน้างานไม่ใช้ช่องนี้)
   */
  design_status?: string | null
}

/**
 * สถานะที่ถือว่าใบงาน "จบ" แล้วจึงออกจากพูล — ค่าตั้งต้นที่ส่งทับได้
 * (สถานะใบงานตั้งค่าเองได้ใน job_settings; 'skipped' คือใบงานที่ถูกข้าม)
 */
export const POOL_DONE_STATUSES: readonly string[] = ['done', 'skipped']

/** สถานะใบงานที่แปลว่า "ถูกข้าม" — ค่าตั้งต้นที่ส่งทับได้ (สถานะใบงานตั้งค่าเองได้ใน job_settings) */
export const SKIPPED_JOB_STATUS = 'skipped'

/** สถานะใบงานที่แปลว่า "จบแล้ว" — ปลายทางของการจบอัตโนมัติเมื่อออกแบบถึงขั้นพร้อม */
export const DONE_JOB_STATUS = 'done'

/** จัดใบงานเข้าแท็บฝ่าย — ตัดใบที่จบ/ถูกข้ามออก คงลำดับเดิมของ jobs ไว้ */
export function groupPoolJobs(
  jobs: PoolJob[],
  finishedStatusValues: readonly string[] = POOL_DONE_STATUSES
): { graphic: PoolJob[]; onsite: PoolJob[] } {
  const finished = new Set(finishedStatusValues)
  const graphic: PoolJob[] = []
  const onsite: PoolJob[] = []
  for (const job of jobs) {
    if (finished.has(job.status)) continue
    if (job.job_type === 'graphic') graphic.push(job)
    else if (job.job_type === 'onsite') onsite.push(job)
  }
  return { graphic, onsite }
}

/** สถานะแรกของใบงาน — อยู่ในพูลรอให้สมาชิกฝ่ายกดรับงาน (seed ไว้ใน job_settings) */
export const AWAITING_CLAIM_STATUS = 'awaiting_claim'

/**
 * ขั้นของช่อง "ออกแบบ" ในตารางภาพรวม (และการ์ดมือถือ):
 * - `not_opened` = ยังไม่มีใบงานกราฟิก (รวมงานเก่าก่อนยุคพูล) → ป้ายเตือน "ยังไม่เปิดใบงาน" เปิดได้จากการ์ด CRM
 * - `awaiting`   = มีใบงานรอรับ → ปุ่มรับงาน
 * - `active`     = รับแล้ว/จบแล้ว/ถูกข้าม → ตัวแก้สถานะออกแบบ
 */
export type DesignCellState = 'not_opened' | 'awaiting' | 'active'

export function designCellState(job: PoolJob | undefined): DesignCellState {
  if (!job) return 'not_opened'
  return job.status === AWAITING_CLAIM_STATUS ? 'awaiting' : 'active'
}

/**
 * ใบงานกราฟิกใบนี้ควรจบอัตโนมัติไหม — จริงเมื่องานออกแบบถึงขั้นพร้อมแล้ว (READY_DESIGN_STATUSES)
 * และใบงานยังไม่จบ/ไม่ถูกข้าม (ใบที่จบแล้วไม่ต้องแตะซ้ำ)
 */
export function shouldFinishGraphicJob(designStatus: string, jobStatus: string): boolean {
  return READY_DESIGN_STATUSES.includes(designStatus) && !POOL_DONE_STATUSES.includes(jobStatus)
}

/**
 * ความพร้อม "ออกแบบ" ต่องาน เมื่อสถานะออกแบบอยู่รายใบงานกราฟิก (เกณฑ์ความพร้อมข้อ 1)
 * — งานจะพร้อมก็ต่อเมื่อมีใบงานกราฟิกอย่างน้อยหนึ่งใบ และ **ทุกใบที่ไม่ถูกข้าม** จบแล้ว
 *   (status 'done' — ใบที่จบไปเพราะออกแบบเสร็จ) หรือสถานะออกแบบของใบนั้นถึงขั้นพร้อม
 * — ใบที่ถูกข้าม ('skipped') ไม่นับ (ข้ามแล้ว = ไม่ต้องออกแบบใบนั้น)
 * — ไม่มีใบงานกราฟิกเลย = ยังไม่เปิดใบงาน → ถือว่ายังขาดออกแบบ (false)
 * คืนค่าเฉพาะงานที่มีใบงานกราฟิก — งานที่ไม่อยู่ใน map ให้ผู้เรียกอ่านเป็น false เอง
 */
export function designReadyByLead(jobs: PoolJob[]): Map<string, boolean> {
  const out = new Map<string, boolean>()
  for (const job of jobs) {
    if (job.job_type !== 'graphic' || !job.crm_lead_id) continue
    if (job.status === SKIPPED_JOB_STATUS) {
      // ใบที่ถูกข้ามไม่ตัดสินอะไร แต่ทำให้ "งานนี้มีใบงานกราฟิกแล้ว"
      if (!out.has(job.crm_lead_id)) out.set(job.crm_lead_id, true)
      continue
    }
    const ready =
      job.status === DONE_JOB_STATUS || READY_DESIGN_STATUSES.includes(job.design_status ?? '')
    out.set(job.crm_lead_id, (out.get(job.crm_lead_id) ?? true) && ready)
  }
  return out
}

// --- ทีมของพูลงาน: แผนกไหนทำอะไรได้ (ตั้งค่าใน /jobs/settings) --------------

/** หมวดใน job_settings ที่เก็บ "แผนกไหนทำอะไรได้" ของพูลงาน */
export type PoolTeamCategory =
  | 'pool_team_graphic'
  | 'pool_team_onsite'
  | 'pool_kit_departments'
  | 'pool_duty_staffing'
  | 'pool_duty_vehicle'
  | 'pool_duty_kits'

export const POOL_TEAM_CATEGORIES: readonly PoolTeamCategory[] = [
  'pool_team_graphic',
  'pool_team_onsite',
  'pool_kit_departments',
  'pool_duty_staffing',
  'pool_duty_vehicle',
  'pool_duty_kits',
]

/** ทีมออกหน้างานตามค่าเริ่มต้น — ใช้ร่วมกันหลายหมวด (ใบงานหน้างาน, กระเป๋า, หน้าที่จัดรถ/จัดกระเป๋า) */
const ONSITE_TEAM_DEFAULT: readonly string[] = ['ทีมออกหน้างาน', 'สตาฟ', 'ช่าง']

/**
 * ค่าเริ่มต้นของแต่ละหมวด — ใช้เมื่อยังไม่มีแถวตั้งค่าใน job_settings เลย
 * (ระบบจึงใช้งานได้ทันทีก่อนแอดมินเข้าไปตั้งค่า)
 */
export const POOL_TEAM_DEFAULTS: Record<PoolTeamCategory, readonly string[]> = {
  pool_team_graphic: ['ฝ่ายออกแบบ'],
  pool_team_onsite: ONSITE_TEAM_DEFAULT,
  pool_kit_departments: ONSITE_TEAM_DEFAULT,
  // หน้าที่เตรียมงาน: จัดคนเป็นของฝ่ายแอดมิน · จัดรถ/จัดกระเป๋าเป็นของทีมออกหน้างาน
  pool_duty_staffing: ['ฝ่ายแอดมิน'],
  pool_duty_vehicle: ONSITE_TEAM_DEFAULT,
  pool_duty_kits: ONSITE_TEAM_DEFAULT,
}

/**
 * ผู้ใช้คนนี้ทำงานกับพูลได้ไหม (รับใบงาน / จองย้ายกระเป๋า) — แอดมินได้เสมอ
 * คนอื่นต้องมีแผนก และแผนกนั้นอยู่ในรายการที่ตั้งค่าไว้ (รายการว่าง = ไม่มีใครนอกแอดมินทำได้)
 */
export function canActOnPool(
  userDepartment: string | null,
  isAdmin: boolean,
  allowedDepartments: string[]
): boolean {
  if (isAdmin) return true
  if (!userDepartment) return false
  return allowedDepartments.includes(userDepartment)
}

// --- หน้าที่เตรียมงาน (Prep duty) ---------------------------------------------

/**
 * สามหน้าที่ย่อยของงานหนึ่งงานที่ต้องมีคนกดรับก่อนถึงแก้ไขได้ในตารางภาพรวม
 * — รับ/คืนแยกกันอิสระ ไม่บังคับลำดับ (CONTEXT.md § หน้าที่เตรียมงาน)
 * คนละสิ่งกับการรับใบงานหน้างาน (หัวหน้างาน) และหน้าที่หน้างานของระบบเงินเดือน
 */
export const PREP_DUTIES = ['staffing', 'vehicle', 'kits'] as const

export type PrepDuty = (typeof PREP_DUTIES)[number]

export const DUTY_LABELS_TH: Record<PrepDuty, string> = {
  staffing: 'จัดคน',
  vehicle: 'จัดรถ',
  kits: 'จัดกระเป๋า',
}

/** หน้าที่ → หมวดใน job_settings ที่บอกว่าแผนกไหนรับหน้าที่นั้นได้ (ครบทุกหน้าที่) */
export const PREP_DUTY_CATEGORY: Record<PrepDuty, PoolTeamCategory> = {
  staffing: 'pool_duty_staffing',
  vehicle: 'pool_duty_vehicle',
  kits: 'pool_duty_kits',
}

/** ค่าที่ส่งมาเป็นหน้าที่เตรียมงานจริงไหม (กันค่าที่ client ส่งมามั่ว) */
export function isPrepDuty(value: string): value is PrepDuty {
  return (PREP_DUTIES as readonly string[]).includes(value)
}

/** การรับหน้าที่หนึ่งครั้ง (หนึ่งแถวใน lead_duty_claims) */
export interface DutyClaim {
  leadId: string
  duty: PrepDuty
  claimedBy: string
}

/** key ของการรับหน้าที่ — งานหนึ่งงานมีได้หน้าที่ละหนึ่งการรับ */
export const dutyKey = (leadId: string, duty: PrepDuty): string => `${leadId}:${duty}`

// --- ปุ่มรับงาน: ใครรับอะไรได้ + คำบนปุ่ม (D1/D7) -----------------------------

/** สิ่งที่ "กดรับ" ได้ในหน้าติดตามงาน — ใบงานกราฟิก/หน้างาน + สามหน้าที่เตรียมงาน */
export type ClaimKind = 'graphic' | 'onsite' | PrepDuty

/** คำบนปุ่มรับตามสิ่งที่รับ — ไม่ใช้ "รับงาน" ลอยๆ (D7) */
export const CLAIM_LABELS: Record<ClaimKind, string> = {
  graphic: 'รับออกแบบ',
  onsite: 'รับเป็นหัวหน้างาน',
  staffing: 'รับจัดคน',
  vehicle: 'รับจัดรถ',
  kits: 'รับจัดกระเป๋า',
}

/** สิ่งที่รับได้ → หมวดใน job_settings ที่บอกว่าแผนกไหนรับได้ */
export const CLAIM_CATEGORY: Record<ClaimKind, PoolTeamCategory> = {
  graphic: 'pool_team_graphic',
  onsite: 'pool_team_onsite',
  ...PREP_DUTY_CATEGORY,
}

/** แผนกที่รับได้ของแต่ละสิ่ง (job_settings; ยังไม่ตั้งค่า = ค่าเริ่มต้นของหมวดนั้น) */
export type PoolDepartments = Record<ClaimKind, string[]>

/** ผลการตรวจสิทธิ์ของปุ่มรับหนึ่งปุ่ม */
export interface ClaimGate {
  /** กดได้ไหม — ไม่ได้ = ป้ายจาง ไม่มี onClick (D1) */
  allowed: boolean
  /** ข้อความบนป้ายจาง เช่น "รอฝ่ายออกแบบรับ" */
  waitingFor: string
}

/**
 * ผู้ใช้คนนี้กดรับสิ่งนี้ได้ไหม (D1) — แอดมินได้เสมอ คนอื่นต้องอยู่แผนกที่ตั้งไว้
 * หลายแผนกคั่นด้วย " / " · ไม่มีแผนกไหนรับได้เลย = รอแอดมินรับ
 */
export function claimGate(
  kind: ClaimKind,
  myDepartment: string | null,
  isAdmin: boolean,
  poolDepartments: PoolDepartments
): ClaimGate {
  const departments = poolDepartments[kind] ?? []
  return {
    allowed: canActOnPool(myDepartment, isAdmin, departments),
    waitingFor: departments.length > 0 ? `รอ${departments.join(' / ')}รับ` : 'รอแอดมินรับ',
  }
}

/** สิ่งที่ตั้งไม่ต้องจัดได้ → สิ่งที่กดรับของเรื่องนั้น (ใช้หาแผนกที่ตั้ง/ยกเลิกไม่ต้องจัดได้) */
export const WAIVER_CLAIM_KIND: Record<WaivableItem, ClaimKind> = {
  design: 'graphic',
  staff: 'staffing',
  vehicle: 'vehicle',
  kits: 'kits',
}

/** สิ่งที่กดรับ → สิ่งที่ตั้งไม่ต้องจัดได้ (หัวหน้างานไม่มี) */
export const CLAIM_WAIVER_ITEM: Partial<Record<ClaimKind, WaivableItem>> = {
  graphic: 'design',
  staffing: 'staff',
  vehicle: 'vehicle',
  kits: 'kits',
}

/** สิ่งที่กดรับนี้ของงานนี้ถูกตั้งว่าไม่ต้องจัดไหม */
export function isClaimWaived(lead: TrackingLead, kind: ClaimKind): boolean {
  const item = CLAIM_WAIVER_ITEM[kind]
  return !!item && (lead.waived ?? []).includes(item)
}

/**
 * ตั้ง/ยกเลิก "ไม่ต้องจัด" ได้ไหม — แอดมิน, แอดมิน/ฝ่ายประสานงาน (pool manager)
 * หรือคนในแผนกที่รับเรื่องนั้นได้ (`departments` = แผนกของ CLAIM_CATEGORY[WAIVER_CLAIM_KIND[item]])
 */
export function canWaive(
  myDepartment: string | null,
  isAdmin: boolean,
  isPoolManager: boolean,
  departments: string[]
): boolean {
  return isPoolManager || canActOnPool(myDepartment, isAdmin, departments)
}

/** ปุ่มรับหนึ่งปุ่มในชุดที่มองเห็น — `date` = วันงาน (null = ยังไม่กำหนดวัน) */
export interface ClaimCandidate {
  key: string
  kind: ClaimKind
  date: string | null
}

/**
 * ปุ่มที่ควร "เรืองแสง" — ใกล้วันงานที่สุดของแต่ละคอลัมน์/หน้าที่ คอลัมน์ละหนึ่งปุ่ม
 * งานที่ยังไม่กำหนดวันไม่ถูกเลือก · วันเท่ากัน = ตัวที่มาก่อนในรายการ (ที่เหลือเป็นปุ่มนิ่ง)
 */
export function emphasizedClaims(candidates: ClaimCandidate[]): Set<string> {
  const best = new Map<ClaimKind, { key: string; date: string }>()
  for (const c of candidates) {
    if (!c.date) continue
    const current = best.get(c.kind)
    if (!current || c.date < current.date) best.set(c.kind, { key: c.key, date: c.date })
  }
  return new Set([...best.values()].map((b) => b.key))
}

// --- optimistic: ทับค่าที่เพิ่งกด "รับ/คืน" จนกว่าข้อมูลจาก server จะตามมา ------

/**
 * สถานะชั่วคราวของใบงานที่เพิ่งกดรับ — สถานะจริงตั้งค่าไว้ใน job_settings
 * จึงยังไม่รู้จนกว่า server จะตอบ (ขอแค่ "ไม่ใช่รอรับงาน" ช่องจะได้เปลี่ยนทันที)
 */
export const CLAIMING_STATUS = 'claiming'
export const CLAIMING_STATUS_LABEL = 'กำลังรับงาน…'

/** ค่าที่อยากให้ใบงานเป็นทันทีหลังกด — รับ = มี claimed_by · คืน = null */
export interface ClaimDraft {
  status: string
  claimed_by: string | null
}

/** draft ต่อ jobId */
export type ClaimDraftMap = Record<string, ClaimDraft>

/** draft ต่อ dutyKey — null = เพิ่งกดคืนหน้าที่ */
export type DutyDraftMap = Record<string, DutyClaim | null>

/** server ตามทัน draft ของใบงานนี้แล้วหรือยัง (ใบงานหลุดจากชุด = ไม่ต้องทับต่อ) */
function claimDraftSettled(job: PoolJob | undefined, draft: ClaimDraft): boolean {
  if (!job) return true
  return draft.claimed_by
    ? job.claimed_by === draft.claimed_by && job.status !== AWAITING_CLAIM_STATUS
    : job.claimed_by === null && job.status === AWAITING_CLAIM_STATUS
}

/** ทับใบงานด้วย draft ที่ยังรอ server อยู่ — draft ที่ตามทันแล้วไม่มีผล */
export function applyClaimDraft(jobs: PoolJob[], draft: ClaimDraftMap): PoolJob[] {
  if (Object.keys(draft).length === 0) return jobs
  return jobs.map((job) => {
    const d = draft[job.id]
    if (!d || claimDraftSettled(job, d)) return job
    const assigned_to = d.claimed_by
      ? [...new Set([...job.assigned_to, d.claimed_by])]
      : job.assigned_to.filter((id) => id !== job.claimed_by)
    return { ...job, status: d.status, claimed_by: d.claimed_by, assigned_to }
  })
}

/** เหลือเฉพาะ draft ที่ยังรอ server — เรียกตอนข้อมูลชุดใหม่มาถึง (ไม่มีอะไรตกก็คืนตัวเดิม) */
export function pruneClaimDraft(jobs: PoolJob[], draft: ClaimDraftMap): ClaimDraftMap {
  const byId = new Map(jobs.map((j) => [j.id, j]))
  const kept = Object.entries(draft).filter(([id, d]) => !claimDraftSettled(byId.get(id), d))
  return kept.length === Object.keys(draft).length ? draft : Object.fromEntries(kept)
}

/** server ตามทัน draft ของหน้าที่นี้แล้วหรือยัง */
function dutyDraftSettled(claims: Map<string, DutyClaim>, key: string, draft: DutyClaim | null): boolean {
  const current = claims.get(key)
  return draft ? current?.claimedBy === draft.claimedBy : current === undefined
}

/** ทับการรับหน้าที่ด้วย draft ที่ยังรอ server อยู่ — ของเดิมคงลำดับ ของใหม่ต่อท้าย */
export function applyDutyDraft(claims: DutyClaim[], draft: DutyDraftMap): DutyClaim[] {
  if (Object.keys(draft).length === 0) return claims
  const original = new Map(claims.map((c) => [dutyKey(c.leadId, c.duty), c]))
  const next = new Map(original)
  for (const [key, value] of Object.entries(draft)) {
    if (dutyDraftSettled(original, key, value)) continue
    if (value) next.set(key, value)
    else next.delete(key)
  }
  return [...next.values()]
}

/** เหลือเฉพาะ draft ของหน้าที่ที่ยังรอ server (ไม่มีอะไรตกก็คืนตัวเดิม) */
export function pruneDutyDraft(claims: DutyClaim[], draft: DutyDraftMap): DutyDraftMap {
  const byKey = new Map(claims.map((c) => [dutyKey(c.leadId, c.duty), c]))
  const kept = Object.entries(draft).filter(([key, value]) => !dutyDraftSettled(byKey, key, value))
  return kept.length === Object.keys(draft).length ? draft : Object.fromEntries(kept)
}

// --- จองกระเป๋า: กติกาชนรายวัน (ADR-0003) -------------------------------------

/** กระเป๋าหนึ่งใบ — ตัวเลือกในกล่องจอง และหนึ่งเลนในไทม์ไลน์ */
export interface Kit {
  id: string
  name: string
}

/** การจองกระเป๋าหนึ่งครั้ง — กระเป๋าใบหนึ่งกับอีเวนต์หนึ่ง (วันของอีเวนต์ YYYY-MM-DD) */
export interface KitBooking {
  kitId: string
  eventId: string
  eventDate: string | null
  /** เวลาเปิด–ปิดของอีเวนต์ (HH:mm) — ไม่มี = เทียบเวลาไม่ได้ */
  eventTime?: string | null
  eventEndTime?: string | null
}

/** การจองหนึ่งครั้งพร้อมข้อมูลอีเวนต์ที่ join มาแล้ว — ที่การ์ดใบงานและเลนกระเป๋าใช้ */
export interface KitBookingDetail extends KitBooking {
  eventName: string
  /** งานที่อีเวนต์นี้ผูกอยู่ — null = อีเวนต์ที่ไม่ได้มาจาก CRM */
  leadId: string | null
  /** จัดกระเป๋าครบแล้ว (packed_at ไม่ว่าง) */
  packed: boolean
}

/** ข้อมูลกระเป๋าของงานหนึ่ง เท่าที่เกณฑ์ความพร้อมข้อ 5 ต้องใช้ */
export interface KitReadiness {
  /** ใบงานหน้างานของงานนี้ถูกข้าม — งานที่ไม่ออกหน้างานไม่ต้องใช้กระเป๋า */
  onsiteSkipped: boolean
  /** การจองกระเป๋าทุกใบของงานนี้ — [] = ยังไม่จองเลย */
  bookings: { packed: boolean }[]
}

/**
 * ขาด "กระเป๋า" ไหม — ยังไม่จองเลย หรือจองแล้วแต่ยังจัดไม่ครบทุกใบ
 * ใบงานหน้างานที่ถูกข้ามแล้วไม่นับข้อนี้ (ADR-0003)
 */
export function isMissingKits(kit: KitReadiness): boolean {
  if (kit.onsiteSkipped) return false
  return kit.bookings.length === 0 || kit.bookings.some((b) => !b.packed)
}

/**
 * ข้อมูลกระเป๋าต่องาน สำหรับเกณฑ์ความพร้อมข้อ 5 — คิดจากใบงานหน้างาน (ถูกข้ามหรือยัง)
 * + การจองกระเป๋าของอีเวนต์ที่ผูกกับงานนั้น · ทุกงานใน `leads` มีค่าเสมอ (ไม่จองเลย = bookings [])
 */
export function kitReadinessByLead(
  leads: TrackingLead[],
  jobs: PoolJob[],
  bookings: KitBookingDetail[],
  skippedStatus: string = SKIPPED_JOB_STATUS
): Map<string, KitReadiness> {
  const skipped = new Set(
    jobs
      .filter((j) => j.job_type === 'onsite' && j.status === skippedStatus && j.crm_lead_id)
      .map((j) => j.crm_lead_id as string)
  )
  const out = new Map<string, KitReadiness>()
  for (const lead of leads) {
    out.set(lead.id, {
      onsiteSkipped: skipped.has(lead.id),
      bookings: bookings.filter((b) => b.leadId === lead.id).map((b) => ({ packed: b.packed })),
    })
  }
  return out
}

/** สถานะของการจองกระเป๋าใบเดียวกันวันเดียวกัน: ชน (เวลาทับ) / ต่อคิว (เวลาไม่ทับ) / เช็คเวลาไม่ได้ (ขาดเวลา) */
export type KitClashStatus = 'conflict' | 'queued' | 'unknown'
export interface KitClash {
  eventId: string
  status: KitClashStatus
}

const minutesOf = (t: string): number => {
  const [h, m] = t.slice(0, 5).split(':').map(Number)
  return h * 60 + m
}

/**
 * ช่วงเวลาของอีเวนต์เป็นนาที [เริ่ม, จบ) — ขาดเวลาใดเวลาหนึ่ง = null
 * ponytail: จบก่อน/เท่าเริ่ม (งานข้ามเที่ยงคืน) ยืดถึง 24:00 ของวันงาน ไม่คิดส่วนที่ล้นไปวันถัดไป
 */
function kitWindow(b: KitBooking): [number, number] | null {
  if (!b.eventTime || !b.eventEndTime) return null
  const start = minutesOf(b.eventTime)
  const end = minutesOf(b.eventEndTime)
  return [start, end <= start ? 24 * 60 : end]
}

/**
 * การจองอื่นของกระเป๋าใบเดียวกันในวันเดียวกัน พร้อมสถานะเวลา (กติกาเดียวกับคน/รถ: เวลาทับ = ชน, จบตรงเริ่มพอดี = ต่อคิว)
 * ใช้ "เตือน" เท่านั้น ไม่บล็อกการจอง · จองซ้ำอีเวนต์เดิม = ไม่นับ · ไม่รู้วันงาน = เทียบไม่ได้ → ไม่นับ
 * คืน eventId ไม่ซ้ำ ตามลำดับที่เจอใน bookings
 */
export function kitBookingClashes(bookings: KitBooking[], candidate: KitBooking): KitClash[] {
  if (!candidate.eventDate) return []
  const day = candidate.eventDate.slice(0, 10)
  const mine = kitWindow(candidate)
  const out: KitClash[] = []
  for (const b of bookings) {
    if (b.kitId !== candidate.kitId) continue
    if (b.eventId === candidate.eventId) continue
    if (!b.eventDate || b.eventDate.slice(0, 10) !== day) continue
    if (out.some((c) => c.eventId === b.eventId)) continue
    const other = kitWindow(b)
    const status: KitClashStatus =
      !mine || !other ? 'unknown' : mine[0] < other[1] && other[0] < mine[1] ? 'conflict' : 'queued'
    out.push({ eventId: b.eventId, status })
  }
  return out
}

/** eventId ที่ต้องเตือนบนไทม์ไลน์ — ชน หรือเช็คเวลาไม่ได้ (ต่อคิวไม่นับ) */
export function kitBookingConflict(bookings: KitBooking[], candidate: KitBooking): string[] {
  return kitBookingClashes(bookings, candidate)
    .filter((c) => c.status !== 'queued')
    .map((c) => c.eventId)
}

/**
 * kits.event_id = "ตอนนี้กระเป๋าอยู่กับงานไหน" — อีเวนต์ที่ยังไม่ปิดซึ่งวัน/เวลาเร็วที่สุดในการจองของกระเป๋าใบนั้น
 * ไม่มีการจองที่ยังไม่ปิด = null (กระเป๋าว่าง)
 */
export function pickKitPointer(
  bookings: { eventId: string; eventDate: string | null; eventTime?: string | null; closed: boolean }[]
): string | null {
  const key = (b: { eventDate: string | null; eventTime?: string | null }) =>
    `${b.eventDate?.slice(0, 10) ?? '9999-99-99'} ${b.eventTime?.slice(0, 5) ?? '99:99'}`
  const open = bookings.filter((b) => !b.closed).sort((a, b) => key(a).localeCompare(key(b)))
  return open[0]?.eventId ?? null
}

/** วันจัดงานที่ใกล้ที่สุดหลัง fromDate (ไม่รวมวันนั้น) — null เมื่อไม่มีงานข้างหน้า */
export function nextJobDate(leads: TrackingLead[], fromDate: string): string | null {
  let best: string | null = null
  for (const lead of leads) {
    const date = lead.event_date
    if (!date || date <= fromDate) continue
    if (!best || date < best) best = date
  }
  return best
}

// --- แถบ "ของฉัน" ในแท็บภาพรวม (เฟส 3) ----------------------------------------

/** หนึ่งบรรทัดในแถบ "ของฉัน" — หนึ่งจุดที่รับได้/รับไว้แล้วของงานหนึ่งงาน */
export interface MyQueueItem {
  leadId: string
  kind: ClaimKind
  /** ใบงานที่กดรับ (กราฟิก/หน้างาน) — หน้าที่เตรียมงานไม่มีใบงาน */
  jobId?: string
  date: string | null
  customer: string
  /** สิ่งที่ยังขาดของจุดนี้ (ป้ายพร้อมแสดง) — ว่าง = ไม่ขาดอะไร */
  missing: string[]
}

/** สิ่งที่ยังขาดที่ "ตรงกับ" จุดที่รับ — หัวหน้างานดูแลทั้งงาน (null) จึงเห็นทุกข้อ */
const CLAIM_MISSING: Record<ClaimKind, MissingItem | null> = {
  graphic: 'design',
  onsite: null,
  staffing: 'staff',
  vehicle: 'vehicle',
  kits: 'kits',
}

/** เรียงวันงานใกล้สุดก่อน (ยังไม่กำหนดวันไว้ท้ายสุด) แล้วชื่อลูกค้า */
function compareQueue(a: MyQueueItem, b: MyQueueItem): number {
  if (a.date !== b.date) {
    if (!a.date) return 1
    if (!b.date) return -1
    return a.date < b.date ? -1 : 1
  }
  return a.customer.localeCompare(b.customer, 'th')
}

/**
 * แถบ "ของฉัน" ของแท็บภาพรวม:
 * - `mine` = หน้าที่ที่ฉันเป็นผู้รับ + ใบงานที่ฉันเป็นผู้รับหรืออยู่ในทีม และยังไม่จบ/ไม่ถูกข้าม
 * - `claimable` = ใบงานที่รอรับ + หน้าที่ที่ยังไม่มีผู้รับ ซึ่งแผนกฉันรับได้ (claimGate) และงานยังไม่ผ่าน
 * ใบงานของงานที่ไม่อยู่ใน `leads` (ถูกกรองออก เช่น งานเก่า) ไม่เข้าทั้งสองกลุ่ม
 */
export function myQueue({
  leads,
  jobs,
  dutyClaims,
  currentUserId,
  myDepartment,
  isAdmin,
  poolDepartments,
  today,
  kitReadiness,
  designReady,
  roleLabels = {},
}: {
  leads: TrackingLead[]
  jobs: PoolJob[]
  dutyClaims: DutyClaim[]
  currentUserId: string | null
  myDepartment: string | null
  isAdmin: boolean
  poolDepartments: PoolDepartments
  today: Date
  kitReadiness?: Map<string, KitReadiness>
  designReady?: Map<string, boolean>
  roleLabels?: Record<string, string>
}): { mine: MyQueueItem[]; claimable: MyQueueItem[] } {
  const byId = new Map(leads.map((l) => [l.id, l]))
  const mine: MyQueueItem[] = []
  const claimable: MyQueueItem[] = []

  const itemOf = (lead: TrackingLead, kind: ClaimKind, jobId?: string): MyQueueItem => {
    const all = getMissing(lead, kitReadiness?.get(lead.id), designReady?.get(lead.id))
    const only = CLAIM_MISSING[kind]
    const item: MyQueueItem = {
      leadId: lead.id,
      kind,
      date: lead.event_date,
      customer: lead.customer_name || 'ไม่ระบุลูกค้า',
      missing: (only ? all.filter((m) => m === only) : all).map((m) => missingLabel(m, lead, roleLabels)),
    }
    if (jobId !== undefined) item.jobId = jobId
    return item
  }

  const canClaim = (kind: ClaimKind) => claimGate(kind, myDepartment, isAdmin, poolDepartments).allowed

  for (const job of jobs) {
    const lead = job.crm_lead_id ? byId.get(job.crm_lead_id) : undefined
    if (!lead || POOL_DONE_STATUSES.includes(job.status)) continue
    if (job.job_type !== 'graphic' && job.job_type !== 'onsite') continue
    const kind: ClaimKind = job.job_type
    if (currentUserId && (job.claimed_by === currentUserId || job.assigned_to.includes(currentUserId))) {
      mine.push(itemOf(lead, kind, job.id))
    } else if (
      job.status === AWAITING_CLAIM_STATUS &&
      canClaim(kind) &&
      !isPast(lead, today) &&
      !isClaimWaived(lead, kind)
    ) {
      claimable.push(itemOf(lead, kind, job.id))
    }
  }

  const claimByDuty = new Map(dutyClaims.map((c) => [dutyKey(c.leadId, c.duty), c]))
  for (const lead of leads) {
    for (const duty of PREP_DUTIES) {
      const claim = claimByDuty.get(dutyKey(lead.id, duty))
      if (claim) {
        if (currentUserId && claim.claimedBy === currentUserId) mine.push(itemOf(lead, duty))
      } else if (canClaim(duty) && !isPast(lead, today) && !isClaimWaived(lead, duty)) {
        claimable.push(itemOf(lead, duty))
      }
    }
  }

  return { mine: mine.sort(compareQueue), claimable: claimable.sort(compareQueue) }
}

/** หนึ่งงานในแถบ "ของฉัน" — รวมทุกจุด (จัดรถ + กระเป๋า …) ของงานเดียวกันไว้แถวเดียว */
export interface MyQueueGroup {
  leadId: string
  date: string | null
  customer: string
  items: MyQueueItem[]
}

/** จัดกลุ่มรายการตามงาน — ลำดับกลุ่มตามที่พบครั้งแรก (รายการเรียงวันมาแล้ว กลุ่มจึงเรียงวันด้วย) */
export function groupQueueByLead(items: MyQueueItem[]): MyQueueGroup[] {
  const groups = new Map<string, MyQueueGroup>()
  for (const item of items) {
    const g = groups.get(item.leadId)
    if (g) g.items.push(item)
    else groups.set(item.leadId, { leadId: item.leadId, date: item.date, customer: item.customer, items: [item] })
  }
  return [...groups.values()]
}
