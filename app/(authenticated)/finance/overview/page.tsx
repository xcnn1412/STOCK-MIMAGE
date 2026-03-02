import { getClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import OverviewDashboard from './overview-dashboard'
import type { ExpenseClaim } from '../../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'ภาพรวมการเงิน — Finance',
  description: 'Dashboard สรุปภาพรวมการจ่ายเงิน',
}

export default async function OverviewPage() {
  // Fetch all claims (all statuses) for the overview
  const [{ data }, categories] = await Promise.all([
    getClaims(),
    getFinanceCategories(),
  ])

  return (
    <OverviewDashboard
      claims={(data || []) as unknown as ExpenseClaim[]}
      categories={categories}
    />
  )
}
