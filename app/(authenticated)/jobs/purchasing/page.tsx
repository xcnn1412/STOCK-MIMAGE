import { Suspense } from 'react'
import PurchasingView from './purchasing-view'
import { getPurchasingSnapshot } from './data'

export const metadata = {
    title: 'จัดซื้อ — Jobs',
    description: 'เช็กลิสต์ของที่ต้องซื้อ ต้องสั่ง หรือต้องจัดการของแต่ละงาน — ใครรับผิดชอบ ถึงขั้นไหน และใช้เงินเท่าไร',
}

export default async function PurchasingPage({
    searchParams,
}: {
    searchParams: Promise<{ past?: string }>
}) {
    // ?past=1 = โหลดเช็กลิสต์ที่เสร็จและไม่ขยับเกิน 30 วันมาด้วย (ลิงก์ "แสดงทั้งหมด" ตั้งให้)
    // ตัวกรองอื่น (?view ?status ?mine ?q ?done ?list) ทำฝั่ง browser ทั้งหมด — server ไม่ต้องรู้
    const params = await searchParams
    const snapshot = await getPurchasingSnapshot({ includePast: params.past === '1' })

    // ยังไม่ได้รัน migration ของเมนูจัดซื้อ — บอกให้แจ้งผู้ดูแลระบบ ไม่แสดงอย่างอื่น
    if (snapshot.missingTables) {
        return (
            <div className="rounded-xl border border-zinc-200 bg-white px-5 py-6 dark:border-zinc-800 dark:bg-zinc-950">
                <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">เมนูจัดซื้อยังไม่พร้อมใช้งาน</h1>
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                    กรุณาแจ้งผู้ดูแลระบบให้ติดตั้งเมนูจัดซื้อให้เรียบร้อยก่อน แล้วเปิดหน้านี้อีกครั้ง
                </p>
            </div>
        )
    }

    // PurchasingView อ่าน ?view/?status/?list ฯลฯ ด้วย useSearchParams — ต้องอยู่ใต้ Suspense
    return (
        <Suspense fallback={null}>
            <PurchasingView
                lists={snapshot.lists}
                people={snapshot.people}
                templates={snapshot.templates}
                claims={snapshot.claims}
                currentUserId={snapshot.currentUserId}
                isAdmin={snapshot.isAdmin}
                myDepartment={snapshot.myDepartment}
                today={snapshot.today}
            />
        </Suspense>
    )
}
