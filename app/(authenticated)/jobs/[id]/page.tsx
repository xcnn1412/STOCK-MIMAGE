import { notFound } from 'next/navigation'
import { getJob, getJobActivities, getJobSettings, getSystemUsers, getChecklistTemplates, getJobChecklists, getJobTypes, getJobsByLeadId } from '../actions'
import { getLead, getLeadInstallments, getCrmSettings, getLeadEventStaff } from '../../crm/actions'
import type { CrmLead, CrmSetting } from '../../crm/types'
import { requireAuth } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import { loadPickerContext } from '../../packages/capacity-data'
import { canEditLeadPackages } from '../../packages/package-logic'
import JobDetail, { type JobCrmData } from './job-detail'

// ข้อมูล lead ชุดเดียวกับหน้า /crm/[id] (การ์ดลูกค้า/อีเวนต์/การเงิน + ทีมงานตามอีเวนต์ + แพ็กเกจ)
async function loadCrmForJob(leadId: string): Promise<JobCrmData | null> {
    const [leadResult, settingsResult, installments, eventStaffGroups, picker, session] = await Promise.all([
        getLead(leadId),
        getCrmSettings(),
        getLeadInstallments(leadId),
        getLeadEventStaff(leadId),
        loadPickerContext(createServiceClient(), [leadId]),
        requireAuth(),
    ])
    if (!leadResult.data) return null
    const lead = leadResult.data as CrmLead
    const canEdit = canEditLeadPackages(
        { userId: session?.userId, isAdmin: session?.role === 'admin', department: session?.department },
        lead.created_by,
    )
    return {
        lead,
        settings: (settingsResult.data || []) as CrmSetting[],
        installments,
        eventStaffGroups,
        packagePicker: {
            value: picker.leadPackages[leadId] ?? [],
            packages: picker.packages,
            categoryUnits: picker.salesPickUnits,
            unitBookings: picker.unitBookings,
            warnings: picker.capacityWarnings[leadId] ?? [],
            canEdit,
        },
    }
}

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const [jobResult, activitiesResult, settingsResult, users, templatesResult, checklistItemsResult, jobTypesResult] = await Promise.all([
        getJob(id),
        getJobActivities(id),
        getJobSettings(),
        getSystemUsers(),
        getChecklistTemplates(),
        getJobChecklists(id),
        getJobTypes(),
    ])

    if (!jobResult.data) return notFound()

    // Fetch CRM lead data + sibling jobs if job is linked to a CRM lead
    const crm = jobResult.data.crm_lead_id
        ? await loadCrmForJob(jobResult.data.crm_lead_id)
        : null

    const siblingJobs = jobResult.data.crm_lead_id
        ? await getJobsByLeadId(jobResult.data.crm_lead_id)
        : []

    return (
        <JobDetail
            job={jobResult.data}
            activities={activitiesResult.data || []}
            settings={settingsResult.data || []}
            users={users}
            crm={crm}
            checklistTemplates={templatesResult.data || []}
            checklistItems={checklistItemsResult.data || []}
            jobTypes={jobTypesResult.data || []}
            siblingJobs={siblingJobs}
        />
    )
}
