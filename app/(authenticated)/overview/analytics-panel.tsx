'use client'

import { useMemo, useState } from 'react'
import {
  TrendingUp, DollarSign, Zap, Receipt, Percent, Banknote,
  ArrowUpRight, ArrowDownRight, Download, Calendar, BarChart3,
} from 'lucide-react'
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart,
  Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts'
import { attributeRevenue } from '@/app/(authenticated)/costs/lib/revenue-attribution'

// ─── Types (mirror overview-view.tsx) ────────────────────────

interface JobEvent {
  id: string; source_event_id: string | null; event_name: string
  event_date: string | null; event_location: string | null
  staff: string | null; revenue: number | null; seller: string | null
  status: string | null
  revenue_vat_mode: string | null; revenue_wht_rate: number | null
  linked_lead_id: string | null; phase: string | null
}
interface CostItem {
  id: string; job_event_id: string; category: string
  description: string | null; amount: number; title: string | null
  vat_mode?: string | null; include_vat?: boolean | null
  withholding_tax_rate?: number | null; cost_date?: string | null
}
interface ExpenseClaim {
  id: string; job_event_id: string | null; total_amount: number | null
  status: string; submitted_by: string | null; category: string
  paid_at?: string | null; expense_date?: string | null
  vat_mode?: string | null; withholding_tax_rate?: number | null; include_vat?: boolean | null
}
interface OverviewData {
  jobEvents: JobEvent[]; costItems: CostItem[]; leads: unknown[]
  expenseClaims: ExpenseClaim[]; checkins: unknown[]
  profiles: unknown[]; events: unknown[]
}

// ─── Helpers ─────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 })
const fmtK = (n: number) => {
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : 0)

const MONTH_LABELS_TH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']

function calcTax(amount: number, vatMode: string | null | undefined, whtRate: number | null | undefined) {
  const rate = Number(whtRate || 0)
  let base = amount
  let vat = 0
  if (vatMode === 'included') {
    base = amount / 1.07
    vat = amount - base
  } else if (vatMode === 'excluded') {
    base = amount
    vat = amount * 0.07
  }
  const wht = base * (rate / 100)
  return { base, vat, wht, totalWithVat: base + vat, net: base + vat - wht }
}

function trendBand(deltaPct: number) {
  if (deltaPct > 0) return 'text-emerald-600 dark:text-emerald-400'
  if (deltaPct < 0) return 'text-red-500 dark:text-red-400'
  return 'text-zinc-400'
}

// ─── Aggregation ─────────────────────────────────────────────

interface MonthRollup {
  monthIdx: number              // 0–11
  monthKey: string              // 'YYYY-MM'
  monthLabel: string            // 'ม.ค.'

  // Revenue side
  revenueGross: number
  revenueBase: number           // ฐาน VAT
  revenueVat: number            // output VAT
  revenueWht: number            // WHT ที่เราถูกหัก
  revenueNet: number            // เงินที่ได้รับจริง

  // Cost side (job_cost_items)
  costGross: number
  costBase: number              // ฐาน VAT input
  costVat: number               // input VAT
  costWht: number               // WHT ที่เราหักผู้รับ
  byCategory: Record<string, number>

  // Cash out (expense_claims status='paid' bucketed by paid_at)
  expensePaidByPaidAt: number

  // Derived
  vatPayable: number            // output VAT − input VAT
  profit: number                // revenueBase − costBase
  margin: number
  eventCount: number
}

interface YearRollup {
  year: number
  months: MonthRollup[]
  yearTotal: Omit<MonthRollup, 'monthIdx' | 'monthKey' | 'monthLabel'>
}

