import { getLicenseStatus } from '@/lib/license'
import { licenseExpiredResponse, oauthJson, oauthPreflight, MCP_SCOPE } from '@/lib/oauth'
import { requestOrigin } from '@/lib/request-origin'

// RFC 8414 — Claude อ่านหน้านี้เพื่อรู้ว่าจะลงทะเบียน / ขออนุญาต / ขอ token ที่ไหน
export async function GET() {
  if (getLicenseStatus().expired) return licenseExpiredResponse()
  const origin = await requestOrigin()
  return oauthJson({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    revocation_endpoint: `${origin}/api/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post'],
    scopes_supported: [MCP_SCOPE],
  })
}

export function OPTIONS() {
  return oauthPreflight()
}
