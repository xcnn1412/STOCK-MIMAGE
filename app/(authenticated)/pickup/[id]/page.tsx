import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { loadListsAtSpot, loadPickupSpot } from '../../packing/queries'
import PickupView from './pickup-view'

export const revalidate = 0

export const metadata = { title: 'จุดรับของ — คลังอุปกรณ์' }

/**
 * หน้าจุดรับของ (ปลายทาง QR ที่ติดไว้ที่จุด) — ทุกคนที่ผ่าน proxy (stock หรือ events) ดูได้ · อ่านอย่างเดียวในเฟส 3
 * แสดงใบจัดของที่วางไว้ที่จุดนี้ สถานะ พร้อมรับ/ออกงาน · ลิงก์เปิดใบเฉพาะคนที่มีสิทธิ์คลังอุปกรณ์
 */
export default async function PickupSpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()
  const spot = await loadPickupSpot(db, id).catch(() => null)
  if (!spot) notFound()

  const [lists, auth] = await Promise.all([loadListsAtSpot(db, id), requireAuth()])
  let canOpenLists = auth?.role === 'admin'
  if (!canOpenLists && auth?.userId) {
    const { data } = await db.from('profiles').select('allowed_modules').eq('id', auth.userId).maybeSingle<{ allowed_modules: string[] | null }>()
    canOpenLists = (data?.allowed_modules ?? []).includes('stock')
  }

  return <PickupView spot={spot} lists={lists} canOpenLists={canOpenLists} />
}
