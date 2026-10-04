// ตรวจ tool ของ MCP (M5) กับ Supabase จำลอง — ไม่แตะฐานข้อมูลจริง
// Run:  npx tsx lib/mcp-tools.check.ts
// บรรทัดสุดท้ายต้องเป็น "mcp-tools.check: all passed"

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Module, { createRequire } from 'node:module'
import { createFakeDb, type Row } from '../scripts/mcp-fake-db'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'SERVER-KEY'

// ── ข้อมูลจำลอง ─────────────────────────────────────────────────────────────────
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const plus = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d) }
const TODAY = plus(0)

const item = (id: string, name: string, extra: Row = {}): Row => ({
  id, name, serial_number: null, category: 'กล้อง', status: 'available', quantity: 1, unit: null,
  is_consumable: false, min_quantity: null, shelf_id: null, price: 9999, image_url: 'https://x/img.jpg', description: null, ...extra,
})

const consumables: Row[] = Array.from({ length: 120 }, (_, i) =>
  item(`paper-${i}`, `กระดาษ ${String(i).padStart(3, '0')}`, { is_consumable: true, quantity: 0, unit: 'ม้วน', min_quantity: 2, category: 'วัสดุ', shelf_id: 'sh-b' }))

const tables: Record<string, Row[]> = {
  shelves: [
    { id: 'sh-a', code: 'A-1', name: 'ชั้นกล้อง', zone: 'A' },
    { id: 'sh-b', code: 'B-2', name: null, zone: 'B' },
  ],
  shelf_audits: [
    { id: 'au1', shelf_id: 'sh-a', created_at: `${plus(-3)}T10:00:00Z`, missing: [{ kind: 'item', id: 'x', name: 'x' }] },
  ],
  items: [
    item('cam-1', 'กล้อง Canon R6', { serial_number: 'SN-R6-001', status: 'in_use' }),
    item('cam-2', 'กล้อง Sony A7', { serial_number: 'SN-A7-002' }),
    item('light-1', 'ไฟแฟลช Godox', { category: 'ไฟ', status: 'damaged' }),
    item('tri-1', 'ขาตั้ง', { category: 'อุปกรณ์เสริม', shelf_id: 'sh-a' }),
    item('ink-1', 'หมึกพิมพ์', { is_consumable: true, quantity: 10, unit: 'ขวด', min_quantity: 3, category: 'วัสดุ', shelf_id: 'sh-a' }),
    ...consumables,
  ],
  kits: [
    { id: 'kit-1', name: 'กระเป๋า 1', shelf_id: 'sh-a', event_id: 'ev-1' },
    { id: 'kit-2', name: 'กระเป๋า 2', shelf_id: 'sh-a', event_id: 'ev-2' },
    { id: 'kit-3', name: 'กระเป๋า 3', shelf_id: null, event_id: null },
  ],
  kit_contents: [
    { id: 'kc1', kit_id: 'kit-1', item_id: 'cam-1', quantity: 1 },
    { id: 'kc2', kit_id: 'kit-2', item_id: 'cam-2', quantity: 1 },
    { id: 'kc3', kit_id: 'kit-2', item_id: 'light-1', quantity: 1 },
    { id: 'kc4', kit_id: 'kit-2', item_id: 'ink-1', quantity: 4 },
  ],
  events: [
    { id: 'ev-1', name: 'งานแต่ง สมชาย', event_date: plus(2), event_time: '09:00:00', event_end_time: '17:00:00', location: 'โรงแรม A', status: 'active', crm_lead_id: 'lead-ready' },
    { id: 'ev-2', name: 'งานบริษัท B', event_date: plus(10), event_time: null, event_end_time: null, location: 'ออฟฟิศ B', status: 'active', crm_lead_id: 'lead-missing' },
    { id: 'ev-3', name: 'งานปิดแล้ว C', event_date: plus(-5), event_time: null, event_end_time: null, location: 'ที่ C', status: 'completed', crm_lead_id: null },
    { id: 'ev-4', name: 'งานไกล D', event_date: plus(200), event_time: null, event_end_time: null, location: null, status: 'active', crm_lead_id: null },
  ],
  event_kits: [
    { kit_id: 'kit-1', event_id: 'ev-1', packed_at: `${TODAY}T08:00:00Z` },
    { kit_id: 'kit-2', event_id: 'ev-2', packed_at: null },
  ],
  profiles: [
    { id: 'u1', full_name: 'สมหญิง', nickname: 'หญิง', department: 'ฝ่ายประสานงาน', is_approved: true, pin: '1234' },
    { id: 'u2', full_name: 'แอดมิน', nickname: null, department: null, is_approved: true, pin: '9999' },
  ],
  event_staff: [
    { event_id: 'ev-1', user_id: 'u1', role: 'photographer', created_at: '2026-01-01' },
    { event_id: 'ev-3', user_id: 'u2', role: 'assistant', created_at: '2026-01-01' },
  ],
  crm_settings: [
    { category: 'staff_role', value: 'photographer', label_th: 'ช่างภาพ', sort_order: 1, is_active: true },
    { category: 'staff_role', value: 'assistant', label_th: 'ผู้ช่วย', sort_order: 2, is_active: true },
  ],
  event_closures: [
    {
      id: 'cl-1', event_name: 'งานปิดแล้ว C', event_date: plus(-5), closed_by: 'u2', closed_at: `${plus(-4)}T12:00:00Z`, image_urls: ['https://x/a.jpg'],
      kits_snapshot: [{ kitId: 'kit-3', kitName: 'กระเป๋า 3', items: [
        { itemId: 'a', itemName: 'เลนส์', status: 'damaged', imageUrl: 'https://x' },
        { itemId: 'b', itemName: 'สายไฟ', status: 'lost' },
        { itemId: 'c', itemName: 'แบต', status: 'available' },
        { itemId: 'd', itemName: 'หมึกพิมพ์', status: 'available', isConsumable: true, used: 3 },
      ] }],
    },
    { id: 'cl-old', event_name: 'งานเก่ามาก', event_date: plus(-90), closed_by: 'u1', closed_at: `${plus(-89)}T12:00:00Z`, kits_snapshot: [] },
  ],
  crm_leads: [
    { id: 'lead-ready', status: 'accepted', customer_name: 'คุณพร้อม', event_location: 'โรงแรม A', event_date: plus(2), event_end_date: null, event_time: '09:00:00', event_end_time: null, design_status: 'completed', supplier_note: null, backdrop_note: null, tracking_checklist: ['car_triton'], required_roles: {}, archived_at: null, prep_done_at: null },
    { id: 'lead-missing', status: 'accepted', customer_name: 'คุณขาด', event_location: 'ออฟฟิศ B', event_date: plus(10), event_end_date: null, event_time: null, event_end_time: null, design_status: 'not_started', supplier_note: null, backdrop_note: null, tracking_checklist: [], required_roles: { photographer: 2 }, archived_at: null, prep_done_at: null },
    { id: 'lead-past', status: 'accepted', customer_name: 'คุณผ่านไปแล้ว', event_location: 'ที่เก่า', event_date: plus(-3), event_end_date: null, event_time: null, event_end_time: null, design_status: 'not_started', supplier_note: null, backdrop_note: null, tracking_checklist: [], required_roles: {}, archived_at: null, prep_done_at: null },
    { id: 'lead-lost', status: 'lost', customer_name: 'ไม่ได้งาน', event_location: null, event_date: plus(3), event_end_date: null, event_time: null, event_end_time: null, design_status: 'not_started', supplier_note: null, backdrop_note: null, tracking_checklist: [], required_roles: {}, archived_at: null, prep_done_at: null },
  ],
  jobs: [
    { id: 'job-g1', job_type: 'graphic', status: 'done', title: 'ออกแบบ', assigned_to: [], claimed_by: null, crm_lead_id: 'lead-ready', design_status: 'completed', archived_at: null, created_at: '2026-01-01' },
  ],
  job_settings: [],
  lead_duty_claims: [],
  event_vehicles: [],
  activity_logs: [],
}
const fake = createFakeDb(tables)

