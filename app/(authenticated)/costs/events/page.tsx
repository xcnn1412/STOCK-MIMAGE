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

  return <EventsListView jobEvents={(jobEvents || []) as any} />
}
