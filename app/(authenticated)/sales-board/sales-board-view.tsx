'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, ChevronRight, Settings2, RefreshCw, Trophy, CheckCircle2,
  Banknote, Wallet, TrendingUp, Handshake, LayoutGrid, Users, Package, Target,
  Timer, Flame,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  buildHealth, fmt, isRevLead, leadAmount, leadDate,
  type PLLead, type PLClaim, type PLInstallment,
} from '../overview/pl/pl-lib'

// ── ชนิดข้อมูลที่ page.tsx ส่งเข้ามา ──
type JobEvent = { id: string; linked_lead_id: string | null; event_date: string | null }
type CostItem = { job_event_id: string; amount: number | null }
type EventRow = { id: string; event_date: string | null }
type StaffRow = { event_id: string; user_id: string; created_at: string | null }
type Profile = { id: string; full_name: string | null; nickname: string | null }
type LeadWithPkg = PLLead & { package_name: string | null }

interface Props {
  leads: LeadWithPkg[]; claims: PLClaim[]; installments: PLInstallment[]
  jobEvents: JobEvent[]; costItems: CostItem[]
  events: EventRow[]; eventStaff: StaffRow[]; profiles: Profile[]
}

// ── helper วันที่/เดือน (พ.ศ.) ──
const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
const curMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const monthLabel = (m: string) => { const [y, mo] = m.split('-').map(Number); return `${TH_MONTHS[mo - 1]} ${y + 543}` }
const addMonth = (m: string, delta: number) => { const [y, mo] = m.split('-').map(Number); const d = new Date(y, mo - 1 + delta, 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}` }
const inMonth = (d: string | null, m: string) => !!d && d.slice(0, 7) === m

// ── จานสี (literal class ทั้งหมด — JIT ของ Tailwind อ่าน dynamic string ไม่ได้) ──
const COLORS: Record<string, { tint: string; text: string; chip: string; bar: string }> = {
  emerald: { tint: 'from-emerald-50 to-white dark:from-emerald-950/30 dark:to-zinc-900', text: 'text-emerald-700 dark:text-emerald-300', chip: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300', bar: 'bg-emerald-500' },
  sky: { tint: 'from-sky-50 to-white dark:from-sky-950/30 dark:to-zinc-900', text: 'text-sky-700 dark:text-sky-300', chip: 'bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300', bar: 'bg-sky-500' },
  rose: { tint: 'from-rose-50 to-white dark:from-rose-950/30 dark:to-zinc-900', text: 'text-rose-700 dark:text-rose-300', chip: 'bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300', bar: 'bg-rose-500' },
  violet: { tint: 'from-violet-50 to-white dark:from-violet-950/30 dark:to-zinc-900', text: 'text-violet-700 dark:text-violet-300', chip: 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300', bar: 'bg-violet-500' },
  amber: { tint: 'from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900', text: 'text-amber-700 dark:text-amber-300', chip: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300', bar: 'bg-amber-500' },
  cyan: { tint: 'from-cyan-50 to-white dark:from-cyan-950/30 dark:to-zinc-900', text: 'text-cyan-700 dark:text-cyan-300', chip: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300', bar: 'bg-cyan-500' },
  orange: { tint: 'from-orange-50 to-white dark:from-orange-950/30 dark:to-zinc-900', text: 'text-orange-700 dark:text-orange-300', chip: 'bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300', bar: 'bg-orange-500' },
  teal: { tint: 'from-teal-50 to-white dark:from-teal-950/30 dark:to-zinc-900', text: 'text-teal-700 dark:text-teal-300', chip: 'bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300', bar: 'bg-teal-500' },
}

// แพ็กเกจ = สินค้า/บริการที่ขายจริง (CRM package_name)
const PKG_LABEL: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium', premium_video: 'Premium Video', custom: 'Custom' }
const pkgLabel = (p: string) => p ? (PKG_LABEL[p] || p.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())) : 'ไม่ระบุแพ็กเกจ'

// ── นิยาม metric (แต่ละตัวตั้งเป้าได้) ──
type MetricKey = 'sales' | 'revenue' | 'expense' | 'profit' | 'deals' | 'booths' | 'staff' | 'items'
interface MetricDef { key: MetricKey; label: string; sub: string; money: boolean; invert?: boolean; icon: typeof Target; color: string }
const METRICS: MetricDef[] = [
  { key: 'sales', label: 'ยอดขาย', sub: 'มูลค่าดีลที่ปิดได้', money: true, icon: TrendingUp, color: 'emerald' },
  { key: 'revenue', label: 'เก็บเงินแล้ว', sub: 'เงินเข้าจริง (มัดจำ+งวด)', money: true, icon: Banknote, color: 'sky' },
  { key: 'expense', label: 'รายจ่าย', sub: 'ใบเบิกทั้งหมด (ยิ่งต่ำยิ่งดี)', money: true, invert: true, icon: Wallet, color: 'rose' },
  { key: 'profit', label: 'กำไร', sub: 'รายรับ(ฐาน) − รายจ่าย', money: true, icon: Target, color: 'violet' },
  { key: 'deals', label: 'ดีลที่ปิดได้', sub: 'จำนวนการขาย', money: false, icon: Handshake, color: 'amber' },
  { key: 'booths', label: 'บูธ/อีเวนต์', sub: 'งานที่จัดในเดือน', money: false, icon: LayoutGrid, color: 'cyan' },
  { key: 'staff', label: 'งานสตาฟ', sub: 'ครั้งที่สตาฟออกงาน', money: false, icon: Users, color: 'orange' },
  { key: 'items', label: 'รายการสินค้า/บริการ', sub: 'แพ็กเกจที่ขายได้เดือนนี้', money: false, icon: Package, color: 'teal' },
]

type Targets = Partial<Record<MetricKey, number>>
type TargetStore = Record<string, Targets>
const LS_KEY = 'sales-board-targets-v1'

export default function SalesBoardView(props: Props) {
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [month, setMonth] = useState(curMonth)
  const [store, setStore] = useState<TargetStore>({})
  const [editorOpen, setEditorOpen] = useState(false)
  const [updatedAt, setUpdatedAt] = useState('')

  // client-only gate → เลี่ยง hydration mismatch จาก new Date()/localStorage
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- โหลดค่าเริ่มต้นจาก localStorage หลัง mount */
    setMounted(true)
    try { setStore(JSON.parse(localStorage.getItem(LS_KEY) || '{}')) } catch { /* ค่าเริ่มต้นว่าง */ }
    setUpdatedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  // รีเฟรชข้อมูลอัตโนมัติทุก 60 วิ (หยุดตอนแก้เป้า) — สำหรับจอ monitor
  useEffect(() => {
    if (editorOpen) return
    const id = setInterval(() => {
      router.refresh()
      setUpdatedAt(new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }))
    }, 60_000)
    return () => clearInterval(id)
  }, [editorOpen, router])

  const targets = store[month] || {}

  // ── คำนวณค่าจริงของเดือนที่เลือก ──
  const values = useMemo<Record<MetricKey, number>>(() => {
    const range = (d: string | null) => inMonth(d, month)
    const h = buildHealth(props.leads, props.claims, props.installments, props.jobEvents, props.costItems, range)

    // count: บูธ/อีเวนต์ = events ในเดือน
    const booths = props.events.filter((e) => inMonth(e.event_date, month)).length
    // staff: event_staff ที่ event อยู่ในเดือน (fallback created_at)
    const evDate = new Map(props.events.map((e) => [e.id, e.event_date]))
    const staff = props.eventStaff.filter((s) => inMonth(evDate.get(s.event_id) ?? s.created_at, month)).length
    // items: จำนวนแพ็กเกจ (สินค้า/บริการ) ที่ขายได้เดือนนี้
    let items = 0
    for (const l of props.leads) if (isRevLead(l) && l.package_name && leadAmount(l) > 0 && inMonth(leadDate(l), month)) items++

    return {
      sales: h.bookedGross, revenue: h.cashCollected, expense: h.totalCost, profit: h.operatingProfit,
      deals: h.dealCount, booths, staff, items,
    }
  }, [props, month])

  // ── สินค้า/บริการ (แพ็กเกจ): ขายได้เดือนนี้ + สะสมทั้งหมด, เรียงตามขายได้เดือนนี้ ──
  const products = useMemo(() => {
    const agg = new Map<string, { key: string; name: string; month: number; total: number }>()
    for (const l of props.leads) {
      if (!isRevLead(l) || leadAmount(l) <= 0) continue
      const key = l.package_name || ''
      const g = agg.get(key) || { key, name: pkgLabel(key), month: 0, total: 0 }
      g.total++
      if (inMonth(leadDate(l), month)) g.month++
      agg.set(key, g)
    }
    return [...agg.values()].sort((a, b) => b.month - a.month || b.total - a.total)
  }, [props.leads, month])

  // ── leaderboard: เซลที่ทำยอดสูงสุดในเดือน ──
  const leaderboard = useMemo(() => {
    const nameOf = new Map(props.profiles.map((p) => [p.id, p.nickname || p.full_name || p.id.slice(0, 6)]))
    const agg = new Map<string, { name: string; amount: number; deals: number }>()
    for (const l of props.leads) {
      if (!isRevLead(l) || !inMonth(leadDate(l), month)) continue
      const amt = leadAmount(l); if (amt <= 0) continue
      const sid = l.assigned_sales?.[0] || 'none'
      const g = agg.get(sid) || { name: sid === 'none' ? 'ไม่ระบุเซล' : (nameOf.get(sid) || sid.slice(0, 6)), amount: 0, deals: 0 }
      g.amount += amt; g.deals++; agg.set(sid, g)
    }
    return [...agg.values()].sort((a, b) => b.amount - a.amount).slice(0, 6)
  }, [props.leads, props.profiles, month])

  // ── เทรนด์ยอดขาย 6 เดือนล่าสุด (จบที่เดือนที่เลือก) ──
  const trend = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => addMonth(month, i - 5))
    return months.map((m) => {
      let amount = 0
      for (const l of props.leads) if (isRevLead(l) && inMonth(leadDate(l), m) && leadAmount(l) > 0) amount += leadAmount(l)
      return { month: m, amount }
    })
  }, [props.leads, month])

  if (!mounted) {
    return <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">กำลังโหลดสรุปยอดขาย…</div>
  }

  const saveTargets = (next: Targets) => {
    const ns = { ...store, [month]: next }
    setStore(ns)
    try { localStorage.setItem(LS_KEY, JSON.stringify(ns)) } catch { /* localStorage ปิดอยู่ */ }
  }

  const trendMax = Math.max(1, ...trend.map((t) => t.amount))
  const lbMax = Math.max(1, ...leaderboard.map((l) => l.amount))

  return (
    <div className="mx-auto max-w-[1600px] space-y-5 p-4 md:p-6">
      {/* ── หัวเรื่อง + ตัวเลือกเดือน ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Trophy className="h-7 w-7 text-amber-500" /> สรุปยอดขาย
          </h1>
          <p className="text-sm text-muted-foreground">เป้าหมายและผลงานทีมขายประจำเดือน</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            LIVE · {updatedAt}
          </span>
          <div className="flex items-center rounded-lg border bg-card">
            <Button variant="ghost" size="icon" onClick={() => setMonth(addMonth(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="min-w-[140px] text-center text-sm font-semibold">{monthLabel(month)}</span>
            <Button variant="ghost" size="icon" onClick={() => setMonth(addMonth(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
          </div>
          {month !== curMonth() && <Button variant="outline" size="sm" onClick={() => setMonth(curMonth())}>เดือนนี้</Button>}
          <Button variant="ghost" size="icon" onClick={() => router.refresh()} title="รีเฟรช"><RefreshCw className="h-4 w-4" /></Button>
          <Button size="sm" onClick={() => setEditorOpen(true)}><Settings2 className="mr-1.5 h-4 w-4" /> ตั้งเป้า</Button>
        </div>
      </div>

      {/* ── นับถอยหลังปิดยอดวันที่ 28 ── */}
      <Countdown />

      {/* ── HERO: ยอดขาย ── */}
      <HeroCard value={values.sales} target={targets.sales} trend={trend} trendMax={trendMax} />

      {/* ── การ์ด metric ที่เหลือ ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {METRICS.filter((m) => m.key !== 'sales').map((m) => (
          <MetricCard key={m.key} def={m} value={values[m.key]} target={targets[m.key]} onSetTarget={() => setEditorOpen(true)} />
        ))}
      </div>

      {/* ── อันดับเซล + ตารางสินค้า/บริการ ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* leaderboard */}
        <div className="rounded-xl border bg-card p-4 md:p-5">
          <div className="mb-3 flex items-center gap-2 text-base font-semibold"><Trophy className="h-5 w-5 text-amber-500" /> อันดับเซลล์ขายเก่ง — {monthLabel(month)}</div>
          {leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มียอดขายในเดือนนี้</p>
          ) : (
            <div className="space-y-2.5">
              {leaderboard.map((l, i) => (
                <div key={l.name + i} className="flex items-center gap-3">
                  <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                    i === 0 ? 'bg-amber-500 text-white' : i === 1 ? 'bg-zinc-300 text-zinc-800' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-muted text-muted-foreground')}>
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{l.name}</span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">฿{fmt(l.amount)} <span className="font-normal text-muted-foreground">· {l.deals} ดีล</span></span>
                    </div>
                    <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div className={cn('h-full rounded-full', i === 0 ? 'bg-amber-500' : 'bg-emerald-500/70')} style={{ width: `${(l.amount / lbMax) * 100}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ตารางสินค้า/บริการ */}
        <ProductTable products={products} monthName={monthLabel(month)} />
      </div>

      <TargetDialog key={`${month}|${editorOpen}`} open={editorOpen} month={month} initial={targets} onSave={saveTargets} onOpenChange={setEditorOpen} />
    </div>
  )
}