// ── แทนโมดูลที่ต้องมี Next ────────────────────────────────────────────────────
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fake.client }],
  [/\/lib\/auth$/, { requireAuth: async () => null, getSessionLight: async () => ({}) }],
  [/^next\/headers$/, { headers: async () => new Headers(), cookies: async () => ({ get: () => undefined }) }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

const load = createRequire(__filename)
const tools = load('./mcp-tools') as typeof import('./mcp-tools')
const tracking = load('../app/(authenticated)/jobs/tracking/tracking-logic') as typeof import('../app/(authenticated)/jobs/tracking/tracking-logic')
const snapshotMod = load('../app/(authenticated)/jobs/tracking/data') as typeof import('../app/(authenticated)/jobs/tracking/data')
type ToolResult = import('./mcp-tools').ToolResult

const db = fake.client as unknown as Parameters<import('./mcp-tools').McpTool['run']>[0]
const THAI = /[฀-๿]/
const pass = (label: string) => console.log(`PASS  ${label}`)
const byName = (name: string) => {
  const t = tools.MCP_TOOLS.find(x => x.name === name)
  assert.ok(t, `ไม่มี tool ${name}`)
  return t
}
async function call(name: string, args: Record<string, unknown> = {}): Promise<Omit<ToolResult, 'rows'> & { rows: Record<string, unknown>[] }> {
  const r = await byName(name).run(db, args)
  assert.ok(typeof r.summary === 'string' && THAI.test(r.summary) && !r.summary.includes('\n'), `${name}: summary ต้องเป็นไทยบรรทัดเดียว`)
  assert.ok(Array.isArray(r.rows), `${name}: rows ต้องเป็นอาร์เรย์`)
  assert.ok(r.rows.length <= tools.MAX_ROWS, `${name}: rows ต้องไม่เกิน 100`)
  return r as Omit<ToolResult, 'rows'> & { rows: Record<string, unknown>[] }
}
/** คีย์ทั้งหมดในโครงสร้าง (ลึกทุกชั้น) */
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) v.forEach(x => keysDeep(x, out))
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out) }
  return out
}
const FORBIDDEN = ['pin', 'price', 'image_url', 'imageUrl', 'image_urls', 'pin_hash']

