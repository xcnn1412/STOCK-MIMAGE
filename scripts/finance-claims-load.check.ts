// โหลดใบเบิกให้ครบ (/finance) — รัน getClaims / getPaidMonths ตัวจริงกับฐานข้อมูลจำลองในหน่วยความจำ
// ที่ตัดผลเหมือน PostgREST (ไม่เกิน 1,000 แถวต่อคำขอ)
// Run:  npx tsx scripts/finance-claims-load.check.ts
//
// ไม่แตะฐานข้อมูลจริง ไม่ต้องมี env: แทน next/headers, next/cache และ @/lib/supabase-server ด้วยตัวจำลอง
// (เทคนิคเดียวกับ scripts/purchasing-flow.check.ts) · ผู้ใช้ 3 คนและใบเบิก 2,500 ใบสังเคราะห์ทั้งหมด สุ่มแบบกำหนด seed
// ครอบคลุม AC16, AC24–AC28, AC30 ของ docs/specs/claim-document-bundle.md (ขั้น 0)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-claims-load: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'

process.env.SESSION_SECRET = 'finance-claims-load-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

// ── สุ่มแบบกำหนด seed (mulberry32) — ผลเหมือนเดิมทุกครั้งที่รัน ─────────────────────
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = seeded(20260929)
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]

