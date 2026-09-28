// ============================================================================
// สรุปค่าคอมแอดมิน — ตัวคำนวณ pure (ไม่มี React / IO / new Date() แบบไม่รับพารามิเตอร์)
// กติกาการนับล็อกไว้ใน docs/specs/admin-commission.md — แก้กติกาต้องแก้ spec ด้วย
// ตรวจ: npx tsx scripts/commission-check.ts
// วันที่ทั้งหมดคำนวณด้วย Date.UTC เท่านั้น (ไม่พึ่งโซนเวลาของเครื่องที่รัน)
// ============================================================================

// ponytail: วันตัดรอบเป็นค่าคงที่ (ตรงกับตัวนับถอยหลังของ Sales Board) — ย้ายไป app_settings เมื่อมีคนขอเปลี่ยนจริง
export const COMMISSION_CUTOFF_DAY = 25

// ── ชนิดข้อมูล ──
export type StatusActivity = {
  lead_id: string
  created_at: string
  new_status: string | null
  activity_type?: string | null // ถ้าส่งมา ต้องเป็น 'status_change' เท่านั้นถึงจะนับ
}

export type CommissionLead = {
  id: string
  status: string | null
  customer_name: string | null
  customer_line: string | null
  event_date: string | null
  event_end_date: string | null
  work_type: string | null
  unit_count: number | null
  quotation_ref: string | null
  created_at: string
}

export type Row = {
  no: number
  leadId: string
  lockDate: string       // YYYY-MM-DD เวลาไทย
  units: number          // ตู้ = unit_count (ว่าง/≤0 = 1) · อีเวนต์ = 1
  eventDate: string | null
  eventEndDate: string | null
  customer: string       // customer_line ที่ trim แล้ว ถ้าว่างใช้ customer_name
  quotationRef: string | null
  status: string         // ค่าดิบจาก crm_leads.status (view แปลงเป็นป้ายไทยเอง)
}

export type WarningCode =
  | 'no_work_type' | 'no_event_date' | 'end_before_start'
  | 'no_quotation_ref' | 'dup_quotation_ref' | 'possible_duplicate' | 'no_history'

export type Warning = { code: WarningCode; leadId: string; customer: string; detail: string }

export type CommissionResult = {
  booths: Row[]
  events: Row[]
  unclassified: Row[]
  boothUnits: number
  eventCount: number
  warnings: Warning[]
}

export type CommissionTargets = { booths?: number | null; events?: number | null }
export type DateRange = { from: string; to: string }

// ── สถานะ ──
// "ตอบรับแล้ว" = ทุกสถานะที่ไม่อยู่ในรายการนี้ (สถานะใหม่ที่เพิ่มใน kanban ภายหลังถือเป็น won อัตโนมัติ)
const NOT_WON = new Set(['lead', 'booking', 'following_up', 'quotation_sent', 'rejected', 'cancelled'])

export function isWonStatus(status: string | null | undefined): boolean {
  const s = (status || '').trim().toLowerCase()
  return s !== '' && !NOT_WON.has(s)
}

// ── วันที่ ──
const BKK_OFFSET_MS = 7 * 3_600_000
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** timestamptz → 'YYYY-MM-DD' เวลาไทย (UTC+7 ไม่มี DST) */
export function bangkokDay(iso: string): string {
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return (iso || '').slice(0, 10)
  return ymd(ms + BKK_OFFSET_MS)
}

/** งวดของเดือน 'YYYY-MM' = วันที่ 26 ของเดือนก่อน → วันที่ 25 ของเดือนนั้น (รูปแบบผิด = null) */
export function commissionPeriod(month: string): { from: string; to: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(month || '')
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2])
  if (mo < 1 || mo > 12) return null
  return {
    from: ymd(Date.UTC(y, mo - 2, COMMISSION_CUTOFF_DAY + 1)),
    to: ymd(Date.UTC(y, mo - 1, COMMISSION_CUTOFF_DAY)),
  }
}

