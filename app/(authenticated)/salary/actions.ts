'use server'

// ============================================================================
// Server actions ของโมดูลเงินเดือน — งวด (เปิด/อ่าน) + สลิป (คำนวณ/อ่าน/ลบร่าง)
// ค่าตั้งค่า + rate card + โปรไฟล์เงินเดือน อยู่ที่ ./settings/actions.ts
// เครื่องคำนวณ (pure) อยู่ที่ ./compute.ts — ไฟล์นี้แค่ป้อนข้อมูลต้นทางให้มัน
//
// types/database.types.ts ยังไม่มีตารางเงินเดือน (stale) → client ไม่ถูก generic
// ดังนั้น query กลับมาเป็น any แล้ว cast ตามรูปแบบเดียวกับโมดูลเอกสาร
// ============================================================================

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { getSession, requireAdmin } from './session'
import { fmtMoney, periodLabel, slipTitle, todayBangkok } from './format'
import {
  bangkokParts, computeSlip, groupUnpaidByPeriod, isAcceptable, isMissingAmount,
  lastFinishedMonth, lastFinishedWeek, lineAmount, onsiteFromFor, pendingItems, periodKeyFor, periodRange,
  REOPEN_MIN_REASON, selectCheckinsForRun, shiftDay, toCheckinInput, toEmploymentType, toRunKind,
  weekRangeFor, weekdayOf,
} from './compute'
import type {
  AcceptedWarning, CheckinInput, EmploymentType, RunKind, RunWindow, SalaryAdjustment, SalaryLine,
  SalaryWarning, SlipCalcInputs, UnpaidCheckinLite,
} from './compute'
import { getSalarySettings, listDuties } from './settings/actions'
import type { SalaryDutyRow } from './settings/actions'
// แกนอ่านที่ไม่ตรวจสิทธิ์ (ไฟล์ธรรมดา ไม่ใช่ 'use server') — ผู้เรียกในไฟล์นี้ตรวจสิทธิ์ก่อนเสมอ
import { readDuties, readSalarySettings } from './queries'
import { costsNotesKey, costsRowsForSlip } from './costs-sync'
import type { CostsSkip, CostsSyncCheckin } from './costs-sync'
// แก้ต้นทาง (เช็คอิน) จากในสลิป — เรียก action ของโมดูลเช็คอินตัวเดียวกับหน้า /check-in
// ไม่ให้โมดูลเงินเดือนเขียน staff_checkins เอง (validation/log/ref-tag อยู่ที่นั่นหมด)
import { adminCheckIn, adminEditCheckin, adminUpdateCheckinEvent } from '../check-in/actions'
// ADR-0001: ค่าสตาฟไม่ผ่านใบเบิกอีกแล้ว — สลิปที่ปิดงวดดัน job_cost_items เข้า Costs เอง
// และ import อีเวนต์เข้าโมดูลต้นทุนให้เหมือนพฤติกรรมเดิมของใบเบิก
import { importEventFromStock } from '../costs/actions'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SlipStatus = 'draft' | 'finalized' | 'paid'

/** สลิปของฉัน — พนักงานเห็นเฉพาะที่ปิดงวดแล้ว (finalized/paid) */
export interface MySlipRow {
  id: string
  status: 'finalized' | 'paid'
  /** ชนิดงวด — ป้ายชื่อสลิปแยก "เงินเดือน" (monthly) กับ "ค่าจ้าง" (weekly/custom) */
  kind: RunKind
  total: number
  finalized_at: string | null
  paid_at: string | null
  period_key: string
  period_start: string
  period_end: string
}

/** ข้อเสนอ "งวดนี้ยังไม่เปิด" บนหน้า /salary/runs — คลิกเดียวเปิด+คำนวณ */
export interface RunSuggestion {
  kind: 'weekly' | 'monthly'
  /** งวดเดือน: 'YYYY-MM' ที่ส่งเข้า createSalaryRun (งวดสัปดาห์ไม่มี) */
  month?: string
  start: string
  end: string
  /** ชื่องวดที่ผู้ใช้เห็น (periodLabel) */
  label: string
  /** จำนวนคนที่ควรได้สลิปในงวดนี้ */
  users: number
  /** จำนวนเช็คอินหน้างานที่ยังไม่ถูกจ่ายในช่วงวันของงวด */
  checkins: number
}

/** งานหน้างานของงวดก่อนที่ยังไม่ถูกจ่าย หนึ่งงวดเดือน (กล่องเตือนหน้างวด/สลิป/หน้าแรก) */
export interface UnpaidPeriodRow {
  /** 'YYYY-MM' */
  month: string
  start: string
  end: string
  /** ชื่องวดที่ผู้ใช้เห็น (periodLabel) */
  label: string
  checkins: number
  /** งวดเดือนนี้ที่เปิดไว้แล้ว (null = ยังไม่เปิด) */
  run_id: string | null
  people: { user_id: string; full_name: string | null; checkins: number; slip_id: string | null }[]
}

/** งวดคำนวณ + จำนวนสลิปแต่ละสถานะ (หน้า /salary/runs) */
export interface RunListRow {
  id: string
  kind: RunKind
  period_key: string
  period_start: string
  period_end: string
  note: string | null
  created_at: string | null
  draft: number
  finalized: number
  paid: number
  slips: number
}

/** หัวงวด (หน้า /salary/runs/[runId]) */
export interface RunHeader {
  id: string
  kind: RunKind
  period_key: string
  period_start: string
  period_end: string
  note: string | null
  created_at: string | null
}

/** หนึ่งแถวในตารางสลิปของงวด */
export interface RunSlipRow {
  id: string
  user_id: string
  full_name: string | null
  nickname: string | null
  status: SlipStatus
  employment_type: EmploymentType
  total: number
  warnings: SalaryWarning[]
  /** งานค้างที่ยังไม่ได้ยอมรับ (pendingItems().count) — เกณฑ์เดียวกับที่ปิดงวดใช้ */
  pending_count: number
  /** เคยปิดงวด/จ่ายแล้วมาก่อน (ถูกเปิดแก้) — ลบไม่ได้แม้ตอนนี้เป็นร่าง */
  reopened: boolean
  computed_at: string | null
  finalized_at: string | null
  paid_at: string | null
}

export interface RunDetail {
  run: RunHeader
  slips: RunSlipRow[]
  /** คนที่ควรถูกติ๊กไว้ให้เองในหน้างวด (autoSelectUserIds ลบคนที่มีสลิปแล้ว) */
  suggestedUserIds: string[]
}

/** คนที่ถูกข้ามตอนคำนวณ พร้อมเหตุผลที่แสดงให้ admin เห็น */
export interface SkippedUser {
  user_id: string
  name: string
  reason: string
}

export interface ComputeSlipsResult {
  error?: string
  computed?: number
  skipped?: SkippedUser[]
}

/** หนึ่งครั้งที่สลิปถูกเปิดแก้หลังปิดงวด (salary_slips.reopen_history) */
export interface ReopenEntry {
  /** ISO instant ที่กดเปิดแก้ */
  at: string
  by: string
  by_name: string | null
  reason: string
  total_before: number
  /** ยอดหลังปิดงวดใหม่ — null = ยังไม่ได้ปิดงวดซ้ำ */
  total_after: number | null
  refinalized_at: string | null
  /** เปิดแก้ตอนที่สลิปจ่ายไปแล้วหรือยัง (ใช้เตือนเรื่องส่วนต่าง) */
  was_paid: boolean
}

/** หนึ่งครั้งที่กด "จ่ายแล้ว" (salary_slips.paid_history) */
export interface PaidEntry {
  at: string
  by: string
  total: number
}

/** สลิปหนึ่งใบสำหรับหน้า /salary/[slipId] */
export interface SlipDetail {
  id: string
  run_id: string
  user_id: string
  status: SlipStatus
  /** ชนิดงวดของสลิป — ใช้เลือกคำว่า "สลิปเงินเดือน" / "สลิปค่าจ้าง" */
  kind: RunKind
  employment_type: EmploymentType
  base_salary: number
  lines: SalaryLine[]
  adjustments: SalaryAdjustment[]
  warnings: SalaryWarning[]
  /** คำเตือนที่ admin กด "ยอมรับ" แล้ว — ไม่นับเป็นงานค้างตอนปิดงวด */
  accepted_warnings: AcceptedWarning[]
  /** ประวัติการเปิดแก้หลังปิดงวด (เรียงเก่า → ใหม่) */
  reopen_history: ReopenEntry[]
  /** ประวัติการกด "จ่ายแล้ว" ทุกครั้ง (เรียงเก่า → ใหม่) */
  paid_history: PaidEntry[]
  /** ยอดที่จ่ายไปครั้งล่าสุด — ต่างจาก total เมื่อสลิปถูกเปิดแก้หลังจ่ายแล้ว */
  paid_total: number | null
  total: number
  computed_at: string | null
  finalized_at: string | null
  paid_at: string | null
  /** เวลาที่บรรทัดค่าสตาฟถูก sync เข้าโมดูลต้นทุนสำเร็จครั้งล่าสุด (null = ยังไม่เคย) */
  costs_synced_at: string | null
  /** ชื่อคนที่กดปิดงวด / กดจ่ายแล้ว (null = ยังไม่ถึงขั้นนั้น หรือผู้ใช้ถูกลบไปแล้ว) */
  finalized_by_name: string | null
  paid_by_name: string | null
  period_key: string
  period_start: string
  period_end: string
  full_name: string | null
  nickname: string | null
  /** แผนกจาก profiles — ใช้ในหัวสลิป PDF (ว่างได้) */
  department: string | null
  /** บัญชีธนาคารจาก profiles — แสดงอย่างเดียว โมดูลนี้ไม่แก้ */
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
}

/**
 * ข้อมูลต้นทางในงวด — เช็คอินหนึ่งแถวที่ admin แก้ได้จากในสลิป
 * (ตัวสลิปไม่ได้อ้างแถวนี้โดยตรง — แก้แล้วต้องกดคำนวณใหม่ถึงจะเข้าไปในบรรทัด)
 */
export interface SlipCheckinRow {
  id: string
  check_type: CheckinInput['check_type']
  checked_in_at: string
  checked_out_at: string | null
  event_id: string | null
  event_name: string | null
  duties: string[]
  province: string | null
  district: string | null
  out_of_province: boolean
  note: string | null
  /** สลิปที่จ่ายเช็คอินนี้ไปแล้ว (null = ยังไม่ถูกจ่าย) — ถ้าไม่ใช่สลิปที่กำลังดู = จ่ายในสลิปอื่น */
  paid_slip_id: string | null
}

/**
 * ตัวเลือกอีเวนต์สำหรับผูกเช็คอินจากในสลิป — อีเวนต์ที่วันจัดอยู่ใกล้ๆ ช่วงงวด
 * (งวด ±7 วัน — งานที่คร่อมรอยต่องวดยังเลือกได้)
 */
export interface SlipEventOption {
  id: string
  name: string
  event_date: string
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (module-level, ไม่ export — ไฟล์ 'use server' export ได้เฉพาะ async fn)
// ────────────────────────────────────────────────────────────────────────────

const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/**
 * ขอบเขต "วันไทย" ที่เช็คอินหน้างานยังตกเข้างวดนี้ได้ → instant UTC ที่ยิง filter ได้
 * ขอบล่างมาจาก onsiteFromFor(run) ตัวเดียวกับที่ selectCheckinsForRun/computeSlip ใช้
 */
function runWindowISO(run: RunWindow): { fromISO: string; toISO: string } {
  return {
    fromISO: new Date(`${onsiteFromFor(run)}T00:00:00+07:00`).toISOString(),
    toISO: new Date(`${run.period_end}T23:59:59.999+07:00`).toISOString(),
  }
}

/** เรียงข้อความแบบ deterministic (ไม่พึ่ง locale ของเครื่อง server) */
function cmpText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

type CheckinRaw = {
  id: string
  user_id: string
  check_type: CheckinInput['check_type']
  checked_in_at: string
  checked_out_at: string | null
  event_id: string | null
  duties: string[] | null
  out_of_province: boolean | null
  note: string | null
  paid_slip_id?: string | null
  // PostgREST คืน to-one เป็น object แต่บางเวอร์ชันห่อเป็น array — รับทั้งสองแบบ
  events: { name: string | null } | { name: string | null }[] | null
}

/** ชื่ออีเวนต์ที่ PostgREST ฝังมากับแถวเช็คอิน (object หรือ array ก็ได้) */
function embeddedEventName(events: CheckinRaw['events']): string | null {
  const embedded = Array.isArray(events) ? events[0] : events
  return embedded?.name ?? null
}

/**
 * แถวดิบจาก staff_checkins → input ของเครื่องคำนวณ
 * ใช้ toCheckinInput ของ compute.ts ตัวเดียวกับภาพตัวอย่างฝั่ง client (รวมกติกา ref-tag)
 */
function rawToCheckinInput(raw: CheckinRaw): CheckinInput {
  return toCheckinInput({ ...raw, event_name: embeddedEventName(raw.events) })
}

/**
 * แถว salary_profiles → เวลาทำงาน/อัตรา OT/อัตราเบิ้ลที่เครื่องคำนวณใช้ (ค่าว่าง = ค่าเริ่มต้น)
 * computeSlips กับ calc ที่ส่งให้ภาพตัวอย่างฝั่ง client ผ่านตัวนี้ตัวเดียว
 */
function calcFromProfile(
  sp: { work_start: string | null; work_end: string | null; ot_rate: number | string | null },
  oopRate: number
): SlipCalcInputs {
  return {
    work_start: sp.work_start || '10:00',
    work_end: sp.work_end || '19:00',
    ot_rate: Number(sp.ot_rate || 0),
    oop_rate: oopRate,
  }
}

/** ชื่อ/ชื่อเล่นของ user หลายคน — ใช้ join ฝั่ง JS แทน embed ที่กำกวม */
async function namesByUserId(
  supabase: ReturnType<typeof createServiceClient>,
  userIds: string[]
): Promise<Map<string, { full_name: string | null; nickname: string | null }>> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (ids.length === 0) return new Map()

  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, nickname')
    .in('id', ids)

  type Raw = { id: string; full_name: string | null; nickname: string | null }
  return new Map(
    ((data || []) as unknown as Raw[]).map(p => [p.id, { full_name: p.full_name, nickname: p.nickname }])
  )
}

/** ชื่อที่แสดงของคนหนึ่งจากผลของ namesByUserId — ไม่มี id / หาไม่เจอ = null */
function actorName(
  names: Map<string, { full_name: string | null; nickname: string | null }>,
  userId: string | null
): string | null {
  if (!userId) return null
  const who = names.get(userId)
  return who ? who.full_name || who.nickname || null : null
}

// ────────────────────────────────────────────────────────────────────────────
// สลิปของฉัน
// ────────────────────────────────────────────────────────────────────────────

/**
 * สลิปที่ปิดงวดแล้วของผู้ใช้ที่ล็อกอิน เรียงงวดใหม่สุดก่อน
 * สลิปร่างไม่ถูกส่งกลับมาเลย (spec §สิทธิ์ — พนักงานไม่เห็นสลิปร่างของตัวเอง)
 */
export async function listMySlips(): Promise<MySlipRow[]> {
  const { userId } = await getSession()
  if (!userId) return []

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('salary_slips')
    .select(
      'id, status, total, finalized_at, paid_at, run:salary_runs(kind, period_key, period_start, period_end)'
    )
    .eq('user_id', userId)
    .in('status', ['finalized', 'paid'])

  if (error || !data) return []

  type RunEmbed = {
    kind: string | null
    period_key: string
    period_start: string
    period_end: string
  }
  type Raw = {
    id: string
    status: 'finalized' | 'paid'
    total: number | string | null
    finalized_at: string | null
    paid_at: string | null
    // PostgREST คืน to-one เป็น object แต่บางเวอร์ชันห่อเป็น array — รับทั้งสองแบบ
    run: RunEmbed | RunEmbed[] | null
  }

  const rows = (data as unknown as Raw[]).map(r => {
    const run = Array.isArray(r.run) ? r.run[0] : r.run
    return {
      id: r.id,
      status: r.status,
      kind: toRunKind(run?.kind),
      total: Number(r.total || 0),
      finalized_at: r.finalized_at,
      paid_at: r.paid_at,
      period_key: run?.period_key || '',
      period_start: run?.period_start || '',
      period_end: run?.period_end || '',
    }
  })

  // เรียงฝั่ง JS ตามวันสิ้นงวดใหม่สุดก่อน — งวดสัปดาห์กับงวดเดือนคละกัน period_key
  // จึงเรียงไม่ได้ (คนละรูปแบบ) และ order ของตารางที่ embed มาไม่เสถียรใน PostgREST
  return rows.sort((a, b) => cmpText(b.period_end, a.period_end) || cmpText(b.period_key, a.period_key))
}

