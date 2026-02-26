import { supabaseServer as supabase } from '@/lib/supabase-server'
import { redirect } from 'next/navigation'
import EventCostDetailView from './event-cost-detail-view'

export const revalidate = 0

export default async function EventCostDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: jobEvent } = await supabase
    .from('job_cost_events')
    .select(`
      *,
      job_cost_items(*)
    `)
    .eq('id', id)
    .single()

  if (!jobEvent) redirect('/costs/events')

  return <EventCostDetailView jobEvent={jobEvent as any} />
}
