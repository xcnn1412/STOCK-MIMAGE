'use client'

import { CalendarClock, Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { formatThaiDate } from '@/lib/thai-date'
import { periodLabel } from '../format'
import type { RunListRow } from '../actions'

interface Props {
  runs: RunListRow[]
}

export default function RunsView({ runs }: Props) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">งวดคำนวณ</h1>
          <p className="text-sm text-muted-foreground">
            งวดเงินเดือนที่เปิดไว้ พร้อมจำนวนสลิปแต่ละสถานะ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">(มาในขั้นถัดไป)</span>
          <Button disabled title="มาในขั้นถัดไป">
            <Plus className="size-4" />
            เปิดงวด
          </Button>
        </div>
      </div>

      {runs.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <CalendarClock className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">ยังไม่มีงวด</p>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{periodLabel(r.period_key)}</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
