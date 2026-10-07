'use server'
import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { checkBooking, checkinKitItem, checkoutKitItems, syncPacked, type ReturnStatus } from './kit-check-core'

// แกนการนำออก/รับคืน/จัดครบอยู่ใน kit-check-core.ts (ใช้ร่วมกับใบจัดของ) — ที่นี่เหลือตรวจล็อกอิน + revalidate
export type { ReturnStatus }

function refresh(eventId: string, kitId: string) {
  revalidatePath(`/kits/${kitId}/check`)
  revalidatePath(`/events/${eventId}/check-kits`)
  revalidatePath(`/events/${eventId}/check-kits/${kitId}`)
  revalidatePath('/jobs/tracking')
}

const NOT_LOGGED_IN = 'ไม่ได้เข้าสู่ระบบ'

/** ป้าย "จัดครบ" ที่บันทึกไว้ไม่ตรงกติกาปัจจุบัน → หน้าจัดกระเป๋าเรียกให้คิดใหม่ */
export async function syncKitPacked(eventId: string, kitId: string): Promise<{ error: string } | { packed: boolean }> {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) return { error: NOT_LOGGED_IN }

  const supabase = createServiceClient()
  const bookingError = await checkBooking(supabase, eventId, kitId)
  if (bookingError) return { error: bookingError }

  const packed = await syncPacked(supabase, eventId, kitId, userId)
  refresh(eventId, kitId)
  return { packed }
}

export async function checkoutItems(eventId: string, kitId: string, itemIds: string[]) {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) return { error: NOT_LOGGED_IN }

  const result = await checkoutKitItems(createServiceClient(), { eventId, kitId, itemIds, userId })
  if ('error' in result) return { error: result.error }
  refresh(eventId, kitId)
  return { success: true, packed: result.packed }
}

export async function checkinItem(eventId: string, kitId: string, itemId: string, status: ReturnStatus, note?: string) {
  const session = await requireAuth()
  const userId = session?.userId
  if (!userId) return { error: NOT_LOGGED_IN }

  const result = await checkinKitItem(createServiceClient(), { eventId, kitId, itemId, status, note, userId })
  if ('error' in result) return { error: result.error }
  refresh(eventId, kitId)
}
