import { getLicenseStatus } from '@/lib/license'
import { licenseExpiredResponse, oauthJson, oauthPreflight, randomToken, validRedirect } from '@/lib/oauth'
import { createServiceClient } from '@/lib/supabase-server'

// RFC 7591 — Dynamic Client Registration: Claude ลงทะเบียนตัวเองก่อนขออนุญาต
// public client เท่านั้น (ไม่มี secret) — ความปลอดภัยมาจาก PKCE + redirect_uri ที่ตรงทั้งสตริง

const MAX_REDIRECTS = 10
const MAX_NAME = 100
const GRANT_TYPES = ['authorization_code', 'refresh_token']
const RESPONSE_TYPES = ['code']

const bad = (error: string, error_description: string) => oauthJson({ error, error_description }, 400)

export async function POST(req: Request) {
  if (getLicenseStatus().expired) return licenseExpiredResponse()

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return bad('invalid_client_metadata', 'body ต้องเป็น JSON')
  }
  if (!body || typeof body !== 'object') return bad('invalid_client_metadata', 'body ต้องเป็น JSON object')
  const meta = body as Record<string, unknown>

  const uris = meta.redirect_uris
  if (!Array.isArray(uris) || uris.length < 1 || uris.length > MAX_REDIRECTS || !uris.every(u => typeof u === 'string')) {
    return bad('invalid_redirect_uri', `redirect_uris ต้องเป็นรายการ 1–${MAX_REDIRECTS} ที่อยู่`)
  }
  const redirectUris = uris as string[]
  if (!redirectUris.every(u => validRedirect(u, [u]))) {
    return bad('invalid_redirect_uri', 'redirect_uri ต้องเป็น https (http ได้เฉพาะ localhost / 127.0.0.1)')
  }

  const rawName = meta.client_name
  if (rawName !== undefined && typeof rawName !== 'string') return bad('invalid_client_metadata', 'client_name ต้องเป็นข้อความ')
  const clientName = (rawName ?? '').trim() || 'MCP client'
  if (clientName.length > MAX_NAME) return bad('invalid_client_metadata', `client_name ยาวได้ไม่เกิน ${MAX_NAME} ตัวอักษร`)

  const clientId = randomToken()
  const { data, error } = await createServiceClient()
    .from('oauth_clients')
    .insert({ client_id: clientId, client_name: clientName, redirect_uris: redirectUris })
    .select('created_at')
    .single()
  if (error) return oauthJson({ error: 'server_error', error_description: 'ลงทะเบียนไม่สำเร็จ' }, 500)

  const issuedAt = data?.created_at ? new Date(data.created_at as string) : new Date()
  return oauthJson({
    client_id: clientId,
    client_name: clientName,
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: GRANT_TYPES,
    response_types: RESPONSE_TYPES,
    client_id_issued_at: Math.floor(issuedAt.getTime() / 1000),
  }, 201)
}

export function OPTIONS() {
  return oauthPreflight()
}
