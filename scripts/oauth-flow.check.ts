// OAuth 2.1 ของ MCP (WP1) — รัน route handler / server action / หน้าอนุญาต ตัวจริง กับ Supabase จำลองในหน่วยความจำ
// Run:  npx tsx scripts/oauth-flow.check.ts
//
// ตรวจ M2 (a)–(g), M3 (metadata + CORS + origin จาก x-forwarded-*), M4 (หน้าอนุญาต + grantAuthorization ฝั่ง server)
// ไม่แตะฐานข้อมูลหรือเครือข่ายจริง · ผู้ใช้สังเคราะห์
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "oauth-flow: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { createHash, randomUUID } from 'node:crypto'
import Module, { createRequire } from 'node:module'

process.env.SESSION_SECRET = 'oauth-flow-check'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'PUBLIC-KEY'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'SERVER-KEY'
const LICENSE_OK = '2099-01-01T00:00:00Z'
const LICENSE_EXPIRED = '2000-01-01T00:00:00Z'
process.env.LICENSE_EXPIRES_AT = LICENSE_OK
const env = process.env as Record<string, string | undefined>

// ── ฐานข้อมูลจำลอง ─────────────────────────────────────────────────────────────
type Row = Record<string, unknown>
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const STAFF = uid(1), ADMIN = uid(2), FINANCE_ONLY = uid(3), DEFAULT_MODULES = uid(4)

const db: Record<string, Row[]> = {
  profiles: [
    { id: STAFF, role: 'staff', full_name: 'สมชาย ทดสอบ', nickname: 'ชาย', is_approved: true, is_blocked: false, allowed_modules: ['stock', 'events', 'finance'] },
    { id: ADMIN, role: 'admin', full_name: 'แอดมิน', nickname: null, is_approved: true, is_blocked: false, allowed_modules: ['finance'] },
    { id: FINANCE_ONLY, role: 'staff', full_name: 'การเงิน', nickname: null, is_approved: true, is_blocked: false, allowed_modules: ['finance', 'crm'] },
    { id: DEFAULT_MODULES, role: 'staff', full_name: 'ค่าเริ่มต้น', nickname: null, is_approved: true, is_blocked: false, allowed_modules: null },
  ],
  oauth_clients: [],
  oauth_codes: [],
  oauth_tokens: [],
  activity_logs: [],
}
const UNIQUE: Record<string, string[]> = {
  oauth_clients: ['client_id'],
  oauth_codes: ['code_hash'],
  oauth_tokens: ['id', 'access_hash', 'refresh_hash'],
}

type Filter = (r: Row) => boolean
class Query implements PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }> {
  private filters: Filter[] = []
  private op: 'select' | 'insert' | 'update' = 'select'
  private payload: Row[] = []
  private patch: Row = {}
  private returning = false
  private orderBy: { col: string; asc: boolean } | null = null
  private max: number | null = null
  constructor(private table: string) {}

  select() { if (this.op !== 'select') this.returning = true; return this }
  insert(v: Row | Row[]) { this.op = 'insert'; this.payload = Array.isArray(v) ? v : [v]; return this }
  update(p: Row) { this.op = 'update'; this.patch = p; return this }
  eq(c: string, v: unknown) { this.filters.push(r => r[c] === v); return this }
  is(c: string, v: null) { this.filters.push(r => (r[c] ?? null) === v); return this }
  gt(c: string, v: string) { this.filters.push(r => typeof r[c] === 'string' && (r[c] as string) > v); return this }
  order(col: string, o?: { ascending?: boolean }) { this.orderBy = { col, asc: o?.ascending ?? true }; return this }
  limit(n: number) { this.max = n; return this }

  private run(): { data: Row[]; error: { message: string; code?: string } | null } {
    const rows = db[this.table]
    assert.ok(rows, `ตารางไม่รู้จัก: ${this.table}`)
    if (this.op === 'insert') {
      const added: Row[] = []
      for (const input of this.payload) {
        const row: Row = { ...input }
        if (this.table === 'oauth_tokens') {
          row.id ??= randomUUID()
          row.created_at ??= new Date().toISOString()
          row.revoked_at ??= null
        }
        if (this.table === 'oauth_clients') row.created_at ??= new Date().toISOString()
        if (this.table === 'oauth_codes') row.used_at ??= null
        for (const col of UNIQUE[this.table] ?? []) {
          if (rows.some(r => r[col] === row[col])) return { data: [], error: { code: '23505', message: `duplicate ${col}` } }
        }
        added.push(row)
      }
      rows.push(...added)
      return { data: added.map(r => ({ ...r })), error: null }
    }
    const hit = rows.filter(r => this.filters.every(f => f(r)))
    if (this.op === 'update') {
      for (const r of hit) Object.assign(r, this.patch)
      return { data: hit.map(r => ({ ...r })), error: null }
    }
    let out = hit.map(r => ({ ...r }))
    if (this.orderBy) {
      const { col, asc } = this.orderBy
      out.sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1))
    }
    if (this.max !== null) out = out.slice(0, this.max)
    return { data: out, error: null }
  }
  async maybeSingle() {
    const { data, error } = this.run()
    return { data: data[0] ?? null, error }
  }
  async single() {
    const { data, error } = this.run()
    if (error) return { data: null, error }
    return data.length === 1 ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'not single' } }
  }
  then<A, B>(ok?: ((v: { data: unknown; error: { message: string; code?: string } | null }) => A | PromiseLike<A>) | null, fail?: ((e: unknown) => B | PromiseLike<B>) | null) {
    const { data, error } = this.run()
    const value = { data: this.op === 'select' || this.returning ? data : null, error }
    return Promise.resolve(value).then(ok, fail)
  }
}
const fakeClient = { from: (table: string) => new Query(table) }

