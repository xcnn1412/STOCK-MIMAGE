import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { createServiceClient } from './supabase-server'

// OAuth 2.1 ของ MCP — ให้ Claude อ่านข้อมูลแทนพนักงาน (สเปค docs/specs/mcp-server.md)
// เก็บเฉพาะ sha256 ของ code/token ในฐานข้อมูล (migration 20261008) · ห้าม log ค่า token
// ทุกฟังก์ชันที่แตะฐานข้อมูลรับ db (service role) เป็นตัวแรก — สคริปต์ตรวจส่งฐานจำลองเข้ามาได้

type Db = ReturnType<typeof createServiceClient>

export const MCP_MODULES = ['stock', 'events', 'jobs'] as const
export const MCP_SCOPE = 'mcp:read'

const CODE_TTL_MS = 10 * 60 * 1000
const ACCESS_TTL_S = 3600
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000
const TOUCH_EVERY_MS = 60 * 1000

// ── ค่าสุ่ม / hash / PKCE ─────────────────────────────────────────────────────

/** 32 ไบต์สุ่ม แบบ base64url */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/** sha256 แบบ hex */
export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex')
}

/** PKCE แบบ S256 เท่านั้น: base64url(sha256(verifier)) === challenge (เทียบแบบเวลาคงที่) */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false
  const a = Buffer.from(createHash('sha256').update(verifier).digest('base64url'))
  const b = Buffer.from(challenge)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** redirect_uri ต้องตรงทั้งสตริงกับที่ลงทะเบียน · https เท่านั้น (http ได้เฉพาะ localhost ตอนไม่ใช่ production) */
export function validRedirect(uri: string, registered: string[]): boolean {
  if (!registered.includes(uri)) return false
  let url: URL
  try {
    url = new URL(uri)
  } catch {
    return false
  }
  if (url.protocol === 'https:') return true
  return url.protocol === 'http:'
    && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')
    && process.env.NODE_ENV !== 'production'
}

/** โมดูลที่ Claude เห็นได้ — กติกาเดียวกับ hasModule: admin ได้ทุกโมดูล · allowed_modules null = ['stock'] */
export function modulesFor(profile: { role: string | null; allowed_modules: string[] | null }): string[] {
  if (profile.role === 'admin') return [...MCP_MODULES]
  const allowed = Array.isArray(profile.allowed_modules) ? profile.allowed_modules : ['stock']
  return MCP_MODULES.filter(m => allowed.includes(m))
}

// ── หน้าอนุญาต: ตรวจพารามิเตอร์ของ /oauth/authorize ──────────────────────────────

export interface AuthorizeParams {
  clientId: string
  redirectUri: string
  responseType: string
  codeChallenge: string
  codeChallengeMethod: string
  state: string
  scope: string
  resource: string
}

export type AuthorizeCheck =
  | { ok: true; clientName: string }
  | { ok: false; error: string }

/** ตรวจคำขอก่อนแสดงปุ่ม/ออก code — ไม่ผ่าน = ห้าม redirect ไป redirect_uri เด็ดขาด */
export async function checkAuthorizeRequest(db: Db, p: AuthorizeParams): Promise<AuthorizeCheck> {
  if (!p.clientId) return { ok: false, error: 'ไม่พบรหัสแอป (client_id)' }
  const { data: client } = await db
    .from('oauth_clients')
    .select('client_id, client_name, redirect_uris')
    .eq('client_id', p.clientId)
    .maybeSingle()
  if (!client) return { ok: false, error: 'ไม่รู้จักแอปนี้ — ให้เพิ่มการเชื่อมต่อใหม่จาก Claude' }
  const registered: string[] = Array.isArray(client.redirect_uris) ? client.redirect_uris : []
  if (!validRedirect(p.redirectUri, registered)) return { ok: false, error: 'ที่อยู่ส่งกลับ (redirect_uri) ไม่ตรงกับที่แอปลงทะเบียนไว้' }
  if (p.responseType !== 'code') return { ok: false, error: 'รูปแบบคำขอไม่รองรับ (response_type ต้องเป็น code)' }
  if (!p.codeChallenge) return { ok: false, error: 'คำขอไม่มีรหัสยืนยัน (code_challenge)' }
  if (p.codeChallengeMethod !== 'S256') return { ok: false, error: 'รองรับเฉพาะ code_challenge_method แบบ S256' }
  return { ok: true, clientName: (client.client_name as string | null) || 'MCP client' }
}

// ── code ──────────────────────────────────────────────────────────────────────

/** ออก authorization code (อายุ 10 นาที) — เก็บแค่ hash คืนค่าจริงให้ส่งไปกับ redirect */
export async function issueCode(db: Db, p: {
  clientId: string
  userId: string
  redirectUri: string
  codeChallenge: string
  scope: string
  resource: string
}): Promise<string> {
  const code = randomToken()
  const { error } = await db.from('oauth_codes').insert({
    code_hash: sha256(code),
    client_id: p.clientId,
    user_id: p.userId,
    redirect_uri: p.redirectUri,
    code_challenge: p.codeChallenge,
    scope: p.scope || MCP_SCOPE,
    resource: p.resource || null,
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  })
  if (error) throw new Error(`ออก code ไม่สำเร็จ: ${error.message}`)
  return code
}

