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
import { CLAIM_STATUSES, CLAIM_TYPES, getCategoryLabel, getClaimStatusLabel } from '@/app/(authenticated)/costs/types'
import { isOpenClaim } from './finance/conditions'
import { claimsQuery, readAllRows, selectColumns, type ClaimsQueryFilters } from '@/app/(authenticated)/finance/claim-db'
import { JOB_EVENT_EMBED, LIST_COLUMNS, SUBMITTER_EMBED } from '@/app/(authenticated)/finance/list-data'
import { buildHealth, claimDate, claimEffective, isRevLead, leadAmount, type PLLead } from '@/app/(authenticated)/overview/pl/pl-lib'
import { loadSalesBoardData, type SalesLead } from '@/app/(authenticated)/sales-board/sales-data'
import { loadCommissionData } from '@/app/(authenticated)/sales-board/commission-data'
import {
  TH_MONTHS_LONG,
  buildCommission,
  commissionPeriod,
  defaultPeriodMonth,
  mergeTargets,
  summarizeFinance,
  thaiEventRange,
  type Row as CommissionRow,
  type WarningCode,
} from '@/app/(authenticated)/sales-board/commission-logic'

// tool ของ MCP (อ่านอย่างเดียว) — ประกาศเป็นข้อมูล ไม่ผูกไลบรารี MCP (สเปค docs/specs/mcp-server.md)
// app/api/mcp/route.ts ลงทะเบียนเฉพาะ tool ที่โมดูลของ token อนุญาต (toolsFor) · tool ที่ adminOnly ลงทะเบียนให้แอดมินเท่านั้น
// ห้ามเขียนข้อมูลในไฟล์นี้ — lib/mcp-tools.check.ts สแกนหา insert/update/delete/upsert/rpc
// แถวผลลัพธ์เก็บแค่ id + ชื่อ + ช่องที่คนถามถึง · ไม่คืน pin / ราคา / รูป

type Db = ReturnType<typeof createServiceClient>

export const MAX_ROWS = 100
/** เพดานขนาดข้อความผลลัพธ์ต่อ tool (M7) */
export const MAX_RESULT_BYTES = 64 * 1024

export type McpModule = 'stock' | 'events' | 'jobs' | 'finance' | 'checkin' | 'salesboard' | 'crm'

/** ผู้เรียก tool (มาจาก access token ที่ตรวจแล้ว — ไม่ใช่จาก args) · tool ที่ต้องกรองตามเจ้าของข้อมูลใช้ userId นี้เสมอ */
export interface ToolContext {
  userId: string
  role: string
  modules: string[]
}

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
  /** true = ลงทะเบียนให้แอดมินเท่านั้น (แม้ผู้ใช้อื่นมีโมดูลนี้) */
  adminOnly?: boolean
  /** ภาษาไทย บอกว่าคืนอะไร */
  description: string
  schema: z.ZodObject
  /** ตรวจ args ด้วย schema ก่อนรันเสมอ */
  run(db: Db, args: unknown, ctx: ToolContext): Promise<ToolResult>
}

/** ข้อผิดพลาดที่ตั้งใจบอกผู้ใช้ (เช่น ไม่พบชั้น) — route ส่งข้อความนี้กลับเป็น isError ตรงๆ */
export class ToolError extends Error {}

