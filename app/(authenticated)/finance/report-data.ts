// ============================================================================
// ข้อมูลของรายงาน: รายงานตรวจสอบ (/finance/overview) และหัก ณ ที่จ่าย (/finance/download)
// - รายงานตรวจสอบ: แถวแบบเบา OverviewRow เฉพาะช่วงวันที่ที่เลือก (ยอดรวมยังคิดในหน้าจอจากแถวชุดนี้ — ตัวเลขเท่าเดิม)
// - หัก ณ ที่จ่าย: ยอดรวมต่อ (ผู้เบิก, สถานะ, เดือน) = WhtCell แทนแถวใบเบิก — คิดในฐานข้อมูลด้วย finance_wht_cells()
//   (supabase/migrations/20261001_finance_speed.sql) · ยังไม่รัน SQL → รวมยอดในระบบแทน (ตัวเลขเท่ากัน ช้ากว่า) พร้อมเตือนครั้งเดียว
//
// ไม่ใช่ไฟล์ server action (ไม่เป็น endpoint) และถือ service-role client → เรียกจาก server component เท่านั้น ห้าม import จาก client
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { moneyOf, type MoneyFields } from '@/lib/finance/money'
import { thaiTodayIso } from '@/lib/thai-date'
import { claimsQuery, readAllRows, type ClaimsQueryFilters } from './claim-db'
import { thaiMonth } from './claims-filter'
import { authorizeViewer, listSelect, toListClaim } from './list-data'
import type { FinanceViewer } from './viewer'
import type { OverviewRange, OverviewRow, WhtCell, WhtPerson } from './view-data'

type Params = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '')

// ============================================================================
// รายงานตรวจสอบ (/finance/overview)
// ============================================================================

const PRESETS: readonly OverviewRange['preset'][] = ['day', 'week', 'month', 'year', 'custom', 'all']
/** ขอบของช่วงเองที่เว้นว่างไว้ (หน้าจอแสดงว่าไม่กำหนด) — ไม่ส่งไปกรองในฐานข้อมูล */
export const RANGE_MIN = '0000-01-01'
export const RANGE_MAX = '9999-12-31'

const isDay = (s: string) => /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(s)
const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)

/**
 * ช่วงวันที่ของรายงานจาก URL (?preset&from&to) — ค่าเริ่มต้น 'month' = เดือนนี้ตามเวลาไทย
 * preset วัน/สัปดาห์/เดือน/ปี คิดจากวันนี้ตามเวลาไทยที่ server เสมอ (ลิงก์เก่าไม่ค้างช่วงเดิม) · 'all' = ไม่กรองวันที่
 * 'custom' ใช้ from/to จาก URL — ฝั่งที่เว้นว่าง = RANGE_MIN / RANGE_MAX
 */
export function overviewRangeFromParams(params: Params, today: string = thaiTodayIso()): OverviewRange {
  const raw = one(params.preset) as OverviewRange['preset']
  const preset = PRESETS.includes(raw) ? raw : 'month'
  if (preset === 'all') return { preset, from: '', to: '' }
  if (preset === 'custom') {
    const from = one(params.from), to = one(params.to)
    return { preset, from: isDay(from) ? from : RANGE_MIN, to: isDay(to) ? to : RANGE_MAX }
  }
  if (preset === 'day') return { preset, from: today, to: today }
  if (preset === 'week') return { preset, from: shiftDay(today, -6), to: today }
  const [y, m] = today.split('-').map(Number)
  if (preset === 'month') {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
    return { preset, from: `${today.slice(0, 7)}-01`, to: `${today.slice(0, 7)}-${String(last).padStart(2, '0')}` }
  }
  return { preset, from: `${y}-01-01`, to: `${y}-12-31` }
}

type OverviewSource = Parameters<typeof toListClaim>[0] & {
  tax_invoice_numbers?: string[] | null
  notes?: string | null
  staff_roles?: { role: string; label: string }[] | null
}

/**
 * แถวของรายงานตรวจสอบในช่วงวันที่ที่ใช้จ่าย (expense_date รวมทั้งสองวัน) — 'all' = ทุกใบ · อ่านทุกหน้า
 * ใบที่ผู้ใช้เห็นได้เท่านั้น (claimsQuery) · ไม่มีรายการ URL / รายละเอียด / บัญชีธนาคาร
 */
