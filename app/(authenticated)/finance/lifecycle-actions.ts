'use server'

// ============================================================================
// การเปลี่ยนสถานะใบเบิก — ยื่น · ยกเลิก · อนุมัติ · ปฏิเสธ · ส่งกลับให้แก้ · เปิดใบที่ถูกปฏิเสธ · ขอใบกำกับ
// · เลื่อนจ่ายสิ้นเดือน · จ่าย · ลบ · ซ่อน/กู้คืน · บังคับเปลี่ยนสถานะ · ทำทีละหลายใบ
//
// ไฟล์ 'use server': ทุก export เป็น endpoint ที่ใครก็เรียกได้ — ตรวจตัวตนเองทุกฟังก์ชัน และ export ได้เฉพาะ async function
// (ตัวช่วยและข้อความกลางอยู่ใน claim-db.ts) · ใครทำอะไรจากสถานะไหนมาจากตาราง claim-transitions.ts
// รูปแบบ: ฟังก์ชันที่ export = ตรวจสิทธิ์ → core (อ่าน → ตรวจสถานะ → update แบบมีเงื่อนไข → รายการต้นทุน → ประวัติ →
// activity → แจ้งเตือน) → revalidatePath · core ตัวเดียวกันใช้ทั้งกดทีละใบและ bulkClaimAction
// พฤติกรรมเดิมของ 11 action ตรวจด้วย scripts/claim-lifecycle.check.ts (ผลอ้างอิงเก็บจากโค้ดก่อนย้าย)
// ============================================================================

import { createServiceClient, removeStorageByUrls } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { paymentLock, reasonRequiredForTransition, receiptRequiredForSubmit } from './claim-rules'
import { BULK_TRANSITIONS, CLAIM_TRANSITIONS, findTransition, type TransitionKey } from './claim-transitions'
import { getOutstandingClaims } from './outstanding-data'
import { markClaimsFiled } from './actions'
import { thaiTodayIso } from '@/lib/thai-date'
import {
  CLAIM_ID_RE,
  CLAIM_SYNC_SELECT,
  COST_SYNC_ERROR,
  REASON_REQUIRED_ERROR,
  RECEIPT_REQUIRED_ERROR,
  STALE_STATUS_ERROR,
  getSession,
  isMissingColumn,
  notifyAdminsOfSubmission,
  syncClaimCostItem,
  updateClaimFromStatus,
  withSyncSelect,
  type CostSyncClaim,
  type Db,
} from './claim-db'
import { QUEUE_SELECT, type QueueClaim } from './queue-data'

/** ค่าที่ 11 action เดิมคืน — { success: true } หรือ { error } (ชนิดกว้างเท่าชนิดเดิมที่ผู้เรียกใช้อยู่) */
type ActionResult = { success?: boolean; error?: string }

/** ผู้กด + ชุด (เมื่อมาจาก bulkClaimAction — ลงใน activity ทุกใบของชุด) */
type Ctx = { supabase: Db; userId: string; batch?: { batchId: string; batchSize: number } }

/** ผลของ core: res = ค่าที่คืนให้ผู้เรียก · changed = สถานะถูกเขียนแล้ว (ต้อง revalidate) */
type Outcome = { res: { success: true } | { error: string }; changed: boolean; claimNumber: string }

const fail = (error: string, claimNumber = ''): Outcome => ({ res: { error }, changed: false, claimNumber })
const done = (synced: { error?: string }, claimNumber: string): Outcome =>
  ({ res: synced.error ? { error: COST_SYNC_ERROR } : { success: true }, changed: true, claimNumber })
/** รายละเอียดชุดของ activity (ว่างเมื่อกดทีละใบ — คีย์ไม่ถูกเพิ่มเลย) */
const batchOf = (ctx: Ctx) => (ctx.batch ? { batchId: ctx.batch.batchId, batchSize: ctx.batch.batchSize } : {})
const wrongStatus = (key: TransitionKey, claimNumber: string) => fail(CLAIM_TRANSITIONS[key].wrongStatusError, claimNumber)

const HIDE_MIGRATION_MISSING = 'ยังซ่อนใบเบิกไม่ได้ — ต้องรันไฟล์ SQL 20260930_claim_hide_status_time.sql บนฐานข้อมูลก่อน'
const PETTY_HIDE_ERROR = 'รายการเงินสดย่อยซ่อนไม่ได้ — ยกเลิกรายการแทน'
/** จำนวนใบสูงสุดต่อการทำทีละหลายใบ (หน้าจอใช้ BULK_MAX = 50 ใน claim-queue.ts) */
const BULK_LIMIT = 50

// ============================================================================
// Submit Claim (owner) — draft → pending
// Requires at least one receipt to be attached.
// ============================================================================

async function submitCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('status, submitted_by, receipt_urls, claim_number, title, amount, claim_type')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  if (claim.submitted_by !== userId) return fail('คุณไม่มีสิทธิ์ยื่นใบเบิกนี้', claim.claim_number)
  const t = findTransition('submit', claim.status)
  if (!t) return wrongStatus('submit', claim.claim_number)
  // Advance (ทดลองจ่าย) and petty cash (เงินสดย่อย) don't require receipts at
  // submission — they're uploaded later as expenses are logged. (กติกาเดียวกับ createClaim ที่ยื่นทันที)
  if (receiptRequiredForSubmit(claim.claim_type) && (!claim.receipt_urls || claim.receipt_urls.length === 0)) {
    return fail(RECEIPT_REQUIRED_ERROR, claim.claim_number)
  }
  // ยังมีรายการค้างเคลียร์ (ไม่นับใบนี้เอง) → ยื่นไม่ได้ ทุกคนรวมแอดมิน · กติกาเดียวกับ createClaim
  const outstanding = (await getOutstandingClaims(userId)).filter(c => c.id !== id)
  if (outstanding.length > 0) {
    return fail(`ยังมีรายการค้างเคลียร์ ${outstanding.length} ใบ (${outstanding.map(c => c.claim_number).join(', ')}) — เคลียร์ให้ครบก่อนจึงยื่นใบเบิกใหม่ได้`, claim.claim_number)
  }

  // ยื่นใหม่หลังถูกส่งกลับให้แก้ → ล้างเหตุผลที่ส่งกลับ (ไม่ค้างเป็นแถบเตือนของใบที่ยื่นแล้ว)
  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    submitted_at: new Date().toISOString(),
    reject_reason: null,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งเตือน ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'ยื่นใบเบิกเพื่อขออนุมัติ',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      title: claim.title,
      amount: claim.amount,
    }),
    // หลัง update แบบมีเงื่อนไขเท่านั้น — ทางที่สถานะถูกเปลี่ยนไปก่อน (STALE) ไม่แจ้งใคร
    notifyAdminsOfSubmission(supabase, { id, claim_number: claim.claim_number, title: claim.title, amount: claim.amount }, userId, createNotifications),
  ])

  return done(synced, claim.claim_number)
}