// ────────────────────────────────────────────────────────────────────────────
// งวดคำนวณ (admin)
// ────────────────────────────────────────────────────────────────────────────

/** งวดทั้งหมด + จำนวนสลิปแต่ละสถานะ — นับด้วย query เดียวแล้วรวมฝั่ง JS */
export async function listRuns(): Promise<RunListRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const [runsRes, slipsRes] = await Promise.all([
    supabase
      .from('salary_runs')
      .select('id, kind, period_key, period_start, period_end, note, created_at')
      .order('period_end', { ascending: false }),
    supabase.from('salary_slips').select('run_id, status'),
  ])

  type RunRaw = {
    id: string
    kind: string | null
    period_key: string
    period_start: string
    period_end: string
    note: string | null
    created_at: string | null
  }
  type SlipRaw = { run_id: string; status: SlipStatus }

  const counts = new Map<string, { draft: number; finalized: number; paid: number }>()
  for (const s of ((slipsRes.data || []) as unknown as SlipRaw[])) {
    const c = counts.get(s.run_id) ?? { draft: 0, finalized: 0, paid: 0 }
    if (s.status === 'draft' || s.status === 'finalized' || s.status === 'paid') c[s.status] += 1
    counts.set(s.run_id, c)
  }

  return ((runsRes.data || []) as unknown as RunRaw[]).map(r => {
    const c = counts.get(r.id) ?? { draft: 0, finalized: 0, paid: 0 }
    return { ...r, kind: toRunKind(r.kind), ...c, slips: c.draft + c.finalized + c.paid }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// เปิดงวด
// ────────────────────────────────────────────────────────────────────────────

/** ตัวเลือกเปิดงวด — งวดเดือนเลือกเดือน, งวดสัปดาห์เลือกวันจันทร์, กำหนดเองเลือกช่วง */
export type CreateRunInput =
  | { kind: 'monthly'; month: string }
  | { kind: 'weekly'; start: string }
  | { kind: 'custom'; start: string; end: string }

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** งวดกำหนดเองยาวได้ไม่เกินเท่านี้ — กันเผลอเลือกช่วงข้ามปี */
const MAX_CUSTOM_DAYS = 62

/** จำนวนวันของช่วง (รวมปลายทั้งสองฝั่ง) */
function daysInRange(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1
}

/** แปลงตัวเลือกเป็นช่วงวัน + period_key — คืน error เป็นข้อความไทยเมื่อกรอกไม่ถูก */
function resolveRunRange(
  input: CreateRunInput,
  cutoffDay: number
): { error: string } | { kind: RunKind; key: string; start: string; end: string } {
  if (input.kind === 'monthly') {
    const month = (input.month || '').trim()
    if (!PERIOD_KEY_RE.test(month)) return { error: 'งวดต้องอยู่ในรูปแบบ YYYY-MM (เช่น 2026-08)' }
    const { start, end } = periodRange(month, cutoffDay)
    return { kind: 'monthly', key: month, start, end }
  }

  if (input.kind === 'weekly') {
    const start = (input.start || '').trim()
    if (!DATE_RE.test(start)) return { error: 'วันเริ่มงวดต้องอยู่ในรูปแบบ YYYY-MM-DD' }
    if (weekdayOf(start) !== 1) return { error: 'งวดรายสัปดาห์ต้องเริ่มวันจันทร์' }
    const range = weekRangeFor(start)
    return { kind: 'weekly', key: periodKeyFor('weekly', range.start, range.end), ...range }
  }

  const start = (input.start || '').trim()
  const end = (input.end || '').trim()
  if (!DATE_RE.test(start) || !DATE_RE.test(end)) {
    return { error: 'วันเริ่ม–วันสิ้นสุดต้องอยู่ในรูปแบบ YYYY-MM-DD' }
  }
  if (start > end) return { error: 'วันเริ่มงวดต้องไม่เกินวันสิ้นสุด' }
  if (daysInRange(start, end) > MAX_CUSTOM_DAYS) {
    return { error: `งวดกำหนดเองยาวได้ไม่เกิน ${MAX_CUSTOM_DAYS} วัน` }
  }
  return { kind: 'custom', key: periodKeyFor('custom', start, end), start, end }
}

/**
 * เปิดงวดใหม่ — งวดเดือนได้ช่วงวันจากวันตัดรอบ "ปัจจุบัน" แล้วแช่ไว้ใน period_start/period_end
 * (เปลี่ยนวันตัดรอบทีหลังไม่ย้อนไปแก้งวดที่เปิดไปแล้ว); งวดสัปดาห์/กำหนดเองเก็บช่วงที่เลือกตรงๆ
 *
 * งวดสัปดาห์/กำหนดเองเปิดทับกันได้ — กติกา "เช็คอินจ่ายได้ครั้งเดียว"
 * (staff_checkins.paid_slip_id) กันจ่ายซ้ำให้แล้ว
 *
 * แต่ "งวดเดือนทับงวดเดือน" ยังถูกปฏิเสธ เพราะเช็คอิน "ออฟฟิศ" ไม่ถูกประทับ paid_slip_id
 * (มีแต่หน้างาน) → OT ออฟฟิศของวันที่อยู่ในสองงวดเดือนจะถูกจ่ายสองรอบ
 *
 * autoCompute = คำนวณสลิปให้ทุกคนที่ควรอยู่ในงวดทันทีหลังเปิด (autoSelectUserIds)
 */
export async function createSalaryRun(
  input: CreateRunInput,
  opts?: { autoCompute?: boolean }
): Promise<{ error?: string; id?: string; computed?: number; computeError?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const { cutoff_day } = await getSalarySettings()
  const resolved = resolveRunRange(input, cutoff_day)
  if ('error' in resolved) return { error: resolved.error }
  const { kind, key, start, end } = resolved

  const supabase = createServiceClient()
  const { data: dupe } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('period_key', key)
    .maybeSingle()
  if (dupe) return { error: `งวด${periodLabel(key)}ถูกเปิดไว้แล้ว` }

  // งวดเดือนห้ามทับงวดเดือน — OT ออฟฟิศไม่มี paid_slip_id จึงกันจ่ายซ้ำเองไม่ได้
  // (เกิดได้เมื่อเปลี่ยนวันตัดรอบแล้วช่วงของงวดใหม่เลื่อนไปคร่อมงวดเดิม)
  if (kind === 'monthly') {
    const { data: overlap } = await supabase
      .from('salary_runs')
      .select('period_key, period_start, period_end')
      .eq('kind', 'monthly')
      .lte('period_start', end)
      .gte('period_end', start)
      .limit(1)
      .maybeSingle()
    if (overlap) {
      const o = overlap as unknown as {
        period_key: string
        period_start: string
        period_end: string
      }
      return {
        error: `ช่วงวันที่ ${start} – ${end} ทับกับงวดเดือน${periodLabel(o.period_key)} (${o.period_start} – ${o.period_end}) — ถ้าเพิ่งเปลี่ยนวันตัดรอบ ให้ตั้งกลับหรือปรับให้ต่อเนื่องกับงวดเดิมก่อน`,
      }
    }
  }

  const { data, error } = await supabase
    .from('salary_runs')
    .insert({ kind, period_key: key, period_start: start, period_end: end, created_by: auth.userId })
    .select('id')
    .single()
  if (error || !data) {
    return {
      error: `เปิดงวดไม่สำเร็จ: ${error?.message || 'ไม่ทราบสาเหตุ'} (ตรวจว่ารัน migration เงินเดือนแล้ว)`,
    }
  }

  const id = (data as unknown as { id: string }).id
  await logActivity('CREATE_SALARY_RUN', { kind, period_key: key, period_start: start, period_end: end })

  let computed: number | undefined
  let computeError: string | undefined
  if (opts?.autoCompute) {
    const userIds = await autoSelectUserIds({ kind, period_start: start, period_end: end })
    // ไม่มีใครเข้าเกณฑ์ = งวดว่าง (ไม่ใช่ error) — admin ติ๊กคนเองในหน้างวดได้
    if (userIds.length === 0) computed = 0
    else {
      // งวดเปิดไปแล้ว (ไม่ rollback) — แต่ต้องบอกให้เห็นว่าคำนวณล้ม ไม่ใช่ "คำนวณให้ 0 คน"
      const res = await computeSlips(id, userIds)
      if (res.error) computeError = res.error
      else computed = res.computed ?? 0
    }
  }

  revalidatePath('/salary/runs')
  return { id, computed, computeError }
}

/**
 * คนที่ควรถูกติ๊กไว้ให้เองในงวดหนึ่ง
 * - ทุกชนิดงวด: ใครก็ตามที่มีเช็คอินหน้างาน "ค้างจ่าย" ในช่วงวันของงวด
 * - งวดเดือนเพิ่ม: ประจำ/ฝึกงานทุกคนที่มีโปรไฟล์เงินเดือน (ต้องได้เงินเดือนฐานแม้ไม่ได้ออกงาน)
 */
export async function autoSelectUserIds(run: RunWindow): Promise<string[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { fromISO, toISO } = runWindowISO(run)

  const [checkinsRes, profilesRes] = await Promise.all([
    supabase
      .from('staff_checkins')
      .select('user_id')
      .eq('check_type', 'onsite')
      .is('paid_slip_id', null)
      .gte('checked_in_at', fromISO)
      .lte('checked_in_at', toISO),
    run.kind === 'monthly'
      ? supabase
          .from('salary_profiles')
          .select('user_id')
          .in('employment_type', ['fulltime', 'intern'])
      : Promise.resolve({ data: [] as { user_id: string }[] }),
  ])

  const ids = new Set<string>()
  for (const r of ((checkinsRes.data || []) as unknown as { user_id: string | null }[])) {
    if (r.user_id) ids.add(r.user_id)
  }
  for (const r of ((profilesRes.data || []) as unknown as { user_id: string | null }[])) {
    if (r.user_id) ids.add(r.user_id)
  }
  // ลำดับคงที่ — แถวจาก PostgREST ไม่รับประกันลำดับ
  return Array.from(ids).sort(cmpText)
}

// ────────────────────────────────────────────────────────────────────────────
// ข้อเสนอเปิดงวด + เช็คอินค้างจ่ายที่เก่าเกินเกณฑ์เตือน (หน้า /salary/runs)
// ────────────────────────────────────────────────────────────────────────────

/** นับคน/เช็คอินหน้างานที่ยังไม่ถูกจ่ายในช่วงวันของงวดหนึ่ง */
async function countUnpaidOnsite(
  supabase: ReturnType<typeof createServiceClient>,
  run: RunWindow
): Promise<{ users: Set<string>; checkins: number }> {
  const { fromISO, toISO } = runWindowISO(run)
  const { data } = await supabase
    .from('staff_checkins')
    .select('user_id')
    .eq('check_type', 'onsite')
    .is('paid_slip_id', null)
    .gte('checked_in_at', fromISO)
    .lte('checked_in_at', toISO)

  const rows = (data || []) as unknown as { user_id: string | null }[]
  const users = new Set<string>()
  for (const r of rows) if (r.user_id) users.add(r.user_id)
  return { users, checkins: rows.length }
}

/**
 * งวดที่ "ถึงเวลาเปิดแล้วแต่ยังไม่เปิด" — สูงสุด 2 ใบ (สัปดาห์ล่าสุดที่จบแล้ว + เดือนที่ตัดรอบแล้ว)
 * ใช้ทำแบนเนอร์ "เปิดและคำนวณ" คลิกเดียวในหน้า /salary/runs
 *
 * งวดสัปดาห์ที่ไม่มีทั้งคนและเช็คอินค้างจ่ายถูกตัดทิ้ง (ไม่มีอะไรให้จ่าย)
 * งวดเดือนเสนอเสมอ — ประจำ/ฝึกงานต้องได้เงินเดือนฐานแม้ไม่มีใครออกงานเลย
 */
export async function getRunSuggestions(): Promise<RunSuggestion[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const { cutoff_day } = await getSalarySettings()
  const today = todayBangkok()

  const week = lastFinishedWeek(today)
  const weekKey = periodKeyFor('weekly', week.start, week.end)

  // งวดเดือนล่าสุดที่ตัดรอบไปแล้ว
  const { month, ...monthRange } = lastFinishedMonth(today, cutoff_day)
  const monthFinished = monthRange.end < today

  const { data: existing } = await supabase
    .from('salary_runs')
    .select('period_key')
    .in('period_key', [weekKey, month])
  const opened = new Set(
    ((existing || []) as unknown as { period_key: string }[]).map(r => r.period_key)
  )

  const suggestions: RunSuggestion[] = []

  if (!opened.has(weekKey)) {
    const { users, checkins } = await countUnpaidOnsite(
      supabase, { kind: 'weekly', period_start: week.start, period_end: week.end }
    )
    // ไม่มีคนและไม่มีเช็คอินค้าง = ไม่มีอะไรให้จ่ายในสัปดาห์นั้น — ไม่ต้องรบกวน admin
    if (users.size > 0 || checkins > 0) {
      suggestions.push({
        kind: 'weekly',
        start: week.start,
        end: week.end,
        label: periodLabel({ kind: 'weekly', period_start: week.start, period_end: week.end }),
        users: users.size,
        checkins,
      })
    }
  }

  if (monthFinished && !opened.has(month)) {
    const [{ users, checkins }, profilesRes] = await Promise.all([
      countUnpaidOnsite(
        supabase, { kind: 'monthly', period_start: monthRange.start, period_end: monthRange.end }
      ),
      supabase.from('salary_profiles').select('user_id').in('employment_type', ['fulltime', 'intern']),
    ])
    const ids = new Set(users)
    for (const r of ((profilesRes.data || []) as unknown as { user_id: string | null }[])) {
      if (r.user_id) ids.add(r.user_id)
    }
    suggestions.push({
      kind: 'monthly',
      month,
      start: monthRange.start,
      end: monthRange.end,
      label: periodLabel(month),
      users: ids.size,
      checkins,
    })
  }

  return suggestions
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * งานหน้างานของงวดก่อนที่ยังไม่ถูกจ่ายในสลิปใบไหนเลย จัดกลุ่มตามงวดเดือน (เก่าสุดก่อน)
 * ไม่มีงวดไหนดึงมาให้เองแล้ว (ยกเลิกเก็บตก) — จ่ายได้โดยปิดงวดสลิปของงวดนั้น
 *
 * นับตั้งแต่วันเริ่มของงวดแรกสุดที่มีในระบบ: เช็คอินก่อนเริ่มใช้ระบบถูกจ่ายนอกระบบไปแล้ว
 * ขอบบน = วันเริ่มของงวดเดือนล่าสุดที่ตัดรอบแล้ว (งวดนั้นยังปิดไม่ทันไม่ถือว่าค้าง)
 * หรือ opts.before (หน้าสลิปส่งวันเริ่มงวดของสลิปนั้น) · opts.userId = เฉพาะคนเดียว
 * ponytail: PostgREST คืนสูงสุด 1000 แถวต่อครั้ง — ค้างเกินนั้นตัวเลขจะน้อยกว่าจริง
 * ถ้าเกิดขึ้นให้แบ่งหน้าอ่าน (.range) จนหมด
 */
export async function listUnpaidPreviousPeriods(
  opts?: { userId?: string; before?: string }
): Promise<UnpaidPeriodRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const userId = typeof opts?.userId === 'string' && opts.userId.length > 0 && opts.userId.length <= 64
    ? opts.userId : null
  const beforeOpt = typeof opts?.before === 'string' && DATE_ONLY_RE.test(opts.before)
    ? opts.before : null

  const supabase = createServiceClient()
  const [{ data: runsRaw }, { cutoff_day }] = await Promise.all([
    supabase.from('salary_runs').select('id, kind, period_key, period_start'),
    readSalarySettings(supabase),
  ])
  const runs = (runsRaw || []) as unknown as {
    id: string; kind: string; period_key: string; period_start: string
  }[]
  if (runs.length === 0) return []

  const since = runs.reduce((min, r) => (r.period_start < min ? r.period_start : min), runs[0].period_start)
  const before = beforeOpt ?? lastFinishedMonth(todayBangkok(), cutoff_day).start
  if (since >= before) return []

  let query = supabase
    .from('staff_checkins')
    .select('user_id, checked_in_at')
    .eq('check_type', 'onsite')
    .is('paid_slip_id', null)
    .gte('checked_in_at', new Date(`${since}T00:00:00+07:00`).toISOString())
    .lt('checked_in_at', new Date(`${before}T00:00:00+07:00`).toISOString())
  if (userId) query = query.eq('user_id', userId)
  const { data } = await query.order('checked_in_at', { ascending: true })

  const rows = ((data || []) as unknown as { user_id: string | null; checked_in_at: string }[])
    .filter((r): r is UnpaidCheckinLite => !!r.user_id)
  const periods = groupUnpaidByPeriod(rows, cutoff_day, since, before)
  if (periods.length === 0) return []

  // งวดเดือนที่เปิดไว้แล้ว + สลิปของแต่ละคนในงวดนั้น — ทำลิงก์ไปที่งวด/สลิปได้ตรงๆ
  const runByMonth = new Map(
    runs.filter(r => r.kind === 'monthly').map(r => [r.period_key, r.id])
  )
  const runIds = periods.flatMap(p => runByMonth.get(p.month) ?? [])
  const userIds = periods.flatMap(p => p.people.map(x => x.user_id))
  const [names, slipsRes] = await Promise.all([
    namesByUserId(supabase, userIds),
    runIds.length > 0
      ? supabase.from('salary_slips').select('id, run_id, user_id').in('run_id', runIds)
      : Promise.resolve({ data: [] }),
  ])
  const slipOf = new Map(
    ((slipsRes.data || []) as unknown as { id: string; run_id: string; user_id: string }[])
      .map(s => [`${s.run_id}:${s.user_id}`, s.id])
  )

  return periods.map(p => {
    const runId = runByMonth.get(p.month) ?? null
    return {
      month: p.month,
      start: p.start,
      end: p.end,
      label: periodLabel(p.month),
      checkins: p.checkins,
      run_id: runId,
      people: p.people.map(x => ({
        user_id: x.user_id,
        full_name: actorName(names, x.user_id),
        checkins: x.checkins,
        slip_id: runId ? slipOf.get(`${runId}:${x.user_id}`) ?? null : null,
      })),
    }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// หน้างวด — หัวงวด + ตารางสลิป
// ────────────────────────────────────────────────────────────────────────────

/** หัวงวด + สลิปทั้งหมดในงวด (ชื่อคน join ฝั่ง JS — salary_slips มี FK ไป profiles 3 เส้น) */
export async function getRun(runId: string): Promise<{ error: string } | RunDetail> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const { data: runRaw } = await supabase
    .from('salary_runs')
    .select('id, kind, period_key, period_start, period_end, note, created_at')
    .eq('id', runId)
    .maybeSingle()
  if (!runRaw) return { error: 'ไม่พบงวดนี้' }
  const run: RunHeader = {
    ...(runRaw as unknown as RunHeader),
    kind: toRunKind((runRaw as unknown as { kind?: unknown }).kind),
  }

  // lines/accepted_warnings ดึงมาเพื่อคำนวณ "งานค้าง" ฝั่ง server เท่านั้น —
  // ไม่ส่งต่อไปหน้าจอ (บรรทัดเงินทั้งงวดหนักเกินจำเป็นสำหรับตารางรายชื่อ)
  const { data: slipsRaw } = await supabase
    .from('salary_slips')
    .select(
      'id, user_id, status, employment_type, total, warnings, accepted_warnings, lines, paid_history, reopen_history, computed_at, finalized_at, paid_at'
    )
    .eq('run_id', runId)

  type SlipRaw = {
    id: string
    user_id: string
    status: SlipStatus
    employment_type: EmploymentType
    total: number | string | null
    warnings: SalaryWarning[] | null
    accepted_warnings: AcceptedWarning[] | null
    lines: SalaryLine[] | null
    paid_history: PaidEntry[] | null
    reopen_history: ReopenEntry[] | null
    computed_at: string | null
    finalized_at: string | null
    paid_at: string | null
  }
  const slipRows = (slipsRaw || []) as unknown as SlipRaw[]
  const names = await namesByUserId(supabase, slipRows.map(s => s.user_id))

  const slips: RunSlipRow[] = slipRows
    .map(s => {
      const who = names.get(s.user_id)
      const warnings = Array.isArray(s.warnings) ? s.warnings : []
      return {
        id: s.id,
        user_id: s.user_id,
        full_name: who?.full_name ?? null,
        nickname: who?.nickname ?? null,
        status: s.status,
        employment_type: toEmploymentType(s.employment_type),
        total: Number(s.total || 0),
        warnings,
        pending_count: pendingItems(
          warnings,
          Array.isArray(s.accepted_warnings) ? s.accepted_warnings : [],
          Array.isArray(s.lines) ? s.lines : []
        ).count,
        reopened:
          (Array.isArray(s.paid_history) && s.paid_history.length > 0) ||
          (Array.isArray(s.reopen_history) && s.reopen_history.length > 0),
        computed_at: s.computed_at,
        finalized_at: s.finalized_at,
        paid_at: s.paid_at,
      }
    })
    // เรียงฝั่ง JS — ชื่อคนมาจากอีก query จึงสั่ง order ที่ DB ไม่ได้
    .sort((a, b) => cmpText(a.full_name || a.nickname || '', b.full_name || b.nickname || ''))

  // ติ๊กให้เองเฉพาะคนที่ยังไม่มีสลิปในงวดนี้ — คนที่มีสลิปแล้วใช้ปุ่ม "คำนวณใหม่" ในตาราง
  const hasSlip = new Set(slips.map(s => s.user_id))
  const suggestedUserIds = (await autoSelectUserIds(run)).filter(id => !hasSlip.has(id))

  return { run, slips, suggestedUserIds }
}

// ────────────────────────────────────────────────────────────────────────────
// คำนวณสลิป
// ────────────────────────────────────────────────────────────────────────────

/**
 * คำนวณ (หรือคำนวณใหม่) สลิปร่างของคนที่เลือกในงวดหนึ่ง
 * - ไม่มีโปรไฟล์เงินเดือน → ข้าม แล้วคืนใน skipped (ไม่ล้มทั้งชุด)
 * - สลิปที่ปิดงวดแล้ว → ข้าม (guard trigger กันอยู่แล้ว แต่บอกผู้ใช้ให้รู้เรื่อง)
 * - รายการปรับมือ + ค่าที่แก้มือของสลิปเดิมถูกคงไว้ (compute.ts §6)
 */
export async function computeSlips(
  runId: string,
  userIds: string[]
): Promise<ComputeSlipsResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const ids = Array.from(new Set((userIds || []).map(v => (v || '').trim()).filter(Boolean)))
  if (!runId || ids.length === 0) return { error: 'ยังไม่ได้เลือกคน' }

  const supabase = createServiceClient()
  const { data: runRaw } = await supabase
    .from('salary_runs')
    .select('id, kind, period_start, period_end')
    .eq('id', runId)
    .maybeSingle()
  if (!runRaw) return { error: 'ไม่พบงวดนี้' }
  const runRow = runRaw as unknown as {
    id: string
    kind?: unknown
    period_start: string
    period_end: string
  }
  const run: RunWindow & { id: string } = {
    id: runRow.id,
    kind: toRunKind(runRow.kind),
    period_start: runRow.period_start,
    period_end: runRow.period_end,
  }

  // คืนเฉพาะผลสรุป — แถวที่เขียนเป็นของผู้เรียกภายในไฟล์นี้เท่านั้น
  const res = await computeSlipsCore(supabase, run, ids)
  return res.error ? { error: res.error } : { computed: res.computed, skipped: res.skipped }
}

/**
 * แกนของ computeSlips — ไม่ตรวจสิทธิ์ (ไม่ export: ผู้เรียกทุกตัวในไฟล์นี้ตรวจ admin แล้ว)
 * คืนแถวที่ upsert ไปด้วย ให้ action ที่แก้สลิปใบเดียวสร้าง SlipDetail ได้โดยไม่ต้องอ่านซ้ำ
 */
async function computeSlipsCore(
  supabase: ReturnType<typeof createServiceClient>,
  run: RunWindow & { id: string },
  ids: string[]
): Promise<ComputeSlipsResult & { rows?: Record<string, unknown>[] }> {
  const runId = run.id

  // ขอบเขตเป็น "วันไทย" — แปลงเป็น instant UTC ก่อนยิง filter
  // ดึงเช็คอินในช่วงวันของงวด แล้วให้ selectCheckinsForRun คัดตามชนิดงวด/สถานะจ่าย
  const onsiteFrom = onsiteFromFor(run)
  const { fromISO, toISO } = runWindowISO(run)

  // ทุกอย่างอ่านพร้อมกันรอบเดียว · readDuties คืนทุกหน้าที่รวมที่ปิดใช้งาน —
  // ตั้งใจ: สลิปเก่าอาจอ้างรหัสที่เพิ่งปิดไป
  const [settings, duties, profilesRes, salaryProfilesRes, existingRes, checkinsRes] = await Promise.all([
    readSalarySettings(supabase),
    readDuties(supabase),
    // ผู้ใช้ที่ถูกลบไปแล้วจะไม่เจอที่นี่ → ตกไปอยู่ใน skipped ว่า 'ไม่พบผู้ใช้'
    supabase.from('profiles').select('id, full_name, nickname').in('id', ids).is('deleted_at', null),
    supabase
      .from('salary_profiles')
      .select('user_id, employment_type, base_salary, work_start, work_end, ot_rate')
      .in('user_id', ids),
    supabase
      .from('salary_slips')
      .select('id, user_id, status, lines, adjustments')
      .eq('run_id', runId)
      .in('user_id', ids),
    supabase
      .from('staff_checkins')
      .select(
        'id, user_id, check_type, checked_in_at, checked_out_at, event_id, duties, out_of_province, note, paid_slip_id, events:event_id(name)'
      )
      .in('user_id', ids)
      .gte('checked_in_at', fromISO)
      .lte('checked_in_at', toISO),
  ])

  // ข้อมูลต้นทางอ่านไม่ได้ = คำนวณผิดแบบเงียบๆ (ได้สลิปยอด 0 ที่ดูเหมือนถูก) — ต้องล้มให้เห็น
  const readError = checkinsRes.error || salaryProfilesRes.error || existingRes.error
  if (readError) {
    return {
      error: `อ่านข้อมูลต้นทางไม่สำเร็จ: ${readError.message} (ตรวจว่ารัน migration เงินเดือนแล้ว)`,
    }
  }

  type NameRaw = { id: string; full_name: string | null; nickname: string | null }
  type SalaryProfileRaw = {
    user_id: string
    employment_type: EmploymentType
    base_salary: number | string | null
    work_start: string | null
    work_end: string | null
    ot_rate: number | string | null
  }
  type ExistingRaw = {
    id: string
    user_id: string
    status: SlipStatus
    lines: SalaryLine[] | null
    adjustments: SalaryAdjustment[] | null
  }

  if (profilesRes.error) {
    return { error: `อ่านรายชื่อผู้ใช้ไม่สำเร็จ: ${profilesRes.error.message} (ตรวจว่ารัน migration profiles.deleted_at แล้ว)` }
  }
  const names = new Map(((profilesRes.data || []) as unknown as NameRaw[]).map(p => [p.id, p]))
  const salaryProfiles = new Map(
    ((salaryProfilesRes.data || []) as unknown as SalaryProfileRaw[]).map(p => [p.user_id, p])
  )
  const existing = new Map(
    ((existingRes.data || []) as unknown as ExistingRaw[]).map(s => [s.user_id, s])
  )

  const checkinsByUser = new Map<string, CheckinInput[]>()
  for (const raw of (checkinsRes.data || []) as unknown as CheckinRaw[]) {
    const list = checkinsByUser.get(raw.user_id)
    if (list) list.push(rawToCheckinInput(raw))
    else checkinsByUser.set(raw.user_id, [rawToCheckinInput(raw)])
  }

  const skipped: SkippedUser[] = []
  const rows: Record<string, unknown>[] = []
  const logs: { user_id: string; total: number; lines: number; warnings: number }[] = []
  const computedAt = new Date().toISOString()

  for (const userId of ids) {
    const who = names.get(userId)
    const name = who?.full_name || who?.nickname || 'ไม่ทราบชื่อ'

    if (!who) {
      skipped.push({ user_id: userId, name, reason: 'ไม่พบผู้ใช้' })
      continue
    }

    const prev = existing.get(userId)
    if (prev && prev.status !== 'draft') {
      skipped.push({ user_id: userId, name, reason: 'ปิดงวดแล้ว' })
      continue
    }

    const sp = salaryProfiles.get(userId)
    if (!sp) {
      skipped.push({ user_id: userId, name, reason: 'ยังไม่ตั้งค่าเงินเดือน' })
      continue
    }

    const employment_type: EmploymentType =
      toEmploymentType(sp.employment_type)
    const base_salary = Number(sp.base_salary || 0)
    const adjustments: SalaryAdjustment[] = Array.isArray(prev?.adjustments) ? prev.adjustments : []

    // เช็คอินที่เข้าสลิปนี้ได้จริง — ตัดที่จ่ายไปแล้ว (ยกเว้นที่สลิปใบนี้เองจ่าย) และ
    // ตัดเช็คอินออฟฟิศออกเมื่อไม่ใช่งวดเดือน ก่อนส่งเข้าเครื่องคำนวณ
    const checkins = selectCheckinsForRun(checkinsByUser.get(userId) || [], run, prev?.id)
    const calc = calcFromProfile(sp, settings.out_of_province_rate)

    const result = computeSlip({
      profile: {
        employment_type,
        base_salary,
        work_start: calc.work_start,
        work_end: calc.work_end,
        ot_rate: calc.ot_rate,
      },
      checkins,
      duties,
      oopRate: calc.oop_rate,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      runKind: run.kind,
      onsiteFrom,
      previousLines: Array.isArray(prev?.lines) ? prev.lines : undefined,
      adjustments,
    })

    // เช็คอินหน้างานทุกใบที่สลิปนี้กิน — รวมใบที่ไม่ได้สร้างบรรทัดเลย (รันเนอร์/ยังไม่ระบุ
    // หน้าที่) ไม่งั้นตอนปิดงวดมันไม่ถูกประทับ paid_slip_id แล้วงวดถัดไปจ่ายซ้ำ
    // (เช็คอินออฟฟิศไม่เข้ากติกาจ่ายครั้งเดียว — ไม่ต้องประทับ)
    const checkin_ids = checkins.filter(c => c.check_type === 'onsite').map(c => c.id).sort(cmpText)

    rows.push({
      run_id: runId,
      user_id: userId,
      status: 'draft',
      employment_type,
      // snapshot "ฐานในสลิปใบนี้" — ฟรีแลนซ์ไม่มีฐานทุกชนิดงวด และงวดสัปดาห์/กำหนดเอง
      // ก็ไม่มีฐาน (compute.ts §7) · เก็บ 0 ไว้เลย เพื่อให้ recalcTotal (แก้มือ/รายการปรับ)
      // ได้ยอดตรงกับ computeSlip โดยไม่ต้องรู้ชนิดงวด — ไม่งั้นแก้บรรทัดทีเดียวยอดเด้ง
      // เป็น ฐาน + บรรทัด และท้ายสลิปก็จะโชว์ "เงินเดือนฐาน" ที่ไม่ได้ถูกรวมในยอดสุทธิ
      base_salary:
        run.kind === 'monthly' && employment_type !== 'freelance' ? base_salary : 0,
      checkin_ids,
      lines: result.lines,
      adjustments,
      warnings: result.warnings,
      total: result.total,
      computed_at: computedAt,
    })
    logs.push({
      user_id: userId,
      total: result.total,
      lines: result.lines.length,
      warnings: result.warnings.length,
    })
  }

  if (rows.length > 0) {
    // upsert ชุดเดียว — UNIQUE(run_id, user_id) ทำให้ "คำนวณใหม่" ทับแถวเดิม
    const { error } = await supabase
      .from('salary_slips')
      .upsert(rows, { onConflict: 'run_id,user_id' })
    if (error) {
      return { error: `คำนวณไม่สำเร็จ: ${error.message} (ตรวจว่ารัน migration เงินเดือนแล้ว)` }
    }

    for (const l of logs) {
      await logActivity(
        'COMPUTE_SALARY_SLIP',
        { run_id: runId, total: l.total, lines: l.lines, warnings: l.warnings },
        l.user_id
      )
    }
  }

  revalidatePath(`/salary/runs/${runId}`)
  revalidatePath('/salary/runs')
  return { computed: rows.length, skipped, rows }
}

// ────────────────────────────────────────────────────────────────────────────
// ลบสลิปร่าง
// ────────────────────────────────────────────────────────────────────────────

/** เอาคนออกจากงวด — ได้เฉพาะสลิปร่าง (guard trigger กันอีกชั้นที่ DB) */
export async function deleteSlip(slipId: string): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_slips')
    .select('id, run_id, user_id, status, paid_history, reopen_history')
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิปนี้' }

  const slip = data as unknown as {
    id: string
    run_id: string
    user_id: string
    status: SlipStatus
    paid_history: PaidEntry[] | null
    reopen_history: ReopenEntry[] | null
  }
  if (slip.status !== 'draft') return { error: 'สลิปที่ปิดงวดแล้วลบไม่ได้' }
  // สลิปที่เคยปิดงวด/จ่ายแล้วแล้วถูกเปิดแก้ กลับมาเป็น "ร่าง" ก็จริง แต่ลบทิ้งไม่ได้ —
  // เช็คอินถูกปลดประทับไปแล้ว ถ้าลบใบนี้ ประวัติการจ่าย/การเปิดแก้จะหายไปทั้งชุด
  // (guard trigger กันอีกชั้นที่ฐานข้อมูล)
  const everPaid = Array.isArray(slip.paid_history) && slip.paid_history.length > 0
  const everReopened = Array.isArray(slip.reopen_history) && slip.reopen_history.length > 0
  if (everPaid || everReopened) {
    return { error: 'สลิปที่เคยปิดงวด/จ่ายแล้ว ลบไม่ได้ — ปิดงวดใหม่แทน' }
  }

  const { error } = await supabase.from('salary_slips').delete().eq('id', slipId)
  if (error) return { error: `ลบไม่สำเร็จ: ${error.message}` }

  await logActivity('DELETE_SALARY_SLIP', { run_id: slip.run_id, slip_id: slip.id }, slip.user_id)
  revalidatePath(`/salary/runs/${slip.run_id}`)
  revalidatePath('/salary/runs')
  return { success: true }
}

// ────────────────────────────────────────────────────────────────────────────
// หน้าสลิป
// ────────────────────────────────────────────────────────────────────────────

/**
 * สลิปหนึ่งใบพร้อมงวด · ชื่อ · บัญชีธนาคาร (แสดงอย่างเดียว)
 * สิทธิ์: admin เห็นทุกใบ · เจ้าของเห็นเฉพาะที่ปิดงวดแล้ว · คนอื่นไม่เห็นเลย
 * ทุกกรณีที่ไม่มีสิทธิ์คืนข้อความเดียวกัน — ไม่บอกว่าสลิปนั้นมีอยู่จริงหรือไม่
 *
 * เฉพาะ admin ได้ `checkins` (ข้อมูลต้นทางในงวด) + `duties` (rate card ทั้งหมด
 * รวมที่ปิดใช้งาน — ใช้แปลรหัสหน้าที่ของเช็คอินเก่าเป็นชื่อ) + `events`
 * (ตัวเลือกอีเวนต์รอบๆ งวด ใช้ผูกเช็คอินในไดอะล็อก) + `calc` (เวลาทำงาน/อัตรา OT
 * ของเจ้าของสลิป + อัตราเบิ้ล — ใช้ทำภาพตัวอย่างตอนแก้ในแถว) ติดมาด้วย
 * พนักงานได้อีเวนต์ว่างและ `calc: null` เสมอ
 *
 * rate card อ่านด้วย readDuties (ไม่ผ่านด่าน admin ของ listDuties ที่คืน [] ให้เจ้าของสลิป)
 * เพราะสิทธิ์ถูกตรวจที่นี่แล้ว และ rate card ไม่ใช่ข้อมูลส่วนบุคคลของใคร
 */
export async function getSlipForView(
  slipId: string
): Promise<
  | { error: string }
  | {
      slip: SlipDetail
      isAdmin: boolean
      checkins: SlipCheckinRow[]
      duties: SalaryDutyRow[]
      events: SlipEventOption[]
      /** null = ไม่ใช่ admin หรือเจ้าของสลิปยังไม่มีโปรไฟล์เงินเดือน (หน้าจอข้ามภาพตัวอย่าง) */
      calc: SlipCalcInputs | null
    }
> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  const isAdmin = role === 'admin'

  const supabase = createServiceClient()
  const raw = await fetchSlipRaw(supabase, slipId)
  if (!raw) return { error: 'ไม่พบสลิป' }

  if (!isAdmin && (raw.user_id !== userId || raw.status === 'draft')) return { error: 'ไม่พบสลิป' }

  const slip = toSlipDetail(raw, await loadSlipHeader(supabase, raw))

  // เจ้าของสลิป: เห็นมุมมองรายวันของตัวเองแบบอ่านอย่างเดียว จึงต้องได้เช็คอินที่
  // ถูกจ่ายในสลิปใบนี้ + รายชื่อหน้าที่ (ไว้แปลงรหัสเป็นชื่อไทย) แต่ไม่ได้ลิสต์
  // อีเวนต์ทั้งช่วงงวด (เป็นข้อมูลของทั้งบริษัท และไม่มีช่องให้เลือกอยู่แล้ว —
  // ชื่ออีเวนต์ที่ผูกไว้ติดมากับแถวเช็คอินเอง) และไม่ได้ค่าคำนวณ (ไม่มีการแก้ในแถว)
  if (!isAdmin) {
    const [ownCheckins, duties] = await Promise.all([
      listOwnerSlipCheckins(supabase, raw.user_id, slip.id),
      readDuties(supabase),
    ])
    return { slip, isAdmin, checkins: ownCheckins, duties, events: [], calc: null }
  }

  // ขอบเขตของตาราง/ตัวเลือกในหน้าสลิป = ขอบเขตเดียวกับที่เครื่องคำนวณใช้ (onsiteFromFor)
  const runWindow: RunWindow = {
    kind: slip.kind,
    period_start: slip.period_start,
    period_end: slip.period_end,
  }
  const [checkins, duties, events, calc] = await Promise.all([
    listSlipCheckins(supabase, slip.user_id, slip.id, runWindow),
    readDuties(supabase),
    listPeriodEvents(supabase, onsiteFromFor(runWindow), slip.period_end),
    loadSlipCalc(supabase, slip.user_id),
  ])
  return { slip, isAdmin, checkins, duties, events, calc }
}

/** คอลัมน์ของ salary_slips ที่ SlipDetail ต้องใช้ */
const SLIP_COLUMNS =
  'id, run_id, user_id, status, employment_type, base_salary, lines, adjustments, warnings, accepted_warnings, reopen_history, paid_history, paid_total, total, computed_at, finalized_at, finalized_by, paid_at, paid_by, costs_synced_at'

type SlipRaw = {
  id: string
  run_id: string
  user_id: string
  status: SlipStatus
  employment_type: EmploymentType
  base_salary: number | string | null
  lines: SalaryLine[] | null
  adjustments: SalaryAdjustment[] | null
  warnings: SalaryWarning[] | null
  accepted_warnings: AcceptedWarning[] | null
  reopen_history: ReopenEntry[] | null
  paid_history: PaidEntry[] | null
  paid_total: number | string | null
  total: number | string | null
  computed_at: string | null
  finalized_at: string | null
  finalized_by: string | null
  paid_at: string | null
  paid_by: string | null
  costs_synced_at: string | null
}

/** ส่วนของ SlipDetail ที่มาจากตารางอื่น (งวด · เจ้าของสลิป · คนกดปิดงวด/จ่าย) */
type SlipHeaderParts = {
  /** null = หางวดไม่เจอ */
  run: (RunWindow & { id: string; period_key: string }) | null
  who: {
    full_name?: string | null
    nickname?: string | null
    department?: string | null
    bank_name?: string | null
    bank_account_number?: string | null
    account_holder_name?: string | null
  }
  actors: Map<string, { full_name: string | null; nickname: string | null }>
}

/** แถวสลิปดิบ — ไม่ตรวจสิทธิ์ (ผู้เรียกตรวจแล้ว) · ไม่มี id / หาไม่เจอ = null */
async function fetchSlipRaw(
  supabase: ReturnType<typeof createServiceClient>,
  slipId: string
): Promise<SlipRaw | null> {
  if (!slipId) return null
  const { data } = await supabase
    .from('salary_slips')
    .select(SLIP_COLUMNS)
    .eq('id', slipId)
    .maybeSingle()
  return (data as unknown as SlipRaw | null) ?? null
}

/** งวด + ชื่อ/บัญชีเจ้าของสลิป + ชื่อคนกดปิดงวด/จ่าย — ยิงพร้อมกันรอบเดียว */
async function loadSlipHeader(
  supabase: ReturnType<typeof createServiceClient>,
  raw: Pick<SlipRaw, 'run_id' | 'user_id' | 'finalized_by' | 'paid_by'>
): Promise<SlipHeaderParts> {
  const [runRes, profileRes, actors] = await Promise.all([
    supabase
      .from('salary_runs')
      .select('kind, period_key, period_start, period_end')
      .eq('id', raw.run_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name, nickname, department, bank_name, bank_account_number, account_holder_name')
      .eq('id', raw.user_id)
      .maybeSingle(),
    // คนกดปิดงวด/จ่ายแล้ว — ยังไม่มีใครกด = ลิสต์ว่าง แล้ว namesByUserId คืนทันทีโดยไม่ยิง query
    namesByUserId(supabase, [raw.finalized_by, raw.paid_by].filter((v): v is string => !!v)),
  ])

  const runRow = runRes.data as unknown as (Partial<RunHeader> & { kind?: unknown }) | null
  return {
    run: runRow
      ? {
          id: raw.run_id,
          kind: toRunKind(runRow.kind),
          period_key: runRow.period_key || '',
          period_start: runRow.period_start || '',
          period_end: runRow.period_end || '',
        }
      : null,
    who: (profileRes.data || {}) as unknown as SlipHeaderParts['who'],
    actors,
  }
}

/** แถวดิบ + ส่วนหัว → SlipDetail (รูปเดียวที่หน้าเพจและทุก action ที่แก้สลิปคืน) */
function toSlipDetail(raw: SlipRaw, h: SlipHeaderParts): SlipDetail {
  const { who, actors } = h
  return {
    id: raw.id,
    run_id: raw.run_id,
    user_id: raw.user_id,
    status: raw.status,
    kind: h.run ? h.run.kind : toRunKind(undefined),
    employment_type: toEmploymentType(raw.employment_type),
    base_salary: Number(raw.base_salary || 0),
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    accepted_warnings: Array.isArray(raw.accepted_warnings) ? raw.accepted_warnings : [],
    reopen_history: Array.isArray(raw.reopen_history) ? raw.reopen_history : [],
    paid_history: Array.isArray(raw.paid_history) ? raw.paid_history : [],
    paid_total: raw.paid_total === null || raw.paid_total === undefined ? null : Number(raw.paid_total),
    total: Number(raw.total || 0),
    computed_at: raw.computed_at,
    finalized_at: raw.finalized_at,
    paid_at: raw.paid_at,
    costs_synced_at: raw.costs_synced_at,
    finalized_by_name: actorName(actors, raw.finalized_by),
    paid_by_name: actorName(actors, raw.paid_by),
    period_key: h.run?.period_key || '',
    period_start: h.run?.period_start || '',
    period_end: h.run?.period_end || '',
    full_name: who.full_name ?? null,
    nickname: who.nickname ?? null,
    department: who.department ?? null,
    bank_name: who.bank_name ?? null,
    bank_account_number: who.bank_account_number ?? null,
    account_holder_name: who.account_holder_name ?? null,
  }
}

/**
 * ค่าที่ภาพตัวอย่างฝั่ง client ต้องใช้ — โปรไฟล์เงินเดือนของเจ้าของสลิป + อัตราเบิ้ล
 * ผ่าน calcFromProfile ตัวเดียวกับ computeSlips · ไม่มีโปรไฟล์ = null
 */
async function loadSlipCalc(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string
): Promise<SlipCalcInputs | null> {
  const [spRes, settings] = await Promise.all([
    supabase
      .from('salary_profiles')
      .select('work_start, work_end, ot_rate')
      .eq('user_id', userId)
      .maybeSingle(),
    readSalarySettings(supabase),
  ])
  const sp = spRes.data as unknown as Parameters<typeof calcFromProfile>[0] | null
  return sp ? calcFromProfile(sp, settings.out_of_province_rate) : null
}

/**
 * อีเวนต์ที่ใช้เลือกผูกกับเช็คอินในสลิปนี้ — กว้างกว่าหน้าต่างเช็คอินของงวดข้างละ 7 วัน
 * (ผู้เรียกส่ง from = onsiteFromFor(run) = วันเริ่มงวด)
 * เพราะงานที่จัดคร่อมรอยต่องวด (เช่น เช็คอินวันที่ 25 แต่ event_date วันที่ 26)
 * ยังต้องเลือกได้ — ไม่งั้นสลิปจะติด warning "ไม่ได้ผูกกับอีเวนต์" แก้ไม่ได้
 */
async function listPeriodEvents(
  supabase: ReturnType<typeof createServiceClient>,
  from: string,
  periodEnd: string
): Promise<SlipEventOption[]> {
  if (!from || !periodEnd) return []

  const { data } = await supabase
    .from('events')
    .select('id, name, event_date')
    .gte('event_date', shiftDay(from, -7))
    .lte('event_date', shiftDay(periodEnd, 7))
    .order('event_date', { ascending: true })

  type Raw = { id: string; name: string | null; event_date: string | null }
  return ((data || []) as unknown as Raw[]).map(e => ({
    id: e.id,
    name: e.name || '(ไม่มีชื่อ)',
    event_date: e.event_date || '',
  }))
}

/** คอลัมน์ของ staff_checkins ที่มุมมองรายวันในหน้าสลิปต้องใช้ (ชื่ออีเวนต์ฝังมาด้วย) */
const SLIP_CHECKIN_COLUMNS =
  'id, check_type, checked_in_at, checked_out_at, event_id, duties, province, district, out_of_province, note, paid_slip_id, events:event_id(name)'

type SlipCheckinRaw = {
  id: string
  check_type: CheckinInput['check_type']
  checked_in_at: string
  checked_out_at: string | null
  event_id: string | null
  duties: string[] | null
  province: string | null
  district: string | null
  out_of_province: boolean | null
  note: string | null
  paid_slip_id: string | null
  // PostgREST คืน to-one เป็น object แต่บางเวอร์ชันห่อเป็น array — รับทั้งสองแบบ
  events: { name: string | null } | { name: string | null }[] | null
}

function toSlipCheckinRow(r: SlipCheckinRaw): SlipCheckinRow {
  return {
    id: r.id,
    check_type: r.check_type,
    checked_in_at: r.checked_in_at,
    checked_out_at: r.checked_out_at,
    event_id: r.event_id,
    event_name: embeddedEventName(r.events),
    duties: Array.isArray(r.duties) ? r.duties : [],
    province: r.province,
    district: r.district,
    out_of_province: !!r.out_of_province,
    note: r.note,
    paid_slip_id: r.paid_slip_id,
  }
}

/**
 * เช็คอินที่เจ้าของสลิป (ไม่ใช่ admin) เห็นในมุมมองรายวัน — อ่านอย่างเดียว
 * เจ้าของเห็นสลิปได้เฉพาะตอนปิดงวด/จ่ายแล้ว ซึ่งเช็คอินของงวดถูกประทับ
 * `paid_slip_id = slip.id` ไว้แล้ว ชุดนี้จึงตรงกับที่คิดเงินในสลิปพอดี
 * (สลิปที่ถูกเปิดแก้กลับเป็นร่าง = เจ้าของมองไม่เห็นทั้งใบอยู่แล้ว)
 */
async function listOwnerSlipCheckins(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  slipId: string
): Promise<SlipCheckinRow[]> {
  const { data } = await supabase
    .from('staff_checkins')
    .select(SLIP_CHECKIN_COLUMNS)
    .eq('user_id', userId)
    .eq('paid_slip_id', slipId)
    .order('checked_in_at', { ascending: true })

  return ((data || []) as unknown as SlipCheckinRaw[]).map(toSlipCheckinRow)
}

/**
 * เช็คอินที่แสดงในหน้าสลิป — ใช้ตัวเลือกตัวเดียวกับเครื่องคำนวณ (selectCheckinsForRun)
 * คือเช็คอินหน้างานค้างจ่ายตั้งแต่ onsiteFromFor(run) ถึงวันสิ้นงวด + เช็คอินออฟฟิศ
 * ในช่วงงวดเฉพาะงวดเดือน
 *
 * เพิ่มจากนั้นอีกอย่างเดียว: เช็คอินหน้างานในหน้าต่างเดียวกันที่ "ถูกจ่ายในสลิปอื่นไปแล้ว"
 * ก็ยังแสดง (พร้อมป้ายบอก + ห้ามแก้) ไม่งั้น admin จะงงว่าเช็คอินวันนั้นหายไปไหน
 */
async function listSlipCheckins(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  slipId: string,
  run: RunWindow
): Promise<SlipCheckinRow[]> {
  if (!run.period_start || !run.period_end) return []

  // ขอบเขตเป็น "วันไทย" — แปลงเป็น instant UTC ก่อนยิง filter
  const { fromISO, toISO } = runWindowISO(run)

  const { data } = await supabase
    .from('staff_checkins')
    .select(SLIP_CHECKIN_COLUMNS)
    .eq('user_id', userId)
    .gte('checked_in_at', fromISO)
    .lte('checked_in_at', toISO)
    .order('checked_in_at', { ascending: true })

  const rows = (data || []) as unknown as SlipCheckinRaw[]
  const selected = new Set(selectCheckinsForRun(rows, run, slipId).map(r => r.id))

  return rows
    .filter(r => selected.has(r.id) || (!!r.paid_slip_id && r.paid_slip_id !== slipId))
    .map(toSlipCheckinRow)
}

// ────────────────────────────────────────────────────────────────────────────
// แก้สลิปร่าง — แก้มือทับบรรทัด · รายการปรับมือ · คำนวณใหม่
//
// ทุก action ในหมวดนี้ตรวจ requireAdmin + status === 'draft' ฝั่ง server เสมอ
// guard trigger ที่ DB เป็นด่านสุดท้าย ไม่ใช่ด่านแรก
// ────────────────────────────────────────────────────────────────────────────

/** สลิปร่างที่โหลดมาแก้ — รูปเดียวที่ helper ในหมวดนี้ใช้ร่วมกัน */
type DraftSlip = {
  id: string
  run_id: string
  user_id: string
  employment_type: EmploymentType
  base_salary: number
  lines: SalaryLine[]
  adjustments: SalaryAdjustment[]
  warnings: SalaryWarning[]
  accepted_warnings: AcceptedWarning[]
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * ยอดสุทธิของสลิป = ฐาน (เฉพาะประจำ) + Σ บรรทัด + Σ รายการปรับมือ
 * สูตรเดียวกับ compute.ts §7 และใช้ lineAmount ตัวเดียวกัน — ทุก action ที่แก้สลิป
 * ต้องผ่านตัวนี้ ไม่งั้นยอดในหัวสลิปกับบรรทัดจะเพี้ยนคนละทาง
 */
function recalcTotal(
  slip: Pick<DraftSlip, 'employment_type' | 'base_salary' | 'lines' | 'adjustments'>
): number {
  const base = slip.employment_type === 'freelance' ? 0 : slip.base_salary
  const lineTotal = slip.lines.reduce((sum, l) => sum + lineAmount(l), 0)
  const adjustTotal = slip.adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  return round2(base + lineTotal + adjustTotal)
}

/**
 * คำเตือน "ยังไม่กรอกรันเนอร์" ให้ตรงกับบรรทัดปัจจุบัน — กรอกยอดแล้วต้องหาย
 * ล้างค่าแล้วต้องกลับมา (คำเตือนอื่นเป็นเรื่องของข้อมูลต้นทาง ต้องคำนวณใหม่ถึงจะเปลี่ยน)
 * ข้อความรูปแบบเดียวกับ compute.ts §6
 */
function syncRunnerWarnings(lines: SalaryLine[], warnings: SalaryWarning[]): SalaryWarning[] {
  const next = warnings.filter(w => w.code !== 'runner_missing')
  for (const l of lines) {
    if (l.kind !== 'runner' || !isMissingAmount(l)) continue
    next.push({
      code: 'runner_missing',
      date: l.date,
      message: `ยังไม่ได้กรอกยอด${l.label.split(' · ')[0]}ของวันที่ ${l.date}`,
    })
  }
  return next.sort(
    (a, b) =>
      cmpText(a.date, b.date) ||
      cmpText(a.code, b.code) ||
      cmpText(a.checkin_id ?? '', b.checkin_id ?? '')
  )
}

/** โหลดสลิปที่แก้ได้ — ปิดงวดแล้วหรือหาไม่เจอ = คืน error ไม่ต้องรอ trigger */
async function loadDraftSlip(
  supabase: ReturnType<typeof createServiceClient>,
  slipId: string
): Promise<{ error: string } | { slip: DraftSlip }> {
  if (!slipId) return { error: 'ไม่พบสลิป' }

  const { data } = await supabase
    .from('salary_slips')
    .select(
      'id, run_id, user_id, status, employment_type, base_salary, lines, adjustments, warnings, accepted_warnings'
    )
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิป' }

  type Raw = {
    id: string
    run_id: string
    user_id: string
    status: SlipStatus
    employment_type: EmploymentType
    base_salary: number | string | null
    lines: SalaryLine[] | null
    adjustments: SalaryAdjustment[] | null
    warnings: SalaryWarning[] | null
    accepted_warnings: AcceptedWarning[] | null
  }
  const raw = data as unknown as Raw

  if (raw.status !== 'draft') return { error: 'สลิปที่ปิดงวดแล้วแก้ไม่ได้' }

  return {
    slip: {
      id: raw.id,
      run_id: raw.run_id,
      user_id: raw.user_id,
      employment_type: toEmploymentType(raw.employment_type),
      base_salary: Number(raw.base_salary || 0),
      lines: Array.isArray(raw.lines) ? raw.lines : [],
      adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [],
      warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
      accepted_warnings: Array.isArray(raw.accepted_warnings) ? raw.accepted_warnings : [],
    },
  }
}

/** เขียนสลิปกลับ พร้อมคำนวณยอด + คำเตือนรันเนอร์ใหม่ให้ตรงกับบรรทัด */
async function saveDraftSlip(
  supabase: ReturnType<typeof createServiceClient>,
  slip: DraftSlip
): Promise<{ error?: string; total?: number }> {
  const total = recalcTotal(slip)
  const { error } = await supabase
    .from('salary_slips')
    .update({
      lines: slip.lines,
      adjustments: slip.adjustments,
      warnings: syncRunnerWarnings(slip.lines, slip.warnings),
      total,
    })
    .eq('id', slip.id)
    // กันกรณีสลิปถูกปิดงวดคั่นระหว่างที่เราโหลดมาแก้
    .eq('status', 'draft')
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  revalidatePath(`/salary/${slip.id}`)
  revalidatePath(`/salary/runs/${slip.run_id}`)
  revalidatePath('/salary/runs')
  return { total }
}

/**
 * ผลของ action ที่แก้สลิปร่างทีละจุด — คืนสลิปที่บันทึกแล้วกลับไปด้วย
 * (หน้าสลิปเอาไปอัปเดต state ตรงๆ ไม่ต้องรีเฟรชทั้งหน้า)
 */
export type SlipMutationResult = { error?: string; success?: boolean; slip?: SlipDetail }

/**
 * แก้มือทับหนึ่งบรรทัด — เก็บทั้งค่าที่ระบบคำนวณ (`computed_amount`) และค่าที่แก้
 * เหตุผลบังคับทุกชนิดยกเว้นรันเนอร์ (บรรทัดรันเนอร์ใช้ช่องนี้เป็น "กรอกยอดรันเนอร์"
 * ซึ่งเป็นการกรอกครั้งแรก ไม่ใช่การทับค่าที่ระบบคิด)
 */
export async function overrideSlipLine(
  slipId: string,
  lineKey: string,
  amount: number,
  note: string
): Promise<SlipMutationResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const key = (lineKey || '').trim()
  if (!key) return { error: 'ไม่พบบรรทัดนี้ในสลิป' }

  const value = Number(amount)
  if (!Number.isFinite(value) || value < 0) return { error: 'จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const line = slip.lines.find(l => l.key === key)
  if (!line) return { error: 'ไม่พบบรรทัดนี้ในสลิป' }

  const trimmed = (note || '').trim()
  if (line.kind !== 'runner' && !trimmed) return { error: 'กรุณาระบุเหตุผลของการแก้มือ' }

  const computed = line.computed_amount
  line.amount = round2(value)
  if (trimmed) line.override_note = trimmed
  else delete line.override_note

  const saved = await saveDraftSlip(supabase, slip)
  if (saved.error) return { error: saved.error }

  await logActivity(
    'OVERRIDE_SALARY_LINE',
    {
      slip_id: slip.id,
      run_id: slip.run_id,
      lineKey: key,
      computed,
      amount: line.amount,
      note: trimmed || null,
    },
    slip.user_id
  )
  const reloaded = await reloadSlip(slip.id)
  return 'error' in reloaded ? { success: true } : { success: true, slip: reloaded.slip }
}

/** คืนบรรทัดกลับไปใช้ค่าที่ระบบคำนวณ (รันเนอร์กลับไปเป็น "ยังไม่กรอก") */
export async function clearSlipLineOverride(
  slipId: string,
  lineKey: string
): Promise<SlipMutationResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const key = (lineKey || '').trim()
  if (!key) return { error: 'ไม่พบบรรทัดนี้ในสลิป' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const line = slip.lines.find(l => l.key === key)
  if (!line) return { error: 'ไม่พบบรรทัดนี้ในสลิป' }

  const previous = line.amount
  // รันเนอร์ไม่มีค่าที่ระบบคิดให้ (computed_amount = 0) — ล้างแล้วต้องกลับเป็น "ยังไม่กรอก"
  line.amount = line.kind === 'runner' ? null : line.computed_amount
  delete line.override_note

  const saved = await saveDraftSlip(supabase, slip)
  if (saved.error) return { error: saved.error }

  await logActivity(
    'OVERRIDE_SALARY_LINE',
    {
      slip_id: slip.id,
      run_id: slip.run_id,
      lineKey: key,
      computed: line.computed_amount,
      amount: line.amount,
      previous,
      cleared: true,
    },
    slip.user_id
  )
  const reloaded = await reloadSlip(slip.id)
  return 'error' in reloaded ? { success: true } : { success: true, slip: reloaded.slip }
}

/** เพิ่มรายการปรับมือ (โบนัส / หัก / ประกันสังคม ฯลฯ) — จำนวนติดลบได้ */
export async function addSlipAdjustment(
  slipId: string,
  label: string,
  amount: number
): Promise<SlipMutationResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const name = (label || '').trim()
  if (!name) return { error: 'กรุณาระบุชื่อรายการ' }

  const value = Number(amount)
  if (!Number.isFinite(value)) return { error: 'จำนวนเงินต้องเป็นตัวเลข' }
  if (value === 0) return { error: 'จำนวนเงินต้องไม่เป็นศูนย์' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const adjustment: SalaryAdjustment = {
    id: crypto.randomUUID(),
    label: name,
    amount: round2(value),
  }
  slip.adjustments = [...slip.adjustments, adjustment]

  const saved = await saveDraftSlip(supabase, slip)
  if (saved.error) return { error: saved.error }

  await logActivity(
    'OVERRIDE_SALARY_LINE',
    { slip_id: slip.id, run_id: slip.run_id, adjustment },
    slip.user_id
  )
  const reloaded = await reloadSlip(slip.id)
  return 'error' in reloaded ? { success: true } : { success: true, slip: reloaded.slip }
}

/** ลบรายการปรับมือหนึ่งรายการออกจากสลิปร่าง */
export async function removeSlipAdjustment(
  slipId: string,
  adjustmentId: string
): Promise<SlipMutationResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const id = (adjustmentId || '').trim()
  if (!id) return { error: 'ไม่พบรายการปรับมือนี้' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const removed = slip.adjustments.find(a => a.id === id)
  if (!removed) return { error: 'ไม่พบรายการปรับมือนี้' }
  slip.adjustments = slip.adjustments.filter(a => a.id !== id)

  const saved = await saveDraftSlip(supabase, slip)
  if (saved.error) return { error: saved.error }

  await logActivity(
    'OVERRIDE_SALARY_LINE',
    { slip_id: slip.id, run_id: slip.run_id, adjustment: removed, removed: true },
    slip.user_id
  )
  const reloaded = await reloadSlip(slip.id)
  return 'error' in reloaded ? { success: true } : { success: true, slip: reloaded.slip }
}

/**
 * คำนวณสลิปใบเดียวใหม่จากข้อมูลต้นทางล่าสุด — ต่อยอด computeSlips ตรงๆ
 * ค่าที่แก้มือและรายการปรับมือถูกคงไว้ให้แล้วในนั้น (compute.ts §6)
 */
export async function recomputeSlip(
  slipId: string
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const raw = await fetchSlipRaw(supabase, slipId)
  if (!raw) return { error: 'ไม่พบสลิป' }
  if (raw.status !== 'draft') return { error: 'สลิปที่ปิดงวดแล้วแก้ไม่ได้' }

  const res = await recomputeLoaded(supabase, raw, await loadSlipHeader(supabase, raw))
  return 'error' in res ? { error: res.error } : { success: true }
}

/**
 * แกนของ "คำนวณสลิปใบนี้ใหม่" — ไม่ตรวจสิทธิ์ (ไม่ export: ผู้เรียกตรวจ admin แล้ว)
 * รับสลิป + ส่วนหัวที่ผู้เรียกโหลดไว้แล้ว (ไม่โหลดซ้ำ) แล้วคืน SlipDetail ที่สร้างจาก
 * แถวที่เพิ่ง upsert จริง — ไม่ต้องอ่านสลิปกลับมาอีกรอบ
 */
async function recomputeLoaded(
  supabase: ReturnType<typeof createServiceClient>,
  raw: SlipRaw,
  header: SlipHeaderParts
): Promise<SlipEditResult> {
  if (!header.run) return { error: 'ไม่พบงวดนี้' }

  const res = await computeSlipsCore(supabase, header.run, [raw.user_id])
  if (res.error) return { error: res.error }
  const skipped = (res.skipped || [])[0]
  if (skipped) return { error: `คำนวณใหม่ไม่สำเร็จ — ${skipped.reason}` }

  // แถวในฐานข้อมูลหลัง upsert = แถวเดิม + คอลัมน์ที่เพิ่งเขียนทับ
  const written = (res.rows || []).find(r => r.user_id === raw.user_id)
  revalidatePath(`/salary/${raw.id}`)
  return { slip: toSlipDetail({ ...raw, ...written } as SlipRaw, header) }
}

// ────────────────────────────────────────────────────────────────────────────
// แก้ต้นทาง (เช็คอิน) จากในสลิป + ยอมรับคำเตือน + กรอกรันเนอร์เป็นชุด
//
// ทุกตัวในหมวดนี้ทำ "แก้ → คำนวณใหม่ → คืนสลิปใหม่" จบใน server action เดียว
// หน้าสลิปจึงไม่ต้องยิงหลายรอบแล้ว router.refresh() ตาม (spec §Actions)
// ────────────────────────────────────────────────────────────────────────────

/** ผลของ action ที่แก้ต้นทางแล้วคืนสลิปที่คำนวณใหม่แล้วกลับไปเลย */
export type SlipEditResult = { error: string } | { slip: SlipDetail }

/** สิ่งที่แก้ได้ในเช็คอินหนึ่งใบจากในสลิป — ไม่ส่งฟิลด์ไหนมา = ไม่แตะฟิลด์นั้น */
export interface SlipCheckinPatch {
  /** ISO instant ของเวลาเข้าใหม่ */
  checked_in_at?: string
  /** ISO instant ของเวลาออกใหม่ · null = กลับเป็น "ยังไม่ออก" */
  checked_out_at?: string | null
  duties?: string[]
  /** events.id · null = ปลดการผูกอีเวนต์ */
  event_id?: string | null
  out_of_province?: boolean
  check_type?: CheckinInput['check_type']
}

/** เช็คอินที่ลืมบันทึก — เพิ่มย้อนหลังจากท้ายตารางในสลิป */
export interface AddSlipCheckinInput {
  /** YYYY-MM-DD ตามเวลาไทย */
  date: string
  /** HH:MM ตามเวลาไทย */
  checkin_time: string
  /** HH:MM — ไม่ใส่ = ยังไม่ออก (ไม่คิด OT) */
  checkout_time?: string | null
  /**
   * ผู้ใช้ยืนยันแล้วว่าเวลาออกเป็นของ "วันถัดไป" (กะข้ามคืน)
   * ถ้าไม่ส่ง เวลาออกที่ ≤ เวลาเข้าจะถูกปฏิเสธ — ไม่มีการเดา +1 วันให้เงียบๆ
   */
  overnight?: boolean
  duties: string[]
  event_id?: string | null
  province?: string | null
  district?: string | null
  out_of_province?: boolean
}

/**
 * สลิปใบเดียวในรูปเดียวกับที่หน้าเพจได้จาก getSlipForView — เฉพาะตัวสลิป
 * (ไม่โหลดเช็คอิน/หน้าที่/อีเวนต์ที่ action ไม่ได้คืน) · ไม่ตรวจสิทธิ์: ผู้เรียกตรวจ admin แล้ว
 */
async function reloadSlip(slipId: string): Promise<SlipEditResult> {
  const supabase = createServiceClient()
  const raw = await fetchSlipRaw(supabase, slipId)
  if (!raw) return { error: 'ไม่พบสลิป' }
  return { slip: toSlipDetail(raw, await loadSlipHeader(supabase, raw)) }
}

/**
 * แก้เช็คอินหนึ่งใบจากในสลิป แล้วคำนวณสลิปใหม่ให้เสร็จในครั้งเดียว
 * เขียน staff_checkins ผ่าน action ของโมดูลเช็คอินเสมอ (validation/log/ref-tag อยู่ที่นั่น)
 *
 * ลำดับรอบฐานข้อมูล (spec salary-slip-smooth-edit §B — งบ ≤ 10 รอบต่อเนื่อง):
 * ตรวจ admin → สลิป ∥ เช็คอิน → เขียนเช็คอิน ∥ ส่วนหัวสลิป → log ∥ คำนวณใหม่
 */
export async function editSlipCheckin(
  slipId: string,
  checkinId: string,
  patch: SlipCheckinPatch
): Promise<SlipEditResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!checkinId) return { error: 'ไม่พบเช็คอินนี้' }

  const supabase = createServiceClient()
  const [raw, { data }] = await Promise.all([
    fetchSlipRaw(supabase, slipId),
    supabase
      .from('staff_checkins')
      .select('id, user_id, paid_slip_id')
      .eq('id', checkinId)
      .maybeSingle(),
  ])
  if (!raw) return { error: 'ไม่พบสลิป' }
  if (raw.status !== 'draft') return { error: 'สลิปที่ปิดงวดแล้วแก้ไม่ได้' }
  const slip = raw

  if (!data) return { error: 'ไม่พบเช็คอินนี้' }
  const row = data as unknown as { id: string; user_id: string; paid_slip_id: string | null }
  if (row.user_id !== slip.user_id) return { error: 'เช็คอินนี้ไม่ใช่ของเจ้าของสลิป' }
  if (row.paid_slip_id && row.paid_slip_id !== slip.id) {
    return { error: 'เช็คอินนี้ถูกจ่ายในสลิปอื่นแล้ว แก้ไม่ได้' }
  }

  const fd = new FormData()
  fd.set('checkin_id', checkinId)
  let touched = false

  if (patch.check_type) {
    fd.set('check_type', patch.check_type)
    touched = true
  }
  if (patch.checked_in_at !== undefined) {
    if (Number.isNaN(Date.parse(patch.checked_in_at))) return { error: 'เวลาเข้าไม่ถูกต้อง' }
    const p = bangkokParts(patch.checked_in_at)
    // adminEditCheckin บังคับให้วันที่กับเวลาเข้ามาคู่กันเสมอ
    fd.set('checkin_date', p.date)
    fd.set('checkin_time', p.time)
    touched = true
  }
  if (patch.checked_out_at !== undefined) {
    if (patch.checked_out_at === null) {
      fd.set('clear_checkout', 'true')
    } else {
      if (Number.isNaN(Date.parse(patch.checked_out_at))) return { error: 'เวลาออกไม่ถูกต้อง' }
      const p = bangkokParts(patch.checked_out_at)
      // ส่งวันที่ออกไปด้วยเสมอ — กะข้ามคืนจึงไม่ถูกดึงกลับมาเป็นวันเดียวกับเวลาเข้า
      fd.set('checkout_date', p.date)
      fd.set('checkout_time', p.time)
    }
    touched = true
  }
  if (patch.duties) {
    fd.set('duties_set', '1')
    for (const code of patch.duties) fd.append('duties', code)
    touched = true
  }
  if (patch.out_of_province !== undefined) {
    fd.set('out_of_province', patch.out_of_province ? 'true' : 'false')
    touched = true
  }

  /** เขียนเช็คอินผ่าน action ของโมดูลเช็คอิน — ตามลำดับเดิมทุกอย่าง */
  async function write(): Promise<{ error?: string; saved: boolean }> {
    let saved = false
    if (touched) {
      const res = await adminEditCheckin(fd)
      if (res.error) return { error: res.error, saved }
      saved = true
    }

    // adminEditCheckin ไม่แตะ event_id — ต้องยิง action แยกและให้เสร็จก่อนคำนวณใหม่
    if (patch.event_id !== undefined) {
      const linked = await adminUpdateCheckinEvent(
        checkinId,
        patch.event_id ? `stock:${patch.event_id}` : null
      )
      if (linked.error) return { error: linked.error, saved }
      saved = true
    }
    return { saved }
  }

  // ส่วนหัวสลิป (งวด/ชื่อ) ไม่ขึ้นกับเช็คอิน — โหลดไปพร้อมกับการเขียน
  const [header, written] = await Promise.all([loadSlipHeader(supabase, slip), write()])
  if (written.error) return { error: written.error }
  const { saved } = written

  // log ต้องเสร็จก่อน action คืนค่า — ยิงพร้อมกับการคำนวณใหม่แล้วรอทั้งคู่
  const [, recomputed] = await Promise.all([
    saved
      ? logActivity(
          'EDIT_SALARY_CHECKIN',
          { slipId: slip.id, checkinId, patch: Object.keys(patch) },
          slip.user_id
        )
      : undefined,
    recomputeLoaded(supabase, slip, header),
  ])
  if ('error' in recomputed) {
    // เช็คอินถูกแก้ไปแล้วจริง — ข้อความต้องบอกให้ชัด ไม่งั้น admin คิดว่าไม่มีอะไรเกิดขึ้น
    return {
      error: saved
        ? `แก้เช็คอินแล้ว แต่คำนวณใหม่ไม่สำเร็จ: ${recomputed.error}`
        : recomputed.error,
    }
  }
  return recomputed
}

/** เพิ่มเช็คอิน "ไปหน้างาน" ย้อนหลังให้เจ้าของสลิป แล้วคำนวณสลิปใหม่ */
export async function addSlipCheckin(
  slipId: string,
  input: AddSlipCheckinInput
): Promise<SlipEditResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const supabase = createServiceClient()
  const slip = await fetchSlipRaw(supabase, slipId)
  if (!slip) return { error: 'ไม่พบสลิป' }
  if (slip.status !== 'draft') return { error: 'สลิปที่ปิดงวดแล้วแก้ไม่ได้' }

  if (!input.date) return { error: 'กรุณาเลือกวันที่' }
  if (!input.checkin_time) return { error: 'กรุณาระบุเวลาเข้า' }
  if (!input.duties || input.duties.length === 0) {
    return { error: 'กรุณาเลือกหน้าที่หน้างานอย่างน้อย 1 อย่าง' }
  }

  const fd = new FormData()
  fd.set('target_user_id', slip.user_id)
  fd.set('check_type', 'onsite')
  fd.set('checkin_date', input.date)
  fd.set('checkin_time', input.checkin_time)
  if (input.checkout_time) {
    fd.set('checkout_time', input.checkout_time)
    // กะข้ามคืนต้องถูกยืนยันจากหน้าจอก่อน — ที่นี่แค่แปลงเป็นวันที่ออกให้ adminCheckIn
    // (ไม่ยืนยัน = ไม่ส่ง checkout_date แล้ว adminCheckIn จะปฏิเสธ "เวลาออกต้องหลังเวลาเข้า")
    if (input.overnight) fd.set('checkout_date', shiftDay(input.date, 1))
  }
  fd.set('duties_set', '1')
  for (const code of input.duties) fd.append('duties', code)
  // adminCheckIn รับ event_id เป็นรูปแบบมีพรีฟิกซ์ — `stock:UUID` = events.id ตรงๆ
  if (input.event_id) fd.set('event_id', `stock:${input.event_id}`)
  if (input.province) fd.set('province', input.province)
  if (input.district) fd.set('district', input.district)
  fd.set('out_of_province', input.out_of_province ? 'true' : 'false')
  fd.set('note', 'เพิ่มย้อนหลังจากสลิปเงินเดือน')

  // ส่วนหัวสลิปไม่ขึ้นกับเช็คอิน — โหลดไปพร้อมกับการเพิ่ม (แกนเดียวกับ editSlipCheckin)
  const [header, res] = await Promise.all([loadSlipHeader(supabase, slip), adminCheckIn(fd)])
  if (res.error) return { error: res.error }

  const [, recomputed] = await Promise.all([
    logActivity(
      'ADD_SALARY_CHECKIN',
      {
        slipId: slip.id,
        runId: slip.run_id,
        date: input.date,
        duties: input.duties,
        overnight: !!input.overnight,
      },
      slip.user_id
    ),
    recomputeLoaded(supabase, slip, header),
  ])
  // เช็คอินถูกเพิ่มไปแล้วจริง — ต้องบอกให้ชัดว่าเหลือแค่ขั้นคำนวณใหม่ที่ล้ม
  if ('error' in recomputed) {
    return { error: `เพิ่มเช็คอินแล้ว แต่คำนวณใหม่ไม่สำเร็จ: ${recomputed.error}` }
  }
  return recomputed
}

