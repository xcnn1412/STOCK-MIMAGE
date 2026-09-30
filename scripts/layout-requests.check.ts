// ส่วนที่อยู่ทุกหน้า (app/(authenticated)/layout.tsx + กระดิ่ง/ป๊อปอัปแจ้งเตือน) — ขั้น 3 (v1.27.0) ของ docs/specs/finance-refactor-plan.md
// Run:  npx tsx scripts/layout-requests.check.ts
//
// สิ่งที่ตรวจ (ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง ไม่ต้องมี env):
//   1. เรียก AuthenticatedLayout ตัวจริงด้วยฐานข้อมูลจำลอง (แอดมิน / พนักงาน / ไม่ได้ล็อกอิน / ตาราง documents ยังไม่มี)
//      → รอบของฐานข้อมูลที่ต้องรอต่อกัน ≤ 2 (ก่อน: แอดมิน 4 = ตรวจ session → โปรไฟล์ → World Cup → นับเอกสาร · พนักงาน 3)
//      ไม่อ่าน worldcup_predictions · props ของ Sidebar / ProfileCompletionChecker เหมือนเดิม · กระดิ่ง 1 ตัว ป๊อปอัป 1 ตัว
//   2. GET /api/notifications/count ตัวจริง → { count, total } (count ตาม ?since แบบเดิม · total = ยังไม่อ่านทั้งหมด)
//      สองตัวเลขนับพร้อมกันในรอบเดียว · ไม่ได้ล็อกอิน = 401 และไม่อ่าน notifications
//   3. components/notification-poll.ts (ตัวถามตัวเลขตัวเดียวของแท็บ) กับ timer/fetch/localStorage จำลอง:
//      สมาชิกกี่ตัวก็มี setInterval เดียว fetch เดียวต่อรอบ · ส่ง ?since จากเวลาเปิดกระดิ่ง · คำตอบเก่าที่มาช้าไม่ทับคำตอบใหม่
//      · สมาชิกตัวสุดท้ายออก = หยุดถาม และไม่ส่งตัวเลขเก่าให้สมาชิกรุ่นถัดไป
//   4. ตรวจข้อความในโค้ด: components/worldcup ไม่มีแล้ว · ไม่มีคำว่า worldcup ใน layout/sidebar · <NotificationBell มีที่เดียว ·
//      setInterval( และ fetch('/api/notifications/count มีเฉพาะใน notification-poll.ts ที่ละครั้ง (POLL_MS = 30_000)
//      · คำขอเบื้องหลังต่อนาทีต่อแท็บคำนวณจากโค้ด: ตอนนี้ 2 · ของ 3248bde (อ่านด้วย `git show` ถ้ามี) 8
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "layout-requests: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createElement, isValidElement, type ReactElement, type ReactNode } from 'react'

process.env.SESSION_SECRET = 'layout-requests-check'
process.env.LICENSE_EXPIRES_AT = '2099-12-31'

const ROOT = path.resolve(__dirname, '..')
const pass = (label: string) => console.log(`PASS  ${label}`)

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null; count?: number | null }

// ── ข้อมูลสังเคราะห์ ────────────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF = uid(2)
const person = (id: string, over: Row): Row => ({
  id, role: 'staff', is_approved: true, active_session_id: `sess-${id}`, department: 'สตาฟ',
  full_name: 'ผู้ใช้ทดสอบ', nickname: 'ทดสอบ', allowed_modules: ['stock'],
  national_id: '0000000000001', address: 'ที่อยู่ทดสอบ ถนนทดสอบ แขวงทดสอบ',
  bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-00001-0', account_holder_name: 'บัญชีทดสอบ',
  ...over,
})
const SINCE = '2026-09-30T05:00:00.000Z'
const note = (n: number, userId: string, isRead: boolean, createdAt: string): Row => ({ id: uid(500 + n), user_id: userId, is_read: isRead, created_at: createdAt })

