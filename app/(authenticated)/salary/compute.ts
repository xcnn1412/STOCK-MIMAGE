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

export type EmploymentType = 'fulltime' | 'freelance'

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
function bangkokDate(iso: string): string {
  return new Date(new Date(iso).getTime() + BANGKOK_OFFSET).toISOString().slice(0, 10)
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

/** มีบรรทัดที่ยังไม่กรอกยอดหรือไม่ — ใช้บล็อกการปิดงวด */
export function hasMissingAmounts(lines: SalaryLine[]): boolean {
  return lines.some(l => l.amount === null || l.amount === undefined)
}

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

// ────────────────────────────────────────────────────────────────────────────
// computeSlip
// ────────────────────────────────────────────────────────────────────────────

export function computeSlip(input: ComputeInput): ComputeResult {
  const { profile, duties, oopRate, periodStart, periodEnd } = input
  const dutyByCode = new Map(duties.map(d => [d.code, d]))

  // 1. ขอบเขต: ประจำ = office + onsite, ฟรีแลนซ์ = onsite เท่านั้น, ไม่นับ remote
  const allowedTypes: CheckinInput['check_type'][] =
    profile.employment_type === 'fulltime' ? ['office', 'onsite'] : ['onsite']

  const scoped = input.checkins
    .map(c => ({ c, date: bangkokDate(c.checked_in_at) }))
    .filter(({ c, date }) =>
      allowedTypes.includes(c.check_type) && date >= periodStart && date <= periodEnd)
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
  const newKeys = new Set(lines.map(l => l.key))
  for (const prev of input.previousLines ?? []) {
    const wasManual = !!prev.override_note?.trim() || (prev.kind === 'runner' && prev.amount != null)
    if (wasManual && !newKeys.has(prev.key)) {
      warnings.push({
        code: 'override_dropped', date: prev.date,
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

  const base = profile.employment_type === 'fulltime' ? profile.base_salary : 0
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
