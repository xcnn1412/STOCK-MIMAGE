import { redirect } from 'next/navigation'
import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import ArchiveList from './archive-list'
import type { ExpenseClaim } from '../../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'คลังเก็บ — Finance',
  description: 'คลังเก็บใบเบิกที่ชำระเงินแล้ว',
}

export default async function ArchivePage() {
  // พนักงานเข้าได้ (ดูใบที่จ่ายแล้วของตัวเอง — getClaims กรองตามผู้เบิกให้เอง)
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')

  const [{ data }, categories] = await Promise.all([
    getClaims({ status: ['paid', 'refund_confirmed'] }),
    getFinanceCategories(),
  ])

  return (
    <ArchiveList
      claims={(data || []) as unknown as ExpenseClaim[]}
      categories={categories}
    />
  )
}
