import { z } from 'zod'
import type { createServiceClient } from './supabase-server'
import { dictionary } from './dictionary'
import { loadShelfHealth, latestAuditByShelf } from '@/app/(authenticated)/shelves/queries'
import { kitShelfState, countProblems, PROBLEM_STATUSES, type KitShelfState } from '@/app/(authenticated)/shelves/shelf-logic'
import { packState, onShelf } from '@/app/(authenticated)/shelves/consumable-logic'
import { loadBookingsForEvent } from './kit-bookings'
import { getTrackingSnapshot } from '@/app/(authenticated)/jobs/tracking/data'
import {
  designReadyByLead,
  getMissing,
  isClosedEvent,
  isPast,
  kitReadinessByLead,
  missingLabel,
} from '@/app/(authenticated)/jobs/tracking/tracking-logic'

// tool ของ MCP (อ่านอย่างเดียว) — ประกาศเป็นข้อมูล ไม่ผูกไลบรารี MCP (สเปค docs/specs/mcp-server.md)
// app/api/mcp/route.ts ลงทะเบียนเฉพาะ tool ที่โมดูลของ token อนุญาต (toolsFor)
// ห้ามเขียนข้อมูลในไฟล์นี้ — lib/mcp-tools.check.ts สแกนหา insert/update/delete/upsert/rpc
// แถวผลลัพธ์เก็บแค่ id + ชื่อ + ช่องที่คนถามถึง · ไม่คืน pin / ราคา / รูป

type Db = ReturnType<typeof createServiceClient>

export const MAX_ROWS = 100
/** เพดานขนาดข้อความผลลัพธ์ต่อ tool (M7) */
export const MAX_RESULT_BYTES = 64 * 1024

export type McpModule = 'stock' | 'events' | 'jobs'

export interface ToolResult {
  /** สรุปภาษาไทย 1 บรรทัด */
  summary: string
  rows: unknown[]
  /** จำนวนทั้งหมดเมื่อถูกตัดแถว */
  total?: number
}

export interface McpTool {
  name: string
  module: McpModule
  /** ภาษาไทย บอกว่าคืนอะไร */
  description: string
  schema: z.ZodObject
  /** ตรวจ args ด้วย schema ก่อนรันเสมอ */
  run(db: Db, args: unknown): Promise<ToolResult>
}

/** ข้อผิดพลาดที่ตั้งใจบอกผู้ใช้ (เช่น ไม่พบชั้น) — route ส่งข้อความนี้กลับเป็น isError ตรงๆ */
export class ToolError extends Error {}

function defineTool<S extends z.ZodObject>(t: {
  name: string
  module: McpModule
  description: string
  schema: S
  run(db: Db, args: z.output<S>): Promise<ToolResult>
}): McpTool {
  return {
    name: t.name,
    module: t.module,
    description: t.description,
    schema: t.schema,
    run: async (db, args) => t.run(db, t.schema.parse(args ?? {})),
  }
}

// ── ตัวช่วย ────────────────────────────────────────────────────────────────────

const STATUS_TH: Record<string, string> = dictionary.th.items.status
const statusTh = (s: string | null | undefined) => (s ? STATUS_TH[s] ?? s : 'ไม่ระบุ')

const KIT_STATE_TH: Record<KitShelfState['kind'], string> = { out: 'ออกงาน', booked: 'จองไว้', home: 'ในคลัง' }

function kitStateRow(s: KitShelfState) {
  if (s.kind === 'out') return { kind: s.kind, label: KIT_STATE_TH.out, event: s.eventName }
  if (s.kind === 'booked') return { kind: s.kind, label: KIT_STATE_TH.booked, event: s.eventName, date: day(s.eventDate) }
  return { kind: s.kind, label: KIT_STATE_TH.home }
}

/** YYYY-MM-DD ตามเวลา server (กติกาเดียวกับหน้าติดตามงาน) */
function ymd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return ymd(new Date(y, m - 1, d + n))
}
const day = (v: string | null | undefined) => (v ? String(v).slice(0, 10) : null)
const hhmm = (v: string | null | undefined) => (v ? String(v).slice(0, 5) : null)

