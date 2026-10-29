// สิทธิ์เช็คอิน (M8) + ตั้งค่างาน/ตั๋ว/KPI reply (M9) — รอบแก้ความปลอดภัยรอบ 3
// Run:  npx tsx scripts/checkin-jobs-access.check.ts
//
// ไม่แตะฐานข้อมูลจริง ไม่ต้องมี env: รัน server action ตัวจริงของ check-in กับฐานข้อมูลจำลองในหน่วยความจำ
// (ดัก Module._load แทน next/headers, next/cache, @/lib/supabase-server, reverse-geocode) + ตรวจแบบ static
// ข้อมูลทั้งหมดสังเคราะห์ · บรรทัดสุดท้ายต้องเป็น "checkin-jobs-access: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

process.env.SESSION_SECRET = 'checkin-jobs-access-check'

// ── ฐานข้อมูลจำลอง ──────────────────────────────────────────────────────────
type Row = Record<string, unknown>
const ADMIN = 'admin-1', STAFF = 'staff-1', OTHER = 'staff-2'
const person = (id: string, role: string): Row =>
  ({ id, role, is_approved: true, is_blocked: false, active_session_id: `sess-${id}`, full_name: `ผู้ใช้ ${id}`, nickname: null })

const nowIso = new Date().toISOString()
const db: Record<string, Row[]> = {
  profiles: [person(ADMIN, 'admin'), person(STAFF, 'staff'), person(OTHER, 'staff')],
  salary_duties: [{ code: 'onsite_staff', name_th: 'ออกงานสตาฟ', rate: 700, pay_mode: 'per_checkin', is_active: true, sort_order: 1 }],
  events: [
    { id: 'ev-team', name: 'งานที่จัดทีมแล้ว' },
    { id: 'ev-open', name: 'งานที่ยังไม่จัดทีม' },
  ],
  event_staff: [{ event_id: 'ev-team', user_id: OTHER, role: 'staff' }],
  job_cost_events: [],
  staff_checkins: [
    { id: 'c-mine', user_id: STAFF, check_type: 'onsite', event_id: 'ev-open', note: null, duties: ['onsite_staff'], paid_slip_id: null, checked_in_at: nowIso, checked_out_at: null, latitude: 13.7, longitude: 100.5, photo_url: 'https://x/mine.jpg', checkout_photo_url: null },
    { id: 'c-paid', user_id: STAFF, check_type: 'onsite', event_id: 'ev-open', note: null, duties: ['onsite_staff'], paid_slip_id: 'slip-9', checked_in_at: nowIso, checked_out_at: null, latitude: 13.7, longitude: 100.5, photo_url: null, checkout_photo_url: null },
    { id: 'c-other', user_id: OTHER, check_type: 'office', event_id: null, note: null, duties: [], paid_slip_id: null, checked_in_at: nowIso, checked_out_at: null, latitude: 14.1, longitude: 101.2, photo_url: 'https://x/other.jpg', checkout_photo_url: 'https://x/other-out.jpg' },
  ],
  activity_logs: [],
}

