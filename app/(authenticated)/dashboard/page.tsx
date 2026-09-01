// หน้ารวมโมดูล — เดิมเป็น static ล้วน ตอนนี้มีชั้นข้อมูล server เพื่อวางแผงแจ้งเตือนไว้บนสุด
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import MyJobsPanel from '@/components/dashboard-alerts/my-jobs-panel'
import DutyWarningPanel from '@/components/dashboard-alerts/duty-warning-panel'
import { buildDutyWarnings } from '@/components/dashboard-alerts/duty-warnings'
import ModuleHub from './module-hub'

export default async function DashboardPage() {
    // ข้อมูลชุดเดียวกับหน้าติดตามงาน — currentUserId มาจาก getSessionLight ข้างใน ไม่ต้องเช็ค session ซ้ำ
    const snapshot = await getTrackingSnapshot()
    const { poolJobs, rows, jobStatusLabels, currentUserId } = snapshot

    // ส่งเฉพาะ crm_lead_id → วันงาน ไปฝั่ง client (TrackingLead ทั้งก้อนใหญ่เกินจำเป็น)
    const leadDates: Record<string, string | null> = {}
    for (const lead of rows) leadDates[lead.id] = lead.event_date

    // คำเตือน "หน้าที่ยังไม่ครบ" คิดฝั่ง server ทั้งหมด (รวมทั้ง "วันนี้") แล้วส่งแถวที่ serialize ได้ไปวาด
    const warnings = buildDutyWarnings({
        leads: rows,
        poolJobs,
        kitBookings: snapshot.kitBookings,
        dutyClaims: snapshot.dutyClaims,
        archivedLeadIds: snapshot.archivedLeadIds,
        dutyDepartments: snapshot.dutyDepartments,
        roleLabels: snapshot.roleLabels,
        viewer: {
            userId: currentUserId,
            department: snapshot.myDepartment,
            isAdmin: snapshot.isAdmin,
            canManagePool: snapshot.canManagePool,
        },
        today: new Date(),
    })

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
            <DutyWarningPanel rows={warnings} className="mx-auto w-full max-w-3xl" />
            <ModuleHub />
        </>
    )
}
