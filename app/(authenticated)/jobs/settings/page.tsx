import { getJobSettings, getChecklistTemplates, getJobTypes } from '../actions'
import SettingsView from './settings-view'

export default async function JobSettingsPage() {
    const [result, templatesResult, jobTypesResult] = await Promise.all([
        getJobSettings(),
        getChecklistTemplates(),
        getJobTypes(),
    ])

    return <SettingsView settings={result.data || []} checklistTemplates={templatesResult.data || []} jobTypes={jobTypesResult.data || []} />
}
