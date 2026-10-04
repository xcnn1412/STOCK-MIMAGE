import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'
import QrSheetView, { type QrLabel } from '../../shelves/rooms/[roomId]/print/qr-sheet-view'

export const revalidate = 0

// พิมพ์ QR ของกระเป๋าทุกใบลง A4 — QR พาไปหน้านำออก / รับคืน (/kits/<id>/check) เหมือนป้ายเดี่ยว
export default async function KitsQrPrintPage() {
  const { data: kits } = await createServiceClient().from('kits').select('id, name')

  // โดเมนจริงของคำขอ (หลัง proxy ของ Railway ใช้ x-forwarded-*) — QR ต้องเป็นลิงก์เต็ม
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')
  const origin = `${proto}://${host}`

  const labels: QrLabel[] = (kits || [])
    .map(k => ({ id: k.id as string, code: k.name as string, url: `${origin}/kits/${k.id}/check` }))
    .sort((a, b) => a.code.localeCompare(b.code, 'th', { numeric: true }))

  return (
    <QrSheetView
      title="QR กระเป๋าทั้งหมด"
      subtitle={`${labels.length} กระเป๋า`}
      backHref="/kits"
      caption="สแกนเพื่อนำออก / รับคืน"
      emptyText="ยังไม่มีกระเป๋า"
      labels={labels}
    />
  )
}
