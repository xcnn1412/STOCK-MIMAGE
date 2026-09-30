// ============================================================================
// ค้นหาใบเบิก (/finance/search) — ช่องเดียว ค้นเลขที่ · หัวข้อ · ชื่อผู้เบิก · ชื่องาน ได้ทุกสถานะทุกเดือน
// คลังเก็บ (/finance/archive) ใช้ตัวค้นชุดเดียวกันกับช่อง q ของตัวเอง (readTextMatches)
//
// ไม่ใช่ไฟล์ server action (ไม่เป็น endpoint) และถือ service-role client → เรียกจาก server component เท่านั้น ห้าม import จาก client
// ทุกคำขออ่านใบเบิกผ่าน claimsQuery: พนักงานได้เฉพาะใบของตัวเอง · ใบที่ซ่อนไม่ออกมาเลย (ของแอดมินด้วย)
// คำค้นเป็นข้อความธรรมดา: \ % _ ถูก escape และ * ไม่เป็นตัวครอบทุกอย่าง (escapeLike)
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { claimsQuery, escapeLike, readAllRows, readOptional, type ClaimsQueryFilters, type Db } from './claim-db'
import { authorizeViewer, JOB_EVENT_EMBED, newestFirst, SUBMITTER_EMBED } from './list-data'
import type { FinanceViewer } from './viewer'
import type { SearchHit, SearchResult } from './view-data'

/** แสดงผลค้นหาไม่เกินนี้ (เกิน = truncated ให้พิมพ์ให้เจาะจงขึ้น) */
export const SEARCH_LIMIT = 100
/** ความยาวคำค้นสูงสุด */
const MAX_QUERY = 100
/** id ต่อคำขอ .in() — URL ของ PostgREST ต้องไม่ยาวเกิน (uuid 37 ตัวอักษรต่อ id) */
const IN_CHUNK = 100

const SEARCH_COLUMNS = [
  'id', 'claim_number', 'claim_type', 'title', 'amount', 'vat_mode', 'withholding_tax_rate', 'status',
  'expense_date', 'paid_at', 'created_at', 'submitted_by',
] as const
export const SEARCH_SELECT = [...SEARCH_COLUMNS, SUBMITTER_EMBED, JOB_EVENT_EMBED].join(', ')

/** คำค้นจาก URL: ตัดช่องว่างหัวท้าย รวมช่องว่างที่ติดกันเป็นช่องเดียว ยาวไม่เกิน 100 ตัวอักษร · ไม่ใช่ข้อความ = '' */
export function normalizeQuery(q: unknown): string {
  if (typeof q !== 'string') return ''
  return q.replace(/\s+/g, ' ').trim().slice(0, MAX_QUERY).trim()
}

/** รูปแบบ ilike "มีคำนี้อยู่ตรงไหนก็ได้" ของคำค้นที่ normalize แล้ว — ตัวอักษรพิเศษเป็นตัวอักษรธรรมดา */
export function ilikePattern(text: string): string {
  return `*${escapeLike(text)}*`
}

