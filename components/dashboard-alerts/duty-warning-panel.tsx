'use client'

// แผงที่ 2 ของ dashboard-alerts — "หน้าที่ยังไม่ครบ ใกล้วันงาน"
// รับแถวที่คำนวณเสร็จแล้วจาก server (buildDutyWarnings) — ที่นี่ทำแค่วาด
// ใช้ได้ทั้ง /dashboard และ /jobs/tracking

import Link from 'next/link'
import { AlertTriangle, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseDate } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import type { DutyWarningRow, DutyWarningSeverity } from './duty-warnings'

export interface DutyWarningPanelProps {
    /** แถวคำเตือนที่ผู้ใช้คนนี้ควรเห็น — ว่าง = ไม่ render อะไรเลย */
    rows: DutyWarningRow[]
    className?: string
}

/** จำนวนแถวสูงสุดที่แสดง — เกินกว่านี้ตกไปที่ลิงก์ "ดูทั้งหมด" */
const MAX_ROWS = 6

/** สีตามความแรง: เลยวันงาน = แดงเข้ม+ตัวหนา · ≤3 วัน = แดง · 4–7 วัน = เหลือง */
const SEVERITY_TEXT: Record<DutyWarningSeverity, string> = {
    overdue: 'font-bold text-red-800 dark:text-red-300',
    urgent: 'font-medium text-red-600 dark:text-red-400',
    soon: 'font-medium text-amber-700 dark:text-amber-400',
}

const SEVERITY_BORDER: Record<DutyWarningSeverity, string> = {
    overdue: 'border-red-300 dark:border-red-500/50',
    urgent: 'border-red-200 dark:border-red-500/30',
    soon: 'border-amber-200 dark:border-amber-500/30',
}

/** วันที่แบบไทยจาก YYYY-MM-DD — รูปแบบเดียวกับแผงงานในมือ */
const formatDate = (d: string) =>
    parseDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

/** ความแรงสูงสุดของทั้งแผง — คุมสีกรอบ/หัวข้อของการ์ด */
function worstSeverity(rows: DutyWarningRow[]): DutyWarningSeverity {
    if (rows.some(r => r.severity === 'overdue')) return 'overdue'
    if (rows.some(r => r.severity === 'urgent')) return 'urgent'
    return 'soon'
}

export default function DutyWarningPanel({ rows, className }: DutyWarningPanelProps) {
    // แผงว่าง = ไม่ render อะไรเลย (หน้ากลับมาโล่งเหมือนเดิม)
    if (rows.length === 0) return null

    const worst = worstSeverity(rows)
    const red = worst !== 'soon'
    const shown = rows.slice(0, MAX_ROWS)

    return (
        // div นอกคุมระยะขอบของหน้า (override ได้ด้วย className) — การ์ดข้างในคุมความกว้าง
        <div className={cn('px-4 pt-3', className)}>
            <section
                className={cn(
                    'mx-auto w-full max-w-2xl rounded-xl border p-3 space-y-2',
                    red
                        ? 'border-red-300 dark:border-red-500/40 bg-red-50/60 dark:bg-red-500/5'
                        : 'border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5'
                )}
            >
                <h2
                    className={cn(
                        'flex items-center gap-2 text-sm font-semibold',
                        red ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'
                    )}
                >
                    <AlertTriangle className="h-4 w-4" />
                    หน้าที่ยังไม่ครบ — ใกล้วันงาน ({rows.length})
                </h2>

                <ul className="space-y-1.5">
                    {shown.map(row => (
                        <li
                            key={row.leadId}
                            className={cn(
                                'rounded-lg border bg-white dark:bg-zinc-950 px-3 py-2',
                                SEVERITY_BORDER[row.severity]
                            )}
                        >
                            <div className="flex items-start gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                        {row.title}
                                        {row.subtitle && (
                                            <span className="ml-1.5 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                                                {row.subtitle}
                                            </span>
                                        )}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                                        <span className="text-zinc-500 dark:text-zinc-400">{formatDate(row.eventDate)}</span>
                                        <span className={SEVERITY_TEXT[row.severity]}>{row.countdown}</span>
                                    </div>
                                </div>
                                <Link
                                    href={`/jobs/tracking?lead=${row.leadId}`}
                                    className="shrink-0 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                                    aria-label={`เปิดงาน ${row.title}`}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Link>
                            </div>

                            {/* ป้ายสิ่งที่ยังขาด — กดแล้วไปแท็บของหน้าที่นั้นพร้อมไฮไลต์งาน */}
                            <div className="mt-1.5 flex flex-wrap gap-1">
                                {row.chips.map(chip => (
                                    <Link
                                        key={chip.key}
                                        href={chip.href}
                                        className="inline-flex items-center rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-0.5 text-xs text-zinc-700 dark:text-zinc-300 hover:border-red-400 hover:text-red-700 dark:hover:border-red-500/60 dark:hover:text-red-300 transition-colors"
                                    >
                                        {chip.label}
                                    </Link>
                                ))}
                            </div>
                        </li>
                    ))}
                </ul>

                {rows.length > MAX_ROWS && (
                    <Link
                        href="/jobs/tracking"
                        className={cn(
                            'inline-block text-xs font-medium hover:underline',
                            red ? 'text-red-800 dark:text-red-300' : 'text-amber-800 dark:text-amber-300'
                        )}
                    >
                        ดูทั้งหมด ({rows.length} งาน)
                    </Link>
                )}
            </section>
        </div>
    )
}
