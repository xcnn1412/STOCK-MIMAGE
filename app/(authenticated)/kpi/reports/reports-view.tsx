'use client'

import { useState, useMemo } from 'react'
import { BarChart3, UserCircle, Filter } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { KpiEvaluation, KpiAssignment, Profile } from '@/types/database.types'

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
                    <TableCell className="text-center">{u.totalKpi}</TableCell>
                    <TableCell className="text-center">{u.evalCount}</TableCell>
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
          <CardTitle className="text-base">
            รายละเอียดผลประเมิน ({filteredEvals.length} รายการ)
          </CardTitle>
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
                    <TableHead className="text-center">คะแนน</TableHead>
                    <TableHead>ช่วงเวลา</TableHead>
                    <TableHead>วันที่ประเมิน</TableHead>
                    <TableHead>หมายเหตุ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEvals.map((ev) => {
                    const assignment = ev.kpi_assignments
                    const kpiName = assignment?.kpi_templates?.name || assignment?.custom_name || '-'
                    const assignee = assignment?.profiles

                    return (
                      <TableRow key={ev.id}>
                        {isAdmin && (
                          <TableCell className="font-medium">{assignee?.full_name || '-'}</TableCell>
                        )}
                        <TableCell>{kpiName}</TableCell>
                        <TableCell className="text-center">{assignment?.target} {assignment?.target_unit}</TableCell>
                        <TableCell className="text-center">{ev.actual_value ?? '-'}</TableCell>
                        <TableCell className="text-center">
                          <span className={`font-bold ${(ev.score || 0) >= 70 ? 'text-green-600' : (ev.score || 0) >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {ev.score}
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
