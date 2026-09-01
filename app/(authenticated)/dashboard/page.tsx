// หน้าแรก = ศูนย์แจ้งเตือนงานอย่างเดียว (กล่องปุ่มลิงก์โมดูลถูกถอดออก — เข้าโมดูลผ่าน sidebar)
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")
import { CheckCircle2 } from 'lucide-react'
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import AlertPanels from '@/components/dashboard-alerts/alert-panels'

export default async function DashboardPage() {
    // ข้อมูลชุดเดียวกับหน้าติดตามงาน — currentUserId มาจาก getSessionLight ข้างใน ไม่ต้องเช็ค session ซ้ำ
    const snapshot = await getTrackingSnapshot()

    return (
        <AlertPanels
            snapshot={snapshot}
            className="mx-auto w-full max-w-3xl"
            emptyFallback={
                <div className="flex flex-col items-center gap-2 px-4 py-16 text-center">
                    <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ไม่มีเรื่องต้องตามตอนนี้</p>
                    <p className="text-xs text-zinc-500">งานในมือเสร็จหมด และไม่มีหน้าที่ค้างใกล้วันงาน</p>
                </div>
            }
        />
    )
}
