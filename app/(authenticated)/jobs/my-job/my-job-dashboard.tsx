'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    Plus, Search, LayoutGrid, List, ChevronDown, User, Settings,
    Ticket as TicketIcon, Briefcase, Calendar, AlertCircle,
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
import { MyJobKanbanBoard, getMyJobStatuses, getMyJobStatusConfig } from './components/my-job-kanban-board'
import { MyTicketKanbanBoard, getMyTicketStatuses, getMyTicketStatusConfig } from './components/my-ticket-kanban-board'
import { AddMyJobDialog } from './components/add-my-job-dialog'
import { AddMyTicketDialog } from './components/add-my-ticket-dialog'
import { updateMyJob, updateMyTicket } from './actions'
import { useLocale } from '@/lib/i18n/context'
import type { PersonalJob, PersonalSetting, PersonalTicket } from './actions'

// ============================================================================
// Types
// ============================================================================

interface MyJobDashboardProps {
    jobs: PersonalJob[]
    settings: PersonalSetting[]
    jobTypes: PersonalSetting[]          // category === 'job_type'
    tickets: PersonalTicket[]
    ticketCategories: PersonalSetting[]  // category === 'ticket_category'
    basePath?: string
    pageTitle?: string
    pageTitleTh?: string
    pageSubtitle?: string
    pageSubtitleTh?: string
    readonly?: boolean                   // true = strict view-only (no editing at all)
    showSettingsLink?: boolean           // show gear icon link to /jobs/my-job/settings
    /** When set (admin view), enables edit/add/delete targeting this user's data */
    adminTargetUserId?: string
    /** Current signed-in user's ID — needed for comment threads */
    currentUserId?: string
    /** Whether current user is admin */
    isAdmin?: boolean
}

// ============================================================================
// My Job Dashboard
// ============================================================================

