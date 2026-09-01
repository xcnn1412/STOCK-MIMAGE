// รวมสองแผงของ dashboard-alerts เป็นก้อนเดียว (server component — ไม่มี 'use client')
// ใช้ทั้ง /dashboard และ /jobs/tracking จะได้ไม่ก๊อป wiring ของ buildDutyWarnings สองที่
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")

import type { ReactNode } from 'react'
import type { TrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import { POOL_DONE_STATUSES } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import MyJobsPanel from './my-jobs-panel'
import DutyWarningPanel from './duty-warning-panel'
import { buildDutyWarnings } from './duty-warnings'

export default function AlertPanels({
    snapshot,
    className,
    emptyFallback = null,
    compactWarnings = false,
}: {
    snapshot: TrackingSnapshot
    className?: string
    /** แสดงแทนเมื่อไม่มีเรื่องแจ้งเตือนเลย (เช่นหน้า dashboard ที่เหลือแต่แผงนี้) */
    emptyFallback?: ReactNode
    /** แผงเตือนแบบแถบสรุปพับได้ — ใช้บนหน้าที่แผงไม่ใช่เนื้อหาหลัก (/jobs/tracking) */
    compactWarnings?: boolean
}) {
    const { poolJobs, rows, jobStatusLabels, currentUserId } = snapshot

    // ส่งเฉพาะ crm_lead_id → วันงาน ไปฝั่ง client (TrackingLead ทั้งก้อนใหญ่เกินจำเป็น)
    const leadDates: Record<string, string | null> = {}
    for (const lead of rows) leadDates[lead.id] = lead.event_date

    // คำเตือน "หน้าที่ยังไม่ครบ" คิดฝั่ง server ทั้งหมด (รวมทั้ง "วันนี้") แล้วส่งแถวที่ serialize ได้ไปวาด
    // งานที่กด "เสร็จสิ้น" แล้ว (prep_done_at) ตัดออกแบบเดียวกับงาน archive
    const warnings = buildDutyWarnings({
        leads: rows,
        poolJobs,
        kitBookings: snapshot.kitBookings,
        dutyClaims: snapshot.dutyClaims,
        archivedLeadIds: [...snapshot.archivedLeadIds, ...snapshot.prepDoneLeadIds],
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

    // เช็คฝั่ง server ว่ามีอะไรให้แสดงไหม — เกณฑ์เดียวกับใน MyJobsPanel (ป้องกันไม่ตรงกัน: แค่ 3 บรรทัด)
    const hasMyJobs =
        !!currentUserId &&
        poolJobs.some(
            j => !POOL_DONE_STATUSES.includes(j.status) && (j.claimed_by === currentUserId || j.assigned_to.includes(currentUserId))
        )
    if (!hasMyJobs && warnings.length === 0) return <>{emptyFallback}</>

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
            <DutyWarningPanel rows={warnings} collapsible={compactWarnings} className={className} />
        </>
    )
}
