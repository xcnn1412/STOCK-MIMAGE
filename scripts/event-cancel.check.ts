// ยกเลิก / กู้คืน / เลื่อนอีเวนต์ (docs/specs/event-cancel.md AC2–AC6) — รัน server action จริงกับฐานข้อมูลจำลองในหน่วยความจำ
// Run:  npx tsx scripts/event-cancel.check.ts
//
// ไม่แตะฐานข้อมูล/สตอเรจจริง ไม่ต้องมี env — harness คัดลอกจาก scripts/packing-flow.check.ts (SCHEMA ต่อตาราง, ตัด 1,000 แถว, .or() = throw)
// เพิ่ม: events.cancelled_at/cancelled_by/cancel_reason/seller/staff + crm_activities · embed แบบ alias (profiles:user_id(...))
// ครอบ: AC2 cancelEvent (ใบ picking / ready / ไม่มีใบ + การจองเดิม) · AC3 restoreEvent · AC4 isClosedEvent + static scan
//       · AC5 updateEvent (ยกเลิกแล้วแก้ไม่ได้ / แจ้งเลื่อนวัน) · AC6 static render EventsView
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "event-cancel: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

process.env.SESSION_SECRET = 'event-cancel-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), PACKER = uid(2), OTHER = uid(3), LEADER = uid(4), STAFF1 = uid(5)
const EVUSER = uid(6), CRMUSER = uid(7), CLOSER = uid(8)
const LEAD_WON = uid(101), LEAD_NOPKG = uid(102), LEAD_QUOTE = uid(103)
const EV1 = uid(201), EV_OTHER = uid(202), EV3 = uid(203), EV_DONE = uid(204), EV_OUT = uid(205)
const CAT_COMP = uid(301), CAT_BOOTH = uid(302), CAT_BAG = uid(303)
const I1 = uid(401), I2 = uid(402), I3 = uid(403), B1 = uid(404), B2 = uid(405), ORPH = uid(406)
const KI1 = uid(411), KI2 = uid(412), KI3 = uid(413), KC = uid(414)
const K1 = uid(501)
const P1 = uid(601), R1 = uid(611), R2 = uid(612), R3 = uid(613), LP1 = uid(621)
const JOB1 = uid(701), SPOT1 = uid(801), SPOT_OFF = uid(802)

const NOW = '2026-10-07T03:00:00.000Z'
const DAY = '2026-10-10'
const PUBLIC_BASE = 'https://fake.supabase.test/storage/v1/object/public'

// ── SCHEMA: ตาราง → คอลัมน์ที่มีจริง ───────────────────────────────────────────
const SCHEMA: Record<string, string[]> = {
  profiles: ['id', 'full_name', 'nickname', 'role', 'department', 'is_approved', 'is_blocked', 'active_session_id', 'allowed_modules'],
  app_settings: ['key', 'value', 'updated_at'],
  job_settings: ['id', 'category', 'value', 'label_th', 'label_en', 'color', 'sort_order', 'is_active'],
  crm_leads: ['id', 'customer_name', 'event_location', 'event_date', 'event_time', 'event_end_time', 'status', 'archived_at', 'created_by', 'quoted_price', 'package_name', 'created_at', 'updated_at'],
  events: ['id', 'name', 'location', 'staff', 'seller', 'event_date', 'event_time', 'event_end_time', 'status', 'crm_lead_id', 'phase', 'created_at', 'cancelled_at', 'cancelled_by', 'cancel_reason'],
  crm_activities: ['id', 'lead_id', 'created_by', 'activity_type', 'description', 'created_at'],
  event_staff: ['id', 'event_id', 'user_id', 'role', 'created_at'],
  jobs: ['id', 'job_type', 'status', 'claimed_by', 'crm_lead_id', 'archived_at', 'created_at', 'updated_at'],
  job_activities: ['id', 'job_id', 'created_by', 'activity_type', 'description', 'old_status', 'new_status', 'created_at'],
  equipment_categories: ['id', 'name', 'sort_order', 'is_active', 'sales_pick', 'variants', 'created_at'],
  items: ['id', 'name', 'serial_number', 'status', 'category_id', 'shelf_id', 'is_consumable', 'quantity', 'unit', 'image_url', 'created_at'],
  stock_movements: ['id', 'item_id', 'delta', 'balance_after', 'reason', 'note', 'event_id', 'kit_id', 'created_by', 'created_at'],
  event_closures: ['id', 'event_name', 'event_date', 'event_location', 'closed_by', 'closed_at', 'kits_snapshot', 'notes', 'image_urls', 'created_at'],
  kits: ['id', 'name', 'category_id', 'shelf_id', 'event_id', 'created_at'],
  kit_contents: ['id', 'kit_id', 'item_id', 'quantity'],
  event_kits: ['id', 'event_id', 'kit_id', 'packed_at', 'packed_by', 'created_at'],
  event_logs: ['id', 'event_id', 'item_id', 'kit_id', 'user_id', 'action', 'condition', 'note', 'created_at'],
  packages: ['id', 'name', 'description', 'price', 'sort_order', 'is_active', 'created_by', 'created_at', 'updated_at'],
  package_requirements: ['id', 'package_id', 'category_id', 'quantity', 'note', 'sort_order'],
  package_options: ['id', 'requirement_id', 'item_id', 'kit_id'],
  lead_packages: ['id', 'lead_id', 'package_id', 'quantity', 'note', 'created_by', 'created_at'],
  lead_package_units: ['id', 'lead_package_id', 'requirement_id', 'item_id', 'kit_id', 'variant', 'created_at'],
  pickup_spots: ['id', 'name', 'code', 'note', 'is_active', 'sort_order', 'created_at'],
  packing_lists: [
    'id', 'event_id', 'lead_id', 'status', 'packed_at', 'packed_by', 'photo_urls', 'spot_id', 'staged_at', 'handed_over_at', 'handed_over_by',
    'returned_at', 'returned_by', 'return_note', 'return_photo_urls', 'restocked_at', 'restocked_by', 'created_by', 'created_at', 'updated_at',
  ],
  packing_list_items: [
    'id', 'list_id', 'package_id', 'category_id', 'item_id', 'kit_id', 'variant', 'locked', 'picked_at', 'picked_by', 'handed_over_at',
    'returned_at', 'return_condition', 'return_note', 'restocked_at', 'restocked_by', 'created_at',
  ],
  notifications: ['id', 'user_id', 'type', 'title', 'body', 'reference_type', 'reference_id', 'actor_id', 'is_read', 'created_at'],
  activity_logs: ['id', 'user_id', 'action_type', 'target_user_id', 'details', 'ip_address', 'user_agent', 'location', 'latitude', 'longitude', 'created_at'],
}