export type TokenResult =
  | { accessToken: string; refreshToken: string; expiresIn: number; scope: string }
  | { error: 'invalid_grant' | 'invalid_client' | 'invalid_request'; description: string }

/** สร้างคู่ access + refresh ใหม่ — คืนค่าจริงครั้งเดียว ฐานข้อมูลเก็บแค่ hash */
async function insertTokens(db: Db, row: {
  userId: string
  clientId: string
  clientName: string | null
  scope: string
  codeHash: string | null
  createdAt?: string
  lastUsedAt?: string | null
}): Promise<TokenResult> {
  const accessToken = randomToken()
  const refreshToken = randomToken()
  const now = Date.now()
  const { error } = await db.from('oauth_tokens').insert({
    user_id: row.userId,
    client_id: row.clientId,
    client_name: row.clientName,
    access_hash: sha256(accessToken),
    refresh_hash: sha256(refreshToken),
    scope: row.scope,
    code_hash: row.codeHash,
    access_expires_at: new Date(now + ACCESS_TTL_S * 1000).toISOString(),
    refresh_expires_at: new Date(now + REFRESH_TTL_MS).toISOString(),
    ...(row.createdAt ? { created_at: row.createdAt } : {}),
    last_used_at: row.lastUsedAt ?? null,
  })
  if (error) return { error: 'invalid_request', description: 'ออก token ไม่สำเร็จ' }
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_S, scope: row.scope }
}

/** revoke ทุก token ที่สืบมาจาก code เดียวกัน (code ใช้ซ้ำ / refresh ใช้ซ้ำ) */
async function revokeFamily(db: Db, codeHash: string | null) {
  if (!codeHash) return
  await db.from('oauth_tokens').update({ revoked_at: new Date().toISOString() }).eq('code_hash', codeHash).is('revoked_at', null)
}

async function clientExists(db: Db, clientId: string): Promise<{ client_name: string | null } | null> {
  if (!clientId) return null
  const { data } = await db.from('oauth_clients').select('client_id, client_name').eq('client_id', clientId).maybeSingle()
  return data ? { client_name: (data.client_name as string | null) ?? null } : null
}

