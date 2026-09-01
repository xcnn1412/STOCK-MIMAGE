'use client'

// แผงที่ 2 ของ dashboard-alerts — "หน้าที่ยังไม่ครบ ใกล้วันงาน"
// รับแถวที่คำนวณเสร็จแล้วจาก server (buildDutyWarnings) — ที่นี่ทำแค่วาด
// /dashboard ใช้แบบแผงเต็ม · /jobs/tracking ใช้แบบแถบสรุปพับได้ (collapsible)

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, Check, ChevronDown, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseDate } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import { closeLeadPrepWarning } from '@/app/(authenticated)/jobs/actions'
import type { DutyWarningRow, DutyWarningSeverity } from './duty-warnings'

export interface DutyWarningPanelProps {
    /** แถวคำเตือนที่ผู้ใช้คนนี้ควรเห็น — ว่าง = ไม่ render อะไรเลย */
    rows: DutyWarningRow[]
    /** แถบสรุปบรรทัดเดียว กดขยายเป็นรายการเต็ม (ใช้บน /jobs/tracking ที่พูลคือเนื้อหาหลัก) */
    collapsible?: boolean
    className?: string
}

/** จำนวนแถวสูงสุดของแผงเต็ม — เกินกว่านี้ตกไปที่ลิงก์ "ดูทั้งหมด" (โหมดพับขยายแล้วเห็นครบ) */
const MAX_ROWS = 6

/** สีข้อความนับถอยหลัง: เลยวันงาน = แดงเข้ม+หนา · ≤3 วัน = แดง · 4–7 วัน = เหลือง */
const SEVERITY_TEXT: Record<DutyWarningSeverity, string> = {
    overdue: 'font-bold text-red-800 dark:text-red-300',
    urgent: 'font-medium text-red-600 dark:text-red-400',
    soon: 'font-medium text-amber-700 dark:text-amber-400',
}

