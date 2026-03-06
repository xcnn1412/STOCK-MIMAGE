'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    ArrowLeft, Clock, User, Flag, Target, Paperclip, Send,
    MessageCircle, CheckCircle, HelpCircle, XCircle, Info,
    Trash2, Archive
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import MentionTextarea from '@/components/mention-textarea'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { createTicketReply, updateTicketStatus, deleteTicket, archiveTicket } from '../../actions'
import type { Ticket, TicketReply, JobSetting } from '../../actions'
import { getTicketStatusConfig } from '../../components/ticket-kanban-board'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Types
// ============================================================================

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

// ============================================================================
// Ticket Detail Component
// ============================================================================

interface TicketDetailProps {
    ticket: Ticket
    replies: TicketReply[]
    settings: JobSetting[]
    users: SystemUser[]
    categories: JobSetting[]
}

const PRIORITY_CONFIG: Record<string, { label: string; labelTh: string; color: string }> = {
    urgent: { label: 'Urgent', labelTh: 'ด่วนที่สุด', color: '#ef4444' },
    high: { label: 'High', labelTh: 'ด่วน', color: '#f59e0b' },
    normal: { label: 'Normal', labelTh: 'ปกติ', color: '#3b82f6' },
}

const REPLY_TYPE_CONFIG: Record<string, { icon: React.ReactNode; label: string; labelTh: string; color: string }> = {
    comment: { icon: <MessageCircle className="h-4 w-4" />, label: 'Comment', labelTh: 'ความคิดเห็น', color: '#6b7280' },
    approval: { icon: <CheckCircle className="h-4 w-4" />, label: 'Approved', labelTh: 'อนุมัติ', color: '#10b981' },
    advice: { icon: <HelpCircle className="h-4 w-4" />, label: 'Advice', labelTh: 'คำแนะนำ', color: '#3b82f6' },
    rejection: { icon: <XCircle className="h-4 w-4" />, label: 'Rejected', labelTh: 'ปฏิเสธ', color: '#ef4444' },
    status_change: { icon: <Info className="h-4 w-4" />, label: 'Status Changed', labelTh: 'เปลี่ยนสถานะ', color: '#8b5cf6' },
}

