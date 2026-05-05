'use client'

import { useState, useMemo, useTransition } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, RotateCw,
  Sparkles, Clock, CheckCircle2, X as XIcon, AlertCircle,
  Users, Briefcase, Heart, Plane, ImageIcon, Loader2,
} from 'lucide-react'
import { getLeavesInRange, type LeaveRecord, type LeaveType, type LeaveStatus } from '../leave-actions'

// ─── Static type metadata ──────────────────────────────────────
const TYPE_META: Record<LeaveType, {
  label: string
  emoji: string
  Icon: typeof Briefcase
  bar: string         // solid bg for calendar bar
  soft: string        // soft chip bg
  text: string        // text color matching the accent
  ring: string        // border for stat card
  bgSoft: string      // gradient backdrop for stat card
}> = {
  personal: {
    label: 'ลากิจ', emoji: '📋', Icon: Briefcase,
    bar:    'bg-rose-500 dark:bg-rose-400',
    soft:   'bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/60 dark:border-rose-900/60',
    text:   'text-rose-600 dark:text-rose-400',
    ring:   'border-rose-200 dark:border-rose-900/50',
    bgSoft: 'bg-gradient-to-br from-rose-50/70 to-white dark:from-rose-950/20 dark:to-zinc-900',
  },
  sick: {
    label: 'ลาป่วย', emoji: '🤒', Icon: Heart,
    bar:    'bg-orange-500 dark:bg-orange-400',
    soft:   'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300 border-orange-200/60 dark:border-orange-900/60',
    text:   'text-orange-600 dark:text-orange-400',
    ring:   'border-orange-200 dark:border-orange-900/50',
    bgSoft: 'bg-gradient-to-br from-orange-50/70 to-white dark:from-orange-950/20 dark:to-zinc-900',
  },
  vacation: {
    label: 'ลาพักร้อน', emoji: '🌴', Icon: Plane,
    bar:    'bg-cyan-500 dark:bg-cyan-400',
    soft:   'bg-cyan-100 dark:bg-cyan-950/40 text-cyan-700 dark:text-cyan-300 border-cyan-200/60 dark:border-cyan-900/60',
    text:   'text-cyan-600 dark:text-cyan-400',
    ring:   'border-cyan-200 dark:border-cyan-900/50',
    bgSoft: 'bg-gradient-to-br from-cyan-50/70 to-white dark:from-cyan-950/20 dark:to-zinc-900',
  },
}

