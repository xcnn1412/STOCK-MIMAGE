/**
 * เครื่องคำนวณสลิปเงินเดือน — pure function ล้วน ไม่แตะ DB / Next / Supabase
 * spec: docs/specs/salary-module.md §"เครื่องคำนวณ" · ทดสอบด้วย scripts/salary-check.ts
 *
 * ทุกฟังก์ชันในไฟล์นี้ deterministic: input เดิม → output เดิมเสมอ
 * (ไม่อ่านนาฬิกา ไม่อ่าน timezone ของเครื่อง — เวลาไทยคำนวณจาก offset คงที่)
 */

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type EmploymentType = 'fulltime' | 'freelance' | 'intern'

// ponytail: intern คิดแบบเดียวกับ fulltime (มีฐาน + office/onsite) — ต่างเฉพาะป้ายชื่อ
export function toEmploymentType(v: unknown): EmploymentType {
  return v === 'freelance' || v === 'intern' ? v : 'fulltime'
}

/** ชนิดงวด — monthly (เดือน, มีเงินเดือนฐาน) / weekly (จันทร์–อาทิตย์) / custom */
export type RunKind = 'monthly' | 'weekly' | 'custom'

export function toRunKind(v: unknown): RunKind {
  return v === 'weekly' || v === 'custom' ? v : 'monthly'
}

export interface SalaryProfileInput {
  employment_type: EmploymentType
  base_salary: number
  /** 'HH:MM' (รับ 'HH:MM:SS' จาก Postgres time ได้ด้วย) */
  work_start: string
  work_end: string
  /** บาท/ชม. */
  ot_rate: number
}

export interface CheckinInput {
  id: string
  check_type: 'office' | 'onsite' | 'remote'
  /** ISO instant */
  checked_in_at: string
  checked_out_at: string | null
  event_id: string | null
  event_name?: string | null
  /** รหัสหน้าที่ (salary_duties.code) */
  duties: string[]
  out_of_province: boolean
  /** สลิปที่จ่ายเช็คอินนี้ไปแล้ว (null/undefined = ยังไม่ถูกจ่าย) */
  paid_slip_id?: string | null
}

export interface DutyInput {
  code: string
  name_th: string
  rate: number
  pay_mode: 'per_checkin' | 'manual_daily'
  is_active: boolean
}

export type LineKind = 'ot' | 'site' | 'oop' | 'runner'

export interface SalaryLine {
  /** เสถียรข้ามการคำนวณใหม่ — ใช้จับคู่เพื่อคงค่าที่แก้มือ */
  key: string
  kind: LineKind
  /** YYYY-MM-DD ตามเวลาไทย */
  date: string
  checkin_id?: string
  duty?: string
  label: string
  hours?: number
  computed_amount: number
  /** null = ยังไม่กรอก (รันเนอร์) */
  amount: number | null
  override_note?: string
}

export interface SalaryAdjustment {
  id: string
  label: string
  amount: number
}

export interface SalaryWarning {
  code: 'no_checkout' | 'no_duty' | 'no_event' | 'runner_missing' | 'override_dropped'
  date: string
  checkin_id?: string
  /**
   * บรรทัดที่คำเตือนนี้พูดถึง (ใช้กับ override_dropped ที่ไม่ผูกกับเช็คอิน)
   * — ทำให้คำเตือนสองบรรทัดของวันเดียวกันไม่ยุบเป็นงานค้างข้อเดียว
   */
  line_key?: string
  message: string
}

export interface ComputeInput {
  profile: SalaryProfileInput
  checkins: CheckinInput[]
  duties: DutyInput[]
  /** อัตราเบิ้ลต่างจังหวัดต่อเช็คอิน */
  oopRate: number
  /** YYYY-MM-DD (รวมปลายทั้งสองฝั่ง) */
  periodStart: string
  periodEnd: string
  /** ชนิดงวด — ไม่ส่ง = monthly (ผู้เรียกเก่า/เทสต์เดิมได้พฤติกรรมเดิม) */
  runKind?: RunKind
  /**
   * วันแรกที่เช็คอิน "หน้างาน" ยังนับเข้าสลิปได้ (YYYY-MM-DD)
   * ไม่ส่ง = periodStart ทุกชนิดงวด · ผู้เรียกจริงส่ง onsiteFromFor(run) ซึ่งก็คือวันเริ่มงวด
   * (ยกเลิกเก็บตกแล้ว — เช็คอินก่อนวันเริ่มงวดไม่ถูกคิดในงวดนี้)
   */
  onsiteFrom?: string
  /** บรรทัดของการคำนวณครั้งก่อน — ใช้คงค่าที่แก้มือไว้ */
  previousLines?: SalaryLine[]
  adjustments?: SalaryAdjustment[]
}

export interface ComputeResult {
  lines: SalaryLine[]
  warnings: SalaryWarning[]
  total: number
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers — เวลาไทยจาก offset คงที่ (ตาม convention ของ repo, ไม่ใช้ Intl)
// ────────────────────────────────────────────────────────────────────────────

const BANGKOK_OFFSET = 7 * 60 * 60 * 1000
const MS_PER_MINUTE = 60 * 1000
/** ปัดลงเป็นบล็อก 30 นาที — น้อยกว่า 1 บล็อกไม่คิด OT */
const OT_BLOCK_MINUTES = 30

const KIND_ORDER: Record<LineKind, number> = { ot: 0, site: 1, oop: 2, runner: 3 }

const NO_EVENT_LABEL = 'ไม่ระบุอีเวนต์'

/** เทียบสตริงแบบ deterministic (ไม่พึ่ง locale ของเครื่อง) */
function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** จำนวนนาทีนับจาก epoch ในมุมมองเวลาไทย — ใช้เป็นแกนเวลาเดียวทั้งไฟล์ */
function bangkokMinutes(iso: string): number {
  return Math.floor((new Date(iso).getTime() + BANGKOK_OFFSET) / MS_PER_MINUTE)
}

/** วันที่ไทย (YYYY-MM-DD) ของ instant หนึ่ง */
export function bangkokDate(iso: string): string {
  return new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString().slice(0, 10)
}

/**
 * instant → (วันไทย, เวลาไทย 'HH:MM') — ตัวเดียวที่ทั้ง server action และช่องใน
 * ตารางรายวันใช้ (อย่านิยาม bkkParts/bangkokParts ซ้ำในไฟล์อื่นอีก)
 * ผู้เรียกต้องมั่นใจว่า iso ใช้ได้ (ตรวจด้วย Date.parse ก่อนถ้ามาจากผู้ใช้)
 */
export function bangkokParts(iso: string): { date: string; time: string } {
  const s = new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString()
  return { date: s.slice(0, 10), time: s.slice(11, 16) }
}

/** 'HH:MM' หรือ 'HH:MM:SS' (Postgres time) → 'HH:MM' · ค่าว่าง → '' */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : ''
}

