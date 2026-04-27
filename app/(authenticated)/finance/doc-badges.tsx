'use client'

import { FileText, Hash, RefreshCw, Building2, User as UserIcon, AlertCircle, Clock } from 'lucide-react'
import {
  getClaimChecklist,
  getFundingSourceColor,
  getFundingSourceLabel,
} from '../costs/types'
import type { ExpenseClaim } from '../costs/types'

// ============================================================================
// DocBadge — single document status pill (✓ / ✗ / ⏳)
// ============================================================================

export function DocBadge({
  ok,
  partial,
  labelTh,
  labelEn,
  isEn,
  Icon,
}: {
  ok: boolean
  partial?: boolean
  labelTh: string
  labelEn: string
  isEn: boolean
  Icon: typeof Clock
}) {
  const cls = ok
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-800/60'
    : partial
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400 border-amber-200/60 dark:border-amber-800/60'
      : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400 border-red-200/60 dark:border-red-800/60'

  const label = isEn ? labelEn : labelTh
  const tooltip = ok
    ? `${label} ${isEn ? 'OK' : 'ครบ'}`
    : partial
      ? `${label} ${isEn ? 'partial' : 'รอตรวจ'}`
      : `${label} ${isEn ? 'missing' : 'ยังไม่ครบ'}`

  return (
    <span
      title={tooltip}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border ${cls}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
      {ok ? ' ✓' : partial ? ' ⏳' : ' ✗'}
    </span>
  )
}

// ============================================================================
// ChecklistBadges — full row of doc badges for a claim
// Shows only when something is incomplete (or always with `alwaysShow`).
// ============================================================================

export function ChecklistBadges({
  claim,
  isEn,
  alwaysShow = false,
}: {
  claim: ExpenseClaim
  isEn: boolean
  alwaysShow?: boolean
}) {
  const ck = getClaimChecklist(claim)
  if (!alwaysShow && ck.isComplete) return null

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <DocBadge
        ok={ck.hasReceipt}
        labelTh="ใบเสร็จ"
        labelEn="Receipt"
        isEn={isEn}
        Icon={FileText}
      />
      {ck.taxInvoiceRequired && (
        <DocBadge
          ok={ck.hasTaxInvoice}
          labelTh="ใบกำกับ"
          labelEn="Tax Inv."
          isEn={isEn}
          Icon={Hash}
        />
      )}
      {ck.refundRequired && (
        <DocBadge
          ok={ck.refundConfirmed}
          partial={ck.hasRefundSlip && !ck.refundConfirmed}
          labelTh="คืนเงิน"
          labelEn="Refund"
          isEn={isEn}
          Icon={RefreshCw}
        />
      )}
    </div>
  )
}

// ============================================================================
// FundingBadge — single pill showing claim's funding source
// ============================================================================

export function FundingBadge({
  claim,
  isEn,
  size = 'sm',
}: {
  claim: ExpenseClaim
  isEn: boolean
  size?: 'xs' | 'sm'
}) {
  const color = getFundingSourceColor(claim.funding_source)
  const isPersonal = claim.funding_source === 'personal'
  const Icon = isPersonal ? UserIcon : Building2
  const sizeCls = size === 'xs'
    ? 'px-1.5 py-0.5 text-[10px]'
    : 'px-2 py-0.5 text-[11px]'
  const iconSize = size === 'xs' ? 'h-2.5 w-2.5' : 'h-3 w-3'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md font-semibold ${sizeCls}`}
      style={{ backgroundColor: `${color}1a`, color }}
      title={isEn ? 'Funding source' : 'แหล่งเงินที่ใช้เบิก'}
    >
      <Icon className={iconSize} />
      {getFundingSourceLabel(claim.funding_source, isEn ? 'en' : 'th')}
    </span>
  )
}

// ============================================================================
// IncompleteWarning — inline warning when a claim is missing required docs
// ============================================================================

export function IncompleteWarning({
  claim,
  isEn,
}: {
  claim: ExpenseClaim
  isEn: boolean
}) {
  const ck = getClaimChecklist(claim)
  if (ck.isComplete) return null

  const missing: string[] = []
  if (!ck.hasReceipt) missing.push(isEn ? 'receipt' : 'ใบเสร็จ')
  if (ck.taxInvoiceRequired && !ck.hasTaxInvoice) missing.push(isEn ? 'tax invoice' : 'ใบกำกับ')
  if (ck.refundRequired && !ck.hasRefundSlip) missing.push(isEn ? 'refund slip' : 'สลิปคืนเงิน')
  if (ck.refundRequired && ck.hasRefundSlip && !ck.refundConfirmed) {
    missing.push(isEn ? 'refund confirmation' : 'ยืนยันรับคืน')
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
      title={isEn ? `Missing: ${missing.join(', ')}` : `ขาด: ${missing.join(', ')}`}
    >
      <AlertCircle className="h-2.5 w-2.5" />
      {isEn ? 'INCOMPLETE' : 'เอกสารไม่ครบ'}
    </span>
  )
}
