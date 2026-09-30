// ============================================================================
// ข้อมูลของคลังเก็บ (/finance/archive) — ใบที่จ่ายแล้วทีละ 50 ใบ ตัวกรองทั้งหมดมาจาก URL และกรองในฐานข้อมูล
// ยอดรวม (total / netTotal) คิดจากทุกใบที่ผ่านตัวกรอง ไม่ใช่เฉพาะหน้านี้ — สูตรเงินเดียวกับทุกหน้า (lib/finance/money.ts)
//
// ไม่ใช่ไฟล์ server action (ไม่เป็น endpoint) และถือ service-role client → เรียกจาก server component เท่านั้น ห้าม import จาก client
// ตัวกรองชุดเดียวคือ claimsQuery: พนักงานได้เฉพาะใบของตัวเอง · ใบที่ซ่อนไม่อยู่ในคลังเก็บ
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { PAID_STATUSES } from '@/lib/finance/conditions'
import { netOf, type MoneyFields } from '@/lib/finance/money'
import { CLAIM_ID_RE, claimsQuery, readAllRows, readOptional, type ClaimsQueryFilters, type Db } from './claim-db'
import { authorizeViewer, listSelect, toListClaim } from './list-data'
import { normalizeQuery, readTextMatches } from './search-data'
import type { FinanceViewer } from './viewer'
import { ARCHIVE_PAGE_SIZE, type ArchivePageData, type ArchiveQuery, type ListClaim } from './view-data'

type Params = Record<string, string | string[] | undefined>

const TYPES: readonly ArchiveQuery['type'][] = ['', 'event', 'other', 'advance', 'petty_cash']
const AMOUNTS: readonly ArchiveQuery['amount'][] = ['', '0', '1-1000', '1001-5000', '5001-10000', '10001+']
/** ช่วงยอดเงิน (รวมทั้งสองค่า) ของตัวเลือกช่วงยอด — ตรงกับตัวกรองเดิมของหน้าคลังเก็บ */
const AMOUNT_RANGES: Record<Exclude<ArchiveQuery['amount'], ''>, { min: number; max?: number }> = {
  '0': { min: 0, max: 0 },
  '1-1000': { min: 1, max: 1000 },
  '1001-5000': { min: 1001, max: 5000 },
  '5001-10000': { min: 5001, max: 10000 },
  '10001+': { min: 10001 },
}

const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : Array.isArray(v) ? (v[0] ?? '') : '')

/** 'YYYY-MM-DD' ที่เป็นวันที่จริง (ไม่ใช่ 2026-02-31) */
function isDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** อ่านตัวกรองของคลังเก็บจาก URL (คีย์ = ชื่อช่องของ ArchiveQuery) — ค่าที่ไม่ถูกรูปแบบถูกทิ้ง (เหมือน filtersFromQuery) */
export function parseArchiveQuery(params: Params): ArchiveQuery {
  const page = Number.parseInt(one(params.page), 10)
  const type = one(params.type) as ArchiveQuery['type']
  const amount = one(params.amount) as ArchiveQuery['amount']
  const month = one(params.month)
  const day = (key: string) => (isDay(one(params[key])) ? one(params[key]) : '')
  const uuid = (key: string) => (CLAIM_ID_RE.test(one(params[key])) ? one(params[key]).toLowerCase() : '')
  return {
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 100_000) : 1,
    q: normalizeQuery(one(params.q)),
    by: uuid('by'),
    type: TYPES.includes(type) ? type : '',
    cat: one(params.cat).slice(0, 64),
    amount: AMOUNTS.includes(amount) ? amount : '',
    event: uuid('event'),
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : '',
    efrom: day('efrom'),
    eto: day('eto'),
    pfrom: day('pfrom'),
    pto: day('pto'),
  }
}

