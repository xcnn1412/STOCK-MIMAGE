import { cookies } from 'next/headers'
import FinanceNav from './finance-nav'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'

  return (
    <>
      <FinanceNav role={role} />
      <div className="mt-6">
        {children}
      </div>
    </>
  )
}
