// โหลดข้อมูลแดชบอร์ดการใช้งานอุปกรณ์ (/stock/usage) — server-only (รับ service client จากผู้เรียก)
// อ่านทุกตารางด้วย readAllRows (บรรทัดใบจัดของโตเกิน 1,000 ได้) เรียง created_at,id (ไม่มี created_at เรียง id)
// อ่านทั้งตารางแล้วรวมด้วย id ในโค้ด แทน .in() ยาวๆ / .or() · ตารางของเฟส 1–4 ยังไม่ถูกสร้าง = คืนข้อมูลว่าง ไม่ล้มหน้า
import type { createServiceClient } from '@/lib/supabase-server'
import { readAllRows } from '@/lib/read-all-rows'
import { bangkokToday, NOT_WON_STATUSES } from '../crm/types'
import { personLabel } from '../reports/report-stats'
import { loadCategories } from '../stock/categories'
import type { CategoryUnitCount, SoldPackage, UsageLine, UsageList, UsagePerson } from './usage-logic'

type Db = ReturnType<typeof createServiceClient>

export interface UsageData {
  lines: UsageLine[]
  lists: UsageList[]
  sold: SoldPackage[]
  unitsByCategory: CategoryUnitCount[]
  salesPickCategoryIds: string[]
  people: UsagePerson[]
  /** วันนี้ตามเวลาไทย (YYYY-MM-DD) — ส่งให้ client คำนวณช่วงตรงกับ server */
  today: string
}

/** ตาราง/คอลัมน์ยังไม่ถูกสร้าง (ยังไม่รัน migration) — Postgres 42P01/42703 · PostgREST PGRST205/PGRST204 */
const NOT_INSTALLED = new Set(['42P01', 'PGRST205', '42703', 'PGRST204'])

type Read<T> = { rows: T[]; error: { code?: string; message: string } | null }

/** ผลอ่าน: ไม่มีตาราง = [] · error อื่น = throw (หน้าแสดง error แทนตัวเลขผิด) */
function rowsOf<T>(what: string, res: Read<T>): T[] {
  if (!res.error) return res.rows
  if (NOT_INSTALLED.has(res.error.code ?? '')) return []
  throw new Error(`${what}: ${res.error.message}`)
}

type ListRow = {
  id: string
  event_id: string
  lead_id: string | null
  status: string
  packed_by: string | null
  packed_at: string | null
  handed_over_by: string | null
  handed_over_at: string | null
  returned_by: string | null
  returned_at: string | null
  restocked_by: string | null
  restocked_at: string | null
}
type LineRow = {
  list_id: string
  category_id: string | null
  item_id: string | null
  kit_id: string | null
  variant: string | null
  handed_over_at: string | null
  returned_at: string | null
}
type EventRow = { id: string; event_date: string | null; event_time: string | null; event_end_time: string | null; crm_lead_id: string | null }
type ItemRow = { id: string; name: string; serial_number: string | null; category_id: string | null }
type KitRow = { id: string; name: string; category_id: string | null }
type LeadRow = { id: string; customer_name: string | null; event_date: string | null }
type LeadPackageRow = { lead_id: string; package_id: string; quantity: number | null }
type PackageRow = { id: string; name: string }
type ProfileRow = { id: string; full_name: string | null; nickname: string | null }

const LIST_COLUMNS = 'id, event_id, lead_id, status, packed_by, packed_at, handed_over_by, handed_over_at, returned_by, returned_at, restocked_by, restocked_at'