// ── การ์ดใหญ่ ยอดขาย + เทรนด์ ──
function HeroCard({ value, target, trend, trendMax }: { value: number; target?: number; trend: { month: string; amount: number }[]; trendMax: number }) {
  const pct = target && target > 0 ? (value / target) * 100 : 0
  const hit = target ? value >= target : false
  return (
    <div className="grid grid-cols-1 gap-4 rounded-2xl border bg-gradient-to-br from-emerald-600 to-emerald-700 p-6 text-white shadow-lg lg:grid-cols-[1.1fr_1fr] md:p-8">
      <div>
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-50/90"><TrendingUp className="h-5 w-5" /> ยอดขายเดือนนี้</div>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-5xl font-extrabold tracking-tight tabular-nums md:text-6xl">฿{fmt(value)}</span>
          {hit && <span className="mb-2 flex items-center gap-1 rounded-full bg-white/20 px-2.5 py-1 text-sm font-semibold"><CheckCircle2 className="h-4 w-4" /> ถึงเป้าแล้ว!</span>}
        </div>
        {target && target > 0 ? (
          <div className="mt-4 max-w-md">
            <div className="flex justify-between text-sm text-emerald-50/90"><span>เป้า ฿{fmt(target)}</span><span className="font-semibold">{pct.toFixed(0)}%</span></div>
            <div className="mt-1.5 h-3 w-full overflow-hidden rounded-full bg-black/20">
              <div className="h-full rounded-full bg-white transition-all" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            {!hit && <p className="mt-1.5 text-sm text-emerald-50/80">เหลืออีก ฿{fmt(Math.max(0, target - value))} ถึงเป้า</p>}
          </div>
        ) : (
          <p className="mt-4 text-sm text-emerald-50/80">ยังไม่ได้ตั้งเป้าเดือนนี้ — กด “ตั้งเป้า” มุมขวาบน</p>
        )}
      </div>
      {/* mini trend 6 เดือน */}
      <div className="flex flex-col">
        <div className="mb-2 text-sm font-medium text-emerald-50/90">ยอดขาย 6 เดือนล่าสุด</div>
        <div className="flex flex-1 items-end justify-between gap-2">
          {trend.map((t, i) => (
            <div key={t.month} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium tabular-nums text-emerald-50/80">{t.amount > 0 ? fmtShort(t.amount) : ''}</span>
              <div className="flex w-full items-end justify-center" style={{ height: 90 }}>
                <div className={cn('w-full max-w-[40px] rounded-t-md transition-all', i === trend.length - 1 ? 'bg-white' : 'bg-white/40')}
                  style={{ height: `${Math.max(3, (t.amount / trendMax) * 90)}px` }} />
              </div>
              <span className="text-[10px] text-emerald-50/70">{t.month.slice(5)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── การ์ด metric ทั่วไป (มีสีตามหมวด + เทียบเป้า %/จำนวน) ──
function MetricCard({ def, value, target, onSetTarget }: { def: MetricDef; value: number; target?: number; onSetTarget: () => void }) {
  const Icon = def.icon
  const c = COLORS[def.color] || COLORS.sky
  const has = typeof target === 'number' && target > 0
  const pct = has ? (value / target!) * 100 : 0
  // invert (รายจ่าย): อยู่ในงบ = ดี (เขียว), เกินงบ = แดง
  const hit = has && (def.invert ? value <= target! : value >= target!)
  const over = has && def.invert && value > target!
  const fmtV = (n: number) => def.money ? `฿${fmt(n)}` : fmt(n)
  return (
    <div className={cn('group relative overflow-hidden rounded-xl border bg-gradient-to-br p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg', c.tint)}>
      {hit && <span className="pointer-events-none absolute right-0 top-0 h-16 w-16 -translate-y-7 translate-x-7 rounded-full bg-emerald-400/25 blur-xl" />}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground/75">
          <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg transition-transform group-hover:scale-110', c.chip)}><Icon className="h-4 w-4" /></span>
          {def.label}
        </span>
        {hit && <CheckCircle2 className="h-5 w-5 text-emerald-500" />}
      </div>
      <div className={cn('mt-2 text-3xl font-extrabold tracking-tight tabular-nums', c.text)}>{fmtV(value)}</div>
      <div className="text-xs text-muted-foreground">{def.sub}</div>
      {has ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted-foreground">เป้า {fmtV(target!)}</span>
            <span className={cn('text-sm font-bold', over ? 'text-rose-600' : hit ? 'text-emerald-600' : c.text)}>{pct.toFixed(0)}%</span>
          </div>
          <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className={cn('h-full rounded-full transition-all duration-500', over ? 'bg-rose-500' : hit ? 'bg-emerald-500' : c.bar)} style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
          <div className="mt-1 text-[11px] font-medium">
            {def.invert
              ? (over ? <span className="text-rose-600">เกินงบ {fmtV(value - target!)}</span> : <span className="text-emerald-600">เหลืองบอีก {fmtV(target! - value)}</span>)
              : (hit ? <span className="text-emerald-600">เกินเป้า {fmtV(value - target!)} 🎉</span> : <span className="text-muted-foreground">เหลืออีก {fmtV(target! - value)} ถึงเป้า</span>)}
          </div>
        </div>
      ) : (
        <button onClick={onSetTarget} className="mt-3 text-xs font-medium text-muted-foreground/70 transition-colors hover:text-foreground hover:underline">+ ตั้งเป้าเดือนนี้</button>
      )}
    </div>
  )
}

// แสดงตัวเลขแบบสั้นบนกราฟ (1.2M / 45K)
function fmtShort(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return Math.round(n / 1_000) + 'K'
  return String(Math.round(n))
}

// ── นับถอยหลังถึงวันที่ 28 ของเดือน (deadline ปิดยอด) ──
function CountdownUnit({ n, label }: { n: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="min-w-[44px] rounded-lg bg-white/20 px-2 py-1 text-center text-2xl font-extrabold tabular-nums md:text-3xl">{String(n).padStart(2, '0')}</span>
      <span className="mt-1 text-[10px] uppercase tracking-wide text-white/80">{label}</span>
    </div>
  )
}
function Countdown() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id) }, [])
  const d = new Date(now)
  let target = new Date(d.getFullYear(), d.getMonth(), 28, 23, 59, 59)
  if (now > target.getTime()) target = new Date(d.getFullYear(), d.getMonth() + 1, 28, 23, 59, 59)
  const diff = Math.max(0, target.getTime() - now)
  const days = Math.floor(diff / 86_400_000)
  const hrs = Math.floor(diff / 3_600_000) % 24
  const mins = Math.floor(diff / 60_000) % 60
  const secs = Math.floor(diff / 1_000) % 60
  const urgent = diff < 3 * 86_400_000
  const pad = (n: number) => String(n).padStart(2, '0')
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 text-white shadow-lg md:p-5',
      urgent ? 'bg-gradient-to-r from-rose-600 to-red-600' : 'bg-gradient-to-r from-indigo-600 to-violet-600')}>
      <div className="flex items-center gap-3">
        {urgent ? <Flame className="h-8 w-8 animate-pulse" /> : <Timer className="h-8 w-8" />}
        <div>
          <div className="text-sm font-medium text-white/90">{urgent ? '🔥 โค้งสุดท้าย! เร่งปิดยอดเดือนนี้' : 'นับถอยหลังปิดยอดเดือนนี้'}</div>
          <div className="text-lg font-bold">ปิดยอดวันที่ 28 {monthLabel(`${target.getFullYear()}-${pad(target.getMonth() + 1)}`)}</div>
        </div>
      </div>
      <div className="flex items-center gap-1.5 md:gap-2.5">
        <CountdownUnit n={days} label="วัน" /><span className="pb-4 text-2xl font-bold opacity-50">:</span>
        <CountdownUnit n={hrs} label="ชั่วโมง" /><span className="pb-4 text-2xl font-bold opacity-50">:</span>
        <CountdownUnit n={mins} label="นาที" /><span className="pb-4 text-2xl font-bold opacity-50">:</span>
        <CountdownUnit n={secs} label="วินาที" />
      </div>
    </div>
  )
}

