'use client'

// ============================================================================
// แท็บ Dashboard — ภาพรวมธุรกิจหน้าเดียว: รายรับ-รายจ่าย, สุขภาพการเงิน,
// งาน/เดือน, ใบเบิก ฯลฯ ใช้ compute แม่นชุดเดียวกับ P&L/Cash&AR (buildHealth)
// responsive (mobile→desktop) · refresh ดึงข้อมูลใหม่ (page revalidate=0)
// ============================================================================

import { useMemo, useState, useEffect, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Wallet, Clock, RefreshCw, Calendar, Receipt,
  Users, Activity, AlertTriangle, CheckCircle2, ArrowDownRight,
} from 'lucide-react'
import {
  type PLLead, type PLClaim, type PLInstallment, type PLJobEvent, type PLCostItem,
  buildHealth, isRevLead, leadDate, leadAmount, claimDate, claimEffective, num, fmt, fmtSign,
} from './pl/pl-lib'

const CLAIM_STATUS_TH: Record<string, string> = {
  paid: 'จ่ายแล้ว', refund_confirmed: 'คืนเงินแล้ว', approved: 'อนุมัติแล้ว',
  waiting_tax_invoice: 'รอใบกำกับภาษี', pending_month_end: 'รอจ่ายสิ้นเดือน',
  pending: 'รอจ่าย', submitted: 'ส่งแล้ว', draft: 'ร่าง',
}

