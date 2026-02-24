'use client'

import { useMemo, useState } from 'react'
import { BarChart3, TrendingUp, Target, Filter, UserCircle, Building, ClipboardCheck, Award, Users, Weight, CalendarDays } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLocale } from '@/lib/i18n/context'
import type { KpiEvaluation, KpiAssignment, Profile } from '@/types/database.types'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, RadialBarChart, RadialBar,
} from 'recharts'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()
const MONTH_NAMES_TH = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
const getEmoji = (pct: number) =>
  pct >= 120 ? '🔥🎉' : pct >= 100 ? '😍' : pct >= 90 ? '😊' : pct >= 70 ? '🙂' : pct >= 50 ? '😰' : pct >= 30 ? '😱' : '💀'
const getPctColor = (pct: number) =>
  pct >= 100 ? '#16a34a' : pct >= 70 ? '#ea580c' : '#dc2626'

type EvalWithRelations = KpiEvaluation & {
  kpi_assignments: KpiAssignment & {
    profiles: Pick<Profile, 'id' | 'full_name' | 'department'> | null
  }
}

interface ReportsViewProps {
  evaluations: EvalWithRelations[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department'>[]
  isAdmin: boolean
}

export default function ReportsView({ evaluations, profiles, isAdmin }: ReportsViewProps) {
  const { t } = useLocale()
  const [filterUser, setFilterUser] = useState<string>('all')
  const [filterDept, setFilterDept] = useState<string>('all')
  const [filterKpi, setFilterKpi] = useState<string>('all')
  const [filterMonth, setFilterMonth] = useState<string>('all')
  // Detail table local filters
  const [detailFilterUser, setDetailFilterUser] = useState<string>('all')
  const [detailFilterKpi, setDetailFilterKpi] = useState<string>('all')
  const [detailFilterPeriod, setDetailFilterPeriod] = useState<string>('all')

  const departments = useMemo(() => {
    const depts = new Set<string>()
    profiles.forEach((p) => p.department && depts.add(p.department))
    return Array.from(depts).sort()
  }, [profiles])

  const monthOptions = useMemo(() => {
    const monthSet = new Set<string>()
    evaluations.forEach(ev => {
      if (ev.evaluation_date) monthSet.add(ev.evaluation_date.slice(0, 7))
      // ดึงเดือนจาก assignment period_start ด้วย
      const ps = ev.kpi_assignments?.period_start
      if (ps) monthSet.add(ps.slice(0, 7))
    })
    return Array.from(monthSet).sort().map(key => {
      const [y, m] = key.split('-')
      return { value: key, label: `${MONTH_NAMES_TH[parseInt(m) - 1]} ${parseInt(y) + 543}` }
    })
  }, [evaluations])

  // Filter evaluations
  const filteredEvals = useMemo(() => {
    return evaluations.filter((ev) => {
      const user = ev.kpi_assignments?.profiles
      if (filterUser !== 'all' && user?.id !== filterUser) return false
      if (filterDept !== 'all' && user?.department !== filterDept) return false
      if (filterKpi !== 'all') {
        const kpiName = ev.kpi_assignments?.kpi_templates?.name || ev.kpi_assignments?.custom_name || ''
        if (kpiName !== filterKpi) return false
      }
      if (filterMonth !== 'all') {
        const periodMonth = ev.kpi_assignments?.period_start?.slice(0, 7)
        if (periodMonth !== filterMonth) return false
      }
      return true
    })
  }, [evaluations, filterUser, filterDept, filterKpi, filterMonth])

  const kpiNames = useMemo(() => {
    const names = new Set<string>()
    evaluations.forEach((ev) => {
      const name = ev.kpi_assignments?.kpi_templates?.name || ev.kpi_assignments?.custom_name
      if (name) names.add(name)
    })
    return Array.from(names).sort()
  }, [evaluations])

  // User summary (weighted) — ใช้ผลรวม actual ทุกครั้ง
  const userSummary = useMemo(() => {
    // สะสมผลรวม actual per assignment
    const sumMap = new Map<string, { totalActual: number; target: number; weight: number; user: any; evalCount: number }>()
    filteredEvals.forEach((ev) => {
      const a = ev.kpi_assignments
      const id = ev.assignment_id
      const actual = ev.actual_value || 0
      if (!sumMap.has(id)) {
        sumMap.set(id, {
          totalActual: 0,
          target: a?.target ?? 0,
          weight: (a as any)?.weight ?? 0,
          user: a?.profiles,
          evalCount: 0,
        })
      }
      const entry = sumMap.get(id)!
      entry.totalActual += actual
      entry.evalCount += 1
    })

    const map = new Map<string, {
      name: string
      department: string
      weightedSum: number
      totalWeight: number
      evalCount: number
      weightedScore: number
      kpiCount: number
      kpiIds: Set<string>
    }>()

    sumMap.forEach(({ totalActual, target, weight, user, evalCount: ec }, assignmentId) => {
      if (!user) return
      const achPct = target > 0 ? (totalActual / target) * 100 : 0

      if (!map.has(user.id)) {
        map.set(user.id, {
          name: user.full_name || '-',
          department: user.department || '-',
          weightedSum: 0,
          totalWeight: 0,
          evalCount: 0,
          weightedScore: 0,
          kpiCount: 0,
          kpiIds: new Set(),
        })
      }
      const entry = map.get(user.id)!
      entry.weightedSum += achPct * weight
      entry.totalWeight += weight
      entry.evalCount += ec
      entry.weightedScore = entry.totalWeight > 0 ? entry.weightedSum / entry.totalWeight : 0
      entry.kpiIds.add(assignmentId)
      entry.kpiCount = entry.kpiIds.size
    })

    return Array.from(map.values()).sort((a, b) => b.weightedScore - a.weightedScore)
  }, [filteredEvals])

  // Chart data: Group by KPI (assignment_id) — ใช้ผลรวม actual ทุกครั้ง
  const kpiSummaryData = useMemo(() => {
    const map = new Map<string, {
      kpiName: string
      assignee: string
      target: number
      unit: string
      latestActual: number
      latestPct: number
      evalCount: number
      evals: { date: string; period: string; actual: number; pct: number }[]
    }>()

    filteredEvals.forEach((ev) => {
      const a = ev.kpi_assignments
      const id = ev.assignment_id
      const target = a?.target || 0
      const actual = ev.actual_value || 0
      const pct = target > 0 ? (actual / target) * 100 : 0

      if (!map.has(id)) {
        map.set(id, {
          kpiName: a?.kpi_templates?.name || a?.custom_name || '-',
          assignee: a?.profiles?.full_name || '',
          target,
          unit: a?.target_unit || '',
          latestActual: 0,
          latestPct: 0,
          evalCount: 0,
          evals: [],
        })
      }

      const entry = map.get(id)!
      entry.evalCount += 1
      entry.latestActual += actual  // สะสมรวม
      entry.latestPct = target > 0 ? (entry.latestActual / target) * 100 : 0
      entry.evals.push({
        date: ev.evaluation_date,
        period: ev.period_label || ev.evaluation_date,
        actual,
        pct: Math.round(pct * 10) / 10,
      })
    })

    return Array.from(map.values())
  }, [filteredEvals])

  const barChartData = useMemo(() => {
    return kpiSummaryData.map((d) => ({
      name: d.kpiName.length > 20 ? d.kpiName.slice(0, 20) + '…' : d.kpiName,
      fullName: d.kpiName,
      assignee: d.assignee,
      targetVal: d.target,
      actualVal: d.latestActual,
      pct: d.latestPct,
      unit: d.unit,
      evalCount: d.evalCount,
    }))
  }, [kpiSummaryData])

  const trendData = useMemo(() => {
    return filteredEvals
      .map((ev) => {
        const a = ev.kpi_assignments
        const target = a?.target || 0
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
  }, [filteredEvals])

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
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{t.kpi.reports.title}</h2>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? t.kpi.reports.subtitleAdmin : t.kpi.reports.subtitleUser}
        </p>
      </div>

      {/* Filters */}
      {isAdmin && (
        <Card>
          <CardContent className="py-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Filter className="h-4 w-4" />
                Filter:
              </div>
              <Select value={filterUser} onValueChange={setFilterUser}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <UserCircle className="h-3 w-3 mr-1" />
                  <SelectValue placeholder={t.kpi.common.employee} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.kpi.common.all}</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterDept} onValueChange={setFilterDept}>
                <SelectTrigger className="w-[160px] h-8 text-xs">
                  <Building className="h-3 w-3 mr-1" />
                  <SelectValue placeholder={t.kpi.common.department} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.kpi.common.all}</SelectItem>
                  {departments.map((d) => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterKpi} onValueChange={setFilterKpi}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <ClipboardCheck className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="KPI" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t.kpi.common.all}</SelectItem>
                  {kpiNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[180px] h-8 text-xs">
                  <CalendarDays className="h-3 w-3 mr-1" />
                  <SelectValue placeholder="เดือน" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทุกเดือน</SelectItem>
                  {monthOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {(filterUser !== 'all' || filterDept !== 'all' || filterKpi !== 'all' || filterMonth !== 'all') && (
                <Badge variant="secondary" className="text-xs">
                  {filteredEvals.length} {t.kpi.common.items}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Summary Stat Cards */}
      {filteredEvals.length > 0 && (() => {
        // summary stats — ใช้ผลรวม actual ทุกครั้ง
        const sumMap = new Map<string, { totalActual: number; target: number; weight: number; userId: string }>()
        filteredEvals.forEach((ev) => {
          const a = ev.kpi_assignments
          const id = ev.assignment_id
          const actual = ev.actual_value || 0
          if (!sumMap.has(id)) {
            sumMap.set(id, {
              totalActual: 0,
              target: a?.target ?? 0,
              weight: (a as any)?.weight ?? 0,
              userId: a?.profiles?.id || '',
            })
          }
          sumMap.get(id)!.totalActual += actual
        })

        const uniqueUsers = new Set<string>()
        let wScoreSum = 0, wScoreTotal = 0
        let wPctSum = 0, wPctTotal = 0

        sumMap.forEach(({ totalActual, target, weight, userId }) => {
          if (userId) uniqueUsers.add(userId)
          if (target > 0) {
            const pct = (totalActual / target) * 100
            if (weight > 0) {
              wScoreSum += pct * weight
              wScoreTotal += weight
              wPctSum += pct * weight
              wPctTotal += weight
            }
          }
        })

        const weightedAvgScore = wScoreTotal > 0 ? wScoreSum / wScoreTotal : 0
        const weightedAvgPct = wPctTotal > 0 ? wPctSum / wPctTotal : 0
        const kpiCount = sumMap.size
        const personCount = uniqueUsers.size

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-zinc-900 dark:bg-zinc-100" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2.5 group-hover:scale-110 transition-transform duration-300">
                    <Users className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">พนักงาน</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{personCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className="h-1 bg-zinc-900 dark:bg-zinc-100" />
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 p-2.5 group-hover:scale-110 transition-transform duration-300">
                    <ClipboardCheck className="h-5 w-5 text-zinc-700 dark:text-zinc-300" />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">KPI ทั้งหมด</p>
                    <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{kpiCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className={`h-1 ${weightedAvgScore >= 70 ? 'bg-green-500' : weightedAvgScore >= 40 ? 'bg-orange-500' : 'bg-red-500'}`} />
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2.5 group-hover:scale-110 transition-transform duration-300 ${weightedAvgScore >= 70 ? 'bg-green-50 dark:bg-green-950/30' : weightedAvgScore >= 40 ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                    <Weight className={`h-5 w-5 ${weightedAvgScore >= 70 ? 'text-green-600 dark:text-green-400' : weightedAvgScore >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`} />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">คะแนนถ่วงน้ำหนัก</p>
                    <p className={`text-2xl font-bold ${weightedAvgScore >= 70 ? 'text-green-600 dark:text-green-400' : weightedAvgScore >= 40 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{weightedAvgScore.toFixed(1)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="group border-0 shadow-sm hover:shadow-md transition-all duration-300 bg-white dark:bg-zinc-900 overflow-hidden">
              <div className={`h-1 ${weightedAvgPct >= 100 ? 'bg-green-500' : weightedAvgPct >= 70 ? 'bg-orange-500' : 'bg-red-500'}`} />
              <CardContent className="p-5">
                <div className="flex items-center gap-3">
                  <div className={`rounded-xl p-2.5 group-hover:scale-110 transition-transform duration-300 ${weightedAvgPct >= 100 ? 'bg-green-50 dark:bg-green-950/30' : weightedAvgPct >= 70 ? 'bg-orange-50 dark:bg-orange-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                    <Award className={`h-5 w-5 ${weightedAvgPct >= 100 ? 'text-green-600 dark:text-green-400' : weightedAvgPct >= 70 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`} />
                  </div>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">Achievement</p>
                    <p className={`text-2xl font-bold ${weightedAvgPct >= 100 ? 'text-green-600 dark:text-green-400' : weightedAvgPct >= 70 ? 'text-orange-600 dark:text-orange-400' : 'text-red-600 dark:text-red-400'}`}>{weightedAvgPct.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {kpiSummaryData.length > 0 && (
        <>
          {/* Bar Chart: Target vs Actual — Modern Style */}
          <Card className="border-0 shadow-sm bg-white dark:bg-zinc-900 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-zinc-900 via-zinc-500 to-transparent dark:from-zinc-100 dark:via-zinc-500 dark:to-transparent" />
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2 font-bold">
                    <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
                      <TrendingUp className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                    </div>
                    {t.kpi.reports.chartTargetVsActual}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">{t.kpi.reports.chartTargetVsActualDesc}</p>
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
                      {t.kpi.reports.chartTrend}
                    </CardTitle>
                    <p className="text-xs text-muted-foreground mt-1 ml-10">{t.kpi.reports.chartTrendDesc}</p>
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
                    {t.kpi.reports.gaugeTitle}
                  </CardTitle>
                  <p className="text-xs text-muted-foreground mt-1 ml-10">{t.kpi.reports.gaugeDesc}</p>
                </div>
                <Badge variant="outline" className="text-[10px] rounded-full border-zinc-200 dark:border-zinc-700">
                  {kpiSummaryData.length} KPIs
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-2">
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {kpiSummaryData.map((d, i) => {
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

      {/* User Summary Table */}
      {userSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t.kpi.reports.summaryTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.kpi.common.employee}</TableHead>
                  <TableHead>{t.kpi.common.department}</TableHead>
                  <TableHead className="text-center">{t.kpi.reports.kpiCount}</TableHead>
                  <TableHead className="text-center">{t.kpi.common.evaluated}</TableHead>
                  <TableHead className="text-center">คะแนนถ่วงน้ำหนัก</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userSummary.map((u, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <UserCircle className="h-4 w-4 text-muted-foreground" />
                        {u.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      {u.department !== '-' ? <Badge variant="outline" className="text-xs">{u.department}</Badge> : '-'}
                    </TableCell>
                    <TableCell className="text-center">{u.kpiCount}</TableCell>
                    <TableCell className="text-center">{u.evalCount} KPIs</TableCell>
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

      {/* Evaluations Detail Table */}
      {filteredEvals.length > 0 && (() => {
        // Unique employees & KPIs & periods for detail filters
        const detailEmployees = Array.from(new Set(
          filteredEvals.map(ev => ev.kpi_assignments?.profiles?.full_name).filter(Boolean)
        )).sort() as string[]
        const detailKpis = Array.from(new Set(
          filteredEvals.map(ev => ev.kpi_assignments?.kpi_templates?.name || ev.kpi_assignments?.custom_name).filter(Boolean)
        )).sort() as string[]
        const detailPeriods = Array.from(new Set(
          filteredEvals.map(ev => ev.period_label).filter(Boolean)
        )).sort() as string[]

        // Apply detail-level filters
        const detailEvals = filteredEvals.filter(ev => {
          if (detailFilterUser !== 'all' && ev.kpi_assignments?.profiles?.full_name !== detailFilterUser) return false
          if (detailFilterKpi !== 'all') {
            const kn = ev.kpi_assignments?.kpi_templates?.name || ev.kpi_assignments?.custom_name || ''
            if (kn !== detailFilterKpi) return false
          }
          if (detailFilterPeriod !== 'all' && ev.period_label !== detailFilterPeriod) return false
          return true
        })

        const hasDetailFilter = detailFilterUser !== 'all' || detailFilterKpi !== 'all' || detailFilterPeriod !== 'all'

        return (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t.kpi.reports.detailTitle.replace('{count}', String(detailEvals.length))}
              </CardTitle>
              {/* Detail Filters */}
              <div className="flex flex-wrap gap-2 items-center mt-2">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Filter className="h-3 w-3" />
                  กรอง:
                </div>
                <Select value={detailFilterUser} onValueChange={setDetailFilterUser}>
                  <SelectTrigger className="w-[160px] h-7 text-xs">
                    <UserCircle className="h-3 w-3 mr-1" />
                    <SelectValue placeholder={t.kpi.common.employee} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.kpi.common.all}</SelectItem>
                    {detailEmployees.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={detailFilterKpi} onValueChange={setDetailFilterKpi}>
                  <SelectTrigger className="w-[180px] h-7 text-xs">
                    <ClipboardCheck className="h-3 w-3 mr-1" />
                    <SelectValue placeholder="KPI" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t.kpi.common.all}</SelectItem>
                    {detailKpis.map(name => (
                      <SelectItem key={name} value={name}>{name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {detailPeriods.length > 1 && (
                  <Select value={detailFilterPeriod} onValueChange={setDetailFilterPeriod}>
                    <SelectTrigger className="w-[180px] h-7 text-xs">
                      <SelectValue placeholder={t.kpi.common.period} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t.kpi.common.all}</SelectItem>
                      {detailPeriods.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {hasDetailFilter && (
                  <Badge variant="secondary" className="text-[10px]">
                    {detailEvals.length} / {filteredEvals.length} {t.kpi.common.items}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.kpi.reports.evalDate}</TableHead>
                    <TableHead>KPI</TableHead>
                    <TableHead>เดือนมอบหมาย</TableHead>
                    <TableHead>{t.kpi.common.employee}</TableHead>
                    <TableHead className="text-center">น้ำหนัก</TableHead>
                    <TableHead className="text-right">{t.kpi.common.target}</TableHead>
                    <TableHead className="text-right">{t.kpi.common.actual}</TableHead>
                    <TableHead className="text-center">{t.kpi.common.difference}</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-center">ผลสำเร็จ(%)</TableHead>
                    <TableHead>{t.kpi.common.period}</TableHead>
                    <TableHead>{t.kpi.common.comment}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailEvals
                    .sort((a, b) => (b.evaluation_date || '').localeCompare(a.evaluation_date || ''))
                    .map((ev) => {
                      const a = ev.kpi_assignments
                      const target = a?.target || 0
                      const actual = ev.actual_value || 0
                      const pct = target > 0 ? (actual / target) * 100 : 0

                      return (
                        <TableRow key={ev.id}>
                          <TableCell className="text-xs whitespace-nowrap">{ev.evaluation_date || '-'}</TableCell>
                          <TableCell className="text-sm font-medium">{a?.kpi_templates?.name || a?.custom_name || '-'}</TableCell>
                          <TableCell className="text-xs whitespace-nowrap">
                            {(() => {
                              const ps = a?.period_start
                              if (!ps) return '-'
                              const [pY, pM] = ps.slice(0, 7).split('-').map(Number)
                              if (!pY || !pM) return '-'
                              const now = new Date()
                              const curKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
                              const mKey = ps.slice(0, 7)
                              const isPast = mKey < curKey
                              const isCurrent = mKey === curKey
                              return (
                                <Badge
                                  variant={isCurrent ? 'default' : isPast ? 'secondary' : 'outline'}
                                  className={`text-[10px] font-medium ${isPast ? 'opacity-70' : ''}`}
                                >
                                  {MONTH_NAMES_TH[pM - 1]} {pY + 543}
                                </Badge>
                              )
                            })()}
                          </TableCell>
                          <TableCell className="text-sm">{a?.profiles?.full_name || '-'}</TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className="text-[10px]">{(a as any)?.weight ?? 0}%</Badge>
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">{fmt(target)} {a?.target_unit}</TableCell>
                          <TableCell className="text-right text-sm font-medium">{fmt(actual)}</TableCell>
                          <TableCell className="text-center">
                            {target > 0 ? (
                              <span className={`text-xs font-semibold ${actual - target >= 0 ? 'text-green-700 dark:text-green-500' : 'text-red-700 dark:text-red-500'}`}>
                                {actual - target >= 0 ? '+' : ''}{fmt(actual - target)}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="text-xs font-semibold">
                              {pct.toFixed(1)}%
                            </span>
                          </TableCell>
                          <TableCell className="text-center font-bold">{ev.achievement_pct != null ? `${ev.achievement_pct}%` : '-'}</TableCell>
                          <TableCell className="text-xs">
                            {ev.period_label ? <Badge variant="outline" className="text-[10px]">{ev.period_label}</Badge> : '-'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={ev.comment || ''}>
                            {ev.comment || '-'}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })()}

      {filteredEvals.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {t.kpi.reports.noEvals}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
