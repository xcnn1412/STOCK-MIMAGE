import { Suspense } from 'react'
import { getJobs, getJobSettings, getSystemUsers, getJobTypes, getTickets, getTicketCategories, getMentionedTicketIds } from './actions'
import JobsDashboard from './jobs-dashboard'
import JobsLoading from './loading'

export default async function JobsPage() {
    const [jobsResult, settingsResult, users, jobTypesResult, ticketsResult, ticketCategoriesResult, mentionedTicketIds] = await Promise.all([
        getJobs(),
        getJobSettings(),
        getSystemUsers(),
        getJobTypes(),
        getTickets(),
        getTicketCategories(),
        getMentionedTicketIds(),
    ])

    return (
        <Suspense fallback={<JobsLoading />}>
            <JobsDashboard
                jobs={jobsResult.data || []}
                settings={settingsResult.data || []}
                users={users}
                jobTypes={jobTypesResult.data || []}
                tickets={ticketsResult.data || []}
                ticketCategories={ticketCategoriesResult.data || []}
                mentionedTicketIds={mentionedTicketIds}
            />
        </Suspense>
    )
}

