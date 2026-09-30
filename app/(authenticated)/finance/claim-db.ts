// ============================================================================
// ตัวช่วยฝั่ง server ของใบเบิก — ใช้ร่วมกันโดย actions.ts, lifecycle-actions.ts และไฟล์ข้อมูลของหน้า (queue-data.ts, *-data.ts) เท่านั้น
//
// ไม่ใช่ไฟล์ server action (ไม่มีคำประกาศที่บรรทัดแรก — ฟังก์ชันที่ export จึงไม่กลายเป็น endpoint ที่ใครก็เรียกได้) และถือ service-role client
// (ข้าม RLS) → ห้าม import จาก client component เด็ดขาด · ผู้เรียกตรวจตัวตนและสิทธิ์เองก่อนเรียกทุกครั้ง
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { claimIdFromCostNote, costItemNote, shouldHaveCostItem } from './claim-rules'
import { getFinanceViewer } from './viewer'

export type Db = ReturnType<typeof createServiceClient>

// ตัวตนที่ยืนยันแล้ว (บทบาทอ่านจากฐานข้อมูล ไม่เชื่อ cookie session_role) มาจาก getFinanceViewer ที่เดียว
// — ตรวจกับฐานข้อมูลครั้งเดียวต่อคำขอ · คงรูปคืนค่าเดิม { userId?, role? } ให้ผู้เรียกทุกจุดไม่ต้องแก้
export async function getSession(): Promise<{ userId?: string; role?: string }> {
  const viewer = await getFinanceViewer()
  return viewer ? { userId: viewer.userId, role: viewer.role } : {}
}

// ============================================================================
// เปลี่ยนสถานะแบบมีเงื่อนไข + รายการต้นทุนตามสถานะ
// ============================================================================

export const STALE_STATUS_ERROR = 'ใบเบิกนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่'
/** การเคลียร์ใบทดลองจ่ายบันทึกซ้ำได้โดยสถานะไม่เปลี่ยน — คนที่ช้ากว่าอาจชนการบันทึก ไม่ใช่แค่การเปลี่ยนสถานะ */
export const STALE_SETTLE_ERROR = 'ใบเบิกนี้ถูกบันทึกหรือเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่'
export const COST_SYNC_ERROR = 'เปลี่ยนสถานะแล้ว แต่ปรับรายการต้นทุนไม่สำเร็จ — แจ้งผู้ดูแลระบบ'

/** คอลัมน์ที่ syncClaimCostItem ใช้ — ขอคืนจาก update แบบมีเงื่อนไข (ได้ค่าหลังเปลี่ยนในคำสั่งเดียว) · deleted_at: ใบที่ซ่อนไม่มีรายการต้นทุน */
export const CLAIM_SYNC_SELECT = 'id, claim_number, status, job_event_id, category, title, amount, unit_price, quantity, deleted_at'

export type CostSyncClaim = {
  id: string
  claim_number: string
  status: string
  job_event_id: string | null
  category: string
  title: string
  amount: number
  unit_price: number
  quantity: number
  deleted_at: string | null
}