/** วันสุดท้ายของเดือน 'YYYY-MM' → 'YYYY-MM-DD' */
function lastDayOf(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, '0')}`
}

/** ตัวกรองของคลังเก็บ → ตัวกรองของ claimsQuery (ใบที่จ่ายแล้วเท่านั้น) · เดือนที่ใช้จ่าย ∩ ช่วงวันที่ใช้จ่าย */
export function archiveFilters(query: ArchiveQuery): ClaimsQueryFilters {
  const f: ClaimsQueryFilters = { status: PAID_STATUSES }
  if (query.by) f.submitted_by = query.by
  if (query.type) f.claim_type = query.type
  if (query.cat) f.category = query.cat
  if (query.event) f.job_event_id = query.event
  if (query.amount) {
    const range = AMOUNT_RANGES[query.amount]
    f.amountMin = range.min
    if (range.max !== undefined) f.amountMax = range.max
  }
  const froms = [query.month ? `${query.month}-01` : '', query.efrom].filter(Boolean)
  const tos = [query.month ? lastDayOf(query.month) : '', query.eto].filter(Boolean)
  if (froms.length) f.expenseFrom = froms.sort().at(-1)
  if (tos.length) f.expenseTo = tos.sort()[0]
  if (query.pfrom) f.paidFrom = query.pfrom
  if (query.pto) f.paidTo = query.pto
  return f
}

/** ช่องเงินที่ใช้คิดยอดรวม + ลำดับ */
const LEAN_SELECT = 'id, created_at, amount, vat_mode, withholding_tax_rate'
type Lean = MoneyFields & { id: string; created_at: string }

const OPTIONS_SELECT = 'submitted_by, job_event_id, submitter:profiles!expense_claims_submitted_by_fkey(full_name), job_event:job_cost_events!expense_claims_job_event_id_fkey(event_name)'
type OptionRow = {
  submitted_by: string | null
  job_event_id: string | null
  submitter: { full_name: string | null } | null
  job_event: { event_name: string | null } | null
}

/** ตัวเลือกผู้เบิก / งาน ของกล่องกรอง — จากใบที่จ่ายแล้วทั้งหมดที่ผู้ใช้เห็นได้ (ไม่ขึ้นกับตัวกรองอื่น) เรียงตามชื่อ */
async function archiveOptions(supabase: Db, viewer: FinanceViewer) {
  const { rows, error } = await readAllRows<OptionRow>((from, to) =>
    claimsQuery(supabase, viewer, { status: PAID_STATUSES }, OPTIONS_SELECT).range(from, to))
  const submitters = new Map<string, string>()
  const events = new Map<string, string>()
  for (const r of rows) {
    if (r.submitted_by && r.submitter?.full_name) submitters.set(r.submitted_by, r.submitter.full_name)
    if (r.job_event_id && r.job_event?.event_name) events.set(r.job_event_id, r.job_event.event_name)
  }
  const sorted = (m: Map<string, string>) =>
    [...m].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
  return { submitters: sorted(submitters), events: sorted(events), error }
}

/**
 * หนึ่งหน้าของคลังเก็บ + ยอดรวมของทุกใบที่ผ่านตัวกรอง + ตัวเลือกของกล่องกรอง
 * ไม่มีคำค้น: หน้านี้ ยอดรวม และตัวเลือก อ่านพร้อมกัน (รอบเดียว + หน้าถัดไปของยอดรวมเมื่อเกิน 1,000 ใบ)
 * มีคำค้น: หาใบที่ตรงก่อน (readTextMatches) แล้วอ่านแถวของหน้านี้ด้วย id · ไม่เรียก rpc
 */
export async function getArchivePage(
  viewer: FinanceViewer | null,
  query: ArchiveQuery,
): Promise<{ data: ArchivePageData | null; error?: string }> {
  const who = await authorizeViewer(viewer)
  if (!who) return { data: null, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const filters = archiveFilters(query)
  const pageRange = (page: number) => [(page - 1) * ARCHIVE_PAGE_SIZE, page * ARCHIVE_PAGE_SIZE - 1] as const
  const readPage = (page: number) =>
    readOptional(() => claimsQuery(supabase, who, filters, listSelect()).range(...pageRange(page)))

  const [matched, firstTry, options] = await Promise.all([
    query.q
      ? readTextMatches<Lean>(supabase, who, filters, () => LEAN_SELECT, query.q)
      : readAllRows<Lean>((from, to) => claimsQuery(supabase, who, filters, LEAN_SELECT).range(from, to)),
    query.q ? null : readPage(query.page),
    archiveOptions(supabase, who),
  ])
  const textOf = (e: string | { message: string } | null | undefined) => (typeof e === 'string' ? e : e?.message)
  const failed = textOf(matched.error) || textOf(firstTry?.error) || textOf(options.error)
  if (failed) {
    console.error('getArchivePage:', failed)
    return { data: null, error: failed }
  }

  const total = matched.rows.length
  const pages = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE))
  // หน้าเกินหน้าสุดท้าย (ลิงก์เก่า / ตัวกรองแคบลง) → แสดงหน้าสุดท้าย
  const page = Math.min(query.page, pages)
  let rows: ListClaim[]
  if (query.q) {
    const start = (page - 1) * ARCHIVE_PAGE_SIZE
    const ids = matched.rows.slice(start, start + ARCHIVE_PAGE_SIZE).map(r => r.id)
    const got = ids.length === 0
      ? { data: [], error: null }
      : await readOptional(() => claimsQuery(supabase, who, filters, listSelect()).in('id', ids))
    if (got.error) {
      console.error('getArchivePage:', got.error.message)
      return { data: null, error: got.error.message }
    }
    const byId = new Map(((got.data ?? []) as unknown as Parameters<typeof toListClaim>[0][]).map(r => [r.id, r]))
    rows = ids.map(id => byId.get(id)).filter(r => r !== undefined).map(toListClaim)
  } else {
    let got = firstTry
    if (page !== query.page) got = await readPage(page)
    if (got?.error) {
      console.error('getArchivePage:', got.error.message)
      return { data: null, error: got.error.message }
    }
    rows = ((got?.data ?? []) as unknown as Parameters<typeof toListClaim>[0][]).map(toListClaim)
  }

  return {
    data: {
      rows,
      total,
      page,
      pageSize: ARCHIVE_PAGE_SIZE,
      pages,
      netTotal: matched.rows.reduce((sum, c) => sum + netOf(c), 0),
      submitters: options.submitters,
      events: options.events,
      query: { ...query, page },
    },
  }
}
