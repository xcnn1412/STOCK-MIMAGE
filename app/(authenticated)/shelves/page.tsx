import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import ShelvesView, { type ShelfRow, type RoomRow } from './shelves-view'
import { latestAuditByShelf } from './queries'
import { auditDue } from './shelf-logic'

export const revalidate = 0

export default async function ShelvesPage() {
  const supabase = createServiceClient()
  const [{ data: shelves }, { data: kits }, { data: items }, manager, lastAudit, { data: rooms }, { data: racks }] = await Promise.all([
    supabase.from('shelves').select('id, zone, code, name, note, rack_id').order('code'),
    supabase.from('kits').select('shelf_id').not('shelf_id', 'is', null),
    supabase.from('items').select('shelf_id').not('shelf_id', 'is', null),
    getKitManager(),
    latestAuditByShelf(supabase),
    supabase.from('shelf_rooms').select('id, name, width, depth').order('name'),
    supabase.from('shelf_racks').select('id, room_id'),
  ])

  const count = (rows: { shelf_id: string | null }[] | null, id: string) => (rows || []).filter(r => r.shelf_id === id).length
  const allShelves = shelves || []

  // ชั้นเดิมที่ยังไม่อยู่ในห้อง — แสดงแบบรายการโซนเหมือนเดิม
  const loose: ShelfRow[] = allShelves
    .filter(s => !s.rack_id)
    .map(s => ({
      id: s.id as string,
      zone: s.zone as string,
      code: s.code as string,
      name: (s.name as string | null) ?? null,
      note: (s.note as string | null) ?? null,
      kitCount: count(kits, s.id as string),
      itemCount: count(items, s.id as string),
      lastAuditAt: lastAudit.get(s.id as string)?.createdAt ?? null,
      lastMissing: lastAudit.get(s.id as string)?.missingCount ?? 0,
    }))

  const now = new Date()
  const roomRows: RoomRow[] = (rooms || []).map(r => {
    const rackIds = new Set((racks || []).filter(k => k.room_id === r.id).map(k => k.id as string))
    const levels = allShelves.filter(s => s.rack_id && rackIds.has(s.rack_id as string))
    return {
      id: r.id as string,
      name: r.name as string,
      width: r.width as number,
      depth: r.depth as number,
      rackCount: rackIds.size,
      levelCount: levels.length,
      thingCount: levels.reduce((n, s) => n + count(kits, s.id as string) + count(items, s.id as string), 0),
      missingLevels: levels.filter(s => (lastAudit.get(s.id as string)?.missingCount ?? 0) > 0).length,
      dueLevels: levels.filter(s => auditDue(lastAudit.get(s.id as string)?.createdAt ?? null, now).kind !== 'ok').length,
    }
  })

  return <ShelvesView shelves={loose} rooms={roomRows} canManage={!!manager} />
}