function buildYearRollup(data: OverviewData, year: number): YearRollup {
  const months: MonthRollup[] = Array.from({ length: 12 }, (_, i) => ({
    monthIdx: i,
    monthKey: `${year}-${String(i + 1).padStart(2, '0')}`,
    monthLabel: MONTH_LABELS_TH[i],
    revenueGross: 0, revenueBase: 0, revenueVat: 0, revenueWht: 0, revenueNet: 0,
    costGross: 0, costBase: 0, costVat: 0, costWht: 0, byCategory: {},
    expensePaidByPaidAt: 0,
    vatPayable: 0, profit: 0, margin: 0, eventCount: 0,
  }))

  // Index events by id → month for joining cost items
  const eventMonthMap = new Map<string, number | null>()

  // Single-source revenue per CRM lead (attribute to one primary event, others 0).
  const attributedRevenueById = attributeRevenue(data.jobEvents)

  // 1) Revenue from job_cost_events (bucket by event_date)
  data.jobEvents.forEach(je => {
    if (!je.event_date) { eventMonthMap.set(je.id, null); return }
    const d = new Date(je.event_date)
    if (d.getFullYear() !== year) { eventMonthMap.set(je.id, null); return }
    const m = d.getMonth()
    eventMonthMap.set(je.id, m)
    const bucket = months[m]
    const revenue = attributedRevenueById.get(je.id) ?? Number(je.revenue || 0)
    if (revenue > 0) {
      const t = calcTax(revenue, je.revenue_vat_mode, je.revenue_wht_rate)
      bucket.revenueGross += revenue
      bucket.revenueBase += t.base
      bucket.revenueVat += t.vat
      bucket.revenueWht += t.wht
      bucket.revenueNet += t.net
    }
    bucket.eventCount += 1
  })

  // 2) Cost from job_cost_items (bucket by cost_date if present, else by linked event's month)
  data.costItems.forEach(ci => {
    let m: number | null = null
    if (ci.cost_date) {
      const d = new Date(ci.cost_date)
      if (d.getFullYear() === year) m = d.getMonth()
      else return
    } else {
      const fallback = eventMonthMap.get(ci.job_event_id)
      if (fallback === null || fallback === undefined) return
      m = fallback
    }
    if (m === null) return
    const bucket = months[m]
    const amt = Number(ci.amount || 0)
    if (amt === 0) return
    const t = calcTax(amt, ci.vat_mode, ci.withholding_tax_rate)
    bucket.costGross += amt
    bucket.costBase += t.base
    bucket.costVat += t.vat
    bucket.costWht += t.wht
    bucket.byCategory[ci.category] = (bucket.byCategory[ci.category] || 0) + amt
  })

  // 3) Expense claims paid (bucket by paid_at) — separate cash-out timeline
  data.expenseClaims.forEach(ec => {
    if (ec.status !== 'paid' || !ec.paid_at) return
    const d = new Date(ec.paid_at)
    if (d.getFullYear() !== year) return
    months[d.getMonth()].expensePaidByPaidAt += Number(ec.total_amount || 0)
  })

  // Derived per month
  months.forEach(m => {
    m.vatPayable = m.revenueVat - m.costVat
    m.profit = m.revenueBase - m.costBase
    m.margin = pct(m.profit, m.revenueBase)
  })

  // Year total
  const yearTotal = months.reduce((acc, m) => {
    acc.revenueGross += m.revenueGross
    acc.revenueBase += m.revenueBase
    acc.revenueVat += m.revenueVat
    acc.revenueWht += m.revenueWht
    acc.revenueNet += m.revenueNet
    acc.costGross += m.costGross
    acc.costBase += m.costBase
    acc.costVat += m.costVat
    acc.costWht += m.costWht
    acc.expensePaidByPaidAt += m.expensePaidByPaidAt
    acc.eventCount += m.eventCount
    Object.entries(m.byCategory).forEach(([k, v]) => {
      acc.byCategory[k] = (acc.byCategory[k] || 0) + v
    })
    return acc
  }, {
    revenueGross: 0, revenueBase: 0, revenueVat: 0, revenueWht: 0, revenueNet: 0,
    costGross: 0, costBase: 0, costVat: 0, costWht: 0, byCategory: {} as Record<string, number>,
    expensePaidByPaidAt: 0, vatPayable: 0, profit: 0, margin: 0, eventCount: 0,
  })
  yearTotal.vatPayable = yearTotal.revenueVat - yearTotal.costVat
  yearTotal.profit = yearTotal.revenueBase - yearTotal.costBase
  yearTotal.margin = pct(yearTotal.profit, yearTotal.revenueBase)

  return { year, months, yearTotal }
}

type AggregateTotal = YearRollup['yearTotal']