// ── ผู้ใช้ (สังเคราะห์) ────────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF_A = uid(2), STAFF_B = uid(3)
const person = (id: string, full_name: string, role: string): Row =>
  ({ id, full_name, nickname: null, role, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

// ── ใบเบิก ────────────────────────────────────────────────────────────────
const TOTAL = 2500
const HOUR = 3_600_000
/** รูปแบบเดียวกับที่ PostgREST คืน timestamptz */
const ts = (ms: number) => new Date(ms).toISOString().replace('.000Z', '+00:00')
const START = Date.UTC(2025, 9, 1) // 2025-10-01
const NOW = Date.UTC(2026, 8, 29, 12) // 2026-09-29

let seq = 0
function claim(over: Row): Row {
  seq++
  return {
    id: uid(10_000 + seq),
    claim_number: `EXP-TEST-${String(seq).padStart(4, '0')}`,
    claim_type: 'event', title: `ใบทดสอบ ${seq}`, category: 'travel', amount: 100 + seq,
    vat_mode: 'none', withholding_tax_rate: 0, status: 'pending', submitted_by: STAFF_A,
    expense_date: '2026-09-01', paid_at: null, actual_spent_amount: null,
    pettycash_fund_id: null, pettycash_closed_at: null,
    created_at: ts(Date.UTC(2026, 8, 1)),
    ...over,
  }
}

// ขอบเดือนตามเวลาไทย (AC25) + ข้ามปี
const B_SEP_START = claim({ status: 'paid', submitted_by: ADMIN, paid_at: '2026-08-31T17:00:00Z' })          // 1 ก.ย. 00:00 ไทย
const B_OCT_START = claim({ status: 'paid', submitted_by: ADMIN, paid_at: '2026-09-30T17:00:00Z' })          // 1 ต.ค. 00:00 ไทย
const B_AUG_END = claim({ status: 'refund_confirmed', submitted_by: STAFF_A, paid_at: '2026-08-31T16:59:59+00:00' }) // 31 ส.ค. 23:59:59 ไทย
const B_SEP_END = claim({ status: 'refund_confirmed', submitted_by: STAFF_A, paid_at: '2026-09-30T16:59:59+00:00' }) // 30 ก.ย. 23:59:59 ไทย
const B_DEC_END = claim({ status: 'paid', submitted_by: STAFF_B, paid_at: '2025-12-31T16:59:59+00:00' })      // 31 ธ.ค. 2568 ไทย
const B_JAN_START = claim({ status: 'paid', submitted_by: STAFF_B, paid_at: '2025-12-31T17:00:00+00:00' })    // 1 ม.ค. 2569 ไทย

// ทุกกิ่งของเงื่อนไข "ยังไม่จบ" (AC24) ของผู้ใช้ทุกคน — ติดและไม่ติด
const branches = [ADMIN, STAFF_A, STAFF_B].flatMap(by => [
  claim({ submitted_by: by, claim_type: 'advance', status: 'paid', paid_at: ts(NOW - 5 * HOUR), actual_spent_amount: null }),  // ติด: ทดลองจ่ายยังไม่เคลียร์
  claim({ submitted_by: by, claim_type: 'advance', status: 'paid', paid_at: ts(NOW - 6 * HOUR), actual_spent_amount: 0 }),     // ไม่ติด: เคลียร์แล้ว (0 ไม่ใช่ว่าง)
  claim({ submitted_by: by, claim_type: 'advance', status: 'refund_confirmed', paid_at: ts(NOW - 7 * HOUR) }),                 // ไม่ติด: คืนเงินแล้ว
  claim({ submitted_by: by, claim_type: 'petty_cash', status: 'paid', paid_at: ts(NOW - 8 * HOUR) }),                          // ติด: วงเงินสดย่อยยังเปิด
  claim({ submitted_by: by, claim_type: 'petty_cash', status: 'paid', paid_at: ts(NOW - 9 * HOUR), pettycash_closed_at: ts(NOW - HOUR) }), // ไม่ติด: ปิดเดือนแล้ว
  claim({ submitted_by: by, claim_type: 'petty_cash', status: 'paid', paid_at: ts(NOW - 10 * HOUR), pettycash_fund_id: uid(99) }),        // ไม่ติด: เติมเงิน
  claim({ submitted_by: by, claim_type: 'other', status: 'paid', paid_at: ts(NOW - 11 * HOUR), pettycash_fund_id: uid(99) }),             // ไม่ติด: ค่าใช้จ่ายจากกล่อง
  claim({ submitted_by: by, claim_type: 'petty_cash', status: 'pending' }),                                                     // ติด: สถานะยังไม่ปิด
  claim({ submitted_by: by, status: 'rejected' }),                                                                              // ติด
  claim({ submitted_by: by, status: 'cancelled' }),                                                                             // ไม่ติด
])
const fixed = [B_SEP_START, B_OCT_START, B_AUG_END, B_SEP_END, B_DEC_END, B_JAN_START, ...branches]

// ที่เหลือสุ่ม: จ่ายแล้วราวครึ่ง (ใกล้ข้อมูลจริง) ส่วนที่ยังไม่จบเกิน 1,000 ใบ บังคับให้ทุกชุดต้องอ่านหลายหน้า
const STATUSES = [
  'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'refund_confirmed', 'cancelled',
  'draft', 'pending', 'pending', 'pending', 'approved', 'approved', 'awaiting_payment', 'pending_month_end', 'rejected',
] as const
const TYPES = ['event', 'event', 'advance', 'petty_cash', 'other'] as const
const SUBMITTERS = [STAFF_A, STAFF_A, STAFF_A, STAFF_A, STAFF_A, STAFF_B, STAFF_B, STAFF_B, ADMIN, ADMIN]
const random = Array.from({ length: TOTAL - fixed.length }, () => {
  const status = pick(STATUSES)
  const claim_type = pick(TYPES)
  // ช่องเวลาห่างกัน 5 ชั่วโมง 1,740 ช่อง (ต.ค. 2568 – ก.ย. 2569) สำหรับ ~2,500 ใบ → created_at ซ้ำกันเยอะ (ทดสอบลำดับข้ามหน้า)
  const created = START + Math.floor(rand() * 1740) * 5 * HOUR
  const done = status === 'paid' || status === 'refund_confirmed'
  const isFund = claim_type === 'petty_cash' && rand() < 0.4
  return claim({
    status, claim_type, submitted_by: pick(SUBMITTERS),
    created_at: ts(created),
    paid_at: done ? ts(Math.min(NOW, created + Math.floor(rand() * 20 * 24) * HOUR)) : null,
    actual_spent_amount: claim_type === 'advance' && rand() < 0.5 ? null : claim_type === 'advance' ? 50 : null,
    pettycash_fund_id: (claim_type === 'petty_cash' && !isFund) || (claim_type === 'other' && rand() < 0.1) ? uid(99) : null,
    pettycash_closed_at: isFund && rand() < 0.5 ? ts(created + 30 * 24 * HOUR) : null,
  })
})

const db: Record<string, Row[]> = {
  profiles: [
    person(ADMIN, 'แอดมิน ทดสอบ', 'admin'),
    person(STAFF_A, 'พนักงาน ทดสอบหนึ่ง', 'staff'),
    person(STAFF_B, 'พนักงาน ทดสอบสอง', 'staff'),
  ],
  expense_claims: [...fixed, ...random],
}
const CLAIMS = db.expense_claims

// ── ฐานข้อมูลจำลอง (PostgREST เฉพาะที่ getClaims / getPaidMonths / requireAuth ใช้) ──────────
/** db-max-rows ของ Supabase: คำขอเดียวได้ไม่เกินนี้ ไม่ว่าจะขอ range กว้างแค่ไหน */
const MAX_ROWS = 1000
/** ตาราง → จำนวนการอ่าน */
const reads = new Map<string, number>()
/** ทุก select ของ expense_claims (ตรวจว่าอ่านคอลัมน์ไหน) */
const claimSelects: string[] = []
/** การอ่าน expense_claims ครั้งที่เท่านี้ (นับสะสม) ได้ error — จำลองฐานข้อมูลพังกลางทาง */
let failAtRead: number | null = null
const claimReads = () => reads.get('expense_claims') ?? 0

const tieRand = seeded(7)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const TIMESTAMP = /^\d{4}-\d{2}-\d{2}T/
/** timestamptz เทียบกันตามเวลาจริง (รูปแบบ Z กับ +00:00 เท่ากันได้) */
function instant(v: unknown): number {
  const t = Date.parse(String(v))
  assert.ok(!Number.isNaN(t), `ตัวจำลองเทียบได้เฉพาะเวลา: ${String(v)}`)
  return t
}
function compare(x: unknown, y: unknown): number {
  if (typeof x === 'number' && typeof y === 'number') return x - y
  if (typeof x === 'string' && typeof y === 'string' && TIMESTAMP.test(x) && TIMESTAMP.test(y)) return instant(x) - instant(y)
  const a = String(x), b = String(y)
  return a < b ? -1 : a > b ? 1 : 0
}

/** เรียกเมธอดที่ตัวจำลองไม่มี → throw ทันที (กันโค้ดจริงใช้ฟีเจอร์ที่ตัวจำลองไม่ได้เลียนแบบแล้วผ่านแบบเงียบ) */
function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

class Query implements PromiseLike<Result> {
  private cols: string | null = null
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private start = 0
  private end: number | null = null
  private one = false
  constructor(private table: string) {}

  select(cols = '*', options?: unknown) {
    assert.equal(options, undefined, 'ตัวจำลองไม่รองรับตัวเลือกของ select (count / head)')
    this.cols = cols
    return this
  }
  eq(c: string, v: unknown) { return this.where(r => r[c] === v) }
  in(c: string, vs: unknown[]) {
    assert.ok(Array.isArray(vs), 'in() ต้องได้ array')
    return this.where(r => vs.includes(r[c]))
  }
  not(c: string, op: string, v: string) {
    assert.equal(op, 'in', 'ตัวจำลองรองรับเฉพาะ not(col, "in", "(a,b)")')
    assert.match(v, /^\([^()]*\)$/, `not.in ต้องอยู่ในวงเล็บ: ${v}`)
    const values = v.slice(1, -1).split(',')
    // NOT (col IN (...)) ของ Postgres: col ที่เป็น NULL ไม่ผ่าน
    return this.where(r => r[c] != null && !values.includes(String(r[c])))
  }
  is(c: string, v: null) {
    assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ is(col, null)')
    return this.where(r => r[c] == null)
  }
  gte(c: string, v: string) { return this.where(r => r[c] != null && instant(r[c]) >= instant(v)) }
  lt(c: string, v: string) { return this.where(r => r[c] != null && instant(r[c]) < instant(v)) }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    for (const k of Object.keys(opts)) assert.ok(k === 'ascending' || k === 'nullsFirst', `ตัวจำลองไม่รองรับ order({ ${k} })`)
    const asc = opts.ascending !== false
    this.sorts.push({ col, asc, nullsFirst: opts.nullsFirst ?? !asc }) // ค่าเริ่มต้นของ Postgres
    return this
  }
  range(from: number, to: number, options?: unknown) {
    assert.equal(options, undefined, 'ตัวจำลองไม่รองรับ range กับตารางที่ join')
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from, `range ไม่ถูกต้อง: ${from}-${to}`)
    this.start = from
    this.end = to
    return this
  }
  single() { this.one = true; return this }

  private where(f: (r: Row) => boolean) { this.filters.push(f); return this }

  /** แถวที่ค่าคอลัมน์ที่สั่งเรียงเท่ากันหมด Postgres ไม่รับประกันลำดับ — สุ่มใหม่ทุกคำขอ (เรียงไม่ครบ = แถวซ้ำ/หายข้ามหน้า) */
  private sorted(rows: Row[]): Row[] {
    const tie = new Map(rows.map(r => [r, tieRand()]))
    return [...rows].sort((a, b) => {
      for (const s of this.sorts) {
        const x = a[s.col], y = b[s.col]
        if (x == null && y == null) continue
        if (x == null || y == null) return (x == null) === s.nullsFirst ? -1 : 1
        const d = compare(x, y)
        if (d !== 0) return s.asc ? d : -d
      }
      return (tie.get(a) ?? 0) - (tie.get(b) ?? 0)
    })
  }

  /** '*' (รวม join) = ทั้งแถว (ไม่จำลองข้อมูล join) · รายชื่อคอลัมน์ = เฉพาะคอลัมน์นั้น */
  private project(r: Row): Row {
    const cols = this.cols ?? '*'
    if (cols.includes('*')) return clone(r)
    return Object.fromEntries(cols.split(',').map(c => c.trim()).filter(Boolean).map(c => {
      assert.ok(c in r, `ไม่มีคอลัมน์ ${this.table}.${c}`)
      return [c, clone(r[c])]
    }))
  }

  private run(): Result {
    assert.ok(this.cols !== null, 'ตัวจำลองรองรับเฉพาะการอ่าน (select)')
    reads.set(this.table, (reads.get(this.table) ?? 0) + 1)
    if (this.table === 'expense_claims') {
      claimSelects.push((this.cols ?? '').replace(/\s+/g, ' ').trim())
      if (failAtRead !== null && claimReads() === failAtRead) {
        return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout (จำลอง)' } }
      }
    }
    const hits = this.sorted((db[this.table] ?? []).filter(r => this.filters.every(f => f(r))))
    // ไม่มี range = ได้ไม่เกิน MAX_ROWS แถวแรก · มี range ก็ยังได้ไม่เกิน MAX_ROWS ต่อคำขอ
    const stop = Math.min(this.end === null ? Number.POSITIVE_INFINITY : this.end + 1, this.start + MAX_ROWS)
    const page = hits.slice(this.start, stop).map(r => this.project(r))
    if (!this.one) return { data: page, error: null }
    if (page.length === 1) return { data: page[0], error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${page.length}` } }
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null
  ): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}
const fakeClient = strict({ from: (table: string) => strict(new Query(table)) })

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
const { getClaims, getPaidMonths } =
  require('../app/(authenticated)/finance/actions') as typeof import('../app/(authenticated)/finance/actions')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
function logout() {
  cookieJar.clear()
}

type Claim = { id: string; created_at: string; submitted_by: string; status: string; paid_at: string | null }
/** เรียก getClaims แล้วต้องสำเร็จ */
async function load(filters?: Parameters<typeof getClaims>[0]): Promise<Claim[]> {
  const res = await getClaims(filters)
  assert.equal(res.error, undefined, `getClaims(${JSON.stringify(filters)}) ต้องสำเร็จ แต่ได้ ${res.error}`)
  return res.data as Claim[]
}
const idsOf = (rows: { id?: unknown }[]) => rows.map(r => String(r.id))
/** ได้ชุดเดียวกับที่คาด: ไม่ขาด ไม่เกิน ไม่ซ้ำ */
function sameSet(got: { id?: unknown }[], want: Row[], label: string) {
  const ids = idsOf(got)
  assert.equal(new Set(ids).size, ids.length, `${label}: มีแถวซ้ำ`)
  assert.deepEqual([...ids].sort(), idsOf(want).sort(), `${label}: ชุดแถวไม่ตรง (ได้ ${ids.length} คาด ${want.length})`)
}
/** เรียง created_at ใหม่ → เก่า แล้ว id น้อย → มาก */
function assertNewestFirst(rows: Claim[], label: string) {
  for (let i = 1; i < rows.length; i++) {
    const a = rows[i - 1], b = rows[i]
    const d = compare(a.created_at, b.created_at)
    assert.ok(d > 0 || (d === 0 && a.id < b.id), `${label}: ลำดับผิดที่แถว ${i} (${a.created_at} ${a.id} → ${b.created_at} ${b.id})`)
  }
}
/** เดือนตามเวลาไทย คำนวณแยกจากโค้ดจริง */
const thaiMonthOf = (paidAt: unknown) => new Date(instant(paidAt) + 7 * HOUR).toISOString().slice(0, 7)
const TERMINAL = new Set(['paid', 'cancelled', 'refund_confirmed'])
const isOpen = (c: Row) =>
  !TERMINAL.has(String(c.status)) ||
  (c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount === null) ||
  (c.claim_type === 'petty_cash' && c.pettycash_fund_id === null && c.status === 'paid' && c.pettycash_closed_at === null)
const isPaid = (c: Row) => c.status === 'paid' || c.status === 'refund_confirmed'
const paidIn = (month: string) => (c: Row) => isPaid(c) && thaiMonthOf(c.paid_at) === month
const ownedBy = (userId: string) => (c: Row) => c.submitted_by === userId

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
  // ── ข้อมูลทดสอบครบตามที่ตั้งใจ ──────────────────────────────────────────────
  assert.equal(CLAIMS.length, TOTAL)
  assert.equal(new Set(idsOf(CLAIMS)).size, TOTAL)
  const openAll = CLAIMS.filter(isOpen)
  const branch2 = CLAIMS.filter(c => c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount === null)
  const branch3 = CLAIMS.filter(c => c.claim_type === 'petty_cash' && c.pettycash_fund_id === null && c.status === 'paid' && c.pettycash_closed_at === null)
  assert.ok(openAll.filter(c => !TERMINAL.has(String(c.status))).length > MAX_ROWS, 'ใบที่สถานะยังไม่ปิดต้องเกิน 1,000 (บังคับอ่านหลายหน้า)')
  assert.ok(branch2.length >= 3 && branch3.length >= 3, 'ต้องมีแถวของกิ่งทดลองจ่ายและวงเงินสดย่อย')
  assert.ok(CLAIMS.filter(isPaid).length > MAX_ROWS, 'ใบที่จ่ายแล้วต้องเกิน 1,000 (getPaidMonths ต้องอ่านหลายหน้า)')
  assert.ok(CLAIMS.filter(ownedBy(STAFF_A)).length > MAX_ROWS, 'ใบของพนักงานคนหนึ่งต้องเกิน 1,000')
  assert.ok(CLAIMS.filter(isPaid).every(c => c.paid_at !== null), 'ใบที่จ่ายแล้วในข้อมูลทดสอบมี paid_at ทุกใบ')

  // ══ AC30: ตัวจำลองตัดผลที่ 1,000 แถวเหมือน PostgREST ═══════════════════════════════
  const noRange = await fakeClient.from('expense_claims').select('*')
  assert.equal((noRange.data as Row[]).length, MAX_ROWS, 'อ่านครั้งเดียวไม่มี range ต้องได้ 1,000 แถว')
  const wide = await fakeClient.from('expense_claims').select('*').range(0, TOTAL - 1)
  assert.equal((wide.data as Row[]).length, MAX_ROWS, 'range กว้างกว่า 1,000 ก็ยังได้ 1,000 แถว')
  const tail = await fakeClient.from('expense_claims').select('id').order('id').range(2000, 2999)
  assert.equal((tail.data as Row[]).length, TOTAL - 2000, 'range ตัดหลังกรองและเรียง')
  assert.ok(MAX_ROWS < TOTAL, 'การอ่านครั้งเดียวผ่าน AC16 ไม่ได้')
  // ตัวจำลองสุ่มลำดับแถวที่ค่าเรียงเท่ากัน: อ่านทีละหน้าโดยเรียงแค่ created_at ต้องได้แถวซ้ำ/หาย
  const naive: string[] = []
  for (let from = 0; from < TOTAL; from += MAX_ROWS) {
    const { data } = await fakeClient.from('expense_claims').select('id').order('created_at', { ascending: false }).range(from, from + MAX_ROWS - 1)
    naive.push(...idsOf(data as Row[]))
  }
  assert.ok(new Set(naive).size < TOTAL, 'เรียงแค่ created_at แล้วอ่านทีละหน้า ต้องมีแถวซ้ำ/หาย (ถ้าไม่มี ตัวจำลองไม่ได้ทดสอบลำดับข้ามหน้า)')
  // เมธอดที่ตัวจำลองไม่มีต้อง throw
  assert.throws(() => (fakeClient.from('expense_claims') as unknown as { or: (s: string) => unknown }).or('status.eq.paid'), /ไม่รองรับ \.or\(\)/)
  assert.throws(() => (fakeClient.from('expense_claims') as unknown as { limit: (n: number) => unknown }).limit(5), /ไม่รองรับ \.limit\(\)/)
  pass(`AC30 ตัวจำลองตัดผลที่ ${MAX_ROWS} แถว (ไม่มี range และ range กว้าง) · สุ่มลำดับแถวที่เรียงเท่ากัน (อ่านแบบเรียงไม่ครบได้ ${new Set(naive).size}/${TOTAL} ใบ) · เมธอดที่ไม่มี throw`)

  // ══ AC16: แอดมินได้ครบ 2,500 ใบ เรียงคงที่ ไม่ซ้ำ ═══════════════════════════════════
  loginAs(ADMIN)
  let before = claimReads()
  const all = await load()
  sameSet(all, CLAIMS, 'AC16 แอดมิน getClaims()')
  assert.equal(all.length, TOTAL)
  assertNewestFirst(all, 'AC16')
  assert.equal(claimReads() - before, 3, 'แอดมิน 2,500 ใบ = อ่าน 3 หน้า')
  pass(`AC16 แอดมิน getClaims() ได้ ${all.length}/${TOTAL} ใบ ไม่ซ้ำ เรียงใหม่ → เก่า (อ่าน 3 หน้า)`)

  // ══ AC24: open = สามกิ่ง ไม่ขาด ไม่เกิน ไม่ซ้ำ ════════════════════════════════════
  before = claimReads()
  const open = await load({ open: true })
  sameSet(open, openAll, 'AC24 แอดมิน open')
  assertNewestFirst(open, 'AC24')
  for (const c of [...branch2, ...branch3]) assert.ok(idsOf(open).includes(String(c.id)), `AC24: ต้องมี ${c.claim_number}`)
  assert.ok(claimReads() - before >= 4, 'open อ่านสามชุด และชุดแรกเกิน 1,000 ใบ')
  // ใส่ status มาด้วยก็ไม่สน · กรองประเภทใช้กับทุกกิ่ง
  sameSet(await load({ open: true, status: 'paid' }), openAll, 'AC24 open ไม่สน status')
  sameSet(await load({ open: true, claim_type: 'advance' }), openAll.filter(c => c.claim_type === 'advance'), 'AC24 open + ทดลองจ่าย')
  sameSet(await load({ open: true, claim_type: 'petty_cash' }), openAll.filter(c => c.claim_type === 'petty_cash'), 'AC24 open + เงินสดย่อย')
  sameSet(await load({ open: true, submitted_by: STAFF_B }), openAll.filter(ownedBy(STAFF_B)), 'AC24 open + ผู้เบิก')
  pass(`AC24 open ได้ ${open.length} ใบ ตรงกับเงื่อนไขที่คำนวณแยก (กิ่งทดลองจ่าย ${branch2.length} · วงเงินสดย่อย ${branch3.length}) ไม่ซ้ำ · กรองประเภท/ผู้เบิกใช้กับทุกกิ่ง`)

  // ══ AC25: เดือนที่จ่ายนับตามเวลาไทย ═══════════════════════════════════════════════
  const PAID = ['paid', 'refund_confirmed']
  const sep = await load({ status: PAID, paidMonth: '2026-09' })
  const sepIds = idsOf(sep)
  assert.ok(sepIds.includes(String(B_SEP_START.id)), 'ต้องรวม paid_at 2026-08-31T17:00:00Z (1 ก.ย. เวลาไทย)')
  assert.ok(sepIds.includes(String(B_SEP_END.id)), 'ต้องรวม paid_at 2026-09-30T16:59:59Z')
  assert.ok(!sepIds.includes(String(B_OCT_START.id)), 'ต้องไม่รวม paid_at 2026-09-30T17:00:00Z (1 ต.ค. เวลาไทย)')
  assert.ok(!sepIds.includes(String(B_AUG_END.id)), 'ต้องไม่รวม paid_at 2026-08-31T16:59:59Z')
  sameSet(sep, CLAIMS.filter(paidIn('2026-09')), 'AC25 ก.ย. 2026')
  assertNewestFirst(sep, 'AC25')
  // ข้ามปี: ธ.ค. → ม.ค.
  const dec = idsOf(await load({ status: PAID, paidMonth: '2025-12' }))
  assert.ok(dec.includes(String(B_DEC_END.id)) && !dec.includes(String(B_JAN_START.id)), 'ธ.ค. 2025 ตามเวลาไทย')
  sameSet(await load({ status: PAID, paidMonth: '2026-01' }), CLAIMS.filter(paidIn('2026-01')), 'AC25 ม.ค. 2026')
  // เดือนที่ยาวเกิน 1,000 ใบไม่มีในข้อมูลทดสอบ แต่สถานะเดียวก็กรองได้
  sameSet(await load({ status: 'refund_confirmed', paidMonth: '2026-09' }), CLAIMS.filter(c => c.status === 'refund_confirmed' && thaiMonthOf(c.paid_at) === '2026-09'), 'AC25 refund_confirmed')
  pass(`AC25 paidMonth 2026-09 ได้ ${sep.length} ใบ — รวม 2026-08-31T17:00:00Z ไม่รวม 2026-09-30T17:00:00Z · ข้ามปี ธ.ค./ม.ค. ถูก`)

  // ══ AC26: พนักงานได้เฉพาะของตัวเองทุกรูปแบบ · ไม่ล็อกอินได้ error ═══════════════════════
  for (const [who, label] of [[STAFF_A, 'พนักงาน A'], [STAFF_B, 'พนักงาน B']] as const) {
    loginAs(who)
    const mine = CLAIMS.filter(ownedBy(who))
    const variants: [string, Parameters<typeof getClaims>[0], Row[]][] = [
      ['ไม่กรอง', undefined, mine],
      ['open', { open: true }, openAll.filter(ownedBy(who))],
      ['paidMonth', { status: PAID, paidMonth: '2026-09' }, CLAIMS.filter(paidIn('2026-09')).filter(ownedBy(who))],
      ['status', { status: 'pending' }, mine.filter(c => c.status === 'pending')],
      ['ขอดูของแอดมิน', { submitted_by: ADMIN }, []],
      ['open + ขอดูของแอดมิน', { open: true, submitted_by: ADMIN }, []],
    ]
    for (const [name, filters, want] of variants) {
      const got = await load(filters)
      assert.ok(got.every(c => c.submitted_by === who), `${label} ${name}: ได้ใบของคนอื่น`)
      sameSet(got, want, `${label} ${name}`)
    }
    assert.deepEqual(await getPaidMonths(), [], `${label}: getPaidMonths ต้องได้ []`)
  }
  logout()
  for (const filters of [undefined, { open: true }, { status: PAID, paidMonth: '2026-09' }]) {
    const res = await getClaims(filters)
    assert.deepEqual(res.data, [], 'ไม่ล็อกอินต้องไม่ได้ข้อมูล')
    assert.ok(typeof res.error === 'string' && res.error.length > 0, 'ไม่ล็อกอินต้องได้ error')
  }
  assert.deepEqual(await getPaidMonths(), [])
  // token ปลอม = ไม่ล็อกอิน
  cookieJar.set('session_token', `${ADMIN}:${Date.now()}:${'0'.repeat(64)}`)
  assert.ok((await getClaims()).error, 'token ปลอมต้องได้ error')
  assert.deepEqual(await getPaidMonths(), [])
  pass(`AC26 พนักงาน 2 คน ได้เฉพาะใบตัวเองทั้ง ไม่กรอง / open / paidMonth / status / ขอดูของคนอื่น · getPaidMonths ของพนักงาน = [] · ไม่ล็อกอิน/token ปลอม = { data: [], error }`)

  // ══ AC27: เดือนที่จ่ายของแอดมิน ใหม่ → เก่า ผลรวมเท่าจำนวนใบที่จ่ายแล้ว ═════════════════
  loginAs(ADMIN)
  before = claimSelects.length
  const months = await getPaidMonths()
  assert.ok(months.length > 1)
  for (let i = 1; i < months.length; i++) assert.ok(months[i - 1].month > months[i].month, `เดือนต้องเรียงใหม่ → เก่า: ${months[i - 1].month} → ${months[i].month}`)
  const paidTotal = CLAIMS.filter(isPaid).length
  assert.equal(months.reduce((s, m) => s + m.count, 0), paidTotal, 'ผลรวม count = ใบ paid + refund_confirmed ทั้งหมด')
  const expected = new Map<string, number>()
  for (const c of CLAIMS.filter(isPaid)) expected.set(thaiMonthOf(c.paid_at), (expected.get(thaiMonthOf(c.paid_at)) ?? 0) + 1)
  assert.deepEqual(Object.fromEntries(months.map(m => [m.month, m.count])), Object.fromEntries(expected), 'จำนวนต่อเดือนตรงกับที่คำนวณแยก')
  assert.ok(months.every(m => /^\d{4}-(0[1-9]|1[0-2])$/.test(m.month)))
  const monthReads = claimSelects.slice(before)
  assert.equal(monthReads.length, 2, `${paidTotal} ใบ = อ่าน 2 หน้า`)
  assert.ok(monthReads.every(cols => cols === 'paid_at'), `getPaidMonths อ่านเฉพาะ paid_at (ได้ ${monthReads.join(' | ')})`)
  pass(`AC27 getPaidMonths ${months.length} เดือน ใหม่ → เก่า (${months[0].month} … ${months[months.length - 1].month}) รวม ${paidTotal} ใบ = paid + refund_confirmed · อ่านเฉพาะ paid_at 2 หน้า`)

  // ══ AC28: เดือนผิดรูปแบบ → error โดยไม่อ่าน expense_claims เลย ═════════════════════════
  for (const who of [ADMIN, null]) {
    if (who) loginAs(who)
    else logout()
    for (const bad of ['2026-13', "2026-09' or 1=1", '2026-00', '2026-9', '26-09', '', ' 2026-09', '2026-09-01', '2026-09\n']) {
      before = claimReads()
      const res = await getClaims({ status: PAID, paidMonth: bad })
      assert.deepEqual(res.data, [], `paidMonth ${JSON.stringify(bad)}: ต้องได้ data []`)
      assert.ok(typeof res.error === 'string' && res.error.length > 0, `paidMonth ${JSON.stringify(bad)}: ต้องได้ error`)
      assert.equal(claimReads(), before, `paidMonth ${JSON.stringify(bad)}: ต้องไม่อ่าน expense_claims`)
    }
    before = claimReads()
    assert.ok((await getClaims({ paidMonth: 202609 as unknown as string })).error, 'paidMonth ที่ไม่ใช่สตริงต้องได้ error')
    assert.equal(claimReads(), before)
  }
  pass(`AC28 paidMonth '2026-13', "2026-09' or 1=1" และรูปแบบผิดอื่น → { data: [], error } ไม่มีการอ่าน expense_claims (ทั้งแอดมินและไม่ล็อกอิน)`)

  // ── อ่านพังกลางทาง → error ทั้งชุด ไม่คืนรายการครึ่งๆ ────────────────────────────────
  loginAs(ADMIN)
  failAtRead = claimReads() + 2 // หน้าที่สองของ getClaims()
  const broken = await getClaims()
  assert.deepEqual(broken.data, [], 'หน้าที่สองพัง ต้องไม่คืนหน้าแรก')
  assert.match(String(broken.error), /statement timeout/)
  failAtRead = claimReads() + 3 // ระหว่างอ่านสามชุดของ open
  const brokenOpen = await getClaims({ open: true })
  assert.deepEqual(brokenOpen.data, [])
  assert.ok(brokenOpen.error)
  failAtRead = claimReads() + 2
  assert.deepEqual(await quietly(() => getPaidMonths()), [], 'getPaidMonths พังกลางทาง → []')
  failAtRead = null
  assert.equal((await load()).length, TOTAL, 'หายพังแล้วกลับมาครบ')
  pass('อ่านพังกลางทาง (getClaims / open / getPaidMonths) → ไม่คืนรายการครึ่งๆ')

  console.log('\nfinance-claims-load: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
