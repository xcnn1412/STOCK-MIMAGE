import { supabaseServer as supabase } from '@/lib/supabase-server'
import KitsView, { type KitCard } from './kits-view'
import { getKitManager } from '@/lib/kit-bookings'

export const revalidate = 0

type KitRow = {
  id: string
  name: string
  description: string | null
  shelves: { id: string; code: string } | null
  events: { name: string | null; event_date: string | null } | null
  kit_contents: { id: string; items: { status: string; is_consumable: boolean | null } | null }[] | null
}

export default async function KitsPage() {
  const { data } = await supabase
    .from('kits')
    .select('*, shelves(id, code), events(name, event_date), kit_contents(id, items(status, is_consumable))')
    .order('name')

  const kits: KitCard[] = ((data || []) as unknown as KitRow[]).map(k => ({
    id: k.id,
    name: k.name,
    description: k.description,
    itemCount: k.kit_contents?.length || 0,
    shelf: k.shelves,
    event: k.events,
    // สถานะของอุปกรณ์ปกติ (วัสดุสิ้นเปลืองไม่มีสถานะออกงาน)
    statuses: (k.kit_contents || []).filter(c => c.items && !c.items.is_consumable).map(c => c.items!.status),
  }))

  return <KitsView kits={kits} canManage={!!(await getKitManager())} />
}