/**
 * กรอกยอดรันเนอร์หลายวันในครั้งเดียว ("ใช้ยอดนี้กับวันที่ยังว่าง")
 * ความหมายเดียวกับ overrideSlipLine ของบรรทัดรันเนอร์ (เหตุผลไม่บังคับ) แต่บันทึกทีเดียว
 */
export async function setRunnerAmounts(
  slipId: string,
  entries: Array<{ key: string; amount: number }>
): Promise<SlipEditResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!entries || entries.length === 0) return { error: 'ไม่มีรายการที่จะบันทึก' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const applied: Array<{ key: string; amount: number }> = []
  for (const entry of entries) {
    const key = (entry?.key || '').trim()
    const line = key ? slip.lines.find(l => l.key === key) : undefined
    if (!line) return { error: `ไม่พบบรรทัดนี้ในสลิป (${key || '-'})` }
    if (line.kind !== 'runner') return { error: 'บรรทัดนี้ไม่ใช่รันเนอร์ — ใช้การแก้มือแทน' }

    const value = Number(entry.amount)
    if (!Number.isFinite(value) || value < 0) return { error: 'จำนวนเงินต้องเป็นตัวเลขไม่ติดลบ' }
    line.amount = round2(value)
    applied.push({ key, amount: line.amount })
  }

  const saved = await saveDraftSlip(supabase, slip)
  if (saved.error) return { error: saved.error }

  await logActivity(
    'SET_RUNNER_AMOUNTS',
    { slipId: slip.id, runId: slip.run_id, runner: applied },
    slip.user_id
  )
  return reloadSlip(slipId)
}

