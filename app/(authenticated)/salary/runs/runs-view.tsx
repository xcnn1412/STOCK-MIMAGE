'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertTriangle, CalendarClock, ChevronDown, ChevronRight, Plus, Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatThaiDate } from '@/lib/thai-date'
import { RUN_KIND_LABEL, periodLabel, todayBangkok } from '../format'
import {
  CATCH_UP_DAYS, lastFinishedWeek, periodRange, weekRangeFor, weekdayOf, type RunKind,
} from '../compute'
import {
  createSalaryRun,
  type CreateRunInput, type OverdueCheckinRow, type RunListRow, type RunSuggestion,
} from '../actions'

interface Props {
  runs: RunListRow[]
  /** วันตัดรอบปัจจุบัน — ใช้พรีวิวช่วงวันที่ใน dialog เท่านั้น ค่าจริงคำนวณฝั่ง server ซ้ำ */
  cutoffDay: number
  /** งวดที่ถึงเวลาเปิดแล้วแต่ยังไม่เปิด (สูงสุด 2 ใบ) */
  suggestions: RunSuggestion[]
  /** เช็คอินหน้างานค้างจ่ายที่เก่ากว่าหน้าต่างเก็บตก */
  overdue: OverdueCheckinRow[]
}

const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** 'YYYY-MM' ของเดือนปัจจุบันตามเวลาไทย (ไม่พึ่ง timezone ของเครื่องผู้ใช้) */
function currentPeriodKey(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

export default function RunsView({ runs, cutoffDay, suggestions, overdue }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  // ── ฟอร์ม "เปิดงวดเอง" ────────────────────────────────────────────────────
  const [kind, setKind] = useState<RunKind>('monthly')
  const [periodKey, setPeriodKey] = useState(currentPeriodKey)
  const [weekStart, setWeekStart] = useState(() => lastFinishedWeek(todayBangkok()).start)
  const [customStart, setCustomStart] = useState(() => lastFinishedWeek(todayBangkok()).start)
  const [customEnd, setCustomEnd] = useState(() => lastFinishedWeek(todayBangkok()).end)
  const [autoCompute, setAutoCompute] = useState(true)

  const [showOverdue, setShowOverdue] = useState(false)

  const monthValid = PERIOD_KEY_RE.test(periodKey)
  const weekValid = DATE_RE.test(weekStart)
  const weekIsMonday = weekValid && weekdayOf(weekStart) === 1
  const customValid = DATE_RE.test(customStart) && DATE_RE.test(customEnd) && customStart <= customEnd

  const formValid =
    kind === 'monthly' ? monthValid : kind === 'weekly' ? weekIsMonday : customValid

  /** ช่วงวันที่ที่จะเปิดจริง — พรีวิวใต้ฟอร์ม (server คำนวณซ้ำอยู่ดี) */
  const preview =
    kind === 'monthly'
      ? (monthValid ? periodRange(periodKey, cutoffDay) : null)
      : kind === 'weekly'
        ? (weekIsMonday ? weekRangeFor(weekStart) : null)
        : (customValid ? { start: customStart, end: customEnd } : null)

  function openDialog() {
    const week = lastFinishedWeek(todayBangkok())
    setKind('monthly')
    setPeriodKey(currentPeriodKey())
    setWeekStart(week.start)
    setCustomStart(week.start)
    setCustomEnd(week.end)
    setAutoCompute(true)
    setOpen(true)
  }

  /** เปิดงวด (+คำนวณให้ทันทีถ้าเลือกไว้) แล้วพาไปหน้างวด */
  function createRun(input: CreateRunInput, compute: boolean, label: string) {
    startTransition(async () => {
      const res = await createSalaryRun(input, { autoCompute: compute })
      if (res.error || !res.id) {
        toast.error(res.error || 'เปิดงวดไม่สำเร็จ')
        return
      }
      toast.success(
        compute
          ? `เปิดงวด${label}แล้ว · คำนวณให้ ${res.computed ?? 0} คน`
          : `เปิดงวด${label}แล้ว`
      )
      setOpen(false)
      router.push(`/salary/runs/${res.id}`)
    })
  }

  function submitForm() {
    if (kind === 'monthly') {
      createRun({ kind: 'monthly', month: periodKey }, autoCompute, periodLabel(periodKey))
      return
    }
    if (kind === 'weekly') {
      const range = weekRangeFor(weekStart)
      createRun(
        { kind: 'weekly', start: weekStart },
        autoCompute,
        periodLabel({ kind: 'weekly', period_start: range.start, period_end: range.end })
      )
      return
    }
    createRun(
      { kind: 'custom', start: customStart, end: customEnd },
      autoCompute,
      periodLabel({ kind: 'custom', period_start: customStart, period_end: customEnd })
    )
  }

  function acceptSuggestion(s: RunSuggestion) {
    createRun(
      s.kind === 'weekly'
        ? { kind: 'weekly', start: s.start }
        : { kind: 'monthly', month: s.month || '' },
      true,
      s.label
    )
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">งวดคำนวณ</h1>
          <p className="text-sm text-muted-foreground">
            งวดเงินเดือนที่เปิดไว้ พร้อมจำนวนสลิปแต่ละสถานะ
          </p>
        </div>
        <Button onClick={openDialog}>
          <Plus className="size-4" />
          เปิดงวดเอง
        </Button>
      </div>

      {/* ── ข้อเสนอเปิดงวด — คลิกเดียวได้งวด + สลิปร่างของทุกคนที่มีเช็คอินค้าง ── */}
      {suggestions.map(s => (
        <Card
          key={`${s.kind}-${s.start}`}
          className="border-emerald-200 bg-emerald-50/60 dark:border-emerald-900 dark:bg-emerald-950/20"
        >
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="min-w-0">
              <p className="font-medium">
                งวด{RUN_KIND_LABEL[s.kind]} {s.label} ยังไม่เปิด
              </p>
              <p className="text-sm text-muted-foreground">
                {formatThaiDate(s.start)} – {formatThaiDate(s.end)} · {s.users} คน ·{' '}
                {s.checkins} เช็คอินค้างจ่าย
              </p>
            </div>
            <Button onClick={() => acceptSuggestion(s)} disabled={isPending}>
              <Zap className="size-4" />
              เปิดและคำนวณ
            </Button>
          </CardContent>
        </Card>
      ))}

      {/* ── เช็คอินค้างจ่ายเกินหน้าต่างเก็บตก — งวดปกติดึงไม่ถึงแล้ว ── */}
      {overdue.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
          <button
            type="button"
            onClick={() => setShowOverdue(v => !v)}
            className="flex w-full items-center gap-2 text-left font-medium text-amber-800 dark:text-amber-400"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span className="flex-1">
              เช็คอินหน้างานค้างจ่ายเกิน {CATCH_UP_DAYS} วัน {overdue.length} รายการ
            </span>
            {showOverdue ? (
              <ChevronDown className="size-4 shrink-0" />
            ) : (
              <ChevronRight className="size-4 shrink-0" />
            )}
          </button>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
            เปิดงวดกำหนดเองย้อนหลัง หรือใช้รายการปรับมือในสลิปงวดถัดไป
          </p>
          {showOverdue && (
            <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto text-xs text-amber-700 dark:text-amber-500">
              {overdue.map(c => (
                <li key={c.id}>
                  {c.full_name || 'ไม่ทราบชื่อ'} · {formatThaiDate(c.date)}
                  {c.event_name ? ` · ${c.event_name}` : ''}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarClock className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">ยังไม่มีงวด</p>
            <p className="text-xs text-muted-foreground">
              กด &ldquo;เปิดงวดเอง&rdquo; เพื่อเริ่มคำนวณ หรือใช้แบนเนอร์ข้อเสนอด้านบน
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>งวด</TableHead>
                  <TableHead>ชนิด</TableHead>
                  <TableHead>ช่วงวันที่</TableHead>
                  <TableHead className="text-right">สลิปทั้งหมด</TableHead>
                  <TableHead>สถานะสลิป</TableHead>
                  <TableHead>หมายเหตุ</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <Link href={`/salary/runs/${r.id}`} className="hover:underline">
                        {periodLabel(r)}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{RUN_KIND_LABEL[r.kind]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatThaiDate(r.period_start)} – {formatThaiDate(r.period_end)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{r.slips}</TableCell>
                    <TableCell>
                      {r.slips === 0 ? (
                        <span className="text-sm text-muted-foreground">ยังไม่มีสลิป</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {r.draft > 0 && <Badge variant="outline">ร่าง {r.draft}</Badge>}
                          {r.finalized > 0 && (
                            <Badge
                              variant="outline"
                              className="border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500"
                            >
                              ปิดงวดแล้ว {r.finalized}
                            </Badge>
                          )}
                          {r.paid > 0 && (
                            <Badge
                              variant="outline"
                              className="border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400"
                            >
                              จ่ายแล้ว {r.paid}
                            </Badge>
                          )}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{r.note || '-'}</TableCell>
                    <TableCell>
                      <Link
                        href={`/salary/runs/${r.id}`}
                        aria-label={`เปิดงวด${periodLabel(r)}`}
                        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                      >
                        <ChevronRight className="size-4" />
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* เปิดงวดเอง — เลือกชนิดงวดแล้วกรอกช่วงตามชนิดนั้น */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เปิดงวดเอง</DialogTitle>
            <DialogDescription>
              เลือกชนิดงวด — งวดรายเดือนคำนวณช่วงวันที่จากวันตัดรอบในหน้าตั้งค่าให้เอง
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="salary-run-kind">ชนิดงวด</Label>
              <Select value={kind} onValueChange={v => setKind(v as RunKind)}>
                <SelectTrigger id="salary-run-kind">
                  <SelectValue placeholder="ชนิดงวด" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">รายเดือน</SelectItem>
                  <SelectItem value="weekly">รายสัปดาห์</SelectItem>
                  <SelectItem value="custom">กำหนดเอง</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {kind === 'monthly' && (
              <div className="space-y-2">
                <Label htmlFor="salary-run-period">เดือนของงวด</Label>
                <Input
                  id="salary-run-period"
                  type="month"
                  value={periodKey}
                  onChange={e => setPeriodKey(e.target.value)}
                />
                {!monthValid && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    งวดต้องอยู่ในรูปแบบ YYYY-MM (เช่น 2026-08)
                  </p>
                )}
              </div>
            )}

            {kind === 'weekly' && (
              <div className="space-y-2">
                <Label htmlFor="salary-run-week">วันจันทร์ที่เริ่มงวด</Label>
                <Input
                  id="salary-run-week"
                  type="date"
                  value={weekStart}
                  onChange={e => setWeekStart(e.target.value)}
                />
                {!weekIsMonday && (
                  <p className="text-xs text-red-600 dark:text-red-400">
                    งวดรายสัปดาห์ต้องเริ่มวันจันทร์ (ระบบเติมวันอาทิตย์ให้เอง)
                  </p>
                )}
              </div>
            )}

            {kind === 'custom' && (
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="salary-run-start">วันเริ่มงวด</Label>
                  <Input
                    id="salary-run-start"
                    type="date"
                    value={customStart}
                    onChange={e => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="salary-run-end">วันสิ้นสุดงวด</Label>
                  <Input
                    id="salary-run-end"
                    type="date"
                    value={customEnd}
                    onChange={e => setCustomEnd(e.target.value)}
                  />
                </div>
                {!customValid && (
                  <p className="text-xs text-red-600 dark:text-red-400 sm:col-span-2">
                    กรอกวันเริ่ม–วันสิ้นสุดให้ครบ และวันเริ่มต้องไม่เกินวันสิ้นสุด
                  </p>
                )}
              </div>
            )}

            {preview && (
              <p className="text-xs text-muted-foreground">
                จะเปิดงวด{' '}
                <span className="font-medium text-foreground">
                  {periodLabel(
                    kind === 'monthly'
                      ? periodKey
                      : { kind, period_start: preview.start, period_end: preview.end }
                  )}
                </span>{' '}
                ครอบคลุม {formatThaiDate(preview.start)} – {formatThaiDate(preview.end)}
                {kind === 'monthly' ? ` (วันตัดรอบ ${cutoffDay})` : ''}
              </p>
            )}

            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="salary-run-auto"
                checked={autoCompute}
                onCheckedChange={v => setAutoCompute(v === true)}
              />
              <Label htmlFor="salary-run-auto" className="text-sm font-normal leading-snug">
                คำนวณทันทีให้ทุกคนที่มีเช็คอินค้างจ่าย
                {kind === 'monthly' ? ' (รวมประจำ/ฝึกงานทุกคน)' : ''}
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              ยกเลิก
            </Button>
            <Button onClick={submitForm} disabled={isPending || !formValid}>
              {isPending ? 'กำลังเปิดงวด…' : 'เปิดงวด'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
