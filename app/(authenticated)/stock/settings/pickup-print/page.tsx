import { redirect } from 'next/navigation'
import { getKitManager } from '@/lib/kit-bookings'
import { requestOrigin } from '@/lib/request-origin'
import { createServiceClient } from '@/lib/supabase-server'
import { loadPickupSpots } from '../../../packing/queries'
import type { PickupSpot } from '../../../packing/types'
import QrSheetView, { type QrLabel } from '../../../shelves/rooms/[roomId]/print/qr-sheet-view'

export const revalidate = 0

export const metadata = { title: 'พิมพ์ QR จุดรับของ — ตั้งค่าคลัง' }

// พิมพ์ QR ของจุดรับของที่เปิดใช้ทุกจุดลง A4 — QR พาไปหน้าจุดรับของ (/pickup/<id>) · admin และแผนกที่ดูแลอุปกรณ์เท่านั้น
export default async function PickupSpotsPrintPage() {
  if (!(await getKitManager())) redirect('/stock/dashboard')
  const spots = await loadPickupSpots(createServiceClient()).catch((): PickupSpot[] => [])
  const origin = await requestOrigin()

  const labels: QrLabel[] = spots.map(s => ({ id: s.id, code: `${s.code} · ${s.name}`, url: `${origin}/pickup/${s.id}` }))

  return (
    <QrSheetView
      title="QR จุดรับของ"
      subtitle={`${labels.length} จุด`}
      backHref="/stock/settings"
      caption="สแกนเพื่อรับของ / คืนของ"
      emptyText="ยังไม่มีจุดรับของที่เปิดใช้ — เพิ่มที่ตั้งค่าคลัง"
      labels={labels}
    />
  )
}
