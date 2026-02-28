'use client'

import { useMemo } from 'react'
import { useLocale } from '@/lib/i18n/context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    Users, TrendingUp, DollarSign, CalendarCheck, CheckCircle2,
    AlertCircle, Clock, Package, BarChart3
} from 'lucide-react'

type Lead = {
    id: string
    created_at: string
    status: string
    customer_name: string
    customer_type: string | null
    lead_source: string | null
    package_name: string | null
    quoted_price: number
    confirmed_price: number
    deposit: number
    event_date: string | null
    tags: string[]
}

type PaymentStats = {
    overdueCount: number
    paidCount: number
    totalOutstanding: number
    totalPaid: number
}

type Setting = {
    id: string
    category: string
    value: string
    label_th: string
    label_en: string
    color: string | null
    is_active: boolean
}

const STATUS_COLORS: Record<string, { bg: string; text: string; color: string }> = {
    lead: { bg: 'bg-blue-50 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', color: '#3b82f6' },
    quotation_sent: { bg: 'bg-amber-50 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', color: '#f59e0b' },
    accepted: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', color: '#10b981' },
    rejected: { bg: 'bg-zinc-100 dark:bg-zinc-800', text: 'text-zinc-600 dark:text-zinc-400', color: '#6b7280' },
}

const STATUS_LABELS = {
    th: { lead: 'ลูกค้าใหม่', quotation_sent: 'ส่งใบเสนอราคา', accepted: 'ตอบรับ', rejected: 'ปฏิเสธ' },
    en: { lead: 'Lead', quotation_sent: 'Quotation Sent', accepted: 'Accepted', rejected: 'Rejected' },
}

const t = {
    th: {
        title: 'ภาพรวม CRM',
        totalLeads: 'ลูกค้าทั้งหมด',
        totalRevenue: 'รายได้ทั้งหมด',
        confirmedRevenue: 'รายได้ยืนยัน',
        avgDealSize: 'มูลค่าเฉลี่ย/ดีล',
        conversionRate: 'อัตราแปลง',
        upcomingEvents: 'อีเวนต์ที่จะถึง',
        overduePayments: 'ค้างชำระ',
        paidPayments: 'ชำระแล้ว',
        statusBreakdown: 'สถานะลูกค้า',
        sourceBreakdown: 'แหล่งที่มา',
        packageBreakdown: 'แพ็คเกจ',
        monthlyTrend: 'ลูกค้าใหม่รายเดือน',
        recentLeads: 'ลูกค้าล่าสุด',
        leads: 'ราย',
        noData: 'ไม่มีข้อมูล',
        paymentOverview: 'ภาพรวมการชำระเงิน',
        totalOutstanding: 'ยอดค้างชำระ',
        totalPaid: 'ยอดชำระแล้ว',
        count: 'รายการ',
    },
    en: {
        title: 'CRM Overview',
        totalLeads: 'Total Leads',
        totalRevenue: 'Total Revenue',
        confirmedRevenue: 'Confirmed Revenue',
        avgDealSize: 'Avg Deal Size',
        conversionRate: 'Conversion Rate',
        upcomingEvents: 'Upcoming Events',
        overduePayments: 'Overdue',
        paidPayments: 'Paid',
        statusBreakdown: 'Lead Status',
        sourceBreakdown: 'Lead Sources',
        packageBreakdown: 'Packages',
        monthlyTrend: 'New Leads by Month',
        recentLeads: 'Recent Leads',
        leads: 'leads',
        noData: 'No data',
        paymentOverview: 'Payment Overview',
        totalOutstanding: 'Outstanding',
        totalPaid: 'Total Paid',
        count: 'items',
    },
}

