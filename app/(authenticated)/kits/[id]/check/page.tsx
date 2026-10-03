import { supabaseServer as supabase } from '@/lib/supabase-server'
import CheckFlow from './check-flow'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ArrowLeft } from "lucide-react"
import { loadBookingsForKits } from '@/lib/kit-bookings'
import { getStockUser } from '@/lib/stock'

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
  // หน้านี้เปิดได้ทั้งคนที่มีสิทธิ์อีเวนต์หรือสต็อก — ลิงก์ไป /kits/<id> เฉพาะคนที่มีสิทธิ์สต็อก
  const stockUser = await getStockUser()
  const kitHref = `/kits/${kit.id}`
  const backHref = stockUser ? kitHref : '/events'

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="max-w-md mx-auto mb-4 flex items-center gap-4">
            <Link href={backHref}>
                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4"/></Button>
            </Link>
            <h1 className="text-xl font-bold min-w-0 wrap-break-word">จัดกระเป๋า {kit.name}</h1>
        </div>
      {events.length === 0 ? (
        <Card className="max-w-md mx-auto">
          <CardContent className="p-6 space-y-3 text-center">
            <p className="font-medium">ยังไม่ได้จองให้งานไหน</p>
            <p className="text-sm text-muted-foreground">จองกระเป๋าใบนี้ให้งานได้จากฟอร์มอีเวนต์ หรือจากพูลงาน แล้วสแกนอีกครั้งเพื่อนำออก / รับคืน</p>
            <div className="flex flex-wrap justify-center gap-2 pt-1">
              <Link href="/events"><Button variant="outline" className="min-h-10">ไปหน้าอีเวนต์</Button></Link>
              {stockUser && <Link href={kitHref}><Button variant="outline" className="min-h-10">ดูกระเป๋า</Button></Link>}
            </div>
          </CardContent>
        </Card>
      ) : (
      <CheckFlow
        kit={kit}
        contents={contents || []}
        events={events}
        initialEventId={initialEventId}
        initialPacked={events.find(e => e.id === initialEventId)?.packed ?? false}
      />
      )}
    </div>
  )
}
