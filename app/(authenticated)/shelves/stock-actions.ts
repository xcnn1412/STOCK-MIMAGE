'use server'

// วัสดุสิ้นเปลืองบนชั้น — เติม / ตัดทิ้ง / ปรับยอด = admin + แผนกดูแลกระเป๋า (getKitManager)
// เบิกใช้ / ดูประวัติ = ทุกคนที่มีสิทธิ์โมดูล stock (getStockUser) · ยอดเปลี่ยนผ่าน moveStock เท่านั้น
// ชื่อ action ห้ามขึ้นต้นด้วย "use" (lint ของ hooks)

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { getKitManager } from '@/lib/kit-bookings'
import { getStockUser, moveStock, type StockReason } from '@/lib/stock'
import { MAX_QTY, parseCount, parseQty } from './consumable-logic'

type Result = { error?: string; success?: boolean; balance?: number }

const NO_PERMISSION = 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น'
const NO_STOCK = 'ไม่มีสิทธิ์ใช้งานโมดูลสต็อก'
const BAD_QTY = `กรุณาใส่จำนวนเต็ม 1–${MAX_QTY.toLocaleString()}`

type Db = ReturnType<typeof createServiceClient>

async function loadItem(db: Db, itemId: string) {
  if (typeof itemId !== 'string' || !itemId) return null
  const { data } = await db
    .from('items')
    .select('id, name, quantity, shelf_id, is_consumable')
    .eq('id', itemId)
    .maybeSingle()
  return data as { id: string; name: string; quantity: number; shelf_id: string | null; is_consumable: boolean } | null
}

function refresh(shelfId: string | null) {
  revalidatePath('/shelves')
  if (shelfId) revalidatePath(`/shelves/${shelfId}`)
  revalidatePath('/items')
  revalidatePath('/stock/dashboard')
}

/** เปลี่ยนยอด + log + refresh — ใช้ร่วมกันทุก action ที่เปลี่ยนยอด */
async function apply(
  userId: string,
  itemId: string,
  delta: number,
  reason: StockReason,
  note: string | null | undefined,
  action: 'RESTOCK_ITEM' | 'DRAW_STOCK' | 'DISCARD_STOCK' | 'ADJUST_STOCK'
): Promise<Result> {
  const db = createServiceClient()
  const item = await loadItem(db, itemId)
  if (!item) return { error: 'ไม่พบอุปกรณ์' }
  if (!item.is_consumable) return { error: 'รายการนี้ไม่ใช่วัสดุสิ้นเปลือง' }

  const moved = await moveStock(db, { itemId, delta, reason, note, userId })
  if ('error' in moved) return { error: moved.error }

  await logActivity(action, { itemId, name: item.name, delta, balance: moved.balance, note: note?.trim() || null })
  refresh(item.shelf_id)
  return { success: true, balance: moved.balance }
}

/** เติม (+) — ผู้ดูแล */
export async function restockItem(itemId: string, qty: number, note?: string): Promise<Result> {
  const manager = await getKitManager()
  if (!manager) return { error: NO_PERMISSION }
  const n = parseQty(qty)
  if (n == null) return { error: BAD_QTY }
  return apply(manager.userId, itemId, n, 'restock', note, 'RESTOCK_ITEM')
}

/** ตัดทิ้ง (−) ต้องมีหมายเหตุ — ผู้ดูแล */
export async function discardStock(itemId: string, qty: number, note: string): Promise<Result> {
  const manager = await getKitManager()
  if (!manager) return { error: NO_PERMISSION }
  const n = parseQty(qty)
  if (n == null) return { error: BAD_QTY }
  if (typeof note !== 'string' || !note.trim()) return { error: 'กรุณาใส่หมายเหตุว่าทำไมตัดทิ้ง' }
  return apply(manager.userId, itemId, -n, 'discard', note, 'DISCARD_STOCK')
}

/** ปรับยอดคงเหลือเป็น newTotal (หน้าจอคิดจาก "นับได้บนชั้น" + ในกระเป๋า) — ผู้ดูแล */
export async function adjustStock(itemId: string, newTotal: number, note?: string): Promise<Result> {
  const manager = await getKitManager()
  if (!manager) return { error: NO_PERMISSION }
  const total = parseCount(newTotal)
  if (total == null) return { error: `กรุณาใส่จำนวนเต็ม 0–${MAX_QTY.toLocaleString()}` }

  const item = await loadItem(createServiceClient(), itemId)
  if (!item) return { error: 'ไม่พบอุปกรณ์' }
  // ponytail: อ่านยอดแล้วค่อยส่ง delta — ถ้ามีคนเบิกระหว่างนั้น ยอดสุดท้ายคลาดเท่าที่เบิก (rpc ยังกันติดลบ); ย้ายไปคิดใน rpc ถ้าเจอจริง
  const delta = total - item.quantity
  if (delta === 0) return { success: true, balance: total }
  return apply(manager.userId, itemId, delta, 'adjust', note, 'ADJUST_STOCK')
}

/** เบิกใช้ (−) — ทุกคนที่มีสิทธิ์ stock */
export async function drawStock(itemId: string, qty: number, note?: string): Promise<Result> {
  const user = await getStockUser()
  if (!user) return { error: NO_STOCK }
  const n = parseQty(qty)
  if (n == null) return { error: BAD_QTY }
  return apply(user.userId, itemId, -n, 'use', note, 'DRAW_STOCK')
}

export interface StockHistoryRow {
  id: string
  delta: number
  balanceAfter: number
  reason: StockReason
  note: string | null
  createdAt: string
  byName: string | null
  eventName: string | null
}

/** ประวัติ 30 แถวล่าสุด — ทุกคนที่มีสิทธิ์ stock */
export async function loadStockHistory(itemId: string): Promise<{ error?: string; rows?: StockHistoryRow[] }> {
  const user = await getStockUser()
  if (!user) return { error: NO_STOCK }
  if (typeof itemId !== 'string' || !itemId) return { error: 'ไม่พบอุปกรณ์' }

  const { data, error } = await createServiceClient()
    .from('stock_movements')
    .select('id, delta, balance_after, reason, note, created_at, events(name), profiles(full_name, nickname)')
    .eq('item_id', itemId)
    .order('created_at', { ascending: false })
    .limit(30)
  if (error) return { error: `โหลดประวัติไม่สำเร็จ: ${error.message}` }

  type Raw = {
    id: string
    delta: number
    balance_after: number
    reason: StockReason
    note: string | null
    created_at: string
    events: { name: string | null } | null
    profiles: { full_name: string | null; nickname: string | null } | null
  }
  return {
    rows: ((data || []) as unknown as Raw[]).map(r => ({
      id: r.id,
      delta: r.delta,
      balanceAfter: r.balance_after,
      reason: r.reason,
      note: r.note,
      createdAt: r.created_at,
      byName: r.profiles?.nickname || r.profiles?.full_name || null,
      eventName: r.events?.name ?? null,
    })),
  }
}
