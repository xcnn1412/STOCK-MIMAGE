import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const role = (await requireAuth())?.role

  if (role !== 'admin') {
    redirect('/dashboard')
  }

  return <>{children}</>
}
