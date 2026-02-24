'use client'

import { useMemo, useState, useCallback } from 'react'
import {
  BarChart3, FileText, Users, ClipboardCheck, Target,
  TrendingUp, UserCircle, Award, Send, Weight, CalendarDays,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLocale } from '@/lib/i18n/context'
import { submitSelfEvaluation } from '../actions'
import { KPI_MODES, KPI_CYCLES } from '../types'
import type { KpiEvaluation, KpiAssignment, Profile } from '@/types/database.types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, RadialBarChart, RadialBar,
} from 'recharts'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()
const getEmoji = (pct: number) =>
  pct >= 120 ? '🔥🎉' : pct >= 100 ? '😍' : pct >= 90 ? '😊' : pct >= 70 ? '🙂' : pct >= 50 ? '😰' : pct >= 30 ? '😱' : '💀'
const getPctColor = (pct: number) =>
  pct >= 100 ? '#22c55e' : pct >= 70 ? '#eab308' : '#ef4444'

const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]


type EvalWithRelations = KpiEvaluation & {
  kpi_assignments: KpiAssignment & {
    profiles: Pick<Profile, 'id' | 'full_name' | 'department'> | null
  }
}

type AssignmentWithEvals = KpiAssignment & {
  kpi_evaluations?: KpiEvaluation[]
}