const SCHEMA: Record<string, string[]> = {
  profiles: Object.keys(person(ADMIN, {})),
  documents: ['id', 'status'],
  notifications: ['id', 'user_id', 'is_read', 'created_at'],
  // มีไว้ให้ตัวจำลองจดได้ว่ามีคนอ่าน (layout ของ 3248bde อ่านตารางนี้ทุกหน้า) — ของใหม่ต้องไม่อ่าน
  worldcup_predictions: ['user_id', 'team'],
}
const db: Record<string, Row[]> = {}
/** ตารางที่ "ยังไม่ได้รัน migration" ใน instance นี้ → error 42P01 */
const missingTables = new Set<string>()
function reset() {
  db.profiles = [
    // แอดมินโปรไฟล์ครบ · โมดูลที่ได้รับเอง stock + finance
    person(ADMIN, { role: 'admin', full_name: 'แอดมินทดสอบ', allowed_modules: ['stock', 'finance'] }),
    // พนักงานโปรไฟล์ไม่ครบ: ไม่มีชื่อเล่น เลขบัตรไม่ครบ 13 หลัก
    person(STAFF, { nickname: null, national_id: '123', allowed_modules: ['finance', 'jobs'] }),
  ]
  db.documents = [
    { id: uid(301), status: 'pending_approval' }, { id: uid(302), status: 'pending_approval' },
    { id: uid(303), status: 'pending_approval' }, { id: uid(304), status: 'approved' },
  ]
  db.notifications = [
    note(1, ADMIN, false, '2026-09-29T01:00:00.000Z'), note(2, ADMIN, false, '2026-09-29T02:00:00.000Z'),
    note(3, ADMIN, false, '2026-09-30T03:00:00.000Z'), note(4, ADMIN, false, '2026-09-30T06:00:00.000Z'),
    note(5, ADMIN, false, '2026-09-30T07:00:00.000Z'), note(6, ADMIN, true, '2026-09-30T08:00:00.000Z'),
    note(7, ADMIN, true, '2026-09-28T08:00:00.000Z'), note(8, STAFF, false, '2026-09-30T09:00:00.000Z'),
  ]
  db.worldcup_predictions = [{ user_id: ADMIN, team: 'thailand' }]
  missingTables.clear()
}

// ── ตัวจำลอง PostgREST + ตัวนับรอบ ───────────────────────────────────────────────
// รอบ = คำขอที่เริ่มตอนไม่มีคำขออื่นค้างอยู่ (คำขอที่ค้างทั้งหมดตอบพร้อมกันเป็นชุดใน setImmediate —
// คำขอที่ส่งพร้อมกันด้วย Promise.all อยู่รอบเดียวกัน คำขอที่รอผลของอีกอันนับเป็นรอบถัดไป) — นิยามเดียวกับ finance-speed-baseline
type Op = { table: string; cols: string; filters: string[]; head: boolean; round: number }
const meter = { rounds: 0, ops: [] as Op[] }
let wave: (() => void)[] = []
function schedule<T>(run: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (wave.length === 0) {
      meter.rounds++
      setImmediate(flush)
    }
    wave.push(() => {
      try {
        resolve(run())
      } catch (e) {
        reject(e)
      }
    })
  })
}
function flush() {
  const batch = wave
  wave = []
  for (const run of batch) run()
}
const tick = () => new Promise<void>(r => setImmediate(r))
async function settle() {
  for (let i = 0; i < 20; i++) await tick()
  assert.equal(wave.length, 0, 'ยังมีคำขอค้าง')
}
const resetMeter = () => { meter.rounds = 0; meter.ops = []; wave = [] }

/** เรียกเมธอดที่ตัวจำลองไม่มี → throw ทันที (กันโค้ดจริงใช้ฟีเจอร์ที่ไม่ได้เลียนแบบแล้วผ่านแบบเงียบ) */
function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${String(prop)}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

