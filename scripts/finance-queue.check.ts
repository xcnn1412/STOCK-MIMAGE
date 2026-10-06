// คิวใบเบิก (ขั้น 4 · v1.26.0) — ส่งกลับให้แก้ · ซ่อน/กู้คืน · ทำทีละหลายใบ · ล็อกการจ่าย · ข้อมูลของคิว · ใบที่ซ่อนในรายการ
// รัน server action / ฟังก์ชันอ่านตัวจริง (lifecycle-actions.ts, queue-data.ts, actions.ts) กับฐานข้อมูลจำลองในหน่วยความจำ
// Run:  npx tsx scripts/finance-queue.check.ts
//
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง ไม่ต้องมี env: แทน next/headers, next/cache, @/lib/supabase-server,
// @/lib/logger และ @/lib/notifications ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/finance-integrity.check.ts)
// ตัวจำลองตัดผลที่ 1,000 แถวต่อคำขอเหมือน PostgREST · รองรับ is / not is / not in / gt / count+head / range
// "ยังไม่รัน SQL": ปิดคอลัมน์ deleted_at, deleted_by, status_changed_at → อ้างถึงได้ 42703 (update ที่มีคอลัมน์นั้นได้ PGRST204)
// คนและใบเบิกสังเคราะห์ทั้งหมด · บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-queue: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { outstandingKind, paymentLock } from '../app/(authenticated)/finance/claim-rules'
import { CLAIM_TRANSITIONS } from '../app/(authenticated)/finance/claim-transitions'

process.env.SESSION_SECRET = 'finance-queue-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null; count?: number }

// ── คน งาน (สังเคราะห์) ───────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), ADMIN_B = uid(2), STAFF = uid(3), STAFF_B = uid(4), CUSTODIAN = uid(5)
const EVENT = uid(901), EVENT_B = uid(902)
const STORAGE_BASE = 'https://fake.supabase.test/storage/v1/object/public'
const fileUrl = (path: string) => `${STORAGE_BASE}/receipts/${path}`
const STALE = 'ใบเบิกนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดหน้าใหม่'
const SQL_FILE = '20260930_claim_hide_status_time.sql'
const PETTY_HIDE = 'รายการเงินสดย่อยซ่อนไม่ได้ — ยกเลิกรายการแทน'

const person = (id: string, full_name: string, role: string): Row =>
  ({ id, full_name, nickname: null, role, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

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
  job_cost_events: ['id', 'event_name', 'event_date', 'event_location', 'status', 'source_event_id', 'linked_lead_id', 'created_at'],
}
/** คอลัมน์ของ 20260930_claim_hide_status_time.sql — ปิดได้เพื่อจำลองฐานข้อมูลที่ยังไม่รัน SQL */
const HIDE_COLUMNS = ['deleted_at', 'deleted_by', 'status_changed_at']
const dropped = new Set<string>()
/** PostgREST ส่งไม่เกินนี้ต่อคำขอ */
const MAX_ROWS = 1000

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
    status: 'pending', submitted_by: STAFF, expense_date: '2026-09-10', notes: 'หมายเหตุภายใน',
    ...over,
  })
  db.expense_claims.push(row)
  return String(row.id)
}
function seedCostItem(claimId: string) {
  const claim = db.expense_claims.find(r => r.id === claimId) as Row
  db.job_cost_items.push(fullRow('job_cost_items', {
    job_event_id: claim.job_event_id, category: 'travel', description: `[เบิกเงิน] ${String(claim.title)}`, amount: 300,
    unit_price: 100, quantity: 3, unit: 'รายการ', recorded_by: ADMIN, notes: `${String(claim.claim_number)}::${claimId}`,
  }))
}

