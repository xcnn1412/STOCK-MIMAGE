import { notFound, redirect } from 'next/navigation'
import { DEPARTMENTS } from '@/lib/departments'
import { getSession } from '../../session'
import { getRun } from '../../actions'
import { listSalaryProfiles } from '../../settings/actions'
import RunView from './run-view'

export const revalidate = 0

export const metadata = {
  title: 'งวดคำนวณ — เงินเดือน',
  description: 'เลือกคนเข้างวด คำนวณสลิป และตรวจคำเตือนก่อนปิดงวด',
}

export default async function SalaryRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params

  const session = await getSession()
  if (!session.userId) redirect('/login')
  // proxy กันระดับโมดูลแล้ว แต่หน้านี้เป็น admin-only ในโมดูล จึงต้องตรวจซ้ำที่นี่
  if (session.role !== 'admin') redirect('/salary')

  const res = await getRun(runId)
  if ('error' in res) notFound()

  const people = await listSalaryProfiles()

  return (
    <RunView
      run={res.run}
      slips={res.slips}
      people={people}
      departments={DEPARTMENTS}
      suggestedUserIds={res.suggestedUserIds}
    />
  )
}
