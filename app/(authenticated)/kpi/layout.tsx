import { requireAuth } from '@/lib/auth'
import KpiNav from './kpi-nav'

export default async function KpiLayout({ children }: { children: React.ReactNode }) {
  const role = (await requireAuth())?.role
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-4">
      <KpiNav isAdmin={isAdmin} />
      {children}
    </div>
  )
}
