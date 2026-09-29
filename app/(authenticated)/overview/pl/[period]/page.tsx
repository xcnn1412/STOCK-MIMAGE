import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getOverviewData } from '../../actions'
import PLDetailView from './detail-view'

export const revalidate = 0

export default async function PLDetailPage({ params }: { params: Promise<{ period: string }> }) {
  const { period: raw } = await params
  const period = decodeURIComponent(raw)

  const role = (await requireAuth())?.role ?? 'staff'
  if (role !== 'admin') redirect('/dashboard')

  const data = await getOverviewData()
  if (!data) redirect('/dashboard')

  return <PLDetailView period={period} leads={data.leads} claims={data.expenseClaims} installments={data.leadInstallments} />
}
