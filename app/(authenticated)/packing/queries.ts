// โหลดข้อมูลใบจัดของ — server-only (รับ service client จากผู้เรียก) · ไม่ใช้ .or() — อ่านแยกชุดแล้วรวมด้วย id
// อ่านที่อาจเกิน 1,000 แถวใช้ readAllRows (เรียง created_at,id · ตารางไม่มี created_at เรียง id)
import type { createServiceClient } from '@/lib/supabase-server'
import type { CategoryUnit } from '../packages/types'
import { readAllRows } from '@/lib/read-all-rows'
import { isClosedEvent } from '../jobs/tracking/tracking-logic'
import { isWonStatus } from '../crm/types'
import { loadLeadPackages, loadPickerPackages } from '../packages/lead-packages'
import { loadCategoryUnits } from '../packages/queries'
import { canPickLine, isOpenPackingStatus, scaffoldLines } from './packing-logic'
import {
  PACKING_LINE_COLUMNS,
  PACKING_LIST_COLUMNS,
  PICKUP_SPOT_COLUMNS,
  type KitItemState,
  type LineBooking,
  type PackingLineRow,
  type PackingLineView,
  type PackingListDetail,
  type PackingListRow,
  type PackingListSummary,
  type PackingQueue,
  type PackingQueueCard,
  type PickupSpot,
  type ShelfPlace,
} from './types'

type Db = ReturnType<typeof createServiceClient>

const fail = (what: string, error: { message: string } | null | undefined) => {
  if (error) throw new Error(`${what}: ${error.message}`)
}

const dayOf = (d: string | null | undefined) => (d ? d.slice(0, 10) : null)
const timeOf = (t: unknown) => (t ? String(t).slice(0, 5) : null)
const nextDay = (day: string) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** photo_urls jsonb → string[] ที่เชื่อถือได้ */
const urlList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
const normalizeList = (r: PackingListRow): PackingListRow => ({ ...r, photo_urls: urlList(r.photo_urls), return_photo_urls: urlList(r.return_photo_urls) })

/** ใบจัดของหนึ่งใบ (ดิบ) · ไม่พบ = null */
export async function loadPackingListRow(db: Db, id: string): Promise<PackingListRow | null> {
  const { data, error } = await db.from('packing_lists').select(PACKING_LIST_COLUMNS).eq('id', id).maybeSingle<PackingListRow>()
  fail('โหลดใบจัดของไม่สำเร็จ', error)
  return data ? normalizeList(data) : null
}

/** บรรทัดของใบ (ดิบ) เรียง created_at,id */
export async function loadPackingLines(db: Db, listIds: string[]): Promise<PackingLineRow[]> {
  if (listIds.length === 0) return []
  const res = await readAllRows<PackingLineRow>((from, to) =>
    db.from('packing_list_items').select(PACKING_LINE_COLUMNS).in('list_id', listIds).order('created_at').order('id').range(from, to),
  )
  fail('โหลดรายการในใบจัดของไม่สำเร็จ', res.error)
  return res.rows
}

/** สรุปใบจัดของของงานเหล่านี้ (snapshot หน้าติดตามงาน) — จำนวนบรรทัด/หยิบแล้วต่อใบ · พัง = throw */
export async function loadPackingListsForLeads(db: Db, leadIds: string[]): Promise<PackingListSummary[]> {
  if (leadIds.length === 0) return []
  const lists = await readAllRows<Pick<PackingListRow, 'id' | 'event_id' | 'lead_id' | 'status' | 'spot_id'>>((from, to) =>
    db.from('packing_lists').select('id, event_id, lead_id, status, spot_id').in('lead_id', leadIds).order('created_at').order('id').range(from, to),
  )
  fail('โหลดใบจัดของไม่สำเร็จ', lists.error)
  return summarize(db, lists.rows)
}

