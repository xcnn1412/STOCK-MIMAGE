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
import { fmtMoney, periodLabel, slipTitle } from './format'
import {
  CATCH_UP_DAYS, catchUpStart, computeSlip, hasMissingAmounts, lastFinishedWeek, lineAmount,
  periodKeyFor, periodRange, selectCheckinsForRun, toEmploymentType, toRunKind,
  weekRangeFor, weekdayOf,
} from './compute'
import type {
  CheckinInput, EmploymentType, RunKind, RunWindow, SalaryAdjustment, SalaryLine, SalaryWarning,
} from './compute'
import { getSalarySettings, listDuties } from './settings/actions'
import type { SalaryDutyRow } from './settings/actions'
import { costsRowsForSlip } from './costs-sync'
import type { CostsSkip, CostsSyncCheckin } from './costs-sync'
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
  /** จำนวนเช็คอินหน้างานค้างจ่ายในหน้าต่างเก็บตกของงวด */
  checkins: number
}

/** เช็คอินหน้างานค้างจ่ายที่เลยหน้าต่างเก็บตกไปแล้ว — ต้องเปิดงวดกำหนดเองย้อนหลัง */
export interface OverdueCheckinRow {
  id: string
  user_id: string
  full_name: string | null
  /** วันเช็คอินตามเวลาไทย (YYYY-MM-DD) */
  date: string
  event_name?: string | null
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

/** เลื่อนวันที่ YYYY-MM-DD ไป n วัน (คิดบน UTC — ไม่มีเวลาเข้ามาเกี่ยว จึงไม่เพี้ยน) */
function shiftDate(dateStr: string, days: number): string {
  const t = Date.parse(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(t)) return dateStr
  return new Date(t + days * 86_400_000).toISOString().slice(0, 10)
}

/**
 * เช็คอินที่ event_id ถูกล้างตอนบันทึก (admin เลือก closure / job_cost_events)
 * เก็บที่มาไว้ใน note เป็น [ref:closure:UUID] / [ref:jce:UUID] — นับว่า "ผูกอีเวนต์แล้ว"
 * ดูจุดที่เขียน tag ใน app/(authenticated)/check-in/actions.ts
 */
const REF_TAG_RE = /\[ref:(closure|jce):[0-9a-fA-F-]{36}\]/

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

/** แถวดิบจาก staff_checkins → input ของเครื่องคำนวณ */
function toCheckinInput(raw: CheckinRaw): CheckinInput {
  const embedded = Array.isArray(raw.events) ? raw.events[0] : raw.events
  let event_id = raw.event_id
  let event_name = embedded?.name ?? null

  if (!event_id) {
    const ref = raw.note ? REF_TAG_RE.exec(raw.note) : null
    if (ref) {
      // ถือว่าผูกอีเวนต์แล้ว — ไม่งั้น compute จะขึ้น warning no_event ทั้งที่ข้อมูลครบ
      event_id = ref[0]
      event_name = 'อีเวนต์ (อ้างอิง)'
    }
  }

  return {
    id: raw.id,
    check_type: raw.check_type,
    checked_in_at: raw.checked_in_at,
    checked_out_at: raw.checked_out_at,
    event_id,
    event_name,
    duties: Array.isArray(raw.duties) ? raw.duties : [],
    out_of_province: !!raw.out_of_province,
    paid_slip_id: raw.paid_slip_id ?? null,
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
 * ไม่มีการกันงวดทับซ้อนอีกต่อไป — กติกา "เช็คอินจ่ายได้ครั้งเดียว" (staff_checkins.paid_slip_id)
 * ทำหน้าที่นั้นแทน จึงเปิดงวดสัปดาห์ซ้อนในช่วงงวดเดือนได้โดยไม่จ่ายซ้ำ
 *
 * autoCompute = คำนวณสลิปให้ทุกคนที่ควรอยู่ในงวดทันทีหลังเปิด (autoSelectUserIds)
 */
export async function createSalaryRun(
  input: CreateRunInput,
  opts?: { autoCompute?: boolean }
): Promise<{ error?: string; id?: string; computed?: number }> {
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
  if (opts?.autoCompute) {
    const userIds = await autoSelectUserIds({ kind, period_start: start, period_end: end })
    // ไม่มีใครเข้าเกณฑ์ = งวดว่าง (ไม่ใช่ error) — admin ติ๊กคนเองในหน้างวดได้
    computed = userIds.length === 0 ? 0 : (await computeSlips(id, userIds)).computed ?? 0
  }

  revalidatePath('/salary/runs')
  return { id, computed }
}

/**
 * คนที่ควรถูกติ๊กไว้ให้เองในงวดหนึ่ง
 * - ทุกชนิดงวด: ใครก็ตามที่มีเช็คอินหน้างาน "ค้างจ่าย" ในหน้าต่างเก็บตกของงวด
 * - งวดเดือนเพิ่ม: ประจำ/ฝึกงานทุกคนที่มีโปรไฟล์เงินเดือน (ต้องได้เงินเดือนฐานแม้ไม่ได้ออกงาน)
 */
export async function autoSelectUserIds(run: RunWindow): Promise<string[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const fromISO = new Date(`${catchUpStart(run.period_end)}T00:00:00+07:00`).toISOString()
  const toISO = new Date(`${run.period_end}T23:59:59.999+07:00`).toISOString()

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
// ข้อเสนอเปิดงวด + เช็คอินค้างจ่ายที่เลยหน้าต่างเก็บตก (หน้า /salary/runs)
// ────────────────────────────────────────────────────────────────────────────

/** วันไทยวันนี้ (YYYY-MM-DD) — ไม่พึ่ง timezone ของเครื่อง server */
function todayBangkok(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** วันไทยของ instant หนึ่ง (YYYY-MM-DD) */
function bangkokDateOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

/** ขอบเขต "วันไทย" ของหน้าต่างเก็บตกของงวด → instant UTC ที่ยิง filter ได้ */
function catchUpWindowISO(periodEnd: string): { fromISO: string; toISO: string } {
  return {
    fromISO: new Date(`${catchUpStart(periodEnd)}T00:00:00+07:00`).toISOString(),
    toISO: new Date(`${periodEnd}T23:59:59.999+07:00`).toISOString(),
  }
}

/** นับคน/เช็คอินหน้างานค้างจ่ายในหน้าต่างเก็บตกของงวดที่จบวันที่ periodEnd */
async function countUnpaidOnsite(
  supabase: ReturnType<typeof createServiceClient>,
  periodEnd: string
): Promise<{ users: Set<string>; checkins: number }> {
  const { fromISO, toISO } = catchUpWindowISO(periodEnd)
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

  // งวดเดือนล่าสุดที่ตัดรอบไปแล้ว — ถอยจากเดือนนี้ทีละเดือนจนเจอเดือนที่ period_end ผ่านไปแล้ว
  let month = today.slice(0, 7)
  let monthRange = periodRange(month, cutoff_day)
  for (let i = 0; i < 3 && monthRange.end >= today; i += 1) {
    const [y, m] = month.split('-').map(Number)
    month = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 7)
    monthRange = periodRange(month, cutoff_day)
  }
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
    const { users, checkins } = await countUnpaidOnsite(supabase, week.end)
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
      countUnpaidOnsite(supabase, monthRange.end),
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

/** เพดานรายการที่ส่งกลับให้กล่องเตือน — กันหน้าเว็บบวมเมื่อค้างสะสมเยอะ */
const OVERDUE_LIMIT = 200

/**
 * เช็คอินหน้างานค้างจ่ายที่เก่ากว่าหน้าต่างเก็บตก — งวดปกติดึงไม่ถึงแล้ว
 * admin ต้องเปิดงวด "กำหนดเอง" ย้อนหลังหรือใช้รายการปรับมือ (เรียงเก่าสุดก่อน)
 */
export async function listOverdueUnpaidCheckins(): Promise<OverdueCheckinRow[]> {
  const auth = await requireAdmin()
  if ('error' in auth) return []

  const supabase = createServiceClient()
  const cutoffISO = new Date(Date.now() - CATCH_UP_DAYS * 86_400_000).toISOString()

  const { data } = await supabase
    .from('staff_checkins')
    .select('id, user_id, checked_in_at, events:event_id(name)')
    .eq('check_type', 'onsite')
    .is('paid_slip_id', null)
    .lt('checked_in_at', cutoffISO)
    .order('checked_in_at', { ascending: true })
    .limit(OVERDUE_LIMIT)

  type Raw = {
    id: string
    user_id: string | null
    checked_in_at: string
    // PostgREST คืน to-one เป็น object แต่บางเวอร์ชันห่อเป็น array — รับทั้งสองแบบ
    events: { name: string | null } | { name: string | null }[] | null
  }
  const rows = ((data || []) as unknown as Raw[]).filter(r => !!r.user_id)
  const names = await namesByUserId(supabase, rows.map(r => r.user_id as string))

  return rows.map(r => {
    const embedded = Array.isArray(r.events) ? r.events[0] : r.events
    return {
      id: r.id,
      user_id: r.user_id as string,
      full_name: actorName(names, r.user_id),
      date: bangkokDateOf(r.checked_in_at),
      event_name: embedded?.name ?? null,
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

  const { data: slipsRaw } = await supabase
    .from('salary_slips')
    .select('id, user_id, status, employment_type, total, warnings, computed_at, finalized_at, paid_at')
    .eq('run_id', runId)

  type SlipRaw = {
    id: string
    user_id: string
    status: SlipStatus
    employment_type: EmploymentType
    total: number | string | null
    warnings: SalaryWarning[] | null
    computed_at: string | null
    finalized_at: string | null
    paid_at: string | null
  }
  const slipRows = (slipsRaw || []) as unknown as SlipRaw[]
  const names = await namesByUserId(supabase, slipRows.map(s => s.user_id))

  const slips: RunSlipRow[] = slipRows
    .map(s => {
      const who = names.get(s.user_id)
      return {
        id: s.id,
        user_id: s.user_id,
        full_name: who?.full_name ?? null,
        nickname: who?.nickname ?? null,
        status: s.status,
        employment_type: toEmploymentType(s.employment_type),
        total: Number(s.total || 0),
        warnings: Array.isArray(s.warnings) ? s.warnings : [],
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

  // listDuties() คืนทุกหน้าที่รวมที่ปิดใช้งาน — ตั้งใจ: สลิปเก่าอาจอ้างรหัสที่เพิ่งปิดไป
  const [settings, duties] = await Promise.all([getSalarySettings(), listDuties()])

  // ขอบเขตเป็น "วันไทย" — แปลงเป็น instant UTC ก่อนยิง filter
  // ดึงกว้างถึงหน้าต่างเก็บตก 60 วัน แล้วให้ selectCheckinsForRun คัดตามชนิดงวด/สถานะจ่าย
  const onsiteFrom = catchUpStart(run.period_end)
  const fromISO = new Date(`${onsiteFrom}T00:00:00+07:00`).toISOString()
  const toISO = new Date(`${run.period_end}T23:59:59.999+07:00`).toISOString()

  const [profilesRes, salaryProfilesRes, existingRes, checkinsRes] = await Promise.all([
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
    if (list) list.push(toCheckinInput(raw))
    else checkinsByUser.set(raw.user_id, [toCheckinInput(raw)])
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

    const result = computeSlip({
      profile: {
        employment_type,
        base_salary,
        work_start: sp.work_start || '10:00',
        work_end: sp.work_end || '19:00',
        ot_rate: Number(sp.ot_rate || 0),
      },
      checkins,
      duties,
      oopRate: settings.out_of_province_rate,
      periodStart: run.period_start,
      periodEnd: run.period_end,
      runKind: run.kind,
      onsiteFrom,
      previousLines: Array.isArray(prev?.lines) ? prev.lines : undefined,
      adjustments,
    })

    rows.push({
      run_id: runId,
      user_id: userId,
      status: 'draft',
      employment_type,
      base_salary,
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
  return { computed: rows.length, skipped }
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
    .select('id, run_id, user_id, status')
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิปนี้' }

  const slip = data as unknown as {
    id: string
    run_id: string
    user_id: string
    status: SlipStatus
  }
  if (slip.status !== 'draft') return { error: 'สลิปที่ปิดงวดแล้วลบไม่ได้' }

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
 * (ตัวเลือกอีเวนต์รอบๆ งวด ใช้ผูกเช็คอินในไดอะล็อก) ติดมาด้วย
 * พนักงานได้อาร์เรย์ว่างเสมอ
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
    }
> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  const isAdmin = role === 'admin'

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_slips')
    .select(
      'id, run_id, user_id, status, employment_type, base_salary, lines, adjustments, warnings, total, computed_at, finalized_at, finalized_by, paid_at, paid_by, costs_synced_at'
    )
    .eq('id', slipId)
    .maybeSingle()
  if (!data) return { error: 'ไม่พบสลิป' }

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
    total: number | string | null
    computed_at: string | null
    finalized_at: string | null
    finalized_by: string | null
    paid_at: string | null
    paid_by: string | null
    costs_synced_at: string | null
  }
  const raw = data as unknown as SlipRaw

  if (!isAdmin && (raw.user_id !== userId || raw.status === 'draft')) return { error: 'ไม่พบสลิป' }

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

  const runRow = (runRes.data || {}) as unknown as Partial<RunHeader> & { kind?: unknown }
  const who = (profileRes.data || {}) as unknown as {
    full_name?: string | null
    nickname?: string | null
    department?: string | null
    bank_name?: string | null
    bank_account_number?: string | null
    account_holder_name?: string | null
  }

  const slip: SlipDetail = {
    id: raw.id,
    run_id: raw.run_id,
    user_id: raw.user_id,
    status: raw.status,
    kind: toRunKind(runRow.kind),
    employment_type: toEmploymentType(raw.employment_type),
    base_salary: Number(raw.base_salary || 0),
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    total: Number(raw.total || 0),
    computed_at: raw.computed_at,
    finalized_at: raw.finalized_at,
    paid_at: raw.paid_at,
    costs_synced_at: raw.costs_synced_at,
    finalized_by_name: actorName(actors, raw.finalized_by),
    paid_by_name: actorName(actors, raw.paid_by),
    period_key: runRow.period_key || '',
    period_start: runRow.period_start || '',
    period_end: runRow.period_end || '',
    full_name: who.full_name ?? null,
    nickname: who.nickname ?? null,
    department: who.department ?? null,
    bank_name: who.bank_name ?? null,
    bank_account_number: who.bank_account_number ?? null,
    account_holder_name: who.account_holder_name ?? null,
  }

  if (!isAdmin) return { slip, isAdmin, checkins: [], duties: [], events: [] }

  const [checkins, duties, events] = await Promise.all([
    listSlipCheckins(supabase, slip.user_id, slip.period_start, slip.period_end),
    listDuties(),
    listPeriodEvents(supabase, slip.period_start, slip.period_end),
  ])
  return { slip, isAdmin, checkins, duties, events }
}

/**
 * อีเวนต์ที่ใช้เลือกผูกกับเช็คอินในงวดนี้ — กว้างกว่าช่วงงวดข้างละ 7 วัน
 * เพราะงานที่จัดคร่อมรอยต่องวด (เช่น เช็คอินวันที่ 25 แต่ event_date วันที่ 26)
 * ยังต้องเลือกได้ — ไม่งั้นสลิปจะติด warning "ไม่ได้ผูกกับอีเวนต์" แก้ไม่ได้
 */
async function listPeriodEvents(
  supabase: ReturnType<typeof createServiceClient>,
  periodStart: string,
  periodEnd: string
): Promise<SlipEventOption[]> {
  if (!periodStart || !periodEnd) return []

  const { data } = await supabase
    .from('events')
    .select('id, name, event_date')
    .gte('event_date', shiftDate(periodStart, -7))
    .lte('event_date', shiftDate(periodEnd, 7))
    .order('event_date', { ascending: true })

  type Raw = { id: string; name: string | null; event_date: string | null }
  return ((data || []) as unknown as Raw[]).map(e => ({
    id: e.id,
    name: e.name || '(ไม่มีชื่อ)',
    event_date: e.event_date || '',
  }))
}

/** เช็คอินของคนหนึ่งที่อยู่ในช่วงงวด — ขอบเขตเดียวกับที่ computeSlips ใช้ป้อนเครื่องคำนวณ */
async function listSlipCheckins(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  periodStart: string,
  periodEnd: string
): Promise<SlipCheckinRow[]> {
  if (!periodStart || !periodEnd) return []

  // ขอบเขตงวดเป็น "วันไทย" — แปลงเป็น instant UTC ก่อนยิง filter
  const fromISO = new Date(`${periodStart}T00:00:00+07:00`).toISOString()
  const toISO = new Date(`${periodEnd}T23:59:59.999+07:00`).toISOString()

  const { data } = await supabase
    .from('staff_checkins')
    .select(
      'id, check_type, checked_in_at, checked_out_at, event_id, duties, province, district, out_of_province, note, events:event_id(name)'
    )
    .eq('user_id', userId)
    .gte('checked_in_at', fromISO)
    .lte('checked_in_at', toISO)
    .order('checked_in_at', { ascending: true })

  type Raw = {
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
    // PostgREST คืน to-one เป็น object แต่บางเวอร์ชันห่อเป็น array — รับทั้งสองแบบ
    events: { name: string | null } | { name: string | null }[] | null
  }

  return ((data || []) as unknown as Raw[]).map(r => {
    const embedded = Array.isArray(r.events) ? r.events[0] : r.events
    return {
      id: r.id,
      check_type: r.check_type,
      checked_in_at: r.checked_in_at,
      checked_out_at: r.checked_out_at,
      event_id: r.event_id,
      event_name: embedded?.name ?? null,
      duties: Array.isArray(r.duties) ? r.duties : [],
      province: r.province,
      district: r.district,
      out_of_province: !!r.out_of_province,
      note: r.note,
    }
  })
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
    if (l.kind !== 'runner' || (l.amount !== null && l.amount !== undefined)) continue
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
    .select('id, run_id, user_id, status, employment_type, base_salary, lines, adjustments, warnings')
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
 * แก้มือทับหนึ่งบรรทัด — เก็บทั้งค่าที่ระบบคำนวณ (`computed_amount`) และค่าที่แก้
 * เหตุผลบังคับทุกชนิดยกเว้นรันเนอร์ (บรรทัดรันเนอร์ใช้ช่องนี้เป็น "กรอกยอดรันเนอร์"
 * ซึ่งเป็นการกรอกครั้งแรก ไม่ใช่การทับค่าที่ระบบคิด)
 */
export async function overrideSlipLine(
  slipId: string,
  lineKey: string,
  amount: number,
  note: string
): Promise<{ error?: string; success?: boolean }> {
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
  return { success: true }
}

/** คืนบรรทัดกลับไปใช้ค่าที่ระบบคำนวณ (รันเนอร์กลับไปเป็น "ยังไม่กรอก") */
export async function clearSlipLineOverride(
  slipId: string,
  lineKey: string
): Promise<{ error?: string; success?: boolean }> {
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
  return { success: true }
}

/** เพิ่มรายการปรับมือ (โบนัส / หัก / ประกันสังคม ฯลฯ) — จำนวนติดลบได้ */
export async function addSlipAdjustment(
  slipId: string,
  label: string,
  amount: number
): Promise<{ error?: string; success?: boolean }> {
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
  return { success: true }
}

/** ลบรายการปรับมือหนึ่งรายการออกจากสลิปร่าง */
export async function removeSlipAdjustment(
  slipId: string,
  adjustmentId: string
): Promise<{ error?: string; success?: boolean }> {
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
  return { success: true }
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
  const loaded = await loadDraftSlip(supabase, slipId)
  if ('error' in loaded) return { error: loaded.error }
  const { slip } = loaded

  const res = await computeSlips(slip.run_id, [slip.user_id])
  if (res.error) return { error: res.error }
  const skipped = (res.skipped || [])[0]
  if (skipped) return { error: `คำนวณใหม่ไม่สำเร็จ — ${skipped.reason}` }

  revalidatePath(`/salary/${slipId}`)
  return { success: true }
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
  total: number
}

/** คอลัมน์ที่ทั้งปิดงวดใบเดียวและปิดที่เหลือทั้งหมดอ่านเหมือนกัน */
const FINALIZE_COLUMNS = 'id, run_id, user_id, status, lines, total'

/** งวดเท่าที่ข้อความแจ้งเตือนต้องรู้ (ชื่อสลิปแยกชนิดงวด) */
type RunRef = { kind?: string | null; period_key: string; period_start?: string; period_end?: string }

/** คอลัมน์งวดที่ต้องอ่านมาทำชื่อสลิปในแจ้งเตือน */
const RUN_LABEL_COLUMNS = 'kind, period_key, period_start, period_end'

const EMPTY_RUN_REF: RunRef = { kind: 'monthly', period_key: '' }

const RUNNER_MISSING_ERROR = 'ยังมีรันเนอร์ที่ไม่ได้กรอกยอด — กรอกก่อนปิดงวด'

type FinalizeRaw = {
  id: string
  run_id: string
  user_id: string
  status: SlipStatus
  lines: SalaryLine[] | null
  total: number | string | null
}

function toFinalizable(raw: FinalizeRaw): FinalizableSlip {
  return {
    id: raw.id,
    run_id: raw.run_id,
    user_id: raw.user_id,
    lines: Array.isArray(raw.lines) ? raw.lines : [],
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
  // spec §7: amount = null (รันเนอร์ที่ยังไม่กรอก) นับเป็น 0 ในยอด — ปิดงวดทั้งอย่างนั้นไม่ได้
  if (hasMissingAmounts(slip.lines)) return { error: RUNNER_MISSING_ERROR }

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
  if (slip.status === 'draft') return { error: 'ต้องปิดงวดก่อน' }
  if (slip.status === 'paid') return { error: 'จ่ายแล้ว' }

  const { data: updated, error } = await supabase
    .from('salary_slips')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: auth.userId })
    .eq('id', slipId)
    // guard trigger อนุญาตเฉพาะ finalized → paid — กันสลิปที่เพิ่งถูกกดจ่ายจากอีกหน้าต่าง
    .eq('status', 'finalized')
    .select('id')
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }
  if (!updated || updated.length === 0) return { error: 'จ่ายแล้ว' }

  await logActivity(
    'MARK_SALARY_PAID',
    { slipId: slip.id, runId: slip.run_id, total: Number(slip.total || 0) },
    slip.user_id
  )

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
  total: number
  status: 'finalized' | 'paid'
}

export interface TransferSummary {
  rows: TransferRow[]
  /** ยอดรวมที่ต้องโอนทั้งงวด (รวมทั้งที่จ่ายแล้วและยังไม่จ่าย) */
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
    .select('id, user_id, status, total')
    .eq('run_id', runId)
    .in('status', ['finalized', 'paid'])
  if (error) return { error: `อ่านสลิปในงวดไม่สำเร็จ: ${error.message}` }

  type Raw = {
    id: string
    user_id: string
    status: 'finalized' | 'paid'
    total: number | string | null
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
      return {
        slip_id: s.id,
        user_id: s.user_id,
        full_name: who?.full_name || who?.nickname || null,
        bank_name: who?.bank_name ?? null,
        bank_account_number: who?.bank_account_number ?? null,
        total: Number(s.total || 0),
        status: s.status,
      }
    })
    // ชื่อมาจากอีก query จึงเรียงฝั่ง JS (คนไม่มีชื่อไปท้ายตาราง)
    .sort((a, b) => cmpText(a.full_name || 'zzz', b.full_name || 'zzz'))

  return {
    rows,
    sum_total: round2(rows.reduce((sum, r) => sum + r.total, 0)),
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
    'ยอดโอน': r.total,
    'สถานะ': TRANSFER_STATUS_LABEL[r.status],
  }))
  sheetRows.push({
    'ลำดับ': '',
    'ชื่อ': 'รวม',
    'ธนาคาร': '',
    'เลขบัญชี': '',
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
export async function markAllPaid(
  runId: string
): Promise<{ error?: string; success?: boolean; count?: number }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }
  if (!runId) return { error: 'ไม่พบงวดนี้' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('salary_slips')
    .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: auth.userId })
    .eq('run_id', runId)
    .eq('status', 'finalized')
    .select('id')
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  const ids = ((data || []) as unknown as Array<{ id: string }>).map(r => r.id)
  if (ids.length === 0) return { error: 'ไม่มีสลิปที่รอโอนในงวดนี้' }

  await logActivity('SALARY_MARK_ALL_PAID', { runId, count: ids.length })

  for (const id of ids) revalidatePath(`/salary/${id}`)
  revalidatePath(`/salary/runs/${runId}`)
  revalidatePath('/salary/runs')
  revalidatePath('/salary')
  return { success: true, count: ids.length }
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

  // แถวที่เคย sync ไว้ — จับคู่ด้วยคีย์ notes (unique ต่อบรรทัดสลิป)
  const existingByNotes = new Map<string, string>()
  if (wanted.length > 0) {
    const { data: existingRaw } = await supabase
      .from('job_cost_items')
      .select('id, notes')
      .in('notes', wanted.map(r => r.notes))
    for (const r of (existingRaw || []) as unknown as Array<{ id: string; notes: string | null }>) {
      if (r.notes) existingByNotes.set(r.notes, r.id)
    }
  }

  let synced = 0
  for (const row of wanted) {
    const existingId = existingByNotes.get(row.notes)
    const { error } = existingId
      ? await supabase
        .from('job_cost_items')
        .update({ amount: row.amount, description: row.description, cost_date: row.cost_date })
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

  const syncedAt = new Date().toISOString()
  // guard trigger ของสลิปที่ปิดงวดแล้วอนุญาตให้ costs_synced_at เปลี่ยนได้
  // (migration 20260829_salary_costs_synced_at.sql)
  const { error: stampErr } = await supabase
    .from('salary_slips')
    .update({ costs_synced_at: syncedAt })
    .eq('id', slipId)
  if (stampErr) return { error: `บันทึกเวลา sync ไม่สำเร็จ: ${stampErr.message}` }

  await logActivity('SALARY_COSTS_SYNC', { slipId, synced, skipped }, slip.user_id)

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
