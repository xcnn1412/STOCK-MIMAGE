// หน้ารวมโมดูล — เดิมเป็น static ล้วน ตอนนี้มีชั้นข้อมูล server เพื่อวางแผงแจ้งเตือนไว้บนสุด
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import MyJobsPanel from '@/components/dashboard-alerts/my-jobs-panel'
import ModuleHub from './module-hub'

export default async function DashboardPage() {
    // ข้อมูลชุดเดียวกับหน้าติดตามงาน — currentUserId มาจาก getSessionLight ข้างใน ไม่ต้องเช็ค session ซ้ำ
    const { poolJobs, rows, jobStatusLabels, currentUserId } = await getTrackingSnapshot()

    // ส่งเฉพาะ crm_lead_id → วันงาน ไปฝั่ง client (TrackingLead ทั้งก้อนใหญ่เกินจำเป็น)
    const leadDates: Record<string, string | null> = {}
    for (const lead of rows) leadDates[lead.id] = lead.event_date

    return (
        <>
            {/* แผงว่าง = component คืน null → หน้าโล่งเหมือนเดิมทุกประการ */}
            <MyJobsPanel
                jobs={poolJobs}
                leadDates={leadDates}
                currentUserId={currentUserId}
                statusLabels={jobStatusLabels}
                className="mx-auto w-full max-w-3xl"
            />
            <ModuleHub />
        </>
    )
}
