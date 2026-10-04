import { getLicenseStatus } from '@/lib/license'
import { licenseExpiredResponse, oauthJson, oauthPreflight, MCP_SCOPE } from '@/lib/oauth'
import { requestOrigin } from '@/lib/request-origin'

// RFC 9728 — /api/mcp ตอบ 401 ชี้มาที่นี่ · บอกว่าใครเป็นผู้ออก token (แอปนี้เอง)
export async function GET() {
  if (getLicenseStatus().expired) return licenseExpiredResponse()
  const origin = await requestOrigin()
  return oauthJson({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ['header'],
  })
}

export function OPTIONS() {
  return oauthPreflight()
}
