import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

export const revalidate = 0

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value

  if (role !== 'admin') {
    redirect('/dashboard')
  }

  return <>{children}</>
}
