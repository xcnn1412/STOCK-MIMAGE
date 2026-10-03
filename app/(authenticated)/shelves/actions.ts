'use server'

// ชั้นเก็บของ — สร้าง/แก้/ลบชั้น และวางกระเป๋า/อุปกรณ์บนชั้น
// ทุก action: admin + แผนกที่ดูแลกระเป๋า (getKitManager) — ดู/สแกนได้ทุกคนที่มีสิทธิ์ stock (proxy)

import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { getKitManager } from '@/lib/kit-bookings'
import { requireAuth } from '@/lib/auth'
import { auditMissing, auditTargets } from './shelf-logic'
import { onShelf } from './consumable-logic'

type Result = { error?: string; success?: boolean; id?: string }

const NO_PERMISSION = 'เฉพาะ admin และแผนกที่ดูแลกระเป๋าเท่านั้น'

export interface ShelfInput {
  zone: string
  code: string
  name?: string | null
  note?: string | null
}

function clean(input: ShelfInput): { error: string } | Required<ShelfInput> {
  const zone = (input?.zone || '').trim()
  const code = (input?.code || '').trim()
  if (!zone) return { error: 'กรุณาใส่โซน' }
  if (!code) return { error: 'กรุณาใส่รหัสชั้น' }
  return { zone, code, name: input.name?.trim() || null, note: input.note?.trim() || null }
}

/** รหัสชั้นซ้ำ (unique violation) → ข้อความที่ผู้ใช้เข้าใจ */
const dbError = (e: { code?: string; message: string }) =>
  e.code === '23505' ? 'รหัสชั้นนี้มีอยู่แล้ว' : `บันทึกไม่สำเร็จ: ${e.message}`

function refresh(shelfId?: string) {
  revalidatePath('/shelves')
  if (shelfId) revalidatePath(`/shelves/${shelfId}`)
  revalidatePath('/items')
  revalidatePath('/kits')
}

export async function createShelf(input: ShelfInput): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const row = clean(input)
  if ('error' in row) return row

  const { data, error } = await createServiceClient().from('shelves').insert(row).select('id').single()
  if (error) return { error: dbError(error) }

  await logActivity('CREATE_SHELF', { shelfId: data.id, ...row })
  refresh()
  return { success: true, id: data.id as string }
}

export async function updateShelf(id: string, input: ShelfInput): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  const row = clean(input)
  if ('error' in row) return row

  const { error } = await createServiceClient().from('shelves').update(row).eq('id', id)
  if (error) return { error: dbError(error) }

  await logActivity('UPDATE_SHELF', { shelfId: id, ...row })
  refresh(id)
  return { success: true }
}

export async function deleteShelf(id: string): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }

  const supabase = createServiceClient()
  const { data: shelf } = await supabase.from('shelves').select('code').eq('id', id).maybeSingle()
  // ของบนชั้นไม่ถูกลบ — FK ON DELETE SET NULL ทำให้กลายเป็น "ยังไม่มีชั้น"
  const { error } = await supabase.from('shelves').delete().eq('id', id)
  if (error) return { error: `ลบไม่สำเร็จ: ${error.message}` }

  await logActivity('DELETE_SHELF', { shelfId: id, code: shelf?.code ?? null })
  refresh()
  return { success: true }
}

/**
 * วางกระเป๋า/อุปกรณ์บนชั้น (shelfId = null = เอาออกจากชั้น) — อยู่ชั้นอื่นอยู่แล้วก็ย้ายมา (หน้าจอถามก่อน)
 * อุปกรณ์ที่อยู่ในกระเป๋าวางเองไม่ได้ — อยู่ตามกระเป๋า (ยกเว้นวัสดุสิ้นเปลือง)
 */
