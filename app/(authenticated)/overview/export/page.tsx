import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import ExportView from './export-view'

export const metadata = { title: 'ส่งออกข้อมูลเพื่อวิเคราะห์ด้วย AI' }
export const revalidate = 0

// ดึงทุกแถว (เลี่ยง limit 1000 ของ supabase)
async function fetchAll(table: string, cols: string) {
  const supabase = createServiceClient()
  const rows: any[] = []
  let from = 0
  const step = 1000
  for (;;) {
    const { data, error } = await supabase.from(table).select(cols).range(from, from + step - 1)
    if (error || !data) break
    rows.push(...data)
    if (data.length < step) break
    from += step
  }
  return rows
}

export default async function ExportPage() {
  const role = (await cookies()).get('session_role')?.value || 'staff'
  if (role !== 'admin') redirect('/dashboard')

  const [leads, claims, jobEvents, costItems, installments, profiles] = await Promise.all([
    fetchAll('crm_leads', 'id, status, customer_name, customer_phone, customer_line, customer_type, lead_source, confirmed_price, quoted_price, deposit, vat_mode, wht_rate, event_date, event_end_date, event_location, package_name, assigned_sales, is_returning, created_at, archived_at'),
    fetchAll('expense_claims', 'id, claim_number, job_event_id, claim_type, category, title, amount, total_amount, actual_spent_amount, status, vat_mode, include_vat, withholding_tax_rate, expense_date, created_at, paid_at, submitted_by, funding_source'),
    fetchAll('job_cost_events', 'id, linked_lead_id, source_event_id, event_name, event_date, revenue, status, phase, seller, created_at'),
    fetchAll('job_cost_items', 'id, job_event_id, category, description, amount, unit_price, quantity, vat_mode, withholding_tax_rate, cost_date, notes, created_at'),
    fetchAll('crm_lead_installments', 'lead_id, installment_number, amount, due_date, is_paid, paid_date'),
    fetchAll('profiles', 'id, full_name, nickname'),
  ])

  return (
    <ExportView
      leads={leads} claims={claims} jobEvents={jobEvents}
      costItems={costItems} installments={installments} profiles={profiles}
    />
  )
}
