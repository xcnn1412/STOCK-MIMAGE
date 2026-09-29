// ตัวกรองหน้าใบเบิก (/finance) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
// กรองฝั่ง browser บนข้อมูลที่ server ส่งมาแล้วเท่านั้น (พนักงานได้เฉพาะใบของตัวเองอยู่แล้ว) จึงไม่มีผลต่อสิทธิ์การมองเห็น
// ตรวจด้วย:  npx tsx "app/(authenticated)/finance/claims-filter.check.ts"

import { CLAIM_STATUSES, getClaimChecklist } from '../costs/types'
import type { ExpenseClaim } from '../costs/types'
import { BUNDLE_MAX_CLAIMS_PER_FILE } from '@/lib/claim-bundle-labels'
import type { BundleLayout } from '@/lib/claim-bundle-labels'

export const CLAIM_TYPE_FILTERS = ['all', 'event', 'advance', 'petty_cash', 'other'] as const
export type ClaimTypeFilter = typeof CLAIM_TYPE_FILTERS[number]

/** สถานะแฟ้ม: no = ยังไม่เข้าแฟ้ม · yes = เข้าแฟ้มแล้ว (รวมที่ไฟล์เปลี่ยน) · changed = เข้าแฟ้มแล้วแต่ไฟล์แนบเปลี่ยน */
export const FILED_FILTERS = ['all', 'no', 'yes', 'changed'] as const
export type FiledFilter = typeof FILED_FILTERS[number]

export interface ClaimFilters {
  /** 'all' หรือสถานะใบเบิก — 'paid' คือแท็บ "ชำระเงินแล้ว" (เฉพาะแอดมิน) */
  status: string
  type: ClaimTypeFilter
  /** id ผู้เบิก ('' = ทุกคน) */
  by: string
  category: string
  /** เดือนที่ใช้จ่าย 'YYYY-MM' ตามเวลาไทย ของแท็บที่ยังไม่จ่าย — แท็บชำระแล้วใช้เดือนที่ server โหลดมาแทน (ดู listQuery) */
  month: string
  /** เฉพาะใบที่เอกสารยังไม่ครบ */
  incomplete: boolean
  q: string
  /** สถานะเข้าแฟ้ม (URL: filed — ไม่ใส่เมื่อเป็น 'all') */
  filed: FiledFilter
}

/** แท็บชำระแล้วนับเดือนตามวันที่จ่าย แท็บอื่นนับตามวันที่ใช้จ่าย (ตรงกับวันที่ที่แสดงในแต่ละแท็บ) */
export type MonthField = 'expense_date' | 'paid_at'

export const EMPTY_FILTERS: ClaimFilters = {
  status: 'all', type: 'all', by: '', category: '', month: '', incomplete: false, q: '', filed: 'all',
}

/** อ่านตัวกรองจาก query string — ค่าที่ไม่รู้จักถูกทิ้ง */
export function filtersFromQuery(params: { get(name: string): string | null }): ClaimFilters {
  const status = params.get('status') || 'all'
  const type = params.get('type') || 'all'
  const month = params.get('month') || ''
  const filed = params.get('filed') || 'all'
  return {
    status: status === 'all' || CLAIM_STATUSES.some(s => s.value === status) ? status : 'all',
    type: (CLAIM_TYPE_FILTERS as readonly string[]).includes(type) ? (type as ClaimTypeFilter) : 'all',
    by: (params.get('by') || '').slice(0, 64),
    category: (params.get('cat') || '').slice(0, 64),
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : '',
    incomplete: params.get('docs') === 'missing',
    q: (params.get('q') || '').slice(0, 100),
    filed: (FILED_FILTERS as readonly string[]).includes(filed) ? (filed as FiledFilter) : 'all',
  }
}