/** ค่าเริ่มต้นของคอลัมน์ตอน insert (DEFAULT ใน migration) */
const DEFAULTS: Record<string, Row> = {
  packing_lists: {
    status: 'selecting', packed_at: null, packed_by: null, photo_urls: [], spot_id: null, staged_at: null, handed_over_at: null, handed_over_by: null,
    returned_at: null, returned_by: null, return_note: null, return_photo_urls: [], restocked_at: null, restocked_by: null, created_by: null, lead_id: null,
  },
  packing_list_items: {
    package_id: null, category_id: null, item_id: null, kit_id: null, variant: null, locked: false, picked_at: null, picked_by: null, handed_over_at: null,
    returned_at: null, return_condition: null, return_note: null, restocked_at: null, restocked_by: null,
  },
  event_kits: { packed_at: null, packed_by: null },
  pickup_spots: { note: null, is_active: true, sort_order: 0 },
  events: { status: null, event_time: null, event_end_time: null, location: null, phase: null },
  notifications: { is_read: false, body: null },
}

/** UNIQUE ของแต่ละตาราง (ชนแล้วได้ 23505) — คอลัมน์ที่เป็น null ไม่นับ (เหมือน Postgres) */
const UNIQUE: Record<string, string[][]> = {
  packing_lists: [['event_id']],
  packing_list_items: [['list_id', 'item_id'], ['list_id', 'kit_id']],
  event_kits: [['event_id', 'kit_id']],
  pickup_spots: [['code']],
}

/** ON DELETE CASCADE ที่ flow นี้แตะ: ตารางแม่ → [ตารางลูก, fk] */
const CASCADE: Record<string, [string, string][]> = {
  packing_lists: [['packing_list_items', 'list_id']],
  lead_packages: [['lead_package_units', 'lead_package_id']],
}

/** embed ของ PostgREST: `${table}.${embed}` → one (fk บนแถวนี้) / many (fk บนตารางลูก) */
const REL: Record<string, { type: 'one' | 'many'; fk: string }> = {
  'kit_contents.items': { type: 'one', fk: 'item_id' },
  'kit_contents.kits': { type: 'one', fk: 'kit_id' },
  'event_kits.events': { type: 'one', fk: 'event_id' },
  'event_staff.profiles': { type: 'one', fk: 'user_id' },
  'package_requirements.equipment_categories': { type: 'one', fk: 'category_id' },
  'items.kit_contents': { type: 'many', fk: 'item_id' },
  'kits.kit_contents': { type: 'many', fk: 'kit_id' },
}

const MAX_ROWS = 1000

// ── ข้อมูลตั้งต้น ──────────────────────────────────────────────────────────────
const person = (id: string, full_name: string, role: string, department: string, allowed_modules: string[] | null = null): Row =>
  ({ id, full_name, nickname: null, role, department, is_approved: true, is_blocked: false, active_session_id: `sess-${id}`, allowed_modules })
const item = (id: string, name: string, category_id: string | null, status = 'available', extra: Row = {}): Row =>
  ({ id, name, serial_number: null, status, category_id, shelf_id: null, is_consumable: false, quantity: null, unit: null, image_url: null, created_at: NOW, ...extra })

const lead0: Row = { event_date: DAY, event_time: null, event_end_time: null, archived_at: null, created_by: ADMIN, quoted_price: null, package_name: null, created_at: NOW, updated_at: NOW }

