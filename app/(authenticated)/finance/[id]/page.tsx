import { getClaim, getClaimLogs, getJobEventsForSelect, getPettyCashChildren } from '../actions'
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

  const [{ data, error }, categories, logs, jobEvents] = await Promise.all([
    getClaim(id),
    getFinanceCategories(),
    getClaimLogs(id),
    getJobEventsForSelect(),
  ])
  if (!data || error) notFound()

  // Petty-cash FUND → also load its children (box expenses + top-ups)
  const claim = data as unknown as ExpenseClaim
  const isPettyFund = claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id
  const pettyChildren = isPettyFund ? await getPettyCashChildren(id) : null

  return <ClaimDetailView claim={claim} role={role} categories={categories} logs={logs} userId={userId} jobEvents={jobEvents} pettyChildren={pettyChildren as any} />
}
