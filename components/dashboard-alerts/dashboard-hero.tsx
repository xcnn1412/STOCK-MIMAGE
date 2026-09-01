'use client'

// Hero ของหน้า dashboard — ตัวเลขรวม + กราฟแท่งจำนวนสิ่งที่ยังขาด
// รับแต่ตัวเลขที่คิดเสร็จแล้วจาก server (AlertPanels) — ที่นี่ทำแค่วาด
// กราฟ: metric เดียว (จำนวน) แยกตามหน้าที่ → แท่งนอนสีเดียว ป้ายชื่อบอกว่าแท่งไหนคืออะไร
// (ตัวเลข/ป้ายใช้สี text ปกติ ไม่ย้อมตามสีแท่ง — identity อยู่ที่ป้าย ไม่ใช่สี)

import { AlertTriangle, Briefcase, CalendarClock, Flame } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface HeroStats {
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

/** วันนี้แบบไทยยาว — โชว์หัว hero */
const todayLabel = () =>
    new Date().toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

function Tile({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
    return (
        <div className="rounded-xl bg-white/10 px-3 py-2.5 backdrop-blur-sm">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                {icon}
                {label}
            </div>
            <div className={cn('mt-0.5 text-2xl font-bold tabular-nums', accent ? 'text-amber-300' : 'text-white')}>
                {value}
            </div>
        </div>
    )
}

export default function DashboardHero({ stats, className }: { stats: HeroStats; className?: string }) {
    const bars = stats.missingByDuty.filter(b => b.count > 0)
    const max = Math.max(1, ...bars.map(b => b.count))

    return (
        <div className={cn('px-4 pt-4 md:pt-6', className)}>
            <section className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-gradient-to-br from-violet-600 via-indigo-600 to-sky-600 p-4 text-white shadow-lg dark:from-violet-700 dark:via-indigo-800 dark:to-sky-800">
                <div className="flex items-baseline justify-between gap-2">
                    <h1 className="text-base font-bold">ภาพรวมงานของคุณ</h1>
                    <span className="text-[11px] text-white/60">{todayLabel()}</span>
                </div>

                {/* ตัวเลขหลัก — stat tiles (เลยวัน/ด่วนเป็นสถานะ จึงมีไอคอน+ป้ายกำกับ ไม่ใช้สีเดี่ยวๆ) */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Tile icon={<Briefcase className="h-3.5 w-3.5" />} label="งานในมือ" value={stats.myJobs} />
                    <Tile icon={<AlertTriangle className="h-3.5 w-3.5" />} label="หน้าที่ยังไม่ครบ" value={stats.warningJobs} />
                    <Tile icon={<Flame className="h-3.5 w-3.5" />} label="เลยวันงาน" value={stats.overdue} accent={stats.overdue > 0} />
                    <Tile icon={<CalendarClock className="h-3.5 w-3.5" />} label="ด่วน ≤3 วัน" value={stats.urgent} accent={stats.urgent > 0} />
                </div>

                {/* กราฟแท่งนอน: จำนวนสิ่งที่ยังขาดแยกตามหน้าที่ — แท่งสีเดียว ป้าย+ตัวเลขเป็น text ปกติ */}
                {bars.length > 0 && (
                    <div className="mt-4 space-y-1.5">
                        <div className="text-[11px] font-medium text-white/70">สิ่งที่ยังขาด แยกตามหน้าที่</div>
                        {bars.map(b => (
                            <div key={b.label} className="flex items-center gap-2 text-xs" title={`${b.label} ยังขาด ${b.count} งาน`}>
                                <span className="w-16 shrink-0 text-white/80">{b.label}</span>
                                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/10">
                                    <div
                                        className="h-full rounded-full bg-sky-300"
                                        style={{ width: `${Math.max(6, (b.count / max) * 100)}%` }}
                                    />
                                </div>
                                <span className="w-6 shrink-0 text-right font-semibold tabular-nums text-white">{b.count}</span>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    )
}
