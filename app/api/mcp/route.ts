import { McpServer, WebStandardStreamableHTTPServerTransport, type CallToolResult } from '@modelcontextprotocol/server'
import pkg from '@/package.json'
import { getLicenseStatus } from '@/lib/license'
import { licenseExpiredResponse, oauthPreflight, touchToken, verifyAccessToken, MCP_SCOPE, type McpIdentity } from '@/lib/oauth'
import { capBytes, formatResult, MCP_TOOLS, toolsFor, ToolError, type McpTool } from '@/lib/mcp-tools'
import { checkRateLimit } from '@/lib/rate-limit'
import { logActivity } from '@/lib/logger'
import { requestOrigin } from '@/lib/request-origin'
import { createServiceClient } from '@/lib/supabase-server'

// MCP endpoint ของ Claude (สเปค docs/specs/mcp-server.md) — Streamable HTTP แบบ stateless:
// สร้าง McpServer + transport ใหม่ทุกคำขอ ลงทะเบียนเฉพาะ tool ที่โมดูลของ token อนุญาต
// ตอบเป็น JSON (ไม่เปิด SSE) · GET/DELETE ไม่มีความหมายเมื่อไม่มี session → 405 (หลังตรวจ token แล้ว)
// /api/* ไม่ผ่าน proxy.ts — ตรวจใบอนุญาตและ Bearer token เองที่นี่

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Db = ReturnType<typeof createServiceClient>

const RATE = { limit: 60, windowMs: 60_000, lockoutMs: 0 }
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Expose-Headers': 'Mcp-Session-Id, WWW-Authenticate',
}

const INSTRUCTIONS =
  'ข้อมูลจากระบบสต็อกของ M Image (อ่านอย่างเดียว แก้ไขอะไรไม่ได้) — เห็นเฉพาะโมดูลที่ผู้ใช้คนนี้มีสิทธิ์ในแอป ' +
  '(สต็อก / อีเวนต์ / ติดตามงาน / ใบเบิก / เช็คอิน) · ทุก tool คืนบรรทัดสรุปภาษาไทย ตามด้วย JSON { rows, total } ไม่เกิน 100 แถว ' +
  'ถ้า total มากกว่าจำนวนแถว ให้บอกผู้ใช้ว่ามีอีกและแนะนำให้ค้นให้แคบลง'

function withCors(res: Response): Response {
  const headers = new Headers(res.headers)
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v)
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers })
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS, ...extra },
  })
}

/** 401 ตาม RFC 9728 — บอก Claude ว่าไปขอ token ที่ไหน */
async function unauthorized(): Promise<Response> {
  const origin = await requestOrigin()
  return json({ error: 'invalid_token' }, 401, {
    'WWW-Authenticate': `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource", scope="${MCP_SCOPE}"`,
  })
}

const textError = (text: string): CallToolResult => ({ isError: true, content: [{ type: 'text', text }] })

/** ใบอนุญาต → token → identity · คืน Response เมื่อไม่ผ่าน */
async function authenticate(request: Request): Promise<{ db: Db; identity: McpIdentity } | Response> {
  if (getLicenseStatus().expired) return licenseExpiredResponse()
  const match = /^Bearer\s+(\S+)\s*$/i.exec(request.headers.get('authorization') ?? '')
  if (!match) return unauthorized()
  const db = createServiceClient()
  const identity = await verifyAccessToken(db, match[1])
  if (!identity) return unauthorized()
  return { db, identity }
}