export default function DashboardView({ leads, settings, paymentStats }: { leads: Lead[]; settings: Setting[]; paymentStats: PaymentStats }) {
    const { locale } = useLocale()
    const tc = t[locale] || t.th
    const statusLabels = STATUS_LABELS[locale] || STATUS_LABELS.th
    const today = new Date()

    const getSettingLabel = (s: Setting) => locale === 'th' ? s.label_th : s.label_en

    // === Summary Stats ===
    const stats = useMemo(() => {
        const accepted = leads.filter(l => l.status === 'accepted')
        const totalRevenue = leads.reduce((sum, l) => sum + (l.quoted_price || 0), 0)
        const confirmedRevenue = accepted.reduce((sum, l) => sum + (l.confirmed_price || 0), 0)
        const avgDeal = accepted.length > 0 ? confirmedRevenue / accepted.length : 0
        const conversionRate = leads.length > 0 ? (accepted.length / leads.length) * 100 : 0
        const upcomingEvents = leads.filter(l => l.event_date && new Date(l.event_date) >= today).length

        return {
            totalRevenue,
            confirmedRevenue,
            avgDeal,
            conversionRate,
            upcomingEvents,
            overdueCount: paymentStats.overdueCount,
            paidCount: paymentStats.paidCount,
            totalOutstanding: paymentStats.totalOutstanding,
            totalPaid: paymentStats.totalPaid,
        }
    }, [leads, paymentStats])

    // === Status Breakdown ===
    const statusBreakdown = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const l of leads) {
            counts[l.status] = (counts[l.status] || 0) + 1
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])
    }, [leads])

    // === Source Breakdown ===
    const sourceBreakdown = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const l of leads) {
            const src = l.lead_source || 'unknown'
            counts[src] = (counts[src] || 0) + 1
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])
    }, [leads])

    // === Package Breakdown ===
    const packageBreakdown = useMemo(() => {
        const counts: Record<string, number> = {}
        for (const l of leads) {
            const pkg = l.package_name || 'ไม่ระบุ'
            counts[pkg] = (counts[pkg] || 0) + 1
        }
        return Object.entries(counts).sort((a, b) => b[1] - a[1])
    }, [leads])

    // === Monthly Trend (last 6 months) ===
    const monthlyTrend = useMemo(() => {
        const months: { label: string; count: number }[] = []
        for (let i = 5; i >= 0; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            const monthNames = locale === 'th'
                ? ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
                : ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
            const count = leads.filter(l => l.created_at.startsWith(key)).length
            months.push({ label: monthNames[d.getMonth()], count })
        }
        return months
    }, [leads, locale])

    const maxMonthly = Math.max(...monthlyTrend.map(m => m.count), 1)

    // === Recent Leads (last 5) ===
    const recentLeads = useMemo(() => {
        return [...leads].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 8)
    }, [leads])

    const getSourceLabel = (src: string) => {
        const s = settings.find(s => s.category === 'source' && s.value === src)
        return s ? getSettingLabel(s) : src
    }

    const getPkgLabel = (pkg: string) => {
        const s = settings.find(s => s.category === 'package' && s.value === pkg)
        return s ? getSettingLabel(s) : pkg
    }

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard icon={Users} label={tc.totalLeads} value={leads.length.toString()} color="blue" />
                <StatCard icon={DollarSign} label={tc.confirmedRevenue} value={`฿${stats.confirmedRevenue.toLocaleString()}`} color="emerald" />
                <StatCard icon={TrendingUp} label={tc.conversionRate} value={`${stats.conversionRate.toFixed(1)}%`} color="violet" />
                <StatCard icon={CalendarCheck} label={tc.upcomingEvents} value={stats.upcomingEvents.toString()} color="amber" />
            </div>

            {/* Payment KPI */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <StatCard icon={AlertCircle} label={tc.overduePayments} value={stats.overdueCount.toString()} color="red" subtitle={`฿${stats.totalOutstanding.toLocaleString()}`} />
                <StatCard icon={CheckCircle2} label={tc.paidPayments} value={stats.paidCount.toString()} color="emerald" subtitle={`฿${stats.totalPaid.toLocaleString()}`} />
                <StatCard icon={Package} label={tc.avgDealSize} value={`฿${Math.round(stats.avgDeal).toLocaleString()}`} color="indigo" />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Breakdown */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-blue-50 dark:bg-blue-950/40">
                                <BarChart3 className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                            </div>
                            {tc.statusBreakdown}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        {statusBreakdown.map(([status, count]) => {
                            const cfg = STATUS_COLORS[status] || STATUS_COLORS.lead
                            const pct = leads.length > 0 ? (count / leads.length) * 100 : 0
                            return (
                                <div key={status} className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[13px] font-medium text-zinc-700 dark:text-zinc-300">
                                            {(statusLabels as any)[status] || status}
                                        </span>
                                        <span className="text-[13px] text-zinc-500">{count} ({pct.toFixed(0)}%)</span>
                                    </div>
                                    <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${pct}%`, backgroundColor: cfg.color }}
                                        />
                                    </div>
                                </div>
                            )
                        })}
                        {statusBreakdown.length === 0 && (
                            <p className="text-[13px] text-zinc-400 text-center py-4">{tc.noData}</p>
                        )}
                    </CardContent>
                </Card>

                {/* Monthly Trend */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-violet-50 dark:bg-violet-950/40">
                                <TrendingUp className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                            </div>
                            {tc.monthlyTrend}
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-end gap-2 h-44">
                            {monthlyTrend.map((m, i) => (
                                <div key={i} className="flex-1 flex flex-col items-center gap-1">
                                    <span className="text-[12px] font-semibold text-zinc-700 dark:text-zinc-300">{m.count}</span>
                                    <div className="w-full relative">
                                        <div
                                            className="w-full bg-gradient-to-t from-blue-500 to-blue-400 rounded-t-md transition-all duration-500"
                                            style={{ height: `${Math.max((m.count / maxMonthly) * 100, 4)}px`, minHeight: '4px' }}
                                        />
                                    </div>
                                    <span className="text-[12px] text-zinc-500">{m.label}</span>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Source + Package Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Source Breakdown */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-amber-50 dark:bg-amber-950/40">
                                <TrendingUp className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                            </div>
                            {tc.sourceBreakdown}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {sourceBreakdown.map(([src, count]) => {
                            const pct = leads.length > 0 ? (count / leads.length) * 100 : 0
                            return (
                                <div key={src} className="flex items-center justify-between py-1 border-b border-zinc-50 dark:border-zinc-800 last:border-0">
                                    <span className="text-[13px] text-zinc-700 dark:text-zinc-300">{getSourceLabel(src)}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-amber-500 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[13px] text-zinc-500 w-6 text-right">{count}</span>
                                    </div>
                                </div>
                            )
                        })}
                        {sourceBreakdown.length === 0 && (
                            <p className="text-[13px] text-zinc-400 text-center py-4">{tc.noData}</p>
                        )}
                    </CardContent>
                </Card>

                {/* Package Breakdown */}
                <Card className="shadow-sm">
                    <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <div className="flex items-center justify-center h-7 w-7 rounded-md bg-emerald-50 dark:bg-emerald-950/40">
                                <Package className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            {tc.packageBreakdown}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {packageBreakdown.map(([pkg, count]) => {
                            const pct = leads.length > 0 ? (count / leads.length) * 100 : 0
                            return (
                                <div key={pkg} className="flex items-center justify-between py-1 border-b border-zinc-50 dark:border-zinc-800 last:border-0">
                                    <span className="text-[13px] text-zinc-700 dark:text-zinc-300">{getPkgLabel(pkg)}</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[13px] text-zinc-500 w-6 text-right">{count}</span>
                                    </div>
                                </div>
                            )
                        })}
                        {packageBreakdown.length === 0 && (
                            <p className="text-[13px] text-zinc-400 text-center py-4">{tc.noData}</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent Leads */}
            <Card className="shadow-sm">
                <CardHeader className="pb-3">
                    <CardTitle className="text-base font-semibold flex items-center gap-2">
                        <div className="flex items-center justify-center h-7 w-7 rounded-md bg-indigo-50 dark:bg-indigo-950/40">
                            <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        {tc.recentLeads}
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                                    <th className="text-left py-2 pr-4 font-semibold text-zinc-500">{locale === 'th' ? 'ชื่อ' : 'Name'}</th>
                                    <th className="text-left py-2 pr-4 font-semibold text-zinc-500">{locale === 'th' ? 'สถานะ' : 'Status'}</th>
                                    <th className="text-left py-2 pr-4 font-semibold text-zinc-500">{locale === 'th' ? 'แหล่งที่มา' : 'Source'}</th>
                                    <th className="text-right py-2 pr-4 font-semibold text-zinc-500">{locale === 'th' ? 'ราคา' : 'Price'}</th>
                                    <th className="text-right py-2 font-semibold text-zinc-500">{locale === 'th' ? 'วันที่สร้าง' : 'Created'}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {recentLeads.map(l => {
                                    const cfg = STATUS_COLORS[l.status] || STATUS_COLORS.lead
                                    return (
                                        <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30 transition-colors">
                                            <td className="py-2 pr-4 font-medium text-zinc-900 dark:text-zinc-100">{l.customer_name}</td>
                                            <td className="py-2 pr-4">
                                                <Badge className={`${cfg.bg} ${cfg.text} border-0 text-[12px] px-2.5 py-0.5`}>
                                                    {(statusLabels as any)[l.status] || l.status}
                                                </Badge>
                                            </td>
                                            <td className="py-2 pr-4 text-zinc-500">{l.lead_source ? getSourceLabel(l.lead_source) : '—'}</td>
                                            <td className="py-2 pr-4 text-right text-zinc-700 dark:text-zinc-300">
                                                {l.confirmed_price ? `฿${l.confirmed_price.toLocaleString()}` : l.quoted_price ? `฿${l.quoted_price.toLocaleString()}` : '—'}
                                            </td>
                                            <td className="py-2 text-right text-zinc-500">{l.created_at.slice(0, 10)}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

// === Stat Card Component ===
function StatCard({
    icon: Icon,
    label,
    value,
    color,
    subtitle,
}: {
    icon: React.ComponentType<{ className?: string }>
    label: string
    value: string
    color: string
    subtitle?: string
}) {
    const bgMap: Record<string, string> = {
        blue: 'bg-blue-50 dark:bg-blue-950/40',
        emerald: 'bg-emerald-50 dark:bg-emerald-950/40',
        violet: 'bg-violet-50 dark:bg-violet-950/40',
        amber: 'bg-amber-50 dark:bg-amber-950/40',
        red: 'bg-red-50 dark:bg-red-950/40',
        indigo: 'bg-indigo-50 dark:bg-indigo-950/40',
    }
    const iconMap: Record<string, string> = {
        blue: 'text-blue-600 dark:text-blue-400',
        emerald: 'text-emerald-600 dark:text-emerald-400',
        violet: 'text-violet-600 dark:text-violet-400',
        amber: 'text-amber-600 dark:text-amber-400',
        red: 'text-red-600 dark:text-red-400',
        indigo: 'text-indigo-600 dark:text-indigo-400',
    }

    return (
        <Card className="shadow-sm hover:shadow-md transition-shadow duration-300">
            <CardContent className="p-5">
                <div className="flex items-start justify-between">
                    <div className="space-y-1.5">
                        <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{label}</p>
                        <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{value}</p>
                        {subtitle && <p className="text-[12px] text-zinc-400">{subtitle}</p>}
                    </div>
                    <div className={`flex items-center justify-center h-10 w-10 rounded-lg ${bgMap[color] || bgMap.blue}`}>
                        <Icon className={`h-5 w-5 ${iconMap[color] || iconMap.blue}`} />
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