class Query implements PromiseLike<Result> {
  private cols = '*'
  private head = false
  private counted = false
  private filters: ((r: Row) => boolean)[] = []
  private filterText: string[] = []
  private one: 'single' | 'maybeSingle' | null = null
  constructor(private table: string) {
    assert.ok(SCHEMA[table], `ตัวจำลองไม่มีตาราง ${table}`)
  }
  select(cols = '*', options?: { count?: 'exact'; head?: boolean }) {
    if (options) {
      assert.deepEqual(Object.keys(options).sort(), ['count', 'head'], 'ตัวจำลองรองรับเฉพาะ { count: "exact", head: true }')
      assert.equal(options.count, 'exact')
      assert.equal(options.head, true)
      this.counted = true
      this.head = true
    }
    this.cols = cols.replace(/\s+/g, ' ').trim()
    return this
  }
  eq(c: string, v: unknown) { return this.where(c, `eq:${c}=${String(v)}`, r => r[c] === v) }
  gt(c: string, v: string) { return this.where(c, `gt:${c}=${v}`, r => r[c] != null && Date.parse(String(r[c])) > Date.parse(v)) }
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
  private run(round: number): Result {
    meter.ops.push({ table: this.table, cols: this.cols, filters: [...this.filterText], head: this.head, round })
    if (missingTables.has(this.table)) return { data: null, error: { code: '42P01', message: `relation "${this.table}" does not exist` }, count: null }
    const cols = this.cols.split(',').map(c => c.trim()).filter(Boolean)
    for (const c of cols) if (c !== '*') this.known(c)
    const hits = db[this.table].filter(r => this.filters.every(f => f(r)))
    if (this.counted) return { data: null, error: null, count: hits.length }
    const rows = hits.map(r => (cols.includes('*') ? { ...r } : Object.fromEntries(cols.map(c => [c, r[c]]))))
    if (!this.one) return { data: rows, error: null }
    if (rows.length === 1) return { data: rows[0], error: null }
    if (rows.length === 0 && this.one === 'maybeSingle') return { data: null, error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${rows.length}` } }
  }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const round = meter.rounds + (wave.length === 0 ? 1 : 0)
    return schedule(() => this.run(round)).then(onfulfilled, onrejected)
  }
}
const fakeClient = strict({ from: (table: string) => strict(new Query(table)) })

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const mocked = new Map<string, unknown>()
const mocks: [RegExp, () => unknown][] = [
  [/supabase-server$/, () => ({
    createServiceClient: () => fakeClient,
    supabaseServer: fakeClient,
    removeStorageByUrls: async () => assert.fail('removeStorageByUrls ไม่ควรถูกเรียกในสคริปต์นี้'),
  })],
  [/^next\/headers$/, () => ({
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  })],
  [/^next\/cache$/, () => ({ revalidatePath() {}, revalidateTag() {} })],
  [/lib\/logger$/, () => ({ logActivity: async () => assert.fail('logActivity ไม่ควรถูกเรียกในสคริปต์นี้') })],
]
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  if (!hit) return realLoad.call(this, request, ...rest)
  const key = hit[0].source
  if (!mocked.has(key)) mocked.set(key, hit[1]())
  return mocked.get(key)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const AuthenticatedLayout = (require('../app/(authenticated)/layout') as typeof import('../app/(authenticated)/layout')).default
const Sidebar = (require('../components/sidebar') as typeof import('../components/sidebar')).default
const NotificationBell = (require('../components/notification-bell') as typeof import('../components/notification-bell')).default
const NotificationToastContainer = (require('../components/notification-toast') as typeof import('../components/notification-toast')).default
const ProfileCompletionChecker = (require('../components/profile-completion-checker') as typeof import('../components/profile-completion-checker')).default
const countRoute = require('../app/api/notifications/count/route') as typeof import('../app/api/notifications/count/route')
/* eslint-enable @typescript-eslint/no-require-imports */

function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}

/** ทุก element ในต้นไม้ที่ layout คืน (ไม่ render client component — ดูเฉพาะสิ่งที่ layout สร้าง) */
function elements(node: unknown, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) {
    for (const n of node) elements(n, out)
    return out
  }
  if (!isValidElement(node)) return out
  out.push(node)
  elements((node.props as { children?: unknown }).children, out)
  return out
}
const propsOf = (els: ReactElement[], type: unknown) => {
  const hits = els.filter(e => e.type === type)
  assert.equal(hits.length, 1, `ต้องมี ${(type as { name?: string }).name ?? 'element'} หนึ่งตัว (ได้ ${hits.length})`)
  return hits[0].props as Row
}

type LayoutRun = { els: ReactElement[]; rounds: number; ops: Op[] }
async function runLayout(userId: string | null): Promise<LayoutRun> {
  resetMeter()
  if (userId) loginAs(userId)
  else cookieJar.clear()
  const tree = await AuthenticatedLayout({ children: createElement('section', null, 'เนื้อหาหน้า') as ReactNode })
  await settle()
  return { els: elements(tree), rounds: meter.rounds, ops: [...meter.ops] }
}

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const countOf = (src: string, needle: string | RegExp) =>
  typeof needle === 'string' ? src.split(needle).length - 1 : (src.match(new RegExp(needle.source, needle.flags.includes('g') ? needle.flags : needle.flags + 'g')) ?? []).length

// ══ 1. layout ═══════════════════════════════════════════════════════════════
/** ตัวเลข "ก่อน" วัดด้วยสคริปต์นี้กับ layout ของ 3248bde (v1.26.0) ก่อนแก้ — layout เดิม import components/worldcup ที่ลบแล้ว จึงวัดซ้ำไม่ได้ */
const BEFORE_LAYOUT_ROUNDS = { admin: 4, staff: 3 }

async function checkLayout() {
  reset()
  const admin = await runLayout(ADMIN)
  const staff = await runLayout(STAFF)
  console.log(`      รอบฐานข้อมูลของ layout: แอดมิน ${BEFORE_LAYOUT_ROUNDS.admin} → ${admin.rounds} · พนักงาน ${BEFORE_LAYOUT_ROUNDS.staff} → ${staff.rounds}`)

  for (const [who, run] of [['แอดมิน', admin], ['พนักงาน', staff]] as const) {
    assert.ok(run.rounds <= 2, `${who}: layout ใช้ ${run.rounds} รอบ (ต้อง ≤ 2)`)
    assert.equal(run.ops.filter(o => o.table === 'worldcup_predictions').length, 0, `${who}: ยังอ่าน worldcup_predictions`)
    assert.equal(run.els.filter(e => e.type === NotificationBell).length, 1, `${who}: ต้องมีกระดิ่งหนึ่งตัว`)
    assert.equal(run.els.filter(e => e.type === NotificationToastContainer).length, 1, `${who}: ต้องมีป๊อปอัปหนึ่งตัว`)
    const sidebar = propsOf(run.els, Sidebar)
    assert.ok(!('worldcupTeam' in sidebar), `${who}: Sidebar ยังได้ worldcupTeam`)
    assert.ok(run.els.every(e => typeof e.type !== 'function' || !/worldcup/i.test(e.type.name)), `${who}: ยังมี component ของ World Cup`)
    // โปรไฟล์อ่านครั้งเดียวต่อหน้า (ไม่นับการตรวจ session) และอ่านเฉพาะคอลัมน์เดิม
    const profileReads = run.ops.filter(o => o.table === 'profiles' && o.cols.startsWith('role, allowed_modules'))
    assert.equal(profileReads.length, 1, `${who}: อ่านโปรไฟล์ของ layout ${profileReads.length} ครั้ง`)
    assert.equal(profileReads[0].cols, 'role, allowed_modules, full_name, nickname, national_id, address, bank_name, bank_account_number, account_holder_name')
  }

  // แอดมิน: นับเอกสารรออนุมัติพร้อมกับอ่านโปรไฟล์ (รอบเดียวกัน) · badge เหมือนเดิม · โมดูลของแอดมินเติมเหมือนเดิม
  const docReads = admin.ops.filter(o => o.table === 'documents')
  assert.equal(docReads.length, 1, 'แอดมินนับเอกสารรออนุมัติหนึ่งครั้ง')
  assert.deepEqual(docReads[0].filters, ['eq:status=pending_approval'])
  assert.equal(docReads[0].head, true, 'นับแบบ head (ไม่ดึงแถว)')
  const adminProfileRound = admin.ops.find(o => o.table === 'profiles' && o.cols.startsWith('role, allowed_modules'))!.round
  assert.equal(docReads[0].round, adminProfileRound, 'นับเอกสารต้องอยู่รอบเดียวกับอ่านโปรไฟล์')
  const adminSidebar = propsOf(admin.els, Sidebar)
  assert.equal(adminSidebar.role, 'admin')
  assert.deepEqual(adminSidebar.allowedModules, ['stock', 'finance', 'admin', 'overview', 'content', 'documents', 'salary'])
  assert.deepEqual(adminSidebar.badges, { '/documents/approvals': 3 })
  assert.deepEqual(propsOf(admin.els, ProfileCompletionChecker).missingFields, [])
  pass(`layout แอดมิน: ${admin.rounds} รอบ (ตรวจ session → โปรไฟล์ + นับเอกสารรออนุมัติพร้อมกัน) · ไม่อ่าน worldcup_predictions · badge รออนุมัติ 3 · กระดิ่ง 1 ป๊อปอัป 1`)

  // พนักงาน: ไม่นับเอกสาร ไม่มี badge
  assert.equal(staff.ops.filter(o => o.table === 'documents').length, 0, 'พนักงานไม่ต้องนับเอกสารรออนุมัติ')
  const staffSidebar = propsOf(staff.els, Sidebar)
  assert.equal(staffSidebar.role, 'staff')
  assert.deepEqual(staffSidebar.allowedModules, ['finance', 'jobs'])
  assert.deepEqual(staffSidebar.badges, {})
  assert.deepEqual(propsOf(staff.els, ProfileCompletionChecker).missingFields, ['nickname', 'national_id'])
  pass(`layout พนักงาน: ${staff.rounds} รอบ · ไม่นับเอกสาร · โมดูลและช่องโปรไฟล์ที่ขาดเหมือนเดิม`)

  // ไม่ได้ล็อกอิน: ไม่อ่านฐานข้อมูลเลย ค่าเริ่มต้นเดิม
  const guest = await runLayout(null)
  assert.equal(guest.rounds, 0, 'ไม่ได้ล็อกอินต้องไม่อ่านฐานข้อมูล')
  const guestSidebar = propsOf(guest.els, Sidebar)
  assert.equal(guestSidebar.role, undefined)
  assert.deepEqual(guestSidebar.allowedModules, ['stock'])
  assert.deepEqual(guestSidebar.badges, {})
  pass('layout ไม่ได้ล็อกอิน: 0 รอบ · ค่าเริ่มต้นเดิม (stock)')

  // instance ที่ยังไม่มีตาราง documents: หน้าไม่พัง ไม่มี badge
  missingTables.add('documents')
  const noDocs = await runLayout(ADMIN)
  assert.ok(noDocs.rounds <= 2)
  assert.deepEqual(propsOf(noDocs.els, Sidebar).badges, {})
  missingTables.clear()
  pass('layout แอดมินเมื่อยังไม่มีตาราง documents: ไม่พัง ไม่มี badge')

  // ผู้ใช้ที่ถูกเตะออก (session ไม่ตรง) = เหมือนไม่ได้ล็อกอิน
  loginAs(STAFF)
  cookieJar.set('session_id', 'sess-other-device')
  resetMeter()
  const kicked = elements(await AuthenticatedLayout({ children: null }))
  await settle()
  assert.equal(meter.ops.filter(o => o.table !== 'profiles').length, 0)
  assert.deepEqual(propsOf(kicked, Sidebar).allowedModules, ['stock'])
  pass('layout เมื่อ session ถูกแทนที่: ไม่อ่านอะไรต่อ ค่าเริ่มต้นเดิม')
}

// ══ 2. GET /api/notifications/count ════════════════════════════════════════════
async function callCount(userId: string | null, query = '') {
  resetMeter()
  if (userId) loginAs(userId)
  else cookieJar.clear()
  const res = await countRoute.GET(new Request(`http://localhost/api/notifications/count${query}`))
  await settle()
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, rounds: meter.rounds, ops: [...meter.ops] }
}

async function checkRoute() {
  reset()
  const withSince = await callCount(ADMIN, `?since=${encodeURIComponent(SINCE)}`)
  assert.equal(withSince.status, 200)
  assert.deepEqual(withSince.body, { count: 2, total: 5 }, 'count = ยังไม่อ่านหลัง since · total = ยังไม่อ่านทั้งหมด')
  assert.equal(withSince.rounds, 2, 'ตรวจ session + สองตัวเลขพร้อมกัน = 2 รอบ')
  const noteOps = withSince.ops.filter(o => o.table === 'notifications')
  assert.equal(noteOps.length, 2)
  assert.ok(noteOps.every(o => o.head && o.round === noteOps[0].round), 'สองตัวเลขต้องนับแบบ head ในรอบเดียวกัน')
  assert.ok(noteOps.every(o => o.filters.includes(`eq:user_id=${ADMIN}`) && o.filters.includes('eq:is_read=false')), 'นับเฉพาะของผู้ใช้ที่ยังไม่อ่าน')
  pass(`GET /api/notifications/count?since=… → ${JSON.stringify(withSince.body)} · ${withSince.rounds} รอบ (สองตัวเลขพร้อมกัน)`)

  const noSince = await callCount(ADMIN)
  assert.deepEqual(noSince.body, { count: 5, total: 5 }, 'ไม่ส่ง since = count เท่ากับยังไม่อ่านทั้งหมด (แบบเดิม)')
  assert.ok(noSince.rounds <= 2)
  const staff = await callCount(STAFF, `?since=${encodeURIComponent(SINCE)}`)
  assert.deepEqual(staff.body, { count: 1, total: 1 }, 'นับเฉพาะของผู้ใช้คนนั้น')
  pass('GET ไม่ส่ง since → count = total (แบบเดิม) · นับเฉพาะของผู้ใช้คนนั้น')

  const guest = await callCount(null)
  assert.equal(guest.status, 401, 'ไม่ได้ล็อกอินต้องได้ 401')
  assert.deepEqual(guest.body, { count: 0, total: 0 })
  assert.equal(guest.ops.length, 0, 'ไม่ได้ล็อกอินต้องไม่อ่านฐานข้อมูล')
  pass('GET ไม่ได้ล็อกอิน → 401 { count: 0, total: 0 } ไม่อ่านฐานข้อมูล')
}

// ══ 3. components/notification-poll.ts ═══════════════════════════════════════
type Timer = { fn: () => unknown; ms: number; cleared: boolean }
async function checkPoll() {
  const g = globalThis as unknown as Record<string, unknown>
  const saved = { setInterval: g.setInterval, clearInterval: g.clearInterval, fetch: g.fetch, localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage') }
  const timers: Timer[] = []
  const urls: string[] = []
  const store = new Map<string, string>()
  type Reply = { status: number; body: unknown } | Error
  const replies: (() => Promise<Reply>)[] = []
  const reply = (body: unknown, status = 200) => () => Promise.resolve<Reply>({ status, body })

  g.setInterval = (fn: () => unknown, ms: number) => { timers.push({ fn, ms, cleared: false }); return timers.length }
  g.clearInterval = (id: number) => { if (timers[id - 1]) timers[id - 1].cleared = true }
  g.fetch = async (url: string) => {
    urls.push(String(url))
    const next = replies.shift()
    assert.ok(next, `fetch ที่ไม่ได้คาดไว้: ${url}`)
    const r = await next()
    if (r instanceof Error) throw r
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } })
  }
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) },
  })

  try {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const poll = require('../components/notification-poll') as typeof import('../components/notification-poll')
    /* eslint-enable @typescript-eslint/no-require-imports */
    assert.equal(poll.POLL_MS, 30_000)
    const active = () => timers.filter(t => !t.cleared)
    const runTimers = async () => { for (const t of active()) await t.fn(); await settle() }
    const seen = { a: [] as unknown[], b: [] as unknown[], c: [] as unknown[], d: [] as unknown[] }

    // สมาชิกสองตัว (กระดิ่ง + ป๊อปอัป) → timer เดียว fetch เดียว ทั้งสองได้ตัวเลขชุดเดียวกัน
    replies.push(reply({ count: 3, total: 5 }))
    const offA = poll.subscribeNotificationCount(c => seen.a.push(c))
    const offB = poll.subscribeNotificationCount(c => seen.b.push(c))
    await settle()
    assert.equal(timers.length, 1, 'สมาชิกสองตัวต้องมี setInterval เดียว')
    assert.equal(timers[0].ms, 30_000)
    assert.deepEqual(urls, ['/api/notifications/count'], 'ถามครั้งแรกทันทีครั้งเดียว (ยังไม่เคยเปิดกระดิ่ง = ไม่มี since)')
    assert.deepEqual(seen.a, [{ count: 3, total: 5 }])
    assert.deepEqual(seen.b, [{ count: 3, total: 5 }])

    // หนึ่งนาที = 2 รอบของ timer = 2 คำขอ ไม่ว่าจะมีสมาชิกกี่ตัว · ส่ง since จากเวลาเปิดกระดิ่งครั้งล่าสุด
    store.set(poll.LAST_SEEN_KEY, SINCE)
    replies.push(reply({ count: 0, total: 5 }), reply({ count: 1, total: 6 }))
    await runTimers()
    await runTimers()
    assert.equal(urls.length, 3, 'หนึ่งนาทีหลังเริ่มต้องมี 2 คำขอ')
    assert.equal(urls[1], `/api/notifications/count?since=${encodeURIComponent(SINCE)}`)
    assert.deepEqual(seen.b.at(-1), { count: 1, total: 6 })
    const perMinute = active().reduce((s, t) => s + 60_000 / t.ms, 0)
    assert.equal(perMinute, 2, 'คำขอเบื้องหลังต่อนาทีต่อแท็บ = 2')

    // สมาชิกที่มาทีหลังได้ตัวเลขล่าสุดทันที ไม่ถามเพิ่ม ไม่เพิ่ม timer
    const offC = poll.subscribeNotificationCount(c => seen.c.push(c))
    assert.deepEqual(seen.c, [{ count: 1, total: 6 }])
    assert.equal(urls.length, 3)
    assert.equal(active().length, 1)

    // คำตอบเก่าที่มาช้าต้องไม่ทับคำตอบใหม่ (เช่น ถามค้างอยู่แล้วผู้ใช้เปิดกระดิ่ง → refresh)
    let releaseOld: (r: Reply) => void = () => {}
    replies.push(() => new Promise<Reply>(r => { releaseOld = r }), reply({ count: 0, total: 7 }))
    const oldReq = poll.refreshNotificationCount()
    const newReq = poll.refreshNotificationCount()
    await newReq
    releaseOld({ status: 200, body: { count: 9, total: 9 } })
    await oldReq
    await settle()
    assert.deepEqual(seen.a.at(-1), { count: 0, total: 7 }, 'คำตอบเก่าที่มาทีหลังถูกทิ้ง')

    // server ตอบ error / เครือข่ายล่ม → ไม่แจ้งสมาชิก (ตัวเลขเดิมค้างไว้) และไม่มี error หลุด
    const before = seen.a.length
    replies.push(reply({ error: 'x' }, 500), () => Promise.resolve(new Error('offline')))
    await poll.refreshNotificationCount()
    await poll.refreshNotificationCount()
    assert.equal(seen.a.length, before, 'คำตอบที่ไม่ ok ต้องไม่ถูกส่งต่อ')

    // สมาชิกออกครบ → หยุดถาม · สมาชิกรุ่นถัดไป (เช่น เข้าสู่ระบบใหม่ในแท็บเดิม) ไม่ได้ตัวเลขเก่า เริ่ม timer ใหม่
    offA(); offB()
    assert.equal(active().length, 1, 'ยังมีสมาชิกเหลือ timer ต้องเดินต่อ')
    offC()
    assert.equal(active().length, 0, 'สมาชิกตัวสุดท้ายออกต้อง clearInterval')
    replies.push(reply({ count: 4, total: 4 }))
    const offD = poll.subscribeNotificationCount(c => seen.d.push(c))
    assert.deepEqual(seen.d, [], 'ไม่ส่งตัวเลขของรอบก่อนให้สมาชิกรุ่นใหม่')
    await settle()
    assert.deepEqual(seen.d, [{ count: 4, total: 4 }])
    assert.equal(active().length, 1)
    offD()
    assert.equal(active().length, 0)
    assert.equal(replies.length, 0, 'fetch ต้องถูกเรียกครบตามที่คาด')
    pass('notification-poll: สมาชิกกี่ตัวก็ setInterval(30_000) เดียว fetch เดียวต่อรอบ (2 คำขอ/นาที) · since จากเวลาเปิดกระดิ่ง · คำตอบเก่าไม่ทับใหม่ · error ไม่หลุด · หยุดเมื่อไม่มีสมาชิก')
  } finally {
    g.setInterval = saved.setInterval
    g.clearInterval = saved.clearInterval
    g.fetch = saved.fetch
    if (saved.localStorage) Object.defineProperty(globalThis, 'localStorage', saved.localStorage)
    else delete g.localStorage
  }
}