export async function submitClaim(id: string): Promise<ActionResult> {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const r = await submitCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath(`/finance/${id}`)
  }
  return r.res
}

// ============================================================================
// Cancel Claim (owner only) — draft | pending → cancelled
// ============================================================================

async function cancelCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('status, submitted_by, claim_number')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  if (claim.submitted_by !== userId) return fail('เฉพาะผู้ยื่นใบเบิกเท่านั้นที่สามารถยกเลิกได้', claim.claim_number)
  const t = findTransition('cancel', claim.status)
  if (!t) return wrongStatus('cancel', claim.claim_number)

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    cancelled_at: new Date().toISOString(),
    cancelled_by: userId,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ + activity ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'ยกเลิกใบเบิกโดยผู้ยื่น',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      fromStatus: claim.status,
    }),
  ])

  return done(synced, claim.claim_number)
}

export async function cancelClaim(id: string): Promise<ActionResult> {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const r = await cancelCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath(`/finance/${id}`)
  }
  return r.res
}

// ============================================================================
// Approve / Reject
// ============================================================================

async function approveCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  // Get claim details
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  const t = findTransition('approve', claim.status)
  if (!t) return wrongStatus('approve', claim.claim_number)

  const now = new Date().toISOString()

  // Update claim status: pending → approved (เฉพาะเมื่อยังรออนุมัติ — กดซ้ำไม่อนุมัติซ้ำ)
  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    approved_by: userId,
    approved_at: now,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)

  // ผูกงาน → รายการต้นทุนหนึ่งรายการ (ผ่าน helper: มีอยู่แล้วไม่สร้างซ้ำ)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'อนุมัติใบเบิก',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      totalAmount: claim.total_amount,
      ...batchOf(ctx),
    }),
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_approved',
        title: `ใบเบิก ${claim.claim_number} ได้รับการอนุมัติแล้ว`,
        body: claim.title,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  return done(synced, claim.claim_number)
}

export async function approveClaim(id: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถอนุมัติได้' }

  const r = await approveCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath('/costs')
  }
  return r.res
}

async function rejectCore(ctx: Ctx, id: string, reason: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, submitted_by, title')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  const t = findTransition('reject', claim.status)
  if (!t) return wrongStatus('reject', claim.claim_number)

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    approved_by: userId,
    approved_at: new Date().toISOString(),
    reject_reason: reason || 'ไม่ระบุเหตุผล',
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: reason || 'ไม่ระบุเหตุผล',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      reason,
    }),
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_rejected',
        title: `ใบเบิก ${claim.claim_number} ถูกปฏิเสธ`,
        body: reason || 'ไม่ระบุเหตุผล',
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  return done(synced, claim.claim_number)
}

export async function rejectClaim(id: string, reason: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถปฏิเสธได้' }

  const r = await rejectCore({ supabase: createServiceClient(), userId }, id, reason)
  if (r.changed) revalidatePath('/finance')
  return r.res
}

// ============================================================================
// Send Back (admin) — pending | approved | waiting_tax_invoice | pending_month_end → draft พร้อมเหตุผล
// ผู้เบิกแก้แล้วยื่นใหม่ได้ (ใช้แทนการลบ/ถอยสถานะ) · รายการต้นทุนถูกเอาออกจนกว่าจะอนุมัติใหม่
// ============================================================================

async function sendBackCore(ctx: Ctx, id: string, reason: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, submitted_by')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  const t = findTransition('send_back', claim.status)
  if (!t) return wrongStatus('send_back', claim.claim_number)

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    reject_reason: reason,
    approved_by: null,
    approved_at: null,
    submitted_at: null,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: reason,
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      fromStatus: claim.status,
      reason,
    }),
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_sent_back',
        title: `ใบเบิก ${claim.claim_number} ถูกส่งกลับให้แก้ไข`,
        body: reason,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  return done(synced, claim.claim_number)
}

export async function sendBackClaim(id: string, reason: string): Promise<{ success?: true; error?: string }> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }
  const trimmed = typeof reason === 'string' ? reason.trim() : ''
  if (!trimmed) return { error: 'กรุณาระบุสิ่งที่ต้องแก้ก่อนส่งกลับ' }

  const r = await sendBackCore({ supabase: createServiceClient(), userId }, id, trimmed)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath(`/finance/${id}`)
    revalidatePath('/costs')
  }
  return r.res
}

// ============================================================================
// Reopen Rejected Claim (owner only) — rejected → draft เพื่อแก้แล้วยื่นใหม่
// ============================================================================

async function reopenCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await withSyncSelect(select => supabase
    .from('expense_claims')
    .select(`${select}, submitted_by, reject_reason, claim_type, pettycash_fund_id`)
    .eq('id', id)
    .single())

  if (!claim) return fail('ไม่พบใบเบิก')
  if (claim.submitted_by !== userId) return fail('เฉพาะเจ้าของใบเบิกเท่านั้นที่เปิดใบที่ถูกปฏิเสธกลับมาแก้ไขได้', claim.claim_number)
  const t = findTransition('reopen', claim.status)
  if (!t) return wrongStatus('reopen', claim.claim_number)

  // รายการในวงเงินสดย่อยที่ปิดเดือนแล้วแก้ไม่ได้ (ยอดคืนตอนปิดเดือนต้องตรง)
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return fail('รอบเดือนของวงเงินนี้ปิดแล้ว ไม่สามารถแก้ไขรายการได้ (admin ต้องเปิดรอบอีกครั้งก่อน)', claim.claim_number)
    }
  }

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    reject_reason: null,
    approved_by: null,
    approved_at: null,
    submitted_at: null,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ + activity ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: `เจ้าของใบเปิดกลับมาแก้ไข (เหตุผลที่ถูกปฏิเสธ: ${claim.reject_reason || 'ไม่ระบุ'})`,
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      rejectReason: claim.reject_reason,
    }),
  ])

  return done(synced, claim.claim_number)
}

