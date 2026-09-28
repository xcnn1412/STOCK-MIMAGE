import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import {
  bangkokDay, buildLeadFinance, buildLockDates, isWonStatus,
  type CommissionLead, type LeadFinance, type StatusActivity,
} from '../commission-logic'
import CommissionView from './commission-view'

export const metadata = { title: 'สรุปค่าคอมแอดมิน — Sales Board' }
export const revalidate = 0

// ดึงทุกแถว (เลี่ยง limit 1000 ของ supabase) — แบบเดียวกับ sales-board/page.tsx
// คืน error ด้วย เพื่อให้ผู้เรียกรู้ว่าคอลัมน์ไม่มี (ยังไม่รัน migration)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function fetchAll(table: string, cols: string, filter?: (q: any) => any) {
  const supabase = createServiceClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = []
  let from = 0
  const step = 1000
  for (;;) {
    let q = supabase.from(table).select(cols).range(from, from + step - 1)
    if (filter) q = filter(q)
    const { data, error } = await q
    if (error) return { rows, error }
    if (!data) break
    rows.push(...data)
    if (data.length < step) break
    from += step
  }
  return { rows, error: null }
}

const LEAD_COLS = 'id, status, customer_name, customer_line, event_date, event_end_date, work_type, quotation_ref, created_at'

// อยู่ใต้ /sales-board → proxy.ts บังคับ module 'salesboard' แล้ว (prefix match)
export default async function CommissionPage() {
  const [leadRes, actRes, targetRes, settingRes, session] = await Promise.all([
    fetchAll('crm_leads', `${LEAD_COLS}, unit_count`),
    fetchAll('crm_activities', 'lead_id, created_at, new_status', (q) =>
      q.eq('activity_type', 'status_change').order('created_at', { ascending: true })),
    fetchAll('sales_board_targets', 'month, targets'),
    fetchAll('crm_settings', 'value, label_th', (q) => q.eq('category', 'kanban_status')),
    requireAuth(),
  ])

  // ทนต่อการยังไม่รัน migration 20260928 — ไม่มีคอลัมน์ unit_count = ทุกการ์ดนับเป็น 1 ตู้
  let unitCountAvailable = true
  let leadRows = leadRes.rows
  if (leadRes.error) {
    unitCountAvailable = false
    leadRows = (await fetchAll('crm_leads', LEAD_COLS)).rows.map((l) => ({ ...l, unit_count: null }))
  }

  const lockMap = buildLockDates(actRes.rows as StatusActivity[])
  // ส่งให้ client เฉพาะการ์ดที่สถานะปัจจุบันเป็น "ตอบรับแล้ว" + วันล็อคคิวของการ์ดเหล่านั้น
  const leads = (leadRows as CommissionLead[]).filter((l) => isWonStatus(l.status))
  const lockDates: Record<string, string> = {}
  for (const l of leads) {
    const d = lockMap.get(l.id)
    if (d) lockDates[l.id] = d
  }

  const targetStore: Record<string, Record<string, number>> = {}
  for (const r of targetRes.rows) targetStore[r.month] = r.targets || {}

  const statusLabels: Record<string, string> = {}
  for (const s of settingRes.rows) if (s.value && s.label_th) statusLabels[String(s.value).toLowerCase()] = s.label_th

  // วันนี้เวลาไทย — คำนวณฝั่ง server แล้วส่งเป็น prop (กัน hydration mismatch)
  const today = bangkokDay(new Date().toISOString())

  // สรุปการเงิน (ยอดขาย/ต้นทุน/รายจ่าย/กำไร) — เฉพาะ admin: คนอื่นไม่ถูกดึงและไม่ถูกส่งไป browser เลย
  const isAdmin = session?.role === 'admin'
  let finance: Record<string, LeadFinance> | null = null
  if (isAdmin) {
    const [priceRes, eventRes, itemRes, claimRes] = await Promise.all([
      fetchAll('crm_leads', 'id, confirmed_price, quoted_price'),
      fetchAll('job_cost_events', 'id, linked_lead_id', (q) => q.not('linked_lead_id', 'is', null)),
      fetchAll('job_cost_items', 'job_event_id, amount, notes'),
      fetchAll('expense_claims', 'id, job_event_id, claim_type, status, amount, actual_spent_amount', (q) =>
        q.not('job_event_id', 'is', null)),
    ])
    const wonIds = new Set(leads.map((l) => l.id))
    finance = buildLeadFinance({
      leads: priceRes.rows.filter((l) => wonIds.has(l.id)),
      events: eventRes.rows, costItems: itemRes.rows, claims: claimRes.rows,
    })
  }

  return (
    <CommissionView
      leads={leads} lockDates={lockDates} today={today}
      initialTargets={targetStore} statusLabels={statusLabels}
      isAdmin={isAdmin} unitCountAvailable={unitCountAvailable} finance={finance}
    />
  )
}
