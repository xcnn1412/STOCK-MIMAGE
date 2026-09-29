'use client'

import { useEffect, useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { PlusCircle, Clock, CheckCircle2, XCircle, Filter, Banknote, Search, ExternalLink, FileEdit, Ban, Wallet, AlertCircle, RefreshCw, Coins, FileStack, FolderCheck, CheckSquare } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import type { ExpenseClaim } from '../costs/types'
import { CLAIM_STATUSES, getClaimStatusLabel, getClaimStatusColor, getCategoryLabel, getClaimChecklist } from '../costs/types'
import { ChecklistBadges, FundingBadge } from './doc-badges'
import { useConfirm } from './use-confirm'
import type { FinanceCategory } from './settings-actions'
import { cancelClaim } from './actions'
import {
  EMPTY_FILTERS, MAX_BUNDLE_SELECTION, categoryValues, claimFileCount, filedState, filterClaims, hasFilters,
  initialFilters, listQuery, monthOptions, rememberListQuery, selectableIds, submitterOptions,
} from './claims-filter'
import type { ClaimFilters, FiledFilter } from './claims-filter'
import BundleDialog from './bundle-dialog'
import type { BundleClaimRef } from './bundle-dialog'

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

const netOf = (c: ExpenseClaim) =>
  calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0).netPayable

const pillCls = 'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors'
const pillIdleCls = 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
/** กล่องเลือกที่กำลังกรองอยู่มีขอบเขียว — มองปราดเดียวรู้ว่ากรองอะไรไว้ */
const selectCls = (active: boolean) =>
  `max-w-full px-3 py-1.5 text-xs rounded-lg border bg-white dark:bg-zinc-900 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 ${
    active
      ? 'border-emerald-500 text-emerald-700 dark:text-emerald-400 font-medium'
      : 'border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
  }`

/** ป้ายสถานะแฟ้มในแถว — ไม่แสดงอะไรเมื่อยังไม่เข้าแฟ้ม (รวมฐานข้อมูลที่ยังไม่มีคอลัมน์) */
function FiledBadge({ claim, isEn }: { claim: ExpenseClaim; isEn: boolean }) {
  const state = filedState(claim)
  if (state === 'none') return null
  if (state === 'filed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-emerald-300 text-emerald-700 dark:border-emerald-800 dark:text-emerald-400">
        <FolderCheck className="h-2.5 w-2.5" />
        {isEn ? 'Filed' : 'เข้าแฟ้มแล้ว'}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
      <AlertCircle className="h-2.5 w-2.5" />
      {isEn ? 'Attachments changed after filing' : 'ไฟล์แนบเปลี่ยนหลังเข้าแฟ้ม'}
    </span>
  )
}

const toBundleRef = (c: ExpenseClaim): BundleClaimRef => ({
  id: c.id,
  claim_number: c.claim_number,
  title: c.title,
  incomplete: !getClaimChecklist(c).isComplete,
  fileCount: claimFileCount(c),
})