/** แลก code เป็น token — code ใช้ซ้ำ = revoke token ที่เคยออกจาก code นี้ทั้งหมด (RFC 6749 §4.1.2) */
export async function exchangeCode(db: Db, p: {
  code: string
  codeVerifier: string
  clientId: string
  redirectUri: string
}): Promise<TokenResult> {
  if (!p.code || !p.codeVerifier || !p.redirectUri) return { error: 'invalid_request', description: 'ต้องมี code, code_verifier และ redirect_uri' }
  const client = await clientExists(db, p.clientId)
  if (!client) return { error: 'invalid_client', description: 'ไม่รู้จัก client_id' }

  const codeHash = sha256(p.code)
  const { data: row } = await db.from('oauth_codes').select('*').eq('code_hash', codeHash).maybeSingle()
  if (!row) return { error: 'invalid_grant', description: 'code ไม่ถูกต้อง' }
  if (row.used_at) {
    await revokeFamily(db, codeHash)
    return { error: 'invalid_grant', description: 'code ถูกใช้ไปแล้ว' }
  }
  if (row.client_id !== p.clientId) return { error: 'invalid_grant', description: 'code ไม่ได้ออกให้ client นี้' }
  if (row.redirect_uri !== p.redirectUri) return { error: 'invalid_grant', description: 'redirect_uri ไม่ตรง' }
  if (new Date(row.expires_at as string).getTime() <= Date.now()) return { error: 'invalid_grant', description: 'code หมดอายุ' }
  if (!pkceMatches(p.codeVerifier, row.code_challenge as string)) return { error: 'invalid_grant', description: 'code_verifier ไม่ตรง' }

  // ทำเครื่องหมายใช้แล้วแบบมีเงื่อนไข — ยิงพร้อมกันสองครั้งได้ token ชุดเดียว
  const { data: marked } = await db
    .from('oauth_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .select('code_hash')
  if (!marked || marked.length === 0) {
    await revokeFamily(db, codeHash)
    return { error: 'invalid_grant', description: 'code ถูกใช้ไปแล้ว' }
  }

  return insertTokens(db, {
    userId: row.user_id as string,
    clientId: p.clientId,
    clientName: client.client_name,
    scope: (row.scope as string | null) || MCP_SCOPE,
    codeHash,
  })
}

/** หมุน refresh token: ตัวเก่า revoked · ออกคู่ใหม่ · ตัวที่ revoke แล้วถูกใช้ซ้ำ = invalid_grant + ตัดทั้งสาย */
export async function refreshTokens(db: Db, p: { refreshToken: string; clientId: string }): Promise<TokenResult> {
  if (!p.refreshToken) return { error: 'invalid_request', description: 'ต้องมี refresh_token' }
  const client = await clientExists(db, p.clientId)
  if (!client) return { error: 'invalid_client', description: 'ไม่รู้จัก client_id' }

  const { data: row } = await db.from('oauth_tokens').select('*').eq('refresh_hash', sha256(p.refreshToken)).maybeSingle()
  if (!row) return { error: 'invalid_grant', description: 'refresh_token ไม่ถูกต้อง' }
  if (row.client_id !== p.clientId) return { error: 'invalid_grant', description: 'refresh_token ไม่ได้ออกให้ client นี้' }
  if (row.revoked_at) {
    await revokeFamily(db, row.code_hash as string | null)
    return { error: 'invalid_grant', description: 'refresh_token ถูกยกเลิกแล้ว' }
  }
  if (new Date(row.refresh_expires_at as string).getTime() <= Date.now()) return { error: 'invalid_grant', description: 'refresh_token หมดอายุ' }

  // ผู้ใช้ถูกบล็อก / ยกเลิกอนุมัติ → ไม่ออกคู่ใหม่
  const { data: profile } = await db.from('profiles').select('is_approved, is_blocked').eq('id', row.user_id as string).maybeSingle()
  if (!profile || !profile.is_approved || profile.is_blocked) return { error: 'invalid_grant', description: 'บัญชีนี้ใช้งานไม่ได้' }

  const { data: revoked } = await db
    .from('oauth_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', row.id as string)
    .is('revoked_at', null)
    .select('id')
  if (!revoked || revoked.length === 0) return { error: 'invalid_grant', description: 'refresh_token ถูกใช้ไปแล้ว' }

  return insertTokens(db, {
    userId: row.user_id as string,
    clientId: row.client_id as string,
    clientName: (row.client_name as string | null) ?? client.client_name,
    scope: (row.scope as string | null) || MCP_SCOPE,
    codeHash: (row.code_hash as string | null) ?? null,
    createdAt: row.created_at as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
  })
}

/** ยกเลิก token (access หรือ refresh ก็ได้) — เรียกซ้ำได้ ไม่มีผลเพิ่ม */
export async function revokeToken(db: Db, token: string): Promise<void> {
  if (!token) return
  const hash = sha256(token)
  const now = new Date().toISOString()
  await db.from('oauth_tokens').update({ revoked_at: now }).eq('access_hash', hash).is('revoked_at', null)
  await db.from('oauth_tokens').update({ revoked_at: now }).eq('refresh_hash', hash).is('revoked_at', null)
}

export interface McpIdentity {
  userId: string
  role: string
  modules: string[]
  tokenId: string
  clientName: string
}

/** ตรวจ access token ของ /api/mcp — ไม่ revoke, ยังไม่หมดอายุ, ผู้ใช้อนุมัติแล้วและไม่ถูกบล็อก */
export async function verifyAccessToken(db: Db, token: string): Promise<McpIdentity | null> {
  if (!token) return null
  const { data: row } = await db
    .from('oauth_tokens')
    .select('id, user_id, client_name, access_expires_at, revoked_at')
    .eq('access_hash', sha256(token))
    .maybeSingle()
  if (!row || row.revoked_at) return null
  if (new Date(row.access_expires_at as string).getTime() <= Date.now()) return null

  const { data: profile } = await db
    .from('profiles')
    .select('role, is_approved, is_blocked, allowed_modules')
    .eq('id', row.user_id as string)
    .maybeSingle()
  if (!profile || !profile.is_approved || profile.is_blocked) return null

  const role = (profile.role as string | null) || 'staff'
  return {
    userId: row.user_id as string,
    role,
    modules: modulesFor({ role, allowed_modules: (profile.allowed_modules as string[] | null) ?? null }),
    tokenId: row.id as string,
    clientName: (row.client_name as string | null) || 'MCP client',
  }
}

/** บันทึกเวลาใช้ล่าสุด — ข้ามถ้าเพิ่งบันทึกไปไม่ถึง 60 วินาที */
export async function touchToken(db: Db, tokenId: string): Promise<void> {
  const { data } = await db.from('oauth_tokens').select('last_used_at').eq('id', tokenId).maybeSingle()
  if (!data) return
  const last = data.last_used_at ? new Date(data.last_used_at as string).getTime() : 0
  if (Date.now() - last < TOUCH_EVERY_MS) return
  await db.from('oauth_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tokenId)
}

// ── ตอบกลับของ endpoint OAuth (JSON + CORS + ไม่ cache) ──────────────────────────

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, MCP-Protocol-Version',
}

export function oauthJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...CORS_HEADERS },
  })
}

export function oauthPreflight(): Response {
  return new Response(null, { status: 204, headers: { ...CORS_HEADERS, 'Access-Control-Max-Age': '86400' } })
}

/** ใบอนุญาตหมดอายุ → 403 ทุก endpoint ของ OAuth/MCP */
export function licenseExpiredResponse(): Response {
  return oauthJson({ error: 'license_expired', error_description: 'ใบอนุญาตใช้งานระบบหมดอายุ' }, 403)
}