export default function MyJobDashboard({
    jobs,
    settings,
    jobTypes,
    tickets,
    ticketCategories,
    basePath = '/jobs/my-job',
    pageTitle    = 'My Work',
    pageTitleTh  = 'งานของฉัน',
    pageSubtitle = '',
    pageSubtitleTh = '',
    readonly = false,
    showSettingsLink = false,
    adminTargetUserId,
    currentUserId,
    isAdmin = false,
}: MyJobDashboardProps) {
    const { locale }    = useLocale()
    const searchParams  = useSearchParams()
    const router        = useRouter()

    // canEdit = true for own view (not readonly) OR admin view (adminTargetUserId set)
    const canEdit = !readonly || !!adminTargetUserId

    const initialTab = searchParams.get('tab') === 'tickets' ? 'tickets' : 'jobs'
    const initialCat = searchParams.get('cat') || ticketCategories[0]?.value || ''

    const [boardMode,            setBoardMode]            = useState<'jobs' | 'tickets'>(initialTab)
    const [viewMode,             setViewMode]             = useState<'kanban' | 'table'>('kanban')
    const [pipelineTab,          setPipelineTab]          = useState<string>(jobTypes[0]?.value || 'personal')
    const [ticketCategoryTab,    setTicketCategoryTab]    = useState<string>(initialCat)
    const [search,               setSearch]               = useState('')
    const [statusFilter,         setStatusFilter]         = useState('all')
    const [tagFilter,            setTagFilter]            = useState<string[]>([])
    const [addJobOpen,           setAddJobOpen]           = useState(false)
    const [addTicketOpen,        setAddTicketOpen]        = useState(false)
    const [editJob,              setEditJob]              = useState<PersonalJob | null>(null)
    const [editTicket,           setEditTicket]           = useState<PersonalTicket | null>(null)

    // ---- Jobs ----
    const kanbanStatuses = useMemo(
        () => getMyJobStatuses(settings, pipelineTab),
        [settings, pipelineTab],
    )

    const getJobStatusLabel = useCallback((status: string) => {
        const cfg = getMyJobStatusConfig(settings, pipelineTab, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }, [settings, pipelineTab, locale])

    const pipelineJobs = useMemo(
        () => jobs.filter(j => j.job_type === pipelineTab),
        [jobs, pipelineTab],
    )

    const availableTags = useMemo(
        () => Array.from(new Set(jobs.flatMap(j => j.tags))).sort(),
        [jobs],
    )

    const toggleTag = useCallback((v: string) => {
        setTagFilter(prev => prev.includes(v) ? prev.filter(t => t !== v) : [...prev, v])
    }, [])

    const filteredJobs = useMemo(() => pipelineJobs.filter(job => {
        if (statusFilter !== 'all' && job.status !== statusFilter) return false
        if (tagFilter.length > 0 && !tagFilter.every(t => job.tags.includes(t))) return false
        if (search) {
            const q = search.toLowerCase()
            if (!job.title.toLowerCase().includes(q) && !(job.description?.toLowerCase().includes(q))) return false
        }
        return true
    }), [pipelineJobs, statusFilter, tagFilter, search])

    const stats = useMemo(() => {
        const statusCounts = kanbanStatuses.reduce((acc, s) => {
            acc[s] = pipelineJobs.filter(j => j.status === s).length
            return acc
        }, {} as Record<string, number>)
        return { statusCounts, total: pipelineJobs.length }
    }, [pipelineJobs, kanbanStatuses])

    // ---- Tickets ----
    const ticketStatuses = useMemo(() => getMyTicketStatuses(settings), [settings])

    const filteredTickets = useMemo(() => tickets.filter(t => {
        if (ticketCategoryTab && t.category !== ticketCategoryTab && ticketCategories.length > 0) return false
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        if (search) {
            const q = search.toLowerCase()
            if (!t.subject.toLowerCase().includes(q) && !(t.description?.toLowerCase().includes(q))) return false
        }
        return true
    }), [tickets, ticketCategoryTab, ticketCategories, statusFilter, search])

    const ticketStats = useMemo(() => {
        const catTickets = tickets.filter(t => t.category === ticketCategoryTab)
        const statusCounts = ticketStatuses.reduce((acc, s) => {
            acc[s] = catTickets.filter(t => t.status === s).length
            return acc
        }, {} as Record<string, number>)
        return { statusCounts, total: catTickets.length }
    }, [tickets, ticketCategoryTab, ticketStatuses])

    // ---- Navigation ----
    const switchToJobs    = () => { setBoardMode('jobs');    setStatusFilter('all'); setSearch(''); router.replace(basePath, { scroll: false }) }
    const switchToTickets = () => { setBoardMode('tickets'); setStatusFilter('all'); setSearch(''); router.replace(`${basePath}?tab=tickets&cat=${ticketCategoryTab}`, { scroll: false }) }

    const openTickets = tickets.filter(t => t.status !== 'closed').length

    // No settings configured yet
    const hasJobTypes = jobTypes.length > 0

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
                        {readonly && !adminTargetUserId && (
                            <Badge variant="outline" className="ml-1 text-xs font-normal text-zinc-400">
                                {locale === 'th' ? 'อ่านอย่างเดียว' : 'View only'}
                            </Badge>
                        )}
                        {adminTargetUserId && (
                            <Badge variant="outline" className="ml-1 text-xs font-normal text-violet-500 border-violet-300">
                                {locale === 'th' ? 'Admin Edit' : 'Admin Edit'}
                            </Badge>
                        )}
                    </h1>
                    {(pageSubtitle || pageSubtitleTh) && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {locale === 'th' ? pageSubtitleTh : pageSubtitle}
                        </p>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    {/* Jobs / Tickets toggle */}
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                            onClick={switchToJobs}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${boardMode === 'jobs'
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
                        >
                            <Briefcase className="h-4 w-4" />
                            <span className="hidden sm:inline">Jobs</span>
                        </button>
                        <button
                            onClick={switchToTickets}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${boardMode === 'tickets'
                                ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
                        >
                            <TicketIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Ticket</span>
                            {openTickets > 0 && (
                                <Badge className="ml-0.5 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[10px] px-1.5 py-0 border-0">
                                    {openTickets}
                                </Badge>
                            )}
                        </button>
                    </div>

                    {/* Settings link (own view only) */}
                    {showSettingsLink && !readonly && (
                        <Link href="/jobs/my-job/settings">
                            <Button variant="outline" size="sm" className="gap-1.5">
                                <Settings className="h-4 w-4" />
                                <span className="hidden sm:inline">{locale === 'th' ? 'ตั้งค่า' : 'Settings'}</span>
                            </Button>
                        </Link>
                    )}

                    {/* Add button */}
                    {canEdit && boardMode === 'jobs' && hasJobTypes && (
                        <Button
                            onClick={() => setAddJobOpen(true)}
                            className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm hidden sm:inline-flex"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {locale === 'th' ? 'เพิ่มงาน' : 'Add Job'}
                        </Button>
                    )}
                    {canEdit && boardMode === 'tickets' && (
                        <Button
                            onClick={() => setAddTicketOpen(true)}
                            className="bg-violet-600 hover:bg-violet-700 text-white shadow-sm hidden sm:inline-flex"
                        >
                            <Plus className="h-4 w-4 mr-2" />
                            {locale === 'th' ? 'เปิด Ticket' : 'New Ticket'}
                        </Button>
                    )}
                </div>
            </div>

            {/* No settings onboarding */}
            {!hasJobTypes && !canEdit && readonly && (
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10">
                    <div className="flex items-center justify-center h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/40 mb-4">
                        <Settings className="h-8 w-8 text-violet-400" />
                    </div>
                    <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        {locale === 'th' ? 'ยังไม่ได้ตั้งค่า My Job' : 'My Job not configured'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-4">
                        {locale === 'th'
                            ? 'ผู้ใช้นี้ยังไม่ได้ตั้งค่าประเภทงาน'
                            : 'This user has not configured job types yet'}
                    </p>
                </div>
            )}
            {!hasJobTypes && canEdit && !adminTargetUserId && (
                <div className="flex flex-col items-center justify-center py-16 text-center rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800 bg-violet-50/30 dark:bg-violet-950/10">
                    <div className="flex items-center justify-center h-16 w-16 rounded-full bg-violet-100 dark:bg-violet-900/40 mb-4">
                        <Settings className="h-8 w-8 text-violet-400" />
                    </div>
                    <p className="text-base font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                        {locale === 'th' ? 'ตั้งค่า My Job ก่อนเลย' : 'Set up My Job first'}
                    </p>
                    <p className="text-sm text-zinc-400 mb-4">
                        {locale === 'th'
                            ? 'กำหนดประเภทงานและสถานะที่คุณต้องการใช้งาน'
                            : 'Configure job types and statuses to get started'}
                    </p>
                    <Link href="/jobs/my-job/settings">
                        <Button className="bg-violet-600 hover:bg-violet-700 text-white">
                            <Settings className="h-4 w-4 mr-2" />
                            {locale === 'th' ? 'ไปที่การตั้งค่า' : 'Go to Settings'}
                        </Button>
                    </Link>
                </div>
            )}

            {/* ================================================================ */}
            {/* JOBS MODE */}
            {/* ================================================================ */}
            {boardMode === 'jobs' && hasJobTypes && (
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
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
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
                            const cfg   = getMyJobStatusConfig(settings, pipelineTab, status)
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

                    {/* View toggle + Filters */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                            <button
                                onClick={() => setViewMode('kanban')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'kanban'
                                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
                            >
                                <LayoutGrid className="h-4 w-4" />
                                <span className="hidden sm:inline">Kanban</span>
                            </button>
                            <button
                                onClick={() => setViewMode('table')}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${viewMode === 'table'
                                    ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                    : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'}`}
                            >
                                <List className="h-4 w-4" />
                                <span className="hidden sm:inline">{locale === 'th' ? 'ตาราง' : 'Table'}</span>
                            </button>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                                <Input
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
                                                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getMyJobStatusConfig(settings, pipelineTab, s).color }} />
                                                {getJobStatusLabel(s)}
                                            </span>
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
                                                key={tag}
                                                checked={tagFilter.includes(tag)}
                                                onCheckedChange={() => toggleTag(tag)}
                                            >
                                                {tag}
                                            </DropdownMenuCheckboxItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            )}
                        </div>
                    </div>

                    {/* Board / Table */}
                    {viewMode === 'kanban' ? (
                        <div className="relative -mx-4 md:-mx-6 px-2">
                            <MyJobKanbanBoard
                                jobs={filteredJobs}
                                settings={settings}
                                jobType={pipelineTab}
                                onEdit={canEdit ? job => setEditJob(job) : undefined}
                                readonly={!canEdit}
                                adminTargetUserId={adminTargetUserId}
                            />
                        </div>
                    ) : (
                        <MyJobTableView
                            jobs={filteredJobs}
                            settings={settings}
                            jobType={pipelineTab}
                            onEdit={canEdit ? job => setEditJob(job) : undefined}
                        />
                    )}

                    {/* Dialogs */}
                    {canEdit && (
                        <>
                            <AddMyJobDialog
                                open={addJobOpen}
                                onOpenChange={setAddJobOpen}
                                settings={settings}
                                jobTypes={jobTypes}
                                defaultJobType={pipelineTab}
                                targetUserId={adminTargetUserId}
                                currentUserId={currentUserId}
                                isAdmin={isAdmin}
                            />
                            <AddMyJobDialog
                                open={!!editJob}
                                onOpenChange={v => { if (!v) setEditJob(null) }}
                                settings={settings}
                                jobTypes={jobTypes}
                                defaultJobType={pipelineTab}
                                editJob={editJob || undefined}
                                onUpdate={adminTargetUserId
                                    ? (id, fd) => updateMyJob(id, fd, adminTargetUserId)
                                    : updateMyJob}
                                currentUserId={currentUserId}
                                isAdmin={isAdmin}
                            />
                        </>
                    )}
                </>
            )}

            {/* ================================================================ */}
            {/* TICKETS MODE */}
            {/* ================================================================ */}
            {boardMode === 'tickets' && (
                <>
                    {/* Category Chips */}
                    {ticketCategories.length > 0 && (
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
                                            : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-500 hover:bg-zinc-200'}`}
                                        style={isActive ? {
                                            backgroundColor: `${catColor}14`,
                                            color: catColor,
                                            boxShadow: `inset 0 0 0 1.5px ${catColor}40, 0 1px 3px ${catColor}15`,
                                        } : undefined}
                                    >
                                        <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                                        {locale === 'th' ? cat.label_th : cat.label_en}
                                        <span
                                            className={`ml-0.5 flex items-center justify-center h-[18px] min-w-[18px] px-1 rounded-full text-[10px] font-bold ${isActive ? 'text-white' : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500'}`}
                                            style={isActive ? { backgroundColor: `${catColor}90` } : undefined}
                                        >{count}</span>
                                    </button>
                                )
                            })}
                        </div>
                    )}

                    {/* Ticket Summary Cards */}
                    <div className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {ticketStatuses.map(status => {
                            const cfg   = getMyTicketStatusConfig(settings, status)
                            const count = ticketStats.statusCounts[status] || 0
                            return (
                                <div key={status} className="flex-shrink-0 w-[120px] sm:w-auto sm:flex-1 sm:min-w-0 relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 snap-start">
                                    <div className="absolute left-0 top-0 bottom-0 w-1" style={{ background: `linear-gradient(to bottom, ${cfg.color}, ${cfg.color}dd)` }} />
                                    <div className="flex items-center gap-2 mb-3">
                                        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: cfg.color }} />
                                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide truncate">
                                            {locale === 'th' ? cfg.labelTh : cfg.label}
                                        </span>
                                    </div>
                                    <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">{count}</div>
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
                            <SelectTrigger className="h-9 w-[130px] sm:w-[150px]"><SelectValue placeholder={locale === 'th' ? 'ทุกสถานะ' : 'All Status'} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">{locale === 'th' ? 'ทุกสถานะ' : 'All Status'}</SelectItem>
                                {ticketStatuses.map(s => {
                                    const cfg = getMyTicketStatusConfig(settings, s)
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
                        <MyTicketKanbanBoard
                            tickets={filteredTickets}
                            settings={settings}
                            ticketCategory={ticketCategoryTab}
                            onEdit={canEdit ? ticket => setEditTicket(ticket) : undefined}
                            readonly={!canEdit}
                            adminTargetUserId={adminTargetUserId}
                        />
                    </div>

                    {/* Dialogs */}
                    {canEdit && (
                        <>
                            <AddMyTicketDialog
                                open={addTicketOpen}
                                onOpenChange={setAddTicketOpen}
                                settings={settings}
                                defaultCategory={ticketCategoryTab}
                                targetUserId={adminTargetUserId}
                                currentUserId={currentUserId}
                                isAdmin={isAdmin}
                            />
                            <AddMyTicketDialog
                                open={!!editTicket}
                                onOpenChange={v => { if (!v) setEditTicket(null) }}
                                settings={settings}
                                defaultCategory={ticketCategoryTab}
                                editTicket={editTicket || undefined}
                                onUpdate={adminTargetUserId
                                    ? (id, fd) => updateMyTicket(id, fd, adminTargetUserId)
                                    : updateMyTicket}
                                currentUserId={currentUserId}
                                isAdmin={isAdmin}
                            />
                        </>
                    )}
                </>
            )}

            {/* Mobile FAB */}
            {canEdit && (
                <button
                    onClick={() => boardMode === 'jobs' ? setAddJobOpen(true) : setAddTicketOpen(true)}
                    className="sm:hidden fixed bottom-6 right-6 z-40 flex items-center justify-center h-14 w-14 rounded-full bg-violet-600 hover:bg-violet-700 text-white shadow-xl hover:shadow-2xl transition-all duration-200 active:scale-95"
                >
                    <Plus className="h-6 w-6" />
                </button>
            )}
        </div>
    )
}

// ============================================================================
// Table View
// ============================================================================

const PRIORITY_LABELS: Record<string, { en: string; th: string; color: string }> = {
    low:    { en: 'Low',    th: 'ต่ำ',       color: '#71717a' },
    medium: { en: 'Medium', th: 'ปานกลาง',   color: '#3b82f6' },
    high:   { en: 'High',   th: 'สูง',        color: '#f59e0b' },
    urgent: { en: 'Urgent', th: 'เร่งด่วน',  color: '#ef4444' },
}

function MyJobTableView({
    jobs, settings, jobType, onEdit,
}: {
    jobs: PersonalJob[]
    settings: PersonalSetting[]
    jobType: string
    onEdit?: (job: PersonalJob) => void
}) {
    const { locale } = useLocale()

    return (
        <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
            {/* Header */}
            <div className="hidden md:grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900/60 border-b border-zinc-200/60 dark:border-zinc-800/60 text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
                <span>{locale === 'th' ? 'ชื่องาน' : 'Title'}</span>
                <span>{locale === 'th' ? 'สถานะ' : 'Status'}</span>
                <span>{locale === 'th' ? 'ความสำคัญ' : 'Priority'}</span>
                <span>{locale === 'th' ? 'ครบกำหนด' : 'Due Date'}</span>
                <span></span>
            </div>

            {jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-zinc-300 dark:text-zinc-700">
                    <p className="text-sm">{locale === 'th' ? 'ไม่มีงาน' : 'No jobs'}</p>
                </div>
            ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                    {jobs.map(job => {
                        const statusCfg  = getMyJobStatusConfig(settings, jobType, job.status)
                        const prio       = PRIORITY_LABELS[job.priority] || PRIORITY_LABELS.medium
                        const isOverdue  = job.due_date && new Date(job.due_date) < new Date() && job.status !== 'done'

                        return (
                            <div key={job.id} className="flex md:grid md:grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-4 py-3 items-center bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition-colors">
                                {/* Title */}
                                <div className="min-w-0">
                                    <p className="font-medium text-sm text-zinc-900 dark:text-zinc-100 truncate">{job.title}</p>
                                    {job.description && (
                                        <p className="text-xs text-zinc-400 truncate mt-0.5">{job.description}</p>
                                    )}
                                    {job.tags.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-1">
                                            {job.tags.slice(0, 2).map(tag => (
                                                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Status */}
                                <div className="hidden md:block">
                                    <Badge className="border-0 text-[11px]" style={{ backgroundColor: `${statusCfg.color}20`, color: statusCfg.color }}>
                                        {locale === 'th' ? statusCfg.labelTh : statusCfg.label}
                                    </Badge>
                                </div>

                                {/* Priority */}
                                <div className="hidden md:flex items-center gap-1.5">
                                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: prio.color }} />
                                    <span className="text-xs text-zinc-600 dark:text-zinc-400">{locale === 'th' ? prio.th : prio.en}</span>
                                </div>

                                {/* Due date */}
                                <div className="hidden md:block">
                                    {job.due_date ? (
                                        <span className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-zinc-400'}`}>
                                            {isOverdue && <AlertCircle className="h-3 w-3" />}
                                            {new Date(job.due_date).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' })}
                                        </span>
                                    ) : (
                                        <span className="text-xs text-zinc-300">—</span>
                                    )}
                                </div>

                                {/* Edit */}
                                <div className="hidden md:flex justify-end">
                                    {onEdit && (
                                        <Button variant="ghost" size="sm" className="h-7 px-2 text-zinc-400 hover:text-violet-600" onClick={() => onEdit(job)}>
                                            {locale === 'th' ? 'แก้ไข' : 'Edit'}
                                        </Button>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