/** 42703 = Postgres ไม่รู้จักคอลัมน์ · PGRST204 = PostgREST หาคอลัมน์ใน schema cache ไม่เจอ (ฐานข้อมูลยังไม่รัน migration) */
export function isMissingColumn(error?: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

// ============================================================================
// ใบที่ซ่อน (deleted_at) + ตัวสร้างคำขออ่านรายการใบเบิก
// ============================================================================

/** error นี้เกิดเพราะยังไม่มีคอลัมน์ deleted_at (ยังไม่รัน 20260930_claim_hide_status_time.sql) */
export const isMissingHiddenColumn = (error: { code?: string; message?: string } | null | undefined) =>
  isMissingColumn(error) && /deleted_at/.test(error?.message ?? '')

/**
 * ยังไม่มีคอลัมน์ deleted_at — จำไว้ทั้ง process แล้วอ่านโดยไม่กรองใบที่ซ่อน (ก่อนรัน SQL ยังซ่อนใบไหนไม่ได้)
 * รายการใบเบิกจึงยังใช้ได้ระหว่างรอรัน SQL · หลังรัน SQL ต้อง restart ระบบหนึ่งครั้งรายการจึงเริ่มกรองใบที่ซ่อน
 */
let hiddenMissing = false

/** true = ฐานข้อมูลนี้ยังไม่มีคอลัมน์ deleted_at (พบแล้วอย่างน้อยหนึ่งครั้งใน process นี้) — อย่ากรอง deleted_at */
export function hiddenColumnMissing(): boolean {
  return hiddenMissing
}

/** จดว่ายังไม่มีคอลัมน์ deleted_at (เรียกเมื่อได้ error ที่ isMissingHiddenColumn บอกว่าใช่) — เตือนใน log ครั้งแรกครั้งเดียว */
export function noteHiddenColumnMissing(): void {
  if (hiddenMissing) return
  hiddenMissing = true
  console.warn('ยังไม่ได้รัน 20260930_claim_hide_status_time.sql — รายการใบเบิกแสดงโดยไม่กรองใบที่ซ่อน (หลังรัน SQL ต้อง restart ระบบหนึ่งครั้ง)')
}

/** filed_at / filed_file_count ยังไม่มี (ยังไม่รัน 20260929_claim_filed.sql) — จำไว้ทั้ง process แบบเดียวกับ deleted_at */
let filedMissing = false

/** true = ฐานข้อมูลนี้ยังไม่มีคอลัมน์เข้าแฟ้ม — หน้ารายการอ่านโดยไม่ขอคอลัมน์นั้น (ทุกใบถือว่ายังไม่เข้าแฟ้ม) */
export function filedColumnsMissing(): boolean {
  return filedMissing
}

/**
 * หน้ารายการขอคอลัมน์ตามชื่อ (ไม่ใช่ '*') — คอลัมน์ที่มาจาก SQL ที่อาจยังไม่รันบน production ต้องมีทางสำรอง:
 * error ของการอ่านเป็น "ไม่มีคอลัมน์ deleted_at / filed_at / filed_file_count" → จำไว้แล้วคืน true (ผู้เรียกสร้างคำขอใหม่แล้วอ่านอีกครั้ง)
 * คำขอที่วิ่งพร้อมกันหลายตัวได้ error เดียวกันได้ — คืน true ทุกตัว (ธงถูกตั้งครั้งเดียว เตือนครั้งเดียว)
 */
export function noteMissingOptionalColumn(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!isMissingColumn(error)) return false
  const message = error?.message ?? ''
  if (/deleted_at/.test(message)) {
    noteHiddenColumnMissing()
    return true
  }
  if (/filed_(at|file_count)/.test(message)) {
    if (!filedMissing) {
      filedMissing = true
      console.warn('ยังไม่ได้รัน 20260929_claim_filed.sql — รายการใบเบิกแสดงโดยไม่มีเครื่องหมายเข้าแฟ้ม (หลังรัน SQL ต้อง restart ระบบหนึ่งครั้ง)')
    }
    return true
  }
  return false
}

/** รายชื่อคอลัมน์ → สตริง select โดยตัดคอลัมน์ที่ฐานข้อมูลนี้ยังไม่มี (deleted_at / filed_at / filed_file_count) — แถวที่ได้ไม่มีคีย์นั้น */
export function selectColumns(columns: readonly string[]): string {
  return columns
    .filter(c => !(c === 'deleted_at' && hiddenMissing) && !((c === 'filed_at' || c === 'filed_file_count') && filedMissing))
    .join(', ')
}

type ReadResult = { data: unknown; error: { code?: string; message: string } | null; count?: number | null }

