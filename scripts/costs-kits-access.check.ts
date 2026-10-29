// ความปลอดภัยรอบ 3 ข้อ M4 (costs) + M7 (QR กระเป๋า) — ไม่แตะฐานข้อมูลจริง ไม่ต้องมี env
// Run:  npx tsx scripts/costs-kits-access.check.ts
//
// แทน next/cache, @/lib/supabase-server, @/lib/logger, @/lib/auth ด้วยตัวจำลอง (ดัก Module._load แบบ packing-flow.check.ts)
// ครอบคลุม: static scan ว่าทุก export ใน costs/actions.ts และ kits/[id]/check/actions.ts เรียก requireModule( ใน 6 บรรทัดแรก ·
// checkinKitItem รับคืนเฉพาะชิ้น in_use (เว้น allowClosedEvent) · gate โมดูลของ action ทั้งสองไฟล์ ·
// updateJobEvent รับเฉพาะคีย์ของฟอร์ม (pickJobEventFields) · ยอดเงินติดลบ/NaN ถูกปฏิเสธ
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "costs-kits-access: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type Row = Record<string, unknown>
type Call = { table: string; op: 'select' | 'update' | 'insert' | 'delete'; filters: Row; payload: unknown }

let passed = 0
function check(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed++
      console.log(`PASS  ${name}`)
    })
}

// ── ฐานข้อมูลจำลองแบบเล็ก: บันทึกทุกคำสั่ง · ตอบตามตาราง ─────────────────────
const state = {
  eventStatus: 'confirmed' as string,
  booked: true,
  kitItems: [] as { id: string; name: string; status: string; is_consumable: boolean | null }[],
}
const calls: Call[] = []

function run(q: Call, single: boolean): { data: unknown; error: null } {
  calls.push(q)
  if (q.op !== 'select') return { data: single ? null : [], error: null }
  if (q.table === 'event_kits') return { data: state.booked ? { events: { status: state.eventStatus }, packed_at: null } : null, error: null }
  if (q.table === 'kit_contents') return { data: state.kitItems.map(items => ({ items })), error: null }
  return { data: single ? null : [], error: null }
}

const fakeDb = {
  from(table: string) {
    const q: Call = { table, op: 'select', filters: {}, payload: null }
    const b = {
      select() { return b },
      eq(k: string, v: unknown) { q.filters[k] = v; return b },
      in(k: string, v: unknown) { q.filters[k] = v; return b },
      ilike() { return b },
      order() { return b },
      limit() { return b },
      range() { return b },
      update(p: unknown) { q.op = 'update'; q.payload = p; return b },
      insert(p: unknown) { q.op = 'insert'; q.payload = p; return b },
      delete() { q.op = 'delete'; return b },
      maybeSingle: () => Promise.resolve(run(q, true)),
      single: () => Promise.resolve(run(q, true)),
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) { return Promise.resolve(run(q, false)).then(res, rej) },
    }
    return b
  },
}

// ── ผู้ใช้จำลอง: requireModule/requireAuth ตามกติกาเดียวกับ lib/auth.ts ─────────
type Who = { userId: string; role: string; modules: string[] } | null
let who: Who = null
const session = () => (who ? { userId: who.userId, role: who.role, sessionId: 's1' } : null)
const fakeAuth = {
  requireAuth: async () => session(),
  requireModule: async (keys: string | string[]) => {
    if (!who) return null
    if (who.role === 'admin') return session()
    const wanted = Array.isArray(keys) ? keys : [keys]
    return wanted.some(k => who!.modules.includes(k)) ? session() : null
  },
}

const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeDb }],
  [/^next\/cache$/, { revalidatePath() {}, revalidateTag() {} }],
  [/[/\\]lib[/\\]logger$/, { logActivity: async () => {} }],
  [/[/\\]lib[/\\]auth$/, fakeAuth],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const core = require('../app/(authenticated)/kits/[id]/check/kit-check-core') as typeof import('../app/(authenticated)/kits/[id]/check/kit-check-core')
