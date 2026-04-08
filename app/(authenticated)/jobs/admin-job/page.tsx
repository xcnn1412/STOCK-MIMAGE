import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import {
    getJobs, getJobSettings, getSystemUsers, getJobTypes,
    getTickets, getTicketCategories,
} from '../actions'
import AdminJobDashboard from './admin-job-dashboard'

export default async function AdminJobPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    if (role !== 'admin') redirect('/jobs/my-job')

    const [jobsResult, settingsResult, users, jobTypesResult, ticketsResult, ticketCategoriesResult] = await Promise.all([
        getJobs(),
        getJobSettings(),
        getSystemUsers(),
        getJobTypes(),
        getTickets(),
        getTicketCategories(),
    ])

    return (
        <Suspense>
            <AdminJobDashboard
                allJobs={jobsResult.data || []}
                allTickets={ticketsResult.data || []}
                settings={settingsResult.data || []}
                users={users}
                jobTypes={jobTypesResult.data || []}
                ticketCategories={ticketCategoriesResult.data || []}
            />
        </Suspense>
    )
}
