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
  tracking_checklist: string[] // may contain vehicle keys 'car_triton' | 'car_champ'
  /** อีเวนต์ที่ผูกกับงานนี้ (ไม่รวมที่ปิดแล้ว) — ที่สำหรับจัดคน */
  events: { id: string; name: string; event_date: string | null; status: string | null }[]
  /** คนที่จัดแล้ว รวมทุกอีเวนต์ของงาน — event_id บอกว่าอยู่ในชุดของอีเวนต์ไหน */
  staff: { user_id: string; name: string; nickname: string | null; role: string; event_id: string }[]
}

export const VEHICLES = [
  { key: 'car_triton', label: 'Mitsubishi Triton' },
  { key: 'car_champ', label: 'Toyota Champ' },
] as const

export const READY_DESIGN_STATUSES = ['sent_email_cf', 'completed']

export type MissingItem = 'design' | 'staff' | 'vehicle' | 'time'

export const MISSING_LABELS: Record<MissingItem, string> = {
  design: 'ออกแบบ',
  staff: 'จัดคน',
  vehicle: 'จัดรถ',
  time: 'เวลาเริ่ม',
}

export function getMissing(lead: TrackingLead): MissingItem[] {
  const missing: MissingItem[] = []
  if (!READY_DESIGN_STATUSES.includes(lead.design_status)) missing.push('design')
  if (lead.staff.length < 1) missing.push('staff')
  if (!VEHICLES.some((v) => lead.tracking_checklist.includes(v.key))) missing.push('vehicle')
  if (!lead.event_time) missing.push('time')
  return missing
}

export function isReady(lead: TrackingLead): boolean {
  return getMissing(lead).length === 0
}

/** YYYY-MM-DD → Date เที่ยงคืนเวลาท้องถิ่น (new Date('YYYY-MM-DD') จะได้ UTC — อย่าใช้) */
export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
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

export function chipCounts(
  leads: TrackingLead[],
  today: Date
): Record<Chip, { total: number; notReady: number }> {
  const counts: Record<Chip, { total: number; notReady: number }> = {
    today: { total: 0, notReady: 0 },
    week7: { total: 0, notReady: 0 },
    month: { total: 0, notReady: 0 },
  }
  for (const lead of leads) {
    const ready = isReady(lead)
    for (const chip of ['today', 'week7', 'month'] as Chip[]) {
      if (!inChip(lead, chip, today)) continue
      counts[chip].total++
      if (!ready) counts[chip].notReady++
    }
  }
  return counts
}

export function isUrgent(lead: TrackingLead, today: Date): boolean {
  if (!lead.event_date) return false
  return !isReady(lead) && daysUntil(lead.event_date, today) <= 7
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

/** how two date-overlapping leads clash in time: 'conflict' (overlap), 'queued' (same day, no overlap), 'unknown' (a time is missing). */
export function timeStatus(a: TrackingLead, b: TrackingLead): 'conflict' | 'queued' | 'unknown' {
  if (!dateRangesOverlap(a, b)) return 'queued'
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
  /** ตำแหน่งในงาน — เฉพาะเลนคน */
  role?: string
  startMin: number
  endMin: number
  timing: BarTiming
  layer: number
  colorIdx: number
  conflict: boolean
  /** เฉพาะเลนงาน: ยังไม่จัดทั้งคนและรถ */
  unassigned: boolean
}

export type LaneKind = 'jobs' | 'vehicle' | 'person'

export interface Lane {
  kind: LaneKind
  key: string
  label: string
  /** แผนก — เฉพาะเลนคน */
  sublabel?: string
  bars: Bar[]
  layers: number
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

/** คนเรียงตามกลุ่มแผนก (ไม่ระบุแผนกท้ายสุด) แล้วชื่อ */
function sortPeople(people: Person[]): Person[] {
  return [...people].sort(
    (a, b) =>
      departmentRank(a.department) - departmentRank(b.department) ||
      personLabel(a).localeCompare(personLabel(b), 'th')
  )
}

/** ตำแหน่งทุกตำแหน่งที่คนนี้ถูกจัดไว้ในงานนี้ */
function rolesOf(lead: TrackingLead, personId: string, roleLabels: Record<string, string>): string[] {
  return lead.staff.filter((s) => s.user_id === personId).map((s) => roleLabels[s.role] || s.role)
}

function leadLabel(lead: TrackingLead): string {
  return lead.customer_name || NO_CUSTOMER_LABEL
}

/**
 * เลนและแถบงานของหนึ่งวัน: เลนงาน → เลนรถ (ตาม VEHICLES) → เลนคน (ตามแผนก แล้วชื่อ).
 * ตำแหน่ง (นาทีจาก 00:00), ชั้นซ้อน, สี, ธงชน, ธงยังไม่จัด คำนวณให้ครบ — UI แค่ map เป็น div.
 */
export function layoutDay(
  leads: TrackingLead[],
  date: string,
  people: Person[],
  roleLabels: Record<string, string>,
  opts?: { hideFree?: boolean }
): DayLayout {
  const onDate = leadsOnDate(leads, date)
  const byId = new Map(onDate.map((l) => [l.id, l]))
  const colorByLead: Record<string, number> = {}
  onDate.forEach((lead, i) => {
    colorByLead[lead.id] = i % BAR_COLORS
  })
  const hourStart = hourStartFor(onDate, date)

  const makeBar = (lead: TrackingLead, extra: { role?: string; unassigned?: boolean } = {}): Bar => {
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

  for (const person of sortPeople(people)) {
    const bars: Bar[] = []
    for (const lead of onDate) {
      for (const role of rolesOf(lead, person.id, roleLabels)) bars.push(makeBar(lead, { role }))
    }
    if (opts?.hideFree && bars.length === 0) continue
    markConflicts(bars, byId)
    lanes.push({
      kind: 'person',
      key: person.id,
      label: personLabel(person),
      sublabel: person.department ?? NO_DEPARTMENT_LABEL,
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
  opts?: { hideFree?: boolean }
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

  const lanes: WeekLane[] = [
    { kind: 'jobs', key: 'jobs', label: 'งาน', cells: buildCells(() => true, () => undefined, false) },
    ...VEHICLES.map((vehicle) => ({
      kind: 'vehicle' as const,
      key: vehicle.key as string,
      label: vehicle.label as string,
      cells: buildCells((lead) => vehicleOf(lead) === vehicle.key, () => undefined, true),
    })),
  ]

  for (const person of sortPeople(people)) {
    const cells = buildCells(
      (lead) => lead.staff.some((s) => s.user_id === person.id),
      (lead) => rolesOf(lead, person.id, roleLabels)[0],
      true
    )
    if (opts?.hideFree && days.every((day) => cells[day].length === 0)) continue
    lanes.push({
      kind: 'person',
      key: person.id,
      label: personLabel(person),
      sublabel: person.department ?? NO_DEPARTMENT_LABEL,
      cells,
    })
  }

  return { days, lanes, colorByLead }
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
