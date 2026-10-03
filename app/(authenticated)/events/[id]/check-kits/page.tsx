import { supabaseServer as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import CheckKitsView from './check-kits-view'
import type { Kit } from '@/types'

export default async function EventKitsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // กระเป๋าของอีเวนต์นี้ = การจอง (event_kits) พร้อมสถานะจัดครบ
  const { data: booked } = await supabase
    .from('event_kits')
    .select('packed_at, kits(*)')
    .eq('event_id', event.id)
  const kits = ((booked || []) as unknown as { packed_at: string | null; kits: Kit | null }[])
    .filter(b => b.kits)
    .map(b => ({ ...(b.kits as Kit), packed: !!b.packed_at }))
    .sort((a, b) => a.name.localeCompare(b.name))

  return <CheckKitsView event={event} kits={kits} />
}