/** เขียน accepted_warnings กลับ (เฉพาะสลิปร่าง — guard ที่ DB ปฏิเสธหลังปิดงวดอยู่แล้ว) */
async function saveAcceptedWarnings(
  supabase: ReturnType<typeof createServiceClient>,
  slip: DraftSlip,
  next: AcceptedWarning[]
): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('salary_slips')
    .update({ accepted_warnings: next })
    .eq('id', slip.id)
    .eq('status', 'draft')
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  revalidatePath(`/salary/${slip.id}`)
  revalidatePath(`/salary/runs/${slip.run_id}`)
  return {}
}

/**
 * "ยอมรับ" คำเตือนหนึ่งรายการ — ไม่นับเป็นงานค้างตอนปิดงวดอีกต่อไป
 * รันเนอร์ที่ยังไม่กรอกยอมรับไม่ได้ (พิมพ์ 0 ได้ถ้าวันนั้นไม่มีค่ารันเนอร์จริง)
 */
export async function acceptSlipWarning(
  slipId: string,
  key: string
): Promise<SlipMutationResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const wanted = (key || '').trim()
  if (!wanted) return { error: 'ไม่พบคำเตือนนี้' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const pending = pendingItems(slip.warnings, slip.accepted_warnings, slip.lines)
  const group = pending.groups.find(g => g.items.some(i => i.key === wanted))
  if (!group) return { error: 'ไม่พบคำเตือนนี้ในสลิป' }
  if (!isAcceptable(group.code)) {
    return { error: 'รันเนอร์ต้องกรอกยอด — ยอมรับข้ามไม่ได้ (กรอก 0 ได้ถ้าวันนั้นไม่มีค่ารันเนอร์)' }
  }
  if (!slip.accepted_warnings.some(a => a.key === wanted)) {
    const next: AcceptedWarning[] = [
      ...slip.accepted_warnings,
      { key: wanted, by: auth.userId, at: new Date().toISOString() },
    ]
    const saved = await saveAcceptedWarnings(supabase, slip, next)
    if (saved.error) return { error: saved.error }

    await logActivity(
      'ACCEPT_SALARY_WARNING',
      { slipId: slip.id, runId: slip.run_id, key: wanted },
      slip.user_id
    )
  }

  // คืนสลิปล่าสุดกลับไป — หน้าจอจะได้ไม่ต้องประกอบรายการยอมรับเองแล้วทับผลการแก้อื่น
  const reloaded = await reloadSlip(slipId)
  if ('error' in reloaded) return { error: reloaded.error }
  return { success: true, slip: reloaded.slip }
}