const db: Record<string, Row[]> = {
  profiles: [
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin', 'ผู้บริหาร'),
    person(PACKER, 'นักจัด ทดสอบ', 'staff', 'ทีมจัดของ'),
    person(OTHER, 'คนออกแบบ ทดสอบ', 'staff', 'ฝ่ายออกแบบ'),
    person(LEADER, 'หัวหน้างาน ทดสอบ', 'staff', 'ทีมออกหน้างาน'),
    person(STAFF1, 'สตาฟ ทดสอบ', 'staff', 'สตาฟ'),
    person(EVUSER, 'อีเวนต์ ทดสอบ', 'staff', 'สตาฟ', ['events']),
    person(CRMUSER, 'ฝ่ายขาย ทดสอบ', 'staff', 'ฝ่ายขาย', ['crm']),
    person(CLOSER, 'ผู้ปิดงาน ทดสอบ', 'staff', 'บัญชี', ['events']),
  ],
  app_settings: [{ key: 'events_closers', value: JSON.stringify([CLOSER]), updated_at: NOW }],
  job_settings: [
    { id: uid(901), category: 'pool_duty_kits', value: 'ทีมจัดของ', label_th: 'ทีมจัดของ', label_en: 'ทีมจัดของ', color: null, sort_order: 0, is_active: true },
    // ไปป์ไลน์ status_onsite (เรียง sort_order) — hook รับของเลื่อนเป็น loading
    ...['awaiting_claim', 'preparing', 'loading', 'onsite', 'teardown', 'done'].map((value, i) => ({ id: uid(911 + i), category: 'status_onsite', value, label_th: value, label_en: value, color: null, sort_order: i, is_active: true })),
  ],
  crm_leads: [
    { ...lead0, id: LEAD_WON, customer_name: 'บริษัท ทดสอบ จำกัด', event_location: 'สยาม', status: 'accepted' },
    { ...lead0, id: LEAD_NOPKG, customer_name: 'งานไม่มีแพ็กเกจ', event_location: 'บางนา', status: 'accepted' },
    { ...lead0, id: LEAD_QUOTE, customer_name: 'ใบเสนอราคา', event_location: 'รังสิต', status: 'quotation_sent' },
  ],
  events: [
    { id: EV1, name: 'งานทดสอบ สยาม', location: 'สยาม', staff: null, seller: null, event_date: DAY, event_time: '10:00:00', event_end_time: '14:00:00', phase: 'main', created_at: NOW, cancelled_at: null, cancelled_by: null, cancel_reason: null, status: 'upcoming', crm_lead_id: LEAD_WON },
    { id: EV_OTHER, name: 'งานอื่นวันเดียวกัน', location: 'สยาม', staff: null, seller: null, event_date: DAY, event_time: '10:00:00', event_end_time: '14:00:00', phase: 'main', created_at: NOW, cancelled_at: null, cancelled_by: null, cancel_reason: null, status: null, crm_lead_id: null },
    { id: EV3, name: 'งานวันที่สอง', location: 'สยาม', staff: null, seller: null, event_date: DAY, event_time: '10:00:00', event_end_time: '14:00:00', phase: 'main', created_at: NOW, cancelled_at: null, cancelled_by: null, cancel_reason: null, status: 'upcoming', crm_lead_id: LEAD_WON },
    { id: EV_DONE, name: 'งานที่ปิดแล้ว', location: 'สยาม', staff: null, seller: null, event_date: DAY, event_time: '10:00:00', event_end_time: '14:00:00', phase: 'main', created_at: NOW, cancelled_at: null, cancelled_by: null, cancel_reason: null, status: 'completed', crm_lead_id: null },
    { id: EV_OUT, name: 'งานที่ของออกไปแล้ว', location: 'สยาม', staff: null, seller: null, event_date: DAY, event_time: '10:00:00', event_end_time: '14:00:00', phase: 'main', created_at: NOW, cancelled_at: null, cancelled_by: null, cancel_reason: null, status: 'upcoming', crm_lead_id: null },
  ],
  crm_activities: [],
  event_staff: [
    { id: uid(951), event_id: EV1, user_id: STAFF1, role: 'staff', created_at: NOW },
    { id: uid(952), event_id: EV1, user_id: CLOSER, role: 'staff', created_at: NOW },
    { id: uid(953), event_id: EV3, user_id: STAFF1, role: 'staff', created_at: NOW },
  ],
  jobs: [{ id: JOB1, job_type: 'onsite', status: 'preparing', claimed_by: LEADER, crm_lead_id: LEAD_WON, archived_at: null, created_at: NOW, updated_at: NOW }],
  job_activities: [],
  stock_movements: [],
  event_closures: [],
  equipment_categories: [
    { id: CAT_COMP, name: 'คอมพิวเตอร์', sort_order: 0, is_active: true, sales_pick: false, variants: [], created_at: NOW },
    { id: CAT_BOOTH, name: 'ตู้ประกอบ', sort_order: 1, is_active: true, sales_pick: true, variants: ['ประกอบ 1', 'ประกอบ 2'], created_at: NOW },
    { id: CAT_BAG, name: 'กระเป๋าอุปกรณ์', sort_order: 2, is_active: true, sales_pick: false, variants: [], created_at: NOW },
  ],
  items: [
    item(I1, 'คอม 1', CAT_COMP),
    item(I2, 'คอม 2', CAT_COMP),
    item(I3, 'คอม 3 (นอกตัวเลือก)', CAT_COMP),
    item(B1, 'ตู้ประกอบ ชุด 1', CAT_BOOTH),
    item(B2, 'ตู้ประกอบ ชุด 2', CAT_BOOTH),
    item(ORPH, 'ของหลงทาง', null, 'in_use'),
    item(KI1, 'คอมในกระเป๋า', CAT_COMP),
    item(KI2, 'กล้องในกระเป๋า', null),
    item(KI3, 'แฟลชเสีย', null, 'damaged'),
    item(KC, 'กระดาษ', null, 'available', { is_consumable: true, quantity: 10, unit: 'แผ่น' }),
  ],
  kits: [{ id: K1, name: 'กระเป๋า A', category_id: CAT_BAG, shelf_id: null, event_id: null, created_at: NOW }],
  kit_contents: [KI1, KI2, KI3, KC].map((item_id, i) => ({ id: uid(1001 + i), kit_id: K1, item_id, quantity: 1 })),
  event_kits: [],
  event_logs: [],
  packages: [{ id: P1, name: 'Selfie booth', description: null, price: 5000, sort_order: 0, is_active: true, created_by: ADMIN, created_at: NOW, updated_at: NOW }],
  package_requirements: [
    { id: R1, package_id: P1, category_id: CAT_COMP, quantity: 1, note: null, sort_order: 0 },
    { id: R2, package_id: P1, category_id: CAT_BOOTH, quantity: 1, note: null, sort_order: 1 },
    { id: R3, package_id: P1, category_id: CAT_BAG, quantity: 1, note: null, sort_order: 2 },
  ],
  package_options: [
    { id: uid(631), requirement_id: R1, item_id: I1, kit_id: null },
    { id: uid(632), requirement_id: R1, item_id: I2, kit_id: null },
  ],
  lead_packages: [{ id: LP1, lead_id: LEAD_WON, package_id: P1, quantity: 1, note: null, created_by: ADMIN, created_at: NOW }],
  lead_package_units: [{ id: uid(641), lead_package_id: LP1, requirement_id: R2, item_id: B1, kit_id: null, variant: 'ประกอบ 2', created_at: NOW }],
  pickup_spots: [
    { id: SPOT1, name: 'จุดรับของ A', code: 'A', note: null, is_active: true, sort_order: 0, created_at: NOW },
    { id: SPOT_OFF, name: 'จุดปิดใช้', code: 'Z', note: null, is_active: false, sort_order: 1, created_at: NOW },
  ],
  // ใบของ EV_OUT ออกงานไปแล้ว (status out) — ยกเลิกอีเวนต์ไม่ได้
  packing_lists: [{
    id: uid(1101), event_id: EV_OUT, lead_id: null, status: 'out', packed_at: NOW, packed_by: ADMIN, photo_urls: [], spot_id: SPOT1, staged_at: NOW, handed_over_at: NOW, handed_over_by: ADMIN,
    returned_at: null, returned_by: null, return_note: null, return_photo_urls: [], restocked_at: null, restocked_by: null, created_by: ADMIN, created_at: NOW, updated_at: NOW,
  }],
  packing_list_items: [],
  notifications: [],
  activity_logs: [],
}

// ── ฐานข้อมูลจำลอง ────────────────────────────────────────────────────────────
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
let tick = 0
/** เวลาเพิ่มทีละ 1ms ต่อแถว — เรียง created_at ได้แน่นอน */
const stamp = () => new Date(Date.parse(NOW) + ++tick).toISOString()

type SelectNode = { kind: 'col'; name: string } | { kind: 'embed'; table: string; inner: boolean; cols: SelectNode[] }

