import { supabase } from '@/lib/supabase'
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { CalendarDays, MapPin, Plus } from "lucide-react"

export const revalidate = 0

export default async function EventsPage() {
  const { data: events } = await supabase.from('events').select('*').order('event_date', { ascending: false })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Events</h2>
        <Link href="/events/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Create Event
          </Button>
        </Link>
      </div>
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {events?.map((event) => (
          <Card key={event.id}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-zinc-500" />
                {event.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-zinc-500">
                    <MapPin className="h-4 w-4" />
                    {event.location}
                </div>
                <div className="font-medium">
                    {new Date(event.event_date).toLocaleDateString()} {new Date(event.event_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
                <div className="capitalize px-2 py-1 bg-zinc-100 dark:bg-zinc-800 rounded w-fit text-xs">
                    {event.status || 'Scheduled'}
                </div>
              </div>
              <div className="flex gap-2 mt-4 pt-4 border-t">
                  <Link href={`/events/${event.id}/edit`} className="flex-1">
                      <Button variant="outline" size="sm" className="w-full">Edit</Button>
                  </Link>
                  <Link href={`/events/${event.id}/return`} className="flex-1">
                      <Button variant="default" size="sm" className="w-full bg-green-600 hover:bg-green-700">Return</Button>
                  </Link>
              </div>
            </CardContent>
          </Card>
        ))}
        {(!events || events.length === 0) && (
            <div className="col-span-full text-center text-zinc-500 py-12 border rounded-lg border-dashed">
                No events found.
            </div>
        )}
      </div>
    </div>
  )
}