export async function loadUsageData(db: Db): Promise<UsageData> {
  const today = bangkokToday(Date.now())

  const [listsRes, linesRes, eventsRes, itemsRes, kitsRes, contentsRes, wonLeadsRes, leadPkgRes, pkgRes, profilesRes, categories] = await Promise.all([
    readAllRows<ListRow>((from, to) => db.from('packing_lists').select(LIST_COLUMNS).order('created_at').order('id').range(from, to)),
    // นับเฉพาะบรรทัดที่ถึงขั้นรับของ — ที่เหลือไม่เข้าสูตรไหนเลย
    readAllRows<LineRow>((from, to) =>
      db
        .from('packing_list_items')
        .select('list_id, category_id, item_id, kit_id, variant, handed_over_at, returned_at')
        .not('handed_over_at', 'is', null)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    readAllRows<EventRow>((from, to) =>
      db.from('events').select('id, event_date, event_time, event_end_time, crm_lead_id').order('created_at').order('id').range(from, to),
    ),
    readAllRows<ItemRow>((from, to) => db.from('items').select('id, name, serial_number, category_id').order('created_at').order('id').range(from, to)),
    readAllRows<KitRow>((from, to) => db.from('kits').select('id, name, category_id').order('created_at').order('id').range(from, to)),
    readAllRows<{ item_id: string }>((from, to) => db.from('kit_contents').select('item_id').order('id').range(from, to)),
    // งานที่ตอบรับแล้ว (สถานะ won ใดก็ได้ — นิยามเดียวทั้งระบบ crm/types) · ใช้ทั้งนับแพ็กเกจที่ขายและชื่อลูกค้า
    readAllRows<LeadRow>((from, to) =>
      db
        .from('crm_leads')
        .select('id, customer_name, event_date')
        .not('status', 'in', `(${NOT_WON_STATUSES.join(',')})`)
        .order('created_at')
        .order('id')
        .range(from, to),
    ),
    readAllRows<LeadPackageRow>((from, to) => db.from('lead_packages').select('lead_id, package_id, quantity').order('created_at').order('id').range(from, to)),
    readAllRows<PackageRow>((from, to) => db.from('packages').select('id, name').order('id').range(from, to)),
    readAllRows<ProfileRow>((from, to) => db.from('profiles').select('id, full_name, nickname').eq('is_approved', true).order('id').range(from, to)),
    loadCategories(db, { includeInactive: true }),
  ])

  const listRows = rowsOf('โหลดใบจัดของไม่สำเร็จ', listsRes)
  const lineRows = rowsOf('โหลดบรรทัดใบจัดของไม่สำเร็จ', linesRes)
  const events = new Map(rowsOf('โหลดอีเวนต์ไม่สำเร็จ', eventsRes).map(e => [e.id, e]))
  const items = new Map(rowsOf('โหลดอุปกรณ์ไม่สำเร็จ', itemsRes).map(i => [i.id, i]))
  const kits = new Map(rowsOf('โหลดกระเป๋าไม่สำเร็จ', kitsRes).map(k => [k.id, k]))
  const inKit = new Set(rowsOf('โหลดของในกระเป๋าไม่สำเร็จ', contentsRes).map(c => c.item_id))
  const wonLeads = new Map(rowsOf('โหลดงานไม่สำเร็จ', wonLeadsRes).map(l => [l.id, l]))
  const packages = new Map(rowsOf('โหลดแพ็กเกจไม่สำเร็จ', pkgRes).map(p => [p.id, p.name]))
  const categoryName = new Map(categories.map(c => [c.id, c.name]))

  // ใบจัดของ — วันงาน/เวลาจากอีเวนต์ของใบ · lead ของใบ (ไม่มี = crm_lead_id ของอีเวนต์)
  const listById = new Map<string, { row: ListRow; event: EventRow | undefined; leadId: string | null }>()
  const lists: UsageList[] = listRows.map(r => {
    const event = events.get(r.event_id)
    const leadId = r.lead_id ?? event?.crm_lead_id ?? null
    listById.set(r.id, { row: r, event, leadId })
    return {
      id: r.id,
      status: r.status,
      eventDate: event?.event_date ? event.event_date.slice(0, 10) : null,
      packedBy: r.packed_by,
      packedAt: r.packed_at,
      handedOverBy: r.handed_over_by,
      handedOverAt: r.handed_over_at,
      returnedBy: r.returned_by,
      returnedAt: r.returned_at,
      restockedBy: r.restocked_by,
      restockedAt: r.restocked_at,
      leadId,
    }
  })

  const lines: UsageLine[] = []
  for (const l of lineRows) {
    const list = listById.get(l.list_id)
    if (!list || !l.handed_over_at) continue
    const item = l.item_id ? items.get(l.item_id) : undefined
    const kit = !item && l.kit_id ? kits.get(l.kit_id) : undefined
    const unitId = item?.id ?? kit?.id ?? l.item_id ?? l.kit_id
    if (!unitId) continue // ชิ้นถูกลบไปแล้ว (SET NULL) — ไม่รู้ว่าเป็นหน่วยไหน
    // ประเภทของตัวหน่วยก่อน (จัดกลุ่ม "ตามประเภท" ตามของจริง) ไม่มีค่อยใช้ประเภทของบรรทัด
    const categoryId = item?.category_id ?? kit?.category_id ?? l.category_id ?? null
    lines.push({
      unitId,
      kind: item || (!kit && l.item_id) ? 'item' : 'kit',
      unitName: item?.name ?? kit?.name ?? 'อุปกรณ์ที่ถูกลบ',
      serial: item?.serial_number ?? null,
      categoryId,
      categoryName: categoryId ? categoryName.get(categoryId) ?? null : null,
      listId: l.list_id,
      leadId: list.leadId,
      customerName: list.leadId ? wonLeads.get(list.leadId)?.customer_name ?? null : null,
      eventDate: list.event?.event_date ? list.event.event_date.slice(0, 10) : null,
      eventTime: list.event?.event_time ?? null,
      eventEndTime: list.event?.event_end_time ?? null,
      handedOverAt: l.handed_over_at,
      returnedAt: l.returned_at,
      variant: l.variant,
    })
  }

  // แพ็กเกจที่ขาย — เฉพาะงานที่ตอบรับแล้ว · hasList = งานนี้มีใบจัดของแล้วอย่างน้อย 1 ใบ
  const leadsWithList = new Set(lists.map(l => l.leadId).filter((id): id is string => !!id))
  const sold: SoldPackage[] = []
  for (const lp of rowsOf('โหลดแพ็กเกจของงานไม่สำเร็จ', leadPkgRes)) {
    const lead = wonLeads.get(lp.lead_id)
    if (!lead) continue
    sold.push({
      packageId: lp.package_id,
      packageName: packages.get(lp.package_id) ?? 'แพ็กเกจที่ถูกลบ',
      quantity: lp.quantity ?? 1,
      eventDate: lead.event_date ? lead.event_date.slice(0, 10) : null,
      leadId: lp.lead_id,
      hasList: leadsWithList.has(lp.lead_id),
    })
  }

  // หน่วยต่อประเภท (กติกาเดียวกับ loadCategoryUnits: อุปกรณ์ในกระเป๋าไม่ใช่หน่วยของตัวเอง) · ลำดับตามตั้งค่าคลัง
  const unitCount = new Map<string, number>()
  for (const i of items.values()) if (i.category_id && !inKit.has(i.id)) unitCount.set(i.category_id, (unitCount.get(i.category_id) ?? 0) + 1)
  for (const k of kits.values()) if (k.category_id) unitCount.set(k.category_id, (unitCount.get(k.category_id) ?? 0) + 1)
  const unitsByCategory: CategoryUnitCount[] = categories
    .filter(c => c.is_active || unitCount.has(c.id))
    .map(c => ({ categoryId: c.id, categoryName: c.name, unitCount: unitCount.get(c.id) ?? 0 }))

  const people: UsagePerson[] = rowsOf('โหลดรายชื่อไม่สำเร็จ', profilesRes).map(p => ({
    id: p.id,
    name: personLabel({ id: p.id, fullName: p.full_name || '', nickname: p.nickname, department: null }),
  }))

  return {
    lines,
    lists,
    sold,
    unitsByCategory,
    salesPickCategoryIds: categories.filter(c => c.sales_pick).map(c => c.id),
    people,
    today,
  }
}