/** จุดสีหน้าชื่องาน — ความแรงอยู่ที่จุดกับตัวเลขนับถอยหลัง การ์ดพื้นขาวกรอบปกติ อ่านง่ายกว่าแดงทั้งใบ */
const SEVERITY_DOT: Record<DutyWarningSeverity, string> = {
    overdue: 'bg-red-600',
    urgent: 'bg-red-500',
    soon: 'bg-amber-400',
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

export default function DutyWarningPanel({ rows, collapsible = false, className }: DutyWarningPanelProps) {
    const router = useRouter()
    const [closing, setClosing] = useState<string | null>(null)
    // โหมดพับ: เริ่มหุบเสมอ — หน้า tracking มีป้าย "สิ่งที่ยังขาด" ในตารางอยู่แล้ว แถบนี้เป็นแค่ตัวเลขรวม
    const [open, setOpen] = useState(false)

    // งานเลยวันไปแล้ว = จบไปแล้วจริงหน้างาน — กด "เสร็จสิ้น" ปิดคำเตือนได้ (server เช็คซ้ำว่าเลยวันจริง)
    const closeWarning = async (row: DutyWarningRow) => {
        if (!confirm(`ปิดคำเตือนของ "${row.title}"?\nงานนี้จะหายจากแผงแจ้งเตือน (ข้อมูลหน้าที่ไม่ถูกแก้)`)) return
        setClosing(row.leadId)
        const res = await closeLeadPrepWarning(row.leadId)
        setClosing(null)
        if (res?.error) {
            toast.error(res.error)
            return
        }
        toast.success('ปิดคำเตือนแล้ว')
        router.refresh()
    }

    // แผงว่าง = ไม่ render อะไรเลย (หน้ากลับมาโล่งเหมือนเดิม)
    if (rows.length === 0) return null

    const worst = worstSeverity(rows)
    const red = worst !== 'soon'
    // โหมดพับที่ขยายแล้วเห็นครบทุกแถว — ลิงก์ "ดูทั้งหมด" ของแผงเต็มชี้มาหน้านี้เอง
    const shown = collapsible ? rows : rows.slice(0, MAX_ROWS)

    const counts = {
        overdue: rows.filter(r => r.severity === 'overdue').length,
        urgent: rows.filter(r => r.severity === 'urgent').length,
        soon: rows.filter(r => r.severity === 'soon').length,
    }

    return (
        // div นอกคุมระยะขอบของหน้า (override ได้ด้วย className) — การ์ดข้างในคุมความกว้าง
        <div className={cn('px-4 pt-3', className)}>
            <section
                className={cn(
                    'mx-auto w-full rounded-xl border',
                    collapsible ? 'max-w-none' : 'max-w-2xl p-3 space-y-2',
                    red
                        ? 'border-red-300 dark:border-red-500/40 bg-red-50/60 dark:bg-red-500/5'
                        : 'border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/5'
                )}
            >
                {collapsible ? (
                    // แถบสรุปบรรทัดเดียว — ตัวเลขแยกตามความแรง กดทั้งแถบเพื่อขยาย/หุบ
                    <button
                        type="button"
                        onClick={() => setOpen(o => !o)}
                        aria-expanded={open}
                        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm"
                    >
                        <span
                            className={cn(
                                'flex items-center gap-2 font-semibold',
                                red ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'
                            )}
                        >
                            <AlertTriangle className="h-4 w-4" />
                            หน้าที่ยังไม่ครบ {rows.length} งาน
                        </span>
                        <span className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {counts.overdue > 0 && <span className={SEVERITY_TEXT.overdue}>เลยวันแล้ว {counts.overdue}</span>}
                            {counts.urgent > 0 && <span className={SEVERITY_TEXT.urgent}>≤3 วัน {counts.urgent}</span>}
                            {counts.soon > 0 && <span className={SEVERITY_TEXT.soon}>ใกล้ถึง {counts.soon}</span>}
                        </span>
                        <ChevronDown
                            className={cn('ml-auto h-4 w-4 shrink-0 text-zinc-400 transition-transform', open && 'rotate-180')}
                        />
                    </button>
                ) : (
                    <h2
                        className={cn(
                            'flex items-center gap-2 text-sm font-semibold',
                            red ? 'text-red-900 dark:text-red-200' : 'text-amber-900 dark:text-amber-200'
                        )}
                    >
                        <AlertTriangle className="h-4 w-4" />
                        หน้าที่ยังไม่ครบ — ใกล้วันงาน ({rows.length})
                    </h2>
                )}

                {(!collapsible || open) && (
                    <ul className={cn('space-y-1.5', collapsible && 'px-3 pb-3')}>
                        {shown.map(row => (
                            <li
                                key={row.leadId}
                                className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2"
                            >
                                <div className="flex items-start gap-2">
                                    {/* จุดสีบอกความแรง — การ์ดพื้นขาว ความด่วนอยู่ที่จุด+ตัวนับถอยหลัง */}
                                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[row.severity])} />
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
                                    {/* งานเลยวันแล้วปิดคำเตือนได้ — งานที่ยังไม่ถึงวันต้องตามหน้าที่ให้ครบจริง */}
                                    {row.severity === 'overdue' && (
                                        <button
                                            type="button"
                                            disabled={closing === row.leadId}
                                            onClick={() => closeWarning(row)}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
                                        >
                                            <Check className="h-3 w-3" /> เสร็จสิ้น
                                        </button>
                                    )}
                                    <Link
                                        href={`/jobs/tracking?lead=${row.leadId}`}
                                        className="shrink-0 text-zinc-300 hover:text-zinc-500 dark:text-zinc-600 dark:hover:text-zinc-400 transition-colors"
                                        aria-label={`เปิดงาน ${row.title}`}
                                    >
                                        <ChevronRight className="h-4 w-4" />
                                    </Link>
                                </div>

                                {/* ป้ายสิ่งที่ยังขาด — กดแล้วไปแท็บของหน้าที่นั้นพร้อมไฮไลต์งาน */}
                                <div className="mt-1.5 flex flex-wrap gap-1 pl-4">
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
                )}

                {!collapsible && rows.length > MAX_ROWS && (
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