function defineTool<S extends z.ZodObject>(t: {
  name: string
  module: McpModule
  adminOnly?: boolean
  description: string
  schema: S
  run(db: Db, args: z.output<S>, ctx: ToolContext): Promise<ToolResult>
}): McpTool {
  return {
    name: t.name,
    module: t.module,
    ...(t.adminOnly ? { adminOnly: true } : {}),
    description: t.description,
    schema: t.schema,
    run: async (db, args, ctx) => t.run(db, t.schema.parse(args ?? {}), ctx),
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

// ── ใบเบิก (finance) ──────────────────────────────────────────────────────────
// กติกาการมองเห็นใช้ claimsQuery ตัวเดียวกับหน้ารายการ /finance: ไม่ใช่แอดมิน = .eq('submitted_by', userId) · ไม่รวมใบที่ซ่อน (deleted_at)
// ขอคอลัมน์จาก LIST_COLUMNS เท่านั้น — ไม่ขอ DOC_COLUMNS (ลิงก์ใบเสร็จ/ใบกำกับ/สลิป) และไม่ขอข้อมูลบัญชีธนาคาร

const CLAIM_STATUS_VALUES = CLAIM_STATUSES.map(s => s.value)
const CLAIM_TYPE_TH: Record<string, string> = Object.fromEntries(CLAIM_TYPES.map(t => [t.value, t.labelTh]))
const MONTH = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/)
const CLAIM_STATUS_DESC = 'กรองตามสถานะ: draft = แบบร่าง, pending = รออนุมัติ, approved = อนุมัติแล้ว, pending_month_end = รอจ่ายสิ้นเดือน, '
  + 'waiting_tax_invoice = รอใบกำกับภาษี, paid = ชำระเงินแล้ว, refund_confirmed = คืนเงินบริษัทแล้ว, rejected = ปฏิเสธ, cancelled = ยกเลิกแล้ว'

type RawClaim = {
  claim_number: string
  title: string
  claim_type: string
  category: string
  amount: number | string | null
  status: string
  submitted_by: string
  expense_date: string | null
  submitted_at: string | null
  approved_at: string | null
  paid_at: string | null
  reject_reason: string | null
  actual_spent_amount: number | null
  refund_amount: number | null
  pettycash_fund_id: string | null
  pettycash_closed_at: string | null
  filed_at?: string | null
  job_event: { event_name: string | null } | null
  submitter?: { full_name: string | null } | null
}
type ClaimsQ = ReturnType<typeof claimsQuery>

/** เดือน 'YYYY-MM' → ช่วงวันที่ใช้จ่าย (expense_date) ทั้งเดือน */
function expenseMonth(month: string): { expenseFrom: string; expenseTo: string } {
  const [y, m] = month.split('-').map(Number)
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
  return { expenseFrom: `${month}-01`, expenseTo: `${month}-${String(last).padStart(2, '0')}` }
}

/** อ่านใบเบิกทุกหน้า (เพดาน 1,000 แถวต่อคำขอของ PostgREST) ด้วย claimsQuery — viewer เป็นตัวกำหนดว่าเห็นของใคร */
async function readClaims(
  db: Db,
  viewer: { userId: string; role: string },
  filters: ClaimsQueryFilters,
  withSubmitter: boolean,
  refine: (q: ClaimsQ) => ClaimsQ = q => q,
): Promise<RawClaim[]> {
  const select = selectColumns([...LIST_COLUMNS, JOB_EVENT_EMBED, ...(withSubmitter ? [SUBMITTER_EMBED] : [])])
  const { rows, error } = await readAllRows<RawClaim>((from, to) => refine(claimsQuery(db, viewer, filters, select)).range(from, to))
  if (error) throw new Error(error.message)
  return rows
}

/** ป้ายหมวดภาษาไทย: finance_categories ก่อน แล้วค่อยใช้ค่าสำรองของ getCategoryLabel (กติกาเดียวกับหน้าใบเบิก) */
async function categoryLabeler(db: Db): Promise<(c: string) => string> {
  const { data } = await db.from('finance_categories').select('value, label_th')
  const map = new Map(((data || []) as { value: string; label_th: string | null }[]).map(c => [c.value, c.label_th]))
  return c => map.get(c) || getCategoryLabel(c)
}

const baht = (n: number) => `฿${n.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
const claimAmount = (c: RawClaim) => Number(c.amount) || 0

function claimRow(c: RawClaim, category: (c: string) => string) {
  return {
    claim_number: c.claim_number,
    title: c.title,
    claim_type: CLAIM_TYPE_TH[c.claim_type] ?? c.claim_type,
    category: category(c.category),
    amount: claimAmount(c),
    status: getClaimStatusLabel(c.status),
    expense_date: day(c.expense_date),
    submitted_at: bkkDateTime(c.submitted_at),
    approved_at: bkkDateTime(c.approved_at),
    paid_at: bkkDateTime(c.paid_at),
    job_event: c.job_event?.event_name ?? null,
    reject_reason: c.reject_reason,
    actual_spent_amount: c.actual_spent_amount,
    refund_amount: c.refund_amount,
    docs_filed: !!c.filed_at,
  }
}

const myClaims = defineTool({
  name: 'my_claims',
  module: 'finance',
  description: 'ใบเบิกของผู้ใช้เอง (ค่าเริ่มต้น = ใบที่ยังไม่จบ รวมเงินทดลองจ่ายที่ยังไม่เคลียร์และวงเงินสดย่อยที่ยังไม่ปิด) — คืนเลขใบ ชื่อ ประเภท หมวด ยอด สถานะ '
    + 'วันที่ใช้จ่าย วันส่ง/อนุมัติ/จ่าย งานที่ผูก เหตุผลที่ส่งกลับ ยอดใช้จริง/ยอดคืน (ทดลองจ่าย) และเข้าแฟ้มเอกสารแล้วหรือยัง',
  schema: z.object({
    status: z.enum(CLAIM_STATUS_VALUES).optional().describe(CLAIM_STATUS_DESC),
    month: MONTH.optional().describe('เดือนที่ใช้จ่าย รูปแบบ YYYY-MM ค.ศ. เช่น 2026-10'),
    include_closed: z.boolean().optional().describe('true = รวมใบที่จบแล้ว (จ่ายแล้ว/ยกเลิก/คืนเงินแล้ว) — ค่าเริ่มต้นแสดงเฉพาะใบที่ยังไม่จบ'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('จำนวนแถวสูงสุด 1–100 (ค่าเริ่มต้น 100)'),
  }),
  async run(db, args, ctx) {
    if (!ctx.userId) throw new ToolError('ไม่พบผู้ใช้ของการเชื่อมต่อนี้')
    const filters: ClaimsQueryFilters = { ...(args.status ? { status: args.status } : {}), ...(args.month ? expenseMonth(args.month) : {}) }
    // "ของฉัน" เสมอ แม้ผู้เรียกเป็นแอดมิน: viewer role staff → claimsQuery กรอง submitted_by และกรองซ้ำตรงนี้อีกชั้น
    const [rows, category] = await Promise.all([
      readClaims(db, { userId: ctx.userId, role: 'staff' }, filters, false, q => q.eq('submitted_by', ctx.userId)),
      categoryLabeler(db),
    ])
    const openOnly = !args.status && !args.include_closed
    const list = (openOnly ? rows.filter(isOpenClaim) : rows).filter(c => c.submitted_by === ctx.userId)
    const total = list.reduce((s, c) => s + claimAmount(c), 0)
    const what = [
      openOnly ? 'ที่ยังไม่จบ' : args.status ? `สถานะ${getClaimStatusLabel(args.status)}` : 'ทั้งหมด',
      args.month && `เดือน ${args.month}`,
    ].filter(Boolean).join(' ')
    return capped(list.map(c => claimRow(c, category)), `ใบเบิกของคุณ${what} ${list.length} ใบ รวม ${baht(total)}`, args.limit ?? MAX_ROWS)
  },
})

const allClaims = defineTool({
  name: 'all_claims',
  module: 'finance',
  adminOnly: true,
  description: 'ใบเบิกของทุกคน (แอดมินเท่านั้น · ไม่รวมใบที่ซ่อน) กรองตามสถานะ / เดือน / ชื่อผู้ส่ง / หมวด — คืนคอลัมน์เดียวกับ my_claims พร้อมชื่อผู้ส่ง '
    + 'และบรรทัดสรุปยอดรวมแยกตามสถานะ (จำนวนใบ + ยอดเงิน)',
  schema: z.object({
    status: z.enum(CLAIM_STATUS_VALUES).optional().describe(CLAIM_STATUS_DESC),
    month: MONTH.optional().describe('เดือนที่ใช้จ่าย รูปแบบ YYYY-MM ค.ศ. เช่น 2026-10'),
    submitter: z.string().max(100).optional().describe('ชื่อหรือชื่อเล่นของผู้ส่ง (ค้นแบบบางส่วน)'),
    category: z.string().max(50).optional().describe('รหัสหมวดค่าใช้จ่าย เช่น travel = ค่าเดินทาง, food = อาหารและเครื่องดื่ม, staff = ค่าสตาฟ'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('จำนวนแถวสูงสุด 1–100 (ค่าเริ่มต้น 100)'),
  }),
  async run(db, args, ctx) {
    if (ctx.role !== 'admin') throw new ToolError('ไม่มีสิทธิ์ใช้ all_claims — เฉพาะแอดมินเท่านั้น')
    let ids: string[] | null = null
    const who = args.submitter ? orSafe(args.submitter) : ''
    if (who) {
      const { data } = await db.from('profiles').select('id').or(`full_name.ilike.%${who}%,nickname.ilike.%${who}%`)
      ids = ((data || []) as { id: string }[]).map(p => p.id)
      if (ids.length === 0) return { summary: `ไม่พบผู้ส่งชื่อ "${who}"`, rows: [] }
    }
    const submitterIds = ids
    const filters: ClaimsQueryFilters = {
      ...(args.status ? { status: args.status } : {}),
      ...(args.month ? expenseMonth(args.month) : {}),
      ...(args.category?.trim() ? { category: args.category.trim() } : {}),
    }
    const [rows, category] = await Promise.all([
      readClaims(db, { userId: ctx.userId, role: 'admin' }, filters, true, submitterIds ? q => q.in('submitted_by', submitterIds) : undefined),
      categoryLabeler(db),
    ])
    // ยอดรวมตามสถานะของทุกใบที่ตรงเงื่อนไข (ก่อนตัดแถว) เรียงตามลำดับสถานะของใบเบิก
    const byStatus = new Map<string, { count: number; amount: number }>()
    for (const c of rows) {
      const t = byStatus.get(c.status) ?? { count: 0, amount: 0 }
      byStatus.set(c.status, { count: t.count + 1, amount: t.amount + claimAmount(c) })
    }
    const order = (s: string) => {
      const i = CLAIM_STATUS_VALUES.findIndex(v => v === s)
      return i < 0 ? CLAIM_STATUS_VALUES.length : i
    }
    const parts = [...byStatus]
      .sort((a, b) => order(a[0]) - order(b[0]))
      .map(([s, t]) => `${getClaimStatusLabel(s)} ${t.count} ใบ ${baht(t.amount)}`)
    const total = rows.reduce((s, c) => s + claimAmount(c), 0)
    const cat = args.category?.trim()
    const what = [args.month && `เดือน ${args.month}`, who && `ผู้ส่ง "${who}"`, cat && `หมวด ${category(cat)}`].filter(Boolean).join(' ')
    const summary = [`ใบเบิก${what ? ` ${what}` : 'ทั้งหมด'} ${rows.length} ใบ รวม ${baht(total)}`, ...parts].join(' · ')
    return capped(
      rows.map(c => ({ submitter: c.submitter?.full_name ?? 'ไม่ทราบชื่อ', ...claimRow(c, category) })),
      summary,
      args.limit ?? MAX_ROWS,
    )
  },
})

// ── เช็คอิน (checkin) ─────────────────────────────────────────────────────────
// ขอเฉพาะคอลัมน์ที่ใช้ — ไม่ขอพิกัด (latitude/longitude) และรูปถ่าย (photo_url/checkout_photo_url)
// วันที่/เวลาเป็นเวลาไทย (UTC+7) ขอบวันเหมือน getCheckinReportData (00:00:00 – 23:59:59 ของวันไทย)

/** ป้ายประเภทเช็คอิน — ชุดเดียวกับ TYPE_LABELS ของหน้าประวัติเช็คอิน (check-in/history/history-view.tsx) */
const CHECK_TYPE_TH: Record<string, string> = { office: 'เข้าออฟฟิศ', onsite: 'ไปหน้างาน', remote: 'WFH / นอกสถานที่' }
const CHECKIN_SELECT = 'id, check_type, checked_in_at, checked_out_at, note, event_id, duties, province, district, out_of_province, events:event_id(name)'
/** แท็กอ้างอิงภายในที่ระบบเติมในหมายเหตุ (ไม่ใช่ข้อความของผู้ใช้) */
const REF_TAG = /\[ref:(closure|jce):[0-9a-fA-F-]{36}\]/g
const MAX_RANGE_DAYS = 366

type RawCheckin = {
  id: string
  check_type: string
  checked_in_at: string
  checked_out_at: string | null
  note: string | null
  duties: string[] | null
  province: string | null
  district: string | null
  out_of_province: boolean | null
  events: { name: string | null } | null
}

const BKK_MS = 7 * 60 * 60 * 1000
/** ISO → 'YYYY-MM-DDTHH:mm…' ตามเวลาไทย */
const bkk = (iso: string) => new Date(Date.parse(iso) + BKK_MS).toISOString()
/** ISO → 'YYYY-MM-DD HH:mm' เวลาไทย (ว่าง/ไม่ถูกต้อง = null) */
function bkkDateTime(iso: string | null | undefined): string | null {
  if (!iso || Number.isNaN(Date.parse(iso))) return null
  const t = bkk(iso)
  return `${t.slice(0, 10)} ${t.slice(11, 16)}`
}
const bkkToday = () => bkk(new Date().toISOString()).slice(0, 10)

/** ตรวจช่วงวันที่ (YYYY-MM-DD วันไทย) แล้วคืนขอบเวลา UTC ของ checked_in_at */
function bkkRange(from: string, to: string): { startIso: string; endIso: string } {
  const start = new Date(`${from}T00:00:00+07:00`)
  const end = new Date(`${to}T23:59:59+07:00`)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new ToolError('วันที่ไม่ถูกต้อง ใช้รูปแบบ YYYY-MM-DD ค.ศ.')
  if (from > to) throw new ToolError('วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด')
  if (end.getTime() - start.getTime() > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) throw new ToolError(`ช่วงวันที่ยาวเกิน ${MAX_RANGE_DAYS} วัน`)
  return { startIso: start.toISOString(), endIso: end.toISOString() }
}

/** รหัสหน้าที่หน้างาน → ชื่อไทย (salary_duties ทั้งที่เปิดและปิดใช้แล้ว — เช็คอินเก่าอาจใช้หน้าที่ที่ปิดไปแล้ว) */
async function dutyLabels(db: Db): Promise<Map<string, string>> {
  const { data } = await db.from('salary_duties').select('code, name_th')
  return new Map(((data || []) as { code: string; name_th: string | null }[]).map(d => [d.code, d.name_th || d.code]))
}

function checkinRow(r: RawCheckin, duties: Map<string, string>) {
  const inAt = bkk(r.checked_in_at)
  const ms = r.checked_out_at ? Date.parse(r.checked_out_at) - Date.parse(r.checked_in_at) : NaN
  return {
    date: inAt.slice(0, 10),
    checked_in: inAt.slice(11, 16),
    checked_out: r.checked_out_at ? bkk(r.checked_out_at).slice(11, 16) : null,
    hours: Number.isFinite(ms) ? Math.round(ms / 360_000) / 10 : null,
    type: CHECK_TYPE_TH[r.check_type] ?? r.check_type,
    event: r.events?.name ?? null,
    duties: (r.duties || []).map(c => duties.get(c) ?? c),
    province: r.province,
    district: r.district,
    out_of_province: !!r.out_of_province,
    note: r.note?.replace(REF_TAG, '').trim() || null,
  }
}

const myCheckins = defineTool({
  name: 'my_checkins',
  module: 'checkin',
  description: 'เช็คอินของผู้ใช้เองในช่วงวันที่ (ค่าเริ่มต้น = เดือนนี้) — คืนวันที่ เวลาเข้า-ออก จำนวนชั่วโมง ประเภท (เข้าออฟฟิศ / WFH นอกสถานที่ / ไปหน้างาน) '
    + 'งานที่ไป หน้าที่หน้างาน จังหวัด/อำเภอ ต่างจังหวัดหรือไม่ และหมายเหตุ',
  schema: z.object({
    from: DATE.optional().describe('วันที่เริ่ม รูปแบบ YYYY-MM-DD ค.ศ. (ค่าเริ่มต้น วันที่ 1 ของเดือนนี้)'),
    to: DATE.optional().describe('วันที่สิ้นสุด รูปแบบ YYYY-MM-DD ค.ศ. (ค่าเริ่มต้น วันสุดท้ายของเดือนนี้)'),
  }),
  async run(db, args, ctx) {
    if (!ctx.userId) throw new ToolError('ไม่พบผู้ใช้ของการเชื่อมต่อนี้')
    const month = expenseMonth(bkkToday().slice(0, 7))
    const from = args.from ?? month.expenseFrom
    const to = args.to ?? month.expenseTo
    const { startIso, endIso } = bkkRange(from, to)
    const [{ data, error }, duties] = await Promise.all([
      db
        .from('staff_checkins')
        .select(CHECKIN_SELECT)
        .eq('user_id', ctx.userId)
        .gte('checked_in_at', startIso)
        .lte('checked_in_at', endIso)
        .order('checked_in_at', { ascending: true }),
      dutyLabels(db),
    ])
    if (error) throw new Error(error.message)
    const rows = ((data || []) as unknown as RawCheckin[]).map(r => checkinRow(r, duties))
    const hours = Math.round(rows.reduce((s, r) => s + (r.hours ?? 0), 0) * 10) / 10
    const open = rows.filter(r => r.checked_out === null).length
    return capped(rows, `เช็คอินของคุณ ${from} ถึง ${to} ${rows.length} ครั้ง รวม ${hours} ชั่วโมง${open ? ` · ยังไม่เช็คเอาท์ ${open} ครั้ง` : ''}`)
  },
})

const teamCheckins = defineTool({
  name: 'team_checkins',
  module: 'checkin',
  adminOnly: true,
  description: 'เช็คอินของทุกคนในช่วงวันที่ (แอดมินเท่านั้น · ค่าเริ่มต้น = วันนี้) กรองตามชื่อคนหรือชื่องาน — คืนชื่อ วันที่ เวลาเข้า-ออก ชั่วโมง ประเภท '
    + 'งาน หน้าที่หน้างาน จังหวัด/อำเภอ หมายเหตุ และบรรทัดสรุปจำนวนคนที่เช็คอินกับจำนวนที่ยังไม่เช็คเอาท์',
  schema: z.object({
    from: DATE.optional().describe('วันที่เริ่ม รูปแบบ YYYY-MM-DD ค.ศ. (ค่าเริ่มต้น วันนี้)'),
    to: DATE.optional().describe('วันที่สิ้นสุด รูปแบบ YYYY-MM-DD ค.ศ. (ค่าเริ่มต้น เท่ากับวันที่เริ่ม)'),
    user: z.string().max(100).optional().describe('ชื่อหรือชื่อเล่นของพนักงาน (ค้นแบบบางส่วน)'),
    event: z.string().max(200).optional().describe('ชื่องานอีเวนต์ (ค้นแบบบางส่วน)'),
  }),
  async run(db, args, ctx) {
    if (ctx.role !== 'admin') throw new ToolError('ไม่มีสิทธิ์ใช้ team_checkins — เฉพาะแอดมินเท่านั้น')
    const from = args.from ?? bkkToday()
    const to = args.to ?? from
    const { startIso, endIso } = bkkRange(from, to)

    const who = args.user ? orSafe(args.user) : ''
    let userIds: string[] | null = null
    if (who) {
      const { data } = await db.from('profiles').select('id').or(`full_name.ilike.%${who}%,nickname.ilike.%${who}%`)
      userIds = ((data || []) as { id: string }[]).map(p => p.id)
      if (userIds.length === 0) return { summary: `ไม่พบพนักงานชื่อ "${who}"`, rows: [] }
    }
    const eventName = args.event?.trim() ?? ''
    let eventIds: string[] | null = null
    if (eventName) {
      const { data } = await db.from('events').select('id').ilike('name', `%${likeEscape(eventName)}%`)
      eventIds = ((data || []) as { id: string }[]).map(e => e.id)
      if (eventIds.length === 0) return { summary: `ไม่พบอีเวนต์ชื่อ "${eventName}"`, rows: [] }
    }

    let query = db
      .from('staff_checkins')
      .select(`user_id, ${CHECKIN_SELECT}, profiles:user_id(full_name, nickname)`)
      .gte('checked_in_at', startIso)
      .lte('checked_in_at', endIso)
    if (userIds) query = query.in('user_id', userIds)
    if (eventIds) query = query.in('event_id', eventIds)
    const [{ data, error }, duties] = await Promise.all([query.order('checked_in_at', { ascending: true }), dutyLabels(db)])
    if (error) throw new Error(error.message)

    type RawTeam = RawCheckin & { user_id: string; profiles: { full_name: string | null; nickname: string | null } | null }
    const raw = (data || []) as unknown as RawTeam[]
    const rows = raw.map(r => ({ name: r.profiles?.nickname || r.profiles?.full_name || 'ไม่ทราบชื่อ', ...checkinRow(r, duties) }))
    const people = new Set(raw.map(r => r.user_id)).size
    const open = raw.filter(r => !r.checked_out_at).length
    const range = from === to ? from : `${from} ถึง ${to}`
    return capped(rows, `เช็คอิน ${range} ${rows.length} รายการ จาก ${people} คน · ยังไม่เช็คเอาท์ ${open} รายการ`)
  },
})

// ── ยอดขาย (salesboard) ─────────────────────────────────────────────────────
// ข้อมูลจาก loadSalesBoardData ตัวเดียวกับหน้า /sales-board · ตัวเลขผ่าน helper ล้วนของ pl-lib (buildHealth, isRevLead, leadAmount,
// claimEffective, claimDate) ตามกติกาในคำอธิบาย INFO ของ sales-board-view.tsx: ฝั่งลีดนับตามเดือนที่สร้างลีด (created_at)
// ยกเว้น "ดีลที่ปิดได้" ที่นับตามวันปิดดีลจริง (closed_at = status_change → accepted/success ครั้งแรก เวลาไทย)

const inMonth = (d: string | null | undefined, m: string) => !!d && d.slice(0, 7) === m
const shiftMonthUtc = (m: string, delta: number) => {
  const [y, mo] = m.split('-').map(Number)
  return new Date(Date.UTC(y, mo - 1 + delta, 1)).toISOString().slice(0, 7)
}
const thaiMonth = (m: string) => {
  const [y, mo] = m.split('-').map(Number)
  return `${TH_MONTHS_LONG[mo - 1]} ${y + 543}`
}
const round2 = (n: number) => Math.round(n * 100) / 100
const pctOf = (value: number, target: number | null) => (target && target > 0 ? Math.round((value / target) * 100) : null)

const WORK_TYPE_TH: Record<string, string> = { sale: 'ขาย', event: 'อีเวนต์', gp: 'GP' }
/** ชื่อแพ็กเกจสำรอง — ชุดเดียวกับ PKG_LABEL/pkgLabel ของ sales-board-view.tsx (view import ไม่ได้) */
const PKG_FALLBACK: Record<string, string> = { basic: 'Basic', standard: 'Standard', premium: 'Premium', premium_video: 'Premium Video', custom: 'Custom' }
const pkgLabel = (p: string | null, labels: Record<string, string>) =>
  p ? labels[p] || PKG_FALLBACK[p] || p.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) : 'ไม่ระบุระบบ'
/** กรวยขาย (สะสม) — ชุดเดียวกับ FUNNEL_STAGES ของ sales-board-view.tsx · keys null = ทุกสถานะ */
const FUNNEL: { keys: string[] | null; label: string }[] = [
  { keys: null, label: 'ลูกค้าใหม่' },
  { keys: ['quotation_sent', 'accepted', 'success'], label: 'ส่งใบเสนอราคา' },
  { keys: ['accepted', 'success'], label: 'ปิดการขาย' },
]
const METRIC_TH = {
  sales: 'ยอดขาย', deals: 'ดีลที่ปิดได้', revenue: 'เก็บเงินแล้ว', collectible: 'ยอดที่ต้องเก็บ', inflow: 'เงินเข้าเดือนนี้', expense: 'รายจ่าย',
} as const
type MetricKey = keyof typeof METRIC_TH

type SalesData = Awaited<ReturnType<typeof loadSalesBoardData>>
const createdDate = (l: PLLead) => l.created_at
/** ดีลที่นับยอดขาย = สถานะตอบรับ/สำเร็จ มูลค่า > 0 */
const isSale = (l: SalesLead) => isRevLead(l) && leadAmount(l) > 0

/** ค่าการ์ดของเดือน m — สูตรเดียวกับ useMemo cur/values/prevValues ของ sales-board-view.tsx */
function salesValues(d: SalesData, m: string): Record<MetricKey, number> {
  const h = buildHealth(d.leads, d.claims, d.installments, d.jobEvents, d.costItems, x => inMonth(x, m), createdDate)
  const inflow = d.installments
    .filter(i => i.is_paid && inMonth(i.paid_date, m) && Number(i.amount) > 0)
    .reduce((s, i) => s + Number(i.amount || 0), 0)
  const expense = d.claims
    .filter(c => c.status !== 'rejected' && c.status !== 'cancelled' && inMonth(claimDate(c), m) && claimEffective(c) > 0)
    .reduce((s, c) => s + claimEffective(c), 0)
  const deals = d.leads.filter(l => isSale(l) && inMonth(l.closed_at || l.created_at, m)).length
  return { sales: h.bookedGross, deals, revenue: h.cashCollected, collectible: h.collectible, inflow, expense }
}

const salesSummary = defineTool({
  name: 'sales_summary',
  module: 'salesboard',
  description: 'สรุปยอดขายรายเดือนกติกาเดียวกับหน้า Sales Board (ค่าเริ่มต้น = เดือนนี้) — ยอดขาย ดีลที่ปิดได้ เก็บเงินแล้ว/ยอดที่ต้องเก็บ เงินเข้าเดือนนี้ รายจ่าย '
    + 'เทียบเดือนก่อนและเป้า, แยกตามประเภทงาน (ขาย/อีเวนต์/GP), รายคนขาย (ยอด + จำนวนดีล — ดีลที่มีคนขาย 2 คนนับให้ทั้งสองคน ผลรวมรายคนจึงอาจเกินยอดรวม), '
    + 'กรวยขาย และจำนวนดีลแยกตามระบบที่ใช้บริการ · ยอดฝั่งลีดนับตามเดือนที่สร้างลีด ยกเว้นดีลที่ปิดได้นับตามวันปิดดีลจริง',
  schema: z.object({
    month: MONTH.optional().describe('เดือน รูปแบบ YYYY-MM ค.ศ. เช่น 2026-10 (ค่าเริ่มต้น เดือนนี้ตามเวลาไทย)'),
  }),
  async run(db, args) {
    const month = args.month ?? bkkToday().slice(0, 7)
    const prev = shiftMonthUtc(month, -1)
    const d = await loadSalesBoardData(db)
    const cur = salesValues(d, month)
    const before = salesValues(d, prev)
    const stored = d.targetStore[month] || {}
    const storedTarget = (k: string) => (Number(stored[k]) > 0 ? Number(stored[k]) : null)
    // เป้าเหมือนการ์ดบนหน้า: เก็บเงินแล้วเทียบยอดที่ต้องเก็บ · รายจ่ายเทียบยอดขาย (ฐานค่าเริ่มต้นของหน้า) · ที่เหลืออ่านจาก sales_board_targets
    const targetOf: Record<MetricKey, number | null> = {
      sales: storedTarget('sales'), deals: storedTarget('deals'), revenue: cur.collectible, collectible: null,
      inflow: storedTarget('inflow'), expense: cur.sales,
    }
    const rows: Record<string, unknown>[] = (Object.keys(METRIC_TH) as MetricKey[]).map(k => ({
      section: 'ตัวเลขหลัก', key: k, label: METRIC_TH[k], value: round2(cur[k]), prev_month: round2(before[k]),
      target: targetOf[k] === null ? null : round2(targetOf[k]), pct_of_target: pctOf(cur[k], targetOf[k]),
    }))

    const monthSales = d.leads.filter(l => isSale(l) && inMonth(createdDate(l), month))
    // ประเภทงาน — สูตรเดียวกับ workTypeStats
    const wt: Record<string, { amount: number; deals: number }> = { sale: { amount: 0, deals: 0 }, event: { amount: 0, deals: 0 }, gp: { amount: 0, deals: 0 } }
    const unspec = { amount: 0, deals: 0 }
    for (const l of monthSales) {
      const g = l.work_type && wt[l.work_type] ? wt[l.work_type] : unspec
      g.amount += leadAmount(l)
      g.deals++
    }
    for (const [k, g] of Object.entries(wt)) {
      const target = storedTarget(`wt_${k}`)
      rows.push({ section: 'ประเภทงาน', key: k, label: WORK_TYPE_TH[k], amount: round2(g.amount), deals: g.deals, target, pct_of_target: pctOf(g.amount, target) })
    }
    if (unspec.deals) rows.push({ section: 'ประเภทงาน', key: null, label: 'ไม่ระบุประเภทงาน', amount: round2(unspec.amount), deals: unspec.deals, target: null, pct_of_target: null })

    // รายคนขาย — ลีดที่มีหลายคนขายนับเต็มให้ทุกคน
    const bySales = new Map<string, { amount: number; deals: number }>()
    for (const l of monthSales) {
      const ids = (l.assigned_sales || []).filter(Boolean)
      for (const id of ids.length ? ids : ['']) {
        const g = bySales.get(id) ?? { amount: 0, deals: 0 }
        g.amount += leadAmount(l)
        g.deals++
        bySales.set(id, g)
      }
    }
    const salesIds = [...bySales.keys()].filter(Boolean)
    const { data: people } = salesIds.length
      ? await db.from('profiles').select('id, full_name, nickname').in('id', salesIds)
      : { data: [] }
    const nameOf = new Map(((people || []) as { id: string; full_name: string | null; nickname: string | null }[]).map(p => [p.id, personName(p)]))
    for (const [id, g] of [...bySales].sort((a, b) => b[1].amount - a[1].amount)) {
      rows.push({ section: 'คนขาย', id: id || null, name: id ? nameOf.get(id) ?? 'ไม่ทราบชื่อ' : 'ไม่ระบุคนขาย', amount: round2(g.amount), deals: g.deals })
    }

    // กรวยขาย — ลีดที่สร้างในเดือนนี้ทุกสถานะ นับสะสมตามขั้น
    const monthLeads = d.leads.filter(l => inMonth(createdDate(l), month))
    const st = (l: SalesLead) => (l.status || '').toLowerCase()
    for (const f of FUNNEL) rows.push({ section: 'กรวยขาย', label: f.label, count: monthLeads.filter(l => f.keys === null || f.keys.includes(st(l))).length })
    rows.push({ section: 'กรวยขาย', label: 'เสียดีล', count: monthLeads.filter(l => st(l) === 'rejected' || st(l) === 'cancelled').length })

    // ระบบที่ใช้บริการ — ดีลชุดเดียวกับยอดขาย: เดือนนี้ + สะสมทุกเดือน (แสดงเฉพาะที่ขายได้เดือนนี้)
    const products = new Map<string, { name: string; month: number; total: number }>()
    for (const l of d.leads) {
      if (!isSale(l)) continue
      const key = l.package_name || ''
      const g = products.get(key) ?? { name: pkgLabel(key, d.packageLabels), month: 0, total: 0 }
      g.total++
      if (inMonth(createdDate(l), month)) g.month++
      products.set(key, g)
    }
    for (const g of [...products.values()].filter(p => p.month > 0).sort((a, b) => b.month - a.month || b.total - a.total)) {
      rows.push({ section: 'ระบบที่ใช้บริการ', name: g.name, deals: g.month, deals_all_time: g.total })
    }

    const t = targetOf.sales
    const summary = `เดือน ${thaiMonth(month)} ยอดขาย ${baht(round2(cur.sales))} (${t ? `เป้า ${baht(t)}, ${pctOf(cur.sales, t)}%` : 'ยังไม่ตั้งเป้า'}) · ดีลปิด ${cur.deals}`
    return capped(rows, summary)
  },
})

/** หัวข้อคำเตือน — ชุดเดียวกับ WARNING_LABEL / WARNING_ORDER ของ commission-view.tsx (view import ไม่ได้) */
const COMMISSION_WARNING_TH: Record<WarningCode, string> = {
  no_work_type: 'ยังไม่ระบุประเภทงาน (ไม่ถูกนับ)',
  no_event_date: 'งานอีเวนต์ที่ไม่มีวันจัดงาน',
  end_before_start: 'วันสิ้นสุดงานอยู่ก่อนวันเริ่มงาน',
  no_quotation_ref: 'ไม่มีเลขใบเสนอราคา',
  dup_quotation_ref: 'เลขใบเสนอราคาซ้ำกัน',
  possible_duplicate: 'อาจเป็นงานเดียวกันซ้ำ (ลูกค้า + วันจัดงานเดียวกัน)',
  no_history: 'ไม่มีประวัติเปลี่ยนสถานะ (ใช้วันสร้างการ์ดแทน)',
  cutoff_day: 'ล็อคคิววันที่ 25 (ถูกนับสองงวด)',
}
const COMMISSION_WARNING_ORDER: WarningCode[] = ['no_work_type', 'cutoff_day', 'possible_duplicate', 'dup_quotation_ref', 'end_before_start', 'no_event_date', 'no_quotation_ref', 'no_history']

const commissionSummary = defineTool({
  name: 'commission_summary',
  module: 'salesboard',
  description: 'สรุปค่าคอมแอดมินของงวด 25 → 25 กติกาเดียวกับหน้า /sales-board/commission (ค่าเริ่มต้น = งวดที่ครอบวันนี้) — เป้าและยอดจริงของตู้ (จำนวนตู้) และงานอีเวนต์, '
    + 'รายการการ์ดที่นับ (ลูกค้า วันล็อคคิว จำนวนตู้หรือวันจัดงาน เลขใบเสนอราคา สถานะ), รายการที่ต้องตรวจสอบแยกตามหัวข้อ และสรุปการเงินของงวด (เฉพาะแอดมิน)',
  schema: z.object({
    month: MONTH.optional().describe('เดือนของงวด รูปแบบ YYYY-MM ค.ศ. — งวด 2026-10 = 25 ก.ย. ถึง 25 ต.ค. 2026 (ค่าเริ่มต้น งวดที่ครอบวันนี้)'),
    from: DATE.optional().describe('ปรับวันเริ่มเอง รูปแบบ YYYY-MM-DD ค.ศ. (ค่าเริ่มต้น วันเริ่มของงวด)'),
    to: DATE.optional().describe('ปรับวันสิ้นสุดเอง รูปแบบ YYYY-MM-DD ค.ศ. (ค่าเริ่มต้น วันสิ้นสุดของงวด)'),
  }),
  async run(db, args, ctx) {
    const isAdmin = ctx.role === 'admin'
    const d = await loadCommissionData(isAdmin, db)
    const month = args.month ?? defaultPeriodMonth(d.today)
    const period = commissionPeriod(month)
    if (!period) throw new ToolError('เดือนไม่ถูกต้อง ใช้รูปแบบ YYYY-MM ค.ศ.')
    const from = args.from ?? period.from
    const to = args.to ?? period.to
    if (from > to) throw new ToolError('วันที่เริ่มต้องไม่หลังวันที่สิ้นสุด')

    // เป้าผูกกับเดือนของงวดแม้ปรับช่วงเอง (เหมือนหน้า) · mergeTargets scope commission คัดเฉพาะ cm_* ที่ > 0
    const cm = mergeTargets({}, d.initialTargets[month] || {}, 'commission')
    const targets = { booths: cm.cm_booths ?? null, events: cm.cm_events ?? null }
    const result = buildCommission({ leads: d.leads, lockDates: new Map(Object.entries(d.lockDates)), from, to })

    // ชื่อลูกค้าใช้ customer_name เสมอ — Row.customer ของ buildCommission เป็นชื่อ LINE ซึ่งห้ามส่งออก
    const nameOf = new Map(d.leads.map(l => [l.id, (l.customer_name || '').trim() || '(ไม่ระบุชื่อ)']))
    const customer = (id: string) => nameOf.get(id) ?? '(ไม่ระบุชื่อ)'
    const statusLabel = (s: string) => d.statusLabels[s.toLowerCase()] || s || '—'

    const rows: Record<string, unknown>[] = [{
      section: 'สรุป', period_month: month, from, to, custom_range: from !== period.from || to !== period.to,
      booth_units: result.boothUnits, booth_cards: result.booths.length, booth_target: targets.booths,
      event_count: result.eventCount, event_target: targets.events, unclassified: result.unclassified.length,
      ...(d.unitCountAvailable ? {} : { note: 'ยังไม่มีช่องจำนวนตู้ในฐานข้อมูล — ทุกการ์ดนับเป็น 1 ตู้' }),
    }]

    const groups = new Map<WarningCode, { lead_id: string; customer: string; detail: string }[]>()
    for (const w of result.warnings) groups.set(w.code, [...(groups.get(w.code) || []), { lead_id: w.leadId, customer: customer(w.leadId), detail: w.detail }])
    for (const code of COMMISSION_WARNING_ORDER) {
      const items = groups.get(code)
      if (items) rows.push({ section: 'ต้องตรวจสอบ', code, label: COMMISSION_WARNING_TH[code], count: items.length, items })
    }

    if (isAdmin && d.finance) {
      const f = summarizeFinance(result, d.finance)
      rows.push({ section: 'การเงิน', booths: f.booths, events: f.events, total: f.total, unclassified: f.unclassified, no_price: f.noPrice })
    }

    const base = (r: CommissionRow) => ({ no: r.no, lead_id: r.leadId, customer: customer(r.leadId), lock_date: r.lockDate })
    for (const r of result.booths) rows.push({ section: 'ตู้', ...base(r), units: r.units, quotation_ref: r.quotationRef, status: statusLabel(r.status) })
    for (const r of result.events) {
      rows.push({
        section: 'อีเวนต์', ...base(r), event_date: r.eventDate, event_end_date: r.eventEndDate,
        event_range: thaiEventRange(r.eventDate, r.eventEndDate), quotation_ref: r.quotationRef, status: statusLabel(r.status),
      })
    }

    const goal = (n: number, t: number | null) => (t ? `${n}/${t}` : `${n}`)
    const summary = `งวด ${thaiMonth(month)} (${from} ถึง ${to}) ขายตู้ ${goal(result.boothUnits, targets.booths)} ตู้ · อีเวนต์ ${goal(result.eventCount, targets.events)} งาน`
      + ` · ต้องตรวจสอบ ${result.warnings.length} รายการ`
    return capped(rows, summary)
  },
})

// ── CRM (crm) ─────────────────────────────────────────────────────────────────
// ทุกคนที่มีโมดูล CRM เห็นทุกลีด (เหมือนหน้า CRM) · ไม่ขอ/ไม่ส่ง customer_line และ notes · เบอร์โทรส่งแค่ 4 ตัวท้าย (phone_last4)

const LEAD_COLUMNS = 'id, status, customer_name, customer_phone, customer_type, work_type, unit_count, lead_source, event_date, event_end_date, '
  + 'event_time, event_end_time, event_location, package_name, quoted_price, confirmed_price, deposit, vat_mode, assigned_sales, is_returning, quotation_ref, created_at'

type RawLead = {
  id: string
  status: string | null
  customer_name: string | null
  customer_phone: string | null
  work_type: string | null
  event_date: string | null
  event_end_date: string | null
  event_time: string | null
  event_location: string | null
  package_name: string | null
  quoted_price: number | null
  confirmed_price: number | null
  deposit: number | null
  assigned_sales: string[] | null
  is_returning: boolean | null
  created_at: string
}

/** '081-234-5678' → '***-***-5678' · ตัวเลขน้อยกว่า 4 หลัก/ไม่มี = null */
export function phoneLast4(phone: string | null | undefined): string | null {
  const digits = (phone || '').replace(/\D/g, '')
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : null
}

/** ป้ายไทยของสถานะ (kanban_status) และแพ็กเกจ (package) จาก crm_settings */
async function crmLabels(db: Db): Promise<{ status: (s: string | null) => string; pkg: (p: string | null) => string | null; statusValue: (s: string) => string }> {
  const { data } = await db.from('crm_settings').select('category, value, label_th').in('category', ['kanban_status', 'package'])
  const status: Record<string, string> = {}
  const pkg: Record<string, string> = {}
  for (const r of (data || []) as { category: string; value: string | null; label_th: string | null }[]) {
    if (!r.value || !r.label_th) continue
    if (r.category === 'kanban_status') status[r.value.toLowerCase()] = r.label_th
    else pkg[r.value] = r.label_th
  }
  return {
    status: s => (s ? status[s.toLowerCase()] ?? s : 'ไม่ระบุ'),
    pkg: p => (p ? pkg[p] ?? p : null),
    // ผู้ถามอาจพิมพ์ป้ายไทย → แปลงกลับเป็นค่าในฐานข้อมูล
    statusValue: s => Object.entries(status).find(([, th]) => th === s)?.[0] ?? s.toLowerCase(),
  }
}

async function profileNames(db: Db, ids: string[]): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map()
  const { data } = await db.from('profiles').select('id, full_name, nickname').in('id', ids)
  return new Map(((data || []) as { id: string; full_name: string | null; nickname: string | null }[]).map(p => [p.id, personName(p)]))
}

type CrmLabels = Awaited<ReturnType<typeof crmLabels>>
function leadRow(l: RawLead, labels: CrmLabels, names: Map<string, string>) {
  return {
    id: l.id,
    customer: l.customer_name,
    status: labels.status(l.status),
    work_type: l.work_type ? WORK_TYPE_TH[l.work_type] ?? l.work_type : null,
    event_date: day(l.event_date),
    event_end_date: day(l.event_end_date),
    event_time: hhmm(l.event_time),
    event_location: l.event_location,
    package: labels.pkg(l.package_name),
    quoted_price: l.quoted_price,
    confirmed_price: l.confirmed_price,
    deposit: l.deposit,
    assigned_sales: (l.assigned_sales || []).map(id => names.get(id) ?? 'ไม่ทราบชื่อ'),
    is_returning: !!l.is_returning,
    phone_last4: phoneLast4(l.customer_phone),
    created_at: day(l.created_at),
  }
}

const searchLeads = defineTool({
  name: 'search_leads',
  module: 'crm',
  description: 'ค้นหาลีดใน CRM ตามคำค้น (ชื่อลูกค้า / สถานที่ / เลขใบเสนอราคา) สถานะ ช่วงวันงาน คนขาย หรือประเภทงาน (ค่าเริ่มต้น 50 รายการ ใหม่สุดก่อน) — '
    + 'คืนลูกค้า สถานะ ประเภทงาน วันงาน เวลา สถานที่ แพ็กเกจ ราคาเสนอ/ยืนยัน มัดจำ คนขาย ลูกค้าเก่าหรือไม่ เบอร์โทร 4 ตัวท้าย และวันที่สร้าง (ไม่มี LINE/เบอร์เต็ม/โน้ต)',
  schema: z.object({
    q: z.string().max(100).optional().describe('คำค้น: ชื่อลูกค้า สถานที่จัดงาน หรือเลขใบเสนอราคา (ค้นแบบบางส่วน)'),
    status: z.string().max(50).optional().describe('สถานะ เช่น lead, quotation_sent, accepted, success, rejected, cancelled หรือป้ายภาษาไทยตามหน้า CRM'),
    from: DATE.optional().describe('วันงานตั้งแต่ รูปแบบ YYYY-MM-DD ค.ศ.'),
    to: DATE.optional().describe('วันงานถึง รูปแบบ YYYY-MM-DD ค.ศ.'),
    assigned: z.string().max(100).optional().describe('ชื่อหรือชื่อเล่นของคนขาย (ค้นแบบบางส่วน)'),
    work_type: z.enum(['sale', 'event', 'gp']).optional().describe('ประเภทงาน: sale = ขาย, event = อีเวนต์, gp = GP'),
    limit: z.number().int().min(1).max(MAX_ROWS).optional().describe('จำนวนแถวสูงสุด 1–100 (ค่าเริ่มต้น 50)'),
  }),
  async run(db, args) {
    const labels = await crmLabels(db)
    const who = args.assigned ? orSafe(args.assigned) : ''
    let salesIds: string[] | null = null
    if (who) {
      const { data } = await db.from('profiles').select('id').or(`full_name.ilike.%${who}%,nickname.ilike.%${who}%`)
      salesIds = ((data || []) as { id: string }[]).map(p => p.id)
      if (salesIds.length === 0) return { summary: `ไม่พบคนขายชื่อ "${who}"`, rows: [] }
    }
    let query = db.from('crm_leads').select(LEAD_COLUMNS)
    const q = args.q ? orSafe(args.q) : ''
    if (q) query = query.or(`customer_name.ilike.%${q}%,event_location.ilike.%${q}%,quotation_ref.ilike.%${q}%`)
    const status = args.status?.trim() ? labels.statusValue(args.status.trim()) : ''
    if (status) query = query.eq('status', status)
    if (args.from) query = query.gte('event_date', args.from)
    if (args.to) query = query.lte('event_date', args.to)
    if (args.work_type) query = query.eq('work_type', args.work_type)
    if (salesIds) query = query.overlaps('assigned_sales', salesIds)
    const { data, error } = await query.order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    const leads = (data || []) as unknown as RawLead[]
    const names = await profileNames(db, [...new Set(leads.flatMap(l => l.assigned_sales || []))])
    const what = [
      q && `"${q}"`, status && `สถานะ${labels.status(status)}`, args.work_type && `งาน${WORK_TYPE_TH[args.work_type]}`,
      who && `คนขาย "${who}"`, (args.from || args.to) && `วันงาน ${args.from ?? '…'} ถึง ${args.to ?? '…'}`,
    ].filter(Boolean).join(' ')
    return capped(leads.map(l => leadRow(l, labels, names)), `พบลีด${what ? ` ${what}` : ''} ${leads.length} ราย`, args.limit ?? 50)
  },
})

const leadDetail = defineTool({
  name: 'lead_detail',
  module: 'crm',
  description: 'รายละเอียดลีดหนึ่งราย (ระบุ id หรือชื่อลูกค้า) — ข้อมูลเดียวกับ search_leads พร้อมรายละเอียดงาน งวดชำระ (ยอด/จ่ายแล้ว/กำหนด/วันที่จ่าย) '
    + 'อีเวนต์ที่ผูก ทีมที่จัดให้ลีด (ชื่อ + ตำแหน่ง) และประวัติเปลี่ยนสถานะ 10 รายการล่าสุด · ชื่อตรงหลายราย = คืนรายการให้เลือก',
  schema: z.object({
    id: z.string().max(64).optional().describe('id ของลีด'),
    name: z.string().max(200).optional().describe('ชื่อลูกค้า (ค้นแบบบางส่วน) — ใช้เมื่อไม่รู้ id'),
  }),
  async run(db, args) {
    const id = args.id?.trim()
    const name = args.name?.trim()
    if (!id && !name) throw new ToolError('ระบุ id หรือชื่อลูกค้าอย่างใดอย่างหนึ่ง')
    const cols = `${LEAD_COLUMNS}, event_details`
    type Detail = RawLead & { event_details: string | null }
    const labels = await crmLabels(db)

    let lead: Detail | null = null
    if (id) {
      const { data } = await db.from('crm_leads').select(cols).eq('id', id).maybeSingle()
      lead = (data as unknown as Detail | null) ?? null
    } else {
      const { data } = await db.from('crm_leads').select(cols).ilike('customer_name', `%${likeEscape(name!)}%`).order('created_at', { ascending: false }).limit(20)
      const found = (data || []) as unknown as Detail[]
      const exact = found.filter(l => (l.customer_name || '').trim().toLowerCase() === name!.toLowerCase())
      if (exact.length === 1 || found.length === 1) lead = exact[0] ?? found[0]
      else if (found.length > 1) {
        return {
          summary: `พบลีดที่ชื่อตรงกับ "${name}" ${found.length} ราย — ระบุ id เพื่อดูรายละเอียด`,
          rows: found.map(l => ({ id: l.id, customer: l.customer_name, event_date: day(l.event_date), status: labels.status(l.status) })),
        }
      }
    }
    if (!lead) throw new ToolError(id ? `ไม่พบลีด id ${id}` : `ไม่พบลีดชื่อ "${name}"`)

    const [{ data: ins }, { data: evs }, { data: staff }, { data: acts }, names, roles] = await Promise.all([
      db.from('crm_lead_installments').select('installment_number, amount, is_paid, due_date, paid_date').eq('lead_id', lead.id).order('installment_number', { ascending: true }),
      db.from('events').select('id, name, event_date, status').eq('crm_lead_id', lead.id).order('event_date', { ascending: true }),
      db.from('crm_lead_staff').select('user_id, role, profiles:user_id(full_name, nickname)').eq('lead_id', lead.id),
      db.from('crm_activities').select('created_at, old_status, new_status').eq('lead_id', lead.id).eq('activity_type', 'status_change')
        .order('created_at', { ascending: false }).limit(10),
      profileNames(db, lead.assigned_sales || []),
      roleLabels(db),
    ])
    type RawIns = { installment_number: number | null; amount: number | null; is_paid: boolean | null; due_date: string | null; paid_date: string | null }
    type RawEv = { id: string; name: string; event_date: string | null; status: string | null }
    type RawStaff = { user_id: string; role: string | null; profiles: { full_name: string | null; nickname: string | null } | null }
    type RawAct = { created_at: string; old_status: string | null; new_status: string | null }
    const installments = ((ins || []) as RawIns[]).map(i => ({
      no: i.installment_number, amount: Number(i.amount) || 0, is_paid: !!i.is_paid, due_date: day(i.due_date), paid_date: day(i.paid_date),
    }))
    const row = {
      ...leadRow(lead, labels, names),
      event_details: lead.event_details,
      installments,
      events: ((evs || []) as RawEv[]).map(e => ({ id: e.id, name: e.name, event_date: day(e.event_date), status: e.status, closed: isClosedEvent(e.status) })),
      staff: ((staff || []) as unknown as RawStaff[]).map(s => ({ name: personName(s.profiles), role: s.role ? roles[s.role] ?? s.role : null })),
      activities: ((acts || []) as RawAct[]).map(a => ({
        date: bkkDateTime(a.created_at), from: a.old_status ? labels.status(a.old_status) : null, to: labels.status(a.new_status),
      })),
    }
    const paid = installments.filter(i => i.is_paid).length
    return {
      summary: `ลีด ${lead.customer_name || '(ไม่ระบุชื่อ)'} สถานะ ${row.status} · วันงาน ${row.event_date ?? 'ไม่ระบุ'} · งวดชำระ ${installments.length} งวด (จ่ายแล้ว ${paid})`,
      rows: [row],
    }
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
  myClaims,
  allClaims,
  myCheckins,
  teamCheckins,
  salesSummary,
  commissionSummary,
  searchLeads,
  leadDetail,
]

/** tool ที่ผู้ใช้เรียกได้ตามโมดูล — tool ที่ adminOnly เฉพาะ role = admin (role จากฐานข้อมูลผ่าน token) */
export const toolsFor = (modules: string[], role: string) =>
  MCP_TOOLS.filter(t => modules.includes(t.module) && (!t.adminOnly || role === 'admin'))

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
