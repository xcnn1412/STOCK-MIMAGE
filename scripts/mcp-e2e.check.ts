// MCP endpoint (WP2) — เรียก app/api/mcp/route.ts ตัวจริงด้วย JSON-RPC กับ Supabase จำลองในหน่วยความจำ
// Run:  npx tsx scripts/mcp-e2e.check.ts
//
// ตรวจ M6 (a)–(f) และ M7 (last_used_at ไม่เกินนาทีละครั้ง · tool throw = isError ไม่ใช่ 500 · เพดาน 64KB)
// ไม่แตะฐานข้อมูลหรือเครือข่ายจริง · ผู้ใช้สังเคราะห์
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "mcp-e2e: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import Module, { createRequire } from 'node:module'
import { createFakeDb, type Row } from './mcp-fake-db'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'PUBLIC-KEY'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'SERVER-KEY'
process.env.SESSION_SECRET = 'mcp-e2e-check'
const LICENSE_OK = '2099-01-01T00:00:00Z'
process.env.LICENSE_EXPIRES_AT = LICENSE_OK

// ── ฐานข้อมูลจำลอง ─────────────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STOCK_ONLY = uid(2), NO_MODULES = uid(3), FINANCE_ONLY = uid(4), CHECKIN_ONLY = uid(5)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const inHour = () => new Date(Date.now() + 3600_000).toISOString()

const TOK = {
  admin: 'tok-admin-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  stock: 'tok-stock-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
  none: 'tok-none-CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
  rate: 'tok-rate-DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
  touch: 'tok-touch-EEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
  expired: 'tok-expired-FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF',
  finance: 'tok-finance-GGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGGG',
  checkin: 'tok-checkin-HHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHHH',
}
const tokenRow = (id: string, user: string, token: string, extra: Row = {}): Row => ({
  id, user_id: user, client_id: 'client-1', client_name: 'Claude', access_hash: sha(token), refresh_hash: sha(`r-${token}`),
  scope: 'mcp:read', access_expires_at: inHour(), refresh_expires_at: inHour(), created_at: new Date().toISOString(),
  last_used_at: null, revoked_at: null, ...extra,
})

const item = (id: string, name: string, extra: Row = {}): Row => ({
  id, name, serial_number: null, category: 'กล้อง', status: 'available', quantity: 1, unit: null,
  is_consumable: false, min_quantity: null, shelf_id: null, price: 5000, image_url: 'https://x/i.jpg', ...extra,
})

