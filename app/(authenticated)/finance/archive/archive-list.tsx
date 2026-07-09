'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { Archive, Search, ExternalLink, CheckCircle2, Filter, CalendarDays, X, Tag, RefreshCw } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryLabel, getClaimStatusLabel, getClaimStatusColor } from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { FundingBadge } from '../doc-badges'

function calcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Format date to YYYY-MM-DD for input[type=date] */
function toDateStr(d: string | null | undefined): string {
  if (!d) return ''
  return new Date(d).toISOString().split('T')[0]
}

/** Check if date string falls within range */
function dateInRange(dateStr: string | null | undefined, from: string, to: string): boolean {
  if (!dateStr) return false
  const d = toDateStr(dateStr)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export default function ArchiveList({ claims, categories }: { claims: ExpenseClaim[]; categories: FinanceCategory[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const [searchQuery, setSearchQuery] = useState('')

  // Filters
  const [filterSubmitter, setFilterSubmitter] = useState('')
  const [filterClaimType, setFilterClaimType] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterAmountRange, setFilterAmountRange] = useState('')
  const [filterEvent, setFilterEvent] = useState('')
  const [filterMonthYear, setFilterMonthYear] = useState('')
  const [filterExpenseDateFrom, setFilterExpenseDateFrom] = useState('')
  const [filterExpenseDateTo, setFilterExpenseDateTo] = useState('')
  const [filterPaidDateFrom, setFilterPaidDateFrom] = useState('')
  const [filterPaidDateTo, setFilterPaidDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Unique submitters for dropdown
  const submitters = useMemo(() => {
    const map = new Map<string, string>()
    claims.forEach(c => {
      if (c.submitter?.id && c.submitter?.full_name) {
        map.set(c.submitter.id, c.submitter.full_name)
      }
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [claims])

  // Unique events for dropdown
  const events = useMemo(() => {
    const map = new Map<string, string>()
    claims.forEach(c => {
      if (c.job_event_id && c.job_event) {
        const name = (c.job_event as any)?.name || (c.job_event as any)?.event_name || ''
        if (name) map.set(c.job_event_id, name)
      }
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [claims])

  const hasActiveFilters = filterSubmitter || filterClaimType || filterCategory || filterAmountRange || filterEvent || filterMonthYear || filterExpenseDateFrom || filterExpenseDateTo || filterPaidDateFrom || filterPaidDateTo

  const filtered = useMemo(() => {
    let result = claims

    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase()
      result = result.filter(c => {
        const name = c.submitter?.full_name?.toLowerCase() || ''
        const title = c.title?.toLowerCase() || ''
        const num = c.claim_number?.toLowerCase() || ''
        return name.includes(q) || title.includes(q) || num.includes(q)
      })
    }

    // Filter by submitter
    if (filterSubmitter) {
      result = result.filter(c => c.submitter?.id === filterSubmitter)
    }

    // Filter by claim type (event / other)
    if (filterClaimType) {
      result = result.filter(c => c.claim_type === filterClaimType)
    }

    // Filter by category
    if (filterCategory) {
      result = result.filter(c => c.category === filterCategory)
    }

    // Filter by amount range
    if (filterAmountRange) {
      result = result.filter(c => {
        const amt = c.amount || 0
        if (filterAmountRange === '0') return amt === 0
        if (filterAmountRange === '1-1000') return amt >= 1 && amt <= 1000
        if (filterAmountRange === '1001-5000') return amt >= 1001 && amt <= 5000
        if (filterAmountRange === '5001-10000') return amt >= 5001 && amt <= 10000
        if (filterAmountRange === '10001+') return amt >= 10001
        return true
      })
    }

    // Filter by event
    if (filterEvent) {
      result = result.filter(c => c.job_event_id === filterEvent)
    }

    // Filter by month/year
    if (filterMonthYear) {
      const [fy, fm] = filterMonthYear.split('-').map(Number)
      result = result.filter(c => {
        const d = new Date(c.expense_date)
        return d.getFullYear() === fy && d.getMonth() + 1 === fm
      })
    }

    // Filter by expense date range (วันที่เบิก)
    if (filterExpenseDateFrom || filterExpenseDateTo) {
      result = result.filter(c => dateInRange(c.expense_date, filterExpenseDateFrom, filterExpenseDateTo))
    }

    // Filter by paid date range (วันที่จ่าย)
    if (filterPaidDateFrom || filterPaidDateTo) {
      result = result.filter(c => dateInRange(c.paid_at, filterPaidDateFrom, filterPaidDateTo))
    }

    return result
  }, [claims, searchQuery, filterSubmitter, filterClaimType, filterCategory, filterAmountRange, filterEvent, filterMonthYear, filterExpenseDateFrom, filterExpenseDateTo, filterPaidDateFrom, filterPaidDateTo])

  // Stats
  const totalNet = useMemo(() => {
    let total = 0
    filtered.forEach(c => {
      const amt = c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      total += tax.netPayable
    })
    return total
  }, [filtered])

  const clearFilters = () => {
    setFilterSubmitter('')
    setFilterClaimType('')
    setFilterCategory('')
    setFilterAmountRange('')
    setFilterEvent('')
    setFilterMonthYear('')
    setFilterExpenseDateFrom('')
    setFilterExpenseDateTo('')
    setFilterPaidDateFrom('')
    setFilterPaidDateTo('')
  }

  const selectCls = 'px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
  const inputDateCls = 'px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-xs outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-full'

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-teal-100 dark:bg-teal-900/30 shrink-0">
            <Archive className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Payment Archive' : 'คลังเก็บใบเบิก'}
            </h2>
            <p className="text-xs text-zinc-400">
              {filtered.length} {isEn ? 'paid claims' : 'รายการ'} • {isEn ? 'Total' : 'รวม'} ฿{fmtDec(totalNet)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Toggle */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border ${
              showFilters || hasActiveFilters
                ? 'border-teal-300 bg-teal-50 text-teal-700 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-400'
                : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300'
            }`}
          >
            <Filter className="h-3.5 w-3.5" />
            {isEn ? 'Filter' : 'ตัวกรอง'}
            {hasActiveFilters && (
              <span className="ml-1 inline-flex items-center justify-center h-4 w-4 rounded-full bg-teal-500 text-white text-[9px] font-bold">
                !
              </span>
            )}
          </button>

          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={isEn ? 'Search...' : 'ค้นหา...'}
              className={`${selectCls} pl-8 w-full`}
            />
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <Filter className="h-4 w-4 text-teal-500" />
              {isEn ? 'Filters' : 'ตัวกรอง'}
            </h3>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center gap-1 text-xs text-zinc-400 hover:text-red-500 transition-colors"
              >
                <X className="h-3 w-3" />
                {isEn ? 'Clear all' : 'ล้างทั้งหมด'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Submitter Filter */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                {isEn ? 'Submitter' : 'ผู้เบิก'}
              </label>
              <select
                value={filterSubmitter}
                onChange={e => setFilterSubmitter(e.target.value)}
                className={selectCls + ' w-full'}
              >
                <option value="">{isEn ? 'All submitters' : 'ทั้งหมด'}</option>
                {submitters.map(([id, name]) => (
                  <option key={id} value={id}>{name}</option>
                ))}
              </select>
            </div>

            {/* Claim Type Filter */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5 flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {isEn ? 'Claim Type' : 'ประเภทการเบิก'}
              </label>
              <select
                value={filterClaimType}
                onChange={e => setFilterClaimType(e.target.value)}
                className={selectCls + ' w-full'}
              >
                <option value="">{isEn ? 'All types' : 'ทั้งหมด'}</option>
                <option value="event">{isEn ? 'Event' : 'เบิกงานอีเวนต์'}</option>
                <option value="advance">{isEn ? 'Advance' : 'เบิกทดลองจ่าย'}</option>
                <option value="other">{isEn ? 'Other' : 'เบิกอื่นๆ'}</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                {isEn ? 'Category' : 'หมวดค่าใช้จ่าย'}
              </label>
              <select
                value={filterCategory}
                onChange={e => setFilterCategory(e.target.value)}
                className={selectCls + ' w-full'}
              >
                <option value="">{isEn ? 'All categories' : 'ทั้งหมด'}</option>
                {categories.map(cat => (
                  <option key={cat.value} value={cat.value}>{isEn ? cat.label : cat.label_th}</option>
                ))}
              </select>
            </div>

            {/* Amount Range Filter */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                {isEn ? 'Amount Range' : 'ช่วงยอดเงิน'}
              </label>
              <select
                value={filterAmountRange}
                onChange={e => setFilterAmountRange(e.target.value)}
                className={selectCls + ' w-full'}
              >
                <option value="">{isEn ? 'All amounts' : 'ทั้งหมด'}</option>
                <option value="0">฿0</option>
                <option value="1-1000">฿1 - ฿1,000</option>
                <option value="1001-5000">฿1,001 - ฿5,000</option>
                <option value="5001-10000">฿5,001 - ฿10,000</option>
                <option value="10001+">฿10,001+</option>
              </select>
            </div>

            {/* Event Filter */}
            {filterClaimType !== 'other' && filterClaimType !== 'advance' && events.length > 0 && (
              <div>
                <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                  {isEn ? 'Event' : 'อีเวนต์'}
                </label>
                <select
                  value={filterEvent}
                  onChange={e => setFilterEvent(e.target.value)}
                  className={selectCls + ' w-full'}
                >
                  <option value="">{isEn ? 'All events' : 'ทั้งหมด'}</option>
                  {events.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Month/Year Picker */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5">
                {isEn ? 'Month/Year' : 'เดือน/ปี'}
              </label>
              <input
                type="month"
                value={filterMonthYear}
                onChange={e => { setFilterMonthYear(e.target.value); if (e.target.value) { setFilterExpenseDateFrom(''); setFilterExpenseDateTo('') } }}
                className={`${selectCls} w-full ${!filterMonthYear ? 'text-zinc-400' : ''}`}
              />
            </div>

            {/* Expense Date Filter (วันที่เบิก) */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {isEn ? 'Expense Date' : 'วันที่เบิก'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filterExpenseDateFrom}
                  onChange={e => { setFilterExpenseDateFrom(e.target.value); if (e.target.value) setFilterMonthYear('') }}
                  className={inputDateCls}
                />
                <span className="text-[10px] text-zinc-400 shrink-0">—</span>
                <input
                  type="date"
                  value={filterExpenseDateTo}
                  onChange={e => { setFilterExpenseDateTo(e.target.value); if (e.target.value) setFilterMonthYear('') }}
                  className={inputDateCls}
                />
              </div>
            </div>

            {/* Paid Date Filter (วันที่จ่าย) */}
            <div>
              <label className="block text-[11px] font-medium text-zinc-500 mb-1.5 flex items-center gap-1">
                <CalendarDays className="h-3 w-3" />
                {isEn ? 'Paid Date' : 'วันที่จ่าย'}
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={filterPaidDateFrom}
                  onChange={e => setFilterPaidDateFrom(e.target.value)}
                  className={inputDateCls}
                />
                <span className="text-[10px] text-zinc-400 shrink-0">—</span>
                <input
                  type="date"
                  value={filterPaidDateTo}
                  onChange={e => setFilterPaidDateTo(e.target.value)}
                  className={inputDateCls}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Content */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">
          {isEn ? 'No paid claims in archive' : 'ยังไม่มีใบเบิกในคลังเก็บ'}
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          {/* Desktop Table — column template aligned between header + cells */}
          <div className="hidden md:block">
            <div className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr_1fr_5rem_7rem_7rem_1.5rem] gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-800">
              <div>{isEn ? 'Claim No.' : 'เลขที่'}</div>
              <div>{isEn ? 'Submitter' : 'ผู้เบิก'}</div>
              <div>{isEn ? 'Title' : 'หัวข้อ'}</div>
              <div>{isEn ? 'Type' : 'ประเภท'}</div>
              <div>{isEn ? 'Funding' : 'แหล่งเงิน'}</div>
              <div className="text-right">{isEn ? 'Net Paid' : 'จ่ายจริง'}</div>
              <div>{isEn ? 'Expense' : 'วันที่เบิก'}</div>
              <div>{isEn ? 'Paid At' : 'วันที่ชำระ'}</div>
              <div>{isEn ? 'Status' : 'สถานะ'}</div>
              <div></div>
            </div>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map(c => {
                const amt = c.amount || 0
                const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
                return (
                  <div key={c.id} className="grid grid-cols-[2fr_2fr_2fr_1fr_1fr_1fr_5rem_7rem_7rem_1.5rem] gap-2 px-4 py-2.5 items-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <div className="text-xs font-mono text-zinc-500 truncate">{c.claim_number}</div>
                    <div className="truncate font-medium text-zinc-700 dark:text-zinc-300">
                      {c.submitter?.full_name || '—'}
                    </div>
                    <div className="truncate text-zinc-900 dark:text-zinc-100">{c.title}</div>
                    <div>
                      {c.claim_type === 'event' && (c.job_event as any)?.linked_lead_id ? (
                        <Link
                          href={`/crm/${(c.job_event as any).linked_lead_id}`}
                          onClick={e => e.stopPropagation()}
                          title={(c.job_event as any)?.event_name || ''}
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
                        >
                          <ExternalLink className="h-2.5 w-2.5" />
                          {isEn ? 'Event' : 'อีเวนต์'}
                        </Link>
                      ) : (
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                          c.claim_type === 'event'
                            ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 dark:text-blue-400'
                            : c.claim_type === 'advance'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                        }`}>
                          {c.claim_type === 'event'
                            ? (isEn ? 'Event' : 'อีเวนต์')
                            : c.claim_type === 'advance'
                              ? (isEn ? 'Advance' : 'ทดลองจ่าย')
                              : (isEn ? 'Other' : 'อื่นๆ')}
                        </span>
                      )}
                    </div>
                    <div>
                      <FundingBadge claim={c} isEn={isEn} size="xs" />
                    </div>
                    <div className="text-right font-mono font-bold text-teal-600 dark:text-teal-400">
                      ฿{fmtDec(tax.netPayable)}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {c.expense_date
                        ? new Date(c.expense_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })
                        : '—'
                      }
                    </div>
                    <div className="text-xs text-zinc-500">
                      {c.paid_at
                        ? new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                        : '—'
                      }
                    </div>
                    <div>
                      <span
                        className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded-full"
                        style={{ backgroundColor: `${getClaimStatusColor(c.status)}15`, color: getClaimStatusColor(c.status) }}
                      >
                        {c.status === 'refund_confirmed' ? <RefreshCw className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                        {getClaimStatusLabel(c.status, locale)}
                      </span>
                    </div>
                    <div className="text-right">
                      <Link href={`/finance/${c.id}`} className="text-zinc-400 hover:text-teal-500 transition-colors">
                        <ExternalLink className="h-3.5 w-3.5 inline" />
                      </Link>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
            {filtered.map(c => {
              const amt = c.amount || 0
              const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
              return (
                <Link key={c.id} href={`/finance/${c.id}`} className="block p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono text-zinc-400">{c.claim_number}</p>
                      <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.title}</p>
                      <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5">
                        <span>{c.submitter?.full_name || '—'}</span>
                        <FundingBadge claim={c} isEn={isEn} size="xs" />
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-teal-600 dark:text-teal-400">฿{fmtDec(tax.netPayable)}</p>
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full mt-0.5"
                        style={{ backgroundColor: `${getClaimStatusColor(c.status)}15`, color: getClaimStatusColor(c.status) }}
                      >
                        {c.status === 'refund_confirmed' ? <RefreshCw className="h-2.5 w-2.5" /> : <CheckCircle2 className="h-2.5 w-2.5" />}
                        {getClaimStatusLabel(c.status, locale)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-zinc-400">
                    {c.expense_date && (
                      <span>
                        {isEn ? 'Claimed' : 'เบิก'}: {new Date(c.expense_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                    {c.paid_at && (
                      <span>
                        {isEn ? 'Paid' : 'จ่าย'}: {new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
