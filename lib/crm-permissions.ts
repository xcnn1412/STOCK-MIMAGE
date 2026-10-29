import { createServiceClient } from '@/lib/supabase-server'
import { requireModule } from '@/lib/auth'

// สิทธิ์ลบลูกค้า CRM = admin ทุกคน + รายชื่อที่ติ๊กไว้ในหน้าตั้งค่า > CRM (ต้องมีโมดูล crm ด้วย)
// เก็บใน app_settings เป็น JSON array ของ user id — รูปเดียวกับ lib/event-permissions.ts
export const CRM_DELETERS_KEY = 'crm_deleters'

export async function getCrmDeleterIds(): Promise<string[]> {
  const { data } = await createServiceClient()
    .from('app_settings').select('value').eq('key', CRM_DELETERS_KEY).maybeSingle()
  try {
    const ids = JSON.parse((data?.value as string | null) || '[]')
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

/** ลบลูกค้าได้ไหม — คืน userId เมื่อได้, null เมื่อไม่ได้ */
export async function canDeleteLead(): Promise<{ userId: string } | null> {
  const session = await requireModule('crm')
  if (!session) return null
  if (session.role === 'admin') return { userId: session.userId }
  return (await getCrmDeleterIds()).includes(session.userId) ? { userId: session.userId } : null
}
