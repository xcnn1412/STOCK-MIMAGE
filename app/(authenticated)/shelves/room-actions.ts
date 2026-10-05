'use server'

// ห้อง / ชั้นวาง / ระดับชั้น — admin + แผนกที่ดูแลกระเป๋า (getKitManager) เท่านั้น
// ระดับชั้น = แถวในตาราง shelves เดิม (rack_id + level) → หน้าระดับชั้น, QR, ตรวจนับ ใช้ของเดิมทั้งหมด

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { getKitManager } from '@/lib/kit-bookings'
import { clampDoor, clampToRoom, DOOR_SIDES, firstFreeSpot, levelCode, type Door, type RackPlacement, type Rotation } from './room-logic'

type Result = { error?: string; success?: boolean; id?: string }

const NO_PERMISSION = 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น'
const MAX_LEVELS = 12

const int = (v: unknown, min: number, max: number) => {
  const n = Math.trunc(Number(v))
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

function refresh(roomId?: string | null) {
  revalidatePath('/shelves')
  if (roomId) revalidatePath(`/shelves/rooms/${roomId}`)
}

// --- ห้อง ---------------------------------------------------------------------

export async function createRoom(input: { name: string; width: number; depth: number }): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const name = (input?.name || '').trim()
  const width = int(input?.width, 2, 40)
  const depth = int(input?.depth, 2, 40)
  if (!name) return { error: 'กรุณาใส่ชื่อห้อง' }
  if (!width || !depth) return { error: 'ขนาดห้องต้องอยู่ระหว่าง 2–40 ช่อง' }

  const { data, error } = await createServiceClient().from('shelf_rooms').insert({ name, width, depth }).select('id').single()
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }
  await logActivity('CREATE_SHELF_ROOM', { roomId: data.id, name, width, depth })
  refresh()
  return { success: true, id: data.id as string }
}

export async function updateRoom(roomId: string, input: { name: string; width: number; depth: number }): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const name = (input?.name || '').trim()
  const width = int(input?.width, 2, 40)
  const depth = int(input?.depth, 2, 40)
  if (!name) return { error: 'กรุณาใส่ชื่อห้อง' }
  if (!width || !depth) return { error: 'ขนาดห้องต้องอยู่ระหว่าง 2–40 ช่อง' }

  const supabase = createServiceClient()
  const { error } = await supabase.from('shelf_rooms').update({ name, width, depth }).eq('id', roomId)
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  // ห้องเล็กลง → ดึงชั้นวางที่ล้นกลับเข้าห้อง
  const { data: racks } = await supabase.from('shelf_racks').select('id, x, y, rotation, width').eq('room_id', roomId)
  for (const r of (racks || []) as RackPlacement[]) {
    const c = clampToRoom(r, { width, depth })
    if (c.x !== r.x || c.y !== r.y) await supabase.from('shelf_racks').update({ x: c.x, y: c.y }).eq('id', r.id)
  }

  await logActivity('UPDATE_SHELF_ROOM', { roomId, name, width, depth })
  refresh(roomId)
  return { success: true }
}

/** ปักหมุดประตูทางเข้า — null = เอาออก · ตำแหน่งถูกดึงให้อยู่บนผนังเสมอ */
export async function setRoomDoor(roomId: string, door: Door | null): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  if (door && !(DOOR_SIDES as readonly string[]).includes(door.side)) return { error: 'ด้านของประตูไม่ถูกต้อง' }
  const supabase = createServiceClient()
  const { data: room } = await supabase.from('shelf_rooms').select('width, depth').eq('id', roomId).maybeSingle()
  if (!room) return { error: 'ไม่พบห้องนี้' }
  const d = door ? clampDoor(room as { width: number; depth: number }, door) : null
  const { error } = await supabase.from('shelf_rooms').update({ door_side: d?.side ?? null, door_pos: d?.pos ?? null }).eq('id', roomId)
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }
  await logActivity('UPDATE_SHELF_ROOM', { roomId, door: d })
  refresh(roomId)
  return { success: true }
}

export async function deleteRoom(roomId: string): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: room } = await supabase.from('shelf_rooms').select('name').eq('id', roomId).maybeSingle()
  // ชั้นวางถูกลบตามห้อง (cascade) — ระดับชั้นกลายเป็น "ยังไม่อยู่ในห้อง" ของบนชั้นและ QR ยังอยู่
  const { data: racks } = await supabase.from('shelf_racks').select('id').eq('room_id', roomId)
  const rackIds = (racks || []).map(r => r.id as string)
  if (rackIds.length > 0) await supabase.from('shelves').update({ rack_id: null, level: null }).in('rack_id', rackIds)

  const { error } = await supabase.from('shelf_rooms').delete().eq('id', roomId)
  if (error) return { error: `ลบไม่สำเร็จ: ${error.message}` }
  await logActivity('DELETE_SHELF_ROOM', { roomId, name: room?.name ?? null })
  refresh()
  return { success: true }
}

