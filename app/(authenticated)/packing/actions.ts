'use server'

// ใบจัดของ (เฟส 3): เปิดใบ → เลือกของ → กำลังหยิบ → พร้อมรับ (+ ถอยกลับ/ยกเลิก)
// เฟส 4: รับของ (ออกงาน) → คืนของ (คืนแล้ว + ปิดอีเวนต์) → คืนชั้น (คืนชั้นแล้ว)
// สิทธิ์: จัดของ/คืนชั้น = ทีมจัดของ (getPackingTeam) · รับของ/คืนของ = ผู้รับของ (getHandoverUser) · ปิดงาน = getEventManager('close')
// อีเวนต์ปิดแล้ว = error (ยกเว้นคืนชั้น) · คืน { error } ไทย ไม่ throw · logActivity ทุก mutation
// ใบจัดของเป็นเจ้าของการจองกระเป๋าของอีเวนต์นั้น: บรรทัดกระเป๋า = upsert event_kits · ลบบรรทัด/ยกเลิกใบ = ลบแถว event_kits
import { revalidatePath } from 'next/cache'
import { createServiceClient } from '@/lib/supabase-server'
import { logActivity } from '@/lib/logger'
import { createNotifications } from '@/lib/notifications'
import { recomputeKitPointers } from '@/lib/kit-bookings'
import { getEventManager } from '@/lib/event-permissions'
import { moveStock } from '@/lib/stock'
import { isWonStatus } from '../crm/types'
import { isClosedEvent } from '../jobs/tracking/tracking-logic'
import { resolveLeadEvent } from '../jobs/actions'
import { closeEventCore, type CloseLooseItem } from '../events/close-core'
import { checkinKitItem, checkoutKitItems, syncPacked } from '../kits/[id]/check/kit-check-core'
import { planReturnUse } from '../shelves/consumable-logic'
import { loadLeadPackages, loadPickerPackages } from '../packages/lead-packages'
import { loadCategoryUnits } from '../packages/queries'
import type { CategoryUnits, LeadPackageRow } from '../packages/types'
import { advanceOnsiteJobsToLoading } from './board-hook'
import { packingReadyMessage, packingReadyRecipients, packingReturnedMessage, packingTeamRecipients } from './notify'
import {
  RETURN_CONDITIONS,
  canCancelList,
  canConfirmReady,
  canHandOver,
  canPickLine,
  canStartPicking,
  canTransition,
  checkPackingLines,
  isRestockComplete,
  parseReturnInput,
  restockPlan,
  returnLogCondition,
  scaffoldLines,
} from './packing-logic'
import { getHandoverUser, getPackingTeam, type PackingTeamMember } from './permissions'
import { loadKitItemStates, loadPackingLines, loadPackingListRow, loadPickupSpot } from './queries'
import type {
  KitItemState,
  PackingLineInput,
  PackingLineRow,
  PackingListRow,
  ReturnPackingInput,
  ReturnPackingResult,
  ScaffoldRequirement,
  UnitInfo,
} from './types'

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

// --- เปลี่ยนของ (ขั้นกำลังหยิบ) ---------------------------------------------------

/**
 * เปลี่ยนหน่วยของบรรทัดที่ยังไม่หยิบ (ขั้นกำลังหยิบ — ปุ่ม "เปลี่ยนของ" เมื่อหน่วยเดิมหยิบไม่ได้)
 * บรรทัด locked (ตู้ที่ทีมขายเลือก) เปลี่ยนไม่ได้ · ตรวจตัวเลือก/หน่วยซ้ำ/อยู่ในกระเป๋าด้วย checkPackingLines ชุดเดียวกับ setPackingLines
 * กระเป๋าใหม่ = จอง event_kits · กระเป๋าเดิม = ยกเลิกจอง (ใบจัดของเป็นเจ้าของการจองของอีเวนต์นั้น)
 */
