import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import { loadPackages } from './queries'
import PackagesView from './packages-view'

export const revalidate = 0

/** แพ็กเกจ — ทุกคนที่มีสิทธิ์คลังดูได้ · แก้ได้เฉพาะ admin และแผนกที่ดูแลอุปกรณ์ */
export default async function PackagesPage() {
  const [manager, packages] = await Promise.all([getKitManager(), loadPackages(createServiceClient(), { includeInactive: true })])
  return <PackagesView packages={packages} canEdit={!!manager} />
}
