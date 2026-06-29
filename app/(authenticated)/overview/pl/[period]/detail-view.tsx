'use client'

// หน้ารายละเอียด P&L ราย period (วัน/เดือน/ปี) — เปิดจากการคลิกแถวในแท็บ "งบกำไร-ขาดทุน"
// period เป็น prefix ของวันที่ ISO: "2026" (ปี) / "2026-03" (เดือน) / "2026-03-15" (วัน)

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, TrendingUp, TrendingDown, Wallet, ArrowDownRight, Search, X, Banknote, ExternalLink,
} from 'lucide-react'
import {
  type PLLead, type PLClaim, type PLInstallment, type LineItem, type Slice,
  collectPeriod, buildPaidByLead, fmt, fmtSign, CLAIM_TYPE_LABEL,
} from '../pl-lib'

// ป้าย + สีของสถานะการจ่ายใบเบิก
const STATUS_META: Record<string, { label: string; color: string }> = {
  paid: { label: 'จ่ายแล้ว', color: 'bg-emerald-500' },
  refund_confirmed: { label: 'คืนเงินแล้ว', color: 'bg-emerald-400' },
  approved: { label: 'อนุมัติแล้ว', color: 'bg-sky-400' },
  waiting_tax_invoice: { label: 'รอใบกำกับภาษี', color: 'bg-orange-400' },
  pending: { label: 'รอจ่าย', color: 'bg-amber-400' },
  pending_month_end: { label: 'รอสิ้นเดือน', color: 'bg-amber-300' },
  submitted: { label: 'ส่งแล้ว', color: 'bg-zinc-400' },
  draft: { label: 'ร่าง', color: 'bg-zinc-300' },
  unknown: { label: 'ไม่ระบุสถานะ', color: 'bg-zinc-300' },
}
const PAID_STATUSES = new Set(['paid', 'refund_confirmed'])
const TYPE_COLOR: Record<string, string> = { event: 'bg-rose-400', advance: 'bg-purple-400', other: 'bg-zinc-400' }

function periodLabel(p: string) {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.']
  if (p.length === 4) return `ปี ${p}`
  if (p.length === 7) { const [y, m] = p.split('-'); return `${months[Number(m) - 1] || m} ${y}` }
  if (p.length === 10) { const [y, m, d] = p.split('-'); return `${Number(d)} ${months[Number(m) - 1] || m} ${y}` }
  return p
}

