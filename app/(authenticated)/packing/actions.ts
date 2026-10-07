'use server'

// ใบจัดของ (เฟส 3): เปิดใบ → เลือกของ → กำลังหยิบ → พร้อมรับ (+ ถอยกลับ/ยกเลิก)
// ทุก action: ทีมจัดของเท่านั้น (getPackingTeam) · อีเวนต์ปิดแล้ว = error · คืน { error } ไทย ไม่ throw · logActivity ทุก mutation
// ใบจัดของเป็นเจ้าของการจองกระเป๋าของอีเวนต์นั้น: บรรทัดกระเป๋า = upsert event_kits · ลบบรรทัด/ยกเลิกใบ = ลบแถว event_kits
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { recomputeKitPointers } from '@/lib/kit-bookings'
import { isWonStatus } from '../crm/types'
import { isClosedEvent } from '../jobs/tracking/tracking-logic'
import { resolveLeadEvent } from '../jobs/actions'
import { checkinKitItem, checkoutKitItems } from '../kits/[id]/check/kit-check-core'
import { loadLeadPackages, loadPickerPackages } from '../packages/lead-packages'
import { loadCategoryUnits } from '../packages/queries'
import type { CategoryUnits, LeadPackageRow } from '../packages/types'
import { packingReadyMessage, packingReadyRecipients } from './notify'
import { canCancelList, canConfirmReady, canPickLine, canStartPicking, canTransition, checkPackingLines, scaffoldLines } from './packing-logic'
import { getPackingTeam, type PackingTeamMember } from './permissions'
import { loadKitItemStates, loadPackingLines, loadPackingListRow } from './queries'
import type { PackingLineInput, PackingLineRow, PackingListRow, ScaffoldRequirement, UnitInfo } from './types'

type Db = ReturnType<typeof createServiceClient>
type Result = { error: string } | { success: true }

const NO_ACCESS = 'เฉพาะแอดมินและทีมจัดของเท่านั้นที่จัดของได้'
const NOT_FOUND = 'ไม่พบใบจัดของนี้'
const EVENT_CLOSED = 'อีเวนต์นี้ปิดงานไปแล้ว — แก้ใบจัดของไม่ได้'
const BUCKET = 'packing-photos'
const MAX_PHOTO_BYTES = 5 * 1024 * 1024

function refresh(listId?: string, kitIds: (string | null | undefined)[] = []) {
  revalidatePath('/packing')
  if (listId) revalidatePath(`/packing/${listId}`)
  revalidatePath('/jobs/tracking')
  for (const kitId of new Set(kitIds.filter((k): k is string => !!k))) revalidatePath(`/kits/${kitId}/check`)
}

type EventInfo = { id: string; name: string | null; status: string | null }

