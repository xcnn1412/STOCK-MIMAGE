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

function claim(id: string, user: string, status: string, extra: Row = {}): Row {
  return {
    id, claim_number: `EXP-${id.toUpperCase()}`, claim_type: 'other', title: `ใบ ${id}`, amount: 100, vat_mode: 'none', withholding_tax_rate: 0,
    status, category: 'food', submitted_by: user, submitted_at: '2026-09-10T02:00:00Z', approved_at: null, paid_at: null,
    created_at: `2026-09-${String(10 + Number(id.replace(/\D/g, ''))).padStart(2, '0')}T00:00:00Z`, expense_date: '2026-09-09',
    funding_source: null, job_event_id: null, reject_reason: null, refund_amount: null, refund_confirmed_at: null, actual_spent_amount: null,
    advance_settled_at: null, pettycash_fund_id: null, pettycash_closed_at: null, filed_at: null, filed_file_count: null, deleted_at: null,
    receipt_urls: ['https://x/r.jpg'], actual_receipt_urls: ['https://x/a.jpg'], tax_invoice_urls: ['https://x/t.pdf'], tax_invoice_numbers: ['INV-1'],
    refund_slip_urls: ['https://x/s.jpg'], bank_name: 'กสิกร', bank_account: '1234', bank_account_number: '123-4-56789-0', account_holder_name: 'สมหญิง',
    ...extra,
  }
}

