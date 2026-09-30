// พฤติกรรมเดิมของการเปลี่ยนสถานะใบเบิก (ขั้น 4 · BATCH 0) — บันทึกผลของ 11 action ก่อนย้ายโค้ด แล้วเทียบทุกครั้งหลังย้าย
// Run:  npx tsx scripts/claim-lifecycle.check.ts                         (เทียบกับ scripts/fixtures/claim-lifecycle.golden.json)
//       npx tsx scripts/claim-lifecycle.check.ts --write-golden [path]   (เก็บผลอ้างอิงใหม่ — ทำครั้งเดียวจากโค้ดก่อนย้าย)
//
// โมดูลที่ตรวจเลือกได้ด้วย LIFECYCLE_ACTIONS_MODULES = รายการ path จาก repo root คั่นด้วยจุลภาค (ไม่ต้องใส่นามสกุล)
// ค่าเริ่มต้น 'app/(authenticated)/finance/actions,app/(authenticated)/finance/lifecycle-actions' — โมดูลที่ไม่มีข้ามไป
// ฟังก์ชันจากทุกโมดูลรวมเป็นชุดเดียว (โมดูลหลังทับโมดูลแรก) · ชี้ไปสำเนาของโค้ดเดิม (actions.orig) เพื่อยืนยันว่าผลอ้างอิงมาจากตัวเดิมจริง
//
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง ไม่ต้องมี env: แทน next/headers, next/cache, @/lib/supabase-server,
// @/lib/logger และ @/lib/notifications ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/finance-integrity.check.ts)
// ตารางคอลัมน์มี deleted_at, deleted_by, status_changed_at อยู่แล้ว — แถวเหมือนกันทั้งก่อนและหลังโค้ดที่รู้จักคอลัมน์ใหม่
// ผลต่อกรณี: ค่าที่คืน · แถวใบเบิกหลังทำ · ประวัติที่เพิ่ม · activity · แจ้งเตือน · revalidatePath · จำนวนรายการต้นทุน · คำสั่งสตอเรจ
// เวลา (ISO) แทนด้วย '<ts>' · uuid แทนด้วย '<idN>' ตามลำดับที่พบในกรณีนั้น · คนและใบเบิกสังเคราะห์ทั้งหมด
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-lifecycle: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

process.env.SESSION_SECRET = 'claim-lifecycle-check'

const ROOT = join(__dirname, '..')
const DEFAULT_GOLDEN = join(ROOT, 'scripts', 'fixtures', 'claim-lifecycle.golden.json')
const writeAt = process.argv.indexOf('--write-golden')
const WRITE = writeAt >= 0
const writeArg = WRITE ? process.argv[writeAt + 1] : undefined
const GOLDEN_OUT = writeArg && !writeArg.startsWith('--') ? resolve(process.cwd(), writeArg) : DEFAULT_GOLDEN
const MODULES = (process.env.LIFECYCLE_ACTIONS_MODULES || 'app/(authenticated)/finance/actions,app/(authenticated)/finance/lifecycle-actions')
  .split(',').map(s => s.trim()).filter(Boolean)

type Row = Record<string, unknown>
type DbError = { code: string; message: string; details?: string }
type Result = { data: unknown; error: DbError | null; count?: number }

// ── คน งาน (สังเคราะห์) ───────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), ADMIN_B = uid(2), STAFF = uid(3), STAFF_B = uid(4), CUSTODIAN = uid(5)
const EVENT = uid(901)
const STORAGE_BASE = 'https://fake.supabase.test/storage/v1/object/public'
const fileUrl = (path: string) => `${STORAGE_BASE}/receipts/${path}`

