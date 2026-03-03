import { getArchivedJobs, getArchivedTickets, getJobSettings, getJobTypes } from '../actions'
import ArchiveView from './archive-view'

export const metadata = {
    title: 'Archive — Jobs',
    description: 'View archived jobs and tickets',
}

export default async function ArchivePage() {
    const [jobsResult, ticketsResult, settingsResult, jobTypesResult] = await Promise.all([
        getArchivedJobs(),
        getArchivedTickets(),
        getJobSettings(),
        getJobTypes(),
    ])

    return (
        <ArchiveView
            jobs={jobsResult.data || []}
            tickets={ticketsResult.data || []}
            settings={settingsResult.data || []}
            jobTypes={jobTypesResult.data || []}
        />
    )
}
