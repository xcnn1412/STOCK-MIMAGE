'use client'

import { useState, useCallback, useTransition, useOptimistic } from 'react'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, Calendar, Archive, Trash2, Pencil, ListChecks } from 'lucide-react'
import { updateMyJobStatus, archiveMyJob, deleteMyJob } from '../actions'
import { useRouter } from 'next/navigation'
import type { PersonalJob, PersonalSetting } from '../actions'
import { useLocale } from '@/lib/i18n/context'

// ============================================================================
// Helpers (exported so dashboard can reuse)
// ============================================================================

export function getMyJobStatuses(settings: PersonalSetting[], jobType: string): string[] {
    return settings
        .filter(s => s.category === `status_${jobType}` && s.is_active)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map(s => s.value)
}

export function getMyJobStatusConfig(settings: PersonalSetting[], jobType: string, status: string) {
    const s = settings.find(st => st.category === `status_${jobType}` && st.value === status)
    if (!s) return { label: status, labelTh: status, color: '#9ca3af' }
    return { label: s.label_en, labelTh: s.label_th, color: s.color || '#9ca3af' }
}

// ============================================================================
// Priority config
// ============================================================================

const PRIORITY_CONFIG: Record<string, { label: string; labelTh: string; color: string }> = {
    low:    { label: 'Low',    labelTh: 'ต่ำ',       color: '#71717a' },
    medium: { label: 'Medium', labelTh: 'ปานกลาง',   color: '#3b82f6' },
    high:   { label: 'High',   labelTh: 'สูง',        color: '#f59e0b' },
    urgent: { label: 'Urgent', labelTh: 'เร่งด่วน',  color: '#ef4444' },
}

// ============================================================================
// Board
// ============================================================================

interface MyJobKanbanBoardProps {
    jobs: PersonalJob[]
    settings: PersonalSetting[]
    jobType: string
    onEdit?: (job: PersonalJob) => void
    readonly?: boolean
    /** When set (admin view), mutations target this user instead of the logged-in user */
    adminTargetUserId?: string
}

