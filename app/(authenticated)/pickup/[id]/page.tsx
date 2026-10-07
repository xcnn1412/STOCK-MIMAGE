import { notFound } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { getHandoverUser } from '../../packing/permissions'
import { loadListsAtSpot, loadPickupSpot } from '../../packing/queries'
import PickupView from './pickup-view'

export const revalidate = 0

export const metadata = { title: 'จุดรับของ — คลังอุปกรณ์' }

/**
 * หน้าจุดรับของ (ปลายทาง QR ที่ติดไว้ที่จุด) — ทุกคนที่ผ่าน proxy (stock หรือ events) ดูได้
 * ใบที่วางไว้ที่จุดนี้: พร้อมรับ (รับของ) · ออกงาน (คืนของ) · คืนแล้ว (รอทีมจัดของคืนชั้น)
 * ปุ่มรับของ/คืนของแสดงเฉพาะ "ผู้รับของ" (getHandoverUser) — คนอื่นดูอย่างเดียว · ลิงก์เปิดใบเฉพาะคนที่มีสิทธิ์คลังอุปกรณ์
 */
export default async function PickupSpotPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const db = createServiceClient()
  const spot = await loadPickupSpot(db, id).catch(() => null)
  if (!spot) notFound()

  const [auth, handover] = await Promise.all([requireAuth(), getHandoverUser()])
  let lists: Awaited<ReturnType<typeof loadListsAtSpot>> = []
  let loadError: string | null = null
  try {
    lists = await loadListsAtSpot(db, id, ['ready', 'out', 'returned'], auth?.userId ?? null)
  } catch (e) {
    console.error('PickupSpotPage', e)
    loadError = 'โหลดใบจัดของที่จุดนี้ไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง'
  }
  let canOpenLists = auth?.role === 'admin'
  if (!canOpenLists && auth?.userId) {
    const { data } = await db.from('profiles').select('allowed_modules').eq('id', auth.userId).maybeSingle<{ allowed_modules: string[] | null }>()
    canOpenLists = (data?.allowed_modules ?? []).includes('stock')
  }

  return <PickupView spot={spot} lists={lists} canOpenLists={canOpenLists} canAct={!!handover} loadError={loadError} />
}
