import { notFound } from 'next/navigation'
import { getLead, getActivities, getCrmSettings, getSystemUsers, getLeadInstallments, getLeadEventStaff, getLeadEvents, getLeadCostSummary } from '../actions'
import { getJobsByLeadId } from '../../jobs/actions'
import LeadDetail from './lead-detail'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { loadPickerContext } from '../../packages/capacity-data'
import { canEditLeadPackages } from '../../packages/package-logic'
import type { CrmLead, CrmSetting } from '../types'
import type { LeadActivity, SystemUser } from './shared'

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
  const [leadResult, activitiesResult, settingsResult, usersResult, installments, eventStaffGroups, eventsResult, costSummary, leadJobs, picker] = await Promise.all([
    getLead(id),
    getActivities(id),
    getCrmSettings(),
    getSystemUsers(),
    getLeadInstallments(id),
    getLeadEventStaff(id),
    getLeadEvents(id),
    getLeadCostSummary(id),
    // ใบงานของงานนี้ — ปุ่ม "เปิดใบงานกราฟิก" โผล่เฉพาะตอนยังไม่มีใบงานกราฟิก
    getJobsByLeadId(id),
    // แพ็กเกจของงาน + ตัวเลือก + คำเตือนอุปกรณ์อาจไม่พอ (PackagePicker ในการ์ดลูกค้า) — ยังไม่ migrate/พัง = ว่าง
    loadPickerContext(createServiceClient(), [id]),
  ])
  const session = await requireAuth()

  if (!leadResult.data) notFound()
  const lead = leadResult.data as CrmLead
  const canEditPackages = canEditLeadPackages(
    { userId: session?.userId, isAdmin: session?.role === 'admin', department: session?.department },
    lead.created_by,
  )

  return (
    <LeadDetail
      lead={lead}
      activities={(activitiesResult.data || []) as LeadActivity[]}
      settings={(settingsResult.data || []) as CrmSetting[]}
      users={(usersResult.data || []) as SystemUser[]}
      installments={installments}
      eventStaffGroups={eventStaffGroups}
      linkedEvents={eventsResult.data || []}
      costSummary={costSummary}
      leadJobs={leadJobs}
      role={session?.role}
      packagePicker={{
        value: picker.leadPackages[id] ?? [],
        packages: picker.packages,
        categoryUnits: picker.salesPickUnits,
        unitBookings: picker.unitBookings,
        warnings: picker.capacityWarnings[id] ?? [],
        canEdit: canEditPackages,
      }}
    />
  )
}
