// หน้าสลิป — ตรวจเส้นทาง "แก้เช็คอินจากในสลิป → คำนวณใหม่ → คืนสลิป" (editSlipCheckin)
// Run:  npx tsx scripts/salary-edit-flow.check.ts
//
// รัน server action จริงกับฐานข้อมูลจำลองในหน่วยความจำ (ไม่แตะ DB จริง ไม่ต้องมี env)
// เพื่อจับสองเรื่อง:
//   1. ยอดเงินที่ได้หลังแก้หน้าที่ต้องถูก (ค่าที่แก้มือไว้ต้องไม่หาย)
//   2. จำนวนรอบที่ต้องคุยกับฐานข้อมูลต่อการแก้หนึ่งครั้ง — เป็นตัวกำหนดว่าผู้ใช้รอนานแค่ไหน
// ข้อมูลทั้งหมดสังเคราะห์

import assert from 'node:assert/strict'
import Module from 'node:module'

process.env.SESSION_SECRET = 'salary-edit-flow-check'

// ── ฐานข้อมูลจำลอง ──────────────────────────────────────────────────────────
type Row = Record<string, unknown>
const ADMIN = 'admin-1', OWNER = 'owner-1', RUN = 'run-1', SLIP = 'slip-1'
const db: Record<string, Row[]> = {
  profiles: [
    { id: ADMIN, role: 'admin', is_approved: true, active_session_id: 'sess-1', department: 'ผู้บริหาร', full_name: 'แอดมิน ทดสอบ', nickname: null, deleted_at: null },
    { id: OWNER, role: 'staff', is_approved: true, active_session_id: null, department: 'สตาฟ', full_name: 'พนักงาน ทดสอบ', nickname: 'ทดสอบ', deleted_at: null, bank_name: null, bank_account_number: null, account_holder_name: null },
  ],
  salary_runs: [{ id: RUN, kind: 'monthly', period_key: '2026-09', period_start: '2026-08-26', period_end: '2026-09-25', note: null, created_at: '2026-09-26T03:00:00Z' }],
  salary_profiles: [{ user_id: OWNER, employment_type: 'fulltime', base_salary: 15000, work_start: '10:00', work_end: '19:00', ot_rate: 100 }],
  salary_duties: [
    { code: 'onsite_staff', name_th: 'ออกงานสตาฟ', rate: 700, pay_mode: 'per_checkin', is_active: true, sort_order: 1 },
    { code: 'drive_booth', name_th: 'ขับรถออกบูธ', rate: 300, pay_mode: 'per_checkin', is_active: true, sort_order: 2 },
    { code: 'runner', name_th: 'รันเนอร์', rate: 0, pay_mode: 'manual_daily', is_active: true, sort_order: 3 },
  ],
  app_settings: [{ key: 'salary_cutoff_day', value: '25' }, { key: 'salary_out_of_province_rate', value: '300' }],
  events: [{ id: 'ev-1', name: 'งานทดสอบ', event_date: '2026-09-10' }],
  staff_checkins: [
    // หน้างาน 10 ก.ย. 10:00–22:00 เวลาไทย → OT 3 ชม.
    { id: 'c-onsite', user_id: OWNER, check_type: 'onsite', checked_in_at: '2026-09-10T03:00:00Z', checked_out_at: '2026-09-10T15:00:00Z', event_id: 'ev-1', duties: ['onsite_staff'], province: null, district: null, out_of_province: false, note: null, paid_slip_id: null },
    // ออฟฟิศ 11 ก.ย. 09:00–20:00 เวลาไทย → OT 2 ชม.
    { id: 'c-office', user_id: OWNER, check_type: 'office', checked_in_at: '2026-09-11T02:00:00Z', checked_out_at: '2026-09-11T13:00:00Z', event_id: null, duties: [], province: null, district: null, out_of_province: false, note: null, paid_slip_id: null },
  ],
  salary_slips: [{
    id: SLIP, run_id: RUN, user_id: OWNER, status: 'draft', employment_type: 'fulltime', base_salary: 15000,
    checkin_ids: [], lines: [], adjustments: [{ id: 'adj-1', label: 'โบนัส', amount: 500 }], warnings: [], accepted_warnings: [],
    reopen_history: [], paid_history: [], paid_total: null, total: 0, computed_at: null,
    finalized_at: null, finalized_by: null, paid_at: null, paid_by: null, costs_synced_at: null,
  }],
  activity_logs: [],
}