/** ถอนการยอมรับคำเตือน — กลับมานับเป็นงานค้างอีกครั้ง */
export async function unacceptSlipWarning(
  slipId: string,
  key: string
): Promise<SlipMutationResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const wanted = (key || '').trim()
  if (!wanted) return { error: 'ไม่พบคำเตือนนี้' }

  const supabase = createServiceClient()
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const next = slip.accepted_warnings.filter(a => a.key !== wanted)
  if (next.length !== slip.accepted_warnings.length) {
    const saved = await saveAcceptedWarnings(supabase, slip, next)
    if (saved.error) return { error: saved.error }

    await logActivity(
      'UNACCEPT_SALARY_WARNING',
      { slipId: slip.id, runId: slip.run_id, key: wanted },
      slip.user_id
    )
  }

  const reloaded = await reloadSlip(slipId)
  if ('error' in reloaded) return { error: reloaded.error }
  return { success: true, slip: reloaded.slip }
}

// ────────────────────────────────────────────────────────────────────────────
// ปิดงวด / จ่ายแล้ว
//
// ปิดงวดแล้วสลิปถูกล็อกที่ฐานข้อมูล (guard trigger §7 ของ migration ปฏิเสธการแก้
// ตัวเลขและการลบ) — action ในหมวดนี้จึงตรวจสิทธิ์/สถานะ/ความครบของยอดให้จบฝั่ง
// server ก่อนเสมอ เพื่อให้ผู้ใช้ได้ข้อความไทย ไม่ใช่ข้อความ exception จาก Postgres
// ────────────────────────────────────────────────────────────────────────────

