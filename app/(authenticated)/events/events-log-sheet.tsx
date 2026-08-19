'use client'

import { useMemo, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  Link as LinkIcon,
  Unlink,
  History,
  Search,
  Filter,
} from 'lucide-react'
import { useLanguage } from '@/contexts/language-context'

export type EventLog = {
  id: string
  action_type: string
  details: any
  created_at: string
  user: { full_name: string | null; role: string | null } | null
}

type ActionFilter = 'all' | 'CREATE_EVENT' | 'UPDATE_EVENT' | 'DELETE_EVENT' | 'CLOSE_EVENT' | 'LINK' | 'UNLINK'

const ACTION_META: Record<string, {
  th: string
  en: string
  Icon: typeof Plus
  ring: string
  dot: string
  badge: string
}> = {
  CREATE_EVENT: {
    th: 'สร้างอีเวนต์',
    en: 'Created event',
    Icon: Plus,
    ring: 'ring-emerald-200 dark:ring-emerald-900/40',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800',
  },
  UPDATE_EVENT: {
    th: 'แก้ไขอีเวนต์',
    en: 'Updated event',
    Icon: Pencil,
    ring: 'ring-amber-200 dark:ring-amber-900/40',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
  },
  DELETE_EVENT: {
    th: 'ลบ/ปิดงานอีเวนต์',
    en: 'Deleted event',
    Icon: Trash2,
    ring: 'ring-red-200 dark:ring-red-900/40',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
  },
  CLOSE_EVENT: {
    th: 'ปิดงาน',
    en: 'Closed',
    Icon: CheckCircle2,
    ring: 'ring-sky-200 dark:ring-sky-900/40',
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800',
  },
  LINK_EVENT_TO_CRM: {
    th: 'เชื่อมกับ CRM',
    en: 'Linked to CRM',
    Icon: LinkIcon,
    ring: 'ring-blue-200 dark:ring-blue-900/40',
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
  },
  UNLINK_EVENT_FROM_CRM: {
    th: 'ยกเลิกเชื่อม CRM',
    en: 'Unlinked from CRM',
    Icon: Unlink,
    ring: 'ring-zinc-200 dark:ring-zinc-700',
    dot: 'bg-zinc-500',
    badge: 'bg-zinc-100 text-zinc-700 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:border-zinc-700',
  },
}

