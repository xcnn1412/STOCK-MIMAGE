'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp, TrendingDown, DollarSign, Receipt, Percent, Calculator,
  ArrowUpRight, ArrowDownRight, Banknote, Edit3
} from 'lucide-react'

// ──────────── Formatting Helpers ────────────
const fmt = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const fmtDec = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ──────────── Bar Segment type ────────────
export interface BarSegment {
  label: string
  amount: number
  color: string
  icon?: React.ElementType
}

// ──────────── Props ────────────
export interface CostSummaryDashboardProps {
  /**  Revenue (selling price) — gross amount */
  revenue: number
  /** Total cost (sum of all cost items) */
  totalCost: number

  /** Revenue-side taxes */
  revVatAmount: number
  revWhtAmount: number
  revNetReceivable: number
  /** Revenue VAT label hint (optional) — e.g. 'เพิ่ม' / 'add' */
  revVatLabel?: string

  /** Cost-side taxes */
  costVat: number
  costWht: number
  costNetPayable: number

  /**
   * Stacked bar segments — pass an array for category-colored segments.
   * If omitted, a simple 2-color (cost vs profit) bar is shown.
   */
  barSegments?: BarSegment[]

  /**
   * Whether to show the VAT summary strip
   * (ภาษีซื้อ / ภาษีขาย / ภาษีที่ต้องชำระ)
   */
  showTaxSummary?: boolean

  /** Locale flag */
  isEn: boolean

  /** Optional click handler on revenue amount (for edit trigger) */
  onRevenueClick?: () => void
}

