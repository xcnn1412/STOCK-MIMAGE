'use client'

// ตารางสถิติทีม — การ์ดสรุป 5 ตัวเลข + ตารางรายคน แถวของตัวเองไฮไลต์
// การรวมยอดทำใน report-stats.ts (pure) หน้านี้ทำหน้าที่แสดงผลอย่างเดียว
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import {
    aggregateStats,
    filterByPeriod,
    STAT_KINDS,
    STAT_LABELS_TH,
    STAT_PERIOD_LABELS_TH,
    STAT_PERIODS,
    STAT_SHORT_LABELS_TH,
    type ReportPerson,
    type StatKind,
    type StatPeriod,
    type StatRow,
} from './report-stats'

/** สีประจำประเภท — แถบซ้ายของการ์ดสรุป (สำนวนเดียวกับการ์ดในหน้า /jobs) */
const STAT_COLORS: Record<StatKind, string> = {
    onsite: '#0ea5e9',
    staffing: '#8b5cf6',
    vehicle: '#f59e0b',
    kits: '#10b981',
    graphic: '#ec4899',
}

/** คำอธิบายใต้หัวเรื่อง — เปลี่ยนตามช่วงที่เลือก */
const PERIOD_HINTS_TH: Record<StatPeriod, string> = {
    all: 'ภาพรวมทั้งหมด',
    week: 'สัปดาห์นี้ (จันทร์ถึงอาทิตย์)',
    month: 'เดือนนี้',
    year: 'ปีนี้',
}

interface ReportsViewProps {
    rows: StatRow[]
    people: ReportPerson[]
    currentUserId: string | null
    /** วันนี้ตามเวลาไทย (YYYY-MM-DD) ส่งมาจาก server เพื่อให้ hydration ตรงกันเสมอ */
    today: string
}

export default function ReportsView({ rows, people, currentUserId, today }: ReportsViewProps) {
    const [period, setPeriod] = useState<StatPeriod>('all') // ค่าเริ่มต้น = ภาพรวม

    // กรองตามช่วงแล้วค่อยรวมยอด — ทั้งการ์ดสรุปและตารางใช้ชุดเดียวกัน (ไม่โหลดหน้าใหม่)
    const { people: stats, totals } = useMemo(
        () => aggregateStats(filterByPeriod(rows, period, today), people),
        [rows, people, period, today]
    )

    return (
        <div className="p-4 md:p-6 space-y-5">
            {/* หัวเรื่อง */}
            <div>
                <h1 className="text-xl md:text-2xl font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">
                    สถิติทีม
                </h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    {PERIOD_HINTS_TH[period]} — ใครออกงานอีเวนต์กี่ครั้ง ใครรับหน้าที่จัดคน/จัดรถ/จัดกระเป๋า และใครรับใบงานกราฟิก
                </p>
            </div>

            {/* ชิปช่วงเวลา — สลับฝั่ง client ล้วน */}
            <div className="flex flex-wrap items-center gap-2">
                {STAT_PERIODS.map(p => {
                    const active = period === p
                    return (
                        <button
                            key={p}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setPeriod(p)}
                            className={cn(
                                'rounded-full px-3 py-1 text-sm',
                                active
                                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                    : 'border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            )}
                        >
                            {STAT_PERIOD_LABELS_TH[p]}
                        </button>
                    )
                })}
            </div>

            {/* การ์ดสรุปยอดรวมทีม — มือถือเลื่อนแนวนอน */}
            <div
                className="flex gap-3 overflow-x-auto pb-1 -mx-4 px-4 md:mx-0 md:px-0 snap-x snap-mandatory"
                style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
                {STAT_KINDS.map(kind => (
                    <div
                        key={kind}
                        className="flex-shrink-0 w-[130px] sm:w-auto sm:flex-1 sm:min-w-0 relative overflow-hidden rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 sm:p-5 snap-start"
                    >
                        <div
                            className="absolute left-0 top-0 bottom-0 w-1"
                            style={{ background: `linear-gradient(to bottom, ${STAT_COLORS[kind]}, ${STAT_COLORS[kind]}dd)` }}
                        />
                        <div className="flex items-center gap-2 mb-3">
                            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: STAT_COLORS[kind] }} />
                            <span className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 tracking-wide truncate">
                                {STAT_LABELS_TH[kind]}
                            </span>
                        </div>
                        <div className="text-2xl sm:text-3xl font-extrabold text-zinc-900 dark:text-zinc-100 tracking-tight">
                            {totals[kind]}
                        </div>
                    </div>
                ))}
            </div>

            {/* ตารางรายคน */}
            <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 overflow-hidden">
                {stats.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        {period === 'all' ? 'ยังไม่มีข้อมูลสถิติ' : `ยังไม่มีข้อมูลสถิติใน${STAT_PERIOD_LABELS_TH[period]}`}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-sm border-collapse">
                            <thead>
                                <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-900">
                                    <th className="text-left font-semibold text-zinc-500 dark:text-zinc-400 px-4 py-3 whitespace-nowrap">
                                        ชื่อ
                                    </th>
                                    {STAT_KINDS.map(kind => (
                                        <th
                                            key={kind}
                                            className="text-right font-semibold text-zinc-500 dark:text-zinc-400 px-3 py-3 whitespace-nowrap"
                                        >
                                            {STAT_SHORT_LABELS_TH[kind]}
                                        </th>
                                    ))}
                                    <th className="text-right font-semibold text-zinc-600 dark:text-zinc-300 px-4 py-3 whitespace-nowrap">
                                        รวม
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.map(p => {
                                    const isMe = !!currentUserId && p.userId === currentUserId
                                    return (
                                        <tr
                                            key={p.userId}
                                            className={cn(
                                                'border-b border-zinc-100 dark:border-zinc-800/60 last:border-0',
                                                isMe
                                                    ? 'bg-amber-50 dark:bg-amber-500/10'
                                                    : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                                            )}
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <span
                                                        className={cn(
                                                            'font-medium truncate',
                                                            isMe
                                                                ? 'text-amber-900 dark:text-amber-200'
                                                                : 'text-zinc-900 dark:text-zinc-100'
                                                        )}
                                                    >
                                                        {p.name}
                                                    </span>
                                                    {isMe && (
                                                        <span className="shrink-0 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-[10px] font-semibold">
                                                            คุณ
                                                        </span>
                                                    )}
                                                </div>
                                                {p.department && (
                                                    <div className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">
                                                        {p.department}
                                                    </div>
                                                )}
                                            </td>
                                            {STAT_KINDS.map(kind => (
                                                <td
                                                    key={kind}
                                                    className={cn(
                                                        'px-3 py-3 text-right tabular-nums',
                                                        p[kind] === 0
                                                            ? 'text-zinc-300 dark:text-zinc-700'
                                                            : 'text-zinc-700 dark:text-zinc-300'
                                                    )}
                                                >
                                                    {p[kind]}
                                                </td>
                                            ))}
                                            <td className="px-4 py-3 text-right tabular-nums font-bold text-zinc-900 dark:text-zinc-100">
                                                {p.total}
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                นับเฉพาะงานที่ถึงวันแล้ว · หน้าที่ที่รับแล้วคืนไปจะไม่ถูกนับ · แสดงเฉพาะคนที่มีตัวเลขอย่างน้อยหนึ่งช่อง
                {period !== 'all' && ' · รายการที่ไม่รู้วันที่จะนับเฉพาะในภาพรวม'}
            </p>
        </div>
    )
}
