// ความถูกต้องของข้อมูลใบเบิก (ขั้น 0 · D1 D3 D4 D5 D6 ของ docs/specs/finance-refactor-plan.md)
// รัน server action ตัวจริงของ app/(authenticated)/finance/actions.ts กับฐานข้อมูลจำลองในหน่วยความจำ
// Run:  npx tsx scripts/finance-integrity.check.ts
//
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง ไม่ต้องมี env: แทน next/headers, next/cache, @/lib/supabase-server,
// @/lib/logger และ @/lib/notifications ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/claim-filed.check.ts)
// token ล็อกอินเซ็นจริง · removeStorageByUrls ใช้ตัวจริงกับสตอเรจจำลองที่จดทุกคำสั่ง · คนและใบเบิกสังเคราะห์ทั้งหมด
// ตัวจำลอง: update ใช้เงื่อนไขจริง (ไม่ตรง = ไม่เปลี่ยนอะไร ไม่คืนแถว) · เลขที่ใบเบิกซ้ำ = 23505 ·
// rpc('next_claim_number') ตอบปกติหรือ PGRST202 ได้ · สั่งให้การอัปโหลดครั้งที่ n พังได้ · เมธอดที่ไม่ได้ทำไว้ throw
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-integrity: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { outstandingKind } from '../app/(authenticated)/finance/claim-rules'

process.env.SESSION_SECRET = 'finance-integrity-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string; details?: string }
type Result = { data: unknown; error: DbError | null; count?: number }

// ── คน งาน และใบเบิก (สังเคราะห์) ────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), ADMIN_B = uid(2), STAFF = uid(3), CUSTODIAN = uid(4)
const EVENT = uid(901)
const STORAGE_BASE = 'https://fake.supabase.test/storage/v1/object/public'
const fileUrl = (path: string) => `${STORAGE_BASE}/receipts/${path}`
const STALE = 'ใบเบิกนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่'

const person = (id: string, full_name: string, role: string): Row =>
  ({ id, full_name, nickname: null, role, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

/** คอลัมน์ที่มีจริง — insert/update/select ที่อ้างคอลัมน์อื่นได้ error แบบ PostgREST (กันโค้ดพิมพ์ชื่อผิดแล้วผ่านแบบเงียบ) */
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
  event_closures: ['id', 'event_name', 'event_date', 'event_location', 'created_at'],
  events: ['id', 'name', 'event_date', 'event_time', 'event_end_time', 'location', 'status', 'created_at'],
}

const db: Record<string, Row[]> = Object.fromEntries(Object.keys(COLUMNS).map(t => [t, []]))
let seq = 0
let tick = Date.parse('2026-09-01T00:00:00.000Z')
const nextId = () => uid(50_000 + ++seq)
/** created_at เพิ่มทีละวินาที — ลำดับ "เก่ากว่า" แน่นอน */
const nextTs = () => new Date((tick += 1000)).toISOString()
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))

/** แถวเต็ม: คอลัมน์ที่ไม่ได้ใส่ = null แบบที่ Postgres เติมให้ */
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
function seedCostItem(claimId: string, notes: string, over: Row = {}): string {
  const row = fullRow('job_cost_items', {
    job_event_id: EVENT, category: 'travel', description: '[เบิกเงิน] ใบทดสอบ', amount: 300, unit_price: 100,
    quantity: 3, unit: 'รายการ', recorded_by: ADMIN, notes, ...over,
  })
  db.job_cost_items.push(row)
  void claimId
  return String(row.id)
}

// ── บันทึกทุกคำสั่ง + ผลข้างเคียงที่จับได้ ──────────────────────────────────────────
const ops: { table: string; action: string; payload?: unknown }[] = []
const activity: { action: string; details: unknown }[] = []
const notifications: Row[] = []
const revalidated: string[] = []

/** ฐานข้อมูลจำลองเปลี่ยนแถวทันที "หลัง" การอ่านใบเบิกนี้ครั้งแรก — จำลองคนอื่นเปลี่ยนสถานะระหว่างที่ action อ่านแล้วแต่ยังไม่เขียน */
let race: { id: string; mutate: (row: Row) => void } | null = null

// ── rpc('next_claim_number') ────────────────────────────────────────────────────
let rpcMode: 'installed' | 'missing-pgrst' | 'missing-pg' = 'installed'
/** เลขที่ฟังก์ชันจะคืนตามลำดับ (ว่าง = คำนวณแบบ SQL: เลขสูงสุดของเดือนไทย + 1) */
const rpcQueue: string[] = []
const thaiYm = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 7).replace('-', '')

// ── สตอเรจจำลอง ──────────────────────────────────────────────────────────────
const storage = new Map<string, number>()
const storageOps: { op: 'upload' | 'remove'; paths: string[] }[] = []
let uploadCalls = 0
/** การอัปโหลดครั้งที่เท่านี้ (นับสะสม) ล้ม */
let failUploadAt: number | null = null
const failNthUploadFromNow = (n: number) => { failUploadAt = uploadCalls + n }

/** เรียกเมธอดที่ตัวจำลองไม่มี → throw ทันที */
function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