function formatRelative(date: string, lang: 'th' | 'en') {
  const diffMs = Date.now() - new Date(date).getTime()
  const sec = Math.floor(diffMs / 1000)
  if (sec < 60) return lang === 'th' ? 'เมื่อสักครู่' : 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return lang === 'th' ? `${min} นาทีที่แล้ว` : `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return lang === 'th' ? `${hr} ชั่วโมงที่แล้ว` : `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return lang === 'th' ? `${day} วันที่แล้ว` : `${day}d ago`
  return new Date(date).toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function formatTime(date: string) {
  const d = new Date(date)
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

function formatDateTime(date: string, lang: 'th' | 'en') {
  const d = new Date(date)
  if (lang === 'th') {
    const day = d.getDate()
    const month = d.toLocaleDateString('th-TH', { month: 'short' })
    const year = d.getFullYear() + 543
    const time = d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
    return `${day} ${month} ${year} เวลา ${time}`
  }
  return d.toLocaleString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function LogEntryDetail({ log, lang }: { log: EventLog; lang: 'th' | 'en' }) {
  const d = log.details || {}
  const action = log.action_type

  if (action === 'CREATE_EVENT') {
    return (
      <div className="space-y-1 text-sm">
        <div className="font-medium text-zinc-900 dark:text-zinc-100">{d.name || '-'}</div>
        {d.location && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {lang === 'th' ? 'สถานที่: ' : 'Location: '}{d.location}
          </div>
        )}
        {Array.isArray(d.kitIds) && d.kitIds.length > 0 && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {lang === 'th' ? `กระเป๋าที่ผูก: ${d.kitIds.length} ใบ` : `Kits attached: ${d.kitIds.length}`}
          </div>
        )}
      </div>
    )
  }

  if (action === 'UPDATE_EVENT') {
    const fieldLabels: Record<string, { th: string; en: string }> = {
      name: { th: 'ชื่ออีเวนต์', en: 'Event name' },
      location: { th: 'สถานที่', en: 'Location' },
      staff: { th: 'ทีมงาน (ข้อความ)', en: 'Staff (text)' },
      seller: { th: 'ผู้ขาย', en: 'Seller' },
    }

    const changes = (d.changes || {}) as Record<string, { from: any; to: any }>
    const kits = d.kits as { added?: any[]; removed?: any[] } | undefined
    const staffDiff = d.staff_assignments as { added?: any[]; removed?: any[] } | undefined

    const hasFieldChanges = Object.keys(changes).length > 0
    const hasKitChanges = !!kits && ((kits.added?.length || 0) > 0 || (kits.removed?.length || 0) > 0)
    const hasStaffChanges = !!staffDiff && ((staffDiff.added?.length || 0) > 0 || (staffDiff.removed?.length || 0) > 0)
    const hasAnyDiff = hasFieldChanges || hasKitChanges || hasStaffChanges

    return (
      <div className="space-y-2 text-sm">
        <div className="font-medium text-zinc-900 dark:text-zinc-100 truncate">{d.name || '-'}</div>

        {hasFieldChanges && (
          <div className="space-y-1.5">
            {Object.entries(changes).map(([key, change]) => {
              const labelMeta = fieldLabels[key]
              const label = labelMeta ? (lang === 'th' ? labelMeta.th : labelMeta.en) : key
              const fromVal = change.from == null || change.from === '' ? '—' : String(change.from)
              const toVal = change.to == null || change.to === '' ? '—' : String(change.to)
              return (
                <div
                  key={key}
                  className="text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 px-2 py-1.5"
                >
                  <div className="font-medium text-zinc-700 dark:text-zinc-300 mb-1">{label}</div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="line-through text-red-500/90 break-all max-w-[160px] truncate" title={fromVal}>
                      {fromVal}
                    </span>
                    <span className="text-zinc-400">→</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium break-all max-w-[180px] truncate" title={toVal}>
                      {toVal}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {hasKitChanges && (
          <div className="text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 px-2 py-1.5 space-y-1">
            <div className="font-medium text-zinc-700 dark:text-zinc-300">
              {lang === 'th' ? 'กระเป๋า' : 'Kits'}
            </div>
            {(kits?.added || []).map((k: any) => (
              <div key={`add-${k.id}`} className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <span className="font-mono">+</span>
                <span className="break-all">{k.name || k.id}</span>
              </div>
            ))}
            {(kits?.removed || []).map((k: any) => (
              <div key={`rm-${k.id}`} className="flex items-center gap-1.5 text-red-500/90">
                <span className="font-mono">−</span>
                <span className="break-all">{k.name || k.id}</span>
              </div>
            ))}
          </div>
        )}

        {hasStaffChanges && (
          <div className="text-xs rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-800/40 px-2 py-1.5 space-y-1">
            <div className="font-medium text-zinc-700 dark:text-zinc-300">
              {lang === 'th' ? 'ทีมงาน' : 'Staff'}
            </div>
            {(staffDiff?.added || []).map((s: any, i: number) => (
              <div key={`s-add-${i}`} className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 flex-wrap">
                <span className="font-mono">+</span>
                <span>{s.full_name || s.user_id}</span>
                {s.role && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">
                    {s.role}
                  </Badge>
                )}
              </div>
            ))}
            {(staffDiff?.removed || []).map((s: any, i: number) => (
              <div key={`s-rm-${i}`} className="flex items-center gap-1.5 text-red-500/90 flex-wrap">
                <span className="font-mono">−</span>
                <span>{s.full_name || s.user_id}</span>
                {s.role && (
                  <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">
                    {s.role}
                  </Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {!hasAnyDiff && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400 italic">
            {Array.isArray(d.kitIds)
              ? lang === 'th'
                ? `บันทึกอีเวนต์ (กระเป๋าที่ผูก: ${d.kitIds.length} ใบ)`
                : `Saved (kits: ${d.kitIds.length})`
              : lang === 'th'
              ? 'ไม่มีรายละเอียดการเปลี่ยนแปลง'
              : 'No change details recorded'}
          </div>
        )}
      </div>
    )
  }

  if (action === 'DELETE_EVENT') {
    return (
      <div className="space-y-1 text-sm">
        <div className="font-medium text-zinc-900 dark:text-zinc-100">{d.name || '-'}</div>
        {d.reason && (
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {lang === 'th' ? 'เหตุผล: ' : 'Reason: '}
            {d.reason === 'return'
              ? (lang === 'th' ? 'ปิดงาน/คืนของ' : 'Returned')
              : d.reason}
          </div>
        )}
      </div>
    )
  }

  if (action === 'CLOSE_EVENT') {
    return (
      <div className="space-y-1 text-sm">
        <div className="font-medium text-zinc-900 dark:text-zinc-100">{d.name || '-'}</div>
        <div className="text-xs text-zinc-500 dark:text-zinc-400">
          {d.closureRecorded
            ? (lang === 'th' ? 'บันทึกสรุปปิดงานแล้ว' : 'Closure report saved')
            : (lang === 'th' ? 'ปิดงานแล้ว (ไม่ได้บันทึกสรุป)' : 'Closed (no closure report)')}
        </div>
      </div>
    )
  }

  if (action === 'LINK_EVENT_TO_CRM' || action === 'UNLINK_EVENT_FROM_CRM') {
    return (
      <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono break-all">
        {d.eventId && (
          <div>Event: {String(d.eventId).slice(0, 8)}</div>
        )}
        {d.leadId && (
          <div>Lead: {String(d.leadId).slice(0, 8)}</div>
        )}
      </div>
    )
  }

  return null
}

export default function EventsLogSheet({ logs }: { logs: EventLog[] }) {
  const { lang } = useLanguage()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<ActionFilter>('all')

  const counts = useMemo(() => {
    const c = { create: 0, update: 0, delete: 0, close: 0, link: 0 }
    for (const l of logs) {
      if (l.action_type === 'CREATE_EVENT') c.create++
      else if (l.action_type === 'UPDATE_EVENT') c.update++
      else if (l.action_type === 'DELETE_EVENT') c.delete++
      else if (l.action_type === 'CLOSE_EVENT') c.close++
      else if (l.action_type === 'LINK_EVENT_TO_CRM' || l.action_type === 'UNLINK_EVENT_FROM_CRM') c.link++
    }
    return c
  }, [logs])

  const filtered = useMemo(() => {
    return logs.filter((l) => {
      if (filter === 'CREATE_EVENT' && l.action_type !== 'CREATE_EVENT') return false
      if (filter === 'UPDATE_EVENT' && l.action_type !== 'UPDATE_EVENT') return false
      if (filter === 'DELETE_EVENT' && l.action_type !== 'DELETE_EVENT') return false
      if (filter === 'CLOSE_EVENT' && l.action_type !== 'CLOSE_EVENT') return false
      if (filter === 'LINK' && l.action_type !== 'LINK_EVENT_TO_CRM') return false
      if (filter === 'UNLINK' && l.action_type !== 'UNLINK_EVENT_FROM_CRM') return false
      if (!search.trim()) return true
      const q = search.toLowerCase()
      const name = String(l.details?.name || '').toLowerCase()
      const user = String(l.user?.full_name || '').toLowerCase()
      return name.includes(q) || user.includes(q)
    })
  }, [logs, filter, search])

  const grouped = useMemo(() => {
    const g: Record<string, EventLog[]> = {}
    for (const log of filtered) {
      const d = new Date(log.created_at)
      const today = new Date()
      const yesterday = new Date()
      yesterday.setDate(today.getDate() - 1)

      const isSameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate()

      let key: string
      if (isSameDay(d, today)) {
        key = lang === 'th' ? 'วันนี้' : 'Today'
      } else if (isSameDay(d, yesterday)) {
        key = lang === 'th' ? 'เมื่อวาน' : 'Yesterday'
      } else {
        key = d.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-US', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      }

      if (!g[key]) g[key] = []
      g[key].push(log)
    }
    return g
  }, [filtered, lang])

  const filterButtons: { key: ActionFilter; labelTh: string; labelEn: string; count: number }[] = [
    { key: 'all', labelTh: 'ทั้งหมด', labelEn: 'All', count: logs.length },
    { key: 'CREATE_EVENT', labelTh: 'สร้าง', labelEn: 'Created', count: counts.create },
    { key: 'UPDATE_EVENT', labelTh: 'แก้ไข', labelEn: 'Updated', count: counts.update },
    { key: 'CLOSE_EVENT', labelTh: 'ปิดงาน', labelEn: 'Closed', count: counts.close },
    { key: 'DELETE_EVENT', labelTh: 'ลบ', labelEn: 'Deleted', count: counts.delete },
  ]

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="border-zinc-200 dark:border-zinc-700"
        >
          <History className="mr-2 h-4 w-4" />
          {lang === 'th' ? 'ประวัติ' : 'History'}
          {logs.length > 0 && (
            <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">
              {logs.length}
            </Badge>
          )}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col gap-0"
      >
        <SheetHeader className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-4 space-y-1">
          <SheetTitle className="text-lg font-semibold flex items-center gap-2">
            <History className="h-5 w-5" />
            {lang === 'th' ? 'ประวัติอีเวนต์' : 'Event History'}
          </SheetTitle>
          <SheetDescription className="text-xs">
            {lang === 'th'
              ? 'บันทึกการสร้าง แก้ไข และลบอีเวนต์ทั้งหมด'
              : 'Audit trail for all event create, update, and delete actions'}
          </SheetDescription>
        </SheetHeader>

        <div className="border-b border-zinc-200 dark:border-zinc-800 px-5 py-3 space-y-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              type="search"
              placeholder={lang === 'th' ? 'ค้นหาชื่ออีเวนต์หรือผู้ใช้...' : 'Search event name or user...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
            {filterButtons.map((b) => (
              <Button
                key={b.key}
                variant={filter === b.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFilter(b.key)}
                className="h-7 text-xs whitespace-nowrap"
              >
                <Filter className="mr-1 h-3 w-3" />
                {lang === 'th' ? b.labelTh : b.labelEn}
                <span className="ml-1.5 opacity-60">{b.count}</span>
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <History className="h-10 w-10 text-zinc-300 dark:text-zinc-600 mb-3" />
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                {lang === 'th' ? 'ยังไม่มีประวัติ' : 'No history yet'}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped).map(([dateLabel, items]) => (
                <div key={dateLabel}>
                  <div className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 mb-3">
                    {dateLabel}
                  </div>
                  <ol className="relative border-l border-zinc-200 dark:border-zinc-800 ml-3 space-y-4">
                    {items.map((log) => {
                      const meta = ACTION_META[log.action_type] || ACTION_META.UPDATE_EVENT
                      const Icon = meta.Icon
                      return (
                        <li key={log.id} className="ml-6 relative">
                          <span
                            className={`absolute -left-[34px] top-0 flex h-7 w-7 items-center justify-center rounded-full ${meta.dot} ring-4 ${meta.ring}`}
                          >
                            <Icon className="h-3.5 w-3.5 text-white" />
                          </span>
                          <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm">
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-medium ${meta.badge}`}
                                  >
                                    {lang === 'th' ? meta.th : meta.en}
                                  </Badge>
                                  <span
                                    className="text-xs text-zinc-700 dark:text-zinc-300 font-mono tabular-nums"
                                    title={formatDateTime(log.created_at, lang)}
                                  >
                                    {formatTime(log.created_at)}
                                  </span>
                                  <span
                                    className="text-[11px] text-zinc-400 dark:text-zinc-500"
                                    title={formatDateTime(log.created_at, lang)}
                                  >
                                    · {formatRelative(log.created_at, lang)}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <LogEntryDetail log={log} lang={lang} />
                            <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                                {log.user?.full_name || (lang === 'th' ? 'ระบบ' : 'System')}
                              </span>
                              {log.user?.role && (
                                <Badge variant="outline" className="h-4 px-1 text-[9px] capitalize">
                                  {log.user.role}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