/** งวดที่ครอบวันนี้ (today = 'YYYY-MM-DD') — วันที่ > 25 = งวดของเดือนถัดไป */
export function defaultPeriodMonth(today: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today || '')
  if (!m) return (today || '').slice(0, 7)
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  return ymd(Date.UTC(y, mo - 1 + (d > COMMISSION_CUTOFF_DAY ? 1 : 0), 1)).slice(0, 7)
}

/** เลื่อนเดือน 'YYYY-MM' ไป delta เดือน */
export function shiftMonth(month: string, delta: number): string {
  const [y, mo] = month.split('-').map(Number)
  return ymd(Date.UTC(y, mo - 1 + delta, 1)).slice(0, 7)
}

// ── วันล็อคคิว ──
/** lead_id → วันล็อคคิว = วันที่ (เวลาไทย) ของ status_change → won ครั้งแรกสุด ไม่สนลำดับของ input */
export function buildLockDates(activities: StatusActivity[]): Map<string, string> {
  const earliest = new Map<string, number>()
  for (const a of activities) {
    if (!a || !a.lead_id) continue
    if (a.activity_type != null && a.activity_type !== 'status_change') continue
    if (!isWonStatus(a.new_status)) continue
    const ms = Date.parse(a.created_at)
    if (Number.isNaN(ms)) continue
    const prev = earliest.get(a.lead_id)
    if (prev === undefined || ms < prev) earliest.set(a.lead_id, ms)
  }
  const out = new Map<string, string>()
  for (const [id, ms] of earliest) out.set(id, ymd(ms + BKK_OFFSET_MS))
  return out
}

// ── ตัวนับหลัก ──
const clean = (s: string | null | undefined) => (s || '').trim()
const customerOf = (l: CommissionLead) => clean(l.customer_line) || clean(l.customer_name) || '(ไม่ระบุชื่อ)'
const boothUnitsOf = (n: number | null | undefined) => {
  const v = Number(n)
  return Number.isFinite(v) && v >= 1 ? Math.floor(v) : 1
}

// เรียง: วันล็อคคิว → วันจัดงาน (ไม่มีวันไว้ท้าย) → ชื่อลูกค้า
function sortRows(rows: Row[]): Row[] {
  rows.sort((a, b) =>
    a.lockDate.localeCompare(b.lockDate)
    || (a.eventDate || '9999-99-99').localeCompare(b.eventDate || '9999-99-99')
    || a.customer.localeCompare(b.customer, 'th'))
  rows.forEach((r, i) => { r.no = i + 1 })
  return rows
}