/** ผลของ "ปิดงวดที่เหลือทั้งหมด" — ใบที่ปิดไม่ได้ไม่หยุดใบอื่น */
export interface FinalizeRemainingResult {
  error?: string
  finalized?: number
  skipped?: SkippedUser[]
}

/** สลิปที่กำลังจะปิดงวด — เท่าที่ finalizeOne ต้องใช้ */
type FinalizableSlip = {
  id: string
  run_id: string
  user_id: string
  lines: SalaryLine[]
  warnings: SalaryWarning[]
  accepted_warnings: AcceptedWarning[]
  total: number
}

/** คอลัมน์ที่ทั้งปิดงวดใบเดียวและปิดที่เหลือทั้งหมดอ่านเหมือนกัน */
const FINALIZE_COLUMNS = 'id, run_id, user_id, status, lines, warnings, accepted_warnings, total'

/** งวดเท่าที่ข้อความแจ้งเตือนต้องรู้ (ชื่อสลิปแยกชนิดงวด) */
type RunRef = { kind?: string | null; period_key: string; period_start?: string; period_end?: string }

/** คอลัมน์งวดที่ต้องอ่านมาทำชื่อสลิปในแจ้งเตือน */
const RUN_LABEL_COLUMNS = 'kind, period_key, period_start, period_end'

