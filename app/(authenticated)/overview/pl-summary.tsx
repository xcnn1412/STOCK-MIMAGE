'use client'

// ============================================================================
// แท็บ "งบกำไร-ขาดทุน" = Dashboard สุขภาพการเงิน
// รวม CRM (รายรับ/เงินสด/ลูกหนี้) + ใบเบิก (ต้นทุน direct/overhead) ในมุมเดียว
// คลิกแถวงวด → /overview/pl/[period] ดูรายละเอียด · คลิกดีล → /crm/[id]
// ============================================================================

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  TrendingUp, TrendingDown, Wallet, ArrowDownRight, ChevronRight,
  Banknote, Clock, Activity, AlertTriangle, CheckCircle2, Layers, ExternalLink, Hourglass,
} from 'lucide-react'
import {
  type PLLead, type PLClaim, type PLInstallment, type PLJobEvent, type PLCostItem, type Ladder, type DealPL, type ArGroup,
  newLadder, pushLadder, calcTax, claimEffective, num,
  isRevLead, leadDate, claimDate, leadAmount, groupKey, fmt, fmtSign, buildHealth, buildArStatus,
  type GroupBy,
} from './pl/pl-lib'

function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function monthStartStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function yearStartStr() { return `${new Date().getFullYear()}-01-01` }

interface Profile { id: string; full_name: string | null; nickname: string | null }

