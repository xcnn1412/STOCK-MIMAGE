import { getJobs, getJobSettings, getSystemUsers } from './actions'
import JobsDashboard from './jobs-dashboard'

export default async function JobsPage() {
    const [jobsResult, settingsResult, users] = await Promise.all([
        getJobs(),
        getJobSettings(),
        getSystemUsers(),
    ])

    return (
        <JobsDashboard
            jobs={jobsResult.data || []}
            settings={settingsResult.data || []}
            users={users}
        />
    )
}