export function buildCommission(input: {
  leads: CommissionLead[]; lockDates: Map<string, string>; from: string; to: string
}): CommissionResult {
  const { leads, lockDates, from, to } = input
  const booths: Row[] = [], events: Row[] = [], unclassified: Row[] = []
  const noHistory = new Set<string>()

  for (const l of leads) {
    if (!isWonStatus(l.status)) continue // สถานะปัจจุบันต้องเป็น won
    const wt = clean(l.work_type).toLowerCase()
    if (wt === 'gp') continue // GP ไม่อยู่ในเป้า ไม่แสดง ไม่นับ
    let lockDate = lockDates.get(l.id)
    if (!lockDate) { lockDate = bangkokDay(l.created_at); noHistory.add(l.id) }
    if (lockDate < from || lockDate > to) continue // นับทั้งสองปลาย

    const row: Row = {
      no: 0, leadId: l.id, lockDate,
      units: wt === 'sale' ? boothUnitsOf(l.unit_count) : 1,
      eventDate: l.event_date || null, eventEndDate: l.event_end_date || null,
      customer: customerOf(l), quotationRef: clean(l.quotation_ref) || null, status: l.status || '',
    }
    if (wt === 'sale') booths.push(row)
    else if (wt === 'event') events.push(row)
    else unclassified.push(row)
  }
  sortRows(booths); sortRows(events); sortRows(unclassified)

  // ── คำเตือน (ไล่ตามลำดับแถวที่แสดง) ──
  const warnings: Warning[] = []
  const warn = (code: WarningCode, r: Row, detail: string) =>
    warnings.push({ code, leadId: r.leadId, customer: r.customer, detail })
  const all = [...booths, ...events, ...unclassified]

  for (const r of unclassified) warn('no_work_type', r, 'ยังไม่ระบุประเภทงาน (ขาย/อีเวนต์) — ไม่ถูกนับ')
  for (const r of events) if (!r.eventDate) warn('no_event_date', r, 'งานอีเวนต์ที่ยังไม่มีวันจัดงาน')
  for (const r of all) {
    if (r.eventDate && r.eventEndDate && r.eventEndDate < r.eventDate)
      warn('end_before_start', r, `วันสิ้นสุด ${r.eventEndDate} อยู่ก่อนวันเริ่ม ${r.eventDate}`)
  }
  for (const r of all) if (!r.quotationRef) warn('no_quotation_ref', r, 'ยังไม่มีเลขใบเสนอราคา')

  // เลขใบเสนอราคาซ้ำ (trim + ไม่สนตัวพิมพ์) ในแถวของงวด
  const byRef = new Map<string, Row[]>()
  for (const r of all) {
    if (!r.quotationRef) continue
    const k = r.quotationRef.toLowerCase()
    byRef.set(k, [...(byRef.get(k) || []), r])
  }
  for (const group of byRef.values()) {
    if (group.length < 2) continue
    for (const r of group) warn('dup_quotation_ref', r, `เลขใบเสนอราคา ${r.quotationRef} ซ้ำกับการ์ดอื่น ${group.length - 1} ใบ`)
  }

  // ลูกค้าเดียวกัน + วันจัดงานเดียวกัน ในตารางอีเวนต์ = อาจนับซ้ำ
  const byCustDate = new Map<string, Row[]>()
  for (const r of events) {
    if (!r.eventDate) continue
    const k = `${r.customer.toLowerCase()}|${r.eventDate}`
    byCustDate.set(k, [...(byCustDate.get(k) || []), r])
  }
  for (const group of byCustDate.values()) {
    if (group.length < 2) continue
    for (const r of group) warn('possible_duplicate', r, `ลูกค้าเดียวกัน วันจัดงาน ${r.eventDate} มี ${group.length} การ์ด`)
  }

  for (const r of all) if (noHistory.has(r.leadId))
    warn('no_history', r, `ไม่มีประวัติเปลี่ยนสถานะ — ใช้วันสร้างการ์ด ${r.lockDate} เป็นวันล็อคคิว`)

  return {
    booths, events, unclassified,
    boothUnits: booths.reduce((s, r) => s + r.units, 0),
    eventCount: events.length,
    warnings,
  }
}

// ── เป้า (sales_board_targets.targets jsonb ใช้ร่วมกับ Sales Board) ──
const CM_KEYS = ['cm_booths', 'cm_events'] as const

/**
 * scope 'commission' → เขียนเฉพาะ cm_booths / cm_events (null หรือ ≤ 0 = ลบคีย์) คงคีย์อื่นไว้
 * scope 'board'      → แทนที่คีย์ที่ไม่ขึ้นต้นด้วย cm_ ทั้งชุดด้วย patch และคงคีย์ cm_* เดิมไว้
 */
export function mergeTargets(
  existing: Record<string, number>,
  patch: Record<string, number | null>,
  scope: 'commission' | 'board',
): Record<string, number> {
  const base = existing || {}
  if (scope === 'commission') {
    const out: Record<string, number> = { ...base }
    for (const k of CM_KEYS) {
      if (!(k in patch)) continue
      const v = patch[k]
      if (v == null || !(Number(v) > 0)) delete out[k]
      else out[k] = Number(v)
    }
    return out
  }
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(base)) if (k.startsWith('cm_')) out[k] = v
  for (const [k, v] of Object.entries(patch || {})) {
    if (k.startsWith('cm_') || v == null || !Number.isFinite(Number(v))) continue
    out[k] = Number(v)
  }
  return out
}

// ── การแสดงวันที่ (พ.ศ.) ──
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']
const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
export const TH_MONTHS_LONG = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']

const parts = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '')
  return m ? { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) } : null
}
const beShort = (y: number) => String(y + 543).slice(-2)

