'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Check, ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getNotifications, markAsRead, markAllAsRead, type NotificationItem } from './actions'

// ============================================================================
// Type → icon + color
// ============================================================================

const TYPE_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  job_assigned:         { icon: '⭐', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',     label: 'งานใหม่' },
  job_status_changed:   { icon: '🔄', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',         label: 'สถานะงาน' },
  job_mentioned:        { icon: '📣', color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400', label: 'ถูกแท็ก' },
  job_comment:          { icon: '💬', color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400',             label: 'ความคิดเห็น' },
  ticket_assigned:      { icon: '🎫', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', label: 'Ticket ใหม่' },
  ticket_reply:         { icon: '📝', color: 'bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400',         label: 'ตอบกลับ' },
  ticket_status_changed:{ icon: '🔔', color: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',         label: 'สถานะ Ticket' },
  expense_approved:     { icon: '✅', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', label: 'อนุมัติแล้ว' },
  expense_rejected:     { icon: '❌', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             label: 'ถูกปฏิเสธ' },
  kpi_evaluated:        { icon: '📊', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', label: 'ผลประเมิน KPI' },
  kpi_self_evaluated:   { icon: '📝', color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400', label: 'ประเมินตัวเอง' },
  kpi_evaluation_reply: { icon: '💬', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', label: 'ตอบกลับ KPI' },
  crm_mentioned:        { icon: '📍', color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', label: 'ถูกแท็กใน CRM' },
}

const DEFAULT_TYPE = { icon: '🔔', color: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400', label: 'การแจ้งเตือน' }

// ============================================================================
// URL mapping
// ============================================================================

function getUrl(item: NotificationItem): string {
  switch (item.reference_type) {
    case 'job':           return `/jobs/${item.reference_id}`
    case 'ticket':        return `/jobs/tickets/${item.reference_id}`
    case 'expense_claim': return `/finance`
    case 'kpi_evaluation':return `/kpi/reports`
    case 'crm_lead':      return `/crm/${item.reference_id}`
    default:              return '/dashboard'
  }
}

// ============================================================================
// Relative time
// ============================================================================

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'เมื่อสักครู่'
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH} ชั่วโมงที่แล้ว`
  const diffD = Math.floor(diffH / 24)
  if (diffD < 7) return `${diffD} วันที่แล้ว`
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ============================================================================
// Notifications Page
// ============================================================================

export default function NotificationsPage() {
  const router = useRouter()
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await getNotifications(100)
    setItems(data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      await markAsRead(item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n))
    }
    router.push(getUrl(item))
  }

  const handleMarkAll = async () => {
    await markAllAsRead()
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const displayed = filter === 'unread' ? items.filter(n => !n.is_read) : items
  const unreadCount = items.filter(n => !n.is_read).length

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Bell className="h-5 w-5" />
            การแจ้งเตือน
            {unreadCount > 0 && (
              <Badge className="ml-1 bg-red-500 text-white border-0 text-xs px-1.5 py-0">
                {unreadCount}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            {items.length} รายการทั้งหมด
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAll} className="gap-1.5 text-xs">
            <CheckCheck className="h-3.5 w-3.5" />
            อ่านทั้งหมด
          </Button>
        )}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg w-fit">
        {(['all', 'unread'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              filter === f
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
            }`}
          >
            {f === 'all' ? 'ทั้งหมด' : `ยังไม่อ่าน${unreadCount > 0 ? ` (${unreadCount})` : ''}`}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden divide-y divide-zinc-100 dark:divide-zinc-800">
        {loading ? (
          <div className="flex flex-col gap-3 p-4">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-10 w-10 rounded-xl bg-zinc-100 dark:bg-zinc-800 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-zinc-100 dark:bg-zinc-800 rounded w-3/4" />
                  <div className="h-3 bg-zinc-100 dark:bg-zinc-800 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400 dark:text-zinc-500">
            <Bell className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {filter === 'unread' ? 'อ่านทุกรายการแล้ว' : 'ไม่มีการแจ้งเตือน'}
            </p>
          </div>
        ) : (
          displayed.map(item => {
            const cfg = TYPE_CONFIG[item.type] || DEFAULT_TYPE
            return (
              <button
                key={item.id}
                onClick={() => handleClick(item)}
                className={`
                  w-full flex items-start gap-3 px-4 py-3.5 text-left transition-colors
                  hover:bg-zinc-50 dark:hover:bg-zinc-800/60
                  ${!item.is_read ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}
                `}
              >
                {/* Icon */}
                <div className={`flex items-center justify-center h-10 w-10 rounded-xl text-lg shrink-0 ${cfg.color}`}>
                  <span role="img">{cfg.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm leading-snug ${!item.is_read ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-700 dark:text-zinc-300'}`}>
                      {item.title}
                    </p>
                    <ExternalLink className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100" />
                  </div>
                  {item.body && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-2">
                      {item.body}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    {item.actor && (
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        • {item.actor.nickname || item.actor.full_name || 'ไม่ระบุ'}
                      </span>
                    )}
                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                      {timeAgo(item.created_at)}
                    </span>
                  </div>
                </div>

                {/* Unread indicator + mark as read */}
                <div className="flex flex-col items-center gap-2 shrink-0 mt-0.5">
                  {!item.is_read ? (
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                  ) : (
                    <Check className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600" />
                  )}
                </div>
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
