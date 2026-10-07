// ใบจัดของ (เฟส 3–4) — รัน server action จริงกับฐานข้อมูลจำลองในหน่วยความจำ
// Run:  npx tsx scripts/packing-flow.check.ts
//
// ไม่แตะฐานข้อมูล/สตอเรจจริง ไม่ต้องมี env: แทน next/headers, next/cache และ @/lib/supabase-server ด้วยตัวจำลอง
// (เทคนิคเดียวกับ scripts/purchasing-flow.check.ts) · logger / notifications ใช้ตัวจริงเขียนลงตารางจำลอง
// ฐานข้อมูลจำลองมี SCHEMA ต่อตาราง (อ้างคอลัมน์ที่ไม่มี = ล้ม), ตัดผลที่ 1,000 แถวเหมือน PostgREST, .or() = throw
// ครอบคลุม docs/specs/equipment-flow.md เกณฑ์ P3-6 ข้อ (a)–(k) และ P4-6 ข้อ (l)–(s) · คนและงานทั้งหมดสังเคราะห์
// rpc('adjust_item_stock') จำลองแบบง่าย: ยอดห้ามติดลบ + unique (event_id, kit_id, item_id) ของ reason 'use' → 23505
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "packing-flow: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { randomUUID } from 'node:crypto'

process.env.SESSION_SECRET = 'packing-flow-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), PACKER = uid(2), OTHER = uid(3), LEADER = uid(4), STAFF1 = uid(5)
const EVUSER = uid(6), CRMUSER = uid(7), CLOSER = uid(8)
const LEAD_WON = uid(101), LEAD_NOPKG = uid(102), LEAD_QUOTE = uid(103)
const EV1 = uid(201), EV_OTHER = uid(202)
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
  profiles: ['id', 'full_name', 'nickname', 'role', 'department', 'is_approved', 'active_session_id', 'allowed_modules'],
  app_settings: ['key', 'value', 'updated_at'],
  job_settings: ['id', 'category', 'value', 'label_th', 'label_en', 'color', 'sort_order', 'is_active'],
  crm_leads: ['id', 'customer_name', 'event_location', 'event_date', 'event_time', 'event_end_time', 'status', 'archived_at', 'created_by', 'quoted_price', 'package_name', 'created_at', 'updated_at'],
  events: ['id', 'name', 'location', 'event_date', 'event_time', 'event_end_time', 'status', 'crm_lead_id', 'phase', 'created_at'],
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
  'package_requirements.equipment_categories': { type: 'one', fk: 'category_id' },
  'items.kit_contents': { type: 'many', fk: 'item_id' },
  'kits.kit_contents': { type: 'many', fk: 'kit_id' },
}

const MAX_ROWS = 1000

// ── ข้อมูลตั้งต้น ──────────────────────────────────────────────────────────────
const person = (id: string, full_name: string, role: string, department: string, allowed_modules: string[] | null = null): Row =>
  ({ id, full_name, nickname: null, role, department, is_approved: true, active_session_id: `sess-${id}`, allowed_modules })
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
    { id: EV1, name: 'งานทดสอบ สยาม', location: 'สยาม', event_date: DAY, event_time: '10:00:00', event_end_time: '14:00:00', status: null, crm_lead_id: LEAD_WON, phase: 'main', created_at: NOW },
    { id: EV_OTHER, name: 'งานอื่นวันเดียวกัน', location: 'บางนา', event_date: DAY, event_time: '12:00:00', event_end_time: '16:00:00', status: null, crm_lead_id: null, phase: 'main', created_at: NOW },
  ],
  event_staff: [
    { id: uid(951), event_id: EV1, user_id: STAFF1, role: 'staff', created_at: NOW },
    { id: uid(952), event_id: EV1, user_id: PACKER, role: 'staff', created_at: NOW },
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
  packing_lists: [],
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
    if (m) return { kind: 'embed', table: m[2], inner: m[3] === '!inner', cols: parseSelect(m[4]) }
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
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const actions = require('../app/(authenticated)/packing/actions') as typeof import('../app/(authenticated)/packing/actions')
const queries = require('../app/(authenticated)/packing/queries') as typeof import('../app/(authenticated)/packing/queries')
const packageActions = require('../app/(authenticated)/packages/actions') as typeof import('../app/(authenticated)/packages/actions')
const spots = require('../app/(authenticated)/stock/settings/actions') as typeof import('../app/(authenticated)/stock/settings/actions')
const cleanup = require('../app/(authenticated)/items/cleanup-items') as typeof import('../app/(authenticated)/items/cleanup-items')
const tracking = require('../app/(authenticated)/jobs/tracking/tracking-logic') as typeof import('../app/(authenticated)/jobs/tracking/tracking-logic')
const events = require('../app/(authenticated)/events/actions') as typeof import('../app/(authenticated)/events/actions')
const capacity = require('../app/(authenticated)/packages/capacity-data') as typeof import('../app/(authenticated)/packages/capacity-data')
const packageLogic = require('../app/(authenticated)/packages/package-logic') as typeof import('../app/(authenticated)/packages/package-logic')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
const pass = (msg: string) => console.log(`PASS  ${msg}`)
const errOf = (r: unknown): string => (r && typeof r === 'object' && 'error' in r ? String((r as { error: unknown }).error) : '')
function expectError(r: unknown, includes: string, msg: string) {
  const e = errOf(r)
  assert.ok(e, `${msg} — ต้องได้ error แต่ได้ ${JSON.stringify(r)}`)
  assert.ok(e.includes(includes), `${msg} — error "${e}" ต้องมี "${includes}"`)
}
function expectOk<T>(r: T, msg: string): T {
  assert.ok(!errOf(r), `${msg} — ไม่ควรได้ error: ${errOf(r)}`)
  return r
}
const row = (table: string, id: string) => db[table].find(r => r.id === id)!
const status = (id: string) => row('items', id).status
const lines = (listId: string) => db.packing_list_items.filter(l => l.list_id === listId)
const lineOf = (listId: string, unitId: string) => lines(listId).find(l => l.item_id === unitId || l.kit_id === unitId)!
const bookings = (eventId: string) => db.event_kits.filter(k => k.event_id === eventId)
const logsOf = (action: string) => db.activity_logs.filter(l => l.action_type === action)
const photoFile = (name = 'set.jpg', type = 'image/jpeg', size = 1024) => new File([new Uint8Array(size)], name, { type })
const form = (fields: Record<string, string | File>) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(fields)) f.append(k, v)
  return f
}

const FULL_LINES = [
  { requirementId: R1, itemId: I1 },
  { requirementId: R3, kitId: K1 },
]

