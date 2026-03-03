'use client'

import { useState } from 'react'
import { Check, ChevronsUpDown, Search, Calendar, MapPin } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

interface EventOption {
  id: string
  event_name: string
  event_date: string | null
  event_location: string | null
  status: string
}

const CLOSED_STATUSES = ['completed', 'closed', 'cancelled']

export default function EventSelectCombobox({
  events,
  value,
  onChange,
  locale = 'th',
}: {
  events: EventOption[]
  value: string
  onChange: (val: string) => void
  locale?: string
}) {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'active' | 'closed'>('active')
  const isEn = locale === 'en'

  const activeEvents = events.filter(e => !CLOSED_STATUSES.includes(e.status))
  const closedEvents = events.filter(e => CLOSED_STATUSES.includes(e.status))

  const selectedEvent = events.find(e => e.id === value)

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString(isEn ? 'en-GB' : 'th-TH', {
      day: 'numeric',
      month: 'short',
      year: '2-digit',
    })
  }

  const displayEvents = tab === 'active' ? activeEvents : closedEvents

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className="w-full flex items-center justify-between px-3 py-2.5 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors min-h-[42px] outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
        >
          {selectedEvent ? (
            <span className="flex items-center gap-2 truncate text-left">
              <span className={`h-2 w-2 rounded-full shrink-0 ${CLOSED_STATUSES.includes(selectedEvent.status) ? 'bg-zinc-400' : 'bg-emerald-500'}`} />
              <span className="truncate">{selectedEvent.event_name}</span>
              {selectedEvent.event_date && (
                <span className="text-xs text-zinc-400 shrink-0">
                  {formatDate(selectedEvent.event_date)}
                </span>
              )}
            </span>
          ) : (
            <span className="text-zinc-400">
              {isEn ? '— Select Event —' : '— เลือกอีเวนต์ —'}
            </span>
          )}
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50 ml-2" />
        </button>
      </PopoverTrigger>

      {/* Hidden input for form submission */}
      <input type="hidden" name="job_event_id" value={value} />

      <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
        <Command>
          <CommandInput
            placeholder={isEn ? 'Search events...' : 'ค้นหาอีเวนต์...'}
          />

          {/* Tab switcher */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-700">
            <button
              type="button"
              onClick={() => setTab('active')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                tab === 'active'
                  ? 'text-emerald-600 border-b-2 border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
            >
              📋 {isEn ? 'Active' : 'กำลังดำเนินการ'} ({activeEvents.length})
            </button>
            <button
              type="button"
              onClick={() => setTab('closed')}
              className={`flex-1 px-3 py-2 text-xs font-medium transition-colors ${
                tab === 'closed'
                  ? 'text-zinc-700 dark:text-zinc-200 border-b-2 border-zinc-500 bg-zinc-50/50 dark:bg-zinc-800/50'
                  : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
              }`}
            >
              ✅ {isEn ? 'Closed' : 'ปิดงานแล้ว'} ({closedEvents.length})
            </button>
          </div>

          <CommandList>
            <CommandEmpty className="py-6 text-center text-sm text-zinc-400">
              {isEn ? 'No events found.' : 'ไม่พบอีเวนต์'}
            </CommandEmpty>
            <CommandGroup>
              {displayEvents.map(event => (
                <CommandItem
                  key={event.id}
                  value={`${event.event_name} ${event.event_location || ''} ${event.event_date || ''}`}
                  onSelect={() => {
                    onChange(event.id === value ? '' : event.id)
                    setOpen(false)
                  }}
                  className="flex items-start gap-2.5 py-2.5 cursor-pointer"
                >
                  <Check
                    className={`h-4 w-4 shrink-0 mt-0.5 ${
                      value === event.id ? 'opacity-100 text-emerald-600' : 'opacity-0'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{event.event_name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {event.event_date && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400">
                          <Calendar className="h-3 w-3" />
                          {formatDate(event.event_date)}
                        </span>
                      )}
                      {event.event_location && (
                        <span className="flex items-center gap-1 text-[11px] text-zinc-400 truncate">
                          <MapPin className="h-3 w-3 shrink-0" />
                          {event.event_location}
                        </span>
                      )}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
