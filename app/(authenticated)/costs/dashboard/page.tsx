import { supabaseServer as supabase } from '@/lib/supabase-server'
import DashboardView from './dashboard-view'

export const revalidate = 0

export default async function CostsDashboardPage() {
  // ดึง job events ทั้งหมดพร้อม cost items
  const { data: jobEvents } = await supabase
    .from('job_cost_events')
    .select(`
      *,
      job_cost_items(*)
    `)
    .order('event_date', { ascending: false })

  return <DashboardView jobEvents={jobEvents || []} />
}