function aggregateMonths(months: MonthRollup[]): AggregateTotal {
  const acc: AggregateTotal = {
    revenueGross: 0, revenueBase: 0, revenueVat: 0, revenueWht: 0, revenueNet: 0,
    costGross: 0, costBase: 0, costVat: 0, costWht: 0, byCategory: {},
    expensePaidByPaidAt: 0, vatPayable: 0, profit: 0, margin: 0, eventCount: 0,
  }
  months.forEach(m => {
    acc.revenueGross += m.revenueGross
    acc.revenueBase += m.revenueBase
    acc.revenueVat += m.revenueVat
    acc.revenueWht += m.revenueWht
    acc.revenueNet += m.revenueNet
    acc.costGross += m.costGross
    acc.costBase += m.costBase
    acc.costVat += m.costVat
    acc.costWht += m.costWht
    acc.expensePaidByPaidAt += m.expensePaidByPaidAt
    acc.eventCount += m.eventCount
    Object.entries(m.byCategory).forEach(([k, v]) => {
      acc.byCategory[k] = (acc.byCategory[k] || 0) + v
    })
  })
  acc.vatPayable = acc.revenueVat - acc.costVat
  acc.profit = acc.revenueBase - acc.costBase
  acc.margin = pct(acc.profit, acc.revenueBase)
  return acc
}

// ─── Component ───────────────────────────────────────────────

