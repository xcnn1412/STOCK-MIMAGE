import { supabaseServer as supabase } from '@/lib/supabase-server'
import CheckFlow from './check-flow'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import { loadBookingsForKits } from '@/lib/kit-bookings'

export default async function CheckPage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ eventId?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { data: kit } = await supabase.from('kits').select('*').eq('id', params.id).single()
  
  if (!kit) notFound()

  const { data: contents } = await supabase.from('kit_contents').select('*, items(*)').eq('kit_id', params.id)

  // อีเวนต์ให้เลือก = งานที่ยังไม่ปิดและจองกระเป๋าใบนี้ไว้ (event_kits) เรียงตามวันงาน
  const bookings = (await loadBookingsForKits(supabase, [params.id])).filter(b => !b.closed)
  const events = bookings
    .map(b => ({ id: b.eventId, name: b.eventName, event_date: b.eventDate, packed: b.packed }))
    .sort((a, b) => (a.event_date ?? '').localeCompare(b.event_date ?? ''))
  const initialEventId = events.some(e => e.id === searchParams.eventId) ? searchParams.eventId : events[0]?.id

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="max-w-md mx-auto mb-4 flex items-center gap-4">
            <Link href={`/kits/${kit.id}`}>
                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4"/></Button>
            </Link>
            <h1 className="text-xl font-bold">{kit.name} Check</h1>
        </div>
      <CheckFlow
        kit={kit}
        contents={contents || []}
        events={events}
        initialEventId={initialEventId}
        initialPacked={events.find(e => e.id === initialEventId)?.packed ?? false}
      />
    </div>
  )
}
