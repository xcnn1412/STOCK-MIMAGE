'use client'

import { FileText, Users, ClipboardCheck, Target, UserCircle, TrendingUp } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { KPI_MODES, KPI_CYCLES } from '../types'
import type { KpiAssignment, KpiEvaluation } from '@/types/database.types'

interface DashboardViewProps {
  isAdmin: boolean
  templateCount: number
  assignmentCount: number
  myAssignments: KpiAssignment[]
  recentEvaluations: KpiEvaluation[]
  pendingEvalCount: number
}

export default function DashboardView({
  isAdmin,
  templateCount,
  assignmentCount,
  myAssignments,
  recentEvaluations,
  pendingEvalCount,
}: DashboardViewProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">KPI Dashboard</h2>
        <p className="text-sm text-muted-foreground">
          {isAdmin ? 'ภาพรวม KPI ทั้งระบบ' : 'KPI ของฉัน'}
        </p>
      </div>

      {/* Stat Cards — Admin เห็นทั้งหมด Staff เห็นเฉพาะ KPI ตัวเอง */}
      {isAdmin && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Templates</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{templateCount}</p>
              <p className="text-xs text-muted-foreground mt-1">แม่แบบ KPI ทั้งหมด</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Active Assignments</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{assignmentCount}</p>
              <p className="text-xs text-muted-foreground mt-1">KPI ที่กำลังใช้งาน</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">รอประเมิน</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{pendingEvalCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Assignment ที่ต้องประเมิน</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* My KPIs / All KPIs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            {isAdmin ? 'KPI ทั้งหมด (ล่าสุด)' : 'KPI ของฉัน'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myAssignments.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">ไม่มี KPI ที่กำลังใช้งาน</p>
          ) : (
            <div className="space-y-3">
              {myAssignments.map((a) => {
                const name = a.kpi_templates?.name || a.custom_name || 'Custom KPI'
                const mode = a.kpi_templates?.mode || a.custom_mode || 'task'
                const modeInfo = KPI_MODES.find((m) => m.value === mode)
                const cycleInfo = KPI_CYCLES.find((c) => c.value === a.cycle)
                const assignee = a.profiles as { full_name?: string } | null
                const evals = (a as KpiAssignment & { kpi_evaluations?: KpiEvaluation[] }).kpi_evaluations || []
                const latestEval = evals.sort((x, y) =>
                  new Date(y.created_at || '').getTime() - new Date(x.created_at || '').getTime()
                )[0]

                return (
                  <div key={a.id} className="flex items-center justify-between p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{name}</span>
                        <Badge variant="outline" className="text-xs">{modeInfo?.labelTh}</Badge>
                        <Badge variant="outline" className="text-xs">{cycleInfo?.labelTh}</Badge>
                      </div>
                      {isAdmin && assignee && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <UserCircle className="h-3 w-3" />
                          {assignee.full_name}
                        </div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-sm">{a.target} {a.target_unit}</div>
                      {latestEval ? (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <TrendingUp className="h-3 w-3" />
                          ล่าสุด: {latestEval.score}/100
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">ยังไม่มีผลประเมิน</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Evaluations */}
      {isAdmin && recentEvaluations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5" />
              ผลประเมินล่าสุด
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {recentEvaluations.map((ev) => {
                const assignment = ev.kpi_assignments as KpiAssignment | null
                const kpiName = assignment?.kpi_templates?.name || assignment?.custom_name || '-'
                const assigneeProfile = assignment?.profiles as { full_name?: string } | null

                return (
                  <div key={ev.id} className="flex items-center justify-between p-2 rounded bg-zinc-50 dark:bg-zinc-900 text-sm">
                    <div>
                      <span className="font-medium">{kpiName}</span>
                      {assigneeProfile && (
                        <span className="text-muted-foreground ml-2">— {assigneeProfile.full_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className="text-xs">{ev.period_label}</Badge>
                      <span className="font-bold">{ev.score}/100</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
