import { supabaseServer as supabase } from '@/lib/supabase-server'
import { getFinanceCategories } from '@/app/(authenticated)/finance/settings-actions'
import DashboardView from './dashboard-view'

export const revalidate = 0

export default async function CostsDashboardPage() {
  const [{ data: jobEvents }, categories] = await Promise.all([
    supabase
      .from('job_cost_events')
      .select(`
        *,
        job_cost_items(*)
      `)
      .order('event_date', { ascending: false }),
    getFinanceCategories(),
  ])

  const events = jobEvents || []
  // Leads + claims power the "By CRM" toggle and the revenue dedup.
  const leadIds = [...new Set(events.map((e: { linked_lead_id?: string | null }) => e.linked_lead_id).filter(Boolean))] as string[]
  const eventIds = events.map((e: { id: string }) => e.id)

  const [leadsRes, claimsRes] = await Promise.all([
    leadIds.length
      ? supabase.from('crm_leads').select('id, customer_name, package_name, confirmed_price, quoted_price, vat_mode, wht_rate, status').in('id', leadIds)
      : Promise.resolve({ data: [] }),
    eventIds.length
      ? supabase.from('expense_claims').select('id, job_event_id, claim_type, status, amount, actual_spent_amount').in('job_event_id', eventIds)
      : Promise.resolve({ data: [] }),
  ])

  return (
    <DashboardView
      jobEvents={events}
      categories={categories}
      leads={leadsRes.data || []}
      claims={claimsRes.data || []}
    />
  )
}
