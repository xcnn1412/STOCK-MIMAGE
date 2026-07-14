'use client'

import Link from 'next/link'
import { Coins, ExternalLink, Lock, RefreshCw, PlusCircle, CheckCircle2, Clock } from 'lucide-react'
import { useLocale } from '@/lib/i18n/context'

const fmtDec = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const round2 = (n: number) => Math.round(n * 100) / 100

type ChildRow = {
  id: string
  claim_number: string
  claim_type: string
  title: string
  amount: number
  expense_date: string
  status: string
  submitter?: { id: string; full_name: string } | null
}

type FundEntry = {
  fund: {
    id: string
    claim_number: string
    title: string
    amount: number
    status: string
    refund_amount: number | null
    pettycash_period_start: string | null
    pettycash_period_end: string | null
    pettycash_closed_at: string | null
    submitter?: { id: string; full_name: string } | null
  }
  topups: ChildRow[]
  expenses: ChildRow[]
  initial: number
  topupPaid: number
  topupPending: number
  spent: number
  balance: number
}

export default function PettyCashLedger({ funds }: { funds: FundEntry[] }) {
  const { locale } = useLocale()
  const isEn = locale === 'en'

  const monthLabel = (f: FundEntry) => {
    const d = f.fund.pettycash_period_start || f.fund.pettycash_period_end
    if (!d) return f.fund.claim_number
    const [y, m] = d.split('-').map(Number)
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(isEn ? 'en-US' : 'th-TH', { month: 'long', year: 'numeric' })
  }

  const fundChip = (f: FundEntry) => {
    // Zero-leftover months have nothing to confirm — closed IS final for them.
    const zeroLeftoverClosed = !!f.fund.pettycash_closed_at && !(Number(f.fund.refund_amount) > 0)
    if (f.fund.status === 'refund_confirmed' || zeroLeftoverClosed) {
      return { label: isEn ? 'Finalised' : 'จบเดือน', cls: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300', Icon: CheckCircle2 }
    }
    if (f.fund.pettycash_closed_at) {
      return { label: isEn ? 'Closed — awaiting confirm' : 'ปิดแล้ว รอยืนยันเงินคืน', cls: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300', Icon: Lock }
    }
    if (f.fund.status === 'paid') {
      return { label: isEn ? 'Open' : 'เปิดใช้งาน', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', Icon: Coins }
    }
    return { label: isEn ? 'Awaiting payout' : 'รออนุมัติ/จ่าย', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', Icon: Clock }
  }

  // Weekly subtotals (day 1–7, 8–14, …) for a fund's expenses
  const weekGroups = (f: FundEntry) => {
    const groups = new Map<number, { from: number; to: number; total: number; count: number }>()
    for (const e of f.expenses) {
      const day = Number((e.expense_date || '').slice(8, 10)) || 1
      const w = Math.min(5, Math.floor((day - 1) / 7) + 1)
      if (!groups.has(w)) groups.set(w, { from: (w - 1) * 7 + 1, to: w === 5 ? 31 : w * 7, total: 0, count: 0 })
      const g = groups.get(w)!
      g.total = round2(g.total + (Number(e.amount) || 0))
      g.count++
    }
    return Array.from(groups.entries()).sort((a, b) => a[0] - b[0]).map(([week, g]) => ({ week, ...g }))
  }

  const grandIn = round2(funds.reduce((s, f) => s + f.initial + f.topupPaid, 0))
  const grandSpent = round2(funds.reduce((s, f) => s + f.spent, 0))
  const grandReturned = round2(funds.reduce((s, f) => s + (Number(f.fund.refund_amount) || 0), 0))

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-orange-100 dark:bg-orange-900/30 shrink-0">
            <Coins className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
              {isEn ? 'Petty Cash' : 'เงินสดย่อย'}
            </h1>
            <p className="text-sm text-zinc-500">
              {isEn ? 'Monthly funds — expenses, top-ups, month-end returns' : 'วงเงินรายเดือน — รายจ่าย เติมเงิน และการคืนเงินสิ้นเดือน'}
            </p>
          </div>
        </div>
        <Link
          href="/finance/new"
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm shrink-0"
        >
          <PlusCircle className="h-4 w-4" />
          <span className="hidden sm:inline">{isEn ? 'Open monthly fund' : 'เปิดวงเงินเดือนใหม่'}</span>
        </Link>
      </div>

      {/* Grand totals */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-400 mb-1">{isEn ? 'Total funded' : 'เงินเข้ารวม (ตั้งต้น + เติม)'}</p>
          <p className="text-xl font-bold font-mono text-zinc-800 dark:text-zinc-200">฿{fmtDec(grandIn)}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-400 mb-1">{isEn ? 'Total spent' : 'รายจ่ายรวม'}</p>
          <p className="text-xl font-bold font-mono text-orange-600 dark:text-orange-400">฿{fmtDec(grandSpent)}</p>
        </div>
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-4">
          <p className="text-xs text-zinc-400 mb-1">{isEn ? 'Returned to company' : 'คืนบริษัทรวม'}</p>
          <p className="text-xl font-bold font-mono text-cyan-600 dark:text-cyan-400">฿{fmtDec(grandReturned)}</p>
        </div>
      </div>

      {funds.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-zinc-400">
          <Coins className="h-12 w-12 mb-3 opacity-40" />
          <p className="text-sm">{isEn ? 'No petty cash funds yet' : 'ยังไม่มีวงเงินสดย่อย'}</p>
          <p className="text-xs mt-1">{isEn ? 'Open the first monthly fund to get started.' : 'เริ่มจากการเปิดวงเงินประจำเดือนแรก'}</p>
        </div>
      ) : (
        funds.map(f => {
          const chip = fundChip(f)
          const ChipIcon = chip.Icon
          const weeks = weekGroups(f)
          const returned = Number(f.fund.refund_amount) || 0
          return (
            <div key={f.fund.id} className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
              {/* Fund header */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-orange-50/60 dark:bg-orange-950/20 border-b border-orange-100 dark:border-orange-900/40">
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-semibold text-orange-800 dark:text-orange-200">{monthLabel(f)}</p>
                  <span className="text-[11px] font-mono text-zinc-400">{f.fund.claim_number}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${chip.cls}`}>
                    <ChipIcon className="h-2.5 w-2.5" />
                    {chip.label}
                  </span>
                  <Link href={`/finance/${f.fund.id}`} className="text-zinc-400 hover:text-orange-500 inline-flex" title={isEn ? 'Open fund' : 'เปิดหน้าวงเงิน'}>
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              {/* Money strip */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-zinc-100 dark:bg-zinc-800">
                <div className="bg-white dark:bg-zinc-900 p-3">
                  <p className="text-[10px] text-zinc-400">{isEn ? 'Initial' : 'ตั้งต้น'}</p>
                  <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">฿{fmtDec(Number(f.fund.amount) || 0)}</p>
                  {f.initial === 0 && (Number(f.fund.amount) || 0) > 0 && (
                    <p className="text-[9px] text-amber-500">{isEn ? 'not paid yet' : 'ยังไม่จ่าย'}</p>
                  )}
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3">
                  <p className="text-[10px] text-zinc-400">
                    {isEn ? 'Top-ups' : 'เติมเงิน'} ({f.topups.length})
                  </p>
                  <p className="text-sm font-mono font-semibold text-zinc-800 dark:text-zinc-200">+฿{fmtDec(f.topupPaid)}</p>
                  {f.topupPending > 0 && (
                    <p className="text-[9px] text-amber-500">{isEn ? 'pending' : 'ค้าง'} ฿{fmtDec(f.topupPending)}</p>
                  )}
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3">
                  <p className="text-[10px] text-zinc-400">{isEn ? 'Spent' : 'รายจ่าย'} ({f.expenses.length})</p>
                  <p className="text-sm font-mono font-semibold text-orange-600 dark:text-orange-400">−฿{fmtDec(f.spent)}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3">
                  <p className="text-[10px] text-zinc-400">{isEn ? 'Balance' : 'คงเหลือ'}</p>
                  <p className={`text-sm font-mono font-semibold ${f.balance < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>฿{fmtDec(f.balance)}</p>
                </div>
                <div className="bg-white dark:bg-zinc-900 p-3">
                  <p className="text-[10px] text-zinc-400">{isEn ? 'Returned' : 'คืนบริษัท'}</p>
                  <p className="text-sm font-mono font-semibold text-cyan-600 dark:text-cyan-400">
                    {returned > 0 ? `↩ ฿${fmtDec(returned)}` : '—'}
                  </p>
                </div>
              </div>

              {/* Weekly subtotals */}
              {weeks.length > 0 && (
                <div className="px-4 py-3 border-t border-zinc-100 dark:border-zinc-800">
                  <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1.5">
                    {isEn ? 'Weekly summary' : 'สรุปยอดแต่ละสัปดาห์'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {weeks.map(w => (
                      <div key={w.week} className="flex items-center gap-2 px-2.5 py-1.5 bg-orange-50/70 dark:bg-orange-950/20 rounded-md text-xs">
                        <span className="text-orange-700 dark:text-orange-300 font-medium">
                          {isEn ? `W${w.week}` : `สัปดาห์ ${w.week}`}
                          <span className="text-zinc-400 font-normal ml-1">({w.from}–{w.to})</span>
                        </span>
                        <span className="font-mono font-semibold text-orange-700 dark:text-orange-300">฿{fmtDec(w.total)}</span>
                        <span className="text-[10px] text-zinc-400">{w.count} {isEn ? 'items' : 'รายการ'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}