export default function TicketDetail({ ticket, replies, settings, users, categories }: TicketDetailProps) {
    const { locale } = useLocale()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [replyContent, setReplyContent] = useState('')
    const [replyType, setReplyType] = useState('comment')
    const [mentionedUsers, setMentionedUsers] = useState<string[]>([])

    const priority = PRIORITY_CONFIG[ticket.priority] || PRIORITY_CONFIG.normal
    const statusConfig = getTicketStatusConfig(settings, ticket.status)

    // Render mention text: @[Name](userId) → styled badge
    const renderMentionContent = (text: string) => {
        const parts = text.split(/(@\[[^\]]+\]\([^)]+\))/g)
        return parts.map((part, i) => {
            const match = part.match(/@\[([^\]]+)\]\(([^)]+)\)/)
            if (match) {
                return (
                    <span key={i} className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 text-xs font-semibold mx-0.5">
                        @{match[1]}
                    </span>
                )
            }
            return <span key={i}>{part}</span>
        })
    }

    const categorySetting = categories.find(c => c.value === ticket.category)
    const categoryLabel = categorySetting
        ? (locale === 'th' ? categorySetting.label_th : categorySetting.label_en)
        : ticket.category
    const categoryColor = categorySetting?.color || '#6b7280'

    const outcomeSetting = settings.find(s => s.category === 'ticket_outcome' && s.value === ticket.desired_outcome)
    const outcomeLabel = outcomeSetting
        ? (locale === 'th' ? outcomeSetting.label_th : outcomeSetting.label_en)
        : null

    const ticketStatuses = settings
        .filter(s => s.category === 'status_ticket' && s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)

    const getUserName = (userId: string | null) => {
        if (!userId) return locale === 'th' ? 'ไม่ทราบ' : 'Unknown'
        const user = users.find(u => u.id === userId)
        return user?.full_name || userId.slice(0, 8)
    }

    const handleSendReply = () => {
        if (!replyContent.trim()) return
        const formData = new FormData()
        formData.set('reply_type', replyType)
        formData.set('content', replyContent.trim())
        formData.set('attachments', '[]')
        // Pass mentioned user IDs for notification
        if (mentionedUsers.length > 0) {
            formData.set('notify_users', mentionedUsers.join(','))
        }

        startTransition(async () => {
            await createTicketReply(ticket.id, formData)
            setReplyContent('')
            setReplyType('comment')
            setMentionedUsers([])
        })
    }

    const handleStatusChange = (newStatus: string) => {
        startTransition(async () => {
            await updateTicketStatus(ticket.id, newStatus)
        })
    }

    const handleDelete = () => {
        if (!confirm(locale === 'th' ? 'ต้องการลบ ticket นี้?' : 'Delete this ticket?')) return
        startTransition(async () => {
            await deleteTicket(ticket.id)
            router.push('/jobs')
        })
    }

    const handleArchive = () => {
        if (!confirm(locale === 'th' ? 'ย้าย ticket นี้ไปคลังเก็บ?' : 'Archive this ticket?')) return
        startTransition(async () => {
            await archiveTicket(ticket.id)
            router.push('/jobs')
        })
    }

    const formatDate = (dateStr: string) => {
        const d = new Date(dateStr)
        return d.toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit',
        })
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            {/* Back Button */}
            <Link
                href="/jobs"
                className="inline-flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
                <ArrowLeft className="h-4 w-4" />
                {locale === 'th' ? 'กลับ' : 'Back'}
            </Link>

            {/* Header Card */}
            <div className="relative bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden shadow-sm">
                {/* Color bar */}
                <div className="h-2" style={{ background: `linear-gradient(90deg, ${categoryColor}, ${statusConfig.color})` }} />

                <div className="p-5 sm:p-6 space-y-4">
                    {/* Top line: Ticket Number + Status + Actions */}
                    <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                            <div className="flex items-center gap-2">
                                <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 tracking-wider uppercase">
                                    {ticket.ticket_number}
                                </span>
                                <Badge
                                    className="border-0 text-xs font-bold"
                                    style={{ backgroundColor: `${categoryColor}15`, color: categoryColor }}
                                >
                                    {categoryLabel}
                                </Badge>
                            </div>
                            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
                                {ticket.subject}
                            </h1>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <Select value={ticket.status} onValueChange={handleStatusChange}>
                                <SelectTrigger className="h-8 w-[140px] text-xs font-bold border-0" style={{ backgroundColor: `${statusConfig.color}15`, color: statusConfig.color }}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {ticketStatuses.map(s => (
                                        <SelectItem key={s.value} value={s.value}>
                                            <span className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color || '#9ca3af' }} />
                                                {locale === 'th' ? s.label_th : s.label_en}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Button
                                variant="ghost" size="sm"
                                onClick={handleArchive}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-amber-500"
                                title={locale === 'th' ? 'เก็บเข้าคลัง' : 'Archive'}
                            >
                                <Archive className="h-4 w-4" />
                            </Button>
                            <Button
                                variant="ghost" size="sm"
                                onClick={handleDelete}
                                className="h-8 w-8 p-0 text-zinc-400 hover:text-red-500"
                            >
                                <Trash2 className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>

                    {/* Meta badges */}
                    <div className="flex flex-wrap gap-2">
                        <Badge
                            className="border-0 text-xs font-bold gap-1"
                            style={{ backgroundColor: `${priority.color}12`, color: priority.color }}
                        >
                            <Flag className="h-3 w-3" />
                            {locale === 'th' ? priority.labelTh : priority.label}
                        </Badge>
                        {outcomeLabel && (
                            <Badge
                                className="border-0 text-xs font-bold gap-1"
                                style={{
                                    backgroundColor: `${outcomeSetting?.color || '#6b7280'}12`,
                                    color: outcomeSetting?.color || '#6b7280',
                                }}
                            >
                                <Target className="h-3 w-3" />
                                {outcomeLabel}
                            </Badge>
                        )}
                        <Badge className="border-0 text-xs font-medium gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            <User className="h-3 w-3" />
                            {getUserName(ticket.created_by)}
                        </Badge>
                        <Badge className="border-0 text-xs font-medium gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                            <Clock className="h-3 w-3" />
                            {formatDate(ticket.created_at)}
                        </Badge>
                    </div>

                    {/* Description */}
                    {ticket.description && (
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl px-4 py-3">
                            <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                {ticket.description}
                            </p>
                        </div>
                    )}

                    {/* Attachments */}
                    {ticket.attachments && ticket.attachments.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {ticket.attachments.map((url, i) => (
                                <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-medium hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
                                >
                                    <Paperclip className="h-3 w-3" />
                                    {locale === 'th' ? `ไฟล์แนบ ${i + 1}` : `Attachment ${i + 1}`}
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Reply Thread */}
            <div className="space-y-4">
                <h2 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider">
                    {locale === 'th' ? `การตอบกลับ (${replies.length})` : `Replies (${replies.length})`}
                </h2>

                {/* Replies */}
                {replies.map(reply => {
                    const config = REPLY_TYPE_CONFIG[reply.reply_type] || REPLY_TYPE_CONFIG.comment
                    const isStatusChange = reply.reply_type === 'status_change'

                    if (isStatusChange) {
                        return (
                            <div key={reply.id} className="flex items-center gap-3 px-4 py-2">
                                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                                <span className="flex items-center gap-1.5 text-xs text-zinc-400 dark:text-zinc-500 font-medium whitespace-nowrap">
                                    {config.icon}
                                    {reply.content}
                                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                                    {getUserName(reply.created_by)}
                                    <span className="text-zinc-300 dark:text-zinc-600">•</span>
                                    {formatDate(reply.created_at)}
                                </span>
                                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-700" />
                            </div>
                        )
                    }

                    return (
                        <div
                            key={reply.id}
                            className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden shadow-sm"
                        >
                            {/* Reply type accent */}
                            <div className="h-1" style={{ backgroundColor: config.color }} />

                            <div className="p-4 space-y-2">
                                {/* Reply header */}
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span
                                            className="flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
                                            style={{ backgroundColor: `${config.color}12`, color: config.color }}
                                        >
                                            {config.icon}
                                            {locale === 'th' ? config.labelTh : config.label}
                                        </span>
                                        <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                                            {getUserName(reply.created_by)}
                                        </span>
                                    </div>
                                    <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                                        {formatDate(reply.created_at)}
                                    </span>
                                </div>

                                {/* Reply content */}
                                {reply.content && (
                                    <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                        {renderMentionContent(reply.content)}
                                    </p>
                                )}

                                {/* Reply attachments */}
                                {reply.attachments && reply.attachments.length > 0 && (
                                    <div className="flex flex-wrap gap-2 pt-1">
                                        {reply.attachments.map((url, i) => (
                                            <a
                                                key={i}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 px-2 py-1 rounded bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-500 hover:text-blue-600 transition-colors"
                                            >
                                                <Paperclip className="h-3 w-3" />
                                                {locale === 'th' ? `ไฟล์ ${i + 1}` : `File ${i + 1}`}
                                            </a>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}

                {replies.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-300 dark:text-zinc-700">
                        <MessageCircle className="h-8 w-8 mb-2" />
                        <span className="text-sm font-medium">
                            {locale === 'th' ? 'ยังไม่มีการตอบกลับ' : 'No replies yet'}
                        </span>
                    </div>
                )}
            </div>

            {/* Reply Composer */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4 shadow-sm sticky bottom-4">
                <div className="space-y-3">
                    {/* Reply Type Selector */}
                    <div className="flex gap-1.5 flex-wrap">
                        {Object.entries(REPLY_TYPE_CONFIG)
                            .filter(([key]) => key !== 'status_change')
                            .map(([key, config]) => (
                                <button
                                    key={key}
                                    onClick={() => setReplyType(key)}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all
                                        ${replyType === key
                                            ? 'shadow-sm'
                                            : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200'
                                        }
                                    `}
                                    style={replyType === key ? {
                                        backgroundColor: `${config.color}12`,
                                        color: config.color,
                                        boxShadow: `inset 0 0 0 1.5px ${config.color}25`,
                                    } : undefined}
                                >
                                    {config.icon}
                                    {locale === 'th' ? config.labelTh : config.label}
                                </button>
                            ))}
                    </div>

                    {/* Text area + Send */}
                    <div className="flex gap-2">
                        <MentionTextarea
                            value={replyContent}
                            onChange={setReplyContent}
                            users={users}
                            placeholder={locale === 'th' ? 'พิมพ์คำตอบ... (พิมพ์ @ เพื่อแท็ก)' : 'Type your reply... (type @ to mention)'}
                            rows={2}
                            className="resize-none"
                            onMentionedUsersChange={setMentionedUsers}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                    e.preventDefault()
                                    handleSendReply()
                                }
                            }}
                        />
                        <Button
                            onClick={handleSendReply}
                            disabled={isPending || !replyContent.trim()}
                            className="bg-violet-600 hover:bg-violet-700 text-white self-end h-10 px-4"
                        >
                            <Send className="h-4 w-4" />
                        </Button>
                    </div>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">
                        {locale === 'th' ? 'กด Ctrl+Enter เพื่อส่ง • พิมพ์ @ เพื่อแท็กเพื่อนร่วมงาน' : 'Press Ctrl+Enter to send • Type @ to mention colleagues'}
                    </p>
                </div>
            </div>
        </div>
    )
}
