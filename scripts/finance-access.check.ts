// สิทธิ์และข้อมูลส่วนบุคคลของส่วนใบเบิก (/finance) — ขั้น 0 ข้อ S2–S6 ของ docs/specs/finance-refactor-plan.md
// รัน settings-actions.ts, page.tsx ของหน้าแอดมิน, layout, หน้าสร้างใบเบิก และ finance-nav ตัวจริง
// กับฐานข้อมูลจำลองในหน่วยความจำ + token ที่เซ็นจริง (lib/session) + logActivity ที่ถูกดักไว้
// Run:  npx tsx scripts/finance-access.check.ts
//
// ไม่แตะฐานข้อมูลจริง ไม่ต้องมี env: แทน next/headers, next/cache, @/lib/supabase-server, @/lib/logger ด้วยตัวจำลอง
// (เทคนิคเดียวกับ scripts/claim-filed.check.ts) · ผู้ใช้ เลขบัญชี เลขบัตร ที่อยู่ ทั้งหมดสังเคราะห์
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-access: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { createElement, isValidElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

process.env.SESSION_SECRET = 'finance-access-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

const ROOT = path.resolve(__dirname, '..')
const FINANCE = path.join(ROOT, 'app', '(authenticated)', 'finance')

// ── ผู้ใช้และข้อมูล (สังเคราะห์ทั้งหมด) ─────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF = uid(2), STAFF2 = uid(3), STAFF3 = uid(4), NO_BANK = uid(5)
const MISSING = uid(199)
const CAT_A = uid(201), CAT_B = uid(202), ITEM_A = uid(301)
const BANK_COLS = ['bank_name', 'bank_account_number', 'account_holder_name'] as const

const person = (id: string, n: number, role: string, bank: boolean): Row => ({
  id, full_name: `ผู้ใช้ทดสอบ ${n}`, nickname: `ทดสอบ${n}`, role, department: 'สตาฟ',
  is_approved: true, active_session_id: `sess-${id}`,
  bank_name: bank ? 'ธนาคารทดสอบ' : null,
  bank_account_number: bank ? `000-0-0000${n}-0` : null,
  account_holder_name: bank ? `บัญชีทดสอบ ${n}` : null,
  national_id: `000000000000${n}`,
  address: `ที่อยู่ทดสอบ ${n}`,
})

function claim(n: number, submittedBy: string, wht: number | null, over: Row = {}): Row {
  return {
    id: uid(1000 + n), claim_number: `EXP-TEST-${String(n).padStart(3, '0')}`, claim_type: 'event',
    title: `ใบทดสอบ ${n}`, category: 'travel', amount: 1000 + n, vat_mode: 'none', withholding_tax_rate: wht,
    status: 'paid', submitted_by: submittedBy, expense_date: '2026-09-01', created_at: `2026-09-${String(n).padStart(2, '0')}T03:00:00+00:00`,
    bank_name: 'ธนาคารทดสอบ', bank_account_number: `000-0-0000${n}-9`, account_holder_name: `ผู้รับทดสอบ ${n}`,
    receipt_urls: [`https://fake.supabase.test/storage/v1/object/public/receipts/${n}.jpg`], notes: `หมายเหตุทดสอบ ${n}`,
    deleted_at: null, status_changed_at: null,
    // join ของ getClaims (submitter:profiles!…(id, full_name)) — ตัวจำลองคืนทั้งแถวเมื่อเลือก '*'
    submitter: { id: submittedBy, full_name: `ผู้ใช้ทดสอบ ${submittedBy.slice(-1)}` },
    ...over,
  }
}

/** ตาราง → คอลัมน์ที่มีจริง (select/filter/insert/update ที่อ้างคอลัมน์อื่น = assert ล้ม) */
const SCHEMA: Record<string, string[]> = {
  profiles: Object.keys(person(ADMIN, 1, 'admin', true)),
  finance_categories: ['id', 'value', 'label', 'label_th', 'icon', 'color', 'sort_order', 'is_active', 'detail_source', 'created_at'],
  finance_category_items: ['id', 'category_id', 'label', 'is_active', 'sort_order', 'created_at'],
  expense_claims: Object.keys(claim(1, STAFF, 3)),
  job_cost_events: ['id', 'event_name', 'event_date', 'event_location', 'status', 'source_event_id'],
  event_closures: ['id', 'event_name', 'event_date', 'event_location'],
  events: ['id', 'name', 'event_date', 'location', 'status'],
}

const db: Record<string, Row[]> = {}
function reset() {
  db.profiles = [
    person(ADMIN, 1, 'admin', true),
    person(STAFF, 2, 'staff', true),
    person(STAFF2, 3, 'staff', true),
    person(STAFF3, 4, 'staff', true),
    person(NO_BANK, 5, 'staff', false),
  ]
  db.finance_categories = [
    { id: CAT_A, value: 'travel', label: 'Travel', label_th: 'ค่าเดินทาง', icon: 'Car', color: '#f97316', sort_order: 1, is_active: true, detail_source: 'vehicle', created_at: '2026-01-01T00:00:00+00:00' },
    { id: CAT_B, value: 'staff', label: 'Staff', label_th: 'ค่าสตาฟ', icon: 'Users', color: '#ef4444', sort_order: 2, is_active: false, detail_source: 'staff', created_at: '2026-01-01T00:00:00+00:00' },
  ]
  db.finance_category_items = [
    { id: ITEM_A, category_id: CAT_A, label: 'รถทดสอบ', is_active: true, sort_order: 1, created_at: '2026-01-01T00:00:00+00:00' },
  ]
  db.expense_claims = [
    claim(1, STAFF, 3),                               // มีหัก ณ ที่จ่าย
    claim(2, STAFF, 0),                               // ไม่มี
    claim(3, STAFF2, 3, { status: 'approved' }),       // มี
    claim(4, STAFF3, 0),                              // ไม่มี — STAFF3 ต้องไม่อยู่ใน profileMap
    claim(5, ADMIN, 1, { vat_mode: 'included' }),      // มี
    claim(6, STAFF2, null),                           // ค่าเก่าเป็น null = ไม่มี
  ]
  db.job_cost_events = []
  db.event_closures = []
  db.events = []
  ops.length = 0
  logged.length = 0
  revalidated.length = 0
}

// ── ฐานข้อมูลจำลอง (PostgREST เฉพาะที่โค้ดเหล่านี้ใช้) ───────────────────────────────
type Op = { table: string; action: 'select' | 'insert' | 'update' | 'delete'; cols: string[]; filters: string[]; payload?: Row }
/** ทุกคำขอ นับได้ตามตาราง/ชนิด/คอลัมน์ */
const ops: Op[] = []
const logged: unknown[][] = []
const revalidated: string[] = []
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/** เรียกเมธอดที่ตัวจำลองไม่มี → throw ทันที (กันโค้ดจริงใช้ฟีเจอร์ที่ไม่ได้เลียนแบบแล้วผ่านแบบเงียบ) */
function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

class Query implements PromiseLike<Result> {
  private action: Op['action'] = 'select'
  private cols = '*'
  private payload: Row = {}
  private filters: ((r: Row) => boolean)[] = []
  private filterText: string[] = []
  private sorts: { col: string; asc: boolean }[] = []
  private start = 0
  private end = Number.POSITIVE_INFINITY
  private max = Number.POSITIVE_INFINITY
  private one: 'single' | 'maybeSingle' | null = null
  constructor(private table: string) {
    assert.ok(SCHEMA[table], `ตัวจำลองไม่มีตาราง ${table}`)
  }

  select(cols = '*', options?: unknown) {
    assert.equal(options, undefined, 'ตัวจำลองไม่รองรับตัวเลือกของ select (count / head)')
    assert.equal(this.action, 'select', 'ตัวจำลองไม่รองรับ returning')
    this.cols = cols
    return this
  }
  insert(row: Row) {
    assert.ok(!Array.isArray(row), 'ตัวจำลองรองรับ insert ทีละแถว')
    this.action = 'insert'
    this.payload = row
    return this
  }
  update(values: Row) { this.action = 'update'; this.payload = values; return this }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { return this.where(c, `eq:${c}=${String(v)}`, r => r[c] === v) }
  in(c: string, vs: unknown[]) {
    assert.ok(Array.isArray(vs), 'in() ต้องได้ array')
    return this.where(c, `in:${c}=${vs.join('|')}`, r => vs.includes(r[c]))
  }
  not(c: string, op: string, v: string) {
    assert.equal(op, 'in', 'ตัวจำลองรองรับเฉพาะ not(col, "in", "(a,b)")')
    const values = v.slice(1, -1).split(',')
    return this.where(c, `notin:${c}`, r => r[c] != null && !values.includes(String(r[c])))
  }
  is(c: string, v: null) {
    assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ is(col, null)')
    return this.where(c, `is:${c}=null`, r => r[c] == null)
  }
  gte(c: string, v: string) { return this.where(c, `gte:${c}`, r => r[c] != null && Date.parse(String(r[c])) >= Date.parse(v)) }
  lt(c: string, v: string) { return this.where(c, `lt:${c}`, r => r[c] != null && Date.parse(String(r[c])) < Date.parse(v)) }
  /** ตัวเลข (withholding_tax_rate > 0 ของหน้าหัก ณ ที่จ่าย) — null ไม่ผ่านแบบ Postgres */
  gt(c: string, v: number) { return this.where(c, `gt:${c}=${v}`, r => r[c] != null && Number(r[c]) > v) }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.known(col)
    this.sorts.push({ col, asc: opts.ascending !== false })
    return this
  }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  limit(n: number) { this.max = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private known(col: string) {
    assert.ok(SCHEMA[this.table].includes(col), `ไม่มีคอลัมน์ ${this.table}.${col}`)
  }
  private where(col: string, text: string, f: (r: Row) => boolean) {
    this.known(col)
    this.filterText.push(text)
    this.filters.push(f)
    return this
  }

  /** คอลัมน์ที่เลือก (ตัด join alias:table!fk(...) ออก — join ของ expense_claims อ่านเฉพาะ id, full_name ของ profiles) */
  private selected(): string[] {
    return this.cols.replace(/\w+:\w+!\w+\([^)]*\)/g, '').split(',').map(c => c.trim()).filter(Boolean)
  }

  private run(): Result {
    const cols = this.action === 'select' ? this.selected() : []
    ops.push({ table: this.table, action: this.action, cols, filters: [...this.filterText], ...(this.action === 'select' || this.action === 'delete' ? {} : { payload: clone(this.payload) }) })
    const rows = db[this.table]

    if (this.action === 'insert') {
      for (const c of Object.keys(this.payload)) this.known(c)
      rows.push({ id: uid(900 + rows.length), ...clone(this.payload) })
      return { data: null, error: null }
    }
    const hits = rows.filter(r => this.filters.every(f => f(r)))
    if (this.action === 'update') {
      for (const c of Object.keys(this.payload)) this.known(c)
      for (const r of hits) Object.assign(r, clone(this.payload))
      return { data: null, error: null }
    }
    if (this.action === 'delete') {
      db[this.table] = rows.filter(r => !hits.includes(r))
      return { data: null, error: null }
    }

    for (const c of cols) if (c !== '*') this.known(c)
    const sorted = [...hits].sort((a, b) => {
      for (const s of this.sorts) {
        const x = String(a[s.col] ?? ''), y = String(b[s.col] ?? '')
        if (x !== y) return (x < y ? -1 : 1) * (s.asc ? 1 : -1)
      }
      return 0
    })
    const page = sorted.slice(this.start, this.end + 1).slice(0, this.max)
      .map(r => (cols.includes('*') ? clone(r) : Object.fromEntries(cols.map(c => [c, clone(r[c])]))))
    if (!this.one) return { data: page, error: null }
    if (page.length === 1) return { data: page[0], error: null }
    if (page.length === 0 && this.one === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${page.length}` } }
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}
/** rpc ของหน้าหัก ณ ที่จ่าย: null = ฐานข้อมูลยังไม่มีฟังก์ชัน (PGRST202 → โค้ดใช้ทางสำรอง) · array = แถวที่ฟังก์ชันคืน */
let whtRpcRows: Row[] | null = null
const rpcCalls: string[] = []
/** ผลของ rpc แบบ PostgREST: .order() / .range() แล้ว await (แถวเรียงตามที่ตั้งไว้แล้ว — ตัวจำลองไม่เรียงใหม่) */
class RpcQuery implements PromiseLike<Result> {
  private start = 0
  private end = Number.POSITIVE_INFINITY
  constructor(private fn: string) {}
  order(col: string) { assert.ok(['submitted_by', 'status', 'month'].includes(col), `rpc order ${col}`); return this }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve().then((): Result => {
      rpcCalls.push(this.fn)
      assert.equal(this.fn, 'finance_wht_cells', `ตัวจำลองไม่รองรับ rpc ${this.fn}`)
      if (!whtRpcRows) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${this.fn} without parameters in the schema cache` } }
      return { data: clone(whtRpcRows.slice(this.start, this.end + 1)), error: null }
    }).then(onfulfilled, onrejected)
  }
}
const fakeClient = strict({
  from: (table: string) => strict(new Query(table)),
  rpc: (fn: string) => strict(new RpcQuery(fn)),
})

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
let currentPath = '/finance'
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const cache = new Map<string, unknown>()
const mocks: [RegExp, (real: () => Record<string, unknown>) => unknown][] = [
  [/supabase-server$/, () => ({
    createServiceClient: () => fakeClient,
    supabaseServer: fakeClient,
    removeStorageByUrls: async () => assert.fail('removeStorageByUrls ไม่ควรถูกเรียกในสคริปต์นี้'),
  })],
  [/^next\/headers$/, () => ({
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  })],
  [/^next\/cache$/, () => ({ revalidatePath(p: string) { revalidated.push(p) }, revalidateTag() {} })],
  // logActivity ตัวดัก — จดทุกการเรียก ไม่เขียนฐานข้อมูล
  [/lib\/logger$/, () => ({ logActivity: async (...args: unknown[]) => { logged.push(args) } })],
  // redirect / notFound ตัวจริง (ได้ digest ของ Next) · usePathname ตามที่สคริปต์ตั้ง
  [/^next\/navigation$/, real => ({ ...real(), usePathname: () => currentPath })],
  [/lib\/i18n\/context$/, real => ({ ...real(), useLocale: () => ({ locale: 'th', setLocale() {} }) })],
]
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  if (!hit) return realLoad.call(this, request, ...rest)
  const key = hit[0].source
  if (!cache.has(key)) cache.set(key, hit[1](() => realLoad.call(this, request, ...rest) as Record<string, unknown>))
  return cache.get(key)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const { escapeHtml } = require('../lib/escape-html') as typeof import('../lib/escape-html')
