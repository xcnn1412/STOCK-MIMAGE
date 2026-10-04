// ตัวโหลดข้อมูลของหน้า /sales-board/commission — ใช้ร่วมกันระหว่าง commission/page.tsx และ tool commission_summary ของ MCP
// ไม่มี 'use server' / JSX / next/* → import จาก lib/mcp-tools.ts ได้ · รับ db เพื่อให้สคริปต์ตรวจใส่ Supabase จำลองได้

import { createServiceClient } from '@/lib/supabase-server'
import type { ClaimLite } from '../costs/lib/crm-cost-grouping'
import {
  bangkokDay, buildLeadFinance, buildLockDates, isWonStatus,
  type CommissionLead, type FinanceCostItem, type FinanceEvent, type FinanceLead, type LeadFinance, type StatusActivity,
} from './commission-logic'
import { fetchAll } from './sales-data'

type Db = ReturnType<typeof createServiceClient>

const LEAD_COLS = 'id, status, customer_name, customer_line, event_date, event_end_date, work_type, quotation_ref, created_at'

export interface CommissionData {
  /** เฉพาะการ์ดที่สถานะปัจจุบันเป็น "ตอบรับแล้ว" */
  leads: CommissionLead[]
  /** lead_id → วันล็อคคิว (ไม่มี = ไม่มีประวัติ ใช้วันสร้างการ์ด) */
  lockDates: Record<string, string>
  /** YYYY-MM-DD เวลาไทย */
  today: string
  initialTargets: Record<string, Record<string, number>>
  /** สถานะ (ตัวพิมพ์เล็ก) → ป้ายไทยจาก crm_settings */
  statusLabels: Record<string, string>
  unitCountAvailable: boolean
  /** lead_id → ตัวเลขการเงิน · null = ไม่ใช่ admin (ไม่ถูกดึงเลย) */
  finance: Record<string, LeadFinance> | null
}

/** props ทั้งหมดที่ CommissionView ได้รับ (ยกเว้น isAdmin ที่หน้าใส่เอง) — กติกาเดิมของ commission/page.tsx ทุกตัว */
export async function loadCommissionData(isAdmin: boolean, db: Db = createServiceClient()): Promise<CommissionData> {
  const [leadRes, actRes, targetRes, settingRes] = await Promise.all([
    fetchAll<CommissionLead>(db, 'crm_leads', `${LEAD_COLS}, unit_count`),
    fetchAll<StatusActivity>(db, 'crm_activities', 'lead_id, created_at, new_status', (q) =>
      q.eq('activity_type', 'status_change').order('created_at', { ascending: true })),
    fetchAll<{ month: string; targets: Record<string, number> | null }>(db, 'sales_board_targets', 'month, targets'),
    fetchAll<{ value: string | null; label_th: string | null }>(db, 'crm_settings', 'value, label_th', (q) => q.eq('category', 'kanban_status')),
  ])

  // ทนต่อการยังไม่รัน migration 20260928 — ไม่มีคอลัมน์ unit_count = ทุกการ์ดนับเป็น 1 ตู้
  let unitCountAvailable = true
  let leadRows = leadRes.rows
  if (leadRes.error) {
    unitCountAvailable = false
    leadRows = (await fetchAll<Omit<CommissionLead, 'unit_count'>>(db, 'crm_leads', LEAD_COLS)).rows.map((l) => ({ ...l, unit_count: null }))
  }

  const lockMap = buildLockDates(actRes.rows)
  // ส่งให้ client เฉพาะการ์ดที่สถานะปัจจุบันเป็น "ตอบรับแล้ว" + วันล็อคคิวของการ์ดเหล่านั้น
  const leads = leadRows.filter((l) => isWonStatus(l.status))
  const lockDates: Record<string, string> = {}
  for (const l of leads) {
    const d = lockMap.get(l.id)
    if (d) lockDates[l.id] = d
  }

  const initialTargets: Record<string, Record<string, number>> = {}
  for (const r of targetRes.rows) initialTargets[r.month] = r.targets || {}

  const statusLabels: Record<string, string> = {}
  for (const s of settingRes.rows) if (s.value && s.label_th) statusLabels[String(s.value).toLowerCase()] = s.label_th

  // วันนี้เวลาไทย — คำนวณฝั่ง server แล้วส่งเป็น prop (กัน hydration mismatch)
  const today = bangkokDay(new Date().toISOString())

  // สรุปการเงิน (ยอดขาย/ต้นทุน/รายจ่าย/กำไร) — เฉพาะ admin: คนอื่นไม่ถูกดึงและไม่ถูกส่งไป browser เลย
  let finance: Record<string, LeadFinance> | null = null
  if (isAdmin) {
    const [priceRes, eventRes, itemRes, claimRes] = await Promise.all([
      fetchAll<FinanceLead>(db, 'crm_leads', 'id, confirmed_price, quoted_price'),
      fetchAll<FinanceEvent>(db, 'job_cost_events', 'id, linked_lead_id', (q) => q.not('linked_lead_id', 'is', null)),
      fetchAll<FinanceCostItem>(db, 'job_cost_items', 'job_event_id, amount, notes'),
      fetchAll<ClaimLite>(db, 'expense_claims', 'id, job_event_id, claim_type, status, amount, actual_spent_amount', (q) =>
        q.not('job_event_id', 'is', null)),
    ])
    const wonIds = new Set(leads.map((l) => l.id))
    finance = buildLeadFinance({
      leads: priceRes.rows.filter((l) => wonIds.has(l.id)),
      events: eventRes.rows, costItems: itemRes.rows, claims: claimRes.rows,
    })
  }

  return { leads, lockDates, today, initialTargets, statusLabels, unitCountAvailable, finance }
}
