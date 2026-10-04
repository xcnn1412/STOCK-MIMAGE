import { requireAuth } from '@/lib/auth'
import { loadCommissionData } from '../commission-data'
import CommissionView from './commission-view'

export const metadata = { title: 'สรุปค่าคอมแอดมิน — Sales Board' }
export const revalidate = 0

// อยู่ใต้ /sales-board → proxy.ts บังคับ module 'salesboard' แล้ว (prefix match)
// ตัวโหลดข้อมูลอยู่ใน commission-data.ts (ใช้ร่วมกับ tool commission_summary ของ MCP)
export default async function CommissionPage() {
  // สรุปการเงินเฉพาะ admin — role จากฐานข้อมูลผ่าน requireAuth() เท่านั้น
  const session = await requireAuth()
  const isAdmin = session?.role === 'admin'
  const d = await loadCommissionData(isAdmin)
  return (
    <CommissionView
      leads={d.leads} lockDates={d.lockDates} today={d.today}
      initialTargets={d.initialTargets} statusLabels={d.statusLabels}
      isAdmin={isAdmin} unitCountAvailable={d.unitCountAvailable} finance={d.finance}
    />
  )
}
