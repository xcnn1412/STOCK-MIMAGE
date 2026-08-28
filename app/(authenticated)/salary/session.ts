// ============================================================================
// Session helper ของโมดูลเงินเดือน — แหล่งเดียวที่ page/actions ในโมดูลนี้เรียกใช้
// ponytail: ไฟล์ TS ธรรมดา (ห้ามใส่ 'use server' — ไฟล์ 'use server' export ได้เฉพาะ
// async function และตัวนี้ถูก import จาก server component ด้วย)
// รูปแบบเดียวกับ app/(authenticated)/documents/session.ts — คนละโมดูลจึงไม่ import ข้ามกัน
// ============================================================================

import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'

/**
 * ผู้ใช้ที่กำลังทำรายการ พร้อม role ที่ยืนยันกับ DB แล้ว —
 * ห้ามเชื่อคุกกี้ `session_role` ดิบ ๆ (รองรับคุกกี้ legacy ด้วย)
 */
export async function getSession(): Promise<{ userId?: string; role?: string }> {
  const session = await requireAuth()
  if (session) return { userId: session.userId, role: session.role }

  const cookieStore = await cookies()
  if (cookieStore.get('session_token')?.value) return {}
  const legacyId = cookieStore.get('session_user_id')?.value
  if (!legacyId) return {}
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, role, is_approved')
    .eq('id', legacyId)
    .single()
  if (!data || !data.is_approved) return {}
  return { userId: data.id, role: data.role || 'staff' }
}

/** ใช้ในหน้า/action ที่เป็น admin-only — ตรวจซ้ำฝั่ง server เสมอ (proxy อย่างเดียวไม่พอ) */
export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }
  return { userId }
}