const EMPTY_RUN_REF: RunRef = { kind: 'monthly', period_key: '' }

type FinalizeRaw = {
  id: string
  run_id: string
  user_id: string
  status: SlipStatus
  lines: SalaryLine[] | null
  warnings: SalaryWarning[] | null
  accepted_warnings: AcceptedWarning[] | null
  total: number | string | null
}

function toFinalizable(raw: FinalizeRaw): FinalizableSlip {
  return {
    id: raw.id,
    run_id: raw.run_id,
    user_id: raw.user_id,
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    accepted_warnings: Array.isArray(raw.accepted_warnings) ? raw.accepted_warnings : [],
    total: Number(raw.total || 0),
  }
}

/**
 * ปิดงวดสลิปร่างหนึ่งใบ — ผู้เรียกตรวจสิทธิ์ admin + สถานะ draft มาแล้ว
 *
 * การเปลี่ยนสถานะ + ประทับ paid_slip_id ให้เช็คอินในบรรทัด ทำใน RPC finalize_salary_slip
 * ที่ฐานข้อมูล (ล็อกแถว + transaction เดียว) — ถ้ามีเช็คอินถูกจ่ายในสลิปอื่นไปก่อน
 * (เปิดสองงวดทับกันแล้วปิดอีกงวดก่อน) RPC จะปฏิเสธพร้อมข้อความไทยให้คำนวณใหม่
 * จากนั้นค่อย log → แจ้งเตือนเจ้าของ
 */
async function finalizeOne(
  supabase: ReturnType<typeof createServiceClient>,
  slip: FinalizableSlip,
  run: RunRef,
  adminId: string
): Promise<{ error?: string }> {
  // spec §งานค้าง (Q4): ปิดงวดได้เมื่องานค้าง = 0 — คำเตือนที่ยอมรับแล้วไม่นับ
  // (เข้มกว่าเดิมที่บล็อกเฉพาะรันเนอร์ที่ยังไม่กรอกยอด)
  const pending = pendingItems(slip.warnings, slip.accepted_warnings, slip.lines)
  if (pending.count > 0) {
    return { error: `ยังมีงานค้าง ${pending.count} รายการ — แก้หรือยอมรับก่อนปิดงวด` }
  }

  const { error } = await supabase.rpc('finalize_salary_slip', {
    p_slip_id: slip.id,
    p_user_id: adminId,
  })
  // ข้อความจาก RPC เป็นภาษาไทยอยู่แล้ว (ไม่พบสลิป / ปิดงวดแล้ว / เช็คอินถูกจ่ายในสลิปอื่น)
  if (error) return { error: error.message || 'ปิดงวดไม่สำเร็จ' }

  await logActivity(
    'FINALIZE_SALARY_SLIP',
    { slipId: slip.id, runId: slip.run_id, total: slip.total },
    slip.user_id
  )

  // ลิงก์ /salary/[slipId] ประกอบจาก reference_type + reference_id ในกระดิ่ง
  // (admin ที่ปิดงวดสลิปของตัวเองไม่ได้แจ้งเตือน — createNotifications กรอง actor ออกให้)
  await createNotifications({
    userIds: [slip.user_id],
    type: 'salary_finalized',
    // งวดเดือน = "สลิปเงินเดือน …" · งวดสัปดาห์/กำหนดเอง = "สลิปค่าจ้าง …"
    title: `${slipTitle(run)} ปิดงวดแล้ว`,
    body: `ยอดสุทธิ ${fmtMoney(slip.total)} บาท`,
    referenceType: 'salary_slip',
    referenceId: slip.id,
    actorId: adminId,
  })

  // sync ต้นทุนเข้า Costs — ล้มเหลวห้ามทำให้ปิดงวดล้ม (สลิปปิดไปแล้วใน RPC)
  // admin กด "sync ต้นทุนอีกครั้ง" ในหน้าสลิปได้ภายหลัง
  try {
    const sync = await syncSlipToCostsInternal(supabase, slip.id, adminId)
    if (sync.error) console.error(`[salary] sync ต้นทุนของสลิป ${slip.id} ไม่สำเร็จ: ${sync.error}`)
  } catch (err) {
    console.error(`[salary] sync ต้นทุนของสลิป ${slip.id} ไม่สำเร็จ:`, err)
  }

  return {}
}

/** หน้าที่ต้องรีเฟรชหลังสถานะสลิปเปลี่ยน (รวมหน้า "สลิปของฉัน" ของเจ้าของด้วย) */
function revalidateSlipPaths(slipId: string, runId: string) {
  revalidatePath(`/salary/${slipId}`)
  revalidatePath(`/salary/runs/${runId}`)
  revalidatePath('/salary/runs')
  revalidatePath('/salary')
}

/** ปิดงวดสลิปใบเดียว — หลังจากนี้แก้ตัวเลขไม่ได้อีก */
export async function finalizeSlip(slipId: string): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!slipId) return { error: 'ไม่พบสลิป' }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_slips')
    .select(FINALIZE_COLUMNS)
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิป' }

  const raw = data as unknown as FinalizeRaw
  if (raw.status !== 'draft') return { error: 'สลิปนี้ปิดงวดแล้ว' }

  const { data: runRaw } = await supabase
    .from('salary_runs')
    .select(RUN_LABEL_COLUMNS)
    .eq('id', raw.run_id)
    .maybeSingle()
  const runRef = (runRaw as unknown as RunRef | null) || EMPTY_RUN_REF

  const res = await finalizeOne(supabase, toFinalizable(raw), runRef, auth.userId)
  if (res.error) return { error: res.error }

  revalidateSlipPaths(slipId, raw.run_id)
  return { success: true }
}

/**
 * ปิดงวดสลิปร่างที่เหลือทั้งงวดในครั้งเดียว (spec user story 18)
 * ใบที่ยังกรอกยอดรันเนอร์ไม่ครบถูกข้ามพร้อมเหตุผล — ไม่หยุดใบที่เหลือ
 */
export async function finalizeRemainingSlips(runId: string): Promise<FinalizeRemainingResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!runId) return { error: 'ไม่พบงวดนี้' }

  const supabase = createServiceClient()
  const { data: runRaw } = await supabase
    .from('salary_runs')
    .select(`id, ${RUN_LABEL_COLUMNS}`)
    .eq('id', runId)
    .maybeSingle()
  if (!runRaw) return { error: 'ไม่พบงวดนี้' }
  const runRef = runRaw as unknown as RunRef

  const { data, error } = await supabase
    .from('salary_slips')
    .select(FINALIZE_COLUMNS)
    .eq('run_id', runId)
    .eq('status', 'draft')
  if (error) return { error: `อ่านสลิปในงวดไม่สำเร็จ: ${error.message}` }

  const rows = (data || []) as unknown as FinalizeRaw[]
  if (rows.length === 0) return { finalized: 0, skipped: [] }

  const names = await namesByUserId(supabase, rows.map(r => r.user_id))
  const skipped: SkippedUser[] = []
  let finalized = 0

  for (const row of rows) {
    const res = await finalizeOne(supabase, toFinalizable(row), runRef, auth.userId)
    if (res.error) {
      skipped.push({
        user_id: row.user_id,
        name: actorName(names, row.user_id) || 'ไม่ทราบชื่อ',
        reason: res.error,
      })
      continue
    }
    finalized += 1
    revalidatePath(`/salary/${row.id}`)
  }
  // ลำดับคงที่ — แถวจาก PostgREST ไม่รับประกันลำดับ
  skipped.sort((a, b) => cmpText(a.name, b.name))

  revalidatePath(`/salary/runs/${runId}`)
  revalidatePath('/salary/runs')
  revalidatePath('/salary')
  return { finalized, skipped }
}

/** ทำเครื่องหมายว่าโอนเงินแล้ว — ได้เฉพาะสลิปที่ปิดงวดแล้ว (ไม่มีแจ้งเตือน) */
export async function markSlipPaid(slipId: string): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!slipId) return { error: 'ไม่พบสลิป' }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_slips')
    .select('id, run_id, user_id, status, total, paid_history')
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิป' }

  const slip = data as unknown as {
    id: string
    run_id: string
    user_id: string
    status: SlipStatus
    total: number | string | null
    paid_history: PaidEntry[] | null
  }
  if (slip.status === 'draft') return { error: 'ต้องปิดงวดก่อน' }
  if (slip.status === 'paid') return { error: 'จ่ายแล้ว' }

  const total = Number(slip.total || 0)
  const paidAt = new Date().toISOString()
  const { data: updated, error } = await supabase
    .from('salary_slips')
    .update({
      status: 'paid',
      paid_at: paidAt,
      paid_by: auth.userId,
      // ยอดที่จ่ายจริงครั้งนี้ + ประวัติทุกครั้ง — สลิปที่เปิดแก้แล้วจ่ายซ้ำจึงเทียบส่วนต่างได้
      paid_total: total,
      paid_history: [
        ...(Array.isArray(slip.paid_history) ? slip.paid_history : []),
        { at: paidAt, by: auth.userId, total },
      ],
    })
    .eq('id', slipId)
    // guard trigger อนุญาตเฉพาะ finalized → paid — กันสลิปที่เพิ่งถูกกดจ่ายจากอีกหน้าต่าง
    .eq('status', 'finalized')
    .select('id')
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }
  if (!updated || updated.length === 0) return { error: 'จ่ายแล้ว' }

  await logActivity(
    'MARK_SALARY_PAID',
    { slipId: slip.id, runId: slip.run_id, total },
    slip.user_id
  )

  revalidateSlipPaths(slipId, slip.run_id)
  return { success: true }
}

/**
 * เปิดสลิปที่ปิดงวด/จ่ายแล้วกลับมาแก้ (spec §เปิดแก้ไขหลังปิดงวด)
 *
 * งานหนักอยู่ใน RPC reopen_salary_slip (ปลดประทับเช็คอิน + ย้อนสถานะ + บันทึกประวัติ
 * ใน transaction เดียว) — ที่นี่ทำเฉพาะสิทธิ์ · แจ้งเตือนเจ้าของ · activity log
 * สลิปกลับเป็นร่างทั้งใบ เจ้าของจึงมองไม่เห็นจนกว่าจะปิดงวดใหม่ (กติกาเดิมของ getSlipForView)
 */
export async function reopenSlip(
  slipId: string,
  reason: string
): Promise<{ error?: string; success?: boolean }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!slipId) return { error: 'ไม่พบสลิป' }

  const trimmed = (reason || '').trim()
  if (trimmed.length < REOPEN_MIN_REASON) {
    return { error: `เหตุผลต้องยาวอย่างน้อย ${REOPEN_MIN_REASON} ตัวอักษร` }
  }

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_slips')
    .select('id, run_id, user_id, status, total')
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิป' }

  const slip = data as unknown as {
    id: string
    run_id: string
    user_id: string
    status: SlipStatus
    total: number | string | null
  }
  if (slip.status === 'draft') return { error: 'สลิปนี้ยังเป็นร่าง' }
  const totalBefore = Number(slip.total || 0)

  const [{ data: runRaw }, names] = await Promise.all([
    supabase.from('salary_runs').select(RUN_LABEL_COLUMNS).eq('id', slip.run_id).maybeSingle(),
    namesByUserId(supabase, [auth.userId]),
  ])
  const runRef = (runRaw as unknown as RunRef | null) || EMPTY_RUN_REF

  const { error } = await supabase.rpc('reopen_salary_slip', {
    p_slip_id: slipId,
    p_user_id: auth.userId,
    p_user_name: actorName(names, auth.userId) || 'ไม่ทราบชื่อ',
    p_reason: trimmed,
  })
  // ข้อความจาก RPC เป็นภาษาไทยอยู่แล้ว (ไม่พบสลิป / ยังเป็นร่าง / เหตุผลสั้นเกินไป)
  if (error) return { error: error.message || 'เปิดแก้ไขไม่สำเร็จ' }

  await logActivity(
    'REOPEN_SALARY_SLIP',
    { slipId: slip.id, runId: slip.run_id, reason: trimmed, total_before: totalBefore },
    slip.user_id
  )

  await createNotifications({
    userIds: [slip.user_id],
    type: 'salary_reopened',
    title: `${slipTitle(runRef)} ถูกเปิดแก้ไข`,
    body: `เหตุผล: ${trimmed} — สลิปจะกลับมาแสดงอีกครั้งเมื่อปิดงวดใหม่`,
    referenceType: 'salary_slip',
    referenceId: slip.id,
    actorId: auth.userId,
  })

  revalidateSlipPaths(slipId, slip.run_id)
  return { success: true }
}

// ────────────────────────────────────────────────────────────────────────────
// สรุปยอดโอน — ตารางโอนเงินท้ายงวด + Excel + "จ่ายแล้วทั้งหมด"
// (spec §คำนวณ/ปิดงวด — เฉพาะสลิปที่ปิดงวดแล้ว ร่างไม่เกี่ยว)
// ────────────────────────────────────────────────────────────────────────────

/** หนึ่งบรรทัดในตารางสรุปยอดโอน */
export interface TransferRow {
  slip_id: string
  user_id: string
  full_name: string | null
  bank_name: string | null
  bank_account_number: string | null
  /** ยอดสุทธิของสลิปตอนนี้ */
  total: number
  /** ยอดที่จ่ายไปแล้วครั้งล่าสุด (null = ยังไม่เคยจ่าย) */
  paid_total: number | null
  /**
   * ยอดที่ต้องโอนจริงในรอบนี้
   * สลิปที่เคยจ่ายแล้วถูกเปิดแก้และปิดงวดใหม่ = total − paid_total (ส่วนต่าง ติดลบได้)
   * ที่เหลือ = total
   */
  due: number
  status: 'finalized' | 'paid'
}

export interface TransferSummary {
  rows: TransferRow[]
  /** ยอดรวมที่ต้องโอนทั้งงวด (ผลรวมของ due — สลิปที่จ่ายไปแล้วบางส่วนนับเฉพาะส่วนต่าง) */
  sum_total: number
  count_finalized: number
  count_paid: number
  /** จำนวนคนที่ยังไม่กรอกธนาคาร/เลขบัญชีใน /users — โอนไม่ได้จนกว่าจะกรอก */
  missing_bank: number
}

/**
 * ตารางสรุปยอดโอนของงวดหนึ่ง — สลิปที่ปิดงวดแล้ว (finalized/paid) พร้อมบัญชีรับเงิน
 * ชื่อ/ธนาคารมาจาก profiles (join ฝั่ง JS ตาม pattern เดียวกับ getRun)
 */
export async function getTransferSummary(
  runId: string
): Promise<{ error: string } | TransferSummary> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!runId) return { error: 'ไม่พบงวดนี้' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('salary_slips')
    .select('id, user_id, status, total, paid_total')
    .eq('run_id', runId)
    .in('status', ['finalized', 'paid'])
  if (error) return { error: `อ่านสลิปในงวดไม่สำเร็จ: ${error.message}` }

  type Raw = {
    id: string
    user_id: string
    status: 'finalized' | 'paid'
    total: number | string | null
    paid_total: number | string | null
  }
  const slipRows = (data || []) as unknown as Raw[]
  if (slipRows.length === 0) {
    return { rows: [], sum_total: 0, count_finalized: 0, count_paid: 0, missing_bank: 0 }
  }

  const { data: bankRaw } = await supabase
    .from('profiles')
    .select('id, full_name, nickname, bank_name, bank_account_number')
    .in('id', Array.from(new Set(slipRows.map(s => s.user_id))))

  type BankRaw = {
    id: string
    full_name: string | null
    nickname: string | null
    bank_name: string | null
    bank_account_number: string | null
  }
  const banks = new Map(((bankRaw || []) as unknown as BankRaw[]).map(p => [p.id, p]))

  const rows: TransferRow[] = slipRows
    .map(s => {
      const who = banks.get(s.user_id)
      const total = Number(s.total || 0)
      const paidTotal =
        s.paid_total === null || s.paid_total === undefined ? null : Number(s.paid_total)
      return {
        slip_id: s.id,
        user_id: s.user_id,
        full_name: who?.full_name || who?.nickname || null,
        bank_name: who?.bank_name ?? null,
        bank_account_number: who?.bank_account_number ?? null,
        total,
        paid_total: paidTotal,
        // สลิปที่จ่ายไปแล้วแล้วถูกเปิดแก้ + ปิดงวดใหม่ = ต้องโอนแค่ "ส่วนต่าง"
        // (ติดลบ = ต้องหักคืน) ไม่ใช่ยอดเต็มอีกรอบ
        due: s.status === 'finalized' && paidTotal !== null ? round2(total - paidTotal) : total,
        status: s.status,
      }
    })
    // ชื่อมาจากอีก query จึงเรียงฝั่ง JS (คนไม่มีชื่อไปท้ายตาราง)
    .sort((a, b) => cmpText(a.full_name || 'zzz', b.full_name || 'zzz'))

  return {
    rows,
    sum_total: round2(rows.reduce((sum, r) => sum + r.due, 0)),
    count_finalized: rows.filter(r => r.status === 'finalized').length,
    count_paid: rows.filter(r => r.status === 'paid').length,
    missing_bank: rows.filter(r => !r.bank_name || !r.bank_account_number).length,
  }
}

