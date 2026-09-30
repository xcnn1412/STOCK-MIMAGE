'use client'

// ============================================================================
// คลังเก็บใบเบิกที่จ่ายแล้ว (/finance/archive) — server ส่งทีละ 50 ใบ (archive-data.ts)
// ตัวกรองทุกตัวอยู่ใน URL (คีย์ = ชื่อช่องของ ArchiveQuery) ส่งลิงก์ต่อให้คนอื่นได้ · เปลี่ยนตัวกรอง = ขอหน้าใหม่จาก server
// ระหว่างรอ กล่องที่เพิ่งเลือกแสดงค่าใหม่ทันที (useOptimistic) และรายการจางลง (aria-busy)
// ยอดรวมหัวหน้า = ทุกใบที่ผ่านตัวกรอง ไม่ใช่เฉพาะหน้านี้ (server คิดด้วย money.calcTax)
// ============================================================================

import { useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Archive, ExternalLink, CheckCircle2, Filter, CalendarDays, X, Tag, RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import { calcTax } from '@/lib/finance/money'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getClaimStatusLabel, getClaimStatusColor } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'
import { FundingBadge } from '../doc-badges'
import type { ArchivePageData, ArchiveQuery } from '../view-data'

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CLAIM_TYPES = ['event', 'other', 'advance', 'petty_cash'] as const
const AMOUNT_RANGES = ['0', '1-1000', '1001-5000', '5001-10000', '10001+'] as const
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export const EMPTY_ARCHIVE_QUERY: ArchiveQuery = {
  page: 1, q: '', by: '', type: '', cat: '', amount: '', event: '', month: '', efrom: '', eto: '', pfrom: '', pto: '',
}

/** ตัวกรองจาก URL — ค่าที่ไม่รู้จักถูกทิ้ง (server ตรวจซ้ำอีกชั้นใน archive-data.ts) */
export function archiveQueryFromParams(params: { get(name: string): string | null }): ArchiveQuery {
  const text = (key: string) => (params.get(key) || '').slice(0, 100)
  const date = (key: string) => (DATE_RE.test(text(key)) ? text(key) : '')
  const type = text('type')
  const amount = text('amount')
  const page = Math.floor(Number(params.get('page')))
  return {
    page: Number.isFinite(page) && page >= 1 ? page : 1,
    q: text('q'),
    by: text('by').slice(0, 64),
    type: (CLAIM_TYPES as readonly string[]).includes(type) ? (type as ArchiveQuery['type']) : '',
    cat: text('cat').slice(0, 64),
    amount: (AMOUNT_RANGES as readonly string[]).includes(amount) ? (amount as ArchiveQuery['amount']) : '',
    event: text('event').slice(0, 64),
    month: MONTH_RE.test(text('month')) ? text('month') : '',
    efrom: date('efrom'),
    eto: date('eto'),
    pfrom: date('pfrom'),
    pto: date('pto'),
  }
}

/** ลิงก์ของคลังเก็บพร้อมตัวกรอง — ใส่เฉพาะค่าที่ไม่ว่าง · หน้า 1 ไม่ใส่ page */
export function archiveHref(q: ArchiveQuery): string {
  const p = new URLSearchParams()
  for (const key of ['q', 'by', 'type', 'cat', 'amount', 'event', 'month', 'efrom', 'eto', 'pfrom', 'pto'] as const) {
    const value = q[key].trim()
    if (value) p.set(key, value)
  }
  if (q.page > 1) p.set('page', String(q.page))
  const qs = p.toString()
  return qs ? `/finance/archive?${qs}` : '/finance/archive'
}

/** มีตัวกรองใดบ้าง (ไม่นับหน้า) */
const hasArchiveFilters = (q: ArchiveQuery) =>
  !!(q.q || q.by || q.type || q.cat || q.amount || q.event || q.month || q.efrom || q.eto || q.pfrom || q.pto)

type Props = ArchivePageData & {
  /** หมวดค่าใช้จ่ายจากหน้าตั้งค่า (กล่องเลือกหมวด) */
  categories?: FinanceCategory[]
}

