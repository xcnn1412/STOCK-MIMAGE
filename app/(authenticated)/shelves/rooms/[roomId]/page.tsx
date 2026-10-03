import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import { loadRoom } from '../../queries'
import RoomView from './room-view'

export const revalidate = 0

export default async function RoomPage(props: { params: Promise<{ roomId: string }> }) {
  const { roomId } = await props.params
  const supabase = createServiceClient()
  const [room, manager, { data: loose }] = await Promise.all([
    loadRoom(supabase, roomId),
    getKitManager(),
    // ชั้นเดิมที่ยังไม่อยู่ในห้อง — ให้ผู้จัดการย้ายเข้าเป็นระดับของชั้นวางได้
    supabase.from('shelves').select('id, code').is('rack_id', null).order('code'),
  ])
  if (!room) notFound()

  return (
    <RoomView
      room={room}
      canManage={!!manager}
      looseShelves={manager ? ((loose || []) as { id: string; code: string }[]) : []}
    />
  )
}
