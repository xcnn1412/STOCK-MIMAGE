// ============================================================================
// Session helper ของโมดูลเอกสาร — แหล่งเดียวที่ทุก actions.ts ในโมดูลนี้เรียกใช้
// ponytail: ไฟล์ TS ธรรมดา (ห้ามใส่ 'use server' — ไฟล์ 'use server' export ได้เฉพาะ
// async function และตัวนี้ถูก import จาก route handler ด้วย)
// ============================================================================

import { requireAuth, requireModule } from '@/lib/auth'

/**
 * ผู้ใช้ที่กำลังทำรายการ พร้อม role ที่ยืนยันกับ DB แล้ว (จาก requireAuth เท่านั้น) —
 * ห้ามเชื่อคุกกี้ `session_role` / `session_user_id` แบบเก่า (ไม่ได้เซ็น แก้เองได้)
 */
export async function getSession(): Promise<{ userId?: string; role?: string }> {
  const s = await requireAuth()
  return s ? { userId: s.userId, role: s.role } : {}
}

/**
 * เหมือน getSession แต่ต้องมีสิทธิ์โมดูล `documents` ด้วย (admin ผ่านเสมอ) —
 * ไม่มีสิทธิ์ = {} เหมือนไม่ได้ล็อกอิน · action / route PDF ของโมดูลนี้ใช้ตัวนี้
 * (proxy.ts คุมแค่ URL หน้า — server action กับ /api ถูกเรียกตรงได้ รายงานความปลอดภัยข้อ M6)
 */
export async function requireDocuments(): Promise<{ userId?: string; role?: string }> {
  const s = await requireModule('documents')
  return s ? { userId: s.userId, role: s.role } : {}
}

/** ใช้ในหน้า/action ที่เป็น admin-only — ตรวจซ้ำฝั่ง server เสมอ */
export async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const { userId, role } = await requireDocuments()
  if (!userId) return { error: 'Unauthorized' }
  if (role !== 'admin') return { error: 'เฉพาะ admin เท่านั้น' }
  return { userId }
}