/** ใบ + อีเวนต์ของใบ (ต้องยังไม่ปิด) · พัง/ไม่พบ = { error } */
async function loadOpenList(db: Db, listId: string): Promise<{ list: PackingListRow; event: EventInfo } | { error: string }> {
  let list: PackingListRow | null
  try {
    list = await loadPackingListRow(db, listId)
  } catch (e) {
    console.error('packing loadOpenList', e)
    return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  if (!list) return { error: NOT_FOUND }
  const { data: event } = await db.from('events').select('id, name, status').eq('id', list.event_id).maybeSingle<EventInfo>()
  if (!event) return { error: 'ไม่พบอีเวนต์ของใบจัดของนี้' }
  if (isClosedEvent(event.status)) return { error: EVENT_CLOSED }
  return { list, event }
}

/** โครงใบจากแพ็กเกจของงาน (lead_packages × package_requirements) */
async function loadScaffold(db: Db, leadId: string | null): Promise<{ leadPackages: LeadPackageRow[]; scaffold: ScaffoldRequirement[] }> {
  if (!leadId) return { leadPackages: [], scaffold: [] }
  const leadPackages = (await loadLeadPackages(db, [leadId]))[leadId] ?? []
  const packages = await loadPickerPackages(db, { onlyIds: [...new Set(leadPackages.map(p => p.packageId))] })
  return { leadPackages, scaffold: scaffoldLines(leadPackages, packages) }
}

/** จองกระเป๋าเหล่านี้ให้อีเวนต์ (จองซ้ำคู่เดิม = ไม่เปลี่ยนอะไร — สถานะจัดครบเดิมไม่หาย) */
async function bookKits(db: Db, eventId: string, kitIds: string[]): Promise<string | null> {
  if (kitIds.length === 0) return null
  const { error } = await db
    .from('event_kits')
    .upsert(kitIds.map(kit_id => ({ event_id: eventId, kit_id })), { onConflict: 'event_id,kit_id', ignoreDuplicates: true })
  return error ? 'จองกระเป๋าให้อีเวนต์ไม่สำเร็จ' : null
}

async function unbookKits(db: Db, eventId: string, kitIds: string[]): Promise<string | null> {
  if (kitIds.length === 0) return null
  const { error } = await db.from('event_kits').delete().eq('event_id', eventId).in('kit_id', kitIds)
  return error ? 'ยกเลิกจองกระเป๋าไม่สำเร็จ' : null
}

/** ชื่อ/สถานะ/การอยู่ในกระเป๋าของหน่วยเหล่านี้ (ตรวจบรรทัดก่อนบันทึก) */
async function loadUnitInfo(db: Db, itemIds: string[], kitIds: string[]): Promise<Record<string, UnitInfo>> {
  const [items, kits, contents] = await Promise.all([
    itemIds.length ? db.from('items').select('id, name, status').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    kitIds.length ? db.from('kits').select('id, name').in('id', kitIds) : Promise.resolve({ data: [], error: null }),
    itemIds.length ? db.from('kit_contents').select('item_id').in('item_id', itemIds) : Promise.resolve({ data: [], error: null }),
  ])
  const error = items.error ?? kits.error ?? contents.error
  if (error) throw new Error(error.message)
  const inKit = new Set(((contents.data ?? []) as { item_id: string }[]).map(c => c.item_id))
  const out: Record<string, UnitInfo> = {}
  for (const i of (items.data ?? []) as { id: string; name: string; status: string }[]) out[i.id] = { id: i.id, kind: 'item', name: i.name, status: i.status, inKit: inKit.has(i.id) }
  for (const k of (kits.data ?? []) as { id: string; name: string }[]) out[k.id] = { id: k.id, kind: 'kit', name: k.name, status: 'available', inKit: false }
  return out
}

// --- เปิดใบ -------------------------------------------------------------------

/**
 * เปิดใบจัดของของงาน (สถานะ เลือกของ) — งานต้องตอบรับแล้วและมีแพ็กเกจ ≥ 1
 * eventId ไม่ส่ง = อีเวนต์ที่ยังไม่ปิดใบแรกของงาน (ไม่มี = สร้างอีเวนต์ "main" ให้ — resolveLeadEvent)
 * อีเวนต์มีใบอยู่แล้ว = คืน id เดิม · ตู้ที่ทีมขายเลือก (lead_package_units) เป็นบรรทัด locked พร้อมแบบประกอบ
 */
export async function createPackingList(leadId: string, eventId?: string | null): Promise<{ id: string } | { error: string }> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()

  const { data: lead } = await db.from('crm_leads').select('id, customer_name, status').eq('id', leadId).maybeSingle<{ id: string; customer_name: string | null; status: string | null }>()
  if (!lead || !isWonStatus(lead.status)) return { error: 'เปิดใบจัดของได้เฉพาะงานที่ลูกค้าตอบรับแล้ว' }

  let scaffold: ScaffoldRequirement[]
  try {
    const loaded = await loadScaffold(db, leadId)
    if (loaded.leadPackages.length === 0) return { error: 'งานนี้ยังไม่มีแพ็กเกจ — ให้ทีมขายเลือกแพ็กเกจก่อนเปิดใบจัดของ' }
    scaffold = loaded.scaffold
  } catch (e) {
    console.error('createPackingList scaffold', e)
    return { error: 'โหลดแพ็กเกจของงานไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }

  const resolved = await resolveLeadEvent(db, leadId, eventId ?? null, { pickExisting: true, source: 'packing' })
  if ('error' in resolved) return { error: resolved.error }
  const targetEventId = resolved.eventId
  const { data: event } = await db.from('events').select('id, name, status').eq('id', targetEventId).maybeSingle<EventInfo>()
  if (!event) return { error: 'ไม่พบอีเวนต์ของงานนี้' }
  if (isClosedEvent(event.status)) return { error: 'อีเวนต์นี้ปิดงานไปแล้ว — เปิดใบจัดของไม่ได้' }

  const existing = async () => (await db.from('packing_lists').select('id').eq('event_id', targetEventId).maybeSingle<{ id: string }>()).data
  const had = await existing()
  if (had) return { id: had.id }

  const { data: created, error } = await db
    .from('packing_lists')
    .insert({ event_id: targetEventId, lead_id: leadId, status: 'selecting', created_by: team.userId })
    .select('id')
    .single<{ id: string }>()
  if (error || !created) {
    // สองคนกดพร้อมกัน — UNIQUE (event_id) ชน: คืนใบที่อีกคนเพิ่งสร้าง
    if (error?.code === '23505') {
      const again = await existing()
      if (again) return { id: again.id }
    }
    console.error('createPackingList insert', error)
    return { error: 'เปิดใบจัดของไม่สำเร็จ' }
  }

  // บรรทัด locked: ชิ้นที่ทีมขายเลือก (ตู้) พร้อมแบบประกอบ — ชิ้นเดียวกันซ้ำในใบเดียวไม่ได้ (UNIQUE) ใส่ครั้งเดียว
  const seen = new Set<string>()
  const locked = scaffold.flatMap(r =>
    r.lockedUnits
      .filter(u => (seen.has(u.unitId) ? false : (seen.add(u.unitId), true)))
      .map(u => ({
        list_id: created.id,
        package_id: r.packageId,
        category_id: r.categoryId,
        item_id: u.kind === 'item' ? u.unitId : null,
        kit_id: u.kind === 'kit' ? u.unitId : null,
        variant: u.variant,
        locked: true,
      })),
  )
  if (locked.length) {
    const { error: lineError } = await db.from('packing_list_items').insert(locked)
    if (lineError) console.error('createPackingList locked lines', lineError)
    const kitIds = locked.flatMap(l => (l.kit_id ? [l.kit_id] : []))
    if (kitIds.length) {
      await bookKits(db, targetEventId, kitIds)
      await recomputeKitPointers(db, kitIds)
    }
  }

  await logActivity('CREATE_PACKING_LIST', { id: created.id, lead_id: leadId, event_id: targetEventId, customer_name: lead.customer_name, locked: locked.length })
  refresh(created.id, locked.map(l => l.kit_id))
  return { id: created.id }
}

// --- เลือกของ ------------------------------------------------------------------

/**
 * แทนที่บรรทัดทั้งชุด (ยกเว้นบรรทัด locked ซึ่งเปลี่ยนไม่ได้) — เฉพาะสถานะ เลือกของ
 * ตรวจ: หน่วยซ้ำ · หน่วยอยู่ในตัวเลือกของข้อกำหนด (ของเสริมไม่ตรวจ) · อุปกรณ์ในกระเป๋าเป็นบรรทัดเดี่ยวไม่ได้ · ไม่เกินจำนวนช่อง
 * sync event_kits: upsert กระเป๋าที่เพิ่ม · ลบกระเป๋าที่หายไป · recomputeKitPointers
 * ponytail: หลายคำขอไม่อยู่ใน transaction เดียว — พังกลางทาง ผู้ใช้กดบันทึกซ้ำได้ (แทนที่ทั้งชุด)
 */
export async function setPackingLines(listId: string, lines: PackingLineInput[]): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'selecting') return { error: 'แก้รายการได้เฉพาะขั้นเลือกของ — ถอยกลับเป็นเลือกของก่อน' }

  let scaffold: ScaffoldRequirement[]
  let units: CategoryUnits
  let info: Record<string, UnitInfo>
  let existing: PackingLineRow[]
  try {
    scaffold = (await loadScaffold(db, ctx.list.lead_id)).scaffold
    units = await loadCategoryUnits(db, { categoryIds: [...new Set(scaffold.map(r => r.categoryId))] })
    const raw = Array.isArray(lines) ? lines : []
    info = await loadUnitInfo(
      db,
      [...new Set(raw.flatMap(l => (l?.itemId ? [String(l.itemId)] : [])))],
      [...new Set(raw.flatMap(l => (l?.kitId ? [String(l.kitId)] : [])))],
    )
    existing = await loadPackingLines(db, [listId])
  } catch (e) {
    console.error('setPackingLines load', e)
    return { error: 'โหลดข้อมูลใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }

  const lockedRows = existing.filter(l => l.locked)
  const checked = checkPackingLines(lines, scaffold, units, info, lockedRows)
  if ('error' in checked) return checked

  // แทนที่บรรทัดที่ไม่ล็อกทั้งชุด (ขั้นเลือกของยังไม่มีบรรทัดที่หยิบ)
  const oldFree = existing.filter(l => !l.locked)
  if (oldFree.length) {
    const { error } = await db.from('packing_list_items').delete().in('id', oldFree.map(l => l.id))
    if (error) return { error: 'ล้างรายการเดิมไม่สำเร็จ' }
  }
  if (checked.length) {
    const { error } = await db.from('packing_list_items').insert(
      checked.map(l => ({ list_id: listId, package_id: l.packageId, category_id: l.categoryId, item_id: l.itemId, kit_id: l.kitId, variant: l.variant, locked: false })),
    )
    if (error) {
      console.error('setPackingLines insert', error)
      return { error: error.code === '23505' ? 'มีหน่วยที่ซ้ำในใบนี้' : 'บันทึกรายการไม่สำเร็จ' }
    }
  }

  // event_kits: กระเป๋าในใบ = จองให้อีเวนต์นี้ · กระเป๋าที่ถูกเอาออกจากใบ = ยกเลิกจอง
  const lockedKits = lockedRows.flatMap(l => (l.kit_id ? [l.kit_id] : []))
  const newKits = new Set([...lockedKits, ...checked.flatMap(l => (l.kitId ? [l.kitId] : []))])
  const removedKits = oldFree.flatMap(l => (l.kit_id && !newKits.has(l.kit_id) ? [l.kit_id] : []))
  const bookError = (await bookKits(db, ctx.list.event_id, [...newKits])) ?? (await unbookKits(db, ctx.list.event_id, removedKits))
  if (bookError) return { error: bookError }
  await recomputeKitPointers(db, [...newKits, ...removedKits])
  await db.from('packing_lists').update({ updated_at: new Date().toISOString() }).eq('id', listId)

  await logActivity('UPDATE_PACKING_LINES', {
    id: listId,
    event_id: ctx.list.event_id,
    lines: checked.map(l => ({ package_id: l.packageId, category_id: l.categoryId, item_id: l.itemId, kit_id: l.kitId, variant: l.variant })),
    locked: lockedRows.length,
    unbooked_kits: removedKits,
  })
  refresh(listId, [...newKits, ...removedKits])
  return { success: true }
}

/** สร้างใบจัดของ: เลือกของ → กำลังหยิบ (ทุกข้อกำหนดต้องมีหน่วยครบจำนวน) */
export async function startPicking(listId: string): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (!canTransition(ctx.list.status, 'picking') || ctx.list.status !== 'selecting') return { error: 'สร้างใบจัดของได้เฉพาะขั้นเลือกของ' }

  let lines: PackingLineRow[]
  let scaffold: ScaffoldRequirement[]
  try {
    lines = await loadPackingLines(db, [listId])
    scaffold = (await loadScaffold(db, ctx.list.lead_id)).scaffold
  } catch (e) {
    console.error('startPicking load', e)
    return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  const ok = canStartPicking(lines, scaffold)
  if ('error' in ok) return ok

  const { error } = await db.from('packing_lists').update({ status: 'picking', updated_at: new Date().toISOString() }).eq('id', listId).eq('status', 'selecting')
  if (error) return { error: 'สร้างใบจัดของไม่สำเร็จ' }
  await logActivity('START_PICKING', { id: listId, event_id: ctx.list.event_id, lines: lines.length })
  refresh(listId)
  return { success: true }
}

/** ถอยกลับ: กำลังหยิบ → เลือกของ (เฉพาะเมื่อยังไม่มีบรรทัดที่หยิบ) */
export async function backToSelecting(listId: string): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'picking' || !canTransition('picking', 'selecting')) return { error: 'ถอยกลับเป็นเลือกของได้เฉพาะขั้นกำลังหยิบ' }

  const lines = await loadPackingLines(db, [listId]).catch(() => null)
  if (!lines) return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  if (lines.some(l => l.picked_at)) return { error: 'มีของที่หยิบแล้ว — ยกเลิกหยิบทุกบรรทัดก่อนถอยกลับเป็นเลือกของ' }

  const { error } = await db.from('packing_lists').update({ status: 'selecting', updated_at: new Date().toISOString() }).eq('id', listId)
  if (error) return { error: 'ถอยกลับไม่สำเร็จ' }
  await logActivity('BACK_TO_SELECTING_PACKING', { id: listId, event_id: ctx.list.event_id })
  refresh(listId)
  return { success: true }
}