/**
 * อ่านด้วยคำขอที่ build() สร้าง — ได้ error ว่ายังไม่มีคอลัมน์ที่ไม่บังคับ (noteMissingOptionalColumn) → สร้างคำขอใหม่แล้วอ่านอีก
 * (สูงสุด 2 ครั้ง: ใบที่ซ่อน + เข้าแฟ้ม) · build ต้องอ่านธงตอนสร้าง (claimsQuery / selectColumns ทำให้แล้ว)
 */
export async function readOptional<R extends ReadResult>(build: () => PromiseLike<R>): Promise<R> {
  let result = await build()
  for (let retry = 0; retry < 2 && noteMissingOptionalColumn(result.error); retry++) result = await build()
  return result
}

/** เพดานแถวต่อคำขอของ PostgREST (db-max-rows ของ Supabase) */
export const PAGE_ROWS = 1000

/**
 * อ่านทุกแถวทีละหน้า (PostgREST ตัดผลที่ 1,000 แถวต่อคำขอโดยไม่แจ้ง) จนได้หน้าที่ไม่เต็ม · พังหน้าไหนคืน error ทั้งชุด ไม่คืนครึ่งๆ
 * build(from, to) สร้างคำขอใหม่ทุกหน้า (ต้องเรียงแบบคงที่ เช่น created_at + id) · ยังไม่มีคอลัมน์ที่ไม่บังคับ → อ่านใหม่ตั้งแต่หน้าแรก
 */
export async function readAllRows<T>(
  build: (from: number, to: number) => PromiseLike<ReadResult>,
): Promise<{ rows: T[]; error: { code?: string; message: string } | null }> {
  for (let attempt = 0; ; attempt++) {
    const rows: T[] = []
    let failed: { code?: string; message: string } | null = null
    for (let from = 0; ; from += PAGE_ROWS) {
      const { data, error } = await build(from, from + PAGE_ROWS - 1)
      if (error) {
        failed = error
        break
      }
      const page = (data ?? []) as T[]
      rows.push(...page)
      if (page.length < PAGE_ROWS) return { rows, error: null }
    }
    if (attempt >= 2 || !noteMissingOptionalColumn(failed)) return { rows: [], error: failed }
  }
}

const THAI_OFFSET_MS = 7 * 60 * 60 * 1000

/** เวลา 00:00 ของวันตามเวลาไทย เป็นเวลา UTC (ISO) — วันที่ 1 เที่ยงคืนไทย = 17:00 ของวันก่อนหน้า (UTC+7 ไม่มีเวลาออมแสง) */
function thaiMidnightIso(y: number, m: number, d: number): string {
  return new Date(Date.UTC(y, m - 1, d) - THAI_OFFSET_MS).toISOString()
}

/** ตัวกรองของ claimsQuery — ทุกช่องไม่บังคับ · ค่าที่มาจาก URL ผู้เรียกตรวจรูปแบบก่อนส่งเข้ามา */
export interface ClaimsQueryFilters {
  /** สถานะเดียว หรือหลายสถานะ (in) */
  status?: string | readonly string[]
  claim_type?: string
  /** id ผู้เบิก — พนักงานถูกบังคับเป็นของตัวเองอยู่แล้ว (ขอของคนอื่น = ไม่ได้อะไร) */
  submitted_by?: string
  category?: string
  job_event_id?: string
  /** เดือนที่จ่าย 'YYYY-MM' ตามเวลาไทย (paid_at) */
  paidMonth?: string
  /** วันที่จ่ายตามเวลาไทย 'YYYY-MM-DD' รวมทั้งสองวัน (paid_at) */
  paidFrom?: string
  paidTo?: string
  /** วันที่ใช้จ่าย 'YYYY-MM-DD' รวมทั้งสองวัน (expense_date) */
  expenseFrom?: string
  expenseTo?: string
  /** ยอดเงิน (amount) รวมทั้งสองค่า */
  amountMin?: number
  amountMax?: number
}

