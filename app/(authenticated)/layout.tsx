import Navbar from '@/components/navbar'
import KpiLocaleWrapper from '@/components/kpi-locale-wrapper'
import SessionTimeout from '@/components/session-timeout'
import { getSessionLight } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await getSessionLight()

  // Fetch role and modules from DB (single query — source of truth)
  let role: string | undefined
  let allowedModules = ['stock']

  if (userId) {
    const supabase = createServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, allowed_modules')
      .eq('id', userId)
      .single()

    role = (profile as Record<string, unknown> | null)?.role as string | undefined
    const modules = (profile as Record<string, unknown> | null)?.allowed_modules
    if (modules && Array.isArray(modules)) {
      allowedModules = modules as string[]
    }
  }

  // Admin always gets admin module access
  if (role === 'admin' && !allowedModules.includes('admin')) {
    allowedModules = [...allowedModules, 'admin']
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 w-full" suppressHydrationWarning>
      <Navbar role={role} allowedModules={allowedModules} />
      <SessionTimeout />
      <main className="p-4 md:p-6 max-w-7xl mx-auto w-full">
        <KpiLocaleWrapper>
          {children}
        </KpiLocaleWrapper>
      </main>
    </div>
  )
}
