'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { revalidatePath } from 'next/cache'
import { requireAuth } from '@/lib/auth'
import { logActivity } from '@/lib/logger'
import { mergeTargets } from './commission-logic'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

// อ่าน targets เดิมของเดือน (ไม่มีแถว = {})
async function readTargets(month: string): Promise<{ targets: Record<string, number> } | { error: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('sales_board_targets').select('targets').eq('month', month).maybeSingle()
  if (error) return { error: error.message }
  return { targets: (data?.targets as Record<string, number> | null) || {} }
}

// เป้าหมายใช้ร่วมกันทั้งองค์กร — ทุก user เห็นเป้าเดียวกัน
// ponytail: ไม่เช็ก role — ใครล็อกอินก็ตั้งเป้าได้ (หน้านี้เปิดให้ทุก user อยู่แล้ว)
// คงคีย์ cm_* (เป้าค่าคอมแอดมิน) ไว้เสมอ — บันทึก/ล้างเป้าจาก Sales Board ต้องไม่ลบเป้าค่าคอม
export async function saveMonthTargets(month: string, targets: Record<string, number>) {
  if (!MONTH_RE.test(month)) return { error: 'เดือนไม่ถูกต้อง' }
  const cur = await readTargets(month)
  if ('error' in cur) return { error: cur.error }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('sales_board_targets')
    .upsert({ month, targets: mergeTargets(cur.targets, targets, 'board'), updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/sales-board')
  revalidatePath('/sales-board/commission')
  return { ok: true }
}

// เป้าค่าคอมแอดมิน (จำนวนตู้ / จำนวนงานอีเวนต์) ของงวดเดือน `month` — เฉพาะ role admin
// ponytail: ใช้ requireAuth() อย่างเดียว — ผู้ใช้ที่ยังล็อกอินด้วยคุกกี้ legacy ต้องล็อกอินใหม่ก่อนตั้งเป้า
export async function saveCommissionTargets(
  month: string,
  input: { booths: number | null; events: number | null },
) {
  const session = await requireAuth()
  if (!session) return { error: 'Unauthorized' }
  if (session.role !== 'admin') return { error: 'เฉพาะ admin เท่านั้นที่ตั้งเป้าค่าคอมได้' }
  if (!MONTH_RE.test(month)) return { error: 'เดือนไม่ถูกต้อง' }

  const toCount = (v: number | null) => (v == null || !Number.isFinite(Number(v)) ? null : Math.floor(Number(v)))
  const booths = toCount(input?.booths ?? null)
  const events = toCount(input?.events ?? null)

  const cur = await readTargets(month)
  if ('error' in cur) return { error: cur.error }
  const supabase = createServiceClient()
  const { error } = await supabase
    .from('sales_board_targets')
    .upsert({
      month,
      targets: mergeTargets(cur.targets, { cm_booths: booths, cm_events: events }, 'commission'),
      updated_at: new Date().toISOString(),
    })
  if (error) return { error: error.message }

  await logActivity('UPDATE_COMMISSION_TARGET', { month, booths, events })
  revalidatePath('/sales-board')
  revalidatePath('/sales-board/commission')
  return { ok: true }
}
