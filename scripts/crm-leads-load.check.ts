// โหลดลูกค้า CRM ให้ครบ (/crm, /crm/dashboard, /crm/download, /crm/archive) — รัน getLeads / getArchivedLeads ตัวจริง
// กับฐานข้อมูลจำลองในหน่วยความจำที่ตัดผลเหมือน PostgREST (ไม่เกิน 1,000 แถวต่อคำขอ)
// Run:  npx tsx scripts/crm-leads-load.check.ts
//
// ไม่แตะฐานข้อมูลจริง ไม่ต้องมี env: แทน next/cache, @/lib/supabase-server, logger, auth, notifications และ jobs/actions
// ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/finance-claims-load.check.ts — ตัวจำลองคัดมาเฉพาะที่ใช้)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "crm-leads-load: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'

type Row = Record<string, unknown>
type DbError = { code: string; message: string }
type Result = { data: unknown; error: DbError | null }

// ── สุ่มแบบกำหนด seed (mulberry32) ─────────────────────────────────────────
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = seeded(20261007)
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
/** สลับลำดับแถวในตาราง — ให้โค้ดจริงต้องเรียงเอง */
function shuffle<T>(list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[list[i], list[j]] = [list[j], list[i]]
  }
  return list
}

// ── ข้อมูลสังเคราะห์ ────────────────────────────────────────────────────────
const ACTIVE = 2450
const ARCHIVED = 1200
const HOUR = 3_600_000
const START = Date.UTC(2025, 0, 1)
const ts = (ms: number) => new Date(ms).toISOString().replace('.000Z', '+00:00')
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const STATUSES = ['lead', 'quotation_sent', 'accepted', 'rejected', 'pending'] as const
// หน้าต่าง "งานที่เคลื่อนไหว" อิงเวลาจริงของเครื่อง — ค่าที่ seed ห่างขอบ 60 วันอย่างน้อย 1 วัน (ไม่สั่นตามเวลาที่รัน)
const NOW = Date.now()
const DAY = 86_400_000
const bkkDay = (ms: number) => new Date(ms + 7 * HOUR).toISOString().slice(0, 10)

let seq = 0
function lead(over: Row): Row {
  seq++
  return {
    id: uid(seq), customer_name: `ลูกค้าทดสอบ ${seq}`, customer_line: null, status: pick(STATUSES),
    lead_source: 'line', is_returning: false, archived_at: null,
    created_at: ts(START + seq * HOUR), // ไม่ซ้ำกันเลย
    updated_at: ts(START + seq * HOUR), // เก่ากว่า 60 วันทั้งหมด — แถวที่ "เคลื่อนไหว" กำหนดข้างล่าง
    event_date: seq % 3 === 0 ? '2025-03-01' : null, // วันงานผ่านไปแล้ว
    // คอลัมน์ที่เหลือของ BOARD_COLUMNS + คอลัมน์หนักที่โหมดเบาต้องไม่ดึง
    customer_phone: null, customer_type: null, work_type: 'event', unit_count: null, event_end_date: null,
    event_location: null, event_details: null, package_name: null, quoted_price: 0, confirmed_price: 0, deposit: 0,
    tags: [], assigned_sales: [], assigned_graphics: [], assigned_staff: [],
    notes: 'โน้ตยาว', required_roles: {}, installment_1: 0,
    ...over,
  }
}
const active = Array.from({ length: ACTIVE }, () => lead({}))
const archived = Array.from({ length: ARCHIVED }, (_, i) => lead({
  archived_at: ts(START + 9000 * HOUR + i * HOUR),
  updated_at: i % 4 === 0 ? ts(NOW - DAY) : ts(START), // เก็บเข้าคลังแล้ว แม้เพิ่งแตะก็ต้องไม่ขึ้นบอร์ด
}))
// งานที่เคลื่อนไหว: แตะใน 1–58 วัน / วันงานวันนี้หรืออนาคต (บางแถวเข้าทั้งสองเงื่อนไข — ต้องไม่ซ้ำ)
active.forEach((l, i) => {
  if (i % 10 === 0) l.updated_at = ts(NOW - (1 + (i % 58)) * DAY)
  else if (i % 10 === 5) l.updated_at = ts(NOW - 61 * DAY) // เลย 60 วันมา 1 วัน → ไม่เข้า
  if (i % 13 === 0) l.event_date = i % 2 ? bkkDay(NOW) : bkkDay(NOW + (i % 90 + 1) * DAY)
})
const inWindow = new Set(active
  .filter(l => Date.parse(String(l.updated_at)) >= NOW - 60 * DAY || (l.event_date != null && String(l.event_date) >= bkkDay(NOW)))
  .map(l => l.id as string))
