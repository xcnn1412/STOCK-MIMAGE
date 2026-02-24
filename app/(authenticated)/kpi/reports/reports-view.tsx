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
  pct >= 100 ? '#22c55e' : pct >= 70 ? '#eab308' : '#ef4444'

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

  // User summary (weighted)
  const userSummary = useMemo(() => {
    // Group latest eval per assignment
    const latestMap = new Map<string, typeof filteredEvals[0]>()
    filteredEvals.forEach((ev) => {
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
      kpiCount: number
      kpiIds: Set<string>
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
          kpiCount: 0,
          kpiIds: new Set(),
        })
      }
      const entry = map.get(user.id)!
      entry.weightedSum += achPct * w
      entry.totalWeight += w
      entry.evalCount += 1
      entry.weightedScore = entry.totalWeight > 0 ? entry.weightedSum / entry.totalWeight : 0
      entry.kpiIds.add(ev.assignment_id)
      entry.kpiCount = entry.kpiIds.size
    })

    return Array.from(map.values()).sort((a, b) => b.weightedScore - a.weightedScore)
  }, [filteredEvals])

  // Chart data: Group by KPI (assignment_id) — aggregate per KPI
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
          latestActual: actual,
          latestPct: pct,
          evalCount: 0,
          evals: [],
        })
      }

      const entry = map.get(id)!
      entry.evalCount += 1
      entry.evals.push({
        date: ev.evaluation_date,
        period: ev.period_label || ev.evaluation_date,
        actual,
        pct: Math.round(pct * 10) / 10,
      })
      // latest by date
      if (ev.evaluation_date >= entry.evals[0]?.date) {
        entry.latestActual = actual
        entry.latestPct = pct
      }
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
        <p>{t.kpi.common.targetArrowActual
          .replace('{target}', fmt(data?.target))
          .replace('{actual}', fmt(data?.actual))
          .replace('{unit}', data?.unit || '')}</p>
        <p className="font-bold" style={{ color: getPctColor(data?.pct || 0) }}>
          {getEmoji(data?.pct || 0)} {data?.pct}%
        </p>
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
        // Compute summary stats from filtered data
        const latestMap = new Map<string, typeof filteredEvals[0]>()
        filteredEvals.forEach((ev) => {
          const existing = latestMap.get(ev.assignment_id)
          if (!existing || (ev.evaluation_date || '') >= (existing.evaluation_date || '')) {
            latestMap.set(ev.assignment_id, ev)
          }
        })

        const uniqueUsers = new Set<string>()
        let wScoreSum = 0, wScoreTotal = 0
        let wPctSum = 0, wPctTotal = 0

        latestMap.forEach((ev) => {
          const user = ev.kpi_assignments?.profiles
          if (user) uniqueUsers.add(user.id)
          const w = (ev.kpi_assignments as any)?.weight ?? 0
          const achPct = ev.achievement_pct || 0
          wScoreSum += achPct * w
          wScoreTotal += w

          const target = ev.kpi_assignments?.target
          if (target && target > 0) {
            const pct = ((ev.actual_value || 0) / target) * 100
            wPctSum += pct * w
            wPctTotal += w
          }
        })

        const weightedAvgScore = wScoreTotal > 0 ? wScoreSum / wScoreTotal : 0
        const weightedAvgPct = wPctTotal > 0 ? wPctSum / wPctTotal : 0
        const kpiCount = latestMap.size
        const personCount = uniqueUsers.size

        return (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                    <Users className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">พนักงาน</p>
                    <p className="text-xl font-bold">{personCount}</p>
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
                    <p className="text-xs text-muted-foreground">KPI ทั้งหมด</p>
                    <p className="text-xl font-bold">{kpiCount}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                    <Weight className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">คะแนนถ่วงน้ำหนัก</p>
                    <p className="text-xl font-bold">{weightedAvgScore.toFixed(1)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-zinc-100 dark:bg-zinc-800 p-2.5">
                    <Award className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Achievement</p>
                    <p className="text-xl font-bold">{weightedAvgPct.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      {kpiSummaryData.length > 0 && (
        <>
          {/* Bar Chart */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                {t.kpi.reports.chartTargetVsActual}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t.kpi.reports.chartTargetVsActualDesc}</p>
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
                    <XAxis type="number" tickFormatter={(v: number) => v.toLocaleString()} fontSize={12} />
                    <YAxis dataKey="name" type="category" width={160} fontSize={12} tick={{ fill: '#71717a' }} />
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
                  {t.kpi.reports.chartTrend}
                </CardTitle>
                <p className="text-xs text-muted-foreground">{t.kpi.reports.chartTrendDesc}</p>
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

          {/* Radial Gauges */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" />
                {t.kpi.reports.gaugeTitle}
              </CardTitle>
              <p className="text-xs text-muted-foreground">{t.kpi.reports.gaugeDesc}</p>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {kpiSummaryData.map((d, i) => {
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
                      <span className="font-bold">
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
