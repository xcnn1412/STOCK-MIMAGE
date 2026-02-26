import { supabase } from '@/lib/supabase'
import ReportsView from './reports-view'

export const revalidate = 0

export default async function CostsReportsPage() {
  const { data: jobEvents } = await supabase
    .from('job_cost_events')
    .select(`
      *,
      job_cost_items(*)
    `)
    .order('event_date', { ascending: false })

  // ดึงจำนวน events ที่ยังเปิดอยู่
  const { data: activeEvents } = await supabase
    .from('events')
    .select('id, event_date')

  // ดึงจำนวน closures
  const { data: closedEvents } = await supabase
    .from('event_closures')
    .select('id, event_date')

  // ดึง imported IDs
  const { data: imported } = await supabase
    .from('job_cost_events')
    .select('source_event_id')

  const importedIds = (imported || []).map(e => e.source_event_id).filter((id): id is string => id !== null)

  return (
    <ReportsView
      jobEvents={jobEvents || []}
      activeEvents={activeEvents || []}
      closedEvents={closedEvents || []}
      importedIds={importedIds}
    />
  )
}
