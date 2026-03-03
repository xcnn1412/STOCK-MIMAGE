'use client'

import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import EventCalendar, { type CalendarEvent } from '@/components/event-calendar'
import { useLocale } from '@/lib/i18n/context'

export default function EventCalendarPage({ events }: { events: CalendarEvent[] }) {
  const router = useRouter()
  const { locale } = useLocale()
  const isEn = locale === 'en'

  const handleSelect = (event: CalendarEvent) => {
    // Navigate to event detail (only for active events)
    if (!event.id.startsWith('closure:')) {
      router.push(`/events/${event.id}`)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/events')}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {isEn ? 'Event Calendar' : 'ปฏิทินอีเวนต์'}
          </h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {isEn
              ? `${events.length} events total`
              : `ทั้งหมด ${events.length} อีเวนต์`
            }
          </p>
        </div>
      </div>

      <EventCalendar
        events={events}
        onSelect={handleSelect}
        locale={locale}
        mode="view"
      />
    </div>
  )
}
