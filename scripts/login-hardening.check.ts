// ล็อกอิน/เปลี่ยน PIN กัน brute-force (รายงานความปลอดภัย 2026-10-29 ข้อ M10) + CSP report-only (M14)
// รัน loginWithPhoneAndSelfie / changePin ตัวจริงกับฐานข้อมูลจำลองในหน่วยความจำ + rpc จำลอง + logActivity ตัวจริง
// Run:  npx tsx scripts/login-hardening.check.ts
//
// ไม่แตะฐานข้อมูล หรือเครือข่ายจริง: แทน next/headers, next/cache, next/navigation และ @/lib/supabase-server
// ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/session-hardening.check.ts) · ผู้ใช้ทั้งหมดสังเคราะห์
// ครอบคลุม: ข้อความเดียวสำหรับเบอร์ไม่พบ/PIN ผิด · นับผิดผ่าน rpc increment_failed_login (atomic) และ fallback
// เมื่อยังไม่รัน migration · ครั้งที่ 10 ล็อก · บัญชีถูกระงับไม่ใช่ช่องทดลอง PIN · ล็อกอินสำเร็จตั้ง session
// · limiter ต่อเบอร์ (สลับ IP ไม่ช่วย) · changePin จำกัด 5 ครั้ง/15 นาที · next.config.ts มี CSP report-only
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "login-hardening: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import bcrypt from 'bcryptjs'

process.env.SESSION_SECRET = 'login-hardening-check'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

const ROOT = path.resolve(__dirname, '..')
const PIN = '123456'
const PIN_HASH = bcrypt.hashSync(PIN, 4)
const WRONG = '000000'

// ── ผู้ใช้ (สังเคราะห์ทั้งหมด) ─────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const LOCKME = uid(1), FALLBACK = uid(2), BLOCKED = uid(3), OK = uid(4), PENDING = uid(5), PINCHANGER = uid(6)
const PHONE: Record<string, string> = {
  [LOCKME]: '0810000001', [FALLBACK]: '0810000002', [BLOCKED]: '0810000003',
  [OK]: '0810000004', [PENDING]: '0810000005', [PINCHANGER]: '0810000006',
}
const UNKNOWN_PHONE = '0899999999'
const FLOOD_PHONE = '0877777777'

const person = (id: string, over: Row = {}): Row => ({
  id, phone: PHONE[id], pin: PIN_HASH, role: 'staff', is_approved: true, is_blocked: false,
  active_session_id: null, failed_login_attempts: 0, locked_until: null,
  department: 'สตาฟ', full_name: `ผู้ใช้ทดสอบ ${id.slice(-2)}`, nickname: 'ทดสอบ',
  ...over,
})

/** ตาราง → คอลัมน์ที่มีจริง (select/filter/insert/update ที่อ้างคอลัมน์อื่น = assert ล้ม) */
const SCHEMA: Record<string, string[]> = {
  profiles: Object.keys(person(OK)),
  login_logs: ['id', 'user_id'],
  activity_logs: ['id', 'user_id', 'action_type', 'target_user_id', 'details', 'ip_address', 'user_agent', 'location', 'latitude', 'longitude'],
  ip_rules: ['id', 'ip_address', 'rule_type', 'expires_at', 'is_active'],
}

const db: Record<string, Row[]> = {}
type Op = { table: string; action: 'select' | 'insert' | 'update'; cols: string; filters: string[]; payload?: Row }
/** ทุกคำขอที่ถึงฐานข้อมูล (รวม rpc เป็น table = 'rpc:<ชื่อ>') */
const ops: Op[] = []
const rpcCalls: { fn: string; args: Row }[] = []
/** 'ok' = มีฟังก์ชันแล้ว · 'missing' = ยังไม่ได้รัน migration (42883) */
let rpcMode: 'ok' | 'missing' = 'ok'
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

