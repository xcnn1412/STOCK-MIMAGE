'use client'

import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import Link from 'next/link'
import { CalendarDays, MapPin, Plus, Package, CheckCircle, ArrowUpDown, Clock, Edit3, MoreHorizontal, Calendar, Eye, EyeOff, Users, Ban, RotateCcw } from "lucide-react"
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/contexts/language-context'
import EventStatusBadge from './event-status-badge'
import EventsLogSheet, { type EventLog } from './events-log-sheet'
import type { Event } from '@/types'
import { isClosedEvent } from '../jobs/tracking/tracking-logic'
import { useConfirm } from '../finance/use-confirm'
import { cancelEvent, restoreEvent } from './actions'

/** เจ้าหน้าที่หนึ่งคนในอีเวนต์ — ชื่อที่แสดง + ป้ายหน้าที่ (ว่าง = ไม่รู้หน้าที่) + สีของหน้าที่ (hex) */
export type EventStaffChip = { name: string; role: string; color: string }

/** อีเวนต์เก่าก่อนมีตาราง event_staff เก็บชื่อเป็นข้อความคั่นจุลภาค — แสดงชื่อเดิมโดยไม่รู้หน้าที่ (สีเทา) */
function legacyStaff(text: string | null | undefined): EventStaffChip[] {
  return (text || '').split(',').map(s => s.trim()).filter(Boolean).map(name => ({ name, role: '', color: '#71717a' }))
}