const TRANSFER_STATUS_LABEL: Record<'finalized' | 'paid', string> = {
  finalized: 'รอโอน',
  paid: 'จ่ายแล้ว',
}

/**
 * ไฟล์ Excel ของตารางสรุปยอดโอน — สร้างฝั่ง server แล้วส่ง base64 ให้ client แปลงเป็นไฟล์
 * (คอลัมน์เดียวกับตารางบนหน้าจอ + แถว "รวม" ท้ายสุด)
 */
export async function exportTransferExcel(
  runId: string
): Promise<{ error: string } | { base64: string; filename: string }> {
  const summary = await getTransferSummary(runId)
  if ('error' in summary) return { error: summary.error }
  if (summary.rows.length === 0) return { error: 'ยังไม่มีสลิปที่ปิดงวดในงวดนี้' }

  const supabase = createServiceClient()
  const { data: runRaw } = await supabase
    .from('salary_runs')
    .select('period_key')
    .eq('id', runId)
    .maybeSingle()
  const periodKey = (runRaw as unknown as { period_key?: string } | null)?.period_key || runId

  const XLSX = await import('xlsx')
  const sheetRows: Array<Record<string, string | number>> = summary.rows.map((r, i) => ({
    'ลำดับ': i + 1,
    'ชื่อ': r.full_name || '(ไม่มีชื่อ)',
    'ธนาคาร': r.bank_name || '',
    'เลขบัญชี': r.bank_account_number || '',
    'ยอดสุทธิ': r.total,
    // สลิปที่เปิดแก้หลังจ่ายแล้ว: ยอดโอนรอบนี้คือส่วนต่าง ไม่ใช่ยอดเต็ม
    'จ่ายไปแล้ว': r.paid_total ?? '',
    'ยอดโอน': r.due,
    'สถานะ': TRANSFER_STATUS_LABEL[r.status],
  }))
  sheetRows.push({
    'ลำดับ': '',
    'ชื่อ': 'รวม',
    'ธนาคาร': '',
    'เลขบัญชี': '',
    'ยอดสุทธิ': '',
    'จ่ายไปแล้ว': '',
    'ยอดโอน': summary.sum_total,
    'สถานะ': '',
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(sheetRows), 'สรุปยอดโอน')
  const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }) as string

  return { base64, filename: `transfer-${periodKey}.xlsx` }
}

/**
 * "จ่ายแล้วทั้งหมด" — สลิปที่ปิดงวดแล้วทั้งงวดกลายเป็นจ่ายแล้วใน UPDATE เดียว
 * guard trigger ที่ DB อนุญาตเฉพาะ finalized → paid อยู่แล้ว สลิปร่างจึงไม่ถูกแตะ
 */
export interface MarkAllPaidResult {
  error?: string
  success?: boolean
  /** จำนวนใบที่บันทึกสำเร็จ */
  count?: number
  /** ใบที่บันทึกไม่สำเร็จ — ที่เหลือถูกบันทึกไปแล้ว ไม่ได้ย้อนกลับ */
  failed?: Array<{ slipId: string; error: string }>
}

export async function markAllPaid(runId: string): Promise<MarkAllPaidResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!runId) return { error: 'ไม่พบงวดนี้' }

  const supabase = createServiceClient()
  // อ่านก่อนเขียน — paid_total/paid_history ต่างกันรายใบ จึงอัปเดตทีละใบแทน UPDATE เดียว
  const { data, error } = await supabase
    .from('salary_slips')
    .select('id, user_id, total, paid_history')
    .eq('run_id', runId)
    .eq('status', 'finalized')
  if (error) return { error: `อ่านสลิปในงวดไม่สำเร็จ: ${error.message}` }

  const pending = (data || []) as unknown as Array<{
    id: string
    user_id: string
    total: number | string | null
    paid_history: PaidEntry[] | null
  }>
  if (pending.length === 0) return { error: 'ไม่มีสลิปที่รอโอนในงวดนี้' }

  const paidAt = new Date().toISOString()
  const paid: Array<{ id: string; user_id: string; total: number }> = []
  const failed: Array<{ slipId: string; error: string }> = []
  for (const row of pending) {
    const total = Number(row.total || 0)
    const { data: updated, error: updErr } = await supabase
      .from('salary_slips')
      .update({
        status: 'paid',
        paid_at: paidAt,
        paid_by: auth.userId,
        paid_total: total,
        paid_history: [
          ...(Array.isArray(row.paid_history) ? row.paid_history : []),
          { at: paidAt, by: auth.userId, total },
        ],
      })
      .eq('id', row.id)
      // guard trigger อนุญาตเฉพาะ finalized → paid — ใบที่ถูกกดจ่าย/เปิดแก้คั่นจะถูกข้าม
      .eq('status', 'finalized')
      .select('id')
    // ใบเดียวล้มต้องไม่ทำให้ที่เหลือไม่ถูกบันทึก — เก็บไว้รายงานท้ายสุดแทน
    if (updErr) {
      failed.push({ slipId: row.id, error: updErr.message })
      continue
    }
    if (updated && updated.length > 0) paid.push({ id: row.id, user_id: row.user_id, total })
  }

  const ids = paid.map(r => r.id)

  if (ids.length > 0) {
    await logActivity('SALARY_MARK_ALL_PAID', { runId, count: ids.length })
    // + แถวต่อคน รูปเดียวกับ markSlipPaid — ไม่งั้นประวัติของพนักงานคนหนึ่งจะไม่มีร่องรอยว่าจ่ายวันไหน
    for (const s of paid) {
      await logActivity('MARK_SALARY_PAID', { slipId: s.id, runId, total: s.total }, s.user_id)
    }
  }

  // revalidate เสมอ — แม้ทั้งชุดจะล้ม บางใบก็อาจถูกกดจ่ายจากที่อื่นไปแล้ว
  for (const id of ids) revalidatePath(`/salary/${id}`)
  revalidatePath(`/salary/runs/${runId}`)
  revalidatePath('/salary/runs')
  revalidatePath('/salary')

  if (ids.length === 0) {
    return failed.length > 0
      ? { error: `บันทึกไม่สำเร็จทั้ง ${failed.length} ใบ: ${failed[0].error}`, count: 0, failed }
      : { error: 'ไม่มีสลิปที่รอโอนในงวดนี้', count: 0, failed }
  }
  return { success: true, count: ids.length, failed }
}

// ────────────────────────────────────────────────────────────────────────────
// Sync ต้นทุน — บรรทัดค่าสตาฟ/เบิ้ล ตจว./รันเนอร์ ของสลิปที่ปิดงวดแล้ว
//                → job_cost_items (category 'staff') ของอีเวนต์นั้นในโมดูลต้นทุน
//
// ADR-0001 ลบใบเบิกค่าสตาฟอัตโนมัติทิ้ง — นี่คือทางเดียวที่ต้นทุนสตาฟต่ออีเวนต์
// กลับเข้า Costs · เรียกซ้ำได้ (จับคู่แถวเดิมด้วยคีย์ notes salary_slip::<slipId>::<line.key>)
// ────────────────────────────────────────────────────────────────────────────

export interface SyncCostsResult {
  error?: string
  /** จำนวนแถวต้นทุนที่เขียน (insert + update) */
  synced?: number
  /** บรรทัดรันเนอร์ที่ผูกอีเวนต์ไม่ได้ — สลิปปิดงวดแล้วจึงเขียน warning ลงสลิปไม่ได้ */
  skipped?: CostsSkip[]
  synced_at?: string
}

/** สลิปที่ปิดงวดแล้ว เท่าที่การ sync ต้นทุนต้องใช้ */
type SyncableSlip = {
  id: string
  user_id: string
  status: SlipStatus
  lines: SalaryLine[] | null
  finalized_by: string | null
}

/**
 * เขียนบรรทัดค่าสตาฟของสลิปหนึ่งเข้าโมดูลต้นทุน — ผู้เรียกตรวจสิทธิ์ admin มาแล้ว
 * เรียกซ้ำได้ปลอดภัย (แถวเดิมถูกอัปเดตด้วยคีย์ notes ไม่เพิ่มแถวใหม่)
 */
async function syncSlipToCostsInternal(
  supabase: ReturnType<typeof createServiceClient>,
  slipId: string,
  actorId: string
): Promise<SyncCostsResult> {
  const { data } = await supabase
    .from('salary_slips')
    .select('id, user_id, status, lines, finalized_by')
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิป' }

  const slip = data as unknown as SyncableSlip
  if (slip.status === 'draft') return { error: 'ต้องปิดงวดก่อนจึง sync ต้นทุนได้' }

  const lines = Array.isArray(slip.lines) ? slip.lines : []

  // เช็คอินที่สลิปนี้จ่าย — ทั้งที่ผูกกับบรรทัดตรงๆ และที่ถูกประทับ paid_slip_id ตอนปิดงวด
  // (บรรทัดรันเนอร์ไม่มี checkin_id จึงต้องพึ่ง paid_slip_id เพื่อรู้ว่าวันนั้นไปอีเวนต์ไหน)
  const lineCheckinIds = Array.from(
    new Set(lines.map(l => l.checkin_id).filter((v): v is string => !!v))
  )
  const CHECKIN_COLUMNS = 'id, event_id, checked_in_at'
  const [byId, byStamp] = await Promise.all([
    lineCheckinIds.length > 0
      ? supabase.from('staff_checkins').select(CHECKIN_COLUMNS).in('id', lineCheckinIds)
      : Promise.resolve({ data: [] }),
    supabase.from('staff_checkins').select(CHECKIN_COLUMNS).eq('paid_slip_id', slipId),
  ])
  const checkins = new Map<string, CostsSyncCheckin>()
  for (const raw of [
    ...((byId.data || []) as unknown as CostsSyncCheckin[]),
    ...((byStamp.data || []) as unknown as CostsSyncCheckin[]),
  ]) {
    checkins.set(raw.id, raw)
  }

  const [profileRes, duties] = await Promise.all([
    supabase.from('profiles').select('full_name, nickname').eq('id', slip.user_id).maybeSingle(),
    listDuties(),
  ])
  const who = (profileRes.data || {}) as unknown as {
    full_name?: string | null
    nickname?: string | null
  }
  const fullName = who.full_name || who.nickname || 'ไม่ทราบชื่อ'
  const dutyNames: Record<string, string> = {}
  for (const d of duties) dutyNames[d.code] = d.name_th

  const { rows, skipped } = costsRowsForSlip(
    { id: slip.id, user_id: slip.user_id, lines },
    Array.from(checkins.values()),
    fullName,
    dutyNames
  )

  const recordedBy = actorId || slip.finalized_by || null

  // อีเวนต์ที่ยังไม่อยู่ในโมดูลต้นทุน → import ให้เหมือนพฤติกรรมเดิมของใบเบิกค่าสตาฟ
  const jobEventByEvent = new Map<string, string>()
  for (const eventId of Array.from(new Set(rows.map(r => r.event_id)))) {
    const { data: existing } = await supabase
      .from('job_cost_events')
      .select('id')
      .eq('source_event_id', eventId)
      .maybeSingle()
    if (existing) {
      jobEventByEvent.set(eventId, (existing as unknown as { id: string }).id)
      continue
    }
    // { success, id } เมื่อสร้างใหม่ · { error, existingId } เมื่อเพิ่งถูก import คู่ขนาน
    const imported = (await importEventFromStock(eventId)) as {
      id?: string
      existingId?: string
      error?: string
    }
    const jobEventId = imported.id || imported.existingId || null
    if (jobEventId) jobEventByEvent.set(eventId, jobEventId)
    else console.error(`[salary] import event ${eventId} เข้าต้นทุนไม่สำเร็จ: ${imported.error}`)
  }

  // อีเวนต์ที่ import ไม่ได้ → ข้ามแถวนั้นไว้ (กด sync อีกครั้งได้ภายหลัง)
  const wanted = rows.filter(r => jobEventByEvent.has(r.event_id))

  // แถวที่เคย sync ไว้จากสลิปใบนี้ทั้งหมด — จับคู่ด้วยคีย์ notes (unique ต่อบรรทัดสลิป)
  // อ่านด้วย prefix ไม่ใช่ .in(wanted) เพราะต้องรู้ "แถวที่ไม่ควรมีแล้ว" เพื่อลบทิ้งด้วย
  // (สลิปถูกเปิดแก้แล้วบรรทัดหาย/ยอดเปลี่ยน → ต้นทุนต้องตามไป ไม่ใช่ค้างของเก่า)
  const existingByNotes = new Map<string, string>()
  const { data: existingRaw, error: readErr } = await supabase
    .from('job_cost_items')
    .select('id, notes')
    .like('notes', `${costsNotesKey(slipId, '')}%`)
  if (readErr) return { error: `อ่านต้นทุนเดิมไม่สำเร็จ: ${readErr.message}` }
  for (const r of (existingRaw || []) as unknown as Array<{ id: string; notes: string | null }>) {
    if (r.notes) existingByNotes.set(r.notes, r.id)
  }

  let synced = 0
  for (const row of wanted) {
    const existingId = existingByNotes.get(row.notes)
    const { error } = existingId
      ? await supabase
        .from('job_cost_items')
        .update({
          // job_event_id ด้วย — เช็คอินถูกย้ายไปอีเวนต์อื่นแล้วต้นทุนต้องย้ายตาม
          job_event_id: jobEventByEvent.get(row.event_id)!,
          amount: row.amount,
          description: row.description,
          cost_date: row.cost_date,
        })
        .eq('id', existingId)
      : await supabase.from('job_cost_items').insert({
        job_event_id: jobEventByEvent.get(row.event_id)!,
        category: 'staff',
        description: row.description,
        amount: row.amount,
        cost_date: row.cost_date,
        recorded_by: recordedBy,
        notes: row.notes,
      })
    if (error) return { error: `เขียนต้นทุนไม่สำเร็จ: ${error.message}` }
    synced += 1
  }

  // แถวเก่าที่ไม่มีบรรทัดรองรับแล้ว → ลบทิ้ง
  // เทียบกับ `rows` (ก่อนกรองอีเวนต์ที่ import ไม่ได้) — ไม่งั้น import ล้มชั่วคราว
  // จะลบต้นทุนที่ยังถูกต้องอยู่ทิ้งไปด้วย
  const liveNotes = new Set(rows.map(r => r.notes))
  const staleIds = Array.from(existingByNotes.entries())
    .filter(([notes]) => !liveNotes.has(notes))
    .map(([, id]) => id)
  if (staleIds.length > 0) {
    const { error: delErr } = await supabase.from('job_cost_items').delete().in('id', staleIds)
    if (delErr) return { error: `ลบต้นทุนที่ไม่มีแล้วไม่สำเร็จ: ${delErr.message}` }
  }

  const syncedAt = new Date().toISOString()
  // guard trigger ของสลิปที่ปิดงวดแล้วอนุญาตให้ costs_synced_at เปลี่ยนได้
  // (migration 20260829_salary_weekly_runs.sql)
  const { error: stampErr } = await supabase
    .from('salary_slips')
    .update({ costs_synced_at: syncedAt })
    .eq('id', slipId)
  if (stampErr) return { error: `บันทึกเวลา sync ไม่สำเร็จ: ${stampErr.message}` }

  await logActivity(
    'SYNC_SALARY_TO_COSTS',
    { slipId, synced, removed: staleIds.length, skipped },
    slip.user_id
  )

  revalidatePath('/costs')
  return { synced, skipped, synced_at: syncedAt }
}

/** ปุ่ม "sync ต้นทุนอีกครั้ง" ในสลิปที่ปิดงวดแล้ว (admin) */
export async function syncSlipToCosts(slipId: string): Promise<SyncCostsResult> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!slipId) return { error: 'ไม่พบสลิป' }

  const supabase = createServiceClient()
  const res = await syncSlipToCostsInternal(supabase, slipId, auth.userId)
  if (res.error) return res

  revalidatePath(`/salary/${slipId}`)
  return res
}