// --- หยิบของ -------------------------------------------------------------------

async function loadLine(db: Db, lineId: string): Promise<PackingLineRow | null> {
  const { data } = await db
    .from('packing_list_items')
    .select('id, list_id, package_id, category_id, item_id, kit_id, variant, locked, picked_at, picked_by, handed_over_at, returned_at, return_condition, return_note, restocked_at, restocked_by, created_at')
    .eq('id', lineId)
    .maybeSingle<PackingLineRow>()
  return data ?? null
}

/**
 * หยิบบรรทัดหนึ่ง (เฉพาะขั้นกำลังหยิบ) — อุปกรณ์เดี่ยว available → in_use + event_logs checkout (kit_id null)
 * กระเป๋า = นำออกทุกชิ้นที่ available ในกระเป๋า (kit-check-core: event_logs + syncPacked)
 */
export async function pickLine(lineId: string): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const line = await loadLine(db, lineId)
  if (!line) return { error: 'ไม่พบบรรทัดนี้ในใบจัดของ' }
  const ctx = await loadOpenList(db, line.list_id)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'picking') return { error: 'หยิบของได้เฉพาะขั้นกำลังหยิบ' }
  const eventId = ctx.list.event_id

  if (line.item_id) {
    const { data: item } = await db.from('items').select('id, name, status').eq('id', line.item_id).maybeSingle<{ id: string; name: string; status: string }>()
    const ok = canPickLine(line, { itemStatus: item?.status ?? null })
    if ('error' in ok) return ok
    const { error } = await db.from('items').update({ status: 'in_use' }).eq('id', line.item_id).eq('status', 'available')
    if (error) return { error: 'หยิบของไม่สำเร็จ' }
    const { error: logError } = await db
      .from('event_logs')
      .insert({ event_id: eventId, item_id: line.item_id, kit_id: null, user_id: team.userId, action: 'checkout', condition: 'good' })
    if (logError) console.error('pickLine event_logs', logError)
  } else if (line.kit_id) {
    let states
    try {
      states = (await loadKitItemStates(db, [line.kit_id], eventId))[line.kit_id] ?? []
    } catch (e) {
      console.error('pickLine kit items', e)
      return { error: 'โหลดของในกระเป๋าไม่สำเร็จ ลองใหม่อีกครั้ง' }
    }
    const ok = canPickLine(line, { kitItems: states })
    if ('error' in ok) return ok
    // ใบจัดของเป็นเจ้าของการจอง — กันกรณีแถว event_kits หายไป (เช่น ถูกยกเลิกจองจากพูล)
    await bookKits(db, eventId, [line.kit_id])
    const ids = states.filter(i => !i.is_consumable && i.status === 'available').map(i => i.id)
    const res = await checkoutKitItems(db, { eventId, kitId: line.kit_id, itemIds: ids, userId: team.userId })
    if ('error' in res) return res
    await recomputeKitPointers(db, [line.kit_id])
  } else {
    return { error: 'บรรทัดนี้ไม่มีอุปกรณ์' }
  }

  const { error: lineError } = await db.from('packing_list_items').update({ picked_at: new Date().toISOString(), picked_by: team.userId }).eq('id', lineId)
  if (lineError) return { error: 'หยิบแล้ว แต่บันทึกในใบจัดของไม่สำเร็จ — กดหยิบอีกครั้ง' }
  await logActivity('PICK_PACKING_LINE', { id: line.list_id, line_id: lineId, item_id: line.item_id, kit_id: line.kit_id, event_id: eventId })
  refresh(line.list_id, [line.kit_id])
  return { success: true }
}

