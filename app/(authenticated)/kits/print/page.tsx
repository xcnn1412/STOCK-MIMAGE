import { requestOrigin } from '@/lib/request-origin'
import { createServiceClient } from '@/lib/supabase-server'
import QrSheetView, { type QrLabel } from '../../shelves/rooms/[roomId]/print/qr-sheet-view'

export const revalidate = 0

// พิมพ์ QR ของกระเป๋าทุกใบลง A4 — QR พาไปหน้านำออก / รับคืน (/kits/<id>/check) เหมือนป้ายเดี่ยว
export default async function KitsQrPrintPage() {
  const { data: kits } = await createServiceClient().from('kits').select('id, name')

  const origin = await requestOrigin()

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
