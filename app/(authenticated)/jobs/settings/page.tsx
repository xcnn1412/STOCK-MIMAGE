import { getJobSettings } from '../actions'
import SettingsView from './settings-view'

export default async function JobSettingsPage() {
    const result = await getJobSettings()

    return <SettingsView settings={result.data || []} />
}
