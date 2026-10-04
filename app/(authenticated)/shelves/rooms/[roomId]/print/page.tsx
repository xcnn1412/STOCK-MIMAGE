import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'
import QrSheetView, { type QrLabel } from './qr-sheet-view'

export const revalidate = 0

// พิมพ์ QR ของทุกระดับชั้นในห้องนี้ลง A4 — QR พาไปหน้าระดับชั้น (/shelves/<id>) เหมือนป้ายเดี่ยว
export default async function RoomQrPrintPage(props: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await props.params
  const supabase = createServiceClient()

  const [{ data: room }, { data: racks }] = await Promise.all([
    supabase.from('shelf_rooms').select('id, name').eq('id', roomId).maybeSingle(),
    supabase.from('shelf_racks').select('id, code').eq('room_id', roomId),
  ])
  if (!room) notFound()

  const rackIds = (racks || []).map(r => r.id as string)
  const { data: levels } = rackIds.length
    ? await supabase.from('shelves').select('id, code, level, rack_id').in('rack_id', rackIds)
    : { data: [] as { id: string; code: string; level: number; rack_id: string }[] }

  // เรียงตามรหัสชั้นวาง (A-2 ก่อน A-10) แล้วตามระดับ ล่าง → บน
  const rackCode = new Map((racks || []).map(r => [r.id as string, r.code as string]))
  const cmp = (a: string, b: string) => a.localeCompare(b, 'th', { numeric: true })
  const sorted = (levels || [])
    .map(l => ({ id: l.id as string, code: l.code as string, level: l.level as number, rack: rackCode.get(l.rack_id as string) ?? '' }))
    .sort((a, b) => cmp(a.rack, b.rack) || a.level - b.level)

  // โดเมนจริงของคำขอ (หลัง proxy ของ Railway ใช้ x-forwarded-*) — QR ต้องเป็นลิงก์เต็ม
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  const origin = `${proto}://${host}`
  const labels: QrLabel[] = sorted.map(({ id, code }) => ({ id, code, url: `${origin}/shelves/${id}` }))

  return (
    <QrSheetView
      title="พิมพ์ QR ทั้งห้อง"
      subtitle={`${room.name} · ${labels.length} ระดับชั้น`}
      backHref={`/shelves/rooms/${room.id}`}
      caption={room.name as string}
      emptyText="ห้องนี้ยังไม่มีระดับชั้น — เพิ่มชั้นวางในห้องก่อน"
      labels={labels}
    />
  )
}