export async function getOverviewRows(viewer: FinanceViewer | null, range: OverviewRange): Promise<{ data: OverviewRow[]; error?: string }> {
  const who = await authorizeViewer(viewer)
  if (!who) return { data: [], error: 'Unauthorized' }

  const filters: ClaimsQueryFilters = {}
  if (range.preset !== 'all') {
    if (isDay(range.from) && range.from !== RANGE_MIN) filters.expenseFrom = range.from
    if (isDay(range.to) && range.to !== RANGE_MAX) filters.expenseTo = range.to
  }
  const supabase = createServiceClient()
  const { rows, error } = await readAllRows<OverviewSource>((from, to) =>
    claimsQuery(supabase, who, filters, listSelect(['notes', 'staff_roles'])).range(from, to))
  if (error) {
    console.error('getOverviewRows:', error.message)
    return { data: [], error: error.message }
  }
  return {
    data: rows.map(row => ({
      ...toListClaim(row),
      tax_invoice_numbers: row.tax_invoice_numbers ?? null,
      notes: row.notes ?? null,
      staff_roles: row.staff_roles ?? null,
    })),
  }
}

// ============================================================================
// หัก ณ ที่จ่าย (/finance/download) — แอดมินเท่านั้น
// ============================================================================

/** ยังไม่ได้รัน SQL ของฟังก์ชันรวมยอด — เตือนใน log ครั้งเดียวต่อ process (ทุกคำขอยังลอง rpc ก่อน: รัน SQL แล้วใช้ได้ทันที) */
export const WHT_SQL_MISSING = 'ยังไม่ได้รัน 20261001_finance_speed.sql — หน้าหัก ณ ที่จ่ายรวมยอดในระบบแทน (ช้ากว่า)'
let whtWarned = false

/** PGRST202 = PostgREST ไม่รู้จักฟังก์ชัน · 42883 = Postgres ไม่มีฟังก์ชัน */
const isMissingFunction = (error: { code?: string } | null | undefined) => error?.code === 'PGRST202' || error?.code === '42883'

const WHT_SELECT = 'id, status, expense_date, created_at, submitted_by, amount, vat_mode, withholding_tax_rate, bank_name, bank_account_number, account_holder_name'
type WhtSource = MoneyFields & {
  id: string
  status: string
  expense_date: string | null
  created_at: string
  submitted_by: string | null
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
}

const BANK_FIELDS = ['bank_name', 'bank_account_number', 'account_holder_name'] as const

/**
 * รวมยอดในระบบ (ทางสำรองของ finance_wht_cells) — แถวต้องเรียง created_at ใหม่ → เก่า ต่อด้วย id
 * บัญชีธนาคารของกลุ่ม = ค่าที่ไม่ว่างของใบแรกในลำดับนั้น (ใบใหม่สุดที่กรอกไว้) พร้อมเวลาสร้างของใบนั้น
 */
export function aggregateWhtCells(rows: WhtSource[]): WhtCell[] {
  const cells = new Map<string, WhtCell>()
  for (const c of rows) {
    const submittedBy = c.submitted_by ?? ''
    const month = thaiMonth(c.expense_date || c.created_at)
    const key = `${submittedBy}|${c.status}|${month}`
    let cell = cells.get(key)
    if (!cell) {
      cell = {
        submitted_by: submittedBy, status: c.status, month, n: 0, gross: 0, wht: 0, net: 0,
        bank_name: null, bank_name_at: null, bank_account_number: null, bank_account_number_at: null,
        account_holder_name: null, account_holder_name_at: null,
      }
      cells.set(key, cell)
    }
    const tax = moneyOf(c)
    cell.n += 1
    cell.gross += Number(c.amount) || 0
    cell.wht += tax.whtAmount
    cell.net += tax.netPayable
    for (const field of BANK_FIELDS) {
      if (!cell[field] && c[field]) {
        cell[field] = c[field]
        cell[`${field}_at`] = c.created_at
      }
    }
  }
  return [...cells.values()]
}

type RpcCell = Omit<WhtCell, 'n' | 'gross' | 'wht' | 'net' | 'submitted_by'> & {
  submitted_by: string | null
  n: number | string
  gross: number | string
  wht: number | string
  net: number | string
}

/**
 * ยอดรวมของใบที่มีหัก ณ ที่จ่าย (อัตรา > 0, ไม่รวมใบที่ซ่อน) ต่อ (ผู้เบิก, สถานะ, เดือนไทยของวันที่ใช้จ่าย)
 * ลอง finance_wht_cells() ก่อน · ไม่มีฟังก์ชัน → อ่านเฉพาะช่องที่ใช้แล้วรวมในระบบ (ตัวเลขเท่ากัน) + เตือนครั้งเดียว
 */
