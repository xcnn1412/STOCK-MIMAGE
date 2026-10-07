import { createServiceClient, supabaseServer as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import CheckKitsView from './check-kits-view'
import type { Kit } from '@/types'
import type { PackItem } from '@/app/(authenticated)/shelves/consumable-logic'
import { loadPackingListForEvent } from '@/app/(authenticated)/packing/queries'
import { getPackingTeam } from '@/app/(authenticated)/packing/permissions'

export default async function EventKitsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // กระเป๋าของอีเวนต์นี้ = การจอง (event_kits) + สถานะอุปกรณ์ในกระเป๋า (คิด "จัดครบ" จาก packState ที่หน้าจอ — packed_at อาจค้างกติกาเก่า)
  const { data: booked } = await supabase
    .from('event_kits')
    .select('kits(*, kit_contents(items(id, name, status, is_consumable)))')
    .eq('event_id', event.id)
  type BookedKit = Omit<Kit, 'kit_contents'> & { kit_contents?: { items: PackItem | null }[] | null }
  const kits = ((booked || []) as unknown as { kits: BookedKit | null }[])
    .filter(b => b.kits)
    .map(b => {
      const { kit_contents, ...kit } = b.kits as BookedKit
      const items = (kit_contents || []).map(c => c.items).filter((i): i is PackItem => !!i)
      return { ...kit, items }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  // อีเวนต์ที่มีใบจัดของ → แบนเนอร์พาไปใบ (ลิงก์เฉพาะทีมจัดของที่เข้า /packing ได้) · ยังไม่รัน migration/อ่านไม่ได้ = หน้าเดิม
  const [packingList, packingTeam] = await Promise.all([
    loadPackingListForEvent(createServiceClient(), event.id).catch(e => {
      console.error('[check-kits] packing list', e)
      return null
    }),
    getPackingTeam(),
  ])
  const packing = packingList ? { id: packingList.id, canOpen: !!packingTeam } : null

  return <CheckKitsView event={event} kits={kits} packing={packing} />
}