/** แยก select string ระดับบนสุดด้วยจุลภาค (ข้ามที่อยู่ในวงเล็บ) */
function splitTop(s: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out.map(x => x.trim()).filter(Boolean)
}
function parseSelect(s: string): SelectNode[] {
  return splitTop(s).map(tok => {
    const m = tok.match(/^(?:(\w+):)?(\w+)(!\w+)?\(([\s\S]*)\)$/)
    // alias:fk(...) เช่น profiles:user_id(full_name) — ใช้ชื่อ alias เป็นตารางปลายทาง
    if (m) return { kind: 'embed', table: m[1] ?? m[2], inner: m[3] === '!inner', cols: parseSelect(m[4]) }
    return { kind: 'col', name: tok }
  })
}

function project(table: string, row: Row, nodes: SelectNode[]): Row {
  const out: Row = {}
  for (const n of nodes) {
    if (n.kind === 'col') {
      if (n.name === '*') Object.assign(out, clone(row))
      else {
        assert.ok(SCHEMA[table].includes(n.name), `ไม่มีคอลัมน์ ${table}.${n.name}`)
        out[n.name] = clone(row[n.name] ?? null)
      }
      continue
    }
    const rel = REL[`${table}.${n.table}`]
    assert.ok(rel, `ตัวจำลองไม่รู้จัก embed ${table} → ${n.table}`)
    if (rel.type === 'one') {
      const target = (db[n.table] ?? []).find(r => r.id === row[rel.fk])
      out[n.table] = target ? project(n.table, target, n.cols) : null
    } else {
      out[n.table] = (db[n.table] ?? []).filter(r => r[rel.fk] === row.id).map(r => project(n.table, r, n.cols))
    }
  }
  return out
}

/** ค่าใน DB ชนกับ UNIQUE ไหม (ไม่นับแถว self) */
function violates(table: string, row: Row, self?: Row): boolean {
  return (UNIQUE[table] ?? []).some(cols =>
    cols.every(c => row[c] != null) && (db[table] ?? []).some(r => r !== self && cols.every(c => r[c] === row[c])),
  )
}
const dup = (table: string): Result => ({ data: null, error: { code: '23505', message: `duplicate key value violates unique constraint on ${table}` } })

const ops: { table: string; action: string }[] = []

class Query implements PromiseLike<Result> {
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select'
  private payload: Row | Row[] = {}
  private returning: SelectNode[] | null = null
  private cols: SelectNode[] = parseSelect('*')
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private start = 0
  private end = Number.POSITIVE_INFINITY
  private one: 'single' | 'maybeSingle' | null = null
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {}
  constructor(private table: string) {
    assert.ok(SCHEMA[table], `ตัวจำลองไม่มีตาราง ${table}`)
  }

