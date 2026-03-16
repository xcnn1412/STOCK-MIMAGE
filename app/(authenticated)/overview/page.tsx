import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getOverviewData } from './actions'
import OverviewView from './overview-view'

export const metadata = {
  title: 'Overview — Event Dashboard',
  description: 'ภาพรวมอีเวนต์ทั้งหมด สรุปรายรับ ต้นทุน กำไร',
}

export const revalidate = 0

export default async function OverviewPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'

  if (role !== 'admin') redirect('/dashboard')

  const data = await getOverviewData()
  if (!data) redirect('/dashboard')

  return <OverviewView data={data as any} />
}
