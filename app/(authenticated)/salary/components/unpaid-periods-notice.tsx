// ============================================================================
// กล่องเตือน "งานงวดก่อนที่ยังไม่ถูกจ่าย" — ใช้ที่หน้างวดคำนวณ หน้าสลิป และหน้าแรกของแอดมิน
// แสดงผลล้วน (ไม่มี state) — ข้อมูลมาจาก listUnpaidPreviousPeriods ฝั่ง server
// mode 'all' = ทุกคน (มีรายชื่อคนในแต่ละงวดแบบกดขยาย) · 'person' = คนเดียว (หน้าสลิป)
// ============================================================================

import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { formatThaiDate } from '@/lib/thai-date'
import type { UnpaidPeriodRow } from '../actions'

interface Props {
  rows: UnpaidPeriodRow[]
  mode: 'all' | 'person'
}

/** ลิงก์ของงวด — หน้าสลิปพาไปสลิปของคนนั้นถ้ามี ไม่งั้นพาไปงวด (หรือหน้างวดคำนวณถ้ายังไม่เปิด) */
function periodLink(row: UnpaidPeriodRow, mode: Props['mode']): { href: string; text: string } {
  const slipId = mode === 'person' ? row.people[0]?.slip_id : null
  if (slipId) return { href: `/salary/${slipId}`, text: 'เปิดสลิปงวดนั้น' }
  if (row.run_id) return { href: `/salary/runs/${row.run_id}`, text: 'ไปที่งวด' }
  return { href: '/salary/runs', text: 'เปิดงวดนี้' }
}

export default function UnpaidPeriodsNotice({ rows, mode }: Props) {
  if (rows.length === 0) return null

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
      <p className="flex items-start gap-2 font-medium text-amber-800 dark:text-amber-400">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        {mode === 'all'
          ? `งานงวดก่อนที่ยังไม่ถูกจ่าย ${rows.length} งวด`
          : 'คนนี้มีงานงวดก่อนที่ยังไม่ถูกจ่าย'}
      </p>
      <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
        สลิปแต่ละงวดนับเฉพาะงานในช่วงวันของงวดนั้น งานเหล่านี้จะถูกจ่ายเมื่อปิดงวดสลิปของงวดที่ระบุ
      </p>

      <ul className="mt-2 space-y-2">
        {rows.map(row => {
          const link = periodLink(row, mode)
          return (
            <li key={row.month} className="text-amber-800 dark:text-amber-300">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="font-medium">งวด{row.label}</span>
                <span className="text-xs text-amber-700 dark:text-amber-500">
                  {formatThaiDate(row.start)} – {formatThaiDate(row.end)}
                </span>
                <span className="text-xs">
                  {mode === 'all'
                    ? `${row.people.length} คน · ${row.checkins} เช็คอิน`
                    : `${row.checkins} เช็คอิน`}
                </span>
                <Link
                  href={link.href}
                  className="text-xs font-medium underline underline-offset-2 hover:text-amber-900 dark:hover:text-amber-200"
                >
                  {link.text}
                </Link>
              </div>
              {mode === 'all' && (
                <details className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                  <summary className="cursor-pointer select-none">รายชื่อ</summary>
                  <ul className="mt-1 space-y-0.5 pl-4">
                    {row.people.map(p => (
                      <li key={p.user_id} className="break-words">
                        {p.full_name || 'ไม่ทราบชื่อ'} · {p.checkins} เช็คอิน
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
