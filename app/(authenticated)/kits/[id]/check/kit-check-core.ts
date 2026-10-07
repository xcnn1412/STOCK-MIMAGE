// แกนของการนำออก/รับคืนอุปกรณ์ในกระเป๋า (ไม่ใช่ 'use server' — ไม่ใช่ปลายทางที่ยิงจากเครือข่ายได้)
// ใช้ร่วมกันโดย QR กระเป๋า (kits/[id]/check/actions.ts) และใบจัดของ (packing/actions.ts — หยิบกระเป๋า = นำออกทุกชิ้นที่ใช้ได้)
// ผู้เรียกต้องตรวจการล็อกอิน/สิทธิ์เองก่อน · ไม่ revalidate (ผู้เรียกทำเอง)
import type { createServiceClient } from '@/lib/supabase-server'
import { isClosedEvent } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import { logActivity } from '@/lib/logger'
import { isPacked } from '@/app/(authenticated)/shelves/consumable-logic'

/** สถานะที่เลือกได้ตอนรับคืน — ชุดเดียวกับหน้าปิดงาน */
export type ReturnStatus = 'available' | 'damaged' | 'maintenance' | 'lost'
export const RETURN_STATUSES: ReturnStatus[] = ['available', 'damaged', 'maintenance', 'lost']

export type Db = ReturnType<typeof createServiceClient>

/** อีเวนต์ต้องจองกระเป๋าใบนี้ไว้ (event_kits) และยังไม่ปิด — ผ่าน = null */
export async function checkBooking(db: Db, eventId: string, kitId: string): Promise<string | null> {
  const { data } = await db
    .from('event_kits')
    .select('events!inner(status)')
    .eq('event_id', eventId)
    .eq('kit_id', kitId)
    .maybeSingle()
  if (!data) return 'กระเป๋าใบนี้ไม่ได้ถูกจองให้อีเวนต์นี้'
  if (isClosedEvent((data as unknown as { events: { status: string | null } }).events?.status)) return 'อีเวนต์นี้ปิดงานไปแล้ว'
  return null
}

export type KitItem = { id: string; name: string; status: string; is_consumable: boolean | null }

/** อุปกรณ์ในกระเป๋าใบนี้ (kit_contents → items) */
export async function kitItems(db: Db, kitId: string): Promise<KitItem[]> {
  const { data } = await db.from('kit_contents').select('items(id, name, status, is_consumable)').eq('kit_id', kitId)
  return ((data || []) as unknown as { items: KitItem | null }[])
    .map(c => c.items)
    .filter((i): i is KitItem => !!i)
}

/** วัสดุสิ้นเปลืองไม่มีสถานะนำออก/รับคืน — ใช้ไปเท่าไรกรอกตอนปิดงาน */
export const CONSUMABLE_ERROR = 'วัสดุสิ้นเปลืองไม่ต้องนำออกหรือรับคืน — กรอกจำนวนที่ใช้ไปตอนปิดงาน'

/** "จัดครบ" ของการจอง = ชิ้นที่นำออกได้ถูกนำออกครบ (ดู packState — ไม่นับของเสีย/ซ่อม/หาย และวัสดุสิ้นเปลือง) — คิดใหม่ทุกครั้งที่นำออก/รับคืน */
export async function syncPacked(db: Db, eventId: string, kitId: string, userId: string): Promise<boolean> {
  const items = await kitItems(db, kitId)
  const packed = isPacked(items)
  const { data: row } = await db.from('event_kits').select('packed_at').eq('event_id', eventId).eq('kit_id', kitId).maybeSingle()
  if (!!row?.packed_at === packed) return packed
  await logActivity('PACK_EVENT_KIT', { event_id: eventId, kit_id: kitId, packed })
  await db
    .from('event_kits')
    .update(packed ? { packed_at: new Date().toISOString(), packed_by: userId } : { packed_at: null, packed_by: null })
    .eq('event_id', eventId)
    .eq('kit_id', kitId)
  return packed
}

/**
 * นำอุปกรณ์ในกระเป๋าออก (available → in_use) + event_logs checkout + syncPacked
 * ตรวจ: อีเวนต์จองกระเป๋าไว้และยังไม่ปิด · ไม่ใช่วัสดุสิ้นเปลือง · ทุกชิ้นต้องอยู่ในกระเป๋าและสถานะ "ว่าง"
 */