const person = (id: string, full_name: string, role: string): Row =>
  ({ id, full_name, nickname: null, role, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

/** คอลัมน์ที่มีจริง (รวมคอลัมน์ของ 20260930_claim_hide_status_time.sql) — อ้างคอลัมน์อื่น = error แบบ PostgREST */
const COLUMNS: Record<string, string[]> = {
  profiles: ['id', 'full_name', 'nickname', 'role', 'department', 'is_approved', 'active_session_id'],
  expense_claims: [
    'id', 'claim_number', 'original_claim_number', 'claim_type', 'job_event_id', 'title', 'description', 'category',
    'amount', 'unit_price', 'unit', 'quantity', 'total_amount', 'vat_mode', 'include_vat', 'withholding_tax_rate',
    'receipt_urls', 'tax_invoice_urls', 'tax_invoice_numbers', 'funding_source', 'actual_spent_amount',
    'actual_spent_items', 'refund_amount', 'actual_receipt_urls', 'refund_slip_urls', 'advance_settled_at',
    'advance_settled_by', 'refund_confirmed_at', 'refund_confirmed_by', 'pettycash_fund_id', 'pettycash_opening_balance',
    'pettycash_opening_from', 'pettycash_previous_claim_id', 'pettycash_period_start', 'pettycash_period_end',
    'pettycash_closed_at', 'pettycash_closed_by', 'status', 'submitted_by', 'approved_by', 'approved_at', 'reject_reason',
    'expense_date', 'notes', 'bank_name', 'bank_account_number', 'account_holder_name', 'paid_at', 'paid_by',
    'submitted_at', 'cancelled_at', 'cancelled_by', 'created_at', 'filed_at', 'filed_by', 'filed_file_count',
    'deleted_at', 'deleted_by', 'status_changed_at',
  ],
  expense_claim_logs: ['id', 'claim_id', 'action', 'changed_by', 'changes', 'note', 'created_at'],
  job_cost_items: [
    'id', 'job_event_id', 'title', 'category', 'description', 'amount', 'unit_price', 'unit', 'quantity', 'include_vat',
    'vat_mode', 'withholding_tax_rate', 'cost_date', 'recorded_by', 'notes', 'created_at',
  ],
  job_cost_events: ['id', 'event_name', 'event_date', 'event_location', 'status', 'source_event_id', 'created_at'],
}

const db: Record<string, Row[]> = Object.fromEntries(Object.keys(COLUMNS).map(t => [t, []]))
let seq = 0
let tick = Date.parse('2026-09-01T00:00:00.000Z')
const nextId = () => uid(50_000 + ++seq)
const nextTs = () => new Date((tick += 1000)).toISOString()
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

function fullRow(table: string, row: Row): Row {
  const out: Row = Object.fromEntries(COLUMNS[table].map(c => [c, null]))
  return { ...out, id: nextId(), created_at: nextTs(), ...clone(row) }
}

let claimCount = 0
function seedClaim(over: Row): string {
  claimCount++
  const row = fullRow('expense_claims', {
    claim_number: `EXP-202609-${String(100 + claimCount).padStart(3, '0')}`,
    claim_type: 'event', job_event_id: EVENT, title: `ใบทดสอบ ${claimCount}`, description: null, category: 'travel',
    amount: 300, unit_price: 100, quantity: 3, unit: 'บาท', total_amount: 300, vat_mode: 'none', include_vat: false,
    withholding_tax_rate: 0, receipt_urls: [fileUrl(`seed/${claimCount}.jpg`)], funding_source: 'company',
    status: 'pending', submitted_by: STAFF, expense_date: '2026-09-10',
    ...over,
  })
  db.expense_claims.push(row)
  return String(row.id)
}
function seedCostItem(claimId: string) {
  const claim = db.expense_claims.find(r => r.id === claimId) as Row
  db.job_cost_items.push(fullRow('job_cost_items', {
    job_event_id: EVENT, category: 'travel', description: `[เบิกเงิน] ${String(claim.title)}`, amount: 300, unit_price: 100,
    quantity: 3, unit: 'รายการ', recorded_by: ADMIN, notes: `${String(claim.claim_number)}::${claimId}`,
  }))
}

// ── บันทึกผลข้างเคียง ────────────────────────────────────────────────────────
const activity: { action: string; details: unknown }[] = []
const notifications: Row[] = []
const revalidated: string[] = []
const storage = new Map<string, number>()
const storageOps: { op: 'upload' | 'remove'; paths: string[] }[] = []

/** เปลี่ยนแถวทันที "หลัง" การอ่านใบเบิกนี้ครั้งแรก — จำลองคนอื่นเปลี่ยนสถานะระหว่างอ่านกับเขียน */
let race: { id: string; mutate: (row: Row) => void } | null = null

function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

function splitTop(cols: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of cols) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
function project(table: string, row: Row, cols: string): Row {
  const out: Row = {}
  for (const part of splitTop(cols)) {
    if (part === '*') { Object.assign(out, clone(row)); continue }
    const embed = /^(\w+):(\w+)!(\w+)\(([\s\S]*)\)$/.exec(part)
    if (embed) {
      const [, alias, other, fk, inner] = embed
      const col = new RegExp(`^${table}_(\\w+)_fkey$`).exec(fk)?.[1]
      assert.ok(col, `fk ไม่รู้จัก: ${fk}`)
      const hit = (db[other] ?? []).find(r => r.id === row[col])
      out[alias] = hit ? project(other, hit, inner) : null
      continue
    }
    assert.ok(COLUMNS[table].includes(part), `select คอลัมน์ที่ไม่มี: ${table}.${part}`)
    out[part] = clone(row[part] ?? null)
  }
  return out
}
function compare(x: unknown, y: unknown): number {
  if (typeof x === 'number' && typeof y === 'number') return x - y
  const a = String(x), b = String(y)
  return a < b ? -1 : a > b ? 1 : 0
}
const likeToRegex = (pattern: string) =>
  new RegExp(`^${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`, 's')

class Query implements PromiseLike<Result> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private cols: string | null = null
  private countOnly = false
  private payload: Row[] = []
  private values: Row = {}
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean }[] = []
  private max = Number.POSITIVE_INFINITY
  private one: 'single' | 'maybeSingle' | null = null
  constructor(private table: string) {
    assert.ok(COLUMNS[table], `ไม่มีตาราง ${table}`)
  }

  select(cols = '*', options?: { count?: string; head?: boolean }) {
    if (options !== undefined) {
      assert.deepEqual(options, { count: 'exact', head: true }, 'ตัวจำลองรองรับเฉพาะ { count: exact, head: true }')
      this.countOnly = true
    }
    this.cols = cols
    return this
  }
  insert(rows: Row | Row[]) { this.action = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
  update(values: Row) { this.action = 'update'; this.values = values; return this }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { return this.where(c, r => r[c] === v) }
  in(c: string, vs: unknown[]) {
    assert.ok(Array.isArray(vs), 'in() ต้องได้ array')
    return this.where(c, r => vs.includes(r[c]))
  }
  is(c: string, v: null) {
    assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ is(col, null)')
    return this.where(c, r => r[c] == null)
  }
  not(c: string, op: string, v: string | null) {
    if (op === 'is') {
      assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ not(col, "is", null)')
      return this.where(c, r => r[c] != null)
    }
    assert.equal(op, 'in', 'ตัวจำลองรองรับเฉพาะ not(col, "in", "(a,b)") และ not(col, "is", null)')
    const values = String(v).replace(/^\(|\)$/g, '').split(',')
    return this.where(c, r => r[c] != null && !values.includes(String(r[c])))
  }
  like(c: string, pattern: string) {
    const re = likeToRegex(pattern)
    return this.where(c, r => typeof r[c] === 'string' && re.test(r[c] as string))
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    assert.ok(COLUMNS[this.table].includes(col), `order คอลัมน์ที่ไม่มี: ${this.table}.${col}`)
    this.sorts.push({ col, asc: opts.ascending !== false })
    return this
  }
  limit(n: number) { this.max = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private where(col: string, f: (r: Row) => boolean) {
    assert.ok(COLUMNS[this.table].includes(col), `กรองคอลัมน์ที่ไม่มี: ${this.table}.${col}`)
    this.filters.push(f)
    return this
  }

  private shape(list: Row[]): Result {
    if (this.cols === null) return { data: null, error: null }
    const out = list.map(r => project(this.table, r, this.cols as string))
    if (!this.one) return { data: out, error: null }
    if (out.length === 1) return { data: out[0], error: null }
    if (out.length === 0 && this.one === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${out.length}` } }
  }

  private run(): Result {
    const rows = db[this.table]
    if (this.action === 'insert') {
      for (const p of this.payload) {
        const bad = Object.keys(p).find(c => !COLUMNS[this.table].includes(c))
        if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}'` } }
      }
      const inserted = this.payload.map(p => fullRow(this.table, p))
      rows.push(...inserted)
      return this.shape(inserted)
    }

    const hits = rows.filter(r => this.filters.every(f => f(r)))
    if (this.action === 'update') {
      const bad = Object.keys(this.values).find(c => !COLUMNS[this.table].includes(c))
      if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}'` } }
      for (const r of hits) Object.assign(r, clone(this.values))
      return this.shape(hits)
    }
    if (this.action === 'delete') {
      for (const r of hits) rows.splice(rows.indexOf(r), 1)
      return this.shape(hits)
    }

    let result: Result
    if (this.countOnly) {
      result = { data: null, error: null, count: hits.length }
    } else {
      const sorted = [...hits].sort((a, b) => {
        for (const s of this.sorts) {
          const d = compare(a[s.col], b[s.col])
          if (d !== 0) return s.asc ? d : -d
        }
        return 0
      })
      result = this.shape(sorted.slice(0, this.max))
    }
    if (this.table === 'expense_claims' && race && hits.some(r => r.id === race?.id)) {
      const { id, mutate } = race
      race = null
      mutate(rows.find(r => r.id === id) as Row)
    }
    return result
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}