async function summarize(db: Db, lists: Pick<PackingListRow, 'id' | 'event_id' | 'lead_id' | 'status' | 'spot_id'>[]): Promise<PackingListSummary[]> {
  if (lists.length === 0) return []
  const lines = await readAllRows<{ list_id: string; picked_at: string | null }>((from, to) =>
    db.from('packing_list_items').select('list_id, picked_at').in('list_id', lists.map(l => l.id)).order('created_at').order('id').range(from, to),
  )
  fail('โหลดรายการในใบจัดของไม่สำเร็จ', lines.error)
  return lists.map(l => {
    const mine = lines.rows.filter(x => x.list_id === l.id)
    return {
      id: l.id,
      eventId: l.event_id,
      leadId: l.lead_id,
      status: l.status,
      lineCount: mine.length,
      pickedCount: mine.filter(x => x.picked_at).length,
      spotId: l.spot_id,
    }
  })
}

/** จุดรับของ เรียง sort_order แล้วชื่อ · ค่าเริ่มต้น = เฉพาะที่เปิดใช้ (ตารางเล็ก ไม่วน readAllRows) */
export async function loadPickupSpots(db: Db, opts: { includeInactive?: boolean } = {}): Promise<PickupSpot[]> {
  let q = db.from('pickup_spots').select(PICKUP_SPOT_COLUMNS)
  if (!opts.includeInactive) q = q.eq('is_active', true)
  const { data, error } = await q.order('sort_order').order('name').overrideTypes<PickupSpot[], { merge: false }>()
  fail('โหลดจุดรับของไม่สำเร็จ', error)
  return data ?? []
}

/** จุดรับของหนึ่งจุด · ไม่พบ = null */
export async function loadPickupSpot(db: Db, id: string): Promise<PickupSpot | null> {
  const { data, error } = await db.from('pickup_spots').select(PICKUP_SPOT_COLUMNS).eq('id', id).maybeSingle<PickupSpot>()
  fail('โหลดจุดรับของไม่สำเร็จ', error)
  return data ?? null
}

/** ใบจัดของที่วางไว้ที่จุดนี้ (หน้า /pickup/[id]) — สถานะที่ขอ (ค่าเริ่มต้น ready, out) */
export async function loadListsAtSpot(db: Db, spotId: string, statuses: string[] = ['ready', 'out']): Promise<PackingQueueCard[]> {
  const res = await readAllRows<Pick<PackingListRow, 'id' | 'event_id' | 'lead_id' | 'status' | 'spot_id'>>((from, to) =>
    db.from('packing_lists').select('id, event_id, lead_id, status, spot_id').eq('spot_id', spotId).in('status', statuses).order('created_at').order('id').range(from, to),
  )
  fail('โหลดใบจัดของที่จุดรับของไม่สำเร็จ', res.error)
  return queueCards(db, await summarize(db, res.rows), [])
}