export async function checkoutKitItems(
  db: Db,
  { eventId, kitId, itemIds, userId }: { eventId: string; kitId: string; itemIds: string[]; userId: string },
): Promise<{ error: string } | { success: true; packed: boolean }> {
  const bookingError = await checkBooking(db, eventId, kitId)
  if (bookingError) return { error: bookingError }

  // นำออกได้เฉพาะอุปกรณ์ในกระเป๋าใบนี้ที่สถานะ "ว่าง"
  const items = await kitItems(db, kitId)
  const byId = new Map(items.map(i => [i.id, i]))
  if (itemIds.some(id => byId.get(id)?.is_consumable)) return { error: CONSUMABLE_ERROR }
  const bad = itemIds.filter(id => byId.get(id)?.status !== 'available')
  if (bad.length > 0) {
    const names = bad.map(id => byId.get(id)?.name || 'อุปกรณ์ที่ไม่อยู่ในกระเป๋านี้')
    return { error: `นำออกไม่ได้ (ไม่ได้อยู่ในสถานะว่าง): ${names.join(', ')}` }
  }

  // 1. Update items status to 'in_use'
  const { error: updateError } = await db.from('items').update({ status: 'in_use' }).in('id', itemIds)
  if (updateError) {
    console.error(updateError)
    return { error: 'นำออกไม่สำเร็จ' }
  }

  // 2. Insert logs
  const logs = itemIds.map(id => ({
    event_id: eventId,
    item_id: id,
    kit_id: kitId,
    user_id: userId,
    action: 'checkout',
    condition: 'good',
  }))
  const { error: logError } = await db.from('event_logs').insert(logs)
  if (logError) {
    console.error(logError)
    return { error: 'นำออกแล้ว แต่บันทึกประวัติไม่สำเร็จ' }
  }

  const packed = await syncPacked(db, eventId, kitId, userId)
  return { success: true, packed }
}

/**
 * รับอุปกรณ์ในกระเป๋าคืน (ตั้งสถานะตามที่เลือก) + event_logs checkin + syncPacked
 * ตรวจ: สถานะถูกต้อง · อีเวนต์จองกระเป๋าไว้และยังไม่ปิด · ชิ้นอยู่ในกระเป๋าใบนี้ · ไม่ใช่วัสดุสิ้นเปลือง
 */
export async function checkinKitItem(
  db: Db,
  { eventId, kitId, itemId, status, note, userId }: { eventId: string; kitId: string; itemId: string; status: ReturnStatus; note?: string; userId: string },
): Promise<{ error: string } | { success: true }> {
  if (!RETURN_STATUSES.includes(status)) return { error: 'สถานะไม่ถูกต้อง' }

  const bookingError = await checkBooking(db, eventId, kitId)
  if (bookingError) return { error: bookingError }
  const target = (await kitItems(db, kitId)).find(i => i.id === itemId)
  if (!target) return { error: 'อุปกรณ์นี้ไม่ได้อยู่ในกระเป๋าใบนี้' }
  if (target.is_consumable) return { error: CONSUMABLE_ERROR }

  // Update item
  const { error: updateError } = await db.from('items').update({ status }).eq('id', itemId)
  if (updateError) {
    console.error(updateError)
    return { error: 'รับคืนไม่สำเร็จ' }
  }

  // Log — condition เดิมเก็บ good/damaged/lost; ซ่อมบำรุงนับเป็น damaged
  const { error: logError } = await db.from('event_logs').insert({
    event_id: eventId,
    item_id: itemId,
    kit_id: kitId,
    user_id: userId,
    action: 'checkin',
    condition: status === 'available' ? 'good' : status === 'lost' ? 'lost' : 'damaged',
    note: note ?? (status === 'maintenance' ? 'ส่งซ่อมบำรุง' : undefined),
  })
  if (logError) {
    console.error(logError)
    return { error: 'รับคืนแล้ว แต่บันทึกประวัติไม่สำเร็จ' }
  }

  await syncPacked(db, eventId, kitId, userId)
  return { success: true }
}