const fake = createFakeDb({
  profiles: [
    { id: ADMIN, role: 'admin', full_name: 'แอดมิน', nickname: null, is_approved: true, is_blocked: false, allowed_modules: ['finance'], pin: '1111' },
    { id: STOCK_ONLY, role: 'staff', full_name: 'คลังสินค้า', nickname: null, is_approved: true, is_blocked: false, allowed_modules: ['stock', 'costs'], pin: '2222' },
    { id: NO_MODULES, role: 'staff', full_name: 'บัญชี', nickname: null, is_approved: true, is_blocked: false, allowed_modules: ['costs', 'kpi'], pin: '3333' },
    { id: FINANCE_ONLY, role: 'staff', full_name: 'ผู้เบิก', nickname: null, is_approved: true, is_blocked: false, allowed_modules: ['finance'], pin: '4444' },
    { id: CHECKIN_ONLY, role: 'staff', full_name: 'คนเช็คอิน', nickname: 'เช็ค', is_approved: true, is_blocked: false, allowed_modules: ['checkin'], pin: '5555' },
  ],
  oauth_tokens: [
    tokenRow('t-admin', ADMIN, TOK.admin),
    tokenRow('t-stock', STOCK_ONLY, TOK.stock),
    tokenRow('t-none', NO_MODULES, TOK.none),
    tokenRow('t-rate', STOCK_ONLY, TOK.rate),
    tokenRow('t-touch', STOCK_ONLY, TOK.touch),
    tokenRow('t-expired', STOCK_ONLY, TOK.expired, { access_expires_at: new Date(Date.now() - 1000).toISOString() }),
    tokenRow('t-finance', FINANCE_ONLY, TOK.finance),
    tokenRow('t-checkin', CHECKIN_ONLY, TOK.checkin),
  ],
  activity_logs: [],
  shelves: [{ id: 'sh-a', code: 'A-1', name: null, zone: 'A' }],
  shelf_audits: [],
  items: [
    item('cam-1', 'กล้อง Canon R6', { status: 'in_use' }),
    item('cam-2', 'กล้อง Sony A7'),
    item('ink-1', 'หมึกพิมพ์', { is_consumable: true, quantity: 0, unit: 'ขวด', min_quantity: 2, shelf_id: 'sh-a', category: 'วัสดุ' }),
    // ชื่อยาวมาก 100 ชิ้น → ผลลัพธ์ดิบเกิน 64KB
    ...Array.from({ length: 100 }, (_, i) => item(`long-${i}`, `ยาว ${String(i).padStart(3, '0')} ${'ก'.repeat(300)}`, { category: 'ยาว' })),
  ],
  kits: [{ id: 'kit-1', name: 'กระเป๋า 1', shelf_id: 'sh-a', event_id: null }],
  kit_contents: [{ id: 'kc1', kit_id: 'kit-1', item_id: 'cam-1', quantity: 1 }],
  events: [],
  crm_leads: [],
  expense_claims: [
    { id: 'cl-own', claim_number: 'EXP-OWN', claim_type: 'other', title: 'ค่าแท็กซี่', amount: 250, status: 'pending', category: 'travel',
      submitted_by: FINANCE_ONLY, created_at: '2026-09-02T00:00:00Z', expense_date: '2026-09-01', deleted_at: null,
      receipt_urls: ['https://x/r.jpg'], bank_account_number: '999-9-99999-9' },
    { id: 'cl-other', claim_number: 'EXP-OTHER', claim_type: 'other', title: 'ของแอดมิน', amount: 900, status: 'pending', category: 'food',
      submitted_by: ADMIN, created_at: '2026-09-03T00:00:00Z', expense_date: '2026-09-01', deleted_at: null },
  ],
  job_cost_events: [],
  finance_categories: [],
  staff_checkins: [
    { id: 'ci-1', user_id: CHECKIN_ONLY, check_type: 'office', checked_in_at: new Date(Date.now() - 3600_000).toISOString(), checked_out_at: null,
      note: null, event_id: null, duties: [], province: null, district: null, out_of_province: false, latitude: 13.7, longitude: 100.5, photo_url: 'https://x/p.webp' },
  ],
  salary_duties: [],
})

// ── แทนโมดูลที่ต้องมี Next ─────────────────────────────────────────────────────
let currentHeaders = new Headers()
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fake.client }],
  [/^next\/headers$/, { headers: async () => currentHeaders, cookies: async () => ({ get: () => undefined }) }],
  [/\/lib\/auth$/, { requireAuth: async () => null, getSessionLight: async () => ({}) }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

const load = createRequire(__filename)
const route = load('../app/api/mcp/route') as typeof import('../app/api/mcp/route')

// ── ตัวช่วย ────────────────────────────────────────────────────────────────────
const ORIGIN = 'https://stock.example.com'
const WWW_AUTH = `Bearer resource_metadata="${ORIGIN}/.well-known/oauth-protected-resource", scope="mcp:read"`
const THAI = /[฀-๿]/
const pass = (label: string) => console.log(`PASS  ${label}`)
let nextId = 1

function request(method: string, token: string | null, body?: unknown): Request {
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-06-18',
    'x-forwarded-host': 'stock.example.com',
    'x-forwarded-proto': 'https',
    'user-agent': 'mcp-e2e',
  })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  currentHeaders = headers // requestOrigin()/logActivity อ่าน headers() ของคำขอนี้
  return new Request(`${ORIGIN}/api/mcp`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
}

/** อ่าน JSON-RPC message จาก response — รองรับทั้ง JSON ล้วนและ SSE (บรรทัด data:) */
async function parse(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text()
  if (!text) return null
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean)
    return data.length ? (JSON.parse(data[data.length - 1]) as Record<string, unknown>) : null
  }
  return JSON.parse(text) as Record<string, unknown>
}