/** ย้อนการหยิบของบรรทัดหนึ่ง (คืนสถานะเป็นใช้ได้) — ไม่แตะ picked_at ของใบ ผู้เรียกจัดการเอง */
async function revertPick(db: Db, line: PackingLineRow, eventId: string, userId: string): Promise<string | null> {
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

/** ยกเลิกหยิบบรรทัดหนึ่ง (เฉพาะขั้นกำลังหยิบ) — คืนสถานะอุปกรณ์/ชิ้นในกระเป๋าเป็นใช้ได้ */
export async function unpickLine(lineId: string): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const line = await loadLine(db, lineId)
  if (!line) return { error: 'ไม่พบบรรทัดนี้ในใบจัดของ' }
  const ctx = await loadOpenList(db, line.list_id)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'picking') return { error: 'ยกเลิกหยิบได้เฉพาะขั้นกำลังหยิบ — ถ้าใบพร้อมรับแล้วให้กด "แก้ไข" ก่อน' }
  if (!line.picked_at) return { error: 'บรรทัดนี้ยังไม่ได้หยิบ' }

  let failed: string | null
  try {
    failed = await revertPick(db, line, ctx.list.event_id, team.userId)
  } catch (e) {
    console.error('unpickLine revert', e)
    failed = 'คืนสถานะอุปกรณ์ไม่สำเร็จ'
  }
  if (failed) return { error: failed }
  const { error } = await db.from('packing_list_items').update({ picked_at: null, picked_by: null }).eq('id', lineId)
  if (error) return { error: 'ยกเลิกหยิบไม่สำเร็จ' }
  if (line.kit_id) await recomputeKitPointers(db, [line.kit_id])
  await logActivity('UNPICK_PACKING_LINE', { id: line.list_id, line_id: lineId, item_id: line.item_id, kit_id: line.kit_id, event_id: ctx.list.event_id })
  refresh(line.list_id, [line.kit_id])
  return { success: true }
}