export default function DashboardView({ leads, claims, installments, events, costItems }: {
  leads: PLLead[]; claims: PLClaim[]; installments: PLInstallment[]; events: PLJobEvent[]; costItems: PLCostItem[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [period, setPeriod] = useState<'month' | 'year' | 'all'>('all')
  const [updatedAt, setUpdatedAt] = useState('')
  useEffect(() => { setUpdatedAt(new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })) }, [])

  const inRange = useMemo(() => {
    if (period === 'all') return () => true
    const d = new Date()
    const start = period === 'month'
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
      : `${d.getFullYear()}-01-01`
    return (dt: string | null) => !!dt && dt.slice(0, 10) >= start
  }, [period])

  const h = useMemo(() => buildHealth(leads, claims, installments, events, costItems, inRange), [leads, claims, installments, events, costItems, inRange])

  // รายเดือน: รายรับ(ฐาน) · รายจ่าย(ฐาน) · จำนวนดีล
  const monthly = useMemo(() => {
    const m = new Map<string, { rev: number; exp: number; deals: number }>()
    const M = (k: string) => { let v = m.get(k); if (!v) { v = { rev: 0, exp: 0, deals: 0 }; m.set(k, v) } return v }
    for (const l of leads) {
      if (!isRevLead(l)) continue
      const d = leadDate(l); if (!d || !inRange(d)) continue
      const amt = leadAmount(l); if (amt <= 0) continue
      const v = M(d.slice(0, 7)); v.rev += amt; v.deals++
    }
    for (const c of claims) {
      if (c.status === 'rejected' || c.status === 'cancelled') continue
      const d = claimDate(c); if (!d || !inRange(d)) continue
      const amt = claimEffective(c); if (amt <= 0) continue
      M(d.slice(0, 7)).exp += amt
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-12)
      .map(([month, v]) => ({ month, ...v, profit: v.rev - v.exp }))
  }, [leads, claims, inRange])

  // ใบเบิก: รวม + แยกสถานะ (ในช่วง)
  const claimStats = useMemo(() => {
    let total = 0, amount = 0
    const byStatus: Record<string, number> = {}
    for (const c of claims) {
      const d = claimDate(c); if (!d || !inRange(d)) continue
      if (c.status === 'rejected' || c.status === 'cancelled') continue
      total++; amount += claimEffective(c)
      byStatus[c.status || 'unknown'] = (byStatus[c.status || 'unknown'] || 0) + 1
    }
    return { total, amount, byStatus }
  }, [claims, inRange])

  const customers = useMemo(() => new Set(h.deals.map(d => d.name)).size, [h.deals])
  const avgDeal = h.dealCount > 0 ? h.revBase / h.dealCount : 0
  const isProfit = h.operatingProfit >= 0
  const maxMonthly = Math.max(...monthly.map(m => Math.max(m.rev, m.exp)), 1)
  const maxDeals = Math.max(...monthly.map(m => m.deals), 1)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">ภาพรวมธุรกิจ</h2>
          {updatedAt && <p className="text-[11px] text-zinc-400">ข้อมูล ณ {updatedAt}</p>}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
            {([['month', 'เดือนนี้'], ['year', 'ปีนี้'], ['all', 'ทั้งหมด']] as const).map(([p, label]) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${period === p ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>{label}</button>
            ))}
          </div>
          <button onClick={() => { setUpdatedAt(new Date().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })); startTransition(() => router.refresh()) }}
            disabled={pending}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center gap-1.5 disabled:opacity-50">
            <RefreshCw className={`h-3.5 w-3.5 ${pending ? 'animate-spin' : ''}`} /> รีเฟรช
          </button>
        </div>
      </div>

      {/* KPI hero */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={TrendingUp} tone="emerald" label="รายรับ (ฐานก่อน VAT)" value={fmtSign(h.revBase)} sub={`${h.dealCount} ดีล · รวม VAT ฿${fmt(h.bookedGross)}`} />
        <Kpi icon={TrendingDown} tone="rose" label="รายจ่าย (ฐานก่อน VAT)" value={fmtSign(h.totalCost)} sub={`ตรง ฿${fmt(h.directCost)} · overhead ฿${fmt(h.overhead)}`} />
        <Kpi icon={isProfit ? Wallet : ArrowDownRight} tone={isProfit ? 'emerald' : 'rose'} emphatic
          label={isProfit ? 'กำไรดำเนินงาน' : 'ขาดทุนดำเนินงาน'} value={fmtSign(h.operatingProfit)} sub={`Margin ${h.opMargin.toFixed(1)}%`} />
        <Kpi icon={Clock} tone="rose" label="ลูกหนี้คงค้าง (AR)" value={fmtSign(h.ar)} sub={`เก็บแล้ว ${(h.cashRate * 100).toFixed(0)}% · เงินสด ฿${fmt(h.cashCollected)}`} />
      </div>

      {/* Health strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Metric label="Gross Margin" value={`${h.grossMargin.toFixed(0)}%`} good={h.grossMargin >= 40} />
        <Metric label="Operating Margin" value={`${h.opMargin.toFixed(0)}%`} good={h.opMargin >= 20} />
        <Metric label="อัตราเก็บเงิน" value={`${(h.cashRate * 100).toFixed(0)}%`} good={h.cashRate >= 0.7} />
        <Metric label="ความครอบคลุมต้นทุน" value={`${(h.revWithCostPct * 100).toFixed(0)}%`} good={h.revWithCostPct >= 0.8} hint={`${h.dealsWithCost}/${h.dealCount} ดีลมีต้นทุน`} />
      </div>

      {/* ธงเตือน */}
      {h.flags.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {h.flags.map((fl, i) => {
            const tone = fl.severity === 'alert' ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400'
              : fl.severity === 'positive' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
            const Icon = fl.severity === 'positive' ? CheckCircle2 : AlertTriangle
            return <div key={i} className={`rounded-xl border p-3 flex items-start gap-2 ${tone}`}><Icon className="h-4 w-4 shrink-0 mt-0.5" /><span className="text-xs font-medium">{fl.text}</span></div>
          })}
        </div>
      )}

      {/* กราฟรายรับ-รายจ่าย-กำไร รายเดือน */}
      <Card title="รายรับ · รายจ่าย · กำไร รายเดือน (ฐานก่อน VAT)" icon={Activity}>
        {monthly.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {monthly.map(m => {
              const pos = m.profit >= 0
              return (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-400 w-14 shrink-0">{m.month}</span>
                  <div className="flex-1 space-y-0.5 min-w-0">
                    <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(m.rev / maxMonthly) * 100}%` }} /></div>
                    <div className="h-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-rose-400 rounded-full" style={{ width: `${(m.exp / maxMonthly) * 100}%` }} /></div>
                  </div>
                  <div className="text-right w-24 sm:w-32 shrink-0">
                    <div className="text-[10px] text-zinc-400 font-mono">฿{fmt(m.rev)} − ฿{fmt(m.exp)}</div>
                    <div className={`text-xs font-bold font-mono ${pos ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>{pos ? '▲' : '▼'} ฿{fmt(Math.abs(m.profit))}</div>
                  </div>
                </div>
              )
            })}
            <div className="flex items-center gap-4 text-[10px] text-zinc-400 pt-1">
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500" /> รายรับ</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-400" /> รายจ่าย</span>
              <span className="ml-auto">▲ กำไร / ▼ ขาดทุน</span>
            </div>
          </div>
        )}
      </Card>

      {/* Operational */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* จำนวนงาน/เดือน */}
        <Card title="จำนวนงานต่อเดือน" icon={Calendar}>
          {monthly.length === 0 ? <Empty /> : (
            <div className="space-y-1.5">
              {monthly.map(m => (
                <div key={m.month} className="flex items-center gap-3">
                  <span className="text-[10px] font-mono text-zinc-400 w-14 shrink-0">{m.month}</span>
                  <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-zinc-700 dark:bg-zinc-300 rounded-full" style={{ width: `${(m.deals / maxDeals) * 100}%` }} /></div>
                  <span className="text-xs font-mono font-bold text-zinc-700 dark:text-zinc-200 w-8 text-right">{m.deals}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ใบเบิก + ตัวเลขย่อ */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Mini icon={Receipt} label="ใบเบิก (ในช่วง)" value={`${claimStats.total}`} sub={`฿${fmt(claimStats.amount)}`} />
            <Mini icon={Users} label="ลูกค้า" value={`${customers}`} sub={`เฉลี่ย ฿${fmt(avgDeal)}/ดีล`} />
          </div>
          <Card title="ใบเบิกแยกสถานะ" icon={Receipt}>
            {claimStats.total === 0 ? <Empty /> : (
              <div className="space-y-1.5">
                {Object.entries(claimStats.byStatus).sort((a, b) => b[1] - a[1]).map(([st, n]) => (
                  <div key={st} className="flex items-center gap-3 text-xs">
                    <span className="text-zinc-500 w-28 truncate">{CLAIM_STATUS_TH[st] || st}</span>
                    <div className="flex-1 h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className={`h-full rounded-full ${st === 'paid' || st === 'refund_confirmed' ? 'bg-emerald-500' : st.startsWith('pending') ? 'bg-amber-400' : 'bg-zinc-400'}`} style={{ width: `${(n / claimStats.total) * 100}%` }} /></div>
                    <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200 w-8 text-right">{n}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}

// ─── sub-components ───
function Kpi({ icon: Icon, label, value, sub, tone, emphatic }: { icon: React.ElementType; label: string; value: string; sub: string; tone: 'emerald' | 'rose'; emphatic?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  return (
    <div className={`rounded-2xl border p-4 sm:p-5 ${emphatic ? (tone === 'emerald' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20') : 'border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900'}`}>
      <div className="flex items-center gap-2 text-zinc-400"><Icon className={`h-4 w-4 ${emphatic ? c : ''}`} /><span className="text-[10px] sm:text-[11px] font-semibold uppercase tracking-wider truncate">{label}</span></div>
      <div className={`text-xl sm:text-2xl font-bold font-mono mt-2 ${emphatic ? c : 'text-zinc-900 dark:text-zinc-100'}`}>{value}</div>
      <div className="text-[10px] sm:text-[11px] text-zinc-400 mt-1 truncate">{sub}</div>
    </div>
  )
}
function Metric({ label, value, good, hint }: { label: string; value: string; good: boolean; hint?: string }) {
  const c = good ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
  return (
    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`text-lg sm:text-xl font-bold font-mono mt-0.5 ${c}`}>{value}</div>
      {hint && <div className="text-[10px] text-zinc-400 truncate">{hint}</div>}
    </div>
  )
}
function Mini({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-center gap-1.5 text-zinc-400"><Icon className="h-3.5 w-3.5" /><span className="text-[10px] font-semibold uppercase tracking-wider truncate">{label}</span></div>
      <div className="text-xl font-bold font-mono mt-1 text-zinc-900 dark:text-zinc-100">{value}</div>
      <div className="text-[10px] text-zinc-400 truncate">{sub}</div>
    </div>
  )
}
function Card({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
      <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2"><Icon className="h-4 w-4 text-zinc-400" /> {title}</h3>
      {children}
    </div>
  )
}
function Empty() { return <p className="text-xs text-zinc-400 py-6 text-center">ไม่มีข้อมูลในช่วงที่เลือก</p> }
