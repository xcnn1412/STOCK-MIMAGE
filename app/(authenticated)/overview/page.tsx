import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getOverviewData } from './actions'
import OverviewView from './overview-view'

export const metadata = {
  title: 'Overview — Event Dashboard',
  description: 'ภาพรวมอีเวนต์ทั้งหมด สรุปรายรับ ต้นทุน กำไร',
}

export const revalidate = 0

export default async function OverviewPage() {
  const session = await requireAuth()
  const role = session?.role ?? 'staff'

  if (role !== 'admin') redirect('/dashboard')

  const data = await getOverviewData()
  if (!data) redirect('/dashboard')

  return <OverviewView data={data as any} />
}