/** แหล่งของเวลาเข้า/ออกที่ใช้คิดเงิน — 'event' = ตามตารางอีเวนต์, 'actual' = เวลากดจริง */
export type ScheduleSource = 'event' | 'actual'

/** ตารางเวลาของอีเวนต์ (events.event_date / event_time / event_end_time) */
export interface EventScheduleInput {
  event_date: string | null
  event_time: string | null
  event_end_time: string | null
}

/**
 * เช็คอินหน้างานที่ผูกอีเวนต์ → เวลาเข้า/ออกตามตารางอีเวนต์ (ไม่แตะข้อมูลจริงใน DB)
 * - ไม่ใช่ onsite / ไม่มีอีเวนต์ / ไม่มีวันหรือเวลาเริ่ม → ใช้เวลาจริง
 * - มีเวลาจบ → ออก = วันเดียวกัน (ถ้า ≤ เวลาเข้า = ข้ามคืน → วันถัดไป)
 * - ไม่มีเวลาจบ → คงเวลาออกจริงไว้
 */
export function applyEventSchedule<T extends { check_type: string; checked_in_at: string; checked_out_at: string | null }>(
  c: T,
  ev: EventScheduleInput | null | undefined
): T & { schedule_source: ScheduleSource } {
  const actual = { ...c, schedule_source: 'actual' as ScheduleSource }
  if (c.check_type !== 'onsite' || !ev?.event_date || !ev.event_time) return actual
  const start = Date.parse(`${ev.event_date}T${hhmm(ev.event_time)}:00+07:00`)
  if (Number.isNaN(start)) return actual
  let checked_out_at = c.checked_out_at
  if (ev.event_end_time) {
    let end = Date.parse(`${ev.event_date}T${hhmm(ev.event_end_time)}:00+07:00`)
    if (Number.isNaN(end)) return actual
    if (end <= start) end += 86_400_000
    checked_out_at = new Date(end).toISOString()
  }
  return { ...c, checked_in_at: new Date(start).toISOString(), checked_out_at, schedule_source: 'event' }
}

/** เที่ยงคืนของวันไทย D บนแกนเวลาเดียวกับ bangkokMinutes() */
function dayStartMinutes(date: string): number {
  return Math.floor(Date.parse(`${date}T00:00:00Z`) / MS_PER_MINUTE)
}

/** 'HH:MM' หรือ 'HH:MM:SS' → นาทีนับจากเที่ยงคืน */
function parseClock(hhmm: string): number {
  const [h, m] = hhmm.split(':')
  return Number(h) * 60 + Number(m || 0)
}

function eventLabel(c: CheckinInput): string {
  return c.event_name || NO_EVENT_LABEL
}

// ────────────────────────────────────────────────────────────────────────────
// Public helpers
// ────────────────────────────────────────────────────────────────────────────

/**
 * ยอดของบรรทัด: ค่าที่แก้มือถ้ามี ไม่งั้นค่าที่ระบบคำนวณ
 * รันเนอร์ที่ยังไม่กรอก amount = null และ computed_amount = 0 → นับเป็น 0
 */
export function lineAmount(l: SalaryLine): number {
  return l.amount ?? l.computed_amount ?? 0
}

/** บรรทัดที่ยังไม่มียอด (รันเนอร์ที่ยังไม่กรอก) — นิยามเดียวทั้งโมดูล */
export function isMissingAmount(l: SalaryLine): boolean {
  return l.amount === null || l.amount === undefined
}

/** มีบรรทัดที่ยังไม่กรอกยอดหรือไม่ — ใช้บล็อกการปิดงวด */
export function hasMissingAmounts(lines: SalaryLine[]): boolean {
  return lines.some(isMissingAmount)
}

/** ความยาวขั้นต่ำของเหตุผลตอน "เปิดแก้ไข" สลิปที่ปิดงวดแล้ว (UI/action/RPC ใช้ค่าเดียวกัน) */
export const REOPEN_MIN_REASON = 10

/**
 * ช่วงวันของงวดจากวันตัดรอบ
 * 'YYYY-MM' + cutoff 25 → start = วันที่ 26 ของเดือนก่อนหน้า, end = วันที่ 25 ของเดือนนั้น
 */
export function periodRange(periodKey: string, cutoffDay: number): { start: string; end: string } {
  const [y, m] = periodKey.split('-').map(Number)
  // เดือนใน Date.UTC เป็น 0-indexed → m-1 = เดือนของงวด, m-2 = เดือนก่อนหน้า
  // วันที่เกินจำนวนวันของเดือนถูก normalize ให้เองโดย Date.UTC
  const start = new Date(Date.UTC(y, m - 2, cutoffDay + 1))
  const end = new Date(Date.UTC(y, m - 1, cutoffDay))
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) }
}

