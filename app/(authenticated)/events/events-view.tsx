'use client'

import { useState } from 'react'
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { CalendarDays, MapPin, Plus, Package, CheckCircle, ArrowUpDown, Clock, Edit3 } from "lucide-react"
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
    <div className="space-y-6">
      {/* Minimal Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">{t.events.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {lang === 'th' 
              ? 'จัดการอีเว้นท์และติดตามสถานะ'
              : 'Manage events and track status'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            {t.events.sortDate}
          </Button>
          <Link href="/events/new">
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              {t.events.createEvent}
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Summary - Minimal */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold">{events.length}</div>
          <div className="text-xs text-muted-foreground">{lang === 'th' ? 'ทั้งหมด' : 'Total'}</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold">{events.filter(e => e.status === 'completed').length}</div>
          <div className="text-xs text-muted-foreground">{lang === 'th' ? 'เสร็จสิ้น' : 'Completed'}</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold">
            {events.filter(e => {
              const hours = (new Date(e.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
              return hours > 0 && hours < 48 && e.status !== 'completed'
            }).length}
          </div>
          <div className="text-xs text-muted-foreground">{lang === 'th' ? 'ใกล้ถึง' : 'Upcoming'}</div>
        </div>
        <div className="border rounded-lg p-4 bg-card">
          <div className="text-2xl font-bold">
            {events.filter(e => {
              const hours = (new Date(e.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
              return hours >= 48 && e.status !== 'completed'
            }).length}
          </div>
          <div className="text-xs text-muted-foreground">{lang === 'th' ? 'กำหนดการ' : 'Scheduled'}</div>
        </div>
      </div>

      {/* Events Grid - Clean Cards */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sortedEvents?.map((event) => (
          <Card key={event.id} className="group hover:shadow-md transition-shadow">
            <CardContent className="pt-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
                    <EventStatusBadge status={event.status} date={event.event_date} />
                  </div>
                  <h3 className="text-base font-semibold leading-tight line-clamp-2">
                    {event.name}
                  </h3>
                </div>
              </div>

              {/* Event Details */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0" />
                  <span className="truncate">{event.location || '-'}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0" />
                  <div>
                    <span className="text-foreground font-medium">
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
                    <span className="ml-2">
                      {new Date(event.event_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>

            {/* Action Buttons - Monochrome */}
            <CardFooter className="border-t pt-4 gap-2">
              <Link href={`/events/${event.id}/check-kits`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <Package className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t.events.trackKits}</span>
                  <span className="sm:hidden">Kits</span>
                </Button>
              </Link>
              <Link href={`/events/${event.id}/edit`} className="flex-1">
                <Button variant="outline" size="sm" className="w-full">
                  <Edit3 className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t.common.edit}</span>
                  <span className="sm:hidden">Edit</span>
                </Button>
              </Link>
              <Link href={`/events/${event.id}/return`} className="flex-1">
                <Button size="sm" className="w-full">
                  <CheckCircle className="w-4 h-4 mr-1.5" />
                  <span className="hidden sm:inline">{t.events.finalizeJob}</span>
                  <span className="sm:hidden">Done</span>
                </Button>
              </Link>
            </CardFooter>
          </Card>
        ))}

        {/* Empty State */}
        {(!sortedEvents || sortedEvents.length === 0) && (
          <div className="col-span-full">
            <div className="rounded-xl border-2 border-dashed p-12 text-center">
              <CalendarDays className="mx-auto h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 className="text-lg font-semibold mb-2">
                {lang === 'th' ? 'ยังไม่มีอีเว้นท์' : 'No Events Yet'}
              </h3>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm mx-auto">
                {lang === 'th' 
                  ? 'เริ่มสร้างอีเว้นท์แรกของคุณ'
                  : 'Create your first event to get started'}
              </p>
              <Link href="/events/new">
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  {t.events.createEvent}
                </Button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

