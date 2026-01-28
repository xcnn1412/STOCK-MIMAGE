'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { CalendarDays, MapPin, Plus, Package, CheckCircle, ArrowUpDown, Clock, Edit3, MoreHorizontal } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'
import EventStatusBadge from './event-status-badge'
import type { Event } from '@/types'

export default function EventsView({ events }: { events: Event[] }) {
  const { t, lang } = useLanguage()
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const sortedEvents = [...events].sort((a, b) => {
    const dateA = new Date(a.event_date).getTime()
    const dateB = new Date(b.event_date).getTime()
    return sortOrder === 'asc' ? dateA - dateB : dateB - dateA
  })

  return (
    <div className="space-y-5 pb-20 md:pb-6">
      {/* Mobile-Optimized Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
              {t.events.title}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
              {lang === 'th' 
                ? 'จัดการอีเว้นท์และติดตามสถานะ'
                : 'Manage events and track status'}
            </p>
          </div>
          {/* Desktop Create Button */}
          <Link href="/events/new" className="hidden md:block">
            <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
              <Plus className="mr-2 h-4 w-4" />
              {t.events.createEvent}
            </Button>
          </Link>
        </div>
        
        {/* Sort Button - Compact on mobile */}
        <Button 
          variant="outline" 
          size="sm"
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="w-fit border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          <ArrowUpDown className="mr-2 h-4 w-4" />
          {t.events.sortDate}
        </Button>
      </div>

      {/* Stats Summary - Enhanced Mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">{events.length}</div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'ทั้งหมด' : 'Total'}</div>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">{events.filter(e => e.status === 'completed').length}</div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'เสร็จสิ้น' : 'Completed'}</div>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {events.filter(e => {
              const hours = (new Date(e.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
              return hours > 0 && hours < 48 && e.status !== 'completed'
            }).length}
          </div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'ใกล้ถึง' : 'Upcoming'}</div>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {events.filter(e => {
              const hours = (new Date(e.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
              return hours >= 48 && e.status !== 'completed'
            }).length}
          </div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'กำหนดการ' : 'Scheduled'}</div>
        </div>
      </div>

      {/* Events Grid - Enhanced Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedEvents?.map((event) => (
          <Card 
            key={event.id} 
            className="group border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 hover:shadow-lg hover:border-zinc-300 dark:hover:border-zinc-600 transition-all duration-200"
          >
            <CardContent className="p-5">
              {/* Countdown Badge - Prominent */}
              <div className="flex items-center gap-2 mb-3">
                <CalendarDays className="h-4 w-4 text-zinc-400 shrink-0" />
                <EventStatusBadge status={event.status} date={event.event_date} />
              </div>
              
              {/* Event Title */}
              <h3 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-4">
                {event.name}
              </h3>

              {/* Event Details - Better Spacing */}
              <div className="space-y-3">
                <div className="flex items-start gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                  <span className="text-zinc-600 dark:text-zinc-300 line-clamp-2">{event.location || '-'}</span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <Clock className="h-4 w-4 text-zinc-400 shrink-0" />
                  <div className="text-zinc-600 dark:text-zinc-300">
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {lang === 'th' ? (
                        (() => {
                          const date = new Date(event.event_date)
                          const day = date.getDate()
                          const month = date.toLocaleDateString('th-TH', { month: 'short' })
                          const year = date.getFullYear() + 543
                          return `${day} ${month} ${year}`
                        })()
                      ) : (
                        new Date(event.event_date).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
                      )}
                    </span>
                    <span className="ml-2 text-zinc-500">
                      {new Date(event.event_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Action Buttons - Mobile Optimized */}
            <CardFooter className="border-t border-zinc-100 dark:border-zinc-800 p-4 gap-2">
              <Link href={`/events/${event.id}/check-kits`} className="flex-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full min-h-[44px] border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                >
                  <Package className="w-4 h-4 mr-2" />
                  Kits
                </Button>
              </Link>
              <Link href={`/events/${event.id}/edit`} className="flex-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full min-h-[44px] border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                >
                  <Edit3 className="w-4 h-4 mr-2" />
                  Edit
                </Button>
              </Link>
              <Link href={`/events/${event.id}/return`}>
                <Button 
                  size="sm" 
                  className="min-h-[44px] min-w-[44px] bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span className="sr-only">{t.events.finalizeJob}</span>
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}

        {/* Empty State */}
        {(!sortedEvents || sortedEvents.length === 0) && (
          <div className="col-span-full">
            <div className="rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 p-12 text-center bg-zinc-50/50 dark:bg-zinc-900/50">
              <CalendarDays className="mx-auto h-12 w-12 text-zinc-300 dark:text-zinc-600 mb-4" />
              <h3 className="text-lg font-semibold mb-2 text-zinc-900 dark:text-zinc-100">
                {lang === 'th' ? 'ยังไม่มีอีเว้นท์' : 'No Events Yet'}
              </h3>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-sm mx-auto">
                {lang === 'th' 
                  ? 'เริ่มสร้างอีเว้นท์แรกของคุณ'
                  : 'Create your first event to get started'}
              </p>
              <Link href="/events/new">
                <Button className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
                  <Plus className="mr-2 h-4 w-4" />
                  {t.events.createEvent}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Mobile FAB - Create Event */}
      <Link 
        href="/events/new" 
        className="md:hidden fixed bottom-6 right-6 z-50"
      >
        <Button 
          size="lg" 
          className="h-14 w-14 rounded-full shadow-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900"
        >
          <Plus className="h-6 w-6" />
          <span className="sr-only">{t.events.createEvent}</span>
        </Button>
      </Link>
    </div>
  )
}