// ── ตารางสินค้า/บริการ (แพ็กเกจ) ที่ขายได้ ──
function ProductTable({ products, monthName }: { products: { key: string; name: string; month: number; total: number }[]; monthName: string }) {
  const monthTotal = products.reduce((s, p) => s + p.month, 0)
  const grandTotal = products.reduce((s, p) => s + p.total, 0)
  const max = Math.max(1, ...products.map((p) => p.month))
  return (
    <div className="rounded-xl border bg-card p-4 md:p-5">
      <div className="mb-3 flex items-center gap-2 text-base font-semibold"><Package className="h-5 w-5 text-teal-500" /> สินค้า/บริการที่ขายได้ — {monthName}</div>
      {products.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">ยังไม่มีข้อมูลแพ็กเกจ</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th className="pb-2 text-left font-medium">สินค้า/บริการ</th>
                <th className="pb-2 text-right font-medium">ขายได้ (เดือนนี้)</th>
                <th className="pb-2 text-right font-medium">สัดส่วน</th>
                <th className="pb-2 text-right font-medium">สะสมทั้งหมด</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const share = monthTotal > 0 ? (p.month / monthTotal) * 100 : 0
                return (
                  <tr key={p.key} className="border-b last:border-0">
                    <td className="py-2 pr-2">
                      <div className="font-medium">{p.name}</div>
                      <div className="mt-1 h-1.5 w-full max-w-[180px] overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${(p.month / max) * 100}%` }} />
                      </div>
                    </td>
                    <td className="py-2 text-right text-base font-bold tabular-nums text-teal-700 dark:text-teal-300">{p.month}</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{share.toFixed(0)}%</td>
                    <td className="py-2 text-right tabular-nums text-muted-foreground">{p.total}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t font-semibold">
                <td className="pt-2">รวมทั้งหมด</td>
                <td className="pt-2 text-right tabular-nums">{monthTotal}</td>
                <td className="pt-2 text-right text-muted-foreground">100%</td>
                <td className="pt-2 text-right tabular-nums text-muted-foreground">{grandTotal}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  )
}

// ── dialog ตั้งเป้ารายเดือน (เก็บใน localStorage) ──
function TargetDialog({ open, month, initial, onSave, onOpenChange }: {
  open: boolean; month: string; initial: Targets; onSave: (t: Targets) => void; onOpenChange: (o: boolean) => void
}) {
  // ตั้งค่า draft ครั้งเดียวตอน mount (parent ใส่ key ใหม่ทุกครั้งที่เปิด → remount = ค่าล่าสุด)
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const d: Record<string, string> = {}
    for (const m of METRICS) { const v = initial[m.key]; d[m.key] = v != null ? String(v) : '' }
    return d
  })

  const save = () => {
    const next: Targets = {}
    for (const m of METRICS) { const n = Number(draft[m.key]); if (n > 0) next[m.key] = n }
    onSave(next); onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader><DialogTitle>ตั้งเป้าหมาย — {monthLabel(month)}</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          {METRICS.map((m) => {
            const Icon = m.icon
            return (
              <div key={m.key} className="grid grid-cols-[1fr_auto] items-center gap-3">
                <Label htmlFor={`t-${m.key}`} className="flex flex-col gap-0.5">
                  <span className="flex items-center gap-1.5 text-sm"><Icon className="h-4 w-4 text-muted-foreground" /> {m.label}</span>
                  <span className="text-xs font-normal text-muted-foreground">{m.money ? 'บาท' : 'จำนวน'}{m.invert ? ' · งบสูงสุด' : ''}</span>
                </Label>
                <Input id={`t-${m.key}`} type="number" inputMode="numeric" min={0} placeholder="—" className="w-36 text-right"
                  value={draft[m.key] ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [m.key]: e.target.value }))} />
              </div>
            )
          })}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="ghost" onClick={() => { onSave({}); onOpenChange(false) }} className="text-muted-foreground">ล้างเป้าเดือนนี้</Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
            <Button onClick={save}>บันทึก</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
