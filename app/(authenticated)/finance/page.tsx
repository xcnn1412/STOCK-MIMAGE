import { cookies } from 'next/headers'
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
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user_id')?.value || ''
  const isAdmin = role === 'admin'

  const [{ data, error }, categories, paidResult] = await Promise.all([
    getClaims(),
    getFinanceCategories(),
    isAdmin ? getClaims({ status: 'paid' }) : Promise.resolve({ data: [] }),
  ])

  return (
    <ClaimsListView
      claims={(data || []) as unknown as ExpenseClaim[]}
      error={error || null}
      categories={categories}
      isAdmin={isAdmin}
      userId={userId}
      paidClaims={((paidResult as any).data || []) as unknown as ExpenseClaim[]}
    />
  )
}
