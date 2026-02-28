import { supabaseServer as supabase } from '@/lib/supabase-server'
import { getFinanceCategories } from '@/app/(authenticated)/finance/settings-actions'
import ReportsView from './reports-view'

export const revalidate = 0

export default async function CostsReportsPage() {
  const [
    { data: jobEvents },
    { data: activeEvents },
    { data: closedEvents },
    { data: imported },
    categories,
  ] = await Promise.all([
    supabase
      .from('job_cost_events')
      .select(`
        *,
        job_cost_items(*)
      `)
      .order('event_date', { ascending: false }),
    supabase.from('events').select('id, event_date'),
    supabase.from('event_closures').select('id, event_date'),
    supabase.from('job_cost_events').select('source_event_id'),
    getFinanceCategories(),
  ])

  const importedIds = (imported || []).map(e => e.source_event_id).filter((id): id is string => id !== null)

  return (
    <ReportsView
      jobEvents={jobEvents || []}
      activeEvents={activeEvents || []}
      closedEvents={closedEvents || []}
      importedIds={importedIds}
      categories={categories}
    />
  )
}