type Op = [string, string, unknown]
type Res = { data: unknown; error: { message: string } | null }
class Query implements PromiseLike<Res> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private ops: Op[] = []
  private one: 'single' | 'maybeSingle' | null = null
  constructor(private table: string) {}
  select() { return this }
  insert(rows: Row | Row[]) { this.action = 'insert'; this.payload = rows; return this }
  update(v: Row) { this.action = 'update'; this.payload = v; return this }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { this.ops.push(['eq', c, v]); return this }
  in(c: string, v: unknown[]) { this.ops.push(['in', c, v]); return this }
  gte(c: string, v: unknown) { this.ops.push(['gte', c, v]); return this }
  lte(c: string, v: unknown) { this.ops.push(['lte', c, v]); return this }
  lt(c: string, v: unknown) { this.ops.push(['lt', c, v]); return this }
  is(c: string, v: unknown) { this.ops.push(['is', c, v]); return this }
  or() { throw new Error('ห้ามใช้ .or() ในโค้ดอ่านใหม่') }
  order() { return this }
  limit() { return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }
  private match(r: Row) {
    return this.ops.every(([op, c, v]) => {
      const x = r[c]
      if (op === 'eq') return x === v
      if (op === 'in') return (v as unknown[]).includes(x)
      if (op === 'gte') return String(x) >= String(v)
      if (op === 'lte') return String(x) <= String(v)
      if (op === 'lt') return String(x) < String(v)
      if (op === 'is') return v === null ? x == null : x === v
      return true
    })
  }
  private run(): Res {
    const rows = (db[this.table] ||= [])
    if (this.action === 'insert') {
      for (const r of [this.payload].flat() as Row[]) rows.push({ id: `${this.table}-${rows.length + 1}`, ...r })
      return { data: null, error: null }
    }
    const hits = rows.filter(r => this.match(r))
    if (this.action === 'update') { for (const r of hits) Object.assign(r, this.payload); return { data: null, error: null } }
    if (this.action === 'delete') { db[this.table] = rows.filter(r => !hits.includes(r)); return { data: null, error: null } }
    const out = hits.map(r => JSON.parse(JSON.stringify(r)) as Row)
    if (this.one) {
      if (out.length !== 1 && this.one === 'single') return { data: null, error: { message: 'no rows' } }
      return { data: out[0] ?? null, error: null }
    }
    return { data: out, error: null }
  }
  then<A, B>(ok?: ((v: Res) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    return Promise.resolve().then(() => this.run()).then(ok, fail)
  }
}
const removed: string[] = []
const fakeClient = { from: (t: string) => new Query(t) }

const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, {
    createServiceClient: () => fakeClient,
    removeStorageByUrls: async (_c: unknown, _b: string, urls: unknown[]) => { removed.push(...urls.filter(Boolean).map(String)) },
  }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {}, refresh() {} }],
  [/reverse-geocode$/, { reverseGeocodeThai: async () => ({ province: null, district: null }) }],
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
const checkin = require('../app/(authenticated)/check-in/actions') as typeof import('../app/(authenticated)/check-in/actions')
const { canUseEvent, ownTicketAttachmentUrls } =
  require('../app/(authenticated)/jobs/ticket-logic') as typeof import('../app/(authenticated)/jobs/ticket-logic')
/* eslint-enable @typescript-eslint/no-require-imports */

function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
const logout = () => cookieJar.clear()
const pass = (label: string) => console.log(`PASS  ${label}`)
const row = (id: string) => db.staff_checkins.find(r => r.id === id)
const logsOf = (action: string) => db.activity_logs.filter(l => l.action_type === action)

const PAID = 'รายการนี้คิดสลิปแล้ว ให้แอดมินเปิดงวดก่อน'
const NOT_TEAM = 'คุณไม่ได้อยู่ในทีมของอีเวนต์นี้'
const NEED_DUTY = 'กรุณาเลือกหน้าที่หน้างานอย่างน้อย 1 อย่าง' // ถึงขั้นนี้ = ผ่านด่านอีเวนต์แล้ว

function onsiteForm(eventId: string, type = 'onsite') {
  const fd = new FormData()
  fd.set('check_type', type)
  fd.set('event_id', eventId)
  fd.set('photo', 'data:image/jpeg;base64,AAAA')
  return fd
}

