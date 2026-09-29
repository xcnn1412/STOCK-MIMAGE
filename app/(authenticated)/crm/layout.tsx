import { requireAuth } from '@/lib/auth'
import CrmNav from './crm-nav'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const role = (await requireAuth())?.role ?? 'staff'

  return (
    <>
      {/* Nav stays within parent max-w constraints */}
      <CrmNav role={role} />
      {/* Children break out of max-w-7xl via their own styling */}
      <div className="mt-6">
        {children}
      </div>
    </>
  )
}