// --- ยืนยันจัดของ ----------------------------------------------------------------

/** อัปโหลดรูปชุดที่จัดเสร็จ (formData: listId, file) → bucket packing-photos `<listId>/<ts>_<name>` · คืน public URL */
export async function uploadPackingPhoto(formData: FormData): Promise<{ url: string } | { error: string }> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const file = formData.get('file') as File | null
  const listId = formData.get('listId') as string | null
  if (!file || typeof file === 'string') return { error: 'ไม่พบไฟล์' }
  if (!listId) return { error: NOT_FOUND }
  if (!file.type?.startsWith('image/')) return { error: 'รองรับเฉพาะไฟล์รูปภาพ' }
  if (file.size > MAX_PHOTO_BYTES) return { error: 'ไฟล์ใหญ่เกิน 5MB' }

  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx

  const sanitizedName = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${listId}/${Date.now()}_${sanitizedName}`
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) {
    console.error('uploadPackingPhoto', error)
    return { error: 'อัปโหลดรูปไม่สำเร็จ' }
  }
  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}

/**
 * ยืนยันจัดของ: กำลังหยิบ → พร้อมรับ — หยิบครบทุกบรรทัด + รูป ≥ 1 + จุดรับของที่เปิดใช้
 * บันทึก packed_at/by, spot_id, staged_at, photo_urls · แจ้งเตือน packing_ready ถึงหัวหน้างาน + คนในอีเวนต์
 * รูปต้องเป็นของ bucket packing-photos ในโฟลเดอร์ของใบนี้ (กัน URL จากที่อื่น)
 */
export async function confirmPacking(listId: string, input: { photoUrls: string[]; spotId: string }): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (!canTransition(ctx.list.status, 'ready')) return { error: 'ยืนยันจัดของได้เฉพาะใบที่อยู่ในขั้นกำลังหยิบ' }

  const photoUrls = [...new Set((Array.isArray(input?.photoUrls) ? input.photoUrls : []).filter((u): u is string => typeof u === 'string' && u.includes(`/${BUCKET}/${listId}/`)))]
  const spotId = typeof input?.spotId === 'string' && input.spotId ? input.spotId : null
  let spot: { id: string; name: string; is_active: boolean } | null = null
  if (spotId) {
    const { data } = await db.from('pickup_spots').select('id, name, is_active').eq('id', spotId).maybeSingle<{ id: string; name: string; is_active: boolean }>()
    if (!data || !data.is_active) return { error: 'ไม่พบจุดรับของนี้ หรือจุดนี้ปิดใช้แล้ว — เลือกจุดอื่น' }
    spot = data
  }

  const lines = await loadPackingLines(db, [listId]).catch(() => null)
  if (!lines) return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  const ok = canConfirmReady({ status: ctx.list.status, photo_urls: photoUrls, spot_id: spot?.id ?? null }, lines)
  if ('error' in ok) return ok

  const now = new Date().toISOString()
  const { error } = await db
    .from('packing_lists')
    .update({ status: 'ready', packed_at: now, packed_by: team.userId, spot_id: spot!.id, staged_at: now, photo_urls: photoUrls, updated_at: now })
    .eq('id', listId)
    .eq('status', 'picking')
  if (error) return { error: 'ยืนยันจัดของไม่สำเร็จ' }

  await logActivity('CONFIRM_PACKING', { id: listId, event_id: ctx.list.event_id, spot_id: spot!.id, photos: photoUrls.length, lines: lines.length })
  // แจ้งหัวหน้างาน + คนในอีเวนต์ (createNotifications ตัดผู้ทำออก) · แจ้งพังไม่ล้มการยืนยัน
  try {
    await createNotifications({
      userIds: await packingReadyRecipients(db, ctx.list),
      type: 'packing_ready',
      ...packingReadyMessage(ctx.event.name || 'อีเวนต์', spot!.name),
      referenceType: 'packing_list',
      referenceId: listId,
      actorId: team.userId,
    })
  } catch (e) {
    console.error('confirmPacking notify', e)
  }
  refresh(listId)
  return { success: true }
}

/** แก้ไขหลังพร้อมรับ: พร้อมรับ → กำลังหยิบ (ก่อนรับของเท่านั้น) — เคลียร์ packed_at/staged_at ไม่ลบรูป */
export async function reopenPacking(listId: string): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'ready' || !canTransition('ready', 'picking')) return { error: 'แก้ไขได้เฉพาะใบที่พร้อมรับและยังไม่ถูกรับของ' }

  const { error } = await db
    .from('packing_lists')
    .update({ status: 'picking', packed_at: null, packed_by: null, staged_at: null, updated_at: new Date().toISOString() })
    .eq('id', listId)
    .eq('status', 'ready')
  if (error) return { error: 'ถอยกลับเป็นกำลังหยิบไม่สำเร็จ' }
  await logActivity('REOPEN_PACKING', { id: listId, event_id: ctx.list.event_id })
  refresh(listId)
  return { success: true }
}

/**
 * ยกเลิกใบ (เฉพาะ เลือกของ/กำลังหยิบ) — ยกเลิกหยิบทุกบรรทัด (คืนสถานะ) + ลบ event_kits ของกระเป๋าในใบ + ลบใบ
 * ใบที่พร้อมรับขึ้นไปต้องกด "แก้ไข" ถอยก่อน
 */
export async function cancelPackingList(listId: string): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (!canCancelList(ctx.list.status)) return { error: 'ยกเลิกได้เฉพาะใบที่อยู่ในขั้นเลือกของหรือกำลังหยิบ — ใบที่พร้อมรับให้กด "แก้ไข" ก่อน' }

  const lines = await loadPackingLines(db, [listId]).catch(() => null)
  if (!lines) return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  for (const line of lines.filter(l => l.picked_at)) {
    let failed: string | null
    try {
      failed = await revertPick(db, line, ctx.list.event_id, team.userId)
    } catch (e) {
      console.error('cancelPackingList revert', e)
      failed = 'คืนสถานะอุปกรณ์ไม่สำเร็จ'
    }
    if (failed) return { error: `${failed} — ใบยังไม่ถูกยกเลิก ลองใหม่อีกครั้ง` }
    await db.from('packing_list_items').update({ picked_at: null, picked_by: null }).eq('id', line.id)
  }

  const kitIds = [...new Set(lines.flatMap(l => (l.kit_id ? [l.kit_id] : [])))]
  const unbookError = await unbookKits(db, ctx.list.event_id, kitIds)
  if (unbookError) return { error: unbookError }
  // บรรทัดลบตามด้วย ON DELETE CASCADE
  const { error } = await db.from('packing_lists').delete().eq('id', listId)
  if (error) return { error: 'ยกเลิกใบจัดของไม่สำเร็จ' }
  await recomputeKitPointers(db, kitIds)

  await logActivity('CANCEL_PACKING_LIST', { id: listId, event_id: ctx.list.event_id, lead_id: ctx.list.lead_id, lines: lines.length, unbooked_kits: kitIds })
  refresh(listId, kitIds)
  return { success: true }
}

/** ให้หน้าจอรู้ว่าผู้ใช้เป็นทีมจัดของไหม (ซ่อนปุ่ม — server ตรวจซ้ำทุก action) */
export async function getMyPackingRole(): Promise<PackingTeamMember | null> {
  return getPackingTeam()
}
