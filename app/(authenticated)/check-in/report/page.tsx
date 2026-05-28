import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCheckinReportData } from '../actions'
import { getJobEventsForSelect } from '../../finance/actions'
import CheckinReportView from './report-view'

export const metadata = {
  title: 'รายงาน Check-in',
  description: 'สรุปรายงานการเข้างาน',
}

export const revalidate = 0

export default async function CheckinReportPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user_id')?.value
  if (!userId) redirect('/login')
  const isAdmin = role === 'admin'

  // Default: current month
  const now = new Date()
  const bangkokNow = new Date(now.getTime() + 7 * 60 * 60 * 1000)
  const year = bangkokNow.getFullYear()
  const month = String(bangkokNow.getMonth() + 1).padStart(2, '0')
  const startDate = `${year}-${month}-01`
  const lastDay = new Date(year, bangkokNow.getMonth() + 1, 0).getDate()
  const endDate = `${year}-${month}-${String(lastDay).padStart(2, '0')}`

  const [data, allEvents] = await Promise.all([
    getCheckinReportData(startDate, endDate),
    getJobEventsForSelect(),
  ])

  return (
    <CheckinReportView
      initialRecords={data.records as any[]}
      staff={data.staff as any[]}
      allEvents={allEvents}
      defaultStart={startDate}
      defaultEnd={endDate}
      isAdmin={isAdmin}
      currentUserId={userId}
    />
  )
}
