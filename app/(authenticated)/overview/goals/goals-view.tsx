'use client'

import { useState, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Target, TrendingUp, DollarSign, Calendar, Percent, Banknote,
  Settings2, Plus, Trash2, Save, X, ChevronLeft, ChevronRight,
  ArrowUpRight, ArrowDownRight, Minus, Edit3, Copy, Check,
  Zap, BarChart3, Eye, AlertTriangle, CheckCircle2, Info
} from 'lucide-react'
import {
  getGoalsWithActuals, upsertGoal, deleteGoal, duplicateGoalsToYear,
  type GoalRecord
} from './actions'

// ─── Types ──────────────────────────────────────────────────

interface GoalWithActual extends GoalRecord {
  actual: number
  achievement: number // percentage
  status: 'exceeded' | 'on_track' | 'at_risk' | 'behind'
}

// ─── Helpers ────────────────────────────────────────────────

function fmt(n: number): string { return n.toLocaleString('th-TH', { maximumFractionDigits: 0 }) }
function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(0)}K`
  return fmt(n)
}
function fmtPct(n: number): string { return `${n.toFixed(1)}%` }

function formatValue(value: number, valueType: string, unit: string): string {
  if (valueType === 'currency') return `฿${fmt(value)}`
  if (valueType === 'percentage') return `${value.toFixed(1)}%`
  return `${fmt(value)} ${unit}`
}

function formatValueShort(value: number, valueType: string): string {
  if (valueType === 'currency') return `฿${fmtK(value)}`
  if (valueType === 'percentage') return `${value.toFixed(1)}%`
  return fmtK(value)
}

const ICON_MAP: Record<string, typeof Target> = {
  Target, TrendingUp, DollarSign, Calendar, Percent, Banknote, Zap, BarChart3, Eye
}

const COLOR_THEMES: Record<string, { bg: string; text: string; border: string; ring: string; light: string; progress: string }> = {
  emerald: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/20',
    text: 'text-emerald-600 dark:text-emerald-400',
    border: 'border-emerald-200/60 dark:border-emerald-800/40',
    ring: 'ring-emerald-500/20',
    light: 'bg-emerald-100 dark:bg-emerald-900/30',
    progress: 'bg-emerald-500',
  },
  blue: {
    bg: 'bg-blue-50 dark:bg-blue-950/20',
    text: 'text-blue-600 dark:text-blue-400',
    border: 'border-blue-200/60 dark:border-blue-800/40',
    ring: 'ring-blue-500/20',
    light: 'bg-blue-100 dark:bg-blue-900/30',
    progress: 'bg-blue-500',
  },
  amber: {
    bg: 'bg-amber-50 dark:bg-amber-950/20',
    text: 'text-amber-600 dark:text-amber-400',
    border: 'border-amber-200/60 dark:border-amber-800/40',
    ring: 'ring-amber-500/20',
    light: 'bg-amber-100 dark:bg-amber-900/30',
    progress: 'bg-amber-500',
  },
  red: {
    bg: 'bg-red-50 dark:bg-red-950/20',
    text: 'text-red-600 dark:text-red-400',
    border: 'border-red-200/60 dark:border-red-800/40',
    ring: 'ring-red-500/20',
    light: 'bg-red-100 dark:bg-red-900/30',
    progress: 'bg-red-500',
  },
  zinc: {
    bg: 'bg-zinc-50 dark:bg-zinc-800/30',
    text: 'text-zinc-600 dark:text-zinc-400',
    border: 'border-zinc-200/60 dark:border-zinc-800/60',
    ring: 'ring-zinc-500/20',
    light: 'bg-zinc-100 dark:bg-zinc-800/50',
    progress: 'bg-zinc-500',
  },
}

function getGoalStatus(achievement: number, valueType: string, goalKey: string): GoalWithActual['status'] {
  // For cost_ratio: lower is better (inverted)
  if (goalKey === 'cost_ratio') {
    if (achievement <= 100) return 'exceeded'
    if (achievement <= 110) return 'on_track'
    if (achievement <= 130) return 'at_risk'
    return 'behind'
  }
  // For others: higher is better
  if (achievement >= 100) return 'exceeded'
  if (achievement >= 75) return 'on_track'
  if (achievement >= 50) return 'at_risk'
  return 'behind'
}

const STATUS_CONFIG = {
  exceeded: { label: 'บรรลุเป้า', labelEn: 'Exceeded', icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-100 dark:bg-emerald-900/30' },
  on_track: { label: 'ใกล้เป้า', labelEn: 'On Track', icon: TrendingUp, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-100 dark:bg-blue-900/30' },
  at_risk: { label: 'ต้องเร่ง', labelEn: 'At Risk', icon: AlertTriangle, color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-100 dark:bg-amber-900/30' },
  behind: { label: 'ต่ำกว่าเป้า', labelEn: 'Behind', icon: ArrowDownRight, color: 'text-red-600 dark:text-red-400', bg: 'bg-red-100 dark:bg-red-900/30' },
}

const VALUE_TYPE_OPTIONS = [
  { value: 'currency', label: 'สกุลเงิน (฿)' },
  { value: 'percentage', label: 'เปอร์เซ็นต์ (%)' },
  { value: 'count', label: 'จำนวน' },
]

const COLOR_OPTIONS = [
  { value: 'emerald', label: 'เขียว' },
  { value: 'blue', label: 'น้ำเงิน' },
  { value: 'amber', label: 'เหลือง' },
  { value: 'red', label: 'แดง' },
  { value: 'zinc', label: 'เทา' },
]

const ICON_OPTIONS = [
  { value: 'Target', label: 'เป้า' },
  { value: 'TrendingUp', label: 'แนวโน้ม' },
  { value: 'DollarSign', label: 'เงิน' },
  { value: 'Calendar', label: 'ปฏิทิน' },
  { value: 'Percent', label: 'เปอร์เซ็นต์' },
  { value: 'Banknote', label: 'ธนบัตร' },
  { value: 'Zap', label: 'แรง' },
  { value: 'BarChart3', label: 'กราฟ' },
]

// ─── Component ──────────────────────────────────────────────

export default function GoalsView({
  initialGoals,
  initialActuals,
  currentYear,
}: {
  initialGoals: GoalRecord[]
  initialActuals: Record<string, number> | null
  currentYear: number
}) {
  const [goals, setGoals] = useState<GoalRecord[]>(initialGoals)
  const [actuals, setActuals] = useState<Record<string, number> | null>(initialActuals)
  const [fiscalYear, setFiscalYear] = useState(currentYear)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [editingGoal, setEditingGoal] = useState<GoalRecord | null>(null)
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // ─── Computed goals with actuals ────────────────────────────
  const goalsWithActuals: GoalWithActual[] = useMemo(() => {
    return goals
      .filter(g => g.is_active)
      .map(g => {
        const actual = actuals?.[g.goal_key] ?? 0
        const target = Number(g.target_value)
        let achievement = 0

        if (g.goal_key === 'cost_ratio') {
          // For cost ratio: achievement = target / actual (lower actual is better)
          achievement = actual > 0 ? (target / actual) * 100 : (target > 0 ? 0 : 100)
        } else {
          achievement = target > 0 ? (actual / target) * 100 : (actual > 0 ? 100 : 0)
        }

        const status = getGoalStatus(achievement, g.value_type, g.goal_key)

        return { ...g, actual, achievement, status }
      })
  }, [goals, actuals])

  // ─── Summary stats ────────────────────────────────────────
  const summaryStats = useMemo(() => {
    const total = goalsWithActuals.length
    const exceeded = goalsWithActuals.filter(g => g.status === 'exceeded').length
    const onTrack = goalsWithActuals.filter(g => g.status === 'on_track').length
    const atRisk = goalsWithActuals.filter(g => g.status === 'at_risk').length
    const behind = goalsWithActuals.filter(g => g.status === 'behind').length
    const avgAchievement = total > 0
      ? goalsWithActuals.reduce((s, g) => s + g.achievement, 0) / total
      : 0

    return { total, exceeded, onTrack, atRisk, behind, avgAchievement }
  }, [goalsWithActuals])

  // ─── Year navigation ────────────────────────────────────
  const changeYear = useCallback(async (year: number) => {
    setLoading(true)
    setFiscalYear(year)
    const result = await getGoalsWithActuals(year)
    setGoals(result.goals)
    setActuals(result.actuals)
    setLoading(false)
  }, [])

  // ─── Refresh data ────────────────────────────────────────
  const refreshData = useCallback(async () => {
    setLoading(true)
    const result = await getGoalsWithActuals(fiscalYear)
    setGoals(result.goals)
    setActuals(result.actuals)
    setLoading(false)
  }, [fiscalYear])

  // ─── Show message ────────────────────────────────────────
  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // ─── Save goal ──────────────────────────────────────────
  const handleSaveGoal = useCallback(async (goalData: Partial<GoalRecord> & { goal_key: string; label: string; target_value: number; unit: string; value_type: string }) => {
    setSaving(true)
    const result = await upsertGoal({
      ...goalData,
      description: goalData.description ?? undefined,
      fiscal_year: fiscalYear,
    })
    if (result.error) {
      showMessage('error', result.error)
    } else {
      showMessage('success', 'บันทึกเป้าหมายสำเร็จ')
      setEditingGoal(null)
      setIsAddingNew(false)
      await refreshData()
    }
    setSaving(false)
  }, [fiscalYear, refreshData])

  // ─── Delete goal ──────────────────────────────────────────
  const handleDeleteGoal = useCallback(async (id: string) => {
    if (!confirm('ต้องการลบเป้าหมายนี้หรือไม่?')) return
    setSaving(true)
    const result = await deleteGoal(id)
    if (result.error) {
      showMessage('error', result.error)
    } else {
      showMessage('success', 'ลบเป้าหมายสำเร็จ')
      await refreshData()
    }
    setSaving(false)
  }, [refreshData])

  // ─── Duplicate to next year ─────────────────────────────
  const handleDuplicate = useCallback(async () => {
    const toYear = fiscalYear + 1
    if (!confirm(`คัดลอกเป้าหมายจากปี ${fiscalYear} ไปปี ${toYear}?`)) return
    setSaving(true)
    const result = await duplicateGoalsToYear(fiscalYear, toYear)
    if (result.error) {
      showMessage('error', result.error)
    } else {
      showMessage('success', `คัดลอกเป้าหมายไปปี ${toYear} สำเร็จ`)
    }
    setSaving(false)
  }, [fiscalYear])

  // ─── New goal template ──────────────────────────────────
  const newGoalTemplate: GoalRecord = {
    id: '',
    goal_key: '',
    label: '',
    description: '',
    target_value: 0,
    unit: '',
    value_type: 'currency',
    icon: 'Target',
    color: 'zinc',
    sort_order: goals.length + 1,
    is_active: true,
    fiscal_year: fiscalYear,
    period_type: 'yearly',
    period_value: null,
    created_at: '',
    updated_at: '',
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* ── Toast Message ── */}
      {message && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg border text-sm font-medium transition-all duration-300 ${
          message.type === 'success'
            ? 'bg-emerald-50 dark:bg-emerald-900/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
            : 'bg-red-50 dark:bg-red-900/40 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'
        }`}>
          {message.type === 'success' ? <Check className="h-4 w-4 inline mr-1.5" /> : <AlertTriangle className="h-4 w-4 inline mr-1.5" />}
          {message.text}
        </div>
      )}

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Link href="/overview" className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
              Business Goals
            </h1>
          </div>
          <p className="text-sm text-zinc-400 dark:text-zinc-500">เป้าหมายภาพรวมธุรกิจ · Targets & KPI · ปีงบประมาณ {fiscalYear}</p>
        </div>

        <div className="flex items-center gap-2">
          {/* Year Navigation */}
          <div className="flex items-center gap-1 p-1 bg-zinc-100 dark:bg-zinc-800 rounded-xl">
            <button onClick={() => changeYear(fiscalYear - 1)}
              className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 transition-colors">
              <ChevronLeft className="h-4 w-4 text-zinc-500" />
            </button>
            <span className="px-3 py-1 text-sm font-bold text-zinc-900 dark:text-zinc-100 font-mono min-w-[60px] text-center">
              {fiscalYear}
            </span>
            <button onClick={() => changeYear(fiscalYear + 1)}
              className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-zinc-700 transition-colors">
              <ChevronRight className="h-4 w-4 text-zinc-500" />
            </button>
          </div>

          {/* Settings Toggle */}
          <button onClick={() => setIsSettingsOpen(!isSettingsOpen)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 shadow-sm active:scale-[0.98] ${
              isSettingsOpen
                ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                : 'bg-white dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700'
            }`}>
            <Settings2 className="h-4 w-4" /> {isSettingsOpen ? 'ปิดตั้งค่า' : 'ตั้งค่าเป้าหมาย'}
          </button>
        </div>
      </div>

      {/* ── Loading Overlay ── */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-600 dark:border-t-zinc-100 rounded-full animate-spin" />
        </div>
      )}

      {/* ── Dashboard View ── */}
      {!loading && !isSettingsOpen && (
        <>
          {/* ─── Overall Achievement Score ─── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-6">
            <div className="flex flex-col md:flex-row items-center gap-6">
              {/* Overall Score Circle */}
              <div className="relative w-32 h-32 shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor"
                    className="text-zinc-100 dark:text-zinc-800" strokeWidth="8" />
                  <circle cx="60" cy="60" r="52" fill="none"
                    strokeWidth="8" strokeLinecap="round"
                    strokeDasharray={`${Math.min(summaryStats.avgAchievement, 100) * 3.267} 326.7`}
                    className={
                      summaryStats.avgAchievement >= 100 ? 'text-emerald-500'
                      : summaryStats.avgAchievement >= 75 ? 'text-blue-500'
                      : summaryStats.avgAchievement >= 50 ? 'text-amber-500'
                      : 'text-red-500'
                    }
                    stroke="currentColor"
                    style={{ transition: 'stroke-dasharray 1s ease-in-out' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold font-mono text-zinc-900 dark:text-zinc-100">
                    {summaryStats.avgAchievement.toFixed(0)}%
                  </span>
                  <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Achievement</span>
                </div>
              </div>

              {/* Status Breakdown */}
              <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
                {([
                  { key: 'exceeded', ...STATUS_CONFIG.exceeded, count: summaryStats.exceeded },
                  { key: 'on_track', ...STATUS_CONFIG.on_track, count: summaryStats.onTrack },
                  { key: 'at_risk', ...STATUS_CONFIG.at_risk, count: summaryStats.atRisk },
                  { key: 'behind', ...STATUS_CONFIG.behind, count: summaryStats.behind },
                ] as const).map(s => (
                  <div key={s.key} className={`rounded-xl p-3 ${s.bg}`}>
                    <div className="flex items-center gap-2 mb-1">
                      <s.icon className={`h-4 w-4 ${s.color}`} />
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${s.color}`}>{s.label}</span>
                    </div>
                    <div className={`text-2xl font-bold font-mono ${s.color}`}>{s.count}</div>
                    <div className="text-[10px] text-zinc-400">{s.labelEn}</div>
                  </div>
                ))}
              </div>
            </div>

            {goalsWithActuals.length === 0 && (
              <div className="text-center py-8">
                <Target className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">ยังไม่มีเป้าหมายสำหรับปี {fiscalYear}</p>
                <button
                  onClick={() => { setIsSettingsOpen(true); setIsAddingNew(true) }}
                  className="mt-3 px-4 py-2 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors"
                >
                  + สร้างเป้าหมายแรก
                </button>
              </div>
            )}
          </div>

          {/* ─── Goal Cards ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {goalsWithActuals.map(goal => {
              const theme = COLOR_THEMES[goal.color] || COLOR_THEMES.zinc
              const Icon = ICON_MAP[goal.icon] || Target
              const statusCfg = STATUS_CONFIG[goal.status]
              const progressPct = Math.min(goal.achievement, 100)
              const isInverted = goal.goal_key === 'cost_ratio'

              return (
                <div key={goal.id}
                  className={`bg-white dark:bg-zinc-900 rounded-2xl border ${theme.border} p-5 space-y-4 hover:shadow-md transition-shadow duration-300`}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2.5 rounded-xl ${theme.light}`}>
                        <Icon className={`h-5 w-5 ${theme.text}`} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                          {goal.label}
                        </h3>
                        {goal.description && (
                          <p className="text-[10px] text-zinc-400 mt-0.5 leading-tight max-w-[200px]">{goal.description}</p>
                        )}
                      </div>
                    </div>
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-bold ${statusCfg.bg} ${statusCfg.color}`}>
                      {statusCfg.label}
                    </div>
                  </div>

                  {/* Values */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">เป้าหมาย</p>
                      <p className="text-lg font-bold font-mono text-zinc-900 dark:text-zinc-100">
                        {formatValueShort(Number(goal.target_value), goal.value_type)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-400 uppercase tracking-wider mb-0.5">ค่าจริง</p>
                      <p className={`text-lg font-bold font-mono ${
                        goal.status === 'exceeded' ? 'text-emerald-600 dark:text-emerald-400'
                        : goal.status === 'behind' ? 'text-red-500 dark:text-red-400'
                        : 'text-zinc-900 dark:text-zinc-100'
                      }`}>
                        {formatValueShort(goal.actual, goal.value_type)}
                      </p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-400 uppercase tracking-wider">Progress</span>
                      <span className={`text-xs font-bold font-mono ${statusCfg.color}`}>
                        {goal.achievement.toFixed(1)}%
                      </span>
                    </div>
                    <div className="h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ease-out ${theme.progress}`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Difference */}
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-xl ${theme.light}`}>
                    {goal.actual >= Number(goal.target_value) && !isInverted ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                    ) : isInverted && goal.actual <= Number(goal.target_value) ? (
                      <ArrowUpRight className="h-3.5 w-3.5 text-emerald-500" />
                    ) : (
                      <ArrowDownRight className="h-3.5 w-3.5 text-red-500" />
                    )}
                    <span className="text-xs text-zinc-600 dark:text-zinc-400">
                      {isInverted ? 'ยังเหลือ' : 'ผลต่าง'}:{' '}
                      <span className="font-bold font-mono">
                        {goal.value_type === 'currency'
                          ? `฿${fmtK(Math.abs(goal.actual - Number(goal.target_value)))}`
                          : goal.value_type === 'percentage'
                          ? `${Math.abs(goal.actual - Number(goal.target_value)).toFixed(1)}%`
                          : fmt(Math.abs(goal.actual - Number(goal.target_value)))
                        }
                      </span>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* ─── Detailed Summary Table ─── */}
          {goalsWithActuals.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 overflow-hidden">
              <div className="px-5 py-4 border-b border-zinc-100 dark:border-zinc-800">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-zinc-400" /> สรุปเป้าหมายทั้งหมด
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-100 dark:border-zinc-800">
                      <th className="px-4 py-3 text-left text-[10px] font-bold text-zinc-400 uppercase tracking-wider">เป้าหมาย</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Target</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Actual</th>
                      <th className="px-4 py-3 text-right text-[10px] font-bold text-zinc-400 uppercase tracking-wider">ผลต่าง</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Achievement</th>
                      <th className="px-4 py-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-wider">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {goalsWithActuals.map(goal => {
                      const statusCfg = STATUS_CONFIG[goal.status]
                      const diff = goal.actual - Number(goal.target_value)
                      const isInverted = goal.goal_key === 'cost_ratio'

                      return (
                        <tr key={goal.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/30 transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className={`p-1.5 rounded-lg ${COLOR_THEMES[goal.color]?.light || 'bg-zinc-100'}`}>
                                {(() => { const I = ICON_MAP[goal.icon] || Target; return <I className={`h-3.5 w-3.5 ${COLOR_THEMES[goal.color]?.text || 'text-zinc-500'}`} /> })()}
                              </div>
                              <span className="font-medium text-zinc-900 dark:text-zinc-100">{goal.label}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            {formatValue(Number(goal.target_value), goal.value_type, goal.unit)}
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                            {formatValue(goal.actual, goal.value_type, goal.unit)}
                          </td>
                          <td className={`px-4 py-3 text-right font-mono font-bold ${
                            (isInverted ? diff <= 0 : diff >= 0)
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-500 dark:text-red-400'
                          }`}>
                            {diff >= 0 ? '+' : ''}
                            {goal.value_type === 'currency'
                              ? `฿${fmt(diff)}`
                              : goal.value_type === 'percentage'
                              ? `${diff.toFixed(1)}%`
                              : fmt(diff)
                            }
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <div className="w-16 h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${COLOR_THEMES[goal.color]?.progress || 'bg-zinc-500'}`}
                                  style={{ width: `${Math.min(goal.achievement, 100)}%` }} />
                              </div>
                              <span className="text-xs font-bold font-mono text-zinc-700 dark:text-zinc-300 w-12 text-right">
                                {goal.achievement.toFixed(0)}%
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${statusCfg.bg} ${statusCfg.color}`}>
                              <statusCfg.icon className="h-3 w-3" />
                              {statusCfg.label}
                            </span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Footnote info */}
          <div className="flex items-start gap-2 text-[10px] text-zinc-400 bg-zinc-50 dark:bg-zinc-800/30 rounded-xl p-3 border border-zinc-200/40 dark:border-zinc-800/40">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">ข้อมูลจริง (Actual) คำนวณจากระบบ Costs อัตโนมัติ</p>
              <p>Revenue = ยอดรายรับรวม · Jobs = จำนวนอีเวนต์ · Profit = Revenue − Cost · Margin = Profit / Revenue × 100 · Cost Ratio = Cost / Revenue × 100</p>
              <p className="mt-0.5">ข้อมูลจะอัปเดตทุกครั้งที่โหลดหน้านี้ (Real-time from Database)</p>
            </div>
          </div>
        </>
      )}

      {/* ═══════════════════ SETTINGS VIEW ═══════════════════ */}
      {!loading && isSettingsOpen && (
        <>
          {/* Actions bar */}
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-zinc-400" /> จัดการเป้าหมาย · ปี {fiscalYear}
            </h2>
            <div className="flex items-center gap-2">
              <button onClick={handleDuplicate} disabled={saving}
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50">
                <Copy className="h-3.5 w-3.5" /> คัดลอกไปปีถัดไป
              </button>
              <button onClick={() => { setIsAddingNew(true); setEditingGoal(null) }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-xs font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm active:scale-[0.98]">
                <Plus className="h-3.5 w-3.5" /> เพิ่มเป้าหมาย
              </button>
            </div>
          </div>

          {/* Add/Edit Form */}
          {(isAddingNew || editingGoal) && (
            <GoalForm
              goal={editingGoal || newGoalTemplate}
              isNew={isAddingNew}
              saving={saving}
              onSave={handleSaveGoal}
              onCancel={() => { setEditingGoal(null); setIsAddingNew(false) }}
            />
          )}

          {/* Goals List */}
          <div className="space-y-2">
            {goals.length === 0 && !isAddingNew && (
              <div className="text-center py-12 bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60">
                <Target className="h-8 w-8 text-zinc-300 dark:text-zinc-600 mx-auto mb-3" />
                <p className="text-sm text-zinc-400">ยังไม่มีเป้าหมายสำหรับปี {fiscalYear}</p>
              </div>
            )}
            {goals.map(goal => (
              <div key={goal.id}
                className={`bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 px-4 py-3 flex items-center gap-4 group hover:shadow-sm transition-shadow ${
                  !goal.is_active ? 'opacity-50' : ''
                }`}
              >
                <div className={`p-2 rounded-lg ${COLOR_THEMES[goal.color]?.light || 'bg-zinc-100'}`}>
                  {(() => { const I = ICON_MAP[goal.icon] || Target; return <I className={`h-4 w-4 ${COLOR_THEMES[goal.color]?.text || 'text-zinc-500'}`} /> })()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{goal.label}</h3>
                    {!goal.is_active && (
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-zinc-200 dark:bg-zinc-700 text-zinc-500">ปิดใช้งาน</span>
                    )}
                  </div>
                  <p className="text-[10px] text-zinc-400 truncate">
                    {goal.goal_key} · {formatValue(Number(goal.target_value), goal.value_type, goal.unit)} · {goal.period_type}
                  </p>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingGoal(goal); setIsAddingNew(false) }}
                    className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <Edit3 className="h-3.5 w-3.5 text-zinc-400 hover:text-zinc-600" />
                  </button>
                  <button onClick={() => handleDeleteGoal(goal.id)}
                    className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="h-3.5 w-3.5 text-zinc-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ─── Goal Form Component ──────────────────────────────────

function GoalForm({
  goal,
  isNew,
  saving,
  onSave,
  onCancel,
}: {
  goal: GoalRecord
  isNew: boolean
  saving: boolean
  onSave: (data: any) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState({
    id: goal.id || undefined,
    goal_key: goal.goal_key,
    label: goal.label,
    description: goal.description || '',
    target_value: Number(goal.target_value),
    unit: goal.unit,
    value_type: goal.value_type,
    icon: goal.icon || 'Target',
    color: goal.color || 'zinc',
    sort_order: goal.sort_order,
    is_active: goal.is_active,
    period_type: goal.period_type || 'yearly',
    period_value: goal.period_value,
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.goal_key || !form.label) return
    onSave(form)
  }

  const updateField = (key: string, value: any) => {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  // Auto-set unit based on value_type
  const handleValueTypeChange = (vt: string) => {
    let unit = form.unit
    if (vt === 'currency') unit = '฿'
    else if (vt === 'percentage') unit = '%'
    updateField('value_type', vt)
    updateField('unit', unit)
  }

  return (
    <form onSubmit={handleSubmit}
      className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 p-5 space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
          {isNew ? '✨ เพิ่มเป้าหมายใหม่' : '✏️ แก้ไขเป้าหมาย'}
        </h3>
        <button type="button" onClick={onCancel}
          className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          <X className="h-4 w-4 text-zinc-400" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Goal Key */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">Key (ภาษาอังกฤษ ไม่เว้นวรรค)</label>
          <input type="text" value={form.goal_key} onChange={e => updateField('goal_key', e.target.value.toLowerCase().replace(/\s/g, '_'))}
            placeholder="e.g. revenue, job_count"
            disabled={!isNew}
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 disabled:opacity-50"
          />
        </div>

        {/* Label */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">ชื่อเป้าหมาย</label>
          <input type="text" value={form.label} onChange={e => updateField('label', e.target.value)}
            placeholder="e.g. เป้ายอดขาย"
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        {/* Description */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">คำอธิบาย</label>
          <input type="text" value={form.description} onChange={e => updateField('description', e.target.value)}
            placeholder="คำอธิบายเพิ่มเติม..."
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        {/* Value Type */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">ประเภทค่า</label>
          <select value={form.value_type} onChange={e => handleValueTypeChange(e.target.value)}
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none">
            {VALUE_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {/* Target Value */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">ค่าเป้าหมาย</label>
          <input type="number" value={form.target_value} onChange={e => updateField('target_value', parseFloat(e.target.value) || 0)}
            step="any"
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 font-mono"
          />
        </div>

        {/* Unit */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">หน่วย</label>
          <input type="text" value={form.unit} onChange={e => updateField('unit', e.target.value)}
            placeholder="e.g. ฿, %, งาน"
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
          />
        </div>

        {/* Icon */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">ไอคอน</label>
          <select value={form.icon} onChange={e => updateField('icon', e.target.value)}
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none">
            {ICON_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({o.value})</option>)}
          </select>
        </div>

        {/* Color */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">สีธีม</label>
          <div className="flex items-center gap-2 mt-1">
            {COLOR_OPTIONS.map(c => (
              <button key={c.value} type="button" onClick={() => updateField('color', c.value)}
                className={`h-8 w-8 rounded-lg border-2 transition-all ${
                  form.color === c.value
                    ? `${COLOR_THEMES[c.value].progress} border-zinc-900 dark:border-zinc-100 scale-110`
                    : `${COLOR_THEMES[c.value].light} border-transparent hover:scale-105`
                }`}
                title={c.label}
              />
            ))}
          </div>
        </div>

        {/* Sort Order */}
        <div>
          <label className="text-[10px] text-zinc-400 uppercase tracking-wider font-bold">ลำดับแสดงผล</label>
          <input type="number" value={form.sort_order} onChange={e => updateField('sort_order', parseInt(e.target.value) || 0)}
            className="w-full mt-1 h-9 px-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900/10 font-mono"
          />
        </div>
      </div>

      {/* Active Toggle */}
      <div className="flex items-center gap-3 py-2">
        <button type="button" onClick={() => updateField('is_active', !form.is_active)}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ${
            form.is_active ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-600'
          }`}>
          <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            form.is_active ? 'translate-x-6' : 'translate-x-1'
          }`} />
        </button>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{form.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
        <button type="submit" disabled={saving || !form.goal_key || !form.label}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-semibold hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors shadow-sm disabled:opacity-50 active:scale-[0.98]">
          <Save className="h-4 w-4" /> {saving ? 'กำลังบันทึก...' : 'บันทึก'}
        </button>
        <button type="button" onClick={onCancel}
          className="px-4 py-2.5 rounded-xl text-sm font-medium text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
          ยกเลิก
        </button>
      </div>
    </form>
  )
}
