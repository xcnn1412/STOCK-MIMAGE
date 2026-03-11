'use client'

import { useState, useCallback, useTransition, useOptimistic, memo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
    AlertCircle, User, Clock, Paperclip, MessageSquare,
    GripVertical, ChevronDown, ChevronRight, Target, Flag, Archive
} from 'lucide-react'
import { updateTicketStatus, archiveTicket } from '../actions'
import { useRouter } from 'next/navigation'
import type { Ticket, JobSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'
import { htmlToPlainText } from '@/lib/rich-text-utils'

// ============================================================================
// Ticket Kanban Board — CRM-style with soft shadows
// ============================================================================

interface TicketKanbanBoardProps {
    tickets: Ticket[]
    settings: JobSetting[]
    ticketCategory: string
}

function getTicketStatuses(settings: JobSetting[]): string[] {
    return settings
        .filter(s => s.category === 'status_ticket' && s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(s => s.value)
}

function getTicketStatusConfig(settings: JobSetting[], status: string) {
    const s = settings.find(st => st.category === 'status_ticket' && st.value === status)
    if (!s) return { label: 'Unknown', labelTh: 'ไม่ทราบ', color: '#9ca3af' }
    return { label: s.label_en, labelTh: s.label_th, color: s.color || '#9ca3af' }
}

export { getTicketStatuses, getTicketStatusConfig }

export function TicketKanbanBoard({ tickets, settings, ticketCategory }: TicketKanbanBoardProps) {
    const { locale } = useLocale()
    const [draggingId, setDraggingId] = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const [optimisticTickets, setOptimisticTickets] = useOptimistic(
        tickets,
        (current: Ticket[], { ticketId, newStatus }: { ticketId: string; newStatus: string }) =>
            current.map(t => t.id === ticketId ? { ...t, status: newStatus } : t)
    )

    const statuses = getTicketStatuses(settings)
    const [mobileTab, setMobileTab] = useState<string>(statuses[0] || '')
    const [collapsedCols, setCollapsedCols] = useState<Set<string>>(new Set())

    const getStatusLabel = (status: string) => {
        const cfg = getTicketStatusConfig(settings, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }

    const handleDragStart = useCallback((e: React.DragEvent, ticketId: string) => {
        e.dataTransfer.setData('text/plain', ticketId)
        e.dataTransfer.effectAllowed = 'move'
        setDraggingId(ticketId)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverStatus(status)
    }, [])

    const handleDragLeave = useCallback(() => setDragOverStatus(null), [])

    const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
        e.preventDefault()
        const ticketId = e.dataTransfer.getData('text/plain')
        setDraggingId(null)
        setDragOverStatus(null)
        if (!ticketId) return
        const ticket = tickets.find(t => t.id === ticketId)
        if (!ticket || ticket.status === newStatus) return

        startTransition(async () => {
            setOptimisticTickets({ ticketId, newStatus })
            await updateTicketStatus(ticketId, newStatus)
        })
    }, [tickets, startTransition, setOptimisticTickets])

    const handleDragEnd = useCallback(() => {
        setDraggingId(null)
        setDragOverStatus(null)
    }, [])

    const toggleColumn = useCallback((status: string) => {
        setCollapsedCols(prev => {
            const next = new Set(prev)
            if (next.has(status)) next.delete(status)
            else next.add(status)
            return next
        })
    }, [])

    // Filter tickets by selected category
    const categoryTickets = optimisticTickets.filter(t => t.category === ticketCategory)

    return (
        <>
            {/* ====== MOBILE: Tab-based View (<md) ====== */}
            <div className="md:hidden">
                <div
                    className="flex gap-1.5 overflow-x-auto pb-2 -mx-2 px-2 mb-3"
                    style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                >
                    {statuses.map(status => {
                        const config = getTicketStatusConfig(settings, status)
                        const count = categoryTickets.filter(t => t.status === status).length
                        const isActive = mobileTab === status
                        return (
                            <button
                                key={status}
                                onClick={() => setMobileTab(status)}
                                className={`
                                    flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide
                                    whitespace-nowrap shrink-0 transition-all duration-200
                                    ${isActive
                                        ? 'text-white shadow-md scale-[1.02]'
                                        : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                    }
                                `}
                                style={isActive ? { backgroundColor: config.color } : undefined}
                            >
                                <span
                                    className="h-2 w-2 rounded-full shrink-0"
                                    style={{ backgroundColor: isActive ? '#fff' : config.color }}
                                />
                                {getStatusLabel(status)}
                                <span className={`ml-0.5 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[11px] font-bold
                                    ${isActive ? 'bg-white/25 text-white' : 'bg-zinc-200/80 dark:bg-zinc-700/80 text-zinc-600 dark:text-zinc-300'}
                                `}>
                                    {count}
                                </span>
                            </button>
                        )
                    })}
                </div>

                {statuses.map(status => {
                    if (status !== mobileTab) return null
                    const config = getTicketStatusConfig(settings, status)
                    const statusTickets = categoryTickets.filter(t => t.status === status)
                    return (
                        <div key={status} className="space-y-2">
                            {statusTickets.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-zinc-300 dark:text-zinc-700 border-2 border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl">
                                    <div className="text-sm font-medium">
                                        {locale === 'th' ? 'ลาก ticket มาวางที่นี่' : 'Drop ticket here'}
                                    </div>
                                </div>
                            ) : (
                                statusTickets.map(ticket => (
                                    <MemoTicketCard
                                        key={ticket.id}
                                        ticket={ticket}
                                        settings={settings}
                                        statusColor={config.color}
                                        isDragging={false}
                                        onDragStart={handleDragStart}
                                        onDragEnd={handleDragEnd}
                                    />
                                ))
                            )}
                        </div>
                    )
                })}
            </div>

            {/* ====== DESKTOP: Multi-column View (md+) ====== */}
            <div
                className="hidden md:flex gap-4 overflow-x-auto pb-4 px-1"
                style={{
                    scrollbarWidth: 'thin',
                    minHeight: 'calc(100vh - 320px)',
                }}
            >
                {statuses.map(status => {
                    const config = getTicketStatusConfig(settings, status)
                    const statusTickets = categoryTickets.filter(t => t.status === status)
                    const isDragOver = dragOverStatus === status
                    const isCollapsed = collapsedCols.has(status)

                    return (
                        <div
                            key={status}
                            className={`flex flex-col rounded-2xl transition-all duration-300 
                                ${isCollapsed ? 'min-w-[48px] max-w-[48px]' : 'flex-1 min-w-[260px]'} 
                                ${isDragOver
                                    ? 'ring-2 ring-blue-400/60 dark:ring-blue-500/40 bg-blue-50/40 dark:bg-blue-950/20 scale-[1.01]'
                                    : 'bg-zinc-50/80 dark:bg-zinc-900/50 shadow-sm shadow-zinc-200/60 dark:shadow-zinc-950/40'
                                }
                                border border-zinc-200/50 dark:border-zinc-800/50
                            `}
                            onDragOver={e => handleDragOver(e, status)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(e, status)}
                        >
                            {/* Column Header */}
                            <div
                                className="px-3.5 pt-3.5 pb-2 cursor-pointer select-none"
                                onClick={() => toggleColumn(status)}
                            >
                                {isCollapsed ? (
                                    <div className="flex flex-col items-center gap-2">
                                        <div
                                            className="h-3 w-3 rounded-full shadow-sm"
                                            style={{ backgroundColor: config.color }}
                                        />
                                        <span className="text-[12px] font-bold text-zinc-500 dark:text-zinc-400 [writing-mode:vertical-lr] tracking-wider uppercase">
                                            {getStatusLabel(status)}
                                        </span>
                                        <span className="flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full bg-zinc-200/80 dark:bg-zinc-700/80 text-[12px] font-bold text-zinc-600 dark:text-zinc-300">
                                            {statusTickets.length}
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <ChevronDown className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                        <div
                                            className="h-3 w-3 rounded-full shadow-sm"
                                            style={{ backgroundColor: config.color }}
                                        />
                                        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-200 tracking-tight uppercase">
                                            {getStatusLabel(status)}
                                        </span>
                                        <span className="ml-auto flex items-center justify-center h-5 min-w-[20px] px-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-700/70 text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                                            {statusTickets.length}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {!isCollapsed && (
                                <>
                                    {/* Color accent bar */}
                                    <div className="mx-3.5 h-[2px] rounded-full mb-2.5 opacity-40" style={{ backgroundColor: config.color }} />

                                    {/* Cards */}
                                    <div className="flex flex-col gap-2.5 px-2.5 pb-3 min-h-[120px] flex-1">
                                        {statusTickets.length === 0 && (
                                            <div className="flex flex-col items-center justify-center h-[100px] text-zinc-300 dark:text-zinc-700 border-2 border-dashed border-zinc-200/80 dark:border-zinc-800 rounded-xl">
                                                <div className="text-[13px] font-medium">
                                                    {locale === 'th' ? 'ลาก ticket มาวางที่นี่' : 'Drop ticket here'}
                                                </div>
                                            </div>
                                        )}
                                        {statusTickets.map(ticket => (
                                            <MemoTicketCard
                                                key={ticket.id}
                                                ticket={ticket}
                                                settings={settings}
                                                statusColor={config.color}
                                                isDragging={draggingId === ticket.id}
                                                onDragStart={handleDragStart}
                                                onDragEnd={handleDragEnd}
                                            />
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    )
                })}
            </div>
        </>
    )
}

// ============================================================================
// Ticket Card — Premium CRM-style Design
// ============================================================================

const PRIORITY_CONFIG: Record<string, { label: string; labelTh: string; color: string; icon: string }> = {
    urgent: { label: 'Urgent', labelTh: 'ด่วนที่สุด', color: '#ef4444', icon: '🔴' },
    high: { label: 'High', labelTh: 'ด่วน', color: '#f59e0b', icon: '🟠' },
    normal: { label: 'Normal', labelTh: 'ปกติ', color: '#3b82f6', icon: '🔵' },
}

function TicketCard({
    ticket,
    settings,
    statusColor,
    isDragging,
    onDragStart,
    onDragEnd,
}: {
    ticket: Ticket
    settings: JobSetting[]
    statusColor: string
    isDragging: boolean
    onDragStart: (e: React.DragEvent, id: string) => void
    onDragEnd: () => void
}) {
    const { locale } = useLocale()
    const [archiving, setArchiving] = useState(false)
    const router = useRouter()
    const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal

    const handleArchive = async (e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm(locale === 'th' ? 'ย้าย ticket นี้ไปคลังเก็บ?' : 'Archive this ticket?')) return
        setArchiving(true)
        await archiveTicket(ticket.id)
        setArchiving(false)
        router.refresh()
    }

    const outcomeSetting = settings.find(s => s.category === 'ticket_outcome' && s.value === ticket.desired_outcome)
    const outcomeLabel = outcomeSetting
        ? (locale === 'th' ? outcomeSetting.label_th : outcomeSetting.label_en)
        : null
    const outcomeColor = outcomeSetting?.color || '#6b7280'

    const categorySetting = settings.find(s => s.category === 'ticket_category' && s.value === ticket.category)
    const categoryColor = categorySetting?.color || '#6b7280'

    const timeAgo = getTimeAgo(ticket.created_at, locale)

    return (
        <div className="group">
            <Link href={`/jobs/tickets/${ticket.id}`}>
                <div
                    draggable
                    onDragStart={e => { e.stopPropagation(); onDragStart(e, ticket.id) }}
                    onDragEnd={onDragEnd}
                    className={`
                        relative bg-white dark:bg-zinc-800/90 rounded-xl overflow-hidden
                        border border-zinc-200/70 dark:border-zinc-700/50
                        cursor-pointer active:cursor-grabbing
                        transition-all duration-200 ease-out
                        hover:shadow-lg hover:shadow-zinc-200/50 dark:hover:shadow-zinc-900/50
                        hover:-translate-y-0.5 hover:border-zinc-300 dark:hover:border-zinc-600
                        ${isDragging ? 'opacity-40 rotate-2 scale-95 shadow-2xl' : 'shadow-sm shadow-zinc-100 dark:shadow-zinc-900/30'}
                    `}
                >
                    {/* Top color accent bar */}
                    <div
                        className="h-1.5 w-full"
                        style={{ background: `linear-gradient(90deg, ${statusColor}, ${statusColor}90)` }}
                    />

                    <div className="p-3 sm:p-3.5 space-y-2.5">
                        {/* Header: Ticket Number + Priority + Archive */}
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">
                                {ticket.ticket_number}
                            </span>
                            <div className="flex items-center gap-1.5">
                                <Badge
                                    className="text-[10px] px-1.5 py-0 border-0 font-bold"
                                    style={{ backgroundColor: `${priority.color}15`, color: priority.color }}
                                >
                                    <Flag className="h-2.5 w-2.5 mr-0.5" />
                                    {locale === 'th' ? priority.labelTh : priority.label}
                                </Badge>
                                <button
                                    onClick={handleArchive}
                                    disabled={archiving}
                                    className="p-1 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors opacity-0 group-hover:opacity-100"
                                    title={locale === 'th' ? 'เก็บเข้าคลัง' : 'Archive'}
                                >
                                    <Archive className={`h-3 w-3 transition-colors ${archiving ? 'text-amber-400 animate-pulse' : 'text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400'}`} />
                                </button>
                            </div>
                        </div>

                        {/* Subject */}
                        <div className="font-semibold text-[14px] text-zinc-900 dark:text-zinc-100 leading-snug line-clamp-2">
                            {ticket.subject}
                        </div>

                        {/* Description snippet */}
                        {ticket.description && (
                            <p className="text-[12px] text-zinc-500 dark:text-zinc-400 line-clamp-2 leading-relaxed">
                                {htmlToPlainText(ticket.description)}
                            </p>
                        )}

                        {/* Desired Outcome Badge */}
                        {outcomeLabel && (
                            <div>
                                <span
                                    className="inline-flex items-center gap-1.5 text-[11px] font-bold px-2 py-0.5 rounded-full"
                                    style={{
                                        backgroundColor: `${outcomeColor}15`,
                                        color: outcomeColor,
                                        boxShadow: `inset 0 0 0 1px ${outcomeColor}25`,
                                    }}
                                >
                                    <Target className="h-3 w-3" />
                                    {outcomeLabel}
                                </span>
                            </div>
                        )}

                        {/* Footer: Author + Time + Attachments */}
                        <div className="flex items-center justify-between pt-2 border-t border-zinc-100 dark:border-zinc-700/40">
                            <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                                <User className="h-3 w-3" />
                                <span className="truncate max-w-[100px]">
                                    {ticket.profiles?.full_name || '—'}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-zinc-400 dark:text-zinc-500">
                                {(ticket.attachments?.length || 0) > 0 && (
                                    <span className="flex items-center gap-0.5">
                                        <Paperclip className="h-3 w-3" />
                                        {ticket.attachments.length}
                                    </span>
                                )}
                                <span className="flex items-center gap-0.5">
                                    <Clock className="h-3 w-3" />
                                    {timeAgo}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </Link>
        </div>
    )
}

// ---- Helpers ----

function getTimeAgo(dateStr: string, locale: string): string {
    const now = new Date()
    const date = new Date(dateStr)
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return locale === 'th' ? 'เมื่อสักครู่' : 'just now'
    if (diffMins < 60) return locale === 'th' ? `${diffMins} นาทีที่แล้ว` : `${diffMins}m ago`
    if (diffHours < 24) return locale === 'th' ? `${diffHours} ชม.ที่แล้ว` : `${diffHours}h ago`
    if (diffDays < 7) return locale === 'th' ? `${diffDays} วันที่แล้ว` : `${diffDays}d ago`
    return date.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', { month: 'short', day: 'numeric' })
}

const MemoTicketCard = memo(TicketCard, (prev, next) => {
    return (
        prev.ticket === next.ticket &&
        prev.isDragging === next.isDragging &&
        prev.statusColor === next.statusColor &&
        prev.settings === next.settings
    )
})
