import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
    getJobs, getJobSettings, getSystemUsers, getJobTypes,
    getTickets, getTicketCategories,
} from '../actions'
import AdminJobDashboard from './admin-job-dashboard'

interface AdminJobPageProps {
    searchParams: Promise<{ user?: string }>
}

export default async function AdminJobPage({ searchParams }: AdminJobPageProps) {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    if (role !== 'admin') redirect('/jobs/my-job')

    const params = await searchParams
    const selectedUserId = params.user

    const [jobsResult, settingsResult, users, jobTypesResult, ticketsResult, ticketCategoriesResult] = await Promise.all([
        getJobs(),
        getJobSettings(),
        getSystemUsers(),
        getJobTypes(),
        getTickets(),
        getTicketCategories(),
    ])

    const allJobs = jobsResult.data || []
    const allTickets = ticketsResult.data || []

    // Filter to selected user's jobs/tickets (empty if no user selected)
    const userJobs = selectedUserId
        ? allJobs.filter(j =>
            j.created_by === selectedUserId || (j.assigned_to || []).includes(selectedUserId)
          )
        : []
    const userTickets = selectedUserId
        ? allTickets.filter(t =>
            t.created_by === selectedUserId || (t.assigned_to || []).includes(selectedUserId)
          )
        : []

    return (
        <Suspense>
            <AdminJobDashboard
                users={users}
                selectedUserId={selectedUserId}
                jobs={userJobs}
                settings={settingsResult.data || []}
                jobTypes={jobTypesResult.data || []}
                tickets={userTickets}
                ticketCategories={ticketCategoriesResult.data || []}
            />
        </Suspense>
    )
}
