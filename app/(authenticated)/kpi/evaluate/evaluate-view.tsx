'use client'

import { useState, useCallback } from 'react'
import { ClipboardCheck, UserCircle, Send, Eye, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { submitEvaluation, deleteEvaluation } from '../actions'
import { KPI_MODES, KPI_CYCLES } from '../types'
import type { KpiAssignment, KpiEvaluation } from '@/types/database.types'

const fmt = (n: number | null | undefined) => (n ?? 0).toLocaleString()

type AssignmentWithEvals = KpiAssignment & {
  kpi_evaluations?: KpiEvaluation[]
}

const getEmoji = (pct: number) =>
  pct >= 120 ? '🔥🎉' : pct >= 100 ? '😍' : pct >= 90 ? '😊' : pct >= 70 ? '🙂' : pct >= 50 ? '😰' : pct >= 30 ? '😱' : '😟'

export default function EvaluateView({ assignments }: { assignments: AssignmentWithEvals[] }) {
  const [evalTarget, setEvalTarget] = useState<AssignmentWithEvals | null>(null)
  const [historyTarget, setHistoryTarget] = useState<AssignmentWithEvals | null>(null)
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [actualValue, setActualValue] = useState('')
  const [actualDisplay, setActualDisplay] = useState('')

  const handleActualFocus = useCallback(() => {
    // On focus: show raw number for editing
    setActualDisplay(actualValue)
  }, [actualValue])

  const handleActualBlur = useCallback(() => {
    // On blur: format with commas
    const num = parseFloat(actualValue)
    if (!isNaN(num)) {
      setActualDisplay(num.toLocaleString())
    }
  }, [actualValue])

  const handleActualChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    // Strip commas, allow digits, dots, minus
    const raw = e.target.value.replace(/,/g, '')
    setActualValue(raw)
    setActualDisplay(e.target.value)
  }, [])

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
              <Card key={a.id} className="hover:shadow-md transition-shadow relative">
                {/* Eye icon — view history */}
                <button
                  type="button"
                  onClick={() => setHistoryTarget(a)}
                  className="absolute top-3 right-3 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title="ดูประวัติการประเมิน"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <CardHeader className="pb-2 pr-10">
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
                    <span className="font-semibold">{fmt(a.target)} {a.target_unit}</span>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    ประเมินแล้ว {fmt(evalCount)} ครั้ง
                  </div>

                  <Button
                    size="sm"
                    onClick={() => {
                      setActualValue('')
                      setActualDisplay('')
                      setEvalTarget(a)
                    }}
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

      {/* History Dialog */}
      <Dialog open={!!historyTarget} onOpenChange={(v) => !v && setHistoryTarget(null)}>
        <DialogContent className="sm:max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              ประวัติการประเมิน: {historyTarget?.kpi_templates?.name || historyTarget?.custom_name}
            </DialogTitle>
          </DialogHeader>

          {historyTarget && (() => {
            const evals = [...(historyTarget.kpi_evaluations || [])].sort(
              (a, b) => new Date(b.evaluation_date || b.created_at || '').getTime() - new Date(a.evaluation_date || a.created_at || '').getTime()
            )
            const target = historyTarget.target || 0

            if (evals.length === 0) {
              return (
                <p className="text-center text-muted-foreground py-8">ยังไม่มีผลประเมิน</p>
              )
            }

            return (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>วันที่</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead className="text-right">ค่าจริง</TableHead>
                    <TableHead className="text-right">เป้า</TableHead>
                    <TableHead className="text-center">ผลต่าง</TableHead>
                    <TableHead className="text-center">%</TableHead>
                    <TableHead className="text-center">Score</TableHead>
                    <TableHead>Comment</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {evals.map((ev) => {
                    const actual = ev.actual_value || 0
                    const diff = target > 0 ? actual - target : null
                    const pct = target > 0 ? (actual / target) * 100 : null
                    const diffColor = diff !== null ? (diff >= 0 ? 'text-green-600' : 'text-red-600') : ''
                    const pctColor = pct !== null ? (pct >= 100 ? 'text-green-600' : pct >= 70 ? 'text-yellow-600' : 'text-red-600') : ''

                    return (
                      <TableRow key={ev.id}>
                        <TableCell className="text-xs whitespace-nowrap">{ev.evaluation_date || '-'}</TableCell>
                        <TableCell className="text-xs">
                          {ev.period_label ? <Badge variant="outline" className="text-[10px]">{ev.period_label}</Badge> : '-'}
                        </TableCell>
                        <TableCell className="text-right font-medium text-sm">{fmt(actual)}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{fmt(target)}</TableCell>
                        <TableCell className="text-center">
                          {diff !== null ? (
                            <span className={`text-xs font-semibold ${diffColor}`}>
                              {diff >= 0 ? '+' : ''}{fmt(diff)}
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center">
                          {pct !== null ? (
                            <span className={`text-xs font-semibold ${pctColor}`}>
                              {pct.toFixed(1)}%
                            </span>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-center font-bold text-sm">{fmt(ev.score)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={ev.comment || ''}>
                          {ev.comment || '-'}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            disabled={deleting === ev.id}
                            onClick={async () => {
                              if (!confirm('ต้องการลบผลประเมินนี้หรือไม่?')) return
                              setDeleting(ev.id)
                              await deleteEvaluation(ev.id)
                              setDeleting(null)
                              setHistoryTarget(null)
                            }}
                            className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-40"
                            title="ลบผลประเมิน"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
                {(() => {
                  const totalActual = evals.reduce((s, ev) => s + (ev.actual_value || 0), 0)
                  const avgActual = totalActual / evals.length
                  const avgDiff = target > 0 ? avgActual - target : null
                  const avgPct = target > 0 ? (avgActual / target) * 100 : null
                  const totalScore = evals.reduce((s, ev) => s + (ev.score || 0), 0)
                  const avgScore = totalScore / evals.length
                  const avgDiffColor = avgDiff !== null ? (avgDiff >= 0 ? 'text-green-600' : 'text-red-600') : ''
                  const avgPctColor = avgPct !== null ? (avgPct >= 100 ? 'text-green-600' : avgPct >= 70 ? 'text-yellow-600' : 'text-red-600') : ''

                  return (
                    <tfoot>
                      <tr className="border-t-2 border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-900">
                        <td colSpan={2} className="px-4 py-4 align-middle">
                          <div className="text-xs font-bold">สรุป</div>
                          <div className="text-[10px] text-muted-foreground">{evals.length} ครั้ง</div>
                        </td>
                        <td className="px-4 py-4 text-right align-middle">
                          <div className="text-[10px] text-muted-foreground">รวม</div>
                          <div className="font-bold text-sm">{fmt(totalActual)}</div>
                        </td>
                        <td className="px-4 py-4 text-right align-middle">
                          <div className="text-[10px] text-muted-foreground">เป้า</div>
                          <div className="text-sm text-muted-foreground">{fmt(target)}</div>
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="text-[10px] text-muted-foreground">เฉลี่ย</div>
                          {avgDiff !== null ? (
                            <div className={`text-sm font-bold ${avgDiffColor}`}>
                              {avgDiff >= 0 ? '+' : ''}{fmt(Math.round(avgDiff))}
                            </div>
                          ) : <div>-</div>}
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="text-[10px] text-muted-foreground">เฉลี่ย</div>
                          {avgPct !== null ? (
                            <div className={`text-sm font-bold ${avgPctColor}`}>
                              {avgPct.toFixed(1)}%
                            </div>
                          ) : <div>-</div>}
                        </td>
                        <td className="px-4 py-4 text-center align-middle">
                          <div className="text-[10px] text-muted-foreground">เฉลี่ย</div>
                          <div className={`font-bold text-sm ${avgScore >= 70 ? 'text-green-600' : avgScore >= 40 ? 'text-yellow-600' : 'text-red-600'}`}>
                            {avgScore.toFixed(1)}
                          </div>
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tfoot>
                  )
                })()}
              </Table>
            )
          })()}
        </DialogContent>
      </Dialog>

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
                <p>เป้าหมาย: <strong>{fmt(evalTarget.target)} {evalTarget.target_unit}</strong></p>
              </div>

              <div>
                <label className="text-sm font-medium">ค่าจริง (Actual Value)</label>
                <input type="hidden" name="actual_value" value={actualValue} />
                <Input
                  type="text"
                  inputMode="decimal"
                  value={actualDisplay}
                  onChange={handleActualChange}
                  onFocus={handleActualFocus}
                  onBlur={handleActualBlur}
                  required
                  placeholder="ผลลัพธ์จริงที่ทำได้"
                />
              </div>

              {/* Calculated Difference */}
              {actualValue && evalTarget.target != null && (() => {
                const actual = parseFloat(actualValue)
                const target = evalTarget.target
                if (isNaN(actual) || target === 0) return null
                const diff = actual - target
                const pct = (actual / target) * 100
                const isPositive = diff >= 0
                const colorClass = pct >= 100
                  ? 'text-green-600 dark:text-green-400'
                  : pct >= 70
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                const emoji = pct >= 120 ? '🔥🎉' : pct >= 100 ? '😍' : pct >= 90 ? '😊' : pct >= 70 ? '🙂' : pct >= 50 ? '😰' : pct >= 30 ? '😱' : '💀'

                return (
                  <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 p-3 space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">ผลต่าง (Actual − Target)</span>
                      <span className={`font-semibold ${colorClass}`}>
                        {isPositive ? '+' : ''}{fmt(diff)} {evalTarget.target_unit}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">ทำได้คิดเป็น</span>
                      <span className={`font-bold text-base ${colorClass}`}>
                        <span className="text-lg mr-1">{emoji}</span>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-700 rounded-full h-2 mt-1">
                      <div
                        className={`h-2 rounded-full transition-all ${pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-yellow-500' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })()}

              <div>
                <label className="text-sm font-medium">คะแนน (Score: 0-100)</label>
                <Input
                  name="score"
                  type="text"
                  inputMode="numeric"
                  required
                  placeholder="0-100"
                  onKeyDown={(e) => {
                    if (['e', 'E', '+', '-', '.', ','].includes(e.key)) e.preventDefault()
                  }}
                  onChange={(e) => {
                    const raw = e.target.value.replace(/\D/g, '')
                    const num = parseInt(raw, 10)
                    e.target.value = isNaN(num) ? '' : String(Math.min(num, 100))
                  }}
                />
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
