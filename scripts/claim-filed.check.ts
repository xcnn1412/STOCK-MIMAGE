// เครื่องหมาย "เข้าแฟ้มแล้ว" (/finance) — รัน markClaimsFiled / unmarkClaimFiled / getClaims ตัวจริง
// กับฐานข้อมูลจำลองในหน่วยความจำ สองโหมด: มีคอลัมน์เข้าแฟ้ม และยังไม่รัน 20260929_claim_filed.sql
// Run:  npx tsx scripts/claim-filed.check.ts
//
// ไม่แตะฐานข้อมูลจริง ไม่ต้องมี env: แทน next/headers, next/cache และ @/lib/supabase-server ด้วยตัวจำลอง
// (เทคนิคเดียวกับ scripts/finance-claims-load.check.ts) · logActivity ตัวจริงเขียนลง activity_logs จำลอง
// ผู้ใช้และใบเบิกสังเคราะห์ทั้งหมด · ครอบคลุม AC13, AC14 ของ docs/specs/claim-document-bundle.md
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-filed: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'

process.env.SESSION_SECRET = 'claim-filed-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

// ── ผู้ใช้และใบเบิก (สังเคราะห์) ───────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF = uid(2)
const CLAIM_A = uid(101), CLAIM_B = uid(102), CLAIM_C = uid(103), CLAIM_D = uid(104)
const MISSING = uid(199)
const FILE = (name: string) => `https://fake.supabase.test/storage/v1/object/public/receipts/${name}.jpg`
const FILED_COLUMNS = ['filed_at', 'filed_by', 'filed_file_count'] as const

