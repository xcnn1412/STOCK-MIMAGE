// เลิกรับ session แบบเก่า (v1.24.2) — ตัวตนต้องมาจาก session_token ที่เซ็นแล้ว + session_id ที่ตรงกับ
// active_session_id (ไม่เป็น null) ของโปรไฟล์ที่อนุมัติแล้วเท่านั้น · บทบาทมาจากฐานข้อมูลเสมอ
// รัน requireAuth / getSessionLight / server action / layout / route ตัวจริงกับฐานข้อมูลจำลองในหน่วยความจำ
// + token ที่เซ็นจริง (lib/session) + logActivity ตัวจริง แล้วตรวจไฟล์ในโปรเจกต์แบบ static อีกชุด
// Run:  npx tsx scripts/session-hardening.check.ts
//
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง: แทน next/headers, next/cache, next/navigation และ @/lib/supabase-server
// ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/finance-access.check.ts) · ผู้ใช้ทั้งหมดสังเคราะห์
// ครอบคลุม: (a) cookie แบบเก่าอย่างเดียว (b) active_session_id เป็น null (c) ไม่มี session_id (d) session_id ไม่ตรง
// (e) token พนักงาน + cookie แอดมินปลอม (f) ถูกระงับ (g) ยังไม่อนุมัติ (h) แอดมินจริงทำได้ (i) พนักงานจริงได้ข้อมูลตัวเอง
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "session-hardening: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { isValidElement, type ReactElement } from 'react'

process.env.SESSION_SECRET = 'session-hardening-check'
delete process.env.GEMINI_API_KEY

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

const ROOT = path.resolve(__dirname, '..')

// ── ผู้ใช้ (สังเคราะห์ทั้งหมด) ─────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF = uid(2), LOGGED_OUT = uid(3), BLOCKED = uid(4), PENDING = uid(5)

const person = (id: string, n: number, over: Row): Row => ({
  id, role: 'staff', is_approved: true, is_blocked: false, active_session_id: null,
  department: 'สตาฟ', full_name: `ผู้ใช้ทดสอบ ${n}`, nickname: `ทดสอบ${n}`, phone: `08000000${n}0`,
  national_id: `000000000000${n}`, address: `ที่อยู่ทดสอบ ${n}`,
  bank_name: 'ธนาคารทดสอบ', bank_account_number: `000-0-0000${n}-0`, account_holder_name: `บัญชีทดสอบ ${n}`,
  signature_url: null, avatar_url: null,
  ...over,
})

/** ตาราง → คอลัมน์ที่มีจริง (select/filter/insert/update ที่อ้างคอลัมน์อื่น = assert ล้ม) */
const SCHEMA: Record<string, string[]> = {
  profiles: Object.keys(person(ADMIN, 1, {})),
  activity_logs: ['id', 'user_id', 'action_type', 'target_user_id', 'details', 'ip_address', 'user_agent', 'location', 'latitude', 'longitude'],
}

const db: Record<string, Row[]> = {}
type Op = { table: string; action: 'select' | 'insert' | 'update' | 'delete'; cols: string; filters: string[]; payload?: Row }
/** ทุกคำขอที่ถึงฐานข้อมูล */
const ops: Op[] = []
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

function reset() {
  db.profiles = [
    person(ADMIN, 1, { role: 'admin', active_session_id: 'sess-admin' }),
    person(STAFF, 2, { active_session_id: 'sess-staff' }),
    // แอดมินที่ออกจากระบบแล้ว — token ยังถูกต้อง (ยังไม่หมดอายุ) แต่ active_session_id เป็น null
    person(LOGGED_OUT, 3, { role: 'admin', active_session_id: null }),
    // ถูกระงับ: toggleUserBlock ล้าง active_session_id ด้วย
    person(BLOCKED, 4, { role: 'admin', is_blocked: true, active_session_id: null }),
    person(PENDING, 5, { is_approved: false, active_session_id: 'sess-pending' }),
  ]
  db.activity_logs = []
  ops.length = 0
  deletedCookies.length = 0
  cookieJar.clear()
}