// --- ชั้นวาง -------------------------------------------------------------------

/** สร้างชั้นวางพร้อมระดับชั้น 1..levels (รหัส <ชั้นวาง>-<ระดับ>) วางที่ช่องว่างแรกของห้อง */
export async function createRack(roomId: string, input: { code: string; width: number; levels: number }): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const code = (input?.code || '').trim()
  const width = int(input?.width, 1, 4)
  const levels = int(input?.levels, 1, MAX_LEVELS)
  if (!code) return { error: 'กรุณาใส่รหัสชั้นวาง' }
  if (!width) return { error: 'ความกว้างต้องเป็น 1–4 ช่อง' }
  if (!levels) return { error: `จำนวนระดับชั้นต้องเป็น 1–${MAX_LEVELS}` }

  const supabase = createServiceClient()
  const [{ data: room }, { data: racks }] = await Promise.all([
    supabase.from('shelf_rooms').select('id, name, width, depth').eq('id', roomId).maybeSingle(),
    supabase.from('shelf_racks').select('id, x, y, rotation, width').eq('room_id', roomId),
  ])
  if (!room) return { error: 'ไม่พบห้องนี้' }

  const spot = firstFreeSpot(room as { width: number; depth: number }, (racks || []) as RackPlacement[], Math.min(width, room.width as number))
  const { data: rack, error } = await supabase
    .from('shelf_racks')
    .insert({ room_id: roomId, code, width, x: spot.x, y: spot.y, rotation: 0 })
    .select('id')
    .single()
  if (error) return { error: error.code === '23505' ? 'รหัสชั้นวางนี้มีอยู่แล้ว' : `บันทึกไม่สำเร็จ: ${error.message}` }

  const rows = Array.from({ length: levels }, (_, i) => ({
    zone: room.name as string,
    code: levelCode(code, i + 1),
    rack_id: rack.id,
    level: i + 1,
  }))
  const { error: lvErr } = await supabase.from('shelves').insert(rows)
  if (lvErr) {
    await supabase.from('shelf_racks').delete().eq('id', rack.id)
    return { error: lvErr.code === '23505' ? `มีรหัสชั้น ${code}-… อยู่แล้ว — ใช้รหัสชั้นวางอื่น` : `บันทึกไม่สำเร็จ: ${lvErr.message}` }
  }

  await logActivity('CREATE_SHELF_RACK', { rackId: rack.id, roomId, code, width, levels })
  refresh(roomId)
  return { success: true, id: rack.id as string }
}

/** ย้าย / หมุน / เปลี่ยนรหัสหรือความกว้างของชั้นวาง — ตำแหน่งถูกดึงเข้าห้องเสมอ */
export async function updateRack(
  rackId: string,
  patch: { x?: number; y?: number; rotation?: Rotation; width?: number; code?: string }
): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: rack } = await supabase
    .from('shelf_racks')
    .select('id, room_id, code, x, y, rotation, width, shelf_rooms(width, depth)')
    .eq('id', rackId)
    .maybeSingle()
  if (!rack) return { error: 'ไม่พบชั้นวาง' }
  const room = (rack as unknown as { shelf_rooms: { width: number; depth: number } }).shelf_rooms

  const rotation = patch.rotation ?? (rack.rotation as Rotation)
  if (![0, 90, 180, 270].includes(rotation)) return { error: 'มุมหมุนไม่ถูกต้อง' }
  const width = patch.width === undefined ? (rack.width as number) : int(patch.width, 1, 4)
  if (!width) return { error: 'ความกว้างต้องเป็น 1–4 ช่อง' }
  const code = patch.code === undefined ? (rack.code as string) : patch.code.trim()
  if (!code) return { error: 'กรุณาใส่รหัสชั้นวาง' }

  const placed = clampToRoom(
    {
      id: rackId,
      x: Math.trunc(patch.x ?? (rack.x as number)),
      y: Math.trunc(patch.y ?? (rack.y as number)),
      rotation,
      width,
    },
    room
  )
  const { error } = await supabase
    .from('shelf_racks')
    .update({ x: placed.x, y: placed.y, rotation, width, code })
    .eq('id', rackId)
  if (error) return { error: error.code === '23505' ? 'รหัสชั้นวางนี้มีอยู่แล้ว' : `บันทึกไม่สำเร็จ: ${error.message}` }

  // เปลี่ยนรหัสชั้นวาง → ระดับชั้นที่ยังใช้รหัสอัตโนมัติเดิม (A-1, A-2…) เปลี่ยนตาม
  if (code !== rack.code) {
    const { data: levels } = await supabase.from('shelves').select('id, code, level').eq('rack_id', rackId)
    for (const lv of levels || []) {
      if (lv.code === levelCode(rack.code as string, lv.level as number)) {
        await supabase.from('shelves').update({ code: levelCode(code, lv.level as number) }).eq('id', lv.id)
      }
    }
  }

  await logActivity('UPDATE_SHELF_RACK', { rackId, ...patch, x: placed.x, y: placed.y })
  refresh(rack.room_id as string)
  return { success: true }
}

