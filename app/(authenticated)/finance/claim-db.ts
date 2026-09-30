// ============================================================================
// ตัวช่วยฝั่ง server ของใบเบิก — ใช้ร่วมกันโดย actions.ts, lifecycle-actions.ts และ queue-data.ts เท่านั้น
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
