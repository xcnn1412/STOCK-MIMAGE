import { getClaim, getClaimLogs } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import { notFound } from 'next/navigation'
import ClaimDetailView from './claim-detail-view'
import { cookies } from 'next/headers'
import type { ExpenseClaim } from '../../costs/types'

export const revalidate = 0

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user_id')?.value || ''

  const [{ data, error }, categories, logs] = await Promise.all([
    getClaim(id),
    getFinanceCategories(),
    getClaimLogs(id),
  ])
  if (!data || error) notFound()

  return <ClaimDetailView claim={data as unknown as ExpenseClaim} role={role} categories={categories} logs={logs} userId={userId} />
}