/** ตั้งจำนวนระดับชั้น — เพิ่มระดับบนสุด / ลดได้เฉพาะระดับบนที่ว่าง (ไม่มีของ) */
export async function setRackLevels(rackId: string, count: number): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const n = int(count, 1, MAX_LEVELS)
  if (!n) return { error: `จำนวนระดับชั้นต้องเป็น 1–${MAX_LEVELS}` }

  const supabase = createServiceClient()
  const { data: rack } = await supabase.from('shelf_racks').select('id, code, room_id, shelf_rooms(name)').eq('id', rackId).maybeSingle()
  if (!rack) return { error: 'ไม่พบชั้นวาง' }
  const { data: levels } = await supabase.from('shelves').select('id, code, level').eq('rack_id', rackId).order('level')
  const current = (levels || []) as { id: string; code: string; level: number }[]
  const top = current.reduce((m, l) => Math.max(m, l.level), 0)

  if (n > current.length) {
    const roomName = (rack as unknown as { shelf_rooms: { name: string } }).shelf_rooms?.name ?? (rack.code as string)
    const rows = Array.from({ length: n - current.length }, (_, i) => ({
      zone: roomName,
      code: levelCode(rack.code as string, top + i + 1),
      rack_id: rackId,
      level: top + i + 1,
    }))
    const { error } = await supabase.from('shelves').insert(rows)
    if (error) return { error: error.code === '23505' ? 'รหัสระดับชั้นซ้ำกับชั้นที่มีอยู่' : `บันทึกไม่สำเร็จ: ${error.message}` }
  } else if (n < current.length) {
    const drop = [...current].sort((a, b) => b.level - a.level).slice(0, current.length - n)
    const ids = drop.map(l => l.id)
    const [{ data: kits }, { data: items }] = await Promise.all([
      supabase.from('kits').select('shelf_id').in('shelf_id', ids),
      supabase.from('items').select('shelf_id').in('shelf_id', ids),
    ])
    const used = new Set([...(kits || []), ...(items || [])].map(r => r.shelf_id as string))
    const busy = drop.filter(l => used.has(l.id))
    if (busy.length > 0) return { error: `ลดไม่ได้ — ระดับ ${busy.map(l => l.code).join(', ')} ยังมีของอยู่ ย้ายของออกก่อน` }
    const { error } = await supabase.from('shelves').delete().in('id', ids)
    if (error) return { error: `ลบไม่สำเร็จ: ${error.message}` }
  }

  await logActivity('UPDATE_SHELF_RACK', { rackId, levels: n })
  refresh(rack.room_id as string)
  return { success: true }
}

export async function deleteRack(rackId: string): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const supabase = createServiceClient()
  const { data: rack } = await supabase.from('shelf_racks').select('code, room_id').eq('id', rackId).maybeSingle()
  if (!rack) return { error: 'ไม่พบชั้นวาง' }
  // ระดับชั้นไม่ถูกลบ — กลายเป็น "ยังไม่อยู่ในห้อง" ของบนชั้นและ QR ยังอยู่
  await supabase.from('shelves').update({ rack_id: null, level: null }).eq('rack_id', rackId)
  const { error } = await supabase.from('shelf_racks').delete().eq('id', rackId)
  if (error) return { error: `ลบไม่สำเร็จ: ${error.message}` }
  await logActivity('DELETE_SHELF_RACK', { rackId, code: rack.code })
  refresh(rack.room_id as string)
  return { success: true }
}

/** ย้ายชั้นเดิมที่ยังไม่อยู่ในห้องเข้าเป็นระดับบนสุดของชั้นวาง (รหัสและ QR เดิมคงไว้) */
export async function attachShelfToRack(shelfId: string, rackId: string): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const supabase = createServiceClient()
  const [{ data: rack }, { data: levels }] = await Promise.all([
    supabase.from('shelf_racks').select('id, room_id').eq('id', rackId).maybeSingle(),
    supabase.from('shelves').select('level').eq('rack_id', rackId),
  ])
  if (!rack) return { error: 'ไม่พบชั้นวาง' }
  if ((levels || []).length >= MAX_LEVELS) return { error: `ชั้นวางมีได้ไม่เกิน ${MAX_LEVELS} ระดับ` }
  const top = (levels || []).reduce((m, l) => Math.max(m, (l.level as number) ?? 0), 0)

  const { error } = await supabase.from('shelves').update({ rack_id: rackId, level: top + 1 }).eq('id', shelfId).is('rack_id', null)
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }
  await logActivity('UPDATE_SHELF_RACK', { rackId, attachedShelfId: shelfId, level: top + 1 })
  refresh(rack.room_id as string)
  revalidatePath(`/shelves/${shelfId}`)
  return { success: true }
}
