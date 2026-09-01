// หน้าแรก — แถวแชมป์ประจำเดือนบนสุด + 3 คอลัมน์: [ภาพรวมงาน] [งานในมือคุณ] [หน้าที่ยังไม่ครบ]
// (สเปค: docs/specs/dashboard-alerts.md + docs/specs/team-reports.md · layout ตาม mock ผู้ใช้ 2026-09-01)
import Link from 'next/link'
import { CheckCircle2, Trophy } from 'lucide-react'
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import { getReportStats } from '@/app/(authenticated)/reports/data'
import { aggregateStats } from '@/app/(authenticated)/reports/report-stats'
import ChampionsStrip from '@/app/(authenticated)/reports/champions-strip'
import { buildAlertData } from '@/components/dashboard-alerts/alert-panels'
import DashboardHero from '@/components/dashboard-alerts/dashboard-hero'
import MyJobsPanel from '@/components/dashboard-alerts/my-jobs-panel'
import DutyWarningPanel from '@/components/dashboard-alerts/duty-warning-panel'

export default async function DashboardPage() {
    // currentUserId มาจาก getSessionLight ใน snapshot — ไม่ต้องเช็ค session ซ้ำ
    const [snapshot, report] = await Promise.all([getTrackingSnapshot(), getReportStats()])
    const { leadDates, warnings, myJobsCount, heroStats } = buildAlertData(snapshot)
    const hasAlerts = myJobsCount > 0 || warnings.length > 0

    // แชมป์ตัดสินจากยอดสะสมทั้งหมด (ภาพรวม) — ตรงกับชิปเริ่มต้นของ /reports
    const allTimeStats = aggregateStats(report.rows, report.people).people

    return (
        <div className="mx-auto w-full max-w-[1700px] space-y-5 p-4 md:p-6">
            {/* แถวแชมป์ (ยอดสะสมทั้งหมด) — เฟรมทั้ง 7 เรียงแนวนอน */}
            <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        ทำเนียบแชมป์
                    </h2>
                    <Link
                        href="/reports"
                        className="text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline dark:hover:text-zinc-100"
                    >
                        ดูสถิติเต็ม →
                    </Link>
                </div>
                <ChampionsStrip stats={allTimeStats} currentUserId={report.currentUserId} />
            </div>

            {/* 3 คอลัมน์: ภาพรวมงาน · งานในมือคุณ · หน้าที่ยังไม่ครบ (จอเล็กเรียงลงล่าง) */}
            <div className="grid items-start gap-4 xl:grid-cols-3">
                <div className="w-full">
                    {hasAlerts ? (
                        <DashboardHero stats={heroStats} className="px-0 pt-0 md:pt-0" />
                    ) : (
                        <div className="flex flex-col items-center gap-2 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 px-4 py-16 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ไม่มีเรื่องต้องตามตอนนี้</p>
                            <p className="text-xs text-zinc-500">งานในมือเสร็จหมด และไม่มีหน้าที่ค้างใกล้วันงาน</p>
                        </div>
                    )}
                </div>

                <div className="w-full">
                    <MyJobsPanel
                        jobs={snapshot.poolJobs}
                        leadDates={leadDates}
                        currentUserId={snapshot.currentUserId}
                        statusLabels={snapshot.jobStatusLabels}
                        showEmpty
                        className="px-0 pt-0 md:pt-0"
                    />
                </div>

                <div className="w-full">
                    <DutyWarningPanel rows={warnings} className="px-0 pt-0" />
                </div>
            </div>
        </div>
    )
}
