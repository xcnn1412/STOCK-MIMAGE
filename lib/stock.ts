import { createServiceClient } from '@/lib/supabase-server'
import { requireAuth } from '@/lib/auth'

// วัสดุสิ้นเปลือง — ยอดคงเหลือ (items.quantity) เปลี่ยนผ่าน moveStock() → rpc adjust_item_stock เท่านั้น
// rpc ทำ UPDATE แบบมีเงื่อนไข (ห้ามติดลบ) + บันทึก stock_movements ในคำสั่งเดียว (migration 20261007)

type Db = ReturnType<typeof createServiceClient>

export type StockReason = 'restock' | 'use' | 'discard' | 'adjust'

export interface StockMove {
  itemId: string
  /** + เพิ่ม / − ลด — ทิศทางต้องตรงกับ reason (ฐานข้อมูลตรวจซ้ำ) */
  delta: number
  reason: StockReason
  note?: string | null
  eventId?: string | null
  kitId?: string | null
  userId: string
}

/** exception จาก rpc → ข้อความไทย */
function stockError(e: { code?: string; message: string }): string {
  if (e.message.includes('NOT_CONSUMABLE')) return 'รายการนี้ไม่ใช่วัสดุสิ้นเปลือง'
  if (e.message.includes('INSUFFICIENT_STOCK')) return 'ยอดคงเหลือไม่พอ'
  if (e.code === '23505') return 'บันทึกการใช้ของงานนี้ไปแล้ว'
  if (e.code === '23514') return 'จำนวนไม่ถูกต้อง'
  return `บันทึกยอดไม่สำเร็จ: ${e.message}`
}

/** เปลี่ยนยอดวัสดุสิ้นเปลือง + บันทึกประวัติ — คืนยอดใหม่ หรือ { error } (ไม่ throw) */
export async function moveStock(db: Db, m: StockMove): Promise<{ balance: number } | { error: string }> {
  if (!Number.isInteger(m.delta) || m.delta === 0) return { error: 'จำนวนไม่ถูกต้อง' }
  const { data, error } = await db.rpc('adjust_item_stock', {
    p_item: m.itemId,
    p_delta: m.delta,
    p_reason: m.reason,
    p_note: m.note?.trim() || null,
    p_event: m.eventId ?? null,
    p_kit: m.kitId ?? null,
    p_user: m.userId,
  })
  if (error) return { error: stockError(error) }
  return { balance: data as number }
}

/**
 * ผู้ใช้มีสิทธิ์โมดูลนี้ไหม = admin หรือ profiles.allowed_modules มี key
 * allowed_modules เป็น null = ['stock'] — ค่าเริ่มต้นเดียวกับ proxy.ts
 */
export async function hasModule(key: string): Promise<{ userId: string } | null> {
  const auth = await requireAuth()
  if (!auth?.userId) return null
  if (auth.role === 'admin') return { userId: auth.userId }

  const { data } = await createServiceClient()
    .from('profiles')
    .select('allowed_modules')
    .eq('id', auth.userId)
    .maybeSingle()
  const modules: string[] = Array.isArray(data?.allowed_modules) ? data.allowed_modules : ['stock']
  return modules.includes(key) ? { userId: auth.userId } : null
}

/** ผู้มีสิทธิ์โมดูลสต็อก (เบิกใช้ / ดูประวัติ) */
export const getStockUser = () => hasModule('stock')
