import { supabase } from '@/lib/supabase'
import ImportView from './import-view'

export const revalidate = 0

export default async function CostsImportPage() {
  // ดึง Events ที่ยังเปิดอยู่
  const { data: events } = await supabase
    .from('events')
    .select('id, name, event_date, location, staff, status')
    .order('event_date', { ascending: false })

  // ดึง Event Closures (งานที่ปิดแล้ว)
  const { data: closures } = await supabase
    .from('event_closures')
    .select('id, event_name, event_date, event_location, closed_at')
    .order('closed_at', { ascending: false })

  // ดึง job_cost_events เพื่อเช็คว่า import แล้วหรือยัง
  const { data: imported } = await supabase
    .from('job_cost_events')
    .select('source_event_id')

  const importedEventIds = new Set((imported || []).map(e => e.source_event_id).filter(Boolean))

  return (
    <ImportView
      events={(events || []) as any}
      closures={closures || []}
      importedEventIds={Array.from(importedEventIds) as string[]}
    />
  )
}
