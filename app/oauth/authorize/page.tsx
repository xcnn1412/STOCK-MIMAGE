import type { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { requireAuth } from '@/lib/auth'
import { checkAuthorizeRequest, modulesFor, type AuthorizeParams } from '@/lib/oauth'
import { createServiceClient } from '@/lib/supabase-server'
import ConsentView, { type ExistingConnection } from './consent-view'

export const revalidate = 0

// หน้าอนุญาตให้ Claude เข้าถึงข้อมูล (OAuth authorize) — อยู่นอก (authenticated) จึงไม่มี sidebar
// proxy บังคับล็อกอินให้แล้ว (ไม่ได้ล็อกอิน → /login?next=… แล้วกลับมาที่นี่)

type Search = Record<string, string | string[] | undefined>
const one = (v: string | string[] | undefined) => (typeof v === 'string' ? v : '')

const MODULE_LABEL: Record<string, string> = { stock: 'สต็อก', events: 'อีเวนต์', jobs: 'ติดตามงาน' }

export default async function AuthorizePage(props: { searchParams: Promise<Search> }) {
  const sp = await props.searchParams
  const params: AuthorizeParams = {
    clientId: one(sp.client_id),
    redirectUri: one(sp.redirect_uri),
    responseType: one(sp.response_type),
    codeChallenge: one(sp.code_challenge),
    codeChallengeMethod: one(sp.code_challenge_method),
    state: one(sp.state),
    scope: one(sp.scope),
    resource: one(sp.resource),
  }

  const auth = await requireAuth()
  if (!auth) {
    const query = new URLSearchParams()
    for (const [k, v] of Object.entries(sp)) if (typeof v === 'string') query.set(k, v)
    redirect(`/login?next=${encodeURIComponent(`/oauth/authorize?${query.toString()}`)}`)
  }

  const db = createServiceClient()
  const check = await checkAuthorizeRequest(db, params)

  if (!check.ok) {
    return (
      <Shell>
        <Card className="w-full max-w-md shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <AlertCircle className="h-5 w-5 text-red-500" /> เชื่อมต่อไม่ได้
            </CardTitle>
            <CardDescription>คำขอเชื่อมต่อนี้ไม่ถูกต้อง ระบบจึงไม่ส่งข้อมูลใดๆ กลับไป</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="rounded-md bg-red-50 p-3 text-red-700 dark:bg-red-950/40 dark:text-red-300">{check.error}</p>
            <p className="text-zinc-500">ปิดหน้านี้ แล้วลองเพิ่มการเชื่อมต่อใหม่จาก Claude อีกครั้ง</p>
          </CardContent>
        </Card>
      </Shell>
    )
  }

  const [{ data: profile }, { data: tokens }] = await Promise.all([
    db.from('profiles').select('allowed_modules').eq('id', auth.userId).maybeSingle(),
    db
      .from('oauth_tokens')
      .select('id, client_name, created_at, last_used_at')
      .eq('user_id', auth.userId)
      .is('revoked_at', null)
      .gt('refresh_expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(20),
  ])
  const modules = modulesFor({ role: auth.role, allowed_modules: (profile?.allowed_modules as string[] | null) ?? null })
  const connections: ExistingConnection[] = (tokens ?? []).map(t => ({
    id: t.id as string,
    clientName: (t.client_name as string | null) || 'MCP client',
    createdAt: t.created_at as string,
    lastUsedAt: (t.last_used_at as string | null) ?? null,
  }))

  return (
    <Shell>
      <ConsentView
        params={params}
        clientName={check.clientName}
        userName={auth.nickname || auth.fullName || 'ผู้ใช้'}
        modules={modules.map(m => MODULE_LABEL[m] ?? m)}
        connections={connections}
      />
    </Shell>
  )
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 p-4 dark:bg-zinc-900">
      {children}
    </div>
  )
}