const installments: Row[] = []
for (const l of active.filter((_, i) => i % 7 === 0)) {
  for (let k = 0; k < 3; k++) installments.push({ id: uid(100_000 + installments.length), lead_id: l.id, amount: 1000 * (k + 1), is_paid: k !== 1 })
}

const db: Record<string, Row[]> = {
  crm_leads: shuffle([...active, ...archived]),
  crm_lead_installments: installments,
}

// ── ฐานข้อมูลจำลอง (เฉพาะที่ getLeads / getArchivedLeads ใช้) ───────────────────
const MAX_ROWS = 1000
const reads = new Map<string, number>()
const leadReads = () => reads.get('crm_leads') ?? 0
/** การอ่าน crm_leads ครั้งที่เท่านี้ (นับสะสม) ได้ error */
let failAtRead: number | null = null

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))
const compare = (x: unknown, y: unknown) => {
  if (typeof x === 'number' && typeof y === 'number') return x - y
  const a = String(x), b = String(y)
  return a < b ? -1 : a > b ? 1 : 0
}
function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

const EMBED = /(\w+)\(([^()]*)\)/g
class Query implements PromiseLike<Result> {
  private cols: string | null = null
  private filters: ((r: Row) => boolean)[] = []
  private sorts: { col: string; asc: boolean }[] = []
  private start = 0
  private end: number | null = null
  constructor(private table: string) {}

  select(cols = '*') { this.cols = cols; return this }
  eq(c: string, v: unknown) { return this.where(r => r[c] === v) }
  is(c: string, v: null) {
    assert.equal(v, null, 'ตัวจำลองรองรับเฉพาะ is(col, null)')
    return this.where(r => r[c] == null)
  }
  not(c: string, op: string, v: null) {
    assert.ok(op === 'is' && v === null, 'ตัวจำลองรองรับเฉพาะ not(col, "is", null)')
    return this.where(r => r[c] != null)
  }
  gte(c: string, v: string) { return this.where(r => r[c] != null && Date.parse(String(r[c])) >= Date.parse(v)) }
  lte(c: string, v: string) { return this.where(r => r[c] != null && Date.parse(String(r[c])) <= Date.parse(v)) }
  order(col: string, opts: { ascending?: boolean } = {}) {
    this.sorts.push({ col, asc: opts.ascending !== false })
    return this
  }
  range(from: number, to: number) {
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from, `range ไม่ถูกต้อง: ${from}-${to}`)
    this.start = from
    this.end = to
    return this
  }
  private where(f: (r: Row) => boolean) { this.filters.push(f); return this }

  /** '*' = ทั้งแถว · ตาราง(คอลัมน์) = แนบแถวลูกที่ lead_id ตรง · อื่นๆ = เฉพาะคอลัมน์นั้น */
  private project(r: Row): Row {
    const cols = this.cols ?? '*'
    const embeds = [...cols.matchAll(EMBED)]
    const plain = cols.replace(EMBED, '').split(',').map(c => c.trim()).filter(Boolean)
    const out: Row = plain.includes('*') ? clone(r) : Object.fromEntries(plain.map(c => {
      assert.ok(c in r, `ไม่มีคอลัมน์ ${this.table}.${c}`)
      return [c, clone(r[c])]
    }))
    for (const [, child, childCols] of embeds) {
      const keep = childCols.split(',').map(c => c.trim())
      out[child] = (db[child] ?? []).filter(c => c.lead_id === r.id).map(c => Object.fromEntries(keep.map(k => [k, c[k]])))
    }
    return out
  }

  private run(): Result {
    assert.ok(this.cols !== null, 'ตัวจำลองรองรับเฉพาะการอ่าน (select)')
    reads.set(this.table, (reads.get(this.table) ?? 0) + 1)
    if (this.table === 'crm_leads' && failAtRead !== null && leadReads() === failAtRead) {
      return { data: null, error: { code: '57014', message: 'canceling statement due to statement timeout (จำลอง)' } }
    }
    const hits = (db[this.table] ?? []).filter(r => this.filters.every(f => f(r))).sort((a, b) => {
      for (const s of this.sorts) {
        const d = compare(a[s.col], b[s.col])
        if (d !== 0) return s.asc ? d : -d
      }
      return 0
    })
    // ไม่มี range = ได้ไม่เกิน MAX_ROWS แถวแรก · มี range ก็ยังได้ไม่เกิน MAX_ROWS ต่อคำขอ
    const stop = Math.min(this.end === null ? Number.POSITIVE_INFINITY : this.end + 1, this.start + MAX_ROWS)
    return { data: hits.slice(this.start, stop).map(r => this.project(r)), error: null }
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
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, {
    createServiceClient: () => fakeClient,
    removeStorageByUrls: async () => assert.fail('removeStorageByUrls ไม่ควรถูกเรียกในสคริปต์นี้'),
  }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {} }],
  [/lib\/logger$/, { logActivity: async () => {} }],
  [/lib\/auth$/, { requireAuth: async () => ({ userId: uid(1), role, sessionId: 'sess-check' }) }],
  [/lib\/notifications$/, { createNotifications: async () => {} }],
  [/jobs\/actions$/, { autoCreateJobsFromAcceptedLead: async () => ({}) }],
]
let role = 'admin'
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { getLeads, getArchivedLeads, deleteLead, countStaleLeads, archiveStaleLeads } =
  require('../app/(authenticated)/crm/actions') as typeof import('../app/(authenticated)/crm/actions')
