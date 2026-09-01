// รวมสองแผงของ dashboard-alerts เป็นก้อนเดียว (server component — ไม่มี 'use client')
// ใช้ทั้ง /dashboard และ /jobs/tracking จะได้ไม่ก๊อป wiring ของ buildDutyWarnings สองที่
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")

import type { TrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import MyJobsPanel from './my-jobs-panel'
import DutyWarningPanel from './duty-warning-panel'
import { buildDutyWarnings } from './duty-warnings'

export default function AlertPanels({ snapshot, className }: { snapshot: TrackingSnapshot; className?: string }) {
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

    // ทั้งสองแผงคืน null เองเมื่อว่าง — หน้าที่ไม่มีเรื่องเตือนจึงเหมือนเดิมทุกประการ
    return (
        <>
            <MyJobsPanel
                jobs={poolJobs}
                leadDates={leadDates}
                currentUserId={currentUserId}
                statusLabels={jobStatusLabels}
                className={className}
            />
            <DutyWarningPanel rows={warnings} className={className} />
        </>
    )
}
