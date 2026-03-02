'use client'

import { useMemo, useState } from 'react'
import { BarChart3, Users, Calendar, TrendingDown, Banknote, PieChart } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryLabel } from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'

function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    totalWithVat = amount + amount * 0.07
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { whtAmount, netPayable }
}

const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type RangeFilter = 'all' | '3m' | '1m' | 'week'

export default function OverviewDashboard({ claims, categories }: { claims: ExpenseClaim[]; categories: FinanceCategory[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [range, setRange] = useState<RangeFilter>('all')

  // Filter by date range
  const filtered = useMemo(() => {
    if (range === 'all') return claims
    const now = new Date()
    const cutoff = new Date()
    if (range === 'week') cutoff.setDate(now.getDate() - 7)
    else if (range === '1m') cutoff.setMonth(now.getMonth() - 1)
    else if (range === '3m') cutoff.setMonth(now.getMonth() - 3)
    return claims.filter(c => new Date(c.created_at) >= cutoff)
  }, [claims, range])

  // Only paid claims for analysis
  const paidClaims = useMemo(() => filtered.filter(c => c.status === 'paid'), [filtered])
  const allActiveClaims = useMemo(() => filtered.filter(c => c.status !== 'rejected'), [filtered])

  // ========== Stats ==========
  const stats = useMemo(() => {
    let totalGross = 0, totalWht = 0, totalNet = 0
    paidClaims.forEach(c => {
      const amt = c.total_amount || c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      totalGross += amt
      totalWht += tax.whtAmount
      totalNet += tax.netPayable
    })
    return {
      totalClaims: filtered.length,
      paidCount: paidClaims.length,
      pendingCount: filtered.filter(c => c.status === 'pending').length,
      awaitingCount: filtered.filter(c => c.status === 'awaiting_payment').length,
      totalGross,
      totalWht,
      totalNet,
    }
  }, [filtered, paidClaims])

  // ========== By Category ==========
  const byCategory = useMemo(() => {
    const map = new Map<string, number>()
    allActiveClaims.forEach(c => {
      const amt = c.total_amount || c.amount || 0
      map.set(c.category, (map.get(c.category) || 0) + amt)
    })
    return Array.from(map.entries())
      .map(([cat, total]) => ({ category: cat, total }))
      .sort((a, b) => b.total - a.total)
  }, [allActiveClaims])

  const maxCatTotal = Math.max(...byCategory.map(c => c.total), 1)

  // ========== By Person ==========
  const byPerson = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number; wht: number }>()
    allActiveClaims.forEach(c => {
      const key = c.submitted_by || 'unknown'
      const name = c.submitter?.full_name || 'ไม่ระบุ'
      const amt = c.total_amount || c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      if (!map.has(key)) map.set(key, { name, total: 0, count: 0, wht: 0 })
      const p = map.get(key)!
      p.total += amt
      p.count += 1
      p.wht += tax.whtAmount
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [allActiveClaims])

  const maxPersonTotal = Math.max(...byPerson.map(p => p.total), 1)

  // ========== By Event ==========
  const byEvent = useMemo(() => {
    const map = new Map<string, { name: string; total: number; count: number }>()
    allActiveClaims.forEach(c => {
      if (!c.job_event_id) return
      const name = (c.job_event as any)?.name || 'ไม่ระบุ'
      if (!map.has(c.job_event_id)) map.set(c.job_event_id, { name, total: 0, count: 0 })
      const e = map.get(c.job_event_id)!
      e.total += c.total_amount || c.amount || 0
      e.count += 1
    })
    return Array.from(map.values()).sort((a, b) => b.total - a.total)
  }, [allActiveClaims])

  const maxEventTotal = Math.max(...byEvent.map(e => e.total), 1)

  // ========== Monthly Trend ==========
  const monthlyTrend = useMemo(() => {
    const map = new Map<string, number>()
    allActiveClaims.forEach(c => {
      const d = new Date(c.expense_date || c.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      map.set(key, (map.get(key) || 0) + (c.total_amount || c.amount || 0))
    })
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-6)
  }, [allActiveClaims])

  const maxMonthly = Math.max(...monthlyTrend.map(([, v]) => v), 1)

  const catColors = ['#10b981', '#6366f1', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#ec4899']
  const rangeBtnCls = (v: RangeFilter) =>
    `px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
      range === v
        ? 'bg-emerald-600 text-white'
        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
    }`

  return (
    <div className="space-y-6">
      {/* Header + Range Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
            <BarChart3 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Finance Overview' : 'ภาพรวมการเงิน'}
            </h2>
            <p className="text-xs text-zinc-400">
              {isEn ? 'Analyze spending patterns' : 'วิเคราะห์รูปแบบค่าใช้จ่าย'}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <button onClick={() => setRange('week')} className={rangeBtnCls('week')}>
            {isEn ? '7D' : '7 วัน'}
          </button>
          <button onClick={() => setRange('1m')} className={rangeBtnCls('1m')}>
            {isEn ? '1M' : '1 เดือน'}
          </button>
          <button onClick={() => setRange('3m')} className={rangeBtnCls('3m')}>
            {isEn ? '3M' : '3 เดือน'}
          </button>
          <button onClick={() => setRange('all')} className={rangeBtnCls('all')}>
            {isEn ? 'All' : 'ทั้งหมด'}
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Total Claims' : 'ใบเบิกทั้งหมด'}</p>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stats.totalClaims}</p>
          <div className="flex gap-2 mt-1.5">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-400 font-medium">
              {stats.pendingCount} {isEn ? 'pending' : 'รอ'}
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 font-medium">
              {stats.awaitingCount} {isEn ? 'awaiting' : 'รอจ่าย'}
            </span>
          </div>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Total Paid' : 'จ่ายแล้ว'}</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">฿{fmtDec(stats.totalNet)}</p>
          <p className="text-[10px] text-zinc-400 mt-1">{stats.paidCount} {isEn ? 'claims' : 'รายการ'}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">{isEn ? 'Total WHT' : 'หัก ณ ที่จ่ายรวม'}</p>
          <p className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">฿{fmtDec(stats.totalWht)}</p>
          <p className="text-[10px] text-zinc-400 mt-1">{isEn ? 'Deducted' : 'หักไปแล้ว'}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Avg per Claim' : 'เฉลี่ยต่อใบ'}</p>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">
            ฿{stats.paidCount > 0 ? fmtDec(stats.totalNet / stats.paidCount) : '0'}
          </p>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Monthly Trend */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-emerald-500" />
            {isEn ? 'Monthly Spending Trend' : 'แนวโน้มค่าใช้จ่ายรายเดือน'}
          </h3>
          {monthlyTrend.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">{isEn ? 'No data' : 'ไม่มีข้อมูล'}</p>
          ) : (
            <div className="flex items-end gap-2 h-40">
              {monthlyTrend.map(([month, total]) => (
                <div key={month} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] font-mono text-zinc-500">{fmtK(total)}</span>
                  <div
                    className="w-full rounded-t-md bg-emerald-500/80 dark:bg-emerald-600/60 transition-all duration-500"
                    style={{ height: `${(total / maxMonthly) * 100}%`, minHeight: 4 }}
                  />
                  <span className="text-[10px] text-zinc-400">{month.slice(5)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* By Category */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 mb-4 flex items-center gap-2">
            <PieChart className="h-4 w-4 text-indigo-500" />
            {isEn ? 'Spending by Category' : 'ค่าใช้จ่ายตามหมวด'}
          </h3>
          {byCategory.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">{isEn ? 'No data' : 'ไม่มีข้อมูล'}</p>
          ) : (
            <div className="space-y-2.5">
              {byCategory.slice(0, 6).map((item, i) => (
                <div key={item.category}>
                  <div className="flex items-center justify-between text-xs mb-1">
                    <span className="font-medium text-zinc-700 dark:text-zinc-300">
                      {getCategoryLabel(item.category, locale, categories)}
                    </span>
                    <span className="font-mono text-zinc-500">฿{item.total.toLocaleString()}</span>
                  </div>
                  <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(item.total / maxCatTotal) * 100}%`,
                        backgroundColor: catColors[i % catColors.length],
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tables Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top Spenders */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Users className="h-4 w-4 text-blue-500" />
              {isEn ? 'Top Spenders' : 'ค่าใช้จ่ายรายบุคคล'}
            </h3>
          </div>
          {byPerson.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">{isEn ? 'No data' : 'ไม่มีข้อมูล'}</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {byPerson.slice(0, 8).map((p, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{p.name}</span>
                      <span className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 shrink-0">฿{p.total.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between mt-0.5">
                      <span className="text-[10px] text-zinc-400">{p.count} {isEn ? 'claims' : 'รายการ'}</span>
                      {p.wht > 0 && (
                        <span className="text-[10px] text-purple-500">WHT ฿{fmtDec(p.wht)}</span>
                      )}
                    </div>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-400 dark:bg-blue-500 transition-all duration-500"
                        style={{ width: `${(p.total / maxPersonTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Events */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="px-4 py-3 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-orange-500" />
              {isEn ? 'Top Events by Cost' : 'ค่าใช้จ่ายรายอีเวนต์'}
            </h3>
          </div>
          {byEvent.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-8">{isEn ? 'No event data' : 'ไม่มีข้อมูลอีเวนต์'}</p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {byEvent.slice(0, 8).map((e, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                  <div className="flex items-center justify-center h-7 w-7 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 text-xs font-bold shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{e.name}</span>
                      <span className="text-sm font-mono font-bold text-zinc-900 dark:text-zinc-100 shrink-0">฿{e.total.toLocaleString()}</span>
                    </div>
                    <span className="text-[10px] text-zinc-400">{e.count} {isEn ? 'claims' : 'รายการ'}</span>
                    <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-400 dark:bg-orange-500 transition-all duration-500"
                        style={{ width: `${(e.total / maxEventTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
