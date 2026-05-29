'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3, CalendarDays, RefreshCw,
  AlertTriangle, Layers, ArrowUpRight, ArrowDownRight, Trophy, AlertCircle,
  PieChart, ChevronRight, CheckCircle2, CircleAlert, Users, Building2
} from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n/context'
import type { FinanceCategory } from '@/app/(authenticated)/finance/settings-actions'
import type { JobCostEvent, JobCostItem } from '@/types/database.types'
import { bulkSyncRevenueFromCRM } from '../actions'
import { attributeRevenue } from '../lib/revenue-attribution'
import { buildCrmCostGroups, type LeadLite, type ClaimLite, type EventLite } from '../lib/crm-cost-grouping'

type JobEventWithItems = JobCostEvent & { job_cost_items: JobCostItem[] }

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtCompact = (n: number) => {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}

export default function DashboardView({ jobEvents, categories, leads, claims }: { jobEvents: JobEventWithItems[]; categories: FinanceCategory[]; leads: LeadLite[]; claims: ClaimLite[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const router = useRouter()

  // CRM Sync state — these stay on STORED revenue (drive the sync banner / data health).
  const missingRevenueCount = jobEvents.filter(e => !e.revenue || e.revenue === 0).length
  const hasRevenueCount = jobEvents.length - missingRevenueCount
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<{ syncedCount: number; skippedCount: number } | null>(null)
  const [groupMode, setGroupMode] = useState<'event' | 'crm'>('event')

  const handleBulkSync = async () => {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await bulkSyncRevenueFromCRM()
      if (result.error) {
        alert(result.error)
      } else {
        setSyncResult({ syncedCount: result.syncedCount || 0, skippedCount: result.skippedCount || 0 })
        router.refresh()
      }
    } catch {
      alert('เกิดข้อผิดพลาด')
    } finally {
      setSyncing(false)
    }
  }

  // ── Revenue attribution (single-source per CRM lead) ──
  const leadsById = useMemo(() => {
    const m = new Map<string, LeadLite>()
    for (const l of leads) m.set(l.id, l)
    return m
  }, [leads])

  const attributedRevenueById = useMemo(() => {
    const leadPriceById = new Map<string, number>()
    for (const [id, l] of leadsById) leadPriceById.set(id, Number(l.confirmed_price || l.quoted_price || 0))
    return attributeRevenue(jobEvents, leadPriceById)
  }, [jobEvents, leadsById])

  // ── Aggregated Data — revenue is the ATTRIBUTED (deduped) value ──
  const eventData = useMemo(() => jobEvents.map(event => {
    const items = event.job_cost_items || []
    const totalCost = items.reduce((s, item) => s + (item.amount || 0), 0)
    const revenue = attributedRevenueById.get(event.id) || 0
    const profit = revenue - totalCost
    const margin = revenue > 0 ? (profit / revenue) * 100 : 0
    // `revenue` MUST come after `...event` to override the raw stored revenue (deduped value).
    return { ...event, revenue, totalCost, profit, margin, hasRevenue: revenue > 0, hasStaffCost: items.some(i => i.category === 'staff') }
  }), [jobEvents, attributedRevenueById])

  const totalRevenue = eventData.reduce((s, e) => s + (e.revenue || 0), 0)
  const totalCost = eventData.reduce((s, e) => s + e.totalCost, 0)
  const totalProfit = totalRevenue - totalCost
  const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0
  const isProfitable = totalProfit >= 0
  // Average is per revenue-bearing source (deduped), not per raw event row.
  const revenueBearingCount = eventData.filter(e => e.revenue > 0).length
  const avgRevenuePerEvent = revenueBearingCount > 0 ? totalRevenue / revenueBearingCount : 0
  const hasStaffCount = eventData.filter(e => e.hasStaffCost).length
  const noStaffCount = eventData.length - hasStaffCount
  const totalStaffCost = jobEvents.reduce((s, e) => s + (e.job_cost_items || []).filter(i => i.category === 'staff').reduce((ss, i) => ss + (i.amount || 0), 0), 0)

  // ── CRM groups + unified ranking items (drives the two list sections) ──
  const crmGroups = useMemo(
    () => buildCrmCostGroups(jobEvents as unknown as EventLite[], leadsById, claims),
    [jobEvents, leadsById, claims]
  )

  type RankItem = { key: string; name: string; href: string; revenue: number; totalCost: number; profit: number }
  const rankItems: RankItem[] = useMemo(() => {
    if (groupMode === 'crm') {
      return crmGroups.map(g => ({
        key: g.key,
        name: g.customerName || (isEn ? 'Untitled' : 'ไม่มีชื่อ'),
        href: g.leadId ? `/crm/${g.leadId}` : `/costs/events/${g.primaryEventId}`,
        revenue: g.revenue,
        totalCost: g.totalCost,
        profit: g.profit,
      }))
    }
    return eventData.map(e => ({
      key: e.id,
      name: e.event_name,
      href: `/costs/events/${e.id}`,
      revenue: e.revenue || 0,
      totalCost: e.totalCost,
      profit: e.profit,
    }))
  }, [groupMode, crmGroups, eventData, isEn])

  const itemsWithRevenue = rankItems.filter(i => i.revenue > 0)
  const topItems = [...itemsWithRevenue].sort((a, b) => b.profit - a.profit).slice(0, 5)
  const bottomItems = [...itemsWithRevenue].sort((a, b) => a.profit - b.profit).slice(0, 5)

  // Cost by category
  const costByCategory = useMemo(() => {
    const map: Record<string, number> = {}
    jobEvents.forEach(e => {
      (e.job_cost_items || []).forEach(item => {
        map[item.category] = (map[item.category] || 0) + (item.amount || 0)
      })
    })
    return Object.entries(map)
      .map(([key, amount]) => {
        const cat = categories.find(c => c.value === key)
        return {
          key,
          label: cat ? (isEn ? cat.label : cat.label_th) : key,
          amount,
          color: cat?.color || '#a1a1aa',
          pct: totalCost > 0 ? (amount / totalCost) * 100 : 0,
        }
      })
      .sort((a, b) => b.amount - a.amount)
  }, [jobEvents, categories, totalCost, isEn])

  // Monthly summary
  const monthlyData = useMemo(() => {
    const map: Record<string, { revenue: number; cost: number; count: number }> = {}
    eventData.forEach(e => {
      if (!e.event_date) return
      const key = e.event_date.substring(0, 7)
      if (!map[key]) map[key] = { revenue: 0, cost: 0, count: 0 }
      map[key].revenue += (e.revenue || 0)
      map[key].cost += e.totalCost
      map[key].count++
    })
    return Object.entries(map)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, d]) => ({ month, ...d, profit: d.revenue - d.cost }))
  }, [eventData])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Costs Dashboard' : 'แดชบอร์ดต้นทุน'}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEn
              ? `${jobEvents.length} events • ${hasRevenueCount} with revenue`
              : `${jobEvents.length} งาน • ${hasRevenueCount} มีราคาขาย`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Ranking view mode: per-event vs combined per CRM */}
          <div className="inline-flex items-center rounded-lg border border-zinc-200 dark:border-zinc-700 p-0.5 bg-zinc-50 dark:bg-zinc-900">
            <button
              onClick={() => setGroupMode('event')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                groupMode === 'event'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              {isEn ? 'By Event' : 'ตามงาน'}
            </button>
            <button
              onClick={() => setGroupMode('crm')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors ${
                groupMode === 'crm'
                  ? 'bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 shadow-sm'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
              }`}
            >
              <Building2 className="h-3.5 w-3.5" />
              {isEn ? 'By CRM' : 'ตาม CRM'}
            </button>
          </div>
          <Link href="/costs/events">
            <Button variant="outline" size="sm" className="text-xs">
              {isEn ? 'View All Events' : 'ดูรายการทั้งหมด'}
              <ChevronRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          </Link>
        </div>
      </div>

      {/* CRM Sync Warning Banner */}
      {missingRevenueCount > 0 && (
        <Card className="border border-amber-200 dark:border-amber-800/50 bg-gradient-to-r from-amber-50 to-orange-50/50 dark:from-amber-950/20 dark:to-orange-950/10 shadow-sm">
          <CardContent className="py-3.5 px-5">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                  <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                    {isEn ? `${missingRevenueCount} event${missingRevenueCount > 1 ? 's' : ''} without selling price` : `มี ${missingRevenueCount} รายการยังไม่มีราคาขาย`}
                  </p>
                  <p className="text-xs text-amber-600/80 dark:text-amber-400/80">
                    {isEn ? 'Revenue data may be inaccurate — sync from CRM or enter manually' : 'ข้อมูลกำไรอาจไม่ถูกต้อง — ดึงจาก CRM หรือกรอกเอง'}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/30 shrink-0"
                disabled={syncing}
                onClick={handleBulkSync}
              >
                <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${syncing ? 'animate-spin' : ''}`} />
                {syncing
                  ? (isEn ? 'Syncing...' : 'กำลัง Sync...')
                  : (isEn ? 'Sync All from CRM' : 'Sync ทั้งหมดจาก CRM')}
              </Button>
            </div>
            {syncResult && (
              <div className="mt-2.5 flex items-center gap-3 text-xs">
                {syncResult.syncedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium">
                    <DollarSign className="h-3 w-3" /> Sync สำเร็จ {syncResult.syncedCount} รายการ
                  </span>
                )}
                {syncResult.skippedCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 font-medium">
                    ไม่พบข้อมูลใน CRM {syncResult.skippedCount} รายการ
                  </span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── KPI Cards ── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Revenue */}
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm overflow-hidden relative group hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-full">
                <Layers className="h-3 w-3" />
                {hasRevenueCount}/{jobEvents.length}
              </div>
            </div>
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              {isEn ? 'Total Revenue' : 'ราคาขายรวม'}
            </p>
            <p className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              ฿{fmtCompact(totalRevenue)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {isEn ? 'Avg' : 'เฉลี่ย'} ฿{fmt(Math.round(avgRevenuePerEvent))}/{isEn ? 'event' : 'งาน'}
            </p>
          </CardContent>
        </Card>

        {/* Cost */}
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm overflow-hidden relative group hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-red-500/5 to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-red-500 to-orange-500 flex items-center justify-center shadow-sm">
                <TrendingDown className="h-5 w-5 text-white" />
              </div>
              {totalRevenue > 0 && (
                <span className="text-xs font-mono font-semibold text-red-500 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-full">
                  {(totalCost / totalRevenue * 100).toFixed(0)}%
                </span>
              )}
            </div>
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              {isEn ? 'Total Cost' : 'ต้นทุนรวม'}
            </p>
            <p className="text-2xl font-bold font-mono text-red-600 dark:text-red-400">
              ฿{fmtCompact(totalCost)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              {costByCategory.length} {isEn ? 'categories' : 'หมวด'}
            </p>
          </CardContent>
        </Card>

        {/* Profit */}
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm overflow-hidden relative group hover:shadow-md transition-shadow">
          <div className={`absolute inset-0 bg-gradient-to-br ${isProfitable ? 'from-emerald-500/5' : 'from-red-500/5'} to-transparent pointer-events-none`} />
          <CardContent className="pt-5 pb-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${isProfitable ? 'from-emerald-500 to-green-600' : 'from-red-500 to-red-600'} flex items-center justify-center shadow-sm`}>
                {isProfitable ? <TrendingUp className="h-5 w-5 text-white" /> : <TrendingDown className="h-5 w-5 text-white" />}
              </div>
              <div className={`flex items-center gap-0.5 text-xs font-semibold ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                {isProfitable ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                {isProfitable ? '+' : ''}{profitMargin.toFixed(1)}%
              </div>
            </div>
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              {isEn ? 'Net Profit' : 'กำไรสุทธิ'}
            </p>
            <p className={`text-2xl font-bold font-mono ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
              {isProfitable ? '+' : ''}฿{fmtCompact(totalProfit)}
            </p>
          </CardContent>
        </Card>

        {/* Margin / Data Health */}
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm overflow-hidden relative group hover:shadow-md transition-shadow">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/5 to-transparent pointer-events-none" />
          <CardContent className="pt-5 pb-4 relative">
            <div className="flex items-center justify-between mb-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-sm">
                <BarChart3 className="h-5 w-5 text-white" />
              </div>
            </div>
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              {isEn ? 'Data Completeness' : 'ความครบถ้วนข้อมูล'}
            </p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold font-mono text-violet-600 dark:text-violet-400">
                {jobEvents.length > 0 ? ((hasRevenueCount / jobEvents.length) * 100).toFixed(0) : 0}%
              </p>
            </div>
            {/* Mini progress */}
            <div className="mt-2 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-violet-500 to-purple-500"
                style={{ width: `${jobEvents.length > 0 ? (hasRevenueCount / jobEvents.length) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" /> {hasRevenueCount}</span>
              <span className="flex items-center gap-1"><CircleAlert className="h-2.5 w-2.5 text-amber-500" /> {missingRevenueCount}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Staff Cost Status ── */}
      {jobEvents.length > 0 && (
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
          <CardContent className="py-5 px-6">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-sm">
                  <Users className="h-4 w-4 text-white" />
                </div>
                <div>
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                    {isEn ? 'Staff Cost Status' : 'สถานะค่าสตาฟ'}
                  </span>
                  <p className="text-[10px] text-muted-foreground">
                    {isEn ? 'Events with staff cost items recorded' : 'จำนวนงานที่มีรายการค่าสตาฟแล้ว'}
                  </p>
                </div>
              </div>
              <Link href="/costs/events">
                <Button variant="outline" size="sm" className="text-[10px] h-7">
                  {isEn ? 'View Events' : 'ดูรายการงาน'}
                  <ChevronRight className="h-3 w-3 ml-1" />
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">{hasStaffCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{isEn ? 'Has Staff Cost' : 'มีค่าสตาฟ'}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-rose-500 dark:text-rose-400">{noStaffCount}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{isEn ? 'No Staff Cost' : 'ยังไม่มีค่าสตาฟ'}</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold font-mono text-zinc-700 dark:text-zinc-300">฿{fmtCompact(totalStaffCost)}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{isEn ? 'Total Staff Cost' : 'ค่าสตาฟรวม'}</p>
              </div>
            </div>
            {/* Progress bar */}
            <div className="mt-3 h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-500 to-indigo-500"
                style={{ width: `${jobEvents.length > 0 ? (hasStaffCount / jobEvents.length) * 100 : 0}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-1.5 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="h-2.5 w-2.5 text-blue-500" />
                {jobEvents.length > 0 ? ((hasStaffCount / jobEvents.length) * 100).toFixed(0) : 0}% {isEn ? 'recorded' : 'บันทึกแล้ว'}
              </span>
              <span className="flex items-center gap-1">
                <CircleAlert className="h-2.5 w-2.5 text-rose-500" />
                {noStaffCount} {isEn ? 'remaining' : 'รายการเหลือ'}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Revenue vs Cost Visual Bar ── */}
      {totalRevenue > 0 && (
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
          <CardContent className="py-5 px-6">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                {isEn ? 'Revenue vs Cost Ratio' : 'สัดส่วนราคาขาย vs ต้นทุน'}
              </span>
              <span className={`text-sm font-bold font-mono ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                {isEn ? 'Margin' : 'กำไร'} {profitMargin.toFixed(1)}%
              </span>
            </div>
            <div className="relative h-10 bg-zinc-100 dark:bg-zinc-800 rounded-xl overflow-hidden">
              <div
                className="absolute top-0 h-full flex items-center justify-center text-white text-xs font-semibold rounded-l-xl transition-all duration-700 ease-out"
                style={{
                  width: `${Math.min((totalCost / totalRevenue) * 100, 100)}%`,
                  background: 'linear-gradient(135deg, #ef4444, #f97316)',
                }}
              >
                {(totalCost / totalRevenue) * 100 > 20 && (
                  <span className="drop-shadow-sm">{isEn ? 'Cost' : 'ต้นทุน'} {((totalCost / totalRevenue) * 100).toFixed(0)}%</span>
                )}
              </div>
              {totalRevenue > totalCost && (
                <div
                  className="absolute top-0 h-full flex items-center justify-center text-white text-xs font-semibold rounded-r-xl transition-all duration-700 ease-out"
                  style={{
                    left: `${Math.min((totalCost / totalRevenue) * 100, 100)}%`,
                    width: `${Math.max(((totalRevenue - totalCost) / totalRevenue) * 100, 0)}%`,
                    background: 'linear-gradient(135deg, #10b981, #059669)',
                  }}
                >
                  {((totalRevenue - totalCost) / totalRevenue) * 100 > 15 && (
                    <span className="drop-shadow-sm">{isEn ? 'Profit' : 'กำไร'} {profitMargin.toFixed(0)}%</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }} />
                {isEn ? 'Cost' : 'ต้นทุน'} ฿{fmt(totalCost)}
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} />
                {isEn ? 'Profit' : 'กำไร'} ฿{fmt(totalProfit)}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Two-Column: Category Breakdown + Top/Bottom Events ── */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Cost by Category */}
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <PieChart className="h-4 w-4 text-violet-500" />
              {isEn ? 'Cost Breakdown by Category' : 'สัดส่วนต้นทุนแยกตามหมวด'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {costByCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isEn ? 'No cost data yet' : 'ยังไม่มีข้อมูลต้นทุน'}
              </p>
            ) : (
              <div className="space-y-3">
                {costByCategory.map((cat, i) => (
                  <div key={cat.key}>
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cat.color }} />
                        <span className="font-medium truncate">{cat.label}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">฿{fmt(cat.amount)}</span>
                        <span className="text-xs text-muted-foreground w-12 text-right">{cat.pct.toFixed(1)}%</span>
                      </div>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700 ease-out"
                        style={{
                          width: `${cat.pct}%`,
                          backgroundColor: cat.color,
                          opacity: 0.85,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top & Bottom Events */}
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="h-4 w-4 text-amber-500" />
              {groupMode === 'crm'
                ? (isEn ? 'CRM Performance Ranking' : 'อันดับ CRM ตามกำไร')
                : (isEn ? 'Event Performance Ranking' : 'อันดับงานตามกำไร')}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {itemsWithRevenue.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                {isEn ? 'No data with revenue' : 'ยังไม่มีรายการที่มีราคาขาย'}
              </p>
            ) : (
              <div className="space-y-4">
                {/* Top performers */}
                <div>
                  <p className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                    <ArrowUpRight className="h-3 w-3" />
                    {isEn ? 'Top Profit' : 'กำไรสูงสุด'}
                  </p>
                  <div className="space-y-1.5">
                    {topItems.slice(0, 3).map((item, i) => (
                      <Link key={item.key} href={item.href} className="block group">
                        <div className="flex items-center gap-3 py-1.5 px-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                          <span className="text-xs font-bold text-zinc-400 w-5">{i + 1}</span>
                          <span className="flex-1 text-sm font-medium truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {item.name}
                          </span>
                          <span className="text-sm font-bold font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                            +฿{fmtCompact(item.profit)}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="border-t border-zinc-100 dark:border-zinc-800" />

                {/* Bottom performers */}
                {bottomItems.some(i => i.profit < 0) && (
                  <div>
                    <p className="text-[10px] font-semibold text-red-500 dark:text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                      <ArrowDownRight className="h-3 w-3" />
                      {isEn ? 'Lowest Profit' : 'กำไรต่ำสุด'}
                    </p>
                    <div className="space-y-1.5">
                      {bottomItems.filter(i => i.profit < 0).slice(0, 3).map((item) => (
                        <Link key={item.key} href={item.href} className="block group">
                          <div className="flex items-center gap-3 py-1.5 px-2.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                            <span className="text-xs font-bold text-zinc-400 w-5">↓</span>
                            <span className="flex-1 text-sm font-medium truncate group-hover:text-red-500 transition-colors">
                              {item.name}
                            </span>
                            <span className="text-sm font-bold font-mono text-red-500 dark:text-red-400 shrink-0">
                              ฿{fmtCompact(item.profit)}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Monthly Summary ── */}
      {monthlyData.length > 1 && (
        <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-blue-500" />
              {isEn ? 'Monthly Summary' : 'สรุปรายเดือน'}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider border-b border-zinc-100 dark:border-zinc-800">
                    <th className="text-left py-2 pr-3">{isEn ? 'Month' : 'เดือน'}</th>
                    <th className="text-right py-2 px-3">{isEn ? 'Events' : 'จำนวนงาน'}</th>
                    <th className="text-right py-2 px-3">{isEn ? 'Revenue' : 'ราคาขาย'}</th>
                    <th className="text-right py-2 px-3">{isEn ? 'Cost' : 'ต้นทุน'}</th>
                    <th className="text-right py-2 pl-3">{isEn ? 'Profit' : 'กำไร'}</th>
                  </tr>
                </thead>
                <tbody>
                  {monthlyData.map(m => {
                    const monthLabel = (() => {
                      try {
                        const d = new Date(m.month + '-01')
                        return d.toLocaleDateString(isEn ? 'en-US' : 'th-TH', { month: 'short', year: 'numeric' })
                      } catch { return m.month }
                    })()
                    return (
                      <tr key={m.month} className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50/50 dark:hover:bg-zinc-800/20 transition-colors">
                        <td className="py-2.5 pr-3 font-medium text-zinc-700 dark:text-zinc-300">{monthLabel}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-muted-foreground">{m.count}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-blue-600 dark:text-blue-400 font-medium">฿{fmt(m.revenue)}</td>
                        <td className="py-2.5 px-3 text-right font-mono text-red-500 dark:text-red-400">฿{fmt(m.cost)}</td>
                        <td className={`py-2.5 pl-3 text-right font-mono font-bold ${m.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
                          {m.profit >= 0 ? '+' : ''}฿{fmt(m.profit)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Revenue vs Cost per Event ── */}
      <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              {groupMode === 'crm'
                ? (isEn ? 'Revenue vs Cost per CRM' : 'รายได้ vs ต้นทุน แต่ละ CRM')
                : (isEn ? 'Revenue vs Cost per Event' : 'ราคาขาย vs ต้นทุน แต่ละงาน')}
            </CardTitle>
            <span className="text-[10px] text-muted-foreground">
              {isEn ? `Showing ${Math.min(rankItems.length, 15)} of ${rankItems.length}` : `แสดง ${Math.min(rankItems.length, 15)} จาก ${rankItems.length}`}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {jobEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {isEn ? 'No events imported yet' : 'ยังไม่มีงาน'}
            </p>
          ) : (
            <div className="space-y-2.5">
              {rankItems.slice(0, 15).map(item => {
                const maxVal = Math.max(item.revenue || 0, item.totalCost, 1)
                const revPct = ((item.revenue || 0) / maxVal) * 100
                const costPct = (item.totalCost / maxVal) * 100
                return (
                  <Link key={item.key} href={item.href} className="block group">
                    <div className="space-y-1.5">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium truncate max-w-[50%] group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                          {item.name}
                        </span>
                        <div className="flex items-center gap-3 text-xs shrink-0">
                          <span className="font-mono text-blue-600 dark:text-blue-400">฿{fmtCompact(item.revenue || 0)}</span>
                          <span className="text-zinc-300 dark:text-zinc-600">|</span>
                          <span className="font-mono text-red-500 dark:text-red-400">฿{fmtCompact(item.totalCost)}</span>
                          <span className={`font-mono font-bold ${item.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>
                            {item.profit >= 0 ? '+' : ''}฿{fmtCompact(item.profit)}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-0.5 h-3">
                        <div
                          className="h-full bg-blue-400/80 rounded-l-sm transition-all duration-500"
                          style={{ width: `${revPct * 0.48}%` }}
                        />
                        <div
                          className="h-full bg-red-400/80 rounded-r-sm transition-all duration-500"
                          style={{ width: `${costPct * 0.48}%` }}
                        />
                      </div>
                    </div>
                  </Link>
                )
              })}
              <div className="flex items-center gap-4 mt-3 pt-2 border-t border-zinc-100 dark:border-zinc-800 text-[10px] text-muted-foreground">
                <div className="flex items-center gap-1"><div className="w-3 h-2 bg-blue-400/80 rounded-sm" />{isEn ? 'Revenue' : 'ราคาขาย'}</div>
                <div className="flex items-center gap-1"><div className="w-3 h-2 bg-red-400/80 rounded-sm" />{isEn ? 'Cost' : 'ต้นทุน'}</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
