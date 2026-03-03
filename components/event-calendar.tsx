'use client'

import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, Calendar, MapPin, Clock, ExternalLink, Briefcase } from 'lucide-react'
import Link from 'next/link'

export interface CalendarEvent {
  id: string
  event_name: string
  event_date: string | null
  event_location?: string | null
  status?: string
}

const CLOSED_STATUSES = ['completed', 'closed', 'cancelled']

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const MONTH_NAMES_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const DAY_NAMES_TH = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']
const DAY_NAMES_EN = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  const day = new Date(year, month, 1).getDay()
  // Convert Sunday=0 to Monday-first: Mon=0, Sun=6
  return day === 0 ? 6 : day - 1
}

function toDateKey(d: string | null) {
  if (!d) return ''
  return d.split('T')[0]
}

export default function EventCalendar({
  events,
  onSelect,
  selectedId,
  locale = 'th',
  mode = 'view',
}: {
  events: CalendarEvent[]
  onSelect?: (event: CalendarEvent) => void
  selectedId?: string
  locale?: string
  mode?: 'view' | 'picker'
}) {
  const isEn = locale === 'en'
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const monthNames = isEn ? MONTH_NAMES_EN : MONTH_NAMES_TH
  const dayNames = isEn ? DAY_NAMES_EN : DAY_NAMES_TH
  const displayYear = isEn ? year : year + 543

  // Group events by date
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {}
    for (const e of events) {
      const key = toDateKey(e.event_date)
      if (!key) continue
      if (!map[key]) map[key] = []
      map[key].push(e)
    }
    return map
  }, [events])

  // Calendar grid
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const prev = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }
  const next = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  const today = now.toISOString().split('T')[0]

  // Events for selected date
  const selectedDateEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(isEn ? 'en-GB' : 'th-TH', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: isEn ? 'numeric' : undefined,
    })
  }

  return (
    <div className="w-full">
      {/* Month Navigation */}
      <div className="flex items-center justify-between mb-4">
        <button
          type="button"
          onClick={prev}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <h3 className="text-xl font-semibold text-zinc-900 dark:text-zinc-100">
          {monthNames[month]} {displayYear}
        </h3>
        <button
          type="button"
          onClick={next}
          className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayNames.map(d => (
          <div key={d} className="text-center text-sm font-medium text-zinc-400 py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-px bg-zinc-200 dark:bg-zinc-700 rounded-lg overflow-hidden">
        {/* Empty cells before first day */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`empty-${i}`} className={`bg-zinc-50 dark:bg-zinc-900 ${mode === 'view' ? 'min-h-[80px]' : 'min-h-[48px]'}`} />
        ))}

        {/* Day cells */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayEvents = eventsByDate[dateKey] || []
          const hasActive = dayEvents.some(e => !CLOSED_STATUSES.includes(e.status || ''))
          const hasClosed = dayEvents.some(e => CLOSED_STATUSES.includes(e.status || ''))
          const isToday = dateKey === today
          const isSelected = dateKey === selectedDate

          return (
            <button
              key={day}
              type="button"
              onClick={() => setSelectedDate(dateKey === selectedDate ? null : dateKey)}
              className={`
                bg-white dark:bg-zinc-900 ${mode === 'view' ? 'min-h-[80px]' : 'min-h-[48px]'} p-1 flex flex-col items-center justify-start
                transition-colors relative
                ${isSelected ? 'bg-emerald-50 dark:bg-emerald-950/30 ring-2 ring-emerald-500 ring-inset' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800'}
                ${dayEvents.length > 0 ? 'cursor-pointer' : 'cursor-default'}
              `}
            >
              <span className={`
                text-base leading-none w-8 h-8 flex items-center justify-center rounded-full
                ${isToday ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold' : ''}
                ${isSelected && !isToday ? 'font-semibold text-emerald-600' : ''}
              `}>
                {day}
              </span>
              {/* Event count badge */}
              {dayEvents.length > 0 && (
                <div className="flex flex-col items-center gap-0.5 mt-1">
                  <div className="flex items-center gap-0.5">
                    {hasActive && <span className="h-2 w-2 rounded-full bg-emerald-500" />}
                    {hasClosed && <span className="h-2 w-2 rounded-full bg-zinc-400" />}
                  </div>
                  <span className={`
                    text-[11px] font-semibold leading-none px-1.5 py-0.5 rounded-full
                    ${dayEvents.length >= 4
                      ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400'
                      : 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
                    }
                  `}>
                    {dayEvents.length} {mode === 'view' ? (isEn ? 'evt' : 'งาน') : ''}
                  </span>
                </div>
              )}
            </button>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-3 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
          {isEn ? 'Active' : 'กำลังดำเนินการ'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-zinc-400" />
          {isEn ? 'Closed' : 'ปิดงานแล้ว'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-100 dark:bg-emerald-950/40" />
          1-3 {isEn ? 'events' : 'งาน'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-orange-100 dark:bg-orange-950/40" />
          4-5 {isEn ? 'events' : 'งาน'}
        </span>
      </div>

      {/* Selected Date Events */}
      {selectedDate && (
        <div className="mt-4 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-emerald-500" />
              {formatDate(selectedDate)}
              <span className="text-zinc-400 font-normal">
                ({selectedDateEvents.length} {isEn ? 'event(s)' : 'งาน'})
              </span>
            </p>
          </div>

          {selectedDateEvents.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-zinc-400">
              {isEn ? 'No events on this date' : 'ไม่มีอีเวนต์ในวันนี้'}
            </div>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {selectedDateEvents.map(event => {
                const isClosed = CLOSED_STATUSES.includes(event.status || '')
                const isSelectedEvent = event.id === selectedId
                const realId = event.id.startsWith('closure:') ? event.id.replace('closure:', '') : event.id
                const eventLink = isClosed ? '/events/event-closures' : `/events/${realId}/edit`
                const costsLink = '/jobs'

                return (
                  <div
                    key={event.id}
                    className={`
                      w-full text-left px-4 py-3 transition-colors
                      ${mode === 'picker' ? 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20 cursor-pointer' : ''}
                      ${isSelectedEvent ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''}
                    `}
                    onClick={() => mode === 'picker' && onSelect?.(event)}
                  >
                    <div className="flex items-start gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${isClosed ? 'bg-zinc-400' : 'bg-emerald-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                          {event.event_name}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5">
                          {event.event_location && (
                            <span className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                              <MapPin className="h-3 w-3 shrink-0" />
                              {event.event_location}
                            </span>
                          )}
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                            isClosed
                              ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                              : 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600'
                          }`}>
                            {isClosed ? (isEn ? 'Closed' : 'ปิดงานแล้ว') : (isEn ? 'Active' : 'กำลังดำเนินการ')}
                          </span>
                        </div>

                        {/* Action buttons — view mode only */}
                        {mode === 'view' && (
                          <div className="flex items-center gap-2 mt-2">
                            <Link
                              href={eventLink}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ExternalLink className="h-3 w-3" />
                              {isClosed
                                ? (isEn ? 'View History' : 'ไปที่อีเวนต์')
                                : (isEn ? 'Go to Event' : 'ไปที่อีเวนต์')
                              }
                            </Link>
                            <Link
                              href={costsLink}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md border border-emerald-200 dark:border-emerald-800 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 transition-colors"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Briefcase className="h-3 w-3" />
                              {isEn ? 'Go to Job' : 'ไปที่งาน'}
                            </Link>
                          </div>
                        )}
                      </div>
                      {isSelectedEvent && (
                        <span className="text-emerald-500 text-xs font-medium mt-1">✓</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
