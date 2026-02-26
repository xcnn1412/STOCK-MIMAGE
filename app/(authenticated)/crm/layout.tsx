import { cookies } from 'next/headers'
import CrmNav from './crm-nav'

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'

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
