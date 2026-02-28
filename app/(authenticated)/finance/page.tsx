import { getClaims } from './actions'
import { getFinanceCategories } from './settings-actions'
import ClaimsListView from './claims-list-view'
import type { ExpenseClaim } from '../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'เบิกเงิน — Finance',
  description: 'ระบบเบิกเงินและใบเบิกค่าใช้จ่าย',
}

export default async function FinancePage() {
  const [{ data, error }, categories] = await Promise.all([
    getClaims(),
    getFinanceCategories(),
  ])

  return (
    <ClaimsListView
      claims={(data || []) as unknown as ExpenseClaim[]}
      error={error || null}
      categories={categories}
    />
  )
}
