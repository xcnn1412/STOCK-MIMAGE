import { redirect } from 'next/navigation'
import { getFinanceCategories } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import { getOverviewRows, overviewRangeFromParams } from '../report-data'
import OverviewDashboard from './overview-dashboard'

export const revalidate = 0

export const metadata = {
  title: 'ภาพรวมการเงิน — Finance',
  description: 'Dashboard สรุปภาพรวมการจ่ายเงิน',
}

type Params = Record<string, string | string[] | undefined>

export default async function OverviewPage({ searchParams }: { searchParams?: Promise<Params> } = {}) {
  // หน้าของแอดมิน — ตรวจก่อนโหลดใบเบิก
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  if (!viewer.isAdmin) redirect('/finance')

  // ช่วงวันที่อยู่ใน URL (?preset&from&to — ค่าเริ่มต้นเดือนนี้ตามเวลาไทย) · โหลดเฉพาะใบในช่วงนั้นเป็นแถวแบบเบา
  const range = overviewRangeFromParams((await searchParams) ?? {})
  const [{ data, error }, categories] = await Promise.all([
    getOverviewRows(viewer, range),
    getFinanceCategories(),
  ])
  if (error) throw new Error(error)

  return (
    <OverviewDashboard
      rows={data}
      range={range}
      categories={categories}
    />
  )
}