type TabKey = 'credit' | 'done' | 'expense'
const TONES = {
  credit: { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500', soft: 'bg-amber-50 dark:bg-amber-950/20', ring: 'ring-amber-500/30' },
  done: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500', soft: 'bg-emerald-50 dark:bg-emerald-950/20', ring: 'ring-emerald-500/30' },
  expense: { text: 'text-rose-500 dark:text-rose-400', bg: 'bg-rose-400', soft: 'bg-rose-50 dark:bg-rose-950/20', ring: 'ring-rose-500/30' },
}

export default function PLDetailView({ period, leads, claims, installments }: {
  period: string; leads: PLLead[]; claims: PLClaim[]; installments: PLInstallment[]
}) {
  const paidByLead = useMemo(() => buildPaidByLead(leads, installments), [leads, installments])
  const d = useMemo(() => collectPeriod(leads, claims, (date) => date.startsWith(period), paidByLead), [leads, claims, period, paidByLead])

  const [tab, setTab] = useState<TabKey>('done')
  const [search, setSearch] = useState('')

  const profitBase = d.rev.base - d.exp.base
  const cashNet = d.rev.net - d.exp.net
  const margin = d.rev.base > 0 ? (profitBase / d.rev.base) * 100 : 0
  const isProfit = profitBase >= 0
  const creditBase = d.credit.reduce((s, i) => s + i.base, 0)
  const doneBase = d.done.reduce((s, i) => s + i.base, 0)

  const tabs: { key: TabKey; label: string; items: LineItem[]; total: number }[] = [
    { key: 'done', label: 'เสร็จสิ้น', items: d.done, total: doneBase },
    { key: 'credit', label: 'เครดิต', items: d.credit, total: creditBase },
    { key: 'expense', label: 'รายจ่าย', items: d.expItems, total: d.exp.base },
  ]
  const active = tabs.find(t => t.key === tab)!
  const q = search.trim().toLowerCase()
  const shown = q ? active.items.filter(i => i.name.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q)) : active.items
  const shownTotal = shown.reduce((s, i) => s + i.base, 0)

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/overview" className="flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
          <ArrowLeft className="h-4 w-4" /> กลับ
        </Link>
        <div className="h-4 w-px bg-zinc-200 dark:bg-zinc-700" />
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-zinc-900 dark:text-zinc-100">งบกำไร-ขาดทุน</h1>
          <p className="text-xs text-zinc-400">{periodLabel(period)}</p>
        </div>
        <div className={`ml-auto px-3 py-1.5 rounded-full text-sm font-bold font-mono ${isProfit ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
          {isProfit ? '▲ กำไร' : '▼ ขาดทุน'} {fmtSign(profitBase)} · {margin.toFixed(0)}%
        </div>
      </div>

      {/* การ์ดสรุป */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <SummaryCard icon={TrendingUp} tone="emerald" label="รายรับ (ฐานก่อน VAT)"
          value={d.rev.base} sub={`${d.rev.count} ดีล · สุทธิ ฿${fmt(d.rev.net)}`} />
        <SummaryCard icon={TrendingDown} tone="rose" label="รายจ่าย (ฐานก่อน VAT)"
          value={d.exp.base} sub={`${d.exp.count} ใบเบิก · สุทธิ ฿${fmt(d.exp.net)}`} />
        <SummaryCard icon={isProfit ? Wallet : ArrowDownRight} tone={isProfit ? 'emerald' : 'rose'} emphatic
          label={isProfit ? 'กำไรสุทธิ (ฐานภาษี)' : 'ขาดทุนสุทธิ (ฐานภาษี)'}
          value={profitBase} sub={`Margin ${margin.toFixed(1)}% · เงินสดสุทธิ ฿${fmt(cashNet)}`} />
      </div>

      {/* แถบองค์ประกอบ รายรับ / รายจ่าย */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <CompositionCard title="องค์ประกอบรายรับ" total={d.rev.base}
          parts={[
            { label: 'เสร็จสิ้น (ชำระครบ)', value: doneBase, color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
            { label: 'เครดิต (ยังไม่เก็บ)', value: creditBase, color: 'bg-amber-500', text: 'text-amber-600 dark:text-amber-400' },
          ]} />
        <CompositionCard title="องค์ประกอบรายจ่าย" total={d.exp.base}
          parts={[
            { label: 'งานอีเวนต์', value: d.expEvent.base, color: 'bg-rose-400', text: 'text-rose-500 dark:text-rose-400' },
            { label: 'office/ดำเนินงาน', value: d.expOffice.base, color: 'bg-zinc-400', text: 'text-zinc-500 dark:text-zinc-400' },
          ]} />
      </div>

      {/* Tabs + Search + List */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            {tabs.map(t => {
              const on = t.key === tab
              const tone = TONES[t.key]
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setSearch('') }}
                  className={`px-3 sm:px-4 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 ${on ? 'bg-white dark:bg-zinc-900 shadow-sm ' + tone.text : 'text-zinc-500 hover:text-zinc-700'}`}>
                  <span className={`h-2 w-2 rounded-full ${tone.bg}`} />
                  {t.label}
                  <span className="text-[10px] font-mono opacity-70">{t.items.length}</span>
                </button>
              )
            })}
          </div>
          <div className="relative sm:ml-auto sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={`ค้นหาใน${active.label}...`}
              className="h-9 w-full pl-8 pr-8 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* สรุปเครดิต: ยอดเต็ม / เก็บแล้ว / คงค้าง */}
        {tab === 'credit' && (() => {
          const full = d.credit.reduce((s, i) => s + i.gross, 0)
          const paid = d.credit.reduce((s, i) => s + i.paid, 0)
          const outstanding = d.credit.reduce((s, i) => s + i.outstanding, 0)
          const paidPct = full > 0 ? (paid / full) * 100 : 0
          return (
            <div className="px-5 py-4 bg-amber-50/60 dark:bg-amber-950/20 border-b border-amber-100 dark:border-amber-900/40 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <CreditStat label="ยอดเต็ม (รวมทุกดีล)" value={full} tone="text-zinc-700 dark:text-zinc-200" />
                <CreditStat label="เก็บเงินมาแล้ว" value={paid} tone="text-emerald-600 dark:text-emerald-400" />
                <CreditStat label="คงค้าง (เครดิต)" value={outstanding} tone="text-amber-600 dark:text-amber-400" emphatic />
              </div>
              <div>
                <div className="flex h-2.5 rounded-full overflow-hidden bg-amber-100 dark:bg-amber-900/40">
                  <div className="bg-emerald-500" style={{ width: `${paidPct}%` }} />
                </div>
                <div className="flex justify-between text-[10px] text-zinc-400 mt-1">
                  <span>เก็บแล้ว {paidPct.toFixed(0)}%</span>
                  <span>คงค้าง {(100 - paidPct).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Dashboard วิเคราะห์รายจ่าย: จ่ายแล้ว/ค้างจ่าย + แยกประเภท/สถานะ/หมวด */}
        {tab === 'expense' && (() => {
          const paidBase = Object.entries(d.expByStatus).reduce((s, [k, v]) => s + (PAID_STATUSES.has(k) ? v.base : 0), 0)
          const pendingBase = d.exp.base - paidBase
          const mk = (rec: Record<string, Slice>, meta?: (k: string) => { label: string; color: string }) =>
            Object.entries(rec)
              .map(([k, v]) => ({ label: meta?.(k).label ?? k, color: meta?.(k).color, value: v.base, count: v.count }))
              .sort((a, b) => b.value - a.value)
          return (
            <div className="px-5 py-4 bg-rose-50/40 dark:bg-rose-950/10 border-b border-rose-100 dark:border-rose-900/30 space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <CreditStat label="รายจ่ายรวม (ฐาน)" value={d.exp.base} tone="text-zinc-700 dark:text-zinc-200" />
                <CreditStat label="จ่ายแล้ว" value={paidBase} tone="text-emerald-600 dark:text-emerald-400" />
                <CreditStat label="ค้างจ่าย / รอดำเนินการ" value={pendingBase} tone="text-amber-600 dark:text-amber-400" emphatic />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <Breakdown title="แยกตามประเภท" total={d.exp.base}
                  entries={mk(d.expByType, k => ({ label: CLAIM_TYPE_LABEL[k] || k, color: TYPE_COLOR[k] || 'bg-zinc-400' }))} />
                <Breakdown title="สถานะการจ่าย" total={d.exp.base}
                  entries={mk(d.expByStatus, k => STATUS_META[k] || { label: k, color: 'bg-zinc-300' })} />
                <Breakdown title="หมวดค่าใช้จ่าย (Top)" total={d.exp.base} limit={6}
                  entries={mk(d.expByCategory)} />
              </div>
            </div>
          )
        })()}

        {/* แถบสรุปของ tab ที่เลือก */}
        <div className={`flex items-center justify-between px-5 py-2.5 text-xs ${TONES[tab].soft}`}>
          <span className="text-zinc-500">
            แสดง <b className="text-zinc-700 dark:text-zinc-200">{shown.length}</b> / {active.items.length} รายการ
          </span>
          <span className={`font-mono font-bold ${TONES[tab].text}`}>รวมฐาน ฿{fmt(shownTotal)}</span>
        </div>

        {/* List */}
        {shown.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-zinc-400">
            {q ? `ไม่พบรายการที่ตรงกับ "${search}"` : 'ไม่มีรายการในงวดนี้'}
          </div>
        ) : (
          <div className="divide-y divide-zinc-50 dark:divide-zinc-800/50">
            {shown.map((it, i) => (
              <div key={i} className="flex items-center gap-3 px-5 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800/30">
                <span className={`h-8 w-8 shrink-0 rounded-lg flex items-center justify-center ${TONES[tab].soft}`}>
                  <Banknote className={`h-4 w-4 ${TONES[tab].text}`} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-zinc-800 dark:text-zinc-100 truncate">{it.name}</div>
                  <div className="text-[11px] text-zinc-400">{it.meta}</div>
                </div>
                <div className="text-right shrink-0">
                  {tab === 'credit' ? (
                    <>
                      <div className="text-sm font-mono font-bold text-amber-600 dark:text-amber-400">ค้าง ฿{fmt(it.outstanding)}</div>
                      <div className="text-[10px] font-mono text-zinc-400">เต็ม ฿{fmt(it.gross)} · เก็บแล้ว <span className="text-emerald-600 dark:text-emerald-400">฿{fmt(it.paid)}</span></div>
                    </>
                  ) : (
                    <>
                      <div className="text-sm font-mono font-bold text-zinc-800 dark:text-zinc-100">฿{fmt(it.base)}</div>
                      <div className="text-[10px] font-mono text-zinc-400">VAT ฿{fmt(it.vat)} · WHT ฿{fmt(it.wht)} · สุทธิ ฿{fmt(it.net)}</div>
                    </>
                  )}
                </div>
                <Link href={it.href} title={it.linkLabel}
                  className="shrink-0 h-8 w-8 rounded-lg flex items-center justify-center text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── sub-components ───
function Breakdown({ title, entries, total, limit }: {
  title: string; total: number; limit?: number
  entries: { label: string; value: number; count: number; color?: string }[]
}) {
  const shown = limit ? entries.slice(0, limit) : entries
  const rest = limit && entries.length > limit ? entries.slice(limit).reduce((s, e) => s + e.value, 0) : 0
  return (
    <div className="rounded-xl border border-zinc-200/70 dark:border-zinc-700/60 bg-white dark:bg-zinc-900 p-3">
      <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-2.5">{title}</div>
      <div className="space-y-2">
        {shown.length === 0 && <div className="text-xs text-zinc-400">—</div>}
        {shown.map(e => (
          <div key={e.label} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="flex items-center gap-1.5 min-w-0">
                <span className={`h-2 w-2 rounded-sm shrink-0 ${e.color || 'bg-rose-300'}`} />
                <span className="text-zinc-600 dark:text-zinc-300 truncate">{e.label}</span>
                <span className="text-[10px] text-zinc-400 shrink-0">{e.count}</span>
              </span>
              <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-200 shrink-0">฿{fmt(e.value)}</span>
            </div>
            <div className="h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${e.color || 'bg-rose-300'}`} style={{ width: `${total > 0 ? (e.value / total) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
        {rest > 0 && <div className="text-[10px] text-zinc-400 pt-0.5">+ อื่นๆ ฿{fmt(rest)}</div>}
      </div>
    </div>
  )
}
function CreditStat({ label, value, tone, emphatic }: { label: string; value: number; tone: string; emphatic?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${emphatic ? 'bg-white dark:bg-zinc-900 ring-1 ring-amber-300/50 dark:ring-amber-700/40' : 'bg-white/60 dark:bg-zinc-900/40'}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">{label}</div>
      <div className={`text-lg font-bold font-mono mt-0.5 ${tone}`}>฿{fmt(value)}</div>
    </div>
  )
}
function CompositionCard({ title, total, parts }: {
  title: string; total: number; parts: { label: string; value: number; color: string; text: string }[]
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">{title}</span>
        <span className="text-sm font-mono font-bold text-zinc-700 dark:text-zinc-200">฿{fmt(total)}</span>
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800">
        {parts.map(p => (
          <div key={p.label} className={p.color} style={{ width: `${total > 0 ? (p.value / total) * 100 : 0}%` }} />
        ))}
      </div>
      <div className="space-y-1.5">
        {parts.map(p => (
          <div key={p.label} className="flex items-center gap-2 text-xs">
            <span className={`h-2 w-2 rounded-sm ${p.color}`} />
            <span className="text-zinc-500">{p.label}</span>
            <span className={`ml-auto font-mono font-semibold ${p.text}`}>฿{fmt(p.value)}</span>
            <span className="text-[10px] text-zinc-400 w-9 text-right">{total > 0 ? ((p.value / total) * 100).toFixed(0) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SummaryCard({ icon: Icon, label, value, sub, tone, emphatic }: {
  icon: React.ElementType; label: string; value: number; sub: string; tone: 'emerald' | 'rose'; emphatic?: boolean
}) {
  const c = tone === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
  return (
    <div className={`rounded-2xl border p-5 ${emphatic
      ? tone === 'emerald' ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/20' : 'border-rose-200 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20'
      : 'border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900'}`}>
      <div className="flex items-center gap-2 text-zinc-400">
        <Icon className={`h-4 w-4 ${emphatic ? c : ''}`} />
        <span className="text-[11px] font-semibold uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-bold font-mono mt-2 ${emphatic ? c : 'text-zinc-900 dark:text-zinc-100'}`}>{fmtSign(value)}</div>
      <div className="text-[11px] text-zinc-400 mt-1">{sub}</div>
    </div>
  )
}
