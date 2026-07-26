'use client'

// ============================================================================
// แท็บ "เงินสด & ลูกหนี้" — กระแสเงินสด (booked → เก็บแล้ว → ค้าง) + AR aging + ตารางข้อมูล
// ใช้ compute ร่วมกับแท็บ P&L: buildHealth (booked/collectible/cash/ar/deals) + buildArStatus
// ============================================================================

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { TrendingUp, Banknote, Clock, Hourglass, Search, ExternalLink, Layers } from 'lucide-react'
import {
  type PLLead, type PLClaim, type PLInstallment, type PLJobEvent, type PLCostItem,
  type ArGroup, buildHealth, buildArStatus, fmt, fmtSign, leadDate,
} from './pl/pl-lib'
import { StatCard, InfoTip, Th, Td, INFO } from './components/stat-primitives'

interface Profile { id: string; full_name: string | null; nickname: string | null }
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function monthStartStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01` }
function yearStartStr() { return `${new Date().getFullYear()}-01-01` }

export default function CashArView({ leads, claims, installments, events, costItems, profiles }: {
  leads: PLLead[]; claims: PLClaim[]; installments: PLInstallment[]; events: PLJobEvent[]; costItems: PLCostItem[]; profiles: Profile[]
}) {
  const router = useRouter()
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [q, setQ] = useState('')

  const inRange = (d: string | null) => !!d && (!from || d.slice(0, 10) >= from) && (!to || d.slice(0, 10) <= to)
  const h = useMemo(() => buildHealth(leads, claims, installments, events, costItems, inRange), [leads, claims, installments, events, costItems, from, to])
  const salesName = useMemo(() => { const m = new Map<string, string>(); profiles.forEach(p => m.set(p.id, p.nickname || p.full_name || p.id.slice(0, 6))); return m }, [profiles])
  const ar = useMemo(() => buildArStatus(leads.filter(l => inRange(leadDate(l))), installments, todayStr(), salesName), [leads, installments, salesName, from, to])

  const kw = q.trim().toLowerCase()
  const rows = useMemo(() =>
    h.deals.filter(d => d.outstanding > 0.5 || d.paid > 0)
      .filter(d => !kw || d.name.toLowerCase().includes(kw))
      .sort((a, b) => b.outstanding - a.outstanding)
  , [h.deals, kw])

  return (
    <div className="space-y-5">
      {/* ตัวกรอง */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4 flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ตั้งแต่วันที่</label>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">ถึงวันที่</label>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100" />
        </div>
        <div className="flex items-center gap-1">
          {([['เดือนนี้', monthStartStr], ['ปีนี้', yearStartStr]] as const).map(([label, fn]) => (
            <button key={label} onClick={() => { setFrom(fn()); setTo(todayStr()) }} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800">{label}</button>
          ))}
          <button onClick={() => { setFrom(''); setTo('') }} className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800">ทั้งหมด</button>
        </div>
      </div>

      {/* Segmented bar: booked → เก็บแล้ว / ค้าง (แยกอายุ) */}
      <CashArBar h={h} ar={ar} />

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <StatCard icon={TrendingUp} tone="emerald" label="รายรับรับรู้ (booked, ฐาน)" value={fmtSign(h.revBase)}
          sub={`${h.dealCount} ดีล · รวม VAT ฿${fmt(h.bookedGross)}`} info={INFO.revBase} />
        <StatCard icon={Banknote} tone="sky" label="เงินสดเก็บได้จริง" value={fmtSign(h.cashCollected)}
          sub={`${(h.cashRate * 100).toFixed(0)}% ของยอดที่ต้องเก็บ ฿${fmt(h.collectible)}`}
          info={`${INFO.cashCollected} · ${INFO.collectible}`} />
        <StatCard icon={Clock} tone="amber" label="ลูกหนี้คงค้าง (AR)" value={fmtSign(h.ar)}
          sub={`ยังไม่เก็บ ${((1 - h.cashRate) * 100).toFixed(0)}%`} info={INFO.ar} />
      </div>

      {/* AR aging + แยกเซล/ลูกค้า */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="px-5 py-3 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-zinc-400" />
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">สถานะลูกหนี้ — แยกตามอายุ / เซล / ลูกค้า</h2>
          <span className="ml-auto"><InfoTip text={INFO.arAging} /></span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5 p-4">
          <ArTile label="ยังไม่แบ่งงวด" hint="ยังไม่วางบิล" value={ar.buckets.unscheduled} total={ar.buckets.total} tone="zinc" />
          <ArTile label="รอครบกำหนด" hint="ยังไม่ถึง due" value={ar.buckets.notDue} total={ar.buckets.total} tone="sky" />
          <ArTile label="เลยกำหนด 0-30 วัน" value={ar.buckets.d0_30} total={ar.buckets.total} tone="amber" />
          <ArTile label="เลยกำหนด 31-60 วัน" value={ar.buckets.d31_60} total={ar.buckets.total} tone="orange" />
          <ArTile label="เลยกำหนด 60+ วัน" hint="ต้องตามด่วน" value={ar.buckets.d60plus} total={ar.buckets.total} tone="rose" />
        </div>
        {ar.overdue.length > 0 && (
          <div className="border-t border-zinc-100 dark:border-zinc-800">
            <div className="px-5 py-2 text-[11px] font-semibold uppercase tracking-wider text-rose-500">ดีลที่เลยกำหนดชำระ ({ar.overdue.length})</div>
            <div className="max-h-52 overflow-y-auto divide-y divide-zinc-50 dark:divide-zinc-800/50">
              {ar.overdue.map(o => (
                <div key={o.leadId} onClick={() => router.push(`/crm/${o.leadId}`)} className="flex items-center gap-3 px-5 py-2 hover:bg-rose-50/40 dark:hover:bg-rose-950/10 cursor-pointer">
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
          <ArRank title="AR ตามเซล" rows={ar.bySales} />
          <ArRank title="AR ตามลูกค้า (Top)" rows={ar.byCustomer} limit={8} />
        </div>
      </div>

      {/* ตารางข้อมูลลูกหนี้รายดีล + search */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-3 border-b border-zinc-100 dark:border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">ตารางข้อมูล — เก็บแล้ว / คงค้าง รายดีล</h2>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาดีล/ลูกค้า..." className="h-9 w-full pl-8 pr-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
          </div>
        </div>
        <div className="overflow-x-auto max-h-[32rem] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-zinc-900 z-10">
              <tr className="text-[11px] uppercase tracking-wider text-zinc-400 border-b border-zinc-100 dark:border-zinc-800">
                <th className="text-left font-semibold px-5 py-2.5">ดีล</th>
                <Th>ยอดที่ต้องเก็บ</Th><Th>เก็บแล้ว</Th><Th>คงค้าง</Th><Th>% เก็บ</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {rows.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-zinc-400 font-sans">{kw ? 'ไม่พบรายการ' : 'ไม่มีข้อมูล'}</td></tr>}
              {rows.map(d => (
                <tr key={d.leadId} onClick={() => router.push(`/crm/${d.leadId}`)} className={`border-b border-zinc-50 dark:border-zinc-800/50 hover:bg-zinc-50 dark:hover:bg-zinc-800/30 cursor-pointer ${d.outstanding > 0.5 ? '' : 'opacity-60'}`}>
                  <td className="px-5 py-2.5 font-sans">
                    <div className="text-zinc-700 dark:text-zinc-200 truncate max-w-[280px]">{d.name}</div>
                    <div className={`text-[10px] ${d.status === 'success' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{d.status === 'success' ? 'เสร็จสิ้น' : 'เครดิต'}</div>
                  </td>
                  <Td muted>฿{fmt(d.receivable)}</Td>
                  <Td tone="emerald">฿{fmt(d.paid)}</Td>
                  <Td tone={d.outstanding > 0.5 ? 'rose' : undefined} strong={d.outstanding > 0.5} muted={d.outstanding <= 0.5}>{d.outstanding > 0.5 ? `฿${fmt(d.outstanding)}` : '✓ ครบ'}</Td>
                  <Td muted>{d.receivable > 0 ? `${((d.paid / d.receivable) * 100).toFixed(0)}%` : '—'}</Td>
                  <td className="px-3 text-right"><ExternalLink className="h-3.5 w-3.5 text-zinc-300 dark:text-zinc-600 inline" /></td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/40 font-bold">
                  <td className="px-5 py-3 font-sans text-zinc-900 dark:text-zinc-100">รวม {rows.length} ดีล</td>
                  <Td muted>฿{fmt(rows.reduce((s, d) => s + d.receivable, 0))}</Td>
                  <Td tone="emerald">฿{fmt(rows.reduce((s, d) => s + d.paid, 0))}</Td>
                  <Td tone="rose">฿{fmt(rows.reduce((s, d) => s + d.outstanding, 0))}</Td>
                  <Td /><td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── sub-components ───
function CashArBar({ h, ar }: { h: ReturnType<typeof buildHealth>; ar: ReturnType<typeof buildArStatus> }) {
  const total = h.collectible || 1
  const cashPct = (h.cashCollected / total) * 100
  const segs = [
    { label: 'ยังไม่แบ่งงวด', value: ar.buckets.unscheduled, color: 'bg-zinc-400' },
    { label: 'รอครบกำหนด', value: ar.buckets.notDue, color: 'bg-sky-400' },
    { label: 'เลยกำหนด ≤30', value: ar.buckets.d0_30, color: 'bg-amber-400' },
    { label: 'เลยกำหนด ≤60', value: ar.buckets.d31_60, color: 'bg-orange-400' },
    { label: 'เลยกำหนด 60+', value: ar.buckets.d60plus, color: 'bg-rose-500' },
  ].filter(s => s.value > 0)
  const arTotal = ar.buckets.total || 1

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-zinc-400" />
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">กระแสเงินสด · ยอดที่ต้องเก็บ ฿{fmt(h.collectible)} (สุทธิหลัง VAT/WHT)</h2>
        <span className="ml-auto"><InfoTip text={`${INFO.collectible} · ${INFO.cashCollected} · ${INFO.ar}`} /></span>
      </div>

      {/* แท่งหลัก: เก็บแล้ว vs ค้าง */}
      <div>
        <div className="flex h-6 rounded-lg overflow-hidden bg-zinc-100 dark:bg-zinc-800">
          <div className="bg-emerald-500 flex items-center justify-center" style={{ width: `${cashPct}%` }}>
            {cashPct > 12 && <span className="text-[10px] font-bold text-white font-mono">฿{fmt(h.cashCollected)}</span>}
          </div>
          <div className="bg-amber-400 flex items-center justify-center" style={{ width: `${100 - cashPct}%` }}>
            {100 - cashPct > 12 && <span className="text-[10px] font-bold text-white font-mono">฿{fmt(h.ar)}</span>}
          </div>
        </div>
        <div className="flex justify-between text-[11px] mt-1">
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold">● เก็บแล้ว {cashPct.toFixed(0)}%</span>
          <span className="text-amber-600 dark:text-amber-400 font-semibold">ค้าง {(100 - cashPct).toFixed(0)}% ●</span>
        </div>
      </div>

      {/* แท่งย่อย: ค้างแยกอายุ */}
      {segs.length > 0 && (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">ลูกหนี้คงค้าง ฿{fmt(ar.buckets.total)} แยกตามอายุ</div>
          <div className="flex h-3 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
            {segs.map(s => <div key={s.label} className={s.color} style={{ width: `${(s.value / arTotal) * 100}%` }} title={`${s.label} ฿${fmt(s.value)}`} />)}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
            {segs.map(s => (
              <span key={s.label} className="flex items-center gap-1 text-[10px] text-zinc-500">
                <span className={`h-2 w-2 rounded-sm ${s.color}`} /> {s.label} <span className="font-mono text-zinc-700 dark:text-zinc-300">฿{fmt(s.value)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="text-[10px] text-zinc-400 border-t border-zinc-100 dark:border-zinc-800 pt-2">
        รายรับรับรู้ (ฐานก่อน VAT) ฿{fmt(h.revBase)} · VAT ฿{fmt(h.revVat)} · WHT ฿{fmt(h.revWht)} · รวมออกบิล ฿{fmt(h.bookedGross)}
      </div>
    </div>
  )
}

// ── ช่องอายุหนี้ (เฉพาะหน้านี้) — ภาษาภาพเดียวกับ StatCard: ไล่เฉด ขอบสี ตัวเลข tabular-nums
// คลาสสีเขียนเป็น literal ทั้งหมด (Tailwind JIT อ่าน string ที่ประกอบตอน runtime ไม่ได้)
const AR_TONES: Record<string, { tint: string; text: string; border: string; bar: string }> = {
  zinc: { tint: 'from-zinc-100 to-zinc-50/40 dark:from-zinc-800/60 dark:to-zinc-900', text: 'text-zinc-700 dark:text-zinc-200', border: 'border-zinc-300 dark:border-zinc-700', bar: 'bg-zinc-400' },
  sky: { tint: 'from-sky-100 to-sky-50/40 dark:from-sky-950/50 dark:to-zinc-900', text: 'text-sky-700 dark:text-sky-300', border: 'border-sky-300 dark:border-sky-800', bar: 'bg-sky-400' },
  amber: { tint: 'from-amber-100 to-amber-50/40 dark:from-amber-950/50 dark:to-zinc-900', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-800', bar: 'bg-amber-400' },
  orange: { tint: 'from-orange-100 to-orange-50/40 dark:from-orange-950/50 dark:to-zinc-900', text: 'text-orange-700 dark:text-orange-300', border: 'border-orange-300 dark:border-orange-800', bar: 'bg-orange-400' },
  rose: { tint: 'from-rose-100 to-rose-50/40 dark:from-rose-950/50 dark:to-zinc-900', text: 'text-rose-700 dark:text-rose-300', border: 'border-rose-300 dark:border-rose-800', bar: 'bg-rose-500' },
}

function ArTile({ label, hint, value, total, tone }: { label: string; hint?: string; value: number; total: number; tone: keyof typeof AR_TONES }) {
  const pct = total > 0 ? (value / total) * 100 : 0
  const c = AR_TONES[tone]
  return (
    <div className={`rounded-2xl border-2 bg-gradient-to-br p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${c.tint} ${c.border}`}>
      <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 leading-tight">{label}</div>
      {hint && <div className="text-[9px] text-zinc-400">{hint}</div>}
      <div className={`text-lg sm:text-xl font-extrabold tabular-nums tracking-tight mt-1 ${c.text}`}>฿{fmt(value)}</div>
      <div className="h-1 bg-black/5 dark:bg-white/10 rounded-full overflow-hidden mt-1.5"><div className={`h-full rounded-full ${c.bar}`} style={{ width: `${pct}%` }} /></div>
      <div className="text-[9px] text-zinc-400 mt-0.5 tabular-nums">{pct.toFixed(0)}%</div>
    </div>
  )
}

function ArRank({ title, rows, limit }: { title: string; rows: ArGroup[]; limit?: number }) {
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
              <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200 shrink-0">฿{fmt(r.ar)}{r.overdue > 0 && <span className="ml-1.5 text-[10px] text-rose-500">เลยกำหนด ฿{fmt(r.overdue)}</span>}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden"><div className="h-full bg-amber-400 rounded-full" style={{ width: `${(r.ar / max) * 100}%` }} /></div>
          </div>
        ))}
        {limit && rows.length > limit && <div className="text-[10px] text-zinc-400 pt-0.5">+ อีก {rows.length - limit} ราย</div>}
      </div>
    </div>
  )
}
