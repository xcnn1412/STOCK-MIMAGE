'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'

// เป้าหมายใช้ร่วมกันทั้งองค์กร — ทุก user เห็นเป้าเดียวกัน
// ponytail: ไม่เช็ก role — ใครล็อกอินก็ตั้งเป้าได้ (หน้านี้เปิดให้ทุก user อยู่แล้ว)
export async function saveMonthTargets(month: string, targets: Record<string, number>) {
  if (!/^\d{4}-\d{2}$/.test(month)) return { error: 'เดือนไม่ถูกต้อง' }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('sales_board_targets')
    .upsert({ month, targets, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/sales-board')
  return { ok: true }
}
