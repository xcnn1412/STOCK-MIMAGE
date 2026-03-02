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
  const [{ data }, categories] = await Promise.all([
    getClaims({ status: 'awaiting_payment' }),
    getFinanceCategories(),
  ])

  return (
    <PayoutDashboard
      claims={(data || []) as unknown as ExpenseClaim[]}
      categories={categories}
    />
  )
}
