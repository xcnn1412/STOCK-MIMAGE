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
import { getSession, requireAdmin } from './session'
import { periodLabel } from './format'
import { computeSlip, periodRange } from './compute'
import type {
  CheckinInput, EmploymentType, SalaryAdjustment, SalaryLine, SalaryWarning,
} from './compute'
import { getSalarySettings, listDuties } from './settings/actions'

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SlipStatus = 'draft' | 'finalized' | 'paid'

/** สลิปของฉัน — พนักงานเห็นเฉพาะที่ปิดงวดแล้ว (finalized/paid) */
export interface MySlipRow {
  id: string
  status: 'finalized' | 'paid'
  total: number
  finalized_at: string | null
  paid_at: string | null
  period_key: string
  period_start: string
  period_end: string
}

/** งวดคำนวณ + จำนวนสลิปแต่ละสถานะ (หน้า /salary/runs) */
export interface RunListRow {
  id: string
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
  employment_type: EmploymentType
  base_salary: number
  lines: SalaryLine[]
  adjustments: SalaryAdjustment[]
  warnings: SalaryWarning[]
  total: number
  computed_at: string | null
  finalized_at: string | null
  paid_at: string | null
  period_key: string
  period_start: string
  period_end: string
  full_name: string | null
  nickname: string | null
  /** บัญชีธนาคารจาก profiles — แสดงอย่างเดียว โมดูลนี้ไม่แก้ */
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers (module-level, ไม่ export — ไฟล์ 'use server' export ได้เฉพาะ async fn)
// ────────────────────────────────────────────────────────────────────────────

const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

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
    .select('id, status, total, finalized_at, paid_at, run:salary_runs(period_key, period_start, period_end)')
    .eq('user_id', userId)
    .in('status', ['finalized', 'paid'])

  if (error || !data) return []

  type RunEmbed = { period_key: string; period_start: string; period_end: string }
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
      total: Number(r.total || 0),
      finalized_at: r.finalized_at,
      paid_at: r.paid_at,
      period_key: run?.period_key || '',
      period_start: run?.period_start || '',
      period_end: run?.period_end || '',
    }
  })

  // เรียงฝั่ง JS — order ตามคอลัมน์ของตารางที่ embed มาไม่เสถียรใน PostgREST
  return rows.sort((a, b) => (a.period_key < b.period_key ? 1 : a.period_key > b.period_key ? -1 : 0))
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
      .select('id, period_key, period_start, period_end, note, created_at')
      .order('period_key', { ascending: false }),
    supabase.from('salary_slips').select('run_id, status'),
  ])

  type RunRaw = {
    id: string
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
    return { ...r, ...c, slips: c.draft + c.finalized + c.paid }
  })
}

// ────────────────────────────────────────────────────────────────────────────
// เปิดงวด
// ────────────────────────────────────────────────────────────────────────────

/**
 * เปิดงวดใหม่จาก 'YYYY-MM' — ช่วงวันที่มาจากวันตัดรอบ "ปัจจุบัน" แล้วถูกแช่ไว้ใน
 * period_start/period_end (เปลี่ยนวันตัดรอบทีหลังไม่ย้อนไปแก้งวดที่เปิดไปแล้ว)
 */
