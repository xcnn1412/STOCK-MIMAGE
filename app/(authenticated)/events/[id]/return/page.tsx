import { createServiceClient, supabaseServer as supabase } from '@/lib/supabase-server'
import { getEventManager } from '@/lib/event-permissions'
import { notFound, redirect } from 'next/navigation'
import { loadPackingListDetail, loadPackingListForEvent } from '../../../packing/queries'
import type { PackingListRow } from '../../../packing/types'
import CheckListForm from './return-checklist'
import { PackingCloseView, PackingNotReturned } from './packing-close-view'
import type { Item } from '@/types'

export const revalidate = 0

export default async function EventReturnPage(props: { params: Promise<{ id: string }> }) {
  if (!(await getEventManager('close'))) redirect('/events')
  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // Already closed — nothing to check in.
  if (event.status === 'completed') redirect('/events')

  // อีเวนต์ที่มีใบจัดของ: คืนแล้ว / คืนชั้นแล้ว (อีเวนต์ยังเปิด) = ยืนยันปิดงานแบบสรุป · ต่ำกว่านั้น = ยังไม่คืนของ (ปิดแบบเดิมไม่ได้)
  // ไม่มีใบ = หน้าเดิมทุกอย่าง
  const db = createServiceClient()
  let packingList: PackingListRow | null
  try {
    packingList = await loadPackingListForEvent(db, event.id)
  } catch (e) {
    console.error('EventReturnPage packing list', e)
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        โหลดใบจัดของของอีเวนต์นี้ไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง
      </div>
    )
  }
  if (packingList) {
    if (packingList.status === 'returned' || packingList.status === 'done') {
      const summary = await loadPackingListDetail(db, packingList.id).catch(e => {
        console.error('EventReturnPage packing summary', e)
        return null
      })
      if (summary) return <PackingCloseView detail={summary} />
      return (
        <div className="mx-auto max-w-xl rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
          โหลดสรุปคืนของไม่สำเร็จ — ลองโหลดหน้าใหม่อีกครั้ง
        </div>
      )
    }
    return <PackingNotReturned list={packingList} eventName={event.name || 'อีเวนต์'} />
  }

  // 1. Get kits assigned to event
  // กระเป๋าของอีเวนต์นี้ = การจอง (event_kits)
  const { data: booked } = await supabase.from('event_kits').select('kits(id, name)').eq('event_id', event.id)
  const kits = ((booked || []) as unknown as { kits: { id: string; name: string } | null }[])
    .map(b => b.kits)
    .filter((k): k is { id: string; name: string } => !!k)

  if (!kits) {
      // Should handle no kits gracefully
      return <CheckListForm event={event} itemsByKit={{}} />
  }

  // 2. Fetch contents for each kit
  // We need to fetch items for these kits.
  // kit_contents table links kit_id -> item_id
  // items table has the details
  
  const kitIds = kits.map(k => k.id)
  
  // Note: if kitIds is empty Supabase in() might fail or return nothing, strictly handled above but check just in case
  // items = อุปกรณ์ปกติ (เลือกสถานะ) · consumables = วัสดุสิ้นเปลือง + จำนวนประจำกระเป๋า (กรอกใช้ไป)
  const itemsByKit: Record<string, { kitName: string, items: Item[], consumables: Array<Item & { kitQuantity: number }> }> = {}
  
  if (kitIds.length > 0) {
      // We want to group by Kit.
      // Let's fetch kit_contents with items joined
      const { data: contents } = await supabase
        .from('kit_contents')
        .select(`
            kit_id, 
            quantity,
            items (*)
        `)
        .in('kit_id', kitIds)
        .overrideTypes<{ kit_id: string; quantity: number | null; items: Item | null }[], { merge: false }>()
      
      // Group them manually
      contents?.forEach((c) => {
          const kitName = kits.find(k => k.id === c.kit_id)?.name || 'กระเป๋า'
          if (!itemsByKit[c.kit_id]) {
              itemsByKit[c.kit_id] = { kitName, items: [], consumables: [] }
          }
          if (c.items?.is_consumable) {
              itemsByKit[c.kit_id].consumables.push({ ...c.items, kitQuantity: c.quantity || 1 })
          } else if (c.items) {
              itemsByKit[c.kit_id].items.push(c.items)
          }
      })
  }

  return (
    <CheckListForm event={event} itemsByKit={itemsByKit} />
  )
}
