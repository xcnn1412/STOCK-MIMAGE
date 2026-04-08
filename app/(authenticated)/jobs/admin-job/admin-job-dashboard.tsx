'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import { useSearchParams, useRouter } from 'next/navigation'
import {
    Plus, Search, ShieldCheck, Briefcase, Ticket as TicketIcon,
    User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { JobKanbanBoard } from '../components/job-kanban-board'
import { AddJobDialog } from '../components/add-job-dialog'
import { TicketKanbanBoard, getTicketStatuses, getTicketStatusConfig } from '../components/ticket-kanban-board'
import { AddTicketDialog } from '../components/add-ticket-dialog'
import { getStatusesFromSettings, getStatusConfig } from '../jobs-dashboard'
import { useLocale } from '@/lib/i18n/context'
import type { Job, JobSetting, Ticket } from '../actions'

// ============================================================================
// Types
// ============================================================================

interface SystemUser {
    id: string
    full_name: string | null
    department: string | null
}

interface AdminJobDashboardProps {
    allJobs: Job[]
    allTickets: Ticket[]
    settings: JobSetting[]
    users: SystemUser[]
    jobTypes: JobSetting[]
    ticketCategories: JobSetting[]
}

// ============================================================================
// Admin Job Dashboard
// ============================================================================

export default function AdminJobDashboard({
    allJobs, allTickets, settings, users, jobTypes, ticketCategories,
}: AdminJobDashboardProps) {
    const { locale } = useLocale()
    const searchParams = useSearchParams()
    const router = useRouter()

    // ---------- User selector ----------
    const initialUserId = searchParams.get('user') || 'all'
    const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId)

    // ---------- Board mode ----------
    const initialTab = searchParams.get('tab') === 'tickets' ? 'tickets' : 'jobs'
    const [boardMode, setBoardMode] = useState<'jobs' | 'tickets'>(initialTab)

    // ---------- Jobs state ----------
    const [pipelineTab, setPipelineTab] = useState<string>(jobTypes[0]?.value || 'graphic')
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<'all' | string>('all')
    const [addDialogOpen, setAddDialogOpen] = useState(false)

    // ---------- Tickets state ----------
    const initialCat = searchParams.get('cat') || ticketCategories[0]?.value || ''
    const [ticketCategoryTab, setTicketCategoryTab] = useState<string>(initialCat)
    const [addTicketDialogOpen, setAddTicketDialogOpen] = useState(false)

    // ---------- Derived: filter by selected user ----------
    const userJobs = useMemo(() => {
        if (selectedUserId === 'all') return allJobs
        return allJobs.filter(j =>
            j.created_by === selectedUserId ||
            (j.assigned_to || []).includes(selectedUserId)
        )
    }, [allJobs, selectedUserId])

    const userTickets = useMemo(() => {
        if (selectedUserId === 'all') return allTickets
        return allTickets.filter(t =>
            t.created_by === selectedUserId ||
            (t.assigned_to || []).includes(selectedUserId)
        )
    }, [allTickets, selectedUserId])

    // ---------- Jobs computed ----------
    const kanbanStatuses = useMemo(
        () => getStatusesFromSettings(settings, pipelineTab),
        [settings, pipelineTab],
    )

    const getStatusLabel = useCallback((status: string) => {
        const cfg = getStatusConfig(settings, pipelineTab, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }, [settings, pipelineTab, locale])

    const pipelineJobs = useMemo(
        () => userJobs.filter(j => j.job_type === pipelineTab),
        [userJobs, pipelineTab],
    )

    const filteredJobs = useMemo(() => pipelineJobs.filter(job => {
        if (statusFilter !== 'all' && job.status !== statusFilter) return false
        if (search) {
            const q = search.toLowerCase()
            if (!job.title.toLowerCase().includes(q) && !(job.customer_name?.toLowerCase().includes(q))) return false
        }
        return true
    }), [pipelineJobs, statusFilter, search])

    const stats = useMemo(() => {
        const statusCounts = kanbanStatuses.reduce((acc, s) => {
            acc[s] = pipelineJobs.filter(j => j.status === s).length
            return acc
        }, {} as Record<string, number>)
        return { statusCounts, total: pipelineJobs.length }
    }, [pipelineJobs, kanbanStatuses])

    // ---------- Tickets computed ----------
    const ticketStatuses = useMemo(() => getTicketStatuses(settings), [settings])

    const filteredTickets = useMemo(() => userTickets.filter(t => {
        if (search) {
            const q = search.toLowerCase()
            if (!t.subject.toLowerCase().includes(q) && !(t.description?.toLowerCase().includes(q))) return false
        }
        if (statusFilter !== 'all' && t.status !== statusFilter) return false
        return true
    }), [userTickets, search, statusFilter])

    const ticketStats = useMemo(() => {
        const categoryTickets = userTickets.filter(t => t.category === ticketCategoryTab)
        const statusCounts = ticketStatuses.reduce((acc, s) => {
            acc[s] = categoryTickets.filter(t => t.status === s).length
            return acc
        }, {} as Record<string, number>)
        return { statusCounts, total: categoryTickets.length }
    }, [userTickets, ticketCategoryTab, ticketStatuses])

    const selectedUser = selectedUserId === 'all' ? null : users.find(u => u.id === selectedUserId)

    const handleUserChange = (uid: string) => {
        setSelectedUserId(uid)
        setStatusFilter('all')
        setSearch('')
        router.replace(
            `/jobs/admin-job?user=${uid}&tab=${boardMode}${boardMode === 'tickets' ? `&cat=${ticketCategoryTab}` : ''}`,
            { scroll: false },
        )
    }

    const switchBoard = (mode: 'jobs' | 'tickets') => {
        setBoardMode(mode)
        setStatusFilter('all')
        setSearch('')
        router.replace(
            `/jobs/admin-job?user=${selectedUserId}&tab=${mode}${mode === 'tickets' ? `&cat=${ticketCategoryTab}` : ''}`,
            { scroll: false },
        )
    }

    return (
        <div className="space-y-6">

            {/* ================================================================ */}
            {/* Header */}
            {/* ================================================================ */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <ShieldCheck className="h-5 w-5 text-violet-500" />
                        {locale === 'th' ? 'Admin Job' : 'Admin Job'}
                    </h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        {locale === 'th'
                            ? 'ดูและจัดการงานของผู้ใช้แต่ละคน'
                            : 'View and manage individual user job boards'
                        }
                    </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Jobs / Tickets toggle */}
                    <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg p-1">
                        <button
                            onClick={() => switchBoard('jobs')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${boardMode === 'jobs'
                                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-zinc-100 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            <Briefcase className="h-4 w-4" />
                            <span className="hidden sm:inline">Jobs</span>
                        </button>
                        <button
                            onClick={() => switchBoard('tickets')}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${boardMode === 'tickets'
                                ? 'bg-white dark:bg-zinc-700 text-violet-600 dark:text-violet-400 shadow-sm'
                                : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400'
                                }`}
                        >
                            <TicketIcon className="h-4 w-4" />
                            <span className="hidden sm:inline">Ticket</span>
                            {userTickets.filter(t => t.status !== 'closed').length > 0 && (
                                <Badge className="ml-0.5 bg-violet-100 dark:bg-violet-950 text-violet-600 dark:text-violet-400 text-[10px] px-1.5 py-0 border-0">
                                    {userTickets.filter(t => t.status !== 'closed').length}
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
            {/* User Selector */}
            {/* ================================================================ */}
            <div className="flex items-center gap-3 p-4 bg-violet-50/60 dark:bg-violet-950/20 border border-violet-200/60 dark:border-violet-800/40 rounded-xl">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400 shrink-0">
                    <User className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wide mb-1">
                        {locale === 'th' ? 'กรองตามผู้ใช้' : 'Filter by User'}
                    </p>
                    <Select value={selectedUserId} onValueChange={handleUserChange}>
                        <SelectTrigger className="h-9 w-full sm:w-[280px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                            <SelectValue>
                                {selectedUser ? (
                                    <span className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-violet-100 dark:bg-violet-900 text-[10px] font-bold text-violet-700 dark:text-violet-300 shrink-0">
                                            {(selectedUser.full_name || '?').charAt(0).toUpperCase()}
                                        </span>
                                        {selectedUser.full_name || selectedUser.id.slice(0, 8)}
                                        {selectedUser.department && (
                                            <span className="text-zinc-400 text-xs">· {selectedUser.department}</span>
                                        )}
                                    </span>
                                ) : (
                                    <span className="text-zinc-500">{locale === 'th' ? 'ผู้ใช้ทั้งหมด' : 'All Users'}</span>
                                )}
                            </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">
                                <span className="flex items-center gap-2 text-zinc-500">
                                    <ShieldCheck className="h-4 w-4" />
                                    {locale === 'th' ? 'ผู้ใช้ทั้งหมด' : 'All Users'}
                                </span>
                            </SelectItem>
                            {users.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                    <span className="flex items-center gap-2">
                                        <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 shrink-0">
                                            {(u.full_name || '?').charAt(0).toUpperCase()}
                                        </span>
                                        {u.full_name || u.id.slice(0, 8)}
                                        {u.department && <span className="text-zinc-400 text-xs">· {u.department}</span>}
                                    </span>
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                {selectedUser && (
                    <div className="flex flex-col items-end gap-0.5 shrink-0">
                        <span className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                            {userJobs.length}
                            <span className="text-xs font-normal text-zinc-400 ml-1">
                                {locale === 'th' ? 'งาน' : 'jobs'}
                            </span>
                        </span>
                        <span className="text-xs text-zinc-500">
                            {userTickets.length} {locale === 'th' ? 'ticket' : 'tickets'}
                        </span>
                    </div>
                )}
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
                                    {userJobs.filter(j => j.job_type === jt.value).length}
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

                    {/* Filters */}
                    <div className="flex items-center justify-end gap-2 flex-wrap">
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
                                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: getStatusConfig(settings, pipelineTab, s).color }} />
                                            {getStatusLabel(s)}
                                        </span>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="relative -mx-4 md:-mx-6 px-2">
                        <JobKanbanBoard
                            jobs={filteredJobs}
                            settings={settings}
                            users={users}
                            jobType={pipelineTab}
                        />
                    </div>

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
                            const count = userTickets.filter(t => t.category === cat.value && t.status !== 'closed').length
                            return (
                                <button
                                    key={cat.value}
                                    onClick={() => {
                                        setTicketCategoryTab(cat.value)
                                        setStatusFilter('all')
                                        router.replace(`/jobs/admin-job?user=${selectedUserId}&tab=tickets&cat=${cat.value}`, { scroll: false })
                                    }}
                                    className={`group flex items-center gap-2 px-3.5 py-2 rounded-full text-sm font-semibold transition-all duration-200 whitespace-nowrap ${isActive ? 'shadow-sm scale-[1.02]' : 'bg-zinc-100 dark:bg-zinc-800/70 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}
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
                                <div key={status} className="flex-shrink-0 w-[120px] sm:w-auto sm:flex-1 sm:min-w-0 relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 snap-start">
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
                    <div className="flex items-center justify-end gap-2">
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
