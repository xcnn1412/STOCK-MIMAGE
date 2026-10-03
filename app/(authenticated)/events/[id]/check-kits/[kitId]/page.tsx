import { supabaseServer as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"
import CheckFlow from '@/app/(authenticated)/kits/[id]/check/check-flow'

// เช็คของ / จัดกระเป๋า ของกระเป๋าหนึ่งใบในอีเวนต์หนึ่ง — อยู่ใต้ /events จึงใช้สิทธิ์โมดูลอีเวนต์ (ไม่ต้องมีสิทธิ์ stock)
export default async function EventKitCheckPage(props: { params: Promise<{ id: string; kitId: string }> }) {
  const { id, kitId } = await props.params

  const [{ data: event }, { data: kit }, { data: booking }, { data: contents }] = await Promise.all([
    supabase.from('events').select('id, name, event_date').eq('id', id).single(),
    supabase.from('kits').select('*').eq('id', kitId).single(),
    supabase.from('event_kits').select('packed_at').eq('event_id', id).eq('kit_id', kitId).maybeSingle(),
    supabase.from('kit_contents').select('*, items(*)').eq('kit_id', kitId),
  ])
  // กระเป๋าต้องถูกจองให้อีเวนต์นี้
  if (!event || !kit || !booking) notFound()

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4">
      <div className="max-w-md mx-auto mb-4 flex items-center gap-4">
        <Link href={`/events/${id}/check-kits`}>
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-xl font-bold">{kit.name}</h1>
          <p className="text-sm text-muted-foreground">{event.name}</p>
        </div>
      </div>
      <CheckFlow
        kit={kit}
        contents={contents || []}
        events={[event]}
        initialEventId={event.id}
        initialPacked={!!booking.packed_at}
        lockEvent
      />
    </div>
  )
}
