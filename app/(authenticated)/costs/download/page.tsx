import { supabaseServer as supabase } from '@/lib/supabase-server'
import { getFinanceCategories } from '@/app/(authenticated)/finance/settings-actions'
import DownloadView from './download-view'

export const revalidate = 0

export default async function CostsDownloadPage() {
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

  return <DownloadView jobEvents={jobEvents || []} categories={categories} />
}