const { calcTax } = require('../lib/finance/money') as typeof import('../lib/finance/money')
const settings = require('../app/(authenticated)/finance/settings-actions') as typeof import('../app/(authenticated)/finance/settings-actions')
const DownloadPage = (require('../app/(authenticated)/finance/download/page') as typeof import('../app/(authenticated)/finance/download/page')).default
const OverviewPage = (require('../app/(authenticated)/finance/overview/page') as typeof import('../app/(authenticated)/finance/overview/page')).default
const PayoutsPage = (require('../app/(authenticated)/finance/payouts/page') as typeof import('../app/(authenticated)/finance/payouts/page')).default
const FinanceLayout = (require('../app/(authenticated)/finance/layout') as typeof import('../app/(authenticated)/finance/layout')).default
const NewClaimPage = (require('../app/(authenticated)/finance/new/page') as typeof import('../app/(authenticated)/finance/new/page')).default
const FinanceNav = (require('../app/(authenticated)/finance/finance-nav') as typeof import('../app/(authenticated)/finance/finance-nav')).default
const FinanceDownloadView = (require('../app/(authenticated)/finance/download/finance-download-view') as typeof import('../app/(authenticated)/finance/download/finance-download-view')).default
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
/** พนักงานที่แก้ cookie แบบเก่าให้ดูเหมือนแอดมิน (token ของตัวเองยังอยู่) */
function staffPosingAsAdmin(userId = STAFF) {
  loginAs(userId)
  cookieJar.set('session_role', 'admin')
  cookieJar.set('session_user_id', ADMIN)
}
const logout = () => cookieJar.clear()

