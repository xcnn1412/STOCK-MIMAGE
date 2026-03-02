import { getJobs, getJobSettings, getSystemUsers, getJobTypes } from './actions'
import JobsDashboard from './jobs-dashboard'

export default async function JobsPage() {
    const [jobsResult, settingsResult, users, jobTypesResult] = await Promise.all([
        getJobs(),
        getJobSettings(),
        getSystemUsers(),
        getJobTypes(),
    ])

    return (
        <JobsDashboard
            jobs={jobsResult.data || []}
            settings={settingsResult.data || []}
            users={users}
            jobTypes={jobTypesResult.data || []}
        />
    )
}
