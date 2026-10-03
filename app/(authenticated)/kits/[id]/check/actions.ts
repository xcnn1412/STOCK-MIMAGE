'use server'
import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { isClosedEvent } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import { logActivity } from '@/lib/logger'
import { isPacked } from '@/app/(authenticated)/shelves/consumable-logic'

/** สถานะที่เลือกได้ตอนรับคืน — ชุดเดียวกับหน้าปิดงาน */
export type ReturnStatus = 'available' | 'damaged' | 'maintenance' | 'lost'
const RETURN_STATUSES: ReturnStatus[] = ['available', 'damaged', 'maintenance', 'lost']

type Db = ReturnType<typeof createServiceClient>

/** อีเวนต์ต้องจองกระเป๋าใบนี้ไว้ (event_kits) และยังไม่ปิด */
async function checkBooking(db: Db, eventId: string, kitId: string): Promise<string | null> {
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

type KitItem = { id: string; name: string; status: string; is_consumable: boolean | null }

async function kitItems(db: Db, kitId: string) {
  const { data } = await db.from('kit_contents').select('items(id, name, status, is_consumable)').eq('kit_id', kitId)
  return ((data || []) as unknown as { items: KitItem | null }[])
    .map(c => c.items)
    .filter((i): i is KitItem => !!i)
}

/** วัสดุสิ้นเปลืองไม่มีสถานะนำออก/รับคืน — ใช้ไปเท่าไรกรอกตอนปิดงาน */
const CONSUMABLE_ERROR = 'วัสดุสิ้นเปลืองไม่ต้องนำออกหรือรับคืน — กรอกจำนวนที่ใช้ไปตอนปิดงาน'

/** "จัดครบ" ของการจอง = อุปกรณ์ปกติทุกชิ้นในกระเป๋าถูกนำออก (in_use, ไม่นับวัสดุสิ้นเปลือง) — คิดใหม่ทุกครั้งที่นำออก/รับคืน */
async function syncPacked(db: Db, eventId: string, kitId: string, userId: string) {
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

function refresh(eventId: string, kitId: string) {
  revalidatePath(`/kits/${kitId}/check`)
  revalidatePath(`/events/${eventId}/check-kits`)
  revalidatePath(`/events/${eventId}/check-kits/${kitId}`)
  revalidatePath('/jobs/tracking')
}

export async function checkoutItems(eventId: string, kitId: string, itemIds: string[]) {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) return { error: "Unauthorized" }

  const supabase = createServiceClient()

  const bookingError = await checkBooking(supabase, eventId, kitId)
  if (bookingError) return { error: bookingError }

  // นำออกได้เฉพาะอุปกรณ์ในกระเป๋าใบนี้ที่สถานะ "ว่าง"
  const items = await kitItems(supabase, kitId)
  const byId = new Map(items.map(i => [i.id, i]))
  if (itemIds.some(id => byId.get(id)?.is_consumable)) return { error: CONSUMABLE_ERROR }
  const bad = itemIds.filter(id => byId.get(id)?.status !== 'available')
  if (bad.length > 0) {
    const names = bad.map(id => byId.get(id)?.name || 'อุปกรณ์ที่ไม่อยู่ในกระเป๋านี้')
    return { error: `นำออกไม่ได้ (ไม่ได้อยู่ในสถานะว่าง): ${names.join(', ')}` }
  }

  // 1. Update items status to 'in_use'
  const { error: updateError } = await supabase
    .from('items')
    .update({ status: 'in_use' })
    .in('id', itemIds)

  if (updateError) return { error: updateError.message }

  // 2. Insert logs
  const logs = itemIds.map(id => ({
    event_id: eventId,
    item_id: id,
    kit_id: kitId,
    user_id: userId,
    action: 'checkout',
    condition: 'good'
  }))

  const { error: logError } = await supabase.from('event_logs').insert(logs)

  if (logError) return { error: logError.message }

  const packed = await syncPacked(supabase, eventId, kitId, userId)
  refresh(eventId, kitId)
  return { success: true, packed }
}

export async function checkinItem(eventId: string, kitId: string, itemId: string, status: ReturnStatus, note?: string) {
    const session = await requireAuth()
    const userId = session?.userId

    if (!userId) return { error: "Unauthorized" }
    if (!RETURN_STATUSES.includes(status)) return { error: 'สถานะไม่ถูกต้อง' }

    const supabase = createServiceClient()

    const bookingError = await checkBooking(supabase, eventId, kitId)
    if (bookingError) return { error: bookingError }
    const target = (await kitItems(supabase, kitId)).find(i => i.id === itemId)
    if (!target) {
        return { error: 'อุปกรณ์นี้ไม่ได้อยู่ในกระเป๋าใบนี้' }
    }
    if (target.is_consumable) return { error: CONSUMABLE_ERROR }

    // Update item
    const { error: updateError } = await supabase
        .from('items')
        .update({ status })
        .eq('id', itemId)

    if (updateError) return { error: updateError.message }

    // Log — condition เดิมเก็บ good/damaged/lost; ซ่อมบำรุงนับเป็น damaged
    const { error: logError } = await supabase.from('event_logs').insert({
        event_id: eventId,
        item_id: itemId,
        kit_id: kitId,
        user_id: userId,
        action: 'checkin',
        condition: status === 'available' ? 'good' : status === 'lost' ? 'lost' : 'damaged',
        note: note ?? (status === 'maintenance' ? 'ส่งซ่อมบำรุง' : undefined),
    })

    if (logError) return { error: logError.message }

    await syncPacked(supabase, eventId, kitId, userId)
    refresh(eventId, kitId)
}
