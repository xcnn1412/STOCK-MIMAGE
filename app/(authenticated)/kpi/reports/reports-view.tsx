'use client'

import { useState, useMemo } from 'react'
import { BarChart3, UserCircle, Filter, TrendingUp, Target } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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

interface ReportsViewProps {
  evaluations: EvalWithRelations[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department'>[]
  isAdmin: boolean
}

export default function ReportsView({ evaluations, profiles, isAdmin }: ReportsViewProps) {
  const [filterUser, setFilterUser] = useState<string>('all')
  const [filterDept, setFilterDept] = useState<string>('all')
  const [filterKpi, setFilterKpi] = useState<string>('all')

  // ดึง departments ที่มี
  const departments = useMemo(() => {
    const depts = new Set<string>()
    profiles.forEach((p) => p.department && depts.add(p.department))
    return Array.from(depts).sort()
  }, [profiles])

  // Filter evaluations
  const filteredEvals = useMemo(() => {
    return evaluations.filter((ev) => {
      const assignee = ev.kpi_assignments?.profiles
      if (filterUser !== 'all' && assignee?.id !== filterUser) return false
      if (filterDept !== 'all' && assignee?.department !== filterDept) return false
      return true
    })
  }, [evaluations, filterUser, filterDept])

  // สร้าง summary per user
  const userSummary = useMemo(() => {
    const map = new Map<string, {
      name: string
      department: string
      totalKpi: number
      avgScore: number
      totalScore: number
      evalCount: number
    }>()

    filteredEvals.forEach((ev) => {
      const assignee = ev.kpi_assignments?.profiles
      if (!assignee) return
      const id = assignee.id

      if (!map.has(id)) {
        map.set(id, {
          name: assignee.full_name || '-',
          department: assignee.department || '-',
          totalKpi: 0,
          avgScore: 0,
          totalScore: 0,
          evalCount: 0,
        })
      }

      const entry = map.get(id)!
      entry.totalScore += (ev.score || 0)
      entry.evalCount += 1
      entry.avgScore = entry.totalScore / entry.evalCount
    })

    // นับจำนวน KPI ต่อ user (unique assignment_id)
    const kpiPerUser = new Map<string, Set<string>>()
    filteredEvals.forEach((ev) => {
      const userId = ev.kpi_assignments?.profiles?.id
      if (!userId) return
      if (!kpiPerUser.has(userId)) kpiPerUser.set(userId, new Set())
      kpiPerUser.get(userId)!.add(ev.assignment_id)
    })
    kpiPerUser.forEach((kpis, userId) => {
      const entry = map.get(userId)
      if (entry) entry.totalKpi = kpis.size
    })

    return Array.from(map.values()).sort((a, b) => b.avgScore - a.avgScore)
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
      const assignment = ev.kpi_assignments
      const assignmentId = ev.assignment_id
      const kpiName = assignment?.kpi_templates?.name || assignment?.custom_name || '-'
      const assignee = assignment?.profiles?.full_name || ''
      const target = assignment?.target || 0
      const actual = ev.actual_value || 0
      const pct = target > 0 ? (actual / target) * 100 : 0

      if (!map.has(assignmentId)) {
        map.set(assignmentId, {
          kpiName,
          assignee,
          target,
          unit: assignment?.target_unit || '',
          latestActual: actual,
          latestPct: pct,
          evalCount: 0,
          evals: [],
        })
      }

      const entry = map.get(assignmentId)!
      entry.evalCount += 1
      entry.evals.push({
        date: ev.evaluation_date,
        period: ev.period_label || ev.evaluation_date,
        actual,
        pct,
      })
    })

    // Sort evals by date, set latest
    map.forEach((entry) => {
      entry.evals.sort((a, b) => a.date.localeCompare(b.date))
      const latest = entry.evals[entry.evals.length - 1]
      if (latest) {
        entry.latestActual = latest.actual
        entry.latestPct = latest.pct
      }
    })

    return Array.from(map.values())
  }, [filteredEvals])

  // Bar chart data (grouped by KPI)
  const barChartData = useMemo(() => {
    return kpiSummaryData.map((d) => ({
      name: d.kpiName.length > 25 ? d.kpiName.slice(0, 25) + '…' : d.kpiName,
      fullName: d.kpiName,
      assignee: d.assignee,
      เป้าหมาย: d.target,
      'ค่าจริง (ล่าสุด)': d.latestActual,
      pct: d.latestPct,
      unit: d.unit,
      evalCount: d.evalCount,
    }))
  }, [kpiSummaryData])

  // Trend line data (all evals sorted by date)
  const trendData = useMemo(() => {
    const points = filteredEvals
      .map((ev) => {
        const assignment = ev.kpi_assignments
        const target = assignment?.target || 0
        const actual = ev.actual_value || 0
        const pct = target > 0 ? Math.round((actual / target) * 1000) / 10 : 0
        return {
          date: ev.evaluation_date,
          period: ev.period_label || ev.evaluation_date,
          kpiName: assignment?.kpi_templates?.name || assignment?.custom_name || '-',
          pct,
          actual,
          target,
          unit: assignment?.target_unit || '',
        }
      })
      .sort((a, b) => a.date.localeCompare(b.date))
    return points
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
          <span>เป้าหมาย: {fmt(data?.เป้าหมาย)} {data?.unit}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#22d3ee' }} />
          <span>ค่าจริง (ล่าสุด): {fmt(data?.['ค่าจริง (ล่าสุด)'])} {data?.unit}</span>
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
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <BarChart3 className="h-6 w-6" />
          รายงาน KPI
        </h2>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? 'ดูผลประเมินทุกคน — Filter ตามพนักงาน/แผนก' : 'ผลประเมิน KPI ของฉัน'}
        </p>
      </div>

      {/* Filters — Admin only */}
      {isAdmin && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center gap-4 flex-wrap">
              <Filter className="h-4 w-4 text-muted-foreground" />

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">พนักงาน:</span>
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">แผนก:</span>
                <Select value={filterDept} onValueChange={setFilterDept}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">ทั้งหมด</SelectItem>
                    {departments.map((d) => (
                      <SelectItem key={d} value={d}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== CHARTS SECTION ===== */}
      {kpiSummaryData.length > 0 && (
        <>
          {/* 1) Bar Chart: Target vs Latest Actual — grouped by KPI */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                เปรียบเทียบเป้าหมาย vs ค่าจริง (ล่าสุด) — แยกตาม KPI
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
                      width={180}
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

          {/* 2) Trend Line Chart: Achievement % over time */}
          {trendData.length > 1 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  แนวโน้ม Achievement % ตามรอบประเมิน
                </CardTitle>
                <p className="text-xs text-muted-foreground">แสดงเปอร์เซ็นต์ที่ทำได้ในแต่ละรอบ</p>
              </CardHeader>
              <CardContent>
                <div className="w-full h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top: 5, right: 30, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                      <XAxis dataKey="period" fontSize={12} tick={{ fill: '#71717a' }} />
                      <YAxis
                        fontSize={12}
                        tickFormatter={(v: number) => `${v}%`}
                        domain={[0, 'auto']}
                      />
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

          {/* 3) Achievement Gauge Cards — per KPI (not per eval) */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Target className="h-4 w-4" />
                ผลสำเร็จตามเป้าหมาย — แยกตาม KPI
              </CardTitle>
              <p className="text-xs text-muted-foreground">แสดงค่าล่าสุดของแต่ละ KPI</p>
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
                      {/* Eval count badge */}
                      <Badge variant="secondary" className="absolute top-2 right-2 text-[10px]">
                        {d.evalCount} ครั้ง
                      </Badge>

                      <div className="w-24 h-24 relative">
                        <ResponsiveContainer width="100%" height="100%">
                          <RadialBarChart
                            cx="50%"
                            cy="50%"
                            innerRadius="70%"
                            outerRadius="100%"
                            data={radialData}
                            startAngle={90}
                            endAngle={-270}
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

      {/* Summary Table */}
      {userSummary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">สรุปผลประเมินรายบุคคล</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>พนักงาน</TableHead>
                  <TableHead>แผนก</TableHead>
                  <TableHead className="text-center">จำนวน KPI</TableHead>
                  <TableHead className="text-center">ประเมินแล้ว</TableHead>
                  <TableHead className="text-center">คะแนนเฉลี่ย</TableHead>
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
                    <TableCell className="text-center">{fmt(u.totalKpi)}</TableCell>
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

      {/* Detail Table */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <CardTitle className="text-base">
              รายละเอียดผลประเมิน ({fmt(filterKpi === 'all' ? filteredEvals.length : filteredEvals.filter(ev => ev.assignment_id === filterKpi).length)} รายการ)
            </CardTitle>
            <div className="flex items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">KPI:</span>
              <Select value={filterKpi} onValueChange={setFilterKpi}>
                <SelectTrigger className="w-56 h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">ทั้งหมด</SelectItem>
                  {(() => {
                    const seen = new Map<string, string>()
                    filteredEvals.forEach((ev) => {
                      if (!seen.has(ev.assignment_id)) {
                        const a = ev.kpi_assignments
                        const name = a?.kpi_templates?.name || a?.custom_name || '-'
                        const who = a?.profiles?.full_name || ''
                        seen.set(ev.assignment_id, `${name}${who ? ` — ${who}` : ''}`)
                      }
                    })
                    return Array.from(seen.entries()).map(([id, label]) => (
                      <SelectItem key={id} value={id}>{label}</SelectItem>
                    ))
                  })()}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredEvals.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">ไม่มีผลประเมิน</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {isAdmin && <TableHead>พนักงาน</TableHead>}
                    <TableHead>KPI</TableHead>
                    <TableHead className="text-center">เป้าหมาย</TableHead>
                    <TableHead className="text-center">ค่าจริง</TableHead>
                    <TableHead className="text-center">ผลต่าง</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-center">คะแนน</TableHead>
                    <TableHead>ช่วงเวลา</TableHead>
                    <TableHead>วันที่ประเมิน</TableHead>
                    <TableHead>หมายเหตุ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvals.filter(ev => filterKpi === 'all' || ev.assignment_id === filterKpi).map((ev) => {
                    const assignment = ev.kpi_assignments
                    const kpiName = assignment?.kpi_templates?.name || assignment?.custom_name || '-'
                    const assignee = assignment?.profiles
                    const target = assignment?.target || 0
                    const actual = ev.actual_value || 0
                    const diff = target ? actual - target : null
                    const pct = target ? (actual / target) * 100 : null
                    const diffColor = diff === null ? '' : diff >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                    const pctColor = pct === null ? '' : pct >= 100 ? 'text-green-600 dark:text-green-400' : pct >= 70 ? 'text-yellow-600 dark:text-yellow-400' : 'text-red-600 dark:text-red-400'

                    return (
                      <TableRow key={ev.id}>
                        {isAdmin && (
                          <TableCell className="font-medium">{assignee?.full_name || '-'}</TableCell>
                        )}
                        <TableCell>{kpiName}</TableCell>
                        <TableCell className="text-center">{fmt(assignment?.target)} {assignment?.target_unit}</TableCell>
                        <TableCell className="text-center">{ev.actual_value != null ? fmt(ev.actual_value) : '-'}</TableCell>
                        <TableCell className="text-center">
                          {diff !== null ? (
                            <span className={`font-semibold ${diffColor}`}>
                              {diff >= 0 ? '+' : ''}{fmt(diff)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {pct !== null ? (
                            <span className={`font-semibold ${pctColor}`}>
                              {getEmoji(pct)} {pct.toFixed(1)}%
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${(ev.score || 0) >= 70 ? 'text-green-600' : (ev.score || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {fmt(ev.score)}
                          </span>
                        </TableCell>
                        <TableCell>{ev.period_label || '-'}</TableCell>
                        <TableCell className="text-sm">{ev.evaluation_date}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-32 truncate">{ev.comment || '-'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
