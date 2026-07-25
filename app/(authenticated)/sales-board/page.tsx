import { createServiceClient } from '@/lib/supabase-server'
import SalesBoardView from './sales-board-view'

export const metadata = { title: 'สรุปยอดขาย — Sales Board' }
export const revalidate = 0

// ดึงทุกแถว (เลี่ยง limit 1000 ของ supabase) — leads มี ~1.2k แถว
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
    if (error || !data) break
    rows.push(...data)
    if (data.length < step) break
    from += step
  }
  return rows
}

// หน้านี้อยู่ใต้ (authenticated) → ผ่าน session gate แล้ว และไม่อยู่ใน MODULE_ROUTES
// ของ proxy.ts → ทุก user ที่ล็อกอินเข้าถึงได้ (ตามที่ขอ: ทุก user ใช้งานได้)
export default async function SalesBoardPage() {
  const [leads, claims, installments, jobEvents, costItems, targetRows, settings, statusActs] = await Promise.all([
    fetchAll('crm_leads', 'id, status, customer_name, confirmed_price, quoted_price, deposit, vat_mode, wht_rate, event_date, created_at, assigned_sales, package_name, work_type'),
    fetchAll('expense_claims', 'id, job_event_id, claim_type, category, amount, actual_spent_amount, status, vat_mode, withholding_tax_rate, expense_date, created_at'),
    fetchAll('crm_lead_installments', 'lead_id, amount, is_paid, due_date, paid_date'),
    fetchAll('job_cost_events', 'id, linked_lead_id, event_date'),
    fetchAll('job_cost_items', 'job_event_id, amount'),
    fetchAll('sales_board_targets', 'month, targets'),
    fetchAll('crm_settings', 'category, value, label_th'),
    fetchAll('crm_activities', 'lead_id, created_at, new_status', (q) =>
      q.eq('activity_type', 'status_change').order('created_at', { ascending: true })),
  ])

  // วันปิดดีลจริงต่อ lead = status_change → accepted/success ครั้งแรก (แปลงเป็นวันที่ไทย)
  // ใช้เฉพาะการ์ด "ดีลที่ปิดได้" — การ์ดอื่นนับตามเดือนที่สร้างลีด (KPI ทีมขาย)
  const firstClose = new Map<string, string>()
  for (const a of statusActs) {
    const ns = (a.new_status || '').toLowerCase()
    if ((ns === 'accepted' || ns === 'success') && !firstClose.has(a.lead_id))
      firstClose.set(a.lead_id, new Date(a.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }))
  }
  const leadsWithClose = leads.map((l) => ({ ...l, closed_at: firstClose.get(l.id) || null }))

  // เป้าหมายใช้ร่วมกัน: { 'YYYY-MM': { sales: n, ... } }
  const targetStore: Record<string, Record<string, number>> = {}
  for (const r of targetRows) targetStore[r.month] = r.targets || {}

  // map ค่า package_name → ชื่อ "ระบบที่ใช้บริการ" (crm_settings category=package)
  const packageLabels: Record<string, string> = {}
  for (const s of settings) if (s.category === 'package') packageLabels[s.value] = s.label_th

  return (
    <SalesBoardView
      leads={leadsWithClose as never} claims={claims as never} installments={installments as never}
      jobEvents={jobEvents as never} costItems={costItems as never}
      initialTargets={targetStore} packageLabels={packageLabels}
    />
  )
}
