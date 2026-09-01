import { Suspense } from 'react'
import TrackingView from './tracking-view'
import { getTrackingSnapshot } from './data'

export const metadata = {
    title: 'ติดตามงาน — Jobs',
    description: 'งานที่ลูกค้าตอบรับแล้ว — ดูว่างานไหนใกล้ถึง อยู่ขั้นไหน และยังขาดอะไร',
}

export default async function TrackingPage() {
    // ข้อมูลทั้งชุดประกอบใน data.ts — หน้านี้เหลือแค่ส่งต่อเป็น props
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
    } = await getTrackingSnapshot()

    // TrackingView อ่าน ?tab/?view/?date/?mode ด้วย useSearchParams — ต้องอยู่ใต้ Suspense
    return (
        <Suspense fallback={null}>
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
