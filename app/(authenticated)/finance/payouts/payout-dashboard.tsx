'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Banknote, Users, Calendar, Filter, ChevronDown, ExternalLink, CheckCircle2, Search } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryLabel } from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { markAsPaid } from '../actions'

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

type TimeFilter = 'all' | 'today' | 'week' | 'month'

export default function PayoutDashboard({ claims, categories }: { claims: ExpenseClaim[]; categories: FinanceCategory[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const router = useRouter()

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)

  const handleMarkPaid = async (id: string) => {
    if (!confirm(isEn ? 'Confirm payment for this claim?' : 'ยืนยันการชำระเงินใบเบิกนี้?')) return
    setPayingId(id)
    const res = await markAsPaid(id)
    if (res.error) alert(res.error)
    setPayingId(null)
    router.refresh()
  }


  // Get unique submitters
  const submitters = useMemo(() => {
    const map = new Map<string, string>()
    claims.forEach(c => {
      if (c.submitted_by && c.submitter?.full_name) {
        map.set(c.submitted_by, c.submitter.full_name)
      }
    })
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [claims])

  // Get unique events
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

  // Filter claims
  const filtered = useMemo(() => {
    const now = new Date()
    return claims.filter(c => {
      // Time filter
      if (timeFilter !== 'all') {
        const d = new Date(c.expense_date)
        if (timeFilter === 'today') {
          if (d.toDateString() !== now.toDateString()) return false
        } else if (timeFilter === 'week') {
          const weekAgo = new Date(now)
          weekAgo.setDate(weekAgo.getDate() - 7)
          if (d < weekAgo) return false
        } else if (timeFilter === 'month') {
          if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) return false
        }
      }
      // Person filter
      if (personFilter !== 'all' && c.submitted_by !== personFilter) return false
      // Event filter
      if (eventFilter !== 'all' && c.job_event_id !== eventFilter) return false
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const name = c.submitter?.full_name?.toLowerCase() || ''
        const title = c.title?.toLowerCase() || ''
        const num = c.claim_number?.toLowerCase() || ''
        if (!name.includes(q) && !title.includes(q) && !num.includes(q)) return false
      }
      return true
    })
  }, [claims, timeFilter, personFilter, eventFilter, searchQuery])

  // Group by person for payout view
  const groupedByPerson = useMemo(() => {
    const map = new Map<string, { name: string; claims: ExpenseClaim[] }>()
    filtered.forEach(c => {
      const key = c.submitted_by || 'unknown'
      const name = c.submitter?.full_name || 'ไม่ระบุ'
      if (!map.has(key)) map.set(key, { name, claims: [] })
      map.get(key)!.claims.push(c)
    })
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name))
  }, [filtered])

  // Summary stats
  const stats = useMemo(() => {
    let totalAmount = 0
    let totalWht = 0
    let totalNetPayable = 0
    filtered.forEach(c => {
      const amt = c.total_amount || c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      totalAmount += amt
      totalWht += tax.whtAmount
      totalNetPayable += tax.netPayable
    })
    return { totalAmount, totalWht, totalNetPayable, count: filtered.length, people: groupedByPerson.length }
  }, [filtered, groupedByPerson])

  const getNetPayable = (c: ExpenseClaim) => {
    const amt = c.total_amount || c.amount || 0
    return calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
  }

  const selectCls = 'px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Awaiting Payment' : 'รอชำระเงิน'}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stats.count}</p>
          <p className="text-xs text-zinc-400">{stats.people} {isEn ? 'people' : 'คน'}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Total Amount' : 'ยอดรวมทั้งหมด'}</p>
          <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">฿{stats.totalAmount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">{isEn ? 'WHT Deducted' : 'หัก ณ ที่จ่ายรวม'}</p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">−฿{fmtDec(stats.totalWht)}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
          <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{isEn ? 'Net to Transfer' : '💰 ยอดโอนจริงรวม'}</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">฿{fmtDec(stats.totalNetPayable)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Filter className="h-4 w-4 text-zinc-400" />

        {/* Search */}
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={isEn ? 'Search name, title...' : 'ค้นหาชื่อ, หัวข้อ...'}
            className={`${selectCls} pl-8 w-full`}
          />
        </div>

        {/* Time */}
        <select value={timeFilter} onChange={e => setTimeFilter(e.target.value as TimeFilter)} className={selectCls}>
          <option value="all">{isEn ? 'All Time' : 'ทุกช่วงเวลา'}</option>
          <option value="today">{isEn ? 'Today' : 'วันนี้'}</option>
          <option value="week">{isEn ? 'This Week' : 'สัปดาห์นี้'}</option>
          <option value="month">{isEn ? 'This Month' : 'เดือนนี้'}</option>
        </select>

        {/* Person */}
        <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className={selectCls}>
          <option value="all">{isEn ? 'All People' : 'ทุกคน'}</option>
          {submitters.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        {/* Event */}
        <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} className={selectCls}>
          <option value="all">{isEn ? 'All Events' : 'ทุกอีเวนต์'}</option>
          {events.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>

      {/* Grouped by person */}
      {groupedByPerson.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">
          {isEn ? 'No claims awaiting payment' : 'ไม่มีใบเบิกที่รอชำระเงิน'}
        </div>
      ) : (
        <div className="space-y-4">
          {groupedByPerson.map(group => {
            let groupTotal = 0
            let groupWht = 0
            let groupNet = 0
            // Get bank info from latest claim
            let bankName = ''
            let bankAccount = ''
            let accountHolder = ''
            group.claims.forEach(c => {
              const tax = getNetPayable(c)
              groupTotal += (c.total_amount || c.amount || 0)
              groupWht += tax.whtAmount
              groupNet += tax.netPayable
              if (c.bank_name && !bankName) bankName = c.bank_name
              if (c.bank_account_number && !bankAccount) bankAccount = c.bank_account_number
              if (c.account_holder_name && !accountHolder) accountHolder = c.account_holder_name
            })

            return (
              <div key={group.name} className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
                {/* Person Header */}
                <div className="p-4 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                        {group.name.charAt(0)}
                      </div>
                      <div>
                        <h3 className="font-bold text-zinc-900 dark:text-zinc-100">{group.name}</h3>
                        <p className="text-xs text-zinc-400">{group.claims.length} {isEn ? 'claims' : 'รายการ'}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      {groupWht > 0 && (
                        <p className="text-xs text-zinc-400 line-through">฿{groupTotal.toLocaleString()}</p>
                      )}
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">฿{fmtDec(groupNet)}</p>
                      <p className="text-[10px] text-emerald-500 font-medium">{isEn ? 'Net to Transfer' : 'ยอดโอนจริง'}</p>
                    </div>
                  </div>

                  {/* Bank Details — always show */}
                  <div className={`mt-3 flex items-center gap-4 p-2.5 rounded-lg border ${
                    bankName || bankAccount
                      ? 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700'
                      : 'bg-amber-50/50 dark:bg-amber-950/10 border-amber-200 dark:border-amber-800/50'
                  }`}>
                    <span className="text-base">💳</span>
                    <div className="flex items-center gap-6 text-sm flex-1">
                      <div>
                        <span className="text-[10px] text-zinc-400 block">{isEn ? 'Bank' : 'ธนาคาร'}</span>
                        <span className={`font-medium ${bankName ? 'text-zinc-900 dark:text-zinc-100' : 'text-amber-500'}`}>
                          {bankName || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">{isEn ? 'Account No.' : 'เลขบัญชี'}</span>
                        <span className={`font-mono font-medium ${bankAccount ? 'text-zinc-900 dark:text-zinc-100' : 'text-amber-500'}`}>
                          {bankAccount || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-zinc-400 block">{isEn ? 'Account Holder' : 'ชื่อเจ้าของบัญชี'}</span>
                        <span className={`font-medium ${accountHolder ? 'text-zinc-900 dark:text-zinc-100' : 'text-amber-500'}`}>
                          {accountHolder || '—'}
                        </span>
                      </div>
                    </div>
                    {!bankName && !bankAccount && (
                      <span className="text-[10px] text-amber-500 font-medium shrink-0">
                        {isEn ? '⚠ No bank info' : '⚠ ยังไม่มีข้อมูลธนาคาร'}
                      </span>
                    )}
                  </div>
                </div>

                {/* Claims Table */}
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  <div className="grid grid-cols-12 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50/50 dark:bg-zinc-800/20">
                    <div className="col-span-2">{isEn ? 'Claim No.' : 'เลขที่'}</div>
                    <div className="col-span-3">{isEn ? 'Title' : 'หัวข้อ'}</div>
                    <div className="col-span-2">{isEn ? 'Category' : 'หมวด'}</div>
                    <div className="col-span-1 text-right">{isEn ? 'Amount' : 'ยอดเงิน'}</div>
                    <div className="col-span-1 text-right">{isEn ? 'WHT' : 'หัก'}</div>
                    <div className="col-span-2 text-right">{isEn ? 'Net Pay' : 'จ่ายจริง'}</div>
                    <div className="col-span-1"></div>
                  </div>
                  {group.claims.map(c => {
                    const tax = getNetPayable(c)
                    const amt = c.total_amount || c.amount || 0
                    return (
                      <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <div className="col-span-2 text-xs font-mono text-zinc-500">{c.claim_number}</div>
                        <div className="col-span-3 truncate font-medium text-zinc-900 dark:text-zinc-100">{c.title}</div>
                        <div className="col-span-2 text-xs text-zinc-500">
                          {getCategoryLabel(c.category, locale, categories)}
                        </div>
                        <div className="col-span-1 text-right font-mono text-zinc-600 dark:text-zinc-400">
                          {amt.toLocaleString()}
                        </div>
                        <div className="col-span-1 text-right font-mono text-purple-500 text-xs">
                          {tax.whtAmount > 0 ? `−${fmtDec(tax.whtAmount)}` : '—'}
                        </div>
                        <div className="col-span-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                          ฿{fmtDec(tax.netPayable)}
                        </div>
                        <div className="col-span-1 text-right flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleMarkPaid(c.id)}
                            disabled={payingId === c.id}
                            className="px-2 py-1 text-[10px] font-medium rounded-md bg-teal-50 text-teal-600 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-400 dark:hover:bg-teal-900/40 transition-colors disabled:opacity-50"
                          >
                            {payingId === c.id ? '...' : (isEn ? 'Paid' : 'ชำระแล้ว')}
                          </button>
                          <Link href={`/finance/${c.id}`} className="text-zinc-400 hover:text-emerald-500 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5 inline" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                  {/* Group subtotal */}
                  <div className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm bg-emerald-50/50 dark:bg-emerald-950/10 font-semibold">
                    <div className="col-span-5 text-zinc-500">{isEn ? 'Subtotal' : 'รวม'} — {group.name}</div>
                    <div className="col-span-2"></div>
                    <div className="col-span-1 text-right font-mono text-zinc-600">฿{groupTotal.toLocaleString()}</div>
                    <div className="col-span-1 text-right font-mono text-purple-500 text-xs">
                      {groupWht > 0 ? `−${fmtDec(groupWht)}` : '—'}
                    </div>
                    <div className="col-span-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      ฿{fmtDec(groupNet)}
                    </div>
                    <div className="col-span-1"></div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Grand Total Bar */}
      {groupedByPerson.length > 0 && (
        <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700 p-5 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">
                {isEn ? '💰 Grand Total — Net to Transfer' : '💰 ยอดรวมทั้งหมดที่ต้องโอน'}
              </p>
              <p className="text-xs text-emerald-600/70 mt-0.5">
                {stats.count} {isEn ? 'claims' : 'รายการ'} • {stats.people} {isEn ? 'people' : 'คน'}
                {stats.totalWht > 0 && ` • ${isEn ? 'WHT' : 'หัก ณ ที่จ่ายรวม'} ฿${fmtDec(stats.totalWht)}`}
              </p>
            </div>
            <div className="text-right">
              {stats.totalWht > 0 && (
                <p className="text-sm text-zinc-400 line-through">฿{stats.totalAmount.toLocaleString()}</p>
              )}
              <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                ฿{fmtDec(stats.totalNetPayable)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
