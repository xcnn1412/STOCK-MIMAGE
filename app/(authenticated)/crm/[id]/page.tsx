import { notFound } from 'next/navigation'
import { getLead, getActivities, getCrmSettings, getSystemUsers, getLeadInstallments } from '../actions'
import LeadDetail from './lead-detail'

interface PageProps {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { id } = await params
  const { data: lead } = await getLead(id)
  return {
    title: lead ? `${lead.customer_name} — CRM` : 'Lead Detail',
  }
}

export default async function LeadDetailPage({ params }: PageProps) {
  const { id } = await params
  const [leadResult, activitiesResult, settingsResult, usersResult, installments] = await Promise.all([
    getLead(id),
    getActivities(id),
    getCrmSettings(),
    getSystemUsers(),
    getLeadInstallments(id),
  ])

  if (!leadResult.data) notFound()

  return (
    <LeadDetail
      lead={leadResult.data as any}
      activities={activitiesResult.data as any[] || []}
      settings={settingsResult.data as any[] || []}
      users={usersResult.data as any[] || []}
      installments={installments}
    />
  )
}