export async function reopenRejectedClaim(id: string): Promise<ActionResult> {
  const { userId } = await getSession()
  if (!userId) return { error: 'Unauthorized' }

  const r = await reopenCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath(`/finance/${id}`)
  }
  return r.res
}

// ============================================================================
// Approve directly as Pending Month End (admin only) — pending → pending_month_end
// ============================================================================

async function approveMonthEndCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  const t = findTransition('approve_month_end', claim.status)
  if (!t) return wrongStatus('approve_month_end', claim.claim_number)

  const now = new Date().toISOString()

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    approved_by: userId,
    approved_at: now,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)

  // Create cost item if linked to event (same as approveClaim — helper ไม่สร้างซ้ำ)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'อนุมัติ — รอจ่ายสิ้นเดือน',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      totalAmount: claim.total_amount,
      ...batchOf(ctx),
    }),
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_approved',
        title: `ใบเบิก ${claim.claim_number} ได้รับการอนุมัติ (รอจ่ายสิ้นเดือน)`,
        body: claim.title,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  return done(synced, claim.claim_number)
}

export async function approveAsPendingMonthEnd(id: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const r = await approveMonthEndCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath('/finance/payouts')
    revalidatePath('/costs')
  }
  return r.res
}

// ============================================================================
// Mark as Pending Month End (admin only) — approved | waiting_tax_invoice | awaiting_payment → pending_month_end
// ============================================================================

async function deferMonthEndCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, total_amount')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  // Accept 'approved', 'waiting_tax_invoice' (new flow) and 'awaiting_payment' (legacy data)
  const t = findTransition('defer_month_end', claim.status)
  if (!t) return wrongStatus('defer_month_end', claim.claim_number)

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, { status: t.to })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ + activity ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'เลื่อนจ่ายสิ้นเดือน',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      totalAmount: claim.total_amount,
      ...batchOf(ctx),
    }),
  ])

  return done(synced, claim.claim_number)
}

export async function markAsPendingMonthEnd(id: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const r = await deferMonthEndCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath('/finance/payouts')
  }
  return r.res
}

// ============================================================================
// Mark as Waiting Tax Invoice (admin only) — approved → waiting_tax_invoice
// ============================================================================

async function requestTaxInvoiceCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('claim_number, status, submitted_by, title')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  const t = findTransition('request_tax_invoice', claim.status)
  if (!t) return wrongStatus('request_tax_invoice', claim.claim_number)

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, { status: t.to })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'รอใบกำกับภาษีจากผู้เบิก',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      ...batchOf(ctx),
    }),
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_waiting_tax_invoice',
        title: `ใบเบิก ${claim.claim_number} — กรุณาอัพโหลดใบกำกับภาษี`,
        body: 'Admin ขอใบกำกับภาษีสำหรับใบเบิกนี้ กรุณาอัพโหลดเพื่อดำเนินการชำระเงินต่อ',
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  return done(synced, claim.claim_number)
}

export async function markAsWaitingTaxInvoice(id: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const r = await requestTaxInvoiceCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath(`/finance/${id}`)
  }
  return r.res
}

// ============================================================================
// Mark as Paid (admin only) — approved | pending_month_end | awaiting_payment | waiting_tax_invoice → paid
// ล็อกการจ่าย: เอกสารไม่ครบ (paymentLock) จ่ายไม่ได้ — ทางเดียวที่ข้ามได้คือ adminOverrideStatus พร้อมเหตุผล
// ============================================================================

async function payCore(ctx: Ctx, id: string): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return fail('ไม่พบใบเบิก')
  // Accept new 'approved', 'waiting_tax_invoice', legacy 'awaiting_payment' and deferred 'pending_month_end'
  const t = findTransition('pay', claim.status)
  if (!t) return wrongStatus('pay', claim.claim_number)

  // เอกสารไม่ครบ → ไม่เขียนอะไร (ข้อความเดียวกับที่หน้าจอแสดง)
  const lock = paymentLock(claim)
  if (lock.locked) return fail(lock.message, claim.claim_number)

  // A petty-cash top-up must not be paid into a CLOSED month — the close
  // snapshot already fixed the box balance.
  if (claim.claim_type === 'petty_cash' && claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return fail('วงเงินปลายทางปิดเดือนแล้ว — จ่ายรายการเติมเงินนี้ไม่ได้ (ยกเลิกรายการแทน)', claim.claim_number)
    }
  }

  const { row, error } = await updateClaimFromStatus(supabase, id, claim.status, {
    status: t.to,
    paid_at: new Date().toISOString(),
    paid_by: userId,
  })

  if (error) return fail('เกิดข้อผิดพลาด', claim.claim_number)
  if (!row) return fail(STALE_STATUS_ERROR, claim.claim_number)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: t.logAction,
      changed_by: userId,
      changes: { status: { from: claim.status, to: t.to } },
      note: 'ชำระเงินแล้ว',
    }),
    logActivity(t.activity, {
      claimId: id,
      claimNumber: claim.claim_number,
      totalAmount: claim.total_amount,
      ...batchOf(ctx),
    }),
    // แจ้งผู้เบิกว่าจ่ายเงินแล้ว (createNotifications ไม่แจ้งตัวเอง — แอดมินจ่ายใบของตัวเองไม่มีแจ้งเตือน)
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_paid',
        title: `ใบเบิก ${claim.claim_number} จ่ายเงินแล้ว ฿${Number(claim.total_amount ?? claim.amount).toLocaleString()}`,
        body: claim.title,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  return done(synced, claim.claim_number)
}

