'use client'

import { useState, useMemo } from 'react'
import { Plus, Trash2, UserCircle, AlertTriangle, Weight, Target, Users, ClipboardCheck, TrendingUp, Pencil, Lock, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import AssignmentForm from './assignment-form'
import { createAssignment, deleteAssignment, updateAssignmentWeight, updateAssignment } from '../actions'
import { KPI_MODES, KPI_CYCLES, KPI_STATUSES } from '../types'
import { useLocale } from '@/lib/i18n/context'
import type { KpiAssignment, KpiTemplate, Profile } from '@/types/database.types'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

/** Get the month key (YYYY-MM) from a date string */
function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7)
}

/** Get display label for a month key like "2026-02" → "กุมภาพันธ์ 2569" */
function getMonthLabel(dateStr: string): string {
  const [y, m] = dateStr.slice(0, 7).split('-').map(Number)
  return `${MONTH_NAMES_TH[m - 1]} ${y + 543}`
}

/** Check if a month is in the past (before current month) */
function isMonthPast(periodStart: string): boolean {
  const now = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const monthKey = getMonthKey(periodStart)
  return monthKey < currentKey
}

/** Check if a month is the current month */
function isMonthCurrent(periodStart: string): boolean {
  const now = new Date()
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return getMonthKey(periodStart) === currentKey
}

interface Evaluation {
  assignment_id: string
  actual_value: number | null
  score: number | null
  achievement_pct: number | null
  evaluation_date: string | null
}

