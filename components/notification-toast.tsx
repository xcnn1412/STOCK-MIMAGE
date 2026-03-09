'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { X, ArrowRight } from 'lucide-react'
import { getNotifications, markAsRead, type NotificationItem } from '@/app/(authenticated)/notifications/actions'

// ============================================================================
// Notification Type → Config
// ============================================================================

const TYPE_CONFIG: Record<string, { icon: string; accent: string; glow: string }> = {
    job_assigned:         { icon: '⭐', accent: 'from-amber-500/20 to-orange-500/10', glow: 'shadow-amber-500/10' },
    job_status_changed:   { icon: '🔄', accent: 'from-blue-500/20 to-cyan-500/10', glow: 'shadow-blue-500/10' },
    job_mentioned:        { icon: '📣', accent: 'from-purple-500/20 to-violet-500/10', glow: 'shadow-purple-500/10' },
    job_comment:          { icon: '💬', accent: 'from-sky-500/20 to-blue-500/10', glow: 'shadow-sky-500/10' },
    ticket_assigned:      { icon: '🎫', accent: 'from-indigo-500/20 to-blue-500/10', glow: 'shadow-indigo-500/10' },
    ticket_reply:         { icon: '📝', accent: 'from-teal-500/20 to-emerald-500/10', glow: 'shadow-teal-500/10' },
    ticket_status_changed: { icon: '🔔', accent: 'from-cyan-500/20 to-teal-500/10', glow: 'shadow-cyan-500/10' },
    expense_approved:     { icon: '✅', accent: 'from-emerald-500/20 to-green-500/10', glow: 'shadow-emerald-500/10' },
    expense_rejected:     { icon: '❌', accent: 'from-red-500/20 to-rose-500/10', glow: 'shadow-red-500/10' },
}

const DEFAULT_CONFIG = { icon: '🔔', accent: 'from-zinc-500/20 to-zinc-400/10', glow: 'shadow-zinc-500/10' }

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

    return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

// ============================================================================
// Single Toast Card
// ============================================================================

interface ToastCardProps {
    item: NotificationItem
    onDismiss: (id: string) => void
    onNavigate: (item: NotificationItem) => void
    index: number
}