export async function markAsPaid(id: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const r = await payCore({ supabase: createServiceClient(), userId }, id)
  if (r.changed) {
    revalidatePath('/finance')
    revalidatePath('/finance/payouts')
    revalidatePath('/finance/archive')
  }
  return r.res
}

// ============================================================================
// Delete Claim (admin only) — หน้าจอใช้ "ซ่อนใบเบิก" (hideClaim) แทนแล้ว · คงไว้ให้ผู้เรียกเดิม
// ============================================================================

export async function deleteClaim(id: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถลบใบเบิกได้' }

  const supabase = createServiceClient()

  const { data: claim } = await withSyncSelect(select => supabase
    .from('expense_claims')
    .select(`${select}, claim_type, submitted_by, receipt_urls, tax_invoice_urls, actual_receipt_urls, refund_slip_urls, pettycash_fund_id`)
    .eq('id', id)
    .single())

  if (!claim) return { error: 'ไม่พบใบเบิก' }

  // Children of a CLOSED petty-cash month are frozen (refund snapshot).
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return { error: 'รอบเดือนของวงเงินปิดแล้ว — admin ต้องเปิดรอบอีกครั้งก่อนจึงจะลบรายการได้' }
    }
  }

  // A petty-cash fund with children (expenses/top-ups) must not be deleted —
  // the children would orphan and the box audit trail would break.
  if (claim.claim_type === 'petty_cash') {
    const { count } = await supabase
      .from('expense_claims')
      .select('id', { count: 'exact', head: true })
      .eq('pettycash_fund_id', id)
    if ((count || 0) > 0) {
      return { error: 'วงเงินนี้มีรายการลูก (ค่าใช้จ่าย/เติมเงิน) อยู่ — ยกเลิก/ลบรายการลูกก่อนจึงจะลบวงเงินได้' }
    }
  }

  // ใบที่ถูกลบต้องไม่เหลือรายการต้นทุน ไม่ว่าสถานะไหน (เดิมลบเฉพาะสถานะ approved และจับคู่ด้วยเลขที่)
  // ลบรายการก่อน: ถ้าลบใบไม่สำเร็จ ยังคืนรายการตามสถานะเดิมได้ — กลับลำดับแล้วรายการกำพร้าจะไม่มีใครเก็บ
  const unlinked = await syncClaimCostItem(supabase, { ...claim, id, job_event_id: null }, userId)
  if (unlinked.error) return { error: 'ลบรายการต้นทุนของใบเบิกไม่สำเร็จ — ยังไม่ได้ลบใบเบิก กรุณาลองใหม่' }

  const { error } = await supabase.from('expense_claims').delete().eq('id', id)
  if (error) {
    await syncClaimCostItem(supabase, { ...claim, id }, userId)
    return { error: 'เกิดข้อผิดพลาดในการลบ' }
  }

  // ลบไฟล์ใบเสร็จออกจาก Storage ไม่ให้กลายเป็น orphan (ใบเสร็จ · ใบกำกับภาษี · ใบเสร็จตอนเคลียร์ · สลิปคืนเงิน)
  await removeStorageByUrls(supabase, 'receipts', [
    ...(claim.receipt_urls || []),
    ...(claim.tax_invoice_urls || []),
    ...(claim.actual_receipt_urls || []),
    ...(claim.refund_slip_urls || []),
  ])

  await logActivity('DELETE_EXPENSE_CLAIM', {
    claimId: id,
    claimNumber: claim.claim_number,
  })

  revalidatePath('/finance')
  revalidatePath('/costs')
  return { success: true }
}

// ============================================================================
// Hide / Restore (admin only) — ซ่อนแทนการลบ: ใบหายจากทุกรายการและคิว กู้คืนได้ · ไฟล์ไม่ถูกลบ
// คอลัมน์มาจาก supabase/migrations/20260930_claim_hide_status_time.sql — ยังไม่รัน = ข้อความบอกให้รัน ไม่ล้ม
// ============================================================================

export async function hideClaim(id: string, reason?: string): Promise<{ success?: true; error?: string }> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }
  const note = (typeof reason === 'string' ? reason.trim() : '') || 'ไม่ระบุเหตุผล'

  const supabase = createServiceClient()
  const { data: claim, error: readError } = await supabase
    .from('expense_claims')
    .select(`${CLAIM_SYNC_SELECT}, claim_type, pettycash_fund_id, submitted_by`)
    .eq('id', id)
    .maybeSingle()

  if (isMissingColumn(readError)) return { error: HIDE_MIGRATION_MISSING }
  if (!claim) return { error: 'ไม่พบใบเบิก' }
  // เงินสดย่อย (วงเงิน / เติมเงิน / รายการในกล่อง) ผูกยอดของกล่อง — ซ่อนแล้วยอดคงเหลือเพี้ยน
  if (claim.claim_type === 'petty_cash' || claim.pettycash_fund_id) return { error: PETTY_HIDE_ERROR }
  if (claim.deleted_at) return { error: 'ใบเบิกนี้ถูกซ่อนไปแล้ว' }

  const now = new Date().toISOString()
  const { data: rows, error } = await supabase
    .from('expense_claims')
    .update({ deleted_at: now, deleted_by: userId })
    .eq('id', id)
    .eq('status', claim.status)
    .is('deleted_at', null)
    .select(CLAIM_SYNC_SELECT)

  if (isMissingColumn(error)) return { error: HIDE_MIGRATION_MISSING }
  if (error) return { error: 'เกิดข้อผิดพลาด' }
  const row = ((rows ?? [])[0] ?? null) as CostSyncClaim | null
  if (!row) return { error: STALE_STATUS_ERROR }
  // ใบที่ซ่อนไม่มีรายการต้นทุน (shouldHaveCostItem ดู deleted_at) — ไฟล์ในสตอเรจเก็บไว้ให้กู้คืนได้
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: 'hide',
      changed_by: userId,
      changes: { deleted_at: { from: null, to: now } },
      note,
    }),
    logActivity('HIDE_EXPENSE_CLAIM', {
      claimId: id,
      claimNumber: claim.claim_number,
      status: claim.status,
      reason: note,
    }),
    claim.submitted_by
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_hidden',
        title: `ใบเบิก ${claim.claim_number} ถูกซ่อนโดยแอดมิน`,
        body: note,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/costs')
  if (synced.error) return { error: COST_SYNC_ERROR }
  return { success: true }
}

