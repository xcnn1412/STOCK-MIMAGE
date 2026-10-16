// ============================================================================
// ถังต้นทุน "โครงสร้าง/ผลิต" ของ lead — job_cost_events phase 'production'
//
// ใบเบิกที่สร้างจากรายการจัดซื้อของการ์ด CRM ไม่มีอีเวนต์ให้เกาะ แต่ต้นทุนต้องไปโผล่
// ที่หน้า lead / โหมด By CRM / กำไรขาดทุน ซึ่งทุกตัวรวมผ่าน job_cost_events.linked_lead_id
// → ใช้แถว job_cost_events แถวเดียวต่อ lead (phase 'production', revenue 0 จึงไม่ถูกเลือก
// เป็นตัวถือรายได้ใน revenue-attribution) เป็นที่เกาะ
//
// ไม่มี 'use server' — เป็น helper ที่ server action เรียกภายใน ไม่เปิดเป็น endpoint
// ============================================================================

import type { createServiceClient } from '@/lib/supabase-server'

type Db = ReturnType<typeof createServiceClient>

/** การ์ด CRM ที่รายการจัดซื้อเหล่านี้ผูกอยู่ — ต้องเป็นการ์ดเดียวกันทั้งหมด ไม่งั้น null */
export async function leadIdOfPurchaseItems(supabase: Db, itemIds: string[]): Promise<string | null> {
  if (itemIds.length === 0) return null
  const { data: items } = await supabase.from('purchase_items').select('id, list_id').in('id', itemIds)
  const listIds = [...new Set((items || []).map((r: { list_id: string }) => r.list_id))]
  if (listIds.length === 0) return null
  const { data: lists } = await supabase.from('purchase_lists').select('id, crm_lead_id').in('id', listIds)
  const leadIds = new Set((lists || []).map((l: { crm_lead_id: string | null }) => l.crm_lead_id))
  if (leadIds.size !== 1) return null
  const [leadId] = leadIds
  return leadId ?? null
}

/** job_cost_events phase 'production' ของ lead — มีแล้วคืน id เดิม ไม่มีสร้างให้ */
export async function ensureLeadProductionCostEvent(supabase: Db, leadId: string, userId: string | null): Promise<string | null> {
  const { data: existing } = await supabase
    .from('job_cost_events')
    .select('id')
    .eq('linked_lead_id', leadId)
    .eq('phase', 'production')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing?.id) return existing.id as string

  const { data: lead } = await supabase
    .from('crm_leads')
    .select('customer_name, event_location')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return null

  const { data: created, error } = await supabase
    .from('job_cost_events')
    .insert({
      event_name: `โครงสร้าง/ผลิต — ${(lead as { customer_name: string | null }).customer_name || 'ไม่ระบุลูกค้า'}`,
      event_location: (lead as { event_location: string | null }).event_location ?? null,
      linked_lead_id: leadId,
      phase: 'production',
      revenue: 0,
      imported_by: userId,
    })
    .select('id')
    .single()
  if (error || !created) return null
  return created.id as string
}

/** รวมสองขั้น: รายการจัดซื้อ → lead → ถังต้นทุน · ไม่มี lead หรือหลาย lead = null (ใบเบิกไม่ผูก) */
export async function costEventForPurchaseItems(supabase: Db, itemIds: string[], userId: string | null): Promise<string | null> {
  const leadId = await leadIdOfPurchaseItems(supabase, itemIds)
  return leadId ? ensureLeadProductionCostEvent(supabase, leadId, userId) : null
}