function ToastCard({ item, onDismiss, onNavigate, index }: ToastCardProps) {
    const [exiting, setExiting] = useState(false)
    const config = TYPE_CONFIG[item.type] || DEFAULT_CONFIG
    const timerRef = useRef<ReturnType<typeof setTimeout>>(null)

    // Auto-dismiss after 8 seconds
    useEffect(() => {
        timerRef.current = setTimeout(() => {
            handleDismiss()
        }, 8000)
        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleDismiss = useCallback(() => {
        setExiting(true)
        setTimeout(() => onDismiss(item.id), 300)
    }, [item.id, onDismiss])

    const handleClick = () => {
        onNavigate(item)
        handleDismiss()
    }

    return (
        <div
            className={`
                group relative w-[380px] overflow-hidden rounded-2xl
                bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl
                border border-zinc-200/60 dark:border-zinc-700/60
                shadow-2xl ${config.glow}
                transition-all duration-300 ease-out cursor-pointer
                hover:shadow-3xl hover:scale-[1.01] hover:border-zinc-300/80 dark:hover:border-zinc-600/80
                ${exiting
                    ? 'animate-toast-exit opacity-0 translate-x-[120%]'
                    : 'animate-toast-enter'
                }
            `}
            style={{
                animationDelay: `${index * 80}ms`,
                animationFillMode: 'both',
            }}
            onClick={handleClick}
            role="alert"
            aria-live="polite"
        >
            {/* Accent gradient strip */}
            <div className={`absolute inset-x-0 top-0 h-[3px] bg-linear-to-r ${config.accent} opacity-80`} />

            {/* Progress bar — auto-dismiss timer */}
            <div className="absolute inset-x-0 bottom-0 h-[2px] bg-zinc-100 dark:bg-zinc-800">
                <div
                    className="h-full bg-linear-to-r from-zinc-400/60 to-zinc-300/40 dark:from-zinc-500/60 dark:to-zinc-600/40 animate-toast-progress"
                    style={{ animationDuration: '8s' }}
                />
            </div>

            <div className="flex items-start gap-3.5 p-4 pr-10">
                {/* Icon */}
                <div className={`
                    flex items-center justify-center h-10 w-10 rounded-xl shrink-0
                    bg-linear-to-br ${config.accent}
                    ring-1 ring-black/5 dark:ring-white/5
                `}>
                    <span className="text-lg" role="img">{config.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 pt-0.5">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                        {item.title}
                    </p>
                    {item.body && (
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-1">
                            {item.body}
                        </p>
                    )}
                    <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 font-medium">
                            {timeAgo(item.created_at)}
                        </span>
                        {item.actor && (
                            <>
                                <span className="text-[11px] text-zinc-300 dark:text-zinc-600">•</span>
                                <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                    {item.actor.nickname || item.actor.full_name || 'ไม่ระบุ'}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Action hint — appears on hover */}
                    <div className="flex items-center gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <span className="text-[11px] font-medium text-blue-500 dark:text-blue-400">
                            คลิกเพื่อดูรายละเอียด
                        </span>
                        <ArrowRight className="h-3 w-3 text-blue-500 dark:text-blue-400" />
                    </div>
                </div>
            </div>

            {/* Dismiss button */}
            <button
                onClick={(e) => {
                    e.stopPropagation()
                    handleDismiss()
                }}
                className="
                    absolute top-3 right-3 flex items-center justify-center
                    h-6 w-6 rounded-lg
                    text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300
                    hover:bg-zinc-100 dark:hover:bg-zinc-800
                    opacity-0 group-hover:opacity-100
                    transition-all duration-200
                "
                aria-label="ปิด"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    )
}

// ============================================================================
// NotificationToastContainer — Desktop Only
// ============================================================================

export default function NotificationToastContainer() {
    const [toasts, setToasts] = useState<NotificationItem[]>([])
    const lastCountRef = useRef<number | null>(null)
    const shownIdsRef = useRef<Set<string>>(new Set())
    const router = useRouter()

    // Poll for new notifications
    useEffect(() => {
        const checkForNew = async () => {
            try {
                const res = await fetch('/api/notifications/count')
                if (!res.ok) return
                const { count } = await res.json()

                // Skip initial load — only trigger on increase
                if (lastCountRef.current === null) {
                    lastCountRef.current = count
                    return
                }

                if (count > lastCountRef.current) {
                    // Fetch the newest notifications
                    const newCount = count - lastCountRef.current
                    const items = await getNotifications(Math.min(newCount, 3))

                    // Filter out already-shown toasts
                    const freshItems = items.filter(
                        item => !item.is_read && !shownIdsRef.current.has(item.id)
                    )

                    if (freshItems.length > 0) {
                        // Mark as shown
                        freshItems.forEach(item => shownIdsRef.current.add(item.id))

                        // Add to toast queue (max 3 at a time)
                        setToasts(prev => [...freshItems.slice(0, 3), ...prev].slice(0, 3))
                    }
                }

                lastCountRef.current = count
            } catch { /* ignore network errors */ }
        }

        // Check every 15 seconds for faster detection
        checkForNew()
        const interval = setInterval(checkForNew, 15000)
        return () => clearInterval(interval)
    }, [])

    const handleDismiss = useCallback((id: string) => {
        setToasts(prev => prev.filter(t => t.id !== id))
    }, [])

    const handleNavigate = useCallback(async (item: NotificationItem) => {
        if (!item.is_read) {
            await markAsRead(item.id)
        }
        router.push(getNotificationUrl(item))
    }, [router])

    if (toasts.length === 0) return null

    return (
        // Desktop only — hidden on mobile
        <div
            className="hidden md:flex fixed top-16 right-5 z-200 flex-col gap-3 pointer-events-none"
            aria-label="การแจ้งเตือนแบบ pop-up"
        >
            {toasts.map((item, index) => (
                <div key={item.id} className="pointer-events-auto">
                    <ToastCard
                        item={item}
                        onDismiss={handleDismiss}
                        onNavigate={handleNavigate}
                        index={index}
                    />
                </div>
            ))}
        </div>
    )
}