// ── ฐานข้อมูลจำลอง (PostgREST เฉพาะที่โค้ดเหล่านี้ใช้) ───────────────────────────────
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
const fakeClient = strict({ from: (table: string) => strict(new Query(table)) })

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
/** ชื่อ cookie ที่โค้ดสั่งลบ (ตามลำดับ) */
const deletedCookies: string[] = []
const cookieStore = {
  get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) as string } : undefined),
  has: (k: string) => cookieJar.has(k),
  getAll: () => [...cookieJar].map(([name, value]) => ({ name, value })),
  set: (k: string, v: string) => { cookieJar.set(k, v) },
  delete: (k: string) => { deletedCookies.push(k); cookieJar.delete(k) },
}
/** redirect() ตัวจำลอง — โยนออบเจกต์ที่มี digest + target ให้ตรวจปลายทางได้ตรง ๆ */
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
    headers: async () => ({ get: () => null }),
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

// ห้ามออกเครือข่าย (route ของ AI ต้องหยุดก่อนถึง fetch เพราะไม่มี GEMINI_API_KEY)
globalThis.fetch = (async () => assert.fail('ห้ามเรียกเครือข่ายในสคริปต์นี้')) as typeof fetch

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const { requireAuth, getSessionLight } = require('../lib/auth') as typeof import('../lib/auth')
const { logActivity } = require('../lib/logger') as typeof import('../lib/logger')
// ไฟล์ของ action / หน้า โหลดในแต่ละหัวข้อ — ไฟล์หนึ่งโหลดไม่ขึ้นจะได้ไม่ล้มทุกหัวข้อ
const userActions = () => require('../app/(authenticated)/users/user-actions') as typeof import('../app/(authenticated)/users/user-actions')
const usersActions = () => require('../app/(authenticated)/users/actions') as typeof import('../app/(authenticated)/users/actions')
const profileActions = () => require('../app/(authenticated)/profile/actions') as typeof import('../app/(authenticated)/profile/actions')
const loginActions = () => require('../app/login/actions') as typeof import('../app/login/actions')
const SettingsLayout = () => (require('../app/(authenticated)/settings/layout') as typeof import('../app/(authenticated)/settings/layout')).default
const KpiLayout = () => (require('../app/(authenticated)/kpi/layout') as typeof import('../app/(authenticated)/kpi/layout')).default
const KpiNav = () => (require('../app/(authenticated)/kpi/kpi-nav') as typeof import('../app/(authenticated)/kpi/kpi-nav')).default
const aiRoute = () => require('../app/api/ai-analyze/route') as typeof import('../app/api/ai-analyze/route')
/* eslint-enable @typescript-eslint/no-require-imports */

// ── สถานะ cookie ที่ใช้ทดสอบ ──────────────────────────────────────────────────────
const FOUR_COOKIES = ['session_token', 'session_user_id', 'session_role', 'session_id']
function jar(cookies: Record<string, string>) {
  cookieJar.clear()
  for (const [k, v] of Object.entries(cookies)) cookieJar.set(k, v)
}
/** session ที่เซ็นถูกต้อง + session_id (+ cookie อื่นที่อยากยัดเพิ่ม) */
const signed = (userId: string, sessionId: string, extra: Record<string, string> = {}) =>
  ({ session_token: createSessionToken(userId), session_id: sessionId, ...extra })
const FORGED_ADMIN = { session_user_id: ADMIN, session_role: 'admin' }

type Scenario = [label: string, cookies: () => Record<string, string>]
/** (a) cookie แบบเก่าอย่างเดียว — เคยพาเข้าได้ทุกที่ */
const LEGACY_ONLY: Scenario = ['(a) cookie แบบเก่าอย่างเดียว session_user_id=แอดมิน + session_role=admin + session_id ตรง', () => ({ ...FORGED_ADMIN, session_id: 'sess-admin' })]
/** (e) token ของพนักงานเอง + cookie แบบเก่าปลอมเป็นแอดมิน */
const STAFF_FORGED: Scenario = ['(e) token พนักงาน + session_user_id=แอดมิน + session_role=admin', () => signed(STAFF, 'sess-staff', FORGED_ADMIN)]
const ADMIN_VALID: Scenario = ['(h) แอดมินที่ล็อกอินถูกต้อง', () => signed(ADMIN, 'sess-admin')]

const profileWrites = () => ops.filter(o => o.table === 'profiles' && o.action !== 'select')
const allWrites = () => ops.filter(o => o.action !== 'select')
const row = (id: string) => {
  const r = db.profiles.find(p => p.id === id)
  assert.ok(r, `ไม่พบผู้ใช้ ${id}`)
  return r
}

