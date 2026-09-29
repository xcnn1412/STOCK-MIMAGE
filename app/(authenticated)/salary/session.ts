// ============================================================================
// Session helper ของโมดูลเงินเดือน — แหล่งเดียวที่ page/actions ในโมดูลนี้เรียกใช้
// ponytail: ไฟล์ TS ธรรมดา (ห้ามใส่ 'use server' — ไฟล์ 'use server' export ได้เฉพาะ
// async function และตัวนี้ถูก import จาก server component ด้วย)
// รูปแบบเดียวกับ app/(authenticated)/documents/session.ts — คนละโมดูลจึงไม่ import ข้ามกัน
// ============================================================================

import { requireAuth } from '@/lib/auth'

/**
 * ผู้ใช้ที่กำลังทำรายการ พร้อม role ที่ยืนยันกับ DB แล้ว (จาก requireAuth เท่านั้น) —
 * ห้ามเชื่อคุกกี้ `session_role` / `session_user_id` แบบเก่า (ไม่ได้เซ็น แก้เองได้)
 */
export async function getSession(): Promise<{ userId?: string; role?: string }> {
  const s = await requireAuth()
  return s ? { userId: s.userId, role: s.role } : {}
}

/** ใช้ในหน้า/action ที่เป็น admin-only — ตรวจซ้ำฝั่ง server เสมอ (proxy อย่างเดียวไม่พอ) */
export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, role } = await getSession()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }
  return { userId }
}
