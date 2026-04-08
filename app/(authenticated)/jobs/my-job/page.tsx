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
    const role = cookieStore.get('session_role')?.value

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

    // Filter to only this user's jobs and tickets
    const myJobs = allJobs.filter(j =>
        j.created_by === userId || (j.assigned_to || []).includes(userId)
    )
    const myTickets = allTickets.filter(t =>
        t.created_by === userId || (t.assigned_to || []).includes(userId)
    )

    const isAdmin = role === 'admin'

    return (
        <Suspense>
            <MyJobDashboard
                myJobs={myJobs}
                myTickets={myTickets}
                allJobs={isAdmin ? allJobs : []}
                allTickets={isAdmin ? allTickets : []}
                settings={settingsResult.data || []}
                users={users}
                jobTypes={jobTypesResult.data || []}
                ticketCategories={ticketCategoriesResult.data || []}
                userId={userId}
                isAdmin={isAdmin}
            />
        </Suspense>
    )
}
