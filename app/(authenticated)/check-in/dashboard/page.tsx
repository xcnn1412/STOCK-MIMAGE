import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLeavesInRange } from '../leave-actions'
import LeaveDashboardView from './leave-dashboard-view'

export const metadata = {
  title: 'Leave Dashboard',
  description: 'ภาพรวมการลา · ปฏิทิน · สถิติ',
}

export const revalidate = 0

export default async function LeaveDashboardPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user_id')?.value || ''

  if (!userId) redirect('/login')

  // Pre-fetch a 4-month window centered on today so calendar prev/next nav
  // doesn't immediately need to refetch. The view can request more on demand.
  const now = new Date()
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0)
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const leaves = await getLeavesInRange(fmt(from), fmt(to))

  return (
    <LeaveDashboardView
      initialLeaves={leaves}
      isAdmin={role === 'admin'}
      currentUserId={userId}
    />
  )
}
