// หน้ารวมโมดูล — เดิมเป็น static ล้วน ตอนนี้มีชั้นข้อมูล server เพื่อวางแผงแจ้งเตือนไว้บนสุด
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import AlertPanels from '@/components/dashboard-alerts/alert-panels'
import ModuleHub from './module-hub'

export default async function DashboardPage() {
    // ข้อมูลชุดเดียวกับหน้าติดตามงาน — currentUserId มาจาก getSessionLight ข้างใน ไม่ต้องเช็ค session ซ้ำ
    const snapshot = await getTrackingSnapshot()

    return (
        <>
            {/* แผงว่าง = คืน null → หน้าโล่งเหมือนเดิมทุกประการ */}
            <AlertPanels snapshot={snapshot} className="mx-auto w-full max-w-3xl" />
            <ModuleHub />
        </>
    )
}
