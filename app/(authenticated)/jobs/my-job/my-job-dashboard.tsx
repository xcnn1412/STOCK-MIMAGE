'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    Plus, Search, LayoutGrid, List, ChevronDown, User, Calendar,
    Ticket as TicketIcon, Briefcase,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
    DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
    DropdownMenuCheckboxItem, DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { JobKanbanBoard } from '../components/job-kanban-board'
import { AddJobDialog } from '../components/add-job-dialog'
import { TicketKanbanBoard, getTicketStatuses, getTicketStatusConfig } from '../components/ticket-kanban-board'
import { AddTicketDialog } from '../components/add-ticket-dialog'
import { getStatusesFromSettings, getStatusConfig } from '../jobs-dashboard'
import { useLocale } from '@/lib/i18n/context'
import type { Job, JobSetting, JobType, Ticket } from '../actions'

// ============================================================================
// Types
// ============================================================================

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

interface MyJobDashboardProps {
    jobs: Job[]
    settings: JobSetting[]
    users: SystemUser[]
    jobTypes: JobSetting[]
    tickets: Ticket[]
    ticketCategories: JobSetting[]
    /** Base URL prefix for router.replace; defaults to /jobs/my-job */
    basePath?: string
    pageTitle?: string
    pageTitleTh?: string
    pageSubtitle?: string
    pageSubtitleTh?: string
}

// ============================================================================
// My Job Dashboard — identical UI/UX to JobsDashboard, scoped to one user
// ============================================================================

