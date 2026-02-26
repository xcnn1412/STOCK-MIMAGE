import { getClaims } from './actions'
import ClaimsListView from './claims-list-view'
import type { ExpenseClaim } from '../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'เบิกเงิน — Finance',
  description: 'ระบบเบิกเงินและใบเบิกค่าใช้จ่าย',
}

export default async function FinancePage() {
  const { data, error } = await getClaims()

  return (
    <ClaimsListView
      claims={(data || []) as unknown as ExpenseClaim[]}
      error={error || null}
    />
  )
}