// ── แทนโมดูลที่ต้องมี Next ─────────────────────────────────────────────────────
let currentHeaders = new Headers()
let currentAuth: { userId: string; role: string; sessionId: string; fullName?: string | null; nickname?: string | null } | null = null
class RedirectSignal extends Error {
  constructor(public url: string) { super(`REDIRECT ${url}`) }
}
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient }],
  [/^next\/headers$/, {
    headers: async () => currentHeaders,
    cookies: async () => ({ get: () => undefined }),
  }],
  [/^next\/navigation$/, { redirect: (url: string) => { throw new RedirectSignal(url) } }],
  [/\/lib\/auth$/, { requireAuth: async () => currentAuth }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

const load = createRequire(__filename)
const oauth = load('../lib/oauth') as typeof import('../lib/oauth')
const asMeta = load('../app/.well-known/oauth-authorization-server/route') as typeof import('../app/.well-known/oauth-authorization-server/route')
const prMeta = load('../app/.well-known/oauth-protected-resource/route') as typeof import('../app/.well-known/oauth-protected-resource/route')
const prMetaMcp = load('../app/.well-known/oauth-protected-resource/api/mcp/route') as typeof import('../app/.well-known/oauth-protected-resource/api/mcp/route')
const register = load('../app/api/oauth/register/route') as typeof import('../app/api/oauth/register/route')
const token = load('../app/api/oauth/token/route') as typeof import('../app/api/oauth/token/route')
const revoke = load('../app/api/oauth/revoke/route') as typeof import('../app/api/oauth/revoke/route')
const actions = load('../app/oauth/authorize/actions') as typeof import('../app/oauth/authorize/actions')
const page = load('../app/oauth/authorize/page') as typeof import('../app/oauth/authorize/page')
const { renderToStaticMarkup } = load('react-dom/server') as typeof import('react-dom/server')

// ── ตัวช่วย ────────────────────────────────────────────────────────────────
const ORIGIN = 'https://stock.example.com'
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback'
function forwarded(host = 'stock.example.com', proto = 'https') {
  currentHeaders = new Headers({ 'x-forwarded-host': host, 'x-forwarded-proto': proto, 'user-agent': 'oauth-check' })
}
const pass = (label: string) => console.log(`PASS  ${label}`)
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
const b64sha = (s: string) => createHash('sha256').update(s).digest('base64url')
const issuedSecrets: string[] = []

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>
}
function post(path: string, body: Record<string, unknown> | string, type: 'json' | 'form' = 'json') {
  const headers = new Headers(currentHeaders)
  headers.set('content-type', type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded')
  return new Request(`${ORIGIN}${path}`, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
const form = (p: Record<string, string>) => new URLSearchParams(p).toString()

async function registerClient(redirect_uris: string[] = [CALLBACK], client_name = 'Claude'): Promise<string> {
  const res = await register.POST(post('/api/oauth/register', { client_name, redirect_uris }))
  assert.equal(res.status, 201)
  return (await json(res)).client_id as string
}

function authParams(clientId: string, verifier: string, extra: Partial<import('../lib/oauth').AuthorizeParams> = {}) {
  return {
    clientId,
    redirectUri: CALLBACK,
    responseType: 'code',
    codeChallenge: b64sha(verifier),
    codeChallengeMethod: 'S256',
    state: 'st-123',
    scope: 'mcp:read',
    resource: `${ORIGIN}/api/mcp`,
    ...extra,
  }
}

/** กดอนุญาต → คืน URL ที่ถูก redirect ไป (ต้อง redirect เสมอ) */
async function grant(params: import('../lib/oauth').AuthorizeParams): Promise<URL> {
  try {
    const res = await actions.grantAuthorization(params)
    assert.fail(`grantAuthorization ต้อง redirect แต่ได้ ${JSON.stringify(res)}`)
  } catch (e) {
    if (!(e instanceof RedirectSignal)) throw e
    return new URL(e.url)
  }
}
async function grantCode(clientId: string, verifier: string): Promise<string> {
  const url = await grant(authParams(clientId, verifier))
  const code = url.searchParams.get('code')
  assert.ok(code)
  issuedSecrets.push(code)
  return code
}
/** action ต้องคืน { error } ไม่ redirect และไม่ออก code */
async function grantFails(params: import('../lib/oauth').AuthorizeParams, label: string): Promise<string> {
  const codesBefore = db.oauth_codes.length
  const res = await actions.grantAuthorization(params).catch((e: unknown) => {
    if (e instanceof RedirectSignal) assert.fail(`${label}: ต้องไม่ redirect (ไป ${e.url})`)
    throw e
  })
  assert.ok(res && typeof res.error === 'string' && res.error.length > 0, `${label}: ต้องคืน error`)
  assert.equal(db.oauth_codes.length, codesBefore, `${label}: ต้องไม่ออก code`)
  return res.error
}

async function tokenCall(p: Record<string, string>, type: 'json' | 'form' = 'form') {
  const res = await token.POST(post('/api/oauth/token', type === 'form' ? form(p) : p, type))
  const body = await json(res)
  if (typeof body.access_token === 'string') issuedSecrets.push(body.access_token)
  if (typeof body.refresh_token === 'string') issuedSecrets.push(body.refresh_token)
  return { status: res.status, body, res }
}
async function exchange(clientId: string, code: string, verifier: string, redirect = CALLBACK, type: 'json' | 'form' = 'form') {
  return tokenCall({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: redirect }, type)
}

async function renderPage(search: Record<string, string>): Promise<string> {
  const el = await page.default({ searchParams: Promise.resolve(search) })
  return renderToStaticMarkup(el)
}

async function main() {
  forwarded()
  currentAuth = { userId: STAFF, role: 'staff', sessionId: 'sess-staff', fullName: 'สมชาย ทดสอบ', nickname: 'ชาย' }

  // ═══ M3: metadata ═══════════════════════════════════════════════════════════
  {
    const res = await asMeta.GET()
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('access-control-allow-origin'), '*')
    const m = await json(res)
    assert.equal(m.issuer, ORIGIN)
    assert.equal(m.authorization_endpoint, `${ORIGIN}/oauth/authorize`)
    assert.equal(m.token_endpoint, `${ORIGIN}/api/oauth/token`)
    assert.equal(m.registration_endpoint, `${ORIGIN}/api/oauth/register`)
    assert.equal(m.revocation_endpoint, `${ORIGIN}/api/oauth/revoke`)
    assert.deepEqual(m.code_challenge_methods_supported, ['S256'])
    assert.deepEqual(m.grant_types_supported, ['authorization_code', 'refresh_token'])
    assert.deepEqual(m.response_types_supported, ['code'])
    assert.deepEqual(m.token_endpoint_auth_methods_supported, ['none', 'client_secret_post'])
    assert.deepEqual(m.scopes_supported, ['mcp:read'])

    for (const handler of [prMeta, prMetaMcp]) {
      const r = await handler.GET()
      assert.equal(r.status, 200)
      assert.equal(r.headers.get('access-control-allow-origin'), '*')
      const p = await json(r)
      assert.equal(p.resource, `${ORIGIN}/api/mcp`)
      assert.deepEqual(p.authorization_servers, [ORIGIN])
      assert.deepEqual(p.scopes_supported, ['mcp:read'])
      assert.deepEqual(p.bearer_methods_supported, ['header'])
    }

    // origin มาจาก x-forwarded-host / proto ของคำขอ (requestOrigin) ไม่ hard-code
    forwarded('other.example.org', 'http')
    assert.equal((await json(await asMeta.GET())).issuer, 'http://other.example.org')
    assert.equal((await json(await prMetaMcp.GET())).resource, 'http://other.example.org/api/mcp')
    forwarded()

    // OPTIONS (CORS preflight) ทุก endpoint
    const preflights = [asMeta.OPTIONS, prMeta.OPTIONS, prMetaMcp.OPTIONS, register.OPTIONS, token.OPTIONS, revoke.OPTIONS]
    for (const opt of preflights) {
      const r = opt()
      assert.ok(r.status === 204 || r.status === 200)
      assert.equal(r.headers.get('access-control-allow-origin'), '*')
      const allowHeaders = r.headers.get('access-control-allow-headers') ?? ''
      for (const h of ['Authorization', 'Content-Type', 'MCP-Protocol-Version']) assert.ok(allowHeaders.includes(h), `ขาด ${h}`)
      assert.match(r.headers.get('access-control-allow-methods') ?? '', /GET/)
      assert.match(r.headers.get('access-control-allow-methods') ?? '', /OPTIONS/)
    }
  }
  pass('M3 metadata: authorization-server / protected-resource (+/api/mcp) ตรงสเปค · origin จาก x-forwarded-* · OPTIONS ทุกตัวมี CORS')

  // ═══ M2 (a) DCR ═════════════════════════════════════════════════════════════
  const clientId = await registerClient()
  {
    const row = db.oauth_clients.find(c => c.client_id === clientId)
    assert.ok(row, 'client ต้องถูกบันทึก')
    assert.deepEqual(row.redirect_uris, [CALLBACK])
    assert.equal(row.client_name, 'Claude')
    assert.ok(clientId.length >= 40, 'client_id ต้องเป็นค่าสุ่มยาว')

    const res = await register.POST(post('/api/oauth/register', { client_name: 'Claude', redirect_uris: [CALLBACK] }))
    const body = await json(res)
    assert.equal(body.token_endpoint_auth_method, 'none')
    assert.deepEqual(body.grant_types, ['authorization_code', 'refresh_token'])
    assert.deepEqual(body.response_types, ['code'])
    assert.equal(typeof body.client_id_issued_at, 'number')
    assert.equal(res.headers.get('cache-control'), 'no-store')

    const before = db.oauth_clients.length
    const rejects: [Record<string, unknown> | string, string][] = [
      [{ redirect_uris: ['http://evil.example.com/cb'] }, 'invalid_redirect_uri'],
      [{ redirect_uris: [] }, 'invalid_redirect_uri'],
      [{}, 'invalid_redirect_uri'],
      [{ redirect_uris: ['not a url'] }, 'invalid_redirect_uri'],
      [{ redirect_uris: Array.from({ length: 11 }, (_, i) => `https://claude.ai/cb/${i}`) }, 'invalid_redirect_uri'],
      [{ redirect_uris: [CALLBACK], client_name: 'x'.repeat(101) }, 'invalid_client_metadata'],
      ['{not json', 'invalid_client_metadata'],
    ]
    for (const [body, err] of rejects) {
      const r = await register.POST(post('/api/oauth/register', body))
      assert.equal(r.status, 400, `ต้องปฏิเสธ ${JSON.stringify(body).slice(0, 60)}`)
      assert.equal((await json(r)).error, err)
    }
    assert.equal(db.oauth_clients.length, before, 'คำขอที่ถูกปฏิเสธต้องไม่ถูกบันทึก')

    // ครบ 10 / ชื่อ 100 ตัวอักษร ผ่าน · ไม่มีชื่อ = 'MCP client'
    await registerClient(Array.from({ length: 10 }, (_, i) => `https://claude.ai/cb/${i}`), 'y'.repeat(100))
    const noName = await register.POST(post('/api/oauth/register', { redirect_uris: [CALLBACK] }))
    assert.equal((await json(noName)).client_name, 'MCP client')

    // http://localhost ได้ตอนพัฒนา · production ไม่ได้
    assert.equal((await register.POST(post('/api/oauth/register', { redirect_uris: ['http://localhost:6274/oauth/callback'] }))).status, 201)
    assert.equal((await register.POST(post('/api/oauth/register', { redirect_uris: ['http://127.0.0.1:33418/cb'] }))).status, 201)
    const realNodeEnv = env.NODE_ENV
    env.NODE_ENV = 'production'
    assert.equal((await register.POST(post('/api/oauth/register', { redirect_uris: ['http://localhost:6274/oauth/callback'] }))).status, 400)
    env.NODE_ENV = realNodeEnv
  }
  pass('M2 (a) DCR คืน client_id + บันทึก redirect_uris · http ที่ไม่ใช่ localhost / >10 URI / ชื่อ >100 ตัวอักษรถูกปฏิเสธ')

  // ═══ M4: grantAuthorization ฝั่ง server ═════════════════════════════════════
  const VERIFIER = 'v'.repeat(43) + '-verifier-1'
  {
    const unknownClient = await grantFails(authParams('no-such-client', VERIFIER), 'client_id ไม่รู้จัก')
    assert.match(unknownClient, /[ก-๙]/, 'ข้อความต้องเป็นภาษาไทย')
    await grantFails(authParams(clientId, VERIFIER, { redirectUri: 'https://evil.example.com/cb' }), 'redirect_uri ไม่ตรง')
    await grantFails(authParams(clientId, VERIFIER, { redirectUri: CALLBACK + '/' }), 'redirect_uri ต่างแค่ / ท้าย')
    await grantFails(authParams(clientId, VERIFIER, { codeChallengeMethod: 'plain' }), 'method ไม่ใช่ S256')
    await grantFails(authParams(clientId, VERIFIER, { codeChallengeMethod: '' }), 'ไม่มี method')
    await grantFails(authParams(clientId, VERIFIER, { codeChallenge: '' }), 'ไม่มี code_challenge')
    await grantFails(authParams(clientId, VERIFIER, { responseType: 'token' }), 'response_type ไม่ใช่ code')

    currentAuth = null
    await grantFails(authParams(clientId, VERIFIER), 'ไม่ได้ล็อกอิน')
    currentAuth = { userId: FINANCE_ONLY, role: 'staff', sessionId: 's' }
    assert.match(await grantFails(authParams(clientId, VERIFIER), 'ไม่มีโมดูล'), /ไม่มีโมดูล/)
    currentAuth = { userId: STAFF, role: 'staff', sessionId: 'sess-staff', fullName: 'สมชาย ทดสอบ', nickname: 'ชาย' }

    // ผ่าน → redirect ไป redirect_uri พร้อม code + state · code อายุ 10 นาที · log MCP_CONNECT
    const logsBefore = db.activity_logs.length
    const t0 = Date.now()
    const url = await grant(authParams(clientId, VERIFIER))
    assert.equal(`${url.origin}${url.pathname}`, CALLBACK)
    assert.equal(url.searchParams.get('state'), 'st-123')
    const code = url.searchParams.get('code')
    assert.ok(code)
    issuedSecrets.push(code)
    const codeRow = db.oauth_codes.find(c => c.code_hash === sha(code))
    assert.ok(codeRow, 'ต้องเก็บ code เป็น sha256')
    const ttl = new Date(codeRow.expires_at as string).getTime() - t0
    assert.ok(ttl > 9.9 * 60_000 && ttl <= 10 * 60_000 + 2000, `code ต้องอายุ 10 นาที (ได้ ${ttl} ms)`)
    assert.equal(codeRow.user_id, STAFF)
    assert.equal(codeRow.code_challenge, b64sha(VERIFIER))
    const logs = db.activity_logs.slice(logsBefore)
    assert.equal(logs.length, 1)
    assert.equal(logs[0].action_type, 'MCP_CONNECT')
    assert.equal(logs[0].user_id, STAFF)
    const details = logs[0].details as Record<string, unknown>
    assert.equal(details.clientId, clientId)
    assert.equal(details.clientName, 'Claude')
    assert.deepEqual(details.modules, ['stock', 'events'])

    // ปฏิเสธ → redirect error=access_denied + state · redirect_uri ไม่ตรง → ไม่ redirect
    try {
      await actions.denyAuthorization(authParams(clientId, VERIFIER))
      assert.fail('deny ต้อง redirect')
    } catch (e) {
      if (!(e instanceof RedirectSignal)) throw e
      const d = new URL(e.url)
      assert.equal(`${d.origin}${d.pathname}`, CALLBACK)
      assert.equal(d.searchParams.get('error'), 'access_denied')
      assert.equal(d.searchParams.get('state'), 'st-123')
      assert.equal(d.searchParams.get('code'), null)
    }
    const denyBad = await actions.denyAuthorization(authParams(clientId, VERIFIER, { redirectUri: 'https://evil.example.com/cb' }))
      .catch((e: unknown) => { if (e instanceof RedirectSignal) assert.fail(`deny ไป redirect_uri ที่ไม่ตรง: ${e.url}`); throw e })
    assert.ok(denyBad.error)

    // ═══ M2 (b) แลก code ═══════════════════════════════════════════════════════
    const first = await exchange(clientId, code, VERIFIER)
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.equal(first.body.token_type, 'Bearer')
    assert.equal(first.body.expires_in, 3600)
    assert.equal(first.body.scope, 'mcp:read')
    assert.equal(first.res.headers.get('cache-control'), 'no-store')
    const access1 = first.body.access_token as string
    const refresh1 = first.body.refresh_token as string
    assert.ok(access1 && refresh1 && access1 !== refresh1)
    const who = await oauth.verifyAccessToken(fakeClient as never, access1)
    assert.ok(who, 'access token ใหม่ต้องใช้ได้')
    assert.equal(who.userId, STAFF)
    assert.deepEqual(who.modules, ['stock', 'events'])
    assert.equal(who.clientName, 'Claude')
    const tokRow = db.oauth_tokens.find(t => t.access_hash === sha(access1))
    assert.ok(tokRow)
    assert.equal(tokRow.client_name, 'Claude')
    const accessTtl = new Date(tokRow.access_expires_at as string).getTime() - Date.now()
    const refreshTtl = new Date(tokRow.refresh_expires_at as string).getTime() - Date.now()
    assert.ok(accessTtl > 3590_000 && accessTtl <= 3600_000, 'access อายุ 1 ชม.')
    assert.ok(refreshTtl > 29.9 * 86400_000 && refreshTtl <= 30 * 86400_000, 'refresh อายุ 30 วัน')

    // code ใช้ซ้ำ → 400 invalid_grant + token ชุดแรกถูก revoke
    const reuse = await exchange(clientId, code, VERIFIER)
    assert.equal(reuse.status, 400)
    assert.equal(reuse.body.error, 'invalid_grant')
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, access1), null, 'code ใช้ซ้ำแล้ว token ชุดแรกต้องใช้ไม่ได้')
    const refreshAfterReuse = await tokenCall({ grant_type: 'refresh_token', refresh_token: refresh1, client_id: clientId })
    assert.equal(refreshAfterReuse.status, 400, 'refresh ของชุดที่ถูก revoke ต้องใช้ไม่ได้')
  }
  {
    // verifier ผิด → 400 invalid_grant (JSON body ก็รับ)
    const c = await grantCode(clientId, VERIFIER)
    const wrong = await exchange(clientId, c, VERIFIER + 'x', CALLBACK, 'json')
    assert.equal(wrong.status, 400)
    assert.equal(wrong.body.error, 'invalid_grant')
    // redirect_uri ไม่ตรง → 400
    const badRedirect = await exchange(clientId, c, VERIFIER, 'https://claude.ai/other')
    assert.equal(badRedirect.status, 400)
    assert.equal(badRedirect.body.error, 'invalid_grant')
    // client อื่น → 400 · ไม่มี client → 401 invalid_client
    const other = await registerClient()
    assert.equal((await exchange(other, c, VERIFIER)).status, 400)
    const noClient = await exchange('', c, VERIFIER)
    assert.equal(noClient.status, 401)
    assert.equal(noClient.body.error, 'invalid_client')
    // แบบ JSON ที่ถูกต้องยังแลกได้ (code ยังไม่ถูกใช้)
    const okJson = await exchange(clientId, c, VERIFIER, CALLBACK, 'json')
    assert.equal(okJson.status, 200, JSON.stringify(okJson.body))

    // code หมดอายุ (>10 นาที) → 400
    const c2 = await grantCode(clientId, VERIFIER)
    const row = db.oauth_codes.find(r => r.code_hash === sha(c2))
    assert.ok(row)
    row.expires_at = new Date(Date.now() - 1000).toISOString()
    const expired = await exchange(clientId, c2, VERIFIER)
    assert.equal(expired.status, 400)
    assert.equal(expired.body.error, 'invalid_grant')

    // grant_type อื่น → 400 unsupported_grant_type
    for (const g of ['password', 'client_credentials', 'implicit', '']) {
      const r = await tokenCall({ grant_type: g, client_id: clientId, username: 'a', password: 'b' })
      assert.equal(r.status, 400)
      assert.equal(r.body.error, 'unsupported_grant_type')
    }
  }
  pass('M2 (b) code + verifier ถูก → access/refresh · verifier ผิด / redirect ไม่ตรง / client อื่น / หมดอายุ → 400 · ใช้ซ้ำ → 400 + revoke ชุดแรก · grant อื่น → unsupported_grant_type')
  pass('M4 grantAuthorization: ตรวจล็อกอิน + client/redirect/S256/response_type/โมดูล ซ้ำฝั่ง server · code 10 นาที · MCP_CONNECT · ปฏิเสธ → access_denied + state')

  // ═══ M2 (c) refresh ═════════════════════════════════════════════════════════
  const V2 = 'w'.repeat(50)
  let liveAccess = ''
  let liveRefresh = ''
  {
    const c = await grantCode(clientId, V2)
    const t = await exchange(clientId, c, V2)
    assert.equal(t.status, 200)
    const a1 = t.body.access_token as string, r1 = t.body.refresh_token as string
    const createdAt = db.oauth_tokens.find(x => x.access_hash === sha(a1))?.created_at

    const r = await tokenCall({ grant_type: 'refresh_token', refresh_token: r1, client_id: clientId })
    assert.equal(r.status, 200, JSON.stringify(r.body))
    const a2 = r.body.access_token as string, r2 = r.body.refresh_token as string
    assert.ok(a2 && r2 && a2 !== a1 && r2 !== r1, 'ต้องได้คู่ใหม่')
    assert.ok(await oauth.verifyAccessToken(fakeClient as never, a2))
    const oldRow = db.oauth_tokens.find(x => x.refresh_hash === sha(r1))
    assert.ok(oldRow?.revoked_at, 'refresh เก่าต้องถูก revoke')
    assert.equal(db.oauth_tokens.find(x => x.access_hash === sha(a2))?.created_at, createdAt, 'การเชื่อมต่อเดิม: created_at คงเดิม')

    // refresh ของ client อื่น → 400
    const other = await registerClient()
    assert.equal((await tokenCall({ grant_type: 'refresh_token', refresh_token: r2, client_id: other })).status, 400)

    // refresh ต่อจากคู่ใหม่ได้
    const r3 = await tokenCall({ grant_type: 'refresh_token', refresh_token: r2, client_id: clientId })
    assert.equal(r3.status, 200)
    liveAccess = r3.body.access_token as string
    liveRefresh = r3.body.refresh_token as string

    // refresh เก่าใช้ซ้ำ → 400 invalid_grant (และตัดทั้งสายที่มาจาก code เดียวกัน)
    const replay = await tokenCall({ grant_type: 'refresh_token', refresh_token: r1, client_id: clientId })
    assert.equal(replay.status, 400)
    assert.equal(replay.body.error, 'invalid_grant')
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, liveAccess), null, 'refresh ใช้ซ้ำ → token ทั้งสายถูกตัด')

    // refresh หมดอายุ → 400
    const c2 = await grantCode(clientId, V2)
    const t2 = await exchange(clientId, c2, V2)
    liveAccess = t2.body.access_token as string
    liveRefresh = t2.body.refresh_token as string
    const row = db.oauth_tokens.find(x => x.refresh_hash === sha(liveRefresh))
    assert.ok(row)
    const keep = row.refresh_expires_at
    row.refresh_expires_at = new Date(Date.now() - 1000).toISOString()
    assert.equal((await tokenCall({ grant_type: 'refresh_token', refresh_token: liveRefresh, client_id: clientId })).status, 400)
    row.refresh_expires_at = keep
  }
  pass('M2 (c) refresh: ได้คู่ใหม่ + ตัวเก่า revoked · refresh เก่าใช้ซ้ำ → 400 (ตัดทั้งสาย) · client อื่น / หมดอายุ → 400')

  // ═══ M2 (d) revoke ══════════════════════════════════════════════════════════
  {
    assert.ok(await oauth.verifyAccessToken(fakeClient as never, liveAccess))
    const r = await revoke.POST(post('/api/oauth/revoke', form({ token: liveAccess }), 'form'))
    assert.equal(r.status, 200)
    assert.deepEqual(await json(r), {})
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, liveAccess), null)
    // ซ้ำ / ไม่รู้จัก / body เสีย → 200 {}
    assert.equal((await revoke.POST(post('/api/oauth/revoke', form({ token: liveAccess }), 'form'))).status, 200)
    assert.equal((await revoke.POST(post('/api/oauth/revoke', { token: 'unknown-token' }))).status, 200)
    assert.equal((await revoke.POST(post('/api/oauth/revoke', '{bad'))).status, 200)
    // revoke ด้วย refresh token (JSON)
    const c = await grantCode(clientId, V2)
    const t = await exchange(clientId, c, V2)
    const a = t.body.access_token as string, rf = t.body.refresh_token as string
    await revoke.POST(post('/api/oauth/revoke', { token: rf }))
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, a), null, 'revoke ด้วย refresh ตัดทั้งการเชื่อมต่อ')
    assert.equal((await tokenCall({ grant_type: 'refresh_token', refresh_token: rf, client_id: clientId })).status, 400)
  }
  pass('M2 (d) revoke (access หรือ refresh, form หรือ JSON) → verifyAccessToken null · ตอบ 200 {} เสมอ')

  // ═══ M2 (e) ผู้ใช้ถูกบล็อก / ยกเลิกอนุมัติ ═══════════════════════════════════════
  {
    const c = await grantCode(clientId, V2)
    const t = await exchange(clientId, c, V2)
    const a = t.body.access_token as string, rf = t.body.refresh_token as string
    const staff = db.profiles.find(p => p.id === STAFF)
    assert.ok(staff)
    assert.ok(await oauth.verifyAccessToken(fakeClient as never, a))
    staff.is_blocked = true
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, a), null, 'ถูกบล็อก')
    assert.equal((await tokenCall({ grant_type: 'refresh_token', refresh_token: rf, client_id: clientId })).status, 400, 'ถูกบล็อก refresh ไม่ได้')
    staff.is_blocked = false
    staff.is_approved = false
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, a), null, 'ยกเลิกอนุมัติ')
    staff.is_approved = true
    assert.ok(await oauth.verifyAccessToken(fakeClient as never, a), 'คืนสถานะแล้วใช้ได้อีก')

    // access หมดอายุ → null
    const row = db.oauth_tokens.find(x => x.access_hash === sha(a))
    assert.ok(row)
    row.access_expires_at = new Date(Date.now() - 1000).toISOString()
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, a), null, 'access หมดอายุ')
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, ''), null)
    assert.equal(await oauth.verifyAccessToken(fakeClient as never, 'garbage'), null)
  }
  pass('M2 (e) is_blocked / is_approved=false / access หมดอายุ → verifyAccessToken null แม้ token ยังไม่หมดอายุ')

  // modulesFor + touchToken
  {
    assert.deepEqual(oauth.modulesFor({ role: 'admin', allowed_modules: ['finance'] }), ['stock', 'events', 'jobs'])
    assert.deepEqual(oauth.modulesFor({ role: 'staff', allowed_modules: null }), ['stock'])
    assert.deepEqual(oauth.modulesFor({ role: 'staff', allowed_modules: ['jobs', 'crm', 'admin'] }), ['jobs'])
    assert.deepEqual(oauth.modulesFor({ role: 'staff', allowed_modules: ['finance'] }), [])

    const c = await grantCode(clientId, V2)
    const a = (await exchange(clientId, c, V2)).body.access_token as string
    const who = await oauth.verifyAccessToken(fakeClient as never, a)
    assert.ok(who)
    const row = db.oauth_tokens.find(x => x.id === who.tokenId)
    assert.ok(row)
    await oauth.touchToken(fakeClient as never, who.tokenId)
    const first = row.last_used_at
    assert.ok(first, 'touchToken ต้องบันทึก last_used_at')
    await oauth.touchToken(fakeClient as never, who.tokenId)
    assert.equal(row.last_used_at, first, 'ไม่ถึง 60 วินาทีต้องไม่อัปเดตซ้ำ')
    const stale = new Date(Date.now() - 61_000).toISOString()
    row.last_used_at = stale
    await oauth.touchToken(fakeClient as never, who.tokenId)
    assert.notEqual(row.last_used_at, stale, 'เกิน 60 วินาทีต้องอัปเดต')

    // admin เห็นทุกโมดูล · allowed_modules null = stock
    currentAuth = { userId: ADMIN, role: 'admin', sessionId: 's' }
    const ca = await grantCode(clientId, V2)
    const wa = await oauth.verifyAccessToken(fakeClient as never, (await exchange(clientId, ca, V2)).body.access_token as string)
    assert.deepEqual(wa?.modules, ['stock', 'events', 'jobs'])
    currentAuth = { userId: DEFAULT_MODULES, role: 'staff', sessionId: 's' }
    const cd = await grantCode(clientId, V2)
    const wd = await oauth.verifyAccessToken(fakeClient as never, (await exchange(clientId, cd, V2)).body.access_token as string)
    assert.deepEqual(wd?.modules, ['stock'])
    currentAuth = { userId: STAFF, role: 'staff', sessionId: 'sess-staff', fullName: 'สมชาย ทดสอบ', nickname: 'ชาย' }

    // PKCE / redirect แบบ pure
    assert.equal(oauth.pkceMatches('abc', b64sha('abc')), true)
    assert.equal(oauth.pkceMatches('abc', 'abc'), false, 'plain ต้องไม่ผ่าน')
    assert.equal(oauth.pkceMatches('', ''), false)
    assert.equal(oauth.validRedirect('https://a.example/cb', ['https://a.example/cb/']), false)
  }
  pass('modulesFor ตามกติกา hasModule · touchToken ไม่เกินนาทีละครั้ง · PKCE S256 เท่านั้น')

  // ═══ M2 (f) ฐานข้อมูลมีแต่ sha256 ════════════════════════════════════════════
  {
    assert.ok(issuedSecrets.length > 20)
    const dump = JSON.stringify([db.oauth_codes, db.oauth_tokens, db.oauth_clients, db.activity_logs])
    for (const s of issuedSecrets) assert.ok(!dump.includes(s), 'พบค่า code/token จริงในฐานข้อมูล')
    for (const r of db.oauth_codes) assert.match(r.code_hash as string, /^[0-9a-f]{64}$/)
    for (const r of db.oauth_tokens) {
      assert.match(r.access_hash as string, /^[0-9a-f]{64}$/)
      assert.match(r.refresh_hash as string, /^[0-9a-f]{64}$/)
    }
    const hashes = new Set(db.oauth_tokens.flatMap(r => [r.access_hash, r.refresh_hash]).concat(db.oauth_codes.map(r => r.code_hash)))
    assert.ok(issuedSecrets.every(s => hashes.has(sha(s))), 'ทุกค่าที่ออกต้องมี sha256 อยู่ในฐาน')
  }
  pass('M2 (f) ฐานข้อมูลไม่มีค่า code/token จริง มีแต่ sha256 (hex 64 ตัว)')

  // ═══ M4: หน้าอนุญาต (render จริง) ══════════════════════════════════════════
  {
    const base = { client_id: clientId, redirect_uri: CALLBACK, response_type: 'code', code_challenge: b64sha(V2), code_challenge_method: 'S256', state: 'st-9' }
    const ALLOW_BUTTON = /อนุญาต<\/button>/
    const DENY_BUTTON = /ปฏิเสธ<\/button>/

    const ok = await renderPage(base)
    assert.match(ok, ALLOW_BUTTON)
    assert.match(ok, DENY_BUTTON)
    assert.match(ok, /Claude/)
    assert.match(ok, /สต็อก/)
    assert.match(ok, /อีเวนต์/)
    assert.ok(!ok.includes('ติดตามงาน'), 'staff ไม่มีโมดูล jobs')
    assert.match(ok, /ชาย/, 'แสดงชื่อผู้ใช้')
    assert.match(ok, /การเชื่อมต่อที่มีอยู่แล้ว/)

    const invalid: [Record<string, string>, string][] = [
      [{ ...base, client_id: 'nope' }, 'client_id ไม่รู้จัก'],
      [{ ...base, redirect_uri: 'https://evil.example.com/cb' }, 'redirect_uri ไม่ตรง'],
      [{ ...base, code_challenge_method: 'plain' }, 'method ไม่ใช่ S256'],
      [{ ...base, response_type: 'token' }, 'response_type'],
      [{ ...base, code_challenge: '' }, 'ไม่มี code_challenge'],
      [{}, 'ไม่มีพารามิเตอร์'],
    ]
    for (const [sp, label] of invalid) {
      const html = await renderPage(sp)
      assert.ok(!ALLOW_BUTTON.test(html) && !DENY_BUTTON.test(html), `${label}: ต้องไม่มีปุ่ม`)
      assert.match(html, /เชื่อมต่อไม่ได้/, `${label}: ต้องแสดง error`)
      assert.ok(!html.includes('evil.example.com'), `${label}: ต้องไม่มีลิงก์ไป redirect_uri ที่ไม่รู้จัก`)
    }

    // ไม่มีโมดูล stock/events/jobs → ไม่มีปุ่มอนุญาต (ปุ่มปฏิเสธยังอยู่)
    currentAuth = { userId: FINANCE_ONLY, role: 'staff', sessionId: 's', fullName: 'การเงิน' }
    const none = await renderPage(base)
    assert.ok(!ALLOW_BUTTON.test(none))
    assert.match(none, DENY_BUTTON)
    assert.match(none, /บัญชีนี้ไม่มีโมดูลที่ Claude ใช้ได้/)

    // admin เห็นครบสามโมดูล
    currentAuth = { userId: ADMIN, role: 'admin', sessionId: 's', fullName: 'แอดมิน' }
    assert.match(await renderPage(base), /ติดตามงาน/)

    // ไม่ได้ล็อกอิน → /login?next=<path+query>
    currentAuth = null
    try {
      await renderPage(base)
      assert.fail('ต้อง redirect ไปหน้าล็อกอิน')
    } catch (e) {
      if (!(e instanceof RedirectSignal)) throw e
      const u = new URL(e.url, ORIGIN)
      assert.equal(u.pathname, '/login')
      const next = new URL(u.searchParams.get('next') ?? '', ORIGIN)
      assert.equal(next.pathname, '/oauth/authorize')
      assert.equal(next.searchParams.get('client_id'), clientId)
      assert.equal(next.searchParams.get('state'), 'st-9')
    }
    currentAuth = { userId: STAFF, role: 'staff', sessionId: 'sess-staff', fullName: 'สมชาย ทดสอบ', nickname: 'ชาย' }
  }
  pass('M4 หน้าอนุญาต: คำขอไม่ถูกต้อง → error ไม่มีปุ่ม · ไม่มีโมดูล → ไม่มีปุ่มอนุญาต · ไม่ล็อกอิน → /login?next=…')

  // ═══ M11: ไม่ใช้ anon client · ไม่ log ค่า token ══════════════════════════════
  {
    const { readFileSync } = load('node:fs') as typeof import('node:fs')
    const { join } = load('node:path') as typeof import('node:path')
    const root = join(__dirname, '..')
    const files = [
      'lib/oauth.ts',
      'app/.well-known/oauth-authorization-server/route.ts',
      'app/.well-known/oauth-protected-resource/route.ts',
      'app/.well-known/oauth-protected-resource/api/mcp/route.ts',
      'app/api/oauth/register/route.ts',
      'app/api/oauth/token/route.ts',
      'app/api/oauth/revoke/route.ts',
      'app/oauth/authorize/page.tsx',
      'app/oauth/authorize/actions.ts',
    ]
    for (const f of files) {
      const src = readFileSync(join(root, f), 'utf8')
      assert.ok(!/from ['"]@\/lib\/supabase['"]|createBrowserClient|NEXT_PUBLIC_SUPABASE_ANON_KEY/.test(src), `${f}: ห้ามใช้ anon client`)
      assert.ok(!/console\.(log|info|warn|error|debug)/.test(src), `${f}: ห้าม console.*`)
    }
    for (const f of files.filter(f => f.includes('/api/oauth/') || f.includes('.well-known'))) {
      const src = readFileSync(join(root, f), 'utf8')
      assert.ok(/getLicenseStatus\(\)\.expired|resourceMetadata\(\)/.test(src), `${f}: ต้องเช็กใบอนุญาต`)
    }
  }
  pass('M11 ไม่มี anon client / console.* ใน endpoint · ทุก route เช็กใบอนุญาต')

  // ═══ M2 (g) ใบอนุญาตหมดอายุ → 403 ═══════════════════════════════════════════
  {
    const c = await grantCode(clientId, V2)
    env.LICENSE_EXPIRES_AT = LICENSE_EXPIRED
    const t = await token.POST(post('/api/oauth/token', form({ grant_type: 'authorization_code', code: c, code_verifier: V2, client_id: clientId, redirect_uri: CALLBACK }), 'form'))
    assert.equal(t.status, 403)
    assert.equal((await json(t)).error, 'license_expired')
    assert.equal(db.oauth_codes.find(r => r.code_hash === sha(c))?.used_at, null, 'ใบอนุญาตหมด → ไม่แตะ code')
    for (const res of [
      await register.POST(post('/api/oauth/register', { redirect_uris: [CALLBACK] })),
      await revoke.POST(post('/api/oauth/revoke', { token: 'x' })),
      await asMeta.GET(),
      await prMeta.GET(),
      await prMetaMcp.GET(),
    ]) {
      assert.equal(res.status, 403)
      assert.equal((await json(res)).error, 'license_expired')
    }
    const g = await actions.grantAuthorization(authParams(clientId, V2))
    assert.ok(g.error, 'ใบอนุญาตหมด → grantAuthorization ไม่ออก code')
    env.LICENSE_EXPIRES_AT = LICENSE_OK
    assert.equal((await exchange(clientId, c, V2)).status, 200, 'ต่ออายุแล้วใช้ได้ตามปกติ')
  }
  pass('M2 (g) ใบอนุญาตหมดอายุ → token / register / revoke / metadata ตอบ 403 license_expired')

  console.log('\noauth-flow: ผ่านทั้งหมด')
}

main().catch(e => { console.error('FAIL ', e); process.exit(1) })