const STATUS_META: Record<LeaveStatus, { label: string; tone: string; icon: typeof Clock }> = {
  pending:   { label: 'รออนุมัติ', tone: 'bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-900/60', icon: Clock },
  approved:  { label: 'อนุมัติ',    tone: 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-900/60', icon: CheckCircle2 },
  rejected:  { label: 'ปฏิเสธ',     tone: 'bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400 border-red-200/60 dark:border-red-900/60', icon: XIcon },
  cancelled: { label: 'ยกเลิก',      tone: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200/60 dark:border-zinc-700/60', icon: XIcon },
}

// ─── Date helpers ──────────────────────────────────────────────
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function fmtThaiShort(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}
function thaiMonth(d: Date): string {
  // e.g. "พฤษภาคม 2569"
  const month = d.toLocaleDateString('th-TH', { month: 'long' })
  return `${month} ${d.getFullYear() + 543}`
}

function nameOf(profile: LeaveRecord['profiles'] | LeaveRecord['reviewer']): string {
  if (!profile) return '—'
  return profile.nickname || profile.full_name || profile.id.slice(0, 6)
}

// ─── Component ─────────────────────────────────────────────────

export default function LeaveDashboardView({
  initialLeaves,
  isAdmin,
  currentUserId,
}: {
  initialLeaves: LeaveRecord[]
  isAdmin: boolean
  currentUserId: string
}) {
  const [leaves, setLeaves] = useState<LeaveRecord[]>(initialLeaves)
  const [typeFilter, setTypeFilter] = useState<LeaveType | 'all'>('all')
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | 'all'>('approved')
  const [pending, startTransition] = useTransition()
  const [refreshing, setRefreshing] = useState(false)

  const today = useMemo(() => new Date(), [])
  const todayKey = useMemo(() => ymd(today), [today])
  const [viewMonth, setViewMonth] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1))

  // Filtered leaves by type/status — keeps stats and calendar in sync.
  const filtered = useMemo(() => {
    return leaves.filter(l =>
      (typeFilter === 'all' || l.leave_type === typeFilter) &&
      (statusFilter === 'all' || l.status === statusFilter)
    )
  }, [leaves, typeFilter, statusFilter])

  // Index leaves by every day they touch — covers multi-day ranges.
  const leavesByDay = useMemo(() => {
    const map = new Map<string, LeaveRecord[]>()
    filtered.forEach(l => {
      const start = new Date(l.start_date + 'T00:00:00')
      const end = new Date(l.end_date + 'T00:00:00')
      const cursor = new Date(start)
      while (cursor.getTime() <= end.getTime()) {
        const key = ymd(cursor)
        const list = map.get(key) || []
        list.push(l)
        map.set(key, list)
        cursor.setDate(cursor.getDate() + 1)
      }
    })
    return map
  }, [filtered])

  // KPI summaries computed from the unfiltered set so cards stay informative
  // even when the user filters the calendar.
  const stats = useMemo(() => {
    const onLeaveToday = (leavesByDay.get(todayKey) || []).length
    const monthStart = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1)
    const monthEnd = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0)
    const monthFromKey = ymd(monthStart)
    const monthToKey = ymd(monthEnd)
    const inViewMonth = leaves.filter(l => l.status === 'approved'
      && l.end_date >= monthFromKey && l.start_date <= monthToKey)
    const totalDaysInMonth = inViewMonth.reduce((s, l) => s + Number(l.total_days || 0), 0)
    const pendingCount = leaves.filter(l => l.status === 'pending').length

    const byType: Record<LeaveType, number> = { personal: 0, sick: 0, vacation: 0 }
    inViewMonth.forEach(l => { byType[l.leave_type] += Number(l.total_days || 0) })

    return { onLeaveToday, monthCount: inViewMonth.length, totalDaysInMonth, pendingCount, byType }
  }, [leaves, leavesByDay, todayKey, viewMonth])

  // Build the month grid — Monday-first to match Thai office norms.
  const monthGrid = useMemo(() => {
    const year = viewMonth.getFullYear()
    const month = viewMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startWeekday = (firstDay.getDay() + 6) % 7  // shift Sun=0 → Mon=0
    const cells: (Date | null)[] = []
    for (let i = 0; i < startWeekday; i++) cells.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d))
    while (cells.length % 7 !== 0) cells.push(null)
    return cells
  }, [viewMonth])

  // Upcoming approved leaves within the next 14 days for the side list.
  const upcoming = useMemo(() => {
    const fromKey = todayKey
    const toDate = new Date(today); toDate.setDate(toDate.getDate() + 14)
    const toKey = ymd(toDate)
    return leaves
      .filter(l => l.status === 'approved' && l.end_date >= fromKey && l.start_date <= toKey)
      .sort((a, b) => a.start_date.localeCompare(b.start_date))
      .slice(0, 8)
  }, [leaves, today, todayKey])

  // Pending approval queue — admin sees the team, staff sees their own.
  const pendingQueue = useMemo(
    () => leaves.filter(l => l.status === 'pending').slice(0, 5),
    [leaves]
  )

  // Refetch a wider window when navigating months — keeps the calendar
  // accurate for ranges outside the initial 4-month preload.
  function navigateMonth(delta: number) {
    const next = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + delta, 1)
    setViewMonth(next)
    startTransition(async () => {
      setRefreshing(true)
      const from = new Date(next.getFullYear(), next.getMonth() - 1, 1)
      const to = new Date(next.getFullYear(), next.getMonth() + 2, 0)
      const fmt = (d: Date) => ymd(d)
      const fresh = await getLeavesInRange(fmt(from), fmt(to))
      // Merge with existing — dedupe by id, keep newest
      const merged = new Map<string, LeaveRecord>()
      ;[...leaves, ...fresh].forEach(l => merged.set(l.id, l))
      setLeaves(Array.from(merged.values()))
      setRefreshing(false)
    })
  }

  function jumpToToday() {
    const m = new Date(today.getFullYear(), today.getMonth(), 1)
    if (m.getTime() !== viewMonth.getTime()) setViewMonth(m)
  }

  return (
    <div className="space-y-5 pb-20 md:pb-8 max-w-5xl mx-auto">

      {/* ══════════════ HEADER ══════════════ */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href="/check-in" className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors mb-1.5">
            <ArrowLeft className="h-3 w-3" /> กลับ /check-in
          </Link>
          <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 tracking-tight">
            <span className="inline-flex items-center justify-center h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md shadow-rose-500/20">
              <CalendarDays className="h-5 w-5" />
            </span>
            Leave Dashboard
          </h1>
          <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 mt-1.5">
            {isAdmin ? 'ภาพรวมการลาของทีม · ปฏิทิน · สถานะ' : 'ภาพรวมการลาของฉัน · ปฏิทิน · ประวัติ'}
          </p>
        </div>
        <Link
          href="/check-in"
          className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 shadow-sm hover:shadow-md transition-all active:scale-95"
        >
          <Sparkles className="h-3.5 w-3.5" /> ขอลางาน
        </Link>
      </div>

      {/* ══════════════ KPI ROW ══════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          tone="rose"
          icon="🏖"
          label={isAdmin ? 'ลาวันนี้ทั้งทีม' : 'ลาวันนี้'}
          value={`${stats.onLeaveToday}`}
          sub={isAdmin ? 'คน' : (stats.onLeaveToday > 0 ? 'มีคำขอที่ active' : 'ไม่มีคำขอวันนี้')}
        />
        <KpiCard
          tone="cyan"
          icon="📅"
          label="วันลา (เดือนที่ดูอยู่)"
          value={`${stats.totalDaysInMonth}`}
          sub={`${stats.monthCount} คำขอ · approved`}
        />
        <KpiCard
          tone="amber"
          icon="⏳"
          label="รออนุมัติ"
          value={`${stats.pendingCount}`}
          sub={isAdmin ? (stats.pendingCount > 0 ? 'admin ตรวจที่ /check-in' : 'ไม่มีคิวรอ') : 'คำขอของฉัน'}
        />
        <TypeBreakdownCard byType={stats.byType} />
      </div>

      {/* ══════════════ FILTERS ══════════════ */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">FILTERS</span>

        {/* Type pills */}
        <div className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 p-1">
          <FilterPill active={typeFilter === 'all'} onClick={() => setTypeFilter('all')} label="ทั้งหมด" />
          {(Object.keys(TYPE_META) as LeaveType[]).map(t => (
            <FilterPill
              key={t}
              active={typeFilter === t}
              onClick={() => setTypeFilter(t)}
              label={`${TYPE_META[t].emoji} ${TYPE_META[t].label}`}
              activeClass={TYPE_META[t].bar.replace('bg-', 'bg-') + ' text-white'}
            />
          ))}
        </div>

        {/* Status pills */}
        <div className="inline-flex items-center gap-1 rounded-full bg-zinc-100 dark:bg-zinc-800 p-1">
          <FilterPill active={statusFilter === 'approved'} onClick={() => setStatusFilter('approved')} label="✓ อนุมัติ" />
          <FilterPill active={statusFilter === 'pending'}  onClick={() => setStatusFilter('pending')}  label="⏳ รออนุมัติ" />
          <FilterPill active={statusFilter === 'all'}      onClick={() => setStatusFilter('all')}      label="ทุกสถานะ" />
        </div>
      </div>

      {/* ══════════════ CALENDAR ══════════════ */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        {/* Month nav */}
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-zinc-100 dark:border-zinc-800/60">
          <button
            onClick={() => navigateMonth(-1)}
            disabled={pending}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
            title="เดือนก่อนหน้า"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className="text-base md:text-lg font-bold text-zinc-900 dark:text-zinc-100 tabular-nums">
              {thaiMonth(viewMonth)}
            </h2>
            {refreshing && <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" />}
            {viewMonth.getMonth() !== today.getMonth() || viewMonth.getFullYear() !== today.getFullYear() ? (
              <button
                onClick={jumpToToday}
                className="text-[11px] text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 underline decoration-dotted"
              >
                ไปเดือนนี้
              </button>
            ) : null}
          </div>
          <button
            onClick={() => navigateMonth(1)}
            disabled={pending}
            className="h-8 w-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40"
            title="เดือนถัดไป"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Day-of-week header */}
        <div className="grid grid-cols-7 border-b border-zinc-100 dark:border-zinc-800/60">
          {['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'].map((d, i) => (
            <div
              key={d}
              className={`text-center text-[10px] font-bold tracking-wider py-2 ${
                i >= 5 ? 'text-rose-400' : 'text-zinc-400 dark:text-zinc-500'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day grid */}
        <div className="grid grid-cols-7">
          {monthGrid.map((day, i) => {
            if (!day) return <div key={i} className="aspect-[1/0.95] border-r border-b border-zinc-100/60 dark:border-zinc-800/40 last:border-r-0 bg-zinc-50/40 dark:bg-zinc-900/40" />
            const key = ymd(day)
            const isToday = key === todayKey
            const isWeekend = day.getDay() === 0 || day.getDay() === 6
            const dayLeaves = leavesByDay.get(key) || []
            return (
              <DayCell
                key={i}
                day={day}
                isToday={isToday}
                isWeekend={isWeekend}
                leaves={dayLeaves}
                isAdmin={isAdmin}
                currentUserId={currentUserId}
                rowEnd={(i + 1) % 7 === 0}
              />
            )
          })}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 px-5 py-2.5 border-t border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/40 dark:bg-zinc-900/40">
          {(Object.keys(TYPE_META) as LeaveType[]).map(t => (
            <span key={t} className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
              <span className={`h-2 w-2 rounded-full ${TYPE_META[t].bar}`} />
              {TYPE_META[t].label}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-zinc-400">
            {filtered.length} คำขอที่แสดงใน calendar
          </span>
        </div>
      </div>

      {/* ══════════════ TWO-COLUMN: UPCOMING + PENDING ══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming approved */}
        <SidePanel
          title="กำลังจะมาถึง (14 วัน)"
          icon={<CalendarDays className="h-4 w-4 text-emerald-500" />}
          empty="ไม่มีการลาในช่วง 14 วันข้างหน้า"
          items={upcoming}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
        />

        {/* Pending queue */}
        <SidePanel
          title={isAdmin ? 'รออนุมัติ — ทีม' : 'คำขอของฉันที่รออยู่'}
          icon={<Clock className="h-4 w-4 text-amber-500" />}
          empty={isAdmin ? 'ไม่มีคำขอรออนุมัติ' : 'ไม่มีคำขอรออยู่'}
          items={pendingQueue}
          isAdmin={isAdmin}
          currentUserId={currentUserId}
          showStatus
        />
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────

function KpiCard({
  tone, icon, label, value, sub,
}: {
  tone: 'rose' | 'cyan' | 'amber' | 'emerald'
  icon: string
  label: string
  value: string
  sub?: string
}) {
  const toneMap = {
    rose:    'border-rose-200/60 dark:border-rose-900/40 bg-gradient-to-br from-rose-50/70 to-white dark:from-rose-950/20 dark:to-zinc-900',
    cyan:    'border-cyan-200/60 dark:border-cyan-900/40 bg-gradient-to-br from-cyan-50/70 to-white dark:from-cyan-950/20 dark:to-zinc-900',
    amber:   'border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-br from-amber-50/70 to-white dark:from-amber-950/20 dark:to-zinc-900',
    emerald: 'border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/70 to-white dark:from-emerald-950/20 dark:to-zinc-900',
  } as const
  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider leading-tight">{label}</p>
        <span className="text-base leading-none">{icon}</span>
      </div>
      <p className="text-2xl md:text-3xl font-bold font-mono tabular-nums text-zinc-900 dark:text-zinc-100 mt-1.5 leading-none">{value}</p>
      {sub && <p className="text-[10px] text-zinc-400 mt-1.5">{sub}</p>}
    </div>
  )
}

function TypeBreakdownCard({ byType }: { byType: Record<LeaveType, number> }) {
  const total = byType.personal + byType.sick + byType.vacation
  return (
    <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900 p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider leading-tight">แยกตามประเภท</p>
        <span className="text-base leading-none">📊</span>
      </div>
      {total === 0 ? (
        <p className="text-xs text-zinc-400 mt-2">ไม่มีข้อมูลใน period นี้</p>
      ) : (
        <>
          {/* Stacked bar */}
          <div className="flex h-2 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 mt-1">
            {(Object.keys(TYPE_META) as LeaveType[]).map(t => {
              const w = total > 0 ? (byType[t] / total) * 100 : 0
              if (w === 0) return null
              return <span key={t} className={TYPE_META[t].bar} style={{ width: `${w}%` }} />
            })}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
            {(Object.keys(TYPE_META) as LeaveType[]).map(t => (
              <span key={t} className="inline-flex items-center gap-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                <span className={`h-1.5 w-1.5 rounded-full ${TYPE_META[t].bar}`} />
                <span className="font-mono tabular-nums">{byType[t]}</span>
                <span className="opacity-70">{TYPE_META[t].label}</span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FilterPill({
  active, onClick, label, activeClass,
}: {
  active: boolean
  onClick: () => void
  label: string
  activeClass?: string
}) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-all ${
        active
          ? (activeClass || 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm')
          : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200'
      }`}
    >
      {label}
    </button>
  )
}

function DayCell({
  day, isToday, isWeekend, leaves, isAdmin, currentUserId, rowEnd,
}: {
  day: Date
  isToday: boolean
  isWeekend: boolean
  leaves: LeaveRecord[]
  isAdmin: boolean
  currentUserId: string
  rowEnd: boolean
}) {
  const visibleBars = leaves.slice(0, 3)
  const hidden = Math.max(0, leaves.length - 3)
  const hasMine = leaves.some(l => l.user_id === currentUserId)

  return (
    <div
      className={`relative aspect-[1/0.95] min-h-[68px] md:min-h-[88px] p-1.5 md:p-2 border-b border-zinc-100/60 dark:border-zinc-800/40 ${rowEnd ? '' : 'border-r'} group transition-colors ${
        isToday
          ? 'bg-amber-50/60 dark:bg-amber-950/20'
          : isWeekend
            ? 'bg-zinc-50/40 dark:bg-zinc-900/40'
            : 'bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/30'
      }`}
    >
      {/* Day number */}
      <div className="flex items-center justify-between mb-1">
        <span
          className={`inline-flex items-center justify-center h-5 min-w-[20px] px-1 text-[11px] md:text-xs font-bold tabular-nums leading-none rounded-full ${
            isToday
              ? 'bg-amber-500 text-white'
              : isWeekend
                ? 'text-rose-400 dark:text-rose-500'
                : 'text-zinc-700 dark:text-zinc-300'
          }`}
        >
          {day.getDate()}
        </span>
        {hasMine && !isAdmin === false && (
          <span className="hidden md:inline-block h-1 w-1 rounded-full bg-zinc-400" title="คุณมีคำขอวันนี้" />
        )}
      </div>

      {/* Leave bars */}
      <div className="space-y-0.5">
        {visibleBars.map(l => {
          const meta = TYPE_META[l.leave_type]
          const isPending = l.status === 'pending'
          const name = nameOf(l.profiles)
          const showName = isAdmin
          return (
            <div
              key={l.id}
              className={`flex items-center gap-1 px-1 md:px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-semibold text-white truncate ${meta.bar} ${isPending ? 'opacity-50' : ''}`}
              title={`${meta.label}${showName ? ` · ${name}` : ''}${isPending ? ' (รออนุมัติ)' : ''}`}
            >
              <span className="leading-none">{meta.emoji}</span>
              <span className="truncate hidden md:inline">{showName ? name : meta.label}</span>
            </div>
          )
        })}
        {hidden > 0 && (
          <div className="text-[9px] md:text-[10px] text-zinc-400 font-semibold pl-1">+{hidden} อื่น</div>
        )}
      </div>
    </div>
  )
}

function SidePanel({
  title, icon, empty, items, isAdmin, currentUserId, showStatus,
}: {
  title: string
  icon: React.ReactNode
  empty: string
  items: LeaveRecord[]
  isAdmin: boolean
  currentUserId: string
  showStatus?: boolean
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4 space-y-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider flex items-center gap-1.5">
          {icon}
          {title}
        </h2>
        <span className="text-[10px] text-zinc-400 font-mono">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-zinc-400 italic py-3 text-center">{empty}</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map(l => <LeaveListRow key={l.id} leave={l} isAdmin={isAdmin} currentUserId={currentUserId} showStatus={showStatus} />)}
        </ul>
      )}
    </div>
  )
}

function LeaveListRow({
  leave, isAdmin, currentUserId, showStatus,
}: {
  leave: LeaveRecord
  isAdmin: boolean
  currentUserId: string
  showStatus?: boolean
}) {
  const meta = TYPE_META[leave.leave_type]
  const status = STATUS_META[leave.status]
  const StatusIcon = status.icon
  const isMine = leave.user_id === currentUserId
  const name = nameOf(leave.profiles)
  const dateLabel = leave.start_date === leave.end_date
    ? fmtThaiShort(leave.start_date)
    : `${fmtThaiShort(leave.start_date)} – ${fmtThaiShort(leave.end_date)}`

  return (
    <li className={`flex items-center gap-3 px-2.5 py-2 rounded-lg border ${meta.ring} ${meta.bgSoft}`}>
      <div className="h-9 w-9 rounded-lg bg-white/80 dark:bg-zinc-800/60 flex items-center justify-center text-lg shrink-0 shadow-sm">
        {meta.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-[13px] font-bold text-zinc-900 dark:text-zinc-100">
            {meta.label}
          </p>
          {isAdmin && (
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
              · {isMine ? 'ฉัน' : name}
            </span>
          )}
          {showStatus && (
            <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md border ${status.tone}`}>
              <StatusIcon className="h-2.5 w-2.5" />
              {status.label}
            </span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
          {dateLabel}
          <span className="mx-1.5">·</span>
          <span className="font-mono font-semibold tabular-nums">{leave.total_days} วัน</span>
          {leave.attachment_url && (
            <>
              <span className="mx-1.5">·</span>
              <a href={leave.attachment_url} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-0.5 hover:text-zinc-800 dark:hover:text-zinc-200 underline decoration-dotted"
                onClick={e => e.stopPropagation()}>
                <ImageIcon className="h-2.5 w-2.5" /> เอกสาร
              </a>
            </>
          )}
        </p>
      </div>
    </li>
  )
}
