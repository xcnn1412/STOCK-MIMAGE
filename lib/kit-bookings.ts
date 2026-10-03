import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import {
  canActOnPool,
  isClosedEvent,
  pickKitPointer,
  POOL_TEAM_DEFAULTS,
  type KitBookingDetail,
} from '@/app/(authenticated)/jobs/tracking/tracking-logic'

// การจองกระเป๋า (event_kits) เป็น source of truth ว่ากระเป๋าเป็นของอีเวนต์ไหน (ADR-0003)
// kits.event_id = "ตอนนี้กระเป๋าอยู่กับงานไหน" คำนวณใหม่ทุกครั้งที่การจองหรือสถานะอีเวนต์เปลี่ยน

type Db = ReturnType<typeof createServiceClient>

export type KitBookingWithStatus = KitBookingDetail & { closed: boolean }

const BOOKING_SELECT =
  'kit_id, event_id, packed_at, events!inner(id, name, event_date, event_time, event_end_time, status, crm_lead_id)'

type RawBooking = {
  kit_id: string
  event_id: string
  packed_at: string | null
  events?: {
    name: string | null
    event_date: string | null
    event_time: string | null
    event_end_time: string | null
    status: string | null
    crm_lead_id: string | null
  } | null
}

const toBooking = (r: RawBooking): KitBookingWithStatus => ({
  kitId: r.kit_id,
  eventId: r.event_id,
  eventDate: r.events?.event_date ?? null,
  eventTime: r.events?.event_time ? r.events.event_time.slice(0, 5) : null,
  eventEndTime: r.events?.event_end_time ? r.events.event_end_time.slice(0, 5) : null,
  eventName: r.events?.name || 'ไม่ระบุชื่ออีเวนต์',
  leadId: r.events?.crm_lead_id ?? null,
  packed: !!r.packed_at,
  closed: isClosedEvent(r.events?.status),
})

/** การจองทั้งหมดของกระเป๋าเหล่านี้ (รวมอีเวนต์ที่ปิดแล้ว — ดู closed) */
export async function loadBookingsForKits(db: Db, kitIds: string[]): Promise<KitBookingWithStatus[]> {
  if (kitIds.length === 0) return []
  const { data } = await db.from('event_kits').select(BOOKING_SELECT).in('kit_id', kitIds)
  return ((data || []) as unknown as RawBooking[]).map(toBooking)
}

/** การจองของอีเวนต์หนึ่ง */
export async function loadBookingsForEvent(db: Db, eventId: string): Promise<KitBookingWithStatus[]> {
  const { data } = await db.from('event_kits').select(BOOKING_SELECT).eq('event_id', eventId)
  return ((data || []) as unknown as RawBooking[]).map(toBooking)
}

/** การจองของอีเวนต์ที่ยังไม่ปิดทั้งหมด — ให้ฟอร์มอีเวนต์เตือนกระเป๋าชน */
export async function loadOpenBookings(db: Db): Promise<KitBookingWithStatus[]> {
  // ponytail: ดึงทั้งตารางแล้วกรองที่นี่ — ตารางเล็ก (กระเป๋า × งานที่ยังไม่ปิด); กรองวันใน SQL เมื่อโตขึ้น
  const { data } = await db.from('event_kits').select(BOOKING_SELECT)
  return ((data || []) as unknown as RawBooking[]).map(toBooking).filter(b => !b.closed)
}

/** ตั้ง kits.event_id ใหม่ให้กระเป๋าเหล่านี้ ตามการจองที่ยังไม่ปิดที่เร็วที่สุด */
export async function recomputeKitPointers(db: Db, kitIds: string[]): Promise<void> {
  const ids = [...new Set(kitIds)]
  if (ids.length === 0) return
  const [bookings, { data: kits }] = await Promise.all([
    loadBookingsForKits(db, ids),
    db.from('kits').select('id, event_id').in('id', ids),
  ])
  for (const kit of kits || []) {
    const next = pickKitPointer(bookings.filter(b => b.kitId === kit.id))
    if ((kit.event_id ?? null) !== next) {
      await db.from('kits').update({ event_id: next }).eq('id', kit.id)
    }
  }
}

/** ผู้จัดการกระเป๋า = admin หรือคนในแผนกที่ดูแลกระเป๋า (ตั้งค่าในพูลงาน หมวด pool_kit_departments) */
export async function getKitManager(): Promise<{ userId: string } | null> {
  const auth = await requireAuth()
  if (!auth?.userId) return null
  if (auth.role === 'admin') return { userId: auth.userId }

  const { data } = await createServiceClient()
    .from('job_settings')
    .select('value')
    .eq('category', 'pool_kit_departments')
    .eq('is_active', true)
  const set = (data || []).map(r => r.value as string).filter(Boolean)
  const departments = set.length > 0 ? set : [...POOL_TEAM_DEFAULTS.pool_kit_departments]
  return canActOnPool(auth.department ?? null, false, departments) ? { userId: auth.userId } : null
}

/** ชื่ออุปกรณ์ในกระเป๋าที่ยังออกงานอยู่ (สถานะ in_use) — ว่าง = กระเป๋าอยู่ในคลัง */
export async function itemsOutInKit(db: Db, kitId: string): Promise<string[]> {
  const { data } = await db.from('kit_contents').select('items(name, status)').eq('kit_id', kitId)
  return ((data || []) as unknown as { items: { name: string; status: string } | null }[])
    .filter(c => c.items?.status === 'in_use')
    .map(c => c.items!.name)
}