// ══ 4. ข้อความในโค้ด ═══════════════════════════════════════════════════════════
type NotifSources = { layout: string; sidebar: string; bell: string; toast: string; poll: string | null }
/** ms ของอาร์กิวเมนต์ที่สองของ setInterval — ตัวเลข (มี _ ได้) หรือชื่อค่าคงที่ในไฟล์เดียวกัน */
function intervalsOf(src: string): number[] {
  return [...src.matchAll(/setInterval\(\s*[\w.]+\s*,\s*([\w_]+)\s*\)/g)].map(m => {
    const arg = m[1]
    if (/^[\d_]+$/.test(arg)) return Number(arg.replace(/_/g, ''))
    const def = new RegExp(`const\\s+${arg}\\s*=\\s*([\\d_]+)`).exec(src)
    assert.ok(def, `หา ${arg} ของ setInterval ไม่เจอ`)
    return Number(def[1].replace(/_/g, ''))
  })
}
/**
 * คำขอเบื้องหลังต่อนาทีต่อแท็บของกระดิ่ง/ป๊อปอัป: component ที่ถามเองคูณจำนวนตัวที่ mount (กระดิ่งใน layout + sidebar)
 * · notification-poll.ts เป็นตัวเดียวต่อแท็บ (นับครั้งเดียวเมื่อมีผู้ใช้)
 * ตัวที่ซ่อนด้วย CSS (hidden md:block / md:hidden) ยัง mount และถามอยู่ — นับด้วย
 */
