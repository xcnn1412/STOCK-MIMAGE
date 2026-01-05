import Navbar from '@/components/navbar'
import { cookies } from 'next/headers'

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <Navbar role={role} />
      <main className="p-4 md:p-6 max-w-7xl mx-auto">
        {children}
      </main>
    </div>
  )
}