const kitActions = require('../app/(authenticated)/kits/[id]/check/actions') as typeof import('../app/(authenticated)/kits/[id]/check/actions')
const costs = require('../app/(authenticated)/costs/actions') as typeof import('../app/(authenticated)/costs/actions')
/* eslint-enable @typescript-eslint/no-require-imports */

const ROOT = join(__dirname, '..')
const COSTS_FILE = 'app/(authenticated)/costs/actions.ts'
const KITS_FILE = 'app/(authenticated)/kits/[id]/check/actions.ts'

/** ทุก export async function ต้องเรียก requireModule( ภายใน 6 บรรทัดแรกของ body — คืนรายชื่อที่ไม่ผ่าน */
function scan(file: string): { names: string[]; offenders: string[] } {
  const lines = readFileSync(join(ROOT, file), 'utf8').split(/\r?\n/)
  const names: string[] = []
  const offenders: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^export async function (\w+)/)
    if (!m) continue
    names.push(m[1])
    // body เริ่มหลังบรรทัดที่ปิดวงเล็บพารามิเตอร์แล้วตามด้วย { (ข้าม type แบบหลายบรรทัดของพารามิเตอร์)
    let j = i
    while (j < lines.length && !/\)(\s*:.*)?\s*\{\s*$/.test(lines[j])) j++
    const body = lines.slice(j + 1, j + 7).join('\n')
    if (!body.includes('requireModule(')) offenders.push(`${file}::${m[1]}`)
  }
  return { names, offenders }
}

const fd = (o: Row) => {
  const f = new FormData()
  for (const [k, v] of Object.entries(o)) f.set(k, String(v))
  return f
}
const writes = () => calls.filter(c => c.op !== 'select')
const reset = () => { calls.length = 0 }

const ADMIN: Who = { userId: 'u-admin', role: 'admin', modules: [] }
const COSTS_USER: Who = { userId: 'u-costs', role: 'staff', modules: ['costs'] }
const FIN_USER: Who = { userId: 'u-fin', role: 'staff', modules: ['finance', 'stock', 'events'] }
const EVENTS_USER: Who = { userId: 'u-ev', role: 'staff', modules: ['events'] }
const STOCK_USER: Who = { userId: 'u-st', role: 'staff', modules: ['stock'] }
const CRM_USER: Who = { userId: 'u-crm', role: 'staff', modules: ['crm'] }

