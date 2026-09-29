// ============================================================================
// ผู้ใช้ที่กำลังใช้งานส่วนใบเบิก — ตัวตนและบทบาทที่ยืนยันแล้ว
// ใช้ทั้งในหน้า (server component) และใน server action
//
// ห้ามอ่าน session_role / session_user_id จาก cookie มาตัดสินสิทธิ์หรือเลือกข้อมูล:
// cookie สองตัวนั้นไม่ได้เซ็น ผู้ใช้แก้เองได้ บทบาทต้องมาจากฐานข้อมูลเสมอ (ผ่าน requireAuth)
//
// ไฟล์นี้ไม่ใช่ 'use server' (ฟังก์ชันที่ export จึงไม่กลายเป็น endpoint) และห้าม import จาก client component
// ============================================================================

import { cache } from 'react'
import { requireAuth } from '@/lib/auth'

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
  const s = await requireAuth()
  return s ? { userId: s.userId, role: s.role, isAdmin: s.role === 'admin' } : null
})