const chunks = <T>(list: T[], size: number): T[][] => {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * id ผู้เบิกที่ชื่อตรงกับคำค้น และ id งานที่ชื่อตรงกับคำค้น (q = คำค้นที่ normalize แล้ว ไม่ว่าง)
 * พนักงาน: ดูเฉพาะชื่อของตัวเอง (ใบของคนอื่นไม่มีทางออกมาอยู่แล้ว — ไม่ต้องรู้ว่าใครชื่อตรง)
 */
export async function textSearchIds(
  supabase: Db,
  q: string,
  viewer: { userId: string; role: string },
): Promise<{ submitterIds: string[]; eventIds: string[]; error?: string }> {
  // ตรวจผู้ใช้ของคำขอนี้เองด้วย (cache ต่อคำขอ — ไม่อ่านฐานข้อมูลซ้ำ) · บทบาทใช้ของที่ยืนยันแล้ว
  const who = await authorizeViewer(viewer as FinanceViewer)
  if (!who) return { submitterIds: [], eventIds: [], error: 'Unauthorized' }
  const pattern = ilikePattern(q)
  let people = supabase.from('profiles').select('id').ilike('full_name', pattern)
  if (!who.isAdmin) people = people.eq('id', who.userId)
  const [profiles, events] = await Promise.all([
    people.order('id', { ascending: true }).limit(1000),
    supabase.from('job_cost_events').select('id').ilike('event_name', pattern).order('id', { ascending: true }).limit(1000),
  ])
  const failed = profiles.error ?? events.error
  if (failed) return { submitterIds: [], eventIds: [], error: failed.message }
  const ids = (rows: unknown) => ((rows ?? []) as { id: string }[]).map(r => String(r.id))
  return { submitterIds: ids(profiles.data), eventIds: ids(events.data) }
}

type ClaimsQuery = ReturnType<typeof claimsQuery>

/**
 * ใบเบิกที่ตรงกับคำค้น (เลขที่ / หัวข้อ / ชื่อผู้เบิก / ชื่องาน) ภายใต้ตัวกรอง filters — รอบแรกค้นพร้อมกันสี่ทาง
 * รอบสองอ่านใบของผู้เบิก/งานที่ชื่อตรง (แบ่ง id ทีละ 100) · รวมด้วย id แล้วเรียงใหม่ → เก่า (ลำดับเดียวกับ claimsQuery)
 * limit = อ่านแต่ละทางไม่เกินเท่านี้ (ค้นหา) · ไม่ใส่ = อ่านทุกหน้า (คลังเก็บ — ต้องได้ยอดรวมครบ)
 */
export async function readTextMatches<T extends { id: string; created_at: string }>(
  supabase: Db,
  viewer: { userId: string; role: string },
  filters: ClaimsQueryFilters,
  select: () => string,
  q: string,
  limit?: number,
): Promise<{ rows: T[]; error?: string }> {
  // ตรวจผู้ใช้ของคำขอนี้เองด้วย (cache ต่อคำขอ) — คนที่ไม่ใช่แอดมินได้เฉพาะใบของตัวเองตามบทบาทที่ยืนยันแล้ว
  const who = await authorizeViewer(viewer as FinanceViewer)
  if (!who) return { rows: [], error: 'Unauthorized' }
  const pattern = ilikePattern(q)
  const read = async (refine: (query: ClaimsQuery) => ClaimsQuery) => {
    if (limit !== undefined) {
      const { data, error } = await readOptional(() => refine(claimsQuery(supabase, who, filters, select())).limit(limit))
      return { rows: (error ? [] : data ?? []) as unknown as T[], error }
    }
    return readAllRows<T>((from, to) => refine(claimsQuery(supabase, who, filters, select())).range(from, to))
  }

  const [byNumber, byTitle, ids] = await Promise.all([
    read(query => query.ilike('claim_number', pattern)),
    read(query => query.ilike('title', pattern)),
    textSearchIds(supabase, q, who),
  ])
  if (ids.error) return { rows: [], error: ids.error }
  const second = await Promise.all([
    ...chunks(ids.submitterIds, IN_CHUNK).map(part => read(query => query.in('submitted_by', part))),
    ...chunks(ids.eventIds, IN_CHUNK).map(part => read(query => query.in('job_event_id', part))),
  ])
  const parts = [byNumber, byTitle, ...second]
  const failed = parts.find(p => p.error)?.error
  if (failed) return { rows: [], error: failed.message }
  const byId = new Map(parts.flatMap(p => p.rows).map(row => [row.id, row]))
  return { rows: [...byId.values()].sort(newestFirst) }
}

type HitSource = Omit<SearchHit, 'submitter' | 'job_event'> & Partial<Pick<SearchHit, 'submitter' | 'job_event'>>

/** แถว → SearchHit (เฉพาะช่องของ SearchHit) */
function toSearchHit(row: HitSource): SearchHit {
  return {
    id: row.id,
    claim_number: row.claim_number,
    claim_type: row.claim_type,
    title: row.title,
    amount: row.amount,
    vat_mode: row.vat_mode,
    withholding_tax_rate: row.withholding_tax_rate,
    status: row.status,
    expense_date: row.expense_date,
    paid_at: row.paid_at ?? null,
    created_at: row.created_at,
    submitted_by: row.submitted_by,
    submitter: row.submitter ?? null,
    job_event: row.job_event ?? null,
  }
}

/**
 * ค้นใบเบิกทุกสถานะทุกเดือน — ใหม่ → เก่า ไม่เกิน SEARCH_LIMIT ใบ (เกิน = truncated)
 * คำค้นว่าง = ไม่แตะฐานข้อมูลเลย · ไม่ล็อกอิน = error โดยไม่อ่านใบเบิก · รอบฐานข้อมูล 2 รอบ (รอบสองเฉพาะเมื่อมีชื่อคน/งานที่ตรง)
 */
export async function searchClaims(q: string, viewer: FinanceViewer | null): Promise<SearchResult & { error?: string }> {
  const text = normalizeQuery(q)
  if (!text) return { hits: [], truncated: false }
  const who = await authorizeViewer(viewer)
  if (!who) return { hits: [], truncated: false, error: 'Unauthorized' }

  // อ่านแต่ละทางเกินหนึ่งใบ — รวมแล้วเกิน SEARCH_LIMIT = มีมากกว่าที่แสดงจริง (ไม่ใช่แค่ครบพอดี)
  const { rows, error } = await readTextMatches<HitSource>(createServiceClient(), who, {}, () => SEARCH_SELECT, text, SEARCH_LIMIT + 1)
  if (error) {
    console.error('searchClaims:', error)
    return { hits: [], truncated: false, error }
  }
  return { hits: rows.slice(0, SEARCH_LIMIT).map(toSearchHit), truncated: rows.length > SEARCH_LIMIT }
}
