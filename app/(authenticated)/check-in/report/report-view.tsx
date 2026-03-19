'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Calendar, Clock, Users, Building2, MapPin, Home,
  TrendingUp, BarChart3, UserCheck, AlertTriangle, Download,
  ChevronDown, ChevronRight, Eye, Search, Filter, X,
  Settings, Timer, Zap, LayoutDashboard, Table2
} from 'lucide-react'
import { getCheckinReportData, updateStaffWorkSettings } from '../actions'

// ─── Types ─────────────────────────────────────────────────
interface CheckinRecord {
  id: string
  user_id: string
  check_type: string
  checked_in_at: string
  checked_out_at: string | null
  note: string | null
  photo_url: string | null
  event_id: string | null
  latitude: number | null
  longitude: number | null
  profiles: { id: string; full_name: string | null; nickname: string | null } | null
  events: { id: string; name: string } | null
}

interface StaffMember {
  id: string
  full_name: string | null
  nickname: string | null
  standard_hours: number | null
  late_hour: number | null
  late_minute: number | null
  ot_threshold: number | null
}

interface Props {
  initialRecords: CheckinRecord[]
  staff: StaffMember[]
  defaultStart: string
  defaultEnd: string
}

const TYPE_LABELS: Record<string, string> = { office: 'เข้าออฟฟิศ', onsite: 'ไปหน้างาน', remote: 'WFH' }
const TYPE_ICONS: Record<string, typeof Building2> = { office: Building2, onsite: MapPin, remote: Home }

// ─── Helpers ───────────────────────────────────────────────

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })
}

function diffHours(start: string, end: string | null): number {
  if (!end) return 0
  return (new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60)
}

function diffHoursLabel(h: number): string {
  if (h <= 0) return '—'
  const hrs = Math.floor(h)
  const mins = Math.round((h - hrs) * 60)
  return `${hrs}ช.${mins}น.`
}

function isLateCheckin(checkedInAt: string, lateHour: number, lateMinute: number): boolean {
  const d = new Date(checkedInAt)
  let hour = d.getUTCHours() + 7 // Bangkok offset
  if (hour >= 24) hour -= 24
  const minute = d.getUTCMinutes()
  return hour > lateHour || (hour === lateHour && minute > lateMinute)
}

function getCheckinHour(checkedInAt: string): number {
  const d = new Date(checkedInAt)
  const hour = d.getUTCHours() + 7
  return hour >= 24 ? hour - 24 : hour
}

// ─── Main Component ────────────────────────────────────────

