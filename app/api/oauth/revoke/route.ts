import { getLicenseStatus } from '@/lib/license'
import { clientIp } from '@/lib/client-ip'
import { licenseExpiredResponse, oauthJson, oauthPreflight, revokeToken, tooManyRequests } from '@/lib/oauth'
import { checkRateLimit } from '@/lib/rate-limit'
import { createServiceClient } from '@/lib/supabase-server'

// RFC 7009 — ยกเลิก token (access หรือ refresh) · ตอบ 200 เสมอ แม้ไม่รู้จัก token · จำกัด 60 ครั้ง/นาที/IP

export async function POST(req: Request) {
  if (getLicenseStatus().expired) return licenseExpiredResponse()

  const rl = checkRateLimit(`oauth-revoke:${clientIp(req.headers)}`, { limit: 60, windowMs: 60_000, lockoutMs: 0 })
  if (!rl.allowed) return tooManyRequests(rl.retryAfterSeconds)

  let token = ''
  try {
    if ((req.headers.get('content-type') ?? '').includes('application/json')) {
      const body: unknown = await req.json()
      if (body && typeof body === 'object' && 'token' in body && typeof body.token === 'string') token = body.token
    } else {
      token = new URLSearchParams(await req.text()).get('token') ?? ''
    }
  } catch {
    // body เสีย = ไม่มี token
  }

  if (token) await revokeToken(createServiceClient(), token)
  return oauthJson({})
}

export function OPTIONS() {
  return oauthPreflight()
}
