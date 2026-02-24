'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  ClipboardCheck, Send, Eye, Trash2, AlertTriangle,
  Weight, MoreHorizontal, Users, TrendingUp, Target, UserCircle, CalendarDays
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { submitEvaluation, deleteEvaluation, deleteAllEvaluationsByAssignment } from '../actions'
import { KPI_MODES, KPI_CYCLES } from '../types'
import { useLocale } from '@/lib/i18n/context'
import type { KpiAssignment, KpiEvaluation } from '@/types/database.types'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]


type AssignmentWithEvals = KpiAssignment & {
  kpi_evaluations?: KpiEvaluation[]
}

interface PersonGroup {
  userId: string
  fullName: string
  department: string | null
  assignments: AssignmentWithEvals[]
}

// ─── Circular Progress Helper ───
function CircularProgress({ value, size = 52, strokeWidth = 5 }: { value: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const clamped = Math.min(Math.max(value, 0), 100)
  const offset = circumference - (clamped / 100) * circumference

  // Color logic: >=125% green, 100-125% zinc, 0-100% orange, <0% red
  const ringColor = value >= 125
    ? 'text-green-600 dark:text-green-500'
    : value < 0
      ? 'text-red-600 dark:text-red-500'
      : value <= 100
        ? 'text-amber-500 dark:text-amber-400'
        : 'text-zinc-800 dark:text-zinc-300'

  const textColor = value >= 125
    ? 'text-green-700 dark:text-green-400'
    : value < 0
      ? 'text-red-700 dark:text-red-400'
      : value <= 100
        ? 'text-amber-600 dark:text-amber-400'
        : 'text-zinc-800 dark:text-zinc-300'

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      {/* Background ring */}
      <svg className="absolute" width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          className="stroke-zinc-200 dark:stroke-zinc-700"
        />
      </svg>
      {/* Progress ring */}
      <svg className={`absolute -rotate-90 ${ringColor}`} width={size} height={size}>
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" strokeWidth={strokeWidth}
          stroke="currentColor"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500 ease-out"
        />
      </svg>
      {/* Center text */}
      <span className={`text-xs font-bold ${textColor}`}>
        {value >= 1000 ? '999+' : `${Math.round(value)}%`}
      </span>
    </div>
  )
}

// ─── Progress Bar ───
function KpiProgressBar({ value }: { value: number }) {
  const clamped = Math.min(value, 100)
  const barColor = value >= 125
    ? '[&>div]:bg-green-600 dark:[&>div]:bg-green-500'
    : value < 0
      ? '[&>div]:bg-red-600 dark:[&>div]:bg-red-500'
      : value <= 100
        ? '[&>div]:bg-amber-500 dark:[&>div]:bg-amber-400'
        : '[&>div]:bg-zinc-800 dark:[&>div]:bg-zinc-300'
  return <Progress value={clamped} className={`h-2 ${barColor}`} />
}