/** เลื่อนวันที่ YYYY-MM-DD ไป n วัน (คิดบน UTC — ไม่มีเวลาเข้ามาเกี่ยว จึงไม่เพี้ยน) */
export function shiftDay(date: string, days: number): string {
  const t = Date.parse(`${date}T00:00:00Z`)
  if (Number.isNaN(t)) return date
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/** ช่วงงวดเท่าที่ตัวเลือกเช็คอินต้องรู้ */
export interface RunWindow {
  kind: RunKind
  period_start: string
  period_end: string
}

/**
 * วันแรก (วันไทย) ที่เช็คอิน "หน้างาน" ยังตกเข้างวดนี้ได้ — นิยามเดียวของขอบล่าง
 * ที่ทั้งการเลือกเช็คอิน การคำนวณ และตารางในหน้าสลิปต้องใช้ร่วมกัน
 *
 * = วันเริ่มงวด ทุกชนิดงวด (กติกาเจ้าของ 2026-09-28: ยกเลิกเก็บตก)
 * คงฟังก์ชันไว้เป็นจุดเดียวที่นิยามขอบล่าง — ถ้ากติกาเปลี่ยนอีก แก้ที่นี่ที่เดียว
 */
export function onsiteFromFor(run: RunWindow): string {
  return run.period_start
}

/** แถวเช็คอินขั้นต่ำที่ selectCheckinsForRun ต้องใช้ (รับแถวจาก DB หรือ CheckinInput ก็ได้) */
export interface SelectableCheckin {
  check_type: 'office' | 'onsite' | 'remote'
  /** ISO instant */
  checked_in_at: string
  paid_slip_id?: string | null
}

/**
 * เลือกเช็คอินที่ "ควรอยู่ในสลิปของงวดนี้"
 * - onsite: ยังไม่ถูกจ่าย (หรือถูกจ่ายโดยสลิปใบนี้เอง) และอยู่ในช่วงงวด [periodStart, periodEnd]
 *   → งวดทับซ้อนกันได้โดยไม่จ่ายซ้ำ · เช็คอินก่อนวันเริ่มงวดไม่ถูกดึงมา (ไม่มีเก็บตก)
 * - office: เฉพาะงวดเดือน และเฉพาะในช่วงงวด (ใช้คิด OT ที่ไปกับเงินเดือนฐาน)
 * - remote: ไม่นับเลย
 * slipId = สลิปที่กำลังคำนวณใหม่ — เช็คอินที่ประทับด้วยสลิปใบนี้ยังต้องอยู่ในสลิปเดิม
 */
export function selectCheckinsForRun<T extends SelectableCheckin>(
  checkins: T[],
  run: RunWindow,
  slipId?: string | null
): T[] {
  const onsiteFrom = onsiteFromFor(run)

  return checkins.filter(c => {
    const date = bangkokDate(c.checked_in_at)
    if (date > run.period_end) return false

    if (c.check_type === 'onsite') {
      if (date < onsiteFrom) return false
      return !c.paid_slip_id || (!!slipId && c.paid_slip_id === slipId)
    }
    if (c.check_type === 'office') return run.kind === 'monthly' && date >= run.period_start
    return false
  })
}

// ── แถวเช็คอิน → input ของเครื่องคำนวณ ──────────────────────────────────────
// ตัวเดียวที่ทั้ง server (actions.ts::computeSlips) และภาพตัวอย่างฝั่ง client
// (previewSlip) ใช้ — ห้ามมีสำเนาที่อื่น ไม่งั้นตัวเลขสองฝั่งจะเพี้ยนคนละทาง

/**
 * เช็คอินที่ event_id ถูกล้างตอนบันทึก (admin เลือก closure / job_cost_events)
 * เก็บที่มาไว้ใน note เป็น [ref:closure:UUID] / [ref:jce:UUID] — นับว่า "ผูกอีเวนต์แล้ว"
 * ดูจุดที่เขียน tag ใน app/(authenticated)/check-in/actions.ts
 */
export const REF_TAG_RE = /\[ref:(closure|jce):[0-9a-fA-F-]{36}\]/

/**
 * แถวเช็คอินเท่าที่การแปลงต้องใช้ — ชื่ออีเวนต์ต้องแตกออกจาก embed มาแล้ว
 * แถวของหน้าสลิป (SlipCheckinRow) ส่งเข้ามาได้ตรงๆ
 */
export interface PreviewCheckin {
  id: string
  check_type: CheckinInput['check_type']
  /** ISO instant */
  checked_in_at: string
  checked_out_at: string | null
  event_id: string | null
  event_name?: string | null
  duties: string[] | null
  out_of_province: boolean | null
  note: string | null
  paid_slip_id?: string | null
}

/** แถวเช็คอิน → input ของเครื่องคำนวณ (รวมกติกา ref-tag) */
export function toCheckinInput(c: PreviewCheckin): CheckinInput {
  let event_id = c.event_id
  let event_name = c.event_name ?? null

  if (!event_id) {
    const ref = c.note ? REF_TAG_RE.exec(c.note) : null
    if (ref) {
      // ถือว่าผูกอีเวนต์แล้ว — ไม่งั้น compute จะขึ้น warning no_event ทั้งที่ข้อมูลครบ
      event_id = ref[0]
      event_name = 'อีเวนต์ (อ้างอิง)'
    }
  }

  return {
    id: c.id,
    check_type: c.check_type,
    checked_in_at: c.checked_in_at,
    checked_out_at: c.checked_out_at,
    event_id,
    event_name,
    duties: Array.isArray(c.duties) ? c.duties : [],
    out_of_province: !!c.out_of_province,
    paid_slip_id: c.paid_slip_id ?? null,
  }
}

/** สัปดาห์จันทร์–อาทิตย์ที่เริ่มวันจันทร์ mondayDate */
export function weekRangeFor(mondayDate: string): { start: string; end: string } {
  return { start: mondayDate, end: shiftDay(mondayDate, 6) }
}

/** วันในสัปดาห์ของวันที่ YYYY-MM-DD (0 = อาทิตย์) */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay()
}

