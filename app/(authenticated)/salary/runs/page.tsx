import { redirect } from 'next/navigation'
import { getSession } from '../session'
import { getRunSuggestions, listRuns, listUnpaidPreviousPeriods } from '../actions'
import { getSalarySettings } from '../settings/actions'
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

  // วันตัดรอบส่งไปให้ dialog "เปิดงวด" พรีวิวช่วงวันที่ก่อนกดยืนยัน
  // ข้อเสนอ + งานงวดก่อนที่ยังไม่ถูกจ่าย = แบนเนอร์/กล่องเตือนบนสุดของหน้า
  const [runs, settings, suggestions, unpaid] = await Promise.all([
    listRuns(),
    getSalarySettings(),
    getRunSuggestions(),
    listUnpaidPreviousPeriods(),
  ])

  return (
    <RunsView
      runs={runs}
      cutoffDay={settings.cutoff_day}
      suggestions={suggestions}
      unpaid={unpaid}
    />
  )
}
