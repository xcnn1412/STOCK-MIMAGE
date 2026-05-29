'use client'

import { Receipt } from 'lucide-react'
import { CLAIM_STATUSES } from '../types'
import type { ClaimSummary } from '../lib/crm-cost-grouping'

const fmt = (n: number) => n.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

function statusConfig(value: string) {
  return CLAIM_STATUSES.find((s) => s.value === value)
}

/**
 * Secondary cash-flow summary of expense claims (ใบเบิกเงิน) rolled up for a
 * CRM group. This is DISTINCT from the cost basis (job_cost_items) shown above
 * it — it tracks reimbursement status (เบิก / จ่ายแล้ว / ค้าง), not booked cost.
 */
export default function CrmClaimSummary({ summary, isEn }: { summary: ClaimSummary; isEn: boolean }) {
  if (!summary || summary.claimCount === 0) return null

  const statusEntries = Object.entries(summary.byStatus).sort((a, b) => b[1].amount - a[1].amount)

  return (
    <div className="rounded-lg border border-zinc-200/70 dark:border-zinc-700/60 bg-zinc-50/60 dark:bg-zinc-900/40 px-3.5 py-2.5">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
          <Receipt className="h-3 w-3" />
          {isEn ? 'Expense claims' : 'ใบเบิกเงิน'}
          <span className="font-normal normal-case text-zinc-400">
            ({summary.claimCount} {isEn ? 'claims' : 'ใบ'})
          </span>
        </span>
        <span className="text-[10px] text-zinc-400">
          {isEn ? 'cash-flow, not cost basis' : 'กระแสเงินสด — ไม่ใช่ฐานต้นทุน'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <span className="text-zinc-600 dark:text-zinc-400">
          {isEn ? 'Claimed' : 'เบิกรวม'}: <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">฿{fmt(summary.totalClaimed)}</span>
        </span>
        <span className="text-teal-600 dark:text-teal-400">
          {isEn ? 'Paid' : 'จ่ายแล้ว'}: <span className="font-mono font-semibold">฿{fmt(summary.totalPaid)}</span>
        </span>
        {summary.totalPending > 0 && (
          <span className="text-amber-600 dark:text-amber-400">
            {isEn ? 'Pending' : 'ค้างจ่าย'}: <span className="font-mono font-semibold">฿{fmt(summary.totalPending)}</span>
          </span>
        )}
      </div>

      {statusEntries.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {statusEntries.map(([status, data]) => {
            const cfg = statusConfig(status)
            const label = cfg ? (isEn ? cfg.label : cfg.labelTh) : status
            const color = cfg?.color || '#6b7280'
            return (
              <span
                key={status}
                className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                style={{ backgroundColor: `${color}1a`, color }}
              >
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                {label} {data.count} · ฿{fmt(data.amount)}
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}