export async function replacePackingLine(lineId: string, unit: { itemId?: string | null; kitId?: string | null }): Promise<Result> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const line = await loadLine(db, lineId)
  if (!line) return { error: 'ไม่พบบรรทัดนี้ในใบจัดของ' }
  const ctx = await loadOpenList(db, line.list_id)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'picking') return { error: 'เปลี่ยนของได้เฉพาะขั้นกำลังหยิบ' }
  if (line.locked) return { error: 'ตู้ที่ทีมขายเลือกไว้เปลี่ยนที่นี่ไม่ได้ — แจ้งทีมขายเปลี่ยนในแพ็กเกจของงาน' }
  if (line.picked_at) return { error: 'บรรทัดนี้หยิบไปแล้ว — ยกเลิกหยิบก่อนเปลี่ยนของ' }

  const itemId = String(unit?.itemId ?? '').trim() || null
  const kitId = String(unit?.kitId ?? '').trim() || null
  if ((itemId ?? kitId) && (itemId ?? kitId) === (line.item_id ?? line.kit_id)) return { error: 'เลือกหน่วยอื่นที่ไม่ใช่หน่วยเดิม' }

  let checked: ReturnType<typeof checkPackingLines>
  try {
    const { scaffold } = await loadScaffold(db, ctx.list.lead_id)
    const units = await loadCategoryUnits(db, { categoryIds: [...new Set(scaffold.map(r => r.categoryId))] })
    const info = await loadUnitInfo(db, itemId ? [itemId] : [], kitId ? [kitId] : [])
    const others = (await loadPackingLines(db, [line.list_id])).filter(l => l.id !== lineId)
    checked = checkPackingLines([{ packageId: line.package_id, categoryId: line.category_id, itemId, kitId }], scaffold, units, info, others)
  } catch (e) {
    console.error('replacePackingLine load', e)
    return { error: 'โหลดข้อมูลใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  if ('error' in checked) return checked
  // checkPackingLines ข้ามหน่วยที่มีในใบแล้ว (บรรทัดอื่นส่งเป็นชุดที่ล็อก) → ไม่เหลือบรรทัด = ซ้ำ
  const next = checked[0]
  if (!next) return { error: 'หน่วยนี้อยู่ในใบนี้แล้ว — เลือกหน่วยอื่น' }

  const { error } = await db.from('packing_list_items').update({ item_id: next.itemId, kit_id: next.kitId }).eq('id', lineId).is('picked_at', null)
  if (error) return { error: error.code === '23505' ? 'หน่วยนี้อยู่ในใบนี้แล้ว — เลือกหน่วยอื่น' : 'เปลี่ยนของไม่สำเร็จ' }

  const bookError =
    (next.kitId ? await bookKits(db, ctx.list.event_id, [next.kitId]) : null) ??
    (line.kit_id && line.kit_id !== next.kitId ? await unbookKits(db, ctx.list.event_id, [line.kit_id]) : null)
  if (bookError) return { error: bookError }
  const touchedKits = [next.kitId, line.kit_id].filter((k): k is string => !!k)
  await recomputeKitPointers(db, touchedKits)
  await db.from('packing_lists').update({ updated_at: new Date().toISOString() }).eq('id', line.list_id)

  await logActivity('UPDATE_PACKING_LINES', {
    id: line.list_id,
    event_id: ctx.list.event_id,
    replaced: { line_id: lineId, from: { item_id: line.item_id, kit_id: line.kit_id }, to: { item_id: next.itemId, kit_id: next.kitId } },
  })
  refresh(line.list_id, touchedKits)
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

// --- รับของ / คืนของ / คืนชั้น (เฟส 4) ----------------------------------------------
// รับของ/คืนของ = "ผู้รับของ" (getHandoverUser: แอดมิน | โมดูล events | โมดูล stock) · คืนชั้น = ทีมจัดของ (getPackingTeam)
// สถานะอุปกรณ์ตลอดเส้น: หยิบ → in_use → คืนของ (เสีย/ซ่อม/หาย ตั้งทันที · ใช้ได้ยังเป็น in_use) → คืนชั้น (ใช้ได้)

const NO_HANDOVER = 'เฉพาะแอดมินหรือผู้ที่มีสิทธิ์อีเวนต์/สต็อกเท่านั้นที่รับของหรือคืนของได้'
const NO_CLOSE = 'ไม่มีสิทธิ์ปิดงานอีเวนต์ — ให้ admin เปิดสิทธิ์ในหน้าตั้งค่า'
const RESTOCK_NOTE = 'คืนชั้น (ใบจัดของ)'
const RETURN_NOTE = 'คืนของ (ใบจัดของ)'

/** revalidate ชุดของเส้นรับ/คืน/คืนชั้น (คิว, ใบ, จุดรับของ, บอร์ดวันงาน, หน้าสต็อก) */
function refreshFlow(list: { id: string; spot_id: string | null; event_id: string }, kitIds: (string | null | undefined)[] = []) {
  refresh(list.id, kitIds)
  if (list.spot_id) revalidatePath(`/pickup/${list.spot_id}`)
  revalidatePath('/jobs')
  revalidatePath('/items')
  revalidatePath('/shelves')
  revalidatePath('/stock/dashboard')
  revalidatePath(`/events/${list.event_id}/return`)
}

/**
 * รับของที่จุดรับของ: พร้อมรับ → ออกงาน — ผู้รับของเท่านั้น · อีเวนต์ต้องยังไม่ปิด
 * input.lineIds (เช็กลิสต์ที่ติ๊ก) ถ้าส่งต้องครบทุกบรรทัด · บันทึก handed_over_at/by ทั้งใบและทุกบรรทัด · log HAND_OVER_PACKING
 * hook บอร์ดวันงาน: ใบงานหน้างานที่ยังอยู่ก่อน "ขนของ" → ขนของ (ล้มไม่ล้มการรับของ)
 */
export async function handOverPackingList(listId: string, input: { lineIds?: string[] } = {}): Promise<Result> {
  const user = await getHandoverUser()
  if (!user) return { error: NO_HANDOVER }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx

  const lines = await loadPackingLines(db, [listId]).catch(() => null)
  if (!lines) return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  const ok = canHandOver(ctx.list, lines, Array.isArray(input?.lineIds) ? input.lineIds : null)
  if ('error' in ok) return ok

  const now = new Date().toISOString()
  const { data: moved, error } = await db
    .from('packing_lists')
    .update({ status: 'out', handed_over_at: now, handed_over_by: user.userId, updated_at: now })
    .eq('id', listId)
    .eq('status', 'ready')
    .select('id')
  if (error) return { error: 'รับของไม่สำเร็จ' }
  if (!moved || moved.length === 0) return { error: 'ใบนี้ถูกรับของไปแล้ว หรือทีมจัดของเพิ่งแก้ไข — โหลดหน้าใหม่' }
  const { error: lineError } = await db.from('packing_list_items').update({ handed_over_at: now }).eq('list_id', listId)
  if (lineError) console.error('handOverPackingList lines', lineError)

  await logActivity('HAND_OVER_PACKING', { id: listId, event_id: ctx.list.event_id, spot_id: ctx.list.spot_id, lines: lines.length })
  try {
    await advanceOnsiteJobsToLoading(db, { leadId: ctx.list.lead_id, eventId: ctx.list.event_id, actorId: user.userId })
  } catch (e) {
    console.error('handOverPackingList board hook', e)
  }
  refreshFlow(ctx.list)
  return { success: true }
}

/** อัปโหลดรูปตอนคืนของ (formData: listId, file) → packing-photos `<listId>/return_<ts>_<name>` · ใบต้องออกงานอยู่ */
export async function uploadReturnPhoto(formData: FormData): Promise<{ url: string } | { error: string }> {
  const user = await getHandoverUser()
  if (!user) return { error: NO_HANDOVER }
  const file = formData.get('file') as File | null
  const listId = formData.get('listId') as string | null
  if (!file || typeof file === 'string') return { error: 'ไม่พบไฟล์' }
  if (!listId) return { error: NOT_FOUND }
  if (!file.type?.startsWith('image/')) return { error: 'รองรับเฉพาะไฟล์รูปภาพ' }
  if (file.size > MAX_PHOTO_BYTES) return { error: 'ไฟล์ใหญ่เกิน 5MB' }

  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'out') return { error: 'อัปโหลดรูปตอนคืนได้เฉพาะใบที่ออกงานอยู่' }

  const sanitizedName = (file.name || 'photo.jpg').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${listId}/return_${Date.now()}_${sanitizedName}`
  const { error } = await db.storage.from(BUCKET).upload(path, file, { contentType: file.type })
  if (error) {
    console.error('uploadReturnPhoto', error)
    return { error: 'อัปโหลดรูปไม่สำเร็จ' }
  }
  const { data } = db.storage.from(BUCKET).getPublicUrl(path)
  return { url: data.publicUrl }
}

/**
 * ตัดยอดวัสดุสิ้นเปลืองในกระเป๋าของใบ (planReturnUse + moveStock reason 'use') — คู่ที่อีเวนต์นี้ตัดไปแล้วถูกข้าม
 * (unique index stock_movements (event_id, kit_id, item_id) reason use กันซ้ำอีกชั้น) · ล้ม = { error } ยังไม่คืนของ
 */
async function cutConsumables(
  db: Db,
  ctx: { eventId: string; eventName: string | null; userId: string },
  kitStates: Record<string, KitItemState[]>,
  use: { kitId: string; itemId: string; used: number }[],
): Promise<{ error: string } | { cut: number }> {
  const kitConsumables = Object.entries(kitStates).flatMap(([kitId, items]) =>
    items.filter(i => i.is_consumable).map(i => ({ kitId, itemId: i.id, name: i.name })),
  )
  const { data: usedRows, error } = await db.from('stock_movements').select('kit_id, item_id, delta').eq('event_id', ctx.eventId).eq('reason', 'use')
  if (error) return { error: 'โหลดประวัติตัดยอดไม่สำเร็จ ลองใหม่อีกครั้ง' }
  const alreadyCut = ((usedRows ?? []) as { kit_id: string | null; item_id: string; delta: number }[])
    .filter(r => r.kit_id)
    .map(r => ({ kitId: r.kit_id as string, itemId: r.item_id, used: -r.delta }))
  const plan = planReturnUse(kitConsumables, use, alreadyCut)
  if ('error' in plan) return { error: plan.error }

  for (const cut of plan.cuts) {
    const name = kitConsumables.find(c => c.kitId === cut.kitId && c.itemId === cut.itemId)?.name || 'วัสดุสิ้นเปลือง'
    const res = await moveStock(db, {
      itemId: cut.itemId,
      delta: -cut.used,
      reason: 'use',
      eventId: ctx.eventId,
      kitId: cut.kitId,
      userId: ctx.userId,
      note: `คืนของ ${ctx.eventName || ''}`.trim(),
    })
    if ('error' in res) return { error: `ตัดยอด ${name} ไม่สำเร็จ: ${res.error} — ยังไม่ได้คืนของ` }
    await logActivity('DRAW_STOCK', { itemId: cut.itemId, name, delta: -cut.used, balance: res.balance, eventId: ctx.eventId, kitId: cut.kitId })
  }
  return { cut: plan.cuts.length }
}

/**
 * ปิดอีเวนต์ของใบที่คืนของแล้ว ผ่าน closeEventCore โหมดไม่แตะ items.status — ผู้เรียกตรวจสิทธิ์ปิดงานเอง
 * วัสดุสิ้นเปลืองตัดไปแล้วตอนคืน (consumableUse [] — snapshot อ่านจาก stock_movements) · รูปตอนคืน = รูปปิดงาน
 * snapshot: กระเป๋า (ชิ้นที่ยังออกงานให้งานนี้ = ใช้ได้ ที่เหลือตามสถานะจริง) + อุปกรณ์เดี่ยว (สภาพตอนคืน)
 */
async function closeListEvent(db: Db, list: PackingListRow, userId: string): Promise<{ error: string } | { success: true }> {
  let lines: PackingLineRow[]
  let states: Record<string, KitItemState[]>
  let loose: { id: string; name: string; serial_number: string | null }[]
  try {
    lines = await loadPackingLines(db, [list.id])
    const itemIds = lines.flatMap(l => (l.item_id ? [l.item_id] : []))
    states = await loadKitItemStates(db, lines.flatMap(l => (l.kit_id ? [l.kit_id] : [])), list.event_id)
    const { data, error } = itemIds.length
      ? await db.from('items').select('id, name, serial_number').in('id', itemIds)
      : { data: [], error: null }
    if (error) throw new Error(error.message)
    loose = (data ?? []) as { id: string; name: string; serial_number: string | null }[]
  } catch (e) {
    console.error('closeListEvent load', e)
    return { error: 'โหลดใบจัดของไม่สำเร็จ — ยังไม่ได้ปิดงาน ลองใหม่อีกครั้ง' }
  }
  const looseItems: CloseLooseItem[] = lines.flatMap(l => {
    if (!l.item_id) return []
    const item = loose.find(i => i.id === l.item_id)
    return [{ itemId: l.item_id, itemName: item?.name ?? 'ชิ้นที่ถูกลบ', serialNumber: item?.serial_number ?? null, status: l.return_condition ?? 'available' }]
  })
  const itemStatuses = Object.values(states).flatMap(items =>
    items
      .filter(i => !i.is_consumable && !i.outElsewhere)
      .map(i => ({ itemId: i.id, status: i.status === 'in_use' ? 'available' : i.status }))
      .filter(s => (RETURN_CONDITIONS as readonly string[]).includes(s.status)),
  )
  return closeEventCore(db, {
    eventId: list.event_id,
    userId,
    itemStatuses,
    imageUrls: list.return_photo_urls,
    consumableUse: [],
    keepItemStatuses: true,
    looseItems,
  })
}

/**
 * คืนของที่จุดรับของ: ออกงาน → คืนแล้ว — ผู้รับของเท่านั้น · อีเวนต์ต้องยังไม่ปิด
 * ตรวจ parseReturnInput (ทุกบรรทัดมีสภาพ) → (1) ตัดยอดวัสดุสิ้นเปลือง (2) ของเสีย/ซ่อม/หาย ตั้ง items.status ทันที (ใช้ได้รอคืนชั้น)
 * → (3) บรรทัด returned_at/return_condition/return_note + ใบ returned → (4) log RETURN_PACKING → (5) แจ้งทีมจัดของ
 * → (6) ผู้คืนมีสิทธิ์ปิดงาน = ปิดอีเวนต์ทันที (eventClosed true) ไม่มี = รอผู้มีสิทธิ์ปิดจากหน้าปิดงาน (closeEventFromPacking)
 * ponytail: ไม่อยู่ใน transaction — ล้มก่อนขั้น (3) กดคืนซ้ำได้ (ตัดยอดไม่ซ้ำ · ตั้งสถานะซ้ำได้ผลเดิม)
 */
export async function returnPackingList(listId: string, input: ReturnPackingInput): Promise<ReturnPackingResult> {
  const user = await getHandoverUser()
  if (!user) return { error: NO_HANDOVER }
  const db = createServiceClient()
  const ctx = await loadOpenList(db, listId)
  if ('error' in ctx) return ctx
  if (ctx.list.status !== 'out') return { error: ctx.list.status === 'returned' || ctx.list.status === 'done' ? 'ใบนี้คืนของไปแล้ว' : 'คืนของได้เฉพาะใบที่ออกงานอยู่ (รับของแล้ว)' }
  const eventId = ctx.list.event_id

  let lines: PackingLineRow[]
  let states: Record<string, KitItemState[]>
  let info: Record<string, UnitInfo>
  try {
    lines = await loadPackingLines(db, [listId])
    const kitIds = lines.flatMap(l => (l.kit_id ? [l.kit_id] : []))
    ;[states, info] = await Promise.all([
      loadKitItemStates(db, kitIds, eventId),
      loadUnitInfo(db, lines.flatMap(l => (l.item_id ? [l.item_id] : [])), kitIds),
    ])
  } catch (e) {
    console.error('returnPackingList load', e)
    return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  const nameOf = (l: PackingLineRow) => info[(l.item_id ?? l.kit_id) as string]?.name ?? 'ชิ้นที่ถูกลบ'
  const parsed = parseReturnInput(input, lines.map(l => ({ ...l, unitName: nameOf(l) })), states)
  if ('error' in parsed) return parsed

  // (1) วัสดุสิ้นเปลืองในกระเป๋า — ตัดยอดก่อน ล้ม = ยังไม่คืนของ
  const cut = await cutConsumables(db, { eventId, eventName: ctx.event.name, userId: user.userId }, states, parsed.consumableUse)
  if ('error' in cut) return cut

  // (2) ของที่สภาพไม่ใช่ "ใช้ได้" ตั้งสถานะทันที — ponytail: ของยังวางที่จุดรับของจนคืนชั้น ตรวจนับชั้นอาจคาดว่าเจอบนชั้น
  const conditionOf = new Map(parsed.lines.map(l => [l.lineId, l]))
  let problems = 0
  for (const l of lines) {
    const c = conditionOf.get(l.id)!
    if (!l.item_id || c.condition === 'available') continue
    problems++
    const { error } = await db.from('items').update({ status: c.condition }).eq('id', l.item_id)
    if (error) return { error: `ตั้งสภาพ "${nameOf(l)}" ไม่สำเร็จ — ยังไม่ได้คืนของ ลองใหม่อีกครั้ง` }
    const { error: logError } = await db.from('event_logs').insert({
      event_id: eventId,
      item_id: l.item_id,
      kit_id: null,
      user_id: user.userId,
      action: 'checkin',
      condition: returnLogCondition(c.condition),
      note: c.note ?? RETURN_NOTE,
    })
    if (logError) console.error('returnPackingList event_logs', logError)
  }
  for (const k of parsed.kitItems) {
    problems++
    const res = await checkinKitItem(db, { eventId, kitId: k.kitId, itemId: k.itemId, status: k.condition, note: RETURN_NOTE, userId: user.userId })
    if ('error' in res) return { error: `${res.error} — ยังไม่ได้คืนของ ลองใหม่อีกครั้ง` }
  }

  // (3) บรรทัด + ใบ
  const now = new Date().toISOString()
  for (const l of parsed.lines) {
    const { error } = await db.from('packing_list_items').update({ returned_at: now, return_condition: l.condition, return_note: l.note }).eq('id', l.lineId)
    if (error) return { error: 'บันทึกสภาพตอนคืนไม่สำเร็จ — ลองกดคืนของอีกครั้ง' }
  }
  const photoUrls = [...new Set((Array.isArray(input?.photoUrls) ? input.photoUrls : []).filter((u): u is string => typeof u === 'string' && u.includes(`/${BUCKET}/${listId}/`)))]
  const { data: moved, error } = await db
    .from('packing_lists')
    .update({ status: 'returned', returned_at: now, returned_by: user.userId, return_note: parsed.note, return_photo_urls: photoUrls, updated_at: now })
    .eq('id', listId)
    .eq('status', 'out')
    .select('id')
  if (error) return { error: 'คืนของไม่สำเร็จ' }
  if (!moved || moved.length === 0) return { error: 'ใบนี้คืนของไปแล้ว — โหลดหน้าใหม่' }

  // (4) log
  await logActivity('RETURN_PACKING', {
    id: listId,
    event_id: eventId,
    lines: parsed.lines.map(l => ({ line_id: l.lineId, condition: l.condition })),
    kit_items: parsed.kitItems,
    consumables_cut: cut.cut,
    photos: photoUrls.length,
  })

  // (5) แจ้งทีมจัดของ (createNotifications ตัดผู้ทำออก) · พังไม่ล้มการคืน
  try {
    const spot = ctx.list.spot_id ? await loadPickupSpot(db, ctx.list.spot_id).catch(() => null) : null
    await createNotifications({
      userIds: await packingTeamRecipients(db),
      type: 'packing_returned',
      ...packingReturnedMessage(ctx.event.name || 'อีเวนต์', spot?.name ?? null, problems),
      referenceType: 'packing_list',
      referenceId: listId,
      actorId: user.userId,
    })
  } catch (e) {
    console.error('returnPackingList notify', e)
  }

  // (6) ผู้คืนมีสิทธิ์ปิดงาน → ปิดอีเวนต์ในขั้นเดียว
  let eventClosed = false
  let closeError: string | undefined
  const closer = await getEventManager('close')
  if (closer) {
    const res = await closeListEvent(db, { ...ctx.list, status: 'returned', return_photo_urls: photoUrls }, closer.userId)
    if ('error' in res) closeError = res.error
    else eventClosed = true
  }
  refreshFlow(ctx.list, lines.map(l => l.kit_id))
  return closeError ? { success: true, eventClosed, closeError } : { success: true, eventClosed }
}

/**
 * ปิดอีเวนต์จากใบที่คืนของแล้ว (ผู้คืนไม่มีสิทธิ์ปิดงาน) — ผู้มีสิทธิ์ปิดงานเท่านั้น · ใบต้องคืนแล้ว (หรือคืนชั้นครบแล้ว) และอีเวนต์ยังไม่ปิด
 * ไม่ต้องติ๊กซ้ำ: ใช้สภาพตอนคืน + รูปตอนคืน · log CLOSE_EVENT (จาก core) + CLOSE_EVENT_FROM_PACKING
 */
export async function closeEventFromPacking(listId: string): Promise<Result> {
  const closer = await getEventManager('close')
  if (!closer) return { error: NO_CLOSE }
  const db = createServiceClient()
  let list: PackingListRow | null
  try {
    list = await loadPackingListRow(db, listId)
  } catch (e) {
    console.error('closeEventFromPacking load', e)
    return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  if (!list) return { error: NOT_FOUND }
  if (list.status !== 'returned' && list.status !== 'done') return { error: 'ใบจัดของยังไม่คืนของ — ให้ทีมหน้างานคืนของที่จุดรับของก่อน' }
  const { data: event } = await db.from('events').select('id, status').eq('id', list.event_id).maybeSingle<{ id: string; status: string | null }>()
  if (!event) return { error: 'ไม่พบอีเวนต์ของใบจัดของนี้' }
  if (isClosedEvent(event.status)) return { error: 'อีเวนต์นี้ปิดงานไปแล้ว' }

  const res = await closeListEvent(db, list, closer.userId)
  if ('error' in res) return res
  await logActivity('CLOSE_EVENT_FROM_PACKING', { id: listId, event_id: list.event_id })
  refreshFlow(list)
  return { success: true }
}

/** คืนชั้นบรรทัดหนึ่ง (ผู้เรียกตรวจสิทธิ์ + สถานะใบแล้ว) — อุปกรณ์เดี่ยว: สถานะ = สภาพตอนคืน · กระเป๋า: ชิ้นที่ยังออกงานให้งานนี้ → ใช้ได้ */
async function restockOne(db: Db, list: PackingListRow, line: PackingLineRow, userId: string): Promise<string | null> {
  let states: KitItemState[] = []
  if (line.kit_id) {
    try {
      states = (await loadKitItemStates(db, [line.kit_id], list.event_id))[line.kit_id] ?? []
    } catch (e) {
      console.error('restockOne kit items', e)
      return 'โหลดของในกระเป๋าไม่สำเร็จ ลองใหม่อีกครั้ง'
    }
  }
  const plan = restockPlan(line, states)
  if ('error' in plan) return plan.error

  if (plan.kind === 'item') {
    const { data: item } = await db.from('items').select('id, status').eq('id', plan.itemId).maybeSingle<{ id: string; status: string }>()
    // ยังออกงานอยู่ = ขึ้นชั้นตามสภาพตอนคืน · สถานะอื่น (ตั้งเสีย/ซ่อม/หายไปแล้วตอนคืน หรือมีคนแก้มือ) = ไม่แตะ
    if (item?.status === 'in_use') {
      const { error } = await db.from('items').update({ status: plan.itemStatus }).eq('id', plan.itemId).eq('status', 'in_use')
      if (error) return 'คืนชั้นไม่สำเร็จ'
      const { error: logError } = await db.from('event_logs').insert({
        event_id: list.event_id,
        item_id: plan.itemId,
        kit_id: null,
        user_id: userId,
        action: 'checkin',
        condition: returnLogCondition(plan.itemStatus),
        note: RESTOCK_NOTE,
      })
      if (logError) console.error('restockOne event_logs', logError)
    }
  } else {
    // อีเวนต์ปิดไปแล้วตอนคืนของได้ — allowClosedEvent (การจอง event_kits ยังต้องมี)
    for (const itemId of plan.kitItemIds) {
      const res = await checkinKitItem(db, { eventId: list.event_id, kitId: plan.kitId, itemId, status: 'available', note: RESTOCK_NOTE, userId, allowClosedEvent: true })
      if ('error' in res) return res.error
    }
    await syncPacked(db, list.event_id, plan.kitId, userId)
  }

  const { data: marked, error } = await db
    .from('packing_list_items')
    .update({ restocked_at: new Date().toISOString(), restocked_by: userId })
    .eq('id', line.id)
    .is('restocked_at', null)
    .select('id')
  if (error) return 'บันทึกคืนชั้นไม่สำเร็จ — กดอีกครั้ง'
  if (!marked || marked.length === 0) return 'บรรทัดนี้คืนชั้นแล้ว'
  await logActivity('RESTOCK_PACKING_LINE', { id: list.id, line_id: line.id, item_id: line.item_id, kit_id: line.kit_id, event_id: list.event_id })
  return null
}

/** ทุกบรรทัดคืนชั้นแล้ว → ใบ คืนชั้นแล้ว (done) + restocked_at/by + recomputeKitPointers + log RESTOCK_PACKING · คืน true ถ้าปิดใบ */
async function finishRestockIfComplete(db: Db, list: PackingListRow, userId: string): Promise<boolean> {
  const lines = await loadPackingLines(db, [list.id])
  if (!isRestockComplete(lines)) return false
  const now = new Date().toISOString()
  const { data: moved } = await db
    .from('packing_lists')
    .update({ status: 'done', restocked_at: now, restocked_by: userId, updated_at: now })
    .eq('id', list.id)
    .eq('status', 'returned')
    .select('id')
  if (!moved || moved.length === 0) return false
  const kitIds = [...new Set(lines.flatMap(l => (l.kit_id ? [l.kit_id] : [])))]
  await recomputeKitPointers(db, kitIds)
  await logActivity('RESTOCK_PACKING', { id: list.id, event_id: list.event_id, lines: lines.length })
  return true
}

/** ใบที่คืนของแล้ว สำหรับคืนชั้น (ทีมจัดของ) — ไม่ต้องการอีเวนต์เปิด (ปิดไปตอนคืนของได้) */
async function loadReturnedList(db: Db, listId: string): Promise<PackingListRow | { error: string }> {
  let list: PackingListRow | null
  try {
    list = await loadPackingListRow(db, listId)
  } catch (e) {
    console.error('loadReturnedList', e)
    return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }
  }
  if (!list) return { error: NOT_FOUND }
  if (list.status === 'done') return { error: 'ใบนี้คืนชั้นครบแล้ว' }
  if (list.status !== 'returned') return { error: 'คืนชั้นได้เฉพาะใบที่คืนของแล้ว' }
  return list
}

/** คืนชั้นทีละบรรทัด — ทีมจัดของ · ใบต้องคืนแล้ว · คืนชั้นซ้ำ = error · ครบทุกบรรทัด = ใบคืนชั้นแล้ว (listDone) */
export async function restockLine(lineId: string): Promise<{ error: string } | { success: true; listDone: boolean }> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const line = await loadLine(db, lineId)
  if (!line) return { error: 'ไม่พบบรรทัดนี้ในใบจัดของ' }
  const list = await loadReturnedList(db, line.list_id)
  if ('error' in list) return list

  const failed = await restockOne(db, list, line, team.userId)
  if (failed) return { error: failed }
  const listDone = await finishRestockIfComplete(db, list, team.userId).catch(e => {
    console.error('restockLine finish', e)
    return false
  })
  refreshFlow(list, [line.kit_id])
  return { success: true, listDone }
}

/** คืนชั้นทุกบรรทัดที่เหลือของใบ — ทีมจัดของ · พังกลางทาง = error บอกจำนวนที่ทำไปแล้ว (กดซ้ำทำต่อได้) */
export async function restockAll(listId: string): Promise<{ error: string } | { success: true; listDone: boolean }> {
  const team = await getPackingTeam()
  if (!team) return { error: NO_ACCESS }
  const db = createServiceClient()
  const list = await loadReturnedList(db, listId)
  if ('error' in list) return list
  const lines = await loadPackingLines(db, [listId]).catch(() => null)
  if (!lines) return { error: 'โหลดใบจัดของไม่สำเร็จ ลองใหม่อีกครั้ง' }

  let done = 0
  for (const line of lines.filter(l => !l.restocked_at)) {
    const failed = await restockOne(db, list, line, team.userId)
    if (failed) {
      refreshFlow(list, lines.map(l => l.kit_id))
      return { error: `${failed} — คืนชั้นไปแล้ว ${done} บรรทัด กดอีกครั้งเพื่อทำต่อ` }
    }
    done++
  }
  const listDone = await finishRestockIfComplete(db, list, team.userId).catch(e => {
    console.error('restockAll finish', e)
    return false
  })
  refreshFlow(list, lines.map(l => l.kit_id))
  return { success: true, listDone }
}

/** ให้หน้าจอรู้ว่าผู้ใช้เป็นทีมจัดของไหม (ซ่อนปุ่ม — server ตรวจซ้ำทุก action) */
export async function getMyPackingRole(): Promise<PackingTeamMember | null> {
  return getPackingTeam()
}
