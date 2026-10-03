import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'

// สิทธิ์จัดการอีเวนต์ แยก 2 ชุด = admin ทุกคน + รายชื่อที่ติ๊กไว้ในหน้าตั้งค่า
//   edit  → สร้าง / แก้ไข / ผูก-ถอด CRM
//   close → ปิดงาน-คืนกระเป๋า / อัปโหลดรูปตอนปิดงาน / ล้างประวัติปิดงานเก่า
// เก็บใน app_settings เป็น JSON array ของ user id (ไม่มีตารางใหม่)
export type EventPermission = 'edit' | 'close'

export const EVENT_PERMISSION_KEYS: Record<EventPermission, string> = {
  edit: 'events_managers', // ชื่อ key เดิมจาก v1.28.0 — คงไว้ให้รายชื่อที่บันทึกแล้วยังใช้ได้
  close: 'events_closers',
}

export async function getEventPermissionIds(): Promise<Record<EventPermission, string[]>> {
  const { data } = await createServiceClient()
    .from('app_settings').select('key, value').in('key', Object.values(EVENT_PERMISSION_KEYS))
  const parse = (key: string) => {
    try {
      const ids = JSON.parse((data?.find(r => r.key === key)?.value as string | null) || '[]')
      return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []
    } catch {
      return []
    }
  }
  return { edit: parse(EVENT_PERMISSION_KEYS.edit), close: parse(EVENT_PERMISSION_KEYS.close) }
}

/** สิทธิ์อีเวนต์ทั้งสองชุดของผู้ใช้ปัจจุบัน */
export async function getEventAccess(): Promise<{ userId: string | null; edit: boolean; close: boolean }> {
  const session = await requireAuth()
  const userId = session?.userId ?? null
  if (!userId) return { userId, edit: false, close: false }
  if (session?.role === 'admin') return { userId, edit: true, close: true }
  const ids = await getEventPermissionIds()
  return { userId, edit: ids.edit.includes(userId), close: ids.close.includes(userId) }
}

/** มีสิทธิ์ชุดนี้ไหม — คืน userId เมื่อได้, null เมื่อไม่ได้ */
export async function getEventManager(perm: EventPermission): Promise<{ userId: string } | null> {
  const access = await getEventAccess()
  return access.userId && access[perm] ? { userId: access.userId } : null
}
