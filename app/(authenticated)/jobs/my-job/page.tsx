import { Suspense } from 'react'
import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import {
    getMyJobs,
    getMyTickets,
    getMyJobSettings,
    initMyJobDefaultSettings,
} from './actions'
import MyJobDashboard from './my-job-dashboard'
import JobsLoading from '../loading'

export default async function MyJobPage() {
    const session = await requireAuth()
    const userId = session?.userId
    const role   = session?.role

    if (!userId) redirect('/login')

    // Auto-initialize settings on first visit
    await initMyJobDefaultSettings()

    const [jobsResult, ticketsResult, settingsResult] = await Promise.all([
        getMyJobs(),
        getMyTickets(),
        getMyJobSettings(),
    ])

    const settings         = settingsResult.data || []
    const jobTypes         = settings.filter(s => s.category === 'job_type' && s.is_active)
    const ticketCategories = settings.filter(s => s.category === 'ticket_category' && s.is_active)

    return (
        <Suspense fallback={<JobsLoading />}>
            <MyJobDashboard
                jobs={jobsResult.data || []}
                settings={settings}
                jobTypes={jobTypes}
                tickets={ticketsResult.data || []}
                ticketCategories={ticketCategories}
                showSettingsLink
                currentUserId={userId}
                isAdmin={role === 'admin'}
            />
        </Suspense>
    )
}