const bucketApi = (bucket: string) => strict({
  getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE_BASE}/${bucket}/${path}` } }),
  remove: async (paths: string[]) => {
    storageOps.push({ op: 'remove', paths: [...paths] })
    for (const p of paths) storage.delete(`${bucket}/${p}`)
    return { data: paths.map(name => ({ name })), error: null }
  },
})

const fakeClient = strict({
  from: (table: string) => strict(new Query(table)),
  storage: strict({ from: (bucket: string) => bucketApi(bucket) }),
})

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────────
/* eslint-disable @typescript-eslint/no-require-imports */
const realServer = require('../lib/supabase-server') as typeof import('../lib/supabase-server')

const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient, removeStorageByUrls: realServer.removeStorageByUrls }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath(path: string) { revalidated.push(path) }, revalidateTag() {} }],
  [/(^|\/)lib\/logger$/, { logActivity: async (action: string, details: unknown) => { activity.push({ action, details: clone(details) }) } }],
  [/(^|\/)lib\/notifications$/, { createNotifications: async (params: Row) => { notifications.push(clone(params)) } }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')

const NAMES = [
  'submitClaim', 'cancelClaim', 'approveClaim', 'rejectClaim', 'reopenRejectedClaim', 'approveAsPendingMonthEnd',
  'markAsPendingMonthEnd', 'markAsWaitingTaxInvoice', 'markAsPaid', 'deleteClaim', 'adminOverrideStatus',
] as const
type Fn = (...args: string[]) => Promise<Record<string, unknown>>
const fns = {} as Record<(typeof NAMES)[number], Fn>
const loaded: string[] = []
for (const rel of MODULES) {
  const abs = join(ROOT, rel)
  if (![abs, `${abs}.ts`, `${abs}.tsx`].some(p => existsSync(p))) continue
  const mod = require(abs) as Record<string, unknown>
  for (const name of NAMES) if (typeof mod[name] === 'function') fns[name] = mod[name] as Fn
  loaded.push(rel)
}
/* eslint-enable @typescript-eslint/no-require-imports */
for (const name of NAMES) assert.ok(fns[name], `ไม่พบ ${name} ในโมดูล ${MODULES.join(', ')}`)

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
const costItemsOf = (claimId: string) => db.job_cost_items.filter(r => String(r.notes ?? '').endsWith(`::${claimId}`))
const putFile = (path: string) => { storage.set(`receipts/${path}`, 3); return fileUrl(path) }

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const { error, warn } = console
  console.error = () => {}
  console.warn = () => {}
  try {
    return await run()
  } finally {
    console.error = error
    console.warn = warn
  }
}

// ── ทำให้ผลเทียบกันได้: เวลา → '<ts>' · uuid → '<idN>' (ตามลำดับที่พบในกรณีนั้น) · undefined → '[undefined]' ──
const ISO_TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/
const UUID_G = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const UNDEF = '[undefined]'
function normalize(value: unknown): unknown {
  const ids = new Map<string, string>()
  const walk = (v: unknown): unknown => {
    if (v === undefined) return UNDEF
    if (typeof v === 'string') {
      if (ISO_TS.test(v)) return '<ts>'
      return v.replace(UUID_G, m => {
        const key = m.toLowerCase()
        if (!ids.has(key)) ids.set(key, `<id${ids.size + 1}>`)
        return ids.get(key) as string
      })
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]))
    return v
  }
  return walk(value)
}

type Snapshot = Record<string, unknown>
const snapshot: Snapshot = {}

/** รันหนึ่งกรณี: body ใส่ข้อมูล ล็อกอิน แล้วเรียก action — บันทึกทุกผลที่เกิดหลังจากนั้น */
async function scenario(name: string, body: () => Promise<{ id: string; result: unknown }>) {
  assert.ok(!(name in snapshot), `ชื่อกรณีซ้ำ: ${name}`)
  const mark = {
    logs: db.expense_claim_logs.length, activity: activity.length, notifications: notifications.length,
    revalidated: revalidated.length, storageOps: storageOps.length,
  }
  race = null
  const { id, result } = await quietly(body)
  assert.equal(race, null, `${name}: ตั้ง race ไว้แต่ action ไม่ได้อ่านใบเบิกนั้น`)
  snapshot[name] = normalize({
    returnValue: result,
    claimRowAfter: db.expense_claims.find(r => r.id === id) ?? null,
    logsInserted: db.expense_claim_logs.slice(mark.logs).map(l => ({ action: l.action, changes: l.changes, note: l.note })),
    activity: activity.slice(mark.activity),
    notifications: notifications.slice(mark.notifications).map(n => ({
      type: n.type, userIds: n.userIds, title: n.title, body: n.body, referenceType: n.referenceType, referenceId: n.referenceId,
    })),
    revalidated: revalidated.slice(mark.revalidated),
    costItemCount: costItemsOf(id).length,
    storageOps: storageOps.slice(mark.storageOps),
  })
}

/** ตั้งให้สถานะใบนี้ถูกเปลี่ยนทันทีหลังการอ่านครั้งแรก */
const raceOn = (id: string, concurrent: Row) => { race = { id, mutate: r => { Object.assign(r, concurrent) } } }

async function main() {
  db.profiles.push(
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin'), person(ADMIN_B, 'แอดมิน ทดสอบสอง', 'admin'),
    person(STAFF, 'พนักงาน ทดสอบ', 'staff'), person(STAFF_B, 'พนักงาน ทดสอบสอง', 'staff'),
    person(CUSTODIAN, 'ผู้ถือเงินสดย่อย ทดสอบ', 'staff'),
  )
  db.job_cost_events.push(fullRow('job_cost_events', { id: EVENT, event_name: 'งานทดสอบ', event_date: '2026-09-20', event_location: 'ห้องทดสอบ', status: 'draft', source_event_id: null }))
  const f = fns
  const closedFund = () => seedClaim({
    claim_type: 'petty_cash', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, amount: 5000, unit_price: 5000,
    quantity: 1, total_amount: 5000, receipt_urls: [], pettycash_period_start: '2026-09-01', pettycash_period_end: '2026-09-30',
    pettycash_closed_at: '2026-09-30T09:00:00.000Z',
  })

  // ══ submitClaim ═════════════════════════════════════════════════════════════
  await scenario('submitClaim/draft-ok', async () => {
    const id = seedClaim({ status: 'draft' }); loginAs(STAFF)
    return { id, result: await f.submitClaim(id) }
  })
  await scenario('submitClaim/no-receipt-event', async () => {
    const id = seedClaim({ status: 'draft', receipt_urls: [] }); loginAs(STAFF)
    return { id, result: await f.submitClaim(id) }
  })
  await scenario('submitClaim/advance-no-receipt-ok', async () => {
    const id = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'draft', receipt_urls: [], amount: 2000, unit_price: 2000, quantity: 1, total_amount: 2000 })
    loginAs(STAFF)
    return { id, result: await f.submitClaim(id) }
  })
  await scenario('submitClaim/not-owner', async () => {
    const id = seedClaim({ status: 'draft' }); loginAs(STAFF_B)
    return { id, result: await f.submitClaim(id) }
  })
  await scenario('submitClaim/wrong-status', async () => {
    const id = seedClaim({ status: 'pending', submitted_at: '2026-09-11T03:00:00.000Z' }); loginAs(STAFF)
    return { id, result: await f.submitClaim(id) }
  })
  await scenario('submitClaim/stale-race', async () => {
    const id = seedClaim({ status: 'draft' }); loginAs(STAFF)
    raceOn(id, { status: 'cancelled', cancelled_by: STAFF, cancelled_at: '2026-09-12T03:00:00.000Z' })
    return { id, result: await f.submitClaim(id) }
  })

  // ══ cancelClaim ═════════════════════════════════════════════════════════════
  await scenario('cancelClaim/draft', async () => {
    const id = seedClaim({ status: 'draft' }); loginAs(STAFF)
    return { id, result: await f.cancelClaim(id) }
  })
  await scenario('cancelClaim/pending', async () => {
    const id = seedClaim({ status: 'pending', submitted_at: '2026-09-11T03:00:00.000Z' }); loginAs(STAFF)
    return { id, result: await f.cancelClaim(id) }
  })
  await scenario('cancelClaim/not-owner', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(STAFF_B)
    return { id, result: await f.cancelClaim(id) }
  })
  await scenario('cancelClaim/wrong-status', async () => {
    const id = seedClaim({ status: 'approved', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z' }); seedCostItem(id); loginAs(STAFF)
    return { id, result: await f.cancelClaim(id) }
  })

  // ══ approveClaim ════════════════════════════════════════════════════════════
  await scenario('approveClaim/job-linked', async () => {
    const id = seedClaim({ status: 'pending', submitted_at: '2026-09-11T03:00:00.000Z' }); loginAs(ADMIN)
    return { id, result: await f.approveClaim(id) }
  })
  await scenario('approveClaim/no-job', async () => {
    const id = seedClaim({ claim_type: 'other', job_event_id: null, status: 'pending' }); loginAs(ADMIN)
    return { id, result: await f.approveClaim(id) }
  })
  await scenario('approveClaim/non-admin', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(STAFF)
    return { id, result: await f.approveClaim(id) }
  })
  await scenario('approveClaim/wrong-status', async () => {
    const id = seedClaim({ status: 'approved', approved_by: ADMIN_B, approved_at: '2026-09-12T03:00:00.000Z' }); seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.approveClaim(id) }
  })
  await scenario('approveClaim/stale-race', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(ADMIN)
    raceOn(id, { status: 'rejected', reject_reason: 'คนอื่นปฏิเสธก่อน', approved_by: ADMIN_B })
    return { id, result: await f.approveClaim(id) }
  })

  // ══ rejectClaim ═════════════════════════════════════════════════════════════
  await scenario('rejectClaim/with-reason', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(ADMIN)
    return { id, result: await f.rejectClaim(id, 'เอกสารไม่ครบ') }
  })
  await scenario('rejectClaim/empty-reason', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(ADMIN)
    return { id, result: await f.rejectClaim(id, '') }
  })

  // ══ reopenRejectedClaim ═════════════════════════════════════════════════════
  await scenario('reopenRejectedClaim/owner-ok', async () => {
    const id = seedClaim({
      status: 'rejected', reject_reason: 'ยอดผิด', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z',
      submitted_at: '2026-09-11T03:00:00.000Z',
    })
    loginAs(STAFF)
    return { id, result: await f.reopenRejectedClaim(id) }
  })
  await scenario('reopenRejectedClaim/not-owner', async () => {
    const id = seedClaim({ status: 'rejected', reject_reason: 'ยอดผิด', approved_by: ADMIN }); loginAs(ADMIN)
    return { id, result: await f.reopenRejectedClaim(id) }
  })
  await scenario('reopenRejectedClaim/closed-petty-month', async () => {
    const fund = closedFund()
    const id = seedClaim({ claim_type: 'petty_cash', job_event_id: null, status: 'rejected', submitted_by: STAFF, pettycash_fund_id: fund, receipt_urls: [] })
    loginAs(STAFF)
    return { id, result: await f.reopenRejectedClaim(id) }
  })

  // ══ approveAsPendingMonthEnd ════════════════════════════════════════════════
  await scenario('approveAsPendingMonthEnd/ok', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(ADMIN)
    return { id, result: await f.approveAsPendingMonthEnd(id) }
  })
  await scenario('approveAsPendingMonthEnd/wrong-status', async () => {
    const id = seedClaim({ status: 'approved', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z' }); seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.approveAsPendingMonthEnd(id) }
  })

  // ══ markAsPendingMonthEnd ═══════════════════════════════════════════════════
  for (const from of ['approved', 'waiting_tax_invoice', 'awaiting_payment']) {
    await scenario(`markAsPendingMonthEnd/from-${from}`, async () => {
      const id = seedClaim({ status: from, approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z' }); seedCostItem(id); loginAs(ADMIN)
      return { id, result: await f.markAsPendingMonthEnd(id) }
    })
  }
  await scenario('markAsPendingMonthEnd/wrong-status', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(ADMIN)
    return { id, result: await f.markAsPendingMonthEnd(id) }
  })

  // ══ markAsWaitingTaxInvoice ═════════════════════════════════════════════════
  await scenario('markAsWaitingTaxInvoice/from-approved', async () => {
    const id = seedClaim({ status: 'approved', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z' }); seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.markAsWaitingTaxInvoice(id) }
  })
  await scenario('markAsWaitingTaxInvoice/wrong-status', async () => {
    const id = seedClaim({ status: 'pending_month_end', approved_by: ADMIN }); seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.markAsWaitingTaxInvoice(id) }
  })

  // ══ markAsPaid (ทุกใบมีใบเสร็จ — ใบรอใบกำกับมีเลขที่ใบกำกับแล้ว) ═════════════════════════
  for (const from of ['approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment']) {
    await scenario(`markAsPaid/from-${from}`, async () => {
      const id = seedClaim({
        status: from, approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z', amount: 1250, total_amount: 1337.5,
        ...(from === 'waiting_tax_invoice' ? { tax_invoice_urls: [fileUrl('seed/iv-1.pdf')], tax_invoice_numbers: ['IV-0001'] } : {}),
      })
      seedCostItem(id); loginAs(ADMIN)
      return { id, result: await f.markAsPaid(id) }
    })
  }
  await scenario('markAsPaid/wrong-status', async () => {
    const id = seedClaim({ status: 'pending' }); loginAs(ADMIN)
    return { id, result: await f.markAsPaid(id) }
  })
  await scenario('markAsPaid/petty-topup-closed-month', async () => {
    const fund = closedFund()
    const id = seedClaim({
      claim_type: 'petty_cash', job_event_id: null, status: 'approved', submitted_by: CUSTODIAN, pettycash_fund_id: fund,
      approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z', amount: 1500, unit_price: 1500, quantity: 1, total_amount: 1500,
    })
    loginAs(ADMIN)
    return { id, result: await f.markAsPaid(id) }
  })

  // ══ deleteClaim ═════════════════════════════════════════════════════════════
  await scenario('deleteClaim/approved-job-linked', async () => {
    const id = seedClaim({
      status: 'approved', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z',
      receipt_urls: [putFile('claims/DEL/r1.jpg'), putFile('claims/DEL/r2.jpg')],
      actual_receipt_urls: [putFile('claims/DEL-actual/a1.jpg')],
      tax_invoice_urls: [putFile('claims/DEL-tax-invoice/t1.pdf'), ''],
      tax_invoice_numbers: ['IV-1', 'IV-2'],
      refund_slip_urls: [putFile('claims/DEL-refund/s1.jpg')],
    })
    seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.deleteClaim(id) }
  })
  await scenario('deleteClaim/petty-fund-with-children', async () => {
    const fund = seedClaim({
      claim_type: 'petty_cash', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, amount: 3000, unit_price: 3000,
      quantity: 1, total_amount: 3000, receipt_urls: [], pettycash_period_start: '2026-10-01', pettycash_period_end: '2026-10-31',
    })
    seedClaim({ claim_type: 'other', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, pettycash_fund_id: fund })
    loginAs(ADMIN)
    return { id: fund, result: await f.deleteClaim(fund) }
  })

  // ══ adminOverrideStatus ═════════════════════════════════════════════════════
  await scenario('adminOverrideStatus/pending-to-approved-no-reason', async () => {
    const id = seedClaim({ status: 'pending', submitted_at: '2026-09-11T03:00:00.000Z' }); loginAs(ADMIN)
    return { id, result: await f.adminOverrideStatus(id, 'approved', '') }
  })
  await scenario('adminOverrideStatus/waiting-tax-invoice-to-draft-with-reason', async () => {
    const id = seedClaim({ status: 'waiting_tax_invoice', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z', submitted_at: '2026-09-11T03:00:00.000Z' })
    seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.adminOverrideStatus(id, 'draft', 'ลูกค้าขอแก้ยอด') }
  })
  await scenario('adminOverrideStatus/paid-to-approved-no-reason', async () => {
    const id = seedClaim({ status: 'paid', approved_by: ADMIN, paid_by: ADMIN, paid_at: '2026-09-13T03:00:00.000Z' }); seedCostItem(id); loginAs(ADMIN)
    return { id, result: await f.adminOverrideStatus(id, 'approved', '') }
  })
  await scenario('adminOverrideStatus/closed-petty-child', async () => {
    const fund = closedFund()
    const id = seedClaim({ claim_type: 'other', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, pettycash_fund_id: fund })
    loginAs(ADMIN)
    return { id, result: await f.adminOverrideStatus(id, 'cancelled', 'บันทึกผิดกล่อง') }
  })

  const keys = Object.keys(snapshot)
  assert.ok(keys.length >= 30, `ต้องมีอย่างน้อย 30 กรณี (มี ${keys.length})`)
  for (const name of NAMES) assert.ok(keys.some(k => k.startsWith(`${name}/`)), `ไม่มีกรณีของ ${name}`)

  if (WRITE) {
    mkdirSync(dirname(GOLDEN_OUT), { recursive: true })
    writeFileSync(GOLDEN_OUT, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
    console.log(`เขียนผลอ้างอิง ${keys.length} กรณี → ${GOLDEN_OUT} (จาก ${loaded.join(', ')})`)
    return
  }

  assert.ok(existsSync(DEFAULT_GOLDEN), `ไม่มีผลอ้างอิง ${DEFAULT_GOLDEN} — รันด้วย --write-golden กับโค้ดก่อนย้ายก่อน`)
  const golden = JSON.parse(readFileSync(DEFAULT_GOLDEN, 'utf8')) as Snapshot
  assert.deepEqual(keys, Object.keys(golden), 'ชุดกรณีต้องตรงกับผลอ้างอิง')
  for (const key of keys) {
    assert.deepEqual(snapshot[key], golden[key], key)
    console.log(`PASS  ${key}`)
  }
  console.log(`      โมดูลที่ตรวจ: ${loaded.join(', ')} (${keys.length} กรณี)`)
  console.log('\nclaim-lifecycle: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
