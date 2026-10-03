// คิวรีฝั่ง server ของชั้นเก็บของที่หลายหน้าใช้ร่วมกัน (ไม่ตรวจสิทธิ์ — ผู้เรียกตรวจเอง)
import { createServiceClient } from '@/lib/supabase-server'
import { auditDue } from './shelf-logic'
import { onShelf, stockLevel } from './consumable-logic'

type Db = ReturnType<typeof createServiceClient>

export interface LastAudit {
  createdAt: string
  missingCount: number
}

/** ตรวจนับครั้งล่าสุดของแต่ละชั้น (shelf_id → ผล) */
export async function latestAuditByShelf(db: Db): Promise<Map<string, LastAudit>> {
  // ponytail: ดึงประวัติทั้งหมดแล้วเลือกแถวแรกต่อชั้น — ใช้ view/DISTINCT ON เมื่อประวัติเยอะจริง
  const { data } = await db.from('shelf_audits').select('shelf_id, created_at, missing').order('created_at', { ascending: false })
  const out = new Map<string, LastAudit>()
  for (const r of data || []) {
    if (out.has(r.shelf_id as string)) continue
    out.set(r.shelf_id as string, {
      createdAt: r.created_at as string,
      missingCount: Array.isArray(r.missing) ? r.missing.length : 0,
    })
  }
  return out
}

export interface ShelfHealth {
  shelfCount: number
  /** ไม่เคยตรวจ หรือไม่ได้ตรวจเกินกำหนด */
  dueShelves: { id: string; code: string; days: number | null }[]
  /** ตรวจครั้งล่าสุดแล้วเจอของขาด */
  missingShelves: { id: string; code: string; missing: number }[]
  kitsWithoutShelf: number
  /** อุปกรณ์ที่ไม่อยู่ในกระเป๋าและยังไม่มีชั้น (วัสดุสิ้นเปลืองนับแม้อยู่ในกระเป๋า — กองกลางต้องมีชั้น) */
  looseItemsWithoutShelf: number
  /** วัสดุสิ้นเปลืองระดับ ของหมด / ใกล้หมด */
  lowStock: { id: string; name: string; onShelf: number; unit: string | null; shelfId: string | null; shelfCode: string | null }[]
}

/** สรุปสุขภาพชั้นเก็บของ — การ์ดแจ้งเตือนบนแดชบอร์ดสต็อก */
export async function loadShelfHealth(db: Db, now = new Date()): Promise<ShelfHealth> {
  // ponytail: อุปกรณ์ ~343 ชิ้น / kit_contents ไม่ถึงเพดาน 1,000 แถวของ PostgREST — แบ่งหน้าเมื่อโตเกิน
  const [{ data: shelves }, last, { count: kitsWithoutShelf }, { data: looseItems }, { data: inKits }, { data: consumables }] = await Promise.all([
    db.from('shelves').select('id, code').order('code'),
    latestAuditByShelf(db),
    db.from('kits').select('id', { count: 'exact', head: true }).is('shelf_id', null),
    db.from('items').select('id, is_consumable').is('shelf_id', null),
    db.from('kit_contents').select('item_id, quantity'),
    db.from('items').select('id, name, quantity, unit, min_quantity, shelf_id').eq('is_consumable', true).order('name'),
  ])
  const inKit = new Set((inKits || []).map(r => r.item_id as string))
  const packed = new Map<string, number>()
  for (const r of inKits || []) packed.set(r.item_id as string, (packed.get(r.item_id as string) ?? 0) + ((r.quantity as number) || 0))
  const codeOf = new Map((shelves || []).map(s => [s.id as string, s.code as string]))

  const lowStock: ShelfHealth['lowStock'] = []
  for (const c of consumables || []) {
    const total = (c.quantity as number) ?? 0
    const kits = packed.get(c.id as string) ?? 0
    if (stockLevel(total, kits, (c.min_quantity as number | null) ?? null) === 'ok') continue
    const shelfId = (c.shelf_id as string | null) ?? null
    lowStock.push({
      id: c.id as string,
      name: c.name as string,
      onShelf: onShelf(total, kits),
      unit: (c.unit as string | null) ?? null,
      shelfId,
      shelfCode: shelfId ? codeOf.get(shelfId) ?? null : null,
    })
  }

  const dueShelves: ShelfHealth['dueShelves'] = []
  const missingShelves: ShelfHealth['missingShelves'] = []
  for (const s of shelves || []) {
    const a = last.get(s.id as string)
    const due = auditDue(a?.createdAt ?? null, now)
    if (due.kind !== 'ok') dueShelves.push({ id: s.id as string, code: s.code as string, days: due.kind === 'never' ? null : due.days })
    if (a && a.missingCount > 0) missingShelves.push({ id: s.id as string, code: s.code as string, missing: a.missingCount })
  }

  return {
    shelfCount: (shelves || []).length,
    dueShelves,
    missingShelves,
    kitsWithoutShelf: kitsWithoutShelf ?? 0,
    looseItemsWithoutShelf: (looseItems || []).filter(i => i.is_consumable || !inKit.has(i.id as string)).length,
    lowStock,
  }
}

