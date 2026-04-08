'use client'

import { useState, useCallback, useTransition, useOptimistic, memo } from 'react'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Pencil, Trash2, CircleHelp } from 'lucide-react'
import { updateMyTicketStatus, deleteMyTicket } from '../actions'
import { useRouter } from 'next/navigation'
import type { PersonalTicket, PersonalSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Helpers (exported for dashboard reuse)
// ============================================================================

export function getMyTicketStatuses(settings: PersonalSetting[]): string[] {
    return settings
        .filter(s => s.category === 'status_ticket' && s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(s => s.value)
}

export function getMyTicketStatusConfig(settings: PersonalSetting[], status: string) {
    const s = settings.find(st => st.category === 'status_ticket' && st.value === status)
    if (!s) return { label: status, labelTh: status, color: '#9ca3af' }
    return { label: s.label_en, labelTh: s.label_th, color: s.color || '#9ca3af' }
}

// ============================================================================
// Board
// ============================================================================

interface MyTicketKanbanBoardProps {
    tickets: PersonalTicket[]
    settings: PersonalSetting[]
    ticketCategory: string
    onEdit?: (ticket: PersonalTicket) => void
    readonly?: boolean
    /** When set (admin view), mutations target this user instead of logged-in user */
    adminTargetUserId?: string
}

export function MyTicketKanbanBoard({ tickets, settings, ticketCategory, onEdit, readonly, adminTargetUserId }: MyTicketKanbanBoardProps) {
    const { locale }    = useLocale()
    const [draggingId, setDraggingId]         = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
    const [, startTransition] = useTransition()

    const [optimisticTickets, setOptimisticTickets] = useOptimistic(
        tickets,
        (current: PersonalTicket[], { id, status }: { id: string; status: string }) =>
            current.map(t => t.id === id ? { ...t, status } : t)
    )

    const canEdit = !readonly || !!adminTargetUserId
    const statuses = getMyTicketStatuses(settings)
    const [mobileTab, setMobileTab] = useState<string>(statuses[0] || '')

    const getStatusLabel = (status: string) => {
        const cfg = getMyTicketStatusConfig(settings, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }

    const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
        if (!canEdit) return
        e.dataTransfer.setData('text/plain', id)
        e.dataTransfer.effectAllowed = 'move'
        setDraggingId(id)
    }, [canEdit])

    const handleDragOver  = useCallback((e: React.DragEvent, s: string) => { e.preventDefault(); setDragOverStatus(s) }, [])
    const handleDragLeave = useCallback(() => setDragOverStatus(null), [])
    const handleDragEnd   = useCallback(() => { setDraggingId(null); setDragOverStatus(null) }, [])

    const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
        e.preventDefault()
        const id = e.dataTransfer.getData('text/plain')
        setDraggingId(null)
        setDragOverStatus(null)
        if (!id || !canEdit) return
        const ticket = tickets.find(t => t.id === id)
        if (!ticket || ticket.status === newStatus) return

        startTransition(async () => {
            setOptimisticTickets({ id, status: newStatus })
            await updateMyTicketStatus(id, newStatus, adminTargetUserId)
        })
    }, [tickets, canEdit, adminTargetUserId])

    const categoryTickets = optimisticTickets.filter(t => t.category === ticketCategory)

    if (statuses.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-400 text-sm">
                    {locale === 'th' ? 'ยังไม่มีสถานะ Ticket — ไปตั้งค่าก่อนนะ' : 'No ticket statuses yet — configure in Settings first'}
                </p>
            </div>
        )
    }

    return (
        <>
            {/* ====== Mobile: tab-based ====== */}
            <div className="md:hidden">
                <div className="flex gap-1.5 overflow-x-auto pb-2 -mx-2 px-2 mb-3" style={{ scrollbarWidth: 'none' }}>
                    {statuses.map(status => {
                        const cfg      = getMyTicketStatusConfig(settings, status)
                        const count    = categoryTickets.filter(t => t.status === status).length
                        const isActive = mobileTab === status
                        return (
                            <button
                                key={status}
                                onClick={() => setMobileTab(status)}
                                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide whitespace-nowrap shrink-0 transition-all ${
                                    isActive
                                        ? 'text-white shadow-md'
                                        : 'bg-zinc-100 dark:bg-zinc-800/60 text-zinc-500 hover:bg-zinc-200'
                                }`}
                                style={isActive ? { backgroundColor: cfg.color } : undefined}
                            >
                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: isActive ? '#fff' : cfg.color }} />
                                {getStatusLabel(status)}
                                <span className={`ml-0.5 flex items-center justify-center h-5 min-w-[20px] px-1 rounded-full text-[11px] font-bold ${
                                    isActive ? 'bg-white/25 text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600'
                                }`}>{count}</span>
                            </button>
                        )
                    })}
                </div>
                {statuses.filter(s => s === mobileTab).map(status => (
                    <div key={status} className="space-y-2">
                        {categoryTickets.filter(t => t.status === status).length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-zinc-300 text-sm">
                                {locale === 'th' ? 'ลาก ticket มาวางที่นี่' : 'Drop ticket here'}
                            </div>
                        ) : (
                            categoryTickets.filter(t => t.status === status).map(ticket => (
                                <MemoTicketCard
                                    key={ticket.id}
                                    ticket={ticket}
                                    statusColor={getMyTicketStatusConfig(settings, status).color}
                                    isDragging={false}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onEdit={canEdit ? onEdit : undefined}
                                    readonly={!canEdit}
                                    adminTargetUserId={adminTargetUserId}
                                />
                            ))
                        )}
                    </div>
                ))}
            </div>

            {/* ====== Desktop: columns ====== */}
            <div className="hidden md:flex gap-4 overflow-x-auto pb-4 px-1" style={{ scrollbarWidth: 'thin', minHeight: 'calc(100vh - 320px)' }}>
                {statuses.map(status => {
                    const cfg          = getMyTicketStatusConfig(settings, status)
                    const statusTickets= categoryTickets.filter(t => t.status === status)
                    const isDragOver   = dragOverStatus === status

                    return (
                        <div
                            key={status}
                            className={`flex flex-col rounded-2xl flex-1 min-w-[260px] transition-all ${
                                isDragOver
                                    ? 'ring-2 ring-violet-400/60 bg-violet-50/40 dark:bg-violet-950/20 scale-[1.01]'
                                    : 'bg-zinc-50/80 dark:bg-zinc-900/50 shadow-sm'
                            }`}
                            onDragOver={e => handleDragOver(e, status)}
                            onDragLeave={handleDragLeave}
                            onDrop={e => handleDrop(e, status)}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                                <div className="flex items-center gap-2">
                                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
                                    <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300">{getStatusLabel(status)}</span>
                                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{statusTickets.length}</Badge>
                                </div>
                            </div>

                            {/* Cards */}
                            <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                                {statusTickets.length === 0 ? (
                                    <div className={`flex items-center justify-center h-16 rounded-xl text-xs transition-all ${
                                        isDragOver ? 'border-2 border-dashed border-violet-300 text-violet-400' : 'text-zinc-300'
                                    }`}>
                                        {isDragOver ? (locale === 'th' ? 'วางที่นี่' : 'Drop here') : ''}
                                    </div>
                                ) : (
                                    statusTickets.map(ticket => (
                                        <MemoTicketCard
                                            key={ticket.id}
                                            ticket={ticket}
                                            statusColor={cfg.color}
                                            isDragging={draggingId === ticket.id}
                                            onDragStart={handleDragStart}
                                            onDragEnd={handleDragEnd}
                                            onEdit={canEdit ? onEdit : undefined}
                                            readonly={!canEdit}
                                            adminTargetUserId={adminTargetUserId}
                                        />
                                    ))
                                )}
                            </div>
                        </div>
                    )
                })}
            </div>
        </>
    )
}

// ============================================================================
// Ticket Card
// ============================================================================

const PRIORITY_CONFIG: Record<string, { label: string; labelTh: string; color: string }> = {
    urgent: { label: 'Urgent', labelTh: 'ด่วนที่สุด', color: '#ef4444' },
    high:   { label: 'High',   labelTh: 'ด่วน',       color: '#f59e0b' },
    medium: { label: 'Medium', labelTh: 'ปกติ',        color: '#3b82f6' },
    low:    { label: 'Low',    labelTh: 'ต่ำ',          color: '#71717a' },
}

interface TicketCardProps {
    ticket: PersonalTicket
    statusColor: string
    isDragging: boolean
    onDragStart: (e: React.DragEvent, id: string) => void
    onDragEnd: () => void
    onEdit?: (ticket: PersonalTicket) => void
    readonly?: boolean
    adminTargetUserId?: string
}

function TicketCard({ ticket, statusColor, isDragging, onDragStart, onDragEnd, onEdit, readonly, adminTargetUserId }: TicketCardProps) {
    const { locale } = useLocale()
    const router     = useRouter()
    const [, startTransition] = useTransition()

    const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.medium
    const isOverdue = ticket.status !== 'closed'

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(locale === 'th' ? 'ลบ Ticket นี้?' : 'Delete this ticket?')) return
        startTransition(async () => { await deleteMyTicket(ticket.id, adminTargetUserId); router.refresh() })
    }

    return (
        <div
            draggable={!readonly}
            onDragStart={e => onDragStart(e, ticket.id)}
            onDragEnd={onDragEnd}
            className={`group relative bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 p-3 shadow-sm hover:shadow-md transition-all ${
                readonly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
            } ${isDragging ? 'opacity-50 scale-[0.97]' : ''}`}
        >
            <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ backgroundColor: statusColor }} />

            <div className="flex items-start gap-2">
                <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: priority.color }} />
                <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-2">
                    {ticket.subject}
                </p>
                {!readonly && (
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        {onEdit && (
                            <button onClick={e => { e.stopPropagation(); onEdit(ticket) }}
                                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-violet-600 transition-colors">
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <button onClick={handleDelete}
                            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors">
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {ticket.description && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mt-1.5 pl-4">{ticket.description}</p>
            )}

            {/* Questions list */}
            {ticket.questions && ticket.questions.length > 0 && (
                <div className="mt-2 pl-4 space-y-1">
                    <div className="flex items-center gap-1 mb-1">
                        <CircleHelp className="h-3 w-3 text-pink-400" />
                        <span className="text-[10px] font-semibold text-pink-400 uppercase tracking-wide">
                            {locale === 'th' ? 'คำถาม' : 'Questions'} ({ticket.questions.length})
                        </span>
                    </div>
                    {ticket.questions.slice(0, 3).map((q, i) => (
                        <div key={i} className="flex items-start gap-1.5">
                            <span className="flex items-center justify-center h-4 w-4 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-500 text-[9px] font-bold shrink-0 mt-0.5">
                                {i + 1}
                            </span>
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-1">{q}</p>
                        </div>
                    ))}
                    {ticket.questions.length > 3 && (
                        <p className="text-[10px] text-pink-400 pl-5">+{ticket.questions.length - 3} {locale === 'th' ? 'ข้อ' : 'more'}</p>
                    )}
                </div>
            )}

            <div className="flex items-center gap-2 mt-2 pl-4">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">{ticket.category}</Badge>
                {ticket.status !== 'closed' && (
                    <AlertCircle className="h-3 w-3 text-zinc-300" />
                )}
            </div>
        </div>
    )
}

const MemoTicketCard = memo(TicketCard)