/** ตำแหน่งบนชั้น (ห้อง › ตู้ › ระดับ) ของชั้นเหล่านี้ — shelfId → ตำแหน่ง */
export async function loadShelfPlaces(db: Db, shelfIds: string[]): Promise<Record<string, ShelfPlace>> {
  const ids = [...new Set(shelfIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const { data: shelves, error } = await db.from('shelves').select('id, code, rack_id, level').in('id', ids)
  fail('โหลดชั้นเก็บของไม่สำเร็จ', error)
  const rows = (shelves ?? []) as { id: string; code: string; rack_id: string | null; level: number | null }[]
  const rackIds = [...new Set(rows.map(s => s.rack_id).filter((x): x is string => !!x))]
  const { data: racks, error: rackError } = rackIds.length
    ? await db.from('shelf_racks').select('id, code, room_id').in('id', rackIds)
    : { data: [], error: null }
  fail('โหลดตู้ชั้นวางไม่สำเร็จ', rackError)
  const rackRows = (racks ?? []) as { id: string; code: string; room_id: string }[]
  const roomIds = [...new Set(rackRows.map(r => r.room_id))]
  const { data: rooms, error: roomError } = roomIds.length
    ? await db.from('shelf_rooms').select('id, name').in('id', roomIds)
    : { data: [], error: null }
  fail('โหลดห้องเก็บของไม่สำเร็จ', roomError)
  const rackById = new Map(rackRows.map(r => [r.id, r]))
  const roomName = new Map(((rooms ?? []) as { id: string; name: string }[]).map(r => [r.id, r.name]))
  const out: Record<string, ShelfPlace> = {}
  for (const s of rows) {
    const rack = s.rack_id ? rackById.get(s.rack_id) : undefined
    out[s.id] = { shelfId: s.id, shelfCode: s.code, rackCode: rack?.code ?? null, roomName: rack ? roomName.get(rack.room_id) ?? null : null, level: s.level ?? null }
  }
  return out
}

type ItemRow = { id: string; name: string; serial_number: string | null; status: string; shelf_id: string | null; category_id: string | null }
type KitRow = { id: string; name: string; shelf_id: string | null; category_id: string | null }
type ContentRow = { kit_id: string; items: { id: string; name: string; status: string; is_consumable: boolean | null } | null }

/**
 * ชิ้นในกระเป๋าเหล่านี้ พร้อมธง outElsewhere (in_use และการนำออกล่าสุดไม่ใช่ของอีเวนต์ eventId)
 * kitId → ชิ้น · ใช้ทั้งหน้าใบ (ป้ายหยิบไม่ได้) และ pickLine (ตรวจซ้ำฝั่ง server)
 */
export async function loadKitItemStates(db: Db, kitIds: string[], eventId: string): Promise<Record<string, KitItemState[]>> {
  const ids = [...new Set(kitIds)]
  if (ids.length === 0) return {}
  const contents = await readAllRows<ContentRow>((from, to) =>
    db.from('kit_contents').select('kit_id, items(id, name, status, is_consumable)').in('kit_id', ids).order('id').range(from, to),
  )
  fail('โหลดของในกระเป๋าไม่สำเร็จ', contents.error)
  const inUse = [...new Set(contents.rows.flatMap(c => (c.items?.status === 'in_use' ? [c.items.id] : [])))]
  const lastCheckout = new Map<string, string | null>()
  if (inUse.length) {
    const logs = await readAllRows<{ item_id: string; event_id: string | null; created_at: string }>((from, to) =>
      db
        .from('event_logs')
        .select('item_id, event_id, created_at')
        .in('item_id', inUse)
        .eq('action', 'checkout')
        .order('created_at', { ascending: false })
        .order('id')
        .range(from, to),
    )
    fail('โหลดประวัตินำออกไม่สำเร็จ', logs.error)
    for (const l of logs.rows) if (!lastCheckout.has(l.item_id)) lastCheckout.set(l.item_id, l.event_id)
  }
  const out: Record<string, KitItemState[]> = {}
  for (const c of contents.rows) {
    if (!c.items) continue
    const i = c.items
    ;(out[c.kit_id] ??= []).push({
      id: i.id,
      name: i.name,
      status: i.status,
      is_consumable: i.is_consumable,
      outElsewhere: i.status === 'in_use' && lastCheckout.get(i.id) !== eventId,
    })
  }
  return out
}

/**
 * การจองหน่วยของอีเวนต์อื่นในวันเดียวกับ eventDate (ยังไม่ปิด) — บรรทัดใบจัดของที่ยังไม่คืนชั้น + event_kits
 * ใช้กับ lineAvailability · ไม่มีวันงาน = []
 */
export async function loadLineBookings(db: Db, eventDate: string | null, excludeEventId: string): Promise<LineBooking[]> {
  const day = dayOf(eventDate)
  if (!day) return []
  const { data: evs, error } = await db.from('events').select('*').gte('event_date', day).lt('event_date', nextDay(day))
  fail('โหลดอีเวนต์วันเดียวกันไม่สำเร็จ', error)
  type Ev = { id: string; name: string | null; event_date: string | null; event_time?: string | null; event_end_time?: string | null; status: string | null }
  const events = ((evs ?? []) as Ev[]).filter(e => e.id !== excludeEventId && !isClosedEvent(e.status))
  if (events.length === 0) return []
  const evById = new Map(events.map(e => [e.id, e]))
  const eventIds = events.map(e => e.id)

  const [lists, kitsRes] = await Promise.all([
    db.from('packing_lists').select('id, event_id, status').in('event_id', eventIds),
    db.from('event_kits').select('event_id, kit_id').in('event_id', eventIds),
  ])
  fail('โหลดใบจัดของวันเดียวกันไม่สำเร็จ', lists.error ?? kitsRes.error)
  const openLists = ((lists.data ?? []) as { id: string; event_id: string; status: string }[]).filter(l => isOpenPackingStatus(l.status))
  const lines = await loadPackingLines(db, openLists.map(l => l.id))
  const eventOfList = new Map(openLists.map(l => [l.id, l.event_id]))

  const out: LineBooking[] = []
  const push = (unitId: string | null, eventId: string | undefined) => {
    const e = eventId ? evById.get(eventId) : undefined
    if (!unitId || !e || out.some(b => b.unitId === unitId && b.eventId === e.id)) return
    out.push({ unitId, eventId: e.id, eventName: e.name || 'ไม่ระบุชื่ออีเวนต์', eventDate: dayOf(e.event_date), eventTime: timeOf(e.event_time), eventEndTime: timeOf(e.event_end_time) })
  }
  for (const l of lines) push(l.item_id ?? l.kit_id, eventOfList.get(l.list_id))
  for (const k of (kitsRes.data ?? []) as { event_id: string; kit_id: string }[]) push(k.kit_id, k.event_id)
  return out
}

/**
 * หน้าใบจัดของ /packing/[id] ทั้งชุด: ใบ + อีเวนต์ + งาน + แพ็กเกจ/โครงใบ + บรรทัดพร้อมชื่อ/ชั้น/ป้ายหยิบไม่ได้ + จุดรับของ + การจองวันเดียวกัน
 * ไม่พบใบ = null · โหลดพัง = throw
 */
export async function loadPackingListDetail(db: Db, id: string): Promise<PackingListDetail | null> {
  const list = await loadPackingListRow(db, id)
  if (!list) return null

  const [{ data: ev, error: evError }, leadRes, lines] = await Promise.all([
    db.from('events').select('*').eq('id', list.event_id).maybeSingle(),
    list.lead_id
      ? db.from('crm_leads').select('id, customer_name, event_location').eq('id', list.lead_id).maybeSingle<{ id: string; customer_name: string | null; event_location: string | null }>()
      : Promise.resolve({ data: null, error: null }),
    loadPackingLines(db, [id]),
  ])
  fail('โหลดอีเวนต์ไม่สำเร็จ', evError ?? leadRes.error)
  const e = (ev ?? {}) as { id?: string; name?: string | null; event_date?: string | null; event_time?: string | null; event_end_time?: string | null; location?: string | null; status?: string | null }

  const leadPackages = list.lead_id ? (await loadLeadPackages(db, [list.lead_id]))[list.lead_id] ?? [] : []
  const pickerPackages = await loadPickerPackages(db, { onlyIds: [...new Set(leadPackages.map(p => p.packageId))] })
  const scaffold = scaffoldLines(leadPackages, pickerPackages)

  const itemIds = lines.flatMap(l => (l.item_id ? [l.item_id] : []))
  const kitIds = lines.flatMap(l => (l.kit_id ? [l.kit_id] : []))
  const categoryIds = [...new Set([...scaffold.map(r => r.categoryId), ...lines.flatMap(l => (l.category_id ? [l.category_id] : []))])]
  const [itemsRes, kitsRes, catsRes, kitStates, unitsByCategory, bookings, spot] = await Promise.all([
    itemIds.length ? db.from('items').select('id, name, serial_number, status, shelf_id, category_id').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    kitIds.length ? db.from('kits').select('id, name, shelf_id, category_id').in('id', kitIds) : Promise.resolve({ data: [], error: null }),
    categoryIds.length ? db.from('equipment_categories').select('id, name').in('id', categoryIds) : Promise.resolve({ data: [], error: null }),
    loadKitItemStates(db, kitIds, list.event_id),
    loadCategoryUnits(db, { categoryIds: scaffold.map(r => r.categoryId) }),
    loadLineBookings(db, e.event_date ?? null, list.event_id),
    list.spot_id ? loadPickupSpot(db, list.spot_id) : Promise.resolve(null),
  ])
  fail('โหลดอุปกรณ์ในใบไม่สำเร็จ', itemsRes.error ?? kitsRes.error ?? catsRes.error)
  const items = new Map(((itemsRes.data ?? []) as ItemRow[]).map(i => [i.id, i]))
  const kits = new Map(((kitsRes.data ?? []) as KitRow[]).map(k => [k.id, k]))
  const catName = new Map(((catsRes.data ?? []) as { id: string; name: string }[]).map(c => [c.id, c.name]))
  const pkgName = new Map(leadPackages.map(p => [p.packageId, p.packageName]))
  const places = await loadShelfPlaces(db, [...[...items.values()].map(i => i.shelf_id), ...[...kits.values()].map(k => k.shelf_id)].filter((x): x is string => !!x))

  const views: PackingLineView[] = lines.map(l => {
    const item = l.item_id ? items.get(l.item_id) : undefined
    const kit = l.kit_id ? kits.get(l.kit_id) : undefined
    const kitItems = l.kit_id ? kitStates[l.kit_id] ?? [] : undefined
    const unitStatus = item ? item.status : kitItems?.some(i => i.status === 'in_use' && i.outElsewhere) ? 'in_use' : 'available'
    const shelfId = item?.shelf_id ?? kit?.shelf_id ?? null
    const pick = l.picked_at ? null : canPickLine(l, { itemStatus: item?.status ?? null, kitItems })
    return {
      ...l,
      kind: l.kit_id ? 'kit' : 'item',
      unitId: (l.item_id ?? l.kit_id ?? '') as string,
      unitName: item?.name ?? kit?.name ?? 'ชิ้นที่ถูกลบ',
      serial: item?.serial_number ?? null,
      unitStatus,
      categoryName: l.category_id ? catName.get(l.category_id) ?? null : null,
      packageName: l.package_id ? pkgName.get(l.package_id) ?? null : null,
      place: shelfId ? places[shelfId] ?? null : null,
      kitItems,
      pickBlock: pick && 'error' in pick ? pick.error : null,
    }
  })

  return {
    list,
    event: {
      id: list.event_id,
      name: e.name || 'ไม่ระบุชื่ออีเวนต์',
      event_date: dayOf(e.event_date),
      event_time: timeOf(e.event_time),
      event_end_time: timeOf(e.event_end_time),
      location: e.location ?? null,
      status: e.status ?? null,
    },
    lead: leadRes.data ?? null,
    leadPackages,
    scaffold,
    lines: views,
    spot,
    bookings,
    unitsByCategory,
  }
}

type LeadRow = { id: string; customer_name: string | null; event_location: string | null; status: string | null; archived_at: string | null }
type EventRow = { id: string; name: string | null; event_date: string | null; event_time?: string | null; event_end_time?: string | null; location?: string | null; status: string | null; crm_lead_id: string | null }

/** การ์ดของคิวจากสรุปใบ + อีเวนต์ที่ยังไม่มีใบ (โหลดอีเวนต์/งาน/แพ็กเกจ/จุดที่ต้องใช้) */
async function queueCards(db: Db, lists: PackingListSummary[], awaitingEvents: EventRow[]): Promise<PackingQueueCard[]> {
  const listEventIds = lists.map(l => l.eventId)
  const { data: evs, error } = listEventIds.length ? await db.from('events').select('*').in('id', listEventIds) : { data: [], error: null }
  fail('โหลดอีเวนต์ของใบจัดของไม่สำเร็จ', error)
  const events = new Map<string, EventRow>([...((evs ?? []) as EventRow[]), ...awaitingEvents].map(e => [e.id, e]))
  const leadIds = [...new Set([...lists.flatMap(l => (l.leadId ? [l.leadId] : [])), ...awaitingEvents.flatMap(e => (e.crm_lead_id ? [e.crm_lead_id] : []))])]
  const [leadsRes, packages, spots] = await Promise.all([
    leadIds.length ? db.from('crm_leads').select('id, customer_name, event_location').in('id', leadIds) : Promise.resolve({ data: [], error: null }),
    loadLeadPackages(db, leadIds),
    loadPickupSpots(db, { includeInactive: true }),
  ])
  fail('โหลดงานของใบจัดของไม่สำเร็จ', leadsRes.error)
  const leads = new Map(((leadsRes.data ?? []) as Pick<LeadRow, 'id' | 'customer_name' | 'event_location'>[]).map(l => [l.id, l]))
  const spotName = new Map(spots.map(s => [s.id, s.name]))

  const card = (eventId: string, leadId: string | null, list: PackingListSummary | null): PackingQueueCard => {
    const e = events.get(eventId)
    const lead = leadId ? leads.get(leadId) : undefined
    return {
      leadId: leadId ?? '',
      eventId,
      customerName: lead?.customer_name ?? null,
      eventName: e?.name || 'ไม่ระบุชื่ออีเวนต์',
      eventDate: dayOf(e?.event_date),
      eventTime: timeOf(e?.event_time),
      eventEndTime: timeOf(e?.event_end_time),
      location: e?.location ?? lead?.event_location ?? null,
      packageNames: (leadId ? packages[leadId] ?? [] : []).map(p => (p.quantity > 1 ? `${p.packageName} ×${p.quantity}` : p.packageName)),
      list,
      spotName: list?.spotId ? spotName.get(list.spotId) ?? null : null,
    }
  }
  const cards = [...lists.map(l => card(l.eventId, l.leadId, l)), ...awaitingEvents.map(e => card(e.id, e.crm_lead_id, null))]
  const key = (c: PackingQueueCard) => `${c.eventDate ?? '9999-99-99'} ${c.eventTime ?? '99:99'}`
  return cards.sort((a, b) => key(a).localeCompare(key(b)))
}

/**
 * คิว /packing ของทีมจัดของ:
 * - awaiting (รอเปิดใบ): อีเวนต์ที่ยังไม่ปิดของงานที่ตอบรับแล้ว ไม่ archive มีแพ็กเกจ วันงาน ≥ today−1 และยังไม่มีใบ
 * - active (กำลังทำ): ใบ เลือกของ/กำลังหยิบ · ready (พร้อมรับ): ใบพร้อมรับ
 * เรียงวันงาน/เวลาใกล้ก่อน · today = YYYY-MM-DD (bangkokToday)
 */
export async function loadPackingQueue(db: Db, today: string): Promise<PackingQueue> {
  const [lp, listsRes] = await Promise.all([
    readAllRows<{ lead_id: string }>((from, to) => db.from('lead_packages').select('lead_id').order('created_at').order('id').range(from, to)),
    readAllRows<Pick<PackingListRow, 'id' | 'event_id' | 'lead_id' | 'status' | 'spot_id'>>((from, to) =>
      db.from('packing_lists').select('id, event_id, lead_id, status, spot_id').in('status', ['selecting', 'picking', 'ready']).order('created_at').order('id').range(from, to),
    ),
  ])
  fail('โหลดแพ็กเกจของงานไม่สำเร็จ', lp.error)
  fail('โหลดใบจัดของไม่สำเร็จ', listsRes.error)

  const leadIds = [...new Set(lp.rows.map(r => r.lead_id))]
  let awaiting: EventRow[] = []
  if (leadIds.length) {
    const leads = await readAllRows<LeadRow>((from, to) =>
      db.from('crm_leads').select('id, customer_name, event_location, status, archived_at').in('id', leadIds).order('created_at').order('id').range(from, to),
    )
    fail('โหลดงานไม่สำเร็จ', leads.error)
    const wonIds = leads.rows.filter(l => isWonStatus(l.status) && !l.archived_at).map(l => l.id)
    if (wonIds.length) {
      const from = (() => {
        const d = new Date(`${today}T00:00:00Z`)
        d.setUTCDate(d.getUTCDate() - 1)
        return d.toISOString().slice(0, 10)
      })()
      const evs = await readAllRows<EventRow>((f, t) =>
        db.from('events').select('*').in('crm_lead_id', wonIds).gte('event_date', from).order('created_at').order('id').range(f, t),
      )
      fail('โหลดอีเวนต์ของงานไม่สำเร็จ', evs.error)
      const open = evs.rows.filter(e => !isClosedEvent(e.status))
      if (open.length) {
        const { data: had, error } = await db.from('packing_lists').select('event_id').in('event_id', open.map(e => e.id))
        fail('โหลดใบจัดของของอีเวนต์ไม่สำเร็จ', error)
        const withList = new Set(((had ?? []) as { event_id: string }[]).map(r => r.event_id))
        awaiting = open.filter(e => !withList.has(e.id))
      }
    }
  }

  const summaries = await summarize(db, listsRes.rows)
  const cards = await queueCards(db, summaries, awaiting)
  return {
    awaiting: cards.filter(c => !c.list),
    active: cards.filter(c => c.list && (c.list.status === 'selecting' || c.list.status === 'picking')),
    ready: cards.filter(c => c.list?.status === 'ready'),
  }
}

/**
 * หน่วยทั้งคลังสำหรับ "ของเสริม" นอกแพ็กเกจ (หน้าใบจัดของ) — อุปกรณ์เดี่ยวที่ไม่อยู่ในกระเป๋า + กระเป๋าทุกใบ
 * รวมอุปกรณ์ที่ยังไม่มีประเภท · วัสดุสิ้นเปลืองไม่นับ (ไม่หยิบเป็นหน่วย) · เรียงชื่อ
 */
export async function loadExtraUnits(db: Db): Promise<CategoryUnit[]> {
  const [items, kits, contents] = await Promise.all([
    readAllRows<{ id: string; name: string; serial_number: string | null; status: string; is_consumable: boolean | null }>((from, to) =>
      db.from('items').select('id, name, serial_number, status, is_consumable').order('created_at').order('id').range(from, to),
    ),
    readAllRows<{ id: string; name: string }>((from, to) => db.from('kits').select('id, name').order('created_at').order('id').range(from, to)),
    readAllRows<{ item_id: string }>((from, to) => db.from('kit_contents').select('item_id').order('id').range(from, to)),
  ])
  fail('โหลดอุปกรณ์ทั้งคลังไม่สำเร็จ', items.error ?? kits.error ?? contents.error)
  const inKit = new Set(contents.rows.map(c => c.item_id))
  const out: CategoryUnit[] = [
    ...items.rows.filter(i => !inKit.has(i.id) && !i.is_consumable).map(i => ({ id: i.id, kind: 'item' as const, name: i.name, serial: i.serial_number, status: i.status, inKit: false })),
    ...kits.rows.map(k => ({ id: k.id, kind: 'kit' as const, name: k.name, serial: null, status: 'available', inKit: false })),
  ]
  return out.sort((a, b) => a.name.localeCompare(b.name, 'th', { numeric: true }))
}
