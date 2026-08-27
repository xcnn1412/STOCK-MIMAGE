import { redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { getDocumentsDashboard } from './actions'
import DashboardView from './dashboard-view'

export const revalidate = 0

export const metadata = {
  title: 'แดชบอร์ดเอกสาร — Document Control',
  description: 'ค้างอนุมัติ · ออกเลขเดือนนี้ · ยอดตามประเภท · เวลาอนุมัติเฉลี่ย',
}

export default async function DocumentsDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>
}) {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  // ไม่มี ?month= → action ใช้เดือนปัจจุบัน (Asia/Bangkok) เป็นค่าเริ่มต้น
  const sp = await searchParams
  const result = await getDocumentsDashboard({ month: sp.month })

  if ('error' in result) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">{result.error}</p>
      </div>
    )
  }

  return <DashboardView data={result} />
}
