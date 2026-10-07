// สิทธิ์ทีมจัดของ — server-only (อ่าน session + job_settings ด้วย service client) · ไม่ใช่ 'use server'
// ทีมจัดของ = แอดมิน หรือแผนกที่ตั้งเป็นผู้รับหน้าที่ "จัดของ" (job_settings หมวด pool_duty_kits — ยังไม่ตั้ง = ค่าเริ่มต้น)
import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'
import { canActOnPool, POOL_TEAM_DEFAULTS } from '../jobs/tracking/tracking-logic'

export const PACKING_TEAM_CATEGORY = 'pool_duty_kits'

export interface PackingTeamMember {
  userId: string
  isAdmin: boolean
  department: string | null
}

/** แผนกของทีมจัดของ (job_settings pool_duty_kits ที่เปิดใช้ · ไม่มีแถวเลย = POOL_TEAM_DEFAULTS.pool_duty_kits) */
export async function packingTeamDepartments(db: ReturnType<typeof createServiceClient> = createServiceClient()): Promise<string[]> {
  const { data } = await db.from('job_settings').select('value').eq('category', PACKING_TEAM_CATEGORY).eq('is_active', true)
  const set = (data || []).map(r => r.value as string).filter(Boolean)
  return set.length > 0 ? set : [...POOL_TEAM_DEFAULTS.pool_duty_kits]
}

/** ผู้ใช้ที่ล็อกอินอยู่เป็นทีมจัดของไหม — ใช่ = { userId, isAdmin, department } · ไม่ใช่/ไม่ได้ล็อกอิน = null */
export async function getPackingTeam(): Promise<PackingTeamMember | null> {
  const auth = await requireAuth()
  if (!auth?.userId) return null
  const isAdmin = auth.role === 'admin'
  const department = auth.department ?? null
  if (isAdmin) return { userId: auth.userId, isAdmin, department }
  const departments = await packingTeamDepartments()
  return canActOnPool(department, false, departments) ? { userId: auth.userId, isAdmin, department } : null
}
