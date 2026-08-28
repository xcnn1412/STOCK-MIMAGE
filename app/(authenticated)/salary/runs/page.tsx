import { redirect } from 'next/navigation'
import { getSession } from '../session'
import { listRuns } from '../actions'
import RunsView from './runs-view'

export const revalidate = 0

export const metadata = {
  title: 'งวดคำนวณ — เงินเดือน',
  description: 'งวดเงินเดือนที่เปิดไว้และจำนวนสลิปแต่ละสถานะ',
}

export default async function SalaryRunsPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  // proxy กันระดับโมดูลแล้ว แต่หน้านี้เป็น admin-only ในโมดูล จึงต้องตรวจซ้ำที่นี่
  if (session.role !== 'admin') redirect('/salary')

  const runs = await listRuns()

  return <RunsView runs={runs} />
}