interface AssignmentsViewProps {
  assignments: KpiAssignment[]
  templates: Pick<KpiTemplate, 'id' | 'name' | 'mode' | 'default_target' | 'target_unit'>[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department' | 'role'>[]
  evaluations: Evaluation[]
}

interface PersonGroup {
  userId: string
  fullName: string
  department: string | null
  assignments: KpiAssignment[]
  totalWeight: number
  weightedScore: number | null
}

export default function AssignmentsView({ assignments, templates, profiles, evaluations }: AssignmentsViewProps) {
  const { t } = useLocale()
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [editingWeight, setEditingWeight] = useState<string | null>(null)
  const [editWeightValue, setEditWeightValue] = useState('')
  const [weightError, setWeightError] = useState('')
  // Inline edit target
  const [editingTarget, setEditingTarget] = useState<string | null>(null)
  const [editTargetValue, setEditTargetValue] = useState('')
  const [targetError, setTargetError] = useState('')
  // Month filter
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  // Build month options from assignment period_start dates
  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>()
    for (const a of assignments) {
      if (a.period_start) monthSet.add(getMonthKey(a.period_start))
    }
    return Array.from(monthSet).sort().map(key => ({
      value: key,
      label: getMonthLabel(key + '-01'),
    }))
  }, [assignments])

  // Filter assignments by selected month
  const filteredAssignments = useMemo(() => {
    if (selectedMonth === 'all') return assignments
    return assignments.filter(a => a.period_start && getMonthKey(a.period_start) === selectedMonth)
  }, [assignments, selectedMonth])

  // Build a map: assignment_id → latest evaluation
  const latestEvalMap = useMemo(() => {
    const map = new Map<string, Evaluation>()
    for (const ev of evaluations) {
      if (!map.has(ev.assignment_id)) {
        map.set(ev.assignment_id, ev)
      }
    }
    return map
  }, [evaluations])

  // Group assignments by person
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
          totalWeight: 0,
          weightedScore: null,
        })
      }

      const group = groupMap.get(userId)!
      group.assignments.push(a)
    }

    // Calculate totalWeight and weightedScore for each person
    for (const group of groupMap.values()) {
      let totalWeight = 0
      let weightedSum = 0
      let hasAnyEval = false

      for (const a of group.assignments) {
        const w = (a as any).weight ?? 100
        totalWeight += w

        const ev = latestEvalMap.get(a.id)
        if (ev?.achievement_pct != null) {
          weightedSum += ev.achievement_pct * w
          hasAnyEval = true
        }
      }

      group.totalWeight = totalWeight
      group.weightedScore = hasAnyEval && totalWeight > 0
        ? Math.round((weightedSum / totalWeight) * 10) / 10
        : null
    }

    return Array.from(groupMap.values()).sort((a, b) => a.fullName.localeCompare(b.fullName))
  }, [filteredAssignments, latestEvalMap])

  // Auto-select first user when groups load
  const selectedGroup = useMemo(() => {
    if (selectedUserId) return personGroups.find(g => g.userId === selectedUserId) || personGroups[0] || null
    return personGroups[0] || null
  }, [personGroups, selectedUserId])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalEmployees = personGroups.length
    const totalKPIs = filteredAssignments.length
    const evaluatedKPIs = filteredAssignments.filter(a => latestEvalMap.has(a.id)).length
    const avgCompletion = totalKPIs > 0 ? (evaluatedKPIs / totalKPIs) * 100 : 0
    return { totalEmployees, totalKPIs, evaluatedKPIs, avgCompletion }
  }, [personGroups, filteredAssignments, latestEvalMap])

  function getPersonStats(group: PersonGroup) {
    const totalKPIs = group.assignments.length
    const evaluatedKPIs = group.assignments.filter(a => latestEvalMap.has(a.id)).length
    const totalWeight = group.totalWeight
    const weightOk = totalWeight === 100
    return { totalKPIs, evaluatedKPIs, totalWeight, weightOk, weightedScore: group.weightedScore }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleteError('')
    const result = await deleteAssignment(deleteId)
    if (result?.error) {
      setDeleteError(result.error)
    } else {
      setDeleteId(null)
    }
  }

  async function handleSaveTarget(assignmentId: string) {
    const val = Number(editTargetValue)
    if (isNaN(val) || val < 0) {
      setTargetError('กรุณากรอกตัวเลขที่ถูกต้อง')
      return
    }
    const res = await updateAssignment(assignmentId, { target: val })
    if (res?.error) {
      setTargetError(res.error)
    } else {
      setEditingTarget(null)
      setTargetError('')
    }
  }

  // Sort assignments within a group by period_start (chronological)
  const getSortedAssignments = (group: PersonGroup) => {
    return [...group.assignments].sort((a, b) => a.period_start.localeCompare(b.period_start))
  }

  return (
    <div className="space-y-6">
      {/* ─── Page Header ─── */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t.kpi.assignments.title}</h2>
          <p className="text-sm text-muted-foreground">{t.kpi.assignments.subtitle}</p>
        </div>
        <div className="flex items-center gap-3">
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
          <Button onClick={() => setShowForm(true)} className="gap-2">
            <Plus className="h-4 w-4" />
            {t.kpi.assignments.assignBtn}
          </Button>
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
            {t.kpi.assignments.emptyState}
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
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                {stats.totalKPIs} KPIs
                              </Badge>
                              {!stats.weightOk && (
                                <span className="text-[10px] text-muted-foreground">
                                  ⚖ {stats.totalWeight}%
                                </span>
                              )}
                              {stats.weightOk && (
                                <span className="text-[10px] text-muted-foreground">
                                  ⚖ 100% ✓
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
                                  <Badge variant="secondary" className="text-[10px]">
                                    {stats.totalKPIs} KPIs
                                  </Badge>
                                  <Badge variant={stats.weightOk ? 'default' : 'secondary'} className="text-[10px] gap-0.5">
                                    <Weight className="h-2.5 w-2.5" />
                                    น้ำหนักรวม {stats.totalWeight}%
                                    {stats.weightOk && ' ✓'}
                                  </Badge>
                                  {!stats.weightOk && (
                                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                      <AlertTriangle className="h-2.5 w-2.5" />
                                      {t.kpi.common.weightWarning}
                                    </span>
                                  )}
                                </>
                              )
                            })()}
                          </div>
                        </div>
                      </div>
                      {/* Weighted Score */}
                      {selectedGroup.weightedScore != null && (
                        <div className="flex items-center gap-3">
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">{t.kpi.common.weightedScore}</p>
                            <p className="text-2xl font-bold text-foreground">
                              {selectedGroup.weightedScore}%
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* KPI Items — sorted by month */}
                {getSortedAssignments(selectedGroup).map((a) => {
                  const templateName = a.kpi_templates?.name || a.custom_name || 'Custom KPI'
                  const mode = a.kpi_templates?.mode || a.custom_mode || 'task'
                  const modeInfo = KPI_MODES.find((m) => m.value === mode)
                  const cycleInfo = KPI_CYCLES.find((c) => c.value === a.cycle)
                  const statusInfo = KPI_STATUSES.find((s) => s.value === a.status)
                  const weight = (a as any).weight ?? 100
                  const ev = latestEvalMap.get(a.id)
                  const achievementPct = ev?.achievement_pct ?? null

                  const isPast = isMonthPast(a.period_start)
                  const isCurrent = isMonthCurrent(a.period_start)
                  const hasEval = latestEvalMap.has(a.id)
                  const monthLabel = getMonthLabel(a.period_start)
                  const canEdit = !isPast // Can edit current and future months

                  return (
                    <Card key={a.id} className={`overflow-hidden ${isPast ? 'opacity-70' : ''}`}>
                      <CardContent className="p-0">
                        <div className="p-5 space-y-4">
                          {/* KPI Header Row */}
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1.5 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Month Label */}
                                <div className="flex items-center gap-1.5">
                                  {isPast ? (
                                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                                  ) : (
                                    <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                                  )}
                                  <Badge
                                    variant={isCurrent ? 'default' : isPast ? 'secondary' : 'outline'}
                                    className="text-[10px] font-semibold"
                                  >
                                    {monthLabel}
                                  </Badge>
                                </div>

                                <h4 className="font-semibold text-sm">{templateName}</h4>
                                {weight > 0 && (
                                  editingWeight === a.id ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        type="number"
                                        min={0}
                                        max={100}
                                        autoFocus
                                        value={editWeightValue}
                                        onChange={(e) => setEditWeightValue(e.target.value)}
                                        onKeyDown={async (e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault()
                                            const val = Math.max(0, Math.min(100, Number(editWeightValue) || 0))
                                            const res = await updateAssignmentWeight(a.id, val)
                                            if (res?.error) {
                                              setWeightError(res.error)
                                            } else {
                                              setEditingWeight(null)
                                              setWeightError('')
                                            }
                                          }
                                          if (e.key === 'Escape') {
                                            setEditingWeight(null)
                                            setWeightError('')
                                          }
                                        }}
                                        onBlur={async () => {
                                          const val = Math.max(0, Math.min(100, Number(editWeightValue) || 0))
                                          const res = await updateAssignmentWeight(a.id, val)
                                          if (res?.error) {
                                            setWeightError(res.error)
                                          } else {
                                            setEditingWeight(null)
                                            setWeightError('')
                                          }
                                        }}
                                        className="h-7 w-16 text-xs text-center"
                                      />
                                      <span className="text-xs text-muted-foreground">%</span>
                                    </div>
                                  ) : (
                                    <Badge
                                      variant="secondary"
                                      className="text-[10px] font-semibold gap-0.5 cursor-pointer hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                                      onDoubleClick={() => {
                                        if (!canEdit) return
                                        setEditingWeight(a.id)
                                        setEditWeightValue(String(weight))
                                        setWeightError('')
                                      }}
                                      title={canEdit ? 'ดับเบิลคลิกเพื่อแก้ไขน้ำหนัก' : 'เดือนที่ผ่านแล้ว ไม่สามารถแก้ไขได้'}
                                    >
                                      <Weight className="h-2.5 w-2.5" />
                                      {weight}%
                                    </Badge>
                                  )
                                )}
                                {!a.template_id && (
                                  <Badge variant="outline" className="text-[10px]">Custom</Badge>
                                )}
                              </div>
                              <div className="flex gap-1.5 flex-wrap">
                                <Badge variant="outline" className="text-[10px]">
                                  {t.kpi.statuses[statusInfo?.value || a.status] || a.status}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {t.kpi.modes[modeInfo?.value || mode] || mode}
                                </Badge>
                                <Badge variant="outline" className="text-[10px]">
                                  {t.kpi.cycles[cycleInfo?.value || a.cycle] || a.cycle}
                                </Badge>
                                {isPast && (
                                  <Badge variant="secondary" className="text-[10px] gap-0.5">
                                    <Lock className="h-2.5 w-2.5" />
                                    ล็อค
                                  </Badge>
                                )}
                                {isCurrent && hasEval && (
                                  <Badge variant="secondary" className="text-[10px] gap-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800">
                                    ⚠ ประเมินแล้ว
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-1">
                              {canEdit && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingTarget(a.id)
                                    setEditTargetValue(String(a.target))
                                    setTargetError('')
                                  }}
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                                  title="แก้ไขเป้าหมาย"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setDeleteId(a.id)}
                                className="h-8 w-8 p-0 text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>

                          {/* Target + Actual + Progress */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-sm">
                              <div className="flex items-baseline gap-1.5">
                                <span className="text-muted-foreground text-xs">{t.kpi.common.target}:</span>
                                {editingTarget === a.id ? (
                                  <div className="flex items-center gap-1.5">
                                    <Input
                                      type="number"
                                      min={0}
                                      step="0.01"
                                      autoFocus
                                      value={editTargetValue}
                                      onChange={(e) => setEditTargetValue(e.target.value)}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault()
                                          await handleSaveTarget(a.id)
                                        }
                                        if (e.key === 'Escape') {
                                          setEditingTarget(null)
                                          setTargetError('')
                                        }
                                      }}
                                      className="h-7 w-32 text-xs"
                                    />
                                    <span className="text-xs text-muted-foreground">{a.target_unit}</span>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => handleSaveTarget(a.id)}
                                    >
                                      ✓
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 px-2 text-xs"
                                      onClick={() => { setEditingTarget(null); setTargetError('') }}
                                    >
                                      ✕
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="font-medium text-muted-foreground">
                                    {fmt(a.target)} {a.target_unit}
                                  </span>
                                )}
                                {ev?.actual_value != null && editingTarget !== a.id && (
                                  <>
                                    <span className="text-muted-foreground text-xs mx-0.5">/</span>
                                    <span className="text-muted-foreground text-xs">{t.kpi.common.actual}:</span>
                                    <span className="font-semibold">
                                      {fmt(ev.actual_value)}
                                    </span>
                                  </>
                                )}
                              </div>
                              {achievementPct != null && editingTarget !== a.id && (
                                <span className="text-xs font-semibold text-foreground">
                                  {achievementPct}%
                                </span>
                              )}
                            </div>
                            {targetError && editingTarget === a.id && (
                              <p className="text-xs text-red-500">{targetError}</p>
                            )}
                            <Progress
                              value={achievementPct != null ? Math.min(achievementPct, 100) : 0}
                              className="h-2 [&>div]:bg-zinc-800 dark:[&>div]:bg-zinc-300"
                            />
                            <div className="text-[11px] text-muted-foreground" />
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

      {/* Weight Edit Error Toast */}
      {weightError && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 animate-in slide-in-from-bottom-4">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {weightError}
          <button onClick={() => setWeightError('')} className="ml-2 hover:opacity-80">✕</button>
        </div>
      )}

      {/* Assignment Form */}
      <AssignmentForm
        open={showForm}
        onClose={() => setShowForm(false)}
        templates={templates}
        profiles={profiles}
        onSubmit={createAssignment}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => { if (!v) { setDeleteId(null); setDeleteError('') } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.kpi.assignments.deleteTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.kpi.assignments.deleteDesc}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {deleteError && (
            <div className="rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm font-medium">{deleteError}</p>
              </div>
              <a
                href="/kpi/evaluate"
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline font-medium"
              >
                → ไปหน้าประเมินผลเพื่อลบผลประเมินก่อน
              </a>
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>{t.kpi.common.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900">
              {t.kpi.assignments.deleteBtn}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
