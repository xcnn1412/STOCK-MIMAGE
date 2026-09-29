import { requireAuth } from '@/lib/auth'
import CostsNav from './costs-nav'

export default async function CostsLayout({ children }: { children: React.ReactNode }) {
  const role = (await requireAuth())?.role
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-4">
      <CostsNav isAdmin={isAdmin} />
      {children}
    </div>
  )
}
