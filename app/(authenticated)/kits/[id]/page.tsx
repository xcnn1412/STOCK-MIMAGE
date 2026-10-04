import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import KitDetailsView, { type KitBookingRow } from './kit-details-view'
import { getKitManager, loadBookingsForKits } from '@/lib/kit-bookings'
import { hasModule } from '@/lib/stock'
import { onShelf } from '@/app/(authenticated)/shelves/consumable-logic'

export const revalidate = 0

export default async function KitDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: kit } = await supabase.from('kits').select('*, events(name, event_date), shelves(id, code)').eq('id', params.id).single()

  if (!kit) notFound()

  // Get contents
  const { data: contents } = await supabase
    .from('kit_contents')
    .select('id, quantity, items(*)')
    .eq('kit_id', kit.id)

  // Get all items currently assigned to ANY kit to prevent duplicates
  const { data: allAssignedContents } = await supabase.from('kit_contents').select('item_id, kit_id, quantity')
  const assignedItemIds = new Set(allAssignedContents?.map((c: any) => c.item_id))
  const inThisKit = new Set(allAssignedContents?.filter(c => c.kit_id === kit.id).map(c => c.item_id))
  const inKitsQty = new Map<string, number>()
  for (const c of allAssignedContents || []) inKitsQty.set(c.item_id, (inKitsQty.get(c.item_id) || 0) + (c.quantity || 0))

  const { data: allItems } = await supabase.from('items').select('*').eq('status', 'available').order('name')

  // อุปกรณ์ปกติ: ไม่อยู่ในกระเป๋าใบใด · วัสดุสิ้นเปลือง: ไม่อยู่ในใบนี้ (อยู่หลายใบได้) + เหลือบนชั้น
  const availableItems = (allItems || [])
    .filter(item => (item.is_consumable ? !inThisKit.has(item.id) : !assignedItemIds.has(item.id)))
    .map(item => (item.is_consumable ? { ...item, on_shelf: onShelf(item.quantity ?? 0, inKitsQty.get(item.id) || 0) } : item))

  // งานที่จองกระเป๋านี้ (ยังไม่ปิด) เรียงตามวันงาน
  const [bookings, canManage, eventsUser] = await Promise.all([
    loadBookingsForKits(createServiceClient(), [kit.id]),
    getKitManager(),
    hasModule('events'),
  ])
  const openBookings: KitBookingRow[] = bookings
    .filter(b => !b.closed)
    .sort((a, b) => (a.eventDate ?? '9999').localeCompare(b.eventDate ?? '9999') || (a.eventTime ?? '').localeCompare(b.eventTime ?? ''))
    .map(b => ({ eventId: b.eventId, eventName: b.eventName, eventDate: b.eventDate, packed: b.packed }))

  return (
    <KitDetailsView
      kit={kit as any}
      contents={(contents || []) as any}
      availableItems={availableItems}
      canManage={!!canManage}
      bookings={openBookings}
      canOpenEvents={!!eventsUser}
    />
  )
}
