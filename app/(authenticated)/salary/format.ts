// ============================================================================
// ตัวจัดรูปแบบที่ทุกหน้าในโมดูลเงินเดือนใช้ร่วมกัน — pure ล้วน ใช้ได้ทั้ง server/client
// ============================================================================

import { THAI_MONTHS } from '@/lib/thai-date'

/** จำนวนเงิน — รูปแบบเดียวกับโมดูลการเงิน/ต้นทุน (ทศนิยม 2 ตำแหน่ง) */
export function fmtMoney(n: number | string | null | undefined): string {
  return Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** ชื่อเดือนย่อไทย — ใช้กับป้ายงวดสัปดาห์/กำหนดเองที่ต้องสั้น */
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
/** period_key ของงวดสัปดาห์/กำหนดเอง = 'YYYY-MM-DD_YYYY-MM-DD' */
const RANGE_KEY_RE = /^(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/

/** ปี พ.ศ. สองหลัก (2569 → '69') */
function beShort(year: number): string {
  return String((year + 543) % 100).padStart(2, '0')
}

/**
 * ช่วงวันที่แบบสั้น — '1–7 ก.ย. 69' / ข้ามเดือน '28 ส.ค. – 3 ก.ย. 69'
 * ข้ามปี '28 ธ.ค. 68 – 3 ม.ค. 69'
 */
function rangeLabel(start: string, end: string): string | null {
  const a = DATE_RE.exec(start)
  const b = DATE_RE.exec(end)
  if (!a || !b) return null

  const [, y1, m1, d1] = a
  const [, y2, m2, d2] = b
  const mon1 = THAI_MONTHS_SHORT[Number(m1) - 1]
  const mon2 = THAI_MONTHS_SHORT[Number(m2) - 1]
  if (!mon1 || !mon2) return null

  const day1 = Number(d1)
  const day2 = Number(d2)
  if (y1 !== y2) return `${day1} ${mon1} ${beShort(Number(y1))} – ${day2} ${mon2} ${beShort(Number(y2))}`
  if (m1 !== m2) return `${day1} ${mon1} – ${day2} ${mon2} ${beShort(Number(y2))}`
  return `${day1}–${day2} ${mon1} ${beShort(Number(y2))}`
}

/** งวดในรูปแบบที่ periodLabel รับได้ (นอกจากสตริง period_key) */
export interface PeriodLabelRun {
  kind?: string | null
  period_key?: string | null
  period_start?: string | null
  period_end?: string | null
}

/**
 * ชื่องวดที่ผู้ใช้เห็น (พ.ศ. เสมอ)
 * - งวดเดือน 'YYYY-MM' → 'สิงหาคม 2569'
 * - งวดสัปดาห์/กำหนดเอง → '1–7 ก.ย. 69' (จาก period_start/period_end หรือ period_key รูปช่วง)
 */
export function periodLabel(run: string | PeriodLabelRun | null | undefined): string {
  if (!run) return '-'

  if (typeof run !== 'string') {
    if (run.kind && run.kind !== 'monthly' && run.period_start && run.period_end) {
      return rangeLabel(run.period_start, run.period_end) ?? periodLabel(run.period_key)
    }
    return periodLabel(run.period_key)
  }

  const range = RANGE_KEY_RE.exec(run)
  if (range) return rangeLabel(range[1], range[2]) ?? run

  const m = MONTH_KEY_RE.exec(run)
  if (!m) return run
  const month = THAI_MONTHS[Number(m[2]) - 1]
  if (!month) return run
  return `${month} ${Number(m[1]) + 543}`
}

/** งวดนี้เป็นงวดเดือนหรือไม่ — สตริงรูปช่วง (YYYY-MM-DD_YYYY-MM-DD) ถือว่าไม่ใช่ */
function isMonthlyRun(run: string | PeriodLabelRun): boolean {
  if (typeof run === 'string') return !RANGE_KEY_RE.test(run)
  if (run.kind) return run.kind === 'monthly'
  return !RANGE_KEY_RE.test(run.period_key || '')
}

/**
 * ชื่อสลิปที่ผู้ใช้เห็น — งวดเดือนเป็น "เงินเดือน" ที่เหลือเป็น "ค่าจ้าง"
 * 'สลิปเงินเดือน สิงหาคม 2569' / 'สลิปค่าจ้าง 1–7 ก.ย. 69'
 */
export function slipTitle(run: string | PeriodLabelRun | null | undefined): string {
  if (!run) return 'สลิปเงินเดือน'
  return `${isMonthlyRun(run) ? 'สลิปเงินเดือน' : 'สลิปค่าจ้าง'} ${periodLabel(run)}`
}
