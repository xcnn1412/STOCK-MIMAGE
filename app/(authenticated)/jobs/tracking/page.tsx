import { Suspense } from 'react'
import AlertPanels from '@/components/dashboard-alerts/alert-panels'
import TrackingView from './tracking-view'
import { getTrackingSnapshot } from './data'

export const metadata = {
    title: 'ติดตามงาน — Jobs',
    description: 'งานที่ลูกค้าตอบรับแล้ว — ดูว่างานไหนใกล้ถึง อยู่ขั้นไหน และยังขาดอะไร',
}

export default async function TrackingPage({
    searchParams,
}: {
    searchParams: Promise<{ past?: string }>
}) {
    // ?past=1 = โหลดงานที่ผ่านมาแล้วเกิน 30 วันด้วย (ปุ่ม "แสดงงานที่ผ่านแล้ว" ตั้งให้)
    const params = await searchParams
    // ข้อมูลทั้งชุดประกอบใน data.ts — หน้านี้เหลือแค่ส่งต่อเป็น props
    const snapshot = await getTrackingSnapshot({ includePast: params.past === '1' })
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
        myDepartment,
        poolDepartments,
    } = snapshot

    // TrackingView อ่าน ?tab/?view/?date/?mode ด้วย useSearchParams — ต้องอยู่ใต้ Suspense
    return (
        <Suspense fallback={null}>
            {/* แผงแจ้งเตือนชุดเดียวกับ dashboard — เหนือพูลงาน (แผงว่างคืน null ไม่กินพื้นที่)
                คำเตือนเป็นแถบสรุปพับได้ เพราะหน้านี้พูลคือเนื้อหาหลัก และตารางมีป้าย "สิ่งที่ยังขาด" อยู่แล้ว */}
            {/* แผง "งานในมือคุณ" ไม่ต้อง — แถบ "ของฉัน" ในภาพรวมครอบคลุมแล้ว เหลือแค่แถบเตือนหน้าที่ยังไม่ครบ */}
            <AlertPanels snapshot={snapshot} compactWarnings showMyJobs={false} />
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
                myDepartment={myDepartment}
                poolDepartments={poolDepartments}
            />
        </Suspense>
    )
}