export async function moveToShelf(kind: 'kit' | 'item', targetId: string, shelfId: string | null): Promise<Result> {
  if (!(await getKitManager())) return { error: NO_PERMISSION }
  if (kind !== 'kit' && kind !== 'item') return { error: 'ประเภทไม่ถูกต้อง' }

  const supabase = createServiceClient()
  const table = kind === 'kit' ? 'kits' : 'items'

  const { data: target } = await supabase
    .from(table)
    .select(kind === 'item' ? 'id, name, shelf_id, is_consumable' : 'id, name, shelf_id')
    .eq('id', targetId)
    .maybeSingle()
  if (!target) return { error: kind === 'kit' ? 'ไม่พบกระเป๋า' : 'ไม่พบอุปกรณ์' }
  const t = target as unknown as { id: string; name: string; shelf_id: string | null; is_consumable?: boolean }

  // วัสดุสิ้นเปลือง: กองกลางอยู่บนชั้นแม้แบ่งใส่กระเป๋า — วางได้เสมอ
  if (kind === 'item' && shelfId && !t.is_consumable) {
    const { data: inKit } = await supabase.from('kit_contents').select('kits(name)').eq('item_id', targetId).limit(1)
    if (inKit && inKit.length > 0) {
      const kitName = (inKit[0] as unknown as { kits: { name: string } | null }).kits?.name || 'กระเป๋า'
      return { error: `อุปกรณ์นี้อยู่ใน${kitName} — ย้ายกระเป๋าทั้งใบแทน` }
    }
  }
  if (shelfId) {
    const { data: shelf } = await supabase.from('shelves').select('id').eq('id', shelfId).maybeSingle()
    if (!shelf) return { error: 'ไม่พบชั้นนี้' }
  }

  const { error } = await supabase.from(table).update({ shelf_id: shelfId }).eq('id', targetId)
  if (error) return { error: error.message }

  await logActivity('MOVE_TO_SHELF', {
    kind,
    targetId,
    name: t.name,
    fromShelfId: t.shelf_id ?? null,
    toShelfId: shelfId,
  })
  refresh(shelfId ?? undefined)
  if (t.shelf_id) revalidatePath(`/shelves/${t.shelf_id}`)
  return { success: true }
}

/**
 * บันทึกผลตรวจนับชั้น — ใครก็ตามที่เข้าหน้าชั้นได้ (สิทธิ์ stock) ตรวจได้
 * รายการ "ควรเจอ" คิดใหม่จากฐานข้อมูลตอนบันทึก ไม่เชื่อรายการจากหน้าจอ — foundKeys = `kit:<id>` / `item:<id>` ที่ติ๊กว่าเจอ
 * ตรวจแค่บันทึก ไม่เปลี่ยนสถานะอุปกรณ์
 */
export async function submitShelfAudit(shelfId: string, foundKeys: string[], note?: string): Promise<Result & { missing?: number }> {
  const auth = await requireAuth()
  if (!auth?.userId) return { error: 'ไม่ได้เข้าสู่ระบบ' }

  const supabase = createServiceClient()
  const [{ data: shelf }, { data: kits }, { data: items }] = await Promise.all([
    supabase.from('shelves').select('id, code').eq('id', shelfId).maybeSingle(),
    supabase.from('kits').select('id, name, kit_contents(items(status))').eq('shelf_id', shelfId),
    supabase.from('items').select('id, name, status, quantity, is_consumable').eq('shelf_id', shelfId),
  ])
  if (!shelf) return { error: 'ไม่พบชั้นนี้' }

  // วัสดุสิ้นเปลือง: เหลือบนชั้น = ยอดรวม − จำนวนประจำกระเป๋า (คิดจากฐานข้อมูล ไม่เชื่อหน้าจอ)
  type RawItem = { id: string; name: string; status: string; quantity: number | null; is_consumable: boolean | null }
  const rawItems = (items || []) as RawItem[]
  const consumableIds = rawItems.filter(i => i.is_consumable).map(i => i.id)
  const { data: packed } = consumableIds.length
    ? await supabase.from('kit_contents').select('item_id, quantity').in('item_id', consumableIds)
    : { data: [] as { item_id: string; quantity: number }[] }
  const inKits = new Map<string, number>()
  for (const r of packed || []) inKits.set(r.item_id as string, (inKits.get(r.item_id as string) ?? 0) + ((r.quantity as number) || 0))

  type RawKit = { id: string; name: string; kit_contents: { items: { status: string } | null }[] | null }
  const { expected } = auditTargets(
    ((kits || []) as unknown as RawKit[]).map(k => ({
      id: k.id,
      name: k.name,
      itemStatuses: (k.kit_contents || []).map(c => c.items?.status).filter((v): v is string => !!v),
    })),
    rawItems.map(i => ({
      id: i.id,
      name: i.name,
      status: i.status,
      ...(i.is_consumable ? { onShelf: onShelf(i.quantity ?? 0, inKits.get(i.id) ?? 0) } : {}),
    }))
  )
  const missing = auditMissing(expected, Array.isArray(foundKeys) ? foundKeys : [])

  const { error } = await supabase.from('shelf_audits').insert({
    shelf_id: shelfId,
    audited_by: auth.userId,
    expected_count: expected.length,
    found_count: expected.length - missing.length,
    missing,
    note: note?.trim() || null,
  })
  if (error) return { error: `บันทึกไม่สำเร็จ: ${error.message}` }

  await logActivity('AUDIT_SHELF', {
    shelfId,
    code: shelf.code,
    expected: expected.length,
    missing: missing.map(m => m.name),
  })
  refresh(shelfId)
  revalidatePath('/stock/dashboard')
  return { success: true, missing: missing.length }
}
