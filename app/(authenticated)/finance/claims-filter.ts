// ตัวกรองหน้าใบเบิก (/finance) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
// กรองฝั่ง browser บนข้อมูลที่ server ส่งมาแล้วเท่านั้น (พนักงานได้เฉพาะใบของตัวเองอยู่แล้ว) จึงไม่มีผลต่อสิทธิ์การมองเห็น
// ตรวจด้วย:  npx tsx "app/(authenticated)/finance/claims-filter.check.ts"

import { CLAIM_STATUSES, getClaimChecklist } from '../costs/types'
import type { ExpenseClaim } from '../costs/types'

export const CLAIM_TYPE_FILTERS = ['all', 'event', 'advance', 'petty_cash', 'other'] as const
export type ClaimTypeFilter = typeof CLAIM_TYPE_FILTERS[number]

export interface ClaimFilters {
  /** 'all' หรือสถานะใบเบิก — 'paid' คือแท็บ "ชำระเงินแล้ว" (เฉพาะแอดมิน) */
  status: string
  type: ClaimTypeFilter
  /** id ผู้เบิก ('' = ทุกคน) */
  by: string
  category: string
  /** 'YYYY-MM' ตามเวลาไทย */
  month: string
  /** เฉพาะใบที่เอกสารยังไม่ครบ */
  incomplete: boolean
  q: string
}

/** แท็บชำระแล้วนับเดือนตามวันที่จ่าย แท็บอื่นนับตามวันที่ใช้จ่าย (ตรงกับวันที่ที่แสดงในแต่ละแท็บ) */
export type MonthField = 'expense_date' | 'paid_at'

export const EMPTY_FILTERS: ClaimFilters = {
  status: 'all', type: 'all', by: '', category: '', month: '', incomplete: false, q: '',
}

/** อ่านตัวกรองจาก query string — ค่าที่ไม่รู้จักถูกทิ้ง */
export function filtersFromQuery(params: { get(name: string): string | null }): ClaimFilters {
  const status = params.get('status') || 'all'
  const type = params.get('type') || 'all'
  const month = params.get('month') || ''
  return {
    status: status === 'all' || CLAIM_STATUSES.some(s => s.value === status) ? status : 'all',
    type: (CLAIM_TYPE_FILTERS as readonly string[]).includes(type) ? (type as ClaimTypeFilter) : 'all',
    by: (params.get('by') || '').slice(0, 64),
    category: (params.get('cat') || '').slice(0, 64),
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : '',
    incomplete: params.get('docs') === 'missing',
    q: (params.get('q') || '').slice(0, 100),
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
  const qs = p.toString()
  return qs ? `?${qs}` : ''
}

/** มีตัวกรองอื่นนอกจากแท็บสถานะหรือไม่ */
export function hasFilters(f: ClaimFilters): boolean {
  return f.type !== 'all' || !!f.by || !!f.category || !!f.month || f.incomplete || !!f.q.trim()
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