interface DashboardViewProps {
  isAdmin: boolean
  templateCount: number
  assignmentCount: number
  evaluations: EvalWithRelations[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department'>[]
  myAssignments?: AssignmentWithEvals[]
}

export default function DashboardView({
  isAdmin,
  templateCount,
  assignmentCount,
  evaluations,
  profiles,
  myAssignments = [],
}: DashboardViewProps) {
  const { t } = useLocale()
  const [selectedMonth, setSelectedMonth] = useState<string>('all')

  // Build month options from evaluations + assignment period_start
  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>()
    evaluations.forEach(ev => {
      if (ev.evaluation_date) monthSet.add(ev.evaluation_date.slice(0, 7))
      // ดึงเดือนจาก assignment period_start ด้วย
      const ps = ev.kpi_assignments?.period_start
      if (ps) monthSet.add(ps.slice(0, 7))
    })
    // Staff: เพิ่มเดือนจาก myAssignments
    myAssignments.forEach(a => {
      if (a.period_start) monthSet.add(a.period_start.slice(0, 7))
    })
    return Array.from(monthSet).sort().map(key => {
      const [y, m] = key.split('-')
      return { value: key, label: `${MONTH_NAMES_TH[parseInt(m) - 1]} ${parseInt(y) + 543}` }
    })
  }, [evaluations, myAssignments])

  // Filter evaluations by selected month (match against assignment period_start)
  const filteredEvaluations = useMemo(() => {
    if (selectedMonth === 'all') return evaluations
    return evaluations.filter(ev => {
      const periodMonth = ev.kpi_assignments?.period_start?.slice(0, 7)
      return periodMonth === selectedMonth
    })
  }, [evaluations, selectedMonth])

  // === Derived Stats ===
  const totalEvals = filteredEvaluations.length

  // Weighted average score: group latest eval per assignment, multiply by weight
  const { avgScore, overallPct } = useMemo(() => {
    // Group latest eval per assignment_id
    const latestMap = new Map<string, EvalWithRelations>()
    filteredEvaluations.forEach((ev) => {
      const existing = latestMap.get(ev.assignment_id)
      if (!existing || (ev.evaluation_date || '') >= (existing.evaluation_date || '')) {
        latestMap.set(ev.assignment_id, ev)
      }
    })

    let weightedScoreSum = 0
    let weightedPctSum = 0
    let totalWeight = 0
    let pctWeight = 0

    latestMap.forEach((ev) => {
      const w = (ev.kpi_assignments as any)?.weight ?? 0
      const achPct = ev.achievement_pct || 0
      weightedScoreSum += achPct * w
      totalWeight += w

      const a = ev.kpi_assignments
      const target = a?.target ?? 0
      if (target > 0) {
        const pct = ((ev.actual_value || 0) / target) * 100
        weightedPctSum += pct * w
        pctWeight += w
      }
    })

    return {
      avgScore: totalWeight > 0 ? weightedScoreSum / totalWeight : 0,
      overallPct: pctWeight > 0 ? weightedPctSum / pctWeight : 0,
    }
  }, [filteredEvaluations])

  // === KPI Summary (grouped by assignment_id) ===
  const kpiSummary = useMemo(() => {
    const map = new Map<string, {
      kpiName: string
      assignee: string
      target: number
      unit: string
      latestActual: number
      latestPct: number
      evalCount: number
      latestDate: string
    }>()


    filteredEvaluations.forEach((ev) => {
      const a = ev.kpi_assignments
      const id = ev.assignment_id
      const target = a?.target ?? 0
      const actual = ev.actual_value || 0
      const pct = target > 0 ? (actual / target) * 100 : 0

      if (!map.has(id)) {
        map.set(id, {
          kpiName: a?.kpi_templates?.name || a?.custom_name || '-',
          assignee: a?.profiles?.full_name || '',
          target,
          unit: a?.target_unit || '',
          latestActual: actual,
          latestPct: pct,
          evalCount: 0,
          latestDate: ev.evaluation_date,
        })
      }

      const entry = map.get(id)!
      entry.evalCount += 1
      if (ev.evaluation_date >= entry.latestDate) {
        entry.latestActual = actual
        entry.latestPct = pct
        entry.latestDate = ev.evaluation_date
      }
    })

    return Array.from(map.values())
  }, [filteredEvaluations])

  // === Bar Chart Data ===
  const barChartData = useMemo(() => {
    return kpiSummary.map((d) => ({
      name: d.kpiName.length > 20 ? d.kpiName.slice(0, 20) + '…' : d.kpiName,
      fullName: d.kpiName,
      assignee: d.assignee,
      targetVal: d.target,
      actualVal: d.latestActual,
      pct: d.latestPct,
      unit: d.unit,
      evalCount: d.evalCount,
    }))
  }, [kpiSummary])

  // === User Rankings (Weighted) ===
  const userRanking = useMemo(() => {
    // Group latest eval per assignment
    const latestMap = new Map<string, EvalWithRelations>()
    filteredEvaluations.forEach((ev) => {
      const existing = latestMap.get(ev.assignment_id)
      if (!existing || (ev.evaluation_date || '') >= (existing.evaluation_date || '')) {
        latestMap.set(ev.assignment_id, ev)
      }
    })

    const map = new Map<string, {
      name: string
      department: string
      weightedSum: number
      totalWeight: number
      evalCount: number
      weightedScore: number
    }>()

    latestMap.forEach((ev) => {
      const user = ev.kpi_assignments?.profiles
      if (!user) return
      const w = (ev.kpi_assignments as any)?.weight ?? 0
      const achPct = ev.achievement_pct || 0

      if (!map.has(user.id)) {
        map.set(user.id, {
          name: user.full_name || '-',
          department: user.department || '-',
          weightedSum: 0,
          totalWeight: 0,
          evalCount: 0,
          weightedScore: 0,
        })
      }
      const entry = map.get(user.id)!
      entry.weightedSum += achPct * w
      entry.totalWeight += w
      entry.evalCount += 1
      entry.weightedScore = entry.totalWeight > 0 ? entry.weightedSum / entry.totalWeight : 0
    })

    return Array.from(map.values()).sort((a, b) => b.weightedScore - a.weightedScore)
  }, [filteredEvaluations])

  // === Trend Data ===
  const trendData = useMemo(() => {
    return filteredEvaluations
      .map((ev) => {
        const a = ev.kpi_assignments
        const target = a?.target ?? 0
        const actual = ev.actual_value || 0
        const pct = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0
        return {
          date: ev.evaluation_date,
          period: ev.period_label || ev.evaluation_date,
          kpiName: a?.kpi_templates?.name || a?.custom_name || '-',
          pct,
          actual,
          target,
          unit: a?.target_unit || '',
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
  }, [filteredEvaluations])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const BarTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const data = payload[0]?.payload
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm space-y-1">
        <p className="font-semibold">{data?.fullName}</p>
        {data?.assignee && <p className="text-muted-foreground text-xs">{data.assignee}</p>}
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#6366f1' }} />
          <span>{t.kpi.common.target}: {fmt(data?.targetVal)} {data?.unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#22d3ee' }} />
          <span>{t.kpi.common.actual}: {fmt(data?.actualVal)} {data?.unit}</span>
        </div>
        <div className="pt-1 border-t border-zinc-200 dark:border-zinc-600 flex items-center justify-between">
          <span className="font-bold" style={{ color: getPctColor(data?.pct || 0) }}>
            {getEmoji(data?.pct || 0)} {(data?.pct || 0).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">
            {t.kpi.common.evaluatedTimes.replace('{count}', String(data?.evalCount || 0))}
          </span>
        </div>
      </div>
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const TrendTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const data = payload[0]?.payload
    return (
      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg p-3 text-sm space-y-1">
        <p className="font-semibold">{data?.kpiName}</p>
        <p className="text-xs text-muted-foreground">{data?.period}</p>
        <p>{t.kpi.common.target}: {fmt(data?.target)} → {t.kpi.common.actual}: {fmt(data?.actual)} {data?.unit}</p>
        <p className="font-bold" style={{ color: getPctColor(data?.pct || 0) }}>
          {getEmoji(data?.pct || 0)} {data?.pct}%
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t.kpi.dashboard.title}</h2>
          <p className="text-sm text-muted-foreground">
            {isAdmin ? t.kpi.dashboard.subtitleAdmin : t.kpi.dashboard.subtitleUser}
          </p>
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

      {/* === Stat Cards === */}
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        {isAdmin && (
          <>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Templates</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{fmt(templateCount)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.kpi.dashboard.statTemplates}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active KPIs</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{fmt(assignmentCount)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t.kpi.dashboard.statActiveKpis}</p>
              </CardContent>
            </Card>
          </>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.kpi.dashboard.statEvaluations}</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(totalEvals)}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.kpi.dashboard.statAllEvals}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t.kpi.dashboard.statAvgScore}</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${avgScore >= 70 ? 'text-green-600' : avgScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
              {avgScore.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {getEmoji(overallPct)} {t.kpi.common.achievedPct.replace('{pct}', overallPct.toFixed(1))}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* === Charts === */}
      {kpiSummary.length > 0 && (
        <>
          {/* Bar Chart: Target vs Actual */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {t.kpi.dashboard.chartTargetVsActual}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t.kpi.dashboard.chartTargetVsActualDesc}</p>
            </CardHeader>
            <CardContent>
              <div className="w-full" style={{ height: Math.max(200, barChartData.length * 60) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barChartData}
                    layout="vertical"
                    margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => v.toLocaleString()}
                      fontSize={12}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={160}
                      fontSize={12}
                      tick={{ fill: '#71717a' }}
                    />
                    <Tooltip content={<BarTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '13px' }} />
                    <Bar dataKey="targetVal" name={t.kpi.common.target} fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20} />
                    <Bar dataKey="actualVal" name={t.kpi.common.actualLatest} radius={[0, 6, 6, 0]} barSize={20}>
                      {barChartData.map((entry, i) => (
                        <Cell key={i} fill={getPctColor(entry.pct)} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Trend Chart */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  {t.kpi.dashboard.chartTrend}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{t.kpi.dashboard.chartTrendDesc}</p>
              </CardHeader>
              <CardContent>
                <div className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis dataKey="period" fontSize={12} tick={{ fill: '#71717a' }} />
                      <YAxis fontSize={12} tickFormatter={(v: number) => `${v}%`} domain={[0, 'auto']} />
                      <Tooltip content={<TrendTooltip />} />
                      <Bar dataKey="pct" name="Achievement %" radius={[6, 6, 0, 0]} barSize={40}>
                        {trendData.map((entry, i) => (
                          <Cell key={i} fill={getPctColor(entry.pct)} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Achievement Gauge Cards */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" />
                {t.kpi.dashboard.gaugeTitle}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t.kpi.dashboard.gaugeDesc}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {kpiSummary.map((d, i) => {
                  const clampedPct = Math.min(d.latestPct, 100)
                  const radialData = [
                    { name: 'bg', value: 100, fill: '#e4e4e7' },
                    { name: 'pct', value: clampedPct, fill: getPctColor(d.latestPct) },
                  ]
                  return (
                    <div
                      key={i}
                      className="relative rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-4 flex flex-col items-center text-center"
                    >
                      <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                        {d.evalCount} {t.kpi.common.times}
                      </Badge>
                      <div className="w-24 h-24 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart
                            cx="50%" cy="50%"
                            innerRadius="70%" outerRadius="100%"
                            data={radialData}
                            startAngle={90} endAngle={-270}
                          >
                            <RadialBar dataKey="value" cornerRadius={10} background={{ fill: '#f4f4f5' }} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-2xl">{getEmoji(d.latestPct)}</span>
                        </div>
                      </div>
                      <p className="mt-2 font-bold text-lg" style={{ color: getPctColor(d.latestPct) }}>
                        {d.latestPct.toFixed(1)}%
                      </p>
                      <p className="text-xs font-medium mt-1 line-clamp-2">{d.kpiName}</p>
                      {d.assignee && (
                        <p className="text-xs text-muted-foreground/70 mt-0.5">{d.assignee}</p>
                      )}
                      <div className="mt-2 text-xs space-y-0.5 w-full">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t.kpi.common.target}</span>
                          <span className="font-medium">{fmt(d.target)} {d.unit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t.kpi.common.actualShort}</span>
                          <span className="font-medium">{fmt(d.latestActual)}</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* === User Ranking Table (admin only) === */}
      {isAdmin && userRanking.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4" />
              {t.kpi.dashboard.rankingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>{t.kpi.common.employee}</TableHead>
                  <TableHead>{t.kpi.common.department}</TableHead>
                  <TableHead className="text-center">{t.kpi.common.evaluated}</TableHead>
                  <TableHead className="text-center">คะแนนถ่วงน้ำหนัก</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRanking.map((u, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-center font-bold">
                      {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                        {u.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.department !== '-' ? <Badge variant="outline" className="text-xs">{u.department}</Badge> : '-'}
                    </TableCell>
                    <TableCell className="text-center">{fmt(u.evalCount)} KPIs</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${u.weightedScore >= 70 ? 'text-green-600' : u.weightedScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {u.weightedScore.toFixed(1)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* === Self-Evaluation Section (Staff) === */}
      {!isAdmin && myAssignments.length > 0 && (() => {
        return <SelfEvalSection assignments={myAssignments} />
      })()}

      {/* Empty state */}
      {evaluations.length === 0 && myAssignments.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">{t.kpi.dashboard.emptyState}</p>
            <p className="text-xs text-muted-foreground mt-1">{t.kpi.dashboard.emptyHint}</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ─── Self-Evaluation Sub-Component ───
function SelfEvalSection({ assignments }: { assignments: AssignmentWithEvals[] }) {
  const { t } = useLocale()
  const [evalTarget, setEvalTarget] = useState<AssignmentWithEvals | null>(null)
  const [loading, setLoading] = useState(false)
  const [actualValue, setActualValue] = useState('')
  const [actualDisplay, setActualDisplay] = useState('')
  const [comment, setComment] = useState('')
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleActualChange = useCallback((val: string) => {
    const raw = val.replace(/,/g, '')
    if (raw === '' || /^\d*\.?\d*$/.test(raw)) {
      setActualValue(raw)
      if (raw && !isNaN(Number(raw))) {
        setActualDisplay(Number(raw).toLocaleString())
      } else {
        setActualDisplay(raw)
      }
    }
  }, [])

  const handleSubmit = useCallback(async () => {
    if (!evalTarget) return
    setLoading(true)

    const formData = new FormData()
    formData.set('assignment_id', evalTarget.id)
    formData.set('actual_value', actualValue)
    formData.set('comment', comment)
    formData.set('evaluation_date', new Date().toISOString().split('T')[0])

    // Auto period label
    const now = new Date()
    const weekNum = Math.ceil(now.getDate() / 7)
    const monthNames = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม']
    const cycle = evalTarget.cycle || 'monthly'
    const periodLabel = cycle === 'weekly'
      ? `Week ${weekNum} : ${monthNames[now.getMonth()]}`
      : cycle === 'monthly'
        ? monthNames[now.getMonth()]
        : `ปี ${now.getFullYear() + 543}`
    formData.set('period_label', periodLabel)

    const result = await submitSelfEvaluation(formData)
    setLoading(false)
    if (result.success) {
      setSuccessMsg('บันทึกผลประเมินตนเองเรียบร้อย!')
      setEvalTarget(null)
      setActualValue('')
      setActualDisplay('')
      setComment('')
      setTimeout(() => setSuccessMsg(null), 3000)
    } else {
      alert(result.error || 'เกิดข้อผิดพลาด')
    }
  }, [evalTarget, actualValue, comment])

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" />
            KPI ของฉัน
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            ประเมินผลงานของคุณเอง — admin จะเห็นผลลัพธ์ที่คุณส่ง
          </p>
        </CardHeader>
        <CardContent>
          {/* Success toast */}
          {successMsg && (
            <div className="mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 text-sm font-medium">
              ✅ {successMsg}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {assignments.map((a) => {
              const name = a.kpi_templates?.name || a.custom_name || 'Custom KPI'
              const mode = a.kpi_templates?.mode || a.custom_mode || 'task'
              const modeInfo = KPI_MODES.find((m) => m.value === mode)
              const cycleInfo = KPI_CYCLES.find((c) => c.value === a.cycle)
              const evals = a.kpi_evaluations || []
              const evalCount = evals.length
              const weight = (a as any).weight ?? 0

              // Latest eval
              const latestEval = evalCount > 0
                ? [...evals].sort((x, y) =>
                    new Date(y.evaluation_date || y.created_at || '').getTime() -
                    new Date(x.evaluation_date || x.created_at || '').getTime()
                  )[0]
                : null
              const latestActual = latestEval?.actual_value || 0
              const effectiveT = a.target ?? 0
              const latestPct = latestEval && effectiveT ? ((latestEval.actual_value || 0) / effectiveT) * 100 : null

              // Color logic
              const pctColor = latestPct !== null
                ? latestPct >= 125 ? 'text-green-700 dark:text-green-400'
                  : latestPct < 0 ? 'text-red-700 dark:text-red-400'
                  : latestPct <= 100 ? 'text-amber-600 dark:text-amber-400'
                  : 'text-foreground'
                : ''
              const barColor = latestPct !== null
                ? latestPct >= 125 ? '[&>div]:bg-green-600 dark:[&>div]:bg-green-500'
                  : latestPct < 0 ? '[&>div]:bg-red-600 dark:[&>div]:bg-red-500'
                  : latestPct <= 100 ? '[&>div]:bg-amber-500 dark:[&>div]:bg-amber-400'
                  : '[&>div]:bg-zinc-800 dark:[&>div]:bg-zinc-300'
                : '[&>div]:bg-zinc-800 dark:[&>div]:bg-zinc-300'

              return (
                <Card key={a.id} className="overflow-hidden">
                  <CardContent className="p-4 space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1 min-w-0 flex-1">
                        <h4 className="font-semibold text-sm line-clamp-2">{name}</h4>
                        <div className="flex gap-1 flex-wrap">
                          <Badge variant="outline" className="text-[10px]">{t.kpi.modes[modeInfo?.value || mode] || mode}</Badge>
                          <Badge variant="outline" className="text-[10px]">{t.kpi.cycles[cycleInfo?.value || a.cycle] || a.cycle}</Badge>
                          {weight > 0 && (
                            <Badge variant="secondary" className="text-[10px] gap-0.5">
                              <Weight className="h-2.5 w-2.5" />
                              {weight}%
                            </Badge>
                          )}
                          {evalCount > 0 && (
                            <Badge variant="secondary" className="text-[10px]">{evalCount} ครั้ง</Badge>
                          )}
                        </div>
                      </div>
                      {/* Evaluate Button */}
                      <Button
                        size="sm"
                        onClick={() => {
                          setActualValue('')
                          setActualDisplay('')
                          setComment('')
                          setEvalTarget(a)
                        }}
                        className="gap-1.5 h-8 text-xs shrink-0"
                      >
                        <Send className="h-3 w-3" />
                        ประเมิน
                      </Button>
                    </div>

                    {/* Actual vs Target + Progress */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-muted-foreground text-xs">{t.kpi.common.actual}:</span>
                          <span className="font-semibold">{latestEval ? fmt(latestActual) : '—'}</span>
                          <span className="text-muted-foreground text-xs mx-0.5">/</span>
                          <span className="text-muted-foreground text-xs">{t.kpi.common.target}:</span>
                          <span className="font-medium text-muted-foreground">
                            {fmt(effectiveT)} {a.target_unit}
                          </span>
                        </div>
                        {latestPct != null && (
                          <span className={`text-xs font-bold ${pctColor}`}>
                            {latestPct.toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <Progress value={Math.min(latestPct ?? 0, 100)} className={`h-2 ${barColor}`} />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Self-Evaluation Dialog */}
      <Dialog open={!!evalTarget} onOpenChange={(v) => !v && setEvalTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" />
              ประเมินผลงานตนเอง
            </DialogTitle>
          </DialogHeader>

          {evalTarget && (
            <div className="space-y-4">
              {/* KPI Info */}
              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 space-y-1">
                <p className="font-semibold text-sm">
                  {evalTarget.kpi_templates?.name || evalTarget.custom_name || 'Custom KPI'}
                </p>
                <p className="text-xs text-muted-foreground">
                  เป้าหมาย: {fmt(evalTarget.target)} {evalTarget.target_unit}
                </p>
              </div>

              {/* Actual Value */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ค่าจริง (Actual)</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder={`เป้าหมาย: ${fmt(evalTarget.target ?? 0)}`}
                  value={actualDisplay}
                  onChange={(e) => handleActualChange(e.target.value)}
                  className="text-lg font-semibold"
                  autoFocus
                />
                {actualValue && (() => {
                  const effTarget = evalTarget.target ?? 0
                  if (!effTarget || effTarget <= 0) return null
                  return (
                    <p className="text-xs text-muted-foreground">
                      = {((Number(actualValue) / effTarget) * 100).toFixed(1)}% ของเป้าหมาย
                      {' • '}คะแนน: {Math.min(Math.max(Math.round((Number(actualValue) / effTarget) * 100), 0), 100)}
                    </p>
                  )
                })()}
              </div>

              {/* Comment */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">ความคิดเห็น (ถ้ามี)</label>
                <Textarea
                  placeholder="รายละเอียดเพิ่มเติม..."
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={2}
                />
              </div>

              {/* Submit */}
              <Button
                className="w-full gap-2"
                disabled={!actualValue || loading}
                onClick={handleSubmit}
              >
                {loading ? (
                  <span className="animate-pulse">กำลังบันทึก...</span>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    ส่งผลประเมิน
                  </>
                )}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
