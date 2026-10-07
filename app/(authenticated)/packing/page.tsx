import { redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { bangkokToday } from '../crm/types'
import { getPackingTeam } from './permissions'
import { loadPackingQueue } from './queries'
import type { PackingQueue } from './types'
import PackingQueueView from './packing-queue-view'

export const revalidate = 0

export const metadata = {
  title: 'ใบจัดของ — คลังอุปกรณ์',
  description: 'คิวงานของทีมจัดของ: งานที่รอเปิดใบ ใบที่กำลังทำ และใบที่พร้อมรับ',
}

/** คิววันนี้ (เวลาไทย) · โหลดพัง = คิวว่าง + ข้อความ (ยังไม่รัน migration ก็ไม่ล้มทั้งหน้า) */
async function loadQueue(): Promise<{ queue: PackingQueue; loadError: string | null }> {
  try {
    return { queue: await loadPackingQueue(createServiceClient(), bangkokToday(Date.now())), loadError: null }
  } catch (e) {
    console.error('PackingPage', e)
    return {
      queue: { awaiting: [], active: [], ready: [] },
      loadError: 'โหลดคิวใบจัดของไม่สำเร็จ — ลองโหลดหน้าใหม่ (ถ้าเพิ่งอัปเดตระบบ ให้แอดมินรัน migration 20261012 ก่อน)',
    }
  }
}

/** คิวใบจัดของ — แอดมินและทีมจัดของเท่านั้น */
export default async function PackingPage() {
  if (!(await getPackingTeam())) redirect('/stock/dashboard')
  const { queue, loadError } = await loadQueue()
  return <PackingQueueView queue={queue} loadError={loadError} />
}
