// ============================================================================
// ผู้ใช้ที่กำลังใช้งานส่วนใบเบิก — ตัวตนและบทบาทที่ยืนยันแล้ว
// ใช้ทั้งในหน้า (server component) และใน server action
//
// ห้ามอ่าน session_role / session_user_id จาก cookie มาตัดสินสิทธิ์หรือเลือกข้อมูล:
// cookie สองตัวนั้นไม่ได้เซ็น ผู้ใช้แก้เองได้ บทบาทต้องมาจากฐานข้อมูลเสมอ
//
// ไฟล์นี้ไม่ใช่ 'use server' (ฟังก์ชันที่ export จึงไม่กลายเป็น endpoint) และห้าม import จาก client component
// ============================================================================

import { cache } from 'react'
import { cookies } from 'next/headers'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'

export interface FinanceViewer {
  userId: string
  role: string
  isAdmin: boolean
}

/**
 * คืน null เมื่อยังไม่ล็อกอินหรือ session ใช้ไม่ได้
 * cache(): หนึ่งคำขอตรวจกับฐานข้อมูลครั้งเดียว แม้หน้าเดียวเรียกหลายฟังก์ชัน
 */
export const getFinanceViewer = cache(async (): Promise<FinanceViewer | null> => {
  const session = await requireAuth()
  if (session) return { userId: session.userId, role: session.role, isAdmin: session.role === 'admin' }

  const cookieStore = await cookies()
  // มี token แต่ตรวจไม่ผ่าน (ลายเซ็นผิด / ถูกเตะออก) = ไม่ผ่าน ห้ามให้ cookie แบบเก่าพาเข้าแทน
  if (cookieStore.get('session_token')?.value) return null

  // session แบบเก่า (ยังไม่มี token): ยอมรับ id จาก cookie แต่บทบาทอ่านจากฐานข้อมูล
  // ponytail: ช่องนี้ยังเชื่อ id ที่ไม่ได้เซ็น — เอาออกเมื่อเลิกใช้ session แบบเก่าทั้งระบบ (ดู CLAUDE.md หัวข้อ Authentication)
  const legacyId = cookieStore.get('session_user_id')?.value
  if (!legacyId) return null
  const { data } = await createServiceClient()
    .from('profiles')
    .select('id, role, is_approved')
    .eq('id', legacyId)
    .single()
  if (!data || !data.is_approved) return null
  const role = (data.role as string) || 'staff'
  return { userId: data.id as string, role, isAdmin: role === 'admin' }
})
