import { getJobSettings, getChecklistTemplates, getJobTypes, getAllCustomEmojis } from '../actions'
import SettingsView from './settings-view'

export default async function JobSettingsPage() {
    const [result, templatesResult, jobTypesResult, customEmojisResult] = await Promise.all([
        getJobSettings(),
        getChecklistTemplates(),
        getJobTypes(),
        getAllCustomEmojis(),
    ])

    return (
        <SettingsView
            settings={result.data || []}
            checklistTemplates={templatesResult.data || []}
            jobTypes={jobTypesResult.data || []}
            customEmojis={customEmojisResult.data || []}
        />
    )
}
