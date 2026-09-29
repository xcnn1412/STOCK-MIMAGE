// จัดซื้อ (/jobs/purchasing) — รัน server action จริง + data.ts กับฐานข้อมูลจำลองในหน่วยความจำ
// Run:  npx tsx scripts/purchasing-flow.check.ts
//
// ไม่แตะฐานข้อมูลหรือสตอเรจจริง ไม่ต้องมี env: แทน next/headers, next/cache และ @/lib/supabase-server
// ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/salary-edit-flow.check.ts) — removeStorageByUrls ใช้ตัวจริง
// กับสตอเรจจำลองที่จดทุกคำสั่ง · คนและงานทั้งหมดสังเคราะห์
// ครอบคลุม docs/specs/purchasing-checklist.md หัวข้อ Testing Decisions (ข้อ a–n) + data.ts (ข้อ o)
// + หัวข้อ "ผูกใบเบิก" (ข้อ p–x: ค้น/ผูก/เลิกผูกใบเบิก, ตัดข้อมูลใบเบิกตามสิทธิ์, ฐานข้อมูลที่ยังไม่มีคอลัมน์, หน้าใบเบิก)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "purchasing-flow: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { randomUUID } from 'node:crypto'
import { addDays, bangkokDate, type PurchaseStatus } from '../app/(authenticated)/jobs/purchasing/purchasing-logic'

process.env.SESSION_SECRET = 'purchasing-flow-check'

// ── คนและงาน (สังเคราะห์) ────────────────────────────────────────────────────
type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), COORD = uid(2), CREATOR = uid(3), OTHER = uid(4), BUYER = uid(5), OWNER = uid(6), PENDING = uid(7)
const LEAD_WON = uid(101), LEAD_SUCCESS = uid(102), LEAD_QUOTE = uid(103), LEAD_REJECTED = uid(104)
const LEAD_ARCHIVED = uid(105), LEAD_OLD = uid(106), LEAD_EDGE = uid(107)
// ใบเบิก (expense_claims) — B = ของคนซื้อ (BUYER) · O = ของคนอื่น (OTHER) · C = ของคนสร้าง (CREATOR)
const CLAIM_B1 = uid(301), CLAIM_B2 = uid(302), CLAIM_O = uid(303), CLAIM_C = uid(304)
const CLAIM_B_REJECTED = uid(305), CLAIM_B_CANCELLED = uid(306), CLAIM_B_PETTY = uid(307)

const TODAY = bangkokDate(Date.now())
const NOW_ISO = new Date().toISOString()
const BUCKET = 'purchase-attachments'
const PUBLIC_BASE = 'https://fake.supabase.test/storage/v1/object/public'

const person = (id: string, full_name: string, role: string, department: string, is_approved = true): Row =>
  ({ id, full_name, nickname: null, role, department, is_approved, active_session_id: `sess-${id}` })
const lead = (id: string, status: string, customer_name: string, event_location: string, days: number, archived = false): Row =>
  ({ id, status, customer_name, event_location, event_date: addDays(TODAY, days), event_end_date: null, archived_at: archived ? NOW_ISO : null })
/** ใบเบิกที่สร้างเมื่อ ageDays วันก่อน (ผลค้นเรียงใหม่สุดก่อนตาม created_at) */
const expenseClaim = (
  id: string, claim_number: string, claim_type: string, status: string, submitted_by: string,
  title: string, amount: number, ageDays: number, extra: Row = {}
): Row => ({
  id, claim_number, claim_type, status, submitted_by, title, amount, actual_spent_amount: null,
  expense_date: addDays(TODAY, -ageDays), pettycash_fund_id: null,
  created_at: new Date(Date.now() - ageDays * 86_400_000).toISOString(), ...extra,
})

const db: Record<string, Row[]> = {
  profiles: [
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin', 'ผู้บริหาร'),
    person(COORD, 'ประสาน ทดสอบ', 'staff', 'ฝ่ายประสานงาน'),
    person(CREATOR, 'คนสร้าง ทดสอบ', 'staff', 'สตาฟ'),
    person(OTHER, 'คนอื่น ทดสอบ', 'staff', 'สตาฟ'),
    person(BUYER, 'คนซื้อ ทดสอบ', 'staff', 'ทีมออกหน้างาน'),
    person(OWNER, 'เจ้าของใบ ทดสอบ', 'staff', 'สตาฟ'),
    person(PENDING, 'รออนุมัติ ทดสอบ', 'staff', 'สตาฟ', false),
  ],
  crm_leads: [
    lead(LEAD_WON, 'accepted', 'บริษัท สยามพาราไดซ์ จำกัด', 'สยามพารากอน', 5),
    lead(LEAD_SUCCESS, 'Success', 'คุณบี แต่งงาน', 'โรงแรมริมน้ำ', 1),
    lead(LEAD_QUOTE, 'quotation_sent', 'สยามดิสคัฟเวอรี่', 'สยาม', 3),
    lead(LEAD_REJECTED, 'rejected', 'สยามปฏิเสธ', 'สยาม', 2),
    lead(LEAD_ARCHIVED, 'accepted', 'สยามเก็บคลัง', 'สยาม', 4, true),
    lead(LEAD_OLD, 'accepted', 'งานเก่าเดือนก่อน', 'บางนา', -10),
    lead(LEAD_EDGE, 'ปิด', 'งานขอบเจ็ดวัน', 'รังสิต', -7),
  ],
  purchase_lists: [],
  purchase_items: [],
  purchase_templates: [],
  notifications: [],
  activity_logs: [],
  // ใบที่ผูกไม่ได้ (ปฏิเสธ / ยกเลิก / เงินสดย่อย) ใหม่สุด — พิสูจน์ว่าถูกคัดออกด้วยเงื่อนไข ไม่ใช่ถูกตัดด้วยเพดาน 20 ใบ
  expense_claims: [
    expenseClaim(CLAIM_B1, 'EXP-202609-001', 'event', 'pending', BUYER, 'ค่าป้ายไวนิล งานสยาม', 1500, 5),
    expenseClaim(CLAIM_B2, 'EXP-202609-002', 'advance', 'refund_confirmed', BUYER, 'ทดลองจ่ายค่าดอกไม้', 3000, 4, { actual_spent_amount: 2750.5 }),
    expenseClaim(CLAIM_O, 'EXP-202609-003', 'event', 'approved', OTHER, 'ค่าเช่าขาตั้งกล้อง', 800, 3),
    expenseClaim(CLAIM_C, 'EXP-202609-004', 'other', 'draft', CREATOR, 'ของใช้ส่วนกลาง', 450, 2),
    expenseClaim(CLAIM_B_REJECTED, 'EXP-202609-005', 'other', 'rejected', BUYER, 'ใบที่ถูกปฏิเสธ', 100, 1),
    expenseClaim(CLAIM_B_CANCELLED, 'EXP-202609-006', 'event', 'cancelled', BUYER, 'ใบที่ยกเลิกแล้ว', 100, 1),
    expenseClaim(CLAIM_B_PETTY, 'EXP-202609-007', 'petty_cash', 'paid', BUYER, 'เงินสดย่อยเดือนกันยายน', 5000, 1),
    // ใบเก่าของฝ่ายประสานงาน 22 ใบ — แอดมินค้นแล้วต้องได้ไม่เกิน 20 ใบ
    ...Array.from({ length: 22 }, (_, i) =>
      expenseClaim(uid(400 + i), `EXP-202608-${String(i + 1).padStart(3, '0')}`, 'other', 'paid', COORD, `ค่าใช้จ่ายเดือนก่อน ${i + 1}`, 100 + i, 30 + i)),
  ],
}

// ── ฐานข้อมูลจำลอง (PostgREST เฉพาะส่วนที่โมดูลนี้ใช้) ──────────────────────────
/** ตาราง → error ที่ทุกคำขอจะได้ (จำลองยังไม่รัน migration / ฐานข้อมูลล่ม) */
const failTables = new Map<string, DbError>()
/** ตารางที่ update จะพัง (ทดสอบการคืนไฟล์ที่อัปโหลดแล้ว) */
const failUpdates = new Set<string>()
/** ตาราง → จำนวน select ถัดไปที่จะตอบว่าง (จำลองสองคนกดพร้อมกัน: ตรวจแล้วยังไม่มี แต่ insert ชน) */
const hideNextSelects = new Map<string, number>()
/** ตารางที่แค่เรียก from() ก็ throw (จำลองเครือข่ายหลุด / client สร้างไม่ได้) */
const throwTables = new Set<string>()
/** ตาราง → คอลัมน์ที่ยังไม่มี: คำขอที่อ้างคอลัมน์นั้น (select / filter / order / เขียน) ได้ error นี้ (จำลองรัน migration รุ่นก่อน) */
const missingColumns = new Map<string, { column: string; error: DbError }>()
/** ทุกสตริงที่ส่งเข้า .or() */
const orFilters: string[] = []

