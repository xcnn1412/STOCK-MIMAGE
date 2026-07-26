'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Bell, CheckCheck, Check, ArrowLeft, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { getNotifications, markAsRead, markAllAsRead, type NotificationItem } from './actions'
import {
  categoryOf, CATEGORY_LABELS, CATEGORY_ORDER, type NotificationCategory,
  TYPE_CONFIG, DEFAULT_TYPE_CONFIG, DAY_ORDER, DAY_LABELS, dayGroupOf,
} from '@/components/notification-category'

// ============================================================================
// URL mapping
// ============================================================================

function getUrl(item: NotificationItem): string {
  switch (item.reference_type) {
    case 'job':           return `/jobs/${item.reference_id}`
    case 'ticket':        return `/jobs/tickets/${item.reference_id}`
    case 'expense_claim': return `/finance/${item.reference_id}`
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
  const [category, setCategory] = useState<NotificationCategory | 'all'>('all')

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

  // กรองหมวดอยู่ = เคลียร์เฉพาะหมวดนั้น
  const handleMarkAll = async () => {
    await markAllAsRead(category === 'all' ? undefined : category)
    setItems(prev => prev.map(n =>
      category === 'all' || categoryOf(n.type) === category ? { ...n, is_read: true } : n
    ))
  }

  const displayed = items.filter(n =>
    (filter === 'all' || !n.is_read) &&
    (category === 'all' || categoryOf(n.type) === category)
  )
  const unreadCount = items.filter(n => !n.is_read).length

  // แสดงเฉพาะหมวดที่มีรายการจริง + จำนวนที่ยังไม่อ่านของหมวดนั้น
  const availableCategories = CATEGORY_ORDER
    .filter(c => items.some(n => categoryOf(n.type) === c))
    .map(c => ({ key: c, unread: items.filter(n => !n.is_read && categoryOf(n.type) === c).length }))

  const groups = DAY_ORDER
    .map(g => ({ key: g, rows: displayed.filter(n => dayGroupOf(n.created_at) === g) }))
    .filter(g => g.rows.length > 0)

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
            {category === 'all' ? 'อ่านทั้งหมด' : `อ่านหมวด${CATEGORY_LABELS[category]}`}
          </Button>
        )}
      </div>

      {/* Filter tabs + category chips */}
      <div className="flex flex-wrap items-center gap-3">
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

        {/* Category chips */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setCategory('all')}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              category === 'all'
                ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                : 'bg-white text-zinc-500 border-zinc-200 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            ทั้งหมด
          </button>
          {availableCategories.map(c => (
            <button
              key={c.key}
              onClick={() => setCategory(c.key)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                category === c.key
                  ? 'bg-zinc-900 text-white border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100'
                  : 'bg-white text-zinc-500 border-zinc-200 hover:text-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:border-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              {CATEGORY_LABELS[c.key]}{c.unread > 0 ? ` (${c.unread})` : ''}
            </button>
          ))}
        </div>
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
          groups.map(group => (
            <div key={group.key}>
              {/* Day header */}
              <div className="sticky top-0 z-10 px-4 py-2 text-[11px] font-semibold tracking-wide text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/40 border-b border-zinc-100 dark:border-zinc-800">
                {DAY_LABELS[group.key]}
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {group.rows.map(item => {
            const cfg = TYPE_CONFIG[item.type] || DEFAULT_TYPE_CONFIG
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
          })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