function requestsPerMinute(s: NotifSources): number {
  const bells = countOf(s.layout + s.sidebar, /<NotificationBell\b/g)
  const toasts = countOf(s.layout + s.sidebar, /<NotificationToastContainer\b/g)
  const perMin = (src: string) => intervalsOf(src).reduce((sum, ms) => sum + 60_000 / ms, 0)
  return bells * perMin(s.bell) + toasts * perMin(s.toast) + (s.poll && bells + toasts > 0 ? perMin(s.poll) : 0)
}

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.next', '.git'].includes(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else if (/\.(tsx?|mjs|js)$/.test(entry.name)) out.push(full)
  }
  return out
}

function checkSources() {
  assert.ok(!fs.existsSync(path.join(ROOT, 'components', 'worldcup')), 'components/worldcup ต้องถูกลบ')
  const now: NotifSources = {
    layout: read('app/(authenticated)/layout.tsx'),
    sidebar: read('components/sidebar.tsx'),
    bell: read('components/notification-bell.tsx'),
    toast: read('components/notification-toast.tsx'),
    poll: read('components/notification-poll.ts'),
  }
  assert.doesNotMatch(now.layout, /worldcup/i, 'layout.tsx ยังมีคำว่า worldcup')
  assert.doesNotMatch(now.sidebar, /worldcup/i, 'sidebar.tsx ยังมีคำว่า worldcup')
  const importers = [...walkFiles(path.join(ROOT, 'app')), ...walkFiles(path.join(ROOT, 'components')), ...walkFiles(path.join(ROOT, 'lib'))]
    .filter(f => /components\/worldcup/.test(fs.readFileSync(f, 'utf8')))
  assert.deepEqual(importers.map(f => path.relative(ROOT, f)), [], 'ยังมีไฟล์อ้าง components/worldcup')
  assert.match(read('lib/logger.ts'), /'WORLDCUP_PICK'/, "เก็บ ActionType 'WORLDCUP_PICK' ไว้ให้ประวัติเก่า")
  pass('World Cup: components/worldcup ถูกลบ · ไม่มีคำว่า worldcup ใน layout/sidebar · ไม่มีไฟล์อ้าง · ActionType เดิมยังอยู่ให้ประวัติเก่า')

  assert.equal(countOf(now.layout + now.sidebar, /<NotificationBell\b/g), 1, 'layout + sidebar ต้องมี <NotificationBell ที่เดียว')
  assert.equal(countOf(now.layout, /<NotificationBell\b/g), 1, 'กระดิ่งอยู่ใน layout')
  assert.equal(countOf(now.layout + now.sidebar, /<NotificationToastContainer\b/g), 1)
  assert.equal(countOf(now.bell, 'setInterval('), 0, 'notification-bell.tsx ต้องไม่มี setInterval(')
  assert.equal(countOf(now.toast, 'setInterval('), 0, 'notification-toast.tsx ต้องไม่มี setInterval(')
  assert.equal(countOf(now.poll!, 'setInterval('), 1, 'notification-poll.ts มี setInterval( ครั้งเดียว')
  assert.deepEqual(intervalsOf(now.poll!), [30_000], 'setInterval ของ notification-poll.ts ทุก 30_000')
  assert.match(now.poll!, /POLL_MS\s*=\s*30_000/)
  for (const [name, src, want] of [['bell', now.bell, 0], ['toast', now.toast, 0], ['poll', now.poll!, 1]] as const) {
    assert.equal(countOf(src, "fetch('/api/notifications/count"), want, `${name}: fetch('/api/notifications/count ต้องมี ${want} ที่`)
    assert.equal(countOf(src, 'fetch('), want, `${name}: fetch( ต้องมี ${want} ที่`)
  }
  assert.equal(countOf(now.bell + now.toast, '/api/notifications/count'), 0, 'กระดิ่ง/ป๊อปอัปต้องไม่ถาม /api/notifications/count เอง')
  for (const [name, src] of [['notification-bell.tsx', now.bell], ['notification-toast.tsx', now.toast]] as const) {
    assert.match(src, /import \{[^}]*\bsubscribeNotificationCount\b[^}]*\} from '@\/components\/notification-poll'/, `${name} ต้องรับตัวเลขจาก notification-poll`)
  }
  const route = read('app/api/notifications/count/route.ts')
  assert.match(route, /NextResponse\.json\(\{ count, total \}\)/, 'route.ts ต้องคืน { count, total }')
  assert.match(route, /getSessionLight\(\)/, 'route.ts ยังตรวจ session')
  assert.match(route, /Promise\.all\(/, 'route.ts นับสองตัวเลขพร้อมกัน')

  const after = requestsPerMinute(now)
  assert.equal(after, 2, `คำขอเบื้องหลังต่อนาทีต่อแท็บ = ${after} (ต้อง 2)`)
  let beforeText = '8 (ค่าที่บันทึกไว้ — อ่าน 3248bde ไม่ได้)'
  try {
    const show = (file: string) => execFileSync('git', ['show', `3248bde:${file}`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    const before = requestsPerMinute({
      layout: show('app/(authenticated)/layout.tsx'),
      sidebar: show('components/sidebar.tsx'),
      bell: show('components/notification-bell.tsx'),
      toast: show('components/notification-toast.tsx'),
      poll: null,
    })
    assert.equal(before, 8, `3248bde ควรได้ 8 คำขอ/นาที (ได้ ${before})`)
    beforeText = `${before} (3248bde: กระดิ่ง 2 ตัว × ทุก 30 วินาที + ป๊อปอัป × ทุก 15 วินาที)`
  } catch (e) {
    if (e instanceof assert.AssertionError) throw e
  }
  console.log(`      คำขอเบื้องหลังต่อนาทีต่อแท็บ: ${beforeText} → ${after}`)
  pass('กระดิ่ง <NotificationBell ที่เดียว · setInterval( และ fetch(\'/api/notifications/count มีเฉพาะ notification-poll.ts ที่ละครั้ง (30_000) · route คืน { count, total } · 8 → 2 คำขอ/นาที')
}

async function main() {
  await checkLayout()
  await checkRoute()
  await checkPoll()
  checkSources()
  console.log('\nlayout-requests: ผ่านทั้งหมด')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
