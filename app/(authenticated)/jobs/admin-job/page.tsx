import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getSystemUsers } from '../actions'
import { getMyJobs, getMyTickets, getMyJobSettings } from '../my-job/actions'
import AdminJobDashboard from './admin-job-dashboard'
import JobsLoading from '../loading'

interface AdminJobPageProps {
    searchParams: Promise<{ user?: string }>
}

export default async function AdminJobPage({ searchParams }: AdminJobPageProps) {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value
    const currentUserId = cookieStore.get('session_user_id')?.value

    if (role !== 'admin') redirect('/jobs/my-job')

    const params = await searchParams
    const selectedUserId = params.user

    const users = await getSystemUsers()

    const [jobsResult, ticketsResult, settingsResult] = selectedUserId
        ? await Promise.all([
            getMyJobs(selectedUserId),
            getMyTickets(selectedUserId),
            getMyJobSettings(selectedUserId),
          ])
        : [{ data: [] }, { data: [] }, { data: [] }]

    const settings         = settingsResult.data || []
    const jobTypes         = settings.filter(s => s.category === 'job_type' && s.is_active)
    const ticketCategories = settings.filter(s => s.category === 'ticket_category' && s.is_active)

    return (
        <Suspense fallback={<JobsLoading />}>
            <AdminJobDashboard
                users={users}
                selectedUserId={selectedUserId}
                jobs={jobsResult.data || []}
                settings={settings}
                jobTypes={jobTypes}
                tickets={ticketsResult.data || []}
                ticketCategories={ticketCategories}
                currentUserId={currentUserId}
            />
        </Suspense>
    )
}