/**
 * คำขออ่าน expense_claims ที่มีกติกาการมองเห็นของรายการใบเบิกครบ — ตัวกรองชุดเดียวของ getClaims / รายการ / คลังเก็บ / ค้นหา / รายงาน
 * - คนที่ไม่ใช่แอดมินเห็นเฉพาะใบของตัวเอง · ใบที่ซ่อนไม่อยู่ในรายการของใครเลย (ฐานข้อมูลที่ยังไม่มี deleted_at ข้ามการกรองนี้)
 * - เรียง created_at ใหม่ → เก่า ต่อด้วย id (created_at ซ้ำกันได้ — ลำดับต้องคงที่ข้ามหน้า)
 * select = รายชื่อคอลัมน์ (ค่าเริ่มต้น '*') · options = { count: 'exact', head: true } สำหรับนับอย่างเดียว
 * ชนิดแถวที่ได้เป็น GenericStringError (select เป็น string ไม่ใช่สตริงคงที่ — ทำเป็น generic แล้ว tsc ใช้หน่วยความจำเกิน) → ผู้เรียก cast เป็นชนิดแถวของตัวเอง
 * ผู้เรียกต่อ .range() / .limit() / ตัวกรองเฉพาะหน้า (ilike, in, gt …) เองได้ · ผู้เรียกตรวจตัวตนก่อนเรียกเสมอ
 * อ่านได้ error ที่ isMissingHiddenColumn บอกว่าใช่ → noteHiddenColumnMissing() แล้วสร้างคำขอใหม่ (ไม่กรอง deleted_at อีก)
 */
export function claimsQuery(
  supabase: Db,
  viewer: { userId: string; role: string },
  filters: ClaimsQueryFilters = {},
  select: string = '*',
  options?: { count?: 'exact'; head?: boolean },
) {
  let query = supabase
    .from('expense_claims')
    .select(select, options)
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })

  if (viewer.role !== 'admin') query = query.eq('submitted_by', viewer.userId)
  if (!hiddenColumnMissing()) query = query.is('deleted_at', null)

  const { status } = filters
  if (typeof status === 'string') query = query.eq('status', status)
  else if (status) query = query.in('status', status)
  if (filters.claim_type) query = query.eq('claim_type', filters.claim_type)
  if (filters.submitted_by) query = query.eq('submitted_by', filters.submitted_by)
  if (filters.category) query = query.eq('category', filters.category)
  if (filters.job_event_id) query = query.eq('job_event_id', filters.job_event_id)

  if (filters.paidMonth) {
    const [y, m] = filters.paidMonth.split('-').map(Number)
    query = query.gte('paid_at', thaiMidnightIso(y, m, 1)).lt('paid_at', thaiMidnightIso(y, m + 1, 1))
  }
  if (filters.paidFrom) {
    const [y, m, d] = filters.paidFrom.split('-').map(Number)
    query = query.gte('paid_at', thaiMidnightIso(y, m, d))
  }
  if (filters.paidTo) {
    const [y, m, d] = filters.paidTo.split('-').map(Number)
    query = query.lt('paid_at', thaiMidnightIso(y, m, d + 1))
  }
  if (filters.expenseFrom) query = query.gte('expense_date', filters.expenseFrom)
  if (filters.expenseTo) query = query.lte('expense_date', filters.expenseTo)
  if (filters.amountMin !== undefined) query = query.gte('amount', filters.amountMin)
  if (filters.amountMax !== undefined) query = query.lte('amount', filters.amountMax)
  return query
}

/**
 * ตัวอักษรพิเศษของ LIKE/ILIKE ในคำค้นของผู้ใช้ให้เป็นตัวอักษรธรรมดา: \ % _ ขึ้นต้นด้วย \ (ตัว escape ของ Postgres)
 * และ * ซึ่ง PostgREST แปลงเป็น % เสมอ (escape ไม่ได้) → แทนด้วย _ (ตรงกับอักษรใดก็ได้หนึ่งตัว รวม * เอง — ไม่กลายเป็นตัวครอบทุกอย่าง)
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, ch => `\\${ch}`).replace(/\*/g, '_')
}

