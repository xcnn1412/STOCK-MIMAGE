// หน้าแรก — จัดลำดับตามสิ่งที่ต้องทำก่อน และต่างกันตามขนาดจอ
//   มือถือ: ทักทาย → ตัวเลข 4 ช่อง → งานในมือ → หน้าที่ยังไม่ครบ → การ์ดเสริม (จัดซื้อ/เงินเดือน/กราฟ) → ทำเนียบแชมป์
//   md ขึ้นไป: ทักทาย+ตัวเลข → ทำเนียบแชมป์ → งานในมือ | หน้าที่ยังไม่ครบ | การ์ดเสริม
//     (xl = 3 คอลัมน์ · lg = 2 คอลัมน์ + การ์ดเสริมแถวล่าง · md = คอลัมน์เดียว เพราะแถบเมนูซ้ายกินที่ 244px)
// (สเปค: docs/specs/dashboard-alerts.md + docs/specs/team-reports.md)
import Link from 'next/link'
import { CheckCircle2, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import { getReportStats } from '@/app/(authenticated)/reports/data'
import { aggregateStats } from '@/app/(authenticated)/reports/report-stats'
import ChampionsStrip from '@/app/(authenticated)/reports/champions-strip'
import { buildAlertData } from '@/components/dashboard-alerts/alert-panels'
import { DASHBOARD_ANCHORS, MissingByDutyCard, StatTiles } from '@/components/dashboard-alerts/dashboard-hero'
import MyJobsPanel from '@/components/dashboard-alerts/my-jobs-panel'
import DutyWarningPanel from '@/components/dashboard-alerts/duty-warning-panel'
import { listUnpaidPreviousPeriods } from '@/app/(authenticated)/salary/actions'
import UnpaidPeriodsNotice from '@/app/(authenticated)/salary/components/unpaid-periods-notice'
import { getPurchaseAlerts } from '@/app/(authenticated)/jobs/purchasing/data'
import PurchaseAlertCard from '@/app/(authenticated)/jobs/purchasing/components/purchase-alert-card'

/** กรอบการ์ดของหน้าแรก — ชุดเดียวกับแผงงานในมือ/หน้าที่ยังไม่ครบ */
const CARD = 'rounded-2xl border border-zinc-200/60 bg-white p-4 shadow-sm dark:border-zinc-800/60 dark:bg-zinc-900/80'

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
    const hasBars = heroStats.missingByDuty.some(b => b.count > 0)
    // คอลัมน์การ์ดเสริม: จัดซื้อ / เงินเดือน / กราฟ — หรือการ์ด "ไม่มีเรื่องต้องตาม" เมื่อเคลียร์หมด · ไม่มีสักใบ = ไม่มีคอลัมน์นี้
    const hasSide = purchaseAlerts.length > 0 || unpaid.length > 0 || hasBars || !hasAlerts

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
        // flex + order: ลำดับใน DOM = ลำดับบนมือถือ · md ขึ้นไปดึงหัวหน้ากับทำเนียบแชมป์ขึ้นบน (md:order-first)
        <div className="mx-auto flex w-full max-w-425 flex-col gap-4">
            {/* หัวหน้า — คำทักทาย + วันที่ · ตัวเลขสรุป 4 ช่อง (จอใหญ่อยู่ขวาของบรรทัดเดียวกัน)
                lg:pr-12 = เว้นที่ให้กระดิ่งแจ้งเตือนที่ลอยอยู่มุมขวาบน (layout) ไม่ทับช่องตัวเลขสุดท้าย */}
            <header className="flex flex-col gap-3 md:order-first lg:flex-row lg:items-end lg:justify-between lg:pr-12">
                <div>
                    <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">สวัสดี 👋</h1>
                    <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{todayLabel}</p>
                </div>
                <StatTiles stats={heroStats} />
            </header>

            {/* แผงหลัก — grid-cols-1 จำเป็น: ไม่ใส่ = คอลัมน์ auto ที่ขยายตามชื่องานยาว (truncate) จนล้นจอมือถือ
                xl = 3 คอลัมน์สูงเท่ากัน (items-stretch + h-full) · ไม่มีการ์ดเสริม = 2 คอลัมน์ */}
            <div className={cn('grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2', hasSide && 'xl:grid-cols-3')}>
                {/* scroll-mt: เลื่อนมาจากช่องตัวเลขแล้วไม่โดนแถบเมนูบนของมือถือบัง */}
                <div id={DASHBOARD_ANCHORS.myJobs} className="w-full scroll-mt-20">
                    <MyJobsPanel
                        jobs={snapshot.poolJobs}
                        leadDates={leadDates}
                        currentUserId={snapshot.currentUserId}
                        statusLabels={snapshot.jobStatusLabels}
                        showEmpty
                        className="px-0 pt-0 md:pt-0"
                    />
                </div>

                <div id={DASHBOARD_ANCHORS.warnings} className="w-full scroll-mt-20">
                    <DutyWarningPanel rows={warnings} showEmpty className="px-0 pt-0" />
                </div>

                {/* การ์ดเสริม — มือถือ/xl เรียงลงล่าง · lg วาง 2 คอลัมน์เต็มแถว */}
                {hasSide && (
                    <div className="grid grid-cols-1 content-start gap-4 lg:col-span-2 lg:grid-cols-2 xl:col-span-1 xl:grid-cols-1">
                        {/* ของยังไม่ครบ — ใกล้วันงาน (เช็กลิสต์จัดซื้อที่มีรายการค้างซึ่งด่วน) */}
                        {purchaseAlerts.length > 0 && (
                            <div className={CARD}>
                                <PurchaseAlertCard rows={purchaseAlerts} />
                            </div>
                        )}

                        {/* งานงวดก่อนที่ยังไม่ถูกจ่าย (admin) */}
                        {unpaid.length > 0 && (
                            <div className={CARD}>
                                <h2 className="mb-2 text-sm font-semibold text-zinc-800 dark:text-zinc-200">เงินเดือน</h2>
                                <UnpaidPeriodsNotice rows={unpaid} mode="all" />
                            </div>
                        )}

                        <MissingByDutyCard bars={heroStats.missingByDuty} />

                        {!hasAlerts && (
                            <div className={cn(CARD, 'flex flex-col items-center justify-center gap-2 py-10 text-center')}>
                                <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ไม่มีเรื่องต้องตามตอนนี้</p>
                                <p className="text-xs text-zinc-500">งานในมือเสร็จหมด และไม่มีหน้าที่ค้างใกล้วันงาน</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ทำเนียบแชมป์ (ยอดสะสมทั้งหมด) — ท้าย DOM = ล่างสุดบนมือถือ · md ขึ้นไปอยู่ใต้หัวหน้า */}
            <div className={cn(CARD, 'md:order-first')}>
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 className="flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        <Trophy className="h-4 w-4 text-amber-500" />
                        ทำเนียบแชมป์
                    </h2>
                    <Link
                        href="/reports"
                        className="inline-flex min-h-10 items-center text-xs font-medium text-zinc-500 hover:text-zinc-900 hover:underline md:min-h-0 dark:hover:text-zinc-100"
                    >
                        ดูสถิติเต็ม →
                    </Link>
                </div>
                <ChampionsStrip stats={allTimeStats} currentUserId={report.currentUserId} />
            </div>
        </div>
    )
}