const DEFAULTS: Record<string, Row> = {
  purchase_lists: { crm_lead_id: null, note: null, budget: null, due_date: null, owner_id: null, created_by: null },
  purchase_items: {
    kind: 'buy', status: 'planning', quantity: null, est_price: null, actual_price: null, vendor: null, link_url: null,
    tracking_no: null, assignee_id: null, due_date: null, note: null, images: [], expense_claim_id: null, sort_order: 0,
    status_changed_at: null, status_changed_by: null, done_at: null, created_by: null,
  },
  purchase_templates: { items: [], created_by: null },
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

class Query implements PromiseLike<Result> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] = {}
  private returning = false
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private start = 0
  private end = Number.POSITIVE_INFINITY
  private one: 'single' | 'maybeSingle' | null = null
  /** ทุกคอลัมน์ที่คำขออ้างถึง — ใช้จำลองฐานข้อมูลที่ยังไม่มีคอลัมน์ (missingColumns) */
  private used = new Set<string>()
  constructor(private table: string) {}

  select(cols = '*') { this.use(...cols.split(',')); if (this.action !== 'select') this.returning = true; return this }
  insert(rows: Row | Row[]) { this.use(...[rows].flat().flatMap(r => Object.keys(r))); this.action = 'insert'; this.payload = rows; return this }
  update(values: Row) { this.use(...Object.keys(values)); this.action = 'update'; this.payload = values; return this }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { return this.where(c, r => r[c] === v) }
  neq(c: string, v: unknown) { return this.where(c, r => r[c] != null && r[c] !== v) }
  in(c: string, vs: unknown[]) { return this.where(c, r => vs.includes(r[c])) }
  is(c: string, v: null) { assert.equal(v, null); return this.where(c, r => r[c] == null) }
  gte(c: string, v: string) { return this.where(c, r => r[c] != null && String(r[c]) >= v) }
  not(c: string, op: string, v: string) {
    assert.equal(op, 'in', 'ตัวจำลองรองรับเฉพาะ not(..., "in", ...)')
    const values = v.replace(/^\(|\)$/g, '').split(',')
    return this.where(c, r => r[c] != null && !values.includes(String(r[c])))
  }
  or(expr: string) {
    orFilters.push(expr)
    const conds = expr.split(',').map(cond => {
      const [col, op, ...rest] = cond.split('.')
      assert.equal(op, 'ilike', `ตัวจำลองรองรับเฉพาะ ilike ใน or(): ${cond}`)
      return { col, re: new RegExp(`^${rest.join('.').split('*').map(escapeRe).join('.*')}$`, 'i') }
    })
    this.use(...conds.map(c => c.col))
    return this.where('', r => conds.some(({ col, re }) => typeof r[col] === 'string' && re.test(r[col] as string)))
  }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    const asc = opts?.ascending !== false
    this.use(col)
    this.sorts.push({ col, asc, nullsFirst: opts?.nullsFirst ?? !asc }) // ค่าเริ่มต้นของ Postgres
    return this
  }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  limit(n: number) { this.end = this.start + n - 1; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private use(...cols: string[]) { for (const c of cols) if (c.trim()) this.used.add(c.trim()) }
  private where(col: string, f: (r: Row) => boolean) { this.use(col); this.filters.push(f); return this }

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

  private shape(rows: Row[], isSelect: boolean): Result {
    if (!isSelect && !this.returning) return { data: null, error: null }
    const out = clone(rows)
    if (!this.one) return { data: out, error: null }
    if (out.length === 1) return { data: out[0], error: null }
    if (out.length === 0 && this.one === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${out.length}` } }
  }

  private run(): Result {
    const failure = failTables.get(this.table)
    if (failure) return { data: null, error: failure }
    const gone = missingColumns.get(this.table)
    if (gone && this.used.has(gone.column)) return { data: null, error: gone.error }
    const rows = (db[this.table] ||= [])

    if (this.action === 'insert') {
      const now = new Date().toISOString()
      const added: Row[] = [this.payload].flat().map(r => ({ id: randomUUID(), created_at: now, updated_at: now, ...clone(DEFAULTS[this.table] ?? {}), ...clone(r) }))
      // unique index purchase_lists_lead_uidx (crm_lead_id ที่ไม่ใช่ NULL)
      if (this.table === 'purchase_lists' && added.some(a => a.crm_lead_id != null && rows.some(x => x.crm_lead_id === a.crm_lead_id))) {
        return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "purchase_lists_lead_uidx"' } }
      }
      rows.push(...added)
      return this.shape(added, false)
    }

    let hits = rows.filter(r => this.filters.every(f => f(r)))
    if (this.action === 'update') {
      if (failUpdates.has(this.table)) return { data: null, error: { code: 'XX000', message: 'could not write block (จำลอง)' } }
      for (const r of hits) Object.assign(r, clone(this.payload))
      return this.shape(hits, false)
    }
    if (this.action === 'delete') {
      db[this.table] = rows.filter(r => !hits.includes(r))
      // ON DELETE CASCADE: ลบเช็กลิสต์ = ลบรายการในใบ
      if (this.table === 'purchase_lists') {
        const gone = new Set(hits.map(h => h.id))
        db.purchase_items = db.purchase_items.filter(i => !gone.has(i.list_id))
      }
      return this.shape(hits, false)
    }

    const hide = hideNextSelects.get(this.table)
    if (hide) {
      hideNextSelects.set(this.table, hide - 1)
      hits = []
    }
    return this.shape(this.sorted(hits).slice(this.start, this.end + 1), true)
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

// ── สตอเรจจำลอง ──────────────────────────────────────────────────────────────
/** `${bucket}/${path}` → ไฟล์ */
const files = new Map<string, { contentType: string; size: number }>()
const storageOps: { op: 'upload' | 'remove'; bucket: string; paths: string[] }[] = []
/** อัปโหลดสำเร็จได้อีกกี่ไฟล์ก่อนพัง (จำลองสตอเรจล่มกลางทาง) */
let uploadBudget = Number.POSITIVE_INFINITY

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, body: Buffer, opts?: { contentType?: string }) {
        storageOps.push({ op: 'upload' as const, bucket, paths: [path] })
        if (uploadBudget <= 0) return { data: null, error: { message: 'storage unavailable (จำลอง)' } }
        uploadBudget--
        files.set(`${bucket}/${path}`, { contentType: opts?.contentType ?? '', size: body.length })
        return { data: { path }, error: null }
      },
      getPublicUrl(path: string) {
        return { data: { publicUrl: `${PUBLIC_BASE}/${bucket}/${path}` } }
      },
      async remove(paths: string[]) {
        storageOps.push({ op: 'remove' as const, bucket, paths: [...paths] })
        for (const p of paths) files.delete(`${bucket}/${p}`)
        return { data: [], error: null }
      },
    }
  },
}
const fakeClient = {
  from(table: string) {
    if (throwTables.has(table)) throw new TypeError('fetch failed (จำลอง)')
    return new Query(table)
  },
  storage,
}

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
/* eslint-disable @typescript-eslint/no-require-imports */
// removeStorageByUrls ตัวจริง (แยก path จาก URL เอง) — โหลดก่อนติดตั้งตัวแทน
const realServer = require('../lib/supabase-server') as typeof import('../lib/supabase-server')

const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient, removeStorageByUrls: realServer.removeStorageByUrls }],
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

const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const actions = require('../app/(authenticated)/jobs/purchasing/actions') as typeof import('../app/(authenticated)/jobs/purchasing/actions')
const data = require('../app/(authenticated)/jobs/purchasing/data') as typeof import('../app/(authenticated)/jobs/purchasing/data')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
let currentUser: string | null = null
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
  currentUser = userId
}
function logout() {
  cookieJar.clear()
  currentUser = null
}

/** ActionType ที่สเปคกำหนดให้แต่ละ action (ตาราง "Server actions") */
const SPEC_LOG = {
  createPurchaseList: 'CREATE_PURCHASE_LIST',
  updatePurchaseList: 'UPDATE_PURCHASE_LIST',
  deletePurchaseList: 'DELETE_PURCHASE_LIST',
  addPurchaseItems: 'CREATE_PURCHASE_ITEM',
  updatePurchaseItem: 'UPDATE_PURCHASE_ITEM',
  setPurchaseItemStatus: 'UPDATE_PURCHASE_ITEM_STATUS',
  deletePurchaseItem: 'DELETE_PURCHASE_ITEM',
  uploadPurchaseImages: 'UPDATE_PURCHASE_ITEM',
  deletePurchaseImage: 'UPDATE_PURCHASE_ITEM',
  savePurchaseTemplate: 'SAVE_PURCHASE_TEMPLATE',
  saveListAsTemplate: 'SAVE_PURCHASE_TEMPLATE',
  applyPurchaseTemplate: 'CREATE_PURCHASE_ITEM',
  deletePurchaseTemplate: 'DELETE_PURCHASE_TEMPLATE',
} as const
type MutatingAction = keyof typeof SPEC_LOG
const covered = new Map<MutatingAction, number>()

/** action ต้องสำเร็จ และเขียน activity_logs เพิ่มหนึ่งแถวพอดี ด้วย ActionType ตามสเปค โดยผู้ใช้ที่ล็อกอินอยู่ (ข้อ m) */
async function ok<T extends object>(name: MutatingAction, run: Promise<T | { error: string }>): Promise<T> {
  const before = db.activity_logs.length
  const res = await run
  if ('error' in res) assert.fail(`${name}: ต้องสำเร็จ แต่ได้ "${res.error}"`)
  const added = db.activity_logs.slice(before)
  assert.equal(added.length, 1, `${name}: ต้องเขียน activity_logs หนึ่งแถวพอดี (ได้ ${added.length})`)
  assert.equal(added[0].action_type, SPEC_LOG[name], `${name}: ActionType ต้องเป็น ${SPEC_LOG[name]}`)
  assert.equal(added[0].user_id, currentUser, `${name}: log ต้องเป็นของผู้ใช้ที่กด`)
  covered.set(name, (covered.get(name) ?? 0) + 1)
  return res
}

/** action ต้องล้มด้วยข้อความภาษาไทย และไม่เขียน activity_logs */
async function bad(run: Promise<object>, pattern?: RegExp): Promise<string> {
  const before = db.activity_logs.length
  const res = await run
  assert.ok('error' in res, `ต้องได้ error แต่ได้ ${JSON.stringify(res).slice(0, 200)}`)
  const message = String((res as { error: unknown }).error)
  if (pattern) assert.match(message, pattern)
  assert.match(message, /[฀-๿]/, `ข้อความถึงผู้ใช้ต้องเป็นภาษาไทย: ${message}`)
  assert.equal(db.activity_logs.length, before, `ล้มแล้วต้องไม่เขียน activity_logs (${message})`)
  return message
}

/** ปิด console.error ชั่วคราว — ใช้กับกรณีที่ตั้งใจให้ฐานข้อมูลพัง (action ลงข้อความดิบไว้ใน log) */
async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try {
    return await run()
  } finally {
    console.error = original
  }
}

/** เหมือน quietly แต่นับว่า console.error ถูกเรียกกี่ครั้ง (ยังไม่ติดตั้ง = ปกติ ต้องไม่ลง log) */
async function countErrors<T>(run: () => Promise<T>): Promise<{ value: T; errors: number }> {
  const original = console.error
  let errors = 0
  console.error = () => { errors++ }
  try {
    const value = await run()
    return { value, errors }
  } finally {
    console.error = original
  }
}

/**
 * action ของส่วนผูกใบเบิก (ข้อ p–x) ต้องสำเร็จ และเขียน activity_logs หนึ่งแถวพอดี ด้วย ActionType
 * ตามตาราง "ผูกใบเบิก" ในสเปค โดยผู้ใช้ที่ล็อกอินอยู่ — คืนผลและแถว log (ตรวจ details ต่อได้)
 */
async function okLog<T extends object>(actionType: string, run: Promise<T | { error: string }>): Promise<{ res: T; log: Row }> {
  const before = db.activity_logs.length
  const res = await run
  if ('error' in res) assert.fail(`${actionType}: ต้องสำเร็จ แต่ได้ "${res.error}"`)
  const added = db.activity_logs.slice(before)
  assert.equal(added.length, 1, `${actionType}: ต้องเขียน activity_logs หนึ่งแถวพอดี (ได้ ${added.length})`)
  assert.equal(added[0].action_type, actionType)
  assert.equal(added[0].user_id, currentUser, `${actionType}: log ต้องเป็นของผู้ใช้ที่กด`)
  return { res, log: added[0] }
}

/** ภาพรวมทุกอย่างที่ action อาจเขียน — เทียบก่อน/หลังเพื่อพิสูจน์ว่าไม่มีอะไรถูกเขียน */
const snapshot = () => JSON.stringify({
  lists: db.purchase_lists, items: db.purchase_items, templates: db.purchase_templates,
  notifications: db.notifications, logs: db.activity_logs, files: [...files.keys()].sort(), ops: storageOps.length,
})

const rowOf = (table: string, id: string): Row => {
  const found = db[table].find(r => r.id === id)
  assert.ok(found, `ไม่พบแถว ${table} ${id}`)
  return found
}
const itemsOf = (listId: string) =>
  db.purchase_items.filter(i => i.list_id === listId).sort((a, b) => Number(a.sort_order) - Number(b.sort_order))
const newNotifications = (from: number) => db.notifications.slice(from)

const MB = 1024 * 1024
const image = (type = 'image/jpeg', size = 2048, name = 'photo.jpg') => new File([new Uint8Array(size)], name, { type })
function form(...list: File[]) {
  const fd = new FormData()
  for (const f of list) fd.append('files', f)
  return fd
}
/** public URL → key ของไฟล์ในสตอเรจจำลอง */
const fileKey = (url: string) => url.slice(PUBLIC_BASE.length + 1)

const pass = (label: string) => console.log(`PASS  ${label}`)

// ── ข้อมูลตั้งต้นสำหรับข้อ (a): มีเช็กลิสต์ รายการ (มีรูป) และชุดสำเร็จรูปอยู่แล้ว ─────────────
const SEED_LIST = uid(900), SEED_ITEM = uid(901), SEED_TEMPLATE = uid(902)
const SEED_PATH = `${SEED_LIST}/${SEED_ITEM}/1_seed.jpg`
const SEED_URL = `${PUBLIC_BASE}/${BUCKET}/${SEED_PATH}`

function seedList(id: string, patch: Row = {}) {
  db.purchase_lists.push({
    id, crm_lead_id: null, title: 'ใบตั้งต้น', note: null, budget: null, due_date: null, owner_id: null,
    created_by: CREATOR, created_at: NOW_ISO, updated_at: NOW_ISO, ...patch,
  })
}
function seedItem(listId: string, patch: Row = {}) {
  const row = { id: randomUUID(), list_id: listId, title: 'ของ', ...clone(DEFAULTS.purchase_items), created_by: CREATOR, created_at: NOW_ISO, updated_at: NOW_ISO, ...patch }
  db.purchase_items.push(row)
  return row
}

seedList(SEED_LIST)
seedItem(SEED_LIST, { id: SEED_ITEM, title: 'ของตั้งต้น', images: [SEED_URL] })
files.set(`${BUCKET}/${SEED_PATH}`, { contentType: 'image/jpeg', size: 10 })
db.purchase_templates.push({
  id: SEED_TEMPLATE, name: 'ชุดตั้งต้น', created_by: CREATOR, created_at: NOW_ISO, updated_at: NOW_ISO,
  items: [{ title: 'ของในชุด', kind: 'buy', quantity: null, est_price: null, vendor: null, link_url: null, note: null }],
})

async function main() {
  // ══ (a) ไม่ได้ล็อกอิน → ทุก action ถูกปฏิเสธ ไม่มีอะไรถูกเขียน ═════════════════════
  const every = () => [
    actions.searchPurchaseLeads('สยาม'),
    actions.createPurchaseList({ title: 'ใบใหม่' }),
    actions.createPurchaseList({ leadId: LEAD_WON }),
    actions.updatePurchaseList(SEED_LIST, { note: 'แก้' }),
    actions.deletePurchaseList(SEED_LIST),
    actions.addPurchaseItems(SEED_LIST, [{ title: 'ของ' }]),
    actions.updatePurchaseItem(SEED_ITEM, { vendor: 'ร้าน' }),
    actions.setPurchaseItemStatus(SEED_ITEM, 'done'),
    actions.deletePurchaseItem(SEED_ITEM),
    actions.uploadPurchaseImages(SEED_ITEM, form(image())),
    actions.deletePurchaseImage(SEED_ITEM, SEED_URL),
    actions.savePurchaseTemplate({ name: 'ชุด', items: [{ title: 'ของ' }] }),
    actions.saveListAsTemplate(SEED_LIST, 'ชุด'),
    actions.applyPurchaseTemplate(SEED_LIST, SEED_TEMPLATE),
    actions.deletePurchaseTemplate(SEED_TEMPLATE),
    actions.searchPurchaseClaims('EXP'),
    actions.linkPurchaseItemsToClaim([SEED_ITEM], CLAIM_B1),
    actions.unlinkPurchaseItemClaim(SEED_ITEM),
  ]
  const untouched = snapshot()
  logout()
  const refused = await Promise.all(every())
  for (const res of refused) assert.deepEqual(res, { error: 'ไม่ได้เข้าสู่ระบบ' })
  // token ปลอม / ผู้ใช้ที่ยังไม่อนุมัติ / ถูกเตะเพราะล็อกอินที่อื่น → เหมือนไม่ได้ล็อกอิน
  cookieJar.set('session_token', `${ADMIN}:${Date.now()}:${'0'.repeat(64)}`)
  for (const res of await Promise.all(every())) assert.deepEqual(res, { error: 'ไม่ได้เข้าสู่ระบบ' })
  loginAs(PENDING)
  for (const res of await Promise.all(every())) assert.deepEqual(res, { error: 'ไม่ได้เข้าสู่ระบบ' })
  loginAs(CREATOR)
  rowOf('profiles', CREATOR).active_session_id = 'sess-elsewhere'
  for (const res of await Promise.all(every())) assert.deepEqual(res, { error: 'ไม่ได้เข้าสู่ระบบ' })
  rowOf('profiles', CREATOR).active_session_id = `sess-${CREATOR}`
  assert.equal(snapshot(), untouched, 'ไม่ได้ล็อกอินต้องไม่มีอะไรถูกเขียน')
  pass(`(a) ไม่ได้ล็อกอิน (ไม่มี cookie / token ปลอม / ยังไม่อนุมัติ / ล็อกอินที่อื่น) — ${refused.length} action ถูกปฏิเสธทั้งหมด ไม่มีอะไรถูกเขียน`)

  // ล็อกอินแล้วแต่ส่งอาร์กิวเมนต์มั่ว → { error } ไม่ throw และไม่เขียนอะไร
  loginAs(ADMIN)
  const junk: unknown[] = [null, undefined, 42, 'not-a-uuid', {}, [], { id: 1 }]
  const nonText: unknown[] = junk.filter(v => typeof v !== 'string')
  type AnyAction = (...args: unknown[]) => Promise<object>
  const a = actions as unknown as Record<string, AnyAction>
  const probes: [string, unknown[][]][] = [
    ['createPurchaseList', junk.map(x => [x])],
    ['updatePurchaseList', [...junk.map(x => [x, { note: 'x' }]), ...junk.map(x => [SEED_LIST, x])]],
    ['deletePurchaseList', junk.map(x => [x])],
    ['addPurchaseItems', [...junk.map(x => [x, [{ title: 'x' }]]), ...junk.map(x => [SEED_LIST, x]), [SEED_LIST, [null]], [SEED_LIST, [{ title: 5 }]]]],
    ['updatePurchaseItem', [...junk.map(x => [x, { vendor: 'x' }]), ...junk.map(x => [SEED_ITEM, x])]],
    ['setPurchaseItemStatus', [...junk.map(x => [x, 'done']), ...junk.map(x => [SEED_ITEM, x])]],
    ['deletePurchaseItem', junk.map(x => [x])],
    ['uploadPurchaseImages', [...junk.map(x => [x, form(image())]), ...junk.map(x => [SEED_ITEM, x])]],
    ['deletePurchaseImage', [...junk.map(x => [x, SEED_URL]), ...junk.map(x => [SEED_ITEM, x])]],
    ['savePurchaseTemplate', [...junk.map(x => [x]), [{ name: 'x', items: 'x' }], [{ id: 'nope', name: 'x', items: [{ title: 'x' }] }]]],
    ['saveListAsTemplate', [...junk.map(x => [x, 'ชุด']), ...nonText.map(x => [SEED_LIST, x])]],
    ['applyPurchaseTemplate', [...junk.map(x => [x, SEED_TEMPLATE]), ...junk.map(x => [SEED_LIST, x])]],
    ['deletePurchaseTemplate', junk.map(x => [x])],
    ['linkPurchaseItemsToClaim', [
      ...junk.map(x => [x, CLAIM_B1]), ...junk.map(x => [[SEED_ITEM], x]),
      [[SEED_ITEM, 'not-a-uuid'], CLAIM_B1], [[null], CLAIM_B1], [[SEED_ITEM, 42], CLAIM_B1],
    ]],
    ['unlinkPurchaseItemClaim', junk.map(x => [x])],
  ]
  let probeCount = 0
  for (const [name, argSets] of probes) {
    for (const args of argSets) {
      const res = await a[name](...args)
      assert.ok('error' in res, `${name}(${JSON.stringify(args)}) ต้องได้ { error }`)
      probeCount++
    }
  }
  for (const x of junk) assert.ok('leads' in (await actions.searchPurchaseLeads(x as string)), 'คำค้นมั่วต้องไม่ throw')
  for (const x of junk) assert.ok('claims' in (await actions.searchPurchaseClaims(x as string)), 'คำค้นใบเบิกมั่วต้องไม่ throw')
  assert.equal(snapshot(), untouched, 'อาร์กิวเมนต์มั่วต้องไม่มีอะไรถูกเขียน')
  pass(`(a) ล็อกอินแล้วส่งอาร์กิวเมนต์มั่ว ${probeCount} แบบ — ได้ { error } ทุกครั้ง ไม่ throw ไม่มีอะไรถูกเขียน`)

  // ══ (b) สร้างเช็กลิสต์ของงาน แล้วสร้างซ้ำ → ได้ใบเดิม existed: true ═════════════════
  loginAs(CREATOR)
  const first = await ok('createPurchaseList', actions.createPurchaseList({ leadId: LEAD_WON }))
  assert.equal(first.existed, false)
  const leadList = rowOf('purchase_lists', first.listId)
  assert.equal(leadList.crm_lead_id, LEAD_WON)
  assert.equal(leadList.title, 'บริษัท สยามพาราไดซ์ จำกัด', 'ใบที่ผูกงานเก็บชื่อลูกค้า ณ ตอนสร้าง')
  assert.equal(leadList.created_by, CREATOR)

  loginAs(OTHER)
  const beforeAgain = snapshot()
  const again = await actions.createPurchaseList({ leadId: LEAD_WON, title: 'ชื่ออื่น' })
  assert.deepEqual(again, { success: true, listId: first.listId, existed: true })
  assert.equal(snapshot(), beforeAgain, 'เปิดใบเดิมไม่ใช่การสร้าง — ไม่เขียนอะไร (ไม่ลง log)')
  // สองคนกดพร้อมกัน: ตรวจแล้วยังไม่มี แต่ insert ชน unique index (23505) → ได้ใบของอีกคน
  hideNextSelects.set('purchase_lists', 1)
  const race = await actions.createPurchaseList({ leadId: LEAD_WON })
  assert.deepEqual(race, { success: true, listId: first.listId, existed: true })
  assert.equal(db.purchase_lists.filter(l => l.crm_lead_id === LEAD_WON).length, 1)
  assert.equal(snapshot(), beforeAgain)
  pass('(b) ใบของงานสร้างครั้งเดียว — สร้างซ้ำได้ใบเดิม (existed: true) รวมกรณีชนกันพร้อมกัน (23505)')

  // ══ (c) เช็กลิสต์ทั่วไป: ไม่มีชื่อ = error · มีชื่อ = ok ════════════════════════════
  loginAs(CREATOR)
  await bad(actions.createPurchaseList({}), /กรุณาใส่ชื่อเช็กลิสต์/)
  await bad(actions.createPurchaseList({ title: '   ' }), /กรุณาใส่ชื่อเช็กลิสต์/)
  await bad(actions.createPurchaseList({ title: 'x'.repeat(121) }), /120/)
  await bad(actions.createPurchaseList({ title: 'ของ', dueDate: '2026-02-30' }), /กำหนดวันไม่ถูกต้อง/)
  await bad(actions.createPurchaseList({ leadId: uid(777) }), /ไม่พบงานนี้/)
  await bad(actions.createPurchaseList({ leadId: 'lead-1' }), /งานที่เลือกไม่ถูกต้อง/)
  const general = await ok('createPurchaseList', actions.createPurchaseList({ title: '  ของใช้ส่วนกลาง  ', dueDate: addDays(TODAY, 10), note: 'ซื้อก่อนสิ้นเดือน' }))
  const generalRow = rowOf('purchase_lists', general.listId)
  assert.deepEqual(
    [generalRow.title, generalRow.crm_lead_id, generalRow.due_date, generalRow.note, generalRow.created_by],
    ['ของใช้ส่วนกลาง', null, addDays(TODAY, 10), 'ซื้อก่อนสิ้นเดือน', CREATOR]
  )
  // ชื่อแก้ได้เฉพาะใบที่ไม่ผูกงาน
  await ok('updatePurchaseList', actions.updatePurchaseList(general.listId, { title: 'ของใช้ส่วนกลาง ต.ค.', budget: '2,500' }))
  assert.equal(rowOf('purchase_lists', general.listId).title, 'ของใช้ส่วนกลาง ต.ค.')
  assert.equal(rowOf('purchase_lists', general.listId).budget, 2500)
  await bad(actions.updatePurchaseList(first.listId, { title: 'เปลี่ยนชื่องาน' }), /CRM/)
  await bad(actions.updatePurchaseList(general.listId, { owner_id: PENDING }), /ผู้รับผิดชอบ/)
  await bad(actions.updatePurchaseList(general.listId, {}), /ไม่มีข้อมูลที่เปลี่ยน/)
  pass('(c) เช็กลิสต์ทั่วไป — ไม่มีชื่อถูกปฏิเสธ มีชื่อสร้างได้ · ชื่อของใบที่ผูกงานแก้ไม่ได้')

  // ══ (d) สร้างพร้อมชุดสำเร็จรูป → รายการถูกคัดลอกมา สถานะวางแผน ═══════════════════
  const tpl = await ok('savePurchaseTemplate', actions.savePurchaseTemplate({
    name: 'ชุดงานแต่ง',
    items: [
      { title: 'กรอบรูป', quantity: '2 อัน', est_price: '1,200', assignee_id: BUYER },
      { title: 'พร็อพ', kind: 'order', vendor: 'ร้านพร็อพ' },
      { title: 'ค่าส่ง', kind: 'other' },
    ],
  }))
  const fromTpl = await ok('createPurchaseList', actions.createPurchaseList({ title: 'งานแต่งคุณซี', templateId: tpl.templateId }))
  const copied = itemsOf(fromTpl.listId)
  assert.deepEqual(copied.map(i => i.title), ['กรอบรูป', 'พร็อพ', 'ค่าส่ง'])
  assert.ok(copied.every(i => i.status === 'planning' && i.assignee_id == null && i.created_by === CREATOR))
  assert.deepEqual(copied.map(i => i.sort_order), [0, 1, 2])
  assert.deepEqual([copied[0].quantity, copied[0].est_price, copied[1].kind, copied[1].vendor, copied[2].kind], ['2 อัน', 1200, 'order', 'ร้านพร็อพ', 'other'])
  // ใช้ชุดซ้ำกับใบที่มีรายการแล้ว → ต่อท้าย
  const applied = await ok('applyPurchaseTemplate', actions.applyPurchaseTemplate(fromTpl.listId, tpl.templateId))
  assert.deepEqual(applied.items.map(i => i.sort_order), [3, 4, 5])
  assert.equal(itemsOf(fromTpl.listId).length, 6)
  // ชุดที่ไม่มีอยู่ → ไม่สร้างใบครึ่งๆ กลางๆ
  const listsBefore = db.purchase_lists.length
  await bad(actions.createPurchaseList({ title: 'ใบกับชุดที่ถูกลบ', templateId: uid(888) }), /ชุดสำเร็จรูป/)
  assert.equal(db.purchase_lists.length, listsBefore)
  // บันทึกเช็กลิสต์เป็นชุด / แก้ชุดเดิม
  const fromList = await ok('saveListAsTemplate', actions.saveListAsTemplate(fromTpl.listId, 'ชุดจากงานแต่งคุณซี'))
  assert.equal((rowOf('purchase_templates', fromList.templateId).items as unknown[]).length, 6)
  await ok('savePurchaseTemplate', actions.savePurchaseTemplate({ id: fromList.templateId, name: 'ชุดงานแต่ง (ย่อ)', items: [{ title: 'กรอบรูป' }] }))
  assert.equal(rowOf('purchase_templates', fromList.templateId).name, 'ชุดงานแต่ง (ย่อ)')
  await bad(actions.saveListAsTemplate(general.listId, 'ชุดว่าง'), /ยังไม่มีรายการ/)
  pass('(d) สร้างพร้อมชุดสำเร็จรูป — รายการถูกคัดลอกครบ สถานะวางแผน ไม่มีผู้รับผิดชอบ · ใช้ชุดซ้ำต่อท้าย')

  // ══ (e) เพิ่มรายการ: ขีดจำกัด 50 รายการ / ชื่อ 200 ตัวอักษร · เขียนจริงและแตะ updated_at ═══════
  const L = general.listId
  await bad(actions.addPurchaseItems(L, Array.from({ length: 51 }, (_, i) => ({ title: `ของ ${i + 1}` }))), /ไม่เกิน 50 รายการ/)
  await bad(actions.addPurchaseItems(L, [{ title: 'x'.repeat(201) }]), /200/)
  await bad(actions.addPurchaseItems(L, [{ title: 'ถ่าน' }, { title: 'ป้าย', link_url: 'shopee.co.th/x' }]), /^รายการที่ 2: .*http/)
  await bad(actions.addPurchaseItems(L, [{ title: 'ของ', assignee_id: PENDING }]), /ผู้รับผิดชอบ/)
  assert.equal(itemsOf(L).length, 0, 'ล้มแล้วต้องไม่มีรายการเข้าไปสักข้อ')
  rowOf('purchase_lists', L).updated_at = '2000-01-01T00:00:00.000Z'
  const added = await ok('addPurchaseItems', actions.addPurchaseItems(L, [
    { title: '  เทปกาว  ', quantity: '3 ม้วน' },
    { title: 'x'.repeat(200) },
    { title: 'ถ่าน AA', est_price: 99, vendor: 'เซเว่น', link_url: 'https://shop.example/aa' },
  ]))
  assert.deepEqual(added.items.map(i => i.title), ['เทปกาว', 'x'.repeat(200), 'ถ่าน AA'])
  assert.deepEqual(itemsOf(L).map(i => i.title), ['เทปกาว', 'x'.repeat(200), 'ถ่าน AA'])
  assert.ok(String(rowOf('purchase_lists', L).updated_at) > '2000-01-01T00:00:00.000Z', 'updated_at ของเช็กลิสต์ต้องขยับ')
  const fifty = await ok('addPurchaseItems', actions.addPurchaseItems(L, Array.from({ length: 50 }, (_, i) => ({ title: `ของชิ้นที่ ${i + 1}` }))))
  assert.equal(fifty.items.length, 50)
  assert.deepEqual(itemsOf(L).map(i => i.sort_order), Array.from({ length: 53 }, (_, i) => i), 'sort_order ต่อท้ายไม่ซ้ำ')
  pass('(e) เพิ่มรายการ — 51 รายการ / ชื่อ 201 ตัวอักษรถูกปฏิเสธ · รายการที่ถูกต้องถูกเขียน (50 ข้อพอดีผ่าน) และ updated_at ของใบขยับ')

  // ══ (f) มอบหมาย → แจ้งเตือนคนนั้นหนึ่งครั้ง · มอบหมายให้ตัวเอง = ไม่แจ้ง ═══════════════
  let mark = db.notifications.length
  const assigned = await ok('addPurchaseItems', actions.addPurchaseItems(L, [{ title: 'ป้ายไวนิล', assignee_id: BUYER }, { title: 'ขาตั้งป้าย', assignee_id: BUYER }]))
  assert.equal(newNotifications(mark).length, 1, 'สองรายการให้คนเดียวกัน = แจ้งเตือนเดียว')
  const [assignNote] = newNotifications(mark)
  assert.deepEqual(
    [assignNote.user_id, assignNote.type, assignNote.reference_type, assignNote.reference_id, assignNote.actor_id],
    [BUYER, 'job_purchase_assigned', 'job', L, CREATOR]
  )
  assert.match(String(assignNote.body), /ป้ายไวนิล, ขาตั้งป้าย/)
  mark = db.notifications.length
  await ok('addPurchaseItems', actions.addPurchaseItems(L, [{ title: 'ของที่ฉันซื้อเอง', assignee_id: CREATOR }]))
  assert.equal(newNotifications(mark).length, 0, 'มอบหมายให้ตัวเองต้องไม่แจ้งเตือน')
  // เปลี่ยนผู้รับผิดชอบ → แจ้งคนใหม่ · แก้ช่องอื่น/ผู้รับผิดชอบคนเดิม → ไม่แจ้ง
  const reassignId = assigned.items[0].id
  await ok('updatePurchaseItem', actions.updatePurchaseItem(reassignId, { assignee_id: OWNER }))
  assert.deepEqual(newNotifications(mark).map(n => [n.user_id, n.type, n.reference_id]), [[OWNER, 'job_purchase_assigned', L]])
  mark = db.notifications.length
  await ok('updatePurchaseItem', actions.updatePurchaseItem(reassignId, { vendor: 'ร้านป้ายดี', assignee_id: OWNER }))
  await ok('updatePurchaseItem', actions.updatePurchaseItem(reassignId, { assignee_id: CREATOR }))
  assert.equal(newNotifications(mark).length, 0)
  await bad(actions.updatePurchaseItem(reassignId, { assignee_id: uid(555) }), /ผู้รับผิดชอบ/)
  assert.equal(rowOf('purchase_items', reassignId).vendor, 'ร้านป้ายดี')
  pass('(f) มอบหมายรายการ — แจ้ง job_purchase_assigned ให้คนนั้นหนึ่งครั้ง (reference_type job, reference_id = เช็กลิสต์) · ให้ตัวเองไม่แจ้ง')

  // ══ (g) เปลี่ยนสถานะ: ประทับเวลา/ผู้เปลี่ยน · done_at ตั้งแล้วล้างเมื่อถอย ══════════════════
  const tapeId = added.items[0].id
  await bad(actions.setPurchaseItemStatus(tapeId, 'lost' as PurchaseStatus), /สถานะไม่ถูกต้อง/)
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(tapeId, 'done'))
  const tape = rowOf('purchase_items', tapeId)
  assert.equal(tape.status, 'done')
  assert.ok(typeof tape.done_at === 'string' && tape.done_at === tape.status_changed_at, 'done_at และ status_changed_at ต้องถูกประทับ')
  assert.equal(tape.status_changed_by, CREATOR)
  const doneAt = String(tape.status_changed_at)
  loginAs(BUYER)
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(tapeId, 'purchasing'))
  assert.equal(tape.status, 'purchasing')
  assert.equal(tape.done_at, null, 'ถอยจากเสร็จสิ้นต้องล้าง done_at')
  assert.equal(tape.status_changed_by, BUYER)
  assert.ok(String(tape.status_changed_at) >= doneAt)
  pass('(g) เปลี่ยนสถานะ — สถานะแปลกถูกปฏิเสธ · วางแผน→เสร็จสิ้น ประทับ done_at/status_changed_at/by · ถอยแล้วล้าง done_at')

  // ══ (h) รายการสุดท้ายเสร็จ → แจ้งผู้รับผิดชอบและคนสร้างเช็กลิสต์ (ไม่แจ้งผู้กด) ═══════════
  loginAs(CREATOR)
  const H = await ok('createPurchaseList', actions.createPurchaseList({ title: 'งานปิดครบ' }))
  await ok('updatePurchaseList', actions.updatePurchaseList(H.listId, { owner_id: OWNER }))
  const hItems = (await ok('addPurchaseItems', actions.addPurchaseItems(H.listId, [{ title: 'ไฟ' }, { title: 'สายไฟ' }]))).items
  loginAs(BUYER)
  mark = db.notifications.length
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(hItems[0].id, 'done'))
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(hItems[1].id, 'awaiting_delivery'))
  assert.equal(newNotifications(mark).length, 0, 'ยังเหลือรายการค้าง = ยังไม่แจ้ง')
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(hItems[1].id, 'done'))
  const doneNotes = newNotifications(mark)
  assert.deepEqual(doneNotes.map(n => n.user_id).sort(), [CREATOR, OWNER].sort())
  assert.ok(doneNotes.every(n => n.type === 'job_purchase_done' && n.reference_type === 'job' && n.reference_id === H.listId && n.actor_id === BUYER))
  // ซ้ำสถานะเดิม → ไม่มีอะไรใหม่เลย (แถว แจ้งเตือน log)
  const beforeRepeat = snapshot()
  assert.deepEqual(await actions.setPurchaseItemStatus(hItems[1].id, 'done'), { success: true })
  assert.equal(snapshot(), beforeRepeat, 'สถานะเดิมต้องไม่เขียนอะไร')
  // ถอยแล้วคนสร้างปิดเอง → แจ้งเฉพาะผู้รับผิดชอบ (คนกดไม่ได้แจ้งตัวเอง)
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(hItems[1].id, 'purchasing'))
  loginAs(CREATOR)
  mark = db.notifications.length
  await ok('setPurchaseItemStatus', actions.setPurchaseItemStatus(hItems[1].id, 'done'))
  assert.deepEqual(newNotifications(mark).map(n => [n.user_id, n.type]), [[OWNER, 'job_purchase_done']])
  pass('(h) ใบกลายเป็นเสร็จครบ — แจ้ง job_purchase_done ให้ผู้รับผิดชอบ + คนสร้าง (ไม่แจ้งผู้กด) · กดสถานะเดิมซ้ำไม่มีอะไรใหม่')

  // ══ (i) สิทธิ์ลบรายการ ═══════════════════════════════════════════════════════
  const I = await ok('createPurchaseList', actions.createPurchaseList({ title: 'ทดสอบสิทธิ์ลบ' }))
  const iItems = (await ok('addPurchaseItems', actions.addPurchaseItems(I.listId, [{ title: '1' }, { title: '2' }, { title: '3' }, { title: '4' }, { title: '5' }]))).items
  loginAs(OTHER)
  await bad(actions.deletePurchaseItem(iItems[0].id), /ลบได้เฉพาะ/)
  assert.ok(db.purchase_items.some(i => i.id === iItems[0].id), 'คนที่ไม่เกี่ยวข้องลบไม่ได้ แถวต้องยังอยู่')
  await bad(actions.deletePurchaseList(I.listId), /ลบได้เฉพาะ/)
  await bad(actions.deletePurchaseTemplate(tpl.templateId), /ลบได้เฉพาะ/)
  const deleters: [string, string][] = [[CREATOR, 'คนสร้าง'], [ADMIN, 'แอดมิน'], [COORD, 'ฝ่ายประสานงาน']]
  for (const [userId, label] of deleters) {
    const target = iItems.shift()!
    loginAs(userId)
    await ok('deletePurchaseItem', actions.deletePurchaseItem(target.id))
    assert.ok(!db.purchase_items.some(i => i.id === target.id), `${label}ลบได้`)
  }
  // ผู้รับผิดชอบเช็กลิสต์ลบรายการของคนอื่นในใบได้
  loginAs(CREATOR)
  await ok('updatePurchaseList', actions.updatePurchaseList(I.listId, { owner_id: OWNER }))
  loginAs(OWNER)
  await ok('deletePurchaseItem', actions.deletePurchaseItem(iItems[0].id))
  loginAs(CREATOR)
  await ok('deletePurchaseTemplate', actions.deletePurchaseTemplate(tpl.templateId))
  assert.ok(!db.purchase_templates.some(t => t.id === tpl.templateId))
  pass('(i) สิทธิ์ลบ — คนไม่เกี่ยวข้องถูกปฏิเสธ (แถวยังอยู่) · คนสร้าง / แอดมิน / ฝ่ายประสานงาน / ผู้รับผิดชอบใบ ลบได้')

  // ══ (j) ลบเช็กลิสต์ → ไฟล์รูปของทุกรายการถูกลบจากสตอเรจ ═══════════════════════════
  const J = await ok('createPurchaseList', actions.createPurchaseList({ title: 'ใบมีรูป' }))
  const jItems = (await ok('addPurchaseItems', actions.addPurchaseItems(J.listId, [{ title: 'ใบเสร็จ 1' }, { title: 'ใบเสร็จ 2' }]))).items
  const up1 = await ok('uploadPurchaseImages', actions.uploadPurchaseImages(jItems[0].id, form(image(), image('image/png', 100, 'a.png'))))
  const up2 = await ok('uploadPurchaseImages', actions.uploadPurchaseImages(jItems[1].id, form(image('image/webp', 100, 'a.webp'))))
  const jUrls = [...up1.images, ...up2.images]
  assert.equal(jUrls.length, 3)
  for (const [url, itemId] of [[up1.images[0], jItems[0].id], [up1.images[1], jItems[0].id], [up2.images[0], jItems[1].id]]) {
    assert.match(fileKey(url), new RegExp(`^${BUCKET}/${J.listId}/${itemId}/\\d+_[a-z0-9]*\\.(jpg|png|webp)$`))
    assert.ok(files.has(fileKey(url)), 'ไฟล์ต้องอยู่ในสตอเรจหลังอัปโหลด')
  }
  assert.equal(files.get(fileKey(up1.images[1]))?.contentType, 'image/png')
  await ok('deletePurchaseList', actions.deletePurchaseList(J.listId))
  for (const url of jUrls) assert.ok(!files.has(fileKey(url)), `ไฟล์ ${fileKey(url)} ต้องถูกลบ`)
  assert.ok(!db.purchase_lists.some(l => l.id === J.listId) && itemsOf(J.listId).length === 0)
  pass('(j) ลบเช็กลิสต์ — ไฟล์รูปทั้ง 3 ของทุกรายการถูกลบจากสตอเรจ ใบและรายการหายไป')

  // ══ (k) อัปโหลดรูป: เพดาน 4 รูป / ชนิดไฟล์ / ขนาด — ตรวจก่อนอัปโหลด · พลาดแล้วคืนไฟล์ ═══════
  const K = await ok('createPurchaseList', actions.createPurchaseList({ title: 'ใบทดสอบรูป' }))
  const [k1, k2] = (await ok('addPurchaseItems', actions.addPurchaseItems(K.listId, [{ title: 'ใบเสร็จ' }, { title: 'รูปสินค้า' }]))).items
  const four = await ok('uploadPurchaseImages', actions.uploadPurchaseImages(k1.id, form(image(), image('image/png', 10, 'b.png'), image('image/webp', 10, 'c.webp'), image())))
  assert.equal(four.images.length, 4)
  let opsBefore = storageOps.length
  await bad(actions.uploadPurchaseImages(k1.id, form(image())), /สูงสุด 4 รูป/)
  await bad(actions.uploadPurchaseImages(k2.id, form(image(), image(), image(), image(), image())), /สูงสุด 4 รูป/)
  await bad(actions.uploadPurchaseImages(k2.id, form(new File(['hello'], 'note.txt', { type: 'text/plain' }))), /JPG, PNG หรือ WEBP/)
  await bad(actions.uploadPurchaseImages(k2.id, form(image(), new File(['x'], 'a.txt', { type: 'text/plain' }))), /JPG, PNG หรือ WEBP/)
  await bad(actions.uploadPurchaseImages(k2.id, form(image('image/jpeg', 5 * MB + 1))), /5MB/)
  await bad(actions.uploadPurchaseImages(k2.id, new FormData()), /เลือกรูป/)
  assert.equal(storageOps.length, opsBefore, 'ถูกปฏิเสธแล้วต้องไม่มีไฟล์ไหนถูกอัปโหลดเลย')
  assert.equal((rowOf('purchase_items', k1.id).images as string[]).length, 4)
  assert.deepEqual(rowOf('purchase_items', k2.id).images, [])
  // บันทึกลงรายการไม่ได้ → ไฟล์ที่อัปโหลดไปแล้วถูกลบคืน
  failUpdates.add('purchase_items')
  await quietly(() => bad(actions.uploadPurchaseImages(k2.id, form(image(), image('image/png', 10, 'd.png'))), /อัปโหลดรูปไม่สำเร็จ/))
  failUpdates.delete('purchase_items')
  let ops = storageOps.slice(opsBefore)
  assert.deepEqual(ops.map(o => o.op), ['upload', 'upload', 'remove'])
  assert.deepEqual([...ops[2].paths].sort(), [...ops[0].paths, ...ops[1].paths].sort())
  for (const p of ops[2].paths) assert.ok(!files.has(`${BUCKET}/${p}`))
  // สตอเรจล่มกลางทาง → ไฟล์แรกที่ขึ้นไปแล้วถูกลบคืน
  opsBefore = storageOps.length
  uploadBudget = 1
  await quietly(() => bad(actions.uploadPurchaseImages(k2.id, form(image(), image())), /อัปโหลดรูปไม่สำเร็จ/))
  uploadBudget = Number.POSITIVE_INFINITY
  ops = storageOps.slice(opsBefore)
  assert.deepEqual(ops.map(o => o.op), ['upload', 'upload', 'remove'])
  assert.deepEqual(ops[2].paths, ops[0].paths)
  assert.ok(!files.has(`${BUCKET}/${ops[0].paths[0]}`))
  assert.deepEqual(rowOf('purchase_items', k2.id).images, [])
  pass('(k) อัปโหลดรูป — รูปที่ 5 / ไฟล์ text/plain / เกิน 5MB ถูกปฏิเสธก่อนอัปโหลดสักไฟล์ · พลาดกลางทางคืนไฟล์ที่ขึ้นไปแล้ว')

  // ══ (l) ลบรูปได้เฉพาะ url ของรายการนั้น ════════════════════════════════════════
  const k2up = await ok('uploadPurchaseImages', actions.uploadPurchaseImages(k2.id, form(image())))
  const k1url = four.images[0]
  await bad(actions.deletePurchaseImage(k2.id, k1url), /ไม่พบรูปนี้/)
  await bad(actions.deletePurchaseImage(k2.id, `https://evil.example/${BUCKET}/${K.listId}/x.jpg`), /ไม่พบรูปนี้/)
  assert.ok(files.has(fileKey(k1url)), 'url ของรายการอื่นต้องไม่ถูกลบ')
  assert.equal((rowOf('purchase_items', k1.id).images as string[]).length, 4)
  assert.deepEqual(rowOf('purchase_items', k2.id).images, k2up.images)
  const removed = await ok('deletePurchaseImage', actions.deletePurchaseImage(k1.id, k1url))
  assert.deepEqual(removed.images, four.images.slice(1))
  assert.deepEqual(rowOf('purchase_items', k1.id).images, four.images.slice(1))
  assert.ok(!files.has(fileKey(k1url)))
  // ลบรายการ → ไฟล์รูปของรายการนั้นถูกลบด้วย
  const k2file = fileKey(k2up.images[0])
  await ok('deletePurchaseItem', actions.deletePurchaseItem(k2.id))
  assert.ok(!files.has(k2file))
  pass('(l) ลบรูป — url ของรายการอื่น/นอกบัคเก็ตถูกปฏิเสธ (ไฟล์ยังอยู่) · url ของรายการนั้นลบได้ · ลบรายการแล้วไฟล์ถูกลบด้วย')

  // ══ (m) ทุก action ที่สำเร็จเขียน activity_logs หนึ่งแถวพอดี ด้วย ActionType ตามสเปค ═══════════
  const allActions = Object.keys(SPEC_LOG) as MutatingAction[]
  assert.deepEqual(allActions.filter(n => !covered.has(n)), [], 'ต้องเรียกทุก action ที่เปลี่ยนข้อมูลอย่างน้อยหนึ่งครั้ง')
  const calls = [...covered.values()].reduce((s, n) => s + n, 0)
  pass(`(m) activity_logs — ${calls} ครั้งที่สำเร็จ ครบ ${allActions.length} action / ${new Set(Object.values(SPEC_LOG)).size} ActionType: ${allActions.map(n => `${n}→${SPEC_LOG[n]}`).join(', ')}`)

  // ══ (n) ค้นงาน CRM: คำค้นที่มีอักขระพิเศษไม่ throw และไม่หลุดเข้า filter ═══════════════════
  loginAs(OTHER)
  const stripped = /[,()%*\\"]/
  const termsOf = (expr: string) => expr.split(',').map(cond => cond.split('.').slice(2).join('.').replace(/^\*|\*$/g, ''))
  const tricky = await actions.searchPurchaseLeads('a,b)%')
  assert.ok('leads' in tricky)
  let terms = termsOf(orFilters[orFilters.length - 1])
  assert.deepEqual(terms, ['ab', 'ab'])
  for (const t of terms) assert.ok(!stripped.test(t), `คำค้นใน filter ต้องไม่มีอักขระต้องห้าม: ${t}`)
  await actions.searchPurchaseLeads(`x,(y)%*\\"z${'ก'.repeat(100)}`)
  terms = termsOf(orFilters[orFilters.length - 1])
  for (const t of terms) {
    assert.ok(!stripped.test(t))
    assert.ok([...t].length <= 80, 'คำค้นต้องถูกตัดเหลือ 80 ตัวอักษร')
  }
  // ค้นด้วยชื่อ/สถานที่: ไม่เอา rejected และที่เก็บคลัง · บอก list_id ของงานที่มีเช็กลิสต์แล้ว
  const siam = await actions.searchPurchaseLeads('สยาม')
  assert.ok('leads' in siam)
  assert.deepEqual(siam.leads.map(l => [l.id, l.list_id]), [[LEAD_WON, first.listId], [LEAD_QUOTE, null]])
  // คำค้นว่าง: เฉพาะที่ตอบรับแล้ว วันงานตั้งแต่ 7 วันก่อน เรียงวันใกล้สุดก่อน
  const suggest = await actions.searchPurchaseLeads('')
  assert.ok('leads' in suggest)
  assert.deepEqual(suggest.leads.map(l => l.id), [LEAD_EDGE, LEAD_SUCCESS, LEAD_WON])
  pass('(n) searchPurchaseLeads("a,b)%") ไม่ throw — คำค้นใน or() เหลือ "ab" ไม่มี , ( ) % * \\ " · ตัดเหลือ 80 ตัวอักษร · ไม่เอา rejected/เก็บคลัง · คำค้นว่างเสนองานที่ตอบรับแล้ว')

  // ══ (o) data.ts: ชุดที่หน้าหลักโหลด / ตารางยังไม่ถูกสร้าง / แผงเตือนหน้าแรก ══════════════════
  const OLD = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const RECENT = new Date(Date.now() - 5 * 86_400_000).toISOString()
  const OLD_OPEN = uid(910), OLD_DONE = uid(911), OLD_EMPTY = uid(912), RECENT_DONE = uid(913)
  seedList(OLD_OPEN, { title: 'ใบเก่าที่ยังค้าง', created_at: OLD, updated_at: OLD })
  for (let i = 0; i < 1005; i++) seedItem(OLD_OPEN, { title: `ของเก่า ${i + 1}`, sort_order: i }) // เกิน 1,000 → ต้องอ่านหลายหน้า
  seedList(OLD_DONE, { title: 'ใบเก่าที่เสร็จแล้ว', created_at: OLD, updated_at: OLD })
  seedItem(OLD_DONE, { status: 'done' })
  seedList(OLD_EMPTY, { title: 'ใบเก่าว่าง', created_at: OLD, updated_at: OLD })
  seedList(RECENT_DONE, { title: 'ใบล่าสุดที่เสร็จแล้ว', created_at: RECENT, updated_at: RECENT })
  seedItem(RECENT_DONE, { status: 'done' })

  const snap = await data.getPurchasingSnapshot({ session: { userId: CREATOR } })
  assert.equal(snap.missingTables, false)
  assert.equal(snap.today, TODAY)
  const loaded = new Set(snap.lists.map(l => l.id))
  for (const id of [OLD_OPEN, RECENT_DONE, first.listId, general.listId, SEED_LIST]) assert.ok(loaded.has(id), `ต้องโหลดใบ ${id}`)
  for (const id of [OLD_DONE, OLD_EMPTY]) assert.ok(!loaded.has(id), `ไม่ควรโหลดใบเก่า ${id}`)
  const oldOpen = snap.lists.find(l => l.id === OLD_OPEN)!
  assert.equal(oldOpen.items.length, 1005, 'อ่านรายการครบทุกหน้า (เพดาน 1,000 ต่อคำขอ)')
  assert.deepEqual(oldOpen.items.map(i => i.sort_order), Array.from({ length: 1005 }, (_, i) => i))
  const finishedAt = snap.lists.findIndex(l => l.items.length > 0 && l.items.every(i => i.status === 'done'))
  assert.ok(finishedAt > 0 && snap.lists.slice(finishedAt).every(l => l.items.length > 0 && l.items.every(i => i.status === 'done')), 'ใบที่เสร็จแล้วอยู่ท้าย')
  assert.equal(snap.lists.find(l => l.id === first.listId)!.lead?.customer_name, 'บริษัท สยามพาราไดซ์ จำกัด')
  assert.ok(!snap.people.some(p => p.id === PENDING), 'คนที่ยังไม่อนุมัติไม่อยู่ในตัวเลือก')
  assert.deepEqual([snap.currentUserId, snap.isAdmin, snap.canManage, snap.myDepartment], [CREATOR, false, false, 'สตาฟ'])
  assert.ok(snap.templates.some(t => t.id === SEED_TEMPLATE && t.items[0].title === 'ของในชุด'))
  const coordSnap = await data.getPurchasingSnapshot({ session: { userId: COORD } })
  assert.deepEqual([coordSnap.isAdmin, coordSnap.canManage], [false, true])
  const adminSnap = await data.getPurchasingSnapshot({ session: { userId: ADMIN } })
  assert.deepEqual([adminSnap.isAdmin, adminSnap.canManage], [true, true])
  const forged = await data.getPurchasingSnapshot({ session: { userId: OTHER, role: 'admin' } })
  assert.equal(forged.isAdmin, false, 'role จาก cookie ไม่ใช้ตัดสินสิทธิ์')
  const past = await data.getPurchasingSnapshot({ includePast: true, session: { userId: CREATOR } })
  for (const id of [OLD_DONE, OLD_EMPTY, OLD_OPEN]) assert.ok(past.lists.some(l => l.id === id), '?past=1 โหลดทุกใบ')

  // ตารางยังไม่ถูกสร้าง (42P01 / PGRST205) → missingTables: true ไม่ throw
  const missingCases: [string, DbError][] = [
    ['purchase_lists', { code: '42P01', message: 'relation "purchase_lists" does not exist' }],
    ['purchase_items', { code: '42P01', message: 'relation "purchase_items" does not exist' }],
    ['purchase_lists', { code: 'PGRST205', message: "Could not find the table 'public.purchase_lists' in the schema cache" }],
    ['purchase_templates', { code: 'PGRST205', message: "Could not find the table 'public.purchase_templates' in the schema cache" }],
  ]
  for (const [table, error] of missingCases) {
    failTables.set(table, error)
    const missing = await data.getPurchasingSnapshot({ session: { userId: CREATOR } })
    failTables.clear()
    assert.equal(missing.missingTables, true, `${table} ${error.code} ต้องได้ missingTables`)
    assert.deepEqual([missing.lists, missing.templates], [[], []])
  }
  failTables.set('purchase_items', { code: 'XX000', message: 'server closed the connection unexpectedly' })
  await quietly(() => assert.rejects(data.getPurchasingSnapshot({ session: { userId: CREATOR } }), /โหลดข้อมูลจัดซื้อไม่สำเร็จ/))
  failTables.clear()

  // แผงเตือนหน้าแรก
  const ALERT_OVERDUE = uid(920), ALERT_URGENT = uid(921)
  seedList(ALERT_OVERDUE, { title: 'ของต้องได้เมื่อวานซืน', due_date: addDays(TODAY, -2), created_by: OTHER, updated_at: RECENT })
  seedItem(ALERT_OVERDUE, { title: 'ไฟแฟลช', status: 'purchasing', assignee_id: BUYER })
  seedList(ALERT_URGENT, { title: 'ชื่อเก่า', crm_lead_id: LEAD_SUCCESS, created_by: OTHER, updated_at: RECENT })
  seedItem(ALERT_URGENT, { title: 'ดอกไม้', status: 'planning', assignee_id: null })
  seedItem(ALERT_URGENT, { title: 'ริบบิ้น', status: 'done', assignee_id: OWNER })

  const adminAlerts = await data.getPurchaseAlerts({ session: { userId: ADMIN } })
  assert.deepEqual(adminAlerts.map(r => [r.listId, r.severity, r.countdown, r.outstanding]), [
    [ALERT_OVERDUE, 'overdue', 'เลยมา 2 วัน', 1],
    [ALERT_URGENT, 'urgent', 'พรุ่งนี้', 1],
  ])
  assert.deepEqual([adminAlerts[1].title, adminAlerts[1].subtitle], ['คุณบี แต่งงาน', 'โรงแรมริมน้ำ'])
  const alertIds = async (userId: string, role?: string) =>
    (await data.getPurchaseAlerts({ session: { userId, role } })).map(r => r.listId)
  assert.deepEqual(await alertIds(COORD), [ALERT_OVERDUE, ALERT_URGENT])
  assert.deepEqual(await alertIds(OTHER), [ALERT_OVERDUE, ALERT_URGENT]) // คนสร้างทั้งสองใบ
  assert.deepEqual(await alertIds(BUYER), [ALERT_OVERDUE]) // ผู้รับผิดชอบรายการที่ค้าง
  assert.deepEqual(await alertIds(OWNER), []) // รับผิดชอบเฉพาะรายการที่เสร็จแล้ว
  assert.deepEqual(await alertIds(OWNER, 'admin'), [], 'role จาก cookie ไม่ใช้ตัดสินสิทธิ์')
  assert.deepEqual(await alertIds(PENDING), [])
  assert.deepEqual(await data.getPurchaseAlerts({ session: {} }), [])
  // พังตรงไหนก็คืน [] (ห้ามทำให้หน้าแรกล้ม)
  const alertFailures: [string, DbError][] = [
    ['purchase_items', { code: 'XX000', message: 'boom' }],
    ['purchase_lists', { code: '42P01', message: 'relation "purchase_lists" does not exist' }],
    ['purchase_items', { code: 'PGRST205', message: "Could not find the table 'public.purchase_items' in the schema cache" }],
    ['crm_leads', { code: 'XX000', message: 'boom' }],
    ['profiles', { code: 'XX000', message: 'boom' }],
  ]
  for (const [table, error] of alertFailures) {
    failTables.set(table, error)
    assert.deepEqual(await quietly(() => data.getPurchaseAlerts({ session: { userId: ADMIN } })), [], `${table} ${error.code} ต้องคืน []`)
    failTables.clear()
  }
  for (const table of ['purchase_items', 'purchase_lists', 'crm_leads']) {
    throwTables.add(table)
    assert.deepEqual(await quietly(() => data.getPurchaseAlerts({ session: { userId: ADMIN } })), [], `${table} throw ต้องคืน []`)
    throwTables.clear()
  }
  pass('(o) data.ts — โหลดใบค้าง + ใบที่ขยับใน 30 วัน (อ่านรายการ 1,005 แถวครบหลายหน้า) · 42P01/PGRST205 = missingTables ไม่ throw · แผงเตือนเห็นตามสิทธิ์ และพังแล้วคืน []')

  // ══ ตั้งต้นของส่วนผูกใบเบิก: เช็กลิสต์ ก / ข (สร้างผ่าน action) ════════════════════════════
  loginAs(CREATOR)
  const LA = (await ok('createPurchaseList', actions.createPurchaseList({ title: 'งานผูกใบเบิก ก' }))).listId
  const LB = (await ok('createPurchaseList', actions.createPurchaseList({ title: 'งานผูกใบเบิก ข' }))).listId
  const [ca1, ca2, ca3] = (await ok('addPurchaseItems', actions.addPurchaseItems(LA, [
    { title: 'ป้ายไวนิล', actual_price: 500 },
    { title: 'เทปกาวสองหน้า', actual_price: 300 },
    { title: 'กาวร้อน' },
  ]))).items
  const [cb1, cb2, cb3] = (await ok('addPurchaseItems', actions.addPurchaseItems(LB, [
    { title: 'ขาตั้งป้าย', quantity: '2 อัน', actual_price: 700.25 },
    { title: 'สายรัด' },
    { title: 'ถุงมือ' },
  ]))).items
  const claimIdsOf = (res: Awaited<ReturnType<typeof actions.searchPurchaseClaims>>) => {
    assert.ok('claims' in res, `ค้นใบเบิกต้องสำเร็จ แต่ได้ ${JSON.stringify(res)}`)
    return res.claims.map(c => c.id)
  }
  const VOID_CLAIMS = [CLAIM_B_REJECTED, CLAIM_B_CANCELLED, CLAIM_B_PETTY]

  // ══ (p) ค้นใบเบิก: คนทั่วไปเห็นเฉพาะใบของตัวเอง · แอดมินเห็นทุกคน · ใบที่ผูกไม่ได้ไม่ออกเลย ═════════════
  loginAs(BUYER)
  const buyerAll = await actions.searchPurchaseClaims('')
  assert.deepEqual(claimIdsOf(buyerAll), [CLAIM_B2, CLAIM_B1], 'ใบของตัวเอง ใหม่สุดก่อน ไม่มีใบที่ปฏิเสธ/ยกเลิก/เงินสดย่อย')
  assert.ok('claims' in buyerAll)
  assert.ok(buyerAll.claims.every(c => c.submitter_name === null), 'ผลของคนที่ไม่ใช่แอดมินไม่มีชื่อผู้เบิก')
  assert.deepEqual(
    buyerAll.claims.map(c => [c.claim_number, c.title, c.amount, c.status, c.status_label, c.expense_date, c.linked_items]),
    [
      ['EXP-202609-002', 'ทดลองจ่ายค่าดอกไม้', 2750.5, 'refund_confirmed', 'คืนเงินบริษัทแล้ว', addDays(TODAY, -4), 0], // ทดลองจ่ายที่คืนเงินแล้ว = ยอดที่ใช้จริง
      ['EXP-202609-001', 'ค่าป้ายไวนิล งานสยาม', 1500, 'pending', 'รออนุมัติ', addDays(TODAY, -5), 0],
    ]
  )
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('EXP-202609')), [CLAIM_B2, CLAIM_B1], 'คำค้นตรงเลขที่ของใบที่ผูกไม่ได้ก็ยังไม่ออก')
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('ป้าย')), [CLAIM_B1]) // ค้นจากชื่อ
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('202609-002')), [CLAIM_B2]) // ค้นจากเลขที่
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('ขาตั้งกล้อง')), [], 'ใบของคนอื่นค้นไม่เจอ')
  loginAs(OTHER)
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('')), [CLAIM_O])
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('ป้าย')), [])
  loginAs(ADMIN)
  const adminAll = await actions.searchPurchaseClaims('')
  const adminIds = claimIdsOf(adminAll)
  assert.equal(adminIds.length, 20, 'สูงสุด 20 ใบ')
  assert.deepEqual(adminIds.slice(0, 5), [CLAIM_C, CLAIM_O, CLAIM_B2, CLAIM_B1, uid(400)])
  assert.ok('claims' in adminAll)
  assert.deepEqual(adminAll.claims.slice(0, 4).map(c => c.submitter_name), ['คนสร้าง ทดสอบ', 'คนอื่น ทดสอบ', 'คนซื้อ ทดสอบ', 'คนซื้อ ทดสอบ'])
  assert.deepEqual(claimIdsOf(await actions.searchPurchaseClaims('ขาตั้งกล้อง')), [CLAIM_O])
  for (const q of ['', 'EXP-202609', 'ใบที่', 'เงินสดย่อย']) {
    const found = claimIdsOf(await actions.searchPurchaseClaims(q))
    assert.ok(!found.some(id => VOID_CLAIMS.includes(id)), `ใบที่ปฏิเสธ/ยกเลิก/เงินสดย่อยต้องไม่ออก (คำค้น "${q}")`)
  }
  // คำค้นถูกล้างก่อนต่อเป็น filter: , ( ) % * \ " หาย · เหลือ 80 ตัวอักษร · ค้นทั้งเลขที่และชื่อ
  claimIdsOf(await actions.searchPurchaseClaims('a,b)%'))
  const claimOr = orFilters[orFilters.length - 1]
  assert.deepEqual(claimOr.split(',').map(cond => cond.split('.')[0]), ['claim_number', 'title'])
  assert.deepEqual(termsOf(claimOr), ['ab', 'ab'])
  claimIdsOf(await actions.searchPurchaseClaims(`x,(y)%*\\"z${'ก'.repeat(100)}`))
  for (const t of termsOf(orFilters[orFilters.length - 1])) {
    assert.ok(!stripped.test(t) && [...t].length <= 80, `คำค้นใน filter ต้องสะอาดและไม่เกิน 80 ตัวอักษร: ${t}`)
  }
  pass('(p) searchPurchaseClaims — คนทั่วไปได้เฉพาะใบของตัวเอง (ไม่มีชื่อผู้เบิก) · แอดมินได้ทุกคน สูงสุด 20 ใบ ใหม่สุดก่อน พร้อมชื่อผู้เบิก · ใบปฏิเสธ/ยกเลิก/เงินสดย่อยไม่ออกเลย · คำค้นถูกล้างก่อนเข้า or()')

  // ══ (q) คนทั่วไปผูกใบเบิกของคนอื่น → "ไม่พบใบเบิกนี้" (เหมือนไม่มีใบนั้น) ไม่มีอะไรถูกเขียน ═══════════════
  loginAs(BUYER)
  const beforeForeign = snapshot()
  const foreign = await bad(actions.linkPurchaseItemsToClaim([ca1.id], CLAIM_O))
  assert.equal(foreign, 'ไม่พบใบเบิกนี้')
  assert.equal(await bad(actions.linkPurchaseItemsToClaim([ca1.id], uid(399))), foreign, 'ใบของคนอื่นกับใบที่ไม่มีอยู่ต้องได้ข้อความเดียวกัน')
  loginAs(CREATOR)
  assert.equal(await bad(actions.linkPurchaseItemsToClaim([ca1.id, cb1.id], CLAIM_B1)), foreign)
  assert.equal(snapshot(), beforeForeign, 'ผูกใบของคนอื่นไม่ได้ = ไม่มีอะไรถูกเขียน')
  pass('(q) คนทั่วไปผูกใบเบิกของคนอื่น → "ไม่พบใบเบิกนี้" (ข้อความเดียวกับใบที่ไม่มีอยู่) — ไม่มีอะไรถูกเขียน')

  // ══ (r) ผูกใบของตัวเองกับ 3 รายการใน 2 เช็กลิสต์ → เขียนครบ · updated_at ของทั้งสองใบขยับ · log หนึ่งแถว ════
  loginAs(BUYER)
  const OLD_TOUCH = '2000-01-01T00:00:00.000Z'
  rowOf('purchase_lists', LA).updated_at = OLD_TOUCH
  rowOf('purchase_lists', LB).updated_at = OLD_TOUCH
  const linkR = await okLog('LINK_PURCHASE_ITEM_CLAIM', actions.linkPurchaseItemsToClaim([ca1.id, ca2.id, cb1.id], CLAIM_B1))
  assert.equal(linkR.res.linked, 3)
  for (const item of [ca1, ca2, cb1]) assert.equal(rowOf('purchase_items', item.id).expense_claim_id, CLAIM_B1)
  for (const item of [ca3, cb2, cb3]) assert.equal(rowOf('purchase_items', item.id).expense_claim_id, null)
  for (const listId of [LA, LB]) assert.ok(String(rowOf('purchase_lists', listId).updated_at) > OLD_TOUCH, 'updated_at ของเช็กลิสต์ต้องขยับ')
  const linkDetails = linkR.log.details as { claimId: string; claimNumber: string; itemIds: string[]; listIds: string[] }
  assert.deepEqual([linkDetails.claimId, linkDetails.claimNumber], [CLAIM_B1, 'EXP-202609-001'])
  assert.deepEqual([...linkDetails.itemIds].sort(), [ca1.id, ca2.id, cb1.id].sort())
  assert.deepEqual([...linkDetails.listIds].sort(), [LA, LB].sort())
  const afterLink = await actions.searchPurchaseClaims('202609-001')
  assert.ok('claims' in afterLink)
  assert.deepEqual(afterLink.claims.map(c => [c.id, c.linked_items]), [[CLAIM_B1, 3]], 'ตัวเลือกบอกจำนวนรายการที่ผูกอยู่แล้ว')
  pass('(r) ผูกใบเบิกของตัวเองกับ 3 รายการใน 2 เช็กลิสต์ — เขียนครบ 3 · updated_at ของทั้งสองใบขยับ · LINK_PURCHASE_ITEM_CLAIM หนึ่งแถว (claimId, เลขที่, id รายการ)')

  // ══ (s) ขีดจำกัด: 51 id / มี id ที่ไม่มีอยู่จริงหนึ่งตัว / ใบที่ผูกไม่ได้ → error ไม่มีอะไรถูกเขียน ═══════════
  const beforeLimits = snapshot()
  await bad(actions.linkPurchaseItemsToClaim(Array.from({ length: 51 }, (_, i) => uid(5000 + i)), CLAIM_B1), /ไม่เกิน 50 รายการ/)
  await bad(actions.linkPurchaseItemsToClaim([ca3.id, cb2.id, uid(398)], CLAIM_B1), /ไม่พบบางรายการ/)
  await bad(actions.linkPurchaseItemsToClaim([], CLAIM_B1), /ยังไม่ได้เลือกรายการ/)
  for (const voidClaim of VOID_CLAIMS) {
    await bad(actions.linkPurchaseItemsToClaim([ca3.id], voidClaim), /ผูกกับรายการจัดซื้อไม่ได้/)
  }
  assert.equal(snapshot(), beforeLimits, 'ล้มแล้วต้องไม่ผูกเลยสักรายการ')
  // id ซ้ำ (รวมตัวพิมพ์ใหญ่ของ uuid เดียวกัน) นับครั้งเดียว
  const dup = await okLog('LINK_PURCHASE_ITEM_CLAIM', actions.linkPurchaseItemsToClaim([ca3.id, ca3.id.toUpperCase(), ca3.id], CLAIM_B2))
  assert.equal(dup.res.linked, 1)
  assert.deepEqual((dup.log.details as { itemIds: string[] }).itemIds, [ca3.id])
  assert.equal(rowOf('purchase_items', ca3.id).expense_claim_id, CLAIM_B2)
  pass('(s) 51 id → error · มี id ที่ไม่มีอยู่จริง 1 ตัว → error และไม่ผูกเลย · ใบปฏิเสธ/ยกเลิก/เงินสดย่อย → error · id ซ้ำนับครั้งเดียว')

  // ══ (t) ผูกรายการที่ผูกอยู่แล้วกับใบใหม่ → แทนที่ใบเดิม · แอดมินผูกใบของใครก็ได้ ════════════════════════
  const replace = await okLog('LINK_PURCHASE_ITEM_CLAIM', actions.linkPurchaseItemsToClaim([ca1.id], CLAIM_B2))
  assert.equal(rowOf('purchase_items', ca1.id).expense_claim_id, CLAIM_B2)
  assert.deepEqual((replace.log.details as { replacedClaimIds: string[] }).replacedClaimIds, [CLAIM_B1])
  assert.deepEqual(
    db.purchase_items.filter(i => i.expense_claim_id === CLAIM_B1).map(i => i.id).sort(),
    [ca2.id, cb1.id].sort(),
    'ใบเดิมเหลือเฉพาะรายการที่ไม่ได้ย้าย'
  )
  loginAs(ADMIN)
  await okLog('LINK_PURCHASE_ITEM_CLAIM', actions.linkPurchaseItemsToClaim([cb3.id], CLAIM_O))
  assert.equal(rowOf('purchase_items', cb3.id).expense_claim_id, CLAIM_O)
  pass('(t) ผูกรายการที่มีใบเบิกอยู่แล้วกับใบใหม่ — แทนที่ใบเดิม (log บอกใบที่ถูกแทน) · แอดมินผูกใบเบิกของคนอื่นได้')

  // ══ (u) เลิกผูก: ล้างคอลัมน์ + log · รายการที่ไม่ได้ผูกอยู่ = สำเร็จโดยไม่เขียนอะไร ═════════════════════════
  loginAs(OTHER) // เลิกผูกได้ทุกคนที่ล็อกอิน (ไม่ใช่ผู้เบิกของใบนี้)
  rowOf('purchase_lists', LA).updated_at = OLD_TOUCH
  const unlinkU = await okLog('UNLINK_PURCHASE_ITEM_CLAIM', actions.unlinkPurchaseItemClaim(ca2.id))
  assert.equal(rowOf('purchase_items', ca2.id).expense_claim_id, null)
  const unlinkDetails = unlinkU.log.details as { itemId: string; claimId: string; listId: string }
  assert.deepEqual([unlinkDetails.itemId, unlinkDetails.claimId, unlinkDetails.listId], [ca2.id, CLAIM_B1, LA])
  assert.ok(String(rowOf('purchase_lists', LA).updated_at) > OLD_TOUCH)
  const beforeUnlinkAgain = snapshot()
  assert.deepEqual(await actions.unlinkPurchaseItemClaim(ca2.id), { success: true })
  assert.deepEqual(await actions.unlinkPurchaseItemClaim(cb2.id), { success: true })
  assert.equal(snapshot(), beforeUnlinkAgain, 'เลิกผูกรายการที่ไม่ได้ผูก = ไม่เขียนอะไร ไม่ลง log')
  await bad(actions.unlinkPurchaseItemClaim(uid(397)), /ไม่พบรายการนี้/)
  pass('(u) เลิกผูก — ล้าง expense_claim_id · UNLINK_PURCHASE_ITEM_CLAIM หนึ่งแถว · รายการที่ไม่ได้ผูกอยู่สำเร็จโดยไม่เขียนอะไร')

  // ══ (v) snapshot: ตัดชื่อ/ยอดตามสิทธิ์ตั้งแต่ server · linked_items นับรายการในเช็กลิสต์ที่ไม่ได้โหลดด้วย ═════════
  // รายการในใบเก่าที่เสร็จแล้ว (ไม่ถูกโหลดโดยปริยาย) ผูกกับ CLAIM_B1 อยู่ด้วย
  const OLD_LINKED = uid(930)
  seedItem(OLD_DONE, { id: OLD_LINKED, title: 'ค่าส่งป้ายรอบก่อน', status: 'done', actual_price: 250, expense_claim_id: CLAIM_B1 })
  // สถานะตอนนี้: B1 = cb1 (700.25) + OLD_LINKED (250) · B2 = ca1 (500) + ca3 (ว่าง) · O = cb3 (ว่าง)
  const hiddenB1 = {
    id: CLAIM_B1, claim_number: 'EXP-202609-001', status: 'pending', status_label: 'รออนุมัติ', status_color: '#f59e0b',
    visible: false, title: null, amount: null, linked_items: 2, linked_actual: null,
  }
  const hiddenB2 = {
    id: CLAIM_B2, claim_number: 'EXP-202609-002', status: 'refund_confirmed', status_label: 'คืนเงินบริษัทแล้ว', status_color: '#0891b2',
    visible: false, title: null, amount: null, linked_items: 2, linked_actual: null,
  }
  const hiddenO = {
    id: CLAIM_O, claim_number: 'EXP-202609-003', status: 'approved', status_label: 'อนุมัติแล้ว', status_color: '#22c55e',
    visible: false, title: null, amount: null, linked_items: 1, linked_actual: null,
  }
  const shownB1 = { ...hiddenB1, visible: true, title: 'ค่าป้ายไวนิล งานสยาม', amount: 1500, linked_actual: 950.25 }
  const shownB2 = { ...hiddenB2, visible: true, title: 'ทดลองจ่ายค่าดอกไม้', amount: 2750.5, linked_actual: 500 }
  const shownO = { ...hiddenO, visible: true, title: 'ค่าเช่าขาตั้งกล้อง', amount: 800, linked_actual: 0 }

  const otherSnap = await data.getPurchasingSnapshot({ session: { userId: OTHER } })
  assert.deepEqual(otherSnap.claims, { [CLAIM_B1]: hiddenB1, [CLAIM_B2]: hiddenB2, [CLAIM_O]: shownO }, 'คนทั่วไปเห็นรายละเอียดเฉพาะใบของตัวเอง')
  const otherJson = JSON.stringify(otherSnap)
  for (const secret of ['ค่าป้ายไวนิล งานสยาม', 'ทดลองจ่ายค่าดอกไม้']) {
    assert.ok(!otherJson.includes(secret), `ชื่อใบเบิกของคนอื่นต้องไม่อยู่ในข้อมูลที่ส่งให้หน้าจอ: ${secret}`)
  }
  assert.ok(!otherSnap.lists.some(l => l.id === OLD_DONE), 'ใบเก่าที่เสร็จแล้วไม่ได้ถูกโหลด')
  const loadedB1 = otherSnap.lists.flatMap(l => l.items).filter(i => i.expense_claim_id === CLAIM_B1).length
  assert.equal(loadedB1, 1, 'รายการที่โหลดมาผูก B1 อยู่ข้อเดียว แต่ linked_items นับได้ 2')
  const buyerSnap = await data.getPurchasingSnapshot({ session: { userId: BUYER } })
  assert.deepEqual(buyerSnap.claims, { [CLAIM_B1]: shownB1, [CLAIM_B2]: shownB2, [CLAIM_O]: hiddenO }, 'ผู้เบิกเห็นใบของตัวเองครบ')
  const adminSnap2 = await data.getPurchasingSnapshot({ session: { userId: ADMIN } })
  assert.deepEqual(adminSnap2.claims, { [CLAIM_B1]: shownB1, [CLAIM_B2]: shownB2, [CLAIM_O]: shownO }, 'แอดมินเห็นทุกใบ')
  const forgedAdmin = await data.getPurchasingSnapshot({ session: { userId: OTHER, role: 'admin' } })
  assert.deepEqual(forgedAdmin.claims[CLAIM_B1], hiddenB1, 'role จาก cookie ไม่ทำให้เห็นรายละเอียดใบเบิก')
  pass('(v) snapshot — คนที่ไม่ใช่ผู้เบิกได้ใบเบิกที่ title/amount/linked_actual = null (ชื่อไม่อยู่ในข้อมูลเลย) · ผู้เบิกและแอดมินเห็นครบ · linked_items นับรายการในเช็กลิสต์ที่ไม่ได้โหลดด้วย')

  // ══ (w) ฐานข้อมูลที่ยังไม่มีคอลัมน์ expense_claim_id (รัน migration รุ่นก่อน) = ยังไม่พร้อมใช้งาน ═══════════════
  const noColumnCases: DbError[] = [
    { code: '42703', message: 'column purchase_items.expense_claim_id does not exist' },
    { code: 'PGRST204', message: "Could not find the 'expense_claim_id' column of 'purchase_items' in the schema cache" },
  ]
  for (const error of noColumnCases) {
    missingColumns.set('purchase_items', { column: 'expense_claim_id', error })
    const snapNoColumn = await countErrors(() => data.getPurchasingSnapshot({ session: { userId: CREATOR } }))
    assert.equal(snapNoColumn.value.missingTables, true, `${error.code} ต้องได้ missingTables`)
    assert.deepEqual([snapNoColumn.value.lists, snapNoColumn.value.templates, snapNoColumn.value.claims], [[], [], {}])
    assert.equal(snapNoColumn.errors, 0, 'ยังไม่ติดตั้ง = ปกติ ไม่ลง log')
    const alertsNoColumn = await countErrors(() => data.getPurchaseAlerts({ session: { userId: ADMIN } }))
    assert.deepEqual([alertsNoColumn.value, alertsNoColumn.errors], [[], 0], 'แผงเตือนหน้าแรกคืน [] เงียบๆ')
    loginAs(BUYER)
    await quietly(() => bad(actions.linkPurchaseItemsToClaim([cb2.id], CLAIM_B1), /ยังไม่พร้อมใช้งาน/))
    missingColumns.clear()
  }
  pass('(w) ฐานข้อมูลที่ยังไม่มีคอลัมน์ (42703 / PGRST204) — หน้าจัดซื้อได้ missingTables: true · แผงเตือนคืน [] ไม่ลง log · ผูกใบเบิกได้ข้อความ "ยังไม่พร้อมใช้งาน"')

  // ══ (x) getClaimPurchaseItems (หน้าใบเบิก): รายการของใบนั้น เรียงตามเช็กลิสต์แล้วตามลำดับในใบ · พลาด = [] ════════
  // ใบของงาน (ผูก CRM) ใช้ชื่อลูกค้าล่าสุดจาก CRM เหมือนหน้าจัดซื้อ · id เรียงสวนกับ sort_order เพื่อพิสูจน์การเรียง
  seedItem(LB, { id: uid(951), title: 'ไฟฉาย', sort_order: 90, expense_claim_id: CLAIM_C, actual_price: 120 })
  seedItem(LB, { id: uid(952), title: 'ถ่านไฟฉาย', quantity: '4 ก้อน', sort_order: 80, expense_claim_id: CLAIM_C, actual_price: 60 })
  seedItem(first.listId, { id: uid(953), title: 'ธงราว', sort_order: 0, expense_claim_id: CLAIM_C, actual_price: 250 })
  seedItem(LA, { id: uid(954), title: 'หมุดติดผนัง', status: 'purchasing', sort_order: 50, expense_claim_id: CLAIM_C })
  rowOf('crm_leads', LEAD_WON).customer_name = 'บริษัท สยามพาราไดซ์ (ชื่อใหม่)'
  const claimRows = await data.getClaimPurchaseItems(CLAIM_C)
  assert.deepEqual(claimRows.map(r => [r.item_id, r.list_title]), [
    [uid(954), 'งานผูกใบเบิก ก'],
    [uid(952), 'งานผูกใบเบิก ข'],
    [uid(951), 'งานผูกใบเบิก ข'],
    [uid(953), 'บริษัท สยามพาราไดซ์ (ชื่อใหม่)'],
  ])
  assert.deepEqual(claimRows[1], {
    item_id: uid(952), title: 'ถ่านไฟฉาย', quantity: '4 ก้อน', status: 'planning', actual_price: 60, list_id: LB, list_title: 'งานผูกใบเบิก ข',
  })
  assert.deepEqual([claimRows[0].status, claimRows[0].actual_price], ['purchasing', null])
  assert.deepEqual((await data.getClaimPurchaseItems(CLAIM_B1)).map(r => [r.item_id, r.list_id]), [[cb1.id, LB], [OLD_LINKED, OLD_DONE]])
  assert.deepEqual(await data.getClaimPurchaseItems(uid(398)), [], 'ใบที่ไม่มีรายการผูก = []')
  for (const badId of ['not-a-uuid', '', `${CLAIM_C}'; drop table`]) assert.deepEqual(await data.getClaimPurchaseItems(badId), [])
  for (const [table, error] of [
    ['purchase_items', { code: 'XX000', message: 'boom' }],
    ['purchase_lists', { code: 'XX000', message: 'boom' }],
    ['crm_leads', { code: 'XX000', message: 'boom' }],
  ] as [string, DbError][]) {
    failTables.set(table, error)
    assert.deepEqual(await quietly(() => data.getClaimPurchaseItems(CLAIM_C)), [], `${table} พัง ต้องคืน []`)
    failTables.clear()
  }
  throwTables.add('purchase_items')
  assert.deepEqual(await quietly(() => data.getClaimPurchaseItems(CLAIM_C)), [], 'throw ต้องคืน []')
  throwTables.clear()
  missingColumns.set('purchase_items', { column: 'expense_claim_id', error: noColumnCases[0] })
  const itemsNoColumn = await countErrors(() => data.getClaimPurchaseItems(CLAIM_C))
  assert.deepEqual([itemsNoColumn.value, itemsNoColumn.errors], [[], 0], 'ยังไม่ติดตั้ง = [] ไม่ลง log')
  missingColumns.clear()
  pass('(x) getClaimPurchaseItems — รายการของใบเบิกเรียงตามเช็กลิสต์ (ชื่อจาก CRM ล่าสุด) แล้วตามลำดับในใบ · id ผิดรูป / ไม่มีรายการ / คิวรีพัง / ยังไม่ติดตั้ง = []')

  console.log('\npurchasing-flow: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