/* eslint-enable @typescript-eslint/no-require-imports */

type Lead = { id: string; created_at: string; archived_at: string | null; total_installments_paid?: number }
const pass = (label: string) => console.log(`PASS  ${label}`)
function assertDesc(rows: Lead[], col: 'created_at' | 'archived_at', label: string) {
  for (let i = 1; i < rows.length; i++) {
    assert.ok(compare(rows[i - 1][col], rows[i][col]) > 0, `${label}: ลำดับผิดที่แถว ${i}`)
  }
}
const noDupes = (rows: Lead[], label: string) => assert.equal(new Set(rows.map(r => r.id)).size, rows.length, `${label}: มีแถวซ้ำ`)

async function main() {
  // (a) ตัวจำลองตัดผลที่ 1,000 แถว
  const raw = await fakeClient.from('crm_leads').select('id')
  assert.equal((raw.data as Row[]).length, MAX_ROWS, 'อ่านครั้งเดียวไม่มี range ต้องได้ 1,000 แถว')
  const wide = await fakeClient.from('crm_leads').select('id').range(0, 4999)
  assert.equal((wide.data as Row[]).length, MAX_ROWS, 'range กว้างก็ยังได้ 1,000 แถว')
  pass(`(a) ตัวจำลองตัดผลที่ ${MAX_ROWS} แถว (มี ${db.crm_leads.length} แถวในตาราง)`)

  // (b) getLeads() ครบ เรียงใหม่ → เก่า ไม่ซ้ำ อ่าน 3 หน้า
  let before = leadReads()
  const res = await getLeads()
  assert.equal(res.error, undefined, `getLeads ต้องสำเร็จ แต่ได้ ${res.error}`)
  const all = res.data as Lead[]
  assert.equal(all.length, ACTIVE)
  noDupes(all, '(b)')
  assertDesc(all, 'created_at', '(b)')
  assert.ok(all.every(r => r.archived_at === null), '(b) ต้องไม่มีลูกค้าที่เก็บเข้าคลัง')
  assert.equal(leadReads() - before, 3, '2,450 แถว = อ่าน 3 หน้า')
  pass(`(b) getLeads() ได้ ${all.length}/${ACTIVE} ราย ไม่ซ้ำ ใหม่ → เก่า อ่าน 3 หน้า`)

  // (c) ยอดผ่อนที่จ่ายแล้ว
  const sample = active[7 * 200] // มีงวดผ่อน (i % 7 === 0) · อยู่เลย 1,000 รายล่าสุด
  const want = installments.filter(i => i.lead_id === sample.id && i.is_paid).reduce((s, i) => s + Number(i.amount), 0)
  assert.ok(want > 0)
  const got = all.find(r => r.id === sample.id)
  assert.ok(got, '(c) ต้องเจอลูกค้าตัวอย่าง')
  assert.equal(got.total_installments_paid, want)
  assert.ok(!('crm_lead_installments' in got), '(c) ต้องไม่ส่งแถวงวดผ่อนดิบออกไป')
  assert.equal(all.find(r => r.id === active[1].id)?.total_installments_paid, 0)
  pass(`(c) total_installments_paid ของลูกค้าตัวอย่าง = ${want} (เฉพาะงวดที่จ่ายแล้ว)`)

  // (d) กรองสถานะ
  const status = 'accepted'
  const wantCount = active.filter(l => l.status === status).length
  const byStatus = await getLeads({ status })
  assert.equal(byStatus.error, undefined)
  assert.equal(byStatus.data.length, wantCount)
  assert.ok((byStatus.data as Row[]).every(r => r.status === status))
  pass(`(d) getLeads({ status: '${status}' }) ได้ ${wantCount} ราย ตรงกับข้อมูลที่ seed`)

  // (e) getArchivedLeads() ครบ เรียง archived_at ใหม่ → เก่า อ่าน 2 หน้า
  before = leadReads()
  const arch = await getArchivedLeads()
  assert.equal(arch.error, undefined)
  const archRows = arch.data as Lead[]
  assert.equal(archRows.length, ARCHIVED)
  noDupes(archRows, '(e)')
  assertDesc(archRows, 'archived_at', '(e)')
  assert.equal(leadReads() - before, 2, '1,200 แถว = อ่าน 2 หน้า')
  pass(`(e) getArchivedLeads() ได้ ${archRows.length}/${ARCHIVED} ราย ใหม่ → เก่า อ่าน 2 หน้า`)

  // (f) หน้าที่สองพัง → error ทั้งชุด ไม่คืนครึ่งๆ
  failAtRead = leadReads() + 2
  const broken = await getLeads()
  assert.deepEqual(broken.data, [], 'หน้าที่สองพัง ต้องไม่คืนหน้าแรก')
  assert.match(String(broken.error), /statement timeout/)
  failAtRead = leadReads() + 2
  const brokenArch = await getArchivedLeads()
  assert.deepEqual(brokenArch.data, [])
  assert.ok(brokenArch.error)
  failAtRead = null
  assert.equal((await getLeads()).data.length, ACTIVE, 'หายพังแล้วกลับมาครบ')
  pass('(f) อ่านพังกลางทาง (getLeads / getArchivedLeads) → { data: [], error } ไม่คืนรายการครึ่งๆ')

  // (g) หน้าต่าง 60 วัน: แตะล่าสุดใน 60 วัน หรือวันงานยังไม่ถึง — สองชุดรวมตาม id ไม่ซ้ำ ใหม่ → เก่า ไม่มีงานในคลัง
  const win = await getLeads({ window: { days: 60 } })
  assert.equal(win.error, undefined)
  const winRows = win.data as Lead[]
  assert.ok(inWindow.size > 100 && inWindow.size < ACTIVE, `fixture ต้องมีทั้งในและนอกหน้าต่าง (${inWindow.size})`)
  assert.deepEqual(new Set(winRows.map(r => r.id)), inWindow)
  noDupes(winRows, '(g)')
  assertDesc(winRows, 'created_at', '(g)')
  assert.ok(winRows.every(r => r.archived_at === null))
  pass(`(g) getLeads({ window: 60 วัน }) ได้ ${winRows.length} ราย ตรงกับที่ seed ไม่ซ้ำ ใหม่ → เก่า`)

  // (h) โหมดเบาไม่มีคอลัมน์หนัก · full มี
  const lean = all[0] as Row
  assert.ok(!('notes' in lean) && !('required_roles' in lean) && !('installment_1' in lean), '(h) โหมดเบาต้องไม่มี notes / required_roles / installment_1')
  assert.ok('event_date' in lean && 'total_installments_paid' in lean)
  const full = await getLeads({ full: true })
  assert.equal(full.data.length, ACTIVE)
  assert.ok(full.data.every(r => 'notes' in r && 'required_roles' in r), '(h) full ต้องมีทุกคอลัมน์')
  pass('(h) โหมดเบาไม่ดึง notes / required_roles · full: true ดึงครบ')

  // (i) includeArchived รวมงานในคลัง
  const withArch = await getLeads({ includeArchived: true })
  assert.equal(withArch.data.length, ACTIVE + ARCHIVED)
  assert.equal((withArch.data as Lead[]).filter(r => r.archived_at !== null).length, ARCHIVED)
  pass(`(i) getLeads({ includeArchived: true }) ได้ ${ACTIVE + ARCHIVED} ราย รวมงานในคลัง ${ARCHIVED}`)

  // (j) พนักงานลบลูกค้า / เก็บงานเก่าเป็นชุดไม่ได้ — ถูกปัดก่อนอ่านอะไรเลย
  role = 'staff'
  const readsBefore = [...reads.values()].reduce((a, b) => a + b, 0)
  assert.match(String((await deleteLead(active[0].id as string)).error), /เฉพาะแอดมิน/)
  assert.ok('error' in (await countStaleLeads()))
  assert.ok('error' in (await archiveStaleLeads()))
  assert.equal([...reads.values()].reduce((a, b) => a + b, 0), readsBefore, '(j) ต้องไม่อ่านฐานข้อมูลเลย')
  role = 'admin'
  pass('(j) deleteLead / countStaleLeads / archiveStaleLeads ปัดพนักงานก่อนอ่านข้อมูล')

  console.log('\ncrm-leads-load: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
