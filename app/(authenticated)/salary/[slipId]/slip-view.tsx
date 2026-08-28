'use client'

import Link from 'next/link'
import { AlertTriangle, ArrowLeft, Landmark } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatThaiDate } from '@/lib/thai-date'
import { fmtMoney, periodLabel } from '../format'
import { SlipStatusBadge } from '../components/slip-status-badge'
import SlipLinesTable from '../components/slip-lines-table'
import type { SlipDetail } from '../actions'

interface Props {
  slip: SlipDetail
  isAdmin: boolean
}

const EMPLOYMENT_LABEL = { fulltime: 'ประจำ', freelance: 'ฟรีแลนซ์' } as const

export default function SlipView({ slip, isAdmin }: Props) {
  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const hasBank = !!(slip.bank_name || slip.bank_account_number || slip.account_holder_name)

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── หัวสลิป ────────────────────────────────────────────────────────── */}
      <div className="space-y-1">
        <Link
          href={isAdmin ? `/salary/runs/${slip.run_id}` : '/salary'}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          {isAdmin ? 'กลับไปหน้างวด' : 'สลิปของฉัน'}
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{name}</h1>
            <p className="text-sm text-muted-foreground">
              งวด{periodLabel(slip.period_key)} ·{' '}
              {formatThaiDate(slip.period_start)} – {formatThaiDate(slip.period_end)} ·{' '}
              {EMPLOYMENT_LABEL[slip.employment_type]}
            </p>
            <div className="mt-2">
              <SlipStatusBadge status={slip.status} />
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-semibold tabular-nums">{fmtMoney(slip.total)}</div>
            <div className="text-xs text-muted-foreground">ยอดสุทธิ (บาท)</div>
          </div>
        </div>
      </div>

      {/* ── คำเตือน — ข้อมูลต้นทางที่ยังไม่ครบ (แก้ที่โมดูลเช็คอินแล้วคำนวณใหม่) ── */}
      {slip.warnings.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
          <p className="flex items-center gap-2 text-sm font-medium text-amber-800 dark:text-amber-400">
            <AlertTriangle className="size-4" />
            คำเตือน {slip.warnings.length} ข้อ
          </p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-amber-700 dark:text-amber-500">
            {slip.warnings.map((w, i) => (
              <li key={`${w.code}-${w.date}-${w.checkin_id || i}`}>• {w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── รายการในสลิป ───────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <SlipLinesTable
            lines={slip.lines}
            adjustments={slip.adjustments}
            employmentType={slip.employment_type}
            baseSalary={slip.base_salary}
            total={slip.total}
          />
        </CardContent>
      </Card>

      {/* ── บัญชีรับเงิน (แสดงอย่างเดียว — แก้ที่หน้าโปรไฟล์) ─────────────────── */}
      {hasBank && (
        <Card>
          <CardContent className="space-y-1 p-4 text-sm">
            <p className="flex items-center gap-2 font-medium">
              <Landmark className="size-4 text-muted-foreground" />
              บัญชีรับเงิน
            </p>
            <p className="text-muted-foreground">
              {slip.bank_name || '-'} · {slip.bank_account_number || '-'}
              {slip.account_holder_name ? ` · ${slip.account_holder_name}` : ''}
            </p>
          </CardContent>
        </Card>
      )}

      <p className="text-xs text-muted-foreground">
        {slip.computed_at && <>คำนวณล่าสุด {formatThaiDate(slip.computed_at)}</>}
        {slip.finalized_at && <> · ปิดงวด {formatThaiDate(slip.finalized_at)}</>}
        {slip.paid_at && <> · จ่ายแล้ว {formatThaiDate(slip.paid_at)}</>}
      </p>
    </div>
  )
}