async function main() {
  // ── (j) ผู้ใช้แผนกอื่น (ไม่ใช่ทีมจัดของ/แอดมิน) — ทุก action ถูกปฏิเสธ (ก่อนมีใบ) ──
  loginAs(OTHER)
  const DENY = 'ทีมจัดของ'
  expectError(await actions.createPackingList(LEAD_WON), DENY, 'แผนกอื่นเปิดใบไม่ได้')
  assert.equal(db.packing_lists.length, 0)
  pass('(j-1) แผนกอื่นเปิดใบจัดของไม่ได้')

  // ── (a) งานไม่มีแพ็กเกจ / ยังไม่ตอบรับ ────────────────────────────────────────
  loginAs(PACKER)
  expectError(await actions.createPackingList(LEAD_NOPKG), 'ยังไม่มีแพ็กเกจ', 'งานไม่มีแพ็กเกจ')
  expectError(await actions.createPackingList(LEAD_QUOTE), 'ตอบรับแล้ว', 'งานยังไม่ตอบรับ')
  assert.equal(db.packing_lists.length, 0)
  assert.equal(db.events.filter(e => e.crm_lead_id === LEAD_NOPKG).length, 0, 'ไม่สร้างอีเวนต์ให้งานที่เปิดใบไม่ได้')
  pass('(a) createPackingList ของงานไม่มีแพ็กเกจ / ยังไม่ตอบรับ = error ไทย ไม่สร้างใบ')

  // ── (b) สร้างใบ → บรรทัด locked จากตู้ที่ทีมขายเลือก มี variant ────────────────
  const created = expectOk(await actions.createPackingList(LEAD_WON), 'เปิดใบ') as { id: string }
  const LIST = created.id
  const list = row('packing_lists', LIST)
  assert.equal(list.event_id, EV1, 'ใช้อีเวนต์ที่ยังไม่ปิดของงาน (resolveLeadEvent pickExisting)')
  assert.equal(list.status, 'selecting')
  assert.equal(list.created_by, PACKER)
  assert.equal(lines(LIST).length, 1)
  const locked = lineOf(LIST, B1)
  assert.deepEqual([locked.locked, locked.variant, locked.package_id, locked.category_id], [true, 'ประกอบ 2', P1, CAT_BOOTH])
  assert.deepEqual(await actions.createPackingList(LEAD_WON), { id: LIST }, 'เปิดซ้ำ = id เดิม')
  assert.equal(db.packing_lists.length, 1)
  assert.equal(logsOf('CREATE_PACKING_LIST').length, 1)
  pass('(b) เปิดใบ: สถานะเลือกของ · บรรทัด locked ตู้ประกอบ ชุด 1 (ประกอบ 2) · เปิดซ้ำได้ใบเดิม · log CREATE_PACKING_LIST')

  // (j-2) ผู้ใช้แผนกอื่นกับใบที่มีอยู่จริง
  loginAs(OTHER)
  const lockedId = locked.id as string
  for (const [name, r] of [
    ['setPackingLines', await actions.setPackingLines(LIST, FULL_LINES)],
    ['startPicking', await actions.startPicking(LIST)],
    ['backToSelecting', await actions.backToSelecting(LIST)],
    ['pickLine', await actions.pickLine(lockedId)],
    ['unpickLine', await actions.unpickLine(lockedId)],
    ['uploadPackingPhoto', await actions.uploadPackingPhoto(form({ listId: LIST, file: photoFile() }))],
    ['confirmPacking', await actions.confirmPacking(LIST, { photoUrls: [], spotId: SPOT1 })],
    ['reopenPacking', await actions.reopenPacking(LIST)],
    ['cancelPackingList', await actions.cancelPackingList(LIST)],
  ] as const) expectError(r, DENY, `แผนกอื่นเรียก ${name}`)
  assert.equal(lines(LIST).length, 1, 'ไม่มีอะไรเปลี่ยน')
  assert.equal(row('packing_lists', LIST).status, 'selecting')
  pass('(j-2) แผนกอื่นเรียก set/start/back/pick/unpick/upload/confirm/reopen/cancel = error ทุกตัว ไม่มีอะไรเปลี่ยน')

  // ── (c) เลือกของ: อุปกรณ์เดี่ยว + กระเป๋า → event_kits · ของในกระเป๋า / นอกตัวเลือก = error ──
  loginAs(PACKER)
  expectOk(await actions.setPackingLines(LIST, [{ requirementId: R1, itemId: I1 }]), 'เลือกคอมอย่างเดียว')
  // (d) ข้อกำหนดยังไม่ครบ = error ระบุประเภทที่ขาด
  expectError(await actions.startPicking(LIST), 'กระเป๋าอุปกรณ์', 'startPicking ตอนยังไม่ครบ')
  assert.equal(row('packing_lists', LIST).status, 'selecting')

  expectOk(await actions.setPackingLines(LIST, FULL_LINES), 'เลือกครบ')
  assert.equal(lines(LIST).length, 3, 'locked + คอม + กระเป๋า')
  assert.ok(lineOf(LIST, B1).locked, 'บรรทัด locked ยังอยู่')
  assert.equal(bookings(EV1).length, 1, 'กระเป๋าในใบ → event_kits')
  assert.equal(bookings(EV1)[0].kit_id, K1)
  assert.equal(row('kits', K1).event_id, EV1, 'recomputeKitPointers ชี้กระเป๋าไปที่อีเวนต์')

  expectError(await actions.setPackingLines(LIST, [...FULL_LINES, { itemId: KI1 }]), 'อยู่ในกระเป๋า', 'อุปกรณ์ในกระเป๋าเป็นบรรทัดเดี่ยว')
  expectError(await actions.setPackingLines(LIST, [{ requirementId: R1, itemId: I3 }, { requirementId: R3, kitId: K1 }]), 'ไม่ได้อยู่ในตัวเลือก', 'หน่วยนอกตัวเลือก')
  expectError(await actions.setPackingLines(LIST, [...FULL_LINES, { itemId: I1 }]), 'อยู่ในใบนี้แล้ว', 'หน่วยซ้ำ')
  assert.equal(lines(LIST).length, 3, 'บันทึกที่ไม่ผ่านไม่แตะของเดิม')

  // เอากระเป๋าออก → event_kits หาย · ใส่คืน → กลับมา
  expectOk(await actions.setPackingLines(LIST, [{ requirementId: R1, itemId: I1 }, { itemId: B2 }]), 'เอากระเป๋าออก + ของเสริม')
  assert.equal(bookings(EV1).length, 0, 'ลบบรรทัดกระเป๋า → ยกเลิกจอง')
  assert.equal(row('kits', K1).event_id, null)
  const extra = lineOf(LIST, B2)
  assert.deepEqual([extra.package_id, extra.category_id, extra.locked], [null, null, false], 'ของเสริม package/category ว่าง')
  expectOk(await actions.setPackingLines(LIST, FULL_LINES), 'ใส่กระเป๋าคืน')
  assert.equal(bookings(EV1).length, 1)
  assert.ok(logsOf('UPDATE_PACKING_LINES').length >= 3)
  pass('(c) setPackingLines: อุปกรณ์เดี่ยว + กระเป๋า → event_kits · เอาออก → event_kits หาย · ของในกระเป๋า / นอกตัวเลือก / ซ้ำ = error')

  // ── (d) ครบ → กำลังหยิบ ───────────────────────────────────────────────────
  expectOk(await actions.startPicking(LIST), 'startPicking ครบ')
  assert.equal(row('packing_lists', LIST).status, 'picking')
  expectError(await actions.setPackingLines(LIST, FULL_LINES), 'เลือกของ', 'แก้รายการตอนกำลังหยิบไม่ได้')
  pass('(d) startPicking: ยังไม่ครบ = error ระบุประเภท · ครบ = กำลังหยิบ · แก้รายการตอนกำลังหยิบไม่ได้')

  // ── (e) หยิบของ ─────────────────────────────────────────────────────────────
  // ตู้ที่ทีมขายเลือกกำลังออกงานกับงานอื่น → หยิบไม่ได้
  row('items', B1).status = 'in_use'
  expectError(await actions.pickLine(lockedId), 'ออกงานอยู่', 'หยิบของที่ in_use')
  assert.equal(lineOf(LIST, B1).picked_at, null)
  row('items', B1).status = 'available'

  const comp = lineOf(LIST, I1).id as string
  expectOk(await actions.pickLine(comp), 'หยิบคอม')
  assert.equal(status(I1), 'in_use')
  const compLogs = db.event_logs.filter(l => l.item_id === I1)
  assert.equal(compLogs.length, 1)
  assert.deepEqual([compLogs[0].event_id, compLogs[0].kit_id, compLogs[0].action, compLogs[0].user_id], [EV1, null, 'checkout', PACKER])
  assert.ok(lineOf(LIST, I1).picked_at)
  assert.equal(lineOf(LIST, I1).picked_by, PACKER)
  expectError(await actions.pickLine(comp), 'หยิบไปแล้ว', 'หยิบซ้ำ')

  // (f-1) ยังหยิบไม่ครบ → ยืนยันไม่ได้
  const up = expectOk(await actions.uploadPackingPhoto(form({ listId: LIST, file: photoFile() })), 'อัปโหลดรูป') as { url: string }
  assert.ok(up.url.startsWith(`${PUBLIC_BASE}/packing-photos/${LIST}/`), 'path <listId>/<ts>_<name>')
  assert.ok(files.has(`packing-photos/${up.url.split('/packing-photos/')[1]}`))
  expectError(await actions.uploadPackingPhoto(form({ listId: LIST, file: photoFile('a.pdf', 'application/pdf') })), 'รูปภาพ', 'ไฟล์ไม่ใช่รูป')
  expectError(await actions.uploadPackingPhoto(form({ listId: LIST, file: photoFile('big.jpg', 'image/jpeg', 5 * 1024 * 1024 + 1) })), '5MB', 'ไฟล์เกิน 5MB')
  expectError(await actions.confirmPacking(LIST, { photoUrls: [up.url], spotId: SPOT1 }), 'ยังหยิบไม่ครบ', 'ยืนยันตอนยังหยิบไม่ครบ')

  const bag = lineOf(LIST, K1).id as string
  expectOk(await actions.pickLine(bag), 'หยิบกระเป๋า')
  assert.deepEqual([status(KI1), status(KI2), status(KI3), status(KC)], ['in_use', 'in_use', 'damaged', 'available'], 'กระเป๋า: ทุกชิ้นที่ใช้ได้ (ไม่รวมของเสีย/วัสดุสิ้นเปลือง) → in_use')
  assert.ok(bookings(EV1)[0].packed_at, 'event_kits.packed_at ถูกตั้ง (syncPacked)')
  assert.equal(db.event_logs.filter(l => l.kit_id === K1 && l.action === 'checkout').length, 2)
  expectOk(await actions.pickLine(lockedId), 'หยิบตู้')
  assert.equal(status(B1), 'in_use')
  assert.equal(logsOf('PICK_PACKING_LINE').length, 3)
  pass('(e) pickLine: ตู้ที่ออกงานอยู่ = error · อุปกรณ์เดี่ยว → in_use + event_logs 1 แถว kit_id null · กระเป๋า → ชิ้นใช้ได้ทุกชิ้น in_use + packed_at · หยิบซ้ำไม่ได้')

  // ── (f) ยืนยันจัดของ ─────────────────────────────────────────────────────────
  expectError(await actions.confirmPacking(LIST, { photoUrls: [], spotId: SPOT1 }), 'รูป', 'ไม่มีรูป')
  expectError(await actions.confirmPacking(LIST, { photoUrls: ['https://evil.test/x.jpg'], spotId: SPOT1 }), 'รูป', 'รูปจากที่อื่นไม่นับ')
  expectError(await actions.confirmPacking(LIST, { photoUrls: [up.url], spotId: '' }), 'จุดรับของ', 'ไม่มีจุด')
  expectError(await actions.confirmPacking(LIST, { photoUrls: [up.url], spotId: SPOT_OFF }), 'ปิดใช้', 'จุดปิดใช้')
  assert.equal(row('packing_lists', LIST).status, 'picking')
  assert.equal(db.notifications.length, 0)
  expectOk(await actions.confirmPacking(LIST, { photoUrls: [up.url], spotId: SPOT1 }), 'ยืนยันจัดของ')
  const ready = row('packing_lists', LIST)
  assert.deepEqual([ready.status, ready.spot_id, ready.packed_by, ready.photo_urls], ['ready', SPOT1, PACKER, [up.url]])
  assert.ok(ready.packed_at && ready.staged_at)
  const notes = db.notifications.filter(n => n.type === 'packing_ready')
  assert.deepEqual(notes.map(n => n.user_id).sort(), [LEADER, STAFF1].sort(), 'แจ้งหัวหน้างาน + คนในอีเวนต์ ไม่รวมผู้ทำ')
  assert.ok(notes.every(n => n.reference_type === 'packing_list' && n.reference_id === LIST))
  assert.equal(logsOf('CONFIRM_PACKING').length, 1)
  pass('(f) confirmPacking: ไม่มีรูป / รูปจากที่อื่น / ไม่มีจุด / จุดปิดใช้ / ยังหยิบไม่ครบ = error · ครบ = พร้อมรับ + packing_ready ถึงหัวหน้างาน + event_staff (ไม่รวมผู้ทำ)')

  // ── (g) ความพร้อม "จัดของ" ──────────────────────────────────────────────────
  const trackingLead = {
    id: LEAD_WON, customer_name: 'บริษัท ทดสอบ จำกัด', event_name: 'สยาม', event_date: DAY, event_end_date: null, event_time: '10:00', event_end_time: '14:00',
    design_status: 'completed', supplier_note: null, backdrop_note: null, tracking_checklist: [], required_roles: {},
    events: [{ id: EV1, name: 'งานทดสอบ สยาม', event_date: DAY, status: null }], staff: [],
  }
  const readiness = async () => {
    const summaries = await queries.loadPackingListsForLeads(fakeClient as never, [LEAD_WON])
    return tracking.kitReadinessByLead([trackingLead], [], [], undefined, summaries).get(LEAD_WON)!
  }
  const summary = (await queries.loadPackingListsForLeads(fakeClient as never, [LEAD_WON]))[0]
  assert.deepEqual([summary.status, summary.lineCount, summary.pickedCount, summary.eventId], ['ready', 3, 3, EV1])
  assert.equal(tracking.isMissingKits(await readiness()), false, 'ใบ ready = ไม่ขาด')
  assert.deepEqual(tracking.getMissing(trackingLead, await readiness(), true).includes('kits'), false)

  // ── (h) แก้ไขหลังพร้อมรับ → กำลังหยิบ ──────────────────────────────────────────
  expectOk(await actions.reopenPacking(LIST), 'reopen')
  const reopened = row('packing_lists', LIST)
  assert.deepEqual([reopened.status, reopened.packed_at, reopened.staged_at, reopened.photo_urls], ['picking', null, null, [up.url]], 'เคลียร์ packed_at/staged_at ไม่ลบรูป')
  assert.equal(tracking.isMissingKits(await readiness()), true, 'ใบ picking = ขาด')
  expectError(await actions.reopenPacking(LIST), 'พร้อมรับ', 'reopen ซ้ำ')
  pass('(g) kitReadinessByLead + isMissingKits: ใบ ready = ไม่ขาด · ใบ picking = ขาด')
  pass('(h) reopenPacking → กำลังหยิบ · packed_at/staged_at null · รูปเดิมยังอยู่')

  // ── (i) ยกเลิกหยิบ / ยกเลิกใบ ────────────────────────────────────────────────
  expectOk(await actions.unpickLine(comp), 'unpick คอม')
  assert.equal(status(I1), 'available')
  assert.equal(lineOf(LIST, I1).picked_at, null)
  assert.equal(db.event_logs.filter(l => l.item_id === I1 && l.action === 'checkin').length, 1)
  expectError(await actions.unpickLine(comp), 'ยังไม่ได้หยิบ', 'unpick ซ้ำ')
  expectError(await actions.backToSelecting(LIST), 'ยกเลิกหยิบ', 'ถอยเป็นเลือกของตอนยังมีของที่หยิบ')

  expectOk(await actions.cancelPackingList(LIST), 'ยกเลิกใบ')
  assert.deepEqual([status(I1), status(B1), status(KI1), status(KI2), status(KI3)], ['available', 'available', 'available', 'available', 'damaged'], 'ทุกหน่วยกลับเป็นใช้ได้ (ของเสียคงเดิม)')
  assert.equal(bookings(EV1).length, 0, 'event_kits ของใบหาย')
  assert.equal(row('kits', K1).event_id, null)
  assert.equal(db.packing_lists.length, 0, 'ใบหาย')
  assert.equal(db.packing_list_items.length, 0, 'บรรทัดหายตาม (CASCADE)')
  assert.equal(logsOf('CANCEL_PACKING_LIST').length, 1)
  pass('(i) unpickLine คืนสถานะ · cancelPackingList → อุปกรณ์ available · event_kits ไม่มีแถว · ใบและบรรทัดหาย')

  // ── ถอยกลับเป็นเลือกของ (ใบใหม่ ยังไม่หยิบ) ───────────────────────────────────
  const second = expectOk(await actions.createPackingList(LEAD_WON, EV1), 'เปิดใบใหม่') as { id: string }
  const LIST2 = second.id
  expectOk(await actions.setPackingLines(LIST2, FULL_LINES), 'เลือกครบ (ใบใหม่)')
  expectOk(await actions.startPicking(LIST2), 'กำลังหยิบ (ใบใหม่)')
  expectOk(await actions.backToSelecting(LIST2), 'ถอยเป็นเลือกของ')
  assert.equal(row('packing_lists', LIST2).status, 'selecting')
  expectOk(await actions.startPicking(LIST2), 'กำลังหยิบอีกครั้ง')

  // ── เปลี่ยนของ (replacePackingLine — ปุ่ม "เปลี่ยนของ" ขั้นกำลังหยิบ) ──────────────────
  const compLine = lineOf(LIST2, I1).id as string
  expectError(await actions.replacePackingLine(lineOf(LIST2, B1).id as string, { itemId: B2 }), 'ทีมขาย', 'ตู้ที่ทีมขายเลือกเปลี่ยนไม่ได้')
  expectError(await actions.replacePackingLine(compLine, { itemId: I3 }), 'ไม่ได้อยู่ในตัวเลือก', 'เปลี่ยนเป็นหน่วยนอกตัวเลือก')
  expectError(await actions.replacePackingLine(compLine, { itemId: I1 }), 'หน่วยอื่น', 'เปลี่ยนเป็นหน่วยเดิม')
  expectError(await actions.replacePackingLine(compLine, { itemId: KI1 }), 'อยู่ในกระเป๋า', 'เปลี่ยนเป็นของในกระเป๋า')
  expectOk(await actions.replacePackingLine(compLine, { itemId: I2 }), 'เปลี่ยนคอม 1 → คอม 2')
  assert.equal(row('packing_list_items', compLine).item_id, I2)
  assert.equal(row('packing_list_items', compLine).picked_at, null)
  expectError(await actions.replacePackingLine(lineOf(LIST2, K1).id as string, { kitId: K1 }), 'หน่วยอื่น', 'เปลี่ยนกระเป๋าเป็นใบเดิม')
  assert.equal(bookings(EV1).length, 1, 'การจองกระเป๋าไม่เปลี่ยน')
  loginAs(OTHER)
  expectError(await actions.replacePackingLine(compLine, { itemId: I1 }), 'ทีมจัดของ', 'แผนกอื่นเปลี่ยนของไม่ได้')
  loginAs(PACKER)
  expectOk(await actions.replacePackingLine(compLine, { itemId: I1 }), 'เปลี่ยนกลับเป็นคอม 1')
  assert.equal(row('packing_list_items', compLine).item_id, I1)
  pass('replacePackingLine: ตู้ล็อก/นอกตัวเลือก/หน่วยเดิม/ของในกระเป๋า/แผนกอื่น = error · เปลี่ยนได้เฉพาะบรรทัดที่ยังไม่หยิบ')

  // ── (k) cleanupOrphanedItems ไม่รีเซ็ตของในใบที่ยังไม่คืนชั้น ─────────────────────
  expectOk(await actions.pickLine(lineOf(LIST2, I1).id as string), 'หยิบคอม (ใบใหม่)')
  expectOk(await actions.pickLine(lineOf(LIST2, K1).id as string), 'หยิบกระเป๋า (ใบใหม่)')
  // จำลองตัวชี้ kits.event_id หลุด (โค้ดเก่า) — ของในกระเป๋ายังต้องรอดเพราะอยู่ในใบ
  row('kits', K1).event_id = null
  const cleaned = expectOk(await cleanup.cleanupOrphanedItems(), 'cleanup') as { itemIds?: string[] }
  assert.deepEqual(cleaned.itemIds, [ORPH], 'รีเซ็ตเฉพาะของหลงทางจริง')
  assert.deepEqual([status(I1), status(KI1), status(KI2), status(ORPH)], ['in_use', 'in_use', 'in_use', 'available'])
  pass('(k) cleanupOrphanedItems ไม่รีเซ็ตของในใบกำลังหยิบ (อุปกรณ์เดี่ยว + ของในกระเป๋า) · ของหลงทางจริงยังถูกรีเซ็ต')

  // ── ใบของอีเวนต์ที่ปิดแล้วแก้ไม่ได้ ───────────────────────────────────────────────
  row('events', EV1).status = 'completed'
  expectError(await actions.unpickLine(lineOf(LIST2, I1).id as string), 'ปิดงาน', 'อีเวนต์ปิดแล้ว')
  expectError(await actions.cancelPackingList(LIST2), 'ปิดงาน', 'อีเวนต์ปิดแล้ว')
  row('events', EV1).status = null
  pass('อีเวนต์ปิดแล้ว = แก้ใบจัดของไม่ได้ (error ไทย)')

  // ── แจ้งเตือน packing_requested จาก setLeadPackages (งานตอบรับแล้ว) ─────────────────────────────
  loginAs(ADMIN)
  const before = db.notifications.length
  expectOk(await packageActions.setLeadPackages(LEAD_WON, [{ packageId: P1, quantity: 1, units: [{ requirementId: R2, itemId: B1, variant: 'ประกอบ 2' }] }]), 'บันทึกแพ็กเกจงานที่มีใบแล้ว')
  assert.equal(db.notifications.length, before, 'งานมีใบจัดของแล้ว = ไม่แจ้งซ้ำ')
  expectOk(await packageActions.setLeadPackages(LEAD_NOPKG, [{ packageId: P1, quantity: 1, units: [] }]), 'เลือกแพ็กเกจให้งานที่ตอบรับแล้ว')
  const req = db.notifications.slice(before)
  assert.deepEqual(req.map(n => [n.user_id, n.type, n.reference_type, n.reference_id]), [[PACKER, 'packing_requested', 'crm_lead', LEAD_NOPKG]], 'แจ้งสมาชิกทีมจัดของ (แผนกใน pool_duty_kits) ไม่รวมผู้ทำ')
  const quoteBefore = db.notifications.length
  expectOk(await packageActions.setLeadPackages(LEAD_QUOTE, [{ packageId: P1, quantity: 1, units: [] }]), 'เลือกแพ็กเกจให้ใบเสนอราคา')
  assert.equal(db.notifications.length, quoteBefore, 'งานยังไม่ตอบรับ = ไม่แจ้ง')
  pass('setLeadPackages → packing_requested ถึงทีมจัดของ (reference crm_lead) · งานที่มีใบแล้ว / ยังไม่ตอบรับ ไม่แจ้ง')

  // ── จุดรับของ (ตั้งค่าคลัง) ─────────────────────────────────────────────────────
  loginAs(OTHER)
  expectError(await spots.createPickupSpot({ name: 'จุด B', code: 'B' }), 'ดูแลอุปกรณ์', 'แผนกอื่นตั้งจุดไม่ได้')
  loginAs(ADMIN)
  const spotB = expectOk(await spots.createPickupSpot({ name: ' จุด B ', code: 'B', note: '' }), 'เพิ่มจุด') as { id: string }
  assert.deepEqual([row('pickup_spots', spotB.id).name, row('pickup_spots', spotB.id).note], ['จุด B', null])
  expectError(await spots.createPickupSpot({ name: 'ซ้ำ', code: 'A' }), 'รหัสนี้', 'รหัสซ้ำ = 23505 → ไทย')
  expectOk(await spots.updatePickupSpot(spotB.id, { name: 'จุด B2', code: 'B2', is_active: false }), 'แก้จุด')
  assert.deepEqual([row('pickup_spots', spotB.id).code, row('pickup_spots', spotB.id).is_active], ['B2', false])
  expectError(await spots.updatePickupSpot(spotB.id, { name: 'x', code: 'A' }), 'รหัสนี้', 'แก้เป็นรหัสซ้ำ')
  row('packing_lists', LIST2).spot_id = SPOT1
  expectError(await spots.deletePickupSpot(SPOT1), 'ปิดใช้แทน', 'ลบจุดที่มีใบอ้างถึง')
  expectOk(await spots.deletePickupSpot(spotB.id), 'ลบจุดที่ไม่มีใบ')
  assert.ok(!db.pickup_spots.some(s => s.id === spotB.id))
  assert.deepEqual(['CREATE_PICKUP_SPOT', 'UPDATE_PICKUP_SPOT', 'DELETE_PICKUP_SPOT'].map(a => logsOf(a).length), [1, 1, 1])
  pass('จุดรับของ: สิทธิ์ผู้ดูแลอุปกรณ์ · รหัสซ้ำ = error ไทย · ลบไม่ได้ถ้ามีใบอ้าง · log ครบ')

  // ── ตัวโหลดของหน้าจอ (รอบ B) ไม่พังกับข้อมูลชุดนี้ ──────────────────────────────
  const detail = await queries.loadPackingListDetail(fakeClient as never, LIST2)
  assert.ok(detail)
  assert.equal(detail!.lines.length, 3)
  assert.equal(detail!.scaffold.length, 3)
  assert.equal(detail!.lines.find(l => l.unitId === B1)?.pickBlock, null, 'ตู้ยังไม่หยิบ หยิบได้')
  assert.ok(detail!.bookings.every(b => b.eventId !== EV1), 'การจองของอีเวนต์ตัวเองไม่ปน')
  const queue = await queries.loadPackingQueue(fakeClient as never, '2026-10-07')
  assert.deepEqual([queue.awaiting.length, queue.active.length, queue.ready.length], [0, 1, 0])
  assert.equal(queue.active[0].list?.pickedCount, 2)
  const atSpot = await queries.loadListsAtSpot(fakeClient as never, SPOT1)
  assert.equal(atSpot.length, 0, 'ใบกำลังหยิบไม่ขึ้นที่จุดรับของ')
  pass('loadPackingListDetail / loadPackingQueue / loadListsAtSpot ทำงานกับฐานข้อมูลจำลอง (SCHEMA ครบ ไม่ใช้ .or())')

  // ══ เฟส 4: รับของ → คืนของ → ปิดงาน → คืนชั้น (P4-6 ข้อ l–s) ═══════════════════════════
  // ใบ LIST2 ตอนนี้: กำลังหยิบ · คอม 1 + กระเป๋า A หยิบแล้ว · ตู้ประกอบ ชุด 1 ยังไม่หยิบ · จุด A
  loginAs(PACKER)
  expectOk(await actions.pickLine(lineOf(LIST2, B1).id as string), 'หยิบตู้ (ใบใหม่)')
  const up2 = expectOk(await actions.uploadPackingPhoto(form({ listId: LIST2, file: photoFile() })), 'รูปจัดของ (ใบใหม่)') as { url: string }

  // ── (l) รับของ ─────────────────────────────────────────────────────────────
  loginAs(EVUSER)
  expectError(await actions.handOverPackingList(LIST2), 'พร้อมรับ', 'ใบกำลังหยิบรับของไม่ได้')
  loginAs(PACKER)
  expectOk(await actions.confirmPacking(LIST2, { photoUrls: [up2.url], spotId: SPOT1 }), 'ยืนยันจัดของ (ใบใหม่)')
  loginAs(CRMUSER)
  expectError(await actions.handOverPackingList(LIST2), 'อีเวนต์/สต็อก', 'ผู้ใช้ที่ไม่มีโมดูล events/stock รับของไม่ได้')
  loginAs(EVUSER)
  const allLineIds = lines(LIST2).map(l => l.id as string)
  expectError(await actions.handOverPackingList(LIST2, { lineIds: allLineIds.slice(1) }), 'ขาด 1', 'ติ๊กไม่ครบ = error ระบุจำนวน')
  assert.equal(row('packing_lists', LIST2).status, 'ready')
  assert.equal(row('jobs', JOB1).status, 'preparing')
  expectOk(await actions.handOverPackingList(LIST2, { lineIds: allLineIds }), 'รับของ (ผู้ใช้ที่มีแค่โมดูล events)')
  const out = row('packing_lists', LIST2)
  assert.deepEqual([out.status, out.handed_over_by], ['out', EVUSER])
  assert.ok(out.handed_over_at)
  assert.ok(lines(LIST2).every(l => l.handed_over_at), 'ทุกบรรทัด handed_over_at')
  assert.equal(row('jobs', JOB1).status, 'loading', 'ใบงานหน้างาน preparing → loading')
  const loadingActs = db.job_activities.filter(a => a.job_id === JOB1 && a.new_status === 'loading')
  assert.equal(loadingActs.length, 1)
  assert.deepEqual([loadingActs[0].old_status, loadingActs[0].description, loadingActs[0].created_by], ['preparing', 'ขนของอัตโนมัติ: ทีมรับของจากจุดรับของแล้ว', EVUSER])
  assert.equal(logsOf('HAND_OVER_PACKING').length, 1)
  assert.equal(logsOf('AUTO_LOADING_POOL_JOB').length, 1)
  expectError(await actions.handOverPackingList(LIST2), 'รับของไปแล้ว', 'รับของซ้ำ')
  assert.equal(db.job_activities.filter(a => a.new_status === 'loading').length, 1, 'ไม่ขยับซ้ำ')

  const spotCards = await queries.loadListsAtSpot(fakeClient as never, SPOT1, ['ready', 'out'], STAFF1)
  assert.equal(spotCards.length, 1)
  assert.deepEqual([spotCards[0].list?.status, spotCards[0].lines.length, spotCards[0].isMine, spotCards[0].eventClosed], ['out', 3, true, false])
  assert.equal(spotCards[0].lines.find(l => l.kit_id === K1)?.kitItems?.length, 4, 'บรรทัดกระเป๋ามีชิ้นในกระเป๋า')
  assert.deepEqual(spotCards[0].consumables, [{ kitId: K1, itemId: KC, name: 'กระดาษ', unit: 'แผ่น', kitQuantity: 1, alreadyUsed: null }])
  assert.equal((await queries.loadListsAtSpot(fakeClient as never, SPOT1, ['ready', 'out'], OTHER))[0].isMine, false)
  const queueOut = await queries.loadPackingQueue(fakeClient as never, '2026-10-07')
  assert.deepEqual([queueOut.ready.length, queueOut.out.length, queueOut.returned.length], [0, 1, 0])
  pass('(l) handOverPackingList: ผู้ใช้โมดูล events รับของได้ · ไม่มีสิทธิ์/ใบไม่ใช่ ready/ติ๊กไม่ครบ = error · ใบ out + ทุกบรรทัด handed_over_at · ใบงาน preparing → loading + job_activities · loadListsAtSpot มีบรรทัด/ชิ้นในกระเป๋า/วัสดุสิ้นเปลือง')

  // ── (m) คืนของ ─────────────────────────────────────────────────────────────
  const lI1 = lineOf(LIST2, I1).id as string, lB1 = lineOf(LIST2, B1).id as string, lK1 = lineOf(LIST2, K1).id as string
  const retPhoto = expectOk(await actions.uploadReturnPhoto(form({ listId: LIST2, file: photoFile('back.jpg') })), 'รูปตอนคืน') as { url: string }
  assert.ok(retPhoto.url.startsWith(`${PUBLIC_BASE}/packing-photos/${LIST2}/return_`), 'path <listId>/return_<ts>_<name>')
  loginAs(CRMUSER)
  expectError(await actions.uploadReturnPhoto(form({ listId: LIST2, file: photoFile() })), 'อีเวนต์/สต็อก', 'ไม่มีสิทธิ์อัปโหลดรูปตอนคืน')
  expectError(await actions.returnPackingList(LIST2, { lines: [], consumableUse: [], photoUrls: [] }), 'อีเวนต์/สต็อก', 'ไม่มีสิทธิ์คืนของ')
  loginAs(EVUSER)
  const use = [{ kitId: K1, itemId: KC, used: 3 }]
  expectError(
    await actions.returnPackingList(LIST2, { lines: [{ lineId: lI1, condition: 'damaged' }, { lineId: lK1, condition: 'available' }], consumableUse: use, photoUrls: [] }),
    'ตู้ประกอบ ชุด 1',
    'ไม่ครบสภาพ = error ระบุชื่อ',
  )
  expectError(
    await actions.returnPackingList(LIST2, { lines: [{ lineId: lI1, condition: 'broken' as never }, { lineId: lB1, condition: 'available' }, { lineId: lK1, condition: 'available' }], consumableUse: use, photoUrls: [] }),
    'สภาพไม่ถูกต้อง',
    'สภาพนอก 4 ค่า',
  )
  assert.equal(db.stock_movements.length, 0, 'ตรวจไม่ผ่าน = ยังไม่ตัดยอด')
  assert.equal(row('packing_lists', LIST2).status, 'out')
  const ret = expectOk(
    await actions.returnPackingList(LIST2, {
      lines: [{ lineId: lI1, condition: 'damaged', note: 'จอแตก' }, { lineId: lB1, condition: 'available' }, { lineId: lK1, condition: 'available' }],
      kitItems: [{ itemId: KI2, condition: 'maintenance' }],
      consumableUse: use,
      photoUrls: [retPhoto.url, 'https://evil.test/x.jpg'],
      note: 'กลับถึงออฟฟิศ',
    }),
    'คืนของ',
  ) as { success: true; eventClosed: boolean }
  assert.equal(ret.eventClosed, false, 'ผู้คืนไม่มีสิทธิ์ปิดงาน → eventClosed false')
  assert.deepEqual([status(I1), status(B1), status(KI1), status(KI2), status(KI3), status(KC)], ['damaged', 'in_use', 'in_use', 'maintenance', 'damaged', 'available'], 'เสีย/ซ่อมตั้งทันที · ใช้ได้ยัง in_use')
  assert.equal(db.event_logs.filter(l => l.item_id === I1 && l.action === 'checkin' && l.condition === 'damaged' && l.kit_id === null).length, 1)
  assert.equal(db.stock_movements.length, 1, 'วัสดุสิ้นเปลืองถูกตัด 1 ครั้ง')
  assert.deepEqual([db.stock_movements[0].reason, db.stock_movements[0].delta, db.stock_movements[0].event_id, db.stock_movements[0].kit_id], ['use', -3, EV1, K1])
  assert.equal(row('items', KC).quantity, 7)
  const returned = row('packing_lists', LIST2)
  assert.deepEqual([returned.status, returned.returned_by, returned.return_note, returned.return_photo_urls], ['returned', EVUSER, 'กลับถึงออฟฟิศ', [retPhoto.url]], 'รูปจากที่อื่นไม่นับ')
  assert.deepEqual([row('packing_list_items', lI1).return_condition, row('packing_list_items', lI1).return_note, row('packing_list_items', lB1).return_condition], ['damaged', 'จอแตก', 'available'])
  assert.ok(lines(LIST2).every(l => l.returned_at))
  assert.equal(row('events', EV1).status, null, 'อีเวนต์ยังไม่ปิด')
  assert.deepEqual(db.notifications.filter(n => n.type === 'packing_returned').map(n => [n.user_id, n.reference_type, n.reference_id]), [[PACKER, 'packing_list', LIST2]], 'กระดิ่งถึงทีมจัดของ')
  assert.equal(logsOf('RETURN_PACKING').length, 1)
  expectError(await actions.returnPackingList(LIST2, { lines: [], consumableUse: use, photoUrls: [] }), 'คืนของไปแล้ว', 'คืนซ้ำ')
  assert.equal(db.stock_movements.length, 1, 'คืนซ้ำไม่ตัดอีก')
  const queueRet = await queries.loadPackingQueue(fakeClient as never, '2026-10-07')
  assert.deepEqual([queueRet.out.length, queueRet.returned.length], [0, 1])
  const summaryRet = await queries.loadReturnSummary(fakeClient as never, EV1)
  assert.equal(summaryRet?.list.id, LIST2)
  assert.equal(summaryRet?.lines.find(l => l.unitId === I1)?.return_condition, 'damaged')
  assert.deepEqual(summaryRet?.consumables.map(c => c.alreadyUsed), [3])
  assert.equal(summaryRet?.people[EVUSER], 'อีเวนต์ ทดสอบ')
  assert.equal(await queries.loadReturnSummary(fakeClient as never, EV_OTHER), null, 'อีเวนต์ไม่มีใบ = null')
  pass('(m) returnPackingList: ไม่ครบสภาพ/สภาพผิด = error ไม่ตัดยอด · damaged ทันที, ใช้ได้ยัง in_use · วัสดุสิ้นเปลืองตัด 1 ครั้ง (คืนซ้ำไม่ตัด) · ใบ returned · อีเวนต์ยังเปิด (eventClosed false) · กระดิ่ง packing_returned')

  // ── (n) ปิดงานจากใบ ─────────────────────────────────────────────────────────
  expectError(await actions.closeEventFromPacking(LIST2), 'ไม่มีสิทธิ์ปิดงาน', 'ผู้ไม่มีสิทธิ์ปิดงาน')
  assert.equal(row('events', EV1).status, null)
  loginAs(CLOSER)
  expectOk(await actions.closeEventFromPacking(LIST2), 'ปิดงานจากใบ')
  assert.equal(row('events', EV1).status, 'completed')
  assert.equal(db.event_closures.length, 1)
  const snap = db.event_closures[0].kits_snapshot as { kitId: string; isLoose?: boolean; items: { itemId: string; status: string; isConsumable?: boolean; used?: number }[] }[]
  const bagSnap = snap.find(k => k.kitId === K1)!
  assert.deepEqual(
    [bagSnap.items.find(i => i.itemId === KI1)?.status, bagSnap.items.find(i => i.itemId === KI2)?.status, bagSnap.items.find(i => i.itemId === KC)?.used],
    ['available', 'maintenance', 3],
    'kits_snapshot: ชิ้นที่ยังออกงาน = ใช้ได้ · ชิ้นซ่อม · วัสดุสิ้นเปลืองใช้ไปจากที่ตัดแล้ว',
  )
  const looseSnap = snap.find(k => k.isLoose)!
  assert.deepEqual(looseSnap.items.map(i => [i.itemId, i.status]).sort(), [[B1, 'available'], [I1, 'damaged']].sort(), 'looseItems = อุปกรณ์เดี่ยว + สภาพตอนคืน')
  assert.deepEqual(db.event_closures[0].image_urls, [retPhoto.url])
  assert.equal(db.event_closures[0].closed_by, CLOSER)
  assert.equal(row('jobs', JOB1).status, 'done', 'ใบงานหน้างาน → done')
  assert.deepEqual([status(I1), status(B1), status(KI1), status(KI2)], ['damaged', 'in_use', 'in_use', 'maintenance'], 'items.status ไม่ถูกแตะ')
  assert.equal(db.stock_movements.length, 1, 'ปิดงานไม่ตัดยอดซ้ำ')
  assert.deepEqual([logsOf('CLOSE_EVENT').length, logsOf('CLOSE_EVENT_FROM_PACKING').length], [1, 1])
  expectError(await actions.closeEventFromPacking(LIST2), 'ปิดงานไปแล้ว', 'ปิดซ้ำ')
  assert.equal(db.event_closures.length, 1)
  pass('(n) closeEventFromPacking: ไม่มีสิทธิ์ = error · ผู้มีสิทธิ์ → completed + event_closures 1 แถว (kits_snapshot + looseItems) + ใบงาน done · items.status ไม่ถูกแตะ · ปิดซ้ำ = error')

  // ── หน้าปิดงานเดิม (อีเวนต์ไม่มีใบจัดของ) ยังทำงานแบบเดิม ──────────────────────────────
  loginAs(EVUSER)
  expectError(await events.processEventReturn(EV_OTHER, []), 'ไม่มีสิทธิ์ปิดงาน', 'processEventReturn ต้องมีสิทธิ์ปิดงาน')
  loginAs(CLOSER)
  expectError(await events.processEventReturn(EV1, []), 'ปิดงานไปแล้ว', 'processEventReturn อีเวนต์ที่ปิดแล้ว')
  expectOk(await events.processEventReturn(EV_OTHER, [], ['https://x.test/a.jpg']), 'processEventReturn อีเวนต์ไม่มีใบ')
  assert.equal(row('events', EV_OTHER).status, 'completed')
  assert.equal(db.event_closures.length, 2)
  assert.deepEqual(db.event_closures[1].kits_snapshot, [], 'ไม่มีกระเป๋า ไม่มีกลุ่มอุปกรณ์เดี่ยว')
  pass('processEventReturn (ผ่าน closeEventCore keepItemStatuses:false): สิทธิ์/ปิดแล้ว = ข้อความเดิม · อีเวนต์ไม่มีใบปิดได้แบบเดิม')

  // ── (q) ผู้ใช้แผนกอื่น / ผู้รับของ คืนชั้นไม่ได้ ──────────────────────────────────────
  for (const who of [OTHER, EVUSER]) {
    loginAs(who)
    expectError(await actions.restockLine(lI1), 'ทีมจัดของ', 'ไม่ใช่ทีมจัดของ restockLine')
    expectError(await actions.restockAll(LIST2), 'ทีมจัดของ', 'ไม่ใช่ทีมจัดของ restockAll')
  }
  assert.ok(lines(LIST2).every(l => !l.restocked_at))
  pass('(q) แผนกอื่น / ผู้รับของที่ไม่ใช่ทีมจัดของ คืนชั้นไม่ได้')

  // ── (p) คืนชั้นทีละบรรทัด ─────────────────────────────────────────────────────
  loginAs(PACKER)
  const r1 = expectOk(await actions.restockLine(lI1), 'คืนชั้นคอม (เสีย)') as { listDone: boolean }
  assert.equal(r1.listDone, false)
  assert.equal(status(I1), 'damaged', 'ของเสียยังเสีย')
  const r2 = expectOk(await actions.restockLine(lB1), 'คืนชั้นตู้') as { listDone: boolean }
  assert.equal(r2.listDone, false)
  assert.equal(status(B1), 'available', 'อุปกรณ์เดี่ยว in_use → available')
  assert.equal(db.event_logs.filter(l => l.item_id === B1 && l.action === 'checkin' && l.kit_id === null && l.condition === 'good' && l.note === 'คืนชั้น (ใบจัดของ)').length, 1)
  expectError(await actions.restockLine(lB1), 'คืนชั้นแล้ว', 'restockLine ซ้ำ')
  assert.ok(bookings(EV1)[0].packed_at, 'ก่อนคืนชั้นกระเป๋า packed_at ยังอยู่')
  const r3 = expectOk(await actions.restockLine(lK1), 'คืนชั้นกระเป๋า (อีเวนต์ปิดแล้ว)') as { listDone: boolean }
  assert.equal(r3.listDone, true)
  assert.deepEqual([status(KI1), status(KI2), status(KI3), status(KC)], ['available', 'maintenance', 'damaged', 'available'], 'ชิ้นที่ออกงาน → available · ซ่อม/เสียคงเดิม')
  assert.equal(bookings(EV1)[0].packed_at, null, 'event_kits.packed_at ถูกคิดใหม่ (syncPacked)')
  const doneList = row('packing_lists', LIST2)
  assert.deepEqual([doneList.status, doneList.restocked_by], ['done', PACKER])
  assert.ok(doneList.restocked_at)
  assert.ok(lines(LIST2).every(l => l.restocked_at && l.restocked_by === PACKER))
  assert.equal(row('kits', K1).event_id, null, 'recomputeKitPointers: อีเวนต์ปิดแล้ว กระเป๋าว่าง')
  assert.deepEqual([logsOf('RESTOCK_PACKING_LINE').length, logsOf('RESTOCK_PACKING').length], [3, 1])
  expectError(await actions.restockLine(lI1), 'คืนชั้นครบแล้ว', 'ใบ done คืนชั้นอีกไม่ได้')
  pass('(p) restockLine: เสียคงเสีย · อุปกรณ์เดี่ยว in_use → available + event_logs · กระเป๋า: ชิ้นที่ออกงาน → available ชิ้นซ่อม/เสียคงเดิม · packed_at คิดใหม่ · ครบ → done · ซ้ำ = error')

  // ── (o) ผู้คืนเป็นแอดมิน → ปิดอีเวนต์ในขั้นเดียว + คืนชั้นทั้งใบ ─────────────────────────────
  const EV3 = uid(203), LIST3 = uid(851)
  db.events.push({ id: EV3, name: 'งานแอดมินคืนเอง', location: 'ลาดพร้าว', event_date: DAY, event_time: null, event_end_time: null, status: null, crm_lead_id: null, phase: 'main', created_at: NOW })
  db.packing_lists.push({ ...clone(DEFAULTS.packing_lists), id: LIST3, event_id: EV3, lead_id: null, status: 'out', spot_id: SPOT1, packed_at: NOW, handed_over_at: NOW, created_at: NOW, updated_at: NOW })
  db.packing_list_items.push({ ...clone(DEFAULTS.packing_list_items), id: uid(861), list_id: LIST3, item_id: I2, picked_at: NOW, handed_over_at: NOW, created_at: NOW })
  row('items', I2).status = 'in_use'
  loginAs(ADMIN)
  const adminRet = expectOk(await actions.returnPackingList(LIST3, { lines: [{ lineId: uid(861), condition: 'available' }], consumableUse: [], photoUrls: [] }), 'แอดมินคืนของ') as { eventClosed: boolean }
  assert.equal(adminRet.eventClosed, true, 'ผู้คืนมีสิทธิ์ปิดงาน → ปิดในขั้นเดียว')
  assert.equal(row('events', EV3).status, 'completed')
  assert.equal(db.event_closures.length, 3)
  assert.equal(status(I2), 'in_use', 'ใช้ได้ยังรอคืนชั้น')
  const all3 = expectOk(await actions.restockAll(LIST3), 'คืนชั้นทั้งใบ') as { listDone: boolean }
  assert.equal(all3.listDone, true)
  assert.deepEqual([status(I2), row('packing_lists', LIST3).status], ['available', 'done'])
  expectError(await actions.restockAll(LIST3), 'คืนชั้นครบแล้ว', 'restockAll ซ้ำ')
  pass('(o) แอดมินคืนของ → eventClosed true ในขั้นเดียว · restockAll → ใบ done')

  // ── (r) cleanupOrphanedItems หลังใบ done ทำงานตามปกติ ────────────────────────────────
  row('items', B1).status = 'in_use' // จำลองสถานะค้าง — ใบของ B1 คืนชั้นแล้ว จึงไม่ถูกกัน
  const cleaned2 = expectOk(await cleanup.cleanupOrphanedItems(), 'cleanup หลังใบ done') as { itemIds?: string[] }
  assert.deepEqual(cleaned2.itemIds, [B1])
  assert.equal(status(B1), 'available')
  pass('(r) cleanupOrphanedItems หลังใบ done: ของในใบ done ไม่ถูกกัน รีเซ็ตได้ตามปกติ')

  // ── (s) คำเตือนอุปกรณ์อาจไม่พอนับจากใบจัดของจริง (packedUnits) ───────────────────────────
  const EV4 = uid(204), LIST4 = uid(852)
  db.events.push({ id: EV4, name: 'งานไม่มีแพ็กเกจ (วันงาน)', location: 'บางนา', event_date: DAY, event_time: null, event_end_time: null, status: null, crm_lead_id: LEAD_NOPKG, phase: 'main', created_at: NOW })
  db.packing_lists.push({ ...clone(DEFAULTS.packing_lists), id: LIST4, event_id: EV4, lead_id: LEAD_NOPKG, status: 'picking', created_at: NOW, updated_at: NOW })
  db.packing_list_items.push(
    { ...clone(DEFAULTS.packing_list_items), id: uid(871), list_id: LIST4, package_id: P1, category_id: CAT_COMP, item_id: I2, created_at: NOW },
    { ...clone(DEFAULTS.packing_list_items), id: uid(872), list_id: LIST4, item_id: B2, created_at: NOW }, // ของเสริม (ไม่มีประเภท) ไม่นับ
  )
  const cap = await capacity.loadCapacityInputs(fakeClient as never, { leadIds: [LEAD_WON] })
  const capNoPkg = cap.jobs.find(j => j.leadId === LEAD_NOPKG)!
  assert.deepEqual(capNoPkg.packedUnits, [{ categoryId: CAT_COMP, unitId: I2 }], 'ใบที่ยังไม่คืนชั้น → packedUnits (เฉพาะบรรทัดที่มีประเภท)')
  assert.equal(cap.jobs.find(j => j.leadId === LEAD_WON)!.packedUnits, undefined, 'ใบ done ไม่นับ → ใช้แพ็กเกจแบบเดิม')
  const capWarnings = packageLogic.capacityWarnings({
    target: cap.jobs.find(j => j.leadId === LEAD_WON)!,
    others: [capNoPkg],
    packages: cap.packages,
    categories: cap.categories,
    unitsByCategory: cap.unitsByCategory,
  })
  assert.ok(capWarnings.every(w => w.demandPlanned === 0), 'งานที่มีใบจัดของไม่มีส่วนประมาณการ')
  pass('(s) loadCapacityInputs: ใบที่ยังไม่คืนชั้น → packedUnits · capacityWarnings ไม่นับประมาณการของงานที่มีใบ')

  // ── หน้าปิดงานเดิมกับกระเป๋าที่จองตรง (ไม่มีใบจัดของ): ตั้งสถานะ + ตัดยอด + snapshot แบบเดิม ─────────────
  const EV5 = uid(205)
  db.events.push({ id: EV5, name: 'งานจองกระเป๋าตรง', location: 'ปากเกร็ด', event_date: DAY, event_time: null, event_end_time: null, status: null, crm_lead_id: null, phase: 'main', created_at: NOW })
  db.event_kits.push({ id: uid(881), event_id: EV5, kit_id: K1, packed_at: null, packed_by: null, created_at: NOW })
  row('items', KI1).status = 'in_use'
  loginAs(CLOSER)
  expectError(await events.processEventReturn(EV5, [{ itemId: KI1, status: 'in_use' }]), 'สถานะอุปกรณ์ไม่ถูกต้อง', 'สถานะนอก 4 ค่า (ข้อความเดิม)')
  expectError(await events.processEventReturn(EV5, [{ itemId: KC, status: 'available' }]), 'วัสดุสิ้นเปลืองไม่ต้องเลือกสถานะ', 'วัสดุสิ้นเปลืองเลือกสถานะไม่ได้ (ข้อความเดิม)')
  const movesBefore = db.stock_movements.length
  expectOk(await events.processEventReturn(EV5, [{ itemId: KI1, status: 'damaged' }], [], [{ kitId: K1, itemId: KC, used: 2 }]), 'ปิดงานแบบเดิม')
  assert.equal(status(KI1), 'damaged', 'keepItemStatuses:false ตั้ง items.status ตามที่เลือก')
  assert.equal(db.stock_movements.length, movesBefore + 1)
  assert.equal(row('items', KC).quantity, 5)
  assert.equal(row('events', EV5).status, 'completed')
  const snap5 = db.event_closures[db.event_closures.length - 1].kits_snapshot as { kitId: string; items: { itemId: string; status: string; used?: number }[] }[]
  assert.deepEqual([snap5.length, snap5[0].kitId, snap5[0].items.find(i => i.itemId === KI1)?.status, snap5[0].items.find(i => i.itemId === KC)?.used], [1, K1, 'damaged', 2])
  pass('processEventReturn กับกระเป๋าที่จองตรง: ข้อความ error เดิม · ตั้งสถานะ + ตัดยอด 1 ครั้ง + snapshot แบบเดิม (ไม่มีกลุ่มอุปกรณ์เดี่ยว)')

  assert.ok(ops.length > 0)
  console.log('\npacking-flow: ผ่านทั้งหมด')
}

main().catch(e => {
  console.error('FAIL ', e)
  process.exit(1)
})