/**
 * ตัดค่าที่ใช้กับข้อมูลชุดนี้ไม่ได้ออก — ลิงก์เก่าหรือ URL ที่พิมพ์เองต้องไม่ทำให้รายการว่าง
 * ทั้งที่กล่องเลือกแสดงว่า "ทุกคน": ผู้เบิก/หมวดที่ไม่มีในข้อมูล และแท็บชำระแล้วของคนที่ไม่ใช่แอดมิน
 */
export function sanitizeFilters(f: ClaimFilters, known: ExpenseClaim[], isAdmin: boolean): ClaimFilters {
  return {
    ...f,
    status: f.status === 'paid' && !isAdmin ? 'all' : f.status,
    by: f.by && known.some(c => c.submitted_by === f.by) ? f.by : '',
    category: f.category && known.some(c => c.category === f.category) ? f.category : '',
  }
}

/** ตัวกรอง → query string ขึ้นต้นด้วย '?' ('' เมื่อไม่มีตัวกรอง) */
export function filtersToQuery(f: ClaimFilters): string {
  const p = new URLSearchParams()
  if (f.status !== 'all') p.set('status', f.status)
  if (f.type !== 'all') p.set('type', f.type)
  if (f.by) p.set('by', f.by)
  if (f.category) p.set('cat', f.category)
  if (f.month) p.set('month', f.month)
  if (f.incomplete) p.set('docs', 'missing')
  if (f.q.trim()) p.set('q', f.q.trim())
  if (f.filed !== 'all') p.set('filed', f.filed)
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

/** query string ของหน้ารายการ — แท็บชำระแล้วใช้เดือนที่ server โหลดมา แท็บอื่นใช้เดือนที่ใช้จ่าย */
export function listQuery(f: ClaimFilters, paidMonth: string): string {
  return filtersToQuery(f.status === 'paid' ? { ...f, month: paidMonth } : f)
}

/** ค่าเริ่มต้นจาก URL — เดือนใน URL ของแท็บชำระแล้วเป็นเดือนที่จ่าย ไม่ใช่ตัวกรองเดือนที่ใช้จ่าย */
export function initialFilters(
  params: { get(name: string): string | null },
  known: ExpenseClaim[],
  isAdmin: boolean,
): ClaimFilters {
  const fromUrl = filtersFromQuery(params)
  const f = sanitizeFilters(fromUrl, known, isAdmin)
  // ดู status ใน URL ไม่ใช่หลัง sanitize — คนที่ไม่ใช่แอดมินเปิดลิงก์แท็บชำระแล้วตกไปแท็บ "ทั้งหมด"
  // และเดือนที่จ่ายต้องไม่กลายเป็นตัวกรองเดือนที่ใช้จ่ายของแท็บนั้น
  return fromUrl.status === 'paid' ? { ...f, month: '' } : f
}

/** มีตัวกรองอื่นนอกจากแท็บสถานะหรือไม่ */
export function hasFilters(f: ClaimFilters): boolean {
  return f.type !== 'all' || !!f.by || !!f.category || !!f.month || f.incomplete || !!f.q.trim() || f.filed !== 'all'
}

const THAI_OFFSET_MS = 7 * 60 * 60 * 1000

/** เดือน 'YYYY-MM' ตามเวลาไทย — วันที่ล้วน (YYYY-MM-DD) ใช้ตามที่เขียน, ค่าที่มีเวลาแปลงเป็นเวลาไทยก่อน */
export function thaiMonth(value: string | null | undefined): string {
  if (!value) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.slice(0, 7)
  const t = new Date(value).getTime()
  return Number.isNaN(t) ? '' : new Date(t + THAI_OFFSET_MS).toISOString().slice(0, 7)
}

/** กรองทุกอย่างยกเว้นแท็บสถานะ (หน้าจอเลือกชุดข้อมูลตามแท็บเองก่อนเรียก) */
export function filterClaims(claims: ExpenseClaim[], f: ClaimFilters, monthField: MonthField): ExpenseClaim[] {
  const q = f.q.trim().toLowerCase()
  return claims.filter(c => {
    if (f.type !== 'all' && c.claim_type !== f.type) return false
    if (f.by && c.submitted_by !== f.by) return false
    if (f.category && c.category !== f.category) return false
    if (f.month && thaiMonth(c[monthField]) !== f.month) return false
    if (f.incomplete && getClaimChecklist(c).isComplete) return false
    if (f.filed !== 'all') {
      const state = filedState(c)
      if (f.filed === 'no' && state !== 'none') return false
      if (f.filed === 'yes' && state === 'none') return false
      if (f.filed === 'changed' && state !== 'changed') return false
    }
    if (!q) return true
    return [c.claim_number, c.title, c.submitter?.full_name, c.job_event?.event_name]
      .some(text => !!text && text.toLowerCase().includes(q))
  })
}

export interface SubmitterOption { id: string; name: string; count: number }

/** รายชื่อผู้เบิกจากข้อมูลทั้งหมด (รายชื่อคงที่ทุกแท็บ) — count นับเฉพาะใบในชุดที่กำลังแสดง */
export function submitterOptions(all: ExpenseClaim[], shown: ExpenseClaim[]): SubmitterOption[] {
  const names = new Map<string, string>()
  for (const c of all) {
    if (c.submitted_by && !names.get(c.submitted_by)) names.set(c.submitted_by, c.submitter?.full_name || '')
  }
  const counts = new Map<string, number>()
  for (const c of shown) {
    if (c.submitted_by) counts.set(c.submitted_by, (counts.get(c.submitted_by) || 0) + 1)
  }
  return [...names]
    .map(([id, name]) => ({ id, name: name || '—', count: counts.get(id) || 0 }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'))
}

/** เดือนที่มีในชุดที่กำลังแสดง ใหม่ → เก่า (รวมเดือนที่เลือกอยู่เสมอ กล่องเลือกจะได้ไม่แสดงค่าผิด) */
export function monthOptions(shown: ExpenseClaim[], monthField: MonthField, selected: string): string[] {
  const months = new Set<string>()
  for (const c of shown) {
    const m = thaiMonth(c[monthField])
    if (m) months.add(m)
  }
  if (selected) months.add(selected)
  return [...months].sort().reverse()
}

/** หมวดหมู่ที่มีใช้จริงในข้อมูล (รวมหมวดเก่าที่ไม่อยู่ในตั้งค่าแล้ว) */
export function categoryValues(all: ExpenseClaim[]): string[] {
  return [...new Set(all.map(c => c.category).filter(Boolean))]
}

// ── จับชุดเอกสาร + เครื่องหมายเข้าแฟ้ม ─────────────────────────────────────────

/** ช่องไฟล์แนบของใบเบิก — unknown เพราะแถวจากฐานข้อมูลอาจเป็น null (server action ส่งแถวดิบมาได้) */
export interface ClaimFileFields {
  receipt_urls?: unknown
  actual_receipt_urls?: unknown
  tax_invoice_urls?: unknown
  refund_slip_urls?: unknown
}

/** นับเฉพาะสตริงที่ไม่ว่าง — tax_invoice_urls ใช้ '' แทนใบกำกับที่มีแต่เลขที่ ไม่มีไฟล์ */
const countUrls = (v: unknown) =>
  Array.isArray(v) ? v.filter(u => typeof u === 'string' && u.trim() !== '').length : 0

/** จำนวนไฟล์แนบทุกช่องของใบเบิก (ใบเสร็จ + ใบเสร็จตอนเคลียร์ + ใบกำกับภาษี + สลิปคืนเงิน) */
export function claimFileCount(c: ClaimFileFields): number {
  return countUrls(c.receipt_urls) + countUrls(c.actual_receipt_urls) + countUrls(c.tax_invoice_urls) + countUrls(c.refund_slip_urls)
}

export type FiledState = 'none' | 'filed' | 'changed'

/** none = ยังไม่เข้าแฟ้ม · changed = เข้าแฟ้มแล้วแต่จำนวนไฟล์แนบตอนนี้ไม่เท่ากับตอนเข้าแฟ้ม */
export function filedState(c: ClaimFileFields & { filed_at?: string | null; filed_file_count?: number | null }): FiledState {
  // ฐานข้อมูลที่ยังไม่รัน migration ไม่มีคอลัมน์ = undefined → ถือว่ายังไม่เข้าแฟ้ม
  if (!c.filed_at) return 'none'
  // constraint บังคับให้มีคู่กับ filed_at — ถ้าไม่มีจริงก็ไม่มีอะไรให้เทียบ ไม่เตือนมั่ว
  if (c.filed_file_count == null) return 'filed'
  return claimFileCount(c) === c.filed_file_count ? 'filed' : 'changed'
}

/** เลือกหลายใบได้ครั้งละไม่เกินนี้ (= 10 ไฟล์ PDF) — กันกดทีเดียวทั้งปีแล้วรอเป็นชั่วโมง */
export const MAX_BUNDLE_SELECTION = 200

// เทียบตัวเลขในเลขที่ใบเบิกแบบตัวเลข: EXP-202609-1000 ต้องมาหลัง EXP-202609-999
const CLAIM_NUMBER_ORDER = new Intl.Collator('en', { numeric: true })
const byClaimNumber = (a: { claim_number: string }, b: { claim_number: string }) =>
  CLAIM_NUMBER_ORDER.compare(a.claim_number, b.claim_number)

/** เรียงตามเลขที่ใบเบิกจากน้อยไปมาก แล้วแบ่งกลุ่มละไม่เกิน size */
export function chunkClaims<T extends { claim_number: string }>(claims: T[], size: number = BUNDLE_MAX_CLAIMS_PER_FILE): T[][] {
  const step = Number.isFinite(size) && size >= 1 ? Math.floor(size) : BUNDLE_MAX_CLAIMS_PER_FILE
  const sorted = [...claims].sort(byClaimNumber)
  const groups: T[][] = []
  for (let i = 0; i < sorted.length; i += step) groups.push(sorted.slice(i, i + step))
  return groups
}

/** ลิงก์ route ชุดเอกสาร — ไม่ใส่ duplex เมื่อไม่พิมพ์สองหน้า (ค่าเริ่มต้นของ route) */
export function bundleUrl(ids: string[], options: { layout: BundleLayout; duplex: boolean }): string {
  const layout = options.layout === 'two' ? 'two' : 'one'
  return `/api/pdf/claim-bundle?ids=${ids.map(encodeURIComponent).join(',')}&layout=${layout}${options.duplex ? '&duplex=1' : ''}`
}

/** ใบที่เลือกได้ในครั้งเดียว: เรียงตามเลขที่ใบเบิก ตัดที่ MAX_BUNDLE_SELECTION */
export function selectableIds(claims: { id: string; claim_number: string }[]): string[] {
  return [...claims].sort(byClaimNumber).slice(0, MAX_BUNDLE_SELECTION).map(c => c.id)
}

const LIST_QUERY_KEY = 'finance:list-query'

/** จำตัวกรองล่าสุดของแท็บเบราว์เซอร์นี้ไว้ให้ปุ่ม "กลับ" ในหน้าใบเบิก */
export function rememberListQuery(query: string) {
  try { sessionStorage.setItem(LIST_QUERY_KEY, query) } catch { /* ปิด storage — ปุ่มกลับพาไปรายการแบบไม่กรอง */ }
}

/** ลิงก์กลับหน้ารายการพร้อมตัวกรองที่ใช้ล่าสุด */
export function financeListHref(): string {
  try {
    const query = sessionStorage.getItem(LIST_QUERY_KEY) || ''
    return query.startsWith('?') ? `/finance${query}` : '/finance'
  } catch {
    return '/finance'
  }
}
