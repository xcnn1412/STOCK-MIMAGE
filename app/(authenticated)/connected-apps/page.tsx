import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import ConnectedAppsView, { type ConnectionRow } from './connected-apps-view'

export const revalidate = 0

export const metadata = {
  title: 'แอปที่เชื่อมต่อ — Connected apps',
}

// หน้ารายการการเชื่อมต่อ Claude (MCP) ที่ยังใช้งานได้
// ทุก user ที่ล็อกอินเข้าได้ (ไม่อยู่ใน MODULE_ROUTES) — คนทั่วไปเห็นของตัวเอง, admin เห็นทุกคน
export default async function ConnectedAppsPage() {
  const auth = await requireAuth()
  if (!auth) redirect('/login?next=/connected-apps')

  const isAdmin = auth.role === 'admin'
  const db = createServiceClient()

  let query = db
    .from('oauth_tokens')
    .select('id, user_id, client_name, created_at, last_used_at, refresh_expires_at, profiles:user_id(full_name, nickname)')
    .is('revoked_at', null)
    .gt('refresh_expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
  if (!isAdmin) query = query.eq('user_id', auth.userId)

  const { data } = await query

  const connections: ConnectionRow[] = (data ?? []).map(r => {
    // join ของ supabase-js ถูกพิมพ์เป็น array — ใช้แถวแรก (user_id → profiles เป็นแบบหนึ่งต่อหนึ่ง)
    const p: { full_name: string | null; nickname: string | null } | undefined =
      Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
    return {
      id: r.id,
      clientName: r.client_name || 'MCP client',
      createdAt: r.created_at,
      lastUsedAt: r.last_used_at,
      expiresAt: r.refresh_expires_at,
      ownerName: isAdmin ? (p?.nickname || p?.full_name || 'ไม่ทราบชื่อ') : null,
    }
  })

  return <ConnectedAppsView connections={connections} isAdmin={isAdmin} />
}