export default function CheckinReportView({ initialRecords, staff, defaultStart, defaultEnd }: Props) {
  const router = useRouter()
  const [records, setRecords] = useState<CheckinRecord[]>(initialRecords)
  const [startDate, setStartDate] = useState(defaultStart)
  const [endDate, setEndDate] = useState(defaultEnd)
  const [loading, setLoading] = useState(false)
  const [staffFilter, setStaffFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set())
  const [showPhotoLightbox, setShowPhotoLightbox] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  // ─── Work Settings (configurable) ──────────────────────────
  const [standardHoursPerDay, setStandardHoursPerDay] = useState(8)
  const [lateHour, setLateHour] = useState(9)
  const [lateMinute, setLateMinute] = useState(0)
  const [otThresholdHours, setOtThresholdHours] = useState(8)
  const [showSettings, setShowSettings] = useState(false)
  const [viewMode, setViewMode] = useState<'dashboard' | 'table'>('dashboard')

  // Per-staff settings from DB (local copy for edits)
  const [staffSettingsMap, setStaffSettingsMap] = useState<Record<string, {
    standard_hours: number | null; late_hour: number | null; late_minute: number | null; ot_threshold: number | null
  }>>(() => {
    const m: Record<string, any> = {}
    staff.forEach(s => {
      if (s.standard_hours != null || s.late_hour != null || s.late_minute != null || s.ot_threshold != null) {
        m[s.id] = { standard_hours: s.standard_hours, late_hour: s.late_hour, late_minute: s.late_minute, ot_threshold: s.ot_threshold }
      }
    })
    return m
  })
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null)
  const [savingSettings, setSavingSettings] = useState(false)

  // Effective per-staff values (per-staff → global fallback)
  const getEffectiveHours = (userId: string) => staffSettingsMap[userId]?.standard_hours ?? standardHoursPerDay
  const getEffectiveLateHour = (userId: string) => staffSettingsMap[userId]?.late_hour ?? lateHour
  const getEffectiveLateMinute = (userId: string) => staffSettingsMap[userId]?.late_minute ?? lateMinute
  const getEffectiveOtThreshold = (userId: string) => staffSettingsMap[userId]?.ot_threshold ?? otThresholdHours

  // Fetch new data when date range changes
  const handleDateChange = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getCheckinReportData(startDate, endDate)
      setRecords(data.records as unknown as CheckinRecord[])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }, [startDate, endDate])

  // ─── Computed Stats ────────────────────────────────────────

  const filteredRecords = useMemo(() => {
    return records.filter(r => {
      if (staffFilter !== 'all' && r.user_id !== staffFilter) return false
      if (typeFilter !== 'all' && r.check_type !== typeFilter) return false
      if (searchQuery) {
        const name = r.profiles?.full_name?.toLowerCase() || ''
        const nick = r.profiles?.nickname?.toLowerCase() || ''
        const q = searchQuery.toLowerCase()
        if (!name.includes(q) && !nick.includes(q)) return false
      }
      return true
    })
  }, [records, staffFilter, typeFilter, searchQuery])

  const overviewStats = useMemo(() => {
    const uniqueDays = new Set(filteredRecords.map(r => new Date(r.checked_in_at).toISOString().split('T')[0]))
    const uniqueUsers = new Set(filteredRecords.map(r => r.user_id))
    const totalHours = filteredRecords.reduce((sum, r) => sum + diffHours(r.checked_in_at, r.checked_out_at), 0)
    const lateCount = filteredRecords.filter(r => !r.event_id && isLateCheckin(r.checked_in_at, getEffectiveLateHour(r.user_id), getEffectiveLateMinute(r.user_id))).length
    const byType = { office: 0, onsite: 0, remote: 0 } as Record<string, number>
    filteredRecords.forEach(r => { byType[r.check_type] = (byType[r.check_type] || 0) + 1 })
    const noCheckout = filteredRecords.filter(r => !r.checked_out_at).length

    return {
      totalRecords: filteredRecords.length,
      totalDays: uniqueDays.size,
      totalStaff: uniqueUsers.size,
      avgHoursPerDay: uniqueDays.size > 0 ? totalHours / uniqueDays.size : 0,
      totalHours,
      lateCount,
      latePercent: filteredRecords.length > 0 ? Math.round((lateCount / filteredRecords.length) * 100) : 0,
      byType,
      noCheckout,
    }
  }, [filteredRecords, lateHour, lateMinute, staffSettingsMap])

  // Per-staff breakdown
  const staffBreakdown = useMemo(() => {
    const map = new Map<string, {
      name: string; nickname: string | null; records: CheckinRecord[]; totalHours: number;
      lateDays: number; uniqueDays: number; byType: Record<string, number>
    }>()

    filteredRecords.forEach(r => {
      if (!map.has(r.user_id)) {
        map.set(r.user_id, {
          name: r.profiles?.full_name || 'Unknown',
          nickname: r.profiles?.nickname || null,
          records: [],
          totalHours: 0,
          lateDays: 0,
          uniqueDays: 0,
          byType: {},
        })
      }
      const entry = map.get(r.user_id)!
      entry.records.push(r)
      entry.totalHours += diffHours(r.checked_in_at, r.checked_out_at)
      if (!r.event_id && isLateCheckin(r.checked_in_at, getEffectiveLateHour(r.user_id), getEffectiveLateMinute(r.user_id))) entry.lateDays++
      entry.byType[r.check_type] = (entry.byType[r.check_type] || 0) + 1
    })

    // Calculate unique days
    map.forEach(entry => {
      const days = new Set(entry.records.map(r => new Date(r.checked_in_at).toISOString().split('T')[0]))
      entry.uniqueDays = days.size
    })

    return Array.from(map.entries())
      .map(([userId, data]) => ({ userId, ...data }))
      .sort((a, b) => b.uniqueDays - a.uniqueDays)
  }, [filteredRecords, lateHour, lateMinute, staffSettingsMap])

  // Check-in time distribution (hourly)
  const hourDistribution = useMemo(() => {
    const hours = new Array(24).fill(0)
    filteredRecords.forEach(r => {
      const h = getCheckinHour(r.checked_in_at)
      hours[h]++
    })
    return hours
  }, [filteredRecords])

  const toggleStaff = (userId: string) => {
    setExpandedStaff(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  // CSV Export
  function exportCSV() {
    const header = 'ชื่อ,วันที่,เวลาเข้า,เวลาออก,ชั่วโมง,ประเภท,ตำแหน่ง,หมายเหตุ\n'
    const rows = filteredRecords.map(r => {
      const name = r.profiles?.full_name || ''
      const date = new Date(r.checked_in_at).toLocaleDateString('th-TH')
      const inTime = formatTime(r.checked_in_at)
      const outTime = r.checked_out_at ? formatTime(r.checked_out_at) : ''
      const hours = diffHours(r.checked_in_at, r.checked_out_at).toFixed(1)
      const type = TYPE_LABELS[r.check_type] || r.check_type
      const location = r.latitude && r.longitude ? `${r.latitude.toFixed(6)} ${r.longitude.toFixed(6)}` : ''
      const note = (r.note || '').replace(/,/g, ' ')
      return `${name},${date},${inTime},${outTime},${hours},${type},${location},${note}`
    }).join('\n')

    const blob = new Blob(['\ufeff' + header + rows], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `checkin-report-${startDate}-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const maxHour = Math.max(...hourDistribution, 1)

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/check-in"
            className="h-9 w-9 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
            <ArrowLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              รายงาน Check-in
            </h1>
            <p className="text-sm text-zinc-400 dark:text-zinc-500">HR Report · Admin Only</p>
          </div>
        </div>
        <button onClick={exportCSV}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]">
          <Download className="h-4 w-4" /> Export CSV
        </button>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl w-fit">
        <button onClick={() => setViewMode('dashboard')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            viewMode === 'dashboard'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}>
          <LayoutDashboard className="h-4 w-4" /> Dashboard
        </button>
        <button onClick={() => setViewMode('table')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
            viewMode === 'table'
              ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm'
              : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300'
          }`}>
          <Table2 className="h-4 w-4" /> ตารางชั่วโมง
        </button>
      </div>

      {/* Date Range + Filters */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex items-center gap-2 flex-1">
            <Calendar className="h-4 w-4 text-zinc-400 shrink-0" />
            <input type="date" value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10" />
            <span className="text-zinc-400 text-sm">—</span>
            <input type="date" value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 dark:focus:ring-zinc-100/10" />
          </div>
          <button onClick={handleDateChange} disabled={loading}
            className="h-10 px-5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-colors active:scale-[0.98]">
            {loading ? 'กำลังโหลด...' : 'ดูรายงาน'}
          </button>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <input type="text" placeholder="ค้นหาชื่อ..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-9 pl-8 pr-3 w-[160px] rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
          </div>
          <select value={staffFilter} onChange={e => setStaffFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none">
            <option value="all">ทุกคน</option>
            {staff.map(s => (
              <option key={s.id} value={s.id}>{s.full_name || s.nickname || s.id.slice(0, 8)}</option>
            ))}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none">
            <option value="all">ทุกประเภท</option>
            <option value="office">เข้าออฟฟิศ</option>
            <option value="onsite">ไปหน้างาน</option>
            <option value="remote">WFH</option>
          </select>
          {(staffFilter !== 'all' || typeFilter !== 'all' || searchQuery) && (
            <button onClick={() => { setStaffFilter('all'); setTypeFilter('all'); setSearchQuery('') }}
              className="h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors flex items-center gap-1">
              <X className="h-3 w-3" /> ล้างตัวกรอง
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════ DASHBOARD VIEW ════════════════ */}
      {viewMode === 'dashboard' && (
      <>
      {/* Overview Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={Users} label="จำนวนพนักงาน" value={overviewStats.totalStaff} />
        <StatCard icon={UserCheck} label="เช็คอินทั้งหมด" value={overviewStats.totalRecords} />
        <StatCard icon={Clock} label="ชั่วโมงรวม" value={Math.round(overviewStats.totalHours)} suffix="ชม." />
        <StatCard icon={AlertTriangle} label="สาย" value={overviewStats.lateCount}
          suffix={`(${overviewStats.latePercent}%)`} alert={overviewStats.latePercent > 20} />
      </div>

      {/* Check-in Type Distribution */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-zinc-400" /> ประเภทการเข้างาน
        </h2>
        <div className="grid grid-cols-3 gap-3">
          {(['office', 'onsite', 'remote'] as const).map(type => {
            const count = overviewStats.byType[type] || 0
            const pct = overviewStats.totalRecords > 0 ? Math.round((count / overviewStats.totalRecords) * 100) : 0
            const Icon = TYPE_ICONS[type]
            return (
              <div key={type} className="bg-zinc-50 dark:bg-zinc-800/50 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Icon className="h-4 w-4 text-zinc-500" />
                  <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">{TYPE_LABELS[type]}</span>
                </div>
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{count}</div>
                <div className="mt-2 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                  <div className="h-full bg-zinc-900 dark:bg-zinc-100 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }} />
                </div>
                <p className="text-xs text-zinc-400 mt-1">{pct}%</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Time Distribution (Mini bar chart) */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-zinc-400" /> ช่วงเวลา Check-in
        </h2>
        <div className="flex items-end gap-[3px] h-[100px]">
          {hourDistribution.map((count, hour) => {
            if (hour < 5 || hour > 22) return null
            const height = maxHour > 0 ? (count / maxHour) * 100 : 0
            const isLateHourFlag = hour > lateHour || (hour === lateHour)
            return (
              <div key={hour} className="flex-1 flex flex-col items-center gap-1 group relative">
                <div
                  className={`w-full rounded-t-sm transition-all duration-300 ${isLateHourFlag
                    ? 'bg-zinc-400 dark:bg-zinc-500'
                    : 'bg-zinc-900 dark:bg-zinc-100'
                    } ${count > 0 ? 'min-h-[4px]' : ''} group-hover:opacity-80`}
                  style={{ height: `${height}%` }}
                />
                <span className="text-[9px] text-zinc-400 leading-none">{hour}</span>
                {count > 0 && (
                  <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-[10px] font-bold px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10">
                    {count}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex items-center gap-4 text-[10px] text-zinc-400">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-zinc-900 dark:bg-zinc-100" /> ตรงเวลา (&lt; {String(lateHour).padStart(2, '0')}:{String(lateMinute).padStart(2, '0')})</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-zinc-400 dark:bg-zinc-500" /> สาย (≥ {String(lateHour).padStart(2, '0')}:{String(lateMinute).padStart(2, '0')})</span>
        </div>
      </div>
      </>
      )}

      {/* ═══════════════ TABLE VIEW ════════════════ */}
      {viewMode === 'table' && (
      <>
      {/* ─── Work Settings Panel ──────────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <button onClick={() => setShowSettings(!showSettings)}
          className="w-full flex items-center gap-2.5 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left">
          <Settings className="h-4 w-4 text-zinc-400" />
          <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex-1">ตั้งค่าเกณฑ์การทำงาน</span>
          <span className="text-xs text-zinc-400">{standardHoursPerDay}ชม./วัน · สาย {String(lateHour).padStart(2, '0')}:{String(lateMinute).padStart(2, '0')} · OT &gt;{otThresholdHours}ชม.</span>
          {showSettings ? <ChevronDown className="h-4 w-4 text-zinc-400" /> : <ChevronRight className="h-4 w-4 text-zinc-400" />}
        </button>
        {showSettings && (
          <div className="border-t border-zinc-100 dark:border-zinc-800 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> ชั่วโมงทำงาน/วัน
                </label>
                <input type="number" min={1} max={24} value={standardHoursPerDay}
                  onChange={e => setStandardHoursPerDay(Number(e.target.value) || 8)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                <p className="text-[10px] text-zinc-400">ใช้คำนวณ OT และชั่วโมงมาตรฐาน</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" /> เวลาเริ่มงาน (สาย)
                </label>
                <div className="flex gap-2">
                  <input type="number" min={0} max={23} value={lateHour}
                    onChange={e => setLateHour(Number(e.target.value) || 0)}
                    className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="ชม." />
                  <span className="flex items-center text-zinc-400 font-bold">:</span>
                  <input type="number" min={0} max={59} value={lateMinute}
                    onChange={e => setLateMinute(Number(e.target.value) || 0)}
                    className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
                    placeholder="น." />
                </div>
                <p className="text-[10px] text-zinc-400">เช็คอินหลังเวลานี้ = สาย</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="h-3.5 w-3.5" /> เกณฑ์ OT (ชม./วัน)
                </label>
                <input type="number" min={1} max={24} value={otThresholdHours}
                  onChange={e => setOtThresholdHours(Number(e.target.value) || 8)}
                  className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10" />
                <p className="text-[10px] text-zinc-400">ทำงานเกินนี้ต่อวัน = OT</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Work Hours Summary Table ─────────────────────────── */}
      <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
        <div className="p-5 pb-3">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
            <Timer className="h-4 w-4 text-zinc-400" /> สรุปชั่วโมงการทำงาน
          </h2>
          <p className="text-xs text-zinc-400 mt-1">ค่า Global: {standardHoursPerDay} ชม./วัน · สาย ≥ {String(lateHour).padStart(2, '0')}:{String(lateMinute).padStart(2, '0')} · OT &gt; {otThresholdHours} ชม./วัน · <span className="text-zinc-500 font-medium">*คือค่าเฉพาะบุคคล</span></p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-y border-zinc-100 dark:border-zinc-800">
                <th className="px-4 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">พนักงาน</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">เกณฑ์</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">วัน</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ชม.รวม</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ชม.มาตรฐาน</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">OT</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">สาย</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">เฉลี่ย/วัน</th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {staffBreakdown.map(member => {
                const effHours = getEffectiveHours(member.userId)
                const effOt = getEffectiveOtThreshold(member.userId)
                const hasCustom = !!staffSettingsMap[member.userId]
                const standardTotal = member.uniqueDays * effHours
                // OT per day
                const dailyMap = new Map<string, number>()
                member.records.forEach(r => {
                  const day = new Date(r.checked_in_at).toISOString().split('T')[0]
                  dailyMap.set(day, (dailyMap.get(day) || 0) + diffHours(r.checked_in_at, r.checked_out_at))
                })
                let otHoursVal = 0
                dailyMap.forEach(h => { if (h > effOt) otHoursVal += h - effOt })
                const avgPerDay = member.uniqueDays > 0 ? member.totalHours / member.uniqueDays : 0
                const diff = member.totalHours - standardTotal

                return (
                  <tr key={member.userId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-[10px] font-bold shrink-0">
                          {(member.name || '').split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-zinc-900 dark:text-zinc-100">{member.name}</div>
                          {member.nickname && <div className="text-[10px] text-zinc-400">{member.nickname}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button onClick={() => setEditingStaffId(member.userId)}
                        className={`text-[10px] font-bold px-2 py-1 rounded-md transition-colors ${hasCustom
                          ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300'
                          : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                        {hasCustom ? `${effHours}ชม.` : 'Global'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-zinc-700 dark:text-zinc-300 font-medium">{member.uniqueDays}</td>
                    <td className="px-4 py-3 text-center font-mono text-zinc-700 dark:text-zinc-300 font-bold">{member.totalHours.toFixed(1)}</td>
                    <td className="px-4 py-3 text-center font-mono text-zinc-400">{standardTotal.toFixed(0)}</td>
                    <td className="px-4 py-3 text-center">
                      {otHoursVal > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200">
                          <Zap className="h-3 w-3" /> {otHoursVal.toFixed(1)}ชม.
                        </span>
                      ) : (
                        <span className="text-zinc-300 dark:text-zinc-600">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {member.lateDays > 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          {member.lateDays} ครั้ง
                        </span>
                      ) : (
                        <span className="text-xs text-zinc-300 dark:text-zinc-600">0</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center font-mono text-zinc-600 dark:text-zinc-400 text-xs">{avgPerDay.toFixed(1)} ชม.</td>
                    <td className="px-4 py-3 text-center">
                      {diff >= 0 ? (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                          +{diff.toFixed(1)}ชม.
                        </span>
                      ) : (
                        <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                          {diff.toFixed(1)}ชม.
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* Total row */}
              {staffBreakdown.length > 0 && (
                <tr className="bg-zinc-50 dark:bg-zinc-800/50 font-bold">
                  <td className="px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100">รวมทั้งหมด</td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-center font-mono text-zinc-700 dark:text-zinc-300">—</td>
                  <td className="px-4 py-3 text-center font-mono text-zinc-900 dark:text-zinc-100">{overviewStats.totalHours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-center font-mono text-zinc-400">{staffBreakdown.reduce((s, m) => s + m.uniqueDays * getEffectiveHours(m.userId), 0).toFixed(0)}</td>
                  <td className="px-4 py-3 text-center font-mono text-zinc-700 dark:text-zinc-300">
                    {(() => {
                      let totalOT = 0
                      staffBreakdown.forEach(member => {
                        const eOt = getEffectiveOtThreshold(member.userId)
                        const dm = new Map<string, number>()
                        member.records.forEach(r => {
                          const day = new Date(r.checked_in_at).toISOString().split('T')[0]
                          dm.set(day, (dm.get(day) || 0) + diffHours(r.checked_in_at, r.checked_out_at))
                        })
                        dm.forEach(h => { if (h > eOt) totalOT += h - eOt })
                      })
                      return totalOT > 0 ? `${totalOT.toFixed(1)}ชม.` : '—'
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center font-mono text-zinc-500">{overviewStats.lateCount}</td>
                  <td className="px-4 py-3 text-center" colSpan={2} />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Staff Breakdown */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
          <Users className="h-4 w-4 text-zinc-400" /> รายบุคคล ({staffBreakdown.length} คน)
        </h2>

        {staffBreakdown.map(member => {
          const isExpanded = expandedStaff.has(member.userId)
          const avgHours = member.uniqueDays > 0 ? member.totalHours / member.uniqueDays : 0
          const initials = (member.name || '')
            .split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase()

          return (
            <div key={member.userId}
              className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
              {/* Summary row */}
              <button
                onClick={() => toggleStaff(member.userId)}
                className="w-full flex items-center gap-3 p-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors text-left"
              >
                {/* Avatar */}
                <div className="h-10 w-10 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 flex items-center justify-center text-sm font-bold shrink-0">
                  {initials}
                </div>

                {/* Name + stats */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm text-zinc-900 dark:text-zinc-100 truncate">{member.name}</span>
                    {member.nickname && (
                      <span className="text-xs text-zinc-400">({member.nickname})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-zinc-400">
                    <span>{member.uniqueDays} วัน</span>
                    <span>{diffHoursLabel(member.totalHours)}</span>
                    <span>เฉลี่ย {diffHoursLabel(avgHours)}/วัน</span>
                    {member.lateDays > 0 && (
                      <span className="text-zinc-500 font-medium">สาย {member.lateDays} ครั้ง</span>
                    )}
                  </div>
                </div>

                {/* Type pills */}
                <div className="hidden sm:flex items-center gap-1.5 shrink-0">
                  {Object.entries(member.byType).map(([type, count]) => (
                    <span key={type} className="text-[10px] font-bold px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                      {TYPE_LABELS[type]?.slice(0, 3) || type} {count}
                    </span>
                  ))}
                </div>

                {/* Chevron */}
                {isExpanded
                  ? <ChevronDown className="h-4 w-4 text-zinc-400 shrink-0" />
                  : <ChevronRight className="h-4 w-4 text-zinc-400 shrink-0" />}
              </button>

              {/* Expanded: daily records */}
              {isExpanded && (
                <div className="border-t border-zinc-100 dark:border-zinc-800">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-zinc-50 dark:bg-zinc-800/50">
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">วันที่</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">เข้า</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ออก</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ชั่วโมง</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ประเภท</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ตำแหน่ง</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">รูป</th>
                          <th className="px-4 py-2.5 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">หมายเหตุ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {member.records.map(r => {
                          const hours = diffHours(r.checked_in_at, r.checked_out_at)
                          const isEventCheckin = !!r.event_id
                          const late = !isEventCheckin && isLateCheckin(r.checked_in_at, getEffectiveLateHour(member.userId), getEffectiveLateMinute(member.userId))
                          return (
                            <tr key={r.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                              <td className="px-4 py-2.5 text-zinc-900 dark:text-zinc-100 font-medium whitespace-nowrap">
                                {formatDate(r.checked_in_at)}
                              </td>
                              <td className={`px-4 py-2.5 font-mono whitespace-nowrap ${late ? 'text-zinc-500 font-bold' : 'text-zinc-600 dark:text-zinc-400'}`}>
                                {formatTime(r.checked_in_at)}
                                {late && <span className="ml-1 text-[9px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">สาย</span>}
                                {isEventCheckin && <span className="ml-1 text-[9px] font-bold text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">อีเวนต์</span>}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400 whitespace-nowrap">
                                {r.checked_out_at ? formatTime(r.checked_out_at) : <span className="text-zinc-300 dark:text-zinc-600">—</span>}
                              </td>
                              <td className="px-4 py-2.5 font-mono text-zinc-600 dark:text-zinc-400">
                                {diffHoursLabel(hours)}
                              </td>
                              <td className="px-4 py-2.5">
                                <span className="text-[10px] font-bold px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 uppercase tracking-wide">
                                  {TYPE_LABELS[r.check_type] || r.check_type}
                                </span>
                              </td>
                              <td className="px-4 py-2.5">
                                {r.latitude && r.longitude ? (
                                  <a
                                    href={`https://www.google.com/maps?q=${r.latitude},${r.longitude}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <MapPin className="h-3 w-3" />
                                    ดูแผนที่
                                  </a>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                {r.photo_url ? (
                                  <button onClick={() => setShowPhotoLightbox(r.photo_url)}
                                    className="h-8 w-8 rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700 hover:shadow-md transition-shadow">
                                    <img src={r.photo_url} alt="" className="h-full w-full object-cover" />
                                  </button>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-600">—</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-zinc-500 dark:text-zinc-400 max-w-[200px] truncate text-xs">
                                {r.note || '—'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {staffBreakdown.length === 0 && (
          <div className="text-center py-16 text-sm text-zinc-400 dark:text-zinc-500">
            ไม่พบข้อมูลในช่วงเวลาที่เลือก
          </div>
        )}
      </div>
      </>
      )}

      {/* Staff Settings Edit Modal */}
      {editingStaffId && (() => {
        const staffMember = staff.find(s => s.id === editingStaffId)
        const current = staffSettingsMap[editingStaffId] || {
          standard_hours: null, late_hour: null, late_minute: null, ot_threshold: null
        }
        const hasCustom = !!staffSettingsMap[editingStaffId]

        return (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setEditingStaffId(null)}>
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-2xl w-full max-w-md"
              onClick={e => e.stopPropagation()}>
              {/* Modal Header */}
              <div className="flex items-center justify-between p-5 border-b border-zinc-100 dark:border-zinc-800">
                <div>
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">ตั้งค่าเกณฑ์เฉพาะบุคคล</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{staffMember?.full_name || editingStaffId.slice(0, 8)}</p>
                </div>
                <button onClick={() => setEditingStaffId(null)}
                  className="h-8 w-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                  <X className="h-4 w-4 text-zinc-500" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-5 space-y-4">
                {hasCustom && (
                  <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
                    <Settings className="h-3.5 w-3.5" /> ใช้ค่าเฉพาะบุคคลอยู่
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> ชั่วโมงทำงาน/วัน
                  </label>
                  <input type="number" min={1} max={24} step={0.5}
                    value={current.standard_hours ?? ''}
                    placeholder={`Global: ${standardHoursPerDay}`}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      setStaffSettingsMap(prev => ({...prev, [editingStaffId]: { ...current, standard_hours: v }}))
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5" /> เวลาเริ่มงาน (สาย)
                  </label>
                  <div className="flex gap-2">
                    <input type="number" min={0} max={23}
                      value={current.late_hour ?? ''}
                      placeholder={`${lateHour}`}
                      onChange={e => {
                        const v = e.target.value === '' ? null : Number(e.target.value)
                        setStaffSettingsMap(prev => ({...prev, [editingStaffId]: { ...current, late_hour: v }}))
                      }}
                      className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                    <span className="flex items-center text-zinc-400 font-bold">:</span>
                    <input type="number" min={0} max={59}
                      value={current.late_minute ?? ''}
                      placeholder={`${lateMinute}`}
                      onChange={e => {
                        const v = e.target.value === '' ? null : Number(e.target.value)
                        setStaffSettingsMap(prev => ({...prev, [editingStaffId]: { ...current, late_minute: v }}))
                      }}
                      className="flex-1 h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> เกณฑ์ OT (ชม./วัน)
                  </label>
                  <input type="number" min={1} max={24} step={0.5}
                    value={current.ot_threshold ?? ''}
                    placeholder={`Global: ${otThresholdHours}`}
                    onChange={e => {
                      const v = e.target.value === '' ? null : Number(e.target.value)
                      setStaffSettingsMap(prev => ({...prev, [editingStaffId]: { ...current, ot_threshold: v }}))
                    }}
                    className="w-full h-10 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm font-mono text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 placeholder:text-zinc-300 dark:placeholder:text-zinc-600" />
                </div>

                <p className="text-[10px] text-zinc-400">เว้นว่าง = ใช้ค่า Global ({standardHoursPerDay}ชม. / สาย {String(lateHour).padStart(2, '0')}:{String(lateMinute).padStart(2, '0')} / OT {otThresholdHours}ชม.)</p>
              </div>

              {/* Modal Footer */}
              <div className="flex items-center gap-2 p-5 pt-0">
                {hasCustom && (
                  <button
                    disabled={savingSettings}
                    onClick={async () => {
                      setSavingSettings(true)
                      await updateStaffWorkSettings(editingStaffId, { standard_hours: null, late_hour: null, late_minute: null, ot_threshold: null })
                      setStaffSettingsMap(prev => { const n = {...prev}; delete n[editingStaffId]; return n })
                      setSavingSettings(false)
                      setEditingStaffId(null)
                    }}
                    className="h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40">
                    รีเซ็ตเป็น Global
                  </button>
                )}
                <div className="flex-1" />
                <button onClick={() => setEditingStaffId(null)}
                  className="h-10 px-4 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                  ยกเลิก
                </button>
                <button
                  disabled={savingSettings}
                  onClick={async () => {
                    setSavingSettings(true)
                    const settings = staffSettingsMap[editingStaffId] || { standard_hours: null, late_hour: null, late_minute: null, ot_threshold: null }
                    // If all null, remove custom
                    const allNull = settings.standard_hours == null && settings.late_hour == null && settings.late_minute == null && settings.ot_threshold == null
                    await updateStaffWorkSettings(editingStaffId, settings)
                    if (allNull) {
                      setStaffSettingsMap(prev => { const n = {...prev}; delete n[editingStaffId]; return n })
                    }
                    setSavingSettings(false)
                    setEditingStaffId(null)
                  }}
                  className="h-10 px-5 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 disabled:opacity-40 transition-colors active:scale-[0.98]">
                  {savingSettings ? 'กำลังบันทึก...' : 'บันทึก'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* Photo Lightbox */}
      {showPhotoLightbox && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowPhotoLightbox(null)}>
          <div className="relative max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <img src={showPhotoLightbox} alt="Check-in photo"
              className="w-full h-auto rounded-2xl shadow-2xl" />
            <button onClick={() => setShowPhotoLightbox(null)}
              className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white dark:bg-zinc-800 text-zinc-900 dark:text-white flex items-center justify-center shadow-lg hover:scale-105 transition-transform">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stat Card ──────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, suffix, alert }: {
  icon: typeof Users; label: string; value: number | string; suffix?: string; alert?: boolean
}) {
  return (
    <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon className={`h-4 w-4 ${alert ? 'text-zinc-500' : 'text-zinc-400'}`} />
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${alert ? 'text-zinc-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
        {value}
      </div>
      {suffix && (
        <span className="text-xs text-zinc-400 font-medium">{suffix}</span>
      )}
    </div>
  )
}
