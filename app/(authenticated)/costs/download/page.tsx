import { supabaseServer as supabase } from '@/lib/supabase-server'
import DownloadView from './download-view'

export const revalidate = 0

export default async function CostsDownloadPage() {
  const { data: jobEvents } = await supabase
    .from('job_cost_events')
    .select(`
      *,
      job_cost_items(*)
    `)
    .order('event_date', { ascending: false })

  return <DownloadView jobEvents={jobEvents || []} />
}