export default function MyJobDashboard({
    jobs,
    settings,
    users,
    jobTypes,
    tickets,
    ticketCategories,
    basePath = '/jobs/my-job',
    pageTitle = 'My Work',
    pageTitleTh = 'งานของฉัน',
    pageSubtitle = 'Jobs and tickets assigned to or created by you',
    pageSubtitleTh = 'งานและ Ticket ที่ถูกมอบหมายหรือสร้างโดยคุณ',
}: MyJobDashboardProps) {
    const { locale } = useLocale()
    const searchParams = useSearchParams()
    const router = useRouter()

    const initialTab = searchParams.get('tab') === 'tickets' ? 'tickets' : 'jobs'
    const initialCat = searchParams.get('cat') || ticketCategories[0]?.value || ''

    const [boardMode, setBoardMode] = useState<'jobs' | 'tickets'>(initialTab)
    const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban')
    const [pipelineTab, setPipelineTab] = useState<string>(jobTypes[0]?.value || 'graphic')
    const [ticketCategoryTab, setTicketCategoryTab] = useState<string>(initialCat)
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<string>('all')
    const [assigneeFilter, setAssigneeFilter] = useState<string>('all')
    const [tagFilter, setTagFilter] = useState<string[]>([])
    const [addDialogOpen, setAddDialogOpen] = useState(false)
    const [addTicketDialogOpen, setAddTicketDialogOpen] = useState(false)

    // ---- Jobs ----
    const kanbanStatuses = useMemo(
        () => getStatusesFromSettings(settings, pipelineTab),
        [settings, pipelineTab],
    )

    const getStatusLabel = useCallback((status: string) => {
        const cfg = getStatusConfig(settings, pipelineTab, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }, [settings, pipelineTab, locale])

    const pipelineJobs = useMemo(
        () => jobs.filter(j => j.job_type === pipelineTab),
        [jobs, pipelineTab],
    )

    const assignedUsers = useMemo(() => {
        const ids = new Set(pipelineJobs.flatMap(j => j.assigned_to || []))
        return users.filter(u => ids.has(u.id))
    }, [pipelineJobs, users])

    const availableTags = useMemo(
        () => settings.filter(s => s.category === 'tag' && s.is_active),
        [settings],
    )

    const toggleTag = useCallback((v: string) => {
        setTagFilter(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v])
    }, [])

    const filteredJobs = useMemo(() => pipelineJobs.filter(job => {
        if (statusFilter !== 'all' && job.status !== statusFilter) return false
        if (assigneeFilter !== 'all' && !(job.assigned_to || []).includes(assigneeFilter)) return false
        if (tagFilter.length > 0 && !tagFilter.every(t => (job.tags || []).includes(t))) return false
        if (search) {
            const q = search.toLowerCase()
            if (!job.title.toLowerCase().includes(q) && !(job.customer_name?.toLowerCase().includes(q))) return false
        }
        return true
    }), [pipelineJobs, statusFilter, assigneeFilter, tagFilter, search])

    const stats = useMemo(() => {
        const statusCounts = kanbanStatuses.reduce((acc, s) => {
            acc[s] = pipelineJobs.filter(j => j.status === s).length
            return acc
        }, {} as Record<string, number>)
        return { statusCounts, total: pipelineJobs.length }
    }, [pipelineJobs, kanbanStatuses])

    // ---- Tickets ----
    const ticketStatuses = useMemo(() => getTicketStatuses(settings), [settings])

    const filteredTickets = useMemo(() => tickets.filter(t => {
        if (search) {
            const q = search.toLowerCase()
            if (!t.subject.toLowerCase().includes(q) && !(t.description?.toLowerCase().includes(q))) return false
        }
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        return true
    }), [tickets, search, statusFilter])

    const ticketStats = useMemo(() => {
        const categoryTickets = tickets.filter(t => t.category === ticketCategoryTab)
        const statusCounts = ticketStatuses.reduce((acc, s) => {
            acc[s] = categoryTickets.filter(t => t.status === s).length
            return acc
        }, {} as Record<string, number>)
        return { statusCounts, total: categoryTickets.length }
    }, [tickets, ticketCategoryTab, ticketStatuses])

    // ---- Navigation ----
    const switchToJobs = () => {
        setBoardMode('jobs')
        setStatusFilter('all')
        setSearch('')
        router.replace(basePath, { scroll: false })
    }

    const switchToTickets = () => {
        setBoardMode('tickets')
        setStatusFilter('all')
        setSearch('')
        router.replace(`${basePath}?tab=tickets&cat=${ticketCategoryTab}`, { scroll: false })
    }

    return (
        <div className="space-y-6">

            {/* ================================================================ */}
            {/* Header */}
            {/* ================================================================ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <User className="h-5 w-5 text-violet-500 shrink-0" />
                        {locale === 'th' ? pageTitleTh : pageTitle}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {locale === 'th' ? pageSubtitleTh : pageSubtitle}
                    </p>
                </div>

                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                            onClick={switchToJobs}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${boardMode === 'jobs'
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            <Briefcase className="h-4 w-4" />
                            <span className="hidden sm:inline">Jobs</span>
                        </button>
                        <button
                            onClick={switchToTickets}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${boardMode === 'tickets'
                                ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            <TicketIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Ticket</span>
                            {tickets.filter(t => t.status !== 'closed').length > 0 && (
                                <Badge className="ml-0.5 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[10px] px-1.5 py-0 border-0">
                                    {tickets.filter(t => t.status !== 'closed').length}
                                </Badge>
                            )}
                        </button>
                    </div>

                    {boardMode === 'jobs' ? (
                        <Button
                            onClick={() => setAddDialogOpen(true)}
                            className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm hidden sm:inline-flex"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {locale === 'th' ? 'เพิ่มงาน' : 'Add Job'}
                        </Button>
                    ) : (
                        <Button
                            onClick={() => setAddTicketDialogOpen(true)}
                            className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm hidden sm:inline-flex"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {locale === 'th' ? 'เปิด Ticket' : 'New Ticket'}
                        </Button>
                    )}
                </div>
            </div>

            {/* ================================================================ */}
            {/* JOBS MODE */}
            {/* ================================================================ */}
            {boardMode === 'jobs' && (
                <>
                    {/* Pipeline Tabs */}
                    <div
                        className="flex gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1 max-w-full overflow-x-auto"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {jobTypes.map(jt => (
                            <button
                                key={jt.value}
                                onClick={() => { setPipelineTab(jt.value); setStatusFilter('all') }}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-all flex-1 justify-center whitespace-nowrap ${pipelineTab === jt.value
                                    ? 'bg-white dark:bg-zinc-700 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                    }`}
                                style={pipelineTab === jt.value ? { color: jt.color || '#8b5cf6' } : undefined}
                            >
                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: jt.color || '#9ca3af' }} />
                                {locale === 'th' ? jt.label_th : jt.label_en}
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 ml-1">
                                    {jobs.filter(j => j.job_type === jt.value).length}
                                </Badge>
                            </button>
                        ))}
                    </div>

                    {/* Summary Cards */}
                    <div
                        className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {kanbanStatuses.map(status => {
                            const cfg = getStatusConfig(settings, pipelineTab, status)
                            const count = stats.statusCounts[status] || 0
                            return (
                                <div
                                    key={status}
                                    className="flex-shrink-0 w-[120px] sm:w-auto sm:flex-1 sm:min-w-0 relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 snap-start"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(to bottom, ${cfg.color}, ${cfg.color}dd)` }} />
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide truncate">
                                            {locale === 'th' ? cfg.labelTh : cfg.label}
                                        </span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {count}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Kanban/Table toggle + Filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'kanban'
                                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                    }`}
                            >
                                <LayoutGrid className="h-4 w-4" />
                                <span className="hidden sm:inline">Kanban</span>
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table'
                                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                    }`}
                            >
                                <List className="h-4 w-4" />
                                <span className="hidden sm:inline">{locale === 'th' ? 'ตาราง' : 'Table'}</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                <Input
                                    type="text"
                                    placeholder={locale === 'th' ? 'ค้นหางาน...' : 'Search jobs...'}
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    className="pl-9 h-9 w-full sm:w-[200px]"
                                />
                            </div>
                            <Select value={statusFilter} onValueChange={setStatusFilter}>
                                <SelectTrigger className="h-9 w-[130px] sm:w-[150px]">
                                    <SelectValue placeholder={locale === 'th' ? 'ทุกสถานะ' : 'All Status'} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{locale === 'th' ? 'ทุกสถานะ' : 'All Status'}</SelectItem>
                                    {kanbanStatuses.map(s => (
                                        <SelectItem key={s} value={s}>
                                            <span className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getStatusConfig(settings, pipelineTab, s).color }} />
                                                {getStatusLabel(s)}
                                            </span>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <Select value={assigneeFilter} onValueChange={setAssigneeFilter}>
                                <SelectTrigger className="h-9 w-[130px] sm:w-[150px]">
                                    <SelectValue placeholder={locale === 'th' ? 'ทุกคน' : 'All Assignees'} />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">{locale === 'th' ? 'ทุกคน' : 'All Assignees'}</SelectItem>
                                    {assignedUsers.map(u => (
                                        <SelectItem key={u.id} value={u.id}>
                                            {u.full_name || u.id.slice(0, 8)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {availableTags.length > 0 && (
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" className="h-9 gap-1.5 text-sm">
                                            {locale === 'th' ? 'แท็ก' : 'Tags'}
                                            {tagFilter.length > 0 && (
                                                <Badge className="bg-violet-100 text-violet-600 border-0 text-[10px] px-1.5 py-0 ml-1">
                                                    {tagFilter.length}
                                                </Badge>
                                            )}
                                            <ChevronDown className="h-3.5 w-3.5 opacity-60" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-48">
                                        <DropdownMenuLabel>{locale === 'th' ? 'กรองแท็ก' : 'Filter by Tag'}</DropdownMenuLabel>
                                        <DropdownMenuSeparator />
                                        {availableTags.map(tag => (
                                            <DropdownMenuCheckboxItem
                                                key={tag.value}
                                                checked={tagFilter.includes(tag.value)}
                                                onCheckedChange={() => toggleTag(tag.value)}
                                            >
                                                {locale === 'th' ? tag.label_th : tag.label_en}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    {/* Board */}
                    {viewMode === 'kanban' ? (
                        <div className="relative -mx-4 md:-mx-6 px-2">
                            <JobKanbanBoard
                                jobs={filteredJobs}
                                settings={settings}
                                users={users}
                                jobType={pipelineTab}
                            />
                        </div>
                    ) : (
                        <JobTableView
                            jobs={filteredJobs}
                            settings={settings}
                            jobType={pipelineTab}
                        />
                    )}

                    <AddJobDialog
                        open={addDialogOpen}
                        onOpenChange={setAddDialogOpen}
                        settings={settings}
                        users={users}
                        defaultJobType={pipelineTab}
                        jobTypes={jobTypes}
                    />
                </>
            )}

            {/* ================================================================ */}
            {/* TICKETS MODE */}
            {/* ================================================================ */}
            {boardMode === 'tickets' && (
                <>
                    {/* Category Chips */}
                    <div className="flex flex-wrap gap-1.5">
                        {ticketCategories.map(cat => {
                            const isActive = ticketCategoryTab === cat.value
                            const catColor = cat.color || '#8b5cf6'
                            const count = tickets.filter(t => t.category === cat.value && t.status !== 'closed').length
                            return (
                                <button
                                    key={cat.value}
                                    onClick={() => {
                                        setTicketCategoryTab(cat.value)
                                        setStatusFilter('all')
                                        router.replace(`${basePath}?tab=tickets&cat=${cat.value}`, { scroll: false })
                                    }}
                                    className={`group flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${isActive
                                        ? 'shadow-sm scale-[1.02]'
                                        : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                                        }`}
                                    style={isActive ? {
                                        backgroundColor: `${catColor}14`,
                                        color: catColor,
                                        boxShadow: `inset 0 0 0 1.5px ${catColor}40, 0 1px 3px ${catColor}15`,
                                    } : undefined}
                                >
                                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                                    {locale === 'th' ? cat.label_th : cat.label_en}
                                    <span
                                        className={`ml-0.5 flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold leading-none ${isActive ? 'text-white' : 'bg-zinc-200/80 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400'}`}
                                        style={isActive ? { backgroundColor: `${catColor}90` } : undefined}
                                    >
                                        {count}
                                    </span>
                                </button>
                            )
                        })}
                    </div>

                    {/* Ticket Summary Cards */}
                    <div
                        className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
                        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
                    >
                        {ticketStatuses.map(status => {
                            const cfg = getTicketStatusConfig(settings, status)
                            const count = ticketStats.statusCounts[status] || 0
                            return (
                                <div
                                    key={status}
                                    className="flex-shrink-0 w-[120px] sm:w-auto sm:flex-1 sm:min-w-0 relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 snap-start"
                                >
                                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(to bottom, ${cfg.color}, ${cfg.color}dd)` }} />
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide truncate">
                                            {locale === 'th' ? cfg.labelTh : cfg.label}
                                        </span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                                        {count}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    {/* Ticket Filters */}
                    <div className="flex items-center justify-end gap-2 flex-wrap">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                            <Input
                                placeholder={locale === 'th' ? 'ค้นหา ticket...' : 'Search tickets...'}
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 h-9 w-full sm:w-[200px]"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="h-9 w-[130px] sm:w-[150px]">
                                <SelectValue placeholder={locale === 'th' ? 'ทุกสถานะ' : 'All Status'} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{locale === 'th' ? 'ทุกสถานะ' : 'All Status'}</SelectItem>
                                {ticketStatuses.map(s => {
                                    const cfg = getTicketStatusConfig(settings, s)
                                    return (
                                        <SelectItem key={s} value={s}>
                                            <span className="flex items-center gap-2">
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                                                {locale === 'th' ? cfg.labelTh : cfg.label}
                                            </span>
                                        </SelectItem>
                                    )
                                })}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Ticket Kanban Board */}
                    <div className="relative -mx-4 md:-mx-6 px-2">
                        <TicketKanbanBoard
                            tickets={filteredTickets}
                            settings={settings}
                            ticketCategory={ticketCategoryTab}
                        />
                    </div>

                    <AddTicketDialog
                        open={addTicketDialogOpen}
                        onOpenChange={setAddTicketDialogOpen}
                        settings={settings}
                        defaultCategory={ticketCategoryTab}
                        users={users}
                    />
                </>
            )}

            {/* Mobile FAB */}
            <button
                onClick={() => boardMode === 'jobs' ? setAddDialogOpen(true) : setAddTicketDialogOpen(true)}
                className="sm:hidden fixed bottom-6 right-6 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-xl hover:shadow-2xl transition-all duration-200 active:scale-95"
            >
                <Plus className="h-6 w-6" />
            </button>
        </div>
    )
}

