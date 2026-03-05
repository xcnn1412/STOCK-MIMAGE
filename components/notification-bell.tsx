'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Bell, Check, CheckCheck, ExternalLink } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { getNotifications, markAsRead, markAllAsRead, type NotificationItem } from '@/app/(authenticated)/notifications/actions'

// ============================================================================
// Notification Type → Icon & Color mapping
// ============================================================================

const TYPE_CONFIG: Record<string, { icon: string; color: string }> = {
  job_assigned: { icon: '⭐', color: 'text-amber-500' },
  job_status_changed: { icon: '🔄', color: 'text-blue-500' },
  job_mentioned: { icon: '📣', color: 'text-purple-500' },
  job_comment: { icon: '💬', color: 'text-sky-500' },
  ticket_assigned: { icon: '🎫', color: 'text-indigo-500' },
  ticket_reply: { icon: '📝', color: 'text-teal-500' },
  expense_approved: { icon: '✅', color: 'text-emerald-500' },
  expense_rejected: { icon: '❌', color: 'text-red-500' },
}

// ============================================================================
// Relative time helper
// ============================================================================

function timeAgo(dateStr: string): string {
  const now = new Date()
  const date = new Date(dateStr)
  const diffMs = now.getTime() - date.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'เมื่อสักครู่'
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`

  const diffHours = Math.floor(diffMin / 60)
  if (diffHours < 24) return `${diffHours} ชั่วโมงที่แล้ว`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays} วันที่แล้ว`

  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// ============================================================================
// Reference type → URL builder
// ============================================================================

function getNotificationUrl(item: NotificationItem): string {
  switch (item.reference_type) {
    case 'job':
      return `/jobs/${item.reference_id}`
    case 'ticket':
      return `/jobs/tickets/${item.reference_id}`
    case 'expense_claim':
      return `/finance`
    default:
      return '/dashboard'
  }
}

// ============================================================================
// NotificationBell Component
// ============================================================================

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [count, setCount] = useState(0)
  const [items, setItems] = useState<NotificationItem[]>([])
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const router = useRouter()

  // Poll unread count
  useEffect(() => {
    const fetchCount = async () => {
      try {
        const res = await fetch('/api/notifications/count')
        if (res.ok) {
          const data = await res.json()
          setCount(data.count || 0)
        }
      } catch { /* ignore */ }
    }

    fetchCount()
    const interval = setInterval(fetchCount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Load notifications when dropdown opens
  const loadNotifications = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getNotifications(30)
      setItems(data)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) loadNotifications()
  }, [open, loadNotifications])

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Handle notification click
  const handleClick = async (item: NotificationItem) => {
    if (!item.is_read) {
      await markAsRead(item.id)
      setItems(prev => prev.map(n => n.id === item.id ? { ...n, is_read: true } : n))
      setCount(prev => Math.max(0, prev - 1))
    }
    setOpen(false)
    router.push(getNotificationUrl(item))
  }

  // Mark all as read
  const handleMarkAllRead = async () => {
    await markAllAsRead()
    setItems(prev => prev.map(n => ({ ...n, is_read: true })))
    setCount(0)
  }

  return (
    <div ref={ref} className="relative">
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative flex items-center justify-center h-9 w-9 rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-200 dark:hover:bg-zinc-800 transition-colors duration-200"
        aria-label="การแจ้งเตือน"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white dark:ring-zinc-900 animate-in zoom-in duration-200">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="fixed md:absolute inset-x-2 md:inset-x-auto md:right-0 top-14 md:top-full md:mt-2 w-auto md:w-[380px] max-h-[480px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-2xl z-100 flex flex-col animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 shrink-0">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              การแจ้งเตือน
              {count > 0 && (
                <span className="ml-2 text-xs font-medium text-zinc-400 dark:text-zinc-500">
                  ({count} ใหม่)
                </span>
              )}
            </h3>
            {count > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium transition-colors"
              >
                <CheckCheck className="h-3 w-3" />
                อ่านทั้งหมด
              </button>
            )}
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
            {loading ? (
              <div className="flex items-center justify-center py-8 text-sm text-zinc-400">
                กำลังโหลด...
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-zinc-400 dark:text-zinc-500">
                <Bell className="h-8 w-8 mb-2 opacity-40" />
                <p className="text-sm">ไม่มีการแจ้งเตือน</p>
              </div>
            ) : (
              items.map(item => {
                const config = TYPE_CONFIG[item.type] || { icon: '🔔', color: 'text-zinc-500' }
                return (
                  <button
                    key={item.id}
                    onClick={() => handleClick(item)}
                    className={`
                      w-full flex items-start gap-3 px-4 py-3 text-left transition-colors duration-150
                      hover:bg-zinc-50 dark:hover:bg-zinc-800/60
                      ${!item.is_read ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}
                      border-b border-zinc-50 dark:border-zinc-800/50 last:border-b-0
                    `}
                  >
                    {/* Icon */}
                    <span className="text-base mt-0.5 shrink-0" role="img">
                      {config.icon}
                    </span>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-snug ${!item.is_read ? 'font-semibold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}>
                        {item.title}
                      </p>
                      {item.body && (
                        <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 line-clamp-1">
                          {item.body}
                        </p>
                      )}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                          {timeAgo(item.created_at)}
                        </span>
                        {item.actor && (
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            • {item.actor.nickname || item.actor.full_name || 'ไม่ระบุ'}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Unread dot */}
                    {!item.is_read && (
                      <span className="mt-2 h-2 w-2 rounded-full bg-blue-500 shrink-0" />
                    )}
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          {items.length > 0 && (
            <div className="border-t border-zinc-100 dark:border-zinc-800 px-4 py-2 shrink-0">
              <button
                onClick={() => { setOpen(false); router.push('/dashboard') }}
                className="flex items-center justify-center gap-1 w-full text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300 font-medium transition-colors py-1"
              >
                <ExternalLink className="h-3 w-3" />
                ดูทั้งหมด
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