const writes = () => ops.filter(o => o.action !== 'select')
const profileSelects = () => ops.filter(o => o.table === 'profiles' && o.action === 'select')
const bankReads = () => profileSelects().filter(o => o.cols.includes('*') || o.cols.some(c => (BANK_COLS as readonly string[]).includes(c)))
const nationalIdReads = () => profileSelects().filter(o => o.cols.includes('*') || o.cols.includes('national_id'))
const claimReads = () => ops.filter(o => o.table === 'expense_claims')
const profileRow = (id: string) => {
  const r = db.profiles.find(p => p.id === id)
  assert.ok(r, `ไม่พบผู้ใช้ ${id}`)
  return r
}
const bankOf = (id: string) => Object.fromEntries(BANK_COLS.map(c => [c, profileRow(id)[c]]))

/** โยน redirect ของ Next ไปที่ target (อ่านจาก digest) */
async function expectRedirect(label: string, run: () => Promise<unknown>, target: string) {
  let thrown: unknown
  try {
    await run()
  } catch (e) {
    thrown = e
  }
  assert.ok(thrown, `${label}: ต้อง redirect (แต่ render ได้)`)
  const digest = String((thrown as { digest?: unknown }).digest ?? '')
  assert.match(digest, /^NEXT_REDIRECT;/, `${label}: ต้องเป็น redirect ของ Next (ได้ ${String(thrown)})`)
  assert.equal(digest.split(';')[2], target, `${label}: redirect ไป ${target} (digest ${digest})`)
}

/** ไฟล์ทั้งหมดใต้โฟลเดอร์ (ข้าม node_modules / .next / .git) */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}
const read = (file: string) => fs.readFileSync(file, 'utf8')
const rel = (file: string) => path.relative(ROOT, file).replace(/\\/g, '/')

// ── ตัวตรวจ HTML หน้าพิมพ์ (P0-A7) ────────────────────────────────────────────
/** ช่องข้อมูลจากใบเบิก/โปรไฟล์ที่ต้องผ่าน escapeHtml เมื่ออยู่ใน `${…}` ของหน้าพิมพ์ */
const DATA_FIELD = /\b(title|full_name|nickname|address|national_id|nationalId|bank_name|bankName|bank_account_number|bankAccount|account_holder_name|accountHolder|claim_number|tax_invoice_numbers|taxNumStr|description|staff_roles|label|name|get\w*Label)\b/

/** ข้ามสตริง '…' / "…" → คืนตำแหน่งเครื่องหมายปิด */
function skipQuote(code: string, i: number): number {
  const q = code[i]
  for (let j = i + 1; j < code.length; j++) {
    if (code[j] === '\\') j++
    else if (code[j] === q) return j
  }
  throw new Error('สตริงไม่ปิด')
}
/** ข้าม template `…` (รวม ${…} ข้างใน) → คืนตำแหน่ง ` ปิด */
function skipTemplate(code: string, i: number): number {
  for (let j = i + 1; j < code.length; j++) {
    if (code[j] === '\\') j++
    else if (code[j] === '`') return j
    else if (code[j] === '$' && code[j + 1] === '{') j = closeBrace(code, j + 2)
  }
  throw new Error('template ไม่ปิด')
}
/** จากตำแหน่งหลัง '{' → ตำแหน่ง '}' ที่ปิดคู่ (ข้ามสตริงและ template) */
function closeBrace(code: string, start: number): number {
  let depth = 0
  for (let i = start; i < code.length; i++) {
    const ch = code[i]
    if (ch === "'" || ch === '"') i = skipQuote(code, i)
    else if (ch === '`') i = skipTemplate(code, i)
    else if (ch === '{') depth++
    else if (ch === '}') {
      if (depth === 0) return i
      depth--
    }
  }
  throw new Error('วงเล็บไม่ปิด')
}
/** ลบเนื้อสตริงและ template ออก (template ข้างในตรวจแยกเป็น `${…}` ของมันเอง) */
function stripLiterals(expr: string): string {
  let out = ''
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i]
    if (ch === "'" || ch === '"') { i = skipQuote(expr, i); out += "''" }
    else if (ch === '`') { i = skipTemplate(expr, i); out += '``' }
    else out += ch
  }
  return out
}
/** ลบ escapeHtml(…) ทั้งก้อน — สิ่งที่อยู่ข้างในปลอดภัยแล้ว */
function stripEscaped(expr: string): string {
  let out = expr
  for (let at = out.indexOf('escapeHtml('); at >= 0; at = out.indexOf('escapeHtml(')) {
    let depth = 0, end = -1
    for (let i = at + 'escapeHtml'.length; i < out.length; i++) {
      if (out[i] === '(') depth++
      else if (out[i] === ')' && --depth === 0) { end = i; break }
    }
    assert.ok(end > 0, 'escapeHtml( ไม่ปิด')
    out = out.slice(0, at) + 'SAFE' + out.slice(end + 1)
  }
  return out
}
/** ทุก `${…}` ในโค้ด (รวมที่ซ้อนอยู่ใน template ข้างใน) ที่อ้างช่องข้อมูลโดยไม่ผ่าน escapeHtml */
function unescapedInterpolations(code: string): string[] {
  const bad: string[] = []
  for (let i = code.indexOf('${'); i >= 0; i = code.indexOf('${', i + 2)) {
    const expr = code.slice(i + 2, closeBrace(code, i + 2))
    if (DATA_FIELD.test(stripEscaped(stripLiterals(expr)))) bad.push(expr.trim())
  }
  return bad
}
/** โค้ดของหน้าพิมพ์: ตั้งแต่ `const downloadPDF` ถึง `document.write(` */
function printRegion(file: string): string {
  const src = read(file)
  const start = src.indexOf('const downloadPDF')
  const end = src.indexOf('document.write(', start)
  assert.ok(start >= 0 && end > start, `${rel(file)}: หาโค้ดหน้าพิมพ์ไม่เจอ`)
  return src.slice(start, end)
}

const pass = (label: string) => console.log(`PASS  ${label}`)