/** ตัดแถวที่ MAX_ROWS (หรือ limit) และบอกจำนวนทั้งหมด */
function capped(rows: unknown[], summary: string, limit = MAX_ROWS): ToolResult {
  if (rows.length <= limit) return { summary, rows }
  return { summary: `${summary} · แสดง ${limit} จาก ${rows.length} รายการ`, rows: rows.slice(0, limit), total: rows.length }
}

/** ilike แบบตรงตัว (ไม่ให้ % _ ของผู้ใช้กลายเป็น wildcard) */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, m => `\\${m}`)
/** ค่าที่ใส่ใน or() ของ PostgREST — ตัดอักขระที่เป็นไวยากรณ์ทิ้ง */
const orSafe = (s: string) => s.replace(/[,()"\\:%*]/g, ' ').replace(/\s+/g, ' ').trim()

type ItemLite = { id: string; name: string; status: string; is_consumable: boolean | null }
type RawKitWithItems = {
  id: string
  name: string
  shelves: { code: string } | null
  events: { name: string | null; event_date: string | null } | null
  kit_contents: { items: ItemLite | null }[] | null
}
const KIT_SELECT = 'id, name, shelves(code), events(name, event_date), kit_contents(items(id, name, status, is_consumable))'

const kitItems = (k: { kit_contents: { items: ItemLite | null }[] | null }) =>
  (k.kit_contents || []).map(c => c.items).filter((i): i is ItemLite => !!i)
const regularStatuses = (items: ItemLite[]) => items.filter(i => !i.is_consumable).map(i => i.status)

/** ผลรวมจำนวนประจำกระเป๋าของวัสดุสิ้นเปลืองแต่ละชิ้น */
async function inKitsQty(db: Db, itemIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (itemIds.length === 0) return out
  const { data } = await db.from('kit_contents').select('item_id, quantity').in('item_id', itemIds)
  for (const r of (data || []) as { item_id: string; quantity: number | null }[]) {
    out.set(r.item_id, (out.get(r.item_id) ?? 0) + (r.quantity || 0))
  }
  return out
}

type StaffRaw = { event_id: string; role: string | null; profiles: { full_name: string | null; nickname: string | null } | null }
const personName = (p: { full_name: string | null; nickname: string | null } | null | undefined) =>
  p?.nickname ? `${p.full_name || ''} (${p.nickname})`.trim() : p?.full_name || 'ไม่ทราบชื่อ'

async function roleLabels(db: Db): Promise<Record<string, string>> {
  const { data } = await db.from('crm_settings').select('value, label_th').eq('category', 'staff_role')
  const out: Record<string, string> = {}
  for (const r of (data || []) as { value: string; label_th: string | null }[]) out[r.value] = r.label_th || r.value
  return out
}

// ── kits_snapshot ของการปิดงาน (jsonb) ──────────────────────────────────────────

interface SnapItem { name: string; status: string | null; isConsumable: boolean; used: number; unit?: string | null }
function parseSnapshot(raw: unknown): { kitName: string; items: SnapItem[] }[] {
  if (!Array.isArray(raw)) return []
  return raw.map(k => {
    const kit = (k && typeof k === 'object' ? k : {}) as Record<string, unknown>
    const items = Array.isArray(kit.items) ? kit.items : []
    return {
      kitName: typeof kit.kitName === 'string' ? kit.kitName : 'ไม่ระบุกระเป๋า',
      items: items.map(i => {
        const it = (i && typeof i === 'object' ? i : {}) as Record<string, unknown>
        return {
          name: typeof it.itemName === 'string' ? it.itemName : 'ไม่ระบุชื่อ',
          status: typeof it.status === 'string' ? it.status : null,
          isConsumable: it.isConsumable === true,
          used: typeof it.used === 'number' ? it.used : 0,
        }
      }),
    }
  })
}

/** สรุปการปิดงาน: นับของเสีย/ซ่อม/หาย (อุปกรณ์ปกติ) + วัสดุสิ้นเปลืองที่ใช้ไป */
function closureSummary(snapshot: unknown) {
  const kits = parseSnapshot(snapshot)
  const regular = kits.flatMap(k => k.items.filter(i => !i.isConsumable))
  const byStatus = (s: string) => regular.filter(i => i.status === s)
  const used = new Map<string, number>()
  for (const i of kits.flatMap(k => k.items.filter(x => x.isConsumable && x.used > 0))) used.set(i.name, (used.get(i.name) ?? 0) + i.used)
  return {
    damaged: byStatus('damaged').length,
    maintenance: byStatus('maintenance').length,
    lost: byStatus('lost').length,
    problemItems: regular.filter(i => i.status && PROBLEM_STATUSES.includes(i.status)).map(i => `${i.name} (${statusTh(i.status)})`),
    consumablesUsed: [...used].map(([name, n]) => ({ name, used: n })),
  }
}

// ── tools ─────────────────────────────────────────────────────────────────────

const ITEM_STATUSES = ['available', 'in_use', 'maintenance', 'damaged', 'lost', 'out_of_stock', 'purchasing'] as const

const stockSummary = defineTool({
  name: 'stock_summary',
  module: 'stock',
  description: 'ภาพรวมสต็อก: จำนวนอุปกรณ์แยกตามสถานะ, กระเป๋าที่ออกงาน/จองไว้/อยู่ในคลัง, วัสดุสิ้นเปลืองที่หมดหรือใกล้หมด และจำนวนชั้นที่ถึงกำหนดตรวจนับ',
  schema: z.object({}),
  async run(db) {
    const [{ data: items }, { data: kits }, health] = await Promise.all([
      db.from('items').select('status, is_consumable'),
      db.from('kits').select(KIT_SELECT),
      loadShelfHealth(db),
    ])
    const rows: { group: string; key: string; label: string; count: number }[] = []
    const all = (items || []) as { status: string; is_consumable: boolean | null }[]
    const regular = all.filter(i => !i.is_consumable)
    const byStatus = new Map<string, number>()
    for (const i of regular) byStatus.set(i.status, (byStatus.get(i.status) ?? 0) + 1)
    for (const [status, count] of byStatus) rows.push({ group: 'อุปกรณ์', key: status, label: statusTh(status), count })

    const byKind: Record<KitShelfState['kind'], number> = { out: 0, booked: 0, home: 0 }
    const kitList = (kits || []) as unknown as RawKitWithItems[]
    for (const k of kitList) byKind[kitShelfState(regularStatuses(kitItems(k)), k.events).kind]++
    for (const kind of ['out', 'booked', 'home'] as const) rows.push({ group: 'กระเป๋า', key: kind, label: KIT_STATE_TH[kind], count: byKind[kind] })

    rows.push({ group: 'วัสดุสิ้นเปลือง', key: 'all', label: 'ทั้งหมด', count: all.length - regular.length })
    rows.push({ group: 'วัสดุสิ้นเปลือง', key: 'low', label: 'หมดหรือใกล้หมด', count: health.lowStock.length })
    rows.push({ group: 'ชั้น', key: 'audit_due', label: 'ถึงกำหนดตรวจนับ', count: health.dueShelves.length })
    rows.push({ group: 'กระเป๋า', key: 'no_shelf', label: 'ยังไม่มีชั้น', count: health.kitsWithoutShelf })

    const summary = `อุปกรณ์ ${regular.length} ชิ้น · กระเป๋า ${kitList.length} ใบ (ออกงาน ${byKind.out} / จองไว้ ${byKind.booked} / ในคลัง ${byKind.home})`
      + ` · วัสดุหมด/ใกล้หมด ${health.lowStock.length} รายการ · ชั้นถึงกำหนดตรวจ ${health.dueShelves.length} ชั้น`
    return { summary, rows }
  },
})

const searchItems = defineTool({
  name: 'search_items',
  module: 'stock',
  description: 'ค้นหาอุปกรณ์ตามชื่อ / serial / หมวด / สถานะ หรือเฉพาะวัสดุสิ้นเปลือง — คืนชื่อ หมวด สถานะ จำนวน (พร้อมหน่วย) กระเป๋าที่อยู่ และรหัสชั้น',
  schema: z.object({
    q: z.string().max(100).optional().describe('คำค้น: ชื่อ, serial หรือหมวดของอุปกรณ์'),
    status: z.enum(ITEM_STATUSES).optional().describe('กรองตามสถานะ เช่น available = ว่าง, in_use = กำลังใช้งาน, damaged = ชำรุด, maintenance = ซ่อมบำรุง, lost = หาย'),
    consumable_only: z.boolean().optional().describe('true = เฉพาะวัสดุสิ้นเปลือง'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('จำนวนแถวสูงสุด 1–100 (ค่าเริ่มต้น 50)'),
  }),
  async run(db, args) {
    let query = db
      .from('items')
      .select('id, name, serial_number, category, status, quantity, unit, is_consumable, shelves(code), kit_contents(kits(name, shelves(code)))')
    const q = args.q ? orSafe(args.q) : ''
    if (q) query = query.or(`name.ilike.%${q}%,serial_number.ilike.%${q}%,category.ilike.%${q}%`)
    if (args.status) query = query.eq('status', args.status)
    if (args.consumable_only) query = query.eq('is_consumable', true)
    const { data, error } = await query.order('name')
    if (error) throw new Error(error.message)

    type Raw = {
      id: string; name: string; serial_number: string | null; category: string | null; status: string
      quantity: number | null; unit: string | null; is_consumable: boolean | null
      shelves: { code: string } | null
      kit_contents: { kits: { name: string; shelves: { code: string } | null } | null }[] | null
    }
    const rows = ((data || []) as unknown as Raw[]).map(i => {
      const kit = i.kit_contents?.[0]?.kits ?? null
      // กติกาเดียวกับ items-table.tsx::shelfOf — วัสดุสิ้นเปลืองใช้ชั้นตัวเอง อุปกรณ์ปกติใช้ชั้นของกระเป๋าก่อน
      const shelf = i.is_consumable ? i.shelves?.code ?? null : kit?.shelves?.code ?? i.shelves?.code ?? null
      return {
        id: i.id,
        name: i.name,
        serial: i.serial_number,
        category: i.category,
        status: statusTh(i.status),
        quantity: i.quantity ?? 0,
        ...(i.is_consumable ? { unit: i.unit, consumable: true } : {}),
        kit: kit?.name ?? null,
        shelf,
      }
    })
    const what = [q && `"${q}"`, args.status && statusTh(args.status), args.consumable_only && 'วัสดุสิ้นเปลือง'].filter(Boolean).join(' ')
    return capped(rows, `พบอุปกรณ์${what ? ` ${what}` : ''} ${rows.length} รายการ`, args.limit ?? 50)
  },
})

const lowStock = defineTool({
  name: 'low_stock',
  module: 'stock',
  description: 'วัสดุสิ้นเปลืองที่หมดหรือใกล้หมด — คืนชื่อ จำนวนที่เหลือบนชั้น หน่วย และรหัสชั้น',
  schema: z.object({}),
  async run(db) {
    const { lowStock: low } = await loadShelfHealth(db)
    const rows = low.map(l => ({
      id: l.id,
      name: l.name,
      level: l.onShelf === 0 ? 'หมดบนชั้น' : 'ใกล้หมด',
      onShelf: l.onShelf,
      unit: l.unit,
      shelf: l.shelfCode,
    }))
    return capped(rows, rows.length ? `วัสดุสิ้นเปลืองหมด/ใกล้หมด ${rows.length} รายการ` : 'ไม่มีวัสดุสิ้นเปลืองที่หมดหรือใกล้หมด')
  },
})

const kitStatus = defineTool({
  name: 'kit_status',
  module: 'stock',
  description: 'สถานะกระเป๋าทุกใบหรือตามชื่อ — คืนชั้นที่เก็บ, สถานะ (ออกงาน/จองไว้/ในคลัง พร้อมชื่องานและวันที่), การจัดกระเป๋า (นำออกแล้วกี่ชิ้นจากกี่ชิ้น, ชิ้นที่นำออกไม่ได้), จำนวนชิ้นที่มีปัญหา และจำนวนของในกระเป๋า',
  schema: z.object({
    name: z.string().max(100).optional().describe('ชื่อกระเป๋า (ค้นแบบบางส่วน) — ไม่ใส่ = ทุกใบ'),
  }),
  async run(db, args) {
    let query = db.from('kits').select(KIT_SELECT)
    if (args.name?.trim()) query = query.ilike('name', `%${likeEscape(args.name.trim())}%`)
    const { data, error } = await query.order('name')
    if (error) throw new Error(error.message)
    const rows = ((data || []) as unknown as RawKitWithItems[]).map(k => {
      const items = kitItems(k)
      const ps = packState(items)
      return {
        id: k.id,
        name: k.name,
        shelf: k.shelves?.code ?? null,
        state: kitStateRow(kitShelfState(regularStatuses(items), k.events)),
        pack: { out: ps.out, total: ps.total, packed: ps.packed, blocked: ps.blocked.map(b => `${b.name} (${statusTh(b.status)})`) },
        problems: countProblems(regularStatuses(items)),
        items: items.length,
      }
    })
    const label = args.name?.trim() ? `กระเป๋าชื่อ "${args.name.trim()}"` : 'กระเป๋าทั้งหมด'
    return capped(rows, `${label} ${rows.length} ใบ`)
  },
})

const shelfContents = defineTool({
  name: 'shelf_contents',
  module: 'stock',
  description: 'ของบนชั้นตามรหัสชั้น — คืนกระเป๋า (พร้อมสถานะ), อุปกรณ์แยกชิ้น, วัสดุสิ้นเปลือง (เหลือบนชั้นกี่หน่วย) และผลตรวจนับล่าสุด',
  schema: z.object({
    code: z.string().min(1).max(50).describe('รหัสชั้น เช่น A-1 (ไม่สนตัวพิมพ์เล็ก/ใหญ่)'),
  }),
  async run(db, args) {
    const code = args.code.trim()
    const { data: shelves } = await db.from('shelves').select('id, code, name').ilike('code', likeEscape(code))
    const shelf = ((shelves || []) as { id: string; code: string; name: string | null }[])[0]
    if (!shelf) throw new ToolError(`ไม่พบชั้นรหัส ${code}`)

    const [{ data: kits }, { data: items }, audits] = await Promise.all([
      db.from('kits').select(KIT_SELECT).eq('shelf_id', shelf.id).order('name'),
      db.from('items').select('id, name, status, quantity, is_consumable, unit').eq('shelf_id', shelf.id).order('name'),
      latestAuditByShelf(db),
    ])
    type RawItem = { id: string; name: string; status: string; quantity: number | null; is_consumable: boolean | null; unit: string | null }
    const itemList = (items || []) as RawItem[]
    const consumables = itemList.filter(i => i.is_consumable)
    const packed = await inKitsQty(db, consumables.map(i => i.id))

    const rows: unknown[] = [
      ...((kits || []) as unknown as RawKitWithItems[]).map(k => ({
        type: 'กระเป๋า',
        id: k.id,
        name: k.name,
        state: kitStateRow(kitShelfState(regularStatuses(kitItems(k)), k.events)),
      })),
      ...itemList.filter(i => !i.is_consumable).map(i => ({ type: 'อุปกรณ์', id: i.id, name: i.name, status: statusTh(i.status) })),
      ...consumables.map(i => ({
        type: 'วัสดุสิ้นเปลือง',
        id: i.id,
        name: i.name,
        onShelf: onShelf(i.quantity ?? 0, packed.get(i.id) ?? 0),
        unit: i.unit,
      })),
    ]
    const last = audits.get(shelf.id)
    const audit = last ? `ตรวจนับล่าสุด ${day(last.createdAt)} ของขาด ${last.missingCount} รายการ` : 'ยังไม่เคยตรวจนับ'
    return capped(rows, `ชั้น ${shelf.code}${shelf.name ? ` (${shelf.name})` : ''}: ของ ${rows.length} รายการ · ${audit}`)
  },
})

type RawBookingKit = {
  event_id: string
  kits: { name: string; kit_contents: { items: ItemLite | null }[] | null } | null
}

const upcomingEvents = defineTool({
  name: 'upcoming_events',
  module: 'events',
  description: 'อีเวนต์ที่ยังไม่ปิดภายใน N วันข้างหน้า — คืนวันที่ เวลา สถานที่ กระเป๋าที่จอง (จัดครบหรือยัง ชิ้นที่นำออกไม่ได้) และรายชื่อทีมงาน',
  schema: z.object({
    days: z.number().int().min(1).max(365).optional().describe('ดูล่วงหน้ากี่วัน 1–365 (ค่าเริ่มต้น 30)'),
  }),
  async run(db, args) {
    const days = args.days ?? 30
    const today = ymd(new Date())
    const { data, error } = await db
      .from('events')
      .select('id, name, event_date, event_time, event_end_time, location, status')
      .gte('event_date', today)
      .lt('event_date', addDays(today, days + 1))
      .order('event_date', { ascending: true })
    if (error) throw new Error(error.message)
    type RawEvent = { id: string; name: string; event_date: string | null; event_time: string | null; event_end_time: string | null; location: string | null; status: string | null }
    const events = ((data || []) as RawEvent[])
      .filter(e => !isClosedEvent(e.status))
      .sort((a, b) => (day(a.event_date) ?? '').localeCompare(day(b.event_date) ?? '') || (a.event_time ?? '').localeCompare(b.event_time ?? ''))
    const shown = events.slice(0, MAX_ROWS)
    const ids = shown.map(e => e.id)

    const [{ data: bookings }, { data: staff }] = ids.length
      ? await Promise.all([
          db.from('event_kits').select('event_id, kits(name, kit_contents(items(id, name, status, is_consumable)))').in('event_id', ids),
          db.from('event_staff').select('event_id, role, profiles:user_id(full_name, nickname)').in('event_id', ids),
        ])
      : [{ data: [] }, { data: [] }]

    const rows = shown.map(e => ({
      id: e.id,
      name: e.name,
      date: day(e.event_date),
      time: [hhmm(e.event_time), hhmm(e.event_end_time)].filter(Boolean).join('–') || null,
      location: e.location,
      kits: ((bookings || []) as unknown as RawBookingKit[])
        .filter(b => b.event_id === e.id && b.kits)
        .map(b => {
          const ps = packState(kitItems(b.kits!))
          return { name: b.kits!.name, packed: ps.packed, out: `${ps.out}/${ps.total}`, missing: ps.blocked.map(x => `${x.name} (${statusTh(x.status)})`) }
        }),
      staff: [...new Set(((staff || []) as unknown as StaffRaw[]).filter(s => s.event_id === e.id).map(s => personName(s.profiles)))],
    }))
    const summary = `อีเวนต์ที่ยังไม่ปิดใน ${days} วันข้างหน้า ${events.length} งาน`
    return events.length > MAX_ROWS
      ? { summary: `${summary} · แสดง ${MAX_ROWS} จาก ${events.length} รายการ`, rows, total: events.length }
      : { summary, rows }
  },
})

const eventDetail = defineTool({
  name: 'event_detail',
  module: 'events',
  description: 'รายละเอียดอีเวนต์หนึ่งงาน (ระบุ id หรือชื่อ) — คืนวัน เวลา สถานที่ สถานะ กระเป๋าที่จองพร้อมของในกระเป๋าและสถานะ ทีมงาน (ชื่อ + ตำแหน่ง) และสรุปการปิดงานถ้าปิดแล้ว',
  schema: z.object({
    id: z.string().max(64).optional().describe('id ของอีเวนต์'),
    name: z.string().max(200).optional().describe('ชื่ออีเวนต์ (ค้นแบบบางส่วน) — ใช้เมื่อไม่รู้ id'),
  }),
  async run(db, args) {
    const id = args.id?.trim()
    const name = args.name?.trim()
    if (!id && !name) throw new ToolError('ระบุ id หรือชื่ออีเวนต์อย่างใดอย่างหนึ่ง')
    const cols = 'id, name, event_date, event_time, event_end_time, location, status'
    type RawEvent = { id: string; name: string; event_date: string | null; event_time: string | null; event_end_time: string | null; location: string | null; status: string | null }

    let event: RawEvent | null = null
    if (id) {
      const { data } = await db.from('events').select(cols).eq('id', id).maybeSingle()
      event = (data as RawEvent | null) ?? null
    } else {
      const { data } = await db.from('events').select(cols).ilike('name', `%${likeEscape(name!)}%`).order('event_date', { ascending: false }).limit(20)
      const found = (data || []) as RawEvent[]
      const exact = found.filter(e => e.name.trim().toLowerCase() === name!.toLowerCase())
      if (exact.length === 1 || found.length === 1) event = exact[0] ?? found[0]
      else if (found.length > 1) {
        return {
          summary: `พบอีเวนต์ที่ชื่อตรงกับ "${name}" ${found.length} งาน — ระบุ id เพื่อดูรายละเอียด`,
          rows: found.map(e => ({ id: e.id, name: e.name, date: day(e.event_date), closed: isClosedEvent(e.status) })),
        }
      }
    }
    if (!event) throw new ToolError(id ? `ไม่พบอีเวนต์ id ${id}` : `ไม่พบอีเวนต์ชื่อ "${name}"`)

    const bookings = await loadBookingsForEvent(db, event.id)
    const kitIds = [...new Set(bookings.map(b => b.kitId))]
    const [{ data: kits }, { data: staff }, labels] = await Promise.all([
      kitIds.length
        ? db.from('kits').select('id, name, kit_contents(quantity, items(id, name, status, is_consumable, unit))').in('id', kitIds).order('name')
        : Promise.resolve({ data: [] }),
      db.from('event_staff').select('event_id, role, profiles:user_id(full_name, nickname)').eq('event_id', event.id),
      roleLabels(db),
    ])
    type RawKit = { id: string; name: string; kit_contents: { quantity: number | null; items: (ItemLite & { unit: string | null }) | null }[] | null }
    const kitRows = ((kits || []) as unknown as RawKit[]).map(k => {
      const contents = (k.kit_contents || []).filter(c => c.items)
      const ps = packState(contents.map(c => c.items!))
      return {
        name: k.name,
        packedAt: bookings.find(b => b.kitId === k.id)?.packed ?? false,
        out: `${ps.out}/${ps.total}`,
        items: contents.map(c => c.items!.is_consumable
          ? { name: c.items!.name, quantity: c.quantity ?? 0, unit: c.items!.unit, consumable: true }
          : { name: c.items!.name, status: statusTh(c.items!.status) }),
      }
    })

    let closure: Record<string, unknown> | null = null
    if (isClosedEvent(event.status)) {
      const { data: closures } = await db
        .from('event_closures')
        .select('closed_at, event_date, kits_snapshot, closer:profiles!event_closures_closed_by_fkey(full_name, nickname)')
        .eq('event_name', event.name)
        .order('closed_at', { ascending: false })
      type RawClosure = { closed_at: string; event_date: string | null; kits_snapshot: unknown; closer: { full_name: string | null; nickname: string | null } | null }
      const list = (closures || []) as unknown as RawClosure[]
      const c = list.find(x => day(x.event_date) === day(event!.event_date)) ?? list[0]
      if (c) closure = { closedAt: c.closed_at, closedBy: personName(c.closer), ...closureSummary(c.kits_snapshot) }
    }

    const row = {
      id: event.id,
      name: event.name,
      date: day(event.event_date),
      time: [hhmm(event.event_time), hhmm(event.event_end_time)].filter(Boolean).join('–') || null,
      location: event.location,
      closed: isClosedEvent(event.status),
      kits: kitRows,
      staff: ((staff || []) as unknown as StaffRaw[]).map(s => ({ name: personName(s.profiles), role: s.role ? labels[s.role] ?? s.role : null })),
      closure,
    }
    return {
      summary: `อีเวนต์ ${event.name} วันที่ ${row.date ?? 'ไม่ระบุ'} · กระเป๋า ${kitRows.length} ใบ · ทีมงาน ${row.staff.length} คน${row.closed ? ' · ปิดงานแล้ว' : ''}`,
      rows: [row],
    }
  },
})

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

const eventClosures = defineTool({
  name: 'event_closures',
  module: 'events',
  description: 'ประวัติการปิดงานในช่วงวันที่ (ค่าเริ่มต้น 30 วันล่าสุด) — คืนชื่องาน วันงาน ผู้ปิด จำนวนของชำรุด/ซ่อมบำรุง/หาย (พร้อมชื่อ) และวัสดุสิ้นเปลืองที่ใช้ไป',
  schema: z.object({
    from: DATE.optional().describe('วันที่เริ่ม (ปิดงานตั้งแต่) รูปแบบ YYYY-MM-DD ค.ศ.'),
    to: DATE.optional().describe('วันที่สิ้นสุด (ปิดงานถึง) รูปแบบ YYYY-MM-DD ค.ศ.'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('จำนวนแถวสูงสุด 1–100 (ค่าเริ่มต้น 100)'),
  }),
  async run(db, args) {
    const to = args.to ?? ymd(new Date())
    const from = args.from ?? addDays(to, -30)
    if (from > to) throw new ToolError('วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด')
    const { data, error } = await db
      .from('event_closures')
      .select('id, event_name, event_date, closed_at, kits_snapshot, closer:profiles!event_closures_closed_by_fkey(full_name, nickname)')
      .gte('closed_at', from)
      .lt('closed_at', addDays(to, 1))
      .order('closed_at', { ascending: false })
    if (error) throw new Error(error.message)
    type Raw = { id: string; event_name: string; event_date: string | null; closed_at: string; kits_snapshot: unknown; closer: { full_name: string | null; nickname: string | null } | null }
    const rows = ((data || []) as unknown as Raw[]).map(c => ({
      id: c.id,
      event: c.event_name,
      eventDate: day(c.event_date),
      closedAt: c.closed_at,
      closedBy: personName(c.closer),
      ...closureSummary(c.kits_snapshot),
    }))
    return capped(rows, `ปิดงาน ${from} ถึง ${to} ทั้งหมด ${rows.length} งาน`, args.limit ?? MAX_ROWS)
  },
})

const jobReadiness = defineTool({
  name: 'job_readiness',
  module: 'jobs',
  description: 'งานที่ยังไม่พร้อม (กติกาเดียวกับหน้าติดตามงาน) — คืนชื่อลูกค้า วันงาน สิ่งที่ยังขาด (ออกแบบ/จัดคน/จัดรถ/เวลาเริ่ม/กระเป๋า) และกระเป๋าที่จองไว้',
  schema: z.object({}),
  async run() {
    // ponytail: getTrackingSnapshot สร้าง service client เอง (ไม่รับ db) — ส่ง session เปล่าเพราะไม่มี cookie ใน /api/mcp
    const snap = await getTrackingSnapshot({ session: {} })
    const today = new Date()
    // เหมือน tracking-view: มุมมองปกติไม่รวมงานที่ผ่านไปแล้ว · ออกแบบตัดสินจากใบงานกราฟิก (ไม่มีใบ = ขาด)
    const base = snap.rows.filter(r => !isPast(r, today))
    const kitReadiness = kitReadinessByLead(snap.rows, snap.poolJobs, snap.kitBookings)
    const readyByJobs = designReadyByLead(snap.poolJobs)
    const kitName = new Map(snap.kits.map(k => [k.id, k.name]))

    const notReady = base
      .map(r => ({ lead: r, missing: getMissing(r, kitReadiness.get(r.id), readyByJobs.get(r.id) ?? false) }))
      .filter(x => x.missing.length > 0)
    const rows = notReady.map(({ lead, missing }) => ({
      leadId: lead.id,
      customer: lead.customer_name,
      eventDate: lead.event_date,
      location: lead.event_name,
      missing: missing.map(m => missingLabel(m, lead, snap.roleLabels)),
      kits: snap.kitBookings
        .filter(b => b.leadId === lead.id)
        .map(b => ({ name: kitName.get(b.kitId) ?? 'ไม่ระบุชื่อ', event: b.eventName, packed: b.packed })),
    }))
    return capped(rows, `งานที่ยังไม่พร้อม ${rows.length} จาก ${base.length} งาน`)
  },
})

/** tool ทั้งหมด เรียงตามตารางในสเปค */
export const MCP_TOOLS: McpTool[] = [
  stockSummary,
  searchItems,
  lowStock,
  kitStatus,
  shelfContents,
  upcomingEvents,
  eventDetail,
  eventClosures,
  jobReadiness,
]

/** tool ที่ผู้ใช้เรียกได้ตามโมดูล */
export const toolsFor = (modules: string[]) => MCP_TOOLS.filter(t => modules.includes(t.module))

/** ข้อความที่ส่งกลับ Claude: บรรทัดสรุป + JSON แบบกระชับ */
export function formatResult(r: ToolResult): string {
  return `${r.summary}\n${JSON.stringify({ rows: r.rows, total: r.total ?? r.rows.length })}`
}

/** ตัดแถวเพิ่มจนข้อความไม่เกิน maxBytes (M7) — บอกใน summary ว่าตัดเพราะยาวเกิน */
export function capBytes(r: ToolResult, maxBytes = MAX_RESULT_BYTES): ToolResult {
  const size = (x: ToolResult) => Buffer.byteLength(formatResult(x), 'utf8')
  if (size(r) <= maxBytes) return r
  const total = r.total ?? r.rows.length
  const make = (n: number): ToolResult => ({
    summary: `${r.summary} · ข้อมูลยาวเกินจึงแสดง ${n} จาก ${total} รายการ`,
    rows: r.rows.slice(0, n),
    total,
  })
  let lo = 0
  let hi = r.rows.length - 1
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (size(make(mid)) <= maxBytes) lo = mid
    else hi = mid - 1
  }
  return make(lo)
}
