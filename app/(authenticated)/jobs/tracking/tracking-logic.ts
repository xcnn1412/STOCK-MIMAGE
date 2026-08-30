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

function parseDate(dateStr: string): Date {
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
