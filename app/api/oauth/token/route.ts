import { getLicenseStatus } from '@/lib/license'
import { cleanupExpiredOAuth, clientIp, exchangeCode, licenseExpiredResponse, oauthJson, oauthPreflight, refreshTokens, tooManyRequests, type TokenResult } from '@/lib/oauth'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase-server'

// token endpoint — แลก code (+PKCE) เป็น access/refresh หรือหมุน refresh · รับเฉพาะสอง grant นี้
// จำกัด 60 ครั้ง/นาที/IP · ล้าง code/client หมดอายุชั่วโมงละครั้งต่อ process (best-effort ไม่รอผล)

const CLEANUP_EVERY_MS = 60 * 60 * 1000
let lastCleanup = 0

/** อ่าน body แบบฟอร์ม (มาตรฐาน OAuth) หรือ JSON — คืนเฉพาะค่าที่เป็นข้อความ */
async function readParams(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get('content-type') ?? ''
  const out: Record<string, string> = {}
  try {
    if (type.includes('application/json')) {
      const body: unknown = await req.json()
      if (body && typeof body === 'object') {
        for (const [k, v] of Object.entries(body)) if (typeof v === 'string') out[k] = v
      }
    } else {
      for (const [k, v] of new URLSearchParams(await req.text())) out[k] = v
    }
  } catch {
    // body เสีย = ไม่มีพารามิเตอร์ → invalid_request ด้านล่าง
  }
  return out
}

export async function POST(req: Request) {
  if (getLicenseStatus().expired) return licenseExpiredResponse()

  const rl = checkRateLimit(`oauth-token:${clientIp(req)}`, { limit: 60, windowMs: 60_000, lockoutMs: 0 })
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds)

  const p = await readParams(req)
  const db = createServiceClient()

  if (Date.now() - lastCleanup > CLEANUP_EVERY_MS) {
    lastCleanup = Date.now()
    void cleanupExpiredOAuth(db).catch(() => {})
  }

  let result: TokenResult
  if (p.grant_type === 'authorization_code') {
    result = await exchangeCode(db, {
      code: p.code ?? '',
      codeVerifier: p.code_verifier ?? '',
      clientId: p.client_id ?? '',
      redirectUri: p.redirect_uri ?? '',
    })
  } else if (p.grant_type === 'refresh_token') {
    result = await refreshTokens(db, { refreshToken: p.refresh_token ?? '', clientId: p.client_id ?? '' })
  } else {
    return oauthJson({ error: 'unsupported_grant_type', error_description: 'รองรับเฉพาะ authorization_code และ refresh_token' }, 400)
  }

  if ('error' in result) {
    return oauthJson({ error: result.error, error_description: result.description }, result.error === 'invalid_client' ? 401 : 400)
  }
  return oauthJson({
    access_token: result.accessToken,
    token_type: 'Bearer',
    expires_in: result.expiresIn,
    refresh_token: result.refreshToken,
    scope: result.scope,
  })
}

export function OPTIONS() {
  return oauthPreflight()
}
