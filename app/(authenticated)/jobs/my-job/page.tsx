import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
    getMyJobs,
    getMyTickets,
    getMyJobSettings,
    initMyJobDefaultSettings,
} from './actions'
import MyJobDashboard from './my-job-dashboard'

export default async function MyJobPage() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value

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
        <Suspense>
            <MyJobDashboard
                jobs={jobsResult.data || []}
                settings={settings}
                jobTypes={jobTypes}
                tickets={ticketsResult.data || []}
                ticketCategories={ticketCategories}
                showSettingsLink
            />
        </Suspense>
    )
}

