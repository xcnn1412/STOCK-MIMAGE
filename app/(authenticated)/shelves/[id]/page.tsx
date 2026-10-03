import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import ShelfView, { type ShelfKit, type ShelfItem, type Candidate, type AuditRow, type RackInfo } from './shelf-view'
import type { ConsumableRow } from './consumables-section'

export const revalidate = 0

// หน้าที่ QR ติดชั้นพาไป — ดูได้ทุกคนที่มีสิทธิ์ stock (proxy) / จัดการได้เฉพาะ admin + แผนกดูแลกระเป๋า
export default async function ShelfPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params
  const supabase = createServiceClient()

  const [{ data: shelf }, { data: kits }, { data: items }, manager, { data: audits }] = await Promise.all([
    supabase.from('shelves').select('id, zone, code, name, note, rack_id, level').eq('id', id).maybeSingle(),
    supabase
      .from('kits')
      .select('id, name, events(name, event_date), kit_contents(items(id, name, status))')
      .eq('shelf_id', id)
      .order('name'),
    supabase
      .from('items')
      .select('id, name, serial_number, status, quantity, is_consumable, unit, min_quantity')
      .eq('shelf_id', id)
      .order('name'),
    getKitManager(),
    supabase
      .from('shelf_audits')
      .select('id, created_at, expected_count, found_count, missing, note, profiles:audited_by(full_name, nickname)')
      .eq('shelf_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
  ])
  if (!shelf) notFound()

  // อุปกรณ์แยกชิ้นปกติ vs วัสดุสิ้นเปลือง (กองกลางบนชั้น + จำนวนที่แบ่งใส่กระเป๋า)
  type RawItem = ShelfItem & { is_consumable: boolean | null; unit: string | null; min_quantity: number | null }
  const rawItems = (items || []) as RawItem[]
  const looseItems: ShelfItem[] = rawItems
    .filter(i => !i.is_consumable)
    .map(i => ({ id: i.id, name: i.name, serial_number: i.serial_number, status: i.status, quantity: i.quantity }))
  const consumableItems = rawItems.filter(i => i.is_consumable)
  const { data: packed } = consumableItems.length
    ? await supabase.from('kit_contents').select('item_id, quantity').in('item_id', consumableItems.map(i => i.id))
    : { data: [] as { item_id: string; quantity: number }[] }
  const inKitsOf = new Map<string, number>()
  for (const r of packed || []) inKitsOf.set(r.item_id as string, (inKitsOf.get(r.item_id as string) ?? 0) + ((r.quantity as number) || 0))
  const consumables: ConsumableRow[] = consumableItems.map(i => ({
    id: i.id,
    name: i.name,
    unit: i.unit,
    total: i.quantity ?? 0,
    inKits: inKitsOf.get(i.id) ?? 0,
    min: i.min_quantity,
  }))

  type RawAudit = {
    id: string
    created_at: string
    expected_count: number
    found_count: number
    missing: { kind: 'kit' | 'item'; id: string; name: string }[] | null
    note: string | null
    profiles: { full_name: string | null; nickname: string | null } | null
  }
  const auditRows: AuditRow[] = ((audits || []) as unknown as RawAudit[]).map(a => ({
    id: a.id,
    createdAt: a.created_at,
    expected: a.expected_count,
    found: a.found_count,
    missing: a.missing || [],
    note: a.note,
    by: a.profiles?.nickname || a.profiles?.full_name || 'ไม่ทราบชื่อ',
  }))

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

  // ชั้นวางที่ระดับนี้อยู่ — รูป 3D เล็กๆ + เส้นทาง ห้อง › ชั้นวาง › ระดับ
  let rack: RackInfo | null = null
  if (shelf.rack_id) {
    const [{ data: r }, { data: lvls }] = await Promise.all([
      supabase.from('shelf_racks').select('id, code, width, room_id, shelf_rooms(name)').eq('id', shelf.rack_id).maybeSingle(),
      supabase.from('shelves').select('id, code, level').eq('rack_id', shelf.rack_id).order('level'),
    ])
    if (r) {
      rack = {
        id: r.id as string,
        code: r.code as string,
        width: r.width as number,
        roomId: r.room_id as string,
        roomName: (r as unknown as { shelf_rooms: { name: string } | null }).shelf_rooms?.name ?? '',
        level: (shelf.level as number) ?? 0,
        levels: (lvls || []).map(l => ({ id: l.id as string, code: l.code as string, level: l.level as number, things: [], lastAudit: null })),
      }
    }
  }

  // ตัวเลือก "เพิ่มเข้าชั้น" — โหลดเฉพาะคนที่จัดการได้
  let kitCandidates: Candidate[] = []
  let itemCandidates: Candidate[] = []
  if (manager) {
    const [{ data: allKits }, { data: allItems }, { data: inKits }, { data: shelves }] = await Promise.all([
      supabase.from('kits').select('id, name, shelf_id').order('name'),
      supabase.from('items').select('id, name, serial_number, shelf_id, is_consumable').order('name'),
      supabase.from('kit_contents').select('item_id'),
      supabase.from('shelves').select('id, code'),
    ])
    const codeOf = new Map((shelves || []).map(s => [s.id as string, s.code as string]))
    const inKit = new Set((inKits || []).map(r => r.item_id as string))
    kitCandidates = (allKits || [])
      .filter(k => k.shelf_id !== id)
      .map(k => ({ id: k.id as string, label: k.name as string, currentShelf: k.shelf_id ? codeOf.get(k.shelf_id as string) ?? null : null }))
    // อุปกรณ์ในกระเป๋าอยู่ตามกระเป๋า — วางเองไม่ได้ · วัสดุสิ้นเปลือง (กองกลาง) วางได้แม้แบ่งใส่กระเป๋า
    itemCandidates = (allItems || [])
      .filter(i => i.shelf_id !== id && (i.is_consumable || !inKit.has(i.id as string)))
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
      items={looseItems}
      consumables={consumables}
      canManage={!!manager}
      kitCandidates={kitCandidates}
      itemCandidates={itemCandidates}
      audits={auditRows}
      rack={rack}
    />
  )
}
