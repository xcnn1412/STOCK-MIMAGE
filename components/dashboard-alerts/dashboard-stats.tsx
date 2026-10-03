// ตัวเลขสรุป + กราฟ "สิ่งที่ยังขาด" ของหน้า dashboard
// เดิมรวมอยู่ในการ์ด gradient ใบเดียว (hero) — แยกเป็น 2 ชิ้นให้จัดวางตามขนาดจอได้:
//   StatTiles = แถวตัวเลข 4 ช่องบนสุด (กดแล้วเลื่อนไปแผงของเรื่องนั้น) · MissingByDutyCard = การ์ดกราฟแท่งเล็ก
// รับแต่ตัวเลขที่คิดเสร็จแล้วจาก server (buildAlertData) — ไม่มี state/hook จึงวาดใน server component ได้

import { AlertTriangle, BarChart3, Briefcase, CalendarClock, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DASH_SURFACE, DashCard } from './dash-card'

export interface DashboardStats {
    /** ใบงานค้างในมือของ user */
    myJobs: number
    /** จำนวนงานที่หน้าที่ยังไม่ครบ (เฉพาะที่ user คนนี้เห็น) */
    warningJobs: number
    /** ในนั้นเลยวันงานแล้วกี่งาน */
    overdue: number
    /** เหลือ ≤3 วันกี่งาน */
    urgent: number
    /** จำนวนสิ่งที่ยังขาด แยกตามหน้าที่ — เรียงมาก→น้อยแล้วจาก server */
    missingByDuty: { label: string; count: number }[]
}

/** id ของแผงบนหน้า dashboard ที่ช่องตัวเลขพาไป */
export const DASHBOARD_ANCHORS = { myJobs: 'my-jobs', warnings: 'duty-warnings' } as const

const TILES: {
    key: 'myJobs' | 'warningJobs' | 'overdue' | 'urgent'
    label: string
    icon: typeof Briefcase
    anchor: string
    /** สีตัวเลขเมื่อค่ามากกว่า 0 (เลยวัน/ด่วนเป็นสถานะ — มีป้ายกำกับเสมอ สีเป็นส่วนเสริม) */
    tone?: string
}[] = [
    { key: 'myJobs', label: 'งานในมือ', icon: Briefcase, anchor: DASHBOARD_ANCHORS.myJobs },
    { key: 'warningJobs', label: 'ยังไม่ครบ', icon: AlertTriangle, anchor: DASHBOARD_ANCHORS.warnings },
    { key: 'overdue', label: 'เลยวันงาน', icon: Flame, anchor: DASHBOARD_ANCHORS.warnings, tone: 'text-red-600 dark:text-red-400' },
    { key: 'urgent', label: 'ด่วน ≤3 วัน', icon: CalendarClock, anchor: DASHBOARD_ANCHORS.warnings, tone: 'text-amber-600 dark:text-amber-400' },
]

/** แถวตัวเลข 4 ช่อง — จอเล็ก 4 ช่องเต็มความกว้าง · จอใหญ่เรียงชิดขวาของหัวหน้า */
export function StatTiles({ stats, className }: { stats: DashboardStats; className?: string }) {
    return (
        <nav aria-label="สรุปงานของคุณ" className={cn('grid grid-cols-4 gap-2 lg:gap-3', className)}>
            {TILES.map(({ key, label, icon: Icon, anchor, tone }) => {
                const value = stats[key]
                return (
                    <a
                        key={key}
                        href={`#${anchor}`}
                        aria-label={`${label} ${value}`}
                        className={cn(DASH_SURFACE, 'rounded-xl px-2.5 py-2 transition-colors hover:border-zinc-300 lg:min-w-32 lg:px-4 lg:py-2.5 dark:hover:border-zinc-700')}
                    >
                        <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 lg:text-xs dark:text-zinc-400">
                            <Icon className="hidden h-3.5 w-3.5 shrink-0 sm:block" aria-hidden />
                            <span className="truncate">{label}</span>
                        </span>
                        <span
                            className={cn(
                                'mt-0.5 block text-2xl font-bold tabular-nums lg:text-3xl',
                                value > 0 && tone ? tone : 'text-zinc-900 dark:text-zinc-100'
                            )}
                        >
                            {value}
                        </span>
                    </a>
                )
            })}
        </nav>
    )
}

/**
 * กราฟแท่งนอน: จำนวนสิ่งที่ยังขาดแยกตามหน้าที่ — metric เดียว แท่งสีเดียว ป้ายชื่อบอกว่าแท่งไหนคืออะไร
 * ไม่มีแท่งที่มากกว่า 0 = ไม่ render อะไร
 */
export function MissingByDutyCard({ bars, className }: { bars: DashboardStats['missingByDuty']; className?: string }) {
    const shown = bars.filter(b => b.count > 0)
    if (shown.length === 0) return null
    const max = Math.max(1, ...shown.map(b => b.count))

    return (
        <DashCard aria-labelledby="missing-by-duty-heading" className={className}>
            <h2 id="missing-by-duty-heading" className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                <BarChart3 className="h-4 w-4 text-violet-500" aria-hidden />
                สิ่งที่ยังขาด แยกตามหน้าที่
            </h2>
            <div className="mt-3 space-y-2">
                {shown.map(b => (
                    <div key={b.label} className="flex items-center gap-2 text-xs" title={`${b.label} ยังขาด ${b.count} งาน`}>
                        <span className="w-16 shrink-0 text-zinc-600 dark:text-zinc-400">{b.label}</span>
                        <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div className="h-full rounded-full bg-violet-500" style={{ width: `${Math.max(6, (b.count / max) * 100)}%` }} />
                        </div>
                        <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">{b.count}</span>
                    </div>
                ))}
            </div>
        </DashCard>
    )
}
