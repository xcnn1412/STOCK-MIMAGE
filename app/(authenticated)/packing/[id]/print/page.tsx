import { notFound, redirect } from 'next/navigation'
import { requestOrigin } from '@/lib/request-origin'
import { createServiceClient } from '@/lib/supabase-server'
import { getPackingTeam } from '../../permissions'
import { loadPackingListDetail } from '../../queries'
import PackingPrintView from './print-view'

export const revalidate = 0

export const metadata = { title: 'พิมพ์ใบจัดของ — คลังอุปกรณ์' }

/** ใบจัดของแบบ A4 — เรียงตามเส้นทางหยิบ มีช่องติ๊ก + QR กลับมาหน้าใบบนมือถือ · ทีมจัดของเท่านั้น */
export default async function PackingPrintPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getPackingTeam())) redirect('/stock/dashboard')
  const { id } = await params
  const detail = await loadPackingListDetail(createServiceClient(), id)
  if (!detail) notFound()
  const origin = await requestOrigin()
  return <PackingPrintView detail={detail} qrUrl={`${origin}/packing/${id}`} />
}