/**
 * สัปดาห์จันทร์–อาทิตย์ล่าสุดที่ "จบแล้ว" ณ วันไทย todayBangkokDate
 * (อาทิตย์ของสัปดาห์นั้นต้องก่อนวันนี้ — วันอาทิตย์วันนี้ยังไม่ถือว่าจบ)
 */
export function lastFinishedWeek(todayBangkokDate: string): { start: string; end: string } {
  const dow = weekdayOf(todayBangkokDate)
  const end = shiftDay(todayBangkokDate, -(dow === 0 ? 7 : dow))
  return { start: shiftDay(end, -6), end }
}

/** เลื่อนคีย์เดือน 'YYYY-MM' ไป n เดือน */
function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7)
}

/**
 * งวดเดือน ('YYYY-MM') ที่วันไทย date ตกอยู่ — หาจาก periodRange ตัวเดียว
 * (ไม่คิดวันเอง) จึงตรงกับช่วงวันของงวดเสมอไม่ว่าวันตัดรอบจะเป็นวันไหน
 */
export function monthKeyForDate(date: string, cutoffDay: number): string {
  let month = date.slice(0, 7)
  for (let i = 0; i < 3; i += 1) {
    const { start, end } = periodRange(month, cutoffDay)
    if (date < start) month = shiftMonth(month, -1)
    else if (date > end) month = shiftMonth(month, 1)
    else break
  }
  return month
}

/**
 * งวดเดือนล่าสุดที่ตัดรอบไปแล้ว (วันสิ้นงวด < วันไทย today)
 * ถอยจากเดือนนี้ทีละเดือนจนเจอเดือนที่ period_end ผ่านไปแล้ว
 */
export function lastFinishedMonth(
  today: string,
  cutoffDay: number
): { month: string; start: string; end: string } {
  let month = today.slice(0, 7)
  let range = periodRange(month, cutoffDay)
  for (let i = 0; i < 3 && range.end >= today; i += 1) {
    month = shiftMonth(month, -1)
    range = periodRange(month, cutoffDay)
  }
  return { month, ...range }
}

/** เช็คอินหน้างานที่ยังไม่ถูกจ่าย — เท่าที่การจัดกลุ่มตามงวดต้องใช้ */
export interface UnpaidCheckinLite {
  user_id: string
  /** ISO instant */
  checked_in_at: string
}

/** งานงวดก่อนที่ยังไม่ถูกจ่าย หนึ่งงวดเดือน */
export interface UnpaidPeriod {
  month: string
  start: string
  end: string
  checkins: number
  people: { user_id: string; checkins: number }[]
}

/**
 * จัดกลุ่มเช็คอินค้างจ่ายตามงวดเดือน — เก็บเฉพาะวันไทย since <= วัน < before
 * งวดเรียงเก่าสุดก่อน · คนในงวดเรียงจำนวนเช็คอินมากสุดก่อน (เท่ากันเรียงตาม user_id)
 */
export function groupUnpaidByPeriod(
  checkins: UnpaidCheckinLite[],
  cutoffDay: number,
  since: string,
  before: string
): UnpaidPeriod[] {
  const byMonth = new Map<string, Map<string, number>>()
  for (const c of checkins) {
    const date = bangkokDate(c.checked_in_at)
    if (date < since || date >= before) continue
    const month = monthKeyForDate(date, cutoffDay)
    const people = byMonth.get(month) ?? new Map<string, number>()
    people.set(c.user_id, (people.get(c.user_id) ?? 0) + 1)
    byMonth.set(month, people)
  }

  return Array.from(byMonth, ([month, people]) => {
    const list = Array.from(people, ([user_id, n]) => ({ user_id, checkins: n }))
      .sort((a, b) => b.checkins - a.checkins || cmp(a.user_id, b.user_id))
    return {
      month,
      ...periodRange(month, cutoffDay),
      checkins: list.reduce((s, p) => s + p.checkins, 0),
      people: list,
    }
  }).sort((a, b) => cmp(a.month, b.month))
}

/** period_key ของงวด — เดือน 'YYYY-MM' / สัปดาห์-กำหนดเอง 'YYYY-MM-DD_YYYY-MM-DD' */
export function periodKeyFor(kind: RunKind, start: string, end: string): string {
  // งวดเดือนใช้เดือนของวันสิ้นงวด (วันตัดรอบอยู่ในเดือนนั้นเสมอ)
  return kind === 'monthly' ? end.slice(0, 7) : `${start}_${end}`
}

// ────────────────────────────────────────────────────────────────────────────
// computeSlip
// ────────────────────────────────────────────────────────────────────────────

