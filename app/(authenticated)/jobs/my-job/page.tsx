import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
    getJobs, getJobSettings, getSystemUsers, getJobTypes,
    getTickets, getTicketCategories,
} from '../actions'
import MyJobDashboard from './my-job-dashboard'

export default async function MyJobPage() {
    const cookieStore = await cookies()
    const userId = cookieStore.get('session_user_id')?.value

    if (!userId) redirect('/login')

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

    // Filter to jobs/tickets where the current user is creator or assignee
    const myJobs = allJobs.filter(j =>
        j.created_by === userId || (j.assigned_to || []).includes(userId)
    )
    const myTickets = allTickets.filter(t =>
        t.created_by === userId || (t.assigned_to || []).includes(userId)
    )

    return (
        <Suspense>
            <MyJobDashboard
                jobs={myJobs}
                settings={settingsResult.data || []}
                users={users}
                jobTypes={jobTypesResult.data || []}
                tickets={myTickets}
                ticketCategories={ticketCategoriesResult.data || []}
            />
        </Suspense>
    )
}
