import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import ShelfView, { type ShelfKit, type ShelfItem, type Candidate } from './shelf-view'

export const revalidate = 0

// หน้าที่ QR ติดชั้นพาไป — ดูได้ทุกคนที่มีสิทธิ์ stock (proxy) / จัดการได้เฉพาะ admin + แผนกดูแลกระเป๋า
export default async function ShelfPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = createServiceClient()

  const [{ data: shelf }, { data: kits }, { data: items }, manager] = await Promise.all([
    supabase.from('shelves').select('id, zone, code, name, note').eq('id', id).maybeSingle(),
    supabase
      .from('kits')
      .select('id, name, events(name, event_date), kit_contents(items(id, name, status))')
      .eq('shelf_id', id)
      .order('name'),
    supabase.from('items').select('id, name, serial_number, status, quantity').eq('shelf_id', id).order('name'),
    getKitManager(),
  ])
  if (!shelf) notFound()

  type RawKit = {
    id: string
    name: string
    events: { name: string | null; event_date: string | null } | null
    kit_contents: { items: { id: string; name: string; status: string } | null }[] | null
  }
  const shelfKits: ShelfKit[] = ((kits || []) as unknown as RawKit[]).map(k => ({
    id: k.id,
    name: k.name,
    event: k.events,
    items: (k.kit_contents || []).map(c => c.items).filter((i): i is { id: string; name: string; status: string } => !!i)
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))

  // ตัวเลือก "เพิ่มเข้าชั้น" — โหลดเฉพาะคนที่จัดการได้
  let kitCandidates: Candidate[] = []
  let itemCandidates: Candidate[] = []
  if (manager) {
    const [{ data: allKits }, { data: allItems }, { data: inKits }, { data: shelves }] = await Promise.all([
      supabase.from('kits').select('id, name, shelf_id').order('name'),
      supabase.from('items').select('id, name, serial_number, shelf_id').order('name'),
      supabase.from('kit_contents').select('item_id'),
      supabase.from('shelves').select('id, code'),
    ])
    const codeOf = new Map((shelves || []).map(s => [s.id as string, s.code as string]))
    const inKit = new Set((inKits || []).map(r => r.item_id as string))
    kitCandidates = (allKits || [])
      .filter(k => k.shelf_id !== id)
      .map(k => ({ id: k.id as string, label: k.name as string, currentShelf: k.shelf_id ? codeOf.get(k.shelf_id as string) ?? null : null }))
    // อุปกรณ์ในกระเป๋าอยู่ตามกระเป๋า — วางเองไม่ได้
    itemCandidates = (allItems || [])
      .filter(i => i.shelf_id !== id && !inKit.has(i.id as string))
      .map(i => ({
        id: i.id as string,
        label: i.serial_number ? `${i.name} (${i.serial_number})` : (i.name as string),
        currentShelf: i.shelf_id ? codeOf.get(i.shelf_id as string) ?? null : null,
      }))
  }

  return (
    <ShelfView
      shelf={{
        id: shelf.id as string,
        zone: shelf.zone as string,
        code: shelf.code as string,
        name: (shelf.name as string | null) ?? null,
        note: (shelf.note as string | null) ?? null,
      }}
      kits={shelfKits}
      items={(items || []) as ShelfItem[]}
      canManage={!!manager}
      kitCandidates={kitCandidates}
      itemCandidates={itemCandidates}
    />
  )
}
