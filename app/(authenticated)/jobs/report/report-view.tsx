'use client'

import Link from 'next/link'
import {
    BarChart3, TrendingUp, Clock, CheckCircle, Archive,
    Ticket as TicketIcon, Flag, User, ArrowRight, Users
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { getTicketStatusConfig } from '../components/ticket-kanban-board'
import { useLocale } from '@/lib/i18n/context'
import type { TicketReportData, JobSetting } from '../actions'

// ============================================================================
// Types & Helpers
// ============================================================================

interface ReportViewProps {
    report: TicketReportData
    settings: JobSetting[]
    categories: JobSetting[]
}

const PRIORITY_CONFIG: Record<string, { label: string; labelTh: string; color: string }> = {
    urgent: { label: 'Urgent', labelTh: 'ด่วนที่สุด', color: '#ef4444' },
    high: { label: 'High', labelTh: 'ด่วน', color: '#f59e0b' },
    normal: { label: 'Normal', labelTh: 'ปกติ', color: '#3b82f6' },
}

// ============================================================================
// Report View Component
// ============================================================================

export default function ReportView({ report, settings, categories }: ReportViewProps) {
    const { locale } = useLocale()

    const getCategoryLabel = (catValue: string) => {
        const cat = categories.find(c => c.value === catValue)
        if (!cat) return catValue
        return locale === 'th' ? cat.label_th : cat.label_en
    }

    const getCategoryColor = (catValue: string) => {
        return categories.find(c => c.value === catValue)?.color || '#6b7280'
    }

    const getStatusLabel = (status: string) => {
        const cfg = getTicketStatusConfig(settings, status)
        return locale === 'th' ? cfg.labelTh : cfg.label
    }

    const getPriorityConfig = (priority: string) => {
        return PRIORITY_CONFIG[priority] || PRIORITY_CONFIG.normal
    }

    // Max values for bar scaling
    const maxCategoryCount = Math.max(...report.byCategory.map(c => c.count), 1)
    const maxMonthlyCount = Math.max(...report.monthlyTrend.map(m => m.count), 1)

    // Format avg resolution time
    const formatResolutionTime = (hours: number | null) => {
        if (hours === null) return locale === 'th' ? 'ไม่มีข้อมูล' : 'N/A'
        if (hours < 1) return `${Math.round(hours * 60)} ${locale === 'th' ? 'นาที' : 'min'}`
        if (hours < 24) return `${Math.round(hours)} ${locale === 'th' ? 'ชม.' : 'hrs'}`
        const days = Math.round(hours / 24 * 10) / 10
        return `${days} ${locale === 'th' ? 'วัน' : 'days'}`
    }

    return (
        <div className="space-y-8">
            {/* Header */}
            <div>
                <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2.5">
                    <BarChart3 className="h-6 w-6 text-violet-500" />
                    {locale === 'th' ? 'รายงาน Ticket' : 'Ticket Report'}
                </h1>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                    {locale === 'th' ? 'ภาพรวมสถิติการใช้งานระบบ Ticket' : 'Overview of ticket system usage and statistics'}
                </p>
            </div>

            {/* ============================================================ */}
            {/* Summary Cards */}
            {/* ============================================================ */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {/* Total */}
                <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-5 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-500" />
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-violet-100 dark:bg-violet-950/50 text-violet-600 dark:text-violet-400">
                            <TicketIcon className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {locale === 'th' ? 'ทั้งหมด' : 'Total'}
                        </span>
                    </div>
                    <div className="text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                        {report.totalTickets}
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th' ? 'Ticket ที่เปิดทั้งหมด' : 'All tickets created'}
                    </p>
                </div>

                {/* Open */}
                <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-5 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-400 to-orange-500" />
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
                            <TrendingUp className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {locale === 'th' ? 'เปิดอยู่' : 'Open'}
                        </span>
                    </div>
                    <div className="text-3xl font-extrabold text-amber-600 dark:text-amber-400 tracking-tight">
                        {report.openCount}
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th' ? 'รอดำเนินการ' : 'Awaiting action'}
                    </p>
                </div>

                {/* Closed */}
                <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-5 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-400 to-green-500" />
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400">
                            <CheckCircle className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {locale === 'th' ? 'ปิดแล้ว' : 'Closed'}
                        </span>
                    </div>
                    <div className="text-3xl font-extrabold text-emerald-600 dark:text-emerald-400 tracking-tight">
                        {report.closedCount}
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th' ? 'เสร็จสิ้นแล้ว' : 'Completed'}
                    </p>
                </div>

                {/* Avg Resolution Time */}
                <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/60 dark:border-zinc-800/60 p-5 shadow-sm">
                    <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-cyan-500" />
                    <div className="flex items-center gap-2 mb-3">
                        <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-blue-100 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400">
                            <Clock className="h-4 w-4" />
                        </div>
                        <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                            {locale === 'th' ? 'แก้ไขเฉลี่ย' : 'Avg. Resolution'}
                        </span>
                    </div>
                    <div className="text-3xl font-extrabold text-blue-600 dark:text-blue-400 tracking-tight">
                        {formatResolutionTime(report.avgResolutionHours)}
                    </div>
                    <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-1">
                        {locale === 'th' ? 'เวลาเฉลี่ยตั้งแต่เปิดถึงปิด' : 'Avg. time from open to close'}
                    </p>
                </div>
            </div>

            {/* ============================================================ */}
            {/* Charts Row */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

                {/* Category Breakdown */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <BarChart3 className="h-4 w-4 text-violet-500" />
                        {locale === 'th' ? 'แยกตามหมวดหมู่' : 'By Category'}
                    </h3>
                    {report.byCategory.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-8">{locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</p>
                    ) : (
                        <div className="space-y-3">
                            {report.byCategory.map(item => {
                                const color = getCategoryColor(item.category)
                                const pct = Math.round((item.count / maxCategoryCount) * 100)
                                return (
                                    <div key={item.category}>
                                        <div className="flex items-center justify-between mb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                                    {getCategoryLabel(item.category)}
                                                </span>
                                            </div>
                                            <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{item.count}</span>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500 ease-out"
                                                style={{
                                                    width: `${pct}%`,
                                                    background: `linear-gradient(90deg, ${color}, ${color}cc)`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Status & Priority Distribution */}
                <div className="space-y-4 sm:space-y-6">
                    {/* Status */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <CheckCircle className="h-4 w-4 text-emerald-500" />
                            {locale === 'th' ? 'แยกตามสถานะ' : 'By Status'}
                        </h3>
                        {report.byStatus.length === 0 ? (
                            <p className="text-sm text-zinc-400 text-center py-4">{locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</p>
                        ) : (
                            <div className="flex flex-wrap gap-3">
                                {report.byStatus.map(item => {
                                    const cfg = getTicketStatusConfig(settings, item.status)
                                    const pct = report.totalTickets > 0 ? Math.round((item.count / report.totalTickets) * 100) : 0
                                    return (
                                        <div
                                            key={item.status}
                                            className="flex-1 min-w-[80px] relative overflow-hidden rounded-xl border border-zinc-100 dark:border-zinc-800 p-3"
                                        >
                                            <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: cfg.color }} />
                                            <div className="text-2xl font-extrabold tracking-tight" style={{ color: cfg.color }}>
                                                {item.count}
                                            </div>
                                            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                                                {getStatusLabel(item.status)}
                                            </div>
                                            <div className="text-[10px] text-zinc-400 dark:text-zinc-500">{pct}%</div>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>

                    {/* Priority */}
                    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                        <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                            <Flag className="h-4 w-4 text-amber-500" />
                            {locale === 'th' ? 'แยกตามความเร่งด่วน' : 'By Priority'}
                        </h3>
                        {report.byPriority.length === 0 ? (
                            <p className="text-sm text-zinc-400 text-center py-4">{locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</p>
                        ) : (
                            <div className="space-y-2.5">
                                {report.byPriority.map(item => {
                                    const cfg = getPriorityConfig(item.priority)
                                    const pct = report.totalTickets > 0 ? Math.round((item.count / report.totalTickets) * 100) : 0
                                    return (
                                        <div key={item.priority} className="flex items-center gap-3">
                                            <div className="w-20 text-xs font-semibold truncate" style={{ color: cfg.color }}>
                                                {locale === 'th' ? cfg.labelTh : cfg.label}
                                            </div>
                                            <div className="flex-1 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500"
                                                    style={{
                                                        width: `${pct}%`,
                                                        backgroundColor: cfg.color,
                                                        minWidth: item.count > 0 ? '8px' : '0',
                                                    }}
                                                />
                                            </div>
                                            <span className="text-sm font-bold text-zinc-700 dark:text-zinc-300 w-8 text-right">{item.count}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ============================================================ */}
            {/* Closed by Category + Top Creators */}
            {/* ============================================================ */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">

                {/* Closed by Category */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                        {locale === 'th' ? 'สรุปปิด Ticket ตามหมวดหมู่' : 'Closed Tickets by Category'}
                    </h3>
                    {report.closedByCategory.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-8">{locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</p>
                    ) : (
                        <div className="space-y-3.5">
                            {report.closedByCategory.map(item => {
                                const color = getCategoryColor(item.category)
                                const closedPct = item.total > 0 ? Math.round((item.closed / item.total) * 100) : 0
                                return (
                                    <div key={item.category}>
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                                <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                                                    {getCategoryLabel(item.category)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                                    {item.closed}/{item.total}
                                                </span>
                                                <span className={`text-xs font-bold ${closedPct >= 80 ? 'text-emerald-500' : closedPct >= 50 ? 'text-amber-500' : 'text-zinc-400'}`}>
                                                    {closedPct}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="h-2.5 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500 ease-out"
                                                style={{
                                                    width: `${closedPct}%`,
                                                    background: closedPct >= 80
                                                        ? `linear-gradient(90deg, #10b981, #34d399)`
                                                        : closedPct >= 50
                                                            ? `linear-gradient(90deg, #f59e0b, #fbbf24)`
                                                            : `linear-gradient(90deg, ${color}, ${color}cc)`,
                                                    minWidth: item.closed > 0 ? '8px' : '0',
                                                }}
                                            />
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>

                {/* Top Ticket Creators */}
                <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                    <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Users className="h-4 w-4 text-violet-500" />
                        {locale === 'th' ? 'ผู้เปิด Ticket มากที่สุด' : 'Top Ticket Creators'}
                    </h3>
                    {report.topCreators.length === 0 ? (
                        <p className="text-sm text-zinc-400 text-center py-8">{locale === 'th' ? 'ไม่มีข้อมูล' : 'No data'}</p>
                    ) : (
                        <div className="space-y-2">
                            {report.topCreators.map((creator, idx) => (
                                <div
                                    key={creator.userId}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-zinc-50/50 dark:bg-zinc-800/30 border border-zinc-100/80 dark:border-zinc-800/50"
                                >
                                    {/* Rank */}
                                    <div className={`flex items-center justify-center h-7 w-7 rounded-lg text-xs font-extrabold shrink-0 ${idx === 0 ? 'bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400'
                                            : idx === 1 ? 'bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-300'
                                                : idx === 2 ? 'bg-orange-100 dark:bg-orange-950/50 text-orange-600 dark:text-orange-400'
                                                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500'
                                        }`}>
                                        {idx + 1}
                                    </div>

                                    {/* Name + Categories */}
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
                                            {creator.name}
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                            {creator.categories.map(cat => (
                                                <span key={cat.category} className="flex items-center gap-0.5 text-[10px] text-zinc-400 dark:text-zinc-500">
                                                    <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(cat.category) }} />
                                                    {getCategoryLabel(cat.category)}
                                                    <span className="font-bold text-zinc-500 dark:text-zinc-400">{cat.count}</span>
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Total Count */}
                                    <div className="text-right shrink-0">
                                        <div className="text-lg font-extrabold text-zinc-800 dark:text-zinc-200">{creator.total}</div>
                                        <div className="text-[10px] text-zinc-400 dark:text-zinc-500">tickets</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* ============================================================ */}
            {/* Monthly Trend */}
            {/* ============================================================ */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-6 flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-blue-500" />
                    {locale === 'th' ? 'แนวโน้มรายเดือน (6 เดือนล่าสุด)' : 'Monthly Trend (Last 6 Months)'}
                </h3>
                <div className="flex items-end gap-2 sm:gap-4 h-[160px]">
                    {report.monthlyTrend.map((m, i) => {
                        const heightPct = maxMonthlyCount > 0 ? (m.count / maxMonthlyCount) * 100 : 0
                        const isLast = i === report.monthlyTrend.length - 1
                        return (
                            <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
                                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{m.count}</span>
                                <div className="w-full flex justify-center">
                                    <div
                                        className={`w-full max-w-[48px] rounded-t-lg transition-all duration-500 ${isLast ? 'bg-gradient-to-t from-violet-600 to-violet-400' : 'bg-gradient-to-t from-zinc-300 to-zinc-200 dark:from-zinc-700 dark:to-zinc-600'}`}
                                        style={{
                                            height: `${Math.max(heightPct, 4)}%`,
                                            minHeight: '4px',
                                        }}
                                    />
                                </div>
                                <span className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500 truncate w-full text-center">
                                    {m.month}
                                </span>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ============================================================ */}
            {/* Recent Closed Tickets */}
            {/* ============================================================ */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 sm:p-6 shadow-sm">
                <h3 className="text-sm font-bold text-zinc-700 dark:text-zinc-300 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <Archive className="h-4 w-4 text-zinc-400" />
                    {locale === 'th' ? 'Ticket ที่ปิดล่าสุด' : 'Recently Closed Tickets'}
                </h3>
                {report.recentClosed.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-zinc-300 dark:text-zinc-700">
                        <CheckCircle className="h-8 w-8 mb-2" />
                        <span className="text-sm font-medium">
                            {locale === 'th' ? 'ยังไม่มี Ticket ที่ปิด' : 'No closed tickets yet'}
                        </span>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        {report.recentClosed.map(ticket => {
                            const statusCfg = getTicketStatusConfig(settings, ticket.status)
                            const catColor = getCategoryColor(ticket.category)
                            const closedDate = ticket.closed_at
                                ? new Date(ticket.closed_at).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { day: 'numeric', month: 'short' })
                                : ''

                            return (
                                <Link
                                    key={ticket.id}
                                    href={`/jobs/tickets/${ticket.id}`}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 transition-colors group"
                                >
                                    <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: catColor }} />
                                    <span className="text-xs font-mono text-zinc-400 dark:text-zinc-500 shrink-0">
                                        {ticket.ticket_number}
                                    </span>
                                    <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate flex-1 group-hover:text-violet-600 dark:group-hover:text-violet-400 transition-colors">
                                        {ticket.subject}
                                    </span>
                                    <Badge
                                        className="border-0 text-[10px] shrink-0"
                                        style={{ backgroundColor: `${statusCfg.color}15`, color: statusCfg.color }}
                                    >
                                        {getStatusLabel(ticket.status)}
                                    </Badge>
                                    {ticket.profiles?.full_name && (
                                        <span className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
                                            <User className="h-3 w-3" />
                                            {ticket.profiles.full_name}
                                        </span>
                                    )}
                                    {closedDate && (
                                        <span className="text-[11px] text-zinc-400 dark:text-zinc-500 shrink-0">
                                            {closedDate}
                                        </span>
                                    )}
                                    <ArrowRight className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 group-hover:text-violet-400 transition-colors shrink-0" />
                                </Link>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