// ============================================================================
// Table View — mirrors jobs-dashboard.tsx JobTableView
// ============================================================================

function JobTableView({
    jobs, settings, jobType,
}: {
    jobs: Job[]
    settings: JobSetting[]
    jobType: JobType
}) {
    const { locale } = useLocale()

    const getStatusLabel = (status: string) => {
        const cfg = getStatusConfig(settings, jobType, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }

    const priorityLabels: Record<string, { label: string; color: string }> = {
        low: { label: locale === 'th' ? 'ต่ำ' : 'Low', color: 'text-zinc-500' },
        medium: { label: locale === 'th' ? 'ปานกลาง' : 'Medium', color: 'text-blue-600' },
        high: { label: locale === 'th' ? 'สูง' : 'High', color: 'text-amber-600' },
        urgent: { label: locale === 'th' ? 'เร่งด่วน' : 'Urgent', color: 'text-red-600' },
    }

    return (
        <div>
            {/* Mobile */}
            <div className="md:hidden space-y-2">
                {jobs.map(job => {
                    const statusCfg = getStatusConfig(settings, jobType, job.status)
                    const priority = priorityLabels[job.priority] || priorityLabels.medium
                    return (
                        <Link key={job.id} href={`/jobs/${job.id}`} className="block">
                            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 p-3.5 hover:shadow-md transition-shadow">
                                <div className="flex items-start justify-between gap-2 mb-2">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{job.title}</div>
                                        {job.customer_name && (
                                            <p className="text-xs text-zinc-400 mt-0.5 truncate">{job.customer_name}</p>
                                        )}
                                    </div>
                                    <Badge className="border-0 text-[11px] shrink-0" style={{ backgroundColor: `${statusCfg.color}20`, color: statusCfg.color }}>
                                        {getStatusLabel(job.status)}
                                    </Badge>
                                </div>
                                <div className="flex items-center gap-3 text-xs text-zinc-500 flex-wrap">
                                    {job.event_date && (
                                        <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" /> {job.event_date}
                                        </span>
                                    )}
                                    <span className={`font-medium ${priority.color}`}>{priority.label}</span>
                                </div>
                            </div>
                        </Link>
                    )
                })}
                {jobs.length === 0 && (
                    <div className="text-center py-12 text-sm text-zinc-400">
                        {locale === 'th' ? 'ไม่พบงาน' : 'No jobs found'}
                    </div>
                )}
            </div>

            {/* Desktop */}
            <div className="hidden md:block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto">
                <table className="w-full">
                    <thead className="border-b border-zinc-100 dark:border-zinc-800">
                        <tr>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{locale === 'th' ? 'ชื่องาน' : 'Title'}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{locale === 'th' ? 'ลูกค้า' : 'Customer'}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{locale === 'th' ? 'สถานะ' : 'Status'}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{locale === 'th' ? 'ลำดับความสำคัญ' : 'Priority'}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{locale === 'th' ? 'วันงาน' : 'Event Date'}</th>
                            <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500">{locale === 'th' ? 'กำหนดส่ง' : 'Due Date'}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {jobs.map(job => {
                            const statusCfg = getStatusConfig(settings, jobType, job.status)
                            const priority = priorityLabels[job.priority] || priorityLabels.medium
                            const isOverdue = job.due_date && new Date(job.due_date) < new Date() && job.status !== 'done'
                            return (
                                <tr key={job.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                                    <td className="px-4 py-3">
                                        <Link href={`/jobs/${job.id}`} className="font-medium text-sm text-zinc-900 dark:text-zinc-100 hover:text-violet-600 transition-colors">
                                            {job.title}
                                        </Link>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{job.customer_name || '—'}</td>
                                    <td className="px-4 py-3">
                                        <Badge className="border-0 text-xs" style={{ backgroundColor: `${statusCfg.color}20`, color: statusCfg.color }}>
                                            {getStatusLabel(job.status)}
                                        </Badge>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`text-sm font-medium ${priority.color}`}>{priority.label}</span>
                                    </td>
                                    <td className="px-4 py-3 text-sm text-zinc-600 dark:text-zinc-400">{job.event_date || '—'}</td>
                                    <td className={`px-4 py-3 text-sm font-medium ${isOverdue ? 'text-red-500' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                        {job.due_date || '—'}
                                    </td>
                                </tr>
                            )
                        })}
                        {jobs.length === 0 && (
                            <tr>
                                <td colSpan={6} className="px-4 py-12 text-center text-sm text-zinc-400">
                                    {locale === 'th' ? 'ไม่พบงาน' : 'No jobs found'}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