async function main() {
  // ── 1. กติกาล้วน ─────────────────────────────────────────────────────────────
  for (const isAdmin of [false, true]) for (const isMember of [false, true]) for (const eventHasStaff of [false, true]) {
    const expected = isAdmin || isMember || !eventHasStaff
    assert.equal(canUseEvent({ isAdmin, isMember, eventHasStaff }), expected, JSON.stringify({ isAdmin, isMember, eventHasStaff }))
  }
  pass('canUseEvent ครบ 8 กรณี — ผ่านเมื่อเป็นแอดมิน / อยู่ในทีม / งานยังไม่จัดทีม')

  const base = 'https://fake.supabase.test/storage/v1/object/public'
  const mine = `${base}/ticket-attachments/tickets/u-${STAFF}/1_a.png`
  const theirs = `${base}/ticket-attachments/tickets/u-${OTHER}/1_b.png`
  const otherBucket = `${base}/checkin-photos/tickets/u-${STAFF}/1_c.png`
  assert.deepEqual(ownTicketAttachmentUrls([mine, theirs, otherBucket, 1, null, {}, undefined, `${base}/ticket-attachments/u-${STAFF}/x.png`], STAFF), [mine])
  assert.deepEqual(ownTicketAttachmentUrls(mine, STAFF), [], 'ไม่ใช่ array = ไม่มีไฟล์')
  pass('ownTicketAttachmentUrls เก็บเฉพาะไฟล์ใต้ u-<ตัวเอง> ในบัคเก็ต ticket-attachments')

  // ── 2. checkIn ──────────────────────────────────────────────────────────────
  loginAs(STAFF)
  assert.deepEqual(await checkin.checkIn(onsiteForm('ev-open', 'party')), { error: 'ประเภทเช็คอินไม่ถูกต้อง' })
  assert.deepEqual(await checkin.checkIn(onsiteForm('ev-team')), { error: NOT_TEAM })
  assert.deepEqual(await checkin.checkIn(onsiteForm('ev-missing')), { error: 'ไม่พบอีเวนต์นี้' })
  assert.deepEqual(await checkin.checkIn(onsiteForm('ev-open')), { error: NEED_DUTY }, 'งานยังไม่จัดทีม = ผ่านด่านอีเวนต์')
  loginAs(OTHER)
  assert.deepEqual(await checkin.checkIn(onsiteForm('ev-team')), { error: NEED_DUTY }, 'อยู่ในทีม = ผ่าน')
  loginAs(ADMIN)
  assert.deepEqual(await checkin.checkIn(onsiteForm('ev-team')), { error: NEED_DUTY }, 'แอดมิน = ผ่าน')
  assert.equal(db.staff_checkins.length, 3, 'ไม่มีแถวใหม่')
  pass('checkIn: ประเภทนอกชุด office/onsite/remote ถูกปฏิเสธ · onsite ต้องอยู่ในทีม (หรืองานยังไม่จัดทีม / แอดมิน)')

  // ── 3. updateMyCheckinEvent ────────────────────────────────────────────────
  loginAs(STAFF)
  assert.deepEqual(await checkin.updateMyCheckinEvent('c-mine', 'stock:ev-team'), { error: NOT_TEAM })
  assert.equal(row('c-mine')!.event_id, 'ev-open')
  assert.deepEqual(await checkin.updateMyCheckinEvent('c-paid', 'stock:ev-open'), { error: PAID })
  assert.deepEqual(await checkin.updateMyCheckinEvent('c-paid', null), { error: PAID })
  assert.deepEqual(await checkin.updateMyCheckinEvent('c-mine', null), { success: true })
  assert.equal(row('c-mine')!.event_id, null)
  assert.deepEqual(await checkin.updateMyCheckinEvent('c-mine', 'stock:ev-open'), { success: true })
  assert.equal(row('c-mine')!.event_id, 'ev-open')
  pass('updateMyCheckinEvent: ย้ายไปงานที่ไม่ได้อยู่ในทีมไม่ได้ · แถวที่คิดสลิปแล้วแก้ไม่ได้')

  // ── 4. admin: ลบ / แก้ / ย้ายอีเวนต์ ─────────────────────────────────────────
  loginAs(ADMIN)
  const editPaid = new FormData()
  editPaid.set('checkin_id', 'c-paid')
  editPaid.set('note', 'แก้')
  assert.deepEqual(await checkin.adminEditCheckin(editPaid), { error: PAID })
  assert.equal(row('c-paid')!.note, null)
  assert.deepEqual(await checkin.adminUpdateCheckinEvent('c-paid', null), { error: PAID })
  assert.deepEqual(await checkin.adminDeleteCheckin('c-paid'), { error: PAID })
  assert.ok(row('c-paid'), 'แถวที่จ่ายแล้วต้องยังอยู่')
  const badType = new FormData()
  badType.set('checkin_id', 'c-mine')
  badType.set('check_type', 'party')
  assert.deepEqual(await checkin.adminEditCheckin(badType), { error: 'ประเภทเช็คอินไม่ถูกต้อง' })

  const editOk = new FormData()
  editOk.set('checkin_id', 'c-mine')
  editOk.set('note', 'แอดมินแก้')
  assert.deepEqual(await checkin.adminEditCheckin(editOk), { success: true })
  assert.equal(row('c-mine')!.note, 'แอดมินแก้')
  assert.deepEqual(await checkin.adminUpdateCheckinEvent('c-mine', 'stock:ev-team'), { success: true })
  assert.equal(row('c-mine')!.event_id, 'ev-team')
  assert.equal(logsOf('EDIT_CHECKIN').length, 1, 'ย้ายอีเวนต์ต้องมี log EDIT_CHECKIN')
  assert.deepEqual(await checkin.adminDeleteCheckin('c-mine'), { success: true })
  assert.equal(row('c-mine'), undefined)
  assert.equal(logsOf('DELETE_CHECKIN').length, 1, 'ลบต้องมี log DELETE_CHECKIN')
  assert.equal(logsOf('DELETE_CHECKIN')[0].target_user_id, STAFF)
  assert.deepEqual(removed, ['https://x/mine.jpg'], 'ลบรูปของแถวที่ลบ')
  loginAs(STAFF)
  assert.deepEqual(await checkin.adminDeleteCheckin('c-other'), { error: 'Unauthorized' })
  pass('admin: แถวที่คิดสลิปแล้วแก้/ย้าย/ลบไม่ได้ · ลบและย้ายอีเวนต์ทิ้ง log DELETE_CHECKIN / EDIT_CHECKIN')

  // ── 5. ฟังก์ชันอ่าน ─────────────────────────────────────────────────────────
  db.staff_checkins.push({ id: 'c-mine2', user_id: STAFF, check_type: 'office', event_id: null, note: null, duties: [], paid_slip_id: null, checked_in_at: nowIso, checked_out_at: null, latitude: 1, longitude: 2, photo_url: 'https://x/m2.jpg', checkout_photo_url: 'https://x/m2-out.jpg' })
  logout()
  assert.deepEqual(await checkin.getTodayCheckins(), [])
  assert.deepEqual(await checkin.getStaffList(), [])
  assert.deepEqual(await checkin.getActiveDuties(), [])
  assert.deepEqual(await checkin.getTodayEvents(), [])

  loginAs(STAFF)
  const asStaff = await checkin.getTodayCheckins() as Row[]
  const other = asStaff.find(r => r.id === 'c-other')!
  const own = asStaff.find(r => r.id === 'c-mine2')!
  assert.ok(other && own, 'ยังเห็นรายการของทุกคน')
  for (const k of ['latitude', 'longitude', 'photo_url', 'checkout_photo_url']) assert.equal(other[k], null, `ของคนอื่น: ${k} ต้องว่าง`)
  assert.equal(other.user_id, OTHER)
  assert.equal(own.latitude, 1)
  assert.equal(own.photo_url, 'https://x/m2.jpg')
  assert.equal(own.checkout_photo_url, 'https://x/m2-out.jpg')
  assert.equal(db.staff_checkins.find(r => r.id === 'c-other')!.latitude, 14.1, 'ห้ามแก้ข้อมูลต้นทาง')
  assert.ok((await checkin.getStaffList()).length > 0)

  loginAs(ADMIN)
  const asAdmin = await checkin.getTodayCheckins() as Row[]
  assert.equal(asAdmin.find(r => r.id === 'c-other')!.photo_url, 'https://x/other.jpg', 'แอดมินเห็นครบ')
  pass('ฟังก์ชันอ่าน: ไม่ล็อกอิน = ว่าง · พนักงานไม่ได้พิกัด/รูปของคนอื่น (ของตัวเองครบ) · แอดมินเห็นครบ')

  // ── 6. static ──────────────────────────────────────────────────────────────
  const ROOT = join(__dirname, '..')
  const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8').replace(/\r\n/g, '\n')
  const fnBody = (src: string, name: string) => {
    const at = src.indexOf(`export async function ${name}(`)
    assert.ok(at >= 0, `หา ${name} ไม่เจอ`)
    const next = src.indexOf('\nexport ', at + 10)
    return src.slice(at, next > 0 ? next : undefined)
  }

  const ci = read('app/(authenticated)/check-in/actions.ts')
  const names = [...ci.matchAll(/^export async function (\w+)\(/gm)].map(m => m[1])
  assert.ok(names.length >= 15, `ต้องเจอ export หลายตัว (เจอ ${names.length})`)
  for (const name of names) {
    const body = fnBody(ci, name)
    // ข้ามบรรทัด signature (พารามิเตอร์อาจยาวหลายบรรทัด) แล้วนับ 6 บรรทัดแรกของตัวฟังก์ชัน
    const open = body.search(/[)>] \{\n/) // บรรทัดที่เปิดตัวฟังก์ชัน: `) {` หรือ `Promise<…> {`
    assert.ok(open > 0, `check-in/${name}: หาจุดเริ่มตัวฟังก์ชันไม่เจอ`)
    const head = body.slice(open).split('\n').slice(0, 7).join('\n')
    assert.match(head, /getSession\(|requireAuth\(/, `check-in/${name}: ต้องเรียก getSession()/requireAuth() ใน 6 บรรทัดแรก`)
  }
  assert.match(fnBody(ci, 'checkOut'), /\.is\('checked_out_at', null\)/, 'checkOut ต้องยังกันเช็คเอาต์ซ้ำ (รอบ 1)')

  const jobs = read('app/(authenticated)/jobs/actions.ts')
  for (const name of ['createJobSetting', 'updateJobSetting', 'deleteJobSetting', 'toggleJobSetting', 'createJobType', 'updateJobType', 'deleteJobType']) {
    assert.match(fnBody(jobs, name), /role !== 'admin'\) return \{ error: 'เฉพาะ admin เท่านั้น' \}/, `jobs/${name}: ต้องเป็นแอดมินเท่านั้น`)
  }
  assert.match(fnBody(jobs, 'deleteJobType'), /\.eq\('category', 'job_type'\)/, 'deleteJobType ต้องจำกัด category = job_type')

  const kpi = read('app/(authenticated)/kpi/actions.ts')
  const replies = fnBody(kpi, 'getEvaluationReplies')
  assert.match(replies, /await getSession\(\)/, 'getEvaluationReplies ต้องตรวจ session')
  assert.match(replies, /isEvaluationParty\(/, 'getEvaluationReplies ต้องตรวจว่าเป็นผู้เกี่ยวข้อง')
  const reply = fnBody(kpi, 'createEvaluationReply')
  assert.match(reply, /isEvaluationParty\(/, 'createEvaluationReply ต้องตรวจว่าเป็นผู้เกี่ยวข้อง')
  assert.doesNotMatch(reply, /mentionedUsers\.forEach\(u => participants\.add/, 'notify_users ห้ามเพิ่มคนนอก')
  pass(`static — check-in ${names.length} export เรียก session ทุกตัว · checkOut ยังมี guard · ตั้งค่างาน 7 ตัว = แอดมิน · deleteJobType จำกัด category · KPI reply ตรวจตัวตน/ผู้เกี่ยวข้อง`)

  console.log('\ncheckin-jobs-access: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
