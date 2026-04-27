'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { PlusCircle, Clock, CheckCircle2, XCircle, Filter, Banknote, Search, ExternalLink, FileEdit, Ban, Wallet, AlertCircle, RefreshCw, FileText, Hash, Receipt, User as UserIcon, Building2 } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../costs/types'
import { CLAIM_STATUSES, getClaimStatusLabel, getClaimStatusColor, getCategoryLabel, getClaimChecklist, getFundingSourceColor, getFundingSourceLabel } from '../costs/types'
import type { FinanceCategory } from './settings-actions'
import { cancelClaim } from './actions'

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
  return { netPayable }
}

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function DocBadge({
  ok,
  labelTh,
  labelEn,
  Icon,
}: {
  ok: boolean
  labelTh: string
  labelEn: string
  Icon: typeof Clock
}) {
  // We don't have access to locale here; use both labels as a tooltip and Thai by default
  return (
    <span
      title={ok ? `${labelTh} ครบ` : `${labelTh} ยังไม่ครบ`}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold ${
        ok
          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border border-emerald-200/60 dark:border-emerald-800/60'
          : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border border-red-200/60 dark:border-red-800/60'
      }`}
    >
      <Icon className="h-2.5 w-2.5" />
      {labelTh}
      {ok ? ' ✓' : ' ✗'}
    </span>
  )
}

const statusIcons: Record<string, typeof Clock> = {
  draft:             FileEdit,
  pending:           Clock,
  approved:          CheckCircle2,
  awaiting_payment:  Clock,
  pending_month_end: Clock,
  paid:              CheckCircle2,
  refund_confirmed:  RefreshCw,
  rejected:          XCircle,
  cancelled:         Ban,
}

export default function ClaimsListView({
  claims,
  error,
  categories = [],
  isAdmin = false,
  userId = '',
  paidClaims = [],
}: {
  claims: ExpenseClaim[]
  error: string | null
  categories?: FinanceCategory[]
  isAdmin?: boolean
  userId?: string
  paidClaims?: ExpenseClaim[]
}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [paidSearch, setPaidSearch] = useState('')
  const [paidTypeFilter, setPaidTypeFilter] = useState<'all' | 'event' | 'other' | 'advance'>('all')
  const [paidCategoryFilter, setPaidCategoryFilter] = useState('')
  const [paidMonthFilter, setPaidMonthFilter] = useState('')

  const paidMonths = useMemo(() => {
    const months = new Set<string>()
    paidClaims.forEach(c => { if (c.paid_at) months.add(c.paid_at.slice(0, 7)) })
    return Array.from(months).sort().reverse()
  }, [paidClaims])

  const filteredPaid = useMemo(() => {
    let list = paidClaims
    if (paidSearch.trim()) {
      const q = paidSearch.trim().toLowerCase()
      list = list.filter(c => {
        const name = c.submitter?.full_name?.toLowerCase() || ''
        const title = c.title?.toLowerCase() || ''
        const num = c.claim_number?.toLowerCase() || ''
        return name.includes(q) || title.includes(q) || num.includes(q)
      })
    }
    if (paidTypeFilter !== 'all') {
      list = list.filter(c => c.claim_type === paidTypeFilter)
    }
    if (paidCategoryFilter) {
      list = list.filter(c => c.category === paidCategoryFilter)
    }
    if (paidMonthFilter) {
      list = list.filter(c => c.paid_at && c.paid_at.startsWith(paidMonthFilter))
    }
    return list
  }, [paidClaims, paidSearch, paidTypeFilter, paidCategoryFilter, paidMonthFilter])

  const totalPaidNet = useMemo(() => {
    let total = 0
    filteredPaid.forEach(c => {
      const { netPayable } = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      total += netPayable
    })
    return total
  }, [filteredPaid])

  const totalAllPaidNet = useMemo(() => {
    let total = 0
    paidClaims.forEach(c => {
      const { netPayable } = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      total += netPayable
    })
    return total
  }, [paidClaims])

  const isFiltering = paidTypeFilter !== 'all' || !!paidCategoryFilter || !!paidMonthFilter || !!paidSearch.trim()

  const handleCancel = async (claimId: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(isEn ? 'Cancel this claim?' : 'ยืนยันยกเลิกใบเบิกนี้?')) return
    setCancellingId(claimId)
    const res = await cancelClaim(claimId)
    setCancellingId(null)
    if (res.error) alert(res.error)
    else startTransition(() => router.refresh())
  }

  // Active = everything except paid (archive) and cancelled —
  // EXCEPT advance claims that are paid but not yet settled (user still
  // needs to report actual spend), which we keep visible so the claimant
  // can find them to settle.
  const isUnsettledAdvance = (c: ExpenseClaim) =>
    c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount == null
  const activeClaims = claims.filter(c =>
    (c.status !== 'paid' && c.status !== 'cancelled' && c.status !== 'refund_confirmed') || isUnsettledAdvance(c)
  )

  const filtered = filterStatus === 'all'
    ? activeClaims
    : activeClaims.filter(c => c.status === filterStatus)

  // Stats
  const totalDraft = claims.filter(c => c.status === 'draft').length
  const totalPending = activeClaims.filter(c => c.status === 'pending').length
  const totalApproved = activeClaims.filter(c => c.status === 'approved' || c.status === 'awaiting_payment').length
  const totalPendingMonthEnd = activeClaims.filter(c => c.status === 'pending_month_end').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            {locale === 'th' ? 'ใบเบิกเงิน' : 'Expense Claims'}
          </h1>
          <p className="text-sm text-zinc-500 mt-1">
            {locale === 'th' ? `${activeClaims.length} รายการที่ใช้งาน` : `${activeClaims.length} active`}
            {totalDraft > 0 && (
              <span className="ml-2 text-zinc-400 font-medium">
                • {totalDraft} {locale === 'th' ? 'แบบร่าง' : 'draft'}
              </span>
            )}
            {totalPending > 0 && (
              <span className="ml-2 text-amber-600 font-medium">
                • {totalPending} {locale === 'th' ? 'รออนุมัติ' : 'pending'}
              </span>
            )}
          </p>
        </div>
        <Link
          href="/finance/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          <PlusCircle className="h-4 w-4" />
          {locale === 'th' ? 'สร้างใบเบิก' : 'New Claim'}
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-400 mb-1">{isEn ? 'Draft' : 'แบบร่าง'}</p>
          <p className="text-2xl font-bold text-zinc-500">{totalDraft}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-amber-600 mb-1">{isEn ? 'Pending' : 'รออนุมัติ'}</p>
          <p className="text-2xl font-bold text-amber-600">{totalPending}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-emerald-600 mb-1">{isEn ? 'Approved' : 'อนุมัติแล้ว'}</p>
          <p className="text-2xl font-bold text-emerald-600">{totalApproved}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-violet-600 mb-1">{isEn ? 'Month End' : 'รอจ่ายสิ้นเดือน'}</p>
          <p className="text-2xl font-bold text-violet-600">{totalPendingMonthEnd}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-red-500 mb-1">{isEn ? 'Rejected' : 'ปฏิเสธ'}</p>
          <p className="text-2xl font-bold text-red-500">
            {activeClaims.filter(c => c.status === 'rejected').length}
          </p>
        </div>
      </div>

      {/* Filter */}
      <div className="flex items-center gap-2">
        <Filter className="h-4 w-4 text-zinc-400" />
        <div className="flex gap-1">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              filterStatus === 'all'
                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
            }`}
          >
            {locale === 'th' ? 'ทั้งหมด' : 'All'}
          </button>
          {CLAIM_STATUSES
            .filter(s => !['paid', 'approved', 'awaiting_payment', 'cancelled', 'refund_confirmed'].includes(s.value))
            .map(s => (
              <button
                key={s.value}
                onClick={() => setFilterStatus(s.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === s.value
                    ? 'text-white'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                }`}
                style={filterStatus === s.value ? { backgroundColor: s.color } : {}}
              >
                {isEn ? s.label : s.labelTh}
              </button>
            ))}
          {isAdmin && (
            <button
              onClick={() => setFilterStatus('paid')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                filterStatus === 'paid'
                  ? 'bg-teal-600 text-white'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
              }`}
            >
              {isEn ? 'Paid' : 'ชำระเงินแล้ว'}
            </button>
          )}
        </div>
      </div>

      {/* Claims List */}
      {filterStatus !== 'paid' && error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {filterStatus !== 'paid' && (filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
          <Banknote className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">{locale === 'th' ? 'ยังไม่มีใบเบิก' : 'No claims yet'}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(claim => {
            const StatusIcon = statusIcons[claim.status] || Clock
            const statusColor = getClaimStatusColor(claim.status)
            const ck = getClaimChecklist(claim)
            const fundingColor = getFundingSourceColor(claim.funding_source)
            const isPersonal = claim.funding_source === 'personal'
            return (
              <Link
                key={claim.id}
                href={`/finance/${claim.id}`}
                className={`flex items-center justify-between p-4 bg-white dark:bg-zinc-900 rounded-xl border transition-colors group ${
                  ck.isComplete
                    ? 'border-zinc-200 dark:border-zinc-800 hover:border-emerald-300'
                    : 'border-zinc-200 dark:border-zinc-800 hover:border-amber-300'
                }`}
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div
                    className="flex items-center justify-center h-10 w-10 rounded-lg shrink-0"
                    style={{ backgroundColor: `${statusColor}15` }}
                  >
                    <StatusIcon className="h-5 w-5" style={{ color: statusColor }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-zinc-400">{claim.claim_number}</span>
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
                        style={{ backgroundColor: statusColor }}
                      >
                        {getClaimStatusLabel(claim.status, locale)}
                      </span>
                      {/* Funding source badge */}
                      <span
                        className="px-2 py-0.5 rounded-full text-[10px] font-semibold inline-flex items-center gap-1"
                        style={{ backgroundColor: `${fundingColor}1a`, color: fundingColor }}
                        title={isEn ? 'Funding source' : 'แหล่งเงิน'}
                      >
                        {isPersonal ? <UserIcon className="h-2.5 w-2.5" /> : <Building2 className="h-2.5 w-2.5" />}
                        {getFundingSourceLabel(claim.funding_source, locale)}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium inline-flex items-center gap-1 ${
                        claim.claim_type === 'advance'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}>
                        {claim.claim_type === 'advance' && <Wallet className="h-2.5 w-2.5" />}
                        {claim.claim_type === 'event'
                          ? (locale === 'th' ? 'อีเวนต์' : 'Event')
                          : claim.claim_type === 'advance'
                            ? (locale === 'th' ? 'ทดลองจ่าย' : 'Advance')
                            : (locale === 'th' ? 'ค่าอื่นๆ' : 'Other')}
                      </span>
                      {isUnsettledAdvance(claim) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white inline-flex items-center gap-1 animate-pulse">
                          <AlertCircle className="h-2.5 w-2.5" />
                          {locale === 'th' ? 'รออัพเดทค่าใช้จ่าย' : 'Settle required'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate mt-1">
                      {claim.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5">
                      {claim.submitter?.full_name || '—'} • {new Date(claim.expense_date).toLocaleDateString('th-TH')}
                      {(claim.job_event as any)?.event_name && ` • ${(claim.job_event as any).event_name}`}
                    </p>
                    {/* Document checklist mini badges */}
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <DocBadge
                        ok={ck.hasReceipt}
                        labelTh="ใบเสร็จ"
                        labelEn="Receipt"
                        Icon={FileText}
                      />
                      {ck.taxInvoiceRequired && (
                        <DocBadge
                          ok={ck.hasTaxInvoice}
                          labelTh="ใบกำกับ"
                          labelEn="Tax Inv."
                          Icon={Hash}
                        />
                      )}
                      {ck.refundRequired && (
                        <DocBadge
                          ok={ck.hasRefundSlip && ck.refundConfirmed}
                          labelTh="คืนเงิน"
                          labelEn="Refund"
                          Icon={RefreshCw}
                        />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                      ฿{(claim.amount || 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-400">
                      {getCategoryLabel(claim.category, locale, categories)}
                    </p>
                  </div>
                  {userId && claim.submitted_by === userId && ['draft', 'pending'].includes(claim.status) && (
                    <button
                      onClick={(e) => handleCancel(claim.id, e)}
                      disabled={cancellingId === claim.id}
                      title={isEn ? 'Cancel claim' : 'ยกเลิกใบเบิก'}
                      className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-40"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      ))}

      {/* ชำระเงินแล้ว — Admin only, shown when paid tab active */}
      {isAdmin && filterStatus === 'paid' && (
        <div className="space-y-4">
          {/* Section Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 shrink-0">
                <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div>
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  {isEn ? 'Paid Claims' : 'ชำระเงินแล้ว'}
                </h2>
                <p className="text-xs text-zinc-400">
                  {paidClaims.length} {isEn ? 'claims total' : 'รายการทั้งหมด'}
                </p>
              </div>
            </div>
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={paidSearch}
                onChange={e => setPaidSearch(e.target.value)}
                placeholder={isEn ? 'Search...' : 'ค้นหา...'}
                className="pl-8 pr-3 py-2 w-full border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-teal-50 dark:bg-teal-950/20 rounded-xl border border-teal-100 dark:border-teal-900/30 p-3">
              <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium mb-0.5">{isEn ? 'Grand Total' : 'ยอดรวมทั้งหมด'}</p>
              <p className="text-lg font-bold text-teal-700 dark:text-teal-300">฿{fmtDec(totalAllPaidNet)}</p>
              <p className="text-[10px] text-zinc-400">{paidClaims.length} {isEn ? 'claims' : 'รายการ'}</p>
            </div>
            {isFiltering ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[10px] text-zinc-500 font-medium mb-0.5">{isEn ? 'Filtered Total' : 'ยอดรวม (กรองแล้ว)'}</p>
                <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">฿{fmtDec(totalPaidNet)}</p>
                <p className="text-[10px] text-zinc-400">{filteredPaid.length} {isEn ? 'claims' : 'รายการ'}</p>
              </div>
            ) : null}
            {isFiltering ? (
              <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl border border-zinc-200 dark:border-zinc-700 p-3 flex flex-col justify-center">
                <p className="text-[10px] text-zinc-400 mb-1">{isEn ? 'Filtered' : 'สัดส่วนที่กรอง'}</p>
                <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="h-1.5 bg-teal-500 rounded-full transition-all"
                    style={{ width: totalAllPaidNet > 0 ? `${Math.min(100, (totalPaidNet / totalAllPaidNet) * 100).toFixed(1)}%` : '0%' }}
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1">
                  {totalAllPaidNet > 0 ? `${((totalPaidNet / totalAllPaidNet) * 100).toFixed(1)}%` : '—'}
                </p>
              </div>
            ) : null}
          </div>

          {/* Paid Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Type */}
            <div className="flex gap-1">
              {(['all', 'event', 'other', 'advance'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setPaidTypeFilter(t)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    paidTypeFilter === t
                      ? 'bg-teal-600 text-white'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {t === 'all'     ? (isEn ? 'All Types' : 'ทุกประเภท')
                   : t === 'event'  ? (isEn ? 'Event' : 'อีเวนต์')
                   : t === 'advance'? (isEn ? 'Advance' : 'ทดลองจ่าย')
                   :                  (isEn ? 'Other' : 'ค่าอื่นๆ')}
                </button>
              ))}
            </div>

            {/* Category */}
            {categories.length > 0 && (
              <select
                value={paidCategoryFilter}
                onChange={e => setPaidCategoryFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              >
                <option value="">{isEn ? 'All Categories' : 'ทุกหมวดหมู่'}</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.value}>{isEn ? cat.label || cat.label_th : cat.label_th}</option>
                ))}
              </select>
            )}

            {/* Month */}
            {paidMonths.length > 0 && (
              <select
                value={paidMonthFilter}
                onChange={e => setPaidMonthFilter(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500"
              >
                <option value="">{isEn ? 'All Months' : 'ทุกเดือน'}</option>
                {paidMonths.map(m => {
                  const [y, mo] = m.split('-')
                  const label = new Date(Number(y), Number(mo) - 1).toLocaleDateString(isEn ? 'en-US' : 'th-TH', { month: 'long', year: 'numeric' })
                  return <option key={m} value={m}>{label}</option>
                })}
              </select>
            )}

            {/* Clear filters */}
            {(paidTypeFilter !== 'all' || paidCategoryFilter || paidMonthFilter || paidSearch) && (
              <button
                onClick={() => { setPaidTypeFilter('all'); setPaidCategoryFilter(''); setPaidMonthFilter(''); setPaidSearch('') }}
                className="px-3 py-1.5 text-xs rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {isEn ? 'Clear' : 'ล้างตัวกรอง'}
              </button>
            )}
          </div>

          {filteredPaid.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
              <CheckCircle2 className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">{isEn ? 'No paid claims yet' : 'ยังไม่มีใบเบิกที่ชำระแล้ว'}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
              {/* Desktop Table */}
              <div className="hidden md:block">
                <div className="grid grid-cols-12 gap-2 px-4 py-2.5 text-[10px] uppercase tracking-wider text-zinc-400 font-semibold bg-zinc-50 dark:bg-zinc-800/30 border-b border-zinc-200 dark:border-zinc-800">
                  <div className="col-span-2">{isEn ? 'Claim No.' : 'เลขที่'}</div>
                  <div className="col-span-2">{isEn ? 'Submitter' : 'ผู้เบิก'}</div>
                  <div className="col-span-3">{isEn ? 'Title' : 'หัวข้อ'}</div>
                  <div className="col-span-1">{isEn ? 'Category' : 'หมวด'}</div>
                  <div className="col-span-1 text-right">{isEn ? 'Net Paid' : 'จ่ายจริง'}</div>
                  <div className="col-span-2">{isEn ? 'Paid At' : 'วันที่ชำระ'}</div>
                  <div className="col-span-1"></div>
                </div>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filteredPaid.map(c => {
                    const { netPayable } = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
                    return (
                      <div key={c.id} className="grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                        <div className="col-span-2 text-xs font-mono text-zinc-500">{c.claim_number}</div>
                        <div className="col-span-2 truncate font-medium text-zinc-700 dark:text-zinc-300">{c.submitter?.full_name || '—'}</div>
                        <div className="col-span-3 truncate text-zinc-900 dark:text-zinc-100">{c.title}</div>
                        <div className="col-span-1 text-xs text-zinc-500">{getCategoryLabel(c.category, locale, categories)}</div>
                        <div className="col-span-1 text-right font-mono font-bold text-teal-600 dark:text-teal-400">฿{fmtDec(netPayable)}</div>
                        <div className="col-span-2 text-xs text-zinc-500">
                          {c.paid_at
                            ? new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </div>
                        <div className="col-span-1 text-right">
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
                {filteredPaid.map(c => {
                  const { netPayable } = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
                  return (
                    <Link key={c.id} href={`/finance/${c.id}`} className="block p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-[10px] font-mono text-zinc-400">{c.claim_number}</p>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.title}</p>
                          <p className="text-xs text-zinc-500 mt-0.5">{c.submitter?.full_name || '—'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-teal-600 dark:text-teal-400">฿{fmtDec(netPayable)}</p>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400 mt-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {isEn ? 'Paid' : 'ชำระแล้ว'}
                          </span>
                        </div>
                      </div>
                      {c.paid_at && (
                        <p className="text-[10px] text-zinc-400 mt-1">
                          {new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
