'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, TrendingDown, BarChart3, Users, UserCheck, CalendarDays
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryColor } from '../types'
import type { FinanceCategory } from '@/app/(authenticated)/finance/settings-actions'
import CostSummaryDashboard from '../components/cost-summary-dashboard'
import type { JobCostEvent, JobCostItem } from '@/types/database.types'

type JobEventWithItems = JobCostEvent & { job_cost_items: JobCostItem[] }

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDec = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function calcTax(amount: number, vatMode: string, whtRate: number) {
  let baseAmount = amount
  let vatAmount = 0

  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
  } else if (vatMode === 'excluded') {
    baseAmount = amount
    vatAmount = amount * 0.07
  }

  const totalWithVat = baseAmount + vatAmount
  const whtAmount = baseAmount * (whtRate / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
  } catch { return dateStr }
}

/** Generate last N months as options */
function getMonthOptions(count: number) {
  const options: { value: string; label: string; labelTh: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    const labelTh = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
    options.push({ value, label, labelTh })
  }
  return options.reverse()
}

export default function ReportsView({
  jobEvents,
  activeEvents,
  closedEvents,
  importedIds,
  categories,
}: {
  jobEvents: JobEventWithItems[]
  activeEvents: { id: string; event_date: string | null }[]
  closedEvents: { id: string; event_date: string | null }[]
  importedIds: string[]
  categories: FinanceCategory[]
}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  const monthOptions = getMonthOptions(12)
  const importedSet = new Set(importedIds)

  // Filter events by selected month
  const filteredEvents = selectedMonth === 'all'
    ? jobEvents
    : jobEvents.filter(event => {
        if (!event.event_date) return false
        const eventMonth = event.event_date.substring(0, 7)
        return eventMonth === selectedMonth
      })

  // Prepare data
  const rows = filteredEvents.map(event => {
    const items = event.job_cost_items || []
    const totalCost = items.reduce((s, item) => s + (item.amount || 0), 0)

    // Revenue tax calculation
    const revVatMode = event.revenue_vat_mode || 'none'
    const revWhtRate = event.revenue_wht_rate || 0
    const revTax = calcTax(event.revenue || 0, revVatMode, revWhtRate)

    const profit = revTax.netPayable - totalCost
    const margin = revTax.netPayable ? (profit / revTax.netPayable) * 100 : 0

    // WHT & VAT per event (cost side)
    let eventWht = 0
    let eventVat = 0
    items.forEach(item => {
      const vm = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
      const tax = calcTax(item.amount, vm, item.withholding_tax_rate)
      eventWht += tax.whtAmount
      eventVat += tax.vatAmount
    })

    // Cost per category
    const catCosts: Record<string, number> = {}
    items.forEach(item => {
      catCosts[item.category] = (catCosts[item.category] || 0) + (item.amount || 0)
    })

    return { ...event, totalCost, profit, margin, catCosts, eventWht, eventVat, revTax }
  })

  // Top categories across filtered events
  const globalCatCosts: Record<string, number> = {}
  rows.forEach(r => {
    Object.entries(r.catCosts).forEach(([cat, amount]) => {
      globalCatCosts[cat] = (globalCatCosts[cat] || 0) + amount
    })
  })
  const sortedCats = Object.entries(globalCatCosts).sort((a, b) => b[1] - a[1])

  // Summary totals
  const totalRevenue = rows.reduce((s, r) => s + (r.revenue || 0), 0)
  const totalCostAll = rows.reduce((s, r) => s + r.totalCost, 0)
  const totalNetRevenue = rows.reduce((s, r) => s + r.revTax.netPayable, 0)

  // Cost-side tax totals
  const totalWht = rows.reduce((s, r) => s + r.eventWht, 0)
  const totalVat = rows.reduce((s, r) => s + r.eventVat, 0)
  const totalNetPayable = rows.reduce((s, r) => {
    const items = r.job_cost_items || []
    return s + items.reduce((sum, item) => {
      const vm = item.vat_mode || (item.include_vat ? 'excluded' : 'none')
      return sum + calcTax(item.amount, vm, item.withholding_tax_rate).netPayable
    }, 0)
  }, 0)

  // Revenue-side tax totals
  const totalRevVat = rows.reduce((s, r) => s + r.revTax.vatAmount, 0)
  const totalRevWht = rows.reduce((s, r) => s + r.revTax.whtAmount, 0)

  // Event counts filtered by month
  const filteredActive = selectedMonth === 'all'
    ? activeEvents
    : activeEvents.filter(e => e.event_date?.substring(0, 7) === selectedMonth)
  const filteredClosed = selectedMonth === 'all'
    ? closedEvents
    : closedEvents.filter(e => e.event_date?.substring(0, 7) === selectedMonth)
  const activeImported = filteredActive.filter(e => importedSet.has(e.id)).length
  const closedImported = filteredClosed.filter(e => importedSet.has(e.id)).length
  const totalEventsAll = filteredActive.length + filteredClosed.length

  return (
    <div className="space-y-6">
      {/* Header + Month Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Cost Reports' : 'รายงานต้นทุน'}</h2>
          <p className="text-sm text-muted-foreground">{isEn ? 'Compare events and analyze cost trends' : 'เปรียบเทียบงานและวิเคราะห์แนวโน้มต้นทุน'}</p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEn ? 'All Months' : 'ทุกเดือน'}</SelectItem>
              {monthOptions.map(opt => (
                <SelectItem key={opt.value} value={opt.value}>
                  {isEn ? opt.label : opt.labelTh}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Event Count Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{isEn ? 'Total Events' : 'งานทั้งหมด'}</p>
            <p className="text-2xl font-bold font-mono mt-1">{totalEventsAll}</p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{isEn ? 'Active Events' : 'งานที่ดำเนินการ'}</p>
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400 font-mono mt-1">{filteredActive.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEn ? 'Costed' : 'กรอกต้นทุนแล้ว'}: <span className="font-semibold text-foreground">{activeImported}</span>/{filteredActive.length}
            </p>
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardContent className="pt-4 pb-4">
            <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{isEn ? 'Closed Events' : 'งานที่ปิดแล้ว'}</p>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 font-mono mt-1">{filteredClosed.length}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {isEn ? 'Costed' : 'กรอกต้นทุนแล้ว'}: <span className="font-semibold text-foreground">{closedImported}</span>/{filteredClosed.length}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ──────────── Revenue & Cost Summary Dashboard ──────────── */}
      <CostSummaryDashboard
        revenue={totalRevenue}
        totalCost={totalCostAll}
        revVatAmount={totalRevVat}
        revWhtAmount={totalRevWht}
        revNetReceivable={totalNetRevenue}
        costVat={totalVat}
        costWht={totalWht}
        costNetPayable={totalNetPayable}
        isEn={isEn}
      />

      {/* Top Cost Categories */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/30">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-zinc-400" />
            {isEn ? 'Top Cost Categories' : 'หมวดต้นทุนสูงสุด'}
            {selectedMonth !== 'all' && (
              <Badge variant="secondary" className="text-[10px] ml-2">
                {isEn
                  ? monthOptions.find(o => o.value === selectedMonth)?.label
                  : monthOptions.find(o => o.value === selectedMonth)?.labelTh}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          {sortedCats.length === 0 ? (
            <div className="text-center py-8">
              <div className="w-14 h-14 mx-auto mb-2 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <BarChart3 className="h-6 w-6 text-zinc-400" />
              </div>
              <p className="text-sm text-muted-foreground">{isEn ? 'No data' : 'ไม่มีข้อมูล'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedCats.map(([cat, amount]) => {
                const catInfo = categories.find(c => c.value === cat)
                const totalAll = sortedCats.reduce((s, [, a]) => s + a, 0)
                const pct = totalAll > 0 ? (amount / totalAll) * 100 : 0
                return (
                  <div key={cat} className="flex items-center gap-3">
                    <div className="flex items-center gap-2 w-28 shrink-0">
                      <span className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: getCategoryColor(cat, categories) }} />
                      <span className="text-sm font-medium truncate">
                        {isEn ? (catInfo?.label || cat) : (catInfo?.label_th || cat)}
                      </span>
                    </div>
                    <div className="flex-1 h-6 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: getCategoryColor(cat, categories) }}
                      />
                    </div>
                    <span className="w-24 text-sm text-right font-mono font-semibold">฿{fmt(amount)}</span>
                    <span className="w-12 text-xs text-right text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Event Comparison Table */}
      <Card className="border-0 shadow-sm overflow-hidden">
        <CardHeader className="bg-zinc-50/50 dark:bg-zinc-900/30">
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-zinc-400" />
            {isEn ? 'Event Comparison' : 'เปรียบเทียบงาน'}
          </CardTitle>
          <CardDescription>{rows.length} {isEn ? 'events' : 'งาน'}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                <BarChart3 className="h-7 w-7 text-zinc-400" />
              </div>
              <p className="text-sm text-muted-foreground">{isEn ? 'No events to compare' : 'ไม่มีงานให้เปรียบเทียบ'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-zinc-50/80 dark:bg-zinc-900/50">
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Event' : 'งาน'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Date' : 'วันที่'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Seller' : 'ผู้ขาย'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isEn ? 'Staff' : 'ทีมงาน'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{isEn ? 'Revenue' : 'ราคาขาย'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{isEn ? 'Cost' : 'ต้นทุน'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{isEn ? 'WHT' : 'หัก ณ ที่จ่าย'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">VAT</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">{isEn ? 'Profit' : 'กำไร'}</TableHead>
                    <TableHead className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map(row => (
                    <TableRow key={row.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <TableCell className="font-medium max-w-[200px] truncate">{row.event_name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(row.event_date)}</TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {row.seller ? (
                          <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                            <UserCheck className="h-3 w-3 shrink-0" />
                            {row.seller}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs max-w-[120px] truncate">
                        {row.staff ? (
                          <span className="inline-flex items-center gap-1 text-zinc-600 dark:text-zinc-400">
                            <Users className="h-3 w-3 shrink-0" />
                            {row.staff}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-mono">฿{fmt(row.revenue || 0)}</TableCell>
                      <TableCell className="text-right font-mono">฿{fmt(row.totalCost)}</TableCell>
                      <TableCell className="text-right font-mono text-zinc-700 dark:text-zinc-300">{row.eventWht > 0 ? `฿${fmtDec(row.eventWht)}` : '-'}</TableCell>
                      <TableCell className="text-right font-mono text-zinc-700 dark:text-zinc-300">{row.eventVat > 0 ? `฿${fmtDec(row.eventVat)}` : '-'}</TableCell>
                      <TableCell className={`text-right font-mono font-bold ${row.profit >= 0 ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400'}`}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {row.profit >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                          {row.profit >= 0 ? '+' : ''}฿{fmt(row.profit)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={row.margin >= 0 ? 'default' : 'destructive'} className="text-[10px]">
                          {row.margin.toFixed(1)}%
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
