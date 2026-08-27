import { redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { getContinuityReport, getSeriesList } from './actions'
import ReportsView from './reports-view'

export const revalidate = 0

export const metadata = {
  title: 'รายงานเลขต่อเนื่อง — Document Control',
  description: 'ตรวจเลขที่เอกสารว่าไม่ข้าม ไม่ซ้ำ ก่อนส่งบัญชี',
}

export default async function DocumentReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ brand?: string; type?: string; period?: string }>
}) {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  if (session.role !== 'admin') redirect('/documents')

  const sp = await searchParams

  const selected =
    sp.brand && sp.type && sp.period
      ? { brand_code: sp.brand, doc_type: sp.type, period: sp.period }
      : null

  // สอง query ไม่ขึ้นต่อกัน — ยิงขนานกันแทนที่จะรอทีละอัน
  const [series, report] = await Promise.all([
    getSeriesList(),
    selected ? getContinuityReport(selected) : Promise.resolve(null),
  ])

  return (
    <ReportsView
      series={series}
      brand={sp.brand || ''}
      type={sp.type || ''}
      period={sp.period || ''}
      report={report}
    />
  )
}