export async function getWhtCells(viewer: FinanceViewer | null): Promise<{ data: WhtCell[]; error?: string }> {
  const who = await authorizeViewer(viewer)
  if (!who) return { data: [], error: 'Unauthorized' }
  if (!who.isAdmin) return { data: [], error: 'เฉพาะแอดมินเท่านั้น' }

  const supabase = createServiceClient()
  const viaRpc = await readAllRows<RpcCell>((from, to) =>
    supabase.rpc('finance_wht_cells')
      .order('submitted_by', { ascending: true })
      .order('status', { ascending: true })
      .order('month', { ascending: true })
      .range(from, to))
  if (!viaRpc.error) {
    return {
      data: viaRpc.rows.map(r => ({
        ...r,
        submitted_by: r.submitted_by ?? '',
        n: Number(r.n),
        gross: Number(r.gross),
        wht: Number(r.wht),
        net: Number(r.net),
      })),
    }
  }
  if (!isMissingFunction(viaRpc.error)) {
    console.error('getWhtCells:', viaRpc.error.message)
    return { data: [], error: viaRpc.error.message }
  }
  if (!whtWarned) {
    whtWarned = true
    console.warn(WHT_SQL_MISSING)
  }

  const { rows, error } = await readAllRows<WhtSource>((from, to) =>
    claimsQuery(supabase, who, {}, WHT_SELECT).gt('withholding_tax_rate', 0).range(from, to))
  if (error) {
    console.error('getWhtCells:', error.message)
    return { data: [], error: error.message }
  }
  return { data: aggregateWhtCells(rows) }
}

type ProfileRow = { id: string; full_name: string | null; nickname: string | null; national_id: string | null; address: string | null }
/** ข้อมูลส่วนตัวที่หนังสือรับรองหัก ณ ที่จ่ายใช้ (รูปเดียวกับ WhtProfile ของหน้าจอ) */
export type WhtProfileFields = { nickname: string | null; national_id: string | null; address: string | null }
/** id ต่อคำขอ .in() — URL ของ PostgREST ต้องไม่ยาวเกิน */
const IN_CHUNK = 100

/**
 * ชื่อ + ข้อมูลส่วนตัว (ชื่อเล่น / เลขบัตร / ที่อยู่) เฉพาะผู้เบิกที่มีกลุ่มยอดใน cells — แอดมินเท่านั้น
 * อ่านด้วย in(id) ของคนเหล่านั้นเท่านั้น (ไม่อ่าน/ไม่ส่งข้อมูลของทุกคนในระบบ) · ชื่อว่าง = '' (หน้าจอแสดง 'ไม่ระบุ')
 */
export async function getWhtPeople(
  viewer: FinanceViewer | null,
  cells: WhtCell[],
): Promise<{ people: WhtPerson[]; profileMap: Record<string, WhtProfileFields>; error?: string }> {
  const who = await authorizeViewer(viewer)
  if (!who) return { people: [], profileMap: {}, error: 'Unauthorized' }
  if (!who.isAdmin) return { people: [], profileMap: {}, error: 'เฉพาะแอดมินเท่านั้น' }

  const ids = [...new Set(cells.map(c => c.submitted_by).filter(Boolean))].sort()
  if (ids.length === 0) return { people: [], profileMap: {} }
  const supabase = createServiceClient()
  const parts = await Promise.all(Array.from({ length: Math.ceil(ids.length / IN_CHUNK) }, (_, i) =>
    supabase.from('profiles').select('id, full_name, nickname, national_id, address').in('id', ids.slice(i * IN_CHUNK, (i + 1) * IN_CHUNK))))
  const failed = parts.find(p => p.error)?.error
  if (failed) {
    console.error('getWhtPeople:', failed.message)
    return { people: [], profileMap: {}, error: failed.message }
  }
  const people: WhtPerson[] = []
  const profileMap: Record<string, WhtProfileFields> = {}
  for (const p of parts.flatMap(part => (part.data ?? []) as ProfileRow[])) {
    people.push({ id: p.id, name: p.full_name ?? '' })
    profileMap[p.id] = { nickname: p.nickname ?? null, national_id: p.national_id ?? null, address: p.address ?? null }
  }
  return { people, profileMap }
}