const LATENCY_MS = 30
const stats = { queries: 0, log: [] as string[] }

type Op = [string, ...unknown[]]
class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count?: number }> {
  private action: 'select' | 'insert' | 'update' | 'upsert' | 'delete' = 'select'
  private payload: Row | Row[] | null = null
  private cols = '*'
  private ops: Op[] = []
  private one: 'single' | 'maybeSingle' | null = null
  private conflict: string[] = []
  constructor(private table: string) {}

  select(cols = '*') { this.cols = cols; return this }
  insert(rows: Row | Row[]) { this.action = 'insert'; this.payload = rows; return this }
  update(values: Row) { this.action = 'update'; this.payload = values; return this }
  upsert(rows: Row | Row[], opts?: { onConflict?: string }) {
    this.action = 'upsert'; this.payload = rows
    this.conflict = (opts?.onConflict || 'id').split(',').map((s) => s.trim())
    return this
  }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { this.ops.push(['eq', c, v]); return this }
  in(c: string, v: unknown[]) { this.ops.push(['in', c, v]); return this }
  gte(c: string, v: unknown) { this.ops.push(['gte', c, v]); return this }
  lte(c: string, v: unknown) { this.ops.push(['lte', c, v]); return this }
  is(c: string, v: unknown) { this.ops.push(['is', c, v]); return this }
  order() { return this }
  limit() { return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private match(r: Row): boolean {
    return this.ops.every(([op, c, v]) => {
      const x = r[c as string]
      if (op === 'eq') return x === v
      if (op === 'in') return (v as unknown[]).includes(x)
      if (op === 'gte') return String(x) >= String(v)
      if (op === 'lte') return String(x) <= String(v)
      if (op === 'is') return v === null ? x == null : x === v
      return true
    })
  }

  private run() {
    const rows = (db[this.table] ||= [])
    if (this.action === 'insert') {
      for (const r of [this.payload].flat() as Row[]) rows.push({ id: `${this.table}-${rows.length + 1}`, ...r })
      return { data: null, error: null }
    }
    if (this.action === 'upsert') {
      for (const r of [this.payload].flat() as Row[]) {
        const hit = rows.find((x) => this.conflict.every((k) => x[k] === r[k]))
        if (hit) Object.assign(hit, r)
        else rows.push({ id: `${this.table}-${rows.length + 1}`, ...r })
      }
      return { data: null, error: null }
    }
    const hits = rows.filter((r) => this.match(r))
    if (this.action === 'update') { for (const r of hits) Object.assign(r, this.payload); return { data: null, error: null } }
    if (this.action === 'delete') { db[this.table] = rows.filter((r) => !hits.includes(r)); return { data: null, error: null } }

    // select — คืนสำเนา + ฝังชื่ออีเวนต์เมื่อขอ `events:event_id(name)`
    const embed = this.cols.includes('events:event_id')
    const out = hits.map((r) => {
      const copy: Row = JSON.parse(JSON.stringify(r))
      if (embed) {
        const ev = db.events.find((e) => e.id === r.event_id)
        copy.events = ev ? { name: ev.name } : null
      }
      return copy
    })
    if (this.one) {
      if (out.length === 0 && this.one === 'single') return { data: null, error: { message: 'no rows' } }
      return { data: out[0] ?? null, error: null }
    }
    return { data: out, error: null }
  }

  then<A, B>(ok?: ((v: { data: unknown; error: { message: string } | null }) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    stats.queries++
    stats.log.push(`${this.action} ${this.table}`)
    return new Promise<{ data: unknown; error: { message: string } | null }>((resolve) =>
      setTimeout(() => resolve(this.run()), LATENCY_MS)).then(ok, fail)
  }
}
const fakeClient = { from: (table: string) => new Query(table) }

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient, removeStorageByUrls: async () => {} }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {}, refresh() {} }],
  [/reverse-geocode$/, { reverseGeocodeThai: async () => null }],
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
const actions = require('../app/(authenticated)/salary/actions') as typeof import('../app/(authenticated)/salary/actions')
const { previewSlip } = require('../app/(authenticated)/salary/compute') as typeof import('../app/(authenticated)/salary/compute')
const { applyCheckinPatch } = require('../app/(authenticated)/salary/[slipId]/components/day-view-utils') as typeof import('../app/(authenticated)/salary/[slipId]/components/day-view-utils')
/* eslint-enable @typescript-eslint/no-require-imports */

