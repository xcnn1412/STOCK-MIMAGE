import { redirect } from 'next/navigation'
import { getSession } from './session'
import { listMySlips } from './actions'
import SalaryView from './salary-view'

export const revalidate = 0

export const metadata = {
  title: 'สลิปของฉัน — เงินเดือน',
  description: 'สลิปเงินเดือนที่ปิดงวดแล้วของฉัน',
}

export default async function SalaryPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  const slips = await listMySlips()

  return <SalaryView slips={slips} isAdmin={session.role === 'admin'} />
}
