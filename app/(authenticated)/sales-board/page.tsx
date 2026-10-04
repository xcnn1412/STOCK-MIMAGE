import SalesBoardView from './sales-board-view'
import { loadSalesBoardData } from './sales-data'

export const metadata = { title: 'สรุปยอดขาย — Sales Board' }
export const revalidate = 0

// เข้าได้เฉพาะผู้มี module 'salesboard' (admin เข้าได้เสมอ) — บังคับที่ proxy.ts MODULE_ROUTES
// ตัวโหลดข้อมูลอยู่ใน sales-data.ts (ใช้ร่วมกับ tool sales_summary ของ MCP)
export default async function SalesBoardPage() {
  const d = await loadSalesBoardData()
  return (
    <SalesBoardView
      leads={d.leads} claims={d.claims} installments={d.installments}
      jobEvents={d.jobEvents} costItems={d.costItems}
      initialTargets={d.targetStore} packageLabels={d.packageLabels}
    />
  )
}
