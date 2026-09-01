// หน้าสถิติทีม /reports — ทุกคนที่ล็อกอินเข้าได้ (อยู่นอก MODULE_ROUTES แบบเดียวกับ /whats-new)
// ข้อมูลประกอบใน data.ts (ใช้ร่วมกับการ์ดอันดับบน /dashboard) — หน้านี้เหลือแค่ส่งต่อเป็น props
import { getReportStats } from './data'
import ReportsView from './reports-view'

export const metadata = {
    title: 'สถิติทีม — Reports',
    description: 'ใครออกงานอีเวนต์กี่ครั้ง ใครรับหน้าที่จัดคน/จัดรถ/จัดกระเป๋า และใครรับใบงานกราฟิก',
}

export default async function ReportsPage() {
    const { rows, people, currentUserId, today } = await getReportStats()
    // ส่ง today ไปด้วยเพื่อให้ชิปช่วงเวลาฝั่ง client คิดจากวันเดียวกับ server (hydration ตรงกัน)
    return <ReportsView rows={rows} people={people} currentUserId={currentUserId} today={today} />
}
