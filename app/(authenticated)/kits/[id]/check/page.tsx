import { supabase } from '@/lib/supabase'
import CheckFlow from './check-flow'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export default async function CheckPage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ eventId?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { data: kit } = await supabase.from('kits').select('*').eq('id', params.id).single()
  
  if (!kit) notFound()

  const { data: contents } = await supabase.from('kit_contents').select('*, items(*)').eq('kit_id', params.id)
  
  // Fetch active/upcoming events
  // Assuming 'status' is relevant or just sorting by date descending
  const { data: events } = await supabase
    .from('events')
    .select('*')
    .order('event_date', { ascending: false })
    .limit(20)

  // Back link: if came from an event, go back to that event's check-kits page
  const backUrl = searchParams.eventId 
    ? `/events/${searchParams.eventId}/check-kits`
    : '/events'

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4">
        <div className="max-w-md mx-auto mb-4 flex items-center gap-4">
            <Link href={backUrl}>
                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4"/></Button>
            </Link>
            <h1 className="text-xl font-bold">{kit.name} Check</h1>
        </div>
      <CheckFlow kit={kit} contents={contents || []} events={events || []} initialEventId={searchParams.eventId} />
    </div>
  )
}

