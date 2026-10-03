import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import ShelvesView, { type ShelfRow } from './shelves-view'

export const revalidate = 0

export default async function ShelvesPage() {
  const supabase = createServiceClient()
  const [{ data: shelves }, { data: kits }, { data: items }, manager] = await Promise.all([
    supabase.from('shelves').select('id, zone, code, name, note').order('code'),
    supabase.from('kits').select('shelf_id').not('shelf_id', 'is', null),
    supabase.from('items').select('shelf_id').not('shelf_id', 'is', null),
    getKitManager(),
  ])

  const count = (rows: { shelf_id: string | null }[] | null, id: string) => (rows || []).filter(r => r.shelf_id === id).length
  const rows: ShelfRow[] = (shelves || []).map(s => ({
    id: s.id as string,
    zone: s.zone as string,
    code: s.code as string,
    name: (s.name as string | null) ?? null,
    note: (s.note as string | null) ?? null,
    kitCount: count(kits, s.id as string),
    itemCount: count(items, s.id as string),
  }))

  return <ShelvesView shelves={rows} canManage={!!manager} />
}
