import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'

// ผู้มีสิทธิ์จัดการอีเวนต์ (สร้าง / แก้ไข / ปิดงาน / ผูก CRM) = admin ทุกคน + รายชื่อที่ติ๊กไว้ในหน้าตั้งค่า
// เก็บใน app_settings เป็น JSON array ของ user id (ไม่มีตารางใหม่)
export const EVENT_MANAGERS_KEY = 'events_managers'

export async function getEventManagerIds(): Promise<string[]> {
  const { data } = await createServiceClient()
    .from('app_settings').select('value').eq('key', EVENT_MANAGERS_KEY).maybeSingle()
  try {
    const ids = JSON.parse((data?.value as string | null) || '[]')
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** ผู้ใช้ปัจจุบันจัดการอีเวนต์ได้ไหม — คืน userId เมื่อได้, null เมื่อไม่ได้ */
export async function getEventManager(): Promise<{ userId: string } | null> {
  const session = await requireAuth()
  if (!session?.userId) return null
  if (session.role === 'admin') return { userId: session.userId }
  const ids = await getEventManagerIds()
  return ids.includes(session.userId) ? { userId: session.userId } : null
}