type SlipView = Extract<Awaited<ReturnType<typeof actions.getSlipForView>>, { slip: unknown }>
type Patch = Parameters<typeof actions.editSlipCheckin>[2]

/** หน้าสลิปก่อนแก้ — ข้อมูลชุดเดียวกับที่ page.tsx ส่งให้ slip-view */
async function viewNow(): Promise<SlipView> {
  const v = await actions.getSlipForView(SLIP)
  assert.ok(!('error' in v), 'getSlipForView ต้องผ่าน')
  assert.ok(v.calc, 'admin ต้องได้ calc (มีโปรไฟล์เงินเดือน)')
  return v
}

/**
 * ภาพตัวอย่างฝั่ง client ต้องเท่ากับที่ server คำนวณทุกประการ (AC4)
 * - แบบหน้าเพจ: แถวเช็คอินก่อนแก้ + applyCheckinPatch (สิ่งที่ use-slip-edits ทำจริง)
 * - แบบข้อมูลที่ server เห็นหลังแก้: แถวเช็คอินที่อ่านกลับมาจากฐานข้อมูล
 * ทั้งคู่ใช้ lines ก่อนแก้เป็น previousLines เหมือน server
 */
async function assertPreviewMatches(
  label: string,
  before: SlipView,
  checkinId: string,
  patch: Patch,
  server: { lines: unknown; warnings: unknown; total: number }
) {
  const pick = (r: { lines: unknown; warnings: unknown; total: number }) =>
    ({ lines: r.lines, warnings: r.warnings, total: r.total })

  const patched = before.checkins.map(c => (c.id === checkinId ? applyCheckinPatch(c, patch, before.events) : c))
  const fromPage = previewSlip({ slip: before.slip, checkins: patched, duties: before.duties, calc: before.calc! })
  assert.deepStrictEqual(pick(fromPage), pick(server), `${label}: ภาพตัวอย่าง (แถวที่แพตช์ฝั่ง client) ต้องเท่ากับ server`)

  const after = await viewNow()
  const fromDb = previewSlip({ slip: before.slip, checkins: after.checkins, duties: before.duties, calc: before.calc! })
  assert.deepStrictEqual(pick(fromDb), pick(server), `${label}: ภาพตัวอย่าง (แถวจากฐานข้อมูลหลังแก้) ต้องเท่ากับ server`)
  console.log(`PASS  ภาพตัวอย่างเท่ากับ server — ${label} (ยอดสุทธิ ${server.total})`)
}

cookieJar.set('session_token', createSessionToken(ADMIN))
cookieJar.set('session_id', 'sess-1')
cookieJar.set('session_role', 'admin')

// งบจำนวนรอบ (ลำดับต่อเนื่อง) ต่อการแก้หนึ่งครั้ง — เกินนี้ = หน้าสลิปกลับมาหน่วง
const MAX_SEQUENTIAL_ROUNDS = Number(process.env.SLIP_EDIT_MAX_ROUNDS || 10)

