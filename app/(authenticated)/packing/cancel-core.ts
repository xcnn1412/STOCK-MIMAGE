// แกนยกเลิกใบจัดของ — ใช้ร่วมระหว่าง packing/actions.ts (cancelPackingList / reopenPacking / unpickLine)
// และ events/actions.ts::cancelEvent
// ตั้งใจไม่ประกาศ 'use server' — ทุก export ที่นี่รับ service client และไม่ตรวจสิทธิ์ ผู้เรียกต้องตรวจเองก่อนเสมอ
import type { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { recomputeKitPointers } from '@/lib/kit-bookings'
import { checkinKitItem } from '../kits/[id]/check/kit-check-core'
import { canCancelList, canTransition } from './packing-logic'
import { loadKitItemStates, loadPackingLines } from './queries'
import type { PackingLineRow, PackingListRow } from './types'

type Db = ReturnType<typeof createServiceClient>

export async function unbookKits(db: Db, eventId: string, kitIds: string[]): Promise<string | null> {
  if (kitIds.length === 0) return null
  const { error } = await db.from('event_kits').delete().eq('event_id', eventId).in('kit_id', kitIds)
  return error ? 'ยกเลิกจองกระเป๋าไม่สำเร็จ' : null
}

/** ย้อนการหยิบของบรรทัดหนึ่ง (คืนสถานะเป็นใช้ได้) — ไม่แตะ picked_at ของใบ ผู้เรียกจัดการเอง */
export async function revertPick(db: Db, line: PackingLineRow, eventId: string, userId: string): Promise<string | null> {
  if (line.item_id) {
    const { data: item } = await db.from('items').select('status').eq('id', line.item_id).maybeSingle<{ status: string }>()
    if (item?.status === 'in_use') {
      const { error } = await db.from('items').update({ status: 'available' }).eq('id', line.item_id)
      if (error) return 'คืนสถานะอุปกรณ์ไม่สำเร็จ'
      await db
        .from('event_logs')
        .insert({ event_id: eventId, item_id: line.item_id, kit_id: null, user_id: userId, action: 'checkin', condition: 'good', note: 'ยกเลิกหยิบ (ใบจัดของ)' })
    }
    return null
  }
  if (line.kit_id) {
    // ชิ้นที่นำออกให้อีเวนต์นี้ (in_use และการนำออกล่าสุดเป็นของอีเวนต์นี้) → คืนเป็นใช้ได้
    const states = (await loadKitItemStates(db, [line.kit_id], eventId))[line.kit_id] ?? []
    for (const i of states.filter(s => !s.is_consumable && s.status === 'in_use' && !s.outElsewhere)) {
      const res = await checkinKitItem(db, { eventId, kitId: line.kit_id, itemId: i.id, status: 'available', note: 'ยกเลิกหยิบ (ใบจัดของ)', userId })
      if ('error' in res) return res.error
    }
  }
  return null
}

/** พร้อมรับ → กำลังหยิบ (ก่อนรับของเท่านั้น) — เคลียร์ packed_at/staged_at ไม่ลบรูป · คืนข้อความ error หรือ null */
export async function reopenListCore(db: Db, list: PackingListRow): Promise<string | null> {
  if (list.status !== 'ready' || !canTransition('ready', 'picking')) return 'แก้ไขได้เฉพาะใบที่พร้อมรับและยังไม่ถูกรับของ'
  const { error } = await db
    .from('packing_lists')
    .update({ status: 'picking', packed_at: null, packed_by: null, staged_at: null, updated_at: new Date().toISOString() })
    .eq('id', list.id)
    .eq('status', 'ready')
  if (error) return 'ถอยกลับเป็นกำลังหยิบไม่สำเร็จ'
  await logActivity('REOPEN_PACKING', { id: list.id, event_id: list.event_id })
  return null
}

/**
 * ยกเลิกใบ (เฉพาะ เลือกของ/กำลังหยิบ) — ยกเลิกหยิบทุกบรรทัด (คืนสถานะ) + ลบ event_kits ของกระเป๋าในใบ + ลบใบ
 * คืน kitIds ที่ถอดจอง (ให้ผู้เรียก revalidate หน้า QR กระเป๋า)
 */
export async function cancelListCore(db: Db, list: PackingListRow, userId: string): Promise<{ error: string } | { kitIds: string[] }> {
  if (!canCancelList(list.status)) return { error: 'ยกเลิกได้เฉพาะใบที่อยู่ในขั้นเลือกของหรือกำลังหยิบ — ใบที่พร้อมรับให้กด "แก้ไข" ก่อน' }

  const lines = await loadPackingLines(db, [list.id]).catch(() => null)
  if (!lines) return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  for (const line of lines.filter(l => l.picked_at)) {
    let failed: string | null
    try {
      failed = await revertPick(db, line, list.event_id, userId)
    } catch (e) {
      console.error('cancelPackingList revert', e)
      failed = 'คืนสถานะอุปกรณ์ไม่สำเร็จ'
    }
    if (failed) return { error: `${failed} — ใบยังไม่ถูกยกเลิก ลองใหม่อีกครั้ง` }
    await db.from('packing_list_items').update({ picked_at: null, picked_by: null }).eq('id', line.id)
  }

  const kitIds = [...new Set(lines.flatMap(l => (l.kit_id ? [l.kit_id] : [])))]
  const unbookError = await unbookKits(db, list.event_id, kitIds)
  if (unbookError) return { error: unbookError }
  // บรรทัดลบตามด้วย ON DELETE CASCADE
  const { error } = await db.from('packing_lists').delete().eq('id', list.id)
  if (error) return { error: 'ยกเลิกใบจัดของไม่สำเร็จ' }
  await recomputeKitPointers(db, kitIds)

  await logActivity('CANCEL_PACKING_LIST', { id: list.id, event_id: list.event_id, lead_id: list.lead_id, lines: lines.length, unbooked_kits: kitIds })
  return { kitIds }
}
