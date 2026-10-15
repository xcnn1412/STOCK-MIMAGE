// token ส่วนตัวของ MCP (สเปค docs/specs/mcp-personal-token.md) — สร้างผ่าน server action ตัวจริง
// แล้วเรียก app/api/mcp/route.ts ตัวจริงด้วย Bearer stk_… กับ Supabase จำลองในหน่วยความจำ (scripts/mcp-fake-db.ts)
// Run:  npx tsx scripts/mcp-personal-token.check.ts
//
// ตรวจ T1–T7 (AC1–AC9): สร้างแล้วใช้ได้ · revoke / หมดอายุ / ถูกบล็อก → 401 · เพดาน 5 · input ผิดไม่เขียน DB
// · log MCP_TOKEN_CREATE ไม่มีค่า token · ป้าย "token ส่วนตัว" + หน้าผลลัพธ์แสดง token ครั้งเดียว (static render)
// ไม่แตะฐานข้อมูลหรือเครือข่ายจริง · ผู้ใช้สังเคราะห์ · session cookie ลงนามจริงด้วย lib/session (requireAuth ตัวจริง)
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "mcp-personal-token: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import Module, { createRequire } from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createFakeDb, type Row } from './mcp-fake-db'

process.env.TZ = 'Asia/Bangkok'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'PUBLIC-KEY'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'SERVER-KEY'
process.env.SESSION_SECRET = 'mcp-personal-token-check'
process.env.LICENSE_EXPIRES_AT = '2099-01-01T00:00:00Z'

// ── ฐานข้อมูลจำลอง ─────────────────────────────────────────────────────────────
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STOCK = uid(2), CAP = uid(3), FRESH = uid(4)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const DAY = 24 * 60 * 60 * 1000

const profile = (id: string, role: string, name: string, modules: string[]): Row => ({
  id, role, full_name: name, nickname: null, department: null, is_approved: true, is_blocked: false,
  allowed_modules: modules, active_session_id: `sess-${id}`,
})

const fake = createFakeDb({
  profiles: [
    profile(ADMIN, 'admin', 'แอดมิน', ['finance']),
    profile(STOCK, 'staff', 'คลังสินค้า', ['stock', 'costs']),
    profile(CAP, 'staff', 'คนทดสอบเพดาน', ['stock']),
    profile(FRESH, 'staff', 'คนทดสอบ input', ['stock']),
  ],
  oauth_clients: [],
  oauth_tokens: [],
  activity_logs: [],
  shelves: [{ id: 'sh-a', code: 'A-1', name: null, zone: 'A' }],
  items: [
    { id: 'cam-1', name: 'กล้อง Canon R6', serial_number: null, category: 'กล้อง', status: 'available', quantity: 1, unit: null,
      is_consumable: false, min_quantity: null, shelf_id: null, price: 5000, image_url: null },
  ],
  kits: [],
  kit_contents: [],
  events: [],
})

// ── แทนโมดูลที่ต้องมี Next ─────────────────────────────────────────────────────
let currentHeaders = new Headers()
let currentCookies: Record<string, string> = {}
const toast = Object.assign(() => {}, { error() {}, success() {}, info() {}, warning() {} })
const load = createRequire(__filename)
const dictionary = (load('../lib/dictionary') as typeof import('../lib/dictionary')).dictionary
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fake.client }],
  [/^next\/headers$/, {
    headers: async () => currentHeaders,
    cookies: async () => ({ get: (name: string) => (name in currentCookies ? { name, value: currentCookies[name] } : undefined) }),
  }],
  [/^next\/cache$/, { revalidatePath: () => undefined, revalidateTag: () => undefined }],
  [/^sonner$/, { toast, Toaster: () => null }],
  [/language-context$/, { useLanguage: () => ({ t: dictionary.th, lang: 'th', toggleLanguage() {} }) }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  if (hit) return hit[1]
  if (request === 'next/navigation') {
    const real = realLoad.call(this, request, ...rest) as object
    return { ...real, useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} }) }
  }
  return realLoad.call(this, request, ...rest)
}

const { createSessionToken } = load('../lib/session') as typeof import('../lib/session')
const oauth = load('../lib/oauth') as typeof import('../lib/oauth')
const actions = load('../app/(authenticated)/connected-apps/actions') as typeof import('../app/(authenticated)/connected-apps/actions')
const route = load('../app/api/mcp/route') as typeof import('../app/api/mcp/route')
const view = load('../app/(authenticated)/connected-apps/connected-apps-view') as typeof import('../app/(authenticated)/connected-apps/connected-apps-view')