/**
 * CLAIM_SYNC_SELECT ของฐานข้อมูลที่ยังไม่รัน 20260930_claim_hide_status_time.sql (ยังไม่มี deleted_at)
 * ชนิดประกาศเป็นชนิดของ CLAIM_SYNC_SELECT ให้ supabase-js อ่านรายชื่อคอลัมน์ได้ — ต่างกันแค่ deleted_at ที่ได้ undefined (= ไม่ได้ซ่อน)
 */
const LEGACY_SYNC_SELECT = CLAIM_SYNC_SELECT.replace(', deleted_at', '') as typeof CLAIM_SYNC_SELECT

/**
 * รันคำสั่งที่ขอคอลัมน์ CLAIM_SYNC_SELECT — ฐานข้อมูลยังไม่มีคอลัมน์ deleted_at (ยังไม่รัน SQL ของขั้น 4) ลองใหม่โดยไม่ขอคอลัมน์นั้น
 * ปลอดภัยกับ update: คอลัมน์ที่ไม่มีทำให้ทั้งคำสั่งไม่ทำงาน (ยังไม่มีอะไรถูกเขียนก่อนลองใหม่)
 */
export async function withSyncSelect<R extends { error: { code?: string; message?: string } | null }>(
  run: (select: typeof CLAIM_SYNC_SELECT) => PromiseLike<R>,
): Promise<R> {
  const first = await run(CLAIM_SYNC_SELECT)
  if (!isMissingColumn(first.error) || !/deleted_at/.test(first.error?.message ?? '')) return first
  return run(LEGACY_SYNC_SELECT)
}

/**
 * update ใบเบิกเฉพาะเมื่อสถานะยังเป็นค่าที่อ่านมา — กดซ้ำ / สองคนกดพร้อมกัน คนหลังไม่ได้แถวกลับ
 * row = null (ไม่มี error) → สถานะถูกเปลี่ยนไปก่อนแล้ว: ผู้เรียกคืน STALE_STATUS_ERROR และไม่ทำงานข้างเคียงใดๆ
 */
export async function updateClaimFromStatus(supabase: Db, id: string, fromStatus: string, values: Record<string, unknown>) {
  const { data, error } = await withSyncSelect(select => {
    const q = supabase
      .from('expense_claims')
      .update(values)
      .eq('id', id)
      .eq('status', fromStatus)
    // ใบที่ซ่อนไว้เปลี่ยนสถานะไม่ได้จนกว่าจะกู้คืน (ได้ 0 แถว = STALE) · ฐานข้อมูลที่ยังไม่มีคอลัมน์ deleted_at ไม่มีใบที่ซ่อน
    return (select === CLAIM_SYNC_SELECT ? q.is('deleted_at', null) : q).select(select)
  })
  return { row: ((data ?? [])[0] ?? null) as CostSyncClaim | null, error }
}

/** รายการต้นทุนของใบเบิก เก่า → ใหม่ — จับคู่ด้วย id ท้าย notes เท่านั้น (เลขที่ใบเบิกซ้ำได้/ถูกเปลี่ยนได้) */
export async function findClaimCostItems(supabase: Db, claimId: string): Promise<{ ids: string[]; error?: string }> {
  const { data, error } = await supabase
    .from('job_cost_items')
    .select('id, notes, created_at')
    .like('notes', `%::${claimId}`)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
  if (error) return { ids: [], error: error.message }
  return { ids: (data ?? []).filter(r => claimIdFromCostNote(r.notes) === claimId).map(r => r.id as string) }
}

