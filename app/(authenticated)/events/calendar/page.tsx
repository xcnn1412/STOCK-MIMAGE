import { createServiceClient } from '@/lib/supabase-server'
import EventCalendarPage from './calendar-view'

export const metadata = {
  title: 'ปฏิทินอีเวนต์ — Events',
  description: 'ดูตารางอีเวนต์ทั้งหมดในรูปแบบปฏิทิน',
}

export default async function CalendarPage() {
  const supabase = createServiceClient()

  // ดึงจาก events (active) + event_closures (closed)
  const [eventsRes, closuresRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, name, event_date, location')
      .order('event_date', { ascending: false })
      .limit(300),
    supabase
      .from('event_closures')
      .select('id, event_name, event_date, event_location')
      .order('event_date', { ascending: false })
      .limit(300),
  ])

  const activeEvents = (eventsRes.data || []).map(e => ({
    id: e.id,
    event_name: e.name,
    event_date: e.event_date,
    event_location: e.location || null,
    status: 'active',
  }))

  const closedEvents = (closuresRes.data || []).map(e => ({
    id: `closure:${e.id}`,
    event_name: e.event_name,
    event_date: e.event_date,
    event_location: e.event_location || null,
    status: 'closed',
  }))

  const allEvents = [...activeEvents, ...closedEvents]

  return <EventCalendarPage events={allEvents} />
}
