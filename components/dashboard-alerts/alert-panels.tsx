// รวมสองแผงของ dashboard-alerts เป็นก้อนเดียว (server component — ไม่มี 'use client')
// ใช้ทั้ง /dashboard และ /jobs/tracking จะได้ไม่ก๊อป wiring ของ buildDutyWarnings สองที่
// (สเปค: docs/specs/dashboard-alerts.md — "ตำแหน่งแสดงผล")

import type { ReactNode } from 'react'
import type { TrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import { POOL_DONE_STATUSES } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import MyJobsPanel from './my-jobs-panel'
import DutyWarningPanel from './duty-warning-panel'
import type { DashboardStats } from './dashboard-stats'
import { buildDutyWarnings, type DutyWarningRow } from './duty-warnings'
import CapacityPanel from './capacity-panel'
import { buildCapacityRows } from './capacity-warnings'

/** ป้ายไทยของสิ่งที่ขาดแต่ละหน้าที่ — ใช้ในกราฟแท่งบน dashboard */
const MISSING_BAR_LABELS: Record<string, string> = {
    design: 'ออกแบบ',
    staff: 'จัดคน',
    vehicle: 'จัดรถ',
    time: 'เวลาเริ่ม',
    kits: 'กระเป๋า',
}

/** จำนวนสิ่งที่ยังขาดแยกตามหน้าที่ จากคำเตือนที่ user คนนี้เห็น — เรียงมาก→น้อย */
function missingByDuty(warnings: DutyWarningRow[]): DashboardStats['missingByDuty'] {
    const counts = new Map<string, number>()
    for (const row of warnings)
        for (const chip of row.chips) counts.set(chip.key, (counts.get(chip.key) ?? 0) + 1)
    return Object.entries(MISSING_BAR_LABELS)
        .map(([key, label]) => ({ label, count: counts.get(key) ?? 0 }))
        .sort((a, b) => b.count - a.count)
}

/** ข้อมูลทุกก้อนที่แผงแจ้งเตือนใช้ — คิดจาก snapshot ครั้งเดียว ใช้ประกอบ layout เองได้ (เช่น grid บน /dashboard) */
export function buildAlertData(snapshot: TrackingSnapshot) {
    const { poolJobs, rows, currentUserId } = snapshot

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

    // เกณฑ์เดียวกับใน MyJobsPanel (ป้องกันไม่ตรงกัน: แค่ 3 บรรทัด)
    const myJobsCount = !currentUserId
        ? 0
        : poolJobs.filter(
              j => !POOL_DONE_STATUSES.includes(j.status) && (j.claimed_by === currentUserId || j.assigned_to.includes(currentUserId))
          ).length

    const stats: DashboardStats = {
        myJobs: myJobsCount,
        warningJobs: warnings.length,
        overdue: warnings.filter(w => w.severity === 'overdue').length,
        urgent: warnings.filter(w => w.severity === 'urgent').length,
        missingByDuty: missingByDuty(warnings),
    }

    // แผง "แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ" — คำเตือนคิดไว้แล้วใน snapshot (packages/capacity-data.ts) ที่นี่คัดผู้เห็น + ช่วงวัน
    const capacityRows = buildCapacityRows({
        leads: rows,
        warningsByLead: snapshot.capacityWarnings ?? {},
        leadCreatedBy: snapshot.leadCreatedBy ?? {},
        kitDepartments: snapshot.dutyDepartments.kits ?? [],
        excludedLeadIds: [...snapshot.archivedLeadIds, ...snapshot.prepDoneLeadIds],
        viewer: {
            userId: currentUserId,
            department: snapshot.myDepartment,
            isAdmin: snapshot.isAdmin,
            canManagePool: snapshot.canManagePool,
        },
        today: new Date(),
    })

    return { leadDates, warnings, myJobsCount, stats, capacityRows }
}

export default function AlertPanels({
    snapshot,
    className,
    emptyFallback = null,
    compactWarnings = false,
    showMyJobs = true,
}: {
    snapshot: TrackingSnapshot
    /** ระยะขอบรอบแต่ละแผง — แผงไม่กำหนดระยะขอบของหน้าเอง หน้าที่เรียกเป็นคนกำหนด */
    className?: string
    /** แสดงแทนเมื่อไม่มีเรื่องแจ้งเตือนเลย (เช่นหน้า dashboard ที่เหลือแต่แผงนี้) */
    emptyFallback?: ReactNode
    /** แผงเตือนแบบแถบสรุปพับได้ — ใช้บนหน้าที่แผงไม่ใช่เนื้อหาหลัก (/jobs/tracking) */
    compactWarnings?: boolean
    /** false = ไม่แสดงแผง "งานในมือคุณ" — หน้าติดตามงานมีแถบ "ของฉัน" ที่ครอบคลุมอยู่แล้ว */
    showMyJobs?: boolean
}) {
    const { poolJobs, jobStatusLabels, currentUserId } = snapshot
    const { leadDates, warnings, myJobsCount, capacityRows } = buildAlertData(snapshot)
    if ((!showMyJobs || myJobsCount === 0) && warnings.length === 0 && capacityRows.length === 0) return <>{emptyFallback}</>

    // ทั้งสองแผงคืน null เองเมื่อว่าง — หน้าที่ไม่มีเรื่องเตือนจึงเหมือนเดิมทุกประการ
    return (
        <>
            {showMyJobs && (
                <MyJobsPanel
                    jobs={poolJobs}
                    leadDates={leadDates}
                    currentUserId={currentUserId}
                    statusLabels={jobStatusLabels}
                    className={className}
                />
            )}
            <DutyWarningPanel rows={warnings} collapsible={compactWarnings} className={className} />
            <CapacityPanel rows={capacityRows} className={className} />
        </>
    )
}
