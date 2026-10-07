import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import type { CategoryUnit } from '../../packages/types'
import { getPackingTeam } from '../permissions'
import { loadExtraUnits, loadPackingListDetail, loadPickupSpots } from '../queries'
import type { PackingListDetail, PickupSpot } from '../types'
import PackingListView from './packing-list-view'

export const revalidate = 0

export const metadata = { title: 'ใบจัดของ — คลังอุปกรณ์' }

/** หน้าใบจัดของ: เลือกของ → กำลังหยิบ → พร้อมรับ → ออกงาน → คืนแล้ว (คืนชั้น) → คืนชั้นแล้ว — แอดมินและทีมจัดของเท่านั้น */
export default async function PackingListPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getPackingTeam())) redirect('/stock/dashboard')
  const { id } = await params
  const db = createServiceClient()

  let detail: PackingListDetail | null
  try {
    detail = await loadPackingListDetail(db, id)
  } catch (e) {
    console.error('PackingListPage', e)
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        โหลดใบจัดของไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง
      </div>
    )
  }
  if (!detail) notFound()

  // ของเสริม (ทุกหน่วยในคลัง) ใช้ตอนเลือกของ และตอนเปลี่ยนของของบรรทัดของเสริม · จุดรับของใช้ตอนยืนยัน
  const editing = detail.list.status === 'selecting' || detail.list.status === 'picking'
  const [extraUnits, spots] = await Promise.all([
    editing ? loadExtraUnits(db).catch((): CategoryUnit[] => []) : Promise.resolve<CategoryUnit[]>([]),
    loadPickupSpots(db).catch((): PickupSpot[] => []),
  ])

  return <PackingListView detail={detail} extraUnits={extraUnits} spots={spots} />
}