async function rpc(token: string | null, method: string, params: Record<string, unknown> = {}) {
  const id = nextId++
  const res = await route.POST(request('POST', token, { jsonrpc: '2.0', id, method, params }))
  const msg = await parse(res)
  return { res, msg, result: (msg?.result ?? null) as Record<string, unknown> | null }
}

async function initialize(token: string) {
  const { res, result } = await rpc(token, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'mcp-e2e', version: '0.0.0' },
  })
  assert.equal(res.status, 200)
  assert.ok(result, 'initialize ต้องคืน result')
  const note = await route.POST(request('POST', token, { jsonrpc: '2.0', method: 'notifications/initialized' }))
  assert.equal(note.status, 202)
  return result
}

async function listTools(token: string): Promise<string[]> {
  const { res, result } = await rpc(token, 'tools/list')
  assert.equal(res.status, 200)
  return ((result?.tools ?? []) as { name: string }[]).map(t => t.name)
}

type CallResult = { isError?: boolean; content: { type: string; text: string }[] }
async function callTool(token: string, name: string, args: Record<string, unknown> = {}) {
  const { res, result, msg } = await rpc(token, 'tools/call', { name, arguments: args })
  assert.equal(res.status, 200, `tools/call ${name} ต้องได้ 200 (ได้ ${res.status})`)
  assert.ok(result, `tools/call ${name} ต้องคืน result ไม่ใช่ error: ${JSON.stringify(msg)}`)
  const r = result as unknown as CallResult
  return { ...r, text: r.content?.[0]?.text ?? '' }
}

async function expect401(res: Response, label: string) {
  assert.equal(res.status, 401, `${label}: ต้องได้ 401`)
  assert.equal(res.headers.get('www-authenticate'), WWW_AUTH, `${label}: WWW-Authenticate`)
  assert.deepEqual(await res.json(), { error: 'invalid_token' })
}

const STOCK_TOOLS = ['stock_summary', 'search_items', 'low_stock', 'kit_status', 'shelf_contents']
const ALL_TOOLS = [
  ...STOCK_TOOLS, 'upcoming_events', 'event_detail', 'event_closures', 'job_readiness',
  'my_claims', 'all_claims', 'my_checkins', 'team_checkins',
]

