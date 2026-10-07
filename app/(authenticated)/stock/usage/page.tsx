import { createServiceClient } from '@/lib/supabase-server'
import { loadUsageData } from '../../packing/usage-data'
import UsageView from './usage-view'

export const revalidate = 0

/** การใช้งานอุปกรณ์ — ทุกคนที่มีสิทธิ์สต็อก (proxy.ts MODULE_ROUTES.stock) · ตัวเลขทั้งหมดคำนวณใน packing/usage-logic.ts */
export default async function StockUsagePage() {
  const data = await loadUsageData(createServiceClient())
  return <UsageView {...data} />
}
