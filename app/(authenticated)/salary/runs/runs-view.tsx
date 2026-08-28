'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarClock, ChevronRight, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatThaiDate } from '@/lib/thai-date'
import { periodLabel } from '../format'
import { periodRange } from '../compute'
import { createSalaryRun, type RunListRow } from '../actions'

interface Props {
  runs: RunListRow[]
  /** วันตัดรอบปัจจุบัน — ใช้พรีวิวช่วงวันที่ใน dialog เท่านั้น ค่าจริงคำนวณฝั่ง server ซ้ำ */
  cutoffDay: number
}

const PERIOD_KEY_RE = /^\d{4}-(0[1-9]|1[0-2])$/

/** 'YYYY-MM' ของเดือนปัจจุบันตามเวลาไทย (ไม่พึ่ง timezone ของเครื่องผู้ใช้) */
function currentPeriodKey(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 7)
}

export default function RunsView({ runs, cutoffDay }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [periodKey, setPeriodKey] = useState(currentPeriodKey)

  const validKey = PERIOD_KEY_RE.test(periodKey)
  const preview = validKey ? periodRange(periodKey, cutoffDay) : null

  function openDialog() {
    setPeriodKey(currentPeriodKey())
    setOpen(true)
  }

  function submit() {
    startTransition(async () => {
      const res = await createSalaryRun({ kind: 'monthly', month: periodKey })
      if (res.error || !res.id) {
        toast.error(res.error || 'เปิดงวดไม่สำเร็จ')
        return
      }
      toast.success(`เปิดงวด${periodLabel(periodKey)}แล้ว`)
      setOpen(false)
      router.push(`/salary/runs/${res.id}`)
    })
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
          เปิดงวด
        </Button>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarClock className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">ยังไม่มีงวด</p>
            <p className="text-xs text-muted-foreground">
              กด &ldquo;เปิดงวด&rdquo; เพื่อเริ่มคำนวณเงินเดือนของเดือนนี้
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
                        {periodLabel(r.period_key)}
                      </Link>
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
                        aria-label={`เปิดงวด${periodLabel(r.period_key)}`}
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

      {/* เปิดงวด — ช่วงวันที่คำนวณจากวันตัดรอบในหน้าตั้งค่า แล้วแช่ไว้ในงวด */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>เปิดงวด</DialogTitle>
            <DialogDescription>
              เลือกเดือนของงวด ระบบคำนวณช่วงวันที่จากวันตัดรอบในหน้าตั้งค่าให้เอง
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="salary-run-period">เดือนของงวด</Label>
            <Input
              id="salary-run-period"
              type="month"
              value={periodKey}
              onChange={e => setPeriodKey(e.target.value)}
            />
            {preview ? (
              <p className="text-xs text-muted-foreground">
                จะเปิดงวด{' '}
                <span className="font-medium text-foreground">{periodLabel(periodKey)}</span>{' '}
                ครอบคลุม {formatThaiDate(preview.start)} – {formatThaiDate(preview.end)}{' '}
                (วันตัดรอบ {cutoffDay})
              </p>
            ) : (
              <p className="text-xs text-red-600 dark:text-red-400">
                งวดต้องอยู่ในรูปแบบ YYYY-MM (เช่น 2026-08)
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
              ยกเลิก
            </Button>
            <Button onClick={submit} disabled={isPending || !validKey}>
              {isPending ? 'กำลังเปิดงวด…' : 'เปิดงวด'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