// --- ห้อง 3D ---------------------------------------------------------------------

export interface RoomLevel {
  id: string
  code: string
  level: number
  /** ของบนระดับนี้ — kind ใช้ระบายสีกล่องใน 3D */
  things: { id: string; name: string; kind: 'kit' | 'item'; tone: 'home' | 'out' | 'problem' }[]
  lastAudit: LastAudit | null
}
export interface RoomRack {
  id: string
  code: string
  x: number
  y: number
  rotation: 0 | 90 | 180 | 270
  width: number
  levels: RoomLevel[]
}
export interface RoomData {
  id: string
  name: string
  width: number
  depth: number
  racks: RoomRack[]
}

const PROBLEM = ['damaged', 'maintenance', 'lost']

/** ห้องหนึ่งพร้อมชั้นวาง ระดับชั้น และของบนแต่ละระดับ — null = ไม่พบห้อง */
export async function loadRoom(db: Db, roomId: string): Promise<RoomData | null> {
  const [{ data: room }, { data: racks }] = await Promise.all([
    db.from('shelf_rooms').select('id, name, width, depth').eq('id', roomId).maybeSingle(),
    db.from('shelf_racks').select('id, code, x, y, rotation, width').eq('room_id', roomId).order('code'),
  ])
  if (!room) return null

  const rackIds = (racks || []).map(r => r.id as string)
  const { data: levels } = rackIds.length
    ? await db.from('shelves').select('id, code, level, rack_id').in('rack_id', rackIds)
    : { data: [] as { id: string; code: string; level: number; rack_id: string }[] }
  const levelIds = (levels || []).map(l => l.id as string)

  const [{ data: kits }, { data: items }, audits] = await Promise.all([
    levelIds.length
      ? db.from('kits').select('id, name, shelf_id, kit_contents(items(status))').in('shelf_id', levelIds)
      : Promise.resolve({ data: [] }),
    levelIds.length
      ? db.from('items').select('id, name, status, shelf_id').in('shelf_id', levelIds)
      : Promise.resolve({ data: [] }),
    latestAuditByShelf(db),
  ])

  type RawKit = { id: string; name: string; shelf_id: string; kit_contents: { items: { status: string } | null }[] | null }
  const thingsOf = (levelId: string): RoomLevel['things'] => [
    ...((kits || []) as unknown as RawKit[])
      .filter(k => k.shelf_id === levelId)
      .map(k => {
        const st = (k.kit_contents || []).map(c => c.items?.status ?? '')
        const tone: RoomLevel['things'][number]['tone'] = st.includes('in_use') ? 'out' : st.some(s => PROBLEM.includes(s)) ? 'problem' : 'home'
        return { id: k.id, name: k.name, kind: 'kit' as const, tone }
      }),
    ...((items || []) as { id: string; name: string; status: string; shelf_id: string }[])
      .filter(i => i.shelf_id === levelId)
      .map(i => ({
        id: i.id,
        name: i.name,
        kind: 'item' as const,
        tone: (i.status === 'in_use' ? 'out' : PROBLEM.includes(i.status) ? 'problem' : 'home') as RoomLevel['things'][number]['tone'],
      })),
  ]

  return {
    id: room.id as string,
    name: room.name as string,
    width: room.width as number,
    depth: room.depth as number,
    racks: (racks || []).map(r => ({
      id: r.id as string,
      code: r.code as string,
      x: r.x as number,
      y: r.y as number,
      rotation: r.rotation as RoomRack['rotation'],
      width: r.width as number,
      levels: (levels || [])
        .filter(l => l.rack_id === r.id)
        .sort((a, b) => (a.level as number) - (b.level as number))
        .map(l => ({
          id: l.id as string,
          code: l.code as string,
          level: l.level as number,
          things: thingsOf(l.id as string),
          lastAudit: audits.get(l.id as string) ?? null,
        })),
    })),
  }
}
