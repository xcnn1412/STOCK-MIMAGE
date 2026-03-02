'use client'

import { useState, useCallback, useTransition, useOptimistic, memo } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import {
    AlertCircle, User, Calendar, GripVertical, Palette, Wrench, MapPin,
    ExternalLink, ChevronDown, ChevronUp, Phone, Package, Pencil, Flag
} from 'lucide-react'
import { updateJobStatus } from '../actions'
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
// Kanban Card
// ============================================================================

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

    const isOverdue = job.due_date && new Date(job.due_date) < new Date() && job.status !== 'done'
    const isFromCrm = !!job.crm_lead_id

    const priorityConfig: Record<string, { label: string; color: string; bg: string }> = {
        low: { label: locale === 'th' ? 'ต่ำ' : 'Low', color: 'text-zinc-500', bg: 'bg-zinc-100 dark:bg-zinc-800' },
        medium: { label: locale === 'th' ? 'ปานกลาง' : 'Medium', color: 'text-blue-600', bg: 'bg-blue-50 dark:bg-blue-950/30' },
        high: { label: locale === 'th' ? 'สูง' : 'High', color: 'text-amber-600', bg: 'bg-amber-50 dark:bg-amber-950/30' },
        urgent: { label: locale === 'th' ? 'เร่งด่วน' : 'Urgent', color: 'text-red-600', bg: 'bg-red-50 dark:bg-red-950/30' },
    }

    const priority = priorityConfig[job.priority] || priorityConfig.medium

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

    return (
        <div
            draggable
            onDragStart={e => onDragStart(e, job.id)}
            onDragEnd={onDragEnd}
            className={`group relative bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200/60 dark:border-zinc-800/60 p-3 cursor-grab active:cursor-grabbing transition-all duration-200 hover:shadow-md ${isDragging ? 'opacity-50 scale-95 shadow-xl ring-2 ring-violet-400' : ''
                }`}
        >
            {/* Top color accent */}
            <div className="absolute top-0 left-3 right-3 h-0.5 rounded-b" style={{ backgroundColor: statusColor }} />

            {/* Header */}
            <div className="flex items-start gap-2 mb-2">
                <GripVertical className="h-4 w-4 text-zinc-300 dark:text-zinc-600 shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                        {job.title}
                    </div>
                </Link>
                {isFromCrm && (
                    <Badge className="text-[8px] px-1 py-0 bg-blue-50 text-blue-500 dark:bg-blue-950/30 dark:text-blue-400 border-0 shrink-0">
                        CRM
                    </Badge>
                )}
            </div>

            {/* Priority + Dates (always visible) */}
            <div className="flex items-center gap-2 flex-wrap mb-2">
                <Badge className={`text-[10px] px-1.5 py-0 border-0 ${priority.bg} ${priority.color}`}>
                    {priority.label}
                </Badge>

                {job.event_date && (
                    <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                        <Calendar className="h-2.5 w-2.5" />
                        {job.event_date}
                    </span>
                )}

                {isOverdue && (
                    <Badge className="text-[10px] px-1.5 py-0 bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400 border-0">
                        <AlertCircle className="h-2.5 w-2.5 mr-0.5" />
                        {locale === 'th' ? 'เลยกำหนด' : 'Overdue'}
                    </Badge>
                )}
            </div>

            {/* Tags (always visible) */}
            {tagBadges.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2">
                    {tagBadges.map(tag => (
                        <Badge
                            key={tag.value}
                            className="text-[9px] px-1.5 py-0 border"
                            style={{ backgroundColor: `${tag.color}15`, color: tag.color, borderColor: `${tag.color}30` }}
                        >
                            {tag.label}
                        </Badge>
                    ))}
                </div>
            )}

            {/* CRM Expandable Section */}
            {isFromCrm && (
                <div className="border-t border-zinc-100 dark:border-zinc-800 mt-1 pt-1.5">
                    <button
                        onClick={e => { e.stopPropagation(); setExpanded(!expanded) }}
                        className="flex items-center gap-1 w-full text-left text-[10px] text-blue-500 hover:text-blue-600 font-medium transition-colors py-0.5"
                    >
                        <ExternalLink className="h-2.5 w-2.5" />
                        <span>{locale === 'th' ? 'ข้อมูล CRM' : 'CRM Data'}</span>
                        {expanded
                            ? <ChevronUp className="h-2.5 w-2.5 ml-auto" />
                            : <ChevronDown className="h-2.5 w-2.5 ml-auto" />
                        }
                    </button>

                    {expanded && (
                        <div className="mt-1.5 space-y-1.5 text-[11px] text-zinc-600 dark:text-zinc-400 bg-blue-50/40 dark:bg-blue-950/10 rounded-md p-2">
                            {/* Customer (CRM) */}
                            {job.customer_name && (
                                <div className="flex items-center gap-1.5">
                                    <User className="h-3 w-3 text-blue-400 shrink-0" />
                                    <span className="text-zinc-400 text-[9px]">(CRM)</span>
                                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">{job.customer_name}</span>
                                </div>
                            )}

                            {/* Location (CRM) */}
                            {job.event_location && (
                                <div className="flex items-center gap-1.5">
                                    <MapPin className="h-3 w-3 text-blue-400 shrink-0" />
                                    <span className="text-zinc-400 text-[9px]">(CRM)</span>
                                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">{job.event_location}</span>
                                </div>
                            )}

                            {/* Event Date (CRM) */}
                            {job.event_date && (
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="h-3 w-3 text-blue-400 shrink-0" />
                                    <span className="text-zinc-400 text-[9px]">(CRM)</span>
                                    <span className="font-medium text-zinc-700 dark:text-zinc-300">{job.event_date}</span>
                                </div>
                            )}

                            {/* Assigned (CRM) */}
                            {assignedNames.length > 0 && (
                                <div className="flex items-start gap-1.5">
                                    <User className="h-3 w-3 text-blue-400 shrink-0 mt-0.5" />
                                    <span className="text-zinc-400 text-[9px]">(CRM)</span>
                                    <span className="truncate font-medium text-zinc-700 dark:text-zinc-300">{assignedNames.join(', ')}</span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Non-CRM: show customer & assigned inline */}
            {!isFromCrm && (
                <>
                    {job.customer_name && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                            <User className="h-3 w-3 shrink-0" />
                            <span className="truncate">{job.customer_name}</span>
                        </div>
                    )}
                    {job.event_location && (
                        <div className="flex items-center gap-1.5 mb-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                            <MapPin className="h-3 w-3 shrink-0" />
                            <span className="truncate">{job.event_location}</span>
                        </div>
                    )}
                    {assignedNames.length > 0 && (
                        <div className="flex items-center gap-1 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                            <div className="flex -space-x-1.5">
                                {assignedNames.map((name, i) => (
                                    <div
                                        key={i}
                                        className="h-5 w-5 rounded-full bg-violet-100 dark:bg-violet-950/50 border-2 border-white dark:border-zinc-900 flex items-center justify-center text-[8px] font-bold text-violet-600 dark:text-violet-400"
                                    >
                                        {name.charAt(0)}
                                    </div>
                                ))}
                            </div>
                            <span className="text-[10px] text-zinc-400 ml-1 truncate">
                                {assignedNames.join(', ')}
                            </span>
                        </div>
                    )}
                </>
            )}
        </div>
    )
}
