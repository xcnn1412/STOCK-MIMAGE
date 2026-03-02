import { notFound } from 'next/navigation'
import { getJob, getJobActivities, getJobSettings, getSystemUsers, getCrmLeadForJob } from '../actions'
import JobDetail from './job-detail'

export default async function JobDetailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const [jobResult, activitiesResult, settingsResult, users] = await Promise.all([
        getJob(id),
        getJobActivities(id),
        getJobSettings(),
        getSystemUsers(),
    ])

    if (!jobResult.data) return notFound()

    // Fetch CRM lead data if job is linked to a CRM lead
    const crmData = jobResult.data.crm_lead_id
        ? await getCrmLeadForJob(jobResult.data.crm_lead_id)
        : null

    return (
        <JobDetail
            job={jobResult.data}
            activities={activitiesResult.data || []}
            settings={settingsResult.data || []}
            users={users}
            crmData={crmData}
        />
    )
}