export default function EventsView({
  events,
  canEdit = false,
  canClose = false,
  logs = [],
  leadByEvent = {},
  staffByEvent = {},
  isAdmin = false,
  cancelledByName = {},
  defaultShowClosed = false,
}: {
  events: Event[]
  /** สร้าง / แก้ไขอีเวนต์ได้ */
  canEdit?: boolean
  /** ปิดงาน / คืนกระเป๋าได้ */
  canClose?: boolean
  logs?: EventLog[]
  /** งานต้นทาง (CRM) ของอีเวนต์ — ไม่มี key = อีเวนต์ที่สร้างตรงไม่ได้มาจากงาน */
  leadByEvent?: Record<string, { leadId: string; customerName: string | null }>
  /** เจ้าหน้าที่ที่จัดไว้ในแต่ละอีเวนต์ (จาก event_staff) — ไม่มี key = ยังไม่จัด (ดูข้อความเก่าใน event.staff แทน) */
  staffByEvent?: Record<string, EventStaffChip[]>
  /** แอดมิน — กู้คืนอีเวนต์ที่ยกเลิกได้ */
  isAdmin?: boolean
  /** ชื่อผู้ยกเลิก (profiles.id → ชื่อ) */
  cancelledByName?: Record<string, string>
  /** เริ่มต้นแสดงการ์ดที่ปิด/ยกเลิกไหม (ค่าเริ่มต้นซ่อน) */
  defaultShowClosed?: boolean
}) {
  const { t, lang } = useLanguage()
  const c = t.events.cancel
  const { confirm, dialog } = useConfirm()
  const [, startTransition] = useTransition()
  const reasonRef = useRef('')

  // ยกเลิกอีเวนต์: กล่องยืนยันพร้อมช่องเหตุผล + ผลกระทบ → server ตรวจซ้ำ (เหตุผล ≥ 3 ตัวอักษร)
  const handleCancel = async (event: Event) => {
    reasonRef.current = ''
    const ok = await confirm({
      title: c.title,
      variant: 'destructive',
      description: (
        <span className="block space-y-2">
          <span className="block font-medium text-zinc-900 dark:text-zinc-100">{event.name}</span>
          <span className="block text-xs">{c.reasonLabel}</span>
          <Textarea rows={3} autoFocus onChange={e => { reasonRef.current = e.target.value }} />
        </span>
      ),
      details: [
        { label: c.impactPacking, value: c.impactPackingValue },
        { label: c.impactKits, value: c.impactKitsValue },
        { label: c.impactTeam, value: c.impactTeamValue },
      ],
      confirmLabel: c.confirm,
      cancelLabel: c.keep,
    })
    if (!ok) return
    const why = reasonRef.current.trim()
    if (why.length < 3) { toast.error(c.reasonTooShort); return }
    startTransition(async () => {
      const res = await cancelEvent(event.id, why)
      if ('error' in res) toast.error(res.error)
      else toast.success(c.done)
    })
  }

  const handleRestore = async (event: Event) => {
    const ok = await confirm({ title: c.restoreTitle, description: c.restoreDesc, variant: 'warning', confirmLabel: c.restore })
    if (!ok) return
    startTransition(async () => {
      const res = await restoreEvent(event.id)
      if ('error' in res) toast.error(res.error)
      else toast.success(c.restored)
    })
  }
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')
  // Closed events stay in the DB now (soft-close), so hide them unless asked for.
  const [showClosed, setShowClosed] = useState(defaultShowClosed)

  // ปิดแล้ว + ยกเลิก ซ่อนไว้ก่อน (ปุ่มสลับนับรวมทั้งสองแบบ)
  const closedCount = events.filter(e => isClosedEvent(e.status)).length

  const visibleEvents = showClosed ? events : events.filter(e => !isClosedEvent(e.status))

  const sortedEvents = [...visibleEvents].sort((a, b) => {
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
          {/* Desktop Action Buttons */}
          <div className="hidden md:flex items-center gap-2">
            <Link href="/events/calendar">
              <Button variant="outline" size="sm" className="border-zinc-200 dark:border-zinc-700">
                <Calendar className="mr-2 h-4 w-4" />
                {lang === 'th' ? 'ปฏิทิน' : 'Calendar'}
              </Button>
            </Link>
            <EventsLogSheet logs={logs} />
            {canEdit && (
              <Link href="/events/new">
                <Button size="sm" className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
                  <Plus className="mr-2 h-4 w-4" />
                  {t.events.createEvent}
                </Button>
              </Link>
            )}
          </div>
        </div>

        {/* Sort + History Buttons - Compact on mobile */}
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            className="w-fit border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            {t.events.sortDate}
          </Button>
          <Button
            variant={showClosed ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowClosed(v => !v)}
            className={showClosed
              ? 'w-fit bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900'
              : 'w-fit border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800'}
          >
            {showClosed ? <EyeOff className="mr-2 h-4 w-4" /> : <Eye className="mr-2 h-4 w-4" />}
            {showClosed
              ? c.hideClosed
              : c.showClosed}
            {closedCount > 0 && <span className="ml-1.5 opacity-60">{closedCount}</span>}
          </Button>
          <div className="md:hidden">
            <EventsLogSheet logs={logs} />
          </div>
        </div>
      </div>

      {/* Stats Summary - Enhanced Mobile */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">{events.length}</div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'ทั้งหมด' : 'Total'}</div>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">{events.filter(e => isClosedEvent(e.status) && e.status !== 'cancelled').length}</div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'เสร็จสิ้น' : 'Completed'}</div>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {events.filter(e => {
              const hours = (new Date(e.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
              return hours > 0 && hours < 48 && !isClosedEvent(e.status)
            }).length}
          </div>
          <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-1">{lang === 'th' ? 'ใกล้ถึง' : 'Upcoming'}</div>
        </div>
        <div className="border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 bg-white dark:bg-zinc-900 shadow-sm">
          <div className="text-3xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {events.filter(e => {
              const hours = (new Date(e.event_date).getTime() - new Date().getTime()) / (1000 * 60 * 60)
              return hours >= 48 && !isClosedEvent(e.status)
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
                <EventStatusBadge status={event.status || 'upcoming'} date={event.event_date} />
              </div>
              
              {/* Event Title */}
              <h3 className="text-lg font-semibold leading-snug text-zinc-900 dark:text-zinc-100 line-clamp-2 mb-1">
                {event.name}
              </h3>

              {/* งานต้นทาง — อีเวนต์ที่แตกมาจากงาน CRM กดกลับไปหางาน/พูลงานได้ */}
              {leadByEvent[event.id] ? (
                <div className="text-xs text-zinc-500 mb-3 truncate">
                  {lang === 'th' ? 'งาน: ' : 'Job: '}
                  <Link href={`/crm/${leadByEvent[event.id].leadId}`} className="text-violet-600 dark:text-violet-400 hover:underline">
                    {leadByEvent[event.id].customerName || (lang === 'th' ? 'ไม่ระบุลูกค้า' : 'Unnamed customer')}
                  </Link>
                  {' · '}
                  <Link href="/jobs/tracking" className="hover:underline">
                    {lang === 'th' ? 'พูลงาน ↗' : 'Job pool ↗'}
                  </Link>
                </div>
              ) : (
                <div className="mb-3" />
              )}

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
                    {/* เวลาเปิด–ปิด ที่กรอกไว้จริง (event_date เก็บเป็นเที่ยงคืนเสมอ จึงเอามาโชว์เป็นเวลาไม่ได้) */}
                    {event.event_time && (
                      <span className="ml-2 text-zinc-500">
                        {event.event_time.slice(0, 5)}
                        {event.event_end_time ? `–${event.event_end_time.slice(0, 5)}` : ''} น.
                      </span>
                    )}
                  </div>
                </div>

                {/* เจ้าหน้าที่ที่รับผิดชอบ — ชื่อเล่น + หน้าที่ · ไม่มี = บอกให้รู้ว่ายังไม่จัด */}
                {(() => {
                  const staff = staffByEvent[event.id] ?? legacyStaff(event.staff)
                  return (
                    <div className="flex items-start gap-3 text-sm">
                      <Users className="h-4 w-4 text-zinc-400 shrink-0 mt-0.5" />
                      {staff.length === 0 ? (
                        <span className="text-zinc-400">{lang === 'th' ? 'ยังไม่จัดเจ้าหน้าที่' : 'No staff assigned'}</span>
                      ) : (
                        <ul className="flex flex-wrap gap-1.5" aria-label={lang === 'th' ? 'เจ้าหน้าที่' : 'Staff'}>
                          {/* ป้ายสีตามหน้าที่ — หน้าตาเดียวกับแท็กบนบอร์ดวันงาน (/jobs) */}
                          {staff.map((s, i) => (
                            <li
                              key={`${s.name}-${s.role}-${i}`}
                              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[12px] font-semibold"
                              style={{ backgroundColor: `${s.color}15`, color: s.color, boxShadow: `inset 0 0 0 1.5px ${s.color}30` }}
                            >
                              <span className="h-2 w-2 rounded-full shadow-sm" style={{ backgroundColor: s.color }} />
                              {s.name}
                              {s.role && <span className="font-medium opacity-75">· {s.role}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )
                })()}

                {/* อีเวนต์ที่ยกเลิก — เหตุผล + ผู้ยกเลิก */}
                {event.status === 'cancelled' && (
                  <div data-testid="cancel-info" className="rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-700 dark:text-red-300 space-y-0.5">
                    <div className="font-semibold">{c.badge}</div>
                    <div>{c.reason}: {event.cancel_reason || '-'}</div>
                    {event.cancelled_by && <div>{c.by}: {cancelledByName[event.cancelled_by] || '-'}</div>}
                  </div>
                )}
              </div>
            </CardContent>

            {/* Action Buttons - Mobile Optimized */}
            <CardFooter className="border-t border-zinc-100 dark:border-zinc-800 p-4 gap-2 flex-wrap">
              <Link href={`/events/${event.id}/check-kits`} className="flex-1 min-w-0">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full min-h-[44px] border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                >
                  <Package className="w-4 h-4 mr-2" />
                  {lang === 'th' ? 'กระเป๋า' : 'Kits'}
                </Button>
              </Link>
              {canEdit && (
                <Link href={`/events/${event.id}/edit`} className="flex-1 min-w-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full min-h-[44px] border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 font-medium"
                  >
                    <Edit3 className="w-4 h-4 mr-2" />
                    {lang === 'th' ? 'แก้ไข' : 'Edit'}
                  </Button>
                </Link>
              )}
              {canClose && !isClosedEvent(event.status) && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCancel(event)}
                  className="min-h-[44px] border-red-200 text-red-600 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  <Ban className="w-4 h-4" />
                  {c.button}
                </Button>
              )}
              {isAdmin && event.status === 'cancelled' && (
                <Button variant="outline" size="sm" onClick={() => handleRestore(event)} className="min-h-[44px]">
                  <RotateCcw className="w-4 h-4" />
                  {c.restore}
                </Button>
              )}
              {canClose && !isClosedEvent(event.status) && (
                <Link href={`/events/${event.id}/return`}>
                  <Button
                    size="sm"
                    className="min-h-[44px] min-w-[44px] bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900"
                  >
                    <CheckCircle className="w-4 h-4" />
                    {lang === 'th' ? 'ปิดงาน' : 'Close'}
                  </Button>
                </Link>
              )}
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
                  ? (canEdit ? 'เริ่มสร้างอีเว้นท์แรกของคุณ' : 'ยังไม่มีอีเว้นท์ที่เปิดอยู่')
                  : (canEdit ? 'Create your first event to get started' : 'No events have been created yet')}
              </p>
              {canEdit && (
                <Link href="/events/new">
                  <Button className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
                    <Plus className="mr-2 h-4 w-4" />
                    {t.events.createEvent}
                  </Button>
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {dialog}

      {/* Mobile FAB - Create Event (admin only) */}
      {canEdit && (
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
      )}
    </div>
  )
}