function reset() {
  db.profiles = [
    person(LOCKME), person(FALLBACK), person(BLOCKED, { is_blocked: true }), person(OK, { failed_login_attempts: 2 }),
    person(PENDING, { is_approved: false }), person(PINCHANGER, { active_session_id: 'sess-pin' }),
  ]
  db.login_logs = []
  db.activity_logs = []
  db.ip_rules = []
  ops.length = 0
  rpcCalls.length = 0
  rpcMode = 'ok'
  cookieJar.clear()
}

// ── ฐานข้อมูลจำลอง (PostgREST เฉพาะที่โค้ดเหล่านี้ใช้) ───────────────────────────────
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
  private one: 'single' | 'maybeSingle' | null = null
  constructor(private table: string) {
    assert.ok(SCHEMA[table], `ตัวจำลองไม่มีตาราง ${table}`)
  }

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
  eq(c: string, v: unknown) {
    this.known(c)
    this.filterText.push(`eq:${c}=${String(v)}`)
    this.filters.push(r => r[c] === v)
    return this
  }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private known(col: string) {
    assert.ok(SCHEMA[this.table].includes(col), `ไม่มีคอลัมน์ ${this.table}.${col}`)
  }

  private run(): Result {
    ops.push({ table: this.table, action: this.action, cols: this.cols, filters: [...this.filterText], ...(this.action === 'select' ? {} : { payload: clone(this.payload) }) })
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
    const cols = this.cols.split(',').map(c => c.trim()).filter(Boolean)
    for (const c of cols) if (c !== '*') this.known(c)
    const page = hits.map(r => (cols.includes('*') ? clone(r) : Object.fromEntries(cols.map(c => [c, clone(r[c])]))))
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

/** rpc จำลอง — increment_failed_login ทำแบบเดียวกับ migration 20261030 */
async function fakeRpc(fn: string, args: Row): Promise<Result> {
  rpcCalls.push({ fn, args: clone(args) })
  ops.push({ table: `rpc:${fn}`, action: 'update', cols: '', filters: [] })
  assert.equal(fn, 'increment_failed_login', `ตัวจำลองไม่มี rpc ${fn}`)
  if (rpcMode === 'missing') return { data: null, error: { code: '42883', message: 'function does not exist' } }
  const r = db.profiles.find(p => p.id === args.p_user)
  if (!r) return { data: null, error: null }
  const next = Number(r.failed_login_attempts ?? 0) + 1
  r.failed_login_attempts = next
  if (next >= Number(args.p_max)) r.locked_until = new Date(Date.now() + Number(args.p_lock_minutes) * 60_000).toISOString()
  return { data: next, error: null }
}
const fakeClient = strict({ from: (table: string) => strict(new Query(table)), rpc: fakeRpc })

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const cookieStore = {
  get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) as string } : undefined),
  has: (k: string) => cookieJar.has(k),
  getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  set: (k: string, v: string) => { cookieJar.set(k, v) },
  delete: (k: string) => { cookieJar.delete(k) },
}
let currentIp = '10.0.0.1'
let ipCounter = 1
/** IP ใหม่ทุกครั้ง — limiter ต่อ IP+เบอร์ (5 ครั้ง) จะได้ไม่บังเคสที่ต้องการทดสอบ */
const freshIp = () => { ipCounter++; currentIp = `10.0.${Math.floor(ipCounter / 250)}.${ipCounter % 250}` }