async function main() {
  // ═══ (a) ไม่มี Bearer → 401 ═════════════════════════════════════════════════
  {
    await expect401(await route.POST(request('POST', null, { jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })), 'POST ไม่มี token')
    await expect401(await route.POST(request('POST', 'not-a-real-token', { jsonrpc: '2.0', id: 1, method: 'tools/list' })), 'POST token มั่ว')
    await expect401(await route.GET(request('GET', null)), 'GET ไม่มี token')
    const get = await route.GET(request('GET', TOK.admin))
    assert.equal(get.status, 405)
    const pre = route.OPTIONS()
    assert.equal(pre.status, 204)
    assert.match(pre.headers.get('access-control-allow-methods') ?? '', /POST/)
    assert.match(pre.headers.get('access-control-allow-headers') ?? '', /Mcp-Session-Id/)
    assert.match(pre.headers.get('access-control-allow-headers') ?? '', /Authorization/)
    pass(`(a) ไม่มี/ผิด Bearer → 401 + WWW-Authenticate: ${WWW_AUTH} · GET มี token → 405 (stateless) · OPTIONS CORS`)
  }

  // ═══ ใบอนุญาตหมดอายุ → 403 ก่อนตรวจ token ══════════════════════════════════
  {
    process.env.LICENSE_EXPIRES_AT = '2000-01-01T00:00:00Z'
    const res = await route.POST(request('POST', TOK.admin, { jsonrpc: '2.0', id: 1, method: 'tools/list' }))
    assert.equal(res.status, 403)
    assert.equal(((await res.json()) as { error: string }).error, 'license_expired')
    assert.equal((await route.GET(request('GET', null))).status, 403)
    process.env.LICENSE_EXPIRES_AT = LICENSE_OK
    pass('ใบอนุญาตหมดอายุ → 403 license_expired (POST/GET)')
  }

  // ═══ (b) ผู้ใช้ stock-only ══════════════════════════════════════════════════
  {
    const init = await initialize(TOK.stock)
    const info = init.serverInfo as { name: string; version: string }
    assert.equal(info.name, 'stock-mimage')
    assert.equal(info.version, (load('../package.json') as { version: string }).version)
    assert.ok(THAI.test(String(init.instructions)) && String(init.instructions).includes('อ่านอย่างเดียว'))
    assert.deepEqual(await listTools(TOK.stock), STOCK_TOOLS)

    const logsBefore = fake.tables.activity_logs.length
    fake.failTables.add('crm_leads') // ถ้า tool รันจริงจะได้ข้อความ "ดึงข้อมูลไม่สำเร็จ" ไม่ใช่ "ไม่มีสิทธิ์"
    const denied = await callTool(TOK.stock, 'job_readiness')
    fake.failTables.delete('crm_leads')
    assert.equal(denied.isError, true)
    assert.ok(THAI.test(denied.text) && denied.text.includes('ไม่มีสิทธิ์'), denied.text)
    assert.equal(fake.tables.activity_logs.length, logsBefore, 'tool ที่ไม่มีสิทธิ์ต้องไม่ถูกบันทึกว่าเรียกสำเร็จ')
    pass(`(b) stock-only: initialize สำเร็จ · tools/list = ${STOCK_TOOLS.length} tool ของ stock · job_readiness → isError "${denied.text}"`)
  }

  // ═══ ผู้ใช้ไม่มีโมดูลที่ MCP เปิด ════════════════════════════════════════════
  {
    await initialize(TOK.none)
    assert.deepEqual(await listTools(TOK.none), [])
    const r = await callTool(TOK.none, 'stock_summary')
    assert.equal(r.isError, true)
    assert.ok(r.text.includes('ไม่มีสิทธิ์'))
    pass('ผู้ใช้ที่ไม่มีโมดูลที่ MCP เปิด: tools/list ว่าง · เรียก tool → isError')
  }

  // ═══ T1: finance-only (ไม่ใช่แอดมิน) เห็น my_claims ไม่เห็น all_claims ══════════
  {
    await initialize(TOK.finance)
    assert.deepEqual(await listTools(TOK.finance), ['my_claims'])

    const logsBefore = fake.tables.activity_logs.length
    fake.failTables.add('expense_claims') // ถ้า all_claims รันจริงจะได้ "ดึงข้อมูลไม่สำเร็จ" ไม่ใช่ "ไม่มีสิทธิ์"
    const denied = await callTool(TOK.finance, 'all_claims')
    fake.failTables.delete('expense_claims')
    assert.equal(denied.isError, true)
    assert.ok(THAI.test(denied.text) && denied.text.includes('ไม่มีสิทธิ์') && denied.text.includes('แอดมิน'), denied.text)
    assert.equal(fake.tables.activity_logs.length, logsBefore, 'tool ที่ไม่มีสิทธิ์ต้องไม่ถูกบันทึก')

    const mine = await callTool(TOK.finance, 'my_claims', { submitter: 'แอดมิน', user_id: ADMIN })
    assert.notEqual(mine.isError, true, mine.text)
    const [summary, payload] = mine.text.split('\n')
    assert.ok(THAI.test(summary))
    const body = JSON.parse(payload) as { rows: Record<string, unknown>[]; total: number }
    assert.deepEqual(body.rows.map(r => r.claim_number), ['EXP-OWN'])
    assert.equal(body.rows[0].status, 'รออนุมัติ')
    assert.ok(!payload.includes('https://x/') && !payload.includes('999-9-99999-9') && !payload.includes('_urls') && !payload.includes('bank_'))
    const log = fake.tables.activity_logs[fake.tables.activity_logs.length - 1]
    assert.equal(log.action_type, 'MCP_TOOL_CALL')
    assert.equal(log.user_id, FINANCE_ONLY)
    assert.equal((log.details as Record<string, unknown>).tool, 'my_claims')
    pass(`T1 finance-only: tools/list = [my_claims] · all_claims → isError "${denied.text}" (ไม่รัน) · my_claims ได้ของตัวเองเท่านั้น + log MCP_TOOL_CALL`)
  }

  // ═══ T1: checkin-only (ไม่ใช่แอดมิน) เห็น my_checkins ไม่เห็น team_checkins ═════
  {
    await initialize(TOK.checkin)
    assert.deepEqual(await listTools(TOK.checkin), ['my_checkins'])
    const denied = await callTool(TOK.checkin, 'team_checkins')
    assert.equal(denied.isError, true)
    assert.ok(denied.text.includes('ไม่มีสิทธิ์') && denied.text.includes('แอดมิน'), denied.text)
    const mine = await callTool(TOK.checkin, 'my_checkins')
    assert.notEqual(mine.isError, true, mine.text)
    const body = JSON.parse(mine.text.split('\n')[1]) as { rows: Record<string, unknown>[] }
    assert.equal(body.rows.length, 1)
    assert.equal(body.rows[0].type, 'เข้าออฟฟิศ')
    assert.ok(!mine.text.includes('latitude') && !mine.text.includes('photo_url') && !mine.text.includes('https://x/'))
    pass('T1 checkin-only: tools/list = [my_checkins] · team_checkins → isError ไทย · my_checkins ไม่มีพิกัด/รูป')
  }

  // ═══ (c) admin เห็นครบ 13 ══════════════════════════════════════════════════
  {
    await initialize(TOK.admin)
    assert.deepEqual(await listTools(TOK.admin), ALL_TOOLS)
    const all = await callTool(TOK.admin, 'all_claims')
    assert.notEqual(all.isError, true, all.text)
    assert.equal((JSON.parse(all.text.split('\n')[1]) as { total: number }).total, 2)
    pass(`(c) admin: tools/list ครบ ${ALL_TOOLS.length} tool (แม้ allowed_modules มีแค่ finance) · all_claims เรียกได้`)
  }

  // ═══ (d) tools/call สำเร็จ → activity_logs MCP_TOOL_CALL ════════════════════
  {
    const r = await callTool(TOK.admin, 'search_items', { q: 'กล้อง' })
    assert.notEqual(r.isError, true)
    const [summary, payload] = r.text.split('\n')
    assert.ok(THAI.test(summary))
    const body = JSON.parse(payload) as { rows: Record<string, unknown>[]; total: number }
    assert.deepEqual(body.rows.map(x => x.name), ['กล้อง Canon R6', 'กล้อง Sony A7'])
    assert.equal(body.total, 2)
    assert.ok(!payload.includes('price') && !payload.includes('image_url') && !payload.includes('"pin"'))

    const log = fake.tables.activity_logs[fake.tables.activity_logs.length - 1]
    assert.equal(log.action_type, 'MCP_TOOL_CALL')
    assert.equal(log.user_id, ADMIN)
    const details = log.details as Record<string, unknown>
    assert.equal(details.tool, 'search_items')
    assert.deepEqual(details.args, { q: 'กล้อง' })
    assert.equal(details.rows, 2)
    assert.equal(details.total, 2)
    assert.equal(details.clientName, 'Claude')
    assert.ok(!JSON.stringify(log).includes(TOK.admin), 'log ต้องไม่มีค่า token')
    pass('(d) tools/call search_items สำเร็จ · activity_logs MCP_TOOL_CALL {tool, args, rows, total} user_id = เจ้าของ token')
  }

  // ═══ (e) เกิน 60 ครั้ง/นาที → isError ให้รอ ════════════════════════════════
  {
    for (let i = 1; i <= 60; i++) {
      const r = await callTool(TOK.rate, 'low_stock')
      assert.notEqual(r.isError, true, `ครั้งที่ ${i} ต้องผ่าน`)
    }
    const over = await callTool(TOK.rate, 'low_stock')
    assert.equal(over.isError, true)
    assert.match(over.text, /^เรียกถี่เกินไป รอ \d+ วินาที/)
    // token อื่นของคนเดียวกันไม่โดนนับรวม (นับต่อการเชื่อมต่อ)
    assert.notEqual((await callTool(TOK.stock, 'low_stock')).isError, true)
    pass(`(e) ครั้งที่ 61 ในนาทีเดียว → isError "${over.text}"`)
  }

  // ═══ (f) token หมดอายุ → 401 ═══════════════════════════════════════════════
  {
    await expect401(await route.POST(request('POST', TOK.expired, { jsonrpc: '2.0', id: 9, method: 'tools/list' })), 'token หมดอายุ')
    pass('(f) access token หมดอายุ → 401 + WWW-Authenticate')
  }

  // ═══ M7: last_used_at ไม่เกินนาทีละครั้ง ═══════════════════════════════════
  {
    const row = fake.tables.oauth_tokens.find(t => t.id === 't-touch')!
    assert.equal(row.last_used_at, null)
    await callTool(TOK.touch, 'low_stock')
    const first = row.last_used_at
    assert.ok(typeof first === 'string', 'เรียกครั้งแรกต้องบันทึก last_used_at')
    await callTool(TOK.touch, 'low_stock')
    assert.equal(row.last_used_at, first, 'ภายใน 60 วินาทีต้องไม่อัปเดตซ้ำ')
    const old = new Date(Date.now() - 2 * 60_000).toISOString()
    row.last_used_at = old
    await callTool(TOK.touch, 'low_stock')
    assert.ok(typeof row.last_used_at === 'string' && row.last_used_at > old, 'เกิน 60 วินาทีแล้วต้องอัปเดต')
    pass('M7 last_used_at: ครั้งแรกบันทึก · ภายใน 1 นาทีไม่เขียนซ้ำ · เกิน 1 นาทีอัปเดต')
  }

  // ═══ M7: tool throw → isError (ไม่ใช่ 500) ═════════════════════════════════
  {
    const logsBefore = fake.tables.activity_logs.length
    fake.failTables.add('kits')
    const quiet = console.error
    console.error = () => undefined
    const r = await callTool(TOK.admin, 'stock_summary')
    console.error = quiet
    fake.failTables.delete('kits')
    assert.equal(r.isError, true)
    assert.equal(r.text, 'ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง')
    assert.equal(fake.tables.activity_logs.length, logsBefore)
    const missing = await callTool(TOK.admin, 'shelf_contents', { code: 'Z-9' })
    assert.equal(missing.isError, true)
    assert.equal(missing.text, 'ไม่พบชั้นรหัส Z-9')
    pass('M7 tool ที่ throw → HTTP 200 + isError ข้อความไทย (ไม่มี stack) · ToolError ส่งข้อความตรง')
  }

  // ═══ M7: ผลลัพธ์ไม่เกิน 64KB ═══════════════════════════════════════════════
  {
    const r = await callTool(TOK.admin, 'search_items', { q: 'ยาว', limit: 100 })
    assert.notEqual(r.isError, true)
    const bytes = Buffer.byteLength(r.text, 'utf8')
    assert.ok(bytes <= 64 * 1024, `ข้อความ ${bytes} ไบต์ ต้องไม่เกิน 64KB`)
    const [summary, payload] = r.text.split('\n')
    const body = JSON.parse(payload) as { rows: unknown[]; total: number }
    assert.equal(body.total, 100)
    assert.ok(body.rows.length > 0 && body.rows.length < 100)
    assert.match(summary, /ข้อมูลยาวเกินจึงแสดง \d+ จาก 100 รายการ/)
    pass(`M7 เพดาน 64KB: ${bytes} ไบต์ · ${body.rows.length} จาก 100 แถว`)
  }

  // ═══ อ่านอย่างเดียว: การเขียนมีแค่ log กับ last_used_at ═══════════════════════
  assert.deepEqual([...new Set(fake.writes.map(w => `${w.table}:${w.op}`))].sort(), ['activity_logs:insert', 'oauth_tokens:update'])
  pass('การเขียนทั้งหมดระหว่างทดสอบ = activity_logs insert + oauth_tokens update (last_used_at) เท่านั้น')

  console.log('mcp-e2e: ผ่านทั้งหมด')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