export default function ArchiveList({ rows, total, page, pages, netTotal, submitters, events, categories = [] }: Props) {
  const { locale } = useLocale()
  const isEn = locale === 'en'
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, startTransition] = useTransition()
  const [showFilters, setShowFilters] = useState(false)

  // ช่องค้นหาไม่เก็บค่าใน state (ค่าอยู่ใน URL) — ref ไว้ล้างช่อง/ตามค่าใน URL · timer ของการรอพิมพ์
  const qInput = useRef<HTMLInputElement>(null)
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ตัวกรองมาจาก URL เท่านั้น — ระหว่างรอหน้าใหม่ แสดงค่าที่เพิ่งเลือก (useOptimistic)
  const current = archiveQueryFromParams(searchParams)
  const [shown, showQuery] = useOptimistic(current)
  const navigate = (next: ArchiveQuery, scroll: boolean) =>
    startTransition(() => {
      showQuery(next)
      router.replace(archiveHref(next), { scroll })
    })
  /** เปลี่ยนตัวกรอง = กลับไปหน้า 1 */
  const setFilter = (patch: Partial<ArchiveQuery>) => navigate({ ...shown, ...patch, page: 1 }, false)
  const goToPage = (n: number) => navigate({ ...shown, page: Math.min(Math.max(1, n), Math.max(1, pages)) }, true)
  const clearFilters = () => {
    if (qTimer.current) clearTimeout(qTimer.current)
    if (qInput.current) qInput.current.value = ''
    navigate(EMPTY_ARCHIVE_QUERY, false)
  }

  // ช่องค้นหา: พิมพ์แล้วรอ 300 ms ค่อยขอหน้าใหม่ (ไม่ขอทุกตัวอักษร) · Enter = ค้นหาทันที
  const applyQ = (value: string) => {
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = null
    if (value.trim() !== shown.q.trim()) setFilter({ q: value.trim() })
  }
  const scheduleQ = (value: string) => {
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => applyQ(value), 300)
  }
  useEffect(() => () => { if (qTimer.current) clearTimeout(qTimer.current) }, [])
  // ลิงก์/ปุ่มย้อนกลับเปลี่ยน q ใน URL → ช่องค้นหาตามค่าใหม่ (ไม่ยุ่งตอนผู้ใช้กำลังพิมพ์อยู่ในช่อง)
  useEffect(() => {
    const el = qInput.current
    if (el && document.activeElement !== el && el.value !== current.q) el.value = current.q
  }, [current.q])

  const filtering = hasArchiveFilters(shown)
  const submitterOptions = [...submitters].sort((a, b) => a.name.localeCompare(b.name))
  const eventOptions = [...events].sort((a, b) => a.name.localeCompare(b.name))
  // หมวดที่เลือกอยู่แต่ไม่อยู่ในตั้งค่าแล้ว (ลิงก์เก่า) ยังเห็นในกล่อง
  const categoryOptions = categories.some(c => c.value === shown.cat) || !shown.cat
    ? categories.map(c => ({ value: c.value, label: isEn ? c.label : c.label_th }))
    : [...categories.map(c => ({ value: c.value, label: isEn ? c.label : c.label_th })), { value: shown.cat, label: shown.cat }]
  const eventFilterVisible = shown.type !== 'other' && shown.type !== 'advance' && shown.type !== 'petty_cash' && eventOptions.length > 0

  const selectCls = 'min-h-10 px-3 py-2 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500'
  const inputDateCls = 'min-h-10 px-2.5 py-1.5 border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 text-sm outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-500 w-full min-w-0'
  const labelCls = 'block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1.5'

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
            <p className="text-xs text-zinc-600 dark:text-zinc-400" aria-live="polite">
              {isEn ? `${total.toLocaleString('en-US')} paid claims` : `${total.toLocaleString('en-US')} รายการ`}
              {` • ${isEn ? 'Total' : 'รวม'} ฿${fmtDec(netTotal)}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Filter Toggle */}
          <Button
            type="button"
            variant="outline"
            size="lg"
            aria-expanded={showFilters}
            onClick={() => setShowFilters(!showFilters)}
            className={`shrink-0 ${showFilters || filtering ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-700 dark:bg-teal-950/30 dark:text-teal-300' : ''}`}
          >
            <Filter aria-hidden="true" />
            {isEn ? 'Filter' : 'ตัวกรอง'}
            {filtering && (
              <>
                <span aria-hidden="true" className="inline-flex items-center justify-center h-4 min-w-4 px-1 rounded-full bg-teal-600 text-white text-xs font-bold">
                  !
                </span>
                <span className="sr-only">{isEn ? '(filters on)' : '(กำลังกรอง)'}</span>
              </>
            )}
          </Button>

          {/* Search — ค้นหาเลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน ในคลังเก็บ (server ค้นทุกหน้า) */}
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" aria-hidden="true" />
            <Input
              ref={qInput}
              type="search"
              defaultValue={current.q}
              maxLength={100}
              onChange={e => scheduleQ(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); applyQ(e.currentTarget.value) } }}
              aria-label={isEn ? 'Search the archive' : 'ค้นหาในคลังเก็บ'}
              placeholder={isEn ? 'Claim no., title, name, event' : 'เลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน'}
              className="h-10 pl-9"
            />
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 space-y-4 animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
              <Filter className="h-4 w-4 text-teal-500" aria-hidden="true" />
              {isEn ? 'Filters' : 'ตัวกรอง'}
            </h3>
            {filtering && (
              <Button type="button" variant="ghost" size="lg" onClick={clearFilters}>
                <X aria-hidden="true" />
                {isEn ? 'Clear filters' : 'ล้างตัวกรอง'}
              </Button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Submitter Filter */}
            <div>
              <label htmlFor="archive-by" className={labelCls}>
                {isEn ? 'Submitter' : 'ผู้เบิก'}
              </label>
              <select id="archive-by" value={shown.by} onChange={e => setFilter({ by: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">{isEn ? 'All submitters' : 'ทั้งหมด'}</option>
                {submitterOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Claim Type Filter — ประเภทที่ไม่มีงานล้างตัวกรองงานไปด้วย (กล่องงานถูกซ่อน) */}
            <div>
              <label htmlFor="archive-type" className={`${labelCls} flex items-center gap-1`}>
                <Tag className="h-3 w-3" aria-hidden="true" />
                {isEn ? 'Claim Type' : 'ประเภทการเบิก'}
              </label>
              <select
                id="archive-type"
                value={shown.type}
                onChange={e => {
                  const type = e.target.value as ArchiveQuery['type']
                  setFilter(type === 'other' || type === 'advance' || type === 'petty_cash' ? { type, event: '' } : { type })
                }}
                className={`${selectCls} w-full`}
              >
                <option value="">{isEn ? 'All types' : 'ทั้งหมด'}</option>
                <option value="event">{isEn ? 'Event' : 'เบิกงานอีเวนต์'}</option>
                <option value="advance">{isEn ? 'Advance' : 'เบิกทดลองจ่าย'}</option>
                <option value="petty_cash">{isEn ? 'Petty Cash' : 'เบิกเงินสดย่อย'}</option>
                <option value="other">{isEn ? 'Other' : 'เบิกอื่นๆ'}</option>
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label htmlFor="archive-cat" className={labelCls}>
                {isEn ? 'Category' : 'หมวดค่าใช้จ่าย'}
              </label>
              <select id="archive-cat" value={shown.cat} onChange={e => setFilter({ cat: e.target.value })} className={`${selectCls} w-full`}>
                <option value="">{isEn ? 'All categories' : 'ทั้งหมด'}</option>
                {categoryOptions.map(cat => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
            </div>

            {/* Amount Range Filter */}
            <div>
              <label htmlFor="archive-amount" className={labelCls}>
                {isEn ? 'Amount Range' : 'ช่วงยอดเงิน'}
              </label>
              <select
                id="archive-amount"
                value={shown.amount}
                onChange={e => setFilter({ amount: e.target.value as ArchiveQuery['amount'] })}
                className={`${selectCls} w-full`}
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
            {eventFilterVisible && (
              <div>
                <label htmlFor="archive-event" className={labelCls}>
                  {isEn ? 'Event' : 'อีเวนต์'}
                </label>
                <select id="archive-event" value={shown.event} onChange={e => setFilter({ event: e.target.value })} className={`${selectCls} w-full`}>
                  <option value="">{isEn ? 'All events' : 'ทั้งหมด'}</option>
                  {eventOptions.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Month/Year Picker — เลือกเดือนแล้วล้างช่วงวันที่เบิก (ใช้ได้ทีละแบบ) */}
            <div>
              <label htmlFor="archive-month" className={labelCls}>
                {isEn ? 'Month/Year' : 'เดือน/ปี'}
              </label>
              <input
                id="archive-month"
                type="month"
                value={shown.month}
                onChange={e => setFilter(e.target.value ? { month: e.target.value, efrom: '', eto: '' } : { month: '' })}
                className={`${selectCls} w-full ${!shown.month ? 'text-zinc-500' : ''}`}
              />
            </div>

            {/* Expense Date Filter (วันที่เบิก) */}
            <fieldset className="min-w-0">
              <legend className={`${labelCls} flex items-center gap-1`}>
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {isEn ? 'Expense Date' : 'วันที่เบิก'}
              </legend>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={shown.efrom}
                  aria-label={isEn ? 'Expense date from' : 'วันที่เบิก ตั้งแต่'}
                  onChange={e => setFilter(e.target.value ? { efrom: e.target.value, month: '' } : { efrom: '' })}
                  className={inputDateCls}
                />
                <span className="text-xs text-zinc-500 shrink-0" aria-hidden="true">—</span>
                <input
                  type="date"
                  value={shown.eto}
                  aria-label={isEn ? 'Expense date to' : 'วันที่เบิก ถึง'}
                  onChange={e => setFilter(e.target.value ? { eto: e.target.value, month: '' } : { eto: '' })}
                  className={inputDateCls}
                />
              </div>
            </fieldset>

            {/* Paid Date Filter (วันที่จ่าย — ตามเวลาไทย) */}
            <fieldset className="min-w-0">
              <legend className={`${labelCls} flex items-center gap-1`}>
                <CalendarDays className="h-3 w-3" aria-hidden="true" />
                {isEn ? 'Paid Date' : 'วันที่จ่าย'}
              </legend>
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={shown.pfrom}
                  aria-label={isEn ? 'Paid date from' : 'วันที่จ่าย ตั้งแต่'}
                  onChange={e => setFilter({ pfrom: e.target.value })}
                  className={inputDateCls}
                />
                <span className="text-xs text-zinc-500 shrink-0" aria-hidden="true">—</span>
                <input
                  type="date"
                  value={shown.pto}
                  aria-label={isEn ? 'Paid date to' : 'วันที่จ่าย ถึง'}
                  onChange={e => setFilter({ pto: e.target.value })}
                  className={inputDateCls}
                />
              </div>
            </fieldset>
          </div>
        </div>
      )}

      {/* Content — จางลงระหว่างรอหน้าใหม่ */}
      <div aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? 'opacity-60' : ''}`}>
        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 text-center py-16 text-zinc-600 dark:text-zinc-400 text-sm">
            <p>
              {filtering
                ? (isEn ? 'No paid claims match these filters' : 'ไม่พบใบเบิกที่ตรงกับตัวกรอง')
                : (isEn ? 'No paid claims in archive' : 'ยังไม่มีใบเบิกในคลังเก็บ')}
            </p>
            {filtering && (
              <Button type="button" variant="outline" size="lg" onClick={clearFilters}>
                <X aria-hidden="true" />
                {isEn ? 'Clear filters' : 'ล้างตัวกรอง'}
              </Button>
            )}
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
                {rows.map(c => {
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
                        {c.claim_type === 'event' && c.job_event?.linked_lead_id ? (
                          <Link
                            href={`/crm/${c.job_event.linked_lead_id}`}
                            onClick={e => e.stopPropagation()}
                            title={c.job_event.event_name || ''}
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
                                : c.claim_type === 'petty_cash'
                                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'
                                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {c.claim_type === 'event'
                              ? (isEn ? 'Event' : 'อีเวนต์')
                              : c.claim_type === 'advance'
                                ? (isEn ? 'Advance' : 'ทดลองจ่าย')
                                : c.claim_type === 'petty_cash'
                                  ? (isEn ? 'Petty Cash' : 'เงินสดย่อย')
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
                        <Link href={`/finance/${c.id}`} className="text-zinc-400 hover:text-teal-500 transition-colors" aria-label={isEn ? `Open ${c.claim_number}` : `เปิด ${c.claim_number}`}>
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
              {rows.map(c => {
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

        {/* Pager — ทีละ 50 ใบ (ARCHIVE_PAGE_SIZE) · ถัดไป/ก่อนหน้า เก็บตัวกรองเดิมไว้ใน URL */}
        {pages > 1 && (
          <nav aria-label={isEn ? 'Archive pages' : 'หน้าของคลังเก็บ'} className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              aria-label={isEn ? 'Previous page' : 'หน้าก่อนหน้า'}
            >
              <ChevronLeft aria-hidden="true" />
              {isEn ? 'Previous' : 'ก่อนหน้า'}
            </Button>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 tabular-nums" aria-live="polite">
              {isEn ? `Page ${page} of ${pages}` : `หน้า ${page} จาก ${pages}`}
            </p>
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={page >= pages || loading}
              onClick={() => goToPage(page + 1)}
              aria-label={isEn ? 'Next page' : 'หน้าถัดไป'}
            >
              {isEn ? 'Next' : 'ถัดไป'}
              <ChevronRight aria-hidden="true" />
            </Button>
          </nav>
        )}
      </div>
    </div>
  )
}
