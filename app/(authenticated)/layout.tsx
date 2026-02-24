import Navbar from '@/components/navbar'
import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value
  const userId = cookieStore.get('session_user_id')?.value

  // Fetch user's allowed modules
  let allowedModules = ['stock']
  if (userId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('allowed_modules')
      .eq('id', userId)
      .single()
    
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
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 w-full overflow-x-hidden">
      <Navbar role={role} allowedModules={allowedModules} />
      <main className="p-4 md:p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  )
}