async function main() {
  reset()

  // ══ ตัวจำลองเอง: เมธอดที่ไม่มี throw · นับการอ่าน/เขียน ═══════════════════════════════
  assert.throws(() => (fakeClient.from('profiles') as unknown as { or: (s: string) => unknown }).or('id.eq.x'), /ไม่รองรับ \.or\(\)/)
  assert.throws(() => (fakeClient.from('profiles') as unknown as { upsert: (r: Row) => unknown }).upsert({}), /ไม่รองรับ \.upsert\(\)/)
  assert.throws(() => fakeClient.from('secrets'), /ไม่มีตาราง/)
  await fakeClient.from('profiles').select('id')
  assert.equal(profileSelects().length, 1)
  ops.length = 0
  pass('ตัวจำลอง: เมธอด/ตารางที่ไม่รองรับ throw · นับคำขอได้')

  // ══ P0-A6: escapeHtml ══════════════════════════════════════════════════════
  const img = escapeHtml('<img src=x onerror=alert(1)>')
  assert.ok(!img.includes('<') && !img.includes('>'), img)
  assert.equal(img, '&lt;img src=x onerror=alert(1)&gt;')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
  assert.equal(escapeHtml(12.5), '12.5')
  assert.equal(escapeHtml(0), '0')
  assert.equal(escapeHtml('a & "b" \'c\''), 'a &amp; &quot;b&quot; &#39;c&#39;')
  assert.equal(escapeHtml('<>&"\''), '&lt;&gt;&amp;&quot;&#39;')
  assert.equal(escapeHtml('&amp;'), '&amp;amp;', 'escape ซ้ำต้องเห็นเป็นตัวหนังสือ ไม่ถอดกลับ')
  pass('P0-A6 escapeHtml: <img onerror> ไม่เหลือ < > · null/undefined → \'\' · 12.5 → \'12.5\' · & " \' ถูก escape ทั้งห้าตัว')

  // ══ P0-A1: พนักงานที่แก้ cookie เป็นแอดมิน → ทั้ง 7 ฟังก์ชันเขียนได้ error ไม่มีการเขียน ═══════════
  const writeCalls: [string, () => Promise<{ error?: string }>][] = [
    ['createCategory', () => settings.createCategory({ value: 'venue', label: 'Venue', label_th: 'ค่าสถานที่', color: '#3b82f6' })],
    ['updateCategory', () => settings.updateCategory(CAT_A, { label: 'Renamed' })],
    ['deleteCategory', () => settings.deleteCategory(CAT_B)],
    ['reorderCategories', () => settings.reorderCategories([CAT_B, CAT_A])],
    ['createCategoryItem', () => settings.createCategoryItem({ category_id: CAT_A, label: 'รายการใหม่' })],
    ['updateCategoryItem', () => settings.updateCategoryItem(ITEM_A, { label: 'แก้ชื่อ' })],
    ['deleteCategoryItem', () => settings.deleteCategoryItem(ITEM_A)],
  ]
  const snapshot = () => JSON.stringify([db.finance_categories, db.finance_category_items])
  const identities: [string, () => void][] = [
    ['พนักงาน + cookie session_role=admin, session_user_id=แอดมิน', () => staffPosingAsAdmin()],
    ['ไม่มี token + cookie แบบเก่าของพนักงานแต่ session_role=admin', () => { logout(); cookieJar.set('session_user_id', STAFF); cookieJar.set('session_role', 'admin') }],
    ['token ปลอม (ลายเซ็นผิด) ของแอดมิน + cookie แอดมิน', () => { logout(); cookieJar.set('session_token', `${ADMIN}:${Date.now()}:${'0'.repeat(64)}`); cookieJar.set('session_role', 'admin'); cookieJar.set('session_user_id', ADMIN) }],
    ['ไม่ล็อกอิน', () => logout()],
  ]
  for (const [who, setup] of identities) {
    const before = snapshot()
    for (const [name, call] of writeCalls) {
      setup()
      const res = await call()
      assert.deepEqual(res, { error: 'เฉพาะแอดมินเท่านั้น' }, `${who} → ${name}`)
    }
    assert.equal(writes().length, 0, `${who}: ต้องไม่มีการเขียนเลย (ได้ ${JSON.stringify(writes())})`)
    assert.equal(snapshot(), before)
    assert.equal(revalidated.length, 0)
  }
  // ตัวเทียบ: แอดมินจริงเขียนได้ทั้ง 7 → ตัวนับการเขียนใช้งานได้จริง
  for (const [name, call] of writeCalls) {
    loginAs(ADMIN)
    const res = await call()
    assert.deepEqual(res, { success: true }, `แอดมิน → ${name}`)
  }
  assert.ok(writes().length >= 7, 'แอดมินต้องเขียนได้')
  assert.ok(revalidated.includes('/settings') && !revalidated.includes('/finance/settings'), 'revalidate /settings ไม่ใช่ /finance/settings')
  pass('P0-A1 พนักงาน+cookie แอดมิน / cookie แบบเก่า / token ปลอม / ไม่ล็อกอิน → ทั้ง 7 ฟังก์ชันได้ { error: "เฉพาะแอดมินเท่านั้น" } เขียน 0 ครั้ง · แอดมินจริงเขียนได้ครบ · revalidate /settings')

  // ══ P0-A2: ไม่มี token → อ่านไม่ได้ ไม่แตะคอลัมน์ธนาคาร ═════════════════════════════
  reset()
  for (const [who, setup] of [
    ['ไม่ล็อกอิน', () => logout()],
    ['token ปลอม', () => { logout(); cookieJar.set('session_token', `${STAFF}:${Date.now()}:${'f'.repeat(64)}`); cookieJar.set('session_user_id', STAFF) }],
  ] as const) {
    setup()
    assert.deepEqual(await settings.getFinanceCategories(), [], `${who}: getFinanceCategories`)
    assert.deepEqual(await settings.getFinanceCategories(false), [], `${who}: getFinanceCategories(false)`)
    assert.deepEqual(await settings.getAllCategoryItems(), [], `${who}: getAllCategoryItems`)
    assert.deepEqual(await settings.getStaffProfiles(), [], `${who}: getStaffProfiles`)
    const bank = await settings.getStaffBankDetails(STAFF2)
    assert.ok('error' in bank && typeof bank.error === 'string' && bank.error.length > 0, `${who}: getStaffBankDetails ต้องได้ error`)
    assert.equal(bankReads().length, 0, `${who}: ต้องไม่อ่านคอลัมน์ธนาคาร`)
    assert.equal(ops.filter(o => o.table !== 'profiles').length, 0, `${who}: ต้องไม่อ่านตารางอื่น`)
    assert.equal(logged.length, 0)
  }
  pass('P0-A2 ไม่มี token / token ปลอม → getFinanceCategories, getAllCategoryItems, getStaffProfiles = [] · getStaffBankDetails = { error } · อ่านคอลัมน์ธนาคาร 0 ครั้ง')

  // ══ P0-A3: getStaffProfiles ตามบทบาท ══════════════════════════════════════════
  reset()
  staffPosingAsAdmin()
  const forStaff = await settings.getStaffProfiles()
  assert.deepEqual(forStaff.map(p => p.id).sort(), db.profiles.map(p => String(p.id)).sort(), 'พนักงานเห็นชื่อทุกคน')
  for (const p of forStaff) {
    assert.equal(p.full_name, profileRow(p.id).full_name)
    if (p.id === STAFF) assert.deepEqual(Object.fromEntries(BANK_COLS.map(c => [c, p[c]])), bankOf(STAFF), 'แถวของตัวเองมีบัญชี')
    else for (const c of BANK_COLS) assert.equal(p[c], null, `แถวของ ${p.id}: ${c} ต้องเป็น null`)
  }
  // ไม่ดึงคอลัมน์ธนาคารของคนอื่นขึ้นมาจากฐานข้อมูลเลย
  assert.ok(bankReads().length >= 1)
  for (const o of bankReads()) assert.deepEqual(o.filters, [`eq:id=${STAFF}`], `อ่านคอลัมน์ธนาคารได้เฉพาะแถวของตัวเอง (ได้ ${JSON.stringify(o)})`)
  ops.length = 0
  loginAs(ADMIN)
  const forAdmin = await settings.getStaffProfiles()
  assert.equal(forAdmin.length, db.profiles.length)
  for (const p of forAdmin) assert.deepEqual(Object.fromEntries(BANK_COLS.map(c => [c, p[c]])), bankOf(p.id), `แอดมินเห็นบัญชีของ ${p.id}`)
  assert.equal(logged.length, 0)
  pass(`P0-A3 พนักงาน (แม้แก้ cookie เป็นแอดมิน) เห็นชื่อทั้ง ${forStaff.length} คน บัญชีธนาคารเฉพาะแถวตัวเอง (ฐานข้อมูลอ่านคอลัมน์ธนาคารเฉพาะ id ตัวเอง) · แอดมินเห็นบัญชีทุกคน`)

  // ══ P0-A4: getStaffBankDetails ═════════════════════════════════════════════
  reset()
  loginAs(STAFF)
  const other = await settings.getStaffBankDetails(STAFF2)
  assert.deepEqual(other, bankOf(STAFF2), 'ได้บัญชีของคนที่ขอ')
  assert.equal(logged.length, 1, 'ดูบัญชีคนอื่นต้องลงประวัติหนึ่งครั้ง')
  assert.equal(logged[0][0], 'VIEW_STAFF_BANK_DETAILS')
  assert.deepEqual(logged[0][1], { profileId: STAFF2 })
  const own = await settings.getStaffBankDetails(STAFF)
  assert.deepEqual(own, bankOf(STAFF))
  assert.equal(logged.length, 1, 'ดูบัญชีของตัวเองไม่ลงประวัติ')
  const none = await settings.getStaffBankDetails(NO_BANK)
  assert.deepEqual(none, { bank_name: null, bank_account_number: null, account_holder_name: null }, 'คนที่ยังไม่กรอกบัญชี = null ทั้งสามช่อง')
  assert.equal(logged.length, 2)
  const missing = await settings.getStaffBankDetails(MISSING)
  assert.ok('error' in missing, 'id ที่ไม่มีในระบบ → error')
  assert.equal(logged.length, 2, 'ไม่พบ = ไม่ลงประวัติ')
  const opsBefore = ops.length
  for (const bad of ['abc', `${STAFF2}' or 1=1`, `${STAFF2} `, '', 42, null, undefined, [STAFF2], { id: STAFF2 }]) {
    const res = await settings.getStaffBankDetails(bad as unknown as string)
    assert.ok('error' in res && res.error.length > 0, `id ${JSON.stringify(bad)} → error`)
  }
  assert.equal(ops.length, opsBefore, 'id ที่ไม่ใช่ UUID → ไม่เรียกฐานข้อมูลเลย (รวมการตรวจตัวตน)')
  assert.equal(logged.length, 2)
  pass('P0-A4 getStaffBankDetails(คนอื่น) ได้สามช่อง + ลง VIEW_STAFF_BANK_DETAILS { profileId } หนึ่งครั้ง · ของตัวเองไม่ลง · ไม่ใช่ UUID → { error } ไม่เรียกฐานข้อมูล')

  // ══ P0-A5: ไม่มี mass assignment ════════════════════════════════════════════
  reset()
  loginAs(ADMIN)
  const extra = { id: 'x', created_at: '2020-01-01T00:00:00Z', is_admin: true, name: 'ok' }
  const lastWrite = () => writes().at(-1)
  // เฉพาะคีย์แปลก → ไม่มีคอลัมน์ที่อนุญาตเหลือ = error ไม่เขียน
  let res: { error?: string; success?: boolean } = await settings.updateCategory(CAT_A, extra as never)
  assert.ok(res.error, 'ไม่มีคอลัมน์ที่อนุญาต → error')
  res = await settings.updateCategoryItem(ITEM_A, extra as never)
  assert.ok(res.error)
  assert.equal(writes().length, 0)
  // คีย์แปลก + คอลัมน์ที่อนุญาต → เขียนเฉพาะคอลัมน์ที่อนุญาต (ตัดช่องว่าง)
  res = await settings.updateCategory(CAT_A, { ...extra, label: '  ok  ', sort_order: 99, value: 'hijack', icon: 'X' } as never)
  assert.deepEqual(res, { success: true })
  assert.deepEqual(lastWrite(), { table: 'finance_categories', action: 'update', cols: [], filters: [`eq:id=${CAT_A}`], payload: { label: 'ok' } })
  res = await settings.updateCategory(CAT_A, { ...extra, is_active: false, color: '#ABCDEF', detail_source: 'custom', label_th: 'ใหม่' } as never)
  assert.deepEqual(lastWrite()?.payload, { label_th: 'ใหม่', color: '#ABCDEF', is_active: false, detail_source: 'custom' })
  res = await settings.updateCategoryItem(ITEM_A, { ...extra, label: 'ok', category_id: CAT_B, sort_order: 1 } as never)
  assert.deepEqual(res, { success: true })
  assert.deepEqual(lastWrite()?.payload, { label: 'ok' })
  res = await settings.createCategory({ value: 'venue', label: 'Venue', label_th: 'ค่าสถานที่', color: '#3b82f6', ...extra, sort_order: -5, is_active: false } as never)
  assert.deepEqual(res, { success: true })
  assert.deepEqual(lastWrite()?.payload, { value: 'venue', label: 'Venue', label_th: 'ค่าสถานที่', color: '#3b82f6', detail_source: 'none', sort_order: 3 })
  res = await settings.createCategoryItem({ category_id: CAT_A, label: ' รายการ ', ...extra, is_active: false, sort_order: -1 } as never)
  assert.deepEqual(res, { success: true })
  assert.deepEqual(lastWrite()?.payload, { category_id: CAT_A, label: 'รายการ', sort_order: 2 })
  // ค่าผิดชนิด / ยาวเกิน / id ไม่ใช่ UUID → error ไม่เขียน
  const writesBefore = writes().length
  const rejected: [string, () => Promise<{ error?: string }>][] = [
    ['is_active เป็นสตริง', () => settings.updateCategory(CAT_A, { is_active: 'true' } as never)],
    ['label ยาวเกิน', () => settings.updateCategory(CAT_A, { label: 'x'.repeat(101) })],
    ['ชื่อไทยว่าง', () => settings.updateCategory(CAT_A, { label_th: '   ' })],
    ['สีไม่ใช่ hex', () => settings.updateCategory(CAT_A, { color: 'red;background:url(x)' })],
    ['detail_source แปลก', () => settings.updateCategory(CAT_A, { detail_source: 'sql' })],
    ['id ไม่ใช่ UUID', () => settings.updateCategory('not-a-uuid', { label: 'ok' })],
    ['data ไม่ใช่ object', () => settings.updateCategory(CAT_A, 'label' as never)],
    ['item label เป็นตัวเลข', () => settings.updateCategoryItem(ITEM_A, { label: 5 } as never)],
    ['item id ไม่ใช่ UUID', () => settings.deleteCategoryItem("1' or 1=1")],
    ['ลบหมวด id ผิด', () => settings.deleteCategory('x')],
    ['สร้างหมวดไม่มีชื่อไทย', () => settings.createCategory({ value: 'a', label: 'A', color: '#fff' } as never)],
    ['สร้างรายการ category_id ผิด', () => settings.createCategoryItem({ category_id: 'x', label: 'ok' })],
    ['เรียงใหม่ id ผิด', () => settings.reorderCategories(['x'])],
    ['เรียงใหม่ id ซ้ำ', () => settings.reorderCategories([CAT_A, CAT_A])],
    ['เรียงใหม่ไม่ใช่ array', () => settings.reorderCategories(CAT_A as never)],
  ]
  for (const [label, call] of rejected) {
    const r = await call()
    assert.ok(typeof r.error === 'string' && r.error.length > 0, `${label} → error`)
  }
  assert.equal(writes().length, writesBefore, 'ค่าที่ผิด → ไม่เขียน')
  // ชื่อภาษาอังกฤษเป็นช่องไม่บังคับ: ว่างได้ (หน้าจอใช้ชื่อไทยแทน) — หมวดเดิมที่ไม่มีชื่ออังกฤษต้องแก้ไขต่อได้
  assert.deepEqual(await settings.updateCategory(CAT_A, { label: '', label_th: 'ค่าเดินทาง' }), { success: true })
  pass('P0-A5 คีย์ id / created_at / is_admin / name / sort_order / value ถูกทิ้ง — เขียนเฉพาะคอลัมน์ที่อนุญาต (ตรวจจากสิ่งที่ตัวจำลองได้รับ) · ค่าผิดชนิด/ยาวเกิน/id ไม่ใช่ UUID → error ไม่เขียน')

  // ══ P0-A7: หน้าพิมพ์ escape ทุกค่าที่มาจากข้อมูล ══════════════════════════════════════
  // ตัวตรวจต้องจับของที่ไม่ escape ได้จริง (รูปแบบเดียวกับโค้ดเดิมก่อนแก้)
  const unsafeSample = [
    'html += `<td>${p.name}</td><td>${p.nationalId}</td>`',
    'html += `<td>${c.title || \'\'}</td><td>${c.submitter?.full_name || \'\'}</td>`',
    'html += `${taxNumStr ? ` <span>${taxNumStr}</span>` : \'\'}`',
    'html += `<td>${escapeHtml(p.name)} ${p.bankAccount}</td>`',
    'html += `<td>${getClaimStatusLabel(c.status, \'th\')}</td><td>${(c.staff_roles || []).map(r => r.label).join(\', \')}</td>`',
  ].join('\n')
  const caught = unescapedInterpolations(unsafeSample)
  for (const want of ['p.name', 'p.nationalId', "c.title || ''", "c.submitter?.full_name || ''", 'taxNumStr', 'getClaimStatusLabel', 'staff_roles']) {
    assert.ok(caught.some(e => e.includes(want)), `ตัวตรวจต้องจับ ${want} (จับได้ ${JSON.stringify(caught)})`)
  }
  assert.deepEqual(unescapedInterpolations('html += `<td>${escapeHtml(p.name)}</td><td>${i + 1}</td><td>${isEn ? \'Title\' : \'หัวข้อ\'}</td>`'), [])
  for (const [file, minEscapes] of [
    [path.join(FINANCE, 'overview', 'overview-dashboard.tsx'), 20],
    [path.join(FINANCE, 'download', 'finance-download-view.tsx'), 12],
  ] as const) {
    const region = printRegion(file)
    const bad = unescapedInterpolations(region)
    assert.deepEqual(bad, [], `${rel(file)}: ค่าที่ยังไม่ผ่าน escapeHtml ${JSON.stringify(bad)}`)
    const count = region.split('escapeHtml(').length - 1
    assert.ok(count >= minEscapes, `${rel(file)}: escapeHtml( ในหน้าพิมพ์ ${count} จุด (คาดอย่างน้อย ${minEscapes})`)
    assert.match(read(file), /import \{ escapeHtml \} from '@\/lib\/escape-html'/)
  }
  pass('P0-A7 หน้าพิมพ์ของ overview-dashboard.tsx และ finance-download-view.tsx: ทุก ${…} ที่อ้างหัวข้อ/ชื่อ/ชื่อเล่น/ที่อยู่/เลขบัตร/ธนาคาร/บัญชี/เลขที่/เลขใบกำกับ/หมวด/หน้าที่ อยู่ใน escapeHtml( (ตัวตรวจจับตัวอย่างที่ไม่ escape ได้)')

  // ══ P0-A8: หน้าของแอดมิน → พนักงานถูกส่งกลับ /finance ก่อนอ่านใบเบิก ═════════════════════
  reset()
  for (const [name, page] of [['download', DownloadPage], ['overview', OverviewPage], ['payouts', PayoutsPage]] as const) {
    staffPosingAsAdmin()
    await expectRedirect(`พนักงาน → /finance/${name}`, () => page(), '/finance')
    logout()
    await expectRedirect(`ไม่ล็อกอิน → /finance/${name}`, () => page(), '/login')
  }
  assert.equal(claimReads().length, 0, 'ต้องไม่อ่าน expense_claims')
  assert.equal(nationalIdReads().length, 0, 'ต้องไม่อ่าน national_id')
  assert.equal(ops.filter(o => o.table !== 'profiles').length, 0, 'อ่านได้แค่ profiles เพื่อตรวจตัวตน')
  pass('P0-A8 download / overview / payouts: พนักงาน (แม้แก้ cookie เป็นแอดมิน) → NEXT_REDIRECT ไป /finance · ไม่ล็อกอิน → /login · อ่าน expense_claims 0 ครั้ง อ่าน national_id 0 ครั้ง')

  // ══ P0-A9: หน้าดาวน์โหลดของแอดมินส่งเฉพาะยอดหัก ณ ที่จ่าย และโปรไฟล์ของคนที่มียอดเท่านั้น ═══════════════
  // (ขั้น 3: หน้าได้ยอดรวมต่อ (ผู้เบิก, สถานะ, เดือน) = cells แทนแถวใบเบิก — ทั้งทางฟังก์ชันในฐานข้อมูลและทางสำรอง)
  reset()
  const wantClaims = db.expense_claims.filter(c => Number(c.withholding_tax_rate) > 0)
  const wantPeople = [...new Set(wantClaims.map(c => String(c.submitted_by)))].sort()
  // ยอดที่คาดต่อกลุ่ม คิดจากแถวใบเบิกในไฟล์นี้ด้วยสูตรกลาง (lib/finance/money.ts) · บัญชี = ใบใหม่สุดที่กรอกไว้
  const expectedCells = new Map<string, Row>()
  for (const c of [...wantClaims].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))) {
    const key = `${String(c.submitted_by)}|${String(c.status)}|${String(c.expense_date).slice(0, 7)}`
    const cell = expectedCells.get(key) ?? { submitted_by: c.submitted_by, status: c.status, month: String(c.expense_date).slice(0, 7), n: 0, gross: 0, wht: 0, net: 0 }
    const tax = calcTax(Number(c.amount) || 0, String(c.vat_mode || 'none'), Number(c.withholding_tax_rate) || 0)
    cell.n = Number(cell.n) + 1
    cell.gross = Number(cell.gross) + Number(c.amount)
    cell.wht = Number(cell.wht) + tax.whtAmount
    cell.net = Number(cell.net) + tax.netPayable
    for (const col of BANK_COLS) if (!cell[col] && c[col]) { cell[col] = c[col]; cell[`${col}_at`] = c.created_at }
    expectedCells.set(key, cell)
  }
  const cellKey = (c: Row) => `${String(c.submitted_by)}|${String(c.status)}|${String(c.month)}`
  const checkDownload = async (label: string) => {
    ops.length = 0
    loginAs(ADMIN)
    const el = await DownloadPage() as ReactElement<import('react').ComponentProps<typeof FinanceDownloadView>>
    assert.ok(isValidElement(el) && el.type === FinanceDownloadView, `${label}: ต้องคืน <FinanceDownloadView>`)
    assert.ok(!('claims' in el.props), `${label}: ต้องไม่ส่งแถวใบเบิก (claims)`)
    const { cells, people, profileMap } = el.props
    // เฉพาะยอดของใบที่มีหัก ณ ที่จ่าย — ครบทุกใบ ไม่มีใบอื่น ไม่มีช่องอื่นของใบเบิก (หัวข้อ/ไฟล์/หมายเหตุ/เลขบัตร/ที่อยู่)
    assert.deepEqual(cells.map(cellKey).sort(), [...expectedCells.keys()].sort(), `${label}: กลุ่มยอดตรงกับใบที่ withholding_tax_rate > 0`)
    assert.equal(cells.reduce((s, c) => s + c.n, 0), wantClaims.length, `${label}: นับใบครบเฉพาะใบหัก ณ ที่จ่าย`)
    for (const c of cells) {
      const want = expectedCells.get(cellKey(c as unknown as Row)) as Row
      for (const k of ['n', 'gross', 'wht', 'net'] as const) assert.ok(Math.abs(Number(c[k]) - Number(want[k])) < 0.005, `${label}: ${cellKey(c as unknown as Row)}.${k} ได้ ${c[k]} คาด ${String(want[k])}`)
      for (const col of BANK_COLS) assert.equal(c[col] ?? null, want[col] ?? null, `${label}: ${cellKey(c as unknown as Row)}.${col}`)
      const keys = Object.keys(c)
      assert.ok(!keys.some(k => ['receipt_urls', 'notes', 'title', 'national_id', 'address', 'id'].includes(k)), `${label}: ส่งเฉพาะช่องที่หน้าใช้ (ได้ ${keys.join(', ')})`)
    }
    assert.deepEqual(people.map(p => p.id).sort(), wantPeople, `${label}: รายชื่อเฉพาะผู้เบิกที่มียอด`)
    for (const p of people) assert.equal(p.name, profileRow(p.id).full_name)
    assert.deepEqual(Object.keys(profileMap ?? {}).sort(), wantPeople, `${label}: profileMap เฉพาะผู้เบิกที่มียอด`)
    assert.ok(!(STAFF3 in (profileMap ?? {})) && !(NO_BANK in (profileMap ?? {})), `${label}: คนที่ไม่มีใบหัก ณ ที่จ่ายต้องไม่อยู่`)
    for (const id of wantPeople) {
      const p = profileRow(id)
      assert.deepEqual(profileMap?.[id], { nickname: p.nickname, national_id: p.national_id, address: p.address })
    }
    assert.equal(nationalIdReads().length, 1, `${label}: อ่าน national_id ครั้งเดียว`)
    assert.equal(nationalIdReads()[0].filters.length, 1)
    assert.match(nationalIdReads()[0].filters[0], /^in:id=/, `${label}: อ่านโปรไฟล์แบบกรอง id ของผู้เบิก`)
    assert.deepEqual(nationalIdReads()[0].filters[0].slice('in:id='.length).split('|').sort(), wantPeople)
    return cells.length
  }
  // ก) ฐานข้อมูลยังไม่มี finance_wht_cells (PGRST202) → รวมยอดในระบบจากใบหัก ณ ที่จ่ายเท่านั้น + เตือนชื่อไฟล์ SQL ครั้งเดียว
  const warned: string[] = []
  const realWarn = console.warn
  console.warn = (...args: unknown[]) => { warned.push(args.map(String).join(' ')) }
  let fallbackCells: number
  try {
    whtRpcRows = null
    fallbackCells = await checkDownload('ทางสำรอง')
    assert.ok(claimReads().length > 0 && claimReads().every(o => o.filters.includes('gt:withholding_tax_rate=0')), 'ทางสำรองอ่านเฉพาะใบที่ withholding_tax_rate > 0')
    await checkDownload('ทางสำรอง (ครั้งที่สอง)')
  } finally {
    console.warn = realWarn
  }
  assert.equal(warned.filter(w => w.includes('20261001_finance_speed.sql')).length, 1, 'เตือนให้รัน 20261001_finance_speed.sql ครั้งเดียว')
  // ข) มีฟังก์ชันแล้ว → ใช้ยอดจากฐานข้อมูล ไม่อ่านแถวใบเบิกเลย
  whtRpcRows = [...expectedCells.values()].sort((a, b) => cellKey(a).localeCompare(cellKey(b)))
  rpcCalls.length = 0
  const rpcCells = await checkDownload('ฟังก์ชันในฐานข้อมูล')
  assert.deepEqual(rpcCalls, ['finance_wht_cells'])
  assert.equal(claimReads().length, 0, 'ทางฟังก์ชันต้องไม่อ่านแถว expense_claims')
  whtRpcRows = null
  pass(`P0-A9 แอดมิน: ส่งยอดหัก ณ ที่จ่าย ${fallbackCells} กลุ่ม (${wantClaims.length}/${db.expense_claims.length} ใบ — เฉพาะหัก ณ ที่จ่าย ไม่มีแถวใบเบิก) ทั้งทางสำรองและทางฟังก์ชัน (${rpcCells} กลุ่ม ไม่อ่านแถวใบเบิก) · profileMap ${wantPeople.length} คนจาก ${db.profiles.length} (เฉพาะผู้เบิกที่มียอด · อ่าน national_id ครั้งเดียวด้วย in(id)) · ทางสำรองเตือนครั้งเดียว`)

  // ══ P0-A10: ไม่มีไฟล์ใต้ finance อ่าน cookie บทบาท/ผู้ใช้แบบเก่า (ไม่มีข้อยกเว้นตั้งแต่ v1.24.2) ═════
  const allowed = new Set<string>()
  const cookieNames = /['"`]session_(role|user_id)['"`]/
  const offenders = walk(FINANCE).filter(f => /\.(ts|tsx)$/.test(f) && !allowed.has(f) && cookieNames.test(read(f)))
  assert.deepEqual(offenders.map(rel), [], 'ไฟล์ที่ยังอ่าน session_role / session_user_id')
  assert.ok(cookieNames.test("get('session_user_id')"), 'ตัวตรวจต้องจับรูปแบบนี้ได้')
  // ตรวจการทำงานจริงด้วย: layout ให้แท็บตามบทบาทจากฐานข้อมูล ไม่ใช่ cookie
  staffPosingAsAdmin()
  const layout = await FinanceLayout({ children: null }) as ReactElement<{ children: ReactElement<{ role: string }>[] }>
  const navEl = layout.props.children.find(c => isValidElement(c) && c.type === FinanceNav)
  assert.equal(navEl?.props.role, 'staff', 'layout: พนักงานที่แก้ cookie ยังได้แท็บของพนักงาน')
  loginAs(ADMIN)
  const adminLayout = await FinanceLayout({ children: null }) as ReactElement<{ children: ReactElement<{ role: string }>[] }>
  assert.equal(adminLayout.props.children.find(c => isValidElement(c) && c.type === FinanceNav)?.props.role, 'admin')
  logout()
  await expectRedirect('ไม่ล็อกอิน → layout', () => FinanceLayout({ children: null }), '/login')
  pass('P0-A10 ไม่มีไฟล์ใต้ app/(authenticated)/finance อ่าน \'session_role\' / \'session_user_id\' นอกจาก actions.ts, viewer.ts · layout ให้ role จากฐานข้อมูล (พนักงาน+cookie แอดมิน = staff) · ไม่ล็อกอิน → /login')

  // ── หน้าสร้างใบเบิก: isAdmin จากการล็อกอินที่ยืนยันแล้ว + รายชื่อไม่มีบัญชีคนอื่น (S3) ─────────
  reset()
  staffPosingAsAdmin()
  const form = await NewClaimPage() as ReactElement<{ isAdmin: boolean; staffProfiles: import('../app/(authenticated)/finance/settings-actions').StaffProfile[] }>
  assert.equal(form.props.isAdmin, false)
  assert.ok(form.props.staffProfiles.filter(p => p.id !== STAFF).every(p => BANK_COLS.every(c => p[c] === null)), 'หน้าสร้างใบเบิกของพนักงาน: ไม่มีบัญชีของคนอื่น')
  loginAs(ADMIN)
  const adminForm = await NewClaimPage() as typeof form
  assert.equal(adminForm.props.isAdmin, true)
  assert.ok(adminForm.props.staffProfiles.filter(p => p.id !== ADMIN && p.id !== NO_BANK).every(p => p.bank_account_number), 'แอดมินได้บัญชีทุกคน')
  pass('S3 /finance/new: พนักงาน (แม้แก้ cookie) ได้ isAdmin=false และรายชื่อที่ไม่มีบัญชีของคนอื่น · แอดมินได้ isAdmin=true และบัญชีทุกคน')

  // ══ P0-A11: แท็บตามบทบาท มีชื่อทุกจอ aria-current ═════════════════════════════════
  const STAFF_TABS = ['/finance', '/finance/petty-cash', '/finance/archive', '/finance/new']
  const ALL_TABS = ['/finance', '/finance/overview', '/finance/payouts', '/finance/petty-cash', '/finance/archive', '/finance/download', '/finance/new']
  const LABELS: Record<string, string> = {
    '/finance': 'ใบเบิก', '/finance/overview': 'รายงานตรวจสอบ', '/finance/payouts': 'สรุปยอดจ่าย', '/finance/petty-cash': 'เงินสดย่อย',
    '/finance/archive': 'คลังเก็บ', '/finance/download': 'หัก ณ ที่จ่าย', '/finance/new': 'สร้างใบเบิก',
  }
  const tabs = (html: string) => [...html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(m => ({
    href: /href="([^"]*)"/.exec(m[1])?.[1] ?? '', attrs: m[1], inner: m[2],
  }))
  for (const [role, want] of [['staff', STAFF_TABS], ['admin', ALL_TABS], ['manager', STAFF_TABS]] as const) {
    for (const at of want) {
      currentPath = at === '/finance' ? '/finance' : `${at}/x`
      const html = renderToStaticMarkup(createElement(FinanceNav, { role }))
      const found = tabs(html)
      assert.deepEqual(found.map(t => t.href), want, `${role}: แท็บ`)
      const active = found.filter(t => /aria-current="page"/.test(t.attrs))
      assert.deepEqual(active.map(t => t.href), [at], `${role} ที่ ${currentPath}: aria-current เฉพาะแท็บ ${at}`)
      for (const t of found) {
        assert.ok(t.inner.includes(`<span>${LABELS[t.href]}</span>`), `${role}: แท็บ ${t.href} ต้องมีชื่อ "${LABELS[t.href]}" ที่ไม่ถูกซ่อน (ได้ ${t.inner})`)
      }
      assert.ok(!/\bhidden\b[^"]*"[^>]*>(ใบเบิก|เงินสดย่อย|คลังเก็บ|สร้างใบเบิก)</.test(html), 'ชื่อแท็บต้องไม่มี class hidden')
      assert.match(html, /<nav[^>]*class="[^"]*overflow-x-auto[^"]*"/, 'แถวแท็บเลื่อนแนวนอน')
      assert.match(html, /<nav[^>]*class="[^"]*flex-nowrap[^"]*"/, 'แถวแท็บไม่ขึ้นบรรทัดใหม่')
      assert.match(html, /<nav[^>]*class="[^"]*min-w-0[^"]*"/, 'แถวแท็บหดได้ (ไม่ดันหน้าให้กว้างเกินจอ)')
    }
  }
  const navSource = read(path.join(FINANCE, 'finance-nav.tsx'))
  assert.ok(!/\bxs:/.test(navSource), 'ต้องไม่มี class xs: (ไม่มี breakpoint นี้ใน Tailwind)')
  pass('P0-A11 finance-nav: staff (และบทบาทอื่นที่ไม่ใช่ admin) = 4 แท็บ ใบเบิก/เงินสดย่อย/คลังเก็บ/สร้างใบเบิก · admin = 7 แท็บ · ทุกแท็บมีชื่อไม่ซ่อน · แท็บที่เปิดอยู่ aria-current="page" · ไม่มี xs: · แถวเดียวเลื่อนแนวนอน')

  // ══ P0-A12: หน้า pdf-preview ถูกลบ ไม่มีลิงก์ ═══════════════════════════════════════
  const devPage = 'pdf-' + 'preview' // ประกอบสตริง — สคริปต์นี้เองต้องไม่มีข้อความที่ตรวจหา
  assert.ok(!fs.existsSync(path.join(FINANCE, devPage)), 'โฟลเดอร์ต้องไม่มีแล้ว')
  const sourceFiles = walk(ROOT).filter(f => /\.(ts|tsx|js|jsx|mjs|cjs|json)$/.test(f) && !rel(f).startsWith('docs/'))
  const linking = sourceFiles.filter(f => read(f).includes(`/finance/${devPage}`))
  assert.deepEqual(linking.map(rel), [], 'ไฟล์ที่ยังอ้างหน้า dev')
  pass(`P0-A12 app/(authenticated)/finance/${devPage} ไม่มีแล้ว · ไฟล์โค้ด ${sourceFiles.length} ไฟล์ไม่มีไฟล์ไหนอ้าง /finance/${devPage}`)

  // ══ P0-A13: วันที่เริ่มต้นตามเวลาไทย ══════════════════════════════════════════════
  for (const file of [path.join(FINANCE, 'new', 'create-claim-form.tsx'), path.join(FINANCE, 'new', 'page.tsx')]) {
    const src = read(file)
    assert.ok(!/toISOString\(\)\s*\.split\(\s*['"]T['"]\s*\)\s*\[\s*0\s*\]/.test(src), `${rel(file)}: toISOString().split('T')[0]`)
    assert.ok(!/toISOString\(\)\s*\.slice\(\s*0\s*,\s*10\s*\)/.test(src), `${rel(file)}: toISOString().slice(0, 10)`)
  }
  assert.match(read(path.join(FINANCE, 'new', 'create-claim-form.tsx')), /defaultValue=\{thaiTodayIso\(\)\}/)
  pass('P0-A13 create-claim-form.tsx และ new/page.tsx ไม่มี toISOString().split(\'T\')[0] / .slice(0, 10) · วันที่เริ่มต้นใช้ thaiTodayIso()')

  console.log('\nfinance-access: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