const person = (id: string, full_name: string, role: string): Row =>
  ({ id, full_name, nickname: null, role, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

/** จำนวนไฟล์แนบที่คาด (นับเองจากข้อมูลทดสอบ ไม่เรียกโค้ดจริง) */
const EXPECTED_FILES: Record<string, number> = { [CLAIM_A]: 3, [CLAIM_B]: 0, [CLAIM_C]: 4, [CLAIM_D]: 3 }

function claimRows(withFiledColumns: boolean): Row[] {
  const base = (id: string, n: number, over: Row): Row => ({
    id, claim_number: `EXP-TEST-${String(n).padStart(3, '0')}`, claim_type: 'event', title: `ใบทดสอบ ${n}`,
    category: 'travel', amount: 100 * n, status: 'paid', submitted_by: STAFF, expense_date: '2026-09-01',
    paid_at: '2026-09-02T03:00:00+00:00', created_at: `2026-09-0${n}T03:00:00+00:00`,
    receipt_urls: [], actual_receipt_urls: null, tax_invoice_urls: null, tax_invoice_numbers: null, refund_slip_urls: null,
    deleted_at: null, status_changed_at: null,
    ...(withFiledColumns ? { filed_at: null, filed_by: null, filed_file_count: null } : {}),
    ...over,
  })
  return [
    // 2 ใบเสร็จ + ใบกำกับ 1 ไฟล์ ('' = ใบกำกับที่มีแต่เลขที่ ไม่นับ) = 3
    base(CLAIM_A, 1, { receipt_urls: [FILE('a1'), FILE('a2')], tax_invoice_urls: [FILE('a3'), ''], tax_invoice_numbers: ['IV-1', 'IV-2'] }),
    // ไม่มีไฟล์เลย (ทุกช่อง null) = 0
    base(CLAIM_B, 2, { receipt_urls: null }),
    // ใบเสร็จ 1 + ใบเสร็จตอนเคลียร์ 2 + สลิปคืนเงิน 1 = 4
    base(CLAIM_C, 3, { claim_type: 'advance', receipt_urls: [FILE('c1')], actual_receipt_urls: [FILE('c2'), FILE('c3')], refund_slip_urls: [FILE('c4')] }),
    // 3 ใบเสร็จ = 3 (จำนวนเดียวกับ A — ต้องอยู่ในการอัปเดตครั้งเดียวกัน)
    base(CLAIM_D, 4, { submitted_by: ADMIN, receipt_urls: [FILE('d1'), FILE('d2'), FILE('d3')] }),
  ]
}

const db: Record<string, Row[]> = { profiles: [], expense_claims: [], activity_logs: [] }
/** ตาราง → คอลัมน์ที่มีจริง (คำขอที่อ้างคอลัมน์อื่นได้ error แบบ PostgREST) */
const schema = new Map<string, Set<string>>()
/** error ที่ PostgREST คืนเมื่อ update อ้างคอลัมน์ที่ไม่มี — ปรับได้เพื่อทดสอบทั้ง PGRST204 และ 42703 */
let missingUpdateError: (col: string) => DbError = col =>
  ({ code: 'PGRST204', message: `Could not find the '${col}' column of 'expense_claims' in the schema cache` })
/** จำลองฐานข้อมูลพังตอน update (ไม่ใช่เรื่องคอลัมน์) */
let failUpdates = false
/** จำลอง client สร้างไม่ได้ / เครือข่ายหลุด: from() throw */
let throwOnFrom = false

function reset(withFiledColumns: boolean) {
  db.profiles = [person(ADMIN, 'แอดมิน ทดสอบ', 'admin'), person(STAFF, 'พนักงาน ทดสอบ', 'staff')]
  db.expense_claims = claimRows(withFiledColumns)
  db.activity_logs = []
  schema.set('profiles', new Set(Object.keys(db.profiles[0])))
  schema.set('expense_claims', new Set(Object.keys(db.expense_claims[0])))
  schema.set('activity_logs', new Set(['user_id', 'action_type', 'target_user_id', 'details', 'ip_address', 'user_agent', 'location', 'latitude', 'longitude']))
  ops.length = 0
  revalidated.length = 0
  failUpdates = false
  throwOnFrom = false
}

// ── ฐานข้อมูลจำลอง (PostgREST เฉพาะที่ action เหล่านี้ + requireAuth + logActivity ใช้) ────────────
/** ทุกคำขอ: ตาราง + ชนิด (ตรวจว่าไม่มีการอ่าน/เขียนเมื่ออินพุตผิด) */
const ops: { table: string; action: string; payload?: Row }[] = []
const revalidated: string[] = []
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

class Query implements PromiseLike<Result> {
  private action: 'select' | 'insert' | 'update' = 'select'
  private cols: string | null = null
  private payload: Row = {}
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean }[] = []
  private start = 0
  private end = Number.POSITIVE_INFINITY
  private one: 'single' | 'maybeSingle' | null = null
  /** คอลัมน์ที่ filter/order อ้างถึง */
  private used = new Set<string>()
  constructor(private table: string) {}

  select(cols = '*') {
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
  eq(c: string, v: unknown) { return this.where(c, r => r[c] === v) }
  in(c: string, vs: unknown[]) {
    assert.ok(Array.isArray(vs), 'in() ต้องได้ array')
    return this.where(c, r => vs.includes(r[c]))
  }
  is(c: string, v: null) {
    assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ is(col, null)')
    return this.where(c, r => r[c] == null)
  }
  gte(c: string, v: string) { return this.where(c, r => r[c] != null && Date.parse(String(r[c])) >= Date.parse(v)) }
  lt(c: string, v: string) { return this.where(c, r => r[c] != null && Date.parse(String(r[c])) < Date.parse(v)) }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.used.add(col)
    this.sorts.push({ col, asc: opts.ascending !== false })
    return this
  }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private where(col: string, f: (r: Row) => boolean) { this.used.add(col); this.filters.push(f); return this }

  /** คอลัมน์ในรายการ select (ตัด join และ '*' ทิ้ง) */
  private selectedColumns(): string[] {
    const cols = (this.cols ?? '*').replace(/\w+:\w+!\w+\([^)]*\)/g, '')
    return cols.split(',').map(c => c.trim()).filter(c => c && c !== '*')
  }

  private run(): Result {
    ops.push({ table: this.table, action: this.action, ...(this.action === 'select' ? {} : { payload: clone(this.payload) }) })
    const known = schema.get(this.table)
    assert.ok(known, `ไม่มีตาราง ${this.table}`)
    const rows = db[this.table]

    if (this.action === 'insert') {
      const bad = Object.keys(this.payload).find(c => !known.has(c))
      if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column` } }
      rows.push(clone(this.payload))
      return { data: null, error: null }
    }

    // select หรือ filter ที่อ้างคอลัมน์ที่ไม่มี → 42703 (แบบที่ PostgREST ส่งต่อจาก Postgres)
    const unknownRead = [...this.used, ...this.selectedColumns()].find(c => !known.has(c))
    if (unknownRead) return { data: null, error: { code: '42703', message: `column expense_claims.${unknownRead} does not exist` } }

    const hits = rows.filter(r => this.filters.every(f => f(r)))
    if (this.action === 'update') {
      const bad = Object.keys(this.payload).find(c => !known.has(c))
      if (bad) return { data: null, error: missingUpdateError(bad) }
      if (failUpdates) return { data: null, error: { code: 'XX000', message: 'could not write block (จำลอง)' } }
      for (const r of hits) Object.assign(r, clone(this.payload))
      return { data: null, error: null }
    }

    const sorted = [...hits].sort((a, b) => {
      for (const s of this.sorts) {
        const x = String(a[s.col]), y = String(b[s.col])
        if (x !== y) return (x < y ? -1 : 1) * (s.asc ? 1 : -1)
      }
      return 0
    })
    const picked = this.selectedColumns()
    const page = sorted.slice(this.start, this.end + 1).map(r =>
      (this.cols ?? '*').includes('*') ? clone(r) : Object.fromEntries(picked.map(c => [c, clone(r[c])])))
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
const fakeClient = strict({
  from: (table: string) => {
    if (throwOnFrom && table === 'expense_claims') throw new TypeError('fetch failed (จำลอง)')
    return strict(new Query(table))
  },
})

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, {
    createServiceClient: () => fakeClient,
    removeStorageByUrls: async () => assert.fail('removeStorageByUrls ไม่ควรถูกเรียกในสคริปต์นี้'),
  }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath(path: string) { revalidated.push(path) }, revalidateTag() {} }],
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
const { markClaimsFiled, unmarkClaimFiled, getClaims } =
  require('../app/(authenticated)/finance/actions') as typeof import('../app/(authenticated)/finance/actions')
const { filedState } = require('../app/(authenticated)/finance/claims-filter') as typeof import('../app/(authenticated)/finance/claims-filter')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
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
const claimOps = () => ops.filter(o => o.table === 'expense_claims')
const claimWrites = () => claimOps().filter(o => o.action !== 'select')
const snapshotClaims = () => JSON.stringify(db.expense_claims)
const MIGRATION_MESSAGE = 'ยังใช้เครื่องหมายเข้าแฟ้มไม่ได้ — ต้องรันไฟล์ SQL 20260929_claim_filed.sql บนฐานข้อมูลก่อน'

/** action ต้องคืน error ภาษาไทย ไม่แตะ expense_claims เลย (ทั้งอ่านและเขียน) และไม่ลง activity_logs */
async function rejectedBeforeDb(label: string, run: () => Promise<{ error?: string }>, pattern?: RegExp) {
  const opsBefore = claimOps().length
  const before = snapshotClaims()
  const logsBefore = db.activity_logs.length
  const res = await run()
  assert.ok(typeof res.error === 'string' && res.error.length > 0, `${label}: ต้องได้ error (ได้ ${JSON.stringify(res)})`)
  if (pattern) assert.match(res.error, pattern, label)
  assert.equal(claimOps().length, opsBefore, `${label}: ต้องไม่อ่าน/เขียน expense_claims`)
  assert.equal(snapshotClaims(), before, `${label}: ข้อมูลต้องไม่เปลี่ยน`)
  assert.equal(db.activity_logs.length, logsBefore, `${label}: ต้องไม่ลง activity_logs`)
  return res.error
}

async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const original = console.error
  console.error = () => {}
  try {
    return await run()
  } finally {
    console.error = original
  }
}

const pass = (label: string) => console.log(`PASS  ${label}`)

async function main() {
  // ══ AC13: มีคอลัมน์เข้าแฟ้ม ═══════════════════════════════════════════════════
  reset(true)

  // ไม่ล็อกอิน / พนักงาน → error และไม่แตะใบเบิก
  logout()
  assert.equal(await rejectedBeforeDb('ไม่ล็อกอิน mark', () => markClaimsFiled([CLAIM_A])), 'Unauthorized')
  assert.equal(await rejectedBeforeDb('ไม่ล็อกอิน unmark', () => unmarkClaimFiled(CLAIM_A)), 'Unauthorized')
  loginAs(STAFF)
  assert.equal(
    await rejectedBeforeDb('พนักงาน mark ใบของตัวเอง', () => markClaimsFiled([CLAIM_A])),
    'เฉพาะแอดมินเท่านั้นที่ทำเครื่องหมายเข้าแฟ้มได้',
  )
  await rejectedBeforeDb('พนักงาน unmark', () => unmarkClaimFiled(CLAIM_A), /เฉพาะแอดมิน/)
  // token ปลอม = ไม่ล็อกอิน
  cookieJar.set('session_token', `${ADMIN}:${Date.now()}:${'0'.repeat(64)}`)
  await rejectedBeforeDb('token ปลอม', () => markClaimsFiled([CLAIM_A]))
  pass('AC13 ไม่ล็อกอิน / token ปลอม / พนักงาน → error ไม่อ่านไม่เขียนใบเบิก ไม่ลง log')

  // อินพุตผิด → error โดยไม่แตะฐานข้อมูล
  loginAs(ADMIN)
  const hundredOne = Array.from({ length: 101 }, (_, i) => uid(1000 + i))
  await rejectedBeforeDb('101 ใบ', () => markClaimsFiled(hundredOne), /1–100/)
  await rejectedBeforeDb('0 ใบ', () => markClaimsFiled([]), /1–100/)
  await rejectedBeforeDb('ไม่ใช่ UUID', () => markClaimsFiled([CLAIM_A, 'not-a-uuid']), /รหัสใบเบิกไม่ถูกต้อง/)
  await rejectedBeforeDb('SQL ในรหัส', () => markClaimsFiled([`${CLAIM_A}' or 1=1`]), /รหัสใบเบิกไม่ถูกต้อง/)
  await rejectedBeforeDb('ไม่ใช่สตริง', () => markClaimsFiled([CLAIM_A, 42 as unknown as string]), /รหัสใบเบิกไม่ถูกต้อง/)
  await rejectedBeforeDb('ไม่ใช่ array', () => markClaimsFiled(CLAIM_A as unknown as string[]))
  await rejectedBeforeDb('ซ้ำกัน', () => markClaimsFiled([CLAIM_A, CLAIM_A]), /ซ้ำ/)
  await rejectedBeforeDb('ซ้ำกันต่างตัวพิมพ์', () => markClaimsFiled([CLAIM_A, CLAIM_A.toUpperCase()]), /ซ้ำ/)
  await rejectedBeforeDb('unmark ไม่ใช่ UUID', () => unmarkClaimFiled('abc'), /รหัสใบเบิกไม่ถูกต้อง/)
  pass('AC13 101 ใบ / 0 ใบ / ไม่ใช่ UUID / ไม่ใช่ array / ซ้ำ → error ก่อนแตะฐานข้อมูล')

  // ใบที่ไม่มีในระบบ → error บอกจำนวน ไม่เขียนใบไหนเลย
  let before = snapshotClaims()
  const notFound = await markClaimsFiled([CLAIM_A, MISSING])
  assert.match(String(notFound.error), /ไม่พบใบเบิก 1 ใบ จาก 2 ใบ/)
  assert.equal(claimWrites().length, 0, 'ใบที่ไม่พบ → ไม่เขียน')
  assert.equal(snapshotClaims(), before)
  assert.equal(db.activity_logs.length, 0)
  pass(`AC13 ใบที่ไม่มีในระบบ → "${notFound.error}" ไม่เขียนใบใดเลย`)

  // แอดมินทำเครื่องหมาย 4 ใบ: ทุกใบได้ filed_at / filed_by / filed_file_count ถูกต้อง
  const t0 = Date.now()
  const marked = await markClaimsFiled([CLAIM_D, CLAIM_A, CLAIM_B, CLAIM_C])
  assert.deepEqual(marked, { success: true, count: 4 })
  for (const id of [CLAIM_A, CLAIM_B, CLAIM_C, CLAIM_D]) {
    const r = claimRow(id)
    assert.equal(r.filed_by, ADMIN, `${id}: filed_by = แอดมินที่กด`)
    assert.equal(r.filed_file_count, EXPECTED_FILES[id], `${id}: filed_file_count = ${EXPECTED_FILES[id]}`)
    const at = Date.parse(String(r.filed_at))
    assert.ok(at >= t0 - 1000 && at <= Date.now() + 1000, `${id}: filed_at = ตอนนี้ (ได้ ${String(r.filed_at)})`)
    assert.equal(filedState(r), 'filed')
  }
  // จัดกลุ่มตามจำนวนไฟล์: A กับ D มี 3 ไฟล์ → อัปเดตครั้งเดียวกัน = 3 ครั้ง (3, 0, 4)
  const updates = claimWrites()
  assert.equal(updates.length, 3, `4 ใบ จำนวนไฟล์ 3 แบบ = อัปเดต 3 ครั้ง (ได้ ${updates.length})`)
  assert.ok(updates.every(u => u.action === 'update' && Object.keys(u.payload ?? {}).sort().join() === 'filed_at,filed_by,filed_file_count'))
  const markLog = db.activity_logs.filter(l => l.action_type === 'MARK_CLAIM_FILED')
  assert.equal(markLog.length, 1, 'ลง MARK_CLAIM_FILED หนึ่งครั้ง')
  assert.equal(db.activity_logs.length, 1)
  assert.equal(markLog[0].user_id, ADMIN)
  assert.deepEqual(markLog[0].details, { claims: ['EXP-TEST-001', 'EXP-TEST-002', 'EXP-TEST-003', 'EXP-TEST-004'], count: 4 })
  assert.ok(revalidated.includes('/finance'))
  pass('AC13 แอดมินทำเครื่องหมาย 4 ใบ → filed_at ตอนนี้ · filed_by แอดมิน · filed_file_count 3/0/4/3 (นับสี่ช่อง ไม่นับ \'\') · อัปเดต 3 ครั้งตามกลุ่มจำนวน · ลง MARK_CLAIM_FILED พร้อมเลขที่')

  // ไฟล์เปลี่ยนหลังเข้าแฟ้ม → changed · ทำเครื่องหมายซ้ำ = จำจำนวนใหม่
  claimRow(CLAIM_B).receipt_urls = [FILE('b1')]
  assert.equal(filedState(claimRow(CLAIM_B)), 'changed')
  const again = await markClaimsFiled([CLAIM_B.toUpperCase()])
  assert.deepEqual(again, { success: true, count: 1 }, 'uuid ตัวพิมพ์ใหญ่ก็เป็นใบเดียวกัน')
  assert.equal(claimRow(CLAIM_B).filed_file_count, 1)
  assert.equal(filedState(claimRow(CLAIM_B)), 'filed')
  pass('AC13 ไฟล์เพิ่มหลังเข้าแฟ้ม → changed · ทำเครื่องหมายซ้ำจำจำนวนใหม่ → filed')

  // unmark: ล้างทั้งสามช่อง เฉพาะใบนั้น
  const logsBefore = db.activity_logs.length
  revalidated.length = 0
  const unmarked = await unmarkClaimFiled(CLAIM_C)
  assert.deepEqual(unmarked, { success: true })
  for (const col of FILED_COLUMNS) assert.equal(claimRow(CLAIM_C)[col], null, `unmark ต้องล้าง ${col}`)
  assert.equal(filedState(claimRow(CLAIM_C)), 'none')
  assert.equal(claimRow(CLAIM_A).filed_by, ADMIN, 'ใบอื่นไม่ถูกล้าง')
  const unmarkLogs = db.activity_logs.slice(logsBefore)
  assert.equal(unmarkLogs.length, 1)
  assert.equal(unmarkLogs[0].action_type, 'UNMARK_CLAIM_FILED')
  assert.deepEqual(unmarkLogs[0].details, { claim: 'EXP-TEST-003' })
  assert.ok(revalidated.includes('/finance') && revalidated.includes(`/finance/${CLAIM_C}`))
  assert.equal((await unmarkClaimFiled(MISSING)).error, 'ไม่พบใบเบิก')
  pass('AC13 unmarkClaimFiled ล้าง filed_at / filed_by / filed_file_count ของใบนั้น · ลง UNMARK_CLAIM_FILED · ใบที่ไม่มี → "ไม่พบใบเบิก"')

  // ฐานข้อมูลพังแบบอื่น → error ทั่วไป (ไม่ใช่ข้อความให้รัน SQL) · client throw → คืน error ไม่ throw
  failUpdates = true
  const broken = await markClaimsFiled([CLAIM_A])
  assert.match(String(broken.error), /เกิดข้อผิดพลาด/)
  assert.notEqual(broken.error, MIGRATION_MESSAGE)
  failUpdates = false
  throwOnFrom = true
  const thrown = await quietly(() => markClaimsFiled([CLAIM_A]))
  assert.ok(thrown.error, 'from() throw → ต้องคืน error')
  const thrownUnmark = await quietly(() => unmarkClaimFiled(CLAIM_A))
  assert.ok(thrownUnmark.error, 'from() throw → unmark ต้องคืน error')
  throwOnFrom = false
  pass('ฐานข้อมูลพัง (XX000) → "เกิดข้อผิดพลาด…" · client throw → คืน { error } ไม่ throw')

  // ══ AC14: ฐานข้อมูลที่ยังไม่รัน 20260929_claim_filed.sql ═══════════════════════════════
  for (const [label, makeError] of [
    ['PGRST204', (col: string) => ({ code: 'PGRST204', message: `Could not find the '${col}' column of 'expense_claims' in the schema cache` })],
    ['42703', (col: string) => ({ code: '42703', message: `column "${col}" of relation "expense_claims" does not exist` })],
  ] as const) {
    reset(false)
    missingUpdateError = makeError
    loginAs(ADMIN)
    assert.ok(!schema.get('expense_claims')?.has('filed_at'), 'โหมดนี้ต้องไม่มีคอลัมน์ filed_at')

    // หน้ารายการยังโหลดได้ (getClaims select *) — ทุกใบถือว่ายังไม่เข้าแฟ้ม
    const list = await getClaims()
    assert.equal(list.error, undefined, `getClaims ต้องสำเร็จ (ได้ ${list.error})`)
    assert.equal(list.data.length, 4, 'getClaims ต้องได้ครบ 4 ใบ')
    assert.ok(list.data.every((r: Row) => !('filed_at' in r)), 'แถวไม่มีคอลัมน์เข้าแฟ้ม')
    assert.ok(list.data.every((r: Row) => filedState(r) === 'none'))
    const open = await getClaims({ status: ['paid', 'refund_confirmed'], paidMonth: '2026-09' })
    assert.equal(open.error, undefined)
    assert.equal(open.data.length, 4)

    // ทำเครื่องหมาย / ยกเลิก → ข้อความให้รัน SQL ไม่ throw ไม่เปลี่ยนข้อมูล ไม่ลง log
    before = snapshotClaims()
    const res = await markClaimsFiled([CLAIM_A, CLAIM_B])
    assert.deepEqual(res, { error: MIGRATION_MESSAGE }, `${label}: mark ต้องได้ข้อความให้รัน SQL`)
    const resUnmark = await unmarkClaimFiled(CLAIM_A)
    assert.deepEqual(resUnmark, { error: MIGRATION_MESSAGE }, `${label}: unmark ต้องได้ข้อความให้รัน SQL`)
    assert.equal(snapshotClaims(), before, 'ข้อมูลต้องไม่เปลี่ยน')
    assert.equal(db.activity_logs.length, 0, 'ไม่ลง log เมื่อทำไม่สำเร็จ')
    pass(`AC14 ไม่มีคอลัมน์เข้าแฟ้ม (${label}) → getClaims ได้ครบ 4 ใบ (ถือว่ายังไม่เข้าแฟ้ม) · mark/unmark คืน "${MIGRATION_MESSAGE}" ไม่ throw`)
  }

  console.log('\nclaim-filed: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
