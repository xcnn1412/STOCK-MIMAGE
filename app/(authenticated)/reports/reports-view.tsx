'use client'

// สถิติทีม — การ์ดสรุป 5 ตัวเลข + การ์ดอันดับ Top 3 ของแต่ละประเภท (แทนตารางรายคนเดิม)
// การรวมยอดทำใน report-stats.ts (pure) หน้านี้ทำหน้าที่แสดงผลอย่างเดียว
import { useMemo, useState } from 'react'
import { cn } from '@/lib/utils'
import Top3Grid, { STAT_COLORS } from './top3-grid'
import {
    aggregateStats,
    filterByPeriod,
    STAT_KINDS,
    STAT_LABELS_TH,
    STAT_PERIOD_LABELS_TH,
    STAT_PERIODS,
    type ReportPerson,
    type StatPeriod,
    type StatRow,
} from './report-stats'

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

            {/* อันดับ 1-2-3 ของแต่ละประเภท — การ์ดชุดเดียวกับหน้า dashboard (Top3Grid) */}
            {stats.length === 0 ? (
                <div className="rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
                    {period === 'all' ? 'ยังไม่มีข้อมูลสถิติ' : `ยังไม่มีข้อมูลสถิติใน${STAT_PERIOD_LABELS_TH[period]}`}
                </div>
            ) : (
                <Top3Grid stats={stats} currentUserId={currentUserId} />
            )}

            <p className="text-xs text-zinc-400 dark:text-zinc-500">
                นับเฉพาะงานที่ถึงวันแล้ว · หน้าที่ที่รับแล้วคืนไปจะไม่ถูกนับ · จัดอันดับเฉพาะคนที่มียอดในหมวดนั้น
                {period !== 'all' && ' · รายการที่ไม่รู้วันที่จะนับเฉพาะในภาพรวม'}
            </p>
        </div>
    )
}
