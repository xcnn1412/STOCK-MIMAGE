// การ์ด "ของยังไม่ครบ — ใกล้วันงาน" ของหน้าแรก — แถวมาจาก getPurchaseAlerts() (คัดตามความด่วน + คนที่เกี่ยวข้องแล้ว)
// component ธรรมดา ไม่มี state/hook: วาดได้ทั้งใน server component และ client
// ไม่มีแถว = ไม่ render อะไร · หน้าแรกห่อด้วยกรอบการ์ดขาวชุดเดียวกับการ์ดเงินเดือน

import Link from 'next/link'
import { ChevronRight, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import { URGENCY_LABELS, urgencyTone, type PurchaseAlertRow } from '../purchasing-logic'

/** แสดงสูงสุดกี่แถว — เกินนี้ไปที่ลิงก์ "ดูทั้งหมด" */
const MAX_ROWS = 6

export interface PurchaseAlertCardProps {
    rows: PurchaseAlertRow[]
}

export default function PurchaseAlertCard({ rows }: PurchaseAlertCardProps) {
    if (rows.length === 0) return null
    const shown = rows.slice(0, MAX_ROWS)
    const red = rows.some(r => r.severity !== 'soon')

    return (
        <section aria-labelledby="purchase-alert-heading" className="space-y-2">
            <h2
                id="purchase-alert-heading"
                className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200"
            >
                <ShoppingCart className={cn('h-4 w-4', red ? 'text-red-500' : 'text-amber-500')} aria-hidden />
                ของยังไม่ครบ — ใกล้วันงาน ({rows.length})
            </h2>
            <ul className="grid grid-cols-1 gap-1.5">
                {shown.map(row => {
                    const tone = urgencyTone(row.severity)
                    return (
                        <li key={row.listId}>
                            <Link
                                href={`/jobs/purchasing?list=${row.listId}`}
                                className="flex items-start gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 transition-colors hover:border-zinc-300 hover:bg-white dark:border-zinc-800 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900"
                            >
                                {/* จุดสีบอกความแรง — ข้อความนับถอยหลังบอกซ้ำเสมอ (สีเป็นส่วนเสริม) */}
                                <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', tone.dot)} aria-hidden />
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium text-zinc-900 wrap-anywhere dark:text-zinc-100">
                                        <span className="sr-only">{URGENCY_LABELS[row.severity]}: </span>
                                        {row.title}
                                        {row.subtitle && (
                                            <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">{row.subtitle}</span>
                                        )}
                                    </span>
                                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums">
                                        <span className="text-zinc-500 dark:text-zinc-400">{formatThaiDate(row.date)}</span>
                                        <span className={tone.text}>{row.countdown}</span>
                                        <span className="text-zinc-600 dark:text-zinc-400">ค้าง {row.outstanding} รายการ</span>
                                    </span>
                                </span>
                                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" aria-hidden />
                            </Link>
                        </li>
                    )
                })}
            </ul>
            {rows.length > MAX_ROWS && (
                <Link
                    href="/jobs/purchasing"
                    className={cn(
                        'inline-flex min-h-10 items-center text-xs font-medium hover:underline md:min-h-0',
                        red ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
                    )}
                >
                    ดูทั้งหมด ({rows.length} เช็กลิสต์)
                </Link>
            )}
        </section>
    )
}
