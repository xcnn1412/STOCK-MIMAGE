import { GET as resourceMetadata, OPTIONS as resourcePreflight } from '../../route'

// RFC 9728 แบบต่อท้าย path ของ resource (/api/mcp) — เอกสารเดียวกับ /.well-known/oauth-protected-resource
export async function GET() {
  return resourceMetadata()
}

export function OPTIONS() {
  return resourcePreflight()
}