async function expectRedirect(label: string, run: () => unknown, targets: string[]) {
  let thrown: unknown
  try {
    await run()
  } catch (e) {
    thrown = e
  }
  assert.ok(thrown, `${label}: ต้อง redirect (แต่ทำงานต่อได้)`)
  const signal = thrown as Partial<RedirectSignal>
  assert.equal(signal.digest, 'NEXT_REDIRECT', `${label}: ต้องเป็น redirect (ได้ ${String(thrown)})`)
  assert.ok(targets.includes(String(signal.target)), `${label}: redirect ไป ${targets.join(' หรือ ')} (ได้ ${signal.target})`)
  return String(signal.target)
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

// ── ตัวรันหัวข้อ: หัวข้อที่ล้มถูกจดไว้ แล้วรันหัวข้อถัดไปต่อ (สรุปท้ายสคริปต์ — ล้มหัวข้อเดียว = ไม่ผ่าน) ─────
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
  // ══ 1. requireAuth / getSessionLight: ตัวตนมาจาก token ที่เซ็น + session_id ที่ตรงกับ active_session_id เท่านั้น ══
  await section('1 requireAuth / getSessionLight — (a)(b)(c)(d)(f)(g) ได้ null · (h) แอดมินได้ role admin · (i)+(e) พนักงานที่ปลอม cookie ยังเป็นพนักงาน', async () => {
    const rejected: Scenario[] = [
      LEGACY_ONLY,
      ['(a) cookie แบบเก่าของคนที่ออกจากระบบแล้ว', () => ({ session_user_id: LOGGED_OUT, session_role: 'admin' })],
      ['(b) token ถูกต้องแต่ active_session_id เป็น null (ออกจากระบบแล้ว)', () => signed(LOGGED_OUT, 'anything')],
      ['(c) token พนักงานถูกต้องแต่ไม่มี session_id', () => ({ session_token: createSessionToken(STAFF) })],
      ['(c) token พนักงาน + session_id ว่าง', () => signed(STAFF, '')],
      ['(d) token พนักงาน + session_id ของเครื่องอื่น', () => signed(STAFF, 'sess-elsewhere')],
      ['(f) บัญชีที่ถูกระงับ', () => signed(BLOCKED, 'sess-blocked')],
      ['(g) บัญชีที่ยังไม่อนุมัติ', () => signed(PENDING, 'sess-pending')],
      ['token ลายเซ็นปลอมของแอดมิน', () => ({ session_token: `${ADMIN}:${Date.now()}:${'0'.repeat(64)}`, session_id: 'sess-admin' })],
    ]
    for (const [label, cookies] of rejected) {
      jar(cookies())
      assert.equal(await requireAuth(), null, `requireAuth: ${label} → null`)
      jar(cookies())
      assert.equal((await getSessionLight()).userId, undefined, `getSessionLight: ${label} → userId undefined`)
      assert.equal((await getSessionLight()).role, undefined, `getSessionLight: ${label} → role undefined`)
    }

    jar(ADMIN_VALID[1]())
    ops.length = 0
    const admin = await requireAuth()
    assert.equal(admin?.userId, ADMIN, '(h) แอดมินจริงได้ session')
    assert.equal(admin?.role, 'admin', '(h) role มาจากฐานข้อมูล')
    assert.equal(admin?.sessionId, 'sess-admin')
    // คอลัมน์ที่ requireAuth อ่าน — คงเดิม (ไม่มี '*' ไม่มีคอลัมน์บัญชี)
    const authSelects = ops.filter(o => o.table === 'profiles' && o.action === 'select')
    assert.equal(authSelects.length, 1, 'requireAuth อ่าน profiles ครั้งเดียว')
    assert.deepEqual(authSelects[0].cols.split(',').map(c => c.trim()), ['id', 'role', 'is_approved', 'active_session_id', 'department', 'full_name', 'nickname'])
    assert.deepEqual(await getSessionLight(), { userId: ADMIN, role: 'admin', sessionId: 'sess-admin' })

    jar(STAFF_FORGED[1]())
    const staff = await requireAuth()
    assert.equal(staff?.userId, STAFF, '(e) token พนักงาน + cookie แอดมินปลอม → ตัวตนคือพนักงาน')
    assert.equal(staff?.role, 'staff', '(e) role ไม่ขึ้นกับ cookie session_role')
    assert.deepEqual(await getSessionLight(), { userId: STAFF, role: 'staff', sessionId: 'sess-staff' }, '(e) getSessionLight ได้ role จากฐานข้อมูล')
    // แอดมินเปลี่ยนบทบาทแล้วมีผลทันที (ไม่ต้องรอ cookie)
    row(STAFF).role = 'admin'
    assert.equal((await requireAuth())?.role, 'admin', 'role อ่านจากฐานข้อมูลทุกครั้ง')
  })

  // ══ 2. server action ของแอดมิน: forceLogout / updateUserRole ══
  await section('2a (e)(a) forceLogout: พนักงาน+cookie แอดมินปลอม / cookie แบบเก่า → { error } ไม่เขียน profiles · (h) แอดมินจริงเตะออกได้', async () => {
    const { forceLogout } = userActions()
    for (const [label, cookies] of [STAFF_FORGED, LEGACY_ONLY]) {
      reset()
      jar(cookies())
      assert.deepEqual(await forceLogout(STAFF), { error: 'Admin เท่านั้น' }, `forceLogout: ${label}`)
      assert.deepEqual(await forceLogout(ADMIN), { error: 'Admin เท่านั้น' }, `forceLogout แอดมิน: ${label}`)
      assert.equal(profileWrites().length, 0, `forceLogout: ${label} → เขียน profiles 0 ครั้ง`)
      assert.equal(row(ADMIN).active_session_id, 'sess-admin')
      assert.equal(row(STAFF).active_session_id, 'sess-staff')
    }
    reset()
    jar(ADMIN_VALID[1]())
    assert.deepEqual(await forceLogout(STAFF), { success: true }, '(h) แอดมินจริง forceLogout ได้')
    assert.equal(profileWrites().length, 1)
    assert.deepEqual(profileWrites()[0].payload, { active_session_id: null })
    assert.deepEqual(profileWrites()[0].filters, [`eq:id=${STAFF}`])
    assert.equal(row(STAFF).active_session_id, null)
    // logActivity ตัวจริง: ผู้กระทำคือแอดมินจาก token
    const log = db.activity_logs.find(l => l.action_type === 'LOGOUT')
    assert.equal(log?.user_id, ADMIN, 'บันทึกประวัติด้วย id แอดมินจาก token')
  })

  await section('2b (e)(a) updateUserRole(พนักงาน, admin): พนักงาน+cookie แอดมินปลอม / cookie แบบเก่า → { error } ไม่เขียน profiles · (h) แอดมินจริงเปลี่ยนได้', async () => {
    const { updateUserRole } = usersActions()
    jar(STAFF_FORGED[1]())
    assert.deepEqual(await updateUserRole(STAFF, 'admin'), { error: 'เฉพาะ admin เท่านั้น' }, `updateUserRole: ${STAFF_FORGED[0]}`)
    assert.equal(profileWrites().length, 0, 'พนักงานเลื่อนตัวเองเป็นแอดมินไม่ได้ — เขียน profiles 0 ครั้ง')
    assert.equal(row(STAFF).role, 'staff')

    reset()
    jar(LEGACY_ONLY[1]())
    assert.deepEqual(await updateUserRole(STAFF, 'admin'), { error: 'Unauthorized: No active session' }, `updateUserRole: ${LEGACY_ONLY[0]}`)
    assert.equal(profileWrites().length, 0, 'cookie แบบเก่า → เขียน profiles 0 ครั้ง')

    reset()
    jar(ADMIN_VALID[1]())
    const res = await updateUserRole(STAFF, 'admin') as { error?: string } | undefined
    assert.equal(res?.error, undefined, '(h) แอดมินจริงเปลี่ยนบทบาทได้')
    assert.equal(profileWrites().length, 1)
    assert.deepEqual(profileWrites()[0].payload, { role: 'admin' })
    assert.deepEqual(profileWrites()[0].filters, [`eq:id=${STAFF}`])
    assert.equal(row(STAFF).role, 'admin')
  })

  await section('2c getMyProfile: (a) cookie แบบเก่า / (b) token ของคนที่ออกจากระบบแล้ว → null · (i) พนักงานได้แถวของตัวเองแม้ session_user_id=แอดมิน', async () => {
    const { getMyProfile } = profileActions()
    jar(LEGACY_ONLY[1]())
    assert.equal(await getMyProfile(), null, `getMyProfile: ${LEGACY_ONLY[0]}`)
    jar(signed(LOGGED_OUT, 'anything'))
    assert.equal(await getMyProfile(), null, 'getMyProfile: (b) token ของคนที่ออกจากระบบแล้ว')
    jar(STAFF_FORGED[1]())
    const own = await getMyProfile()
    assert.equal(own?.id, STAFF, '(i) พนักงานได้โปรไฟล์ของตัวเอง ไม่ใช่ของแอดมินตาม cookie')
    assert.equal(own?.bank_account_number, row(STAFF).bank_account_number)
    jar(ADMIN_VALID[1]())
    assert.equal((await getMyProfile())?.id, ADMIN)
  })

  // ══ 3. หน้า/เลย์เอาต์ ══
  await section('3a (e) settings/layout: พนักงาน+cookie แอดมินปลอม → redirect /dashboard · (a) cookie แบบเก่า → redirect · (h) แอดมินเห็นหน้า', async () => {
    const Layout = SettingsLayout()
    jar(STAFF_FORGED[1]())
    await expectRedirect(`settings/layout: ${STAFF_FORGED[0]}`, () => Layout({ children: null }), ['/dashboard'])
    jar(LEGACY_ONLY[1]())
    await expectRedirect(`settings/layout: ${LEGACY_ONLY[0]}`, () => Layout({ children: null }), ['/dashboard', '/login'])
    jar(ADMIN_VALID[1]())
    const el = await Layout({ children: 'เนื้อหา' })
    assert.ok(isValidElement(el), '(h) แอดมินได้ element ของหน้า')
  })

  await section('3b (e) kpi/layout: KpiNav isAdmin=false สำหรับพนักงาน+cookie แอดมินปลอม และ cookie แบบเก่า · (h) true สำหรับแอดมิน', async () => {
    const Layout = KpiLayout()
    const Nav = KpiNav()
    const isAdminProp = async () => {
      const el = await Layout({ children: null }) as ReactElement<{ children: unknown }>
      assert.ok(isValidElement(el), 'layout ต้องคืน element')
      const kids = ([] as unknown[]).concat(el.props.children)
      const nav = kids.find(c => isValidElement(c) && c.type === Nav) as ReactElement<{ isAdmin: boolean }> | undefined
      assert.ok(nav, 'ต้องมี <KpiNav>')
      return nav.props.isAdmin
    }
    jar(STAFF_FORGED[1]())
    assert.equal(await isAdminProp(), false, `kpi/layout: ${STAFF_FORGED[0]} → isAdmin false`)
    jar(LEGACY_ONLY[1]())
    assert.equal(await isAdminProp(), false, `kpi/layout: ${LEGACY_ONLY[0]} → isAdmin false`)
    jar(ADMIN_VALID[1]())
    assert.equal(await isAdminProp(), true, '(h) แอดมินจริง → isAdmin true')
  })

  // ══ 4. API (ไม่ผ่าน proxy.ts) ══
  await section('4 (e)(a) POST /api/ai-analyze: พนักงาน+cookie แอดมินปลอม / cookie แบบเก่า → 401 · (h) แอดมินผ่านการตรวจ (ไม่มี GEMINI_API_KEY → 500)', async () => {
    const { POST } = aiRoute()
    const call = () => POST(new Request('http://localhost:3000/api/ai-analyze', { method: 'POST', body: '{}' }) as Parameters<typeof POST>[0])
    for (const [label, cookies] of [STAFF_FORGED, LEGACY_ONLY, ['(b) token ของแอดมินที่ออกจากระบบแล้ว', () => signed(LOGGED_OUT, 'anything')] as Scenario]) {
      jar(cookies())
      const res = await call()
      assert.equal(res.status, 401, `ai-analyze: ${label} → 401`)
    }
    jar(ADMIN_VALID[1]())
    const res = await call()
    assert.equal(res.status, 500, '(h) แอดมินผ่านการตรวจสิทธิ์ แล้วหยุดที่ไม่มี GEMINI_API_KEY')
    assert.match(await res.text(), /GEMINI_API_KEY/)
  })

  // ══ 5. ออกจากระบบ ══
  await section('5 logout: พนักงานที่ล็อกอินถูกต้อง → ล้าง active_session_id ของตัวเอง ลบ cookie 4 ตัว ไป /login · cookie แบบเก่า → ไม่เขียนฐานข้อมูล ลบ cookie ไป /login', async () => {
    const { logout } = loginActions()
    jar(signed(STAFF, 'sess-staff'))
    await expectRedirect('logout พนักงาน', () => logout(), ['/login'])
    assert.equal(row(STAFF).active_session_id, null, 'active_session_id ของพนักงานเป็น null')
    assert.equal(row(ADMIN).active_session_id, 'sess-admin')
    assert.deepEqual(profileWrites().map(o => o.filters), [[`eq:id=${STAFF}`]])
    for (const name of FOUR_COOKIES) assert.ok(deletedCookies.includes(name), `logout ต้องลบ cookie ${name}`)
    assert.equal(db.activity_logs.find(l => l.action_type === 'LOGOUT')?.user_id, STAFF)

    // token พนักงาน + session_user_id=แอดมิน: ออกเฉพาะตัวเอง แอดมินไม่ถูกเตะ
    reset()
    jar(STAFF_FORGED[1]())
    await expectRedirect('logout พนักงาน+cookie แอดมินปลอม', () => logout(), ['/login'])
    assert.equal(row(STAFF).active_session_id, null)
    assert.equal(row(ADMIN).active_session_id, 'sess-admin', 'cookie session_user_id ปลอมเตะแอดมินออกไม่ได้')

    // (a) cookie แบบเก่าอย่างเดียว: เคยล้าง session ของแอดมินได้ (ใครก็เตะใครออกได้)
    reset()
    jar(LEGACY_ONLY[1]())
    await expectRedirect(`logout: ${LEGACY_ONLY[0]}`, () => logout(), ['/login'])
    assert.equal(allWrites().length, 0, 'cookie แบบเก่า → ไม่เขียนฐานข้อมูลเลย')
    assert.equal(row(ADMIN).active_session_id, 'sess-admin')
    for (const name of FOUR_COOKIES) assert.ok(deletedCookies.includes(name), `logout ต้องลบ cookie ${name} (cookie แบบเก่า)`)
  })

  // ══ 5b. ผู้กระทำใน activity_logs มาจาก token ที่เซ็นเท่านั้น ══
  await section('5b logActivity: ผู้กระทำมาจาก token ที่เซ็น — cookie session_user_id ไม่มีผล', async () => {
    jar(LEGACY_ONLY[1]())
    await logActivity('UPDATE_MY_PROFILE', {})
    jar(STAFF_FORGED[1]())
    await logActivity('UPDATE_MY_PROFILE', {})
    assert.deepEqual(db.activity_logs.map(l => l.user_id), [null, STAFF], 'cookie แบบเก่าอย่างเดียว → ไม่ระบุผู้กระทำ · token พนักงาน → พนักงาน')
    assert.equal(ops.filter(o => o.table === 'profiles').length, 0, 'logActivity ไม่อ่าน profiles')
  })

  // ══ 6. ตรวจไฟล์แบบ static ══
  await section('6 static: app/ lib/ components/ proxy.ts ไม่อ่าน cookie session_user_id / session_role · import cookies แล้วต้องเรียก cookies() · หน้าล็อกอินไม่ตั้ง cookie แบบเก่า', async () => {
    const files = [...['app', 'lib', 'components'].flatMap(d => walk(path.join(ROOT, d))), path.join(ROOT, 'proxy.ts')]
      .filter(f => /\.(ts|tsx)$/.test(f))
    assert.ok(files.length > 100, `ต้องสแกนไฟล์ได้จริง (ได้ ${files.length})`)

    const legacyRead = /\bget\(\s*['"`]session_(user_id|role)['"`]\s*\)/
    assert.ok(legacyRead.test("cookieStore.get('session_user_id')") && legacyRead.test('get("session_role")'), 'ตัวตรวจต้องจับรูปแบบนี้ได้')
    assert.deepEqual(files.filter(f => legacyRead.test(read(f))).map(rel), [], "ไฟล์ที่ยังอ่าน get('session_user_id') / get('session_role')")

    const importsCookies = /import\s*\{[^}]*\bcookies\b[^}]*\}\s*from\s*['"]next\/headers['"]/
    const unused = files.filter(f => { const s = read(f); return importsCookies.test(s) && !/\bcookies\(/.test(s) }).map(rel)
    assert.deepEqual(unused, [], "ไฟล์ที่ import cookies จาก 'next/headers' แต่ไม่ได้เรียก cookies()")

    const login = read(path.join(ROOT, 'app', 'login', 'actions.ts'))
    assert.ok(!/set\(\s*['"`]session_(user_id|role)['"`]/.test(login), "app/login/actions.ts ต้องไม่ set('session_user_id' / 'session_role')")
    assert.ok(/set\(\s*'session_token'/.test(login) && /set\(\s*'session_id'/.test(login), 'ยังตั้ง session_token + session_id ตอนล็อกอิน')
  })

  if (failures.length) {
    console.error(`\nsession-hardening: ไม่ผ่าน ${failures.length} หัวข้อ`)
    for (const f of failures) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\nsession-hardening: ผ่านทั้งหมด')
}

main().catch(e => { console.error('FAIL ', e); process.exit(1) })
