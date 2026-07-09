'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ListChecks, Filter, Search, FileSpreadsheet, FileDown, ExternalLink,
  CheckCircle2, AlertCircle, Building2, User as UserIcon, Wallet, Coins, Receipt,
  Hash, RefreshCw, FileText, ChevronDown, ChevronUp, Calendar
} from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'
import {
  CLAIM_STATUSES,
  FUNDING_SOURCES,
  getCategoryLabel,
  getClaimStatusLabel,
  getClaimStatusColor,
  getClaimChecklist,
  getFundingSourceLabel,
  getFundingSourceColor,
} from '../../costs/types'
import type { ExpenseClaim } from '../../costs/types'
import type { FinanceCategory } from '../settings-actions'

// ============================================================================
// Helpers
// ============================================================================

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

const fmtDec = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

type RangePreset = 'day' | 'week' | 'month' | 'year' | 'custom' | 'all'

/** Returns [from, to] (inclusive) date strings YYYY-MM-DD for the chosen preset. */
function rangeFromPreset(preset: RangePreset): { from: string; to: string } | null {
  if (preset === 'custom' || preset === 'all') return null
  const now = new Date()
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  if (preset === 'day') {
    const s = fmt(now)
    return { from: s, to: s }
  }
  if (preset === 'week') {
    const start = new Date(now)
    start.setDate(now.getDate() - 6) // last 7 days inclusive
    return { from: fmt(start), to: fmt(now) }
  }
  if (preset === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    return { from: fmt(start), to: fmt(end) }
  }
  // year
  const start = new Date(now.getFullYear(), 0, 1)
  const end = new Date(now.getFullYear(), 11, 31)
  return { from: fmt(start), to: fmt(end) }
}

// ============================================================================
// Dashboard
// ============================================================================

