// ============================================================================
// ข้อมูลของหน้าใบเบิกหนึ่งใบ (/finance/[id]) — อ่านทุกอย่างพร้อมกันรอบเดียว แล้วใช้กติกาการมองเห็นเดียวกับ getClaim
// (ใบที่ซ่อน: แอดมินเท่านั้น · ใบของคนอื่น: แอดมิน หรือเอกสารเงินสดย่อยซึ่งเป็นกล่องกลางของสำนักงาน)
// ใบที่มองไม่เห็น = null ทั้งชุด (ประวัติ / รายการในวงเงิน / รายการจัดซื้อ ที่อ่านมาพร้อมกันถูกทิ้ง ไม่ออกจาก server)
// รายชื่องานของช่องแก้ไข (job_cost_events / events / event_closures) ไม่อ่านตอนเปิดหน้า — หน้าจอขอ getJobEventsForSelect() ตอนกดแก้ไข
//
// ไม่ใช่ไฟล์ server action (ไม่เป็น endpoint) และถือ service-role client → เรียกจาก server component เท่านั้น ห้าม import จาก client
// ============================================================================

import { createServiceClient } from '@/lib/supabase-server'
import type { ExpenseClaim } from '../costs/types'
import { getClaimPurchaseItems } from '../jobs/purchasing/data'
import type { ClaimPurchaseItemRow } from '../jobs/purchasing/purchasing-logic'
import { getLinkablePettyClaims, getPettyCashChildren, type PettyChildren } from './actions'
import { CLAIM_ID_RE } from './claim-db'
import { authorizeViewer } from './list-data'
import { getFinanceCategories, type FinanceCategory } from './settings-actions'
import type { FinanceViewer } from './viewer'

/** ประวัติการแก้ไขหนึ่งรายการ */
export interface ClaimLog {
  id: string
  action: string
  changed_by: string | null
  changes: Record<string, { from: unknown; to: unknown }>
  note: string | null
  created_at: string
  editor?: { id: string; full_name: string } | null
}

/** ใบที่อนุมัติแล้วแต่ยังไม่จ่าย ที่แอดมินดึงเข้าวงเงินสดย่อยได้ */
export interface LinkableClaim {
  id: string
  claim_number: string
  claim_type: string
  title: string
  amount: number
  expense_date: string | null
  status: string
  submitter?: { id: string; full_name: string } | null
}

export interface ClaimPageData {
  claim: ExpenseClaim
  categories: FinanceCategory[]
  logs: ClaimLog[]
  /** รายการในวงเงิน + ยอด — เฉพาะวงเงินสดย่อย (ใบแม่) */
  pettyChildren: PettyChildren | null
  /** ใบที่ดึงเข้าวงเงินได้ — เฉพาะวงเงินสดย่อยที่แอดมินเปิด */
  linkableClaims: LinkableClaim[] | null
  purchaseItems: ClaimPurchaseItemRow[]
}

const CLAIM_SELECT = `
  *,
  submitter:profiles!expense_claims_submitted_by_fkey(id, full_name),
  approver:profiles!expense_claims_approved_by_fkey(id, full_name),
  job_event:job_cost_events!expense_claims_job_event_id_fkey(id, event_name)
`

/**
 * ทุกอย่างของหน้าใบเบิกในรอบเดียว (+ รอบของ requireAuth ที่ cache ไว้แล้ว) — null = ไม่มีใบนี้หรือผู้ใช้มองไม่เห็น (หน้าแสดง 404)
 * id ที่ไม่ใช่ uuid ไม่แตะฐานข้อมูล
 */
export async function loadClaimPage(id: string, viewer: FinanceViewer | null): Promise<ClaimPageData | null> {
  if (typeof id !== 'string' || !CLAIM_ID_RE.test(id)) return null
  const who = await authorizeViewer(viewer)
  if (!who) return null

  const supabase = createServiceClient()
  const [claimRes, categories, logsRes, children, linkable, purchaseItems] = await Promise.all([
    supabase.from('expense_claims').select(CLAIM_SELECT).eq('id', id).maybeSingle(),
    getFinanceCategories(),
    supabase
      .from('expense_claim_logs')
      .select('*, editor:profiles!expense_claim_logs_changed_by_fkey(id, full_name)')
      .eq('claim_id', id)
      .order('created_at', { ascending: false }),
    // ใบที่ไม่ใช่วงเงินได้รายการว่าง (ไม่มีใบไหนชี้มาที่ใบนี้) — อ่านพร้อมกันเลยไม่ต้องรอรู้ประเภทใบก่อน
    getPettyCashChildren(id),
    who.isAdmin ? getLinkablePettyClaims() : null,
    getClaimPurchaseItems(id),
  ])

  const claim = claimRes.data as ExpenseClaim | null
  if (!claim) {
    if (claimRes.error) console.error('loadClaimPage:', claimRes.error.message)
    return null
  }
  // ใบที่แอดมินซ่อนไว้ — คนอื่นเห็นเหมือนไม่มีใบนี้
  if (claim.deleted_at && !who.isAdmin) return null
  // คนที่ไม่ใช่แอดมินเห็นเฉพาะใบของตัวเอง ยกเว้นเอกสารเงินสดย่อย (วงเงิน / เติมเงิน / รายการในกล่อง) ที่เป็นกล่องกลาง
  const isPettyRelated = claim.claim_type === 'petty_cash' || !!claim.pettycash_fund_id
  if (!who.isAdmin && claim.submitted_by !== who.userId && !isPettyRelated) return null

  const isPettyFund = claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id
  return {
    claim,
    categories,
    logs: logsRes.error ? [] : ((logsRes.data ?? []) as ClaimLog[]),
    pettyChildren: isPettyFund ? children : null,
    linkableClaims: isPettyFund && who.isAdmin ? ((linkable?.data ?? []) as unknown as LinkableClaim[]) : null,
    purchaseItems,
  }
}
