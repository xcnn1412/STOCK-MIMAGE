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
  pct >= 100 ? '#16a34a' : pct >= 70 ? '#ea580c' : '#dc2626'

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

  // Active KPI count: filter ตามเดือนที่เลือก (นับ unique assignment_ids)
  const filteredAssignmentCount = useMemo(() => {
    if (selectedMonth === 'all') return assignmentCount
    const uniqueAssignments = new Set<string>()
    filteredEvaluations.forEach(ev => uniqueAssignments.add(ev.assignment_id))
    return uniqueAssignments.size
  }, [selectedMonth, assignmentCount, filteredEvaluations])

  // Average score & overallPct: คำนวณจากผลรวม actual ทุกครั้ง ÷ target (ตรงกับ Gauge)
  const { avgScore, overallPct } = useMemo(() => {
    if (filteredEvaluations.length === 0) return { avgScore: 0, overallPct: 0 }

    // สะสมผลรวม actual_value ต่อ assignment (เหมือน kpiSummary)
    const sumMap = new Map<string, { totalActual: number; target: number; weight: number; assignment: any }>()
    filteredEvaluations.forEach((ev) => {
      const a = ev.kpi_assignments
      const id = ev.assignment_id
      const actual = ev.actual_value || 0

      if (!sumMap.has(id)) {
        sumMap.set(id, {
          totalActual: 0,
          target: a?.target ?? 0,
          weight: (a as any)?.weight ?? 0,
          assignment: a,
        })
      }
      sumMap.get(id)!.totalActual += actual
    })

    // คำนวณคะแนนเฉลี่ย (ถ่วงน้ำหนัก) จากผลรวม
    let weightedScoreSum = 0
    let scoreWeightTotal = 0
    let weightedPctSum = 0
    let pctWeight = 0

    sumMap.forEach(({ totalActual, target, weight }) => {
      if (target > 0) {
        const pct = (totalActual / target) * 100

        if (weight > 0) {
          weightedScoreSum += pct * weight
          scoreWeightTotal += weight
          weightedPctSum += pct * weight
          pctWeight += weight
        }
      }
    })

    const avg = scoreWeightTotal > 0 ? weightedScoreSum / scoreWeightTotal : 0

    return {
      avgScore: avg,
      overallPct: pctWeight > 0 ? weightedPctSum / pctWeight : avg,
    }
  }, [filteredEvaluations])

  // === KPI Summary (grouped by assignment_id) ===
  // latestActual = ผลรวมค่าจริงของทุกครั้งที่ประเมิน (ไม่ใช่แค่ล่าสุด)
  const kpiSummary = useMemo(() => {
    const map = new Map<string, {
      kpiName: string
      assignee: string
      target: number
      unit: string
      latestActual: number  // ผลรวม actual ทั้งหมด
      latestPct: number     // % จากผลรวม
      evalCount: number
      latestDate: string
    }>()

    filteredEvaluations.forEach((ev) => {
      const a = ev.kpi_assignments
      const id = ev.assignment_id
      const target = a?.target ?? 0
      const actual = ev.actual_value || 0

      if (!map.has(id)) {
        map.set(id, {
          kpiName: a?.kpi_templates?.name || a?.custom_name || '-',
          assignee: a?.profiles?.full_name || '',
          target,
          unit: a?.target_unit || '',
          latestActual: 0,
          latestPct: 0,
          evalCount: 0,
          latestDate: ev.evaluation_date,
        })
      }

      const entry = map.get(id)!
      entry.evalCount += 1
      entry.latestActual += actual  // สะสมผลรวม
      entry.latestPct = target > 0 ? (entry.latestActual / target) * 100 : 0
      if (ev.evaluation_date >= entry.latestDate) {
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
    const pctColor = getPctColor(data?.pct || 0)
    return (
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 rounded-xl shadow-2xl p-4 text-sm space-y-2 min-w-[200px]">
        <div>
          <p className="font-bold text-zinc-900 dark:text-zinc-100 text-[13px]">{data?.fullName}</p>
          {data?.assignee && <p className="text-muted-foreground text-[11px] mt-0.5">{data.assignee}</p>}
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-zinc-800 dark:bg-zinc-200 ring-2 ring-zinc-300 dark:ring-zinc-600" />
            <span className="text-zinc-600 dark:text-zinc-400 text-xs">{t.kpi.common.target}</span>
            <span className="ml-auto font-semibold text-xs">{fmt(data?.targetVal)} {data?.unit}</span>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="inline-block w-2.5 h-2.5 rounded-full ring-2 ring-offset-1" style={{ background: pctColor, borderColor: pctColor }} />
            <span className="text-zinc-600 dark:text-zinc-400 text-xs">{t.kpi.common.actual}</span>
            <span className="ml-auto font-semibold text-xs">{fmt(data?.actualVal)} {data?.unit}</span>
          </div>
        </div>
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-700 flex items-center justify-between">
          <span className="font-extrabold text-sm" style={{ color: pctColor }}>
            {getEmoji(data?.pct || 0)} {(data?.pct || 0).toFixed(1)}%
          </span>
          <span className="text-[10px] text-muted-foreground bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
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
    const pctColor = getPctColor(data?.pct || 0)
    return (
      <div className="bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-zinc-200/80 dark:border-zinc-700/80 rounded-xl shadow-2xl p-4 text-sm space-y-2 min-w-[180px]">
        <div>
          <p className="font-bold text-zinc-900 dark:text-zinc-100 text-[13px]">{data?.kpiName}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{data?.period}</p>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">{t.kpi.common.target}</span>
            <span className="font-semibold">{fmt(data?.target)} {data?.unit}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-zinc-500">{t.kpi.common.actual}</span>
            <span className="font-semibold" style={{ color: pctColor }}>{fmt(data?.actual)}</span>
          </div>
        </div>
        <div className="pt-2 border-t border-zinc-100 dark:border-zinc-700">
          <p className="font-extrabold text-center text-sm" style={{ color: pctColor }}>
            {getEmoji(data?.pct || 0)} {data?.pct}%
          </p>
        </div>
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
            <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-zinc-900 dark:bg-zinc-100" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2.5 group-hover:scale-110 transition-transform duration-300">
                    <FileText className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Templates</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{fmt(templateCount)}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t.kpi.dashboard.statTemplates}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-zinc-900 dark:bg-zinc-100" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2.5 group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Active KPIs</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{fmt(filteredAssignmentCount)}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t.kpi.dashboard.statActiveKpis}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
        <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className="h-1 bg-orange-500" />
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2.5 group-hover:scale-110 transition-transform duration-300">
                <ClipboardCheck className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
              </div>
              <div>
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.kpi.dashboard.statEvaluations}</p>
                <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{fmt(totalEvals)}</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">{t.kpi.dashboard.statAllEvals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
          <div className={`h-1 ${avgScore >= 70 ? 'bg-green-500' : avgScore >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} />
          <CardContent className="p-5">
            <div className="flex items-center gap-3">
              <div className={`rounded-xl p-2.5 group-hover:scale-110 transition-transform duration-300 ${avgScore >= 70 ? 'bg-green-50 dark:bg-green-950/30' : avgScore >= 40 ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                <Award className={`h-5 w-5 ${avgScore >= 70 ? 'text-green-600 dark:text-green-400' : avgScore >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`} />
              </div>
              <div>
                <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t.kpi.dashboard.statAvgScore}</p>
                <p className={`text-2xl font-bold ${avgScore >= 70 ? 'text-green-600 dark:text-green-400' : avgScore >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>
                  {avgScore.toFixed(1)}
                </p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  {getEmoji(overallPct)} {t.kpi.common.achievedPct.replace('{pct}', overallPct.toFixed(1))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* === Charts === */}
      {kpiSummary.length > 0 && (
        <>
          {/* Bar Chart: Target vs Actual — Modern Horizontal Grouped */}
          <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-zinc-900 via-zinc-500 to-transparent dark:from-zinc-100 dark:via-zinc-500 dark:to-transparent" />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    {t.kpi.dashboard.chartTargetVsActual}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">{t.kpi.dashboard.chartTargetVsActualDesc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] rounded-full border-zinc-200 dark:border-zinc-700">
                  {barChartData.length} KPIs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="w-full" style={{ height: Math.max(220, barChartData.length * 70) }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barChartData}
                    layout="vertical"
                    margin={{ top: 10, right: 40, left: 10, bottom: 10 }}
                    barGap={4}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" horizontal={false} />
                    <XAxis
                      type="number"
                      tickFormatter={(v: number) => v.toLocaleString()}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#a1a1aa' }}
                    />
                    <YAxis
                      dataKey="name"
                      type="category"
                      width={150}
                      fontSize={11}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#52525b', fontWeight: 500 }}
                    />
                    <Tooltip content={<BarTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                    <Legend
                      wrapperStyle={{ fontSize: '12px', paddingTop: '12px' }}
                      iconType="circle"
                      iconSize={8}
                    />
                    <Bar
                      dataKey="targetVal"
                      name={t.kpi.common.target}
                      fill="#27272a"
                      radius={[0, 8, 8, 0]}
                      barSize={16}
                      opacity={0.85}
                    />
                    <Bar dataKey="actualVal" name={t.kpi.common.actualLatest} radius={[0, 8, 8, 0]} barSize={16}>
                      {barChartData.map((entry, i) => (
                        <Cell key={i} fill={getPctColor(entry.pct)} opacity={0.9} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Trend Chart — Modern Vertical Bars */}
          {trendData.length > 1 && (
            <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-orange-500 via-orange-300 to-transparent" />
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base flex items-center gap-2 font-bold">
                      <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                        <BarChart3 className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                      </div>
                      {t.kpi.dashboard.chartTrend}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 ml-10">{t.kpi.dashboard.chartTrendDesc}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] rounded-full border-zinc-200 dark:border-zinc-700">
                    {trendData.length} entries
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-2">
                <div className="w-full h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 20, right: 30, left: 0, bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f4f4f5" vertical={false} />
                      <XAxis
                        dataKey="period"
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#71717a' }}
                      />
                      <YAxis
                        fontSize={11}
                        tickFormatter={(v: number) => `${v}%`}
                        domain={[0, 'auto']}
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#a1a1aa' }}
                      />
                      <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(0,0,0,0.03)' }} />
                      <Bar dataKey="pct" name="Achievement %" radius={[8, 8, 0, 0]} barSize={36}>
                        {trendData.map((entry, i) => (
                          <Cell key={i} fill={getPctColor(entry.pct)} opacity={0.9} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Achievement Gauge Cards — Modern Ring Design */}
          <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-green-500 via-green-300 to-transparent" />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <Target className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    {t.kpi.dashboard.gaugeTitle}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">{t.kpi.dashboard.gaugeDesc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] rounded-full border-zinc-200 dark:border-zinc-700">
                  {kpiSummary.length} KPIs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {kpiSummary.map((d, i) => {
                  const clampedPct = Math.min(d.latestPct, 100)
                  const radialData = [
                    { name: 'bg', value: 100, fill: '#f4f4f5' },
                    { name: 'pct', value: clampedPct, fill: getPctColor(d.latestPct) },
                  ]
                  const pctColor = getPctColor(d.latestPct)
                  return (
                    <div
                      key={i}
                      className="group relative rounded-2xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-800/30 p-5 flex flex-col items-center text-center hover:shadow-lg hover:border-zinc-200 dark:hover:border-zinc-700 transition-all duration-300 hover:-translate-y-0.5"
                    >
                      <Badge variant="secondary" className="absolute top-3 right-3 text-[9px] font-medium bg-zinc-100 dark:bg-zinc-800">
                        {d.evalCount} {t.kpi.common.times}
                      </Badge>
                      <div className="w-[100px] h-[100px] relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart
                            cx="50%" cy="50%"
                            innerRadius="72%" outerRadius="100%"
                            data={radialData}
                            startAngle={90} endAngle={-270}
                          >
                            <RadialBar dataKey="value" cornerRadius={12} background={{ fill: '#f4f4f5' }} />
                          </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-lg font-extrabold" style={{ color: pctColor }}>
                            {Math.round(d.latestPct)}
                          </span>
                          <span className="text-[9px] font-medium text-zinc-400">%</span>
                        </div>
                      </div>
                      <p className="text-xs font-semibold mt-3 line-clamp-2 text-zinc-800 dark:text-zinc-200">{d.kpiName}</p>
                      {d.assignee && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">{d.assignee}</p>
                      )}
                      <div className="mt-3 text-[11px] space-y-1 w-full border-t border-zinc-100 dark:border-zinc-700 pt-3">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t.kpi.common.target}</span>
                          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{fmt(d.target)} {d.unit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">{t.kpi.common.actualShort}</span>
                          <span className="font-semibold" style={{ color: pctColor }}>{fmt(d.latestActual)}</span>
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
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-amber-500" />
              {t.kpi.dashboard.rankingTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-100 dark:border-zinc-800">
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>{t.kpi.common.employee}</TableHead>
                  <TableHead>{t.kpi.common.department}</TableHead>
                  <TableHead className="text-center">{t.kpi.common.evaluated}</TableHead>
                  <TableHead className="text-center">คะแนนถ่วงน้ำหนัก</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userRanking.map((u, i) => (
                  <TableRow key={i} className={`transition-colors ${i < 3 ? 'bg-zinc-50/50 dark:bg-zinc-800/30' : ''}`}>
                    <TableCell className="text-center">
                      {i === 0 ? (
                        <span className="text-xl">🥇</span>
                      ) : i === 1 ? (
                        <span className="text-xl">🥈</span>
                      ) : i === 2 ? (
                        <span className="text-xl">🥉</span>
                      ) : (
                        <span className="text-sm text-muted-foreground font-medium">{i + 1}</span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold ${i === 0 ? 'bg-gradient-to-br from-amber-300 to-amber-500 text-amber-900'
                          : i === 1 ? 'bg-gradient-to-br from-zinc-300 to-zinc-400 text-zinc-700'
                            : i === 2 ? 'bg-gradient-to-br from-orange-300 to-orange-500 text-orange-900'
                              : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300'
                          }`}>
                          {u.name.charAt(0)}
                        </div>
                        <span className="text-sm">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.department !== '-' ? <Badge variant="outline" className="text-[10px] rounded-full">{u.department}</Badge> : '-'}
                    </TableCell>
                    <TableCell className="text-center text-sm">{fmt(u.evalCount)} KPIs</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold text-sm px-2.5 py-1 rounded-full ${u.weightedScore >= 70 ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : u.weightedScore >= 40 ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}>
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
    const monthNames = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม']
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
                    : latestPct <= 100 ? 'text-orange-600 dark:text-orange-400'
                      : 'text-foreground'
                : ''
              const barColor = latestPct !== null
                ? latestPct >= 125 ? '[&>div]:bg-green-600 dark:[&>div]:bg-green-500'
                  : latestPct < 0 ? '[&>div]:bg-red-600 dark:[&>div]:bg-red-500'
                    : latestPct <= 100 ? '[&>div]:bg-orange-500 dark:[&>div]:bg-orange-400'
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