export default function OverviewDashboard({
  claims,
  categories,
}: {
  claims: ExpenseClaim[]
  categories: FinanceCategory[]
}) {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  // Filter state
  const [rangePreset, setRangePreset] = useState<RangePreset>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set())
  const [typeFilter, setTypeFilter] = useState<'all' | 'event' | 'other' | 'advance' | 'petty_cash'>('all')
  const [fundingFilter, setFundingFilter] = useState<'all' | 'company' | 'personal'>('all')
  const [categoryFilter, setCategoryFilter] = useState('')
  const [search, setSearch] = useState('')
  const [completionFilter, setCompletionFilter] = useState<'all' | 'complete' | 'incomplete'>('all')
  const [showFilters, setShowFilters] = useState(true)

  // Compute date window
  const dateWindow = useMemo(() => {
    if (rangePreset === 'custom') {
      if (customFrom || customTo) {
        return {
          from: customFrom || '0000-01-01',
          to: customTo || '9999-12-31',
        }
      }
      return null
    }
    return rangeFromPreset(rangePreset)
  }, [rangePreset, customFrom, customTo])

  // Filter claims
  const filtered = useMemo(() => {
    let list = claims

    // Date filter — using expense_date (falls back to created_at if missing)
    if (dateWindow) {
      list = list.filter(c => {
        const d = (c.expense_date || c.created_at || '').slice(0, 10)
        return d >= dateWindow.from && d <= dateWindow.to
      })
    }

    if (statusFilter.size > 0) {
      list = list.filter(c => statusFilter.has(c.status))
    }
    if (typeFilter !== 'all') list = list.filter(c => c.claim_type === typeFilter)
    if (fundingFilter !== 'all') {
      list = list.filter(c => (c.funding_source || 'company') === fundingFilter)
    }
    if (categoryFilter) list = list.filter(c => c.category === categoryFilter)

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(c => {
        const name = c.submitter?.full_name?.toLowerCase() || ''
        const title = c.title?.toLowerCase() || ''
        const num = c.claim_number?.toLowerCase() || ''
        const taxNums = (c.tax_invoice_numbers || []).join(' ').toLowerCase()
        return (
          name.includes(q) ||
          title.includes(q) ||
          num.includes(q) ||
          taxNums.includes(q)
        )
      })
    }

    if (completionFilter !== 'all') {
      list = list.filter(c => {
        const ck = getClaimChecklist(c)
        return completionFilter === 'complete' ? ck.isComplete : !ck.isComplete
      })
    }

    return list
  }, [claims, dateWindow, statusFilter, typeFilter, fundingFilter, categoryFilter, search, completionFilter])

  // Summary cards
  const summary = useMemo(() => {
    let totalGross = 0
    let totalNet = 0
    let totalWht = 0
    let completeCount = 0
    let incompleteCount = 0
    let pendingTaxInvoice = 0
    let pendingRefund = 0
    let personalCount = 0

    filtered.forEach(c => {
      const amt = c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      totalGross += amt
      totalNet += tax.netPayable
      totalWht += tax.whtAmount
      const ck = getClaimChecklist(c)
      if (ck.isComplete) completeCount += 1
      else incompleteCount += 1
      if (ck.taxInvoiceRequired && !ck.hasTaxInvoice) pendingTaxInvoice += 1
      if (ck.refundRequired && (!ck.hasRefundSlip || !ck.refundConfirmed)) pendingRefund += 1
      if ((c.funding_source || 'company') === 'personal') personalCount += 1
    })

    return {
      total: filtered.length,
      totalGross,
      totalNet,
      totalWht,
      completeCount,
      incompleteCount,
      pendingTaxInvoice,
      pendingRefund,
      personalCount,
    }
  }, [filtered])

  const toggleStatus = (s: string) => {
    setStatusFilter(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const clearFilters = () => {
    setStatusFilter(new Set())
    setTypeFilter('all')
    setFundingFilter('all')
    setCategoryFilter('')
    setSearch('')
    setCompletionFilter('all')
  }

  const hasActiveFilters =
    statusFilter.size > 0 ||
    typeFilter !== 'all' ||
    fundingFilter !== 'all' ||
    !!categoryFilter ||
    !!search.trim() ||
    completionFilter !== 'all'

  // ========== Excel Export ==========
  const downloadXLSX = async () => {
    const XLSX = (await import('xlsx')).default || await import('xlsx')
    const wb = XLSX.utils.book_new()

    const rows = filtered.map(c => {
      const amt = c.amount || 0
      const tax = calcTax(amt, c.vat_mode || 'none', c.withholding_tax_rate || 0)
      const ck = getClaimChecklist(c)
      return {
        'เลขที่ใบเบิก': c.claim_number,
        'วันที่': c.expense_date || c.created_at?.slice(0, 10) || '',
        'ผู้เบิก': c.submitter?.full_name || '',
        'ทีมงาน & หน้าที่': (c.staff_roles || []).map(r => r.label).join(', '),
        'หัวข้อ': c.title,
        'หมวด': getCategoryLabel(c.category, 'th', categories),
        'ประเภท':
          c.claim_type === 'event'
            ? 'อีเวนต์'
            : c.claim_type === 'advance'
              ? 'ทดลองจ่าย'
              : c.claim_type === 'petty_cash'
                ? 'เงินสดย่อย'
                : 'ค่าอื่นๆ',
        'แหล่งเงิน': getFundingSourceLabel(c.funding_source, 'th'),
        'อีเวนต์': (c.job_event as any)?.event_name || '',
        'ยอดเงิน': amt,
        'หัก ณ ที่จ่าย': Math.round(tax.whtAmount * 100) / 100,
        'จ่ายจริง': Math.round(tax.netPayable * 100) / 100,
        'สถานะ': getClaimStatusLabel(c.status, 'th'),
        'ใบเสร็จ': ck.hasReceipt ? '✓' : '✗',
        'ใบกำกับภาษี': ck.taxInvoiceRequired
          ? (ck.hasTaxInvoice ? '✓' : '✗')
          : '—',
        'เลขที่ใบกำกับภาษี': (c.tax_invoice_numbers || []).join(' / '),
        'คืนเงินบริษัท': ck.refundRequired
          ? (ck.refundConfirmed ? '✓ ยืนยันแล้ว' : ck.hasRefundSlip ? '⏳ รอยืนยัน' : '✗ ยังไม่คืน')
          : '—',
        'พร้อมส่งบัญชี': ck.isComplete ? '✓' : '✗',
        'หมายเหตุ': c.notes || '',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    ws['!cols'] = [
      { wch: 16 }, { wch: 11 }, { wch: 22 }, { wch: 24 }, { wch: 30 }, { wch: 14 },
      { wch: 12 }, { wch: 14 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
      { wch: 12 }, { wch: 16 }, { wch: 9 }, { wch: 12 }, { wch: 18 },
      { wch: 18 }, { wch: 14 }, { wch: 30 },
    ]
    XLSX.utils.book_append_sheet(wb, ws, 'รายงานตรวจสอบ')

    const today = new Date().toISOString().slice(0, 10)
    XLSX.writeFile(wb, `finance-audit-${today}.xlsx`)
  }

  // ========== PDF Export (printable HTML window) ==========
  const downloadPDF = () => {
    const dateLabel = dateWindow
      ? `${dateWindow.from} → ${dateWindow.to}`
      : (isEn ? 'All time' : 'ทั้งหมด')

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${isEn ? 'Audit Report' : 'รายงานตรวจสอบใบเบิก'}</title>
    <style>
      body { font-family: 'Sarabun','Tahoma',sans-serif; font-size: 10px; padding: 20px; }
      h1 { font-size: 16px; margin-bottom: 4px; }
      h2 { font-size: 11px; color: #666; margin: 0 0 12px; font-weight: normal; }
      .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 12px 0 16px; }
      .summary div { padding: 6px 8px; background: #f7f7f7; border-radius: 4px; font-size: 10px; }
      .summary b { font-size: 12px; display: block; margin-top: 2px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top; }
      th { background: #f5f5f5; font-size: 9px; font-weight: bold; }
      td { font-size: 9px; }
      .num { text-align: right; font-family: monospace; }
      .ok { color: #16a34a; font-weight: bold; }
      .bad { color: #dc2626; font-weight: bold; }
      .muted { color: #999; }
      .row-incomplete { background: #fef3c7; }
      @media print { body { padding: 0; } }
    </style></head><body>`

    html += `<h1>${isEn ? 'Expense Claim Audit Report' : 'รายงานตรวจสอบใบเบิกค่าใช้จ่าย'}</h1>`
    html += `<h2>${isEn ? 'Period' : 'ช่วงวันที่'}: ${dateLabel} • ${isEn ? 'Generated' : 'ออกรายงาน'}: ${new Date().toLocaleString('th-TH')}</h2>`

    html += `<div class="summary">
      <div>${isEn ? 'Total claims' : 'จำนวนใบเบิก'}<b>${summary.total}</b></div>
      <div>${isEn ? 'Ready for accounting' : 'พร้อมส่งบัญชี'}<b class="ok">${summary.completeCount}</b></div>
      <div>${isEn ? 'Incomplete' : 'ยังไม่ครบ'}<b class="bad">${summary.incompleteCount}</b></div>
      <div>${isEn ? 'Total amount' : 'ยอดรวม'}<b>฿${fmtDec(summary.totalGross)}</b></div>
      <div>${isEn ? 'Total WHT' : 'หัก ณ ที่จ่ายรวม'}<b>฿${fmtDec(summary.totalWht)}</b></div>
      <div>${isEn ? 'Net paid' : 'จ่ายจริงรวม'}<b>฿${fmtDec(summary.totalNet)}</b></div>
      <div>${isEn ? 'Tax inv. pending' : 'รอใบกำกับภาษี'}<b>${summary.pendingTaxInvoice}</b></div>
      <div>${isEn ? 'Refund pending' : 'รอคืนเงินบริษัท'}<b>${summary.pendingRefund}</b></div>
    </div>`

    html += `<table>
      <tr>
        <th>#</th><th>${isEn ? 'Claim No.' : 'เลขที่'}</th><th>${isEn ? 'Date' : 'วันที่'}</th>
        <th>${isEn ? 'Submitter' : 'ผู้เบิก'}</th><th>${isEn ? 'Roles' : 'ทีมงาน & หน้าที่'}</th><th>${isEn ? 'Title' : 'หัวข้อ'}</th>
        <th>${isEn ? 'Type' : 'ประเภท'}</th><th>${isEn ? 'Funding' : 'แหล่งเงิน'}</th>
        <th class="num">${isEn ? 'Amount' : 'ยอด'}</th>
        <th>${isEn ? 'Status' : 'สถานะ'}</th>
        <th>${isEn ? 'Receipt' : 'ใบเสร็จ'}</th>
        <th>${isEn ? 'Tax Invoice' : 'ใบกำกับภาษี'}</th>
        <th>${isEn ? 'Refund' : 'คืนเงิน'}</th>
        <th>${isEn ? 'Ready?' : 'พร้อมส่ง?'}</th>
      </tr>`

    filtered.forEach((c, i) => {
      const ck = getClaimChecklist(c)
      const taxNumStr = (c.tax_invoice_numbers || []).join(' / ')
      const taxInvoiceCell = !ck.taxInvoiceRequired
        ? '<span class="muted">—</span>'
        : ck.hasTaxInvoice
          ? `<span class="ok">✓</span>${taxNumStr ? ` <span class="muted">${taxNumStr}</span>` : ''}`
          : '<span class="bad">✗</span>'
      const refundCell = !ck.refundRequired
        ? '<span class="muted">—</span>'
        : ck.refundConfirmed
          ? '<span class="ok">✓ ยืนยันแล้ว</span>'
          : ck.hasRefundSlip
            ? '<span class="bad">⏳ รอยืนยัน</span>'
            : '<span class="bad">✗</span>'
      html += `<tr class="${ck.isComplete ? '' : 'row-incomplete'}">
        <td>${i + 1}</td>
        <td>${c.claim_number || ''}</td>
        <td>${c.expense_date || ''}</td>
        <td>${c.submitter?.full_name || ''}</td>
        <td>${(c.staff_roles || []).map(r => r.label).join(', ')}</td>
        <td>${c.title || ''}</td>
        <td>${c.claim_type === 'event' ? 'อีเวนต์' : c.claim_type === 'advance' ? 'ทดลองจ่าย' : c.claim_type === 'petty_cash' ? 'เงินสดย่อย' : 'อื่นๆ'}</td>
        <td>${getFundingSourceLabel(c.funding_source, 'th')}</td>
        <td class="num">${fmtDec(c.amount || 0)}</td>
        <td>${getClaimStatusLabel(c.status, 'th')}</td>
        <td>${ck.hasReceipt ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td>
        <td>${taxInvoiceCell}</td>
        <td>${refundCell}</td>
        <td>${ck.isComplete ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td>
      </tr>`
    })

    html += `</table></body></html>`

    const win = window.open('', '_blank')
    if (win) {
      win.document.write(html)
      win.document.close()
      setTimeout(() => win.print(), 300)
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 shrink-0">
            <ListChecks className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Audit Report' : 'รายงานตรวจสอบใบเบิก'}
            </h2>
            <p className="text-xs text-zinc-400">
              {isEn
                ? 'Pre-accounting checklist — verify documents before handing over'
                : 'ใบปะหน้าเอกสาร — ตรวจสอบความครบของเอกสารก่อนส่งสำนักงานบัญชี'}
            </p>
          </div>
        </div>

        {/* Export buttons */}
        <div className="flex gap-2">
          <button
            onClick={downloadXLSX}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {isEn ? 'Excel' : 'Excel'}
          </button>
          <button
            onClick={downloadPDF}
            disabled={filtered.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white rounded-lg text-xs font-semibold transition-colors"
          >
            <FileDown className="h-3.5 w-3.5" />
            PDF
          </button>
        </div>
      </div>

      {/* Range presets */}
      <div className="flex items-center gap-1 flex-wrap">
        {(
          [
            { v: 'day', th: 'วันนี้', en: 'Today' },
            { v: 'week', th: '7 วัน', en: '7 Days' },
            { v: 'month', th: 'เดือนนี้', en: 'Month' },
            { v: 'year', th: 'ปีนี้', en: 'Year' },
            { v: 'custom', th: 'กำหนดเอง', en: 'Custom' },
            { v: 'all', th: 'ทั้งหมด', en: 'All' },
          ] as const
        ).map(p => (
          <button
            key={p.v}
            onClick={() => setRangePreset(p.v as RangePreset)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              rangePreset === p.v
                ? 'bg-emerald-600 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
            }`}
          >
            {isEn ? p.en : p.th}
          </button>
        ))}
        {rangePreset === 'custom' && (
          <div className="flex items-center gap-1 ml-2">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" />
            <input
              type="date"
              value={customFrom}
              onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 outline-none focus:border-emerald-500"
            />
            <span className="text-xs text-zinc-400">→</span>
            <input
              type="date"
              value={customTo}
              onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-1 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 outline-none focus:border-emerald-500"
            />
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <SummaryCard
          label={isEn ? 'Total Claims' : 'จำนวนใบเบิก'}
          value={String(summary.total)}
          tone="zinc"
        />
        <SummaryCard
          label={isEn ? 'Total Amount' : 'ยอดรวม'}
          value={`฿${fmtDec(summary.totalGross)}`}
          tone="zinc"
        />
        <SummaryCard
          label={isEn ? 'Net Payable' : 'จ่ายจริงรวม'}
          value={`฿${fmtDec(summary.totalNet)}`}
          tone="emerald"
        />
        <SummaryCard
          label={isEn ? 'Ready for Accounting' : 'พร้อมส่งบัญชี'}
          value={String(summary.completeCount)}
          tone="emerald"
          icon={CheckCircle2}
        />
        <SummaryCard
          label={isEn ? 'Incomplete' : 'ยังไม่ครบ'}
          value={String(summary.incompleteCount)}
          tone="amber"
          icon={AlertCircle}
        />
        <SummaryCard
          label={isEn ? 'Personal Funded' : 'ใช้เงินส่วนตัว'}
          value={String(summary.personalCount)}
          tone="amber"
          icon={UserIcon}
        />
      </div>

      {/* Action-needed strip */}
      {(summary.pendingTaxInvoice > 0 || summary.pendingRefund > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {summary.pendingTaxInvoice > 0 && (
            <div className="flex items-center gap-3 p-3 bg-sky-50 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800 rounded-xl">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-sky-100 dark:bg-sky-900/40">
                <Receipt className="h-4 w-4 text-sky-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">
                  {summary.pendingTaxInvoice}{' '}
                  {isEn ? 'claims awaiting tax invoice' : 'ใบเบิกยังไม่แนบใบกำกับภาษี'}
                </p>
                <p className="text-[11px] text-sky-600 dark:text-sky-400">
                  {isEn ? 'Filter list to follow up.' : 'กดดูรายการเพื่อติดตาม'}
                </p>
              </div>
              <button
                onClick={() => {
                  setStatusFilter(new Set(['waiting_tax_invoice']))
                  setCompletionFilter('all')
                }}
                className="text-xs font-semibold text-sky-700 hover:underline shrink-0"
              >
                {isEn ? 'View' : 'ดู'}
              </button>
            </div>
          )}
          {summary.pendingRefund > 0 && (
            <div className="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-xl">
              <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-amber-100 dark:bg-amber-900/40">
                <RefreshCw className="h-4 w-4 text-amber-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
                  {summary.pendingRefund}{' '}
                  {isEn ? 'advance claims pending refund to company' : 'ใบเบิกที่ยังไม่คืนเงินบริษัท'}
                </p>
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  {isEn ? 'Track refund slips and admin confirmation.' : 'ตรวจสลิปและการยืนยันรับเงินคืน'}
                </p>
              </div>
              <button
                onClick={() => setTypeFilter('advance')}
                className="text-xs font-semibold text-amber-700 hover:underline shrink-0"
              >
                {isEn ? 'View' : 'ดู'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Filter bar */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
        <button
          onClick={() => setShowFilters(!showFilters)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
        >
          <span className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-zinc-400" />
            {isEn ? 'Filters' : 'ตัวกรอง'}
            {hasActiveFilters && (
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                {isEn ? 'active' : 'ใช้อยู่'}
              </span>
            )}
          </span>
          {showFilters ? <ChevronUp className="h-4 w-4 text-zinc-400" /> : <ChevronDown className="h-4 w-4 text-zinc-400" />}
        </button>
        {showFilters && (
          <div className="px-4 pb-4 space-y-3 border-t border-zinc-100 dark:border-zinc-800">
            {/* Search */}
            <div className="relative pt-3">
              <Search className="absolute left-2.5 top-1/2 mt-1 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={isEn ? 'Search claim no., title, name, tax invoice number...' : 'ค้นหา เลขที่/หัวข้อ/ผู้เบิก/เลขใบกำกับภาษี...'}
                className="w-full pl-8 pr-3 py-2 text-sm border border-zinc-200 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-900 outline-none focus:border-emerald-500"
              />
            </div>

            {/* Status multi-select */}
            <div>
              <p className="text-[11px] text-zinc-500 mb-1.5 font-medium">
                {isEn ? 'Status' : 'สถานะ'}
              </p>
              <div className="flex flex-wrap gap-1">
                {/* "All" — clears all status selections */}
                <button
                  onClick={() => setStatusFilter(new Set())}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    statusFilter.size === 0
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                  }`}
                >
                  {isEn ? 'All Statuses' : 'ทุกสถานะ'}
                </button>
                {CLAIM_STATUSES.filter(s => s.value !== 'awaiting_payment').map(s => {
                  const active = statusFilter.has(s.value)
                  return (
                    <button
                      key={s.value}
                      onClick={() => toggleStatus(s.value)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        active ? 'text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                      style={active ? { backgroundColor: s.color } : {}}
                    >
                      {isEn ? s.label : s.labelTh}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Type / Funding / Completion / Category */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Type */}
              <div>
                <p className="text-[11px] text-zinc-500 mb-1 font-medium">{isEn ? 'Type' : 'ประเภท'}</p>
                <div className="flex gap-1">
                  {(['all', 'event', 'other', 'advance', 'petty_cash'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => setTypeFilter(t)}
                      className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        typeFilter === t
                          ? 'bg-emerald-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {t === 'all' ? (isEn ? 'All' : 'ทุก') : t === 'event' ? (isEn ? 'Event' : 'อีเวนต์') : t === 'advance' ? (isEn ? 'Advance' : 'ทดลอง') : t === 'petty_cash' ? (isEn ? 'Petty Cash' : 'เงินสดย่อย') : (isEn ? 'Other' : 'อื่นๆ')}
                    </button>
                  ))}
                </div>
              </div>

              {/* Funding */}
              <div>
                <p className="text-[11px] text-zinc-500 mb-1 font-medium">{isEn ? 'Funding' : 'แหล่งเงิน'}</p>
                <div className="flex gap-1">
                  {([
                    { v: 'all', th: 'ทั้งหมด', en: 'All' },
                    ...FUNDING_SOURCES.map(s => ({ v: s.value, th: s.labelTh, en: s.label })),
                  ] as const).map(o => (
                    <button
                      key={o.v}
                      onClick={() => setFundingFilter(o.v as 'all' | 'company' | 'personal')}
                      className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        fundingFilter === o.v
                          ? 'bg-sky-600 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {isEn ? o.en : o.th}
                    </button>
                  ))}
                </div>
              </div>

              {/* Completion */}
              <div>
                <p className="text-[11px] text-zinc-500 mb-1 font-medium">{isEn ? 'Document Status' : 'เอกสาร'}</p>
                <div className="flex gap-1">
                  {([
                    { v: 'all', th: 'ทั้งหมด', en: 'All' },
                    { v: 'complete', th: 'ครบ', en: 'Ready' },
                    { v: 'incomplete', th: 'ยังไม่ครบ', en: 'Incomplete' },
                  ] as const).map(o => (
                    <button
                      key={o.v}
                      onClick={() => setCompletionFilter(o.v as 'all' | 'complete' | 'incomplete')}
                      className={`flex-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors ${
                        completionFilter === o.v
                          ? o.v === 'complete'
                            ? 'bg-emerald-600 text-white'
                            : o.v === 'incomplete'
                              ? 'bg-amber-600 text-white'
                              : 'bg-zinc-700 text-white'
                          : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {isEn ? o.en : o.th}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category */}
              <div>
                <p className="text-[11px] text-zinc-500 mb-1 font-medium">{isEn ? 'Category' : 'หมวด'}</p>
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 rounded-md bg-white dark:bg-zinc-900 outline-none focus:border-emerald-500"
                >
                  <option value="">{isEn ? 'All categories' : 'ทุกหมวด'}</option>
                  {categories.map(c => (
                    <option key={c.id} value={c.value}>
                      {isEn ? (c.label || c.label_th) : c.label_th}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {hasActiveFilters && (
              <div className="flex justify-end">
                <button
                  onClick={clearFilters}
                  className="px-3 py-1.5 text-xs text-zinc-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-md font-medium"
                >
                  {isEn ? 'Clear filters' : 'ล้างตัวกรอง'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Audit Table */}
      <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
            <ListChecks className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">{isEn ? 'No claims match your filters' : 'ไม่มีใบเบิกที่ตรงกับตัวกรอง'}</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-zinc-50 dark:bg-zinc-800/40 text-zinc-500 dark:text-zinc-400">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">{isEn ? '#' : 'ลำดับ'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Claim No.' : 'เลขที่'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Date' : 'วันที่'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Submitter / Title' : 'ผู้เบิก / หัวข้อ'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Roles' : 'ทีมงาน & หน้าที่'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Type' : 'ประเภท'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Funding' : 'แหล่งเงิน'}</th>
                    <th className="px-3 py-2 font-semibold text-right">{isEn ? 'Amount' : 'ยอด'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Status' : 'สถานะ'}</th>
                    <th className="px-3 py-2 font-semibold text-center">{isEn ? 'Receipt' : 'ใบเสร็จ'}</th>
                    <th className="px-3 py-2 font-semibold">{isEn ? 'Tax Invoice' : 'ใบกำกับภาษี'}</th>
                    <th className="px-3 py-2 font-semibold text-center">{isEn ? 'Refund' : 'คืนเงิน'}</th>
                    <th className="px-3 py-2 font-semibold text-center">{isEn ? 'Ready?' : 'พร้อม?'}</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filtered.map((c, i) => {
                    const ck = getClaimChecklist(c)
                    const fundingColor = getFundingSourceColor(c.funding_source)
                    const isPersonal = c.funding_source === 'personal'
                    const FundingIcon = isPersonal ? UserIcon : Building2
                    return (
                      <tr
                        key={c.id}
                        className={`${ck.isComplete ? '' : 'bg-amber-50/30 dark:bg-amber-950/10'} hover:bg-zinc-50 dark:hover:bg-zinc-800/30`}
                      >
                        <td className="px-3 py-2 text-zinc-400 font-mono">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-zinc-700 dark:text-zinc-300">{c.claim_number}</td>
                        <td className="px-3 py-2 text-zinc-600 dark:text-zinc-400">
                          {(c.expense_date || c.created_at?.slice(0, 10)) || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-medium text-zinc-900 dark:text-zinc-100 truncate max-w-50" title={c.title}>
                            {c.title}
                          </p>
                          <p className="text-zinc-500 truncate max-w-50">
                            {c.submitter?.full_name || '—'}
                          </p>
                        </td>
                        <td className="px-3 py-2">
                          {c.staff_roles && c.staff_roles.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-44">
                              {c.staff_roles.map((r, ri) => (
                                <span
                                  key={ri}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                                >
                                  {r.label}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[10px] text-zinc-400">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                            c.claim_type === 'advance'
                              ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
                              : c.claim_type === 'petty_cash'
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400'
                                : c.claim_type === 'event'
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                                  : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}>
                            {c.claim_type === 'advance' && <Wallet className="h-2.5 w-2.5" />}
                            {c.claim_type === 'petty_cash' && <Coins className="h-2.5 w-2.5" />}
                            {c.claim_type === 'event' ? (isEn ? 'Event' : 'อีเวนต์') : c.claim_type === 'advance' ? (isEn ? 'Advance' : 'ทดลอง') : c.claim_type === 'petty_cash' ? (isEn ? 'Petty Cash' : 'เงินสดย่อย') : (isEn ? 'Other' : 'อื่นๆ')}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                            style={{ backgroundColor: `${fundingColor}1a`, color: fundingColor }}
                          >
                            <FundingIcon className="h-2.5 w-2.5" />
                            {getFundingSourceLabel(c.funding_source, locale)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-zinc-700 dark:text-zinc-200">
                          ฿{fmtDec(c.amount || 0)}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className="inline-block px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-white"
                            style={{ backgroundColor: getClaimStatusColor(c.status) }}
                          >
                            {getClaimStatusLabel(c.status, locale)}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <CheckCell ok={ck.hasReceipt} />
                        </td>
                        <td className="px-3 py-2">
                          {!ck.taxInvoiceRequired ? (
                            <span className="text-[10px] text-zinc-400">—</span>
                          ) : (
                            <div className="flex items-center gap-1">
                              <CheckCell ok={ck.hasTaxInvoice} />
                              {(c.tax_invoice_numbers || []).length > 0 && (
                                <span className="text-[10px] font-mono text-sky-600 dark:text-sky-400 truncate max-w-30" title={(c.tax_invoice_numbers || []).join(', ')}>
                                  {(c.tax_invoice_numbers || []).join(', ')}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {!ck.refundRequired ? (
                            <span className="text-[10px] text-zinc-400">—</span>
                          ) : ck.refundConfirmed ? (
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 text-[10px] font-bold">
                              <CheckCircle2 className="h-3 w-3" /> ยืนยัน
                            </span>
                          ) : ck.hasRefundSlip ? (
                            <span className="inline-flex items-center gap-0.5 text-amber-600 text-[10px] font-bold">
                              <RefreshCw className="h-3 w-3" /> รอยืนยัน
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-0.5 text-red-500 text-[10px] font-bold">
                              <AlertCircle className="h-3 w-3" /> ยังไม่คืน
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {ck.isComplete ? (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                            </span>
                          ) : (
                            <span className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40">
                              <AlertCircle className="h-3.5 w-3.5" />
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <Link href={`/finance/${c.id}`} className="text-zinc-400 hover:text-emerald-600">
                            <ExternalLink className="h-3.5 w-3.5" />
                          </Link>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map(c => {
                const ck = getClaimChecklist(c)
                const fundingColor = getFundingSourceColor(c.funding_source)
                return (
                  <Link
                    key={c.id}
                    href={`/finance/${c.id}`}
                    className={`block p-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors ${
                      ck.isComplete ? '' : 'bg-amber-50/30 dark:bg-amber-950/10'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-mono text-zinc-400">{c.claim_number}</span>
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-bold text-white"
                            style={{ backgroundColor: getClaimStatusColor(c.status) }}
                          >
                            {getClaimStatusLabel(c.status, locale)}
                          </span>
                          <span
                            className="px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                            style={{ backgroundColor: `${fundingColor}1a`, color: fundingColor }}
                          >
                            {getFundingSourceLabel(c.funding_source, locale)}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate mt-1">
                          {c.title}
                        </p>
                        <p className="text-xs text-zinc-500 mt-0.5">
                          {c.submitter?.full_name || '—'} • {c.expense_date || c.created_at?.slice(0, 10)}
                        </p>
                        {c.staff_roles && c.staff_roles.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {c.staff_roles.map((r, ri) => (
                              <span
                                key={ri}
                                className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 border border-amber-200 dark:border-amber-800/50 text-[10px] font-semibold text-amber-700 dark:text-amber-300"
                              >
                                {r.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                          ฿{fmtDec(c.amount || 0)}
                        </p>
                        {ck.isComplete ? (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 mt-0.5">
                            <CheckCircle2 className="h-3 w-3" /> {isEn ? 'Ready' : 'พร้อม'}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 mt-0.5">
                            <AlertCircle className="h-3 w-3" /> {isEn ? 'Incomplete' : 'ไม่ครบ'}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <DocChip ok={ck.hasReceipt} label={isEn ? 'Receipt' : 'ใบเสร็จ'} />
                      {ck.taxInvoiceRequired && (
                        <DocChip
                          ok={ck.hasTaxInvoice}
                          label={isEn ? 'Tax Inv.' : 'ใบกำกับ'}
                          extra={(c.tax_invoice_numbers || []).join(', ')}
                        />
                      )}
                      {ck.refundRequired && (
                        <DocChip
                          ok={ck.refundConfirmed}
                          partial={ck.hasRefundSlip}
                          label={isEn ? 'Refund' : 'คืนเงิน'}
                        />
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// Sub-components
// ============================================================================

function SummaryCard({
  label,
  value,
  tone,
  icon: Icon,
}: {
  label: string
  value: string
  tone: 'zinc' | 'emerald' | 'amber'
  icon?: typeof CheckCircle2
}) {
  const toneCls = {
    zinc: 'text-zinc-900 dark:text-zinc-100',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    amber: 'text-amber-600 dark:text-amber-400',
  }[tone]

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-900">
      <p className="text-[10px] uppercase tracking-wider text-zinc-400 font-semibold flex items-center gap-1">
        {Icon && <Icon className="h-3 w-3" />}
        {label}
      </p>
      <p className={`text-lg sm:text-xl font-bold mt-1 ${toneCls}`}>{value}</p>
    </div>
  )
}

function CheckCell({ ok }: { ok: boolean }) {
  return ok ? (
    <CheckCircle2 className="h-4 w-4 text-emerald-600 inline-block" />
  ) : (
    <AlertCircle className="h-4 w-4 text-red-500 inline-block" />
  )
}

function DocChip({
  ok,
  partial,
  label,
  extra,
}: {
  ok: boolean
  partial?: boolean
  label: string
  extra?: string
}) {
  const cls = ok
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
    : partial
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60'
      : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200/60 dark:border-red-800/60'

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold border ${cls}`}
      title={extra}
    >
      {label}
      {ok ? ' ✓' : partial ? ' ⏳' : ' ✗'}
      {extra && (
        <span className="font-mono text-[9px] opacity-80 max-w-20 truncate">
          {extra}
        </span>
      )}
    </span>
  )
}