export default function EvaluateView({ assignments }: { assignments: AssignmentWithEvals[] }) {
  const { t } = useLocale()
  const [evalTarget, setEvalTarget] = useState<AssignmentWithEvals | null>(null)
  const [historyTarget, setHistoryTarget] = useState<AssignmentWithEvals | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [deleteAllTarget, setDeleteAllTarget] = useState<AssignmentWithEvals | null>(null)
  const [deletingAll, setDeletingAll] = useState(false)
  const [actualValue, setActualValue] = useState('')
  const [actualDisplay, setActualDisplay] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  // Build unique month options from assignments period_start + evaluation dates
  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>()
    assignments.forEach(a => {
      // ดึงเดือนจาก period_start ของ assignment (1 record = 1 เดือน)
      if (a.period_start) monthSet.add(a.period_start.slice(0, 7))
      // ดึงเดือนจาก evaluation dates ด้วย (สำหรับ backward compat)
      ;(a.kpi_evaluations || []).forEach(ev => {
        if (ev.evaluation_date) monthSet.add(ev.evaluation_date.slice(0, 7))
      })
    })
    return Array.from(monthSet).sort().map(key => {
      const [y, m] = key.split('-')
      return { value: key, label: `${MONTH_NAMES_TH[parseInt(m) - 1]} ${parseInt(y) + 543}` }
    })
  }, [assignments])

  // Filter assignments by period_start month (1 record = 1 เดือน)
  const filteredAssignments = useMemo(() => {
    if (selectedMonth === 'all') return assignments
    return assignments.filter(a =>
      a.period_start && a.period_start.slice(0, 7) === selectedMonth
    )
  }, [assignments, selectedMonth])

  // Group assignments by person (using filtered evaluations)
  const personGroups = useMemo<PersonGroup[]>(() => {
    const groupMap = new Map<string, PersonGroup>()
    for (const a of filteredAssignments) {
      const assignee = a.profiles as { id: string; full_name?: string; department?: string | null } | null
      const userId = assignee?.id || 'unknown'
      if (!groupMap.has(userId)) {
        groupMap.set(userId, {
          userId,
          fullName: assignee?.full_name || '-',
          department: assignee?.department || null,
          assignments: [],
        })
      }
      groupMap.get(userId)!.assignments.push(a)
    }
    return Array.from(groupMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [filteredAssignments])

  // Auto-select first user when groups load
  const selectedGroup = useMemo(() => {
    if (selectedUserId) return personGroups.find(g => g.userId === selectedUserId) || personGroups[0] || null
    return personGroups[0] || null
  }, [personGroups, selectedUserId])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalEmployees = personGroups.length
    const totalKPIs = filteredAssignments.length
    const evaluatedKPIs = filteredAssignments.filter(a => (a.kpi_evaluations?.length || 0) > 0).length
    const avgCompletion = totalKPIs > 0 ? (evaluatedKPIs / totalKPIs) * 100 : 0
    return { totalEmployees, totalKPIs, evaluatedKPIs, avgCompletion }
  }, [personGroups, filteredAssignments])

  function getPersonStats(group: PersonGroup) {
    const totalKPIs = group.assignments.length
    const evaluatedKPIs = group.assignments.filter(a => (a.kpi_evaluations?.length || 0) > 0).length
    const totalWeight = group.assignments.reduce((s, a) => s + ((a as any).weight ?? 0), 0)
    let wSum = 0, wTotal = 0
    group.assignments.forEach(a => {
      const w = (a as any).weight ?? 0
      const evals = a.kpi_evaluations || []
      if (evals.length === 0 || w === 0) return
      const target = a.target ?? 0
      if (target <= 0) return
      // Cumulative actual = sum of ALL evaluations
      const cumulativeActual = evals.reduce((sum, ev) => sum + (ev.actual_value || 0), 0)
      const cumulativePct = (cumulativeActual / target) * 100
      wSum += cumulativePct * w
      wTotal += w
    })
    const weightedScore = wTotal > 0 ? wSum / wTotal : 0
    const hasScores = wTotal > 0
    return { totalKPIs, evaluatedKPIs, totalWeight, weightedScore, hasScores }
  }

  const handleActualFocus = useCallback(() => {
    setActualDisplay(actualValue)
  }, [actualValue])

  const handleActualBlur = useCallback(() => {
    const num = parseFloat(actualValue)
    if (!isNaN(num)) {
      setActualDisplay(num.toLocaleString())
    }
  }, [actualValue])

  const handleActualChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value.replace(/,/g, '')
    setActualValue(raw)
    setActualDisplay(e.target.value)
  }, [])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const formData = new FormData(e.currentTarget)
    const result = await submitEvaluation(formData)
    if (result?.error) {
      setError(result.error)
    } else {
      setEvalTarget(null)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6" />
            {t.kpi.evaluate.title}
          </h2>
          <p className="text-sm text-muted-foreground">{t.kpi.evaluate.subtitle}</p>
        </div>
        {/* Month Filter */}
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="เลือกเดือน" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">ทุกเดือน</SelectItem>
              {monthOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                <Users className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">พนักงาน</p>
                <p className="text-xl font-bold">{summaryStats.totalEmployees}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                <Target className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">KPIs ทั้งหมด</p>
                <p className="text-xl font-bold">{summaryStats.totalKPIs}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                <TrendingUp className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ประเมินแล้ว</p>
                <p className="text-xl font-bold">{summaryStats.evaluatedKPIs}<span className="text-sm font-normal text-muted-foreground">/{summaryStats.totalKPIs}</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                <ClipboardCheck className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">ความคืบหน้า</p>
                <p className="text-xl font-bold">{summaryStats.avgCompletion.toFixed(0)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {personGroups.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t.kpi.evaluate.emptyState}
          </CardContent>
        </Card>
      ) : (
        /* ─── Two-Column Dashboard Layout ─── */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* ─── LEFT: Employee List ─── */}
          <div className="lg:col-span-4 xl:col-span-3">
            <Card className="sticky top-4">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">รายชื่อพนักงาน</CardTitle>
                <CardDescription className="text-xs">{personGroups.length} คน</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="max-h-[calc(100vh-280px)] overflow-y-auto">
                  {personGroups.map((group) => {
                    const stats = getPersonStats(group)
                    const isSelected = selectedGroup?.userId === group.userId
                    const statusVariant = stats.evaluatedKPIs === stats.totalKPIs ? 'default' as const : 'secondary' as const

                    return (
                      <button
                        key={group.userId}
                        type="button"
                        onClick={() => setSelectedUserId(group.userId)}
                        className={`w-full text-left px-4 py-3 border-b border-zinc-100 dark:border-zinc-800 transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900 ${
                          isSelected ? 'bg-zinc-100 dark:bg-zinc-800/80 border-l-2 border-l-zinc-800 dark:border-l-zinc-300' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="shrink-0 w-9 h-9 rounded-full bg-zinc-800 dark:bg-zinc-200 flex items-center justify-center text-white dark:text-zinc-800 text-xs font-bold">
                            {group.fullName.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{group.fullName}</div>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <Badge variant={statusVariant} className="text-[10px] px-1.5 py-0">
                                {stats.evaluatedKPIs}/{stats.totalKPIs}
                              </Badge>
                              {stats.hasScores && (
                                <span className="text-[10px] font-bold text-zinc-700 dark:text-zinc-300">
                                  {stats.weightedScore.toFixed(1)} pts
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* ─── RIGHT: KPI Detail Panel ─── */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            {selectedGroup ? (
              <>
                {/* Person Summary Card */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between flex-wrap gap-4">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-zinc-800 dark:bg-zinc-200 flex items-center justify-center text-white dark:text-zinc-800 text-lg font-bold shadow-md">
                          {selectedGroup.fullName.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-lg font-semibold">{selectedGroup.fullName}</h3>
                          <div className="flex items-center gap-2 mt-0.5">
                            {selectedGroup.department && (
                              <Badge variant="outline" className="text-[10px]">{selectedGroup.department}</Badge>
                            )}
                            {(() => {
                              const stats = getPersonStats(selectedGroup)
                              return (
                                <>
                                  <Badge variant={stats.evaluatedKPIs === stats.totalKPIs ? 'default' : 'secondary'} className="text-[10px]">
                                    ประเมิน {stats.evaluatedKPIs}/{stats.totalKPIs}
                                  </Badge>
                                  {stats.totalWeight > 0 && (
                                    <Badge variant="outline" className="text-[10px] gap-0.5">
                                      <Weight className="h-2.5 w-2.5" />
                                      น้ำหนักรวม {stats.totalWeight}%
                                    </Badge>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                      {/* Overall Score Circular */}
                      {(() => {
                        const stats = getPersonStats(selectedGroup)
                        if (!stats.hasScores) return null
                        return (
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-xs text-muted-foreground">คะแนนถ่วงน้ำหนัก</p>
                              <p className="text-2xl font-bold text-foreground">
                                {stats.weightedScore.toFixed(1)}
                              </p>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </CardContent>
                </Card>

                {/* KPI Items */}
                {selectedGroup.assignments.map((a) => {
                  const name = a.kpi_templates?.name || a.custom_name || 'Custom KPI'
                  const mode = a.kpi_templates?.mode || a.custom_mode || 'task'
                  const modeInfo = KPI_MODES.find((m) => m.value === mode)
                  const cycleInfo = KPI_CYCLES.find((c) => c.value === a.cycle)
                  const evalCount = a.kpi_evaluations?.length || 0
                  const weight = (a as any).weight ?? 0

                  // Latest eval
                  const latestEval = evalCount > 0
                    ? [...(a.kpi_evaluations || [])].sort(
                        (x, y) => new Date(y.evaluation_date || y.created_at || '').getTime() - new Date(x.evaluation_date || x.created_at || '').getTime()
                      )[0]
                    : null
                  // Cumulative actual = sum of ALL evaluations
                  const cumulativeActual = (a.kpi_evaluations || []).reduce((sum, ev) => sum + (ev.actual_value || 0), 0)
                  const effectiveT = a.target ?? 0
                  const cumulativePct = evalCount > 0 && effectiveT ? (cumulativeActual / effectiveT) * 100 : null

                  // Month info
                  const monthKey = a.period_start?.slice(0, 7) || ''
                  const [mY, mM] = monthKey.split('-').map(Number)
                  const monthLabel = mY && mM ? `${MONTH_NAMES_TH[mM - 1]} ${mY + 543}` : ''
                  const now = new Date()
                  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                  const isPast = monthKey < currentKey
                  const isCurrent = monthKey === currentKey

                  return (
                    <Card key={a.id} className={`overflow-hidden ${isPast ? 'opacity-70' : ''}`}>
                      <CardContent className="p-0">
                        <div className="p-5 space-y-4">
                          {/* KPI Header Row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Month Badge */}
                                {monthLabel && (
                                  <div className="flex items-center gap-1.5">
                                    {isPast ? (
                                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/60" />
                                    ) : (
                                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                    )}
                                    <Badge
                                      variant={isCurrent ? 'default' : isPast ? 'secondary' : 'outline'}
                                      className={`text-[10px] font-semibold ${isCurrent ? '' : isPast ? 'opacity-80' : ''}`}
                                    >
                                      {monthLabel}
                                    </Badge>
                                  </div>
                                )}
                                <h4 className="font-semibold text-sm">{name}</h4>
                                {weight > 0 && (
                                  <Badge variant="secondary" className="text-[10px] font-semibold gap-0.5">
                                    <Weight className="h-2.5 w-2.5" />
                                    {weight}%
                                  </Badge>
                                )}
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                <Badge variant="outline" className="text-[10px]">{t.kpi.modes[modeInfo?.value || mode] || mode}</Badge>
                                <Badge variant="outline" className="text-[10px]">{t.kpi.cycles[cycleInfo?.value || a.cycle] || a.cycle}</Badge>
                                {evalCount > 0 && (
                                  <Badge variant="secondary" className="text-[10px]">{evalCount} ครั้ง</Badge>
                                )}
                                {isPast && (
                                  <Badge variant="secondary" className="text-[10px] gap-0.5 opacity-70">
                                    เดือนที่ผ่านแล้ว
                                  </Badge>
                                )}
                                {isCurrent && evalCount > 0 && (
                                  <Badge variant="secondary" className="text-[10px] gap-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                                    ⚠ ประเมินแล้ว
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Circular percentage + Actions */}
                            <div className="flex items-center gap-2">
                              {cumulativePct != null && (
                                <CircularProgress value={cumulativePct} />
                              )}

                              {/* Primary: Evaluate Button */}
                              <Button
                                size="sm"
                                onClick={() => {
                                  setActualValue('')
                                  setActualDisplay('')
                                  setEvalTarget(a)
                                }}
                                className="gap-1.5 h-8 text-xs"
                              >
                                <Send className="h-3 w-3" />
                                {t.kpi.evaluate.evaluateBtn}
                              </Button>

                              {/* Secondary: Dropdown */}
                              {evalCount > 0 && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                      <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem onClick={() => setHistoryTarget(a)}>
                                      <Eye className="h-4 w-4 mr-2" />
                                      ดูประวัติ
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => setDeleteAllTarget(a)}
                                    >
                                      <Trash2 className="h-4 w-4 mr-2" />
                                      ลบทั้งหมด ({evalCount})
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>

                          {/* Actual vs Target + Progress */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-muted-foreground text-xs">{t.kpi.common.actual}:</span>
                                <span className="font-semibold">
                                  {evalCount > 0 ? fmt(cumulativeActual) : '—'}
                                </span>
                                <span className="text-muted-foreground text-xs mx-0.5">/</span>
                                <span className="text-muted-foreground text-xs">{t.kpi.common.target}:</span>
                                <span className="font-medium text-muted-foreground">
                                  {fmt(effectiveT)} {a.target_unit}
                                </span>
                              </div>
                              {cumulativePct != null && (
                                <span className={`text-xs font-semibold ${
                                  cumulativePct >= 125 ? 'text-green-700 dark:text-green-400'
                                  : cumulativePct < 0 ? 'text-red-700 dark:text-red-400'
                                  : cumulativePct <= 100 ? 'text-amber-600 dark:text-amber-400'
                                  : 'text-foreground'
                                }`}>
                                  {cumulativePct.toFixed(1)}%
                                </span>
                              )}
                            </div>
                            <KpiProgressBar value={cumulativePct ?? 0} />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </>
            ) : (
              <Card>
                <CardContent className="py-16 text-center text-muted-foreground">
                  <UserCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>เลือกพนักงานจากรายชื่อด้านซ้ายเพื่อดูรายละเอียด KPI</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ─── History Dialog ─── */}
      <Dialog open={!!historyTarget} onOpenChange={(v) => !v && setHistoryTarget(null)}>
        <DialogContent className="sm:max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              {t.kpi.evaluate.historyTitle.replace('{name}', historyTarget?.kpi_templates?.name || historyTarget?.custom_name || '')}
            </DialogTitle>
          </DialogHeader>

          {historyTarget && (() => {
            const evals = [...(historyTarget.kpi_evaluations || [])].sort(
              (a, b) => new Date(b.evaluation_date || b.created_at || '').getTime() - new Date(a.evaluation_date || a.created_at || '').getTime()
            )
            const target = historyTarget.target || 0

            if (evals.length === 0) {
              return (
                <p className="text-center text-muted-foreground py-8">{t.kpi.evaluate.noHistory}</p>
              )
            }

            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.kpi.common.date}</TableHead>
                    <TableHead>{t.kpi.common.period}</TableHead>
                    <TableHead className="text-right">{t.kpi.common.actual}</TableHead>
                    <TableHead className="text-right">{t.kpi.common.target}</TableHead>
                    <TableHead className="text-center">{t.kpi.common.difference}</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-center">ผลสำเร็จ(%)</TableHead>
                    <TableHead>{t.kpi.common.comment}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evals.map((ev) => {
                    const actual = ev.actual_value || 0
                    const diff = target > 0 ? actual - target : null
                    const pct = target > 0 ? (actual / target) * 100 : null
                    const diffColor = diff !== null ? (diff >= 0 ? 'text-foreground' : 'text-muted-foreground') : ''
                    const pctColor = pct !== null ? 'text-foreground font-bold' : ''

                    return (
                      <TableRow key={ev.id}>
                        <TableCell className="text-xs whitespace-nowrap">
                          <div>{ev.evaluation_date || '-'}</div>
                          {ev.created_at && (
                            <div className="text-[10px] text-muted-foreground">
                              {new Date(ev.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {ev.period_label ? <Badge variant="outline" className="text-[10px]">{ev.period_label}</Badge> : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">{fmt(actual)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmt(target)}</TableCell>
                        <TableCell className="text-center">
                          {diff !== null ? (
                            <span className={`text-xs font-semibold ${diffColor}`}>
                              {diff >= 0 ? '+' : ''}{fmt(diff)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {pct !== null ? (
                            <span className={`text-xs font-semibold ${pctColor}`}>
                              {pct.toFixed(1)}%
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-sm">{ev.achievement_pct != null ? `${ev.achievement_pct}%` : '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={ev.comment || ''}>
                          {ev.comment || '-'}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            disabled={deleting === ev.id}
                            onClick={async () => {
                              if (!confirm(t.kpi.evaluate.confirmDelete)) return
                              setDeleting(ev.id)
                              await deleteEvaluation(ev.id)
                              setDeleting(null)
                              setHistoryTarget(null)
                            }}
                            className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                            title={t.kpi.evaluate.deleteTooltip}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                {(() => {
                  const totalActual = evals.reduce((s, ev) => s + (ev.actual_value || 0), 0)
                  const cumulDiff = target > 0 ? totalActual - target : null
                  const cumulPct = target > 0 ? (totalActual / target) * 100 : null
                  const cumulDiffColor = cumulDiff !== null ? (cumulDiff >= 0 ? 'text-green-700 dark:text-green-500' : 'text-red-700 dark:text-red-500') : ''

                  return (
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900">
                        <td colSpan={2} className="px-4 py-4 align-middle">
                          <div className="text-xs font-bold">{t.kpi.common.summary}</div>
                          <div className="text-[10px] text-muted-foreground">{evals.length} {t.kpi.common.times}</div>
                        </td>
                        <td className="px-4 py-4 text-right align-middle">
                          <div className="text-[10px] text-muted-foreground">ผลรวม</div>
                          <div className="font-bold text-sm">{fmt(totalActual)}</div>
                        </td>
                        <td className="px-4 py-4 text-right align-middle">
                          <div className="text-[10px] text-muted-foreground">{t.kpi.common.target}</div>
                          <div className="text-sm text-muted-foreground">{fmt(target)}</div>
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="text-[10px] text-muted-foreground">ผลต่าง</div>
                          {cumulDiff !== null ? (
                            <div className={`text-sm font-bold ${cumulDiffColor}`}>
                              {cumulDiff >= 0 ? '+' : ''}{fmt(Math.round(cumulDiff))}
                            </div>
                          ) : <div>-</div>}
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="text-[10px] text-muted-foreground">รวม</div>
                          {cumulPct !== null ? (
                            <div className="text-sm font-bold text-foreground">
                              {cumulPct.toFixed(1)}%
                            </div>
                          ) : <div>-</div>}
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="text-[10px] text-muted-foreground">ผลสำเร็จรวม</div>
                          <div className="font-bold text-sm text-foreground">
                            {cumulPct != null ? `${cumulPct.toFixed(1)}%` : '-'}
                          </div>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )
                })()}
              </Table>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Evaluation Dialog ─── */}
      <Dialog open={!!evalTarget} onOpenChange={(v) => !v && setEvalTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.kpi.evaluate.evalDialogTitle.replace('{name}', evalTarget?.kpi_templates?.name || evalTarget?.custom_name || '')}</DialogTitle>
          </DialogHeader>

          {evalTarget && (() => {
            const dialogTarget = evalTarget.target ?? 0
            const hasMonthly = false
            return (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="assignment_id" value={evalTarget.id} />

              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 text-sm space-y-1">
                <p>{t.kpi.common.employee}: <strong>{(evalTarget.profiles as { full_name?: string } | null)?.full_name || '-'}</strong></p>
                <p>{t.kpi.common.target}: <strong>{fmt(dialogTarget)} {evalTarget.target_unit}</strong>
                  {hasMonthly && <span className="text-amber-500 text-xs ml-1">(เป้าเดือนนี้ — เป้าหลัก: {fmt(evalTarget.target)})</span>}
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">{t.kpi.evaluate.actualLabel}</label>
                <input type="hidden" name="actual_value" value={actualValue} />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={actualDisplay}
                  onChange={handleActualChange}
                  onFocus={handleActualFocus}
                  onBlur={handleActualBlur}
                  required
                  placeholder={t.kpi.evaluate.actualPlaceholder}
                />
              </div>

              {/* Calculated Difference */}
              {actualValue && dialogTarget != null && (() => {
                const actual = parseFloat(actualValue)
                const target = dialogTarget
                if (isNaN(actual) || target === 0) return null
                // Previous cumulative actual (sum of existing evaluations)
                const prevTotal = (evalTarget.kpi_evaluations || []).reduce((sum: number, ev: any) => sum + (ev.actual_value || 0), 0)
                const grandTotal = prevTotal + actual
                const diff = grandTotal - target
                const pct = (grandTotal / target) * 100
                const isPositive = diff >= 0
                const colorClass = 'text-foreground'
                const emoji = pct >= 120 ? '🔥🎉' : pct >= 100 ? '😍' : pct >= 90 ? '😊' : pct >= 70 ? '🙂' : pct >= 50 ? '😰' : pct >= 30 ? '😱' : '💀'

                return (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1">
                    {prevTotal > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>ยอดสะสมก่อนหน้า</span>
                        <span className="font-medium">{fmt(prevTotal)} {evalTarget.target_unit}</span>
                      </div>
                    )}
                    {prevTotal > 0 && (
                      <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                        <span>ยอดรวม (เดิม + ครั้งนี้)</span>
                        <span className="font-semibold text-foreground">{fmt(grandTotal)} {evalTarget.target_unit}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t.kpi.evaluate.diffLabel}</span>
                      <span className={`font-semibold ${colorClass}`}>
                        {isPositive ? '+' : ''}{fmt(diff)} {evalTarget.target_unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{t.kpi.evaluate.achievementLabel}</span>
                      <span className={`font-bold text-base ${colorClass}`}>
                        <span className="text-lg mr-1">{emoji}</span>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <KpiProgressBar value={pct} />
                  </div>
                )
              })()}

              {/* Score คำนวณอัตโนมัติจาก achievement % */}
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  💡 คะแนนจะคำนวณอัตโนมัติจาก ค่าจริง ÷ เป้าหมาย
                </p>
              </div>

              <div>
                <label className="text-sm font-medium">{t.kpi.evaluate.dateLabel}</label>
                <Input name="evaluation_date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
              </div>

              <div>
                <label className="text-sm font-medium">{t.kpi.evaluate.periodLabel}</label>
                <Input name="period_label" placeholder={t.kpi.evaluate.periodPlaceholder} />
              </div>

              <div>
                <label className="text-sm font-medium">{t.kpi.evaluate.commentLabel}</label>
                <Textarea name="comment" placeholder={t.kpi.evaluate.commentPlaceholder} rows={2} />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEvalTarget(null)}>{t.kpi.common.cancel}</Button>
                <Button type="submit" disabled={loading}>
                  {loading ? t.kpi.common.saving : t.kpi.evaluate.submitBtn}
                </Button>
              </div>
            </form>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ─── Bulk Delete All Evaluations Confirmation ─── */}
      <AlertDialog open={!!deleteAllTarget} onOpenChange={(v) => { if (!v) { setDeleteAllTarget(null) } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="h-5 w-5" />
              ยืนยันการลบผลประเมินทั้งหมด
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>คุณกำลังจะลบผลประเมินทั้งหมดของ:</p>
                <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1">
                  <p className="text-sm"><span className="text-muted-foreground">พนักงาน:</span>{' '}
                    <strong className="text-foreground">{(deleteAllTarget?.profiles as { full_name?: string } | null)?.full_name || '-'}</strong>
                  </p>
                  <p className="text-sm"><span className="text-muted-foreground">KPI:</span>{' '}
                    <strong className="text-foreground">{deleteAllTarget?.kpi_templates?.name || deleteAllTarget?.custom_name || '-'}</strong>
                  </p>
                  <p className="text-sm"><span className="text-muted-foreground">จำนวน:</span>{' '}
                    <strong className="text-red-600">{deleteAllTarget?.kpi_evaluations?.length || 0} รายการ</strong>
                  </p>
                </div>
                <p className="text-xs text-red-500 font-medium">⚠️ การลบนี้ไม่สามารถย้อนกลับได้</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingAll}>{t.kpi.common.cancel}</AlertDialogCancel>
            <AlertDialogAction
              disabled={deletingAll}
              className="bg-red-600 hover:bg-red-700"
              onClick={async (e) => {
                e.preventDefault()
                if (!deleteAllTarget) return
                setDeletingAll(true)
                await deleteAllEvaluationsByAssignment(deleteAllTarget.id)
                setDeletingAll(false)
                setDeleteAllTarget(null)
              }}
            >
              {deletingAll ? 'กำลังลบ...' : 'ยืนยันลบทั้งหมด'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