export async function createSalaryRun(
  periodKey: string
): Promise<{ error?: string; id?: string }> {
  const auth = await requireAdmin()
  if ('error' in auth) return { error: auth.error }

  const key = (periodKey || '').trim()
  if (!PERIOD_KEY_RE.test(key)) return { error: 'งวดต้องอยู่ในรูปแบบ YYYY-MM (เช่น 2026-08)' }

  const { cutoff_day } = await getSalarySettings()
  const { start, end } = periodRange(key, cutoff_day)

  const supabase = createServiceClient()
  const { data: dupe } = await supabase
    .from('salary_runs')
    .select('id')
    .eq('period_key', key)
    .maybeSingle()
  if (dupe) return { error: `งวด${periodLabel(key)}ถูกเปิดไว้แล้ว` }

  const { data, error } = await supabase
    .from('salary_runs')
    .insert({ period_key: key, period_start: start, period_end: end, created_by: auth.userId })
    .select('id')
    .single()
  if (error || !data) {
    return {
      error: `เปิดงวดไม่สำเร็จ: ${error?.message || 'ไม่ทราบสาเหตุ'} (ตรวจว่ารัน migration เงินเดือนแล้ว)`,
    }
  }

  const id = (data as unknown as { id: string }).id
  await logActivity('CREATE_SALARY_RUN', { period_key: key, period_start: start, period_end: end })
  revalidatePath('/salary/runs')
  return { id }
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
    .select('id, period_key, period_start, period_end, note, created_at')
    .eq('id', runId)
    .maybeSingle()
  if (!runRaw) return { error: 'ไม่พบงวดนี้' }
  const run = runRaw as unknown as RunHeader

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
        employment_type: (s.employment_type === 'freelance' ? 'freelance' : 'fulltime') as EmploymentType,
        total: Number(s.total || 0),
        warnings: Array.isArray(s.warnings) ? s.warnings : [],
        computed_at: s.computed_at,
        finalized_at: s.finalized_at,
        paid_at: s.paid_at,
      }
    })
    // เรียงฝั่ง JS — ชื่อคนมาจากอีก query จึงสั่ง order ที่ DB ไม่ได้
    .sort((a, b) => cmpText(a.full_name || a.nickname || '', b.full_name || b.nickname || ''))

  return { run, slips }
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
    .select('id, period_start, period_end')
    .eq('id', runId)
    .maybeSingle()
  if (!runRaw) return { error: 'ไม่พบงวดนี้' }
  const run = runRaw as unknown as { id: string; period_start: string; period_end: string }

  // listDuties() คืนทุกหน้าที่รวมที่ปิดใช้งาน — ตั้งใจ: สลิปเก่าอาจอ้างรหัสที่เพิ่งปิดไป
  const [settings, duties] = await Promise.all([getSalarySettings(), listDuties()])

  // ขอบเขตงวดเป็น "วันไทย" — แปลงเป็น instant UTC ก่อนยิง filter
  const fromISO = new Date(`${run.period_start}T00:00:00+07:00`).toISOString()
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
        'id, user_id, check_type, checked_in_at, checked_out_at, event_id, duties, out_of_province, note, events:event_id(name)'
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
      sp.employment_type === 'freelance' ? 'freelance' : 'fulltime'
    const base_salary = Number(sp.base_salary || 0)
    const adjustments: SalaryAdjustment[] = Array.isArray(prev?.adjustments) ? prev.adjustments : []

    const result = computeSlip({
      profile: {
        employment_type,
        base_salary,
        work_start: sp.work_start || '10:00',
        work_end: sp.work_end || '19:00',
        ot_rate: Number(sp.ot_rate || 0),
      },
      checkins: checkinsByUser.get(userId) || [],
      duties,
      oopRate: settings.out_of_province_rate,
      periodStart: run.period_start,
      periodEnd: run.period_end,
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
 */
export async function getSlipForView(
  slipId: string
): Promise<{ error: string } | { slip: SlipDetail; isAdmin: boolean }> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  const isAdmin = role === 'admin'

  const supabase = createServiceClient()
  const { data } = await supabase
    .from('salary_slips')
    .select(
      'id, run_id, user_id, status, employment_type, base_salary, lines, adjustments, warnings, total, computed_at, finalized_at, paid_at'
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
    paid_at: string | null
  }
  const raw = data as unknown as SlipRaw

  if (!isAdmin && (raw.user_id !== userId || raw.status === 'draft')) return { error: 'ไม่พบสลิป' }

  const [runRes, profileRes] = await Promise.all([
    supabase
      .from('salary_runs')
      .select('period_key, period_start, period_end')
      .eq('id', raw.run_id)
      .maybeSingle(),
    supabase
      .from('profiles')
      .select('full_name, nickname, bank_name, bank_account_number, account_holder_name')
      .eq('id', raw.user_id)
      .maybeSingle(),
  ])

  const runRow = (runRes.data || {}) as unknown as Partial<RunHeader>
  const who = (profileRes.data || {}) as unknown as {
    full_name?: string | null
    nickname?: string | null
    bank_name?: string | null
    bank_account_number?: string | null
    account_holder_name?: string | null
  }

  const slip: SlipDetail = {
    id: raw.id,
    run_id: raw.run_id,
    user_id: raw.user_id,
    status: raw.status,
    employment_type: raw.employment_type === 'freelance' ? 'freelance' : 'fulltime',
    base_salary: Number(raw.base_salary || 0),
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    adjustments: Array.isArray(raw.adjustments) ? raw.adjustments : [],
    warnings: Array.isArray(raw.warnings) ? raw.warnings : [],
    total: Number(raw.total || 0),
    computed_at: raw.computed_at,
    finalized_at: raw.finalized_at,
    paid_at: raw.paid_at,
    period_key: runRow.period_key || '',
    period_start: runRow.period_start || '',
    period_end: runRow.period_end || '',
    full_name: who.full_name ?? null,
    nickname: who.nickname ?? null,
    bank_name: who.bank_name ?? null,
    bank_account_number: who.bank_account_number ?? null,
    account_holder_name: who.account_holder_name ?? null,
  }

  return { slip, isAdmin }
}
