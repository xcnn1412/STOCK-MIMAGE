// ใบจัดของ (เฟส 3) — รัน server action จริงกับฐานข้อมูลจำลองในหน่วยความจำ
// Run:  npx tsx scripts/packing-flow.check.ts
//
// ไม่แตะฐานข้อมูล/สตอเรจจริง ไม่ต้องมี env: แทน next/headers, next/cache และ @/lib/supabase-server ด้วยตัวจำลอง
// (เทคนิคเดียวกับ scripts/purchasing-flow.check.ts) · logger / notifications ใช้ตัวจริงเขียนลงตารางจำลอง
// ฐานข้อมูลจำลองมี SCHEMA ต่อตาราง (อ้างคอลัมน์ที่ไม่มี = ล้ม), ตัดผลที่ 1,000 แถวเหมือน PostgREST, .or() = throw
// ครอบคลุม docs/specs/equipment-flow.md เกณฑ์ P3-6 ข้อ (a)–(k) · คนและงานทั้งหมดสังเคราะห์
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
  profiles: ['id', 'full_name', 'nickname', 'role', 'department', 'is_approved', 'active_session_id'],
  job_settings: ['id', 'category', 'value', 'label_th', 'label_en', 'color', 'sort_order', 'is_active'],
  crm_leads: ['id', 'customer_name', 'event_location', 'event_date', 'event_time', 'event_end_time', 'status', 'archived_at', 'created_by', 'quoted_price', 'package_name', 'created_at', 'updated_at'],
  events: ['id', 'name', 'location', 'event_date', 'event_time', 'event_end_time', 'status', 'crm_lead_id', 'phase', 'created_at'],
  event_staff: ['id', 'event_id', 'user_id', 'role', 'created_at'],
  jobs: ['id', 'job_type', 'status', 'claimed_by', 'crm_lead_id', 'archived_at', 'created_at'],
  equipment_categories: ['id', 'name', 'sort_order', 'is_active', 'sales_pick', 'variants', 'created_at'],
  items: ['id', 'name', 'serial_number', 'status', 'category_id', 'shelf_id', 'is_consumable', 'created_at'],
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
}

const MAX_ROWS = 1000

// ── ข้อมูลตั้งต้น ──────────────────────────────────────────────────────────────
const person = (id: string, full_name: string, role: string, department: string): Row =>
  ({ id, full_name, nickname: null, role, department, is_approved: true, active_session_id: `sess-${id}` })
const item = (id: string, name: string, category_id: string | null, status = 'available', extra: Row = {}): Row =>
  ({ id, name, serial_number: null, status, category_id, shelf_id: null, is_consumable: false, created_at: NOW, ...extra })

const lead0: Row = { event_date: DAY, event_time: null, event_end_time: null, archived_at: null, created_by: ADMIN, quoted_price: null, package_name: null, created_at: NOW, updated_at: NOW }

const db: Record<string, Row[]> = {
  profiles: [
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin', 'ผู้บริหาร'),
    person(PACKER, 'นักจัด ทดสอบ', 'staff', 'ทีมจัดของ'),
    person(OTHER, 'คนออกแบบ ทดสอบ', 'staff', 'ฝ่ายออกแบบ'),
    person(LEADER, 'หัวหน้างาน ทดสอบ', 'staff', 'ทีมออกหน้างาน'),
    person(STAFF1, 'สตาฟ ทดสอบ', 'staff', 'สตาฟ'),
  ],
  job_settings: [{ id: uid(901), category: 'pool_duty_kits', value: 'ทีมจัดของ', label_th: 'ทีมจัดของ', label_en: 'ทีมจัดของ', color: null, sort_order: 0, is_active: true }],
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
  jobs: [{ id: JOB1, job_type: 'onsite', status: 'preparing', claimed_by: LEADER, crm_lead_id: LEAD_WON, archived_at: null, created_at: NOW }],
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
    item(KC, 'กระดาษ', null, 'available', { is_consumable: true }),
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
const fakeClient = { from: (table: string) => new Query(table), storage }

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient, removeStorageByUrls: async () => {} }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {} }],
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

  assert.ok(ops.length > 0)
  console.log('\npacking-flow: ผ่านทั้งหมด')
}

main().catch(e => {
  console.error('FAIL ', e)
  process.exit(1)
})