// ── ตัวช่วย ────────────────────────────────────────────────────────────────────
const ORIGIN = 'https://stock.example.com'
const pass = (label: string) => console.log(`PASS  ${label}`)
const issued: string[] = [] // ทุก token จริงที่เคยออก — ต้องไม่อยู่ในฐานข้อมูล/log
let nextId = 1

function signIn(userId: string | null) {
  currentCookies = userId ? { session_token: createSessionToken(userId), session_id: `sess-${userId}` } : {}
  currentHeaders = new Headers({ 'user-agent': 'mcp-personal-token-check', 'x-forwarded-for': '127.0.0.1' })
}

async function create(userId: string | null, name: unknown, ttlDays: unknown) {
  signIn(userId)
  const res = await actions.createPersonalToken({ name, ttlDays } as { name: string; ttlDays: number })
  if ('token' in res) issued.push(res.token)
  return res
}

async function mustCreate(userId: string, name: string, ttlDays: number) {
  const res = await create(userId, name, ttlDays)
  assert.ok('token' in res, `สร้าง token ต้องสำเร็จ: ${JSON.stringify(res)}`)
  return res
}

function rowOf(token: string): Row {
  const row = fake.tables.oauth_tokens.find(r => r.access_hash === sha(token))
  assert.ok(row, 'ต้องมีแถวของ token นี้')
  return row
}

function request(token: string | null, body: unknown): Request {
  const headers = new Headers({
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': '2025-06-18',
    'x-forwarded-host': 'stock.example.com',
    'x-forwarded-proto': 'https',
    'user-agent': 'ollmcp-check',
  })
  if (token) headers.set('Authorization', `Bearer ${token}`)
  currentHeaders = headers
  currentCookies = {} // คำขอจาก ollmcp ไม่มี cookie ของเว็บ
  return new Request(`${ORIGIN}/api/mcp`, { method: 'POST', headers, body: JSON.stringify(body) })
}

async function parse(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text()
  if (!text) return null
  if ((res.headers.get('content-type') ?? '').includes('text/event-stream')) {
    const data = text.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).filter(Boolean)
    return data.length ? (JSON.parse(data[data.length - 1]) as Record<string, unknown>) : null
  }
  return JSON.parse(text) as Record<string, unknown>
}

async function rpc(token: string, method: string, params: Record<string, unknown> = {}) {
  const res = await route.POST(request(token, { jsonrpc: '2.0', id: nextId++, method, params }))
  return { res, result: ((await parse(res))?.result ?? null) as Record<string, unknown> | null }
}

async function expect401(token: string, label: string) {
  const res = await route.POST(request(token, { jsonrpc: '2.0', id: nextId++, method: 'tools/list', params: {} }))
  assert.equal(res.status, 401, `${label}: ต้องได้ 401 (ได้ ${res.status})`)
  assert.deepEqual(await res.json(), { error: 'invalid_token' })
}

const tokenWrites = () => fake.writes.filter(w => w.table === 'oauth_tokens').length
const STOCK_TOOLS = ['stock_summary', 'search_items', 'low_stock', 'kit_status', 'shelf_contents']

