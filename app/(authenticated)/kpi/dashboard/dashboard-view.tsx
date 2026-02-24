'use client'

import { useMemo } from 'react'
import {
  BarChart3, FileText, Users, ClipboardCheck, Target,
  TrendingUp, UserCircle, Award,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

type EvalWithRelations = KpiEvaluation & {
  kpi_assignments: KpiAssignment & {
    profiles: Pick<Profile, 'id' | 'full_name' | 'department'> | null
  }
}

interface DashboardViewProps {
  isAdmin: boolean
  templateCount: number
  assignmentCount: number
  evaluations: EvalWithRelations[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department'>[]
}

export default function DashboardView({
  isAdmin,
  templateCount,
  assignmentCount,
  evaluations,
  profiles,
}: DashboardViewProps) {
  // === Derived Stats ===
  const totalEvals = evaluations.length
  const avgScore = useMemo(() => {
    if (!totalEvals) return 0
    return evaluations.reduce((sum, ev) => sum + (ev.score || 0), 0) / totalEvals
  }, [evaluations, totalEvals])

  const overallPct = useMemo(() => {
    const withTarget = evaluations.filter(
      (ev) => ev.kpi_assignments?.target && ev.kpi_assignments.target > 0
    )
    if (!withTarget.length) return 0
    const totalPct = withTarget.reduce((sum, ev) => {
      const target = ev.kpi_assignments.target!
      const actual = ev.actual_value || 0
      return sum + (actual / target) * 100
    }, 0)
    return totalPct / withTarget.length
  }, [evaluations])

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

    evaluations.forEach((ev) => {
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
  }, [evaluations])

  // === Bar Chart Data ===
  const barChartData = useMemo(() => {
    return kpiSummary.map((d) => ({
      name: d.kpiName.length > 20 ? d.kpiName.slice(0, 20) + '…' : d.kpiName,
      fullName: d.kpiName,
      assignee: d.assignee,
      เป้าหมาย: d.target,
      'ค่าจริง (ล่าสุด)': d.latestActual,
      pct: d.latestPct,
      unit: d.unit,
      evalCount: d.evalCount,
    }))
  }, [kpiSummary])

  // === User Rankings ===
  const userRanking = useMemo(() => {
    const map = new Map<string, {
      name: string
      department: string
      totalScore: number
      evalCount: number
      avgScore: number
    }>()

    evaluations.forEach((ev) => {
      const user = ev.kpi_assignments?.profiles
      if (!user) return
      if (!map.has(user.id)) {
        map.set(user.id, {
          name: user.full_name || '-',
          department: user.department || '-',
          totalScore: 0,
          evalCount: 0,
          avgScore: 0,
        })
      }
      const entry = map.get(user.id)!
      entry.totalScore += ev.score || 0
      entry.evalCount += 1
      entry.avgScore = entry.totalScore / entry.evalCount
    })

    return Array.from(map.values()).sort((a, b) => b.avgScore - a.avgScore)
  }, [evaluations])

  // === Trend Data ===
  const trendData = useMemo(() => {
    return evaluations
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
  }, [evaluations])

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
          <span>เป้าหมาย: {fmt(data?.เป้าหมาย)} {data?.unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#22d3ee' }} />
          <span>ค่าจริง: {fmt(data?.['ค่าจริง (ล่าสุด)'])} {data?.unit}</span>
        </div>
        <div className="pt-1 border-t border-zinc-200 dark:border-zinc-600 flex items-center justify-between">
          <span className="font-bold" style={{ color: getPctColor(data?.pct || 0) }}>
            {getEmoji(data?.pct || 0)} {(data?.pct || 0).toFixed(1)}%
          </span>
          <span className="text-xs text-muted-foreground">ประเมิน {data?.evalCount} ครั้ง</span>
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
        <p>เป้า: {fmt(data?.target)} → จริง: {fmt(data?.actual)} {data?.unit}</p>
        <p className="font-bold" style={{ color: getPctColor(data?.pct || 0) }}>
          {getEmoji(data?.pct || 0)} {data?.pct}%
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">KPI Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? 'ภาพรวม KPI ทั้งบริษัท' : 'ภาพรวม KPI ของฉัน'}
        </p>
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
                <p className="text-xs text-muted-foreground mt-1">แม่แบบ KPI</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active KPIs</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{fmt(assignmentCount)}</p>
                <p className="text-xs text-muted-foreground mt-1">กำลังใช้งาน</p>
              </CardContent>
            </Card>
          </>
        )}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ผลประเมิน</CardTitle>
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{fmt(totalEvals)}</p>
            <p className="text-xs text-muted-foreground mt-1">การประเมินทั้งหมด</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">คะแนนเฉลี่ย</CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <p className={`text-3xl font-bold ${avgScore >= 70 ? 'text-green-600' : avgScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
              {avgScore.toFixed(1)}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {getEmoji(overallPct)} ทำได้ {overallPct.toFixed(1)}% ของเป้า
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
                เปรียบเทียบเป้าหมาย vs ค่าจริง (ล่าสุด)
              </CardTitle>
              <p className="text-xs text-muted-foreground">แต่ละ KPI แสดงเป้าหมายเทียบค่าจริงรอบล่าสุด</p>
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
                    <Bar dataKey="เป้าหมาย" fill="#6366f1" radius={[0, 6, 6, 0]} barSize={20} />
                    <Bar dataKey="ค่าจริง (ล่าสุด)" radius={[0, 6, 6, 0]} barSize={20}>
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
                  แนวโน้ม Achievement % ตามรอบประเมิน
                </CardTitle>
                <p className="text-xs text-muted-foreground">เปอร์เซ็นต์ที่ทำได้ในแต่ละรอบ</p>
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
                ผลสำเร็จตามเป้าหมาย
              </CardTitle>
              <p className="text-xs text-muted-foreground">ค่าล่าสุดของแต่ละ KPI</p>
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
                        {d.evalCount} ครั้ง
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
                          <span className="text-muted-foreground">เป้า</span>
                          <span className="font-medium">{fmt(d.target)} {d.unit}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">จริง (ล่าสุด)</span>
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
              อันดับพนักงาน (ตามคะแนนเฉลี่ย)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  <TableHead>พนักงาน</TableHead>
                  <TableHead>แผนก</TableHead>
                  <TableHead className="text-center">ประเมินแล้ว</TableHead>
                  <TableHead className="text-center">คะแนนเฉลี่ย</TableHead>
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
                    <TableCell className="text-center">{fmt(u.evalCount)}</TableCell>
                    <TableCell className="text-center">
                      <span className={`font-bold ${u.avgScore >= 70 ? 'text-green-600' : u.avgScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                        {u.avgScore.toFixed(1)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {evaluations.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground/40 mb-4" />
            <p className="text-muted-foreground">ยังไม่มีผลประเมิน KPI</p>
            <p className="text-xs text-muted-foreground mt-1">เริ่มต้นสร้าง Template → Assign → Evaluate</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
