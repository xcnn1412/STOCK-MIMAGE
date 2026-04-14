import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import PayoutDashboard from './payout-dashboard'
import type { ExpenseClaim } from '../../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'สรุปยอดจ่าย — Finance',
  description: 'สรุปยอดโอนเงินสำหรับใบเบิกที่อนุมัติแล้ว',
}

export default async function PayoutsPage() {
  // Fetch all payable statuses: approved (new), awaiting_payment (legacy), pending_month_end
  const [{ data: approvedData }, { data: legacyData }, { data: monthEndData }, categories] = await Promise.all([
    getClaims({ status: 'approved' }),
    getClaims({ status: 'awaiting_payment' }),
    getClaims({ status: 'pending_month_end' }),
    getFinanceCategories(),
  ])

  const claims = [
    ...((approvedData || []) as unknown as ExpenseClaim[]),
    ...((legacyData || []) as unknown as ExpenseClaim[]),
    ...((monthEndData || []) as unknown as ExpenseClaim[]),
  ]

  return (
    <PayoutDashboard
      claims={claims}
      categories={categories}
    />
  )
}