// ── บันทึกทุกคำสั่ง + ผลข้างเคียง ─────────────────────────────────────────────
const ops: { table: string; action: string; cols?: string }[] = []
const activity: { action: string; details: Row }[] = []
const notifications: Row[] = []
const revalidated: string[] = []
const storageOps: { op: string; paths: string[] }[] = []
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
const EMBED = /^(\w+):(\w+)!(\w+)\(([\s\S]*)\)$/
const isDropped = (table: string, col: string) => table === 'expense_claims' && dropped.has(col)
/** คอลัมน์ชั้นนอกที่ select อ้างถึง (ไม่รวม '*' และ embed) */
const selectRefs = (cols: string) => splitTop(cols).filter(p => p !== '*' && !EMBED.test(p))
function project(table: string, row: Row, cols: string): Row {
  const out: Row = {}
  for (const part of splitTop(cols)) {
    if (part === '*') {
      for (const [k, v] of Object.entries(row)) if (!isDropped(table, k)) out[k] = clone(v)
      continue
    }
    const embed = EMBED.exec(part)
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
  private refs: string[] = []
  private sorts: { col: string; asc: boolean }[] = []
  private start = 0
  private end = Number.POSITIVE_INFINITY
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
  gt(c: string, v: number) { return this.where(c, r => r[c] != null && Number(r[c]) > v) }
  like(c: string, pattern: string) {
    const re = likeToRegex(pattern)
    return this.where(c, r => typeof r[c] === 'string' && re.test(r[c] as string))
  }
  order(col: string, opts: { ascending?: boolean } = {}) {
    assert.ok(COLUMNS[this.table].includes(col), `order คอลัมน์ที่ไม่มี: ${this.table}.${col}`)
    this.refs.push(col)
    this.sorts.push({ col, asc: opts.ascending !== false })
    return this
  }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  limit(n: number) { this.max = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private where(col: string, f: (r: Row) => boolean) {
    assert.ok(COLUMNS[this.table].includes(col), `กรองคอลัมน์ที่ไม่มี: ${this.table}.${col}`)
    this.refs.push(col)
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
    ops.push({ table: this.table, action: this.action, ...(this.cols !== null ? { cols: this.cols } : {}) })
    const rows = db[this.table]
    // ฐานข้อมูลที่ยังไม่มีคอลัมน์: payload ที่อ้างถึง = PGRST204 · select / กรอง / เรียง ที่อ้างถึง = 42703 (ไม่มีอะไรถูกเขียน)
    const written = this.action === 'insert' ? this.payload.flatMap(p => Object.keys(p)) : this.action === 'update' ? Object.keys(this.values) : []
    for (const c of written) {
      assert.ok(COLUMNS[this.table].includes(c), `เขียนคอลัมน์ที่ไม่มี: ${this.table}.${c}`)
      if (isDropped(this.table, c)) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${c}' column of '${this.table}' in the schema cache` } }
    }
    const missing = [...(this.cols ? selectRefs(this.cols) : []), ...this.refs].find(c => isDropped(this.table, c))
    if (missing) return { data: null, error: { code: '42703', message: `column ${this.table}.${missing} does not exist` } }

    if (this.action === 'insert') {
      const inserted = this.payload.map(p => fullRow(this.table, p))
      rows.push(...inserted)
      return this.shape(inserted)
    }
    const hits = rows.filter(r => this.filters.every(f => f(r)))
    if (this.action === 'update') {
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
      const stop = Math.min(this.end + 1, this.start + Math.min(this.max, MAX_ROWS))
      result = this.shape(sorted.slice(this.start, stop))
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

const fakeClient = strict({
  from: (table: string) => strict(new Query(table)),
  storage: strict({
    from: (bucket: string) => strict({
      remove: async (paths: string[]) => { storageOps.push({ op: `remove:${bucket}`, paths: [...paths] }); return { data: [], error: null } },
    }),
  }),
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
  [/(^|\/)lib\/logger$/, { logActivity: async (action: string, details: Row) => { activity.push({ action, details: clone(details) }) } }],
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
const {
  submitClaim, approveClaim, reopenRejectedClaim, markAsPaid, deleteClaim, adminOverrideStatus, sendBackClaim, hideClaim,
  restoreClaim, bulkClaimAction, listHiddenClaims,
} = require('../app/(authenticated)/finance/lifecycle-actions') as typeof import('../app/(authenticated)/finance/lifecycle-actions')
const { getClaims, getClaim, getPaidMonths, recreateCostItemFromClaim } =
  require('../app/(authenticated)/finance/actions') as typeof import('../app/(authenticated)/finance/actions')
const { getQueueClaims, QUEUE_SELECT } =
  require('../app/(authenticated)/finance/queue-data') as typeof import('../app/(authenticated)/finance/queue-data')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ──────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
const claimRow = (id: string) => {
  const found = db.expense_claims.find(r => r.id === id)
  assert.ok(found, `ไม่พบใบเบิก ${id}`)
  return found
}
const costItemsOf = (claimId: string) => db.job_cost_items.filter(r => String(r.notes ?? '').endsWith(`::${claimId}`))
const logsOf = (claimId: string) => db.expense_claim_logs.filter(r => r.claim_id === claimId)
const activityOf = (claimId: string, action?: string) => activity.filter(a => a.details.claimId === claimId && (!action || a.action === action))
const writesSince = (mark: number) => ops.slice(mark).filter(o => o.action !== 'select')
const claimOpsSince = (mark: number) => ops.slice(mark).filter(o => o.table === 'expense_claims')
const idsOf = (rows: { id?: unknown }[]) => rows.map(r => String(r.id))

/** ผลข้างเคียงทั้งหมดที่ต้องไม่เกิดเมื่อ action ปฏิเสธ */
const sideEffects = () => ({
  logs: db.expense_claim_logs.length, activity: activity.length, notifications: notifications.length,
  costItems: JSON.stringify(db.job_cost_items), revalidated: revalidated.length, storage: storageOps.length,
})
/** action ต้องคืน error นี้ ไม่เขียนอะไร ไม่มีผลข้างเคียง ใบเบิกไม่เปลี่ยน */
async function expectRefused(label: string, run: () => Promise<{ error?: string }>, expected: string | RegExp, claimId?: string) {
  const before = sideEffects()
  const row = claimId ? JSON.stringify(claimRow(claimId)) : ''
  const mark = ops.length
  const res = await run()
  if (typeof expected === 'string') assert.equal(res.error, expected, `${label}: ได้ ${JSON.stringify(res)}`)
  else assert.match(String(res.error), expected, `${label}: ได้ ${JSON.stringify(res)}`)
  assert.deepEqual(writesSince(mark), [], `${label}: ต้องไม่เขียนอะไร`)
  assert.deepEqual(sideEffects(), before, `${label}: ต้องไม่มีผลข้างเคียง`)
  if (claimId) assert.equal(JSON.stringify(claimRow(claimId)), row, `${label}: ใบเบิกต้องไม่เปลี่ยน`)
  return mark
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

function resetDb() {
  for (const t of Object.keys(db)) db[t] = []
  db.profiles.push(
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin'), person(ADMIN_B, 'แอดมิน ทดสอบสอง', 'admin'),
    person(STAFF, 'พนักงาน ทดสอบ', 'staff'), person(STAFF_B, 'พนักงาน ทดสอบสอง', 'staff'),
    person(CUSTODIAN, 'ผู้ถือเงินสดย่อย ทดสอบ', 'staff'),
  )
  db.job_cost_events.push(
    fullRow('job_cost_events', { id: EVENT, event_name: 'งานทดสอบ', event_date: '2026-09-20', status: 'draft' }),
    fullRow('job_cost_events', { id: EVENT_B, event_name: 'งานอื่น ทดสอบ', event_date: '2026-09-21', status: 'draft' }),
  )
}

const pass = (label: string) => console.log(`PASS  ${label}`)

async function main() {
  resetDb()

  // ══ ตัวจำลองทำงานเหมือน PostgREST ในเรื่องที่ตรวจ ═══════════════════════════════════
  {
    const a = seedClaim({ status: 'pending' })
    seedClaim({ status: 'pending', deleted_at: '2026-09-20T00:00:00.000Z' })
    const head = await fakeClient.from('expense_claims').select('id', { count: 'exact', head: true }).not('deleted_at', 'is', null)
    assert.deepEqual(head, { data: null, error: null, count: 1 }, 'count + head + not is null')
    const vis = await fakeClient.from('expense_claims').select('id').is('deleted_at', null)
    assert.deepEqual(vis.data, [{ id: a }])
    for (let i = 0; i < 1100; i++) db.expense_claims.push(fullRow('expense_claims', { claim_number: `EXP-FAKE-${i}`, status: 'draft' }))
    assert.equal(((await fakeClient.from('expense_claims').select('id')).data as Row[]).length, MAX_ROWS, 'ไม่มี range = 1,000 แถว')
    assert.equal(((await fakeClient.from('expense_claims').select('id').range(0, 4999)).data as Row[]).length, MAX_ROWS, 'range กว้างก็ได้ 1,000 แถว')
    dropped.add('deleted_at')
    const miss = await fakeClient.from('expense_claims').select('id').is('deleted_at', null)
    assert.equal(miss.error?.code, '42703')
    const upd = await fakeClient.from('expense_claims').update({ deleted_at: 'x' }).eq('id', a)
    assert.equal(upd.error?.code, 'PGRST204')
    assert.equal(claimRow(a).deleted_at, null, 'คอลัมน์ที่ไม่มี → ไม่มีอะไรถูกเขียน')
    assert.ok(!('deleted_at' in ((await fakeClient.from('expense_claims').select('*').eq('id', a).single()).data as Row)), "select * ไม่มีคอลัมน์ที่ปิด")
    dropped.clear()
    assert.throws(() => (fakeClient.from('expense_claims') as unknown as { or: (s: string) => unknown }).or('status.eq.paid'), /ไม่รองรับ \.or\(\)/)
    resetDb()
    pass('ตัวจำลอง: count+head · is / not is · ตัดผลที่ 1,000 แถว · คอลัมน์ที่ปิด → 42703 (อ่าน) / PGRST204 (เขียน) ไม่เขียนอะไร · เมธอดที่ไม่มี throw')
  }

  // ══ AC6: ล็อกการจ่าย ═════════════════════════════════════════════════════════
  {
    loginAs(ADMIN)
    const locked = seedClaim({ status: 'approved', receipt_urls: [], approved_by: ADMIN })
    seedCostItem(locked)
    const lockMessage = paymentLock(claimRow(locked) as unknown as Parameters<typeof paymentLock>[0]).message
    assert.ok(lockMessage.includes('เอกสารไม่ครบ'))
    await expectRefused('markAsPaid ใบงานอีเวนต์ไม่มีใบเสร็จ', () => markAsPaid(locked), lockMessage, locked)
    const taxLocked = seedClaim({ status: 'waiting_tax_invoice', approved_by: ADMIN })
    await expectRefused('markAsPaid รอใบกำกับแต่ยังไม่มี', () => markAsPaid(taxLocked), /\(ขาด: ใบกำกับภาษี\)$/, taxLocked)

    const advance = seedClaim({ claim_type: 'advance', job_event_id: null, status: 'approved', receipt_urls: [], amount: 2000, total_amount: 2000 })
    assert.deepEqual(await markAsPaid(advance), { success: true }, 'ทดลองจ่ายไม่มีใบเสร็จ → จ่ายได้')
    assert.equal(claimRow(advance).status, 'paid')

    let mark = ops.length
    const before = sideEffects()
    const bulk = await bulkClaimAction('pay', [locked])
    assert.equal(bulk.done, 0)
    assert.equal(bulk.failed, 1)
    assert.deepEqual(bulk.results, [{ id: locked, claimNumber: claimRow(locked).claim_number, ok: false, error: lockMessage }])
    assert.deepEqual(writesSince(mark), [], 'จ่ายหลายใบ: ใบที่ล็อกไม่ถูกเขียน')
    assert.deepEqual(sideEffects(), before)

    await expectRefused('adminOverrideStatus → paid ไม่มีเหตุผล', () => adminOverrideStatus(locked, 'paid', ''), /เหตุผล/, locked)
    await expectRefused('adminOverrideStatus → paid ช่องว่างล้วน', () => adminOverrideStatus(locked, 'paid', '   '), /เหตุผล.*เอกสารไม่ครบ/, locked)
    mark = ops.length
    assert.deepEqual(await adminOverrideStatus(locked, 'paid', 'จ่ายไปก่อน'), { success: true })
    assert.equal(claimRow(locked).status, 'paid')
    const override = logsOf(locked).filter(l => l.action === 'admin_override')
    assert.equal(override.length, 1)
    assert.ok(String(override[0].note).includes('จ่ายไปก่อน'), 'ประวัติมีเหตุผลที่จ่ายทั้งที่เอกสารไม่ครบ')
    assert.equal(override[0].note, '[Admin Override] จ่ายไปก่อน')
    pass(`AC6 ล็อกการจ่าย: markAsPaid ใบไม่มีใบเสร็จ → "${lockMessage}" ไม่เขียนอะไร · ทดลองจ่ายไม่มีใบเสร็จจ่ายได้ · bulk pay → ok:false ข้อความเดียวกัน · บังคับเปลี่ยนเป็น paid ไม่มีเหตุผล → error เรื่องเหตุผล · มีเหตุผล → จ่ายได้ ประวัติ "[Admin Override] จ่ายไปก่อน"`)
  }

  // ══ AC7: ส่งกลับให้แก้ ═══════════════════════════════════════════════════════
  {
    const reason = 'ใบเสร็จอ่านไม่ออก ขอรูปที่ชัดกว่านี้'
    const pending = seedClaim({ status: 'pending', submitted_at: '2026-09-11T03:00:00.000Z' })
    loginAs(STAFF)
    await expectRefused('พนักงานส่งกลับ', () => sendBackClaim(pending, reason), 'เฉพาะ Admin เท่านั้น', pending)
    loginAs(ADMIN)
    for (const empty of ['', '   ']) {
      const mark = await expectRefused(`เหตุผล ${JSON.stringify(empty)}`, () => sendBackClaim(pending, empty), 'กรุณาระบุสิ่งที่ต้องแก้ก่อนส่งกลับ', pending)
      assert.deepEqual(claimOpsSince(mark), [], 'ไม่มีเหตุผล → ไม่อ่านใบเบิกด้วย')
    }

    const mark = revalidated.length
    const notes0 = notifications.length
    assert.deepEqual(await sendBackClaim(pending, `  ${reason}  `), { success: true })
    const row = claimRow(pending)
    assert.deepEqual(
      { status: row.status, reject_reason: row.reject_reason, approved_by: row.approved_by, approved_at: row.approved_at, submitted_at: row.submitted_at },
      { status: 'draft', reject_reason: reason, approved_by: null, approved_at: null, submitted_at: null },
    )
    assert.deepEqual(logsOf(pending).map(l => ({ action: l.action, changes: l.changes, note: l.note })), [
      { action: 'send_back', changes: { status: { from: 'pending', to: 'draft' } }, note: reason },
    ])
    assert.deepEqual(activityOf(pending), [{ action: 'SEND_BACK_EXPENSE_CLAIM', details: { claimId: pending, claimNumber: row.claim_number, fromStatus: 'pending', reason } }])
    assert.equal(notifications.length - notes0, 1)
    const note = notifications.at(-1) as Row
    assert.deepEqual(
      { type: note.type, userIds: note.userIds, body: note.body, title: note.title, referenceType: note.referenceType, referenceId: note.referenceId, actorId: note.actorId },
      { type: 'expense_sent_back', userIds: [STAFF], body: reason, title: `ใบเบิก ${row.claim_number} ถูกส่งกลับให้แก้ไข`, referenceType: 'expense_claim', referenceId: pending, actorId: ADMIN },
    )
    assert.deepEqual(revalidated.slice(mark), ['/finance', `/finance/${pending}`, '/costs'])

    const approved = seedClaim({ status: 'approved', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z' })
    seedCostItem(approved)
    assert.deepEqual(await sendBackClaim(approved, reason), { success: true })
    assert.equal(claimRow(approved).status, 'draft')
    assert.equal(costItemsOf(approved).length, 0, 'ส่งกลับใบที่อนุมัติแล้ว → รายการต้นทุนถูกเอาออก')
    for (const from of ['waiting_tax_invoice', 'pending_month_end']) {
      const id = seedClaim({ status: from, approved_by: ADMIN })
      seedCostItem(id)
      assert.deepEqual(await sendBackClaim(id, reason), { success: true }, `ส่งกลับจาก ${from}`)
      assert.equal(claimRow(id).status, 'draft')
      assert.equal(costItemsOf(id).length, 0)
      assert.equal(activityOf(id, 'SEND_BACK_EXPENSE_CLAIM').length, 1)
    }
    const paid = seedClaim({ status: 'paid', paid_by: ADMIN })
    await expectRefused('ส่งกลับใบที่จ่ายแล้ว', () => sendBackClaim(paid, reason), CLAIM_TRANSITIONS.send_back.wrongStatusError, paid)

    // สถานะถูกเปลี่ยนระหว่างอ่านกับเขียน → STALE ไม่มีประวัติ/แจ้งเตือน
    const raced = seedClaim({ status: 'pending' })
    let afterRace: Row | null = null
    race = { id: raced, mutate: r => { Object.assign(r, { status: 'approved', approved_by: ADMIN_B }); afterRace = clone(r) } }
    const before = sideEffects()
    assert.deepEqual(await sendBackClaim(raced, reason), { error: STALE })
    assert.equal(race, null)
    assert.deepEqual(claimRow(raced), afterRace)
    assert.deepEqual(sideEffects(), before)

    // ผู้เบิกที่ยังมีใบค้างเคลียร์ (ทดลองจ่ายจ่ายแล้วยังไม่เคลียร์ / รอใบกำกับ) ยื่นใบใหม่ไม่ได้ — ใบที่ถูกส่งกลับก็ยื่นไม่ได้จนกว่าจะเคลียร์
    loginAs(STAFF)
    const owed = db.expense_claims.filter(r => r.submitted_by === STAFF && !r.deleted_at && outstandingKind(r as unknown as Parameters<typeof outstandingKind>[0]))
    assert.ok(owed.length > 0, 'ฟิกซ์เจอร์ต้องมีใบค้างเคลียร์ของพนักงาน')
    const blocked = (await submitClaim(pending)) as { error?: string }
    assert.match(String(blocked.error ?? ''), /ค้างเคลียร์/, 'มีใบค้างเคลียร์ → ยื่นไม่ได้')
    assert.equal(claimRow(pending).status, 'draft', 'ถูกบล็อก → ยังเป็นแบบร่าง')
    // ซ่อนใบค้างชั่วคราว → ยื่นได้ และเหตุผลที่ส่งกลับถูกล้าง
    for (const r of owed) r.deleted_at = '2026-09-30T00:00:00.000Z'
    assert.deepEqual(await submitClaim(pending), { success: true })
    for (const r of owed) r.deleted_at = null
    assert.equal(claimRow(pending).status, 'pending')
    assert.equal(claimRow(pending).reject_reason, null, 'ยื่นใหม่ → reject_reason ว่าง')
    pass('AC7 sendBackClaim: พนักงาน → error · เหตุผลว่าง/ช่องว่าง → error ไม่อ่านไม่เขียน · รออนุมัติ → แบบร่าง + เหตุผล (ล้างผู้อนุมัติ/เวลายื่น) ประวัติ send_back · activity 1 · แจ้งผู้เบิก 1 · อนุมัติแล้ว/รอใบกำกับ/รอจ่ายสิ้นเดือน → รายการต้นทุน 0 · จ่ายแล้ว → error · ชนกัน → STALE · มีใบค้างเคลียร์ → ยื่นไม่ได้ · ซ่อนใบค้างแล้วยื่นใหม่ล้างเหตุผล')
  }

  // ══ AC8: ซ่อน / กู้คืน / ใบที่ซ่อนในรายการ ═══════════════════════════════════════
  {
    const reason = 'ซ้ำกับใบที่ยื่นไปแล้ว'
    const put = (path: string) => fileUrl(path)
    const target = seedClaim({
      status: 'approved', approved_by: ADMIN, approved_at: '2026-09-12T03:00:00.000Z',
      receipt_urls: [put('claims/HIDE/r1.jpg')], actual_receipt_urls: [put('claims/HIDE-actual/a1.jpg')],
    })
    seedCostItem(target)
    loginAs(STAFF)
    await expectRefused('พนักงานซ่อน', () => hideClaim(target, reason), 'เฉพาะ Admin เท่านั้น', target)
    loginAs(ADMIN)
    const fund = seedClaim({ claim_type: 'petty_cash', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, receipt_urls: [] })
    const child = seedClaim({ claim_type: 'other', job_event_id: null, status: 'paid', submitted_by: CUSTODIAN, pettycash_fund_id: fund })
    const topup = seedClaim({ claim_type: 'petty_cash', job_event_id: null, status: 'pending', submitted_by: CUSTODIAN, pettycash_fund_id: fund })
    for (const [label, id] of [['วงเงิน', fund], ['รายการในกล่อง', child], ['เติมเงิน', topup]] as const) {
      await expectRefused(`ซ่อน${label}เงินสดย่อย`, () => hideClaim(id, reason), PETTY_HIDE, id)
    }

    const notes0 = notifications.length
    const storage0 = storageOps.length
    let mark = revalidated.length
    assert.deepEqual(await hideClaim(target, reason), { success: true })
    const hidden = claimRow(target)
    assert.ok(typeof hidden.deleted_at === 'string' && hidden.deleted_at, 'deleted_at ถูกตั้ง')
    assert.equal(hidden.deleted_by, ADMIN)
    assert.equal(hidden.status, 'approved', 'สถานะไม่เปลี่ยน')
    assert.equal(costItemsOf(target).length, 0, 'ซ่อนแล้วไม่มีรายการต้นทุน')
    assert.equal(storageOps.length, storage0, 'ไม่ลบไฟล์ในสตอเรจ')
    assert.deepEqual(logsOf(target).map(l => [l.action, l.note]), [['hide', reason]])
    assert.deepEqual(activityOf(target), [{ action: 'HIDE_EXPENSE_CLAIM', details: { claimId: target, claimNumber: hidden.claim_number, status: 'approved', reason } }])
    assert.equal(notifications.length - notes0, 1)
    const note = notifications.at(-1) as Row
    assert.deepEqual(
      { type: note.type, userIds: note.userIds, title: note.title, body: note.body, referenceId: note.referenceId },
      { type: 'expense_hidden', userIds: [STAFF], title: `ใบเบิก ${hidden.claim_number} ถูกซ่อนโดยแอดมิน`, body: reason, referenceId: target },
    )
    assert.deepEqual(revalidated.slice(mark), ['/finance', `/finance/${target}`, '/costs'])
    await expectRefused('ซ่อนซ้ำ', () => hideClaim(target, reason), 'ใบเบิกนี้ถูกซ่อนไปแล้ว', target)

    // ไม่ใส่เหตุผล → "ไม่ระบุเหตุผล"
    const noReason = seedClaim({ status: 'draft' })
    assert.deepEqual(await hideClaim(noReason), { success: true })
    assert.equal(logsOf(noReason)[0].note, 'ไม่ระบุเหตุผล')

    // ใบที่ซ่อนไม่อยู่ในรายการ / คิว / เดือนที่จ่าย
    const paidHidden = seedClaim({ status: 'paid', paid_at: '2026-05-10T03:00:00.000Z', paid_by: ADMIN })
    const monthsBefore = await getPaidMonths()
    assert.deepEqual(monthsBefore.find(m => m.month === '2026-05'), { month: '2026-05', count: 1 })
    assert.deepEqual(await hideClaim(paidHidden, 'บันทึกซ้ำ'), { success: true })
    assert.equal((await getPaidMonths()).find(m => m.month === '2026-05'), undefined, 'getPaidMonths ไม่นับใบที่ซ่อน')
    for (const who of [ADMIN, STAFF]) {
      loginAs(who)
      for (const filters of [undefined, { open: true }] as const) {
        const res = await getClaims(filters)
        assert.equal(res.error, undefined)
        const ids = idsOf(res.data as Row[])
        assert.ok(!ids.includes(target) && !ids.includes(paidHidden) && !ids.includes(noReason), `getClaims(${JSON.stringify(filters)}) ของ ${who === ADMIN ? 'แอดมิน' : 'พนักงาน'} ต้องไม่มีใบที่ซ่อน`)
        assert.ok(ids.length > 0)
      }
    }
    loginAs(ADMIN)
    const queue = await getQueueClaims()
    assert.equal(queue.error, undefined)
    assert.ok(!idsOf(queue.data).includes(target) && !idsOf(queue.data).includes(noReason), 'คิวไม่มีใบที่ซ่อน')
    assert.equal(queue.hiddenCount, 3)

    // หน้าใบเบิก: เจ้าของ (พนักงาน) ไม่เห็น · แอดมินเห็นพร้อม deleted_at
    loginAs(STAFF)
    assert.deepEqual(await getClaim(target), { data: null, error: 'ไม่พบใบเบิก' })
    loginAs(ADMIN)
    const adminView = await getClaim(target)
    assert.ok(adminView.data && typeof (adminView.data as Row).deleted_at === 'string', 'แอดมินเปิดใบที่ซ่อนได้')

    // รายการใบที่ซ่อน: ใหม่ → เก่า · พนักงานไม่ได้อะไร
    claimRow(target).deleted_at = '2026-09-25T01:00:00.000Z'
    claimRow(noReason).deleted_at = '2026-09-27T01:00:00.000Z'
    claimRow(paidHidden).deleted_at = '2026-09-26T01:00:00.000Z'
    const list = await listHiddenClaims()
    assert.equal(list.error, undefined)
    assert.deepEqual(idsOf(list.data), [noReason, paidHidden, target], 'ใบที่ซ่อน ใหม่ → เก่า')
    assert.deepEqual(Object.keys(list.data[0]).sort(), Object.keys(queue.data[0]).sort(), 'แถวรูปเดียวกับคิว')
    loginAs(STAFF)
    mark = ops.length
    assert.deepEqual(await listHiddenClaims(), { data: [], error: 'Unauthorized' })
    assert.deepEqual(claimOpsSince(mark), [], 'พนักงาน → ไม่อ่านใบเบิก')

    // กู้คืน
    loginAs(ADMIN)
    const logs0 = logsOf(target).length
    assert.deepEqual(await restoreClaim(target), { success: true })
    assert.equal(claimRow(target).deleted_at, null)
    assert.equal(claimRow(target).deleted_by, null)
    assert.equal(costItemsOf(target).length, 1, 'กู้คืน → รายการต้นทุนกลับมา 1')
    assert.deepEqual(logsOf(target).slice(logs0).map(l => l.action), ['restore'])
    assert.equal(activityOf(target, 'RESTORE_EXPENSE_CLAIM').length, 1)
    assert.equal(activityOf(target).length, 2, 'ซ่อน 1 + กู้คืน 1')
    await expectRefused('กู้คืนใบที่ไม่ได้ซ่อน', () => restoreClaim(target), 'ใบเบิกนี้ไม่ได้ถูกซ่อน', target)
    loginAs(STAFF)
    await expectRefused('พนักงานกู้คืน', () => restoreClaim(noReason), 'เฉพาะ Admin เท่านั้น', noReason)

    // ใบที่ซ่อนไว้ เปลี่ยนสถานะไม่ได้จนกว่าจะกู้คืน — สั่งตรง (ไม่ผ่านหน้าจอที่ซ่อนปุ่มไว้) ต้องไม่ได้ผล
    loginAs(ADMIN)
    const refusedWhileHidden = async (label: string, over: Row, run: (id: string) => Promise<{ error?: string }>) => {
      const hiddenId = seedClaim({ ...over, deleted_at: '2026-09-28T01:00:00.000Z', deleted_by: ADMIN })
      const before = sideEffects()
      const row = JSON.stringify(claimRow(hiddenId))
      const res = await run(hiddenId)
      assert.equal(res.error, STALE, `${label} ใบที่ซ่อน → "${STALE}" (ได้ ${JSON.stringify(res)})`)
      assert.equal(JSON.stringify(claimRow(hiddenId)), row, `${label} ใบที่ซ่อน: ใบไม่เปลี่ยน`)
      assert.deepEqual(sideEffects(), before, `${label} ใบที่ซ่อน: ไม่มีผลข้างเคียง`)
    }
    await refusedWhileHidden('approveClaim', { status: 'pending' }, approveClaim)
    await refusedWhileHidden('markAsPaid', { status: 'approved', approved_by: ADMIN }, markAsPaid)
    const bulkHidden = seedClaim({ status: 'pending', deleted_at: '2026-09-28T01:00:00.000Z', deleted_by: ADMIN })
    const bulkRes = await bulkClaimAction('approve', [bulkHidden])
    assert.ok((bulkRes.results ?? []).every(r => !r.ok), `จ่าย/อนุมัติหลายใบ: ใบที่ซ่อนไม่สำเร็จ (ได้ ${JSON.stringify(bulkRes)})`)
    assert.equal(claimRow(bulkHidden).status, 'pending', 'อนุมัติหลายใบ: ใบที่ซ่อนยังรออนุมัติ')
    pass('AC8 hideClaim: พนักงาน → error · เงินสดย่อย (วงเงิน/รายการในกล่อง/เติมเงิน) → error ไม่เขียน · อนุมัติแล้วผูกงาน → deleted_at/deleted_by · รายการต้นทุน 0 · ไม่ลบไฟล์ · ประวัติ hide · activity 1 · แจ้งผู้เบิก 1 · ซ่อนซ้ำ → error · getClaims / open / คิว / getPaidMonths ไม่มีใบที่ซ่อน · getClaim: พนักงาน "ไม่พบใบเบิก" แอดมินเห็น · listHiddenClaims ใหม่ → เก่า · restoreClaim → รายการต้นทุนกลับ 1 ประวัติ restore activity 1 · กู้คืนใบที่ไม่ได้ซ่อน → error')
  }

  // ══ AC9: ทำทีละหลายใบ ═════════════════════════════════════════════════════════
  {
    loginAs(ADMIN)
    const some = seedClaim({ status: 'pending' })
    const fiftyOne = Array.from({ length: 51 }, (_, i) => uid(70_000 + i))
    const invalid: [string, () => Promise<{ error?: string }>, string][] = [
      ['[]', () => bulkClaimAction('approve', []), 'ทำได้ครั้งละ 1–50 ใบ'],
      ['51 ใบ', () => bulkClaimAction('approve', fiftyOne), 'ทำได้ครั้งละ 1–50 ใบ'],
      ['ไม่ใช่ array', () => bulkClaimAction('approve', some as unknown as string[]), 'ทำได้ครั้งละ 1–50 ใบ'],
      ['ไม่ใช่ uuid', () => bulkClaimAction('approve', [some, 'not-a-uuid']), 'รหัสใบเบิกไม่ถูกต้อง'],
      ['ซ้ำ (ต่างตัวพิมพ์)', () => bulkClaimAction('approve', [some, some.toUpperCase()]), 'มีใบเบิกซ้ำกันในรายการ'],
      ["action 'delete'", () => bulkClaimAction('delete' as 'approve', [some]), 'การกระทำไม่ถูกต้อง'],
      ["action 'submit' (มีในตารางแต่ทำหลายใบไม่ได้)", () => bulkClaimAction('submit' as 'approve', [some]), 'การกระทำไม่ถูกต้อง'],
      ["action 'constructor'", () => bulkClaimAction('constructor' as 'approve', [some]), 'การกระทำไม่ถูกต้อง'],
    ]
    for (const [label, run, message] of invalid) {
      const mark = await expectRefused(`bulk ${label}`, run, message, some)
      assert.equal(ops.length, mark, `bulk ${label}: ต้องไม่อ่านอะไรเลย (รวม profiles)`)
    }
    loginAs(STAFF)
    const staffMark = await expectRefused('bulk พนักงาน', () => bulkClaimAction('approve', [some]), 'เฉพาะ Admin เท่านั้น', some)
    assert.deepEqual(claimOpsSince(staffMark), [], 'พนักงาน → ไม่อ่านใบเบิก')

    loginAs(ADMIN)
    const pendings = [1, 2, 3].map(() => seedClaim({ status: 'pending' }))
    const already = seedClaim({ status: 'approved', approved_by: ADMIN_B })
    seedCostItem(already)
    const raced = seedClaim({ status: 'pending' })
    race = { id: raced, mutate: r => { Object.assign(r, { status: 'rejected', reject_reason: 'คนอื่นปฏิเสธก่อน', approved_by: ADMIN_B }) } }
    const act0 = activity.length, notes0 = notifications.length, logs0 = db.expense_claim_logs.length, rev0 = revalidated.length
    const res = await bulkClaimAction('approve', [pendings[0], already, pendings[1], raced, pendings[2]])
    assert.equal(race, null)
    assert.equal(res.error, undefined)
    assert.equal(res.results?.length, 5)
    assert.equal(res.done, 3)
    assert.equal(res.failed, 2)
    const failed = (res.results ?? []).filter(r => !r.ok)
    assert.deepEqual(failed.map(r => r.id), [already, raced])
    for (const r of failed) assert.ok(r.claimNumber && r.error, `ใบที่ไม่สำเร็จต้องมีเลขที่และข้อความ (${JSON.stringify(r)})`)
    assert.equal(failed[0].error, CLAIM_TRANSITIONS.approve.wrongStatusError)
    assert.equal(failed[1].error, STALE)
    assert.equal(failed[0].claimNumber, claimRow(already).claim_number)
    for (const id of pendings) {
      assert.equal(claimRow(id).status, 'approved')
      assert.equal(costItemsOf(id).length, 1, 'ใบผูกงานที่อนุมัติ → รายการต้นทุน 1')
      assert.equal(activityOf(id).length, 1, 'activity 1 ต่อใบ')
    }
    assert.equal(costItemsOf(already).length, 1)
    assert.equal(claimRow(raced).status, 'rejected')
    const approvals = activity.slice(act0).filter(a => a.action === 'APPROVE_EXPENSE_CLAIM')
    assert.equal(approvals.length, 3)
    assert.equal(activity.length - act0, 3)
    const batchIds = new Set(approvals.map(a => a.details.batchId))
    assert.equal(batchIds.size, 1, 'ทุกใบในชุดมี batchId เดียวกัน')
    assert.match(String([...batchIds][0]), /^[0-9a-f-]{36}$/)
    assert.ok(approvals.every(a => a.details.batchSize === 5))
    assert.equal(notifications.length - notes0, 3, 'แจ้งเตือนทีละใบ')
    assert.equal(db.expense_claim_logs.slice(logs0).filter(l => l.action === 'approve').length, 3)
    assert.equal(db.expense_claim_logs.length - logs0, 3)
    const paths = revalidated.slice(rev0)
    assert.equal(paths.filter(p => p === '/finance').length, 1, "revalidatePath('/finance') ครั้งเดียวต่อชุด")
    assert.deepEqual(paths, ['/finance', '/finance/payouts', '/costs'])

    // ชุดที่สองใช้ batchId ใหม่ · ใบที่ไม่มีในระบบ → "ไม่พบใบเบิก"
    const missing = uid(79_999)
    const second = await bulkClaimAction('request_tax_invoice', [pendings[0], missing])
    assert.deepEqual(second.results, [
      { id: pendings[0], claimNumber: claimRow(pendings[0]).claim_number, ok: true },
      { id: missing, claimNumber: '', ok: false, error: 'ไม่พบใบเบิก' },
    ])
    assert.equal(claimRow(pendings[0]).status, 'waiting_tax_invoice')
    const secondBatch = activityOf(pendings[0], 'MARK_CLAIM_WAITING_TAX_INVOICE')[0].details.batchId
    assert.ok(secondBatch && secondBatch !== [...batchIds][0], 'ชุดใหม่ batchId ใหม่')
    assert.deepEqual(await bulkClaimAction('defer_month_end', [pendings[1]]), { results: [{ id: pendings[1], claimNumber: claimRow(pendings[1]).claim_number, ok: true }], done: 1, failed: 0 })
    assert.equal(claimRow(pendings[1]).status, 'pending_month_end')
    const monthEnd = seedClaim({ status: 'pending' })
    assert.equal((await bulkClaimAction('approve_month_end', [monthEnd])).done, 1)
    assert.equal(claimRow(monthEnd).status, 'pending_month_end')
    const notes1 = notifications.length
    assert.equal((await bulkClaimAction('pay', [pendings[1], pendings[2]])).done, 2)
    assert.equal(claimRow(pendings[2]).status, 'paid')
    assert.equal(notifications.length - notes1, 2)
    // ทุกใบไม่ผ่าน → ไม่ revalidate
    const rev1 = revalidated.length
    assert.equal((await bulkClaimAction('approve', [pendings[2]])).failed, 1)
    assert.equal(revalidated.length, rev1)
    pass('AC9 bulkClaimAction: [] / 51 ใบ / ไม่ใช่ uuid / ซ้ำ / action ผิด → ข้อความตามสัญญา ไม่อ่านไม่เขียน · พนักงาน → error · อนุมัติ 5 ใบ (รออนุมัติ 3, อนุมัติแล้ว 1, ชนกัน 1) → สำเร็จ 3 ไม่สำเร็จ 2 (มีเลขที่+ข้อความ) · รายการต้นทุน 1 ต่อใบ · activity 3 batchId เดียวกัน · แจ้งเตือน 3 · ประวัติ 3 · revalidate /finance ครั้งเดียว · ขอใบกำกับ / ย้ายสิ้นเดือน / อนุมัติรอสิ้นเดือน / จ่าย ผ่าน core เดียวกัน · ไม่พบใบ → "ไม่พบใบเบิก"')
  }

  // ══ AC10: ข้อมูลของคิว ═══════════════════════════════════════════════════════
  {
    resetDb()
    const inQueue = [
      seedClaim({ status: 'pending' }),
      seedClaim({ status: 'approved' }),
      seedClaim({ status: 'waiting_tax_invoice' }),
      seedClaim({ status: 'pending_month_end' }),
      seedClaim({ status: 'awaiting_payment' }),
      seedClaim({ status: 'draft' }),
      seedClaim({ claim_type: 'advance', job_event_id: null, status: 'paid', actual_spent_amount: null }),
      seedClaim({ claim_type: 'advance', job_event_id: null, status: 'paid', actual_spent_amount: 800, refund_amount: 200, refund_confirmed_at: null, advance_settled_at: '2026-09-20T03:00:00.000Z' }),
    ]
    const outOfQueue = [
      seedClaim({ status: 'rejected' }),
      seedClaim({ status: 'cancelled' }),
      seedClaim({ claim_type: 'advance', job_event_id: null, status: 'refund_confirmed', actual_spent_amount: 800, refund_amount: 200, refund_confirmed_at: '2026-09-21T03:00:00.000Z' }),
      seedClaim({ status: 'paid' }),
      seedClaim({ claim_type: 'advance', job_event_id: null, status: 'paid', actual_spent_amount: 1000, refund_amount: 0 }),
      seedClaim({ status: 'pending', deleted_at: '2026-09-22T03:00:00.000Z', deleted_by: ADMIN }),
    ]
    loginAs(ADMIN)
    let mark = ops.length
    const res = await getQueueClaims()
    assert.equal(res.error, undefined)
    assert.deepEqual([...idsOf(res.data)].sort(), [...inQueue].sort(), 'คิว = ใบที่ยังไม่จบ + ทดลองจ่ายยังไม่เคลียร์ + รอยืนยันเงินคืน')
    for (const id of outOfQueue) assert.ok(!idsOf(res.data).includes(id))
    assert.equal(res.hiddenCount, 1)
    const selects = claimOpsSince(mark).filter(o => o.action === 'select').map(o => String(o.cols))
    assert.ok(selects.length >= 4)
    for (const cols of selects) {
      assert.ok(!cols.includes('*'), `select ต้องไม่มี '*': ${cols}`)
      for (const word of ['description', 'notes', 'staff_roles', 'approver:', 'payer:']) assert.ok(!cols.includes(word), `select ต้องไม่มี ${word}`)
    }
    const row = res.data.find(r => r.id === inQueue[0]) as unknown as Row
    assert.deepEqual((row.submitter as Row), { id: STAFF, full_name: 'พนักงาน ทดสอบ' })
    assert.deepEqual((row.job_event as Row), { id: EVENT, event_name: 'งานทดสอบ' })
    assert.ok(!('notes' in row) && !('description' in row))
    assert.ok('status_changed_at' in row && 'deleted_at' in row && 'reject_reason' in row)
    assert.ok(!QUEUE_SELECT.includes('*'))

    // พนักงาน → Unauthorized ไม่อ่านใบเบิก
    loginAs(STAFF)
    mark = ops.length
    assert.deepEqual(await getQueueClaims(), { data: [], hiddenCount: 0, error: 'Unauthorized' })
    assert.deepEqual(claimOpsSince(mark), [])

    // อ่านทีละหน้า: 1,200 ใบในคิว → ได้ครบ 1,200
    resetDb()
    for (let i = 0; i < 1200; i++) seedClaim({ status: i % 2 ? 'pending' : 'approved' })
    loginAs(ADMIN)
    const big = await getQueueClaims()
    assert.equal(big.error, undefined)
    assert.equal(big.data.length, 1200)
    assert.equal(new Set(idsOf(big.data)).size, 1200)

    // ยังไม่รัน SQL → ข้อความให้รัน ไม่ล้ม
    for (const col of HIDE_COLUMNS) dropped.add(col)
    const noSql = await getQueueClaims()
    assert.deepEqual(noSql.data, [])
    assert.equal(noSql.hiddenCount, 0)
    assert.ok(String(noSql.error).includes(SQL_FILE), `ต้องบอกให้รัน ${SQL_FILE} (ได้ ${noSql.error})`)
    dropped.clear()
    pass('AC10 getQueueClaims: ได้รออนุมัติ/อนุมัติแล้ว/รอใบกำกับ/รอจ่ายสิ้นเดือน/awaiting_payment/แบบร่าง + ทดลองจ่ายยังไม่เคลียร์ + รอยืนยันเงินคืน · ไม่มีปฏิเสธ/ยกเลิก/คืนเงินแล้ว/จ่ายแล้ว/เคลียร์ครบ/ซ่อน · select ไม่มี * / description / notes / staff_roles / approver / payer · hiddenCount ถูก · พนักงาน → Unauthorized ไม่อ่าน · 1,200 ใบได้ครบ · ไม่มีคอลัมน์ → ข้อความให้รัน SQL')
  }

  // ══ AC20: สร้างรายการต้นทุนใหม่จากใบเบิก — กดซ้ำไม่ซ้ำ · งานไม่ตรง → error ═══════════════════
  {
    resetDb()
    loginAs(ADMIN)
    const approved = seedClaim({ status: 'approved', approved_by: ADMIN })
    assert.deepEqual(await recreateCostItemFromClaim(approved, EVENT), { success: true })
    assert.deepEqual(await recreateCostItemFromClaim(approved, EVENT), { success: true })
    assert.equal(costItemsOf(approved).length, 1, 'กดสองครั้ง → รายการต้นทุน 1')
    await expectRefused('งานไม่ตรง', () => recreateCostItemFromClaim(approved, EVENT_B), 'ใบเบิกนี้ไม่ได้ผูกกับงานนี้', approved)
    const pending = seedClaim({ status: 'pending' })
    await expectRefused('ยังไม่อนุมัติ', () => recreateCostItemFromClaim(pending, EVENT), 'ใบเบิกยังไม่ได้อนุมัติ', pending)
    const paid = seedClaim({ status: 'paid' })
    assert.deepEqual(await recreateCostItemFromClaim(paid, EVENT), { success: true }, 'จ่ายแล้วก็สร้างคืนได้ (ต้องมีรายการ)')
    assert.equal(costItemsOf(paid).length, 1)
    const hiddenApproved = seedClaim({ status: 'approved', deleted_at: '2026-09-22T03:00:00.000Z' })
    await expectRefused('ใบที่ซ่อน', () => recreateCostItemFromClaim(hiddenApproved, EVENT), 'ใบเบิกยังไม่ได้อนุมัติ', hiddenApproved)
    pass('AC20 recreateCostItemFromClaim: เรียกสองครั้ง → รายการต้นทุน 1 · jobCostEventId ไม่ตรง → "ใบเบิกนี้ไม่ได้ผูกกับงานนี้" · ยังไม่อนุมัติ/ซ่อน → "ใบเบิกยังไม่ได้อนุมัติ" ไม่เขียน · จ่ายแล้วสร้างคืนได้')
  }

  // ══ ฐานข้อมูลที่ยังไม่รัน SQL ของขั้น 4 — ของเดิมทำงานต่อได้ (ส่วนนี้ต้องอยู่ท้ายสุด: ธงใน actions.ts ค้างทั้ง process) ══
  {
    resetDb()
    for (const col of HIDE_COLUMNS) dropped.add(col)
    loginAs(ADMIN)
    const pending = seedClaim({ status: 'pending' })
    const other = seedClaim({ status: 'approved', claim_type: 'other', job_event_id: null })
    const paid = seedClaim({ status: 'paid', paid_at: '2026-09-15T03:00:00.000Z' })
    const all = await quietly(() => getClaims())
    assert.equal(all.error, undefined, `getClaims ต้องสำเร็จ (ได้ ${all.error})`)
    assert.equal(all.data.length, 3)
    const open = await getClaims({ open: true })
    assert.equal(open.error, undefined)
    assert.deepEqual([...idsOf(open.data as Row[])].sort(), [pending, other].sort())
    loginAs(STAFF)
    assert.equal((await getClaims({ open: true })).data.length, 2, 'รายการของพนักงานยังใช้ได้')
    loginAs(ADMIN)
    assert.deepEqual((await getPaidMonths()).find(m => m.month === '2026-09'), { month: '2026-09', count: 1 })
    assert.deepEqual(await approveClaim(pending), { success: true }, 'อนุมัติได้แม้ยังไม่มี deleted_at')
    assert.equal(claimRow(pending).status, 'approved')
    assert.equal(costItemsOf(pending).length, 1)
    assert.deepEqual(await markAsPaid(other), { success: true })
    assert.equal((await getClaim(paid)).data?.id, paid)
    const rejected = seedClaim({ status: 'rejected', reject_reason: 'ยอดผิด' })
    loginAs(STAFF)
    assert.deepEqual(await reopenRejectedClaim(rejected), { success: true })
    loginAs(ADMIN)
    assert.deepEqual(await sendBackClaim(pending, 'แก้ยอด'), { success: true })
    assert.equal(costItemsOf(pending).length, 0)
    const hideMsg = /20260930_claim_hide_status_time\.sql/
    await expectRefused('ซ่อน (ยังไม่รัน SQL)', () => hideClaim(paid, 'x'), hideMsg, paid)
    await expectRefused('กู้คืน (ยังไม่รัน SQL)', () => restoreClaim(paid), hideMsg, paid)
    assert.match(String((await listHiddenClaims()).error), hideMsg)
    assert.match(String((await getQueueClaims()).error), hideMsg)
    assert.deepEqual(await deleteClaim(rejected), { success: true }, 'ลบได้แม้ยังไม่มี deleted_at')
    dropped.clear()
    pass('ยังไม่รัน SQL (ไม่มี deleted_at/deleted_by/status_changed_at): getClaims / open / ของพนักงาน / getPaidMonths / getClaim ใช้ได้ · อนุมัติ จ่าย เปิดใบที่ถูกปฏิเสธ ส่งกลับ ลบ ทำงานได้ · ซ่อน/กู้คืน/ใบที่ซ่อน/คิว → ข้อความให้รัน SQL ไม่เขียนอะไร')
  }

  console.log('\nfinance-queue: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