export default function AnalyticsPanel({ data }: { data: OverviewData }) {
  const [year, setYear] = useState(() => new Date().getFullYear())
  // empty Set = ทั้งปี (no filter); otherwise filter to selected month indices
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set())

  const availableYears = useMemo(() => {
    const set = new Set<number>()
    data.jobEvents.forEach(je => {
      if (je.event_date) set.add(new Date(je.event_date).getFullYear())
    })
    const current = new Date().getFullYear()
    set.add(current)
    return Array.from(set).sort((a, b) => b - a)
  }, [data.jobEvents])

  const current = useMemo(() => buildYearRollup(data, year), [data, year])
  const previous = useMemo(() => buildYearRollup(data, year - 1), [data, year])

  const isAllYear = selectedMonths.size === 0

  const filteredCurrentMonths = useMemo(
    () => isAllYear ? current.months : current.months.filter(m => selectedMonths.has(m.monthIdx)),
    [current, selectedMonths, isAllYear],
  )
  const filteredPreviousMonths = useMemo(
    () => isAllYear ? previous.months : previous.months.filter(m => selectedMonths.has(m.monthIdx)),
    [previous, selectedMonths, isAllYear],
  )

  const cur = useMemo(() => aggregateMonths(filteredCurrentMonths), [filteredCurrentMonths])
  const prev = useMemo(() => aggregateMonths(filteredPreviousMonths), [filteredPreviousMonths])

  const trend = (a: number, b: number) => (b !== 0 ? ((a - b) / Math.abs(b)) * 100 : a > 0 ? 100 : 0)

  const dRevenue = trend(cur.revenueGross, prev.revenueGross)
  const dCost = trend(cur.costGross, prev.costGross)
  const dProfit = trend(cur.profit, prev.profit)
  const dVatPayable = trend(cur.vatPayable, prev.vatPayable)

  const toggleMonth = (idx: number) => {
    setSelectedMonths(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }
  const selectAllYear = () => setSelectedMonths(new Set())

  const filterLabel = isAllYear
    ? 'ทั้งปี'
    : Array.from(selectedMonths).sort((a, b) => a - b).map(i => MONTH_LABELS_TH[i]).join(', ')

  // Chart data — reflect filter (empty filter = all 12 months)
  const monthlyChartData = useMemo(() => filteredCurrentMonths.map(m => ({
    name: m.monthLabel,
    รายรับ: Math.round(m.revenueGross),
    ต้นทุน: Math.round(m.costGross),
    กำไร: Math.round(m.profit),
  })), [filteredCurrentMonths])

  const taxChartData = useMemo(() => filteredCurrentMonths.map(m => ({
    name: m.monthLabel,
    'ฐาน VAT': Math.round(m.revenueBase),
    'VAT': Math.round(m.revenueVat),
    'WHT ถูกหัก': Math.round(m.revenueWht),
  })), [filteredCurrentMonths])

  const cashOutData = useMemo(() => filteredCurrentMonths.map(m => ({
    name: m.monthLabel,
    'ต้นทุนตามวันงาน': Math.round(m.costGross),
    'จ่ายจริง (paid_at)': Math.round(m.expensePaidByPaidAt),
  })), [filteredCurrentMonths])

  function exportCSV() {
    const header = 'เดือน,Event,รายรับ,ฐาน VAT,VAT (output),WHT ถูกหัก,รับสุทธิ,ต้นทุน,VAT (input),WHT เราหัก,VAT ต้องนำส่ง,กำไร,Margin%,เบิกจ่ายแล้ว(paid_at)\n'
    const rows = filteredCurrentMonths.map(m => [
      m.monthLabel,
      m.eventCount,
      Math.round(m.revenueGross),
      Math.round(m.revenueBase),
      Math.round(m.revenueVat),
      Math.round(m.revenueWht),
      Math.round(m.revenueNet),
      Math.round(m.costGross),
      Math.round(m.costVat),
      Math.round(m.costWht),
      Math.round(m.vatPayable),
      Math.round(m.profit),
      m.margin.toFixed(1),
      Math.round(m.expensePaidByPaidAt),
    ].join(',')).join('\n')
    const totalLabel = isAllYear ? 'รวมทั้งปี' : `รวม (${filterLabel})`
    const total = `\n${totalLabel},${cur.eventCount},${Math.round(cur.revenueGross)},${Math.round(cur.revenueBase)},${Math.round(cur.revenueVat)},${Math.round(cur.revenueWht)},${Math.round(cur.revenueNet)},${Math.round(cur.costGross)},${Math.round(cur.costVat)},${Math.round(cur.costWht)},${Math.round(cur.vatPayable)},${Math.round(cur.profit)},${cur.margin.toFixed(1)},${Math.round(cur.expensePaidByPaidAt)}`
    const blob = new Blob(['﻿' + header + rows + total], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    const suffix = isAllYear ? 'all' : Array.from(selectedMonths).sort((a, b) => a - b).map(i => i + 1).join('-')
    a.href = url
    a.download = `analytics-${year}-${suffix}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasData = cur.eventCount > 0 || cur.costGross > 0

  return (
    <div className="space-y-6">
      {/* Header / Year picker */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-zinc-100 dark:bg-zinc-800">
            <Calendar className="h-4 w-4 text-zinc-500" />
            <select
              value={year}
              onChange={e => setYear(Number(e.target.value))}
              className="bg-transparent text-sm font-bold text-zinc-900 dark:text-zinc-100 focus:outline-none cursor-pointer"
            >
              {availableYears.map(y => (
                <option key={y} value={y}>ปี {y + 543}</option>
              ))}
            </select>
          </div>
          <span className="text-xs text-zinc-400">
            เทียบกับปี {(year - 1) + 543}
          </span>
        </div>
        <button
          onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]"
        >
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Month filter chips */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-3 space-y-2">
        <div className="flex items-center gap-2 px-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">กรองเดือน</span>
          <span className="text-[10px] text-zinc-500">· {filterLabel}</span>
          {!isAllYear && (
            <button
              onClick={selectAllYear}
              className="ml-auto text-[10px] text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 underline underline-offset-2"
            >
              ล้าง
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={selectAllYear}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
              isAllYear
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
            }`}
          >
            ทั้งปี
          </button>
          {MONTH_LABELS_TH.map((label, idx) => {
            const active = selectedMonths.has(idx)
            return (
              <button
                key={idx}
                onClick={() => toggleMonth(idx)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {!hasData ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 p-12 text-center">
          <BarChart3 className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
          <p className="text-sm text-zinc-400">
            ไม่มีข้อมูลสำหรับปี {year + 543}{!isAllYear && ` (${filterLabel})`}
          </p>
        </div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <KpiCard
              icon={TrendingUp}
              label="รายรับรวม"
              value={`฿${fmtK(cur.revenueGross)}`}
              sub={`รับสุทธิ ฿${fmtK(cur.revenueNet)}`}
              trendPct={dRevenue}
            />
            <KpiCard
              icon={DollarSign}
              label="ต้นทุนรวม"
              value={`฿${fmtK(cur.costGross)}`}
              sub={`${pct(cur.costGross, cur.revenueGross).toFixed(0)}% ของรายรับ`}
              trendPct={dCost}
              trendInverse
            />
            <KpiCard
              icon={Zap}
              label="กำไรสุทธิ"
              value={`฿${fmtK(cur.profit)}`}
              sub={`Margin ${cur.margin.toFixed(1)}%`}
              trendPct={dProfit}
            />
            <KpiCard
              icon={Banknote}
              label="VAT ต้องนำส่ง (ภพ.30)"
              value={`฿${fmtK(cur.vatPayable)}`}
              sub={`Output ฿${fmtK(cur.revenueVat)} − Input ฿${fmtK(cur.costVat)}`}
              trendPct={dVatPayable}
              trendInverse
            />
            <KpiCard
              icon={Percent}
              label="WHT ถูกหัก (เครดิตภาษี)"
              value={`฿${fmtK(cur.revenueWht)}`}
              sub="ใช้เครดิตภาษีตอนยื่น ภงด."
            />
            <KpiCard
              icon={Receipt}
              label="WHT เราหัก (ต้องนำส่ง)"
              value={`฿${fmtK(cur.costWht)}`}
              sub="ภงด.3/53"
            />
          </div>

          {/* Chart A: Revenue · Cost · Profit */}
          <ChartCard title="รายรับ · ต้นทุน · กำไร รายเดือน" icon={BarChart3}>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthlyChartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
                  <Tooltip formatter={(v) => `฿${fmt(Number(v ?? 0))}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="รายรับ" fill="#18181b" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="ต้นทุน" fill="#a1a1aa" radius={[4, 4, 0, 0]} />
                  <Line type="monotone" dataKey="กำไร" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Chart B: Tax base */}
          <ChartCard title="ฐานภาษีรายเดือน (Revenue Side)" icon={Banknote}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={taxChartData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
                  <Tooltip formatter={(v) => `฿${fmt(Number(v ?? 0))}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ฐาน VAT" stackId="t" fill="#71717a" />
                  <Bar dataKey="VAT" stackId="t" fill="#3b82f6" />
                  <Bar dataKey="WHT ถูกหัก" stackId="t" fill="#f59e0b" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </ChartCard>

          {/* Chart C: Cash out timing */}
          <ChartCard title="กระแสเงินสดเบิก vs ต้นทุนตามวันงาน" icon={Receipt}>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={cashOutData} margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-zinc-200 dark:stroke-zinc-800" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={v => fmtK(v)} />
                  <Tooltip formatter={(v) => `฿${fmt(Number(v ?? 0))}`} contentStyle={{ borderRadius: 8, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="ต้นทุนตามวันงาน" stroke="#a1a1aa" strokeWidth={2} dot={{ r: 3 }} />
                  <Line type="monotone" dataKey="จ่ายจริง (paid_at)" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] text-zinc-400 mt-2">
              * เปรียบเทียบ &ldquo;ต้นทุนที่เกิด&rdquo; (ตามวันที่งาน/cost_date) กับ &ldquo;เงินที่จ่ายจริง&rdquo; (ตาม paid_at ของใบเบิกที่จ่ายแล้ว)
            </p>
          </ChartCard>

          {/* Monthly breakdown table */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
            <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                ตารางสรุปรายเดือน
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/50">
                  <tr className="text-zinc-400">
                    <th className="px-3 py-2 text-left font-semibold uppercase tracking-wider">เดือน</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Event</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">รายรับ</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">ฐาน VAT</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">VAT</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">WHT หัก</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">รับสุทธิ</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">ต้นทุน</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">VAT นำส่ง</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">กำไร</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">Margin</th>
                    <th className="px-3 py-2 text-right font-semibold uppercase tracking-wider">จ่ายจริง</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredCurrentMonths.map(m => (
                    <tr key={m.monthKey} className="hover:bg-zinc-50/50 dark:hover:bg-zinc-800/30">
                      <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-300">{m.monthLabel}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-500">{m.eventCount || '—'}</td>
                      <td className="px-3 py-2 text-right font-mono">{m.revenueGross > 0 ? fmt(m.revenueGross) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-500">{m.revenueBase > 0 ? fmt(m.revenueBase) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600 dark:text-blue-400">{m.revenueVat > 0 ? fmt(m.revenueVat) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-amber-600 dark:text-amber-400">{m.revenueWht > 0 ? fmt(m.revenueWht) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-700 dark:text-zinc-200">{m.revenueNet > 0 ? fmt(m.revenueNet) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-500">{m.costGross > 0 ? fmt(m.costGross) : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-blue-600 dark:text-blue-400">{m.vatPayable !== 0 ? fmt(m.vatPayable) : '—'}</td>
                      <td className={`px-3 py-2 text-right font-mono font-semibold ${m.profit < 0 ? 'text-red-500' : m.profit > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                        {m.profit !== 0 ? fmt(m.profit) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-500">{m.revenueBase > 0 ? `${m.margin.toFixed(0)}%` : '—'}</td>
                      <td className="px-3 py-2 text-right font-mono text-zinc-500">{m.expensePaidByPaidAt > 0 ? fmt(m.expensePaidByPaidAt) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-zinc-50 dark:bg-zinc-800/50 border-t-2 border-zinc-200 dark:border-zinc-700">
                  <tr className="font-bold text-zinc-900 dark:text-zinc-100">
                    <td className="px-3 py-2.5 uppercase tracking-wider text-[10px]">{isAllYear ? 'รวมทั้งปี' : `รวม ${filterLabel}`}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{cur.eventCount}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(cur.revenueGross)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(cur.revenueBase)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">{fmt(cur.revenueVat)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-amber-600 dark:text-amber-400">{fmt(cur.revenueWht)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(cur.revenueNet)}</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(cur.costGross)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-blue-600 dark:text-blue-400">{fmt(cur.vatPayable)}</td>
                    <td className={`px-3 py-2.5 text-right font-mono ${cur.profit < 0 ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {fmt(cur.profit)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-mono">{cur.margin.toFixed(1)}%</td>
                    <td className="px-3 py-2.5 text-right font-mono">{fmt(cur.expensePaidByPaidAt)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Cost categories breakdown */}
          {Object.keys(cur.byCategory).length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
              <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                ต้นทุนแยกตามหมวด · ปี {year + 543} {!isAllYear && `(${filterLabel})`}
              </h2>
              <div className="space-y-2">
                {Object.entries(cur.byCategory).sort(([, a], [, b]) => b - a).map(([cat, val]) => (
                  <div key={cat} className="flex items-center gap-3">
                    <span className="text-xs text-zinc-500 w-32 truncate">{COST_LABELS[cat] || cat}</span>
                    <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full" style={{ width: `${pct(val, cur.costGross)}%` }} />
                    </div>
                    <span className="text-xs font-bold font-mono text-zinc-900 dark:text-zinc-100 w-24 text-right">฿{fmtK(val)}</span>
                    <span className="text-[10px] text-zinc-400 w-10 text-right">{pct(val, cur.costGross).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ─── Subcomponents ───────────────────────────────────────────

const COST_LABELS: Record<string, string> = {
  staff: 'ค่าแรง', travel: 'ค่าเดินทาง', electrical_equipment: 'อุปกรณ์ไฟฟ้า',
  struture: 'โครงสร้าง', service_fee: 'ค่าบริการ', other: 'อื่นๆ',
}

function KpiCard({
  icon: Icon, label, value, sub, trendPct, trendInverse,
}: {
  icon: typeof TrendingUp
  label: string
  value: string
  sub?: string
  trendPct?: number
  trendInverse?: boolean  // true = ลดลงดี, ขึ้นแย่ (เช่น cost, vat payable)
}) {
  const showTrend = trendPct !== undefined && Number.isFinite(trendPct)
  const effectiveTrend = trendInverse && showTrend ? -trendPct! : trendPct
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4">
      <div className="flex items-center justify-between mb-2">
        <Icon className="h-4 w-4 text-zinc-400" />
        {showTrend && (
          <span className={`flex items-center gap-0.5 text-[10px] font-bold ${trendBand(effectiveTrend!)}`}>
            {trendPct! >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
            {Math.abs(trendPct!).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-xl font-bold tracking-tight font-mono text-zinc-900 dark:text-zinc-100">{value}</div>
      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function ChartCard({ title, icon: Icon, children }: { title: string; icon: typeof BarChart3; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
      <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
        <Icon className="h-4 w-4 text-zinc-400" /> {title}
      </h2>
      {children}
    </div>
  )
}
