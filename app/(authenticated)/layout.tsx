import Sidebar from '@/components/sidebar'
import KpiLocaleWrapper from '@/components/kpi-locale-wrapper'
import SessionTimeout from '@/components/session-timeout'
import ProfileCompletionChecker from '@/components/profile-completion-checker'
import { getSessionLight } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await getSessionLight()

  // Fetch role, modules, and profile completeness from DB (single query)
  let role: string | undefined
  let allowedModules = ['stock']
  let missingFields: string[] = []

  if (userId) {
    const supabase = createServiceClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, allowed_modules, full_name, nickname, national_id, address, bank_name, bank_account_number, account_holder_name')
      .eq('id', userId)
      .single()

    const p = profile as Record<string, unknown> | null
    role = p?.role as string | undefined
    const modules = p?.allowed_modules
    if (modules && Array.isArray(modules)) {
      allowedModules = modules as string[]
    }

    // Check profile completeness
    if (p) {
      const checks: [string, boolean][] = [
        ['full_name', !!p.full_name],
        ['nickname', !!p.nickname],
        ['national_id', !!p.national_id && String(p.national_id).length === 13],
        ['address', !!p.address && String(p.address).length > 10],
        ['bank_name', !!p.bank_name],
        ['bank_account_number', !!p.bank_account_number],
        ['account_holder_name', !!p.account_holder_name],
      ]
      missingFields = checks.filter(([, ok]) => !ok).map(([k]) => k)
    }
  }

  // Admin always gets admin module access
  if (role === 'admin' && !allowedModules.includes('admin')) {
    allowedModules = [...allowedModules, 'admin']
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 w-full flex" suppressHydrationWarning>
      <Sidebar role={role} allowedModules={allowedModules} />
      <SessionTimeout />
      <div className="flex-1 flex flex-col min-h-screen min-w-0 pt-14 md:pt-0">
        <main className="flex-1 p-4 md:p-6 w-full">
          <ProfileCompletionChecker missingFields={missingFields} />
          <KpiLocaleWrapper>
            {children}
          </KpiLocaleWrapper>
        </main>
      </div>
    </div>
  )
}

