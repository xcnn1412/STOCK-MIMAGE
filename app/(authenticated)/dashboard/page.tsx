// หน้าแรก — หัวทักทาย+วันที่ · แถวแชมป์ · (admin) งานงวดก่อนค้างจ่าย · ของยังไม่ครบ (จัดซื้อ) · 3 คอลัมน์: [ภาพรวมงาน] [งานในมือคุณ] [หน้าที่ยังไม่ครบ]
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
import { listUnpaidPreviousPeriods } from '@/app/(authenticated)/salary/actions'
import UnpaidPeriodsNotice from '@/app/(authenticated)/salary/components/unpaid-periods-notice'
import { getPurchaseAlerts } from '@/app/(authenticated)/jobs/purchasing/data'
import PurchaseAlertCard from '@/app/(authenticated)/jobs/purchasing/components/purchase-alert-card'

export default async function DashboardPage() {
    // currentUserId มาจาก getSessionLight ใน snapshot — ไม่ต้องเช็ค session ซ้ำ
    // listUnpaidPreviousPeriods ตรวจ admin เอง — คนอื่นได้ [] จึงไม่เห็นการ์ดเงินเดือน
    // getPurchaseAlerts คัดเฉพาะเช็กลิสต์ที่ผู้ใช้คนนี้เกี่ยวข้อง · พลาด/ยังไม่รัน migration = [] (ไม่ทำให้หน้าแรกล้ม)
    const [snapshot, report, unpaid, purchaseAlerts] = await Promise.all([
        getTrackingSnapshot(),
        getReportStats(),
        listUnpaidPreviousPeriods(),
        getPurchaseAlerts(),
    ])
    const { leadDates, warnings, myJobsCount, heroStats } = buildAlertData(snapshot)
    const hasAlerts = myJobsCount > 0 || warnings.length > 0

    // แชมป์ตัดสินจากยอดสะสมทั้งหมด (ภาพรวม) — ตรงกับชิปเริ่มต้นของ /reports
    const allTimeStats = aggregateStats(report.rows, report.people).people

    // วันนี้แบบไทยยาว — โชว์ใต้คำทักทายหัวหน้า (render บน server → ล็อกเขตเวลาไทย ไม่งั้นก่อน 7 โมงเช้าจะเป็นวันเมื่อวาน)
    const todayLabel = new Date().toLocaleDateString('th-TH', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Bangkok',
    })

    return (
        <div className="mx-auto w-full max-w-[1700px] space-y-5 p-4 md:p-6">
            {/* หัวหน้า — คำทักทาย + วันที่วันนี้ */}
            <header>
                <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">สวัสดี 👋</h1>
                <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{todayLabel}</p>
            </header>

            {/* แถวแชมป์ (ยอดสะสมทั้งหมด) — เฟรมทั้ง 7 เรียงแนวนอน ในการ์ดพื้นกลางชุดเดียวกับแผงอื่น */}
            <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 shadow-sm">
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

            {/* งานงวดก่อนที่ยังไม่ถูกจ่าย (admin) — มีเมื่อมีงานค้างเท่านั้น */}
            {unpaid.length > 0 && (
                <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 shadow-sm">
                    <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">เงินเดือน</h2>
                    <UnpaidPeriodsNotice rows={unpaid} mode="all" />
                </div>
            )}

            {/* ของยังไม่ครบ — ใกล้วันงาน (เช็กลิสต์จัดซื้อที่มีรายการค้างซึ่งด่วน) — มีเมื่อมีแถวเท่านั้น */}
            {purchaseAlerts.length > 0 && (
                <div className="rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 p-4 shadow-sm">
                    <PurchaseAlertCard rows={purchaseAlerts} />
                </div>
            )}

            {/* 3 คอลัมน์: ภาพรวมงาน · งานในมือคุณ · หน้าที่ยังไม่ครบ
                จอเล็กเรียงลงล่าง · md = hero เต็มแถว + 2 แผงคู่กัน · xl = 3 คอลัมน์สูงเท่ากัน (items-stretch + h-full) */}
            <div className="grid items-stretch gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div className="w-full md:col-span-2 xl:col-span-1">
                    {hasAlerts ? (
                        <DashboardHero stats={heroStats} className="px-0 pt-0 md:pt-0" />
                    ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-2 rounded-2xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white dark:bg-zinc-900/80 px-4 py-16 text-center shadow-sm">
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
                    <DutyWarningPanel rows={warnings} showEmpty className="px-0 pt-0" />
                </div>
            </div>
        </div>
    )
}
