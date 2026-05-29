import { supabaseServer as supabase } from '@/lib/supabase-server'
import EventsListView from './events-list-view'

export const revalidate = 0

export default async function CostsEventsPage() {
  const { data: jobEvents } = await supabase
    .from('job_cost_events')
    .select(`
      *,
      job_cost_items(id, category, amount, include_vat, vat_mode, withholding_tax_rate)
    `)
    .order('event_date', { ascending: false })

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
    <EventsListView
      jobEvents={events as any}
      leads={leadsRes.data || []}
      claims={claimsRes.data || []}
    />
  )
}
