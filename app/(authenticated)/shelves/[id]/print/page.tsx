import { notFound } from 'next/navigation'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase-server'
import PrintView from './print-view'

export default async function ShelfPrintPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const { data: shelf } = await createServiceClient().from('shelves').select('id, zone, code, name').eq('id', id).maybeSingle()
  if (!shelf) notFound()

  // โดเมนจริงของคำขอ (หลัง proxy ของ Railway ใช้ x-forwarded-*) — QR ต้องเป็นลิงก์เต็ม
  const h = await headers()
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000'
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https')

  return (
    <PrintView
      origin={`${proto}://${host}`}
      shelf={{ id: shelf.id as string, zone: shelf.zone as string, code: shelf.code as string, name: (shelf.name as string | null) ?? null }}
    />
  )
}
