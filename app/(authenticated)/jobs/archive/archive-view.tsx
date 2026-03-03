'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
    Archive, ArchiveRestore, Search, Calendar, MapPin, Inbox,
    Briefcase, Ticket as TicketIcon, AlertCircle, Tag
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { unarchiveJob, unarchiveTicket } from '../actions'
import { getStatusConfig, getStatusesFromSettings } from '../jobs-dashboard'
import { getTicketStatusConfig } from '../components/ticket-kanban-board'
import { useLocale } from '@/lib/i18n/context'
import type { Job, JobSetting, Ticket } from '../actions'

interface ArchiveViewProps {
    jobs: Job[]
    tickets: Ticket[]
    settings: JobSetting[]
    jobTypes: JobSetting[]
}

export default function ArchiveView({ jobs, tickets, settings, jobTypes }: ArchiveViewProps) {
    const { locale } = useLocale()
    const router = useRouter()
    const [mode, setMode] = useState<'jobs' | 'tickets'>('jobs')
    const [search, setSearch] = useState('')
    const [restoring, setRestoring] = useState<string | null>(null)
    const [jobTypeFilter, setJobTypeFilter] = useState<string>('all')

    // ---- Filtered data ----
    const filteredJobs = useMemo(() => {
        let result = jobs
        if (jobTypeFilter !== 'all') {
            result = result.filter(j => j.job_type === jobTypeFilter)
        }
        if (search) {
            const q = search.toLowerCase()
            result = result.filter(job =>
                job.title.toLowerCase().includes(q) ||
                job.customer_name?.toLowerCase().includes(q)
            )
        }
        return result
    }, [jobs, search, jobTypeFilter])

    const filteredTickets = useMemo(() => {
        if (!search) return tickets
        const q = search.toLowerCase()
        return tickets.filter(ticket =>
            ticket.subject.toLowerCase().includes(q) ||
            ticket.description?.toLowerCase().includes(q)
        )
    }, [tickets, search])

    const handleRestoreJob = async (id: string) => {
        setRestoring(id)
        await unarchiveJob(id)
        setRestoring(null)
        router.refresh()
    }

    const handleRestoreTicket = async (id: string) => {
        setRestoring(id)
        await unarchiveTicket(id)
        setRestoring(null)
        router.refresh()
    }

    const getJobTypeLabel = (jobType: string) => {
        const jt = jobTypes.find(t => t.value === jobType)
        if (!jt) return jobType
        return locale === 'th' ? jt.label_th : jt.label_en
    }

    const priorityLabels: Record<string, { label: string; color: string }> = {
        low: { label: locale === 'th' ? 'ต่ำ' : 'Low', color: 'text-zinc-500' },
        medium: { label: locale === 'th' ? 'ปานกลาง' : 'Medium', color: 'text-blue-600' },
        high: { label: locale === 'th' ? 'สูง' : 'High', color: 'text-amber-600' },
        urgent: { label: locale === 'th' ? 'เร่งด่วน' : 'Urgent', color: 'text-red-600' },
    }

    const currentItems = mode === 'jobs' ? filteredJobs : filteredTickets

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                        <Archive className="h-6 w-6 text-zinc-400" />
                        {locale === 'th' ? 'คลังเก็บ' : 'Archive'}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {locale === 'th'
                            ? `งาน ${jobs.length} รายการ · Ticket ${tickets.length} รายการ`
                            : `${jobs.length} job${jobs.length !== 1 ? 's' : ''} · ${tickets.length} ticket${tickets.length !== 1 ? 's' : ''}`
                        }
                    </p>
                </div>
            </div>

            {/* Mode Switcher + Search */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                {/* Mode Tabs */}
                <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                    <button
                        onClick={() => { setMode('jobs'); setSearch(''); setJobTypeFilter('all') }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'jobs'
                            ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                            }`}
                    >
                        <Briefcase className="h-4 w-4" />
                        <span>Jobs</span>
                        {jobs.length > 0 && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-0.5">
                                {jobs.length}
                            </Badge>
                        )}
                    </button>
                    <button
                        onClick={() => { setMode('tickets'); setSearch('') }}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${mode === 'tickets'
                            ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                            }`}
                    >
                        <TicketIcon className="h-4 w-4" />
                        <span>Ticket</span>
                        {tickets.length > 0 && (
                            <Badge className="ml-0.5 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[10px] px-1.5 py-0 border-0">
                                {tickets.length}
                            </Badge>
                        )}
                    </button>
                </div>

                {/* Job Type Filter (only in jobs mode) */}
                {mode === 'jobs' && jobTypes.length > 0 && (
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                            onClick={() => setJobTypeFilter('all')}
                            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${jobTypeFilter === 'all'
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            {locale === 'th' ? 'ทั้งหมด' : 'All'}
                        </button>
                        {jobTypes.map(jt => (
                            <button
                                key={jt.value}
                                onClick={() => setJobTypeFilter(jt.value)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${jobTypeFilter === jt.value
                                    ? 'bg-white dark:bg-zinc-700 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                    }`}
                                style={jobTypeFilter === jt.value ? { color: jt.color || '#8b5cf6' } : undefined}
                            >
                                <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                                {locale === 'th' ? jt.label_th : jt.label_en}
                            </button>
                        ))}
                    </div>
                )}

                {/* Search */}
                <div className="relative flex-1 max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <Input
                        type="text"
                        placeholder={mode === 'jobs'
                            ? (locale === 'th' ? 'ค้นหางาน...' : 'Search jobs...')
                            : (locale === 'th' ? 'ค้นหา ticket...' : 'Search tickets...')
                        }
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 h-9"
                    />
                </div>
            </div>

            {/* Content */}
            {currentItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
                        <Inbox className="h-8 w-8 text-zinc-400" />
                    </div>
                    <p className="text-lg font-medium text-zinc-600 dark:text-zinc-400">
                        {locale === 'th'
                            ? `ไม่มี${mode === 'jobs' ? 'งาน' : 'Ticket'}ใน Archive`
                            : `No archived ${mode === 'jobs' ? 'jobs' : 'tickets'}`
                        }
                    </p>
                    <p className="text-sm text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th'
                            ? `${mode === 'jobs' ? 'งาน' : 'Ticket'}ที่ถูก Archive จะแสดงที่นี่`
                            : `Archived ${mode === 'jobs' ? 'jobs' : 'tickets'} will appear here`
                        }
                    </p>
                </div>
            ) : mode === 'jobs' ? (
                /* ---- JOBS LIST ---- */
                <div className="space-y-2">
                    {filteredJobs.map(job => {
                        const statusCfg = getStatusConfig(settings, job.job_type, job.status)
                        const priority = priorityLabels[job.priority] || priorityLabels.medium
                        const archivedDate = job.archived_at
                            ? new Date(job.archived_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
                                year: 'numeric', month: 'short', day: 'numeric'
                            })
                            : ''
                        const jobTypeInfo = jobTypes.find(jt => jt.value === job.job_type)

                        return (
                            <Card key={job.id} className="border-zinc-200/60 dark:border-zinc-800/60 hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                                        {/* Left: Info */}
                                        <Link href={`/jobs/${job.id}`} className="flex-1 min-w-0 group">
                                            <div className="flex items-center gap-2.5 mb-2">
                                                {jobTypeInfo && (
                                                    <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: jobTypeInfo.color || '#9ca3af' }} />
                                                )}
                                                <div className="font-semibold text-base text-zinc-900 dark:text-zinc-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors truncate">
                                                    {job.title}
                                                </div>
                                                <Badge className="border-0 text-[12px] shrink-0" style={{ backgroundColor: `${statusCfg.color}15`, color: statusCfg.color }}>
                                                    {locale === 'th' ? statusCfg.labelTh : statusCfg.label}
                                                </Badge>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                                                {job.customer_name && (
                                                    <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                                        {job.customer_name}
                                                    </span>
                                                )}
                                                {jobTypeInfo && (
                                                    <Badge variant="outline" className="text-[11px] px-1.5 py-0 gap-1">
                                                        {locale === 'th' ? jobTypeInfo.label_th : jobTypeInfo.label_en}
                                                    </Badge>
                                                )}
                                                {job.event_date && (
                                                    <span className="flex items-center gap-1">
                                                        <Calendar className="h-3.5 w-3.5" />
                                                        {job.event_date}
                                                    </span>
                                                )}
                                                {job.event_location && (
                                                    <span className="flex items-center gap-1">
                                                        <MapPin className="h-3.5 w-3.5" />
                                                        {job.event_location}
                                                    </span>
                                                )}
                                                <span className={`font-medium ${priority.color}`}>
                                                    {priority.label}
                                                </span>
                                            </div>
                                        </Link>

                                        {/* Right: Archive info + Restore */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right hidden sm:block">
                                                <div className="text-[12px] text-zinc-400 dark:text-zinc-500">
                                                    {locale === 'th' ? 'เก็บเมื่อ' : 'Archived'}
                                                </div>
                                                <div className="text-[13px] text-zinc-500 dark:text-zinc-400 font-medium">
                                                    {archivedDate}
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRestoreJob(job.id)}
                                                disabled={restoring === job.id}
                                                className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                            >
                                                <ArchiveRestore className="h-4 w-4" />
                                                {restoring === job.id
                                                    ? (locale === 'th' ? 'กำลังนำออก...' : 'Restoring...')
                                                    : (locale === 'th' ? 'นำออก' : 'Restore')
                                                }
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            ) : (
                /* ---- TICKETS LIST ---- */
                <div className="space-y-2">
                    {filteredTickets.map(ticket => {
                        const statusCfg = getTicketStatusConfig(settings, ticket.status)
                        const priority = priorityLabels[ticket.priority] || priorityLabels.medium
                        const archivedDate = ticket.archived_at
                            ? new Date(ticket.archived_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', {
                                year: 'numeric', month: 'short', day: 'numeric'
                            })
                            : ''

                        return (
                            <Card key={ticket.id} className="border-zinc-200/60 dark:border-zinc-800/60 hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
                                        {/* Left: Info */}
                                        <Link href={`/jobs/tickets/${ticket.id}`} className="flex-1 min-w-0 group">
                                            <div className="flex items-center gap-2.5 mb-2">
                                                <Badge variant="outline" className="text-[11px] px-1.5 py-0 font-mono shrink-0">
                                                    {ticket.ticket_number}
                                                </Badge>
                                                <div className="font-semibold text-base text-zinc-900 dark:text-zinc-100 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors truncate">
                                                    {ticket.subject}
                                                </div>
                                                <Badge className="border-0 text-[12px] shrink-0" style={{ backgroundColor: `${statusCfg.color}15`, color: statusCfg.color }}>
                                                    {locale === 'th' ? statusCfg.labelTh : statusCfg.label}
                                                </Badge>
                                            </div>
                                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                                                {ticket.description && (
                                                    <span className="truncate max-w-xs">
                                                        {ticket.description}
                                                    </span>
                                                )}
                                                {ticket.profiles?.full_name && (
                                                    <span className="font-medium text-zinc-600 dark:text-zinc-300">
                                                        {ticket.profiles.full_name}
                                                    </span>
                                                )}
                                                <span className={`font-medium ${priority.color}`}>
                                                    {priority.label}
                                                </span>
                                            </div>
                                        </Link>

                                        {/* Right: Archive info + Restore */}
                                        <div className="flex items-center gap-3 shrink-0">
                                            <div className="text-right hidden sm:block">
                                                <div className="text-[12px] text-zinc-400 dark:text-zinc-500">
                                                    {locale === 'th' ? 'เก็บเมื่อ' : 'Archived'}
                                                </div>
                                                <div className="text-[13px] text-zinc-500 dark:text-zinc-400 font-medium">
                                                    {archivedDate}
                                                </div>
                                            </div>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleRestoreTicket(ticket.id)}
                                                disabled={restoring === ticket.id}
                                                className="gap-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950/30"
                                            >
                                                <ArchiveRestore className="h-4 w-4" />
                                                {restoring === ticket.id
                                                    ? (locale === 'th' ? 'กำลังนำออก...' : 'Restoring...')
                                                    : (locale === 'th' ? 'นำออก' : 'Restore')
                                                }
                                            </Button>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