export async function restoreClaim(id: string): Promise<{ success?: true; error?: string }> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()
  const { data: claim, error: readError } = await supabase
    .from('expense_claims')
    .select(CLAIM_SYNC_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (isMissingColumn(readError)) return { error: HIDE_MIGRATION_MISSING }
  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (!claim.deleted_at) return { error: 'ใบเบิกนี้ไม่ได้ถูกซ่อน' }

  const { data: rows, error } = await supabase
    .from('expense_claims')
    .update({ deleted_at: null, deleted_by: null })
    .eq('id', id)
    .eq('status', claim.status)
    .eq('deleted_at', claim.deleted_at)
    .select(CLAIM_SYNC_SELECT)

  if (error) return { error: 'เกิดข้อผิดพลาด' }
  const row = ((rows ?? [])[0] ?? null) as CostSyncClaim | null
  if (!row) return { error: STALE_STATUS_ERROR }
  // กลับมามีรายการต้นทุนตามสถานะ (อนุมัติแล้วขึ้นไป + ผูกงาน)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ + activity ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: 'restore',
      changed_by: userId,
      changes: { deleted_at: { from: claim.deleted_at, to: null } },
      note: 'กู้คืนใบเบิกที่ซ่อนไว้',
    }),
    logActivity('RESTORE_EXPENSE_CLAIM', {
      claimId: id,
      claimNumber: claim.claim_number,
      status: claim.status,
    }),
  ])

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/costs')
  if (synced.error) return { error: COST_SYNC_ERROR }
  return { success: true }
}

/** ใบที่ซ่อนไว้ ใหม่ → เก่า (100 ใบล่าสุด) — รายการ "ใบที่ซ่อนไว้" ของคิวใบเบิก (แอดมินเท่านั้น) */
export async function listHiddenClaims(): Promise<{ data: QueueClaim[]; error?: string }> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { data: [], error: 'Unauthorized' }

  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('expense_claims')
    .select(QUEUE_SELECT)
    .not('deleted_at', 'is', null)
    .order('deleted_at', { ascending: false })
    .order('id', { ascending: true })
    .limit(100)

  if (isMissingColumn(error)) return { data: [], error: HIDE_MIGRATION_MISSING }
  if (error) return { data: [], error: error.message }
  // ใบที่ซ่อนไม่โชว์ป้ายค้างเคลียร์ของผู้เบิก — ใส่ 0 ให้แถวรูปเดียวกับคิว
  return { data: ((data ?? []) as unknown as QueueClaim[]).map(row => ({ ...row, submitter_outstanding: 0 })) }
}

// ============================================================================
// Admin Override Status — Admin only, any → any transition with reason
// ============================================================================

export async function adminOverrideStatus(id: string, newStatus: string, reason: string): Promise<ActionResult> {
  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้นที่สามารถ Override สถานะได้' }

  const validStatuses = ['draft', 'pending', 'approved', 'waiting_tax_invoice', 'pending_month_end', 'paid', 'rejected', 'cancelled']
  if (!validStatuses.includes(newStatus)) return { error: 'สถานะไม่ถูกต้อง' }

  const supabase = createServiceClient()

  const { data: claim } = await supabase
    .from('expense_claims')
    .select('*')
    .eq('id', id)
    .single()

  if (!claim) return { error: 'ไม่พบใบเบิก' }
  if (claim.status === newStatus) return { error: 'สถานะเดิมและสถานะใหม่เหมือนกัน' }

  // เหตุผลบังคับเฉพาะการถอยสถานะ / เปิดใบที่ปิดแล้ว / ปฏิเสธ-ยกเลิกใบที่จ่ายแล้ว · เดินหน้าตามขั้นตอนเว้นว่างได้
  const trimmed = (reason ?? '').trim()
  if (reasonRequiredForTransition(claim.status, newStatus) && !trimmed) return { error: REASON_REQUIRED_ERROR }
  // จ่ายทั้งที่เอกสารไม่ครบ (ล็อกการจ่าย) ทำได้ทางนี้ทางเดียว — ต้องพิมพ์เหตุผล และเหตุผลลงในประวัติ
  if (newStatus === 'paid' && !trimmed) {
    const lock = paymentLock(claim)
    if (lock.locked) return { error: `${REASON_REQUIRED_ERROR} · ${lock.message}` }
  }
  const reasonText = trimmed || 'ไม่ระบุเหตุผล'

  // Petty-cash guardrails: children of a closed month are frozen, and a fund
  // with children must stay a live fund (its children reference it).
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return { error: 'รอบเดือนของวงเงินปิดแล้ว — เปิดรอบอีกครั้งก่อนจึงจะแก้สถานะรายการลูกได้' }
    }
  }
  if (claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id && ['draft', 'pending', 'cancelled', 'rejected'].includes(newStatus)) {
    const { count } = await supabase
      .from('expense_claims')
      .select('id', { count: 'exact', head: true })
      .eq('pettycash_fund_id', id)
    if ((count || 0) > 0) {
      return { error: 'วงเงินนี้มีรายการลูกอยู่ — ไม่สามารถย้อนเป็น draft/pending หรือยกเลิก/ปฏิเสธได้' }
    }
  }

  const now = new Date().toISOString()
  const fromStatus = claim.status

  // Build update payload — set/clear metadata fields based on target status
  const updatePayload: Record<string, unknown> = { status: newStatus }

  if (newStatus === 'draft') {
    updatePayload.submitted_at = null
    updatePayload.approved_by = null
    updatePayload.approved_at = null
    updatePayload.reject_reason = null
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
  } else if (newStatus === 'pending') {
    updatePayload.approved_by = null
    updatePayload.approved_at = null
    updatePayload.reject_reason = null
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'approved') {
    updatePayload.approved_by = userId
    updatePayload.approved_at = now
    updatePayload.reject_reason = null
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'waiting_tax_invoice') {
    if (!claim.approved_by) updatePayload.approved_by = userId
    if (!claim.approved_at) updatePayload.approved_at = now
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    updatePayload.reject_reason = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'pending_month_end') {
    if (!claim.approved_by) updatePayload.approved_by = userId
    if (!claim.approved_at) updatePayload.approved_at = now
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    updatePayload.reject_reason = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'paid') {
    if (!claim.approved_by) updatePayload.approved_by = userId
    if (!claim.approved_at) updatePayload.approved_at = now
    updatePayload.paid_at = now
    updatePayload.paid_by = userId
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
    updatePayload.reject_reason = null
    if (!claim.submitted_at) updatePayload.submitted_at = now
  } else if (newStatus === 'rejected') {
    updatePayload.reject_reason = reasonText
    updatePayload.approved_by = userId
    updatePayload.approved_at = now
    updatePayload.paid_at = null
    updatePayload.paid_by = null
    updatePayload.cancelled_at = null
    updatePayload.cancelled_by = null
  } else if (newStatus === 'cancelled') {
    updatePayload.cancelled_at = now
    updatePayload.cancelled_by = userId
    updatePayload.paid_at = null
    updatePayload.paid_by = null
  }

  const { row, error } = await updateClaimFromStatus(supabase, id, fromStatus, updatePayload)

  if (error) return { error: 'เกิดข้อผิดพลาดในการเปลี่ยนสถานะ' }
  if (!row) return { error: STALE_STATUS_ERROR }
  // ข้ามขั้นเข้า/ออกจากช่วง "อนุมัติแล้วขึ้นไป" ต้องสร้าง/ลบรายการต้นทุนด้วย (เดิมไม่ทำ — ต้นทุนเพี้ยน)
  const synced = await syncClaimCostItem(supabase, row, userId)

  // ประวัติ · activity · แจ้งผู้เบิก ไม่ขึ้นต่อกัน — ส่งพร้อมกันรอบเดียว (เรียกตามลำดับเดิม)
  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: 'admin_override',
      changed_by: userId,
      changes: { status: { from: fromStatus, to: newStatus } },
      note: `[Admin Override] ${reasonText}`,
    }),
    logActivity('ADMIN_OVERRIDE_CLAIM_STATUS', {
      claimId: id,
      claimNumber: claim.claim_number,
      fromStatus,
      toStatus: newStatus,
      reason: reasonText,
    }),
    // Notify submitter of the override
    claim.submitted_by && claim.submitted_by !== userId
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_approved',
        title: `ใบเบิก ${claim.claim_number} สถานะถูกเปลี่ยนเป็น "${newStatus}" โดย Admin`,
        body: reasonText,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])

  revalidatePath('/finance')
  revalidatePath(`/finance/${id}`)
  revalidatePath('/finance/payouts')
  revalidatePath('/costs')
  if (synced.error) return { error: COST_SYNC_ERROR }
  return { success: true }
}

