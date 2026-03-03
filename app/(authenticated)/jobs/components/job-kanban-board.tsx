'use client'

import { useState, useCallback, useTransition, useOptimistic } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
    AlertCircle, User, Calendar, MapPin,
    ExternalLink, Pencil, Flag, Archive
} from 'lucide-react'
import { updateJobStatus, archiveJob } from '../actions'
import { useRouter } from 'next/navigation'
import type { Job, JobSetting, JobType } from '../actions'
import { getStatusesFromSettings, getStatusConfig } from '../jobs-dashboard'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Kanban Board
// ============================================================================

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

interface KanbanBoardProps {
    jobs: Job[]
    settings: JobSetting[]
    users: SystemUser[]
    jobType: JobType
}

export function JobKanbanBoard({ jobs, settings, users, jobType }: KanbanBoardProps) {
    const { locale } = useLocale()
    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()
    const [optimisticJobs, setOptimisticJobs] = useOptimistic(jobs)

    const statuses = getStatusesFromSettings(settings, jobType)

    const getStatusLabel = (status: string) => {
        const cfg = getStatusConfig(settings, jobType, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }

    const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
        e.dataTransfer.effectAllowed = 'move'
        setDraggedId(id)
    }, [])

    const handleDragEnd = useCallback(() => {
        setDraggedId(null)
        setDragOverStatus(null)
    }, [])

    const handleDragOver = useCallback((e: React.DragEvent, status: string) => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDragOverStatus(status)
    }, [])

    const handleDragLeave = useCallback(() => {
        setDragOverStatus(null)
    }, [])

    const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
        e.preventDefault()
        setDragOverStatus(null)

        if (!draggedId) return
        const job = optimisticJobs.find(j => j.id === draggedId)
        if (!job || job.status === newStatus) {
            setDraggedId(null)
            return
        }

        startTransition(async () => {
            setOptimisticJobs(prev =>
                prev.map(j => j.id === draggedId ? { ...j, status: newStatus } : j)
            )
            await updateJobStatus(draggedId, newStatus)
        })
        setDraggedId(null)
    }, [draggedId, optimisticJobs, startTransition, setOptimisticJobs])

    return (
        <div
            className="flex gap-4 overflow-x-auto pb-4 px-2"
            style={{ scrollbarWidth: 'thin', minHeight: '60vh' }}
        >
            {statuses.map(status => {
                const cfg = getStatusConfig(settings, jobType, status)
                const columnJobs = optimisticJobs.filter(j => j.status === status)
                const isDragOver = dragOverStatus === status

                return (
                    <div
                        key={status}
                        className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border transition-all duration-200 ${isDragOver
                            ? 'bg-violet-50/60 dark:bg-violet-950/20 ring-2 ring-violet-300 dark:ring-violet-700 shadow-md border-violet-200 dark:border-violet-800'
                            : 'bg-zinc-50/80 dark:bg-zinc-900/40 shadow-sm border-zinc-200/60 dark:border-zinc-800/60'
                            }`}
                        onDragOver={e => handleDragOver(e, status)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => handleDrop(e, status)}
                    >
                        {/* Column Header */}
                        <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                            <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
                                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                    {getStatusLabel(status)}
                                </span>
                                <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                                    {columnJobs.length}
                                </Badge>
                            </div>
                        </div>

                        {/* Cards */}
                        <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                            {columnJobs.map(job => (
                                <JobCard
                                    key={job.id}
                                    job={job}
                                    settings={settings}
                                    users={users}
                                    jobType={jobType}
                                    statusColor={cfg.color}
                                    isDragging={draggedId === job.id}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                />
                            ))}

                            {isDragOver && columnJobs.length === 0 && (
                                <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-violet-300 dark:border-violet-700 text-violet-400 dark:text-violet-500 text-sm">
                                    {locale === 'th' ? 'วางที่นี่' : 'Drop here'}
                                </div>
                            )}
                        </div>
                    </div>
                )
            })}
        </div>
    )
}

// ============================================================================
// Kanban Card — Premium CRM-style Design
// ============================================================================

const PRIORITY_CONFIG: Record<string, { label: string; labelTh: string; color: string; bgClass: string; borderClass: string; icon: string }> = {
    low: { label: 'Low', labelTh: 'ต่ำ', color: '#71717a', bgClass: 'bg-zinc-50 dark:bg-zinc-800/60', borderClass: 'border-zinc-200/60 dark:border-zinc-700/40', icon: '⚪' },
    medium: { label: 'Medium', labelTh: 'ปานกลาง', color: '#3b82f6', bgClass: 'bg-blue-50 dark:bg-blue-950/30', borderClass: 'border-blue-200/60 dark:border-blue-800/40', icon: '🔵' },
    high: { label: 'High', labelTh: 'สูง', color: '#f59e0b', bgClass: 'bg-amber-50 dark:bg-amber-950/30', borderClass: 'border-amber-200/60 dark:border-amber-800/40', icon: '🟠' },
    urgent: { label: 'Urgent', labelTh: 'เร่งด่วน', color: '#ef4444', bgClass: 'bg-red-50 dark:bg-red-950/30', borderClass: 'border-red-200/60 dark:border-red-800/40', icon: '🔴' },
}

function JobCard({
    job,
    settings,
    users,
    jobType,
    statusColor,
    isDragging,
    onDragStart,
    onDragEnd,
}: {
    job: Job
    settings: JobSetting[]
    users: SystemUser[]
    jobType: JobType
    statusColor: string
    isDragging: boolean
    onDragStart: (e: React.DragEvent, id: string) => void
    onDragEnd: () => void
}) {
    const { locale } = useLocale()
    const [expanded, setExpanded] = useState(false)
    const [archiving, setArchiving] = useState(false)
    const router = useRouter()

    const handleArchive = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(locale === 'th' ? 'ย้ายงานนี้ไปคลังเก็บ?' : 'Archive this job?')) return
        setArchiving(true)
        await archiveJob(job.id)
        setArchiving(false)
        router.refresh()
    }

    const isOverdue = job.due_date && new Date(job.due_date) < new Date() && job.status !== 'done'
    const isFromCrm = !!job.crm_lead_id

    const priority = PRIORITY_CONFIG[job.priority] || PRIORITY_CONFIG.medium
    const priorityLabel = locale === 'th' ? priority.labelTh : priority.label

    const assignedNames = (job.assigned_to || [])
        .map(id => {
            const u = users.find(u => u.id === id)
            return u?.full_name || id.slice(0, 6)
        })
        .slice(0, 2)

    // Tag badges — resolve from per-job-type tag category
    const tagCategory = `tag_${jobType}`
    const tagBadges = (job.tags || []).slice(0, 3).map(tagValue => {
        const tagSetting = settings.find(s => s.category === tagCategory && s.value === tagValue)
        return {
            value: tagValue,
            label: tagSetting ? (locale === 'th' ? tagSetting.label_th : tagSetting.label_en) : tagValue,
            color: tagSetting?.color || '#9ca3af',
        }
    })

    const toggleExpand = (e: React.MouseEvent) => {
        e.stopPropagation()
        setExpanded(prev => !prev)
    }

    return (
        <div className="group">
            <div
                draggable
                onDragStart={e => onDragStart(e, job.id)}
                onDragEnd={onDragEnd}
                onClick={toggleExpand}
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

                <div className="p-2.5 sm:p-3.5 space-y-2.5">
                    {/* Header: Title + CRM Badge + Edit */}
                    <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="font-semibold text-[14px] text-zinc-900 dark:text-zinc-100 leading-snug truncate">
                                {job.title}
                            </div>
                            {/* Compact summary: customer + date */}
                            <div className="flex items-center gap-2 mt-0.5">
                                {job.customer_name && (
                                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate max-w-[120px]">
                                        {job.customer_name}
                                    </span>
                                )}
                                {job.event_date && (
                                    <span className={`text-[12px] ${isOverdue ? 'text-red-500 font-semibold' : 'text-zinc-400'}`}>
                                        {job.event_date}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                            {isFromCrm && (
                                <Badge className="text-[9px] px-1.5 py-0 bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400 border border-blue-200/50 dark:border-blue-800/40 font-bold">
                                    CRM
                                </Badge>
                            )}
                            <button
                                onClick={handleArchive}
                                disabled={archiving}
                                className="p-1.5 rounded-md hover:bg-amber-50 dark:hover:bg-amber-950/40 transition-colors"
                                title={locale === 'th' ? 'เก็บเข้าคลัง' : 'Archive'}
                            >
                                <Archive className={`h-3.5 w-3.5 transition-colors ${archiving ? 'text-amber-400 animate-pulse' : 'text-zinc-400 hover:text-amber-600 dark:hover:text-amber-400'}`} />
                            </button>
                            <Link
                                href={`/jobs/${job.id}`}
                                onClick={e => e.stopPropagation()}
                                className="p-1.5 rounded-md hover:bg-violet-50 dark:hover:bg-violet-950/40 transition-colors"
                            >
                                <Pencil className="h-3.5 w-3.5 text-zinc-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors" />
                            </Link>
                        </div>
                    </div>

                    {/* Priority Badge — Prominent */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <Badge
                            className={`text-[12px] px-2 py-0.5 border font-bold gap-1 ${priority.bgClass} ${priority.borderClass}`}
                            style={{ color: priority.color }}
                        >
                            <Flag className="h-3 w-3" />
                            {priorityLabel}
                        </Badge>

                        {isOverdue && (
                            <Badge className="text-[12px] px-2 py-0.5 bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400 border border-red-200/60 dark:border-red-800/40 gap-1 font-semibold animate-pulse">
                                <AlertCircle className="h-3 w-3" />
                                {locale === 'th' ? 'เลยกำหนด' : 'Overdue'}
                            </Badge>
                        )}
                    </div>

                    {/* Tags — bigger, bolder, more vibrant */}
                    {tagBadges.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {tagBadges.map(tag => (
                                <span
                                    key={tag.value}
                                    className="inline-flex items-center gap-1.5 text-[12px] font-bold px-2 py-0.5 rounded-full"
                                    style={{
                                        backgroundColor: `${tag.color}15`,
                                        color: tag.color,
                                        boxShadow: `inset 0 0 0 1.5px ${tag.color}30`,
                                    }}
                                >
                                    <span className="h-2 w-2 rounded-full shadow-sm" style={{ backgroundColor: tag.color }} />
                                    {tag.label}
                                </span>
                            ))}
                        </div>
                    )}

                    {/* Expanded Detail Section */}
                    {expanded && (
                        <div className="space-y-2.5 animate-in fade-in slide-in-from-top-2 duration-200">

                            {/* Info rows */}
                            {(job.event_date || job.event_location) && (
                                <div className="space-y-1.5 bg-zinc-50/80 dark:bg-zinc-900/40 rounded-lg px-3 py-2.5">
                                    {job.event_date && (
                                        <div className="flex items-center gap-2 text-[13px]">
                                            <Calendar className="h-3.5 w-3.5 shrink-0" style={{ color: isOverdue ? '#ef4444' : '#a1a1aa' }} />
                                            <span className={`${isOverdue ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                                {job.event_date}
                                            </span>
                                        </div>
                                    )}
                                    {job.event_location && (
                                        <div className="flex items-center gap-2 text-[13px] text-zinc-500 dark:text-zinc-400">
                                            <MapPin className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                                            <span className="truncate">{job.event_location}</span>
                                        </div>
                                    )}
                                    {job.due_date && (
                                        <div className="flex items-center gap-2 text-[13px]">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0" style={{ color: isOverdue ? '#ef4444' : '#a1a1aa' }} />
                                            <span className={`${isOverdue ? 'text-red-500 dark:text-red-400 font-semibold' : 'text-zinc-500 dark:text-zinc-400'}`}>
                                                {locale === 'th' ? 'กำหนดส่ง: ' : 'Due: '}{job.due_date}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* CRM Data Section */}
                            {isFromCrm && (
                                <div className="space-y-1.5 bg-blue-50/50 dark:bg-blue-950/10 rounded-lg px-3 py-2.5 border border-blue-100/60 dark:border-blue-900/30">
                                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-blue-500 uppercase tracking-wide">
                                        <ExternalLink className="h-3 w-3" />
                                        {locale === 'th' ? 'ข้อมูล CRM' : 'CRM Data'}
                                    </div>
                                    {job.customer_name && (
                                        <div className="flex items-center gap-2 text-[13px]">
                                            <User className="h-3 w-3 text-blue-400 shrink-0" />
                                            <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">{job.customer_name}</span>
                                        </div>
                                    )}
                                    {job.event_location && (
                                        <div className="flex items-center gap-2 text-[13px]">
                                            <MapPin className="h-3 w-3 text-blue-400 shrink-0" />
                                            <span className="truncate text-zinc-600 dark:text-zinc-400">{job.event_location}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Assigned Staff */}
                            {assignedNames.length > 0 && (
                                <div className="flex items-center gap-2 pt-2.5 border-t border-zinc-100 dark:border-zinc-700/40">
                                    <div className="flex -space-x-1.5">
                                        {assignedNames.map((name, i) => (
                                            <div
                                                key={i}
                                                className="h-6 w-6 rounded-full bg-violet-100 dark:bg-violet-950/50 border-2 border-white dark:border-zinc-800 flex items-center justify-center text-[9px] font-bold text-violet-600 dark:text-violet-400"
                                            >
                                                {name.charAt(0)}
                                            </div>
                                        ))}
                                    </div>
                                    <span className="text-[12px] text-zinc-500 dark:text-zinc-400 truncate font-medium">
                                        {assignedNames.join(', ')}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

