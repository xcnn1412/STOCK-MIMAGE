// ============================================================================
// ข้อมูลของหน้ารายการใบเบิก (/finance) — แถวแบบเบา ListClaim (ไม่มีรายการ URL / รายละเอียด / หมายเหตุ / บัญชีธนาคาร)
// server อ่านรายการ URL มานับเป็น docs แล้วตัดทิ้งก่อนส่งหน้าจอ (ป้ายเอกสาร/สถานะแฟ้มคิดจาก docs — claim-docs.ts)
//
// ไม่ใช่ไฟล์ server action (ไม่เป็น endpoint) และถือ service-role client → เรียกจาก server component เท่านั้น ห้าม import จาก client
// ทุกฟังก์ชันตรวจผู้ใช้ก่อนอ่าน (authorizeViewer) · คนที่ไม่ใช่แอดมินเห็นเฉพาะใบของตัวเอง (claimsQuery บังคับ)
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import { PAID_STATUSES, TERMINAL_STATUSES } from '@/lib/finance/conditions'
import { claimsQuery, readAllRows, selectColumns, type ClaimsQueryFilters } from './claim-db'
import { docCounts, type ClaimDocFields } from './claim-docs'
import { getFinanceViewer, type FinanceViewer } from './viewer'
import type { ListClaim } from './view-data'

/** คอลัมน์ของ ListClaim (ไม่รวม docs) */
export const LIST_COLUMNS = [
  'id', 'claim_number', 'claim_type', 'title', 'amount', 'vat_mode', 'withholding_tax_rate', 'status', 'category',
  'submitted_by', 'submitted_at', 'approved_at', 'paid_at', 'created_at', 'expense_date', 'funding_source',
  'job_event_id', 'reject_reason', 'refund_amount', 'refund_confirmed_at', 'actual_spent_amount', 'advance_settled_at',
  'pettycash_fund_id', 'pettycash_closed_at', 'filed_at', 'filed_file_count', 'deleted_at',
] as const

/** ช่องไฟล์แนบที่ server อ่านมานับเป็น docs แล้วตัดทิ้ง (ไม่ส่งหน้าจอ) */
export const DOC_COLUMNS = ['receipt_urls', 'actual_receipt_urls', 'tax_invoice_urls', 'tax_invoice_numbers', 'refund_slip_urls'] as const

export const SUBMITTER_EMBED = 'submitter:profiles!expense_claims_submitted_by_fkey(id, full_name)'
export const JOB_EVENT_EMBED = 'job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name, linked_lead_id)'

/** select ของแถว ListClaim — ตัดคอลัมน์ที่ฐานข้อมูลนี้ยังไม่มี (ใบที่ซ่อน / เข้าแฟ้ม) ตอนสร้างคำขอ */
export function listSelect(extra: readonly string[] = []): string {
  return selectColumns([...LIST_COLUMNS, ...DOC_COLUMNS, ...extra, SUBMITTER_EMBED, JOB_EVENT_EMBED])
}

type ListSource = Omit<ListClaim, 'docs' | 'filed_at' | 'filed_file_count' | 'deleted_at'> & ClaimDocFields & {
  filed_at?: string | null
  filed_file_count?: number | null
  deleted_at?: string | null
}

/** แถวจากฐานข้อมูล (มีรายการ URL) → ListClaim (มี docs แทน) — เลือกเฉพาะช่องของ ListClaim ไม่มีช่องอื่นหลุดไปหน้าจอ */
export function toListClaim(row: ListSource): ListClaim {
  return {
    id: row.id,
    claim_number: row.claim_number,
    claim_type: row.claim_type,
    title: row.title,
    amount: row.amount,
    vat_mode: row.vat_mode,
    withholding_tax_rate: row.withholding_tax_rate,
    status: row.status,
    category: row.category,
    submitted_by: row.submitted_by,
    submitted_at: row.submitted_at ?? null,
    approved_at: row.approved_at ?? null,
    paid_at: row.paid_at ?? null,
    created_at: row.created_at,
    expense_date: row.expense_date,
    funding_source: row.funding_source,
    job_event_id: row.job_event_id ?? null,
    reject_reason: row.reject_reason ?? null,
    refund_amount: row.refund_amount ?? null,
    refund_confirmed_at: row.refund_confirmed_at ?? null,
    actual_spent_amount: row.actual_spent_amount ?? null,
    advance_settled_at: row.advance_settled_at ?? null,
    pettycash_fund_id: row.pettycash_fund_id ?? null,
    pettycash_closed_at: row.pettycash_closed_at ?? null,
    submitter: row.submitter ?? null,
    job_event: row.job_event ?? null,
    // ฐานข้อมูลที่ยังไม่รัน SQL ของคอลัมน์นั้น = ไม่ได้ขอมา → null (ยังไม่เข้าแฟ้ม / ไม่ได้ซ่อน)
    filed_at: row.filed_at ?? null,
    filed_file_count: row.filed_file_count ?? null,
    deleted_at: row.deleted_at ?? null,
    docs: docCounts(row),
  }
}