type RedirectSignal = Error & { digest: 'NEXT_REDIRECT'; target: string }
function fakeRedirect(target: string): never {
  throw Object.assign(new Error(`NEXT_REDIRECT ${target}`), { digest: 'NEXT_REDIRECT' as const, target })
}

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const mockCache = new Map<string, unknown>()
const mocks: [RegExp, (real: () => Record<string, unknown>) => unknown][] = [
  [/supabase-server$/, () => ({
    createServiceClient: () => fakeClient,
    supabaseServer: fakeClient,
    removeStorageByUrls: async () => assert.fail('removeStorageByUrls ไม่ควรถูกเรียกในสคริปต์นี้'),
  })],
  [/^next\/headers$/, () => ({
    cookies: async () => cookieStore,
    headers: async () => ({ get: (k: string) => (k === 'x-forwarded-for' ? currentIp : null) }),
  })],
  [/^next\/cache$/, () => ({ revalidatePath() {}, revalidateTag() {} })],
  [/^next\/navigation$/, real => ({ ...real(), redirect: fakeRedirect, permanentRedirect: fakeRedirect })],
]
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  if (!hit) return realLoad.call(this, request, ...rest)
  const key = hit[0].source
  if (!mockCache.has(key)) mockCache.set(key, hit[1](() => realLoad.call(this, request, ...rest) as Record<string, unknown>))
  return mockCache.get(key)
}

globalThis.fetch = (async () => assert.fail('ห้ามเรียกเครือข่ายในสคริปต์นี้')) as typeof fetch

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const loginActions = () => require('../app/login/actions') as typeof import('../app/login/actions')
const profileActions = () => require('../app/(authenticated)/profile/actions') as typeof import('../app/(authenticated)/profile/actions')
/* eslint-enable @typescript-eslint/no-require-imports */

const INVALID = 'เบอร์โทรหรือ PIN ไม่ถูกต้อง'
const TOO_MANY = /^พยายามเข้าสู่ระบบมากเกินไป กรุณารอ \d+ นาที$/
const BLOCKED_MSG = 'บัญชีของคุณถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ'

const row = (id: string) => {
  const r = db.profiles.find(p => p.id === id)
  assert.ok(r, `ไม่พบผู้ใช้ ${id}`)
  return r
}
const profileUpdates = () => ops.filter(o => o.table === 'profiles' && o.action === 'update')

type LoginOutcome = { error?: string; redirect?: string }
/** เรียก loginWithPhoneAndSelfie จาก IP ใหม่ — คืน error หรือปลายทาง redirect */
async function login(phone: string, pin: string, opts: { sameIp?: boolean } = {}): Promise<LoginOutcome> {
  if (!opts.sameIp) freshIp()
  const fd = new FormData()
  fd.set('phone', phone)
  fd.set('pin', pin)
  const { loginWithPhoneAndSelfie } = loginActions()
  try {
    const res = await loginWithPhoneAndSelfie({} as Parameters<typeof loginWithPhoneAndSelfie>[0], fd) as { error?: string } | undefined
    return { error: res?.error }
  } catch (e) {
    const s = e as Partial<RedirectSignal>
    if (s.digest === 'NEXT_REDIRECT') return { redirect: String(s.target) }
    throw e
  }
}

