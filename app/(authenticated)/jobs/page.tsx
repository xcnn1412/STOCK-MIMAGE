import { getJobs, getJobSettings, getSystemUsers, getJobTypes, getTickets, getTicketCategories } from './actions'
import JobsDashboard from './jobs-dashboard'

export default async function JobsPage() {
    const [jobsResult, settingsResult, users, jobTypesResult, ticketsResult, ticketCategoriesResult] = await Promise.all([
        getJobs(),
        getJobSettings(),
        getSystemUsers(),
        getJobTypes(),
        getTickets(),
        getTicketCategories(),
    ])

    return (
        <JobsDashboard
            jobs={jobsResult.data || []}
            settings={settingsResult.data || []}
            users={users}
            jobTypes={jobTypesResult.data || []}
            tickets={ticketsResult.data || []}
            ticketCategories={ticketCategoriesResult.data || []}
        />
    )
}