// ============================================================================
// ทำทีละหลายใบ (admin) — อนุมัติ · อนุมัติรอจ่ายสิ้นเดือน · ขอใบกำกับ · ย้ายไปจ่ายสิ้นเดือน · จ่าย
// แต่ละใบผ่าน core เดียวกับการกดทีละใบ (ตรวจสถานะ/ล็อกการจ่าย · ประวัติ · แจ้งเตือนทีละใบ) ใบที่ไม่ผ่านไม่หยุดทั้งชุด
// ============================================================================

export type BulkAction = 'approve' | 'approve_month_end' | 'request_tax_invoice' | 'defer_month_end' | 'pay'
export type BulkResult = { id: string; claimNumber: string; ok: boolean; error?: string }

const BULK_CORES: Record<BulkAction, (ctx: Ctx, id: string) => Promise<Outcome>> = {
  approve: approveCore,
  approve_month_end: approveMonthEndCore,
  request_tax_invoice: requestTaxInvoiceCore,
  defer_month_end: deferMonthEndCore,
  pay: payCore,
}

export async function bulkClaimAction(
  action: BulkAction,
  ids: string[],
): Promise<{ error?: string; results?: BulkResult[]; done?: number; failed?: number }> {
  // ไฟล์ 'use server' — อินพุตมาจากใครก็ได้ ตรวจรูปแบบก่อนแตะฐานข้อมูลใดๆ
  const transition = typeof action === 'string' ? findTransition(action) : null
  if (!transition || !BULK_TRANSITIONS.includes(transition.key)) return { error: 'การกระทำไม่ถูกต้อง' }
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > BULK_LIMIT) return { error: 'ทำได้ครั้งละ 1–50 ใบ' }
  if (!ids.every(id => typeof id === 'string' && CLAIM_ID_RE.test(id))) return { error: 'รหัสใบเบิกไม่ถูกต้อง' }
  // uuid ตัวพิมพ์ต่างกันคือใบเดียวกัน — เทียบซ้ำหลังทำเป็นตัวเล็ก
  const list = ids.map(id => id.toLowerCase())
  if (new Set(list).size !== list.length) return { error: 'มีใบเบิกซ้ำกันในรายการ' }

  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const core = BULK_CORES[transition.key as BulkAction]
  const ctx: Ctx = { supabase: createServiceClient(), userId, batch: { batchId: crypto.randomUUID(), batchSize: list.length } }
  const results: BulkResult[] = []
  let changed = false
  // ทีละใบตามลำดับ — แต่ละใบมีเงื่อนไขสถานะของตัวเอง ใบที่ชนหรือไม่ผ่านไม่กระทบใบอื่น
  for (const id of list) {
    let outcome: Outcome
    try {
      outcome = await core(ctx, id)
    } catch (e) {
      console.error('bulkClaimAction:', e)
      outcome = fail('เกิดข้อผิดพลาด')
    }
    changed = changed || outcome.changed
    results.push('error' in outcome.res
      ? { id, claimNumber: outcome.claimNumber, ok: false, error: outcome.res.error }
      : { id, claimNumber: outcome.claimNumber, ok: true })
  }

  if (changed) {
    revalidatePath('/finance')
    revalidatePath('/finance/payouts')
    revalidatePath('/costs')
  }
  const done = results.filter(r => r.ok).length
  return { results, done, failed: results.length - done }
}

