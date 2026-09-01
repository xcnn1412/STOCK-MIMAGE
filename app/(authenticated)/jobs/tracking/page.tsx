import { Suspense } from 'react'
import AlertPanels from '@/components/dashboard-alerts/alert-panels'
import TrackingView from './tracking-view'
import { getTrackingSnapshot } from './data'

export const metadata = {
    title: 'ติดตามงาน — Jobs',
    description: 'งานที่ลูกค้าตอบรับแล้ว — ดูว่างานไหนใกล้ถึง อยู่ขั้นไหน และยังขาดอะไร',
}

export default async function TrackingPage() {
    // ข้อมูลทั้งชุดประกอบใน data.ts — หน้านี้เหลือแค่ส่งต่อเป็น props
    const snapshot = await getTrackingSnapshot()
    const {
        rows,
        roleLabels,
        roles,
        people,
        poolJobs,
        dutyClaims,
        jobStatusLabels,
        currentUserId,
        canManagePool,
        isAdmin,
        kits,
        kitBookings,
        eventVehicles,
        canManageKits,
    } = snapshot

    // TrackingView อ่าน ?tab/?view/?date/?mode ด้วย useSearchParams — ต้องอยู่ใต้ Suspense
    return (
        <Suspense fallback={null}>
            {/* แผงแจ้งเตือนชุดเดียวกับ dashboard — เหนือพูลงาน (แผงว่างคืน null ไม่กินพื้นที่)
                คำเตือนเป็นแถบสรุปพับได้ เพราะหน้านี้พูลคือเนื้อหาหลัก และตารางมีป้าย "สิ่งที่ยังขาด" อยู่แล้ว */}
            <AlertPanels snapshot={snapshot} compactWarnings />
            <TrackingView
                leads={rows}
                roleLabels={roleLabels}
                roles={roles}
                people={people}
                jobs={poolJobs}
                dutyClaims={dutyClaims}
                jobStatusLabels={jobStatusLabels}
                currentUserId={currentUserId}
                canManagePool={canManagePool}
                isAdmin={isAdmin}
                kits={kits}
                kitBookings={kitBookings}
                eventVehicles={eventVehicles}
                canManageKits={canManageKits}
            />
        </Suspense>
    )
}