/** 'YYYY-MM-DD' → "จันทร์ 25 พ.ค. 69" */
export function thaiDay(d: string | null): string {
  const p = d ? parts(d) : null
  if (!p) return '—'
  const dow = new Date(Date.UTC(p.y, p.mo - 1, p.d)).getUTCDay()
  return `${TH_DAYS[dow]} ${p.d} ${TH_MONTHS_SHORT[p.mo - 1]} ${beShort(p.y)}`
}

/** วันจัดงาน — วันเดียวแสดงแบบ thaiDay, หลายวัน "24 มิ.ย. – 19 ก.ค. 69" */
export function thaiEventRange(start: string | null, end: string | null): string {
  const s = start ? parts(start) : null
  const e = end ? parts(end) : null
  if (!s || !start) return '—'
  if (!e || !end || end.slice(0, 10) <= start.slice(0, 10)) return thaiDay(start)
  const left = `${s.d} ${TH_MONTHS_SHORT[s.mo - 1]}${s.y !== e.y ? ` ${beShort(s.y)}` : ''}`
  return `${left} – ${e.d} ${TH_MONTHS_SHORT[e.mo - 1]} ${beShort(e.y)}`
}

/** 'YYYY-MM-DD' → "26/5/2569" */
export function thaiSlashDate(d: string): string {
  const p = parts(d)
  return p ? `${p.d}/${p.mo}/${p.y + 543}` : d
}

/** บรรทัดสรุปแบบหัวไฟล์ต้นแบบ */
export function summaryLine(targets: CommissionTargets, range: DateRange): string {
  const n = (v: number | null | undefined) => (v && v > 0 ? String(v) : '-')
  return `เป้าหมายแอดมิน ขายตู้ ${n(targets.booths)} ตู้ ขายงานอีเวนต์ ${n(targets.events)} งาน กำหนดเวลา ${thaiSlashDate(range.from)} - ${thaiSlashDate(range.to)}`
}

// ── ส่งออก Excel ──
export const BOOTH_HEADERS = ['ลำดับ', 'วันที่ล็อคคิว', 'จำนวนตู้ที่สั่งผลิต', 'ชื่อ LINE ลูกค้า', 'ใบเสนอราคา', 'สถานะงาน'] as const
export const EVENT_HEADERS = ['ลำดับ', 'วันที่ล็อคคิว', 'วันที่จัดงาน', 'ชื่อ LINE ลูกค้า', 'ใบเสนอราคา', 'สถานะงาน'] as const

export type SheetCell = string | number
/**
 * แผ่นงานแบบไฟล์ต้นแบบ (array of arrays สำหรับ XLSX.utils.aoa_to_sheet)
 * แถว 1 คอลัมน์ B = บรรทัดสรุปเป้า · แถว 3 = ยอดรวม · แถว 5 = หัวตาราง · A–F ตู้, G–L อีเวนต์
 * statusLabel (ไม่บังคับ) แปลงค่าสถานะดิบเป็นป้ายไทย
 */
export function buildExportSheet(
  result: CommissionResult,
  targets: CommissionTargets,
  range: DateRange,
  statusLabel: (status: string) => string = (s) => s,
): SheetCell[][] {
  const blank6 = (): SheetCell[] => ['', '', '', '', '', '']
  const sheet: SheetCell[][] = [
    ['', summaryLine(targets, range)],
    [],
    [`ขายตู้ ${result.boothUnits} ตู้`, '', '', '', '', '', `ขายงานอีเวนต์ ${result.eventCount} งาน`],
    [],
    [...BOOTH_HEADERS, ...EVENT_HEADERS],
  ]
  const n = Math.max(result.booths.length, result.events.length)
  for (let i = 0; i < n; i++) {
    const b = result.booths[i], e = result.events[i]
    const left = b
      ? [b.no, thaiDay(b.lockDate), b.units, b.customer, b.quotationRef || '', statusLabel(b.status)]
      : blank6()
    const right = e
      ? [e.no, thaiDay(e.lockDate), thaiEventRange(e.eventDate, e.eventEndDate), e.customer, e.quotationRef || '', statusLabel(e.status)]
      : blank6()
    sheet.push([...left, ...right])
  }
  return sheet
}