// ──────────── Component ────────────
export default function CostSummaryDashboard({
  revenue,
  totalCost,
  revVatAmount,
  revWhtAmount,
  revNetReceivable,
  revVatLabel,
  costVat,
  costWht,
  costNetPayable,
  barSegments,
  showTaxSummary = true,
  isEn,
  onRevenueClick,
}: CostSummaryDashboardProps) {
  const profit = revNetReceivable - totalCost
  const isProfitable = profit >= 0
  const margin = revNetReceivable > 0 ? (profit / revNetReceivable) * 100 : 0
  const costPct = revenue > 0 ? Math.min((totalCost / revenue) * 100, 100) : 0
  const profitPct = revenue > 0 ? Math.max(((revenue - totalCost) / revenue) * 100, 0) : 0
  const netVatPayable = revVatAmount - costVat

  return (
    <Card className="border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm bg-white dark:bg-zinc-950 overflow-hidden">
      <CardContent className="p-0">

        {/* ────── Revenue Header ────── */}
        <div className="px-6 pt-6 pb-4">
          {/* Row 1: Title (left) + Margin (right) */}
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-sm">
                <Banknote className="h-5 w-5 text-white" />
              </div>
              {onRevenueClick ? (
                <button
                  className="text-xl font-bold text-zinc-900 dark:text-zinc-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                  onClick={onRevenueClick}
                  title={isEn ? 'Click to edit' : 'คลิกเพื่อแก้ไข'}
                >
                  {isEn ? 'Revenue' : 'ราคาขาย'}
                </button>
              ) : (
                <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                  {isEn ? 'Revenue' : 'ราคาขาย'}
                </span>
              )}
            </div>
            {revenue > 0 && (
              <span className={`text-xl font-bold font-mono ${
                isProfitable
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-500 dark:text-red-400'
              }`}>
                {margin.toFixed(1)}%
              </span>
            )}
          </div>

          {/* Row 2: Label + Amount + Edit icon (right-aligned) */}
          <div className="flex items-baseline justify-end gap-3 mt-2">
            <span className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
              {isEn ? 'Revenue' : 'ราคาขาย'}
            </span>
            <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
              {fmtDec(revenue)}
            </span>
            {onRevenueClick && (
              <button
                onClick={onRevenueClick}
                className="text-zinc-400 hover:text-blue-500 dark:hover:text-blue-400 transition-colors cursor-pointer ml-0.5"
                title={isEn ? 'Edit revenue' : 'แก้ไขราคาขาย'}
              >
                <Edit3 className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Row 3: Tax details — plain text with separator */}
          {(revVatAmount > 0 || revWhtAmount > 0) && (
            <>
              <div className="border-t border-zinc-200 dark:border-zinc-700 mt-3 pt-3">
                <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-1.5 text-sm text-zinc-600 dark:text-zinc-400">
                  {revVatAmount > 0 && (
                    <span>
                      VAT {revVatLabel || (isEn ? 'add' : 'เพิ่ม')} : <span className="font-mono font-semibold">{fmtDec(revVatAmount)}</span>
                    </span>
                  )}
                  {revWhtAmount > 0 && (
                    <span>
                      WHT : <span className="font-mono font-semibold">{fmtDec(revWhtAmount)}</span>
                    </span>
                  )}
                  <span>
                    {isEn ? 'Net receivable' : 'ขายจริง'} : <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">{fmtDec(revNetReceivable)}</span>
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* ────── Stacked Progress Bar ────── */}
        <div className="px-6 pb-5">
          <div className="relative h-10 bg-zinc-100 dark:bg-zinc-800/80 rounded-lg overflow-hidden">
            {revenue > 0 ? (
              <>
                {barSegments && barSegments.length > 0 ? (
                  /* Category-colored segments */
                  (() => {
                    let offset = 0
                    return barSegments.map((seg, i) => {
                      if (!seg.amount) return null
                      const widthPct = (seg.amount / revenue) * 100
                      const left = offset
                      offset += widthPct
                      const Icon = seg.icon || TrendingDown
                      return (
                        <div
                          key={i}
                          className="absolute top-0 h-full flex items-center justify-center text-white text-[11px] font-medium transition-all duration-700 ease-out"
                          style={{
                            left: `${left}%`,
                            width: `${widthPct}%`,
                            backgroundColor: seg.color,
                            opacity: 0.9,
                          }}
                          title={`${seg.label}: ฿${fmt(seg.amount)}`}
                        >
                          {widthPct > 8 && (
                            <span className="flex items-center gap-1 truncate px-1.5 drop-shadow-sm">
                              <Icon className="h-3 w-3 shrink-0" />
                              {widthPct > 15 && <span className="truncate">{seg.label}</span>}
                            </span>
                          )}
                        </div>
                      )
                    })
                  })()
                ) : (
                  /* Simple 2-color: cost vs profit */
                  <div
                    className="absolute top-0 h-full flex items-center justify-center text-white text-[11px] font-medium transition-all duration-700 ease-out"
                    style={{
                      left: '0%',
                      width: `${costPct}%`,
                      background: 'linear-gradient(135deg, #ef4444, #f97316)',
                    }}
                  >
                    {costPct > 15 && (
                      <span className="flex items-center gap-1 truncate px-2 drop-shadow-sm">
                        <TrendingDown className="h-3 w-3 shrink-0" />
                        {isEn ? 'Cost' : 'ต้นทุน'} {costPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
                {/* Profit segment */}
                {profitPct > 0 && (
                  <div
                    className="absolute top-0 h-full flex items-center justify-center text-white text-[11px] font-medium transition-all duration-700 ease-out"
                    style={{
                      left: barSegments && barSegments.length > 0
                        ? `${Math.min(barSegments.reduce((s, seg) => s + ((seg.amount || 0) / revenue) * 100, 0), 100)}%`
                        : `${costPct}%`,
                      width: `${profitPct}%`,
                      background: 'linear-gradient(135deg, #10b981, #059669)',
                    }}
                  >
                    {profitPct > 15 && (
                      <span className="flex items-center gap-1 truncate px-2 drop-shadow-sm">
                        <TrendingUp className="h-3 w-3 shrink-0" />
                        {isEn ? 'Profit' : 'กำไร'} {profitPct.toFixed(0)}%
                      </span>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-sm text-zinc-400">
                {isEn ? 'No revenue data' : 'ยังไม่มีข้อมูลรายได้'}
              </div>
            )}
          </div>
          {/* Bar legend */}
          {revenue > 0 && !barSegments && (
            <div className="flex items-center justify-between mt-2 text-[10px] text-zinc-400">
              <span className="flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)' }} />
                {isEn ? 'Cost' : 'ต้นทุน'} ฿{fmt(totalCost)}
              </span>
              {profitPct > 0 && (
                <span className="flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }} />
                  {isEn ? 'Profit' : 'กำไร'} ฿{fmt(profit)}
                </span>
              )}
            </div>
          )}
        </div>

        {/* ────── Row 1: Cost / Profit / Margin ────── */}
        <div className="grid grid-cols-3 gap-px bg-zinc-200/60 dark:bg-zinc-700/60 border-t border-zinc-200/60 dark:border-zinc-700/60">
          {/* Total Cost */}
          <div className="bg-white dark:bg-zinc-950 p-4 text-center">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              {isEn ? 'Total Cost' : 'ต้นทุนรวม'}
            </p>
            <p className="text-lg font-bold text-red-500 dark:text-red-400 font-mono">
              ฿{fmt(totalCost)}
            </p>
          </div>
          {/* Profit */}
          <div className="bg-white dark:bg-zinc-950 p-4 text-center">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              {isEn ? 'Profit' : 'กำไร'}
            </p>
            <p className={`text-lg font-bold font-mono ${isProfitable ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {isProfitable ? '+' : ''}฿{fmt(profit)}
            </p>
          </div>
          {/* Margin */}
          <div className="bg-white dark:bg-zinc-950 p-4 text-center">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider mb-1">
              MARGIN
            </p>
            <p className={`text-lg font-bold font-mono ${isProfitable ? 'text-emerald-500 dark:text-emerald-400' : 'text-red-500 dark:text-red-400'}`}>
              {margin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* ────── Row 2: VAT / WHT / Net Payable ────── */}
        {(costVat > 0 || costWht > 0) && (
          <div className="grid grid-cols-3 gap-px bg-zinc-200/60 dark:bg-zinc-700/60">
            <div className="bg-white dark:bg-zinc-950 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Receipt className="h-3 w-3 text-amber-500" />
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">VAT 7%</p>
              </div>
              <p className="text-base font-bold text-amber-600 dark:text-amber-400 font-mono">
                ฿{fmtDec(costVat)}
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-950 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <Percent className="h-3 w-3 text-violet-500" />
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                  {isEn ? 'WHT' : 'หัก ณ ที่จ่าย'}
                </p>
              </div>
              <p className="text-base font-bold text-violet-600 dark:text-violet-400 font-mono">
                ฿{fmtDec(costWht)}
              </p>
            </div>
            <div className="bg-white dark:bg-zinc-950 p-4 text-center">
              <div className="flex items-center justify-center gap-1.5 mb-1">
                <DollarSign className="h-3 w-3 text-zinc-400" />
                <p className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                  {isEn ? 'Net Payable' : 'ยอดจ่ายจริง'}
                </p>
              </div>
              <p className="text-base font-bold text-zinc-900 dark:text-zinc-100 font-mono">
                ฿{fmtDec(costNetPayable)}
              </p>
            </div>
          </div>
        )}

        {/* ────── Tax Summary Strip ────── */}
        {showTaxSummary && (costVat > 0 || revVatAmount > 0) && (
          <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-900/50 px-6 py-4">
            <div className="flex items-center gap-2 mb-3">
              <Calculator className="h-4 w-4 text-zinc-400" />
              <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                {isEn ? 'VAT Summary' : 'สรุปภาษีมูลค่าเพิ่ม'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {/* Input Tax (ภาษีซื้อ) */}
              <div className="rounded-lg border border-blue-100 dark:border-blue-900/30 bg-blue-50/60 dark:bg-blue-950/20 px-4 py-3 text-center">
                <p className="text-[10px] font-medium text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-0.5">
                  {isEn ? 'Input Tax' : 'ภาษีซื้อ'}
                </p>
                <p className="text-sm font-bold text-blue-700 dark:text-blue-300 font-mono">
                  ฿{fmtDec(costVat)}
                </p>
              </div>
              {/* Output Tax (ภาษีขาย) */}
              <div className="rounded-lg border border-amber-100 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-950/20 px-4 py-3 text-center">
                <p className="text-[10px] font-medium text-amber-500 dark:text-amber-400 uppercase tracking-wider mb-0.5">
                  {isEn ? 'Output Tax' : 'ภาษีขาย'}
                </p>
                <p className="text-sm font-bold text-amber-700 dark:text-amber-300 font-mono">
                  ฿{fmtDec(revVatAmount)}
                </p>
              </div>
              {/* Net VAT Payable */}
              <div className={`rounded-lg border px-4 py-3 text-center ${netVatPayable >= 0
                ? 'border-red-100 dark:border-red-900/30 bg-red-50/60 dark:bg-red-950/20'
                : 'border-emerald-100 dark:border-emerald-900/30 bg-emerald-50/60 dark:bg-emerald-950/20'
              }`}>
                <p className={`text-[10px] font-medium uppercase tracking-wider mb-0.5 ${netVatPayable >= 0
                  ? 'text-red-500 dark:text-red-400'
                  : 'text-emerald-500 dark:text-emerald-400'
                }`}>
                  {isEn ? 'Net VAT' : 'ภาษีที่ต้องชำระ'}
                </p>
                <p className={`text-sm font-bold font-mono ${netVatPayable >= 0
                  ? 'text-red-700 dark:text-red-300'
                  : 'text-emerald-700 dark:text-emerald-300'
                }`}>
                  ฿{fmtDec(Math.abs(netVatPayable))}
                </p>
                {netVatPayable < 0 && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-0.5">
                    {isEn ? '(Refundable)' : '(ได้คืน)'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

      </CardContent>
    </Card>
  )
}
