import { cookies } from 'next/headers'
import CostsNav from './costs-nav'

export default async function CostsLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  return (
    <div className="space-y-4">
      <CostsNav isAdmin={isAdmin} />
      {children}
    </div>
  )
}
