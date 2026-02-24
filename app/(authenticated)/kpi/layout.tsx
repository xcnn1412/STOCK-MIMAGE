import { cookies } from 'next/headers'
import KpiNav from './kpi-nav'

export default async function KpiLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-4">
      <KpiNav isAdmin={isAdmin} />
      {children}
    </div>
  )
}