function checkin(id: string, user: string, type: string, inAt: string, outAt: string | null, extra: Row = {}): Row {
  return {
    id, user_id: user, check_type: type, checked_in_at: inAt, checked_out_at: outAt, note: null, event_id: null, duties: [],
    province: null, district: null, out_of_province: false, paid_slip_id: null,
    latitude: 13.75, longitude: 100.5, photo_url: 'https://x/in.webp', checkout_photo_url: 'https://x/out.webp', ...extra,
  }
}

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
    { id: 'u1', full_name: 'สมหญิง', nickname: 'หญิง', department: 'ฝ่ายประสานงาน', is_approved: true, pin: '1234', bank_name: 'กสิกร', bank_account_number: '123-4-56789-0' },
    { id: 'u2', full_name: 'แอดมิน', nickname: null, department: null, is_approved: true, pin: '9999' },
    { id: 'u3', full_name: 'สมปอง', nickname: 'ปอง', department: null, is_approved: true, pin: '5555' },
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
  // ── ใบเบิก: u1 = ผู้ใช้เอง · u3 = คนอื่น · ทุกแถวมีลิงก์ไฟล์ + บัญชีธนาคาร เพื่อพิสูจน์ว่าไม่หลุดออกไป
  expense_claims: [
    claim('c1', 'u1', 'pending', { amount: 1000, category: 'travel', job_event_id: 'jce-1', expense_date: '2026-09-10' }),
    claim('c2', 'u1', 'rejected', { amount: 300, reject_reason: 'ใบเสร็จไม่ชัด' }),
    claim('c3', 'u1', 'paid', { amount: 400 }),
    claim('c4', 'u1', 'paid', { claim_type: 'advance', amount: 5000, actual_spent_amount: null }),
    claim('c5', 'u1', 'paid', { claim_type: 'advance', amount: 2000, actual_spent_amount: 1900, refund_amount: 100 }),
    claim('c6', 'u1', 'paid', { claim_type: 'petty_cash', amount: 3000, pettycash_fund_id: null, pettycash_closed_at: null }),
    claim('c7', 'u1', 'paid', { claim_type: 'petty_cash', amount: 3000, pettycash_closed_at: '2026-09-30T10:00:00Z' }),
    claim('c8', 'u1', 'cancelled', { amount: 50 }),
    claim('c9', 'u1', 'pending', { amount: 777, deleted_at: '2026-09-20T10:00:00Z' }),
    claim('c10', 'u1', 'draft', { amount: 120, expense_date: '2026-08-05', filed_at: '2026-09-01T03:00:00Z' }),
    claim('o1', 'u3', 'pending', { amount: 2000 }),
    claim('o2', 'u3', 'paid', { amount: 600 }),
    claim('o3', 'u3', 'approved', { amount: 999, deleted_at: '2026-09-21T10:00:00Z' }),
  ],
  job_cost_events: [{ id: 'jce-1', event_name: 'งานแต่ง สมชาย', linked_lead_id: null }],
  finance_categories: [{ value: 'travel', label_th: 'ค่าเดินทาง (หมวดในระบบ)' }],
  // ── เช็คอิน: ทุกแถวมีพิกัด + รูป เพื่อพิสูจน์ว่าไม่หลุดออกไป
  salary_duties: [
    { code: 'photo', name_th: 'ช่างภาพ', is_active: true },
    { code: 'mc', name_th: 'พิธีกร', is_active: false },
  ],
  staff_checkins: [
    checkin('k1', 'u1', 'office', '2026-09-10T01:30:00.000Z', '2026-09-10T10:00:00.000Z'),
    // 2026-09-11 17:30 UTC = 2026-09-12 00:30 เวลาไทย
    checkin('k2', 'u1', 'onsite', '2026-09-11T17:30:00.000Z', null, {
      event_id: 'ev-1', duties: ['photo', 'mc'], province: 'ชลบุรี', district: 'บางละมุง', out_of_province: true,
      note: 'ไปงาน [ref:jce:00000000-0000-4000-8000-000000000001]',
    }),
    checkin('k3', 'u3', 'remote', '2026-09-10T02:00:00.000Z', '2026-09-10T04:15:00.000Z', { note: 'ทำงานที่บ้าน' }),
    checkin('k4', 'u1', 'office', new Date(Date.now() - 1000).toISOString(), null),
    checkin('k5', 'u3', 'onsite', new Date(Date.now() - 2000).toISOString(), null, { event_id: 'ev-2', duties: ['photo'] }),
  ],
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
type Ctx = import('./mcp-tools').ToolContext
const STAFF: Ctx = { userId: 'u1', role: 'staff', modules: ['stock', 'events', 'jobs', 'finance', 'checkin'] }
const ADMIN: Ctx = { userId: 'u2', role: 'admin', modules: ['stock', 'events', 'jobs', 'finance', 'checkin'] }
const THAI = /[฀-๿]/
const pass = (label: string) => console.log(`PASS  ${label}`)
const byName = (name: string) => {
  const t = tools.MCP_TOOLS.find(x => x.name === name)
  assert.ok(t, `ไม่มี tool ${name}`)
  return t
}
async function call(name: string, args: Record<string, unknown> = {}, ctx: Ctx = STAFF): Promise<Omit<ToolResult, 'rows'> & { rows: Record<string, unknown>[] }> {
  const r = await byName(name).run(db, args, ctx)
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
/** คีย์ต้องห้ามของใบเบิก / เช็คอิน (สเปค mcp-tools-2) + รูปแบบ *_urls / bank_* */
const FORBIDDEN_2 = [
  'latitude', 'longitude', 'photo_url', 'checkout_photo_url', 'receipt_urls', 'actual_receipt_urls', 'tax_invoice_urls',
  'tax_invoice_numbers', 'refund_slip_urls', 'bank_name', 'bank_account', 'bank_account_number', 'account_holder_name', 'pin',
]
function assertClean(label: string, v: unknown) {
  const keys = keysDeep(v)
  for (const k of FORBIDDEN_2) assert.ok(!keys.has(k), `${label} ต้องไม่มีคีย์ ${k}`)
  for (const k of keys) assert.ok(!/_urls$/.test(k) && !/^bank_/.test(k), `${label} ต้องไม่มีคีย์ ${k}`)
  const text = JSON.stringify(v)
  for (const leak of ['https://x/', '123-4-56789-0', '13.75', '100.5']) assert.ok(!text.includes(leak), `${label} ต้องไม่มีค่า ${leak}`)
}

async function main() {
  // ═══ registry ═══════════════════════════════════════════════════════════════
  assert.deepEqual(tools.MCP_TOOLS.map(t => t.name), [
    'stock_summary', 'search_items', 'low_stock', 'kit_status', 'shelf_contents',
    'upcoming_events', 'event_detail', 'event_closures', 'job_readiness',
    'my_claims', 'all_claims', 'my_checkins', 'team_checkins',
  ])
  assert.deepEqual(tools.MCP_TOOLS.map(t => t.module), [
    'stock', 'stock', 'stock', 'stock', 'stock', 'events', 'events', 'events', 'jobs', 'finance', 'finance', 'checkin', 'checkin',
  ])
  assert.deepEqual(tools.MCP_TOOLS.filter(t => t.adminOnly).map(t => t.name), ['all_claims', 'team_checkins'])
  for (const t of tools.MCP_TOOLS) {
    assert.ok(THAI.test(t.description), `${t.name}: description ต้องเป็นไทย`)
    assert.ok(typeof t.schema.safeParse === 'function' && t.schema.def.type === 'object', `${t.name}: ต้องมี zod object schema`)
    for (const [field, s] of Object.entries(t.schema.shape)) {
      assert.ok(THAI.test((s as { description?: string }).description ?? ''), `${t.name}.${field}: ต้องมี .describe() ภาษาไทย`)
    }
  }
  assert.deepEqual(tools.toolsFor(['stock'], 'staff').map(t => t.module), ['stock', 'stock', 'stock', 'stock', 'stock'])
  assert.equal(tools.toolsFor(['stock', 'events', 'jobs'], 'staff').length, 9)
  assert.equal(tools.toolsFor(['crm', 'kpi'], 'staff').length, 0)
  // T1: adminOnly ไม่ออกให้ non-admin แม้มีโมดูล
  assert.deepEqual(tools.toolsFor(['finance'], 'staff').map(t => t.name), ['my_claims'])
  assert.deepEqual(tools.toolsFor(['checkin'], 'staff').map(t => t.name), ['my_checkins'])
  assert.deepEqual(tools.toolsFor(['finance', 'checkin'], 'staff').map(t => t.name), ['my_claims', 'my_checkins'])
  assert.deepEqual(tools.toolsFor(['finance', 'checkin'], 'admin').map(t => t.name), ['my_claims', 'all_claims', 'my_checkins', 'team_checkins'])
  assert.deepEqual(tools.toolsFor(['checkin'], 'admin').map(t => t.name), ['my_checkins', 'team_checkins'])
  assert.equal(tools.toolsFor(['stock', 'events', 'jobs', 'finance', 'checkin'], 'admin').length, 13)
  assert.equal(tools.toolsFor(['stock', 'events', 'jobs', 'finance', 'checkin'], 'staff').length, 11)
  pass('13 tools ตามตาราง · module · adminOnly · zod schema · คำอธิบายไทย · toolsFor(modules, role)')

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
    await assert.rejects(() => byName('search_items').run(db, { limit: 500 }, STAFF))
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
    await assert.rejects(() => byName('shelf_contents').run(db, { code: 'Z-9' }, STAFF), (e: Error) => e instanceof tools.ToolError && e.message === 'ไม่พบชั้นรหัส Z-9')
    await assert.rejects(() => byName('shelf_contents').run(db, { code: 'A_1' }, STAFF), tools.ToolError) // _ ไม่ใช่ wildcard
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
    await assert.rejects(() => byName('event_detail').run(db, {}, STAFF), tools.ToolError)
    await assert.rejects(() => byName('event_detail').run(db, { id: 'nope' }, STAFF), tools.ToolError)
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
    await assert.rejects(() => byName('event_closures').run(db, { from: '01/02/2026' }, STAFF))
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

  // ═══ my_claims (T2) ══════════════════════════════════════════════════════════
  {
    const nums = (r: { rows: Record<string, unknown>[] }) => r.rows.map(x => x.claim_number).sort()
    const open = await call('my_claims')
    // ยังไม่จบ = สถานะไม่จบ (c1 รออนุมัติ, c2 ปฏิเสธ, c10 แบบร่าง) + ทดลองจ่ายยังไม่เคลียร์ (c4) + วงเงินสดย่อยยังเปิด (c6) · ไม่รวม c9 ที่ซ่อน
    assert.deepEqual(nums(open), ['EXP-C1', 'EXP-C10', 'EXP-C2', 'EXP-C4', 'EXP-C6'])
    assert.match(open.summary, /ใบเบิกของคุณที่ยังไม่จบ 5 ใบ รวม ฿9,420/)
    const c1 = open.rows.find(x => x.claim_number === 'EXP-C1')!
    assert.deepEqual(c1, {
      claim_number: 'EXP-C1', title: 'ใบ c1', claim_type: 'เบิกค่าอื่นๆ', category: 'ค่าเดินทาง (หมวดในระบบ)', amount: 1000, status: 'รออนุมัติ',
      expense_date: '2026-09-10', submitted_at: '2026-09-10 09:00', approved_at: null, paid_at: null, job_event: 'งานแต่ง สมชาย',
      reject_reason: null, actual_spent_amount: null, refund_amount: null, docs_filed: false,
    })
    assert.equal(open.rows.find(x => x.claim_number === 'EXP-C2')!.reject_reason, 'ใบเสร็จไม่ชัด')
    assert.equal(open.rows.find(x => x.claim_number === 'EXP-C2')!.status, 'ปฏิเสธ')
    assert.equal(open.rows.find(x => x.claim_number === 'EXP-C4')!.claim_type, 'เบิกทดลองจ่าย')
    assert.equal(open.rows.find(x => x.claim_number === 'EXP-C6')!.claim_type, 'เบิกเงินสดย่อย')
    assert.equal(open.rows.find(x => x.claim_number === 'EXP-C10')!.docs_filed, true)
    assert.equal(open.rows.find(x => x.claim_number === 'EXP-C10')!.category, 'อาหารและเครื่องดื่ม') // ค่าสำรองของ getCategoryLabel

    const all = await call('my_claims', { include_closed: true })
    assert.deepEqual(nums(all), ['EXP-C1', 'EXP-C10', 'EXP-C2', 'EXP-C3', 'EXP-C4', 'EXP-C5', 'EXP-C6', 'EXP-C7', 'EXP-C8'])
    const c5 = all.rows.find(x => x.claim_number === 'EXP-C5')!
    assert.equal(c5.actual_spent_amount, 1900)
    assert.equal(c5.refund_amount, 100)
    assert.equal(c5.status, 'ชำระเงินแล้ว')
    assert.equal(all.rows.find(x => x.claim_number === 'EXP-C8')!.status, 'ยกเลิกแล้ว')
    assert.deepEqual(nums(await call('my_claims', { status: 'paid' })), ['EXP-C3', 'EXP-C4', 'EXP-C5', 'EXP-C6', 'EXP-C7'])
    assert.deepEqual(nums(await call('my_claims', { month: '2026-08', include_closed: true })), ['EXP-C10'])
    assert.equal((await call('my_claims', { include_closed: true, limit: 2 })).total, 9)

    // args แปลก (ชื่อคนอื่น / user_id / submitted_by) ไม่เปลี่ยนเจ้าของ — schema ตัดทิ้ง และ query ผูก ctx.userId
    const weird = await call('my_claims', { include_closed: true, submitter: 'สมปอง', user_id: 'u3', submitted_by: 'u3', userId: 'u3' })
    assert.deepEqual(nums(weird), nums(all))
    // แอดมินเรียก my_claims ก็ได้แค่ของตัวเอง (u2 ไม่มีใบ)
    assert.deepEqual((await call('my_claims', { include_closed: true }, ADMIN)).rows, [])
    // ผู้ใช้ u3 เห็นเฉพาะของตัวเอง (ไม่รวม o3 ที่ซ่อน)
    assert.deepEqual(nums(await call('my_claims', { include_closed: true }, { ...STAFF, userId: 'u3' })), ['EXP-O1', 'EXP-O2'])
    await assert.rejects(() => byName('my_claims').run(db, { status: 'whatever' }, STAFF))
    await assert.rejects(() => byName('my_claims').run(db, { month: '2026-13' }, STAFF))
    for (const r of [open, all, weird]) assertClean('my_claims', r)
    pass(`my_claims — ของตัวเองเท่านั้น (args แปลกไม่มีผล) · ค่าเริ่มต้น = ใบที่ยังไม่จบ · ไม่รวมใบที่ซ่อน · สถานะ/ประเภทไทย · ไม่มี *_urls/bank · ${open.summary}`)
  }

  // ═══ all_claims (T2) ═════════════════════════════════════════════════════════
  {
    const r = await call('all_claims', {}, ADMIN)
    const nums = r.rows.map(x => x.claim_number)
    assert.equal(r.rows.length, 11)
    assert.ok(!nums.includes('EXP-C9') && !nums.includes('EXP-O3'), 'ต้องไม่รวมใบที่ซ่อน')
    assert.equal(r.rows.find(x => x.claim_number === 'EXP-O1')!.submitter, 'สมปอง')
    assert.equal(r.rows.find(x => x.claim_number === 'EXP-C1')!.submitter, 'สมหญิง')
    // ยอดรวมตามสถานะของทุกใบที่ตรงเงื่อนไข (ไม่รวมใบที่ซ่อน)
    assert.match(r.summary, /^ใบเบิกทั้งหมด 11 ใบ รวม ฿17,470 · /)
    for (const part of ['แบบร่าง 1 ใบ ฿120', 'รออนุมัติ 2 ใบ ฿3,000', 'ชำระเงินแล้ว 6 ใบ ฿14,000', 'ปฏิเสธ 1 ใบ ฿300', 'ยกเลิกแล้ว 1 ใบ ฿50']) {
      assert.ok(r.summary.includes(part), `summary ต้องมี "${part}": ${r.summary}`)
    }
    // summary นับก่อนตัดแถว
    const cut = await call('all_claims', { limit: 3 }, ADMIN)
    assert.equal(cut.rows.length, 3)
    assert.equal(cut.total, 11)
    assert.ok(cut.summary.includes('ชำระเงินแล้ว 6 ใบ ฿14,000'))

    const byWho = await call('all_claims', { submitter: 'ปอง' }, ADMIN)
    assert.deepEqual(byWho.rows.map(x => x.claim_number).sort(), ['EXP-O1', 'EXP-O2'])
    assert.equal((await call('all_claims', { submitter: 'ไม่มีคนนี้' }, ADMIN)).rows.length, 0)
    assert.deepEqual((await call('all_claims', { status: 'pending' }, ADMIN)).rows.map(x => x.claim_number).sort(), ['EXP-C1', 'EXP-O1'])
    assert.deepEqual((await call('all_claims', { category: 'travel' }, ADMIN)).rows.map(x => x.claim_number), ['EXP-C1'])
    assert.deepEqual((await call('all_claims', { month: '2026-08' }, ADMIN)).rows.map(x => x.claim_number), ['EXP-C10'])
    // เรียกตรงๆ โดย non-admin (ข้ามการลงทะเบียน) ก็ไม่ได้ข้อมูล
    await assert.rejects(() => byName('all_claims').run(db, {}, STAFF), (e: Error) => e instanceof tools.ToolError && /เฉพาะแอดมิน/.test(e.message))
    assertClean('all_claims', r)
    assertClean('all_claims', byWho)
    pass(`all_claims — แอดมินเท่านั้น · ไม่รวมใบที่ซ่อน · กรองสถานะ/เดือน/ผู้ส่ง/หมวด · summary ยอดตามสถานะก่อนตัดแถว · ${r.summary}`)
  }

  // ═══ my_checkins (T3) ════════════════════════════════════════════════════════
  {
    const r = await call('my_checkins', { from: '2026-09-01', to: '2026-09-30' })
    assert.equal(r.rows.length, 2) // k3 เป็นของ u3 ไม่ติดมา
    assert.deepEqual(r.rows[0], {
      date: '2026-09-10', checked_in: '08:30', checked_out: '17:00', hours: 8.5, type: 'เข้าออฟฟิศ', event: null, duties: [],
      province: null, district: null, out_of_province: false, note: null,
    })
    assert.deepEqual(r.rows[1], {
      date: '2026-09-12', checked_in: '00:30', checked_out: null, hours: null, type: 'ไปหน้างาน', event: 'งานแต่ง สมชาย',
      duties: ['ช่างภาพ', 'พิธีกร'], province: 'ชลบุรี', district: 'บางละมุง', out_of_province: true, note: 'ไปงาน',
    })
    assert.match(r.summary, /เช็คอินของคุณ 2026-09-01 ถึง 2026-09-30 2 ครั้ง รวม 8\.5 ชั่วโมง · ยังไม่เช็คเอาท์ 1 ครั้ง/)
    // ขอบวันตามเวลาไทย: k2 (UTC 09-11) อยู่ในวันที่ 12 ของไทย
    assert.deepEqual((await call('my_checkins', { from: '2026-09-12', to: '2026-09-12' })).rows.map(x => x.date), ['2026-09-12'])
    assert.equal((await call('my_checkins', { from: '2026-09-11', to: '2026-09-11' })).rows.length, 0)
    // ค่าเริ่มต้น = เดือนนี้ (k4)
    const now = await call('my_checkins')
    assert.equal(now.rows.length, 1)
    assert.equal(now.rows[0].hours, null)
    // args แปลกไม่เปลี่ยนเจ้าของ
    const weird = await call('my_checkins', { from: '2026-09-01', to: '2026-09-30', user_id: 'u3', user: 'ปอง' })
    assert.deepEqual(weird.rows, r.rows)
    assert.deepEqual((await call('my_checkins', { from: '2026-09-01', to: '2026-09-30' }, { ...STAFF, userId: 'u3' })).rows.map(x => x.hours), [2.3])
    await assert.rejects(() => byName('my_checkins').run(db, { from: '2026-09-30', to: '2026-09-01' }, STAFF), tools.ToolError)
    await assert.rejects(() => byName('my_checkins').run(db, { from: '2025-01-01', to: '2026-09-01' }, STAFF), tools.ToolError)
    await assert.rejects(() => byName('my_checkins').run(db, { from: '10/09/2026' }, STAFF))
    for (const x of [r, now, weird]) assertClean('my_checkins', x)
    pass(`my_checkins — ของตัวเองเท่านั้น · เวลาไทย · ชั่วโมงจากเข้า-ออก (ยังไม่ออก = null) · ประเภท/หน้าที่ไทย · ไม่มีพิกัด/รูป · ${r.summary}`)
  }

  // ═══ team_checkins (T3) ══════════════════════════════════════════════════════
  {
    const r = await call('team_checkins', { from: '2026-09-10', to: '2026-09-12' }, ADMIN)
    assert.deepEqual(r.rows.map(x => [x.name, x.date, x.type, x.hours]), [
      ['หญิง', '2026-09-10', 'เข้าออฟฟิศ', 8.5],
      ['ปอง', '2026-09-10', 'WFH / นอกสถานที่', 2.3],
      ['หญิง', '2026-09-12', 'ไปหน้างาน', null],
    ])
    assert.equal(r.summary, 'เช็คอิน 2026-09-10 ถึง 2026-09-12 3 รายการ จาก 2 คน · ยังไม่เช็คเอาท์ 1 รายการ')
    assert.deepEqual((await call('team_checkins', { from: '2026-09-10', to: '2026-09-12', user: 'ปอง' }, ADMIN)).rows.map(x => x.note), ['ทำงานที่บ้าน'])
    assert.deepEqual((await call('team_checkins', { from: '2026-09-10', to: '2026-09-12', event: 'งานแต่ง' }, ADMIN)).rows.map(x => x.date), ['2026-09-12'])
    assert.equal((await call('team_checkins', { user: 'ไม่มีคนนี้' }, ADMIN)).rows.length, 0)
    const today = await call('team_checkins', {}, ADMIN)
    assert.equal(today.rows.length, 2)
    assert.match(today.summary, /2 รายการ จาก 2 คน · ยังไม่เช็คเอาท์ 2 รายการ$/)
    await assert.rejects(() => byName('team_checkins').run(db, {}, STAFF), (e: Error) => e instanceof tools.ToolError && /เฉพาะแอดมิน/.test(e.message))
    assertClean('team_checkins', r)
    assertClean('team_checkins', today)
    pass(`team_checkins — แอดมินเท่านั้น · ชื่อเล่น/ชื่อ · กรองคน/งาน · ค่าเริ่มต้นวันนี้ · ไม่มีพิกัด/รูป · ${r.summary}`)
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