export default function PLSummary({ leads, claims, installments, events, costItems, profiles }: {
  leads: PLLead[]; claims: PLClaim[]; installments: PLInstallment[]; events: PLJobEvent[]; costItems: PLCostItem[]; profiles: Profile[]
}) {
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [groupBy, setGroupBy] = useState<GroupBy>('month')

  const inRange = (d: string | null) => !!d && (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to)

  const h = useMemo(() => buildHealth(leads, claims, installments, events, costItems, inRange), [leads, claims, installments, events, costItems, from, to])

  const salesName = useMemo(() => {
    const m = new Map<string, string>()
    profiles.forEach(p => m.set(p.id, p.nickname || p.full_name || p.id.slice(0, 6)))
    return m
  }, [profiles])

  // สถานะลูกหนี้ (snapshot) — ดีลรายรับที่อยู่ในช่วงที่เลือก, อายุหนี้คิด ณ วันนี้
  const ar = useMemo(() => buildArStatus(leads.filter(l => inRange(leadDate(l))), installments, todayStr(), salesName), [leads, installments, salesName, from, to])

  // Planned vs Actual — เฉพาะดีลที่มีทั้งต้นทุนประเมิน + จ่ายจริง
  const cmp = useMemo(() => {
    const list = h.deals.filter(d => d.hasPlan && d.hasCost)
    const planned = list.reduce((s, d) => s + d.planned, 0)
    const actual = list.reduce((s, d) => s + d.cost, 0)
    return { n: list.length, planned, actual, variance: actual - planned }
  }, [h.deals])

  // เทรนด์รายงวด (รายรับฐาน vs รายจ่ายฐาน) — สำหรับตารางคลิกดูรายละเอียด
  const periodRows = useMemo(() => {
    const rows = new Map<string, { rev: Ladder; exp: Ladder }>()
    const R = (k: string) => { let r = rows.get(k); if (!r) { r = { rev: newLadder(), exp: newLadder() }; rows.set(k, r) } return r }
    for (const l of leads) {
      if (!isRevLead(l)) continue
      const d = leadDate(l); if (!inRange(d)) continue
      const amount = leadAmount(l); if (amount <= 0) continue
      pushLadder(R(groupKey(d!, groupBy)).rev, calcTax(amount, l.vat_mode || 'none', num(l.wht_rate)), amount)
    }
    for (const c of claims) {
      if (c.status === 'rejected' || c.status === 'cancelled') continue
      const d = claimDate(c); if (!inRange(d)) continue
      const amount = claimEffective(c); if (amount <= 0) continue
      pushLadder(R(groupKey(d!, groupBy)).exp, calcTax(amount, c.vat_mode || 'none', num(c.withholding_tax_rate)), amount)
    }
    return Array.from(rows.entries()).sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => ({ key: k, rev: v.rev, exp: v.exp, profit: v.rev.base - v.exp.base }))
  }, [leads, claims, from, to, groupBy])

  const maxBase = Math.max(...periodRows.map(r => Math.max(r.rev.base, r.exp.base)), 1)
  const isProfit = h.operatingProfit >= 0

  return (
    <div className="space-y-5">
      {/* ── ตัวกรอง ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ตั้งแต่วันที่</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ถึงวันที่</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="flex items-center gap-1">
          {([['เดือนนี้', monthStartStr], ['ปีนี้', yearStartStr]] as const).map(([label, fn]) => (
            <button key={label} onClick={() => { setFrom(fn()); setTo(todayStr()) }}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">{label}</button>
          ))}
          <button onClick={() => { setFrom(''); setTo('') }}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">ทั้งหมด</button>
        </div>
        <div className="ml-auto flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-lg">
          {([['day', 'รายวัน'], ['month', 'รายเดือน'], ['year', 'รายปี']] as const).map(([g, label]) => (
            <button key={g} onClick={() => setGroupBy(g)}
              className={`px-3 h-7 rounded-md text-xs font-semibold transition-colors ${groupBy === g ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* ── ธงเตือนสุขภาพการเงิน ── */}
      {h.flags.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {h.flags.map((fl, i) => {
            const tone = fl.severity === 'alert' ? 'border-rose-200 dark:border-rose-900/50 bg-rose-50/60 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400'
              : fl.severity === 'positive' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400'
              : 'border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'
            const Icon = fl.severity === 'positive' ? CheckCircle2 : AlertTriangle
            return (
              <div key={i} className={`rounded-xl border p-3 flex items-start gap-2 ${tone}`}>
                <Icon className="h-4 w-4 shrink-0 mt-0.5" />
                <span className="text-xs font-medium">{fl.text}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── เงินสด vs กำไร ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard icon={TrendingUp} tone="emerald" label="รายรับรับรู้ (booked, ฐาน)"
          value={h.revBase} sub={`${h.dealCount} ดีล · รวม VAT ฿${fmt(h.bookedGross)}`} />
        <SummaryCard icon={Banknote} tone="emerald" label="เงินสดเก็บได้จริง"
          value={h.cashCollected} sub={`${(h.cashRate * 100).toFixed(0)}% ของยอดที่รับรู้`} />
        <SummaryCard icon={Clock} tone="rose" label="ลูกหนี้คงค้าง (AR)"
          value={h.ar} sub={`ยังไม่เก็บ ${((1 - h.cashRate) * 100).toFixed(0)}%`} />
      </div>

      {/* ── สถานะลูกหนี้ (AR) ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-zinc-400" /> สถานะลูกหนี้ (AR) — แยกตามอายุ / เซล / ลูกค้า
          </h2>
          <span className="text-[11px] text-zinc-400">ณ {todayStr()}</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-zinc-100 dark:bg-zinc-800">
          <ArTile label="ยังไม่แบ่งงวด" hint="ยังไม่วางบิล" value={ar.buckets.unscheduled} total={ar.buckets.total} tone="text-zinc-700 dark:text-zinc-200" bar="bg-zinc-400" emphatic />
          <ArTile label="รอครบกำหนด" hint="ยังไม่ถึง due" value={ar.buckets.notDue} total={ar.buckets.total} tone="text-sky-600 dark:text-sky-400" bar="bg-sky-400" />
          <ArTile label="เลยกำหนด 0-30 วัน" value={ar.buckets.d0_30} total={ar.buckets.total} tone="text-amber-600 dark:text-amber-400" bar="bg-amber-400" />
          <ArTile label="เลยกำหนด 31-60 วัน" value={ar.buckets.d31_60} total={ar.buckets.total} tone="text-orange-600 dark:text-orange-400" bar="bg-orange-400" />
          <ArTile label="เลยกำหนด 60+ วัน" hint="ต้องตามด่วน" value={ar.buckets.d60plus} total={ar.buckets.total} tone="text-rose-600 dark:text-rose-400" bar="bg-rose-500" emphatic={ar.buckets.d60plus > 0} />
        </div>
        {ar.overdue.length > 0 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-rose-500">ดีลที่เลยกำหนดชำระ ({ar.overdue.length})</div>
            <div className="max-h-60 overflow-y-auto divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {ar.overdue.map(o => (
                <div key={o.leadId} onClick={() => router.push(`/crm/${o.leadId}`)}
                  className="flex items-center gap-3 px-5 py-2 hover:bg-rose-50/40 dark:hover:bg-rose-950/10 cursor-pointer">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-zinc-700 dark:text-zinc-200 truncate">{o.name}</div>
                    <div className="text-[10px] text-rose-500">เลยกำหนด {o.daysOverdue} วัน · due {o.dueDate}</div>
                  </div>
                  <div className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 shrink-0">฿{fmt(o.amount)}</div>
                  <ExternalLink className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 shrink-0" />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-zinc-100 dark:bg-zinc-800 border-t border-zinc-100 dark:border-zinc-800">
          <ArRank title="AR ตามเซล" rows={ar.bySales} total={ar.buckets.total} />
          <ArRank title="AR ตามลูกค้า (Top)" rows={ar.byCustomer} total={ar.buckets.total} limit={8} />
        </div>
      </div>

      {/* ── Scorecard ── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
        <Metric label="Gross Margin" value={`${h.grossMargin.toFixed(0)}%`} good={h.grossMargin >= 40} />
        <Metric label="Operating Margin" value={`${h.opMargin.toFixed(0)}%`} good={h.opMargin >= 20} />
        <Metric label="อัตราเก็บเงิน" value={`${(h.cashRate * 100).toFixed(0)}%`} good={h.cashRate >= 0.7} />
        <Metric label="ความครอบคลุมต้นทุน" value={`${(h.revWithCostPct * 100).toFixed(0)}%`} good={h.revWithCostPct >= 0.8}
          hint={`${h.dealsWithCost}/${h.dealCount} ดีลมีต้นทุน`} />
        <Metric label="Overhead Ratio" value={`${(h.overheadRatio * 100).toFixed(0)}%`} good={h.overheadRatio <= 0.5} invert />
      </div>

      {/* ── งบกำไร-ขาดทุน 2 ชั้น ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
          <Layers className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">งบกำไร-ขาดทุน (แยกต้นทุนตรง / overhead)</h2>
        </div>
        <table className="w-full text-sm">
          <tbody className="font-mono">
            <PLLine label="รายรับ (ฐานก่อน VAT)" value={h.revBase} tone="emerald" />
            <PLLine label="− ต้นทุนตรงของงาน (ใบเบิกผูกดีล)" value={-h.directCost} />
            <PLLine label="= กำไรขั้นต้น" value={h.grossProfit} strong sub={`Margin ${h.grossMargin.toFixed(1)}%`} />
            <PLLine label="− ค่าใช้จ่าย Office / Overhead" value={-h.overhead} />
            <PLLine label="= กำไรดำเนินงาน" value={h.operatingProfit} strong emphatic
              tone={isProfit ? 'emerald' : 'rose'} sub={`Margin ${h.opMargin.toFixed(1)}%`} />
          </tbody>
        </table>
        <p className="px-5 py-2.5 text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800">
          ฐานก่อน VAT · VAT ฿{fmt(h.revVat)} / WHT ฿{fmt(h.revWht)} แยกไว้ไม่รวมกำไร · ต้นทุนคิดจากใบเบิกจริง (เงินออกจริง)
        </p>
      </div>

      {/* ── เทรนด์ราย วัน/เดือน/ปี (คลิกดูรายละเอียด) ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
            <Activity className="h-4 w-4 text-zinc-400" /> เทรนด์{groupBy === 'day' ? 'รายวัน' : groupBy === 'month' ? 'รายเดือน' : 'รายปี'}
          </h2>
          <span className="text-[11px] text-zinc-400">{periodRows.length} งวด · คลิกแถวเพื่อดูรายละเอียด</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left font-semibold px-5 py-2.5">งวด</th>
                <Th>เทียบรับ-จ่าย</Th><Th>รายรับ (ฐาน)</Th><Th>รายจ่าย (ฐาน)</Th><Th>กำไร/ขาดทุน</Th><Th>Margin</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {periodRows.length === 0 && <tr><td colSpan={7} className="px-5 py-8 text-center text-zinc-400 font-sans">ไม่มีข้อมูลในช่วงที่เลือก</td></tr>}
              {periodRows.map(r => {
                const margin = r.rev.base > 0 ? (r.profit / r.rev.base) * 100 : 0
                const pos = r.profit >= 0
                return (
                  <tr key={r.key} onClick={() => router.push(`/overview/pl/${r.key}`)}
                    className="border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer">
                    <td className="px-5 py-2.5 font-sans font-medium text-zinc-700 dark:text-zinc-300">{r.key}</td>
                    <td className="px-5 py-2.5 w-[160px]">
                      <div className="space-y-1">
                        <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(r.rev.base / maxBase) * 100}%` }} /></div>
                        <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-rose-400 rounded-full" style={{ width: `${(r.exp.base / maxBase) * 100}%` }} /></div>
                      </div>
                    </td>
                    <Td>฿{fmt(r.rev.base)}</Td>
                    <Td>฿{fmt(r.exp.base)}</Td>
                    <Td tone={pos ? 'emerald' : 'rose'} strong>{pos ? '▲' : '▼'} {fmtSign(r.profit)}</Td>
                    <Td tone={pos ? 'emerald' : 'rose'}>{r.rev.base > 0 ? `${margin.toFixed(0)}%` : '—'}</Td>
                    <td className="px-3 text-right"><ChevronRight className="h-4 w-4 text-zinc-300 dark:text-zinc-600 inline" /></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── กำไรต่อดีล (per-deal P&L) ── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">กำไรต่อดีล · ประเมิน vs จ่ายจริง</h2>
          <span className="text-[11px] text-zinc-400">{h.deals.length} ดีล · คลิกเพื่อเปิด CRM</span>
        </div>
        {/* สรุป Planned vs Actual (เฉพาะดีลที่เทียบได้) */}
        {cmp.n > 0 && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 px-5 py-2.5 bg-zinc-50 dark:bg-zinc-800/40 text-xs border-b border-zinc-100 dark:border-zinc-800">
            <span className="text-zinc-500">เทียบได้ <b className="text-zinc-700 dark:text-zinc-200">{cmp.n}</b> ดีล:</span>
            <span className="font-mono text-zinc-500">ประเมิน <b className="text-zinc-700 dark:text-zinc-200">฿{fmt(cmp.planned)}</b></span>
            <span className="font-mono text-zinc-500">จ่ายจริง <b className="text-zinc-700 dark:text-zinc-200">฿{fmt(cmp.actual)}</b></span>
            <span className={`font-mono font-bold ${cmp.variance > 0 ? 'text-rose-500 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
              ส่วนต่าง {cmp.variance > 0 ? '+' : ''}{fmtSign(cmp.variance)} {cmp.variance > 0 ? '(จ่ายเกินประเมิน)' : '(ต่ำกว่าประเมิน)'}
            </span>
          </div>
        )}
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-zinc-900 z-10">
              <tr className="text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left font-semibold px-5 py-2.5">ดีล</th>
                <Th>รายรับ (ฐาน)</Th><Th>ประเมิน</Th><Th>จ่ายจริง</Th><Th>ส่วนต่าง</Th><Th>กำไร</Th><Th>Margin</Th><Th>เก็บ / ค้าง</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {h.deals.length === 0 && <tr><td colSpan={9} className="px-5 py-8 text-center text-zinc-400 font-sans">ไม่มีดีลในช่วงที่เลือก</td></tr>}
              {h.deals.map(d => <DealRow key={d.leadId} d={d} onClick={() => router.push(`/crm/${d.leadId}`)} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── sub-components ───
function Th({ children }: { children?: React.ReactNode }) {
  return <th className="text-right font-semibold px-5 py-2.5 whitespace-nowrap">{children}</th>
}
function Td({ children, tone, strong, muted }: { children: React.ReactNode; tone?: 'emerald' | 'rose'; strong?: boolean; muted?: boolean }) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'rose' ? 'text-rose-500 dark:text-rose-400'
    : muted ? 'text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'
  return <td className={`text-right px-5 py-2.5 whitespace-nowrap ${strong ? 'font-bold' : ''} ${c}`}>{children}</td>
}

function PLLine({ label, value, tone, strong, emphatic, sub }: {
  label: string; value: number; tone?: 'emerald' | 'rose'; strong?: boolean; emphatic?: boolean; sub?: string
}) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400'
    : tone === 'rose' ? 'text-rose-500 dark:text-rose-400'
    : value < 0 ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-700 dark:text-zinc-300'
  return (
    <tr className={`border-b border-zinc-50 dark:border-zinc-800/50 ${emphatic ? (value >= 0 ? 'bg-emerald-50/50 dark:bg-emerald-950/20' : 'bg-rose-50/50 dark:bg-rose-950/20') : strong ? 'bg-zinc-50/60 dark:bg-zinc-800/30' : ''}`}>
      <td className={`px-5 py-2.5 font-sans ${strong ? 'font-bold text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-300'}`}>
        {label}{sub && <span className="ml-2 text-[10px] font-mono text-zinc-400">{sub}</span>}
      </td>
      <td className={`text-right px-5 py-2.5 font-mono whitespace-nowrap ${strong ? 'font-bold text-base' : ''} ${c}`}>{fmtSign(value)}</td>
    </tr>
  )
}

function ArRank({ title, rows, total, limit }: { title: string; rows: ArGroup[]; total: number; limit?: number }) {
  const shown = limit ? rows.slice(0, limit) : rows
  const max = Math.max(...rows.map(r => r.ar), 1)
  return (
    <div className="bg-white dark:bg-zinc-900 p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2.5">{title}</div>
      <div className="space-y-2">
        {shown.length === 0 && <div className="text-xs text-zinc-400">—</div>}
        {shown.map(r => (
          <div key={r.key} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-zinc-600 dark:text-zinc-300 truncate min-w-0">{r.name} <span className="text-[10px] text-zinc-400">· {r.count}</span></span>
              <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200 shrink-0">
                ฿{fmt(r.ar)}
                {r.overdue > 0 && <span className="ml-1.5 text-[10px] text-rose-500">เลยกำหนด ฿{fmt(r.overdue)}</span>}
              </span>
            </div>
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(r.ar / max) * 100}%` }} />
            </div>
          </div>
        ))}
        {limit && rows.length > limit && <div className="text-[10px] text-zinc-400 pt-0.5">+ อีก {rows.length - limit} ราย</div>}
      </div>
    </div>
  )
}
function ArTile({ label, hint, value, total, tone, bar, emphatic }: {
  label: string; hint?: string; value: number; total: number; tone: string; bar: string; emphatic?: boolean
}) {
  const pct = total > 0 ? (value / total) * 100 : 0
  return (
    <div className={`p-3 ${emphatic ? 'bg-zinc-50 dark:bg-zinc-800/50' : 'bg-white dark:bg-zinc-900'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400 leading-tight">{label}</div>
      {hint && <div className="text-[9px] text-zinc-400">{hint}</div>}
      <div className={`text-base font-bold font-mono mt-1 ${tone}`}>฿{fmt(value)}</div>
      <div className="h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden mt-1.5">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="text-[9px] text-zinc-400 mt-0.5">{pct.toFixed(0)}%</div>
    </div>
  )
}
function Metric({ label, value, good, invert, hint }: { label: string; value: string; good: boolean; invert?: boolean; hint?: string }) {
  const c = good ? 'text-emerald-600 dark:text-emerald-400' : invert ? 'text-amber-600 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'
  return (
    <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`text-xl font-bold font-mono mt-0.5 ${c}`}>{value}</div>
      {hint && <div className="text-[10px] text-zinc-400">{hint}</div>}
    </div>
  )
}

function DealRow({ d, onClick }: { d: DealPL; onClick: () => void }) {
  const loss = d.hasCost && d.profit < 0
  const statusLabel = d.status === 'success' ? 'เสร็จสิ้น' : 'เครดิต'
  const canCompare = d.hasPlan && d.hasCost
  return (
    <tr onClick={onClick}
      className={`border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer ${loss ? 'bg-rose-50/40 dark:bg-rose-950/10' : ''}`}>
      <td className="px-5 py-2.5 font-sans">
        <div className="text-zinc-700 dark:text-zinc-200 truncate max-w-[260px]">{d.name}</div>
        <div className="text-[10px]">
          <span className={d.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{statusLabel}</span>
          {!d.hasCost && <span className="ml-1.5 text-zinc-400">· ยังไม่มีต้นทุน</span>}
        </div>
      </td>
      <Td>฿{fmt(d.revenueBase)}</Td>
      <Td muted>{d.hasPlan ? `฿${fmt(d.planned)}` : '—'}</Td>
      <Td muted={!d.hasCost}>{d.hasCost ? `฿${fmt(d.cost)}` : '—'}</Td>
      <Td tone={!canCompare ? undefined : d.variance > 0 ? 'rose' : 'emerald'} muted={!canCompare}>
        {canCompare ? `${d.variance > 0 ? '+' : ''}${fmtSign(d.variance)}` : '—'}
      </Td>
      <Td tone={!d.hasCost ? undefined : d.profit >= 0 ? 'emerald' : 'rose'} strong={d.hasCost} muted={!d.hasCost}>
        {d.hasCost ? fmtSign(d.profit) : '—'}
      </Td>
      <Td tone={!d.hasCost ? undefined : d.profit >= 0 ? 'emerald' : 'rose'} muted={!d.hasCost}>
        {d.hasCost ? `${d.margin.toFixed(0)}%` : '—'}
      </Td>
      <td className="text-right px-5 py-2.5 whitespace-nowrap font-mono text-[11px]">
        <span className="text-emerald-600 dark:text-emerald-400">฿{fmt(d.paid)}</span>
        <span className="text-zinc-400"> / </span>
        <span className="text-amber-600 dark:text-amber-400">฿{fmt(d.outstanding)}</span>
      </td>
      <td className="px-3 text-right"><ExternalLink className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 inline" /></td>
    </tr>
  )
}

function SummaryCard({ icon: Icon, label, value, sub, tone }: {
  icon: React.ElementType; label: string; value: number; sub: string; tone: 'emerald' | 'rose'
}) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  return (
    <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon className={`h-4 w-4 ${c}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono mt-2 ${c}`}>{fmtSign(value)}</div>
      <div className="text-[11px] text-zinc-400 mt-1">{sub}</div>
    </div>
  )
}
