import { getLicenseStatus } from '@/lib/license'
import { licenseExpiredResponse, oauthJson, oauthPreflight, revokeToken } from '@/lib/oauth'
import { createServiceClient } from '@/lib/supabase-server'

// RFC 7009 — ยกเลิก token (access หรือ refresh) · ตอบ 200 เสมอ แม้ไม่รู้จัก token

export async function POST(req: Request) {
  if (getLicenseStatus().expired) return licenseExpiredResponse()

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
