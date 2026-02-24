'use client'

import { useState } from 'react'
import { Plus, Trash2, UserCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import AssignmentForm from './assignment-form'
import { createAssignment, deleteAssignment } from '../actions'
import { KPI_MODES, KPI_CYCLES, KPI_STATUSES } from '../types'
import type { KpiAssignment, KpiTemplate, Profile } from '@/types/database.types'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()

const cycleBadge: Record<string, string> = {
  weekly: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  monthly: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
  yearly: 'bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200',
}

const statusBadge: Record<string, string> = {
  active: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  paused: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  completed: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
}

interface AssignmentsViewProps {
  assignments: KpiAssignment[]
  templates: Pick<KpiTemplate, 'id' | 'name' | 'mode' | 'default_target' | 'target_unit'>[]
  profiles: Pick<Profile, 'id' | 'full_name' | 'department' | 'role'>[]
}

export default function AssignmentsView({ assignments, templates, profiles }: AssignmentsViewProps) {
  const [showForm, setShowForm] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  async function handleDelete() {
    if (!deleteId) return
    await deleteAssignment(deleteId)
    setDeleteId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Assignments</h2>
          <p className="text-sm text-muted-foreground">มอบหมาย KPI ให้พนักงาน — ใช้ Template หรือสร้าง Custom KPI</p>
        </div>
        <Button onClick={() => setShowForm(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          มอบหมาย KPI
        </Button>
      </div>

      {/* Assignment Cards */}
      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            ยังไม่มีการมอบหมาย — คลิก &quot;มอบหมาย KPI&quot; เพื่อเริ่มต้น
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => {
            const templateName = a.kpi_templates?.name || a.custom_name || 'Custom KPI'
            const mode = a.kpi_templates?.mode || a.custom_mode || 'task'
            const modeInfo = KPI_MODES.find((m) => m.value === mode)
            const cycleInfo = KPI_CYCLES.find((c) => c.value === a.cycle)
            const statusInfo = KPI_STATUSES.find((s) => s.value === a.status)
            const assignee = a.profiles as { id: string; full_name?: string; department?: string | null } | null

            return (
              <Card key={a.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base font-semibold leading-tight">{templateName}</CardTitle>
                    <Badge className={`text-xs shrink-0 ${statusBadge[a.status] || ''}`}>
                      {statusInfo?.labelTh || a.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* พนักงาน */}
                  <div className="flex items-center gap-2 text-sm">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    <span>{assignee?.full_name || '-'}</span>
                    {assignee?.department && (
                      <Badge variant="outline" className="text-xs">{assignee.department}</Badge>
                    )}
                  </div>

                  {/* Mode + Cycle */}
                  <div className="flex gap-2 flex-wrap">
                    <Badge className={`text-xs ${cycleBadge[a.cycle] || ''}`}>
                      {cycleInfo?.labelTh || a.cycle}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {modeInfo?.labelTh || mode}
                    </Badge>
                  </div>

                  {/* Target */}
                  <div className="text-sm">
                    <span className="text-muted-foreground">เป้าหมาย: </span>
                    <span className="font-semibold">{fmt(a.target)} {a.target_unit}</span>
                  </div>

                  {/* Period */}
                  <div className="text-xs text-muted-foreground">
                    {a.period_start} → {a.period_end}
                  </div>

                  {/* ถ้าเป็น Custom KPI */}
                  {!a.template_id && (
                    <Badge variant="outline" className="text-xs border-orange-300 text-orange-600">
                      Custom KPI
                    </Badge>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                    <Button size="sm" variant="outline" onClick={() => setDeleteId(a.id)} className="gap-1 text-red-600 hover:text-red-700">
                      <Trash2 className="h-3 w-3" />
                      ลบ
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
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
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>ยืนยันลบ Assignment</AlertDialogTitle>
            <AlertDialogDescription>
              Assignment นี้จะถูกลบถาวร รวมถึงผลประเมินที่เชื่อมอยู่
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ยกเลิก</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              ลบ Assignment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