/** ทำให้รายการต้นทุนของใบเบิกตรงกับสถานะ: ต้องมี = มีหนึ่งรายการ, ไม่ต้องมี = ไม่มี */
export async function syncClaimCostItem(supabase: Db, claim: CostSyncClaim, actorId: string): Promise<{ error?: string }> {
  const found = await findClaimCostItems(supabase, claim.id)
  if (found.error) return { error: found.error }
  const must = shouldHaveCostItem(claim)
  // เก็บรายการเก่าสุดไว้หนึ่งรายการ (ถ้าต้องมี) ที่เหลือลบ — รายการซ้ำจากการกดอนุมัติซ้ำในอดีตหายไปด้วย
  const extra = found.ids.slice(must ? 1 : 0)
  if (extra.length > 0) {
    const { error } = await supabase.from('job_cost_items').delete().in('id', extra)
    if (error) return { error: error.message }
  }
  if (must && found.ids.length === 0) {
    // ค่าเดียวกับที่ approveClaim เคยสร้าง
    const { error } = await supabase.from('job_cost_items').insert({
      job_event_id: claim.job_event_id,
      category: claim.category,
      description: `[เบิกเงิน] ${claim.title}`,
      amount: claim.amount || (claim.unit_price * claim.quantity),
      unit_price: claim.unit_price || claim.amount,
      quantity: claim.quantity,
      unit: 'รายการ',
      recorded_by: actorId,
      notes: costItemNote(claim),
    })
    if (error) return { error: error.message }
  }
  return {}
}

// ============================================================================
// ข้อความกติกาที่ใช้หลายจุด + แจ้งเตือนแอดมินเมื่อมีใบยื่นเข้ามา
// ============================================================================

/** ยื่นใบที่ต้องมีใบเสร็จ (receiptRequiredForSubmit) โดยยังไม่แนบ — ใช้ทั้งตอนสร้างแล้วยื่นทันทีและตอนกดยื่นทีหลัง */
export const RECEIPT_REQUIRED_ERROR = 'กรุณาแนบเอกสารอย่างน้อย 1 ไฟล์ก่อนยื่นใบเบิก'
/** แอดมินเปลี่ยนสถานะในกรณีที่ reasonRequiredForTransition บอกว่าต้องมีเหตุผล แต่ไม่ได้พิมพ์ */
export const REASON_REQUIRED_ERROR = 'กรุณาระบุเหตุผล — การถอยสถานะ ยกเลิก/ปฏิเสธใบที่จ่ายแล้ว หรือแก้ใบที่จ่ายแล้ว ต้องมีเหตุผล'

/** รหัสใบเบิก (uuid) — ตรวจอินพุตของ server action ก่อนแตะฐานข้อมูล */
export const CLAIM_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** id ของแอดมินทุกคน (อ่านไม่ได้ = ไม่มีผู้รับ) */
export async function adminIds(supabase: Db): Promise<string[]> {
  const { data, error } = await supabase.from('profiles').select('id').eq('role', 'admin')
  if (error) {
    console.error('adminIds:', error.message)
    return []
  }
  return (data || []).map((p: { id: string }) => p.id)
}

/**
 * ตัวสร้างแจ้งเตือนที่ผู้เรียกส่งเข้ามา (createNotifications ของ lib/notifications)
 * ไฟล์นี้ไม่ import lib/notifications เอง — scripts/ticket-attachments.check.ts ให้เฉพาะไฟล์ server action import ได้
 */
type NotifySubmission = (params: {
  userIds: string[]
  type: 'expense_submitted'
  title: string
  body?: string
  referenceType: 'expense_claim'
  referenceId: string
  actorId: string
}) => Promise<void>

/** แจ้งแอดมินทุกคนว่ามีใบเบิกยื่นขออนุมัติ — createNotifications ตัดผู้ยื่นออกเอง (แอดมินยื่นใบของตัวเองไม่แจ้งตัวเอง) */
export async function notifyAdminsOfSubmission(
  supabase: Db,
  claim: { id: string; claim_number: string; title: string; amount: number },
  actorId: string,
  createNotifications: NotifySubmission,
) {
  const userIds = await adminIds(supabase)
  if (userIds.length === 0) return
  await createNotifications({
    userIds,
    type: 'expense_submitted',
    title: `ใบเบิก ${claim.claim_number} ยื่นขออนุมัติ — ฿${Number(claim.amount).toLocaleString()}`,
    body: claim.title,
    referenceType: 'expense_claim',
    referenceId: claim.id,
    actorId,
  })
}