// ============================================================================
// ปิดใบ: เคลียร์กับสำนักงานบัญชีแล้ว (admin) — ใบที่จ่าย/เคลียร์นอกระบบไปแล้ว ปิดเป็น "ชำระเงินแล้ว" ทีละหลายใบ
// วันที่จ่ายเลือกได้ (ลงเที่ยงวันเวลาไทย ให้จัดเดือนแบบไทยไม่คลาด) · ทดลองจ่าย: ใช้หมด = paid / มีเงินคืน = refund_confirmed
// ทุกใบที่ปิดได้ → เข้าแฟ้ม (markClaimsFiled) + ประวัติ close_external + activity CLOSE_CLAIM_EXTERNAL + แจ้งผู้เบิก
// ============================================================================

export type CloseExternalAdvance = { mode: 'spent' | 'refund'; refund?: number }
export type CloseExternalInput = {
  ids: string[]
  /** YYYY-MM-DD ตามเวลาไทย */
  paidDate: string
  reason: string
  advances?: Record<string, CloseExternalAdvance>
}

/** สถานะที่ปิดทางนี้ไม่ได้ — แบบร่างยังไม่ได้ยื่น · ใบที่ปฏิเสธ/ยกเลิกต้องเปิดใบก่อน */
const CLOSE_EXTERNAL_BLOCKED = ['draft', 'rejected', 'cancelled']

export async function closeClaimsExternal(
  input: CloseExternalInput,
): Promise<{ error?: string; results?: BulkResult[]; done?: number; failed?: number; filedError?: string }> {
  // ไฟล์ 'use server' — ตรวจอินพุตทั้งหมดก่อนแตะฐานข้อมูล
  const { ids, paidDate, reason, advances = {} } = (input ?? {}) as CloseExternalInput
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > BULK_LIMIT) return { error: 'ทำได้ครั้งละ 1–50 ใบ' }
  if (!ids.every(id => typeof id === 'string' && CLAIM_ID_RE.test(id))) return { error: 'รหัสใบเบิกไม่ถูกต้อง' }
  const list = ids.map(id => id.toLowerCase())
  if (new Set(list).size !== list.length) return { error: 'มีใบเบิกซ้ำกันในรายการ' }
  // วันที่จริง (ไม่ใช่ 2026-02-30) และไม่เกินวันนี้ตามเวลาไทย
  if (typeof paidDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(paidDate)
    || Number.isNaN(Date.parse(`${paidDate}T00:00:00Z`))
    || new Date(`${paidDate}T00:00:00Z`).toISOString().slice(0, 10) !== paidDate) {
    return { error: 'วันที่จ่ายไม่ถูกต้อง' }
  }
  if (paidDate > thaiTodayIso()) return { error: 'วันที่จ่ายต้องไม่เกินวันนี้' }
  const reasonText = typeof reason === 'string' ? reason.trim() : ''
  if (!reasonText) return { error: REASON_REQUIRED_ERROR }
  if (reasonText.length > 500) return { error: 'เหตุผลยาวเกิน 500 ตัวอักษร' }
  if (!advances || typeof advances !== 'object') return { error: 'ข้อมูลทดลองจ่ายไม่ถูกต้อง' }
  const advanceOf = new Map<string, { mode: 'spent' | 'refund'; refund: number }>()
  for (const [key, a] of Object.entries(advances)) {
    if (!a || (a.mode !== 'spent' && a.mode !== 'refund')) return { error: 'ข้อมูลทดลองจ่ายไม่ถูกต้อง' }
    const refund = a.mode === 'refund' ? Number(a.refund) : 0
    if (a.mode === 'refund' && !(Number.isFinite(refund) && refund > 0)) return { error: 'ยอดเงินคืนต้องมากกว่า 0' }
    advanceOf.set(key.toLowerCase(), { mode: a.mode, refund: Math.round(refund * 100) / 100 })
  }

  const { userId, role } = await getSession()
  if (!userId || role !== 'admin') return { error: 'เฉพาะ Admin เท่านั้น' }

  const supabase = createServiceClient()
  // ทดลองจ่ายทุกใบต้องมีตัวเลือก และเงินคืนไม่เกินยอดเบิก — ตรวจครบก่อนเขียนใบแรก
  const { data: heads, error: headError } = await supabase
    .from('expense_claims')
    .select('id, claim_number, claim_type, amount')
    .in('id', list)
  if (headError) return { error: `เกิดข้อผิดพลาด: ${headError.message}` }
  for (const h of (heads ?? []) as { id: string; claim_number: string; claim_type: string; amount: number | string }[]) {
    if (h.claim_type !== 'advance') continue
    const a = advanceOf.get(h.id)
    if (!a) return { error: `ใบทดลองจ่าย ${h.claim_number}: เลือก "ใช้หมด" หรือ "มีเงินคืน" ก่อน` }
    if (a.mode === 'refund' && a.refund > (Number(h.amount) || 0)) {
      return { error: `ใบทดลองจ่าย ${h.claim_number}: เงินคืนเกินยอดเบิก` }
    }
  }

  const ctx: Ctx = { supabase, userId, batch: { batchId: crypto.randomUUID(), batchSize: list.length } }
  // เที่ยงวันเวลาไทย — เดือนไทยของ paid_at ตรงกับวันที่ที่เลือกเสมอ
  const paidAt = new Date(`${paidDate}T12:00:00+07:00`).toISOString()
  const results: BulkResult[] = []
  for (const id of list) {
    let outcome: Outcome
    try {
      outcome = await closeExternalCore(ctx, id, { paidAt, paidDate, reasonText, advance: advanceOf.get(id) })
    } catch (e) {
      console.error('closeClaimsExternal:', e)
      outcome = fail('เกิดข้อผิดพลาด')
    }
    results.push('error' in outcome.res
      ? { id, claimNumber: outcome.claimNumber, ok: false, error: outcome.res.error }
      : { id, claimNumber: outcome.claimNumber, ok: true })
  }

  const closed = results.filter(r => r.ok).map(r => r.id)
  // เข้าแฟ้มด้วยตัวเดียวกับปุ่ม "เข้าแฟ้ม" (ตรวจ admin + จำจำนวนไฟล์ + activity MARK_CLAIM_FILED เอง)
  const filed: { error?: string } = closed.length > 0 ? await markClaimsFiled(closed) : {}
  revalidatePath('/finance')
  revalidatePath('/finance/payouts')
  revalidatePath('/costs')
  for (const id of closed) revalidatePath(`/finance/${id}`)
  return { results, done: closed.length, failed: results.length - closed.length, ...(filed.error ? { filedError: filed.error } : {}) }
}