async function main() {
  // ═══ T1 / AC1 / AC2 / AC3: สร้างแล้วเรียก /api/mcp ได้ ═══════════════════════
  {
    const before = Date.now()
    const res = await mustCreate(STOCK, '  Ollama โน้ตบุ๊ก  ', 90)
    const after = Date.now()
    assert.ok(res.token.startsWith('stk_') && res.token.length >= 40, `token ต้องขึ้นต้น stk_ ยาว ≥ 40 (ได้ ${res.token.length})`)

    const row = rowOf(res.token)
    assert.equal(row.user_id, STOCK)
    assert.equal(row.client_id, 'personal-token')
    assert.equal(row.client_id, oauth.PERSONAL_CLIENT_ID)
    assert.equal(row.client_name, 'Ollama โน้ตบุ๊ก', 'ชื่อถูก trim')
    assert.equal(row.scope, 'mcp:read')
    const exp = new Date(row.access_expires_at as string).getTime()
    assert.ok(exp >= before + 90 * DAY - 5000 && exp <= after + 90 * DAY + 5000, 'access_expires_at = now + 90 วัน ± 5 วินาที')
    assert.equal(row.refresh_expires_at, row.access_expires_at)
    assert.equal(res.expiresAt, row.access_expires_at)
    assert.equal(row.code_hash, null)
    assert.equal(row.revoked_at ?? null, null)
    assert.equal(typeof row.refresh_hash, 'string')
    assert.notEqual(row.refresh_hash, row.access_hash)
    assert.deepEqual(fake.tables.oauth_clients.map(c => [c.client_id, c.client_name, c.redirect_uris]), [['personal-token', 'Personal access token', []]])

    // tools/list = เฉพาะโมดูล stock ของผู้ใช้ · tools/call ผ่าน + log MCP_TOOL_CALL
    const init = await rpc(res.token, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'ollmcp', version: '0' } })
    assert.equal(init.res.status, 200)
    const list = await rpc(res.token, 'tools/list')
    assert.equal(list.res.status, 200)
    assert.deepEqual(((list.result?.tools ?? []) as { name: string }[]).map(t => t.name), STOCK_TOOLS)
    const call = await rpc(res.token, 'tools/call', { name: 'search_items', arguments: { q: 'กล้อง' } })
    assert.equal(call.res.status, 200)
    assert.notEqual(call.result?.isError, true, JSON.stringify(call.result))
    const log = fake.tables.activity_logs[fake.tables.activity_logs.length - 1]
    assert.equal(log.action_type, 'MCP_TOOL_CALL')
    assert.equal(log.user_id, STOCK)
    assert.equal((log.details as Row).tool, 'search_items')
    assert.equal((log.details as Row).clientName, 'Ollama โน้ตบุ๊ก')
    assert.ok(typeof row.last_used_at === 'string', 'last_used_at ถูกบันทึกเหมือน OAuth')

    // client แม่มีอยู่แล้ว → สร้างครั้งต่อไปไม่ error และไม่เพิ่มแถวซ้ำ
    await mustCreate(STOCK, 'เครื่องที่สอง', 365)
    assert.equal(fake.tables.oauth_clients.length, 1)
    pass(`T1 สร้าง stk_… (${res.token.length} ตัวอักษร) · แถว personal-token ถูกต้อง · tools/list = ${STOCK_TOOLS.length} tool ของ stock · tools/call + MCP_TOOL_CALL · client แม่ไม่ซ้ำ`)
  }

  // ═══ T2 / AC4: revoke → 401 (ผ่าน revokeConnection ของเจ้าของ) ═════════════════
  {
    const { token } = await mustCreate(STOCK, 'จะยกเลิก', 30)
    const row = rowOf(token)
    signIn(STOCK)
    assert.deepEqual(await actions.revokeConnection(row.id as string), { success: true })
    assert.ok(row.revoked_at)
    await expect401(token, 'token ที่ยกเลิกแล้ว')
    pass('T2 เจ้าของยกเลิก token ส่วนตัวด้วย revokeConnection → 401')
  }

  // ═══ T3 / AC4: หมดอายุ → 401 ═══════════════════════════════════════════════
  {
    const { token } = await mustCreate(STOCK, 'จะหมดอายุ', 30)
    rowOf(token).access_expires_at = new Date(Date.now() - 1000).toISOString()
    await expect401(token, 'token หมดอายุ')
    pass('T3 token หมดอายุ → 401')
  }

  // ═══ T4 / AC4: ผู้ใช้ถูกบล็อก / ยกเลิกอนุมัติ → 401 ═══════════════════════════
  {
    const { token } = await mustCreate(STOCK, 'จะโดนบล็อก', 30)
    const p = fake.tables.profiles.find(x => x.id === STOCK)!
    p.is_blocked = true
    await expect401(token, 'ผู้ใช้ถูกบล็อก')
    p.is_blocked = false
    p.is_approved = false
    await expect401(token, 'ผู้ใช้ไม่ได้รับอนุมัติ')
    p.is_approved = true
    assert.equal((await rpc(token, 'tools/list')).res.status, 200, 'ปลดบล็อกแล้วใช้ได้อีก')
    pass('T4 profile is_blocked / is_approved=false → 401 ทั้งคู่')
  }

  // ═══ T5 / AC5 / AC8: เพดาน 5 · revoke/หมดอายุไม่นับ · แอดมินยกเลิกได้ ═══════════
  {
    // token เก่าที่ไม่ควรนับ: revoke แล้ว 3 + หมดอายุ 3 + OAuth ปกติ 1
    const past = new Date(Date.now() - DAY).toISOString()
    const future = new Date(Date.now() + DAY).toISOString()
    for (let i = 0; i < 6; i++) {
      fake.tables.oauth_tokens.push({
        id: `old-${i}`, user_id: CAP, client_id: 'personal-token', client_name: `เก่า ${i}`, access_hash: sha(`old-${i}`),
        refresh_hash: sha(`old-r-${i}`), scope: 'mcp:read', code_hash: null, created_at: past, last_used_at: null,
        access_expires_at: i < 3 ? future : past, refresh_expires_at: i < 3 ? future : past, revoked_at: i < 3 ? past : null,
      })
    }
    fake.tables.oauth_tokens.push({
      id: 'cap-oauth', user_id: CAP, client_id: 'client-1', client_name: 'Claude', access_hash: sha('cap-oauth'), refresh_hash: sha('cap-oauth-r'),
      scope: 'mcp:read', code_hash: null, created_at: past, last_used_at: null, access_expires_at: future, refresh_expires_at: future, revoked_at: null,
    })
    const made: string[] = []
    for (let i = 1; i <= 5; i++) made.push((await mustCreate(CAP, `ใบที่ ${i}`, 30)).token)
    const writes = tokenWrites()
    const sixth = await create(CAP, 'ใบที่ 6', 30)
    assert.ok('error' in sixth && sixth.error.includes('5'), `ใบที่ 6 ต้องได้ error บอกเพดาน 5: ${JSON.stringify(sixth)}`)
    assert.equal(tokenWrites(), writes, 'เกินเพดานต้องไม่เขียน oauth_tokens')

    signIn(CAP)
    assert.deepEqual(await actions.revokeConnection(rowOf(made[0]).id as string), { success: true })
    const again = await mustCreate(CAP, 'ใบใหม่หลังยกเลิก', 30)

    // แอดมินยกเลิก token ส่วนตัวของคนอื่นได้ · คนอื่นที่ไม่ใช่เจ้าของยกเลิกไม่ได้
    signIn(STOCK)
    const denied = await actions.revokeConnection(rowOf(again.token).id as string)
    assert.ok('error' in denied, 'ไม่ใช่เจ้าของต้องยกเลิกไม่ได้')
    signIn(ADMIN)
    assert.deepEqual(await actions.revokeConnection(rowOf(again.token).id as string), { success: true })
    const revokeLog = fake.tables.activity_logs[fake.tables.activity_logs.length - 1]
    assert.equal(revokeLog.action_type, 'MCP_REVOKE')
    assert.equal((revokeLog.details as Row).byAdmin, true)
    await expect401(again.token, 'แอดมินยกเลิกแล้ว')
    pass(`T5 เพดาน 5: ใบที่ 6 → "${(sixth as { error: string }).error}" · revoke/หมดอายุ/OAuth ไม่นับ · ยกเลิก 1 ใบแล้วสร้างได้ · แอดมินยกเลิกได้ คนอื่นไม่ได้`)
  }

  // ═══ T6 / AC6: input ผิด / ไม่ได้ล็อกอิน → { error } และไม่เขียน DB ═════════════
  {
    const cases: [string, string | null, unknown, unknown][] = [
      ['ชื่อว่าง', FRESH, '   ', 30],
      ['ชื่อ 61 ตัว', FRESH, 'ก'.repeat(61), 30],
      ['ชื่อไม่ใช่สตริง', FRESH, 12345, 30],
      ['ชื่อ null', FRESH, null, 30],
      ['ttl 7', FRESH, 'ถูกต้อง', 7],
      ['ttl เป็นสตริง', FRESH, 'ถูกต้อง', '30'],
      ['ไม่ได้ล็อกอิน', null, 'ถูกต้อง', 30],
    ]
    const writesBefore = fake.writes.length
    for (const [label, user, name, ttl] of cases) {
      const res = await create(user, name, ttl)
      assert.ok('error' in res && typeof res.error === 'string' && res.error.length > 0, `${label}: ต้องได้ { error }`)
    }
    assert.equal(fake.writes.length, writesBefore, 'input ผิดต้องไม่เขียนตารางใดเลย')
    assert.equal(fake.tables.oauth_tokens.filter(r => r.user_id === FRESH).length, 0)
    // ขอบบน 60 ตัวพอดีผ่าน
    const ok60 = await mustCreate(FRESH, 'ข'.repeat(60), 365)
    assert.equal(rowOf(ok60.token).client_name, 'ข'.repeat(60))
    pass(`T6 input ผิด ${cases.length} แบบ → { error } · ไม่มีการเขียน DB · ชื่อ 60 ตัวผ่าน`)
  }

  // ═══ T7 / AC1 / AC7: log MCP_TOKEN_CREATE · ไม่มีค่า token ที่ไหนเลย ═══════════════
  {
    const createLogs = fake.tables.activity_logs.filter(l => l.action_type === 'MCP_TOKEN_CREATE')
    assert.equal(createLogs.length, issued.length, 'ทุกการสร้างสำเร็จต้องมี log')
    const first = createLogs[0]
    assert.equal(first.user_id, STOCK)
    const d = first.details as Row
    assert.deepEqual(Object.keys(d).sort(), ['name', 'tokenId', 'ttlDays'])
    assert.equal(d.name, 'Ollama โน้ตบุ๊ก')
    assert.equal(d.ttlDays, 90)
    assert.equal(d.tokenId, rowOf(issued[0]).id)
    const dump = JSON.stringify(fake.tables)
    for (const tok of issued) {
      assert.ok(!dump.includes(tok), 'ฐานข้อมูล/log ต้องไม่มีค่า token จริง')
      assert.ok(!dump.includes(tok.slice(4)), 'ต้องไม่มีค่า token แม้ตัด prefix')
    }
    pass(`T7 MCP_TOKEN_CREATE ${createLogs.length} รายการ {tokenId, name, ttlDays} · token จริง ${issued.length} ค่าไม่ปรากฏในตารางใดเลย`)
  }

  // ═══ AC8 / AC9: static render ═════════════════════════════════════════════
  {
    const now = new Date().toISOString()
    const later = new Date(Date.now() + 30 * DAY).toISOString()
    const html = renderToStaticMarkup(createElement(view.default, {
      isAdmin: false,
      connections: [
        { id: 'p1', clientName: 'Ollama โน้ตบุ๊ก', kind: 'personal', createdAt: now, lastUsedAt: null, expiresAt: later, ownerName: null },
        { id: 'o1', clientName: 'Claude', kind: 'oauth', createdAt: now, lastUsedAt: now, expiresAt: later, ownerName: null },
      ],
    }))
    const th = dictionary.th.connectedApps
    assert.equal(html.split('data-testid="personal-badge"').length - 1, 1, 'ป้ายเฉพาะแถว personal')
    assert.ok(html.includes(th.personalBadge))
    assert.equal(html.split(th.revoke).length - 1, 2, 'ปุ่มยกเลิกครบทุกแถว')
    assert.ok(html.includes(th.personalCreate), 'ปุ่มสร้าง token ที่หัวหน้า')

    const sample = 'stk_SAMPLE-token-value-for-render-check-000000000'
    const panel = renderToStaticMarkup(createElement(view.CreatedTokenPanel, { token: sample, expiresAt: later }))
    assert.ok(panel.includes(sample), 'หน้าผลลัพธ์ต้องแสดงค่า token')
    assert.ok(panel.includes(th.personalOnceWarning), 'ต้องมีคำเตือนเห็นครั้งเดียว')
    assert.ok(panel.includes(th.personalCopy), 'ต้องมีปุ่มคัดลอก')

    // ไม่เก็บ token ใน storage/URL และไม่มีข้อความไทย hardcode ในโค้ด view (ตัดคอมเมนต์ก่อน)
    const src = readFileSync(`${__dirname}/../app/(authenticated)/connected-apps/connected-apps-view.tsx`, 'utf8')
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    assert.ok(!/localStorage|sessionStorage|searchParams|history\./.test(code), 'view ต้องไม่เก็บ token ใน storage/URL')
    assert.ok(!/[฀-๿]/.test(code), 'view ต้องไม่มีข้อความไทย hardcode')
    for (const k of Object.keys(th) as (keyof typeof th)[]) assert.ok(k in dictionary.en.connectedApps, `dictionary en ต้องมี ${k}`)
    pass('AC8/AC9 render: ป้าย "token ส่วนตัว" + ปุ่มยกเลิกเดิม · หน้าผลลัพธ์มี token + คำเตือน + ปุ่มคัดลอก · ไม่มี storage/ไทย hardcode · th/en ครบ')
  }

  console.log('mcp-personal-token: ผ่านทั้งหมด')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