async function main() {
  await check('static scan: ทุก export ใน costs/actions.ts และ kits/[id]/check/actions.ts เรียก requireModule( ใน 6 บรรทัดแรก', () => {
    const a = scan(COSTS_FILE)
    const b = scan(KITS_FILE)
    assert.ok(a.names.length >= 13, `costs exports ${a.names.length}`)
    assert.equal(b.names.length, 3)
    assert.deepEqual([...a.offenders, ...b.offenders], [], 'ผู้ที่ไม่ผ่าน')
  })

  // ── M7: checkinKitItem ──────────────────────────────────────────────────
  const base = { eventId: 'ev1', kitId: 'k1', userId: 'u1' }
  const setKit = () => {
    state.eventStatus = 'confirmed'
    state.booked = true
    state.kitItems = [
      { id: 'avail', name: 'กล้อง A', status: 'available', is_consumable: false },
      { id: 'out', name: 'กล้อง B', status: 'in_use', is_consumable: false },
    ]
  }

  await check('checkinKitItem: ชิ้นที่ยัง available (ไม่ได้หยิบ) → { error } และไม่แตะ items/event_logs', async () => {
    setKit(); reset()
    const r = await core.checkinKitItem(fakeDb as never, { ...base, itemId: 'avail', status: 'lost' })
    assert.deepEqual(r, { error: 'อุปกรณ์นี้ยังไม่ได้ถูกหยิบออก' })
    assert.deepEqual(writes(), [])
  })

  await check('checkinKitItem: ชิ้น in_use → สำเร็จ + update items + event_logs', async () => {
    setKit(); reset()
    const r = await core.checkinKitItem(fakeDb as never, { ...base, itemId: 'out', status: 'damaged' })
    assert.deepEqual(r, { success: true })
    const upd = writes().find(c => c.table === 'items' && c.op === 'update')
    assert.ok(upd, 'ต้อง update items')
    assert.deepEqual(upd.payload, { status: 'damaged' })
    assert.equal(upd.filters.id, 'out')
    assert.ok(writes().some(c => c.table === 'event_logs' && c.op === 'insert'))
  })

  await check('checkinKitItem: allowClosedEvent (คืนชั้นจากใบจัดของ) ยังรับชิ้น available ได้ แม้อีเวนต์ปิดแล้ว', async () => {
    setKit(); state.eventStatus = 'completed'; reset()
    const r = await core.checkinKitItem(fakeDb as never, { ...base, itemId: 'avail', status: 'available', allowClosedEvent: true })
    assert.deepEqual(r, { success: true })
    assert.ok(writes().some(c => c.table === 'items' && c.op === 'update' && c.filters.id === 'avail'))
  })

  await check('checkoutKitItems: ชิ้นที่ไม่ available → { error } ระบุชื่อ และไม่ update', async () => {
    setKit(); reset()
    const r = await core.checkoutKitItems(fakeDb as never, { ...base, itemIds: ['out'] })
    assert.ok('error' in r && r.error.includes('กล้อง B'), JSON.stringify(r))
    assert.deepEqual(writes(), [])
  })

  // ── M7: gate ของ action QR ─────────────────────────────────────────────────
  await check('QR action: ไม่ล็อกอิน = ข้อความเดิม · ล็อกอินแต่ไม่มี stock/events = ข้อความใหม่ · ไม่แตะฐานข้อมูล', async () => {
    setKit()
    who = null; reset()
    assert.deepEqual(await kitActions.checkinItem('ev1', 'k1', 'out', 'available'), { error: 'ไม่ได้เข้าสู่ระบบ' })
    assert.deepEqual(await kitActions.checkoutItems('ev1', 'k1', ['avail']), { error: 'ไม่ได้เข้าสู่ระบบ' })
    assert.deepEqual(await kitActions.syncKitPacked('ev1', 'k1'), { error: 'ไม่ได้เข้าสู่ระบบ' })
    who = CRM_USER
    for (const r of [
      await kitActions.checkinItem('ev1', 'k1', 'out', 'available'),
      await kitActions.checkoutItems('ev1', 'k1', ['avail']),
      await kitActions.syncKitPacked('ev1', 'k1'),
    ]) {
      assert.ok(r && 'error' in r && r.error.includes('ไม่มีสิทธิ์'), JSON.stringify(r))
    }
    assert.deepEqual(calls, [])
  })

  await check('QR action: ผู้มี events หรือ stock หรือ admin ผ่าน · รับคืนชิ้น available ผ่าน QR ถูกปฏิเสธ', async () => {
    for (const u of [EVENTS_USER, STOCK_USER, ADMIN]) {
      setKit(); who = u
      assert.equal(await kitActions.checkinItem('ev1', 'k1', 'out', 'available'), undefined, `checkin ${u!.userId}`)
      setKit()
      assert.deepEqual(await kitActions.checkinItem('ev1', 'k1', 'avail', 'lost'), { error: 'อุปกรณ์นี้ยังไม่ได้ถูกหยิบออก' })
    }
  })

  // ── M4: costs gate ─────────────────────────────────────────────────────────
  await check('costs: ผู้ไม่มีโมดูล costs ถูกปฏิเสธทุก export และไม่แตะฐานข้อมูล', async () => {
    who = FIN_USER; reset()
    const results = [
      await costs.importEventFromStock('e1'),
      await costs.importEventFromClosure('c1'),
      await costs.syncRevenueFromCRM('j1'),
      await costs.bulkSyncRevenueFromCRM(),
      await costs.updateJobEvent('j1', { revenue: 1 }),
      await costs.deleteJobEvent('j1'),
      await costs.createCostItem(fd({ job_event_id: 'j1', amount: 1 })),
      await costs.updateCostItem('i1', { amount: 1 }),
      await costs.deleteCostItem('i1'),
      await costs.createJobEventManual(fd({ event_name: 'x' })),
      await costs.searchCRMLeadsForLink('x'),
      await costs.linkCostEventToCRM('j1', 'l1'),
      await costs.unlinkCostEventFromCRM('j1'),
    ]
    for (const r of results) assert.equal((r as { error?: string }).error, 'Unauthorized')
    assert.deepEqual((results[10] as { data: unknown[] }).data, [])
    assert.deepEqual(calls, [])
  })

  await check('costs: deleteJobEvent/updateCostItem/deleteCostItem ยังต้องเป็น admin แม้มีโมดูล costs', async () => {
    who = COSTS_USER; reset()
    assert.match((await costs.deleteJobEvent('j1')).error ?? '', /Admin/)
    assert.match((await costs.updateCostItem('i1', { amount: 1 })).error ?? '', /Admin/)
    assert.match((await costs.deleteCostItem('i1')).error ?? '', /Admin/)
    assert.deepEqual(writes(), [])
  })

  await check('pickJobEventFields (ผ่าน updateJobEvent): ตัด linked_lead_id/source_event_id/imported_by/created_by/id เก็บคีย์ของฟอร์ม', async () => {
    who = COSTS_USER; reset()
    const evil = {
      revenue: 5000, revenue_vat_mode: 'include', revenue_wht_rate: 3, status: 'completed',
      linked_lead_id: 'l-x', source_event_id: 's-x', imported_by: 'u-x', created_by: 'u-x', id: 'other', notes: 'n',
    }
    const r = await costs.updateJobEvent('j1', evil as never)
    assert.deepEqual(r, { success: true })
    const upd = writes().find(c => c.table === 'job_cost_events' && c.op === 'update')
    assert.ok(upd)
    assert.deepEqual(upd.payload, { revenue: 5000, revenue_vat_mode: 'include', revenue_wht_rate: 3, status: 'completed' })
    assert.equal(upd.filters.id, 'j1')
    reset()
    assert.deepEqual(await costs.updateJobEvent('j1', { status: 'draft' }), { success: true })
    assert.deepEqual(writes()[0].payload, { status: 'draft' })
  })

  await check('ยอดเงินติดลบ/NaN → "จำนวนเงินไม่ถูกต้อง" ไม่เขียน · ยอดปกติผ่าน', async () => {
    const BAD = { error: 'จำนวนเงินไม่ถูกต้อง' }
    who = COSTS_USER; reset()
    assert.deepEqual(await costs.createCostItem(fd({ job_event_id: 'j1', category: 'x', amount: -5 })), BAD)
    assert.deepEqual(await costs.createCostItem(fd({ job_event_id: 'j1', category: 'x', amount: 'abc' })), BAD)
    assert.deepEqual(await costs.createCostItem(fd({ job_event_id: 'j1', category: 'x', amount: 100, unit_price: -1 })), BAD)
    assert.deepEqual(await costs.createJobEventManual(fd({ event_name: 'x', revenue: -1 })), BAD)
    assert.deepEqual(await costs.createJobEventManual(fd({ event_name: 'x', revenue: 'Infinity' })), BAD)
    assert.deepEqual(await costs.updateJobEvent('j1', { revenue: -1 }), BAD)
    assert.deepEqual(await costs.updateJobEvent('j1', { revenue: NaN }), BAD)
    who = ADMIN
    assert.deepEqual(await costs.updateCostItem('i1', { amount: -1 }), BAD)
    assert.deepEqual(await costs.updateCostItem('i1', { quantity: NaN }), BAD)
    assert.deepEqual(writes(), [])
    who = COSTS_USER
    assert.deepEqual(await costs.createCostItem(fd({ job_event_id: 'j1', category: 'x', amount: 100, unit_price: 100, quantity: 1 })), { success: true })
    who = ADMIN
    assert.deepEqual(await costs.updateCostItem('i1', { amount: 0, unit_price: 50 }), { success: true })
    assert.equal(writes().length, 2)
  })

  console.log(`\nตรวจ ${passed} ข้อ`)
  console.log('costs-kits-access: ผ่านทั้งหมด')
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