// ── ตัวรันหัวข้อ ──────────────────────────────────────────────────────────────
const failures: string[] = []
async function section(name: string, run: () => Promise<void>) {
  reset()
  try {
    await run()
    console.log(`PASS  ${name}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    failures.push(`${name}\n      ${msg.split('\n')[0]}`)
    console.error(`FAIL  ${name}\n      ${msg.split('\n')[0]}`)
  }
}

async function main() {
  await section('1 เบอร์ไม่พบ กับ PIN ผิด → ข้อความเดียวกัน · PIN ผิดเรียก rpc increment_failed_login ครั้งเดียว ไม่เขียน profiles ตรง', async () => {
    const unknown = await login(UNKNOWN_PHONE, PIN)
    assert.equal(unknown.error, INVALID, 'เบอร์ไม่พบ')
    assert.equal(rpcCalls.length, 0, 'เบอร์ไม่พบ → ไม่นับ')

    const wrong = await login(PHONE[LOCKME], WRONG)
    assert.equal(wrong.error, unknown.error, 'PIN ผิด ต้องได้ข้อความเดียวกับเบอร์ไม่พบ')
    assert.deepEqual(rpcCalls, [{ fn: 'increment_failed_login', args: { p_user: LOCKME, p_max: 10, p_lock_minutes: 30 } }])
    assert.equal(row(LOCKME).failed_login_attempts, 1, 'ตัวนับในฐานข้อมูลจำลองเพิ่มเป็น 1')
    assert.equal(profileUpdates().length, 0, 'มี rpc แล้ว → ไม่ read-modify-write')
  })

  await section('2 PIN ผิดครบ 10 ครั้ง → ล็อก (ข้อความ "พยายามเข้าสู่ระบบมากเกินไป") · เหลือ ≤ 3 ครั้งบอกจำนวน · ล็อกแล้ว PIN ถูกก็เข้าไม่ได้', async () => {
    const errors: (string | undefined)[] = []
    for (let i = 0; i < 10; i++) errors.push((await login(PHONE[LOCKME], WRONG)).error)
    for (let i = 0; i < 6; i++) assert.equal(errors[i], INVALID, `ครั้งที่ ${i + 1}`)
    assert.equal(errors[6], `${INVALID} (เหลืออีก 3 ครั้ง)`)
    assert.equal(errors[7], `${INVALID} (เหลืออีก 2 ครั้ง)`)
    assert.equal(errors[8], `${INVALID} (เหลืออีก 1 ครั้ง)`)
    assert.equal(errors[9], 'พยายามเข้าสู่ระบบมากเกินไป กรุณารอ 30 นาที', 'ครั้งที่ 10 → ล็อก')
    assert.equal(rpcCalls.length, 10)
    assert.equal(row(LOCKME).failed_login_attempts, 10)
    assert.ok(row(LOCKME).locked_until, 'ตั้ง locked_until')
    assert.ok(db.activity_logs.some(l => l.action_type === 'ACCOUNT_LOCKED' && l.user_id === LOCKME), 'บันทึก ACCOUNT_LOCKED')

    const after = await login(PHONE[LOCKME], PIN)
    assert.match(String(after.error), TOO_MANY, 'ล็อกอยู่ → PIN ถูกก็ไม่ผ่าน')
    assert.equal(row(LOCKME).active_session_id, null)
    assert.equal(rpcCalls.length, 10, 'ล็อกอยู่ → ไม่เทียบ PIN ไม่นับเพิ่ม')
  })

  await section('3 rpc ยังไม่ deploy (42883) → fallback เขียน failed_login_attempts ด้วย update แบบเดิม', async () => {
    rpcMode = 'missing'
    const res = await login(PHONE[FALLBACK], WRONG)
    assert.equal(res.error, INVALID)
    assert.equal(rpcCalls.length, 1, 'ลอง rpc ก่อน')
    assert.equal(profileUpdates().length, 1, 'fallback เขียน profiles 1 ครั้ง')
    assert.deepEqual(profileUpdates()[0].payload, { failed_login_attempts: 1 })
    assert.deepEqual(profileUpdates()[0].filters, [`eq:id=${FALLBACK}`])
    assert.equal(row(FALLBACK).failed_login_attempts, 1)
  })

  await section('4 บัญชีถูกระงับ/รออนุมัติ: PIN ผิด → ข้อความกลาง + นับ · PIN ถูก → ข้อความระงับ/รออนุมัติ ไม่ตั้ง session', async () => {
    const wrong = await login(PHONE[BLOCKED], WRONG)
    assert.equal(wrong.error, INVALID, 'บัญชีถูกระงับ + PIN ผิด → ไม่บอกว่าถูกระงับ')
    assert.equal(row(BLOCKED).failed_login_attempts, 1, 'ยังนับความผิด')

    const right = await login(PHONE[BLOCKED], PIN)
    assert.equal(right.error, BLOCKED_MSG)
    assert.equal(row(BLOCKED).active_session_id, null)
    assert.equal(cookieJar.size, 0, 'ไม่ตั้ง cookie')
    assert.equal(db.login_logs.length, 0)

    assert.equal((await login(PHONE[PENDING], WRONG)).error, INVALID, 'รออนุมัติ + PIN ผิด → ข้อความกลาง')
    assert.equal((await login(PHONE[PENDING], PIN)).error, 'Your account is pending approval by an admin.')
    assert.equal(row(PENDING).active_session_id, null)
    assert.equal(cookieJar.size, 0)
  })

  await section('5 PIN ถูก → ตั้ง active_session_id + cookie session_token / session_id · ล้างตัวนับ', async () => {
    const res = await login(PHONE[OK], PIN)
    assert.equal(res.redirect, '/dashboard', `ต้อง redirect (ได้ ${JSON.stringify(res)})`)
    const sid = row(OK).active_session_id
    assert.ok(typeof sid === 'string' && sid.length > 0, 'ตั้ง active_session_id')
    assert.equal(cookieJar.get('session_id'), sid, 'cookie session_id ตรงกับ active_session_id')
    assert.ok(cookieJar.get('session_token')?.startsWith(`${OK}:`), 'cookie session_token ของผู้ใช้นี้')
    assert.equal(row(OK).failed_login_attempts, 0, 'ล้างตัวนับ')
    assert.equal(db.login_logs.length, 1)
    assert.equal(rpcCalls.length, 0)
  })

  await section('6 เบอร์เดียว สลับ IP ทุกครั้ง: ครั้งที่ 21 → ข้อความ rate limit ก่อนอ่านฐานข้อมูล', async () => {
    for (let i = 1; i <= 20; i++) {
      const r = await login(FLOOD_PHONE, WRONG)
      assert.equal(r.error, INVALID, `ครั้งที่ ${i} ยังผ่าน limiter`)
    }
    ops.length = 0
    const r21 = await login(FLOOD_PHONE, WRONG)
    assert.match(String(r21.error), TOO_MANY, 'ครั้งที่ 21 → rate limit')
    assert.equal(ops.length, 0, 'ไม่แตะฐานข้อมูลเลย')
    // เบอร์อื่นจาก IP เดิมยังเข้าได้ (limiter ต่อเบอร์ ไม่ใช่ทั้งระบบ)
    assert.equal((await login(UNKNOWN_PHONE, WRONG, { sameIp: true })).error, INVALID)
  })

  await section('7 changePin: ครั้งที่ 6 ภายใน 15 นาที → "เปลี่ยน PIN บ่อยเกินไป"', async () => {
    const { changePin } = profileActions()
    cookieJar.set('session_token', createSessionToken(PINCHANGER))
    cookieJar.set('session_id', 'sess-pin')
    const input = { currentPin: WRONG, newPin: '654321', confirmPin: '654321' }
    for (let i = 1; i <= 5; i++) {
      assert.deepEqual(await changePin(input), { error: 'PIN ปัจจุบันไม่ถูกต้อง' }, `ครั้งที่ ${i}`)
    }
    const sixth = await changePin(input)
    assert.match(String((sixth as { error?: string }).error), /^เปลี่ยน PIN บ่อยเกินไป กรุณารอ \d+ นาที$/)
    assert.equal(profileUpdates().length, 0, 'ไม่เปลี่ยน PIN')
  })

  await section('8 static: next.config.ts มี Content-Security-Policy-Report-Only และไม่มี X-XSS-Protection', async () => {
    const src = fs.readFileSync(path.join(ROOT, 'next.config.ts'), 'utf8')
    assert.ok(!/X-XSS-Protection/.test(src), 'ลบ X-XSS-Protection')
    assert.equal((src.match(/'Content-Security-Policy-Report-Only'/g) ?? []).length, 2, 'มี CSP report-only ทั้งสอง source')
    assert.ok(/frame-ancestors/.test(src) && /object-src 'none'/.test(src))
  })

  if (failures.length) {
    console.error(`\nlogin-hardening: ไม่ผ่าน ${failures.length} หัวข้อ`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nlogin-hardening: ผ่านทั้งหมด')
}

main().catch(e => { console.error('FAIL ', e); process.exit(1) })