/**
 * ผู้ใช้ที่ยืนยันแล้วของคำขอนี้ (getFinanceViewer — cache ต่อคำขอ ไม่อ่านฐานข้อมูลซ้ำ) ต้องเป็นคนเดียวกับ viewer ที่ส่งมา
 * บทบาทใช้ของที่ยืนยันแล้วเสมอ (ไม่เชื่อ viewer ที่ผู้เรียกส่งมา) · ไม่ล็อกอิน / ไม่ตรง = null (ผู้เรียกไม่อ่านอะไรเลย)
 */
export async function authorizeViewer(viewer: FinanceViewer | null | undefined): Promise<FinanceViewer | null> {
  if (!viewer?.userId) return null
  const verified = await getFinanceViewer()
  return verified && verified.userId === viewer.userId ? verified : null
}

/** เรียง created_at ใหม่ → เก่า ต่อด้วย id (ลำดับเดียวกับ claimsQuery) — ใช้ตอนรวมผลหลายคำขอ */
export function newestFirst(a: { id: string; created_at: string }, b: { id: string; created_at: string }): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? 1 : -1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

type ListResult = { data: ListClaim[]; error?: string }

/** อ่านทุกหน้าของคำขอแถว ListClaim ตามตัวกรอง (+ ตัวกรองเฉพาะ refine) */
type ClaimsQuery = ReturnType<typeof claimsQuery>

function readList(viewer: FinanceViewer, filters: ClaimsQueryFilters, refine: (q: ClaimsQuery) => ClaimsQuery = q => q) {
  const supabase = createServiceClient()
  return readAllRows<ListSource>((from, to) => refine(claimsQuery(supabase, viewer, filters, listSelect())).range(from, to))
}

/**
 * ใบที่ยังไม่จบของผู้ใช้ (หน้ารายการของพนักงาน — เงื่อนไขเดียวกับ getClaims({ open: true })):
 * สถานะยังไม่จบ + ทดลองจ่ายที่จ่ายแล้วแต่ยังไม่เคลียร์ + วงเงินสดย่อยที่ยังไม่ปิดเดือน
 * อ่านสามชุดพร้อมกัน (รอบเดียว) แทน .or() แล้วรวมด้วย id กันซ้ำ
 */
export async function getStaffOpenClaims(viewer: FinanceViewer | null): Promise<ListResult> {
  const who = await authorizeViewer(viewer)
  if (!who) return { data: [], error: 'Unauthorized' }

  const parts = await Promise.all([
    readList(who, {}, q => q.not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)),
    readList(who, { claim_type: 'advance', status: 'paid' }, q => q.is('actual_spent_amount', null)),
    readList(who, { claim_type: 'petty_cash', status: 'paid' }, q => q.is('pettycash_fund_id', null).is('pettycash_closed_at', null)),
  ])
  const failed = parts.find(p => p.error)?.error
  if (failed) {
    console.error('getStaffOpenClaims:', failed.message)
    return { data: [], error: failed.message }
  }
  const byId = new Map(parts.flatMap(p => p.rows).map(row => [row.id, row]))
  return { data: [...byId.values()].sort(newestFirst).map(toListClaim) }
}

/** ใบที่จ่ายแล้ว (paid / refund_confirmed) ของเดือนที่จ่าย 'YYYY-MM' ตามเวลาไทย — ส่วนชำระเงินแล้วของหน้าแรกแอดมิน */
export async function getPaidClaimsLean(viewer: FinanceViewer | null, month: string): Promise<ListResult> {
  if (typeof month !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { data: [], error: 'รูปแบบเดือนไม่ถูกต้อง' }
  const who = await authorizeViewer(viewer)
  if (!who) return { data: [], error: 'Unauthorized' }

  const { rows, error } = await readList(who, { status: PAID_STATUSES, paidMonth: month })
  if (error) {
    console.error('getPaidClaimsLean:', error.message)
    return { data: [], error: error.message }
  }
  return { data: rows.map(toListClaim) }
}