/** เรียก tool หนึ่งครั้ง: rate limit → run (จับ error) → จำกัดขนาด → บันทึก log + เวลาใช้ล่าสุด */
async function callTool(db: Db, identity: McpIdentity, tool: McpTool, args: unknown): Promise<CallToolResult> {
  const rl = checkRateLimit(`mcp:${identity.tokenId}`, RATE)
  if (!rl.allowed) return textError(`เรียกถี่เกินไป รอ ${rl.retryAfterSeconds} วินาทีแล้วลองใหม่`)

  let text: string
  let rows: number
  let total: number
  try {
    const result = capBytes(await tool.run(db, args, { userId: identity.userId, role: identity.role, modules: identity.modules }))
    text = formatResult(result)
    rows = result.rows.length
    total = result.total ?? result.rows.length
  } catch (e) {
    if (e instanceof ToolError) return textError(e.message)
    // ไม่ส่ง stack/ข้อความภายในกลับไป — log ฝั่ง server เท่านั้น (ไม่มีค่า token)
    console.error(`[mcp] ${tool.name} failed:`, e instanceof Error ? e.message : e)
    return textError('ดึงข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง')
  }

  // บันทึกไม่สำเร็จต้องไม่ทำให้ tool พัง
  await Promise.allSettled([
    logActivity('MCP_TOOL_CALL', { tool: tool.name, args, rows, total, clientName: identity.clientName }, undefined, identity.userId),
    touchToken(db, identity.tokenId),
  ])
  return { content: [{ type: 'text', text }] }
}

function buildServer(db: Db, identity: McpIdentity, allowed: McpTool[]): McpServer {
  const server = new McpServer({ name: 'stock-mimage', version: pkg.version }, { instructions: INSTRUCTIONS })
  for (const tool of allowed) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema, annotations: { readOnlyHint: true, openWorldHint: false } },
      async args => callTool(db, identity, tool, args)
    )
  }
  return server
}

/** tools/call ของ tool ที่ไม่ได้ลงทะเบียน → isError ภาษาไทย (SDK เองจะตอบ JSON-RPC error ภาษาอังกฤษ) */
function forbiddenCall(body: unknown, allowed: McpTool[]): Response | null {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null
  const msg = body as { jsonrpc?: unknown; id?: unknown; method?: unknown; params?: { name?: unknown } }
  if (msg.method !== 'tools/call' || msg.id === undefined) return null
  const name = typeof msg.params?.name === 'string' ? msg.params.name : ''
  if (allowed.some(t => t.name === name)) return null
  const known = MCP_TOOLS.find(t => t.name === name)
  const text = !known
    ? `ไม่พบ tool ชื่อ ${name || '(ว่าง)'}`
    : known.adminOnly
      ? `ไม่มีสิทธิ์ใช้ ${name} — เฉพาะแอดมินเท่านั้น`
      : `ไม่มีสิทธิ์ใช้ ${name} — บัญชีนี้ไม่ได้เปิดโมดูล ${known.module} ในแอป ติดต่อแอดมินถ้าต้องการสิทธิ์`
  return json({ jsonrpc: '2.0', id: msg.id, result: textError(text) }, 200)
}

export async function POST(request: Request): Promise<Response> {
  const auth = await authenticate(request)
  if (auth instanceof Response) return auth
  const { db, identity } = auth

  // ชุดเดียวกันทั้งตอนกันเรียก (forbiddenCall) และตอนลงทะเบียน — adminOnly ตาม role จากฐานข้อมูลผ่าน token
  const allowed = toolsFor(identity.modules, identity.role)
  const body: unknown = await request.clone().json().catch(() => undefined)
  const blocked = forbiddenCall(body, allowed)
  if (blocked) return blocked

  const server = buildServer(db, identity, allowed)
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
    keepAliveMs: 0,
  })
  await server.connect(transport)
  try {
    return withCors(await transport.handleRequest(request, body === undefined ? undefined : { parsedBody: body }))
  } finally {
    await server.close().catch(() => undefined)
  }
}

/** stateless: ไม่มี SSE stream / session ให้เปิดหรือปิด — แต่ยังตอบ 401 ก่อนเพื่อให้ client ค้นหา OAuth ได้ */
async function methodNotAllowed(request: Request): Promise<Response> {
  const auth = await authenticate(request)
  if (auth instanceof Response) return auth
  return json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method not allowed — ใช้ POST (stateless)' } }, 405, { Allow: 'POST, OPTIONS' })
}

export const GET = methodNotAllowed
export const DELETE = methodNotAllowed

export function OPTIONS(): Response {
  const res = oauthPreflight()
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID')
  res.headers.set('Access-Control-Expose-Headers', CORS['Access-Control-Expose-Headers'])
  return res
}
