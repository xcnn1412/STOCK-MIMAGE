'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Banknote, Users, Calendar, Filter, ChevronDown, ExternalLink, CheckCircle2, Search, AlertCircle } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { getCategoryLabel, getClaimChecklist } from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { markAsPaid, markAsPendingMonthEnd } from '../actions'
import { FundingBadge, ChecklistBadges } from '../doc-badges'
import { useConfirm } from '../use-confirm'

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
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()

  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all')
  const [monthYearFilter, setMonthYearFilter] = useState<string>('') // YYYY-MM format
  const [personFilter, setPersonFilter] = useState<string>('all')
  const [eventFilter, setEventFilter] = useState<string>('all')
  const [claimTypeFilter, setClaimTypeFilter] = useState<string>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const [amountRange, setAmountRange] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [payingId, setPayingId] = useState<string | null>(null)
  const [deferringId, setDeferringId] = useState<string | null>(null)

  const handleMarkPaid = async (c: ExpenseClaim) => {
    const tax = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
    const ok = await askConfirm({
      title: isEn ? 'Mark this claim as paid?' : 'ยืนยันชำระเงินใบเบิกนี้?',
      description: isEn
        ? 'Confirm the transfer has been made. Logged with your name.'
        : 'ยืนยันว่าโอนเงินเรียบร้อยแล้ว — ระบบจะบันทึกการกระทำในชื่อของคุณ',
      details: [
        { label: isEn ? 'Claim no.' : 'เลขที่', value: c.claim_number },
        { label: isEn ? 'Submitter' : 'ผู้รับเงิน', value: c.submitter?.full_name || '—' },
        { label: isEn ? 'Bank' : 'ธนาคาร', value: c.bank_name || '—' },
        { label: isEn ? 'Account' : 'เลขบัญชี', value: c.bank_account_number || '—' },
        { label: isEn ? 'Net to transfer' : 'ยอดโอน', value: `฿${fmtDec(tax.netPayable)}` },
      ],
      variant: 'warning',
      confirmLabel: isEn ? 'Mark paid' : 'ยืนยันชำระแล้ว',
      cancelLabel: isEn ? 'Not yet' : 'ยังไม่จ่าย',
    })
    if (!ok) return
    setPayingId(c.id)
    const res = await markAsPaid(c.id)
    if (res.error) alert(res.error)
    setPayingId(null)
    router.refresh()
  }

  const handleDeferToMonthEnd = async (c: ExpenseClaim) => {
    const ok = await askConfirm({
      title: isEn ? 'Defer to month end?' : 'เลื่อนเป็น "รอจ่ายสิ้นเดือน"?',
      details: [
        { label: isEn ? 'Claim no.' : 'เลขที่', value: c.claim_number },
        { label: isEn ? 'Submitter' : 'ผู้เบิก', value: c.submitter?.full_name || '—' },
      ],
      confirmLabel: isEn ? 'Defer' : 'เลื่อน',
      cancelLabel: isEn ? 'Cancel' : 'ยกเลิก',
    })
    if (!ok) return
    setDeferringId(c.id)
    const res = await markAsPendingMonthEnd(c.id)
    if (res.error) alert(res.error)
    setDeferringId(null)
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
    return Array.from(map.entries()).sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
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
    return Array.from(map.entries()).sort((a, b) => a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)
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
      // Month/Year filter
      if (monthYearFilter) {
        const [fy, fm] = monthYearFilter.split('-').map(Number)
        const d = new Date(c.expense_date)
        if (d.getFullYear() !== fy || d.getMonth() + 1 !== fm) return false
      }
      // Person filter
      if (personFilter !== 'all' && c.submitted_by !== personFilter) return false
      // Event filter
      if (eventFilter !== 'all' && c.job_event_id !== eventFilter) return false
      // Claim type filter
      if (claimTypeFilter !== 'all') {
        if (claimTypeFilter === 'event' && c.claim_type !== 'event') return false
        if (claimTypeFilter === 'other' && c.claim_type === 'event') return false
      }
      // Category filter
      if (categoryFilter !== 'all' && c.category !== categoryFilter) return false
      // Amount range filter
      if (amountRange !== 'all') {
        const amt = c.amount || 0
        if (amountRange === '0' && amt > 0) return false
        if (amountRange === '1-1000' && (amt < 1 || amt > 1000)) return false
        if (amountRange === '1001-5000' && (amt < 1001 || amt > 5000)) return false
        if (amountRange === '5001-10000' && (amt < 5001 || amt > 10000)) return false
        if (amountRange === '10001+' && amt < 10001) return false
      }
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
  }, [claims, timeFilter, monthYearFilter, personFilter, eventFilter, claimTypeFilter, categoryFilter, amountRange, searchQuery])

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
      const amt = c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      totalAmount += amt
      totalWht += tax.whtAmount
      totalNetPayable += tax.netPayable
    })
    return { totalAmount, totalWht, totalNetPayable, count: filtered.length, people: groupedByPerson.length }
  }, [filtered, groupedByPerson])

  const getNetPayable = (c: ExpenseClaim) => {
    const amt = c.amount || 0
    return calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
  }

  const selectCls = 'px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'

  return (
    <div className="space-y-6">
      {confirmDialog}
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Awaiting Payment' : 'รอชำระเงิน'}</p>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">{stats.count}</p>
          <p className="text-xs text-zinc-400">{stats.people} {isEn ? 'people' : 'คน'}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold">{isEn ? 'Total Amount' : 'ยอดรวม'}</p>
          <p className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 mt-1">฿{stats.totalAmount.toLocaleString()}</p>
        </div>
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900">
          <p className="text-[10px] uppercase tracking-wider text-purple-400 font-semibold">{isEn ? 'WHT Deducted' : 'หัก ณ ที่จ่ายรวม'}</p>
          <p className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">−฿{fmtDec(stats.totalWht)}</p>
        </div>
        <div className="rounded-xl border-2 border-emerald-200 dark:border-emerald-800 p-3 sm:p-4 bg-emerald-50/50 dark:bg-emerald-950/20">
          <p className="text-[10px] uppercase tracking-wider text-emerald-500 font-semibold">{isEn ? 'Net to Transfer' : '💰 ยอดโอนจริงรวม'}</p>
          <p className="text-xl sm:text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">฿{fmtDec(stats.totalNetPayable)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <Filter className="h-4 w-4 text-zinc-400 hidden sm:block" />

        {/* Search */}
        <div className="relative w-full sm:flex-1 sm:min-w-[180px]">
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
        <select value={timeFilter} onChange={e => { setTimeFilter(e.target.value as TimeFilter); if (e.target.value !== 'all') setMonthYearFilter('') }} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Time' : 'ทุกช่วงเวลา'}</option>
          <option value="today">{isEn ? 'Today' : 'วันนี้'}</option>
          <option value="week">{isEn ? 'This Week' : 'สัปดาห์นี้'}</option>
          <option value="month">{isEn ? 'This Month' : 'เดือนนี้'}</option>
        </select>

        {/* Month/Year Picker */}
        <input
          type="month"
          value={monthYearFilter}
          onChange={e => { setMonthYearFilter(e.target.value); if (e.target.value) setTimeFilter('all') }}
          className={`${selectCls} flex-1 sm:flex-none sm:w-[160px] ${!monthYearFilter ? 'text-zinc-400' : ''}`}
          placeholder={isEn ? 'Month/Year' : 'เดือน/ปี'}
        />

        {/* Person */}
        <select value={personFilter} onChange={e => setPersonFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All People' : 'ทุกคน'}</option>
          {submitters.map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>

        {/* Claim Type */}
        <select value={claimTypeFilter} onChange={e => { setClaimTypeFilter(e.target.value); if (e.target.value === 'other') setEventFilter('all') }} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Types' : 'ทุกประเภท'}</option>
          <option value="event">{isEn ? 'Event Expense' : '📍 เบิกงานอีเวนต์'}</option>
          <option value="other">{isEn ? 'Other Expense' : '📋 เบิกอื่นๆ'}</option>
        </select>

        {/* Category */}
        <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Categories' : 'ทุกหมวด'}</option>
          {categories.map(cat => (
            <option key={cat.value} value={cat.value}>{isEn ? cat.label : cat.label_th}</option>
          ))}
        </select>

        {/* Amount Range */}
        <select value={amountRange} onChange={e => setAmountRange(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
          <option value="all">{isEn ? 'All Amounts' : 'ทุกยอดเงิน'}</option>
          <option value="0">{isEn ? '฿0 (Pending)' : '฿0 (ยังไม่กรอกยอด)'}</option>
          <option value="1-1000">฿1 - ฿1,000</option>
          <option value="1001-5000">฿1,001 - ฿5,000</option>
          <option value="5001-10000">฿5,001 - ฿10,000</option>
          <option value="10001+">฿10,001+</option>
        </select>

        {/* Event */}
        {claimTypeFilter !== 'other' && (
          <select value={eventFilter} onChange={e => setEventFilter(e.target.value)} className={`${selectCls} flex-1 sm:flex-none`}>
            <option value="all">{isEn ? 'All Events' : 'ทุกอีเวนต์'}</option>
            {events.map(([id, name]) => (
              <option key={id} value={id}>{name}</option>
            ))}
          </select>
        )}
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
            group.claims.forEach(c => {
              const tax = getNetPayable(c)
              groupTotal += (c.amount || 0)
              groupWht += tax.whtAmount
              groupNet += tax.netPayable
            })

            // Detect unique bank accounts
            const uniqueBanks = new Map<string, { bank: string; account: string; holder: string }>()
            group.claims.forEach(c => {
              const key = c.bank_account_number || ''
              if (key && !uniqueBanks.has(key)) {
                uniqueBanks.set(key, {
                  bank: c.bank_name || '',
                  account: c.bank_account_number || '',
                  holder: c.account_holder_name || '',
                })
              }
            })
            const hasMultipleBanks = uniqueBanks.size > 1
            const hasAnyBank = uniqueBanks.size > 0
            const singleBank = uniqueBanks.size === 1 ? Array.from(uniqueBanks.values())[0] : null

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
                      <p className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">฿{fmtDec(groupNet)}</p>
                      <p className="text-[10px] text-emerald-500 font-medium">{isEn ? 'Net to Transfer' : 'ยอดโอนจริง'}</p>
                    </div>
                  </div>

                  {/* Bank Summary in Header */}
                  {singleBank ? (
                    // ทุกใบใช้บัญชีเดียวกัน — แสดงปกติ
                    <div className="mt-3 flex items-center gap-3 sm:gap-4 p-2.5 rounded-lg border bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700">
                      <span className="text-base">💳</span>
                      <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-sm flex-1">
                        <div>
                          <span className="text-[10px] text-zinc-400 block">{isEn ? 'Bank' : 'ธนาคาร'}</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{singleBank.bank || '—'}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">{isEn ? 'Account No.' : 'เลขบัญชี'}</span>
                          <span className="font-mono font-medium text-zinc-900 dark:text-zinc-100">{singleBank.account}</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">{isEn ? 'Account Holder' : 'ชื่อเจ้าของบัญชี'}</span>
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">{singleBank.holder || '—'}</span>
                        </div>
                      </div>
                    </div>
                  ) : hasMultipleBanks ? (
                    // หลายบัญชี — แสดงเตือน
                    <div className="mt-3 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <span className="text-sm">⚠</span>
                        <span className="text-xs font-semibold">
                          {isEn ? `${uniqueBanks.size} different bank accounts — check per row` : `มี ${uniqueBanks.size} บัญชีธนาคาร — ดูรายละเอียดแต่ละแถว`}
                        </span>
                      </div>
                    </div>
                  ) : (
                    // ไม่มีข้อมูลธนาคารเลย
                    <div className="mt-3 flex items-center gap-4 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-950/10">
                      <span className="text-base">💳</span>
                      <div className="flex items-center gap-6 text-sm flex-1">
                        <div>
                          <span className="text-[10px] text-zinc-400 block">{isEn ? 'Bank' : 'ธนาคาร'}</span>
                          <span className="font-medium text-amber-500">—</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">{isEn ? 'Account No.' : 'เลขบัญชี'}</span>
                          <span className="font-mono font-medium text-amber-500">—</span>
                        </div>
                        <div>
                          <span className="text-[10px] text-zinc-400 block">{isEn ? 'Account Holder' : 'ชื่อเจ้าของบัญชี'}</span>
                          <span className="font-medium text-amber-500">—</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-amber-500 font-medium shrink-0">
                        {isEn ? '⚠ No bank info' : '⚠ ยังไม่มีข้อมูลธนาคาร'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Claims — Desktop Table */}
                <div className="hidden md:block divide-y divide-zinc-100 dark:divide-zinc-800">
                  <div className="grid grid-cols-16 gap-2 px-4 py-2 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50/50 dark:bg-zinc-800/20">
                    <div className="col-span-2">{isEn ? 'Claim No.' : 'เลขที่'}</div>
                    <div className="col-span-2">{isEn ? 'Title' : 'หัวข้อ'}</div>
                    <div className="col-span-2">{isEn ? 'Bank' : 'ธนาคาร'}</div>
                    <div className="col-span-2">{isEn ? 'Account No.' : 'เลขที่บัญชี'}</div>
                    <div className="col-span-2">{isEn ? 'Holder' : 'ชื่อบัญชี'}</div>
                    <div className="col-span-1 text-right">{isEn ? 'Amount' : 'ยอดเงิน'}</div>
                    <div className="col-span-1 text-right">{isEn ? 'WHT' : 'หัก'}</div>
                    <div className="col-span-2 text-right">{isEn ? 'Net Pay' : 'จ่ายจริง'}</div>
                    <div className="col-span-2"></div>
                  </div>
                  {group.claims.map(c => {
                    const tax = getNetPayable(c)
                    const amt = c.amount || 0
                    const ck = getClaimChecklist(c)
                    return (
                      <div key={c.id} className={`grid grid-cols-16 gap-2 px-4 py-2.5 items-center text-sm transition-colors ${
                        ck.isComplete
                          ? 'hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
                          : 'bg-amber-50/40 dark:bg-amber-950/10 hover:bg-amber-50/70 dark:hover:bg-amber-950/20'
                      }`}>
                        <div className="col-span-2 space-y-1">
                          <div className="text-xs font-mono text-zinc-500">{c.claim_number}</div>
                          <FundingBadge claim={c} isEn={isEn} size="xs" />
                        </div>
                        <div className="col-span-2 min-w-0">
                          <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">{c.title}</p>
                          <div className="mt-1">
                            <ChecklistBadges claim={c} isEn={isEn} />
                          </div>
                        </div>
                        <div className="col-span-2 text-xs truncate">
                          {c.bank_name ? (
                            <span className="text-zinc-700 dark:text-zinc-300 font-medium">{c.bank_name}</span>
                          ) : (
                            <span className="text-amber-500 text-[10px]">{isEn ? 'No bank' : '—'}</span>
                          )}
                        </div>
                        <div className="col-span-2 text-xs font-mono text-zinc-600 dark:text-zinc-400 truncate">
                          {c.bank_account_number || <span className="text-amber-500 text-[10px]">—</span>}
                        </div>
                        <div className="col-span-2 text-xs text-zinc-600 dark:text-zinc-400 truncate">
                          {c.account_holder_name || <span className="text-amber-500 text-[10px]">—</span>}
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
                        <div className="col-span-2 text-right flex items-center justify-end gap-1">
                          {['approved', 'awaiting_payment'].includes(c.status) && (
                            <button
                              onClick={() => handleDeferToMonthEnd(c)}
                              disabled={deferringId === c.id}
                              className="px-2 py-1 text-[10px] font-medium rounded-md bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-400 dark:hover:bg-violet-900/40 transition-colors disabled:opacity-50"
                            >
                              {deferringId === c.id ? '...' : (isEn ? 'Month End' : 'สิ้นเดือน')}
                            </button>
                          )}
                          <button
                            onClick={() => handleMarkPaid(c)}
                            disabled={payingId === c.id || !ck.isComplete}
                            title={!ck.isComplete
                              ? (isEn ? 'Documents incomplete — cannot pay' : 'เอกสารไม่ครบ — ยังจ่ายไม่ได้')
                              : undefined}
                            className={`px-2 py-1 text-[10px] font-medium rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              ck.isComplete
                                ? 'bg-teal-50 text-teal-600 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-400 dark:hover:bg-teal-900/40'
                                : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                            }`}
                          >
                            {payingId === c.id ? '...' : !ck.isComplete
                              ? <span className="inline-flex items-center gap-0.5"><AlertCircle className="h-2.5 w-2.5" />{isEn ? 'Locked' : 'ล็อก'}</span>
                              : (isEn ? 'Paid' : 'ชำระแล้ว')}
                          </button>
                          <Link href={`/finance/${c.id}`} className="text-zinc-400 hover:text-emerald-500 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5 inline" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                  {/* Group subtotal — desktop */}
                  <div className="grid grid-cols-16 gap-2 px-4 py-2.5 items-center text-sm bg-emerald-50/50 dark:bg-emerald-950/10 font-semibold">
                    <div className="col-span-10 text-zinc-500">{isEn ? 'Subtotal' : 'รวม'} — {group.name}</div>
                    <div className="col-span-1 text-right font-mono text-zinc-600">฿{groupTotal.toLocaleString()}</div>
                    <div className="col-span-1 text-right font-mono text-purple-500 text-xs">
                      {groupWht > 0 ? `−${fmtDec(groupWht)}` : '—'}
                    </div>
                    <div className="col-span-2 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      ฿{fmtDec(groupNet)}
                    </div>
                    <div className="col-span-2"></div>
                  </div>
                </div>

                {/* Claims — Mobile Cards */}
                <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                  {group.claims.map(c => {
                    const tax = getNetPayable(c)
                    const ck = getClaimChecklist(c)
                    return (
                      <div key={c.id} className={`p-3 space-y-2 ${ck.isComplete ? '' : 'bg-amber-50/40 dark:bg-amber-950/10'}`}>
                        {/* Row 1: claim number + title */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] font-mono text-zinc-400">{c.claim_number}</p>
                            <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.title}</p>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              <FundingBadge claim={c} isEn={isEn} size="xs" />
                              <ChecklistBadges claim={c} isEn={isEn} />
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">฿{fmtDec(tax.netPayable)}</p>
                            {tax.whtAmount > 0 && (
                              <p className="text-[10px] text-purple-500">WHT −{fmtDec(tax.whtAmount)}</p>
                            )}
                          </div>
                        </div>
                        {/* Row 2: bank info */}
                        <div className="flex items-center gap-2 text-xs">
                          <span className="text-zinc-400">💳</span>
                          {c.bank_name ? (
                            <span className="text-zinc-600 dark:text-zinc-400">
                              {c.bank_name}
                              {c.bank_account_number && ` • ${c.bank_account_number}`}
                            </span>
                          ) : (
                            <span className="text-amber-500">{isEn ? 'No bank info' : 'ไม่มีข้อมูลธนาคาร'}</span>
                          )}
                        </div>
                        {/* Row 3: actions */}
                        <div className="flex items-center justify-end gap-2">
                          {['approved', 'awaiting_payment'].includes(c.status) && (
                            <button
                              onClick={() => handleDeferToMonthEnd(c)}
                              disabled={deferringId === c.id}
                              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-950/30 dark:text-violet-400 transition-colors disabled:opacity-50"
                            >
                              {deferringId === c.id ? '...' : (isEn ? 'Month End' : 'เลื่อนสิ้นเดือน')}
                            </button>
                          )}
                          <button
                            onClick={() => handleMarkPaid(c)}
                            disabled={payingId === c.id || !ck.isComplete}
                            title={!ck.isComplete
                              ? (isEn ? 'Documents incomplete — cannot pay' : 'เอกสารไม่ครบ — ยังจ่ายไม่ได้')
                              : undefined}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                              ck.isComplete
                                ? 'bg-teal-50 text-teal-600 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-400'
                                : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500'
                            }`}
                          >
                            {payingId === c.id ? '...' : !ck.isComplete
                              ? <span className="inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" />{isEn ? 'Locked' : 'ล็อก'}</span>
                              : (isEn ? 'Mark Paid' : 'ชำระแล้ว')}
                          </button>
                          <Link href={`/finance/${c.id}`} className="px-2 py-1.5 text-zinc-400 hover:text-emerald-500 transition-colors">
                            <ExternalLink className="h-4 w-4" />
                          </Link>
                        </div>
                      </div>
                    )
                  })}
                  {/* Group subtotal — mobile */}
                  <div className="p-3 bg-emerald-50/50 dark:bg-emerald-950/10 flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-500">{isEn ? 'Subtotal' : 'รวม'}</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">฿{fmtDec(groupNet)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Grand Total Bar */}
      {groupedByPerson.length > 0 && (
        <div className="rounded-xl border-2 border-emerald-300 dark:border-emerald-700 p-4 sm:p-5 bg-linear-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <p className="text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-300">
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
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                ฿{fmtDec(stats.totalNetPayable)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
