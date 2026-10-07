// ─────────────────────────────────────────────────────────────────────────────
// ตัวช่วยฝั่งเซิร์ฟเวอร์ — ไม่ใช่ endpoint
// ตั้งใจไม่ประกาศไฟล์นี้เป็น server action: ถ้าประกาศ ทุกฟังก์ชันที่ export จะกลายเป็นปลายทาง
// ที่ใครก็ยิงผ่านเครือข่ายได้โดยไม่ต้องล็อกอิน (สร้างแจ้งเตือนให้ใครก็ได้ ในนามใครก็ได้)
// ไฟล์นี้ถือ service-role client (ข้าม RLS) → ห้าม import จาก client component เด็ดขาด
// ผู้เรียก (server action / server component) ต้องตรวจการล็อกอินและสิทธิ์เองก่อนเรียกทุกครั้ง
// ─────────────────────────────────────────────────────────────────────────────

import { createServiceClient } from '@/lib/supabase-server'

// ============================================================================
// Types
// ============================================================================

export type NotificationType =
  | 'job_assigned'
  | 'job_status_changed'
  | 'job_mentioned'
  | 'job_comment'
  | 'job_pool_new'          // ใบงานใหม่เข้าพูลงาน → แจ้งสมาชิกแผนกของฝ่ายนั้น
  // ความเคลื่อนไหวของใบงานในพูล (reference_type = 'job') — กระดิ่งพาไป /jobs/tracking?job=<id>
  | 'job_pool_claimed'
  | 'job_pool_released'
  | 'job_pool_skipped'
  | 'job_pool_assigned'
  // จัดซื้อ (reference_type = 'job', reference_id = id เช็กลิสต์) — กระดิ่งพาไป /jobs/purchasing?list=<id>
  | 'job_purchase_assigned'   // ถูกมอบหมายรายการจัดซื้อ
  | 'job_purchase_done'       // ทุกรายการในเช็กลิสต์เสร็จครบ → ผู้รับผิดชอบ + คนสร้างเช็กลิสต์
  // รับ/คืนหน้าที่เตรียมงาน (reference_type = 'crm_lead') — กระดิ่งพาไป /jobs/tracking?lead=<id>
  | 'duty_claimed'
  | 'duty_released'
  | 'ticket_assigned'
  | 'ticket_reply'
  | 'ticket_mentioned'
  | 'ticket_status_changed'
  | 'expense_submitted'     // มีใบเบิกยื่นขออนุมัติ → แอดมินทุกคน
  | 'expense_paid'          // จ่ายเงินแล้ว → ผู้เบิก
  | 'expense_approved'
  | 'expense_rejected'
  | 'expense_waiting_tax_invoice'
  | 'expense_tax_invoice_uploaded'
  | 'expense_refund_confirmed'
  | 'expense_sent_back'     // แอดมินส่งใบกลับให้แก้ (พร้อมเหตุผล) → ผู้เบิก
  | 'expense_hidden'        // แอดมินซ่อนใบเบิก → ผู้เบิก
  | 'kpi_evaluated'
  | 'kpi_self_evaluated'
  | 'kpi_evaluation_reply'
  | 'crm_mentioned'
  | 'doc_pending_approval'
  | 'doc_approved'
  | 'doc_rejected'
  | 'doc_voided'
  | 'salary_finalized'
  | 'salary_reopened'
  // ใบจัดของ (คลังอุปกรณ์)
  | 'packing_requested'     // งานตอบรับแล้วมีแพ็กเกจ → ทีมจัดของ (reference_type = 'crm_lead') — กระดิ่งพาไป /jobs/tracking?tab=kits&lead=<id>
  | 'packing_ready'         // ใบจัดของพร้อมรับ → หัวหน้างาน + คนในอีเวนต์ (reference_type = 'packing_list') — กระดิ่งพาไป /packing/<id>
  | 'packing_returned'      // ทีมหน้างานคืนของแล้ว → ทีมจัดของ (reference_type = 'packing_list') — กระดิ่งพาไป /packing/<id>

export type ReferenceType =
  | 'job' | 'ticket' | 'expense_claim' | 'kpi_evaluation' | 'crm_lead' | 'document' | 'salary_slip' | 'packing_list'

interface CreateNotificationParams {
  userIds: string[]
  type: NotificationType
  title: string
  body?: string
  referenceType: ReferenceType
  referenceId: string
  actorId: string
}

// ============================================================================
// Create Notifications (batch insert, skip self-notification)
// ============================================================================

export async function createNotifications(params: CreateNotificationParams) {
  const { userIds, type, title, body, referenceType, referenceId, actorId } = params

  // Filter out: actor (don't notify self) + duplicates + nulls
  const recipients = [...new Set(userIds.filter(id => id && id !== actorId))]
  if (recipients.length === 0) return

  const supabase = createServiceClient()

  const rows = recipients.map(userId => ({
    user_id: userId,
    type,
    title,
    body: body || null,
    reference_type: referenceType,
    reference_id: referenceId,
    actor_id: actorId,
  }))

  const { error } = await supabase.from('notifications').insert(rows)
  if (error) {
    console.error('[Notifications] Failed to create:', error.message)
  }
}
