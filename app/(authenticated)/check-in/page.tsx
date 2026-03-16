import { getTodayCheckins, getMyCheckinHistory, getTodayEvents, getStaffList } from './actions'
import { getJobEventsForSelect } from '../finance/actions'
import { cookies } from 'next/headers'
import CheckInView from './check-in-view'

export const revalidate = 0

export default async function CheckInPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value || ''
  const role = cookieStore.get('session_role')?.value || 'staff'

  const isAdmin = role === 'admin'

  const [todayCheckins, myHistory, todayEvents, allEvents, staffList] = await Promise.all([
    getTodayCheckins(),
    getMyCheckinHistory(7),
    getTodayEvents(),
    isAdmin ? getJobEventsForSelect() : Promise.resolve([]),
    isAdmin ? getStaffList() : Promise.resolve([]),
  ])

  return (
    <CheckInView
      todayCheckins={todayCheckins}
      myHistory={myHistory}
      todayEvents={todayEvents}
      allEvents={allEvents}
      staffList={staffList}
      userId={userId}
      role={role}
    />
  )
}
