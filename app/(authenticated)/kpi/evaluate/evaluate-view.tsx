'use client'

import { useState } from 'react'
import { ClipboardCheck, UserCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { submitEvaluation } from '../actions'
import { KPI_MODES, KPI_CYCLES } from '../types'
import type { KpiAssignment, KpiEvaluation } from '@/types/database.types'

type AssignmentWithEvals = KpiAssignment & {
  kpi_evaluations?: KpiEvaluation[]
}

export default function EvaluateView({ assignments }: { assignments: AssignmentWithEvals[] }) {
  const [evalTarget, setEvalTarget] = useState<AssignmentWithEvals | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const formData = new FormData(e.currentTarget)
    const result = await submitEvaluation(formData)

    if (result?.error) {
      setError(result.error)
    } else {
      setEvalTarget(null)
    }
    setLoading(false)
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6" />
          ประเมินผล KPI
        </h2>
        <p className="text-sm text-muted-foreground">ประเมินผล KPI ที่ได้มอบหมายให้พนักงาน (Admin Only)</p>
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            ไม่มี KPI ที่ต้องประเมินในขณะนี้
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {assignments.map((a) => {
            const name = a.kpi_templates?.name || a.custom_name || 'Custom KPI'
            const mode = a.kpi_templates?.mode || a.custom_mode || 'task'
            const modeInfo = KPI_MODES.find((m) => m.value === mode)
            const cycleInfo = KPI_CYCLES.find((c) => c.value === a.cycle)
            const assignee = a.profiles as { full_name?: string; department?: string | null } | null
            const evalCount = a.kpi_evaluations?.length || 0

            return (
              <Card key={a.id} className="hover:shadow-md transition-shadow">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base font-semibold">{name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <UserCircle className="h-4 w-4 text-muted-foreground" />
                    <span>{assignee?.full_name || '-'}</span>
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{modeInfo?.labelTh}</Badge>
                    <Badge variant="outline" className="text-xs">{cycleInfo?.labelTh}</Badge>
                  </div>

                  <div className="text-sm">
                    <span className="text-muted-foreground">เป้าหมาย: </span>
                    <span className="font-semibold">{a.target} {a.target_unit}</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    ประเมินแล้ว {evalCount} ครั้ง
                  </div>

                  <Button
                    size="sm"
                    onClick={() => setEvalTarget(a)}
                    className="w-full gap-2"
                  >
                    <Send className="h-3 w-3" />
                    ประเมินผล
                  </Button>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Evaluation Dialog */}
      <Dialog open={!!evalTarget} onOpenChange={(v) => !v && setEvalTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>ประเมินผล: {evalTarget?.kpi_templates?.name || evalTarget?.custom_name}</DialogTitle>
          </DialogHeader>

          {evalTarget && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="hidden" name="assignment_id" value={evalTarget.id} />

              <div className="bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 text-sm space-y-1">
                <p>พนักงาน: <strong>{(evalTarget.profiles as { full_name?: string } | null)?.full_name || '-'}</strong></p>
                <p>เป้าหมาย: <strong>{evalTarget.target} {evalTarget.target_unit}</strong></p>
              </div>

              <div>
                <label className="text-sm font-medium">ค่าจริง (Actual Value)</label>
                <Input name="actual_value" type="number" step="0.01" required placeholder="ผลลัพธ์จริงที่ทำได้" />
              </div>

              <div>
                <label className="text-sm font-medium">คะแนน (Score: 0-100)</label>
                <Input name="score" type="number" min={0} max={100} required placeholder="0-100" />
              </div>

              <div>
                <label className="text-sm font-medium">วันที่ประเมิน</label>
                <Input name="evaluation_date" type="date" required defaultValue={new Date().toISOString().split('T')[0]} />
              </div>

              <div>
                <label className="text-sm font-medium">ช่วงเวลา (Period Label)</label>
                <Input name="period_label" placeholder="เช่น Week 8, Feb 2026, Q1 2026" />
              </div>

              <div>
                <label className="text-sm font-medium">ความคิดเห็น</label>
                <Textarea name="comment" placeholder="หมายเหตุเพิ่มเติม..." rows={2} />
              </div>

              {error && <p className="text-sm text-red-500">{error}</p>}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setEvalTarget(null)}>ยกเลิก</Button>
                <Button type="submit" disabled={loading}>
                  {loading ? 'กำลังบันทึก...' : 'บันทึกผลประเมิน'}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