async function main() {
  const amounts = (lines: { key: string; amount: number | null; computed_amount: number }[]) =>
    Object.fromEntries(lines.map((l) => [l.key, l.amount ?? l.computed_amount]))

  // เตรียมสลิป: คำนวณครั้งแรก แล้วแก้มือทับ OT ของวันออฟฟิศเป็น 999
  const first = await actions.recomputeSlip(SLIP)
  assert.equal(first.error, undefined, `คำนวณครั้งแรกไม่ผ่าน: ${first.error}`)
  const before = db.salary_slips[0].lines as { key: string; kind: string; date: string }[]
  const officeOt = before.find((l) => l.kind === 'ot' && l.date === '2026-09-11')
  assert.ok(officeOt, 'ต้องมีบรรทัด OT ของวันออฟฟิศ')
  const ov = await actions.overrideSlipLine(SLIP, officeOt.key, 999, 'ทดสอบแก้มือ')
  assert.equal(ov.error, undefined, `แก้มือไม่ผ่าน: ${ov.error}`)

  // หน้าสลิปตามที่ผู้ใช้เห็นก่อนแก้ — ใช้ทำภาพตัวอย่าง (อ่านก่อนเริ่มนับ query)
  const view0 = await viewNow()

  // Node โหลด FormData (undici) แบบ lazy ตอนแตะครั้งแรก ~15–20 ms — server จริงโหลดไว้แล้ว
  // (fetch ของ supabase-js ใช้ undici ตัวเดียวกัน) ไม่ใช่รอบฐานข้อมูล จึงแตะก่อนเริ่มจับเวลา
  new FormData()

  // วัดหนึ่งรอบของฐานข้อมูลจำลอง (ตัวจับเวลาของเครื่องไม่ตรง LATENCY_MS เป๊ะ)
  const t0 = performance.now()
  await fakeClient.from('app_settings').select('key')
  const oneRound = performance.now() - t0

  // ── สิ่งที่วัด: ติ๊กหน้าที่เพิ่ม 1 อย่างในเช็คอินหน้างาน ──
  stats.queries = 0; stats.log = []
  const logsBefore = db.activity_logs.length
  const t1 = performance.now()
  const dutyPatch: Patch = { duties: ['onsite_staff', 'drive_booth'] }
  const res = await actions.editSlipCheckin(SLIP, 'c-onsite', dutyPatch)
  const elapsed = performance.now() - t1
  const rounds = Math.round(elapsed / oneRound)

  assert.ok('slip' in res, `แก้หน้าที่ไม่ผ่าน: ${'error' in res ? res.error : ''}`)
  const slip = res.slip
  const got = amounts(slip.lines)
  const site = Object.entries(got).filter(([k]) => k.startsWith('site:')).map(([, v]) => v).sort()

  assert.deepEqual(db.staff_checkins[0].duties, ['onsite_staff', 'drive_booth'], 'หน้าที่ต้องถูกบันทึกลงเช็คอิน')
  assert.deepEqual(site, [300, 700], 'ค่าสตาฟต้องมี 2 บรรทัด: ออกงานสตาฟ 700 + ขับรถออกบูธ 300')
  assert.equal(got[officeOt.key], 999, 'ค่าที่แก้มือไว้ต้องไม่หายหลังคำนวณใหม่')
  // ฐาน 15,000 + ค่าสตาฟ 1,000 + OT หน้างาน 3 ชม. × 100 + OT ออฟฟิศ (แก้มือ) 999 + โบนัส 500
  assert.equal(slip.total, 15000 + 1000 + 300 + 999 + 500, 'ยอดสุทธิ')
  assert.equal(slip.status, 'draft')
  assert.equal(db.salary_slips.length, 1, 'ต้องไม่เกิดสลิปใบใหม่')
  assert.ok(db.activity_logs.some((l) => l.action_type === 'EDIT_SALARY_CHECKIN'), 'ต้องมี log การแก้เช็คอิน')
  assert.ok(db.activity_logs.some((l) => l.action_type === 'UPDATE_CHECKIN_DUTIES'), 'ต้องมี log การแก้หน้าที่')
  // การแก้ครั้งนี้ครั้งเดียวต้องทิ้งร่องรอยครบ 3 ชนิด (log ทุกตัวเสร็จก่อน action คืนค่า)
  assert.deepEqual(
    db.activity_logs.slice(logsBefore).map((l) => l.action_type).sort(),
    ['COMPUTE_SALARY_SLIP', 'EDIT_SALARY_CHECKIN', 'UPDATE_CHECKIN_DUTIES'],
    'log ของการแก้หนึ่งครั้งต้องครบ 3 ชนิด'
  )

  console.log(`PASS  ยอดเงินหลังแก้หน้าที่ถูกต้อง (ยอดสุทธิ ${slip.total})`)
  console.log(`      คุยกับฐานข้อมูล ${stats.queries} ครั้ง · ต่อเนื่องกัน ${rounds} รอบ (งบ ${MAX_SEQUENTIAL_ROUNDS})`)
  if (process.env.SLIP_EDIT_VERBOSE) console.log('      ' + stats.log.join(' → '))

  // ── ภาพตัวอย่าง = server: กรณีที่ 1 ติ๊กหน้าที่ ──
  await assertPreviewMatches('ติ๊กหน้าที่', view0, 'c-onsite', dutyPatch, slip)

  // หน้าที่ที่ปิดใช้งาน/ไม่มีอยู่ ต้องถูกปฏิเสธและไม่แตะข้อมูล
  const bad = await actions.editSlipCheckin(SLIP, 'c-onsite', { duties: ['no_such_duty'] })
  assert.ok('error' in bad, 'หน้าที่ที่ไม่มีอยู่ต้องถูกปฏิเสธ')
  assert.deepEqual(db.staff_checkins[0].duties, ['onsite_staff', 'drive_booth'])
  console.log('PASS  หน้าที่ที่ไม่มีอยู่ถูกปฏิเสธ ข้อมูลเดิมไม่เปลี่ยน')

  // คนที่ไม่ใช่ admin แก้ไม่ได้
  db.profiles[0].role = 'staff'
  const denied = await actions.editSlipCheckin(SLIP, 'c-onsite', { duties: ['onsite_staff'] })
  db.profiles[0].role = 'admin'
  assert.ok('error' in denied, 'ไม่ใช่ admin ต้องถูกปฏิเสธ')
  assert.deepEqual(db.staff_checkins[0].duties, ['onsite_staff', 'drive_booth'])
  console.log('PASS  ไม่ใช่ admin ถูกปฏิเสธ')

  // ── ภาพตัวอย่าง = server: กรณีที่ 2 แก้เวลาออก (หน้างานออก 23:00 เวลาไทย → OT 4 ชม.) ──
  const view1 = await viewNow()
  const outPatch: Patch = { checked_out_at: '2026-09-10T16:00:00.000Z' }
  const out = await actions.editSlipCheckin(SLIP, 'c-onsite', outPatch)
  assert.ok('slip' in out, `แก้เวลาออกไม่ผ่าน: ${'error' in out ? out.error : ''}`)
  assert.equal(amounts(out.slip.lines)['ot:2026-09-10'], 400, 'OT หน้างานหลังแก้เวลาออก = 4 ชม. × 100')
  await assertPreviewMatches('แก้เวลาออก', view1, 'c-onsite', outPatch, out.slip)

  // ── ภาพตัวอย่าง = server: กรณีที่ 3 ติ๊กต่างจังหวัด ──
  const view2 = await viewNow()
  const oopPatch: Patch = { out_of_province: true }
  const oop = await actions.editSlipCheckin(SLIP, 'c-onsite', oopPatch)
  assert.ok('slip' in oop, `ติ๊ก ตจว. ไม่ผ่าน: ${'error' in oop ? oop.error : ''}`)
  assert.equal(amounts(oop.slip.lines)['oop:2026-09-10:c-onsite'], 300, 'เบิ้ลต่างจังหวัด 300')
  assert.equal(amounts(oop.slip.lines)[officeOt.key], 999, 'ค่าที่แก้มือไว้ยังต้องอยู่')
  await assertPreviewMatches('ติ๊กต่างจังหวัด', view2, 'c-onsite', oopPatch, oop.slip)

  assert.ok(rounds <= MAX_SEQUENTIAL_ROUNDS, `ใช้ ${rounds} รอบ เกินงบ ${MAX_SEQUENTIAL_ROUNDS}`)
  console.log('\nsalary-edit-flow: ผ่านทั้งหมด')
}

main().catch((e) => {
  console.log(`FAIL  ${(e as Error).message}`)
  process.exit(1)
})
