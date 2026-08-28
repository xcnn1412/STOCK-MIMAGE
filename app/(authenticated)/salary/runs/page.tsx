import { redirect } from 'next/navigation'
import { getSession } from '../session'
import { getRunSuggestions, listOverdueUnpaidCheckins, listRuns } from '../actions'
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
  // ข้อเสนอ + เช็คอินค้างเกินหน้าต่างเก็บตก = แบนเนอร์/กล่องเตือนบนสุดของหน้า
  const [runs, settings, suggestions, overdue] = await Promise.all([
    listRuns(),
    getSalarySettings(),
    getRunSuggestions(),
    listOverdueUnpaidCheckins(),
  ])

  return (
    <RunsView
      runs={runs}
      cutoffDay={settings.cutoff_day}
      suggestions={suggestions}
      overdue={overdue}
    />
  )
}