/** แยก select ตามจุลภาคชั้นนอก (ในวงเล็บของ embed มีจุลภาค) */
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
  not(c: string, op: string, v: string) {
    assert.equal(op, 'in', 'ตัวจำลองรองรับเฉพาะ not(col, "in", "(a,b)")')
    const values = v.replace(/^\(|\)$/g, '').split(',')
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
    const payload = this.action === 'insert' ? this.payload : this.action === 'update' ? this.values : undefined
    ops.push({ table: this.table, action: this.action, ...(payload ? { payload: clone(payload) } : {}) })

    if (this.action === 'insert') {
      for (const p of this.payload) {
        const bad = Object.keys(p).find(c => !COLUMNS[this.table].includes(c))
        if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}'` } }
      }
      if (this.table === 'expense_claims') {
        const numbers = this.payload.map(p => p.claim_number)
        const taken = numbers.find((n, i) => rows.some(r => r.claim_number === n) || numbers.indexOf(n) !== i)
        if (taken !== undefined) {
          return {
            data: null,
            error: { code: '23505', message: 'duplicate key value violates unique constraint "expense_claims_claim_number_key"', details: `Key (claim_number)=(${String(taken)}) already exists.` },
          }
        }
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

    // select
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
  upload: async (path: string, file: File, options?: { contentType?: string; upsert?: boolean }) => {
    uploadCalls++
    assert.equal(options?.upsert, false, 'อัปโหลดต้องไม่ทับไฟล์เดิม')
    storageOps.push({ op: 'upload', paths: [path] })
    if (failUploadAt === uploadCalls) return { data: null, error: { message: 'จำลอง: อัปโหลดไม่สำเร็จ', statusCode: '500' } }
    storage.set(`${bucket}/${path}`, file.size)
    return { data: { path }, error: null }
  },
  getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE_BASE}/${bucket}/${path}` } }),
  remove: async (paths: string[]) => {
    storageOps.push({ op: 'remove', paths: [...paths] })
    for (const p of paths) storage.delete(`${bucket}/${p}`)
    return { data: paths.map(name => ({ name })), error: null }
  },
})

const fakeClient = strict({
  from: (table: string) => strict(new Query(table)),
  rpc: async (fn: string, args?: unknown) => {
    assert.equal(fn, 'next_claim_number', `ตัวจำลองไม่รองรับ rpc ${fn}`)
    assert.equal(args, undefined, 'next_claim_number ไม่มีอาร์กิวเมนต์')
    ops.push({ table: 'rpc', action: 'rpc' })
    if (rpcMode === 'missing-pgrst') {
      return { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.next_claim_number without parameters in the schema cache' } }
    }
    if (rpcMode === 'missing-pg') return { data: null, error: { code: '42883', message: 'function next_claim_number() does not exist' } }
    const queued = rpcQueue.shift()
    if (queued) return { data: queued, error: null }
    const prefix = `EXP-${thaiYm()}-`
    const max = Math.max(0, ...db.expense_claims.map(r => Number(/^EXP-\d{6}-(\d+)/.exec(String(r.claim_number))?.[1] ?? 0) * (String(r.claim_number).startsWith(prefix) ? 1 : 0)))
    return { data: `${prefix}${String(max + 1).padStart(3, '0')}`, error: null }
  },
  storage: strict({ from: (bucket: string) => bucketApi(bucket) }),
})

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────────
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
const actions = require('../app/(authenticated)/finance/actions') as typeof import('../app/(authenticated)/finance/actions')
// การเปลี่ยนสถานะย้ายไป lifecycle-actions.ts (ขั้น 4) — รวมเป็นชุดเดียวกับ actions ให้ส่วนที่เหลือของสคริปต์ไม่ต้องแก้
const lifecycle = require('../app/(authenticated)/finance/lifecycle-actions') as typeof import('../app/(authenticated)/finance/lifecycle-actions')
/* eslint-enable @typescript-eslint/no-require-imports */
const {
  createClaim, updateClaim, submitClaim, cancelClaim, approveClaim, rejectClaim, approveAsPendingMonthEnd,
  markAsPendingMonthEnd, markAsWaitingTaxInvoice, uploadTaxInvoice, markAsPaid, deleteClaim, adminOverrideStatus,
  getJobEventsForSelect, settleAdvanceClaim, confirmRefundReceived, addPettyCashExpense, createPettyCashTopup,
  closePettyCashMonth,
  reopenRejectedClaim,
} = { ...actions, ...lifecycle }

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
const logout = () => cookieJar.clear()

const claimRow = (id: string) => {
  const found = db.expense_claims.find(r => r.id === id)
  assert.ok(found, `ไม่พบใบเบิก ${id}`)
  return found
}
/** รายการต้นทุนของใบเบิก — นับแยกเองจาก notes (ไม่เรียกโค้ดจริง) */
const costItemsOf = (claimId: string) => db.job_cost_items.filter(r => String(r.notes ?? '').endsWith(`::${claimId}`))
const logsOf = (claimId: string) => db.expense_claim_logs.filter(r => r.claim_id === claimId)
const writesSince = (from: number) => ops.slice(from).filter(o => o.action !== 'select')
const file = (name: string, bytes = 3) => new File([new Uint8Array(bytes).fill(7)], name, { type: 'image/jpeg' })
const storageKeys = () => [...storage.keys()].sort()

function claimForm(over: Record<string, string | null> = {}, files: File[] = []) {
  const fd = new FormData()
  const base: Record<string, string | null> = {
    claim_type: 'other', title: 'ค่าน้ำดื่มทีมงาน', category: 'food', amount: '300', unit_price: '100', quantity: '3',
    unit: 'ขวด', vat_mode: 'none', withholding_tax_rate: '0', expense_date: '2026-09-15', funding_source: 'company',
  }
  for (const [k, v] of Object.entries({ ...base, ...over })) if (v !== null) fd.set(k, v)
  for (const f of files) fd.append('receipt_files', f)
  return fd
}

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

/** เวลาปัจจุบันจำลอง (Date.now และ new Date() ไม่มีอาร์กิวเมนต์) ระหว่าง run */
async function withClock<T>(iso: string, run: () => Promise<T>): Promise<T> {
  const RealDate = Date
  const fixed = RealDate.parse(iso)
  globalThis.Date = new Proxy(RealDate, {
    construct: (target, args, newTarget) => Reflect.construct(target, args.length === 0 ? [fixed] : args, newTarget),
    get: (target, prop, receiver) => (prop === 'now' ? () => fixed : Reflect.get(target, prop, receiver)),
  })
  try {
    return await run()
  } finally {
    globalThis.Date = RealDate
  }
}

/** ทุกผลข้างเคียงที่ต้องไม่เกิดเมื่อสถานะไม่ตรง */
const sideEffects = () => ({
  logs: db.expense_claim_logs.length,
  activity: activity.length,
  notifications: notifications.length,
  costItems: JSON.stringify(db.job_cost_items),
  storage: JSON.stringify(storageKeys()),
  revalidated: revalidated.length,
})

/**
 * action อ่านใบเบิกได้สถานะหนึ่ง แล้วคนอื่นเปลี่ยนสถานะก่อนที่ action จะเขียน (race)
 * ต้องได้ STALE · ใบเบิกต้องเป็นค่าที่คนอื่นเปลี่ยนไว้ทุกช่อง · ไม่มี log / activity / แจ้งเตือน / รายการต้นทุน / ไฟล์ / revalidate
 */
async function expectStale(label: string, claimId: string, concurrent: Row, run: () => Promise<{ error?: string }>, message = STALE) {
  let afterRace: Row | null = null
  race = { id: claimId, mutate: r => { Object.assign(r, concurrent); afterRace = clone(r) } }
  const before = sideEffects()
  const res = await quietly(run)
  assert.equal(race, null, `${label}: action ต้องอ่านใบเบิกก่อนเขียน`)
  assert.equal(res.error, message, `${label}: ต้องได้ "${message}" (ได้ ${JSON.stringify(res)})`)
  assert.deepEqual(claimRow(claimId), afterRace, `${label}: ใบเบิกต้องไม่ถูกเขียนทับ`)
  assert.deepEqual(sideEffects(), before, `${label}: ต้องไม่มีผลข้างเคียงใดๆ`)
}

const pass = (label: string) => console.log(`PASS  ${label}`)

async function main() {
  db.profiles.push(
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin'), person(ADMIN_B, 'แอดมิน ทดสอบสอง', 'admin'),
    person(STAFF, 'พนักงาน ทดสอบ', 'staff'), person(CUSTODIAN, 'ผู้ถือเงินสดย่อย ทดสอบ', 'staff'),
  )
  db.job_cost_events.push(fullRow('job_cost_events', { id: EVENT, event_name: 'งานทดสอบ', event_date: '2026-09-20', event_location: 'ห้องทดสอบ', status: 'draft', source_event_id: null }))
  db.event_closures.push(fullRow('event_closures', { event_name: 'งานปิดแล้ว ทดสอบ', event_date: '2026-08-01', event_location: null }))
  db.events.push(fullRow('events', { name: 'งานเปิดอยู่ ทดสอบ', event_date: '2026-10-05', location: null, status: 'upcoming' }))

  // ══ ตัวจำลองทำงานเหมือนฐานข้อมูลจริงในเรื่องที่ตรวจ ═══════════════════════════════════
  {
    const id = seedClaim({ status: 'pending' })
    const before = JSON.stringify(claimRow(id))
    const miss = await fakeClient.from('expense_claims').update({ status: 'approved' }).eq('id', id).eq('status', 'draft').select('id')
    assert.deepEqual(miss, { data: [], error: null }, 'update ที่เงื่อนไขไม่ตรง: ไม่คืนแถว')
    assert.equal(JSON.stringify(claimRow(id)), before, 'update ที่เงื่อนไขไม่ตรง: ไม่เปลี่ยนอะไร')
    const dup = await fakeClient.from('expense_claims').insert({ claim_number: claimRow(id).claim_number, title: 'ซ้ำ' }).select('id').single()
    assert.equal(dup.error?.code, '23505', 'เลขที่ซ้ำ → 23505')
    assert.equal(db.expense_claims.filter(r => r.title === 'ซ้ำ').length, 0, 'เลขที่ซ้ำ → ไม่มีแถวใหม่')
    const missing = await fakeClient.from('expense_claims').update({ no_such_column: 1 }).eq('id', id)
    assert.equal(missing.error?.code, 'PGRST204', 'คอลัมน์ที่ไม่มี → PGRST204')
    assert.throws(() => (fakeClient.from('expense_claims') as unknown as { or: (s: string) => unknown }).or('status.eq.paid'), /ไม่รองรับ \.or\(\)/)
    assert.throws(() => (fakeClient.storage.from('receipts') as unknown as { list: () => unknown }).list(), /ไม่รองรับ \.list\(\)/)
    assert.throws(() => (fakeClient as unknown as { auth: unknown }).auth, /ไม่รองรับ \.auth\(\)/)
    rpcMode = 'missing-pgrst'
    assert.equal((await fakeClient.rpc('next_claim_number')).error?.code, 'PGRST202')
    rpcMode = 'installed'
    failNthUploadFromNow(1)
    assert.ok((await fakeClient.storage.from('receipts').upload('x/y.jpg', file('y.jpg'), { upsert: false })).error, 'สั่งให้อัปโหลดครั้งถัดไปล้มได้')
    assert.equal(storage.size, 0)
    db.expense_claims.splice(db.expense_claims.findIndex(r => r.id === id), 1)
    pass('ตัวจำลอง: update ที่เงื่อนไขไม่ตรงไม่เปลี่ยนอะไรและไม่คืนแถว · เลขที่ซ้ำ = 23505 · คอลัมน์ที่ไม่มี = PGRST204 · rpc ตอบ PGRST202 ได้ · อัปโหลดครั้งที่ n ล้มได้ · เมธอดที่ไม่มี throw')
  }

  // ══ P0-B14: getJobEventsForSelect ไม่ล็อกอิน → [] และไม่อ่านอะไรเลย ═══════════════════════
  logout()
  let mark = ops.length
  assert.deepEqual(await getJobEventsForSelect(), [])
  assert.equal(ops.length, mark, `ไม่ล็อกอินต้องไม่อ่านฐานข้อมูล (อ่าน ${ops.length - mark} ครั้ง)`)
  cookieJar.set('session_token', `${ADMIN}:${Date.now()}:${'0'.repeat(64)}`)
  mark = ops.length
  assert.deepEqual(await getJobEventsForSelect(), [], 'token ปลอม = ไม่ล็อกอิน')
  assert.ok(ops.slice(mark).every(o => o.table !== 'job_cost_events' && o.table !== 'events' && o.table !== 'event_closures'))
  loginAs(STAFF)
  const events = await getJobEventsForSelect()
  assert.equal(events.length, 3, 'ล็อกอินแล้วได้รายชื่องาน (costs + ปิดงาน + events)')
  pass('P0-B14 getJobEventsForSelect() ไม่ล็อกอิน → [] ไม่มีการอ่านฐานข้อมูลเลย · token ปลอม → [] ไม่อ่านตารางงาน · ล็อกอินแล้วได้ 3 งาน')

  // ══ ตัวตนมาจาก getFinanceViewer: cookie session_role แก้เองไม่ได้สิทธิ์ ═════════════════
  {
    const id = seedClaim({ status: 'pending' })
    loginAs(STAFF)
    cookieJar.set('session_role', 'admin')
    mark = ops.length
    const res = await approveClaim(id)
    assert.match(String(res.error), /เฉพาะ Admin/)
    assert.equal(claimRow(id).status, 'pending')
    assert.equal(writesSince(mark).length, 0)
    pass('getSession → getFinanceViewer: พนักงานตั้ง cookie session_role=admin แล้วกดอนุมัติ → ถูกปฏิเสธ ไม่เขียนอะไร')
  }

  // ══ P0-B1: มีฟังก์ชัน next_claim_number → ใช้เลขที่ฟังก์ชันคืน ═══════════════════════════
  loginAs(STAFF)
  rpcMode = 'installed'
  rpcQueue.push('EXP-202609-215')
  const b1 = await createClaim(claimForm({ title: 'P0-B1 ใบใหม่' }))
  assert.equal(b1.error, undefined, `createClaim ต้องสำเร็จ (ได้ ${b1.error})`)
  const b1Row = claimRow(String(b1.id))
  assert.equal(b1Row.claim_number, 'EXP-202609-215')
  assert.equal(b1Row.status, 'draft')
  assert.deepEqual(activity.at(-1), { action: 'CREATE_EXPENSE_CLAIM', details: { claimId: b1.id, claimNumber: 'EXP-202609-215', title: 'P0-B1 ใบใหม่', amount: 300, claim_type: 'other' } })
  pass('P0-B1 next_claim_number ติดตั้งแล้ว → createClaim เก็บเลขที่ที่ฟังก์ชันคืน (EXP-202609-215) และ log ด้วยเลขเดียวกัน')

  // ══ P0-B2: ไม่มีฟังก์ชัน → เลขสูงสุดของเดือนไทย + 1 (ไม่ใช่จำนวนใบ + 1) ═════════════════════
  for (const [mode, code] of [['missing-pgrst', 'PGRST202'], ['missing-pg', '42883']] as const) {
    const seeded = ['EXP-202610-001', 'EXP-202610-002', 'EXP-202610-007', 'EXP-202609-099']
      .map(n => seedClaim({ claim_number: n, claim_type: 'other', job_event_id: null, status: 'draft' }))
    rpcMode = mode
    const created = await withClock('2026-09-30T18:00:00Z', async () => {
      loginAs(STAFF)
      // ไม่ส่งวันที่ → ค่าเริ่มต้น = วันนี้ตามเวลาไทย (1 ต.ค. 01:00 ไทย = 30 ก.ย. 18:00 UTC)
      return createClaim(claimForm({ title: `P0-B2 ${code}`, expense_date: null }))
    })
    assert.equal(created.error, undefined, `${code}: createClaim ต้องสำเร็จ (ได้ ${created.error})`)
    const row = claimRow(String(created.id))
    assert.equal(row.claim_number, 'EXP-202610-008', `${code}: ต้องได้ -008 (เลขสูงสุด 007 + 1) ไม่ใช่ -004 (จำนวนใบ + 1) · เดือน 10 ตามเวลาไทย`)
    assert.equal(row.expense_date, '2026-10-01', `${code}: วันที่เริ่มต้นตามเวลาไทย`)
    // ล้างเพื่อรอบถัดไป
    for (const id of [...seeded, String(created.id)]) db.expense_claims.splice(db.expense_claims.findIndex(r => r.id === id), 1)
  }
  {
    const seeded = ['EXP-202610-1000', 'EXP-202610-012-2'].map(n => seedClaim({ claim_number: n, claim_type: 'other', job_event_id: null, status: 'draft' }))
    rpcMode = 'missing-pgrst'
    const created = await withClock('2026-10-15T03:00:00Z', async () => { loginAs(STAFF); return createClaim(claimForm({ title: 'P0-B2 สี่หลัก' })) })
    assert.equal(claimRow(String(created.id)).claim_number, 'EXP-202610-1001', 'เลขสี่หลักคงสี่หลัก · ตัวต่อท้าย -2 ไม่นับเป็นเลขลำดับ')
    for (const id of [...seeded, String(created.id)]) db.expense_claims.splice(db.expense_claims.findIndex(r => r.id === id), 1)
  }
  rpcMode = 'installed'
  loginAs(STAFF)
  pass('P0-B2 ไม่มีฟังก์ชัน (PGRST202 และ 42883) + มี -001 -002 -007 → ใบถัดไป EXP-202610-008 (ไม่ใช่ -004) · นาฬิกา 2026-09-30T18:00:00Z → เดือน 202610 และวันที่ 2026-10-01 ตามเวลาไทย · 1000 → 1001')

  // ══ P0-B3: เลขชนกัน (23505) → ขอเลขใหม่ · ชนครบ 3 ครั้ง → error ไม่มีใบ ไฟล์ถูกลบ ═══════════════
  {
    const taken = seedClaim({ claim_number: 'EXP-202609-005', claim_type: 'other', job_event_id: null, status: 'draft' })
    const takenBefore = JSON.stringify(claimRow(taken))
    rpcQueue.push('EXP-202609-005', 'EXP-202609-301')
    mark = ops.length
    const res = await createClaim(claimForm({ title: 'P0-B3 ชนครั้งเดียว' }))
    assert.equal(res.error, undefined, `ต้องสำเร็จหลังลองใหม่ (ได้ ${res.error})`)
    assert.equal(claimRow(String(res.id)).claim_number, 'EXP-202609-301')
    const inserts = ops.slice(mark).filter(o => o.table === 'expense_claims' && o.action === 'insert')
    assert.equal(inserts.length, 2, 'insert 2 ครั้ง (ชน 1 + สำเร็จ 1)')
    assert.equal(ops.slice(mark).filter(o => o.action === 'rpc').length, 2, 'ขอเลข 2 ครั้ง')
    assert.equal(JSON.stringify(claimRow(taken)), takenBefore, 'ใบเดิมที่ถือเลขนั้นไม่ถูกแตะ')

    rpcQueue.push('EXP-202609-005', 'EXP-202609-005', 'EXP-202609-301')
    const claimsBefore = db.expense_claims.length
    const activityBefore = activity.length
    mark = ops.length
    const fail = await quietly(() => createClaim(claimForm({ title: 'P0-B3 ชนสามครั้ง' }, [file('ใบเสร็จ.jpg')])))
    assert.match(String(fail.error), /เลขชนกัน 3 ครั้ง/)
    assert.equal(db.expense_claims.length, claimsBefore, 'ไม่มีใบเบิกใหม่')
    assert.equal(db.expense_claims.filter(r => r.title === 'P0-B3 ชนสามครั้ง').length, 0)
    assert.equal(ops.slice(mark).filter(o => o.table === 'expense_claims' && o.action === 'insert').length, 3, 'insert 3 ครั้งแล้วหยุด')
    assert.equal(activity.length, activityBefore, 'ไม่ลง activity log')
    assert.deepEqual(storageKeys(), [], 'ไฟล์ที่อัปโหลดไว้ถูกลบ')
    assert.equal(rpcQueue.length, 0)
  }
  // เงินสดย่อย (เติมเงิน) ใช้ตัวออกเลขและการลองใหม่ชุดเดียวกัน
  const FUND = seedClaim({
    claim_type: 'petty_cash', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, amount: 5000, unit_price: 5000,
    quantity: 1, receipt_urls: [], pettycash_period_start: '2026-09-01', pettycash_period_end: '2026-09-30',
    bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-00000-0', account_holder_name: 'ผู้ถือเงินสดย่อย ทดสอบ',
  })
  {
    loginAs(CUSTODIAN)
    rpcQueue.push('EXP-202609-005', 'EXP-202609-302')
    const fd = new FormData()
    fd.set('amount', '1500')
    fd.set('note', 'เติมกลางเดือน')
    const topup = await createPettyCashTopup(FUND, fd)
    assert.equal(topup.error, undefined, `เติมเงินต้องสำเร็จ (ได้ ${topup.error})`)
    assert.equal(claimRow(String(topup.id)).claim_number, 'EXP-202609-302')
  }
  pass('P0-B3 insert แรกชน 23505 → ขอเลขใหม่แล้วสำเร็จ (createClaim และ createPettyCashTopup) · ชน 3 ครั้ง → { error } ไม่มีใบเบิก ไม่ลง log ไฟล์ที่อัปโหลดถูกลบ')

  // ══ P0-B6: createClaim 3 ไฟล์ ไฟล์ที่ 2 อัปโหลดไม่สำเร็จ ═══════════════════════════════════
  {
    loginAs(STAFF)
    const claimsBefore = db.expense_claims.length
    const activityBefore = activity.length
    failNthUploadFromNow(2)
    const uploadsBefore = uploadCalls
    const res = await quietly(() => createClaim(claimForm({ title: 'P0-B6 สามไฟล์' }, [file('a.jpg'), file('b.jpg'), file('c.jpg')])))
    assert.match(String(res.error), /อัพโหลดไฟล์ไม่สำเร็จ 1 จาก 3 ไฟล์ \(b\.jpg\)/, `ต้องบอกจำนวนและชื่อไฟล์ (ได้ ${res.error})`)
    assert.equal(uploadCalls - uploadsBefore, 3, 'พยายามครบ 3 ไฟล์ (นับไฟล์ที่ไม่สำเร็จได้ถูก)')
    assert.equal(db.expense_claims.length, claimsBefore, 'ไม่มีใบเบิกใหม่')
    assert.deepEqual(storageKeys(), [], 'สตอเรจไม่เหลือไฟล์ใดใน 3 ไฟล์')
    assert.equal(activity.length, activityBefore)
  }
  pass('P0-B6 createClaim 3 ไฟล์ ไฟล์ที่ 2 ล้ม → { error: "…1 จาก 3 ไฟล์ (b.jpg)…" } ไม่มีใบเบิก สตอเรจไม่เหลือไฟล์ใดเลย')

  // ══ P0-B11: ตรวจค่าก่อนเขียน ═══════════════════════════════════════════════════════
  {
    loginAs(STAFF)
    const bad: [string, Record<string, string>][] = [
      ['ยอดติดลบ', { amount: '-5' }],
      ['ราคาต่อหน่วยติดลบ', { unit_price: '-100', amount: '0' }],
      ['จำนวน 0', { quantity: '0' }],
      ['จำนวนไม่ใช่ตัวเลข', { quantity: 'abc' }],
      ['ยอดไม่จำกัด', { amount: 'Infinity' }],
      ['ประเภท salary', { claim_type: 'salary' }],
      ['vat_mode x', { vat_mode: 'x' }],
      ['หัก ณ ที่จ่าย 150', { withholding_tax_rate: '150' }],
      ['หัก ณ ที่จ่ายติดลบ', { withholding_tax_rate: '-1' }],
    ]
    for (const [label, over] of bad) {
      mark = ops.length
      const uploads = uploadCalls
      const res = await createClaim(claimForm({ title: `P0-B11 ${label}`, ...over }, [file('r.jpg')]))
      assert.ok(typeof res.error === 'string' && res.error.length > 0, `${label}: ต้องได้ error`)
      assert.equal(writesSince(mark).length, 0, `${label}: ต้องไม่เขียนอะไร (รวมการขอเลขที่) — ได้ ${JSON.stringify(writesSince(mark))}`)
      assert.equal(uploadCalls, uploads, `${label}: ต้องไม่อัปโหลด`)
    }
    const missingType = claimForm({ title: 'P0-B11 ไม่มีประเภท' })
    missingType.delete('claim_type')
    mark = ops.length
    assert.ok((await createClaim(missingType)).error)
    assert.equal(writesSince(mark).length, 0)

    const advance = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'draft', submitted_by: STAFF })
    const petty = seedClaim({ claim_type: 'petty_cash', job_event_id: null, status: 'draft', submitted_by: STAFF })
    const other = seedClaim({ claim_type: 'other', job_event_id: null, status: 'draft', submitted_by: STAFF })
    loginAs(ADMIN)
    for (const [id, to] of [[advance, 'event'], [advance, 'other'], [petty, 'event'], [other, 'advance'], [other, 'petty_cash']] as const) {
      const before = JSON.stringify(claimRow(id))
      mark = ops.length
      const res = await updateClaim(id, { claim_type: to, job_event_id: to === 'event' ? EVENT : null, title: 'เปลี่ยนประเภท' })
      assert.match(String(res.error), /เปลี่ยนประเภทใบเบิกได้เฉพาะ/, `${claimRow(id).claim_type} → ${to}: ต้องได้ error`)
      assert.equal(writesSince(mark).length, 0, `${claimRow(id).claim_type} → ${to}: ต้องไม่เขียน`)
      assert.equal(JSON.stringify(claimRow(id)), before)
    }
    // ประเภทเดิม (ไม่เปลี่ยน) และ other ↔ event ยังทำได้
    assert.deepEqual(await updateClaim(advance, { claim_type: 'advance', title: 'แก้ชื่อทดลองจ่าย' }), { success: true })
    assert.deepEqual(await updateClaim(other, { claim_type: 'event', job_event_id: EVENT }), { success: true })
    assert.equal(claimRow(other).claim_type, 'event')
  }
  pass('P0-B11 createClaim ปฏิเสธ ยอดติดลบ / จำนวน 0 / ไม่ใช่ตัวเลข / ประเภท salary / vat_mode x / หัก ณ ที่จ่าย 150 → { error } ไม่เขียน ไม่ขอเลข ไม่อัปโหลด · updateClaim ทดลองจ่าย → event ถูกปฏิเสธ ไม่เขียน (other ↔ event ยังได้)')

  // ══ P0-B4: กดอนุมัติสองครั้งพร้อมกัน ═══════════════════════════════════════════════════
  {
    const id = seedClaim({ status: 'pending', title: 'P0-B4 อนุมัติซ้ำ' })
    loginAs(ADMIN)
    const logsBefore = db.expense_claim_logs.length
    const notesBefore = notifications.length
    const approvals = () => activity.filter(a => a.action === 'APPROVE_EXPENSE_CLAIM' && (a.details as Row).claimId === id).length
    const results = await Promise.all([approveClaim(id), approveClaim(id)])
    assert.deepEqual(results.filter(r => 'success' in r && r.success).length, 1, `สำเร็จหนึ่งครั้ง (ได้ ${JSON.stringify(results)})`)
    assert.deepEqual(results.filter(r => r.error === STALE).length, 1, 'อีกครั้งได้ "ถูกเปลี่ยนสถานะไปแล้ว"')
    assert.equal(claimRow(id).status, 'approved')
    assert.equal(costItemsOf(id).length, 1, 'รายการต้นทุนหนึ่งรายการ')
    assert.equal(logsOf(id).length, 1, 'log หนึ่งแถว')
    assert.equal(db.expense_claim_logs.length - logsBefore, 1)
    assert.equal(notifications.length - notesBefore, 1, 'แจ้งเตือนหนึ่งครั้ง')
    assert.equal(approvals(), 1, 'activity log หนึ่งครั้ง')
    // กดซ้ำทีหลัง (ไม่พร้อมกัน) → ถูกปฏิเสธจากการตรวจสถานะ ผลไม่เปลี่ยน
    assert.ok((await approveClaim(id)).error)
    assert.equal(costItemsOf(id).length, 1)
    assert.equal(logsOf(id).length, 1)
    assert.equal(approvals(), 1)
    const item = costItemsOf(id)[0]
    const c = claimRow(id)
    assert.deepEqual(
      { job_event_id: item.job_event_id, category: item.category, description: item.description, amount: item.amount, unit_price: item.unit_price, quantity: item.quantity, unit: item.unit, recorded_by: item.recorded_by, notes: item.notes },
      { job_event_id: EVENT, category: 'travel', description: '[เบิกเงิน] P0-B4 อนุมัติซ้ำ', amount: 300, unit_price: 100, quantity: 3, unit: 'รายการ', recorded_by: ADMIN, notes: `${c.claim_number}::${id}` },
      'ค่าของรายการต้นทุนเท่าที่ approveClaim เคยสร้าง',
    )
  }
  pass('P0-B4 approveClaim สองครั้งพร้อมกัน → สำเร็จ 1 · อีกครั้งได้ "ถูกเปลี่ยนสถานะไปแล้ว" · รายการต้นทุน 1 · log 1 · แจ้งเตือน 1 · activity 1 (กดซ้ำทีหลังก็ไม่เพิ่ม)')

  // ══ P0-B5: สถานะเปลี่ยนระหว่างอ่านกับเขียน → ไม่เปลี่ยนอะไร ไม่มีผลข้างเคียง ═══════════════════
  {
    loginAs(ADMIN)
    const paidRace = { status: 'paid', paid_by: ADMIN_B, paid_at: '2026-09-29T03:00:00.000Z' }
    let id = seedClaim({ status: 'approved' })
    seedCostItem(id, `${claimRow(id).claim_number}::${id}`)
    await expectStale('markAsPaid', id, paidRace, () => markAsPaid(id))

    id = seedClaim({ status: 'pending' })
    await expectStale('rejectClaim', id, { status: 'approved', approved_by: ADMIN_B }, () => rejectClaim(id, 'เอกสารไม่ครบ'))

    id = seedClaim({ status: 'pending' })
    await expectStale('adminOverrideStatus', id, { status: 'approved', approved_by: ADMIN_B }, () => adminOverrideStatus(id, 'paid', 'จ่ายเงินสดแล้ว'))

    id = seedClaim({ status: 'pending' })
    await expectStale('approveClaim', id, { status: 'rejected', reject_reason: 'คนอื่นปฏิเสธก่อน' }, () => approveClaim(id))

    id = seedClaim({ status: 'pending' })
    await expectStale('approveAsPendingMonthEnd', id, { status: 'cancelled' }, () => approveAsPendingMonthEnd(id))

    id = seedClaim({ status: 'approved' })
    await expectStale('markAsPendingMonthEnd', id, { status: 'draft' }, () => markAsPendingMonthEnd(id))

    id = seedClaim({ status: 'approved' })
    await expectStale('markAsWaitingTaxInvoice', id, { status: 'paid' }, () => markAsWaitingTaxInvoice(id))

    // แนบใบกำกับพร้อมกันสองคน: ไฟล์ของคนหลังต้องถูกลบ
    id = seedClaim({ status: 'waiting_tax_invoice', tax_invoice_urls: [], tax_invoice_numbers: [] })
    const taxForm = new FormData()
    taxForm.append('tax_invoice_files', file('iv.jpg'))
    taxForm.append('tax_invoice_numbers', 'IV-001')
    await expectStale('uploadTaxInvoice', id, { status: 'approved', tax_invoice_urls: [fileUrl('other/iv.jpg')], tax_invoice_numbers: ['IV-999'] }, () => uploadTaxInvoice(id, taxForm))

    id = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'paid', refund_amount: 200, refund_slip_urls: [fileUrl('seed/slip.jpg')] })
    await expectStale('confirmRefundReceived', id, { status: 'refund_confirmed', refund_confirmed_by: ADMIN_B }, () => confirmRefundReceived(id))

    loginAs(STAFF)
    id = seedClaim({ status: 'draft', submitted_by: STAFF })
    await expectStale('cancelClaim', id, { status: 'pending', submitted_at: '2026-09-29T03:00:00.000Z' }, () => cancelClaim(id))

    id = seedClaim({ status: 'draft', submitted_by: STAFF })
    await expectStale('submitClaim', id, { status: 'cancelled', cancelled_by: STAFF }, () => submitClaim(id))
  }
  pass('P0-B5 สถานะถูกเปลี่ยนระหว่างอ่านกับเขียน → "ถูกเปลี่ยนสถานะไปแล้ว" ใบเบิกไม่ถูกเขียนทับ ไม่มี log / activity / แจ้งเตือน / รายการต้นทุน / ไฟล์ / revalidate: markAsPaid · rejectClaim · cancelClaim · submitClaim · adminOverrideStatus (+ approveClaim · approveAsPendingMonthEnd · markAsPendingMonthEnd · markAsWaitingTaxInvoice · uploadTaxInvoice · confirmRefundReceived)')

  // ══ P0-B7: รายการต้นทุนตามการข้ามขั้นของแอดมิน ═══════════════════════════════════════════
  {
    loginAs(ADMIN)
    const eventClaim = seedClaim({ status: 'draft', title: 'P0-B7 ผูกงาน' })
    const otherClaim = seedClaim({ status: 'draft', claim_type: 'other', job_event_id: null, title: 'P0-B7 ไม่ผูกงาน' })
    const steps: [string, number][] = [['approved', 1], ['draft', 0], ['paid', 1], ['rejected', 0], ['pending_month_end', 1], ['waiting_tax_invoice', 1], ['cancelled', 0]]
    for (const [to, expected] of steps) {
      for (const [id, want] of [[eventClaim, expected], [otherClaim, 0]] as const) {
        const res = await adminOverrideStatus(id, to, `ทดสอบ → ${to}`)
        assert.deepEqual(res, { success: true }, `${claimRow(id).title} → ${to}: ต้องสำเร็จ (ได้ ${JSON.stringify(res)})`)
        assert.equal(claimRow(id).status, to)
        assert.equal(costItemsOf(id).length, want, `${claimRow(id).title} → ${to}: รายการต้นทุน ${want} (ได้ ${costItemsOf(id).length})`)
      }
    }
    assert.equal(costItemsOf(otherClaim).length, 0)
  }
  pass('P0-B7 adminOverrideStatus ใบผูกงาน: draft→approved = 1 · approved→draft = 0 · draft→paid = 1 · paid→rejected = 0 (+ pending_month_end 1, waiting_tax_invoice 1, cancelled 0) · ใบไม่ผูกงานไม่มีรายการทุกขั้น')

  // ══ P0-B8: รายการซ้ำเหลือหนึ่ง · จับคู่ด้วย id ไม่ใช่เลขที่ ═══════════════════════════════════
  {
    loginAs(ADMIN)
    // ใบที่ถูกเปลี่ยนเลขจาก EXP-202604-012 เป็น EXP-202604-012-2 และมีรายการต้นทุนสองรายการ (เลขเดิม + เลขใหม่)
    const dup = seedClaim({ claim_number: 'EXP-202604-012-2', original_claim_number: 'EXP-202604-012', status: 'approved' })
    const oldest = seedCostItem(dup, `EXP-202604-012::${dup}`)
    seedCostItem(dup, `EXP-202604-012-2::${dup}`)
    // อีกใบที่ถือเลข EXP-202604-012 จริง + รายการของมัน — ต้องไม่ถูกแตะ
    const twin = seedClaim({ claim_number: 'EXP-202604-012', status: 'approved' })
    const twinItem = seedCostItem(twin, `EXP-202604-012::${twin}`)
    const manual = seedCostItem(twin, 'ค่ารถเพิ่ม อ้างอิง EXP-202604-012 (กรอกมือ)')
    assert.equal(costItemsOf(dup).length, 2)
    assert.deepEqual(await markAsPaid(dup), { success: true })
    assert.deepEqual(costItemsOf(dup).map(r => r.id), [oldest], 'เหลือรายการเก่าสุดรายการเดียว (notes มีเลขเดิมก็จับคู่ได้ด้วย id)')
    assert.deepEqual(costItemsOf(twin).map(r => r.id), [twinItem], 'รายการของใบที่ถือเลขเดียวกันไม่ถูกแตะ')
    assert.ok(db.job_cost_items.some(r => r.id === manual), 'รายการกรอกมือไม่ถูกแตะ')

    const dup2 = seedClaim({ status: 'approved' })
    const first2 = seedCostItem(dup2, `EXP-OLD-1::${dup2}`)
    seedCostItem(dup2, `EXP-OLD-2::${dup2}`)
    seedCostItem(dup2, `${claimRow(dup2).claim_number}::${dup2}`)
    assert.deepEqual(await adminOverrideStatus(dup2, 'pending_month_end', 'ทดสอบรายการซ้ำ'), { success: true })
    assert.deepEqual(costItemsOf(dup2).map(r => r.id), [first2], 'สามรายการ → เหลือรายการเก่าสุด')

    const dup3 = seedClaim({ status: 'approved' })
    seedCostItem(dup3, `EXP-X::${dup3}`)
    seedCostItem(dup3, `EXP-Y::${dup3}`)
    assert.deepEqual(await adminOverrideStatus(dup3, 'draft', 'ย้อนเป็นแบบร่าง'), { success: true })
    assert.equal(costItemsOf(dup3).length, 0, 'ย้อนไปสถานะที่ไม่ต้องมี → ลบทั้งหมด')
  }
  pass('P0-B8 ใบที่มีรายการต้นทุน 2–3 รายการ → เปลี่ยนสถานะ (markAsPaid / adminOverrideStatus) แล้วเหลือรายการเก่าสุด 1 · notes เลขเดิมจับคู่ด้วย id ได้ · ใบอื่นที่ถือเลขเดียวกันและรายการกรอกมือไม่ถูกแตะ')

  // ══ P0-B9: ลบใบเบิกที่จ่ายแล้ว → ไม่เหลือรายการต้นทุน · ลบไฟล์ครบสี่ช่อง ═══════════════════════
  {
    loginAs(ADMIN)
    const put = (path: string) => { storage.set(`receipts/${path}`, 3); return fileUrl(path) }
    const id = seedClaim({
      status: 'paid', title: 'P0-B9 ลบใบจ่ายแล้ว',
      receipt_urls: [put('claims/B9/r1.jpg'), put('claims/B9/r2.jpg')],
      actual_receipt_urls: [put('claims/B9-actual/a1.jpg')],
      tax_invoice_urls: [put('claims/B9-tax-invoice/t1.pdf'), ''],
      tax_invoice_numbers: ['IV-1', 'IV-2'],
      refund_slip_urls: [put('claims/B9-refund/s1.jpg')],
    })
    seedCostItem(id, `${claimRow(id).claim_number}::${id}`)
    const keep = put('claims/other/keep.jpg')
    const removesBefore = storageOps.filter(o => o.op === 'remove').length
    assert.deepEqual(await deleteClaim(id), { success: true })
    assert.ok(!db.expense_claims.some(r => r.id === id), 'ใบเบิกถูกลบ')
    assert.equal(costItemsOf(id).length, 0, 'ไม่เหลือรายการต้นทุน')
    const removed = storageOps.filter(o => o.op === 'remove').slice(removesBefore).flatMap(o => o.paths).sort()
    assert.deepEqual(removed, [
      'claims/B9-actual/a1.jpg', 'claims/B9-refund/s1.jpg', 'claims/B9-tax-invoice/t1.pdf', 'claims/B9/r1.jpg', 'claims/B9/r2.jpg',
    ], 'ขอลบใบเสร็จ · ใบเสร็จตอนเคลียร์ · ใบกำกับภาษี · สลิปคืนเงิน')
    assert.deepEqual(storageKeys(), [`receipts/${keep.split('/receipts/')[1]}`], 'ไฟล์ของใบอื่นยังอยู่')
    storage.clear()

    // สถานะอื่นก็ลบรายการ (เดิมลบเฉพาะ approved)
    for (const status of ['pending_month_end', 'waiting_tax_invoice', 'draft']) {
      const other = seedClaim({ status })
      seedCostItem(other, `${claimRow(other).claim_number}::${other}`)
      assert.deepEqual(await deleteClaim(other), { success: true })
      assert.equal(costItemsOf(other).length, 0, `ลบใบสถานะ ${status} → ไม่เหลือรายการต้นทุน`)
    }
  }
  pass('P0-B9 deleteClaim ใบผูกงานที่จ่ายแล้ว → ไม่เหลือรายการต้นทุน · ขอลบไฟล์ใบเสร็จ ใบเสร็จตอนเคลียร์ ใบกำกับภาษี และสลิปคืนเงิน · สถานะอื่นก็ลบรายการ')

  // ══ D4: อัปโหลดไม่ครบ = ไม่บันทึกอะไร (ทุกจุดที่อัปโหลด) ═══════════════════════════════════
  {
    // updateClaim + ไฟล์ใหม่
    loginAs(STAFF)
    const id = seedClaim({ status: 'draft', submitted_by: STAFF })
    let before = JSON.stringify(claimRow(id))
    const fd = new FormData()
    fd.append('receipt_files', file('e1.jpg'))
    fd.append('receipt_files', file('e2.jpg'))
    failNthUploadFromNow(1)
    let res = await quietly(() => updateClaim(id, { title: 'แก้ชื่อพร้อมไฟล์' }, fd))
    assert.match(String(res.error), /1 จาก 2 ไฟล์ \(e1\.jpg\)/)
    assert.equal(JSON.stringify(claimRow(id)), before, 'updateClaim: ไม่บันทึกการแก้ไข')
    assert.deepEqual(storageKeys(), [], 'updateClaim: ไม่เหลือไฟล์')

    // uploadTaxInvoice
    const tax = seedClaim({ status: 'waiting_tax_invoice', submitted_by: STAFF, tax_invoice_urls: [], tax_invoice_numbers: [] })
    before = JSON.stringify(claimRow(tax))
    const taxForm = new FormData()
    for (const n of ['1', '2']) { taxForm.append('tax_invoice_files', file(`iv${n}.pdf`)); taxForm.append('tax_invoice_numbers', `IV-${n}`) }
    failNthUploadFromNow(2)
    res = await quietly(() => uploadTaxInvoice(tax, taxForm))
    assert.match(String(res.error), /1 จาก 2 ไฟล์ \(iv2\.pdf\)/)
    assert.equal(JSON.stringify(claimRow(tax)), before, 'uploadTaxInvoice: สถานะและรายการใบกำกับไม่เปลี่ยน')
    assert.deepEqual(storageKeys(), [])

    // settleAdvanceClaim: ใบเสร็จ 2 ไฟล์ขึ้นแล้ว สลิปคืนเงินล้ม → ใบเสร็จ 2 ไฟล์ถูกลบด้วย
    const adv = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'paid', submitted_by: STAFF, amount: 1000, unit_price: 1000, quantity: 1 })
    before = JSON.stringify(claimRow(adv))
    const settle = new FormData()
    settle.set('actual_spent_amount', '800')
    settle.append('actual_receipt_files', file('act1.jpg'))
    settle.append('actual_receipt_files', file('act2.jpg'))
    settle.append('refund_slip_files', file('slip.jpg'))
    failNthUploadFromNow(3)
    res = await quietly(() => settleAdvanceClaim(adv, settle))
    assert.match(String(res.error), /1 จาก 1 ไฟล์ \(slip\.jpg\)/)
    assert.equal(JSON.stringify(claimRow(adv)), before, 'settleAdvanceClaim: ไม่บันทึก')
    assert.deepEqual(storageKeys(), [], 'settleAdvanceClaim: ใบเสร็จที่ขึ้นไปก่อนในคำขอเดียวกันถูกลบ')

    // addPettyCashExpense (ผู้ถือวงเงินที่ไม่ใช่แอดมิน)
    loginAs(CUSTODIAN)
    const claimsBefore = db.expense_claims.length
    const expense = new FormData()
    expense.set('title', 'ค่าแสตมป์')
    expense.set('amount', '120')
    expense.set('expense_date', '2026-09-12')
    expense.append('receipt_files', file('p1.jpg'))
    expense.append('receipt_files', file('p2.jpg'))
    failNthUploadFromNow(2)
    res = await quietly(() => addPettyCashExpense(FUND, expense))
    assert.match(String(res.error), /1 จาก 2 ไฟล์ \(p2\.jpg\)/)
    assert.equal(db.expense_claims.length, claimsBefore, 'addPettyCashExpense: ไม่มีรายการใหม่')
    assert.deepEqual(storageKeys(), [])
    const ok = await addPettyCashExpense(FUND, expense)
    assert.equal(ok.error, undefined, `addPettyCashExpense ไฟล์ครบ → สำเร็จ (ได้ ${ok.error})`)
    assert.equal((claimRow(String(ok.id)).receipt_urls as string[]).length, 2)

    // closePettyCashMonth: สลิปคืนเงินล้ม → ยังไม่ปิดเดือน (ต้องจ่ายเติมเงินที่ค้างก่อน — ใช้วงเงินใหม่ที่ไม่มีรายการค้าง)
    const fund2 = seedClaim({
      claim_type: 'petty_cash', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, amount: 2000, unit_price: 2000,
      quantity: 1, receipt_urls: [], pettycash_period_start: '2026-10-01', pettycash_period_end: '2026-10-31',
    })
    before = JSON.stringify(claimRow(fund2))
    const close = new FormData()
    close.append('refund_slip_files', file('ret1.jpg'))
    close.append('refund_slip_files', file('ret2.jpg'))
    failNthUploadFromNow(1)
    res = await quietly(() => closePettyCashMonth(fund2, close))
    assert.match(String(res.error), /1 จาก 2 ไฟล์ \(ret1\.jpg\).*ยังไม่ปิดเดือน/)
    assert.equal(JSON.stringify(claimRow(fund2)), before, 'closePettyCashMonth: ยังไม่ปิด')
    assert.deepEqual(storageKeys().filter(k => k.includes('-return')), [])
  }
  pass('D4 อัปโหลดไม่ครบ → { error } บอกจำนวน/ชื่อไฟล์ ไม่บันทึก และลบไฟล์ของคำขอนั้น: updateClaim · uploadTaxInvoice · settleAdvanceClaim (ข้ามสองชุดไฟล์) · addPettyCashExpense · closePettyCashMonth')

  // ══ v1.24.3: เคลียร์ใบทดลองจ่าย — กดซ้ำ / ชนกัน / สถานะเปลี่ยนระหว่างทาง ════════════════════════
  {
    const SETTLE_STALE = 'ใบเบิกนี้ถูกบันทึกหรือเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่'
    const advance = (over: Row = {}) => seedClaim({
      claim_type: 'advance', job_event_id: null, status: 'paid', submitted_by: STAFF, approved_by: ADMIN,
      amount: 1000, unit_price: 1000, quantity: 1, ...over,
    })
    const settleForm = (spent: number, files: { actual?: string[]; refund?: string[] } = {}) => {
      const fd = new FormData()
      fd.set('actual_spent_items', JSON.stringify([{ description: 'ค่ารถ', amount: spent }]))
      for (const n of files.actual ?? []) fd.append('actual_receipt_files', file(n))
      for (const n of files.refund ?? []) fd.append('refund_slip_files', file(n))
      return fd
    }
    const settleLogs = (id: string) => logsOf(id).filter(l => l.action === 'settle_advance').length
    loginAs(STAFF)

    // 1) คนเดียว ทีละครั้ง: เคลียร์แล้วแก้ยอดได้ตามเดิม ไฟล์ของทั้งสองครั้งอยู่ครบ
    const normal = advance()
    let res = await quietly(() => settleAdvanceClaim(normal, settleForm(800, { actual: ['n1.jpg'] })))
    assert.equal(res.error, undefined, `เคลียร์ครั้งแรกต้องสำเร็จ (ได้ ${JSON.stringify(res)})`)
    res = await quietly(() => settleAdvanceClaim(normal, settleForm(700, { actual: ['n2.jpg'] })))
    assert.equal(res.error, undefined, `แก้ยอดครั้งที่สองต้องสำเร็จ (ได้ ${JSON.stringify(res)})`)
    assert.equal(claimRow(normal).actual_spent_amount, 700)
    assert.equal(claimRow(normal).refund_amount, 300)
    assert.equal((claimRow(normal).actual_receipt_urls as string[]).length, 2, 'ไฟล์ของทั้งสองครั้งอยู่ครบ')
    assert.equal(settleLogs(normal), 2)

    // 2) อ่านแล้วยังไม่เขียน มีคนบันทึกการเคลียร์ไปก่อน (ยังไม่เคยเคลียร์ / เคยเคลียร์แล้ว) — ไฟล์ของคำขอนี้ต้องถูกลบ
    const first = advance()
    await expectStale('settleAdvanceClaim: คนอื่นเคลียร์ครั้งแรกไปก่อน', first,
      { advance_settled_at: '2026-09-30T01:00:00.000Z', advance_settled_by: ADMIN, actual_spent_amount: 500, refund_amount: 500 },
      () => settleAdvanceClaim(first, settleForm(900, { actual: ['r1.jpg'], refund: ['r2.jpg'] })), SETTLE_STALE)
    const again = advance({ advance_settled_at: '2026-09-29T01:00:00.000Z', advance_settled_by: STAFF, actual_spent_amount: 900, refund_amount: 100 })
    await expectStale('settleAdvanceClaim: เคยเคลียร์แล้ว มีคนแก้ยอดไปก่อน', again,
      { advance_settled_at: '2026-09-30T02:00:00.000Z', actual_spent_amount: 600, refund_amount: 400 },
      () => settleAdvanceClaim(again, settleForm(950, { actual: ['r3.jpg'] })), SETTLE_STALE)

    // 3) แอดมินยืนยันเงินคืน / ใบถูกยกเลิก ระหว่างทาง → ยอดเงินคืนที่ยืนยันแล้วต้องไม่ถูกเขียนทับ
    const confirmed = advance({ advance_settled_at: '2026-09-29T01:00:00.000Z', actual_spent_amount: 800, refund_amount: 200, refund_slip_urls: [fileUrl('seed/slip.jpg')] })
    await expectStale('settleAdvanceClaim: แอดมินยืนยันเงินคืนไปก่อน', confirmed,
      { status: 'refund_confirmed', refund_confirmed_by: ADMIN, refund_confirmed_at: '2026-09-30T03:00:00.000Z' },
      () => settleAdvanceClaim(confirmed, settleForm(100, { refund: ['late.jpg'] })), SETTLE_STALE)
    const cancelled = advance()
    await expectStale('settleAdvanceClaim: ใบถูกยกเลิกระหว่างทาง', cancelled,
      { status: 'cancelled', cancelled_by: ADMIN, cancelled_at: '2026-09-30T04:00:00.000Z' },
      () => settleAdvanceClaim(cancelled, settleForm(500)), SETTLE_STALE)

    // 4) กดบันทึกสองครั้งพร้อมกันจริง (สองแท็บ) → สำเร็จหนึ่ง ถูกปฏิเสธหนึ่ง ไฟล์ของคำขอที่แพ้ไม่ค้าง
    const twice = advance()
    const keys0 = storageKeys()
    const logs0 = settleLogs(twice), activity0 = activity.length, notifications0 = notifications.length
    const both = await quietly(() => Promise.all([
      settleAdvanceClaim(twice, settleForm(800, { actual: ['a.jpg'] })),
      settleAdvanceClaim(twice, settleForm(600, { refund: ['b.jpg'] })),
    ]))
    assert.equal(both.filter(r => !r.error).length, 1, `ต้องสำเร็จหนึ่งคำขอ (ได้ ${JSON.stringify(both)})`)
    assert.equal(both.filter(r => r.error === SETTLE_STALE).length, 1, `อีกคำขอต้องได้ "${SETTLE_STALE}"`)
    const row = claimRow(twice)
    const aWon = row.actual_spent_amount === 800
    assert.equal(((aWon ? row.actual_receipt_urls : row.refund_slip_urls) as string[]).length, 1, 'ไฟล์ของคำขอที่ชนะผูกกับใบ')
    assert.equal(aWon ? row.refund_slip_urls : row.actual_receipt_urls, null, 'ไฟล์ของคำขอที่แพ้ไม่ถูกผูกกับใบ')
    const added = storageKeys().filter(k => !keys0.includes(k))
    assert.equal(added.length, 1, `ไฟล์ของคำขอที่แพ้ถูกลบ เหลือไฟล์เดียว (ได้ ${JSON.stringify(added)})`)
    assert.ok(added[0].includes(aWon ? '-actual/' : '-refund/'), 'ไฟล์ที่เหลือเป็นของคำขอที่ชนะ')
    assert.equal(settleLogs(twice) - logs0, 1, 'ประวัติ 1 แถว')
    assert.equal(activity.length - activity0, 1, 'บันทึกกิจกรรม 1 ครั้ง')
    assert.equal(notifications.length - notifications0, 1, 'แจ้งเตือนแอดมิน 1 ครั้ง')

    // 5) ฐานข้อมูลที่ยังไม่มีช่อง actual_spent_items: ทางสำรองใช้เงื่อนไขเดียวกัน และยังบันทึกได้ตามปกติ
    const cols = COLUMNS.expense_claims
    const at = cols.indexOf('actual_spent_items')
    cols.splice(at, 1)
    try {
      const old = advance()
      await expectStale('settleAdvanceClaim (ทางสำรอง): คนอื่นเคลียร์ไปก่อน', old,
        { advance_settled_at: '2026-09-30T05:00:00.000Z', actual_spent_amount: 500, refund_amount: 500 },
        () => settleAdvanceClaim(old, settleForm(900, { actual: ['f1.jpg'] })), SETTLE_STALE)
      const plain = advance()
      res = await quietly(() => settleAdvanceClaim(plain, settleForm(900)))
      assert.equal(res.error, undefined, `ทางสำรองต้องบันทึกได้ (ได้ ${JSON.stringify(res)})`)
      assert.equal(claimRow(plain).actual_spent_amount, 900)
    } finally {
      cols.splice(at, 0, 'actual_spent_items')
    }
  }
  pass('v1.24.3 เคลียร์ใบทดลองจ่าย: ทีละครั้งแก้ยอดได้ · มีคนบันทึกไปก่อน / แอดมินยืนยันเงินคืน / ยกเลิก ระหว่างทาง → "ถูกบันทึกหรือเปลี่ยนสถานะไปแล้ว" ไม่เขียนทับ ไม่มีผลข้างเคียง ไฟล์ถูกลบ · กดพร้อมกันสองครั้ง → สำเร็จหนึ่ง ไฟล์ของอีกคำขอไม่ค้าง · ทางสำรองมีเงื่อนไขเดียวกัน')

  // ══ v1.25.0 ขั้น 1: ยื่นทันที · แจ้งเตือนยื่น/จ่าย · เปิดใบที่ถูกปฏิเสธ · เหตุผลเฉพาะที่จำเป็น ═══════════════
  {
    rpcMode = 'installed'
    // กติกา v1.43.0: มีใบค้างเคลียร์ → สร้าง/ยื่นใบใหม่ไม่ได้ — ชุดนี้ทดสอบเรื่องอื่น จึงซ่อนใบค้างของพนักงานจากส่วนก่อนหน้าไว้ชั่วคราว แล้วคืนตอนจบชุด
    const owedBefore = db.expense_claims.filter(r => r.submitted_by === STAFF && !r.deleted_at && outstandingKind(r as unknown as Parameters<typeof outstandingKind>[0]))
    for (const r of owedBefore) r.deleted_at = '2026-09-30T00:00:00.000Z'
    const lastNote = () => notifications.at(-1) as Row
    const actionsOf = (claimId: string) => activity.filter(a => (a.details as Row).claimId === claimId).map(a => a.action)

    // (a) สร้างแล้วยื่นทันที: รออนุมัติ + submitted_at + ประวัติ submit + activity สร้าง/ยื่น + แจ้งแอดมินทุกคน
    loginAs(STAFF)
    let notes0 = notifications.length
    const submitted = await createClaim(claimForm({ intent: 'submit', title: 'ยื่นทันที' }, [file('r.jpg')]))
    assert.equal(submitted.error, undefined, `ยื่นทันทีต้องสำเร็จ (ได้ ${submitted.error})`)
    const submittedId = String(submitted.id)
    const submittedRow = claimRow(submittedId)
    assert.equal(submitted.status, 'pending')
    assert.equal(submitted.claimNumber, submittedRow.claim_number)
    assert.equal(submittedRow.status, 'pending')
    assert.ok(submittedRow.submitted_at, 'submitted_at ต้องมีค่า')
    assert.equal((submittedRow.receipt_urls as string[]).length, 1)
    assert.deepEqual(logsOf(submittedId).map(l => l.action), ['submit'], 'ประวัติ submit หนึ่งแถว')
    assert.deepEqual(actionsOf(submittedId), ['CREATE_EXPENSE_CLAIM', 'SUBMIT_EXPENSE_CLAIM'])
    assert.equal(notifications.length - notes0, 1, 'แจ้งเตือนหนึ่งครั้ง')
    assert.equal(lastNote().type, 'expense_submitted')
    assert.ok((lastNote().userIds as string[]).includes(ADMIN) && (lastNote().userIds as string[]).includes(ADMIN_B), 'แจ้งแอดมินทุกคน')
    assert.deepEqual(
      { actorId: lastNote().actorId, referenceType: lastNote().referenceType, referenceId: lastNote().referenceId, title: lastNote().title },
      { actorId: STAFF, referenceType: 'expense_claim', referenceId: submittedId, title: `ใบเบิก ${submittedRow.claim_number} ยื่นขออนุมัติ — ฿300` },
    )

    // (b) ยื่นทันทีโดยไม่แนบใบเสร็จ (ค่าอื่นๆ / งานอีเวนต์ที่ต้องนำเข้า) → error ก่อนเขียนอะไร: ไม่ขอเลข ไม่นำเข้างาน ไม่อัปโหลด ไม่แจ้ง
    const noReceiptForms: Record<string, string>[] = [
      { intent: 'submit', title: 'ไม่มีใบเสร็จ' },
      { intent: 'submit', title: 'งานไม่มีใบเสร็จ', claim_type: 'event', job_event_id: 'stock:00000000-0000-4000-8000-000000000777' },
    ]
    for (const over of noReceiptForms) {
      const claimsBefore = db.expense_claims.length
      const storageBefore = JSON.stringify(storageKeys())
      const uploads = uploadCalls
      notes0 = notifications.length
      mark = ops.length
      const res = await createClaim(claimForm(over))
      assert.match(String(res.error), /อย่างน้อย 1 ไฟล์/, `${over.title}: ต้องได้ error เรื่องใบเสร็จ`)
      assert.equal(writesSince(mark).length, 0, `${over.title}: ต้องไม่เขียนอะไร — ได้ ${JSON.stringify(writesSince(mark))}`)
      assert.equal(ops.slice(mark).filter(o => o.action === 'rpc').length, 0, `${over.title}: ไม่ขอเลขที่`)
      assert.equal(db.expense_claims.length, claimsBefore)
      assert.equal(JSON.stringify(storageKeys()), storageBefore)
      assert.equal(uploadCalls, uploads)
      assert.equal(notifications.length, notes0)
    }

    // (c) ทดลองจ่ายยื่นทันทีโดยไม่แนบ → รออนุมัติ
    notes0 = notifications.length
    const advance = await createClaim(claimForm({ claim_type: 'advance', intent: 'submit', title: 'ทดลองจ่ายยื่นทันที' }))
    assert.equal(advance.error, undefined, `ทดลองจ่ายยื่นทันทีต้องสำเร็จ (ได้ ${advance.error})`)
    assert.equal(advance.status, 'pending')
    assert.equal(claimRow(String(advance.id)).status, 'pending')
    assert.equal(notifications.length - notes0, 1)

    // (d) ไม่ส่ง intent / intent อื่น → แบบร่าง ไม่แจ้งใคร ไม่มีประวัติยื่น
    for (const intent of [null, 'yes']) {
      notes0 = notifications.length
      const draft = await createClaim(claimForm({ intent, title: `แบบร่าง ${intent}` }))
      assert.equal(draft.error, undefined)
      assert.equal(draft.status, 'draft')
      const row = claimRow(String(draft.id))
      assert.equal(row.status, 'draft')
      assert.equal(row.submitted_at, null)
      assert.equal(draft.claimNumber, row.claim_number)
      assert.equal(notifications.length, notes0, 'แบบร่างไม่แจ้งใคร')
      assert.equal(logsOf(String(draft.id)).length, 0)
      assert.deepEqual(actionsOf(String(draft.id)), ['CREATE_EXPENSE_CLAIM'])
    }

    // (e) กดยื่นแบบร่างของตัวเองทีหลัง → แจ้งแอดมินหนึ่งครั้ง · กติกาใบเสร็จเดียวกับยื่นทันที
    const ownDraft = seedClaim({ status: 'draft', submitted_by: STAFF, title: 'ยื่นทีหลัง' })
    notes0 = notifications.length
    assert.deepEqual(await submitClaim(ownDraft), { success: true })
    assert.equal(notifications.length - notes0, 1, 'แจ้งเตือนหนึ่งครั้ง')
    assert.deepEqual(
      { type: lastNote().type, referenceType: lastNote().referenceType, referenceId: lastNote().referenceId, actorId: lastNote().actorId },
      { type: 'expense_submitted', referenceType: 'expense_claim', referenceId: ownDraft, actorId: STAFF },
    )
    assert.ok((lastNote().userIds as string[]).includes(ADMIN) && (lastNote().userIds as string[]).includes(ADMIN_B))
    const bareEvent = seedClaim({ status: 'draft', submitted_by: STAFF, receipt_urls: [] })
    notes0 = notifications.length
    mark = ops.length
    assert.equal((await submitClaim(bareEvent)).error, 'กรุณาแนบเอกสารอย่างน้อย 1 ไฟล์ก่อนยื่นใบเบิก')
    assert.equal(writesSince(mark).length, 0)
    assert.equal(notifications.length, notes0)
    const bareAdvance = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'draft', submitted_by: STAFF, receipt_urls: [] })
    assert.deepEqual(await submitClaim(bareAdvance), { success: true }, 'ทดลองจ่ายยื่นได้โดยไม่แนบ')

    // (f) จ่ายเงินแล้ว → แจ้งผู้เบิกหนึ่งครั้ง
    loginAs(ADMIN)
    const toPay = seedClaim({ status: 'approved', submitted_by: STAFF, title: 'รอจ่าย' })
    notes0 = notifications.length
    assert.deepEqual(await markAsPaid(toPay), { success: true })
    assert.equal(notifications.length - notes0, 1, 'แจ้งเตือนหนึ่งครั้ง')
    assert.deepEqual(
      { type: lastNote().type, userIds: lastNote().userIds, referenceType: lastNote().referenceType, referenceId: lastNote().referenceId, actorId: lastNote().actorId, title: lastNote().title },
      { type: 'expense_paid', userIds: [STAFF], referenceType: 'expense_claim', referenceId: toPay, actorId: ADMIN, title: `ใบเบิก ${claimRow(toPay).claim_number} จ่ายเงินแล้ว ฿300` },
    )

    // (g) เจ้าของเปิดใบที่ถูกปฏิเสธกลับเป็นแบบร่าง
    const rejected = seedClaim({
      status: 'rejected', submitted_by: STAFF, title: 'ถูกปฏิเสธ', reject_reason: 'เอกสารไม่ครบ', approved_by: ADMIN,
      approved_at: '2026-09-28T03:00:00.000Z', submitted_at: '2026-09-27T03:00:00.000Z',
    })
    // แอดมินที่ไม่ใช่เจ้าของ → error ไม่เขียน
    let before = JSON.stringify(claimRow(rejected))
    mark = ops.length
    let res = await reopenRejectedClaim(rejected)
    assert.match(String(res.error), /เฉพาะเจ้าของใบเบิก/)
    assert.equal(writesSince(mark).length, 0)
    assert.equal(JSON.stringify(claimRow(rejected)), before)
    // เจ้าของ แต่ใบยังรออนุมัติ → error ไม่เขียน
    loginAs(STAFF)
    const stillPending = seedClaim({ status: 'pending', submitted_by: STAFF })
    before = JSON.stringify(claimRow(stillPending))
    mark = ops.length
    res = await reopenRejectedClaim(stillPending)
    assert.match(String(res.error), /เฉพาะใบเบิกที่ถูกปฏิเสธ/)
    assert.equal(writesSince(mark).length, 0)
    assert.equal(JSON.stringify(claimRow(stillPending)), before)
    // รายการในวงเงินสดย่อยที่ปิดเดือนแล้ว → error ไม่เขียน
    const closedFund = seedClaim({
      claim_type: 'petty_cash', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, receipt_urls: [],
      pettycash_closed_at: '2026-09-30T09:00:00.000Z',
    })
    const frozen = seedClaim({ claim_type: 'petty_cash', job_event_id: null, status: 'rejected', submitted_by: STAFF, pettycash_fund_id: closedFund })
    mark = ops.length
    res = await reopenRejectedClaim(frozen)
    assert.match(String(res.error), /ปิดแล้ว/)
    assert.equal(writesSince(mark).length, 0)
    assert.equal(claimRow(frozen).status, 'rejected')
    // เจ้าของ + ถูกปฏิเสธ → แบบร่าง ล้างเหตุผล/ผู้อนุมัติ/เวลาอนุมัติ/เวลายื่น
    res = await reopenRejectedClaim(rejected)
    assert.deepEqual(res, { success: true })
    const reopened = claimRow(rejected)
    assert.deepEqual(
      { status: reopened.status, reject_reason: reopened.reject_reason, approved_by: reopened.approved_by, approved_at: reopened.approved_at, submitted_at: reopened.submitted_at },
      { status: 'draft', reject_reason: null, approved_by: null, approved_at: null, submitted_at: null },
    )
    assert.deepEqual(logsOf(rejected).map(l => l.action), ['reopen'])
    assert.match(String(logsOf(rejected)[0].note), /เอกสารไม่ครบ/)
    assert.deepEqual(activity.at(-1), { action: 'REOPEN_REJECTED_CLAIM', details: { claimId: rejected, claimNumber: reopened.claim_number, rejectReason: 'เอกสารไม่ครบ' } })
    assert.equal(costItemsOf(rejected).length, 0)
    // เปิดแล้วยื่นใหม่ได้ตามปกติ
    assert.deepEqual(await submitClaim(rejected), { success: true })
    assert.equal(claimRow(rejected).status, 'pending')
    // สถานะถูกเปลี่ยนระหว่างอ่านกับเขียน → STALE ไม่มีผลข้างเคียง
    const rejected2 = seedClaim({ status: 'rejected', submitted_by: STAFF, reject_reason: 'ยอดผิด' })
    await expectStale('reopenRejectedClaim', rejected2, { status: 'cancelled', cancelled_by: STAFF }, () => reopenRejectedClaim(rejected2))

    // (h) เหตุผล: เดินหน้า/ปิดใบที่ยังไม่จ่าย เว้นว่างได้ · ถอย/เปิดใบที่ปิด/ปิดใบที่จ่ายแล้ว/แก้ใบที่จ่ายแล้ว ต้องมี
    loginAs(ADMIN)
    const overrideNote = (id: string) => String(logsOf(id).filter(l => l.action === 'admin_override').at(-1)?.note)
    const forward = seedClaim({ status: 'pending', submitted_by: STAFF })
    assert.deepEqual(await adminOverrideStatus(forward, 'approved', ''), { success: true })
    assert.equal(claimRow(forward).status, 'approved')
    assert.equal(overrideNote(forward), '[Admin Override] ไม่ระบุเหตุผล')
    assert.equal((activity.at(-1)?.details as Row).reason, 'ไม่ระบุเหตุผล')
    assert.equal(lastNote().body, 'ไม่ระบุเหตุผล', 'แจ้งเจ้าของใบด้วยข้อความเดียวกัน')
    for (const [from, to, reason] of [
      ['approved', 'pending', ''], ['paid', 'approved', ''], ['rejected', 'draft', ''], ['paid', 'cancelled', '   '],
      ['waiting_tax_invoice', 'draft', ''], ['refund_confirmed', 'paid', ''],
    ]) {
      const id = seedClaim({ status: from })
      before = JSON.stringify(claimRow(id))
      mark = ops.length
      res = await adminOverrideStatus(id, to, reason)
      assert.match(String(res.error), /เหตุผล/, `${from} → ${to} ไม่มีเหตุผล: ต้องได้ error (ได้ ${JSON.stringify(res)})`)
      assert.equal(writesSince(mark).length, 0, `${from} → ${to}: ต้องไม่เขียน`)
      assert.equal(JSON.stringify(claimRow(id)), before)
    }
    const rejectNoReason = seedClaim({ status: 'pending' })
    assert.deepEqual(await adminOverrideStatus(rejectNoReason, 'rejected', ''), { success: true })
    assert.equal(claimRow(rejectNoReason).reject_reason, 'ไม่ระบุเหตุผล')
    const backward = seedClaim({ status: 'waiting_tax_invoice' })
    assert.deepEqual(await adminOverrideStatus(backward, 'draft', 'ลูกค้าขอแก้'), { success: true })
    assert.equal(claimRow(backward).status, 'draft')
    assert.equal(overrideNote(backward), '[Admin Override] ลูกค้าขอแก้')

    // แก้ใบที่จ่ายแล้ว / ยืนยันเงินคืนแล้ว: ไม่มีเหตุผล (หรือช่องว่างล้วน) → error ไม่เขียน
    const paid = seedClaim({ status: 'paid', title: 'จ่ายแล้ว' })
    const refunded = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'refund_confirmed', title: 'คืนเงินแล้ว' })
    for (const [id, reason] of [[paid, undefined], [paid, '  '], [refunded, undefined]] as const) {
      before = JSON.stringify(claimRow(id))
      mark = ops.length
      res = await updateClaim(id, { title: 'แก้ชื่อ', ...(reason === undefined ? {} : { reason }) })
      assert.match(String(res.error), /เหตุผล/, `แก้ใบ ${claimRow(id).status} ไม่มีเหตุผล: ต้องได้ error`)
      assert.equal(writesSince(mark).length, 0)
      assert.equal(JSON.stringify(claimRow(id)), before)
    }
    // มีเหตุผล → สำเร็จ · เหตุผลอยู่ในประวัติ ไม่ใช่ช่องที่ถูกแก้
    assert.deepEqual(await updateClaim(paid, { title: 'จ่ายแล้ว (แก้ชื่อ)', reason: 'พิมพ์ผิด' }), { success: true })
    assert.equal(claimRow(paid).title, 'จ่ายแล้ว (แก้ชื่อ)')
    const updates = logsOf(paid).filter(l => l.action === 'update')
    assert.equal(updates.length, 1)
    assert.match(String(updates[0].note), /พิมพ์ผิด/)
    assert.deepEqual(Object.keys(updates[0].changes as Row), ['title'])
    // ใบที่ยังไม่จ่าย ไม่ต้องมีเหตุผล
    const draftEdit = seedClaim({ status: 'draft', submitted_by: STAFF })
    assert.deepEqual(await updateClaim(draftEdit, { title: 'แก้แบบร่าง' }), { success: true })
    assert.equal(claimRow(draftEdit).title, 'แก้แบบร่าง')
    for (const r of owedBefore) r.deleted_at = null
  }
  pass('v1.25.0 ขั้น 1 createClaim intent=submit → รออนุมัติ + submitted_at + ประวัติ submit + activity สร้าง/ยื่น + แจ้งแอดมินทุกคน · ไม่แนบ (ค่าอื่นๆ/งาน) → error ไม่เขียน ไม่ขอเลข · ทดลองจ่ายไม่แนบยื่นได้ · ไม่ส่ง intent = แบบร่าง ไม่แจ้ง · submitClaim แจ้งแอดมิน · markAsPaid แจ้งผู้เบิก · reopenRejectedClaim เฉพาะเจ้าของ + ใบที่ถูกปฏิเสธ (ล้างช่องอนุมัติ, STALE ไม่มีผลข้างเคียง) · เหตุผลบังคับเฉพาะถอย/เปิดใบที่ปิด/ปิดใบที่จ่ายแล้ว/แก้ใบที่จ่ายแล้ว')

  console.log('\nfinance-integrity: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