export function computeSlip(input: ComputeInput): ComputeResult {
  const { profile, duties, oopRate, periodStart, periodEnd } = input
  const dutyByCode = new Map(duties.map(d => [d.code, d]))
  const runKind = input.runKind ?? 'monthly'

  // 1. ขอบเขต
  //    - onsite: นับทุกชนิดงวด ตั้งแต่ onsiteFrom (= วันเริ่มงวด ไม่มีเก็บตก) ถึงวันสิ้นงวด
  //    - office: เฉพาะงวดเดือนของประจำ/ฝึกงาน และเฉพาะในช่วงงวด (OT ออฟฟิศไปกับเงินเดือนฐาน)
  //    - remote: ไม่นับเลย
  const officeCounts = runKind === 'monthly' && profile.employment_type !== 'freelance'
  const onsiteFrom = input.onsiteFrom ?? periodStart

  const scoped = input.checkins
    .map(c => ({ c, date: bangkokDate(c.checked_in_at) }))
    .filter(({ c, date }) =>
      date <= periodEnd && (
        c.check_type === 'onsite' ? date >= onsiteFrom
          : c.check_type === 'office' ? officeCounts && date >= periodStart
            : false))
    // เรียงให้ผลลัพธ์ (โดยเฉพาะ warnings) เสถียรไม่ว่า input จะมาลำดับไหน
    .sort((a, b) => cmp(a.date, b.date) || cmp(a.c.checked_in_at, b.c.checked_in_at) || cmp(a.c.id, b.c.id))

  const lines: SalaryLine[] = []
  const warnings: SalaryWarning[] = []

  // ── 2. OT ต่อวัน — รวมช่วงเวลาที่ซ้อนกันก่อน แล้วนับนาทีนอกเวลาทำงาน ────
  const workStart = parseClock(profile.work_start)
  const workEnd = parseClock(profile.work_end)

  /** วันไทย → ช่วง [เข้า, ออก] บนแกนนาทีไทย */
  const intervalsByDate = new Map<string, Array<[number, number]>>()

  for (const { c, date } of scoped) {
    if (!c.checked_out_at) {
      warnings.push({
        code: 'no_checkout', date, checkin_id: c.id,
        message: `เช็คอินวันที่ ${date} ยังไม่มีเวลาออก — ไม่คิด OT ให้`,
      })
      continue
    }
    const from = bangkokMinutes(c.checked_in_at)
    const to = bangkokMinutes(c.checked_out_at)
    if (to <= from) continue // ข้อมูลเพี้ยน (ออกก่อนเข้า) — ไม่คิด OT
    const list = intervalsByDate.get(date)
    if (list) list.push([from, to])
    else intervalsByDate.set(date, [[from, to]])
  }

  for (const [date, raw] of intervalsByDate) {
    const midnight = dayStartMinutes(date)
    const windowStart = midnight + workStart
    const windowEnd = midnight + workEnd

    const merged = mergeIntervals(raw)
    let otMinutes = 0
    for (const [from, to] of merged) {
      // ก่อนเข้างาน
      otMinutes += Math.max(0, Math.min(to, windowStart) - from)
      // หลังเลิกงาน — ส่วนที่ข้ามเที่ยงคืนนับต่อเนื่องทั้งหมด (ไม่เริ่มหน้าต่างใหม่)
      otMinutes += Math.max(0, to - Math.max(from, windowEnd))
    }

    const blocks = Math.floor(otMinutes / OT_BLOCK_MINUTES)
    if (blocks < 1) continue // น้อยกว่า 30 นาที = ไม่มี OT

    const hours = blocks / 2
    lines.push({
      key: `ot:${date}`,
      kind: 'ot',
      date,
      label: `OT ${hours} ชม.`,
      hours,
      computed_amount: round2(hours * profile.ot_rate),
      amount: null, // เติมในขั้น merge override
    })
  }

  // ── 3–5. ค่าสตาฟ / เบิ้ลต่างจังหวัด / รันเนอร์ (เฉพาะ onsite) ───────────
  /** วันไทย → รหัสหน้าที่ manual_daily → จำนวนเช็คอินของวันนั้น */
  const manualByDate = new Map<string, Map<string, number>>()

  for (const { c, date } of scoped) {
    if (c.check_type !== 'onsite') continue

    if (c.duties.length === 0) {
      warnings.push({
        code: 'no_duty', date, checkin_id: c.id,
        message: `เช็คอินหน้างานวันที่ ${date} ยังไม่ได้ระบุหน้าที่ — ไม่ได้ค่าสตาฟ`,
      })
    }
    if (!c.event_id) {
      warnings.push({
        code: 'no_event', date, checkin_id: c.id,
        message: `เช็คอินหน้างานวันที่ ${date} ไม่ได้ผูกกับอีเวนต์`,
      })
    }

    // หน้าที่ซ้ำในเช็คอินเดียวกันนับครั้งเดียว (กัน key ชนกัน)
    for (const code of Array.from(new Set(c.duties))) {
      const duty = dutyByCode.get(code)
      if (!duty) continue // รหัสหน้าที่ที่ไม่รู้จัก — ข้ามไป ไม่ขึ้นบรรทัด

      if (duty.pay_mode === 'per_checkin') {
        // อัตรา ณ เวลาคำนวณ (snapshot) — ใช้แม้หน้าที่ถูกปิดใช้งานไปแล้ว
        lines.push({
          key: `site:${date}:${c.id}:${code}`,
          kind: 'site',
          date,
          checkin_id: c.id,
          duty: code,
          label: `${duty.name_th} · ${eventLabel(c)}`,
          computed_amount: round2(duty.rate),
          amount: null,
        })
      } else {
        const perDuty = manualByDate.get(date) ?? new Map<string, number>()
        perDuty.set(code, (perDuty.get(code) ?? 0) + 1)
        manualByDate.set(date, perDuty)
      }
    }

    if (c.out_of_province) {
      lines.push({
        key: `oop:${date}:${c.id}`,
        kind: 'oop',
        date,
        checkin_id: c.id,
        label: `เบิ้ลต่างจังหวัด · ${eventLabel(c)}`,
        computed_amount: round2(oopRate),
        amount: null,
      })
    }
  }

  for (const [date, perDuty] of manualByDate) {
    for (const [code, count] of perDuty) {
      const duty = dutyByCode.get(code)!
      lines.push({
        key: `runner:${date}:${code}`,
        kind: 'runner',
        date,
        duty: code,
        label: `${duty.name_th} · ${count} เช็คอิน`,
        computed_amount: 0,
        amount: null, // admin กรอกเอง
      })
    }
  }

  // ── 6. คงค่าที่แก้มือจากการคำนวณครั้งก่อน ─────────────────────────────
  const previousByKey = new Map((input.previousLines ?? []).map(l => [l.key, l]))

  for (const line of lines) {
    const prev = previousByKey.get(line.key)
    const keepOverride = !!prev && (
      !!prev.override_note?.trim() ||
      (prev.kind === 'runner' && prev.amount !== null && prev.amount !== undefined)
    )

    if (keepOverride) {
      line.amount = prev!.amount
      if (prev!.override_note) line.override_note = prev!.override_note
    } else if (line.kind === 'runner') {
      line.amount = null // ยังไม่กรอก
    } else {
      line.amount = line.computed_amount
    }
  }

  // ค่าที่แก้มือไว้ซึ่งจับคู่บรรทัดใหม่ไม่ได้ (เช่น เช็คอินถูกย้ายวัน/เปลี่ยนหน้าที่ → key เปลี่ยน)
  // จะหายไปเงียบๆ ไม่ได้ — ต้องเตือนให้ admin แก้ซ้ำ
  // ยกเว้นบรรทัดของวันที่ไม่อยู่ในงวดนี้แล้ว (เช่น สลิปที่เคยคำนวณตอนยังมีเก็บตก):
  // วันนั้นไม่ใช่ของสลิปใบนี้อีกต่อไป จึงไม่มีอะไรให้แก้ซ้ำ
  const firstDay = onsiteFrom < periodStart ? onsiteFrom : periodStart
  const newKeys = new Set(lines.map(l => l.key))
  for (const prev of input.previousLines ?? []) {
    const wasManual = !!prev.override_note?.trim() || (prev.kind === 'runner' && prev.amount != null)
    const inPeriod = prev.date >= firstDay && prev.date <= periodEnd
    if (wasManual && inPeriod && !newKeys.has(prev.key)) {
      warnings.push({
        code: 'override_dropped', date: prev.date, line_key: prev.key,
        message: `ค่าที่แก้มือไว้ "${prev.label}" (${prev.date}) หายไปหลังคำนวณใหม่ เพราะบรรทัดเดิมไม่มีแล้ว — ตรวจและแก้มือซ้ำถ้าจำเป็น`,
      })
    }
  }

  // รันเนอร์ที่ยังไม่กรอก → เตือน (ห้ามปิดงวด)
  for (const line of lines) {
    if (line.kind === 'runner' && line.amount === null) {
      warnings.push({
        code: 'runner_missing', date: line.date,
        message: `ยังไม่ได้กรอกยอด${line.label.split(' · ')[0]}ของวันที่ ${line.date}`,
      })
    }
  }

  // ── 7. เรียงบรรทัด + รวมยอด ────────────────────────────────────────────
  lines.sort((a, b) =>
    cmp(a.date, b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || cmp(a.label, b.label) || cmp(a.key, b.key))
  warnings.sort((a, b) => cmp(a.date, b.date) || cmp(a.code, b.code) || cmp(a.checkin_id ?? '', b.checkin_id ?? ''))

  // เงินเดือนฐานมีเฉพาะงวดเดือนของประจำ/ฝึกงาน — งวดสัปดาห์/กำหนดเองได้เฉพาะค่าออกงาน
  const base = runKind === 'monthly' && profile.employment_type !== 'freelance'
    ? profile.base_salary
    : 0
  const lineTotal = lines.reduce((sum, l) => sum + lineAmount(l), 0)
  const adjustTotal = (input.adjustments ?? []).reduce((sum, a) => sum + a.amount, 0)

  return { lines, warnings, total: round2(base + lineTotal + adjustTotal) }
}

/** รวมช่วงเวลาที่ซ้อน/ต่อเนื่องกันให้เหลือช่วงที่ไม่ทับกัน (กันนับ OT ซ้ำ) */
function mergeIntervals(intervals: Array<[number, number]>): Array<[number, number]> {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const out: Array<[number, number]> = []
  for (const [from, to] of sorted) {
    const last = out[out.length - 1]
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else out.push([from, to])
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
// ภาพตัวอย่างฝั่ง client (spec: docs/specs/salary-slip-smooth-edit.md §A)
// ────────────────────────────────────────────────────────────────────────────

/** ค่าที่ภาพตัวอย่างต้องรู้นอกเหนือจากตัวสลิป — getSlipForView ส่งให้เฉพาะ admin */
export interface SlipCalcInputs {
  /** 'HH:MM' */
  work_start: string
  work_end: string
  /** บาท/ชม. */
  ot_rate: number
  /** อัตราเบิ้ลต่างจังหวัดต่อเช็คอิน */
  oop_rate: number
}

/**
 * คำนวณสลิปใหม่ในเบราว์เซอร์ทันทีที่แก้เช็คอิน — ผลเป็นแค่ภาพตัวอย่าง ไม่ถูกส่งไปบันทึก
 * ขั้นตอนเดียวกับ computeSlips ฝั่ง server ทุกอย่าง: toCheckinInput → selectCheckinsForRun
 * → computeSlip (onsiteFromFor ตัวเดียวกัน) · previousLines = บรรทัดปัจจุบันของสลิป
 * (ค่าที่แก้มือ/รันเนอร์ที่กรอกแล้วจึงคงอยู่) · ฐานใช้ค่า snapshot ของสลิป
 */
export function previewSlip(input: {
  slip: {
    id: string
    kind: RunKind
    employment_type: EmploymentType
    base_salary: number
    lines: SalaryLine[]
    adjustments: SalaryAdjustment[]
    period_start: string
    period_end: string
  }
  checkins: PreviewCheckin[]
  duties: DutyInput[]
  calc: SlipCalcInputs
}): ComputeResult {
  const { slip, calc } = input
  const run: RunWindow = { kind: slip.kind, period_start: slip.period_start, period_end: slip.period_end }
  const checkins = selectCheckinsForRun(input.checkins.map(toCheckinInput), run, slip.id)

  return computeSlip({
    profile: {
      employment_type: slip.employment_type,
      base_salary: slip.base_salary,
      work_start: calc.work_start,
      work_end: calc.work_end,
      ot_rate: calc.ot_rate,
    },
    checkins,
    duties: input.duties,
    oopRate: calc.oop_rate,
    periodStart: slip.period_start,
    periodEnd: slip.period_end,
    runKind: slip.kind,
    onsiteFrom: onsiteFromFor(run),
    previousLines: slip.lines,
    adjustments: slip.adjustments,
  })
}

// ────────────────────────────────────────────────────────────────────────────
// มุมมองรายวัน + งานค้างก่อนปิดงวด (spec: docs/specs/salary-slip-daily-ui.md)
// pure ล้วนเหมือนส่วนบน — ใช้ร่วมกันทั้งตารางเดสก์ท็อป การ์ดมือถือ และหน้าพนักงาน
// ────────────────────────────────────────────────────────────────────────────

/** เช็คอินเท่าที่มุมมองรายวันต้องรู้ — รับแถวเต็มจาก getSlipForView ได้ตรงๆ */
export interface DayCheckin {
  id: string
  check_type: 'office' | 'onsite' | 'remote'
  /** ISO instant */
  checked_in_at: string
  checked_out_at: string | null
  event_id: string | null
  event_name?: string | null
  duties: string[]
  out_of_province: boolean
  /** สลิปที่จ่ายเช็คอินนี้ไปแล้ว — ไม่ใช่สลิปที่กำลังดู = "จ่ายในสลิปอื่น" */
  paid_slip_id?: string | null
}

/** เช็คอินหนึ่งใบในแถววัน พร้อมบรรทัดเงินที่เกิดจากมัน */
export interface DayCheckinRow<C extends DayCheckin = DayCheckin> {
  checkin: C
  /** ค่าสตาฟของเช็คอินใบนี้ (หลายหน้าที่ = หลายบรรทัด) */
  siteLines: SalaryLine[]
  /** เบิ้ลต่างจังหวัดของเช็คอินใบนี้ (มีได้อย่างมาก 1) */
  oopLine?: SalaryLine
}

/** หนึ่งวันไทยในสลิป = 1 แถวในตาราง / 1 การ์ดบนมือถือ */
export interface DayRow<C extends DayCheckin = DayCheckin> {
  /** YYYY-MM-DD ตามเวลาไทย */
  date: string
  checkins: DayCheckinRow<C>[]
  /** OT ของวันนั้น (คิดรวมทั้งวัน จึงมีได้อย่างมาก 1 บรรทัด) */
  otLine?: SalaryLine
  /** รันเนอร์ของวันนั้น (1 บรรทัดต่อหน้าที่ manual_daily) */
  runnerLines: SalaryLine[]
  warnings: SalaryWarning[]
  /** ผลรวมยอดของทุกบรรทัดที่อยู่ในวันนี้ (รวมบรรทัดที่ไม่ผูกกับเช็คอินที่แสดง) */
  dayTotal: number
}

/**
 * บรรทัดเงิน + เช็คอิน + คำเตือน → แถวรายวัน เรียงตามวัน
 * วันที่มีเช็คอิน 2 ครั้ง = 1 DayRow ที่มี 2 แถวย่อย
 * วันที่มีแต่บรรทัดเงิน (เช่น รันเนอร์ที่เช็คอินถูกกรองออก) ก็ยังได้แถวของตัวเอง
 */
export function groupSlipByDay<C extends DayCheckin>(
  lines: SalaryLine[],
  checkins: C[],
  warnings: SalaryWarning[]
): DayRow<C>[] {
  const byDate = new Map<string, DayRow<C>>()

  const rowFor = (date: string): DayRow<C> => {
    let row = byDate.get(date)
    if (!row) {
      row = { date, checkins: [], runnerLines: [], warnings: [], dayTotal: 0 }
      byDate.set(date, row)
    }
    return row
  }

  // เช็คอินก่อน — ลำดับแถวย่อยในวันเดียวกันเรียงตามเวลาเข้า
  const sortedCheckins = [...checkins].sort(
    (a, b) => cmp(a.checked_in_at, b.checked_in_at) || cmp(a.id, b.id)
  )
  const subRowById = new Map<string, DayCheckinRow<C>>()
  for (const c of sortedCheckins) {
    const sub: DayCheckinRow<C> = { checkin: c, siteLines: [] }
    subRowById.set(c.id, sub)
    rowFor(bangkokDate(c.checked_in_at)).checkins.push(sub)
  }

  // บรรทัดเงิน — เกาะวันของตัวเองเสมอ (line.date = วันไทยของเช็คอิน)
  for (const line of lines) {
    const row = rowFor(line.date)
    row.dayTotal = round2(row.dayTotal + lineAmount(line))

    if (line.kind === 'ot') {
      row.otLine = line
    } else if (line.kind === 'runner') {
      row.runnerLines.push(line)
    } else {
      const sub = line.checkin_id ? subRowById.get(line.checkin_id) : undefined
      if (!sub) continue // เช็คอินถูกกรองออก (จ่ายในสลิปอื่น) — ยอดยังนับใน dayTotal
      if (line.kind === 'site') sub.siteLines.push(line)
      else sub.oopLine = line
    }
  }

  for (const w of warnings) rowFor(w.date).warnings.push(w)

  return Array.from(byDate.values()).sort((a, b) => cmp(a.date, b.date))
}

// ── งานค้างก่อนปิดงวด ────────────────────────────────────────────────────────

/** คำเตือนที่ admin กด "ยอมรับ" แล้ว — เก็บใน salary_slips.accepted_warnings */
export interface AcceptedWarning {
  /** `${code}:${date}:${checkin_id ?? ''}` */
  key: string
  /** id ของ admin ที่กดยอมรับ */
  by: string
  /** ISO instant */
  at: string
}

export interface PendingItem {
  key: string
  date: string
  checkin_id?: string
  /** ข้อความที่บอกว่าค้างอะไร (ระบุหน้าที่/บรรทัดได้) — ว่างได้ ตัวเรียกใช้ป้ายกลุ่มแทน */
  label?: string
  accepted: boolean
}

export interface PendingGroup {
  code: SalaryWarning['code']
  label: string
  items: PendingItem[]
}

export interface PendingResult {
  /** จำนวนที่ยัง "ไม่ได้ยอมรับ" — ปิดงวดได้เมื่อเป็น 0 */
  count: number
  groups: PendingGroup[]
}

/** ป้ายกลุ่มงานค้างที่ผู้ใช้เห็นใน checklist */
export const PENDING_LABELS: Record<SalaryWarning['code'], string> = {
  no_checkout: 'ไม่มีเวลาออก',
  no_event: 'ไม่ได้ผูกอีเวนต์',
  no_duty: 'ไม่ได้ติ๊กหน้าที่',
  runner_missing: 'รันเนอร์ยังไม่กรอก',
  override_dropped: 'ค่าที่แก้มือหาย',
}

/** ลำดับกลุ่มใน checklist — คงที่ ไม่ขึ้นกับลำดับของ warnings */
const PENDING_ORDER: SalaryWarning['code'][] = [
  'runner_missing', 'no_checkout', 'no_event', 'no_duty', 'override_dropped',
]

/**
 * คีย์ของงานค้างหนึ่งรายการ — ตัวเดียวกับที่เก็บใน accepted_warnings
 * ส่วนท้ายเป็น "ตัวระบุรายการ" ในวันนั้น: เช็คอิน (คำเตือนที่ผูกเช็คอิน) หรือ
 * คีย์บรรทัด (รันเนอร์ / ค่าที่แก้มือหาย ซึ่งวันเดียวกันมีได้หลายรายการ)
 */
export function pendingKey(code: string, date: string, itemId?: string | null): string {
  return `${code}:${date}:${itemId ?? ''}`
}

/** ยอมรับไม่ได้ — รันเนอร์ต้องกรอกยอด (พิมพ์ 0 ได้ แต่จะข้ามไม่ได้) */
const NOT_ACCEPTABLE: SalaryWarning['code'] = 'runner_missing'

/** คำเตือนชนิดนี้กด "ยอมรับ" ข้ามได้ไหม — ใช้ทั้งใน checklist และใน acceptSlipWarning */
export function isAcceptable(code: string): boolean {
  return code !== NOT_ACCEPTABLE
}

/**
 * งานค้างที่ต้องเคลียร์ก่อนปิดงวด
 *
 * - `runner_missing` มาจากบรรทัดรันเนอร์ที่ `amount === null` โดยตรง (ไม่ใช่จาก warnings)
 *   — คำเตือนกับบรรทัดอาจไม่ตรงกันชั่วคราวระหว่างกรอก · คีย์เป็นรายบรรทัด
 *   (`runner_missing:<date>:<line.key>`) เพราะวันเดียวมีรันเนอร์ได้หลายหน้าที่
 * - `override_dropped` คีย์ด้วย `line_key` ของคำเตือน — วันเดียวมีได้หลายบรรทัด
 * - รายการที่ถูกยอมรับแล้วยังอยู่ในกลุ่ม (แสดงจางๆ) แต่ไม่ถูกนับใน `count`
 * - คีย์ที่ยอมรับไว้แต่ปัจจุบันไม่มีงานค้างนั้นแล้ว = ทิ้งไปเงียบๆ ไม่ต้องล้างเอง
 */
export function pendingItems(
  warnings: SalaryWarning[],
  accepted: AcceptedWarning[],
  lines: SalaryLine[]
): PendingResult {
  const acceptedKeys = new Set((accepted ?? []).map(a => a.key))
  const byKey = new Map<string, PendingItem & { code: SalaryWarning['code'] }>()

  const add = (
    code: SalaryWarning['code'],
    date: string,
    itemId: string | undefined,
    detail: { checkinId?: string; label?: string }
  ) => {
    const key = pendingKey(code, date, itemId)
    if (byKey.has(key)) return
    byKey.set(key, {
      code,
      key,
      date,
      checkin_id: detail.checkinId,
      label: detail.label,
      accepted: isAcceptable(code) && acceptedKeys.has(key),
    })
  }

  for (const w of warnings ?? []) {
    if (w.code === NOT_ACCEPTABLE) continue // มาจากบรรทัดแทน
    // ค่าที่แก้มือหายไม่ผูกกับเช็คอิน — แยกรายการด้วยคีย์บรรทัดแทน
    const itemId = w.code === 'override_dropped' ? (w.line_key ?? w.checkin_id) : w.checkin_id
    add(w.code, w.date, itemId, { checkinId: w.checkin_id, label: w.message })
  }
  for (const l of lines ?? []) {
    // วันเดียวมีรันเนอร์ได้หลายหน้าที่ — คีย์ต่อบรรทัด ไม่งั้นยุบเหลือรายการเดียว
    if (l.kind === 'runner' && isMissingAmount(l)) {
      add(NOT_ACCEPTABLE, l.date, l.key, { label: l.label })
    }
  }

  const all = Array.from(byKey.values()).sort(
    (a, b) => cmp(a.date, b.date) || cmp(a.key, b.key)
  )

  const groups: PendingGroup[] = []
  for (const code of PENDING_ORDER) {
    const items = all
      .filter(i => i.code === code)
      .map(({ key, date, checkin_id, label, accepted }) => ({ key, date, checkin_id, label, accepted }))
    if (items.length > 0) groups.push({ code, label: PENDING_LABELS[code], items })
  }

  return { count: all.filter(i => !i.accepted).length, groups }
}

/**
 * งานค้างที่ยังไม่ยอมรับ แยกเป็น "ยอมรับเหมาได้" (keys) กับ "ต้องกรอกเอง" (blocked = รันเนอร์ยังไม่กรอก)
 * — ใช้ตอน "ยอมรับทั้งหมดแล้วปิดงวด": blocked > 0 แปลว่าทำไม่ได้ ต้องไปกรอกยอดในสลิปก่อน
 */
export function openPending(groups: PendingGroup[]): { keys: string[]; blocked: number } {
  const keys: string[] = []
  let blocked = 0
  for (const g of groups) {
    for (const i of g.items) {
      if (i.accepted) continue
      if (isAcceptable(g.code)) keys.push(i.key)
      else blocked += 1
    }
  }
  return { keys, blocked }
}