const rowCheckboxCls = 'h-4 w-4 shrink-0 accent-emerald-600 cursor-pointer'
const rowBundleBtnCls = 'p-1.5 rounded-lg text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-950/20 transition-colors'

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
  paidMonths = [],
  paidMonth = '',
}: {
  claims: ExpenseClaim[]
  error: string | null
  categories?: FinanceCategory[]
  isAdmin?: boolean
  userId?: string
  /** ใบที่จ่ายแล้วของเดือน paidMonth เท่านั้น (server โหลดทีละเดือน) */
  paidClaims?: ExpenseClaim[]
  paidMonths?: { month: string; count: number }[]
  /** เดือนที่จ่ายที่ server โหลดมา 'YYYY-MM' ('' = ยังไม่มีการจ่าย) */
  paidMonth?: string
}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const router = useRouter()
  const searchParams = useSearchParams()
  const { confirm: askConfirm, dialog: confirmDialog } = useConfirm()
  const [, startTransition] = useTransition()
  const [loadingMonth, startMonthLoad] = useTransition()
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  // หน้าต่างจับชุด: เก็บภาพของใบที่เลือก ณ ตอนเปิด — ข้อมูลโหลดใหม่ระหว่างทำงาน ชุดต้องไม่เปลี่ยน
  const [bundleFor, setBundleFor] = useState<BundleClaimRef[] | null>(null)
  // โหมดเลือกหลายใบ (แอดมิน) — เก็บแค่ id
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const selectMode = isAdmin && selecting
  // ตัวกรองชุดเดียวใช้ร่วมกันทุกแท็บ ค่าเริ่มต้นอ่านจาก URL — ปุ่ม "กลับ" ของหน้าใบเบิกพากลับมาพร้อมตัวกรองเดิม
  const [filters, setFilters] = useState<ClaimFilters>(() =>
    initialFilters(searchParams, [...claims, ...paidClaims], isAdmin)
  )
  const setFilter = (patch: Partial<ClaimFilters>) => setFilters(f => ({ ...f, ...patch }))
  const clearFilters = () => setFilters(f => ({ ...EMPTY_FILTERS, status: f.status }))

  // เขียนตัวกรองลง URL โดยไม่โหลดข้อมูลใหม่ (กรองฝั่ง browser ทั้งหมด) และจำไว้ให้ปุ่มกลับ
  useEffect(() => {
    const query = listQuery(filters, paidMonth)
    rememberListQuery(query)
    if (window.location.search === query) return
    try {
      window.history.replaceState(null, '', query || window.location.pathname)
    } catch { /* เบราว์เซอร์จำกัดความถี่การแก้ URL — ตัวกรองยังทำงานจาก state */ }
  }, [filters, paidMonth])

  // เดือนของแท็บชำระแล้วอยู่ที่ server — เปลี่ยนเดือน = ขอหน้าใหม่ ตัวกรองอื่นใน state อยู่ครบ
  // ระหว่างรอ กล่องเลือกแสดงเดือนที่เพิ่งเลือก (ไม่เด้งกลับเดือนเดิม) จนกว่าข้อมูลเดือนใหม่มาถึง
  const [shownPaidMonth, showPaidMonth] = useOptimistic(paidMonth)
  const choosePaidMonth = (month: string) =>
    startMonthLoad(() => {
      showPaidMonth(month)
      router.replace('/finance' + listQuery({ ...filters, status: 'paid' }, month), { scroll: false })
    })

  const handleCancel = async (claim: ExpenseClaim, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const ok = await askConfirm({
      title: isEn ? 'Cancel this claim?' : 'ยกเลิกใบเบิกนี้?',
      description: isEn
        ? 'This cannot be undone. The claim will be marked as cancelled.'
        : 'ไม่สามารถย้อนกลับได้ ใบเบิกจะถูกทำเครื่องหมายว่ายกเลิกแล้ว',
      details: [
        { label: isEn ? 'Claim no.' : 'เลขที่', value: claim.claim_number },
        { label: isEn ? 'Title' : 'หัวข้อ', value: claim.title },
        { label: isEn ? 'Amount' : 'ยอด', value: `฿${(claim.amount || 0).toLocaleString()}` },
      ],
      variant: 'destructive',
      confirmLabel: isEn ? 'Cancel claim' : 'ยืนยันยกเลิก',
      cancelLabel: isEn ? 'Keep' : 'ไม่ยกเลิก',
    })
    if (!ok) return
    setCancellingId(claim.id)
    const res = await cancelClaim(claim.id)
    setCancellingId(null)
    if (res.error) {
      toast.error(res.error)
      return
    }
    toast.success(isEn ? `Claim ${claim.claim_number} cancelled` : `ยกเลิกใบเบิก ${claim.claim_number} แล้ว`)
    startTransition(() => router.refresh())
  }

  // ปุ่มในแถว (แถวเป็น <Link>) — กันไม่ให้คลิกทะลุไปเปิดหน้าใบเบิก
  const bundleOne = (claim: ExpenseClaim, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setBundleFor([toBundleRef(claim)])
  }
  const bundleLabel = isEn ? 'Bundle documents' : 'จับชุดเอกสาร'
  const exitSelecting = () => {
    setSelecting(false)
    setSelected(new Set())
  }

  // Active = everything except paid (archive) and cancelled —
  // EXCEPT advance claims that are paid but not yet settled (user still
  // needs to report actual spend), which we keep visible so the claimant
  // can find them to settle.
  const isUnsettledAdvance = (c: ExpenseClaim) =>
    c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount == null
  // A petty-cash FUND stays visible while its month is open (paid but not
  // closed) so the office can keep logging expenses. Top-ups (fund_id set) are
  // normal claims — once paid they drop to the archive like everything else.
  const isOpenPettyCash = (c: ExpenseClaim) =>
    c.claim_type === 'petty_cash' && !c.pettycash_fund_id && c.status === 'paid' && c.pettycash_closed_at == null
  const activeClaims = claims.filter(c =>
    (c.status !== 'paid' && c.status !== 'cancelled' && c.status !== 'refund_confirmed') || isUnsettledAdvance(c) || isOpenPettyCash(c)
  )

  // shown = ชุดข้อมูลของแท็บที่เลือก, filtered = หลังผ่านตัวกรองละเอียด
  const showPaid = filters.status === 'paid'
  const shown = showPaid
    ? paidClaims
    : filters.status === 'all' ? activeClaims : activeClaims.filter(c => c.status === filters.status)
  // แท็บชำระแล้ว server ตัดตามเดือนที่จ่ายมาแล้ว — เดือนที่ใช้จ่ายใน state ไม่ใช้และไม่นับเป็นการกรอง
  const applied = showPaid ? { ...filters, month: '' } : filters
  const filtered = filterClaims(shown, applied, 'expense_date')
  const filtering = hasFilters(applied)
  const filteredAmount = filtered.reduce((sum, c) => sum + (Number(c.amount) || 0), 0)
  const totalPaidNet = filtered.reduce((sum, c) => sum + netOf(c), 0)
  const totalAllPaidNet = paidClaims.reduce((sum, c) => sum + netOf(c), 0)

  const allClaims = [...claims, ...paidClaims]
  // id ที่เลือกไว้แต่ไม่อยู่ในข้อมูลที่โหลดอยู่ (เช่นเปลี่ยนเดือนของแท็บชำระแล้ว) ไม่นับและไม่ส่งเข้าชุด
  // ใบทดลองจ่ายที่จ่ายแล้วอยู่ได้ทั้งสองชุด — Map กันซ้ำด้วย id
  const loadedById = new Map(allClaims.map(c => [c.id, c]))
  const selectedClaims = [...selected].flatMap(id => loadedById.get(id) ?? [])
  const selectAllIds = selectableIds(filtered)
  const overLimit = filtered.length > MAX_BUNDLE_SELECTION || selectedClaims.length >= MAX_BUNDLE_SELECTION
  const toggleSelected = (id: string) =>
    setSelected(prev => {
      // นับเพดานจากใบที่โหลดอยู่จริง — id ค้างจากเดือนก่อนไม่กินโควตา
      const next = new Set([...prev].filter(x => loadedById.has(x)))
      if (next.has(id)) next.delete(id)
      else if (next.size < MAX_BUNDLE_SELECTION) next.add(id)
      return next
    })
  const people = submitterOptions(allClaims, shown)
  const months = monthOptions(shown, 'expense_date', filters.month)
  const categoryOptions = categoryValues(allClaims)
    .map(value => ({ value, label: getCategoryLabel(value, locale, categories) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'th'))
  const monthLabel = (m: string) => {
    const [y, mo] = m.split('-')
    return new Date(Number(y), Number(mo) - 1).toLocaleDateString(isEn ? 'en-US' : 'th-TH', { month: 'long', year: 'numeric' })
  }

  // Stats
  const totalDraft = claims.filter(c => c.status === 'draft').length
  const totalPending = activeClaims.filter(c => c.status === 'pending').length
  const totalApproved = activeClaims.filter(c => c.status === 'approved' || c.status === 'awaiting_payment').length
  const totalPendingMonthEnd = activeClaims.filter(c => c.status === 'pending_month_end').length

  return (
    // เว้นที่ใต้รายการเท่าความสูงแถบเลือกหลายใบ — แถวสุดท้ายต้องไม่ถูกแถบบัง
    <div className={`space-y-6 ${selectMode ? 'pb-48 md:pb-36' : ''}`}>
      {confirmDialog}
      {bundleFor && (
        <BundleDialog
          claims={bundleFor}
          isAdmin={isAdmin}
          isEn={isEn}
          onClose={() => setBundleFor(null)}
          onFiled={() => startTransition(() => router.refresh())}
        />
      )}
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
      <div className="flex items-start gap-2">
        <Filter className="h-4 w-4 mt-1.5 shrink-0 text-zinc-400" />
        <div className="flex flex-wrap gap-1">
          <button
            onClick={() => setFilter({ status: 'all' })}
            aria-pressed={filters.status === 'all'}
            className={`${pillCls} ${
              filters.status === 'all' ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900' : pillIdleCls
            }`}
          >
            {locale === 'th' ? 'ทั้งหมด' : 'All'}
          </button>
          {CLAIM_STATUSES
            // `paid` has its own admin-only button to the right of this row,
            // and the rest are terminal/legacy states we keep out of the
            // primary filter pills. `approved` IS shown — it's a real
            // intermediate state (อนุมัติแล้วรอจ่าย) admins filter on.
            .filter(s => !['paid', 'awaiting_payment', 'cancelled', 'refund_confirmed'].includes(s.value))
            .map(s => (
              <button
                key={s.value}
                onClick={() => setFilter({ status: s.value })}
                aria-pressed={filters.status === s.value}
                className={`${pillCls} ${filters.status === s.value ? 'text-white' : pillIdleCls}`}
                style={filters.status === s.value ? { backgroundColor: s.color } : {}}
              >
                {isEn ? s.label : s.labelTh}
              </button>
            ))}
          {isAdmin && (
            <button
              onClick={() => setFilter({ status: 'paid' })}
              aria-pressed={showPaid}
              className={`${pillCls} ${showPaid ? 'bg-teal-600 text-white' : pillIdleCls}`}
            >
              {isEn ? 'Paid' : 'ชำระเงินแล้ว'}
            </button>
          )}
        </div>
      </div>

      {/* Claim type filter */}
      <div className="flex items-start gap-2 -mt-3">
        <Wallet className="h-4 w-4 mt-1.5 shrink-0 text-zinc-400" />
        <div className="flex flex-wrap gap-1">
          {([
            { v: 'all', label: isEn ? 'All types' : 'ทุกประเภท' },
            { v: 'event', label: isEn ? 'Event' : 'อีเวนต์' },
            { v: 'advance', label: isEn ? 'Advance' : 'ทดลองจ่าย' },
            { v: 'petty_cash', label: isEn ? 'Petty Cash' : 'เงินสดย่อย' },
            { v: 'other', label: isEn ? 'Other' : 'อื่นๆ' },
          ] as const).map(t => (
            <button
              key={t.v}
              onClick={() => setFilter({ type: t.v })}
              aria-pressed={filters.type === t.v}
              className={`${pillCls} ${filters.type === t.v ? 'bg-amber-500 text-white' : pillIdleCls}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ค้นหา + ตัวกรองละเอียด — ใช้ร่วมกันทุกแท็บ รวมถึง "ชำระเงินแล้ว" */}
      <div className="flex flex-wrap items-center gap-2 -mt-3">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
          <input
            type="search"
            value={filters.q}
            onChange={e => setFilter({ q: e.target.value })}
            maxLength={100}
            aria-label={isEn ? 'Search claims' : 'ค้นหาใบเบิก'}
            placeholder={isEn ? 'Claim no., title, name, event' : 'เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน'}
            className="pl-8 pr-3 py-1.5 w-full border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        {/* ผู้เบิก — มีให้เลือกเมื่อเห็นใบเบิกของมากกว่าหนึ่งคน (พนักงานเห็นเฉพาะของตัวเองจึงไม่มีกล่องนี้) */}
        {people.length > 1 && (
          <select
            value={filters.by}
            onChange={e => setFilter({ by: e.target.value })}
            aria-label={isEn ? 'Submitter' : 'ผู้เบิก'}
            className={selectCls(!!filters.by)}
          >
            <option value="">{isEn ? 'All submitters' : 'ผู้เบิกทุกคน'}</option>
            {people.map(p => (
              <option key={p.id} value={p.id}>{p.name} ({p.count})</option>
            ))}
          </select>
        )}

        {categoryOptions.length > 1 && (
          <select
            value={filters.category}
            onChange={e => setFilter({ category: e.target.value })}
            aria-label={isEn ? 'Category' : 'หมวดหมู่'}
            className={selectCls(!!filters.category)}
          >
            <option value="">{isEn ? 'All categories' : 'ทุกหมวดหมู่'}</option>
            {categoryOptions.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        )}

        {/* แท็บชำระแล้ว: เดือนที่จ่าย โหลดทีละเดือนจาก server จึงไม่มี "ทุกเดือน" · แท็บอื่น: เดือนที่ใช้จ่าย กรองใน browser */}
        {showPaid ? (
          paidMonths.length > 0 && (
            <select
              value={shownPaidMonth}
              onChange={e => choosePaidMonth(e.target.value)}
              aria-label={isEn ? 'Month paid' : 'เดือนที่จ่าย'}
              className={selectCls(false)}
            >
              {paidMonths.map(m => (
                <option key={m.month} value={m.month}>{monthLabel(m.month)} ({m.count})</option>
              ))}
            </select>
          )
        ) : (
          months.length > 0 && (
            <select
              value={filters.month}
              onChange={e => setFilter({ month: e.target.value })}
              aria-label={isEn ? 'Expense month' : 'เดือนที่ใช้จ่าย'}
              className={selectCls(!!filters.month)}
            >
              <option value="">{isEn ? 'Any expense month' : 'ทุกเดือนที่ใช้จ่าย'}</option>
              {months.map(m => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </select>
          )
        )}

        <select
          value={filters.filed}
          onChange={e => setFilter({ filed: e.target.value as FiledFilter })}
          aria-label={isEn ? 'Filing status' : 'สถานะแฟ้ม'}
          className={selectCls(filters.filed !== 'all')}
        >
          <option value="all">{isEn ? 'Any filing status' : 'ทุกสถานะแฟ้ม'}</option>
          <option value="no">{isEn ? 'Not filed yet' : 'ยังไม่เข้าแฟ้ม'}</option>
          <option value="yes">{isEn ? 'Filed' : 'เข้าแฟ้มแล้ว'}</option>
          <option value="changed">{isEn ? 'Attachments changed after filing' : 'ไฟล์แนบเปลี่ยนหลังเข้าแฟ้ม'}</option>
        </select>

        <button
          onClick={() => setFilter({ incomplete: !filters.incomplete })}
          aria-pressed={filters.incomplete}
          className={`inline-flex items-center gap-1 ${pillCls} ${filters.incomplete ? 'bg-amber-500 text-white' : pillIdleCls}`}
        >
          <AlertCircle className="h-3 w-3" />
          {isEn ? 'Missing documents' : 'เอกสารไม่ครบ'}
        </button>

        {isAdmin && (
          <button
            type="button"
            onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
            aria-pressed={selecting}
            className={`inline-flex items-center gap-1 ${pillCls} ${selecting ? 'bg-emerald-600 text-white' : pillIdleCls}`}
          >
            <CheckSquare className="h-3 w-3" />
            {isEn ? 'Select multiple' : 'เลือกหลายใบ'}
          </button>
        )}

        {filtering && (
          <button
            onClick={clearFilters}
            className="px-3 py-1.5 text-xs rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
          >
            {isEn ? 'Clear filters' : 'ล้างตัวกรอง'}
          </button>
        )}
      </div>

      {filtering && (
        <p className="text-xs text-zinc-500 -mt-3" aria-live="polite">
          {isEn ? `${filtered.length} of ${shown.length} claims` : `พบ ${filtered.length} จาก ${shown.length} ใบ`}
          {!showPaid && filtered.length > 0 && (
            <>
              {' · '}{isEn ? 'Total' : 'ยอดรวม'}{' '}
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">฿{filteredAmount.toLocaleString()}</span>
            </>
          )}
        </p>
      )}

      {/* Claims List */}
      {!showPaid && error && (
        <div className="p-4 bg-red-50 dark:bg-red-950/20 rounded-xl text-red-600 text-sm">{error}</div>
      )}

      {!showPaid && (filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
          <Banknote className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">
            {filtering
              ? (isEn ? 'No claims match these filters' : 'ไม่พบใบเบิกที่ตรงกับตัวกรอง')
              : (locale === 'th' ? 'ยังไม่มีใบเบิก' : 'No claims yet')}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(claim => {
            const StatusIcon = statusIcons[claim.status] || Clock
            const statusColor = getClaimStatusColor(claim.status)
            const typeLabel = claim.claim_type === 'event'
              ? (isEn ? 'Event' : 'อีเวนต์')
              : claim.claim_type === 'advance'
                ? (isEn ? 'Advance' : 'ทดลองจ่าย')
                : claim.claim_type === 'petty_cash'
                  ? (isEn ? 'Petty Cash' : 'เงินสดย่อย')
                  : (isEn ? 'Other' : 'ค่าอื่นๆ')
            const checked = selected.has(claim.id)
            const rowCls = `flex items-center justify-between p-4 rounded-xl border hover:border-emerald-300 dark:hover:border-emerald-800 transition-colors group ${
              checked
                ? 'border-emerald-400 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/30'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
            }`
            const body = (
              <>
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  {/* ช่องติ๊กต้องเป็นตัวแรกใน <label> — คลิกตรงไหนของแถวก็ติ๊ก */}
                  {selectMode && (
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(claim.id)}
                      aria-label={isEn ? `Select ${claim.claim_number}` : `เลือก ${claim.claim_number}`}
                      className={rowCheckboxCls}
                    />
                  )}
                  {/* โหมดเลือกบนจอแคบ: ช่องติ๊กแทนไอคอนสถานะ (สถานะยังอยู่ในป้าย) — เหลือที่ให้หัวข้อ */}
                  <div
                    className={`${selectMode ? 'hidden sm:flex' : 'flex'} items-center justify-center h-10 w-10 rounded-lg shrink-0`}
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
                      <FiledBadge claim={claim} isEn={isEn} />
                      {isUnsettledAdvance(claim) && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500 text-white inline-flex items-center gap-1 animate-pulse">
                          <AlertCircle className="h-2.5 w-2.5" />
                          {isEn ? 'Settle required' : 'รออัพเดทค่าใช้จ่าย'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate mt-1">
                      {claim.title}
                    </p>
                    <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span className="inline-flex items-center gap-1">
                        {claim.claim_type === 'advance' && <Wallet className="h-2.5 w-2.5 text-amber-500" />}
                        {claim.claim_type === 'petty_cash' && <Coins className="h-2.5 w-2.5 text-orange-500" />}
                        {typeLabel}
                      </span>
                      <span className="text-zinc-300">•</span>
                      <FundingBadge claim={claim} isEn={isEn} size="xs" />
                      <span className="text-zinc-300">•</span>
                      <span>{claim.submitter?.full_name || '—'}</span>
                      <span className="text-zinc-300">•</span>
                      <span>{new Date(claim.expense_date).toLocaleDateString('th-TH')}</span>
                      {claim.job_event?.event_name && (
                        <>
                          <span className="text-zinc-300">•</span>
                          <span className="truncate">{claim.job_event.event_name}</span>
                        </>
                      )}
                    </p>
                    {/* Doc checklist — shown only when something is missing */}
                    <div className="mt-1.5">
                      <ChecklistBadges claim={claim} isEn={isEn} />
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 sm:gap-2 shrink-0 ml-2 sm:ml-4">
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
                      onClick={(e) => handleCancel(claim, e)}
                      disabled={cancellingId === claim.id}
                      title={isEn ? 'Cancel claim' : 'ยกเลิกใบเบิก'}
                      className="p-1.5 rounded-lg text-zinc-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors disabled:opacity-40"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={e => bundleOne(claim, e)}
                    aria-label={bundleLabel}
                    title={bundleLabel}
                    className={rowBundleBtnCls}
                  >
                    <FileStack className="h-4 w-4" />
                  </button>
                </div>
              </>
            )
            // โหมดเลือก: ทั้งแถวเป็น <label> ของช่องติ๊ก (คลิกแถว = ติ๊ก ไม่เปิดหน้าใบเบิก)
            return selectMode ? (
              <label key={claim.id} className={`${rowCls} cursor-pointer`}>
                {body}
              </label>
            ) : (
              <Link key={claim.id} href={`/finance/${claim.id}`} className={rowCls}>
                {body}
              </Link>
            )
          })}
        </div>
      ))}

      {/* ชำระเงินแล้ว — Admin only, shown when paid tab active */}
      {isAdmin && showPaid && (
        <div
          className={`space-y-4 transition-opacity ${loadingMonth ? 'opacity-60' : ''}`}
          aria-busy={loadingMonth}
        >
          {/* Section Header */}
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center h-9 w-9 rounded-xl bg-teal-100 dark:bg-teal-900/30 shrink-0">
              <CheckCircle2 className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                {isEn ? 'Paid Claims' : 'ชำระเงินแล้ว'}
              </h2>
              <p className="text-xs text-zinc-400">
                {paidClaims.length} {isEn ? 'claims this month' : 'รายการในเดือนนี้'}
              </p>
            </div>
          </div>

          {/* Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="bg-teal-50 dark:bg-teal-950/20 rounded-xl border border-teal-100 dark:border-teal-900/30 p-3">
              <p className="text-[10px] text-teal-600 dark:text-teal-400 font-medium mb-0.5">{isEn ? 'Month total' : 'ยอดรวมเดือนนี้'}</p>
              <p className="text-lg font-bold text-teal-700 dark:text-teal-300">฿{fmtDec(totalAllPaidNet)}</p>
              <p className="text-[10px] text-zinc-400">{paidClaims.length} {isEn ? 'claims' : 'รายการ'}</p>
            </div>
            {filtering ? (
              <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3">
                <p className="text-[10px] text-zinc-500 font-medium mb-0.5">{isEn ? 'Filtered Total' : 'ยอดรวม (กรองแล้ว)'}</p>
                <p className="text-lg font-bold text-zinc-800 dark:text-zinc-200">฿{fmtDec(totalPaidNet)}</p>
                <p className="text-[10px] text-zinc-400">{filtered.length} {isEn ? 'claims' : 'รายการ'}</p>
              </div>
            ) : null}
            {filtering ? (
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

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-zinc-400">
              <CheckCircle2 className="h-10 w-10 mb-2 opacity-30" />
              <p className="text-sm">
                {filtering
                  ? (isEn ? 'No claims match these filters' : 'ไม่พบใบเบิกที่ตรงกับตัวกรอง')
                  : (isEn ? 'No paid claims yet' : 'ยังไม่มีใบเบิกที่ชำระแล้ว')}
              </p>
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
                  {filtered.map(c => {
                    const { netPayable } = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
                    const checked = selected.has(c.id)
                    // โหมดเลือก: แถวเป็น <label> ของช่องติ๊ก — ลิงก์เปิดใบเบิกยังกดได้ตามปกติ
                    const Row = selectMode ? 'label' : 'div'
                    return (
                      <Row
                        key={c.id}
                        className={`grid grid-cols-12 gap-2 px-4 py-2.5 items-center text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                          selectMode ? 'cursor-pointer' : ''
                        } ${checked ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''}`}
                      >
                        <div className="col-span-2 min-w-0">
                          <div className="flex items-center gap-2">
                            {selectMode && (
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelected(c.id)}
                                aria-label={isEn ? `Select ${c.claim_number}` : `เลือก ${c.claim_number}`}
                                className={rowCheckboxCls}
                              />
                            )}
                            <span className="text-xs font-mono text-zinc-500 truncate">{c.claim_number}</span>
                          </div>
                          {filedState(c) !== 'none' && (
                            <div className="mt-1"><FiledBadge claim={c} isEn={isEn} /></div>
                          )}
                        </div>
                        <div className="col-span-2 truncate font-medium text-zinc-700 dark:text-zinc-300">{c.submitter?.full_name || '—'}</div>
                        <div className="col-span-3 truncate text-zinc-900 dark:text-zinc-100">{c.title}</div>
                        <div className="col-span-1 text-xs text-zinc-500">{getCategoryLabel(c.category, locale, categories)}</div>
                        <div className="col-span-1 text-right font-mono font-bold text-teal-600 dark:text-teal-400">฿{fmtDec(netPayable)}</div>
                        <div className="col-span-2 text-xs text-zinc-500">
                          {c.paid_at
                            ? new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '—'}
                        </div>
                        <div className="col-span-1 flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={e => bundleOne(c, e)}
                            aria-label={bundleLabel}
                            title={bundleLabel}
                            className={rowBundleBtnCls}
                          >
                            <FileStack className="h-3.5 w-3.5" />
                          </button>
                          <Link href={`/finance/${c.id}`} className="p-1.5 text-zinc-400 hover:text-teal-500 transition-colors">
                            <ExternalLink className="h-3.5 w-3.5 inline" />
                          </Link>
                        </div>
                      </Row>
                    )
                  })}
                </div>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
                {filtered.map(c => {
                  const { netPayable } = calcTax(c.amount || 0, c.vat_mode || 'none', c.withholding_tax_rate || 0)
                  const checked = selected.has(c.id)
                  const cardCls = `block p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                    checked ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : ''
                  }`
                  const card = (
                    <>
                      <div className="flex items-start gap-2">
                        {selectMode && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelected(c.id)}
                            aria-label={isEn ? `Select ${c.claim_number}` : `เลือก ${c.claim_number}`}
                            className={`${rowCheckboxCls} mt-0.5`}
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <p className="text-[10px] font-mono text-zinc-400">{c.claim_number}</p>
                            <FiledBadge claim={c} isEn={isEn} />
                          </div>
                          <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">{c.title}</p>
                          <p className="text-xs text-zinc-500 mt-0.5 truncate">{c.submitter?.full_name || '—'}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-teal-600 dark:text-teal-400">฿{fmtDec(netPayable)}</p>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-teal-50 text-teal-600 dark:bg-teal-950/30 dark:text-teal-400 mt-0.5">
                            <CheckCircle2 className="h-2.5 w-2.5" />
                            {isEn ? 'Paid' : 'ชำระแล้ว'}
                          </span>
                        </div>
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <p className="text-[10px] text-zinc-400">
                          {c.paid_at
                            ? new Date(c.paid_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : ''}
                        </p>
                        <button
                          type="button"
                          onClick={e => bundleOne(c, e)}
                          aria-label={bundleLabel}
                          title={bundleLabel}
                          className={`${rowBundleBtnCls} -my-1`}
                        >
                          <FileStack className="h-4 w-4" />
                        </button>
                      </div>
                    </>
                  )
                  return selectMode ? (
                    <label key={c.id} className={`${cardCls} cursor-pointer`}>{card}</label>
                  ) : (
                    <Link key={c.id} href={`/finance/${c.id}`} className={cardCls}>{card}</Link>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* แถบเลือกหลายใบ — มือถือเต็มความกว้างติดขอบล่าง (เว้น safe area) · จอใหญ่ลอยมุมขวาล่าง ไม่ทับแถบเมนูซ้าย */}
      {selectMode && (
        <div
          role="region"
          aria-label={isEn ? 'Selected claims' : 'ใบเบิกที่เลือก'}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] pb-[env(safe-area-inset-bottom)] md:inset-x-auto md:right-6 md:bottom-6 md:max-w-[calc(100vw-244px-3rem)] md:rounded-2xl md:border md:pb-0"
        >
          <div className="flex flex-wrap items-center gap-2 px-4 py-3">
            <p className="mr-auto text-sm font-semibold text-zinc-900 dark:text-zinc-100" aria-live="polite">
              {isEn ? `${selectedClaims.length} selected` : `เลือกแล้ว ${selectedClaims.length} ใบ`}
            </p>
            <button
              type="button"
              onClick={() => setSelected(new Set(selectAllIds))}
              disabled={selectAllIds.length === 0}
              className={`${pillCls} ${pillIdleCls} disabled:opacity-40`}
            >
              {isEn ? `Select all filtered (${selectAllIds.length})` : `เลือกทุกใบที่กรองอยู่ (${selectAllIds.length})`}
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={selectedClaims.length === 0}
              className={`${pillCls} ${pillIdleCls} disabled:opacity-40`}
            >
              {isEn ? 'Clear selection' : 'ล้างที่เลือก'}
            </button>
            <button
              type="button"
              onClick={() => setBundleFor(selectedClaims.map(toBundleRef))}
              disabled={selectedClaims.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <FileStack className="h-3.5 w-3.5" />
              {isEn ? 'Bundle documents' : 'จับชุดเอกสาร'}
            </button>
            <button
              type="button"
              onClick={exitSelecting}
              className="px-3 py-1.5 text-xs rounded-lg text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 transition-colors"
            >
              {isEn ? 'Exit selection' : 'ออกจากโหมดเลือก'}
            </button>
            {overLimit && (
              <p className="basis-full text-[11px] text-amber-700 dark:text-amber-400">
                {isEn
                  ? `Up to ${MAX_BUNDLE_SELECTION} claims at a time`
                  : `เลือกได้ครั้งละไม่เกิน ${MAX_BUNDLE_SELECTION} ใบ`}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