async function closeExternalCore(
  ctx: Ctx,
  id: string,
  opts: { paidAt: string; paidDate: string; reasonText: string; advance?: { mode: 'spent' | 'refund'; refund: number } },
): Promise<Outcome> {
  const { supabase, userId } = ctx
  const { data: claim } = await supabase.from('expense_claims').select('*').eq('id', id).single()
  if (!claim) return fail('ไม่พบใบเบิก')
  const claimNumber = claim.claim_number as string
  if (claim.deleted_at) return fail('ใบเบิกนี้ถูกซ่อนอยู่ — กู้คืนก่อน', claimNumber)
  if (CLOSE_EXTERNAL_BLOCKED.includes(claim.status)) return fail('ใบแบบร่าง/ถูกปฏิเสธ/ยกเลิก ปิดทางนี้ไม่ได้', claimNumber)
  const isAdvance = claim.claim_type === 'advance'
  if (isAdvance && !opts.advance) return fail('ใบทดลองจ่าย: เลือก "ใช้หมด" หรือ "มีเงินคืน" ก่อน', claimNumber)

  // Petty-cash guardrail เดียวกับ adminOverrideStatus: รายการลูกของเดือนที่ปิดแล้วแก้ไม่ได้
  // (กติกา "วงเงินที่มีรายการลูก" กันเฉพาะการถอยเป็น draft/pending/ยกเลิก/ปฏิเสธ — ปิดเป็นจ่ายแล้วไม่เข้าเงื่อนไข)
  if (claim.pettycash_fund_id) {
    const { data: parentFund } = await supabase
      .from('expense_claims')
      .select('pettycash_closed_at')
      .eq('id', claim.pettycash_fund_id)
      .single()
    if (parentFund?.pettycash_closed_at) {
      return fail('รอบเดือนของวงเงินปิดแล้ว — เปิดรอบอีกครั้งก่อนจึงจะแก้สถานะรายการลูกได้', claimNumber)
    }
  }

  const fromStatus = claim.status as string
  const refund = isAdvance && opts.advance?.mode === 'refund' ? opts.advance.refund : 0
  // ใบที่จ่ายแล้ว (ไม่ใช่ทดลองจ่าย) หรือยืนยันเงินคืนแล้ว = ปิดอยู่แล้ว — ไม่เขียนสถานะ แค่ลงประวัติ + เข้าแฟ้ม
  const alreadyClosed = fromStatus === 'refund_confirmed' || (fromStatus === 'paid' && !isAdvance)
  const toStatus = alreadyClosed ? fromStatus : refund > 0 ? 'refund_confirmed' : 'paid'

  let row = claim as CostSyncClaim
  if (!alreadyClosed) {
    const now = new Date().toISOString()
    const payload: Record<string, unknown> = {
      status: toStatus,
      // ponytail: ทดลองจ่ายที่จ่ายไปแล้วในระบบคงวันที่จ่ายเดิม — ไม่ย้ายเดือนจ่ายย้อนหลังโดยไม่ตั้งใจ
      paid_at: claim.paid_at ?? opts.paidAt,
      paid_by: claim.paid_by ?? userId,
      cancelled_at: null,
      cancelled_by: null,
      reject_reason: null,
    }
    if (!claim.approved_by) payload.approved_by = userId
    if (!claim.approved_at) payload.approved_at = now
    if (!claim.submitted_at) payload.submitted_at = now
    if (isAdvance) {
      const amount = Number(claim.amount) || 0
      Object.assign(payload, {
        actual_spent_amount: Math.round((amount - refund) * 100) / 100,
        actual_spent_items: claim.actual_spent_items ?? [],
        refund_amount: refund,
        advance_settled_at: now,
        advance_settled_by: userId,
        ...(refund > 0 ? { refund_confirmed_at: now, refund_confirmed_by: userId } : {}),
      })
    }
    const written = await updateClaimFromStatus(supabase, id, fromStatus, payload)
    if (written.error) return fail('เกิดข้อผิดพลาดในการเปลี่ยนสถานะ', claimNumber)
    if (!written.row) return fail(STALE_STATUS_ERROR, claimNumber)
    row = written.row
  }
  const synced = await syncClaimCostItem(supabase, row, userId)

  await Promise.all([
    supabase.from('expense_claim_logs').insert({
      claim_id: id,
      action: 'close_external',
      changed_by: userId,
      changes: { status: { from: fromStatus, to: toStatus }, paid_at: claim.paid_at ?? opts.paidAt, refund_amount: refund },
      note: `[ปิดกับสำนักงานบัญชี] ${opts.reasonText}`,
    }),
    logActivity('CLOSE_CLAIM_EXTERNAL', {
      claimId: id,
      claimNumber,
      fromStatus,
      toStatus,
      paidDate: opts.paidDate,
      reason: opts.reasonText,
      refund,
      ...batchOf(ctx),
    }),
    claim.submitted_by && claim.submitted_by !== userId
      ? createNotifications({
        userIds: [claim.submitted_by],
        type: 'expense_approved',
        title: `ใบเบิก ${claimNumber} ถูกปิดเป็น "เคลียร์กับสำนักงานบัญชีแล้ว"`,
        body: opts.reasonText,
        referenceType: 'expense_claim',
        referenceId: id,
        actorId: userId,
      })
      : null,
  ])
  return done(synced, claimNumber)
}