  select(cols = '*', options?: unknown) {
    assert.equal(options, undefined, 'ตัวจำลองไม่รองรับตัวเลือกของ select (count / head) — head:true ไม่น่าเชื่อ ใช้ limit(1)')
    const nodes = parseSelect(cols)
    if (this.action === 'select') this.cols = nodes
    else this.returning = nodes
    return this
  }
  insert(rows: Row | Row[]) { this.action = 'insert'; this.payload = rows; this.checkCols([rows].flat()); return this }
  upsert(rows: Row | Row[], opts: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.action = 'upsert'; this.payload = rows; this.upsertOpts = opts; this.checkCols([rows].flat()); return this
  }
  update(values: Row) { this.action = 'update'; this.payload = values; this.checkCols([values]); return this }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { return this.where(c, r => r[c] === v) }
  neq(c: string, v: unknown) { return this.where(c, r => r[c] != null && r[c] !== v) }
  in(c: string, vs: unknown[]) { assert.ok(Array.isArray(vs), 'in() ต้องได้ array'); return this.where(c, r => vs.includes(r[c])) }
  is(c: string, v: null) { assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ is(col, null)'); return this.where(c, r => r[c] == null) }
  gte(c: string, v: string) { return this.where(c, r => r[c] != null && String(r[c]) >= v) }
  lt(c: string, v: string) { return this.where(c, r => r[c] != null && String(r[c]) < v) }
  lte(c: string, v: string) { return this.where(c, r => r[c] != null && String(r[c]) <= v) }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') { assert.equal(v, null); return this.where(c, r => r[c] != null) }
    assert.equal(op, 'in', 'ตัวจำลองรองรับเฉพาะ not(col, "is", null) / not(col, "in", "(a,b)")')
    const values = String(v).replace(/^\(|\)$/g, '').split(',')
    return this.where(c, r => r[c] != null && !values.includes(String(r[c])))
  }
  or(expr: string): never {
    throw new Error(`โค้ดอ่านใหม่ห้ามใช้ .or() (ตาราง ${this.table}): ${expr}`)
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.known(col)
    const asc = opts?.ascending !== false
    this.sorts.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc })
    return this
  }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  limit(n: number) { this.end = this.start + n - 1; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }
  overrideTypes() { return this }

  private known(col: string) {
    assert.ok(!col.includes('.'), `ตัวจำลองไม่รองรับ filter/order บนคอลัมน์ของ embed (${this.table}.${col})`)
    assert.ok(SCHEMA[this.table].includes(col), `ไม่มีคอลัมน์ ${this.table}.${col}`)
  }
  private checkCols(rows: Row[]) { for (const r of rows) for (const c of Object.keys(r)) this.known(c) }
  private where(col: string, f: (r: Row) => boolean) { this.known(col); this.filters.push(f); return this }

  private sorted(rows: Row[]): Row[] {
    return [...rows].sort((a, b) => {
      for (const s of this.sorts) {
        const x = a[s.col] as string | number | null, y = b[s.col] as string | number | null
        if (x == null && y == null) continue
        if (x == null || y == null) return (x == null) === s.nullsFirst ? -1 : 1
        if (x < y) return s.asc ? -1 : 1
        if (x > y) return s.asc ? 1 : -1
      }
      return 0
    })
  }

  private shape(rows: Row[], nodes: SelectNode[] | null): Result {
    if (!nodes) return { data: null, error: null }
    let out = rows.map(r => project(this.table, r, nodes))
    // !inner: ตัดแถวที่ embed ว่าง
    for (const n of nodes) if (n.kind === 'embed' && n.inner) out = out.filter(r => (Array.isArray(r[n.table]) ? (r[n.table] as unknown[]).length > 0 : r[n.table] != null))
    if (!this.one) return { data: out, error: null }
    if (out.length === 1) return { data: out[0], error: null }
    if (out.length === 0 && this.one === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${out.length}` } }
  }

  private run(): Result {
    ops.push({ table: this.table, action: this.action })
    const rows = (db[this.table] ||= [])
    const fresh = (r: Row): Row => ({ id: randomUUID(), created_at: stamp(), ...clone(DEFAULTS[this.table] ?? {}), ...clone(r) })

    if (this.action === 'insert') {
      const added = [this.payload].flat().map(fresh)
      for (const [i, a] of added.entries()) if (violates(this.table, a) || added.slice(0, i).some(b => (UNIQUE[this.table] ?? []).some(cols => cols.every(c => a[c] != null && a[c] === b[c])))) return dup(this.table)
      rows.push(...added)
      return this.shape(added, this.returning)
    }
    if (this.action === 'upsert') {
      const keys = (this.upsertOpts.onConflict ?? 'id').split(',').map(k => k.trim())
      const touched: Row[] = []
      for (const r of [this.payload].flat()) {
        const hit = rows.find(x => keys.every(k => x[k] === r[k]))
        if (hit) {
          if (!this.upsertOpts.ignoreDuplicates) Object.assign(hit, clone(r))
          touched.push(hit)
        } else {
          const a = fresh(r)
          if (violates(this.table, a)) return dup(this.table)
          rows.push(a)
          touched.push(a)
        }
      }
      return this.shape(touched, this.returning)
    }

    const hits = rows.filter(r => this.filters.every(f => f(r)))
    if (this.action === 'update') {
      for (const r of hits) if (violates(this.table, { ...r, ...this.payload }, r)) return dup(this.table)
      for (const r of hits) Object.assign(r, clone(this.payload))
      return this.shape(hits, this.returning)
    }
    if (this.action === 'delete') {
      db[this.table] = rows.filter(r => !hits.includes(r))
      for (const [child, fk] of CASCADE[this.table] ?? []) {
        const gone = new Set(hits.map(h => h.id))
        db[child] = (db[child] ?? []).filter(c => !gone.has(c[fk]))
      }
      return this.shape(hits, this.returning)
    }
    // select — PostgREST ตัดที่ 1,000 แถวต่อคำขอแม้ range จะกว้างกว่า
    const end = Math.min(this.end, this.start + MAX_ROWS - 1)
    return this.shape(this.sorted(hits).slice(this.start, end + 1), this.cols)
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

// ── สตอเรจจำลอง ──────────────────────────────────────────────────────────────
const files = new Map<string, { contentType: string; size: number }>()
const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, body: { size?: number }, opts?: { contentType?: string }) {
        files.set(`${bucket}/${path}`, { contentType: opts?.contentType ?? '', size: body?.size ?? 0 })
        return { data: { path }, error: null }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `${PUBLIC_BASE}/${bucket}/${path}` } }
      },
    }
  },
}
// rpc adjust_item_stock (migration 20261007) แบบง่าย: เฉพาะวัสดุสิ้นเปลือง · ยอดห้ามติดลบ · use ซ้ำต่อ (อีเวนต์, กระเป๋า, ของ) = 23505
function rpc(fn: string, args: Record<string, unknown>): PromiseLike<Result> {
  return Promise.resolve().then(() => {
    assert.equal(fn, 'adjust_item_stock', `ตัวจำลองไม่รู้จัก rpc ${fn}`)
    const it = db.items.find(i => i.id === args.p_item)
    if (!it?.is_consumable) return { data: null, error: { code: 'P0001', message: 'NOT_CONSUMABLE' } }
    if (args.p_reason === 'use' && args.p_event && args.p_kit && db.stock_movements.some(m => m.reason === 'use' && m.event_id === args.p_event && m.kit_id === args.p_kit && m.item_id === args.p_item)) {
      return dup('stock_movements')
    }
    const balance = Number(it.quantity ?? 0) + Number(args.p_delta)
    if (balance < 0) return { data: null, error: { code: 'P0001', message: 'INSUFFICIENT_STOCK' } }
    it.quantity = balance
    db.stock_movements.push({
      id: randomUUID(), item_id: args.p_item, delta: args.p_delta, balance_after: balance, reason: args.p_reason, note: args.p_note ?? null,
      event_id: args.p_event ?? null, kit_id: args.p_kit ?? null, created_by: args.p_user ?? null, created_at: stamp(),
    })
    return { data: balance, error: null }
  })
}
const fakeClient = { from: (table: string) => new Query(table), storage, rpc }

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient, removeStorageByUrls: async () => {} }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {} }],
  [/^next\/navigation$/, { redirect(url: string) { throw new Error(`redirect ${url}`) }, notFound() { throw new Error('notFound') } }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
// ตอน render (AC6) events-view import './actions' → server action จำลอง (ไม่แตะฐานข้อมูล)
let renderMode = false
const noopActions = { cancelEvent: async () => ({ success: true }), restoreEvent: async () => ({ success: true }) }
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (renderMode && request === './actions') return noopActions
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const packing = require('../app/(authenticated)/packing/actions') as typeof import('../app/(authenticated)/packing/actions')
const events = require('../app/(authenticated)/events/actions') as typeof import('../app/(authenticated)/events/actions')
const tracking = require('../app/(authenticated)/jobs/tracking/tracking-logic') as typeof import('../app/(authenticated)/jobs/tracking/tracking-logic')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
let checks = 0
const pass = (msg: string) => console.log(`PASS  ${msg}`)
const errOf = (r: unknown): string => (r && typeof r === 'object' && 'error' in r ? String((r as { error: unknown }).error) : '')
function expectError(r: unknown, includes: string, msg: string) {
  const e = errOf(r)
  assert.ok(e, `${msg} — ต้องได้ error แต่ได้ ${JSON.stringify(r)}`)
  assert.ok(e.includes(includes), `${msg} — error "${e}" ต้องมี "${includes}"`)
  checks++
}
function expectOk<T>(r: T, msg: string): T {
  assert.ok(!errOf(r), `${msg} — ไม่ควรได้ error: ${errOf(r)}`)
  checks++
  return r
}
const row = (table: string, id: string) => db[table].find(r => r.id === id)!
const status = (id: string) => row('items', id).status
const lineOf = (listId: string, unitId: string) => db.packing_list_items.find(l => l.list_id === listId && (l.item_id === unitId || l.kit_id === unitId))!
const logsOf = (action: string) => db.activity_logs.filter(l => l.action_type === action)
const snap = () => JSON.stringify(db)
const form = (fields: Record<string, string | File>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}
const FULL_LINES = [
  { requirementId: R1, itemId: I1 },
  { requirementId: R3, kitId: K1 },
]
/** เปิดใบของอีเวนต์ → เลือกครบ → กำลังหยิบ → หยิบทุกบรรทัด (ทำในนามแอดมิน = ทีมจัดของ) */
async function pickedList(eventId: string): Promise<string> {
  loginAs(ADMIN)
  const { id } = expectOk(await packing.createPackingList(LEAD_WON, eventId), 'เปิดใบ') as { id: string }
  expectOk(await packing.setPackingLines(id, FULL_LINES), 'เลือกของ')
  expectOk(await packing.startPicking(id), 'กำลังหยิบ')
  for (const unit of [I1, K1, B1]) expectOk(await packing.pickLine(lineOf(id, unit).id as string), `หยิบ ${unit}`)
  assert.deepEqual([status(I1), status(B1), status(KI1)], ['in_use', 'in_use', 'in_use'])
  assert.equal(db.event_kits.filter(k => k.event_id === eventId).length, 1)
  return id
}
/** updateEvent จบด้วย redirect('/events') (ตัวจำลอง throw) — คืน { redirected } แทน */
async function update(id: string, fields: Record<string, string>): Promise<unknown> {
  try {
    return await events.updateEvent(id, { error: '' }, form({ name: 'งานทดสอบ สยาม', location: 'สยาม', staff: '', seller: '', phase: 'main', ...fields }))
  } catch (e) {
    if (String((e as Error).message).startsWith('redirect')) return { redirected: true }
    throw e
  }
}

async function flow() {
  // ── AC2: สิทธิ์ / สถานะ / เหตุผล / ใบออกงานแล้ว — ปฏิเสธโดยไม่เขียนอะไร ─────────────
  const LIST1 = await pickedList(EV1)
  loginAs(OTHER)
  let before = snap()
  expectError(await events.cancelEvent(EV1, 'ลูกค้ายกเลิกงาน'), 'ไม่มีสิทธิ์', 'ไม่ใช่ closer')
  assert.equal(snap(), before, 'ไม่ใช่ closer = ไม่เขียนอะไร')
  loginAs(CLOSER)
  before = snap()
  expectError(await events.cancelEvent(EV1, '  ab  '), '3 ตัวอักษร', 'เหตุผลสั้น')
  expectError(await events.cancelEvent(EV_DONE, 'ลูกค้ายกเลิกงาน'), 'ปิดงานหรือยกเลิก', 'อีเวนต์ completed')
  expectError(await events.cancelEvent(EV_OUT, 'ลูกค้ายกเลิกงาน'), 'คืนของ', 'ใบออกงานแล้ว')
  assert.equal(snap(), before, 'ปฏิเสธทุกกรณี = ไม่เขียนอะไร')
  pass('AC2 ปฏิเสธ: ไม่ใช่ closer / เหตุผล < 3 ตัวอักษร / completed / ใบออกงานแล้ว (บอกให้ใช้เส้นคืนของ) — ฐานข้อมูลไม่เปลี่ยน')

  // ── AC2: สำเร็จ — ใบ picking ───────────────────────────────────────────────
  const REASON = '  ลูกค้าเลื่อนงานไม่มีกำหนด  '
  expectOk(await events.cancelEvent(EV1, REASON), 'ยกเลิก EV1 (ใบ picking)')
  const ev1 = row('events', EV1)
  assert.equal(ev1.status, 'cancelled')
  assert.equal(ev1.cancel_reason, REASON.trim())
  assert.equal(ev1.cancelled_by, CLOSER)
  assert.ok(ev1.cancelled_at)
  assert.equal(db.packing_lists.filter(l => l.event_id === EV1).length, 0, 'ใบของอีเวนต์หาย')
  assert.equal(db.packing_list_items.filter(l => l.list_id === LIST1).length, 0, 'บรรทัดหายตาม')
  assert.deepEqual([status(I1), status(B1), status(KI1), status(KI2), status(KI3)], ['available', 'available', 'available', 'available', 'damaged'], 'ของที่หยิบกลับเป็น available')
  assert.equal(db.event_kits.filter(k => k.event_id === EV1).length, 0)
  assert.equal(row('kits', K1).event_id, null)
  assert.equal(db.crm_activities.filter(a => a.lead_id === LEAD_WON).length, 1, 'crm_activities +1')
  assert.ok(String(db.crm_activities[0].description).includes('ยกเลิกอีเวนต์ งานทดสอบ สยาม: ลูกค้าเลื่อนงานไม่มีกำหนด'))
  const n1 = db.notifications.filter(n => n.type === 'event_cancelled' && n.reference_id === EV1)
  assert.deepEqual(n1.map(n => n.user_id), [STAFF1], 'แจ้ง event_staff ยกเว้นผู้กด (CLOSER)')
  assert.equal(n1[0].reference_type, 'event')
  const log1 = logsOf('CANCEL_EVENT').at(-1)!
  assert.equal((log1.details as Row).reason, REASON.trim())
  assert.equal(log1.user_id, CLOSER)
  expectError(await events.cancelEvent(EV1, 'ยกเลิกซ้ำอีกรอบ'), 'ปิดงานหรือยกเลิก', 'ยกเลิกซ้ำ')
  checks += 16
  pass('AC2 สำเร็จ (ใบ picking): status cancelled + 3 ฟิลด์ · ใบหาย · ของกลับ available · event_kits 0 · crm_activities +1 · แจ้งทีมยกเว้นผู้กด · log CANCEL_EVENT + reason · ยกเลิกซ้ำ = error')

  // ── AC2: สำเร็จ — ใบ ready (reopen ก่อนแล้วยกเลิก) โดยแอดมิน ────────────────────────
  const LIST3 = await pickedList(EV3)
  const up = expectOk(await packing.uploadPackingPhoto(form({ listId: LIST3, file: new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' }) })), 'อัปโหลดรูป') as { url: string }
  expectOk(await packing.confirmPacking(LIST3, { photoUrls: [up.url], spotId: SPOT1 }), 'ยืนยันจัดของ')
  assert.equal(row('packing_lists', LIST3).status, 'ready')
  const notesBefore = db.notifications.length
  expectOk(await events.cancelEvent(EV3, 'ย้ายไปจัดงานอื่น'), 'ยกเลิก EV3 (ใบ ready)')
  assert.equal(row('events', EV3).status, 'cancelled')
  assert.equal(db.packing_lists.filter(l => l.event_id === EV3).length, 0)
  assert.deepEqual([status(I1), status(B1), status(KI1)], ['available', 'available', 'available'])
  assert.equal(db.event_kits.filter(k => k.event_id === EV3).length, 0)
  assert.equal(db.crm_activities.length, 2)
  assert.deepEqual(db.notifications.slice(notesBefore).filter(n => n.type === 'event_cancelled').map(n => n.user_id), [STAFF1], 'แอดมินกด → แจ้ง STAFF1')
  assert.equal(logsOf('REOPEN_PACKING').length, 1, 'ใบ ready ถูก reopen ด้วย core เดียวกับ reopenPacking')
  checks += 7
  pass('AC2 สำเร็จ (ใบ ready): reopen → ยกเลิกใบ · ของกลับ available · event_kits 0')

  // ── AC2: อีเวนต์ไม่ผูก lead + การจองกระเป๋าแบบเดิม (ไม่มีใบ) ─────────────────────────
  db.event_kits.push({ id: uid(9001), event_id: EV_OTHER, kit_id: K1, packed_at: null, packed_by: null, created_at: NOW })
  row('kits', K1).event_id = EV_OTHER
  const crmBefore = db.crm_activities.length
  loginAs(CLOSER)
  expectOk(await events.cancelEvent(EV_OTHER, 'สถานที่ปิดปรับปรุง'), 'ยกเลิก EV_OTHER')
  assert.equal(db.event_kits.filter(k => k.event_id === EV_OTHER).length, 0, 'การจองเดิมถูกลบ')
  assert.equal(row('kits', K1).event_id, null, 'recomputeKitPointers')
  assert.equal(db.crm_activities.length, crmBefore, 'ไม่ผูก lead = crm_activities 0 แถว')
  checks += 3
  pass('AC2 ไม่มี crm_lead_id: crm_activities ไม่เพิ่ม · event_kits ที่จองตรงถูกลบ + kits.event_id ถูกคำนวณใหม่')

  // ── AC3: กู้คืน ────────────────────────────────────────────────────────────
  before = snap()
  expectError(await events.restoreEvent(EV1), 'admin', 'closer ที่ไม่ใช่แอดมินกู้คืน')
  loginAs(ADMIN)
  expectError(await events.restoreEvent(EV_DONE), 'ไม่ได้ถูกยกเลิก', 'กู้อีเวนต์ที่ไม่ได้ยกเลิก')
  assert.equal(snap(), before)
  expectOk(await events.restoreEvent(EV1), 'กู้ EV1')
  const back = row('events', EV1)
  assert.deepEqual([back.status, back.cancelled_at, back.cancelled_by, back.cancel_reason], ['upcoming', null, null, null])
  assert.equal(logsOf('RESTORE_EVENT').length, 1)
  assert.equal(db.packing_lists.filter(l => l.event_id === EV1).length, 0, 'ไม่กู้ใบจัดของ')
  checks += 4
  pass('AC3 restoreEvent: ไม่ใช่แอดมิน / ไม่ได้ยกเลิก = error ไม่เขียน · สำเร็จ = upcoming + 3 ฟิลด์ null + log RESTORE_EVENT')

  // ── AC5: updateEvent ───────────────────────────────────────────────────────
  before = snap()
  assert.deepEqual(await update(EV3, { event_time: '10:00', event_end_time: '14:00' }), { error: 'อีเวนต์นี้ยกเลิกแล้ว' })
  assert.equal(snap(), before, 'อีเวนต์ cancelled = ไม่เขียน')
  const noteCount = () => db.notifications.filter(n => n.type === 'event_rescheduled').length
  const crm0 = db.crm_activities.length
  assert.deepEqual(await update(EV1, { event_time: '10:00', event_end_time: '14:00' }), { redirected: true })
  assert.equal(noteCount(), 0, 'วัน/เวลาไม่เปลี่ยน = ไม่แจ้ง')
  assert.equal(db.crm_activities.length, crm0)
  // ThaiDatePicker ส่ง ISO (เที่ยงคืนเวลาไทย = 17:00Z ของวันก่อน)
  assert.deepEqual(await update(EV1, { event_date: '2026-10-12T17:00:00.000Z', event_time: '10:00', event_end_time: '14:00' }), { redirected: true })
  const moved = db.notifications.filter(n => n.type === 'event_rescheduled')
  assert.deepEqual(moved.map(n => n.user_id).sort(), [CLOSER, STAFF1].sort(), 'แจ้งทุกคนใน event_staff (ผู้แก้ = ADMIN ไม่อยู่ในทีม)')
  assert.ok(moved.every(n => String(n.title).includes('2026-10-10') && String(n.title).includes('→ 2026-10-13')), `ข้อความมีวันเดิม → ใหม่: ${moved[0]?.title}`)
  assert.equal(row('events', EV1).event_date, '2026-10-12T17:00:00.000Z')
  assert.equal(db.crm_activities.length, crm0 + 1, 'บันทึกกิจกรรมที่ lead')
  assert.ok(String(db.crm_activities.at(-1)!.description).startsWith('เลื่อน งานทดสอบ สยาม: 2026-10-10'))
  // เปลี่ยนเวลาอย่างเดียวก็นับเป็นเลื่อน · ส่งวันเดิมซ้ำ = ไม่เขียน event_date
  await update(EV1, { event_date: '2026-10-12T17:00:00.000Z', event_time: '11:00', event_end_time: '14:00' })
  assert.equal(noteCount(), 4)
  checks += 9
  pass('AC5 updateEvent: cancelled = "อีเวนต์นี้ยกเลิกแล้ว" ไม่เขียน · ไม่เปลี่ยนวัน/เวลา = ไม่แจ้ง · เปลี่ยนวัน = event_rescheduled ถึง event_staff พร้อมวันเดิม → ใหม่ + crm_activities')
}

// ── AC4: cancelled = ปิด · static scan 6 ไฟล์ ──────────────────────────────────
function closedRule() {
  assert.equal(tracking.isClosedEvent('cancelled'), true)
  assert.equal(tracking.isClosedEvent('completed'), true)
  assert.equal(tracking.isClosedEvent('upcoming'), false)
  assert.equal(tracking.isClosedEvent(null), false)
  const files = [
    'app/(authenticated)/events/events-view.tsx',
    'app/(authenticated)/overview/overview-view.tsx',
    'app/(authenticated)/costs/events/events-list-view.tsx',
    'app/(authenticated)/costs/events/[id]/event-cost-detail-view.tsx',
    'app/(authenticated)/events/[id]/return/page.tsx',
    'app/(authenticated)/events/close-core.ts',
  ]
  for (const f of files) {
    const bad = readFileSync(join(__dirname, '..', f), 'utf8').split(/\r?\n/)
      .filter(l => /[!=]==\s*'completed'/.test(l) && !/status:\s*'completed'/.test(l))
    assert.deepEqual(bad, [], `${f} ยังเทียบ 'completed' ตรงๆ`)
    checks++
  }
  // MCP list events กรองด้วย isClosedEvent (ตัวเดียวกัน) — ชุดตรวจ lib/mcp-tools.check.ts รันแยก
  assert.ok(readFileSync(join(__dirname, '..', 'lib/mcp-tools.ts'), 'utf8').includes('.filter(e => !isClosedEvent(e.status))'))
  checks += 5
  pass("AC4 isClosedEvent('cancelled') = true · 6 ไฟล์ไม่เหลือ === / !== 'completed' · MCP list events กรองด้วย isClosedEvent")
}

// ── AC6: static render ของ EventsView ─────────────────────────────────────────
function render() {
  renderMode = true
  /* eslint-disable @typescript-eslint/no-require-imports */
  const EventsView = require('../app/(authenticated)/events/events-view').default
  const { LanguageProvider } = require('../contexts/language-context')
  /* eslint-enable @typescript-eslint/no-require-imports */
  const ev = (id: string, name: string, s: string, extra: Row = {}) =>
    ({ id, name, location: 'กรุงเทพ', staff: null, event_date: '2026-11-20', event_time: null, event_end_time: null, status: s, phase: 'main', created_at: NOW, ...extra })
  const UP = uid(7001), CAN = uid(7002), DONE = uid(7003)
  const list = [
    ev(UP, 'งานเปิดอยู่', 'upcoming'),
    ev(CAN, 'งานที่ยกเลิก', 'cancelled', { cancel_reason: 'ลูกค้ายกเลิกงาน', cancelled_by: ADMIN, cancelled_at: NOW }),
    ev(DONE, 'งานที่ปิดแล้ว', 'completed'),
  ]
  const html = (props: Row) => renderToStaticMarkup(createElement(LanguageProvider, null, createElement(EventsView, { events: list, logs: [], ...props })))
  const has = (h: string, xs: string[], w: string) => { for (const x of xs) { assert.ok(h.includes(x), `${w} ต้องมี "${x}"`); checks++ } }
  const lacks = (h: string, xs: string[], w: string) => { for (const x of xs) { assert.ok(!h.includes(x), `${w} ต้องไม่มี "${x}"`); checks++ } }
  /** HTML ของการ์ดหนึ่งใบ (Card = data-slot="card") */
  const cardOf = (h: string, name: string) => {
    const card = h.split('data-slot="card"').slice(1).find(c => c.includes(name))
    assert.ok(card, `ไม่พบการ์ด ${name}`)
    return card
  }

  // ค่าเริ่มต้น: ซ่อนการ์ดปิด/ยกเลิก · ปุ่มสลับนับรวม (2)
  const def = html({ canEdit: true, canClose: true, isAdmin: true, cancelledByName: { [ADMIN]: 'แอดมิน' } })
  has(def, ['งานเปิดอยู่', 'Show closed/cancelled', '<span class="ml-1.5 opacity-60">2</span>', 'Cancel event', `/events/${UP}/return`], 'ค่าเริ่มต้น')
  lacks(def, ['งานที่ยกเลิก', 'ลูกค้ายกเลิกงาน', 'งานที่ปิดแล้ว', 'cancel-info'], 'ค่าเริ่มต้น')

  // แสดงที่ปิด/ยกเลิก + แอดมิน
  const admin = html({ canEdit: true, canClose: true, isAdmin: true, cancelledByName: { [ADMIN]: 'แอดมิน' }, defaultShowClosed: true })
  const canCard = cardOf(admin, 'งานที่ยกเลิก')
  has(canCard, ['data-testid="cancel-info"', 'Cancelled', 'ลูกค้ายกเลิกงาน', 'Cancelled by: แอดมิน', 'Restore', 'line-through'], 'การ์ดยกเลิก (แอดมิน)')
  lacks(canCard, ['Cancel event', `/events/${CAN}/return`], 'การ์ดยกเลิก (แอดมิน)')
  const upCard = cardOf(admin, 'งานเปิดอยู่')
  has(upCard, ['Cancel event', `/events/${UP}/return`], 'การ์ด upcoming + canClose')
  lacks(upCard, ['Restore', 'cancel-info'], 'การ์ด upcoming')
  lacks(cardOf(admin, 'งานที่ปิดแล้ว'), ['Cancel event', 'Restore'], 'การ์ด completed')

  // ไม่ใช่แอดมิน → ไม่มีปุ่มกู้คืน · canClose=false → ไม่มีปุ่มยกเลิก
  const staff = html({ canEdit: false, canClose: false, isAdmin: false, defaultShowClosed: true })
  has(cardOf(staff, 'งานที่ยกเลิก'), ['ลูกค้ายกเลิกงาน'], 'การ์ดยกเลิก (ไม่ใช่แอดมิน)')
  lacks(staff, ['Restore', 'Cancel event', '/return'], 'ไม่ใช่แอดมิน + canClose=false')
  // canClose=true แต่ไม่ใช่แอดมิน → ยกเลิกได้ กู้คืนไม่ได้
  const closer = html({ canClose: true, isAdmin: false, defaultShowClosed: true })
  has(cardOf(closer, 'งานเปิดอยู่'), ['Cancel event'], 'closer การ์ด upcoming')
  lacks(cardOf(closer, 'งานที่ยกเลิก'), ['Restore', 'Cancel event'], 'closer การ์ดยกเลิก')
  pass('AC6 EventsView: ค่าเริ่มต้นซ่อนการ์ดยกเลิก (นับในปุ่มสลับ) · การ์ดยกเลิกมี badge + เหตุผล + ผู้ยกเลิก ไม่มีปุ่มปิดงาน/ยกเลิก · กู้คืนเฉพาะแอดมิน · ปุ่มยกเลิกเฉพาะ upcoming + canClose')
}

async function main() {
  await flow()
  closedRule()
  render()
  console.log(`event-cancel: ${checks} checks`)
  console.log('event-cancel: ผ่านทั้งหมด')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