async function main() {
  // ═══ registry ═══════════════════════════════════════════════════════════════
  assert.deepEqual(tools.MCP_TOOLS.map(t => t.name), [
    'stock_summary', 'search_items', 'low_stock', 'kit_status', 'shelf_contents',
    'upcoming_events', 'event_detail', 'event_closures', 'job_readiness',
  ])
  assert.deepEqual(tools.MCP_TOOLS.map(t => t.module), ['stock', 'stock', 'stock', 'stock', 'stock', 'events', 'events', 'events', 'jobs'])
  for (const t of tools.MCP_TOOLS) {
    assert.ok(THAI.test(t.description), `${t.name}: description ต้องเป็นไทย`)
    assert.ok(typeof t.schema.safeParse === 'function' && t.schema.def.type === 'object', `${t.name}: ต้องมี zod object schema`)
    for (const [field, s] of Object.entries(t.schema.shape)) {
      assert.ok(THAI.test((s as { description?: string }).description ?? ''), `${t.name}.${field}: ต้องมี .describe() ภาษาไทย`)
    }
  }
  assert.deepEqual(tools.toolsFor(['stock']).map(t => t.module), ['stock', 'stock', 'stock', 'stock', 'stock'])
  assert.equal(tools.toolsFor(['stock', 'events', 'jobs']).length, 9)
  assert.equal(tools.toolsFor(['finance', 'crm']).length, 0)
  pass('9 tools ตามตาราง · module · zod schema · คำอธิบายไทย · toolsFor')

  // ═══ stock_summary ══════════════════════════════════════════════════════════
  {
    const r = await call('stock_summary')
    const row = (group: string, key: string) => r.rows.find(x => x.group === group && x.key === key)?.count
    assert.equal(row('อุปกรณ์', 'available'), 2)
    assert.equal(row('อุปกรณ์', 'in_use'), 1)
    assert.equal(row('อุปกรณ์', 'damaged'), 1)
    assert.equal(r.rows.find(x => x.key === 'in_use')?.label, 'กำลังใช้งาน')
    assert.equal(row('กระเป๋า', 'out'), 1)
    assert.equal(row('กระเป๋า', 'booked'), 1)
    assert.equal(row('กระเป๋า', 'home'), 1)
    assert.equal(row('วัสดุสิ้นเปลือง', 'low'), 120)
    assert.equal(row('ชั้น', 'audit_due'), 1) // B-2 ไม่เคยตรวจ
    assert.match(r.summary, /ออกงาน 1 \/ จองไว้ 1 \/ ในคลัง 1/)
    pass(`stock_summary — ${r.summary}`)
  }

  // ═══ search_items ═══════════════════════════════════════════════════════════
  {
    const r = await call('search_items', { q: 'กล้อง' })
    assert.deepEqual(r.rows.map(x => x.name), ['กล้อง Canon R6', 'กล้อง Sony A7'])
    const r6 = r.rows[0]
    assert.equal(r6.status, 'กำลังใช้งาน')
    assert.equal(r6.kit, 'กระเป๋า 1')
    assert.equal(r6.shelf, 'A-1') // อุปกรณ์ปกติใช้ชั้นของกระเป๋า
    assert.equal(r6.category, 'กล้อง')
    for (const k of FORBIDDEN) assert.ok(!keysDeep(r.rows).has(k), `search_items ต้องไม่มีคีย์ ${k}`)

    const bySerial = await call('search_items', { q: 'sn-a7' })
    assert.deepEqual(bySerial.rows.map(x => x.id), ['cam-2'])
    const ink = (await call('search_items', { q: 'หมึก' })).rows[0]
    assert.equal(ink.unit, 'ขวด')
    assert.equal(ink.quantity, 10)
    assert.equal(ink.shelf, 'A-1') // วัสดุสิ้นเปลืองใช้ชั้นตัวเอง
    assert.equal((await call('search_items', { status: 'damaged' })).rows.length, 1)

    const capped = await call('search_items', { consumable_only: true })
    assert.equal(capped.rows.length, 50)
    assert.equal(capped.total, 121)
    assert.match(capped.summary, /แสดง 50 จาก 121 รายการ/)
    const full = await call('search_items', { consumable_only: true, limit: 100 })
    assert.equal(full.rows.length, 100)
    assert.equal(full.total, 121)
    await assert.rejects(() => byName('search_items').run(db, { limit: 500 }))
    // คำค้นที่มีอักขระไวยากรณ์ของ PostgREST ไม่ทำให้ or() แตก
    await call('search_items', { q: 'a,b(c)%' })
    pass('search_items — ค้นชื่อ/serial/สถานะ · ชั้นตามกติกา shelfOf · ไม่มี pin/price/image_url · ตัดที่ limit พร้อม total')
  }

  // ═══ low_stock ══════════════════════════════════════════════════════════════
  {
    const r = await call('low_stock')
    assert.equal(r.rows.length, 100)
    assert.equal(r.total, 120)
    assert.match(r.summary, /แสดง 100 จาก 120 รายการ/)
    assert.equal(r.rows[0].shelf, 'B-2')
    assert.equal(r.rows[0].unit, 'ม้วน')
    assert.equal(r.rows[0].onShelf, 0)
    pass(`low_stock — ตัดที่ 100 · ${r.summary}`)
  }

  // ═══ kit_status ═════════════════════════════════════════════════════════════
  {
    const all = await call('kit_status')
    assert.equal(all.rows.length, 3)
    const k2 = all.rows.find(x => x.id === 'kit-2')!
    assert.deepEqual(k2.state, { kind: 'booked', label: 'จองไว้', event: 'งานบริษัท B', date: plus(10) })
    assert.deepEqual(k2.pack, { out: 0, total: 1, packed: false, blocked: ['ไฟแฟลช Godox (ชำรุด)'] })
    assert.equal(k2.problems, 1)
    assert.equal(k2.items, 3)
    assert.equal(k2.shelf, 'A-1')
    const one = await call('kit_status', { name: 'กระเป๋า 1' })
    assert.equal(one.rows.length, 1)
    assert.equal((one.rows[0].state as { kind: string }).kind, 'out')
    pass('kit_status — สถานะ/ชั้น/packState/ปัญหา/จำนวนของ · ค้นตามชื่อ')
  }

  // ═══ shelf_contents ═════════════════════════════════════════════════════════
  {
    const r = await call('shelf_contents', { code: 'a-1' })
    assert.deepEqual(r.rows.map(x => x.type), ['กระเป๋า', 'กระเป๋า', 'อุปกรณ์', 'วัสดุสิ้นเปลือง'])
    const ink = r.rows.find(x => x.name === 'หมึกพิมพ์')!
    assert.equal(ink.onShelf, 6) // 10 − 4 ในกระเป๋า
    assert.match(r.summary, /ชั้น A-1/)
    assert.match(r.summary, new RegExp(`ตรวจนับล่าสุด ${plus(-3)} ของขาด 1`))
    await assert.rejects(() => byName('shelf_contents').run(db, { code: 'Z-9' }), (e: Error) => e instanceof tools.ToolError && e.message === 'ไม่พบชั้นรหัส Z-9')
    await assert.rejects(() => byName('shelf_contents').run(db, { code: 'A_1' }), tools.ToolError) // _ ไม่ใช่ wildcard
    pass('shelf_contents — รหัสไม่สนตัวพิมพ์ · กระเป๋า/อุปกรณ์/วัสดุ (เหลือบนชั้น) · ตรวจนับล่าสุด · ไม่พบ = ToolError')
  }

  // ═══ upcoming_events ════════════════════════════════════════════════════════
  {
    const r = await call('upcoming_events')
    assert.deepEqual(r.rows.map(x => x.id), ['ev-1', 'ev-2'])
    const e1 = r.rows[0]
    assert.equal(e1.time, '09:00–17:00')
    assert.equal(e1.location, 'โรงแรม A')
    assert.deepEqual(e1.kits, [{ name: 'กระเป๋า 1', packed: true, out: '1/1', missing: [] }])
    assert.deepEqual(e1.staff, ['สมหญิง (หญิง)'])
    assert.deepEqual((r.rows[1].kits as { missing: string[] }[])[0].missing, ['ไฟแฟลช Godox (ชำรุด)'])
    assert.deepEqual((await call('upcoming_events', { days: 365 })).rows.map(x => x.id), ['ev-1', 'ev-2', 'ev-4'])
    assert.deepEqual((await call('upcoming_events', { days: 5 })).rows.map(x => x.id), ['ev-1'])
    pass('upcoming_events — ช่วงวัน · ไม่รวมงานปิด · เวลา สถานที่ กระเป๋า (จัดครบ/ขาด) ทีมงาน')
  }

  // ═══ event_detail ═══════════════════════════════════════════════════════════
  {
    const r = await call('event_detail', { id: 'ev-2' })
    const ev = r.rows[0]
    assert.equal(ev.name, 'งานบริษัท B')
    const kit = (ev.kits as { name: string; items: Record<string, unknown>[] }[])[0]
    assert.equal(kit.name, 'กระเป๋า 2')
    assert.deepEqual(kit.items.find(i => i.name === 'หมึกพิมพ์'), { name: 'หมึกพิมพ์', quantity: 4, unit: 'ขวด', consumable: true })
    assert.deepEqual(kit.items.find(i => i.name === 'ไฟแฟลช Godox'), { name: 'ไฟแฟลช Godox', status: 'ชำรุด' })
    for (const k of FORBIDDEN) assert.ok(!keysDeep(r.rows).has(k), `event_detail ต้องไม่มีคีย์ ${k}`)

    const closed = await call('event_detail', { name: 'ปิดแล้ว' })
    const c = closed.rows[0]
    assert.deepEqual(c.staff, [{ name: 'แอดมิน', role: 'ผู้ช่วย' }])
    const closure = c.closure as Record<string, unknown>
    assert.equal(closure.closedBy, 'แอดมิน')
    assert.equal(closure.damaged, 1)
    assert.equal(closure.lost, 1)
    assert.deepEqual(closure.consumablesUsed, [{ name: 'หมึกพิมพ์', used: 3 }])

    const many = await call('event_detail', { name: 'งาน' })
    assert.ok(many.rows.length > 1 && many.summary.includes('ระบุ id'))
    await assert.rejects(() => byName('event_detail').run(db, {}), tools.ToolError)
    await assert.rejects(() => byName('event_detail').run(db, { id: 'nope' }), tools.ToolError)
    pass('event_detail — ตาม id/ชื่อ · ของในกระเป๋า · ทีมงาน+ตำแหน่ง · สรุปปิดงาน · หลายงาน/ไม่พบ')
  }

  // ═══ event_closures ═════════════════════════════════════════════════════════
  {
    const r = await call('event_closures')
    assert.deepEqual(r.rows.map(x => x.id), ['cl-1'])
    assert.equal(r.rows[0].closedBy, 'แอดมิน')
    assert.equal(r.rows[0].damaged, 1)
    assert.equal(r.rows[0].maintenance, 0)
    assert.deepEqual(r.rows[0].problemItems, ['เลนส์ (ชำรุด)', 'สายไฟ (หาย)'])
    for (const k of FORBIDDEN) assert.ok(!keysDeep(r.rows).has(k), `event_closures ต้องไม่มีคีย์ ${k}`)
    const wide = await call('event_closures', { from: plus(-100), to: TODAY })
    assert.equal(wide.rows.length, 2)
    assert.equal((await call('event_closures', { from: plus(-100), to: TODAY, limit: 1 })).total, 2)
    await assert.rejects(() => byName('event_closures').run(db, { from: '01/02/2026' }))
    pass('event_closures — ช่วงวันที่ (ค่าเริ่มต้น 30 วัน) · ผู้ปิด · ของเสีย/หาย · วัสดุที่ใช้')
  }

  // ═══ job_readiness ═════════════════════════════════════════════════════════
  {
    const r = await call('job_readiness')
    // คำตอบที่ถูกต้อง: คิดด้วยฟังก์ชันจริงของหน้าติดตามงาน
    const snap = await snapshotMod.getTrackingSnapshot({ session: {} })
    const kitR = tracking.kitReadinessByLead(snap.rows, snap.poolJobs, snap.kitBookings)
    const design = tracking.designReadyByLead(snap.poolJobs)
    const expected = snap.rows
      .filter(l => !tracking.isPast(l, new Date()))
      .filter(l => tracking.getMissing(l, kitR.get(l.id), design.get(l.id) ?? false).length > 0)
      .map(l => ({ id: l.id, missing: tracking.getMissing(l, kitR.get(l.id), design.get(l.id) ?? false).map(m => tracking.missingLabel(m, l, snap.roleLabels)) }))
    assert.deepEqual(r.rows.map(x => ({ id: x.leadId, missing: x.missing })), expected)
    assert.deepEqual(r.rows.map(x => x.leadId), ['lead-missing'])
    assert.deepEqual(r.rows[0].missing, ['ออกแบบ', 'จัดคน (ช่างภาพ 2)', 'จัดรถ', 'เวลาเริ่ม', 'กระเป๋า'])
    assert.equal(r.rows[0].customer, 'คุณขาด')
    assert.deepEqual(r.rows[0].kits, [{ name: 'กระเป๋า 2', event: 'งานบริษัท B', packed: false }])
    assert.match(r.summary, /ยังไม่พร้อม 1 จาก 2 งาน/)
    pass('job_readiness — ตรงกับ getMissing/missingLabel ของหน้าติดตามงาน (ไม่รวมงานผ่านไปแล้ว)')
  }

  // ═══ อ่านอย่างเดียว ═════════════════════════════════════════════════════════
  assert.deepEqual(fake.writes, [], 'tool ต้องไม่เขียนฐานข้อมูล')
  const src = readFileSync(join(__dirname, 'mcp-tools.ts'), 'utf8')
  for (const pat of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) assert.ok(!src.includes(pat), `lib/mcp-tools.ts ต้องไม่มี ${pat}`)
  pass('อ่านอย่างเดียว — ไม่มีการเขียนระหว่างรัน · ไม่มี insert/update/delete/upsert/rpc ในซอร์ส')

  // ═══ formatResult + capBytes ════════════════════════════════════════════════
  {
    const r = { summary: 'ทดสอบ', rows: [{ a: 1 }], total: 1 }
    assert.equal(tools.formatResult(r), 'ทดสอบ\n{"rows":[{"a":1}],"total":1}')
    assert.equal(tools.formatResult({ summary: 'x', rows: [] }), 'x\n{"rows":[],"total":0}')
    const big = { summary: 'ใหญ่', rows: Array.from({ length: 100 }, (_, i) => ({ i, text: 'ก'.repeat(400) })) }
    assert.ok(Buffer.byteLength(tools.formatResult(big)) > tools.MAX_RESULT_BYTES)
    const cut = tools.capBytes(big)
    assert.ok(Buffer.byteLength(tools.formatResult(cut)) <= tools.MAX_RESULT_BYTES)
    assert.ok(cut.rows.length > 0 && cut.rows.length < 100)
    assert.equal(cut.total, 100)
    assert.match(cut.summary, /ข้อมูลยาวเกินจึงแสดง \d+ จาก 100 รายการ/)
    assert.equal(tools.capBytes(r), r)
    pass(`formatResult กระชับ · capBytes ตัดเหลือ ${cut.rows.length} แถว ≤ 64KB พร้อม total`)
  }

  console.log('mcp-tools.check: all passed')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
