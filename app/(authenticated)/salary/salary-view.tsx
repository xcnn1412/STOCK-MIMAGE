'use client'

import Link from 'next/link'
import { CalendarClock, ChevronRight, FileDown, Settings, Wallet } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatThaiDate } from '@/lib/thai-date'
import { RUN_KIND_LABEL, fmtMoney, slipTitle } from './format'
import type { MySlipRow } from './actions'

interface Props {
  slips: MySlipRow[]
  isAdmin: boolean
}

export default function SalaryView({ slips, isAdmin }: Props) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">สลิปของฉัน</h1>
        <p className="text-sm text-muted-foreground">
          สลิปเงินเดือน/ค่าจ้างที่ปิดงวดแล้ว เรียงจากงวดล่าสุด
        </p>
      </div>

      {/* ทางลัดของ admin — หน้าเหล่านี้ซ่อนจากพนักงานทั่วไป */}
      {isAdmin && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/salary/runs"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <CalendarClock className="size-4" />
            งวดคำนวณ
          </Link>
          <Link
            href="/salary/settings"
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          >
            <Settings className="size-4" />
            ตั้งค่า
          </Link>
        </div>
      )}

      {slips.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <Wallet className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">ยังไม่มีสลิป</p>
            <p className="text-xs text-muted-foreground">
              สลิปจะขึ้นที่นี่เมื่อ admin ปิดงวดของคุณแล้ว
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {/* ลิงก์ PDF อยู่นอก <Link> — <a> ซ้อนใน <a> เป็น HTML ที่ไม่ถูกต้อง */}
              {slips.map(s => (
                <li key={s.id} className="flex items-stretch">
                  <Link
                    href={`/salary/${s.id}`}
                    className="flex flex-1 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{slipTitle(s)}</span>
                        <Badge variant="outline">{RUN_KIND_LABEL[s.kind]}</Badge>
                        <Badge
                          variant="outline"
                          className={
                            s.status === 'paid'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-500'
                          }
                        >
                          {s.status === 'paid' ? 'จ่ายแล้ว' : 'รอจ่าย'}
                        </Badge>
                      </div>
                      <p className="truncate text-xs text-muted-foreground">
                        {formatThaiDate(s.period_start)} – {formatThaiDate(s.period_end)}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold tabular-nums">{fmtMoney(s.total)}</div>
                      <div className="text-xs text-muted-foreground">ยอดสุทธิ (บาท)</div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                  <a
                    href={`/api/pdf/salary/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="ดาวน์โหลด PDF"
                    aria-label={`ดาวน์โหลด PDF ${slipTitle(s)}`}
                    className="flex items-center border-l px-4 text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                  >
                    <FileDown className="size-4" />
                  </a>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