export function MyJobKanbanBoard({ jobs, settings, jobType, onEdit, readonly, adminTargetUserId }: MyJobKanbanBoardProps) {
    const { locale } = useLocale()
    const [draggedId, setDraggedId]     = useState<string | null>(null)
    const [dragOverStatus, setDragOverStatus] = useState<string | null>(null)
    const [, startTransition]           = useTransition()
    const [optimisticJobs, setOptimisticJobs] = useOptimistic(jobs)

    const canEdit = !readonly || !!adminTargetUserId
    const statuses = getMyJobStatuses(settings, jobType)

    const getStatusLabel = (status: string) => {
        const cfg = getMyJobStatusConfig(settings, jobType, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }

    const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
        if (!canEdit) return
        e.dataTransfer.effectAllowed = 'move'
        setDraggedId(id)
    }, [canEdit])

    const handleDragEnd   = useCallback(() => { setDraggedId(null); setDragOverStatus(null) }, [])
    const handleDragOver  = useCallback((e: React.DragEvent, s: string) => { e.preventDefault(); setDragOverStatus(s) }, [])
    const handleDragLeave = useCallback(() => setDragOverStatus(null), [])

    const handleDrop = useCallback((e: React.DragEvent, newStatus: string) => {
        e.preventDefault()
        setDragOverStatus(null)
        if (!draggedId || !canEdit) return
        const job = optimisticJobs.find(j => j.id === draggedId)
        if (!job || job.status === newStatus) { setDraggedId(null); return }

        startTransition(async () => {
            setOptimisticJobs(prev => prev.map(j => j.id === draggedId ? { ...j, status: newStatus } : j))
            await updateMyJobStatus(draggedId, newStatus, adminTargetUserId)
        })
        setDraggedId(null)
    }, [draggedId, optimisticJobs, canEdit, adminTargetUserId])

    if (statuses.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-24 text-center rounded-2xl border-2 border-dashed border-zinc-200 dark:border-zinc-800">
                <p className="text-zinc-400 text-sm">
                    {locale === 'th'
                        ? 'ยังไม่มีสถานะสำหรับ pipeline นี้ — ไปตั้งค่าก่อนนะ'
                        : 'No statuses for this pipeline — configure in Settings first'}
                </p>
            </div>
        )
    }

    return (
        <div className="flex gap-4 overflow-x-auto pb-4 px-2" style={{ scrollbarWidth: 'thin', minHeight: '60vh' }}>
            {statuses.map(status => {
                const cfg       = getMyJobStatusConfig(settings, jobType, status)
                const colJobs   = optimisticJobs.filter(j => j.status === status)
                const isDragOver = dragOverStatus === status

                return (
                    <div
                        key={status}
                        className={`flex-shrink-0 w-[300px] flex flex-col rounded-xl border transition-all duration-200 ${
                            isDragOver
                                ? 'bg-violet-50/60 dark:bg-violet-950/20 ring-2 ring-violet-300 dark:ring-violet-700 shadow-md border-violet-200 dark:border-violet-800'
                                : 'bg-zinc-50/80 dark:bg-zinc-900/40 shadow-sm border-zinc-200/60 dark:border-zinc-800/60'
                        }`}
                        onDragOver={e => handleDragOver(e, status)}
                        onDragLeave={handleDragLeave}
                        onDrop={e => handleDrop(e, status)}
                    >
                        {/* Column header */}
                        <div className="flex items-center justify-between px-3 py-3 border-b border-zinc-200/60 dark:border-zinc-800/60">
                            <div className="flex items-center gap-2">
                                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
                                <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                                    {getStatusLabel(status)}
                                </span>
                                <Badge variant="secondary" className="text-[10px] font-bold px-1.5 py-0">
                                    {colJobs.length}
                                </Badge>
                            </div>
                        </div>

                        {/* Cards */}
                        <div className="flex-1 p-2 space-y-2 overflow-y-auto" style={{ maxHeight: '65vh' }}>
                            {colJobs.map(job => (
                                <MyJobCard
                                    key={job.id}
                                    job={job}
                                    statusColor={cfg.color}
                                    isDragging={draggedId === job.id}
                                    onDragStart={handleDragStart}
                                    onDragEnd={handleDragEnd}
                                    onEdit={canEdit ? onEdit : undefined}
                                    readonly={!canEdit}
                                    adminTargetUserId={adminTargetUserId}
                                />
                            ))}
                            {isDragOver && colJobs.length === 0 && (
                                <div className="flex items-center justify-center h-20 rounded-lg border-2 border-dashed border-violet-300 dark:border-violet-700 text-violet-400 text-sm">
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
// Card
// ============================================================================

function MyJobCard({
    job,
    statusColor,
    isDragging,
    onDragStart,
    onDragEnd,
    onEdit,
    readonly,
    adminTargetUserId,
}: {
    job: PersonalJob
    statusColor: string
    isDragging: boolean
    onDragStart: (e: React.DragEvent, id: string) => void
    onDragEnd: () => void
    onEdit?: (job: PersonalJob) => void
    readonly?: boolean
    adminTargetUserId?: string
}) {
    const { locale }        = useLocale()
    const router            = useRouter()
    const [, startTransition] = useTransition()

    const priority  = PRIORITY_CONFIG[job.priority] || PRIORITY_CONFIG.medium
    const isOverdue = job.due_date && new Date(job.due_date) < new Date() && job.status !== 'done'

    const checklistTotal = job.checklist?.length ?? 0
    const checklistDone  = job.checklist?.filter(it => it.done).length ?? 0

    const handleArchive = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(locale === 'th' ? 'ย้ายงานนี้ไปคลัง?' : 'Archive this job?')) return
        startTransition(async () => { await archiveMyJob(job.id, adminTargetUserId); router.refresh() })
    }

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation()
        if (!confirm(locale === 'th' ? 'ลบถาวร?' : 'Delete permanently?')) return
        startTransition(async () => { await deleteMyJob(job.id, adminTargetUserId); router.refresh() })
    }

    return (
        <div
            draggable={!readonly}
            onDragStart={e => onDragStart(e, job.id)}
            onDragEnd={onDragEnd}
            className={`group relative bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/80 dark:border-zinc-800/80 p-3 shadow-sm hover:shadow-md transition-all duration-200 ${
                readonly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
            } ${isDragging ? 'opacity-50 scale-[0.97] rotate-1' : ''}`}
        >
            {/* Left accent */}
            <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ backgroundColor: statusColor }} />

            <div className="flex items-start justify-between gap-2 mb-2">
                <span className="h-2 w-2 rounded-full mt-1.5 shrink-0" style={{ backgroundColor: priority.color }} />
                <p className="flex-1 min-w-0 text-sm font-semibold text-zinc-900 dark:text-zinc-100 leading-tight line-clamp-2">
                    {job.title}
                </p>
                {!readonly && (
                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
                        {onEdit && (
                            <button
                                onClick={e => { e.stopPropagation(); onEdit(job) }}
                                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-violet-600 transition-colors"
                            >
                                <Pencil className="h-3.5 w-3.5" />
                            </button>
                        )}
                        <button
                            onClick={handleArchive}
                            title={locale === 'th' ? 'เก็บ' : 'Archive'}
                            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-amber-500 transition-colors"
                        >
                            <Archive className="h-3.5 w-3.5" />
                        </button>
                        <button
                            onClick={handleDelete}
                            title={locale === 'th' ? 'ลบ' : 'Delete'}
                            className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-red-500 transition-colors"
                        >
                            <Trash2 className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>

            {job.description && (
                <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2 mb-2 pl-4">
                    {job.description}
                </p>
            )}

            {job.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-2 pl-4">
                    {job.tags.slice(0, 3).map(tag => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                    ))}
                    {job.tags.length > 3 && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">+{job.tags.length - 3}</Badge>
                    )}
                </div>
            )}

            {checklistTotal > 0 && (
                <div className="flex items-center gap-1 text-[10px] text-zinc-400 dark:text-zinc-500 mb-1 pl-4">
                    <ListChecks className="h-3 w-3" />
                    {checklistDone}/{checklistTotal}
                </div>
            )}

            {job.due_date && (
                <div className={`flex items-center gap-1.5 text-xs pl-4 ${isOverdue ? 'text-red-500' : 'text-zinc-400'}`}>
                    {isOverdue ? <AlertCircle className="h-3 w-3" /> : <Calendar className="h-3 w-3" />}
                    {new Date(job.due_date).toLocaleDateString(
                        locale === 'th' ? 'th-TH' : 'en-GB',
                        { day: 'numeric', month: 'short' }
                    )}
                </div>
            )}
        </div>
    )
}
