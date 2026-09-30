// ============================================================================
// ข้อมูลของคิวใบเบิก (หน้าแรกของแอดมิน) — อ่านเฉพาะคอลัมน์ที่คิวใช้ ไม่มี '*'
// (ไม่ส่งรายละเอียด/หมายเหตุ/ข้อมูลผู้อนุมัติที่หน้าคิวไม่แสดง)
//
// ไม่ใช่ไฟล์ server action (ไม่เป็น endpoint) และถือ service-role client → เรียกจาก server component เท่านั้น
// ห้าม import จาก client component · หน้าจอโหลดใหม่ด้วย router.refresh()
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import type { ExpenseClaim } from '../costs/types'
import { getSession, isMissingColumn } from './claim-db'

/** คอลัมน์ของแถวในคิว — ห้ามเพิ่ม '*' / description / notes / ข้อมูลผู้อนุมัติหรือผู้จ่าย */
export const QUEUE_SELECT = [
  'id', 'claim_number', 'claim_type', 'title', 'amount', 'vat_mode', 'withholding_tax_rate', 'status', 'category',
  'submitted_by', 'submitted_at', 'approved_at', 'paid_at', 'created_at', 'expense_date', 'status_changed_at',
  'funding_source', 'job_event_id', 'receipt_urls', 'actual_receipt_urls', 'tax_invoice_urls', 'tax_invoice_numbers',
  'refund_slip_urls', 'refund_amount', 'refund_confirmed_at', 'actual_spent_amount', 'advance_settled_at',
  'pettycash_fund_id', 'reject_reason', 'deleted_at', 'bank_name', 'bank_account_number', 'account_holder_name',
  'submitter:profiles!expense_claims_submitted_by_fkey(id, full_name)',
  'job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name)',
].join(', ')

export type QueueClaim = Pick<ExpenseClaim,
  | 'id' | 'claim_number' | 'claim_type' | 'title' | 'amount' | 'vat_mode' | 'withholding_tax_rate' | 'status' | 'category'
  | 'submitted_by' | 'submitted_at' | 'approved_at' | 'paid_at' | 'created_at' | 'expense_date' | 'funding_source'
  | 'job_event_id' | 'receipt_urls' | 'actual_receipt_urls' | 'tax_invoice_urls' | 'tax_invoice_numbers'
  | 'refund_slip_urls' | 'refund_amount' | 'refund_confirmed_at' | 'actual_spent_amount' | 'advance_settled_at'
  | 'pettycash_fund_id' | 'reject_reason' | 'bank_name' | 'bank_account_number' | 'account_holder_name'
  | 'submitter' | 'job_event'
> & { status_changed_at: string | null; deleted_at: string | null }

/** สถานะที่ยังมีงานรอแอดมิน (แบบร่างอยู่ในคิวเพื่อหาใบที่ค้างนาน) */
const OPEN_STATUSES = ['draft', 'pending', 'approved', 'waiting_tax_invoice', 'pending_month_end', 'awaiting_payment']

export const QUEUE_MIGRATION_MISSING = 'ต้องรันไฟล์ SQL 20260930_claim_hide_status_time.sql บนฐานข้อมูลก่อนจึงจะใช้คิวใบเบิกได้'

type Page = { data: unknown[] | null; error: { code?: string; message: string } | null }

/**
 * ใบในคิว = สถานะยังไม่จบ + ทดลองจ่ายที่จ่ายแล้วแต่ยังไม่เคลียร์ + ทดลองจ่ายที่รอยืนยันเงินคืน (ไม่รวมใบที่ซ่อน)
 * แอดมินเท่านั้น — คนอื่นได้ error โดยไม่อ่านใบเบิกเลย · ฐานข้อมูลยังไม่รัน SQL ของขั้น 4 → ข้อความบอกให้รัน
 */
export async function getQueueClaims(): Promise<{ data: QueueClaim[]; hiddenCount: number; error?: string }> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { data: [], hiddenCount: 0, error: 'Unauthorized' }

  const supabase = createServiceClient()
  const base = () => supabase
    .from('expense_claims')
    .select(QUEUE_SELECT)
    .is('deleted_at', null)
    // created_at ซ้ำกันได้ — ต่อด้วย id ให้ลำดับคงที่ข้ามหน้า
    .order('created_at', { ascending: false })
    .order('id', { ascending: true })

  // PostgREST ตัดผลที่ 1,000 แถวต่อคำขอ — อ่านทีละหน้าจนได้หน้าที่ไม่เต็ม · พังหน้าไหนคืน error ทั้งชุด
  const readAll = async (build: () => ReturnType<typeof base>) => {
    const rows: QueueClaim[] = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = (await build().range(from, from + 999)) as Page
      if (error) return { rows: [], error }
      rows.push(...((data ?? []) as QueueClaim[]))
      if (!data || data.length < 1000) return { rows, error: null }
    }
  }

  // อ่านแยกสามชุดแทน .or() แล้วรวมด้วย id กันซ้ำ (เทคนิคเดียวกับ getClaims({ open: true }))
  const [open, unsettled, refundPending, hidden] = await Promise.all([
    readAll(() => base().in('status', OPEN_STATUSES)),
    readAll(() => base().eq('claim_type', 'advance').eq('status', 'paid').is('actual_spent_amount', null)),
    readAll(() => base().eq('claim_type', 'advance').eq('status', 'paid').is('refund_confirmed_at', null).gt('refund_amount', 0)),
    supabase.from('expense_claims').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null),
  ])

  const failed = [open, unsettled, refundPending].find(p => p.error)?.error ?? hidden.error
  if (failed) {
    if (isMissingColumn(failed)) return { data: [], hiddenCount: 0, error: QUEUE_MIGRATION_MISSING }
    console.error('getQueueClaims:', failed.message)
    return { data: [], hiddenCount: 0, error: `โหลดคิวใบเบิกไม่สำเร็จ: ${failed.message}` }
  }

  const byId = new Map([...open.rows, ...unsettled.rows, ...refundPending.rows].map(row => [row.id, row]))
  const data = [...byId.values()].sort((a, b) =>
    a.created_at === b.created_at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.created_at < b.created_at ? 1 : -1
  )
  return { data, hiddenCount: hidden.count ?? 0 }
}
