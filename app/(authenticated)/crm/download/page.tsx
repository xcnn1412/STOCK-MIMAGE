import { getLeads, getCrmSettings } from '../actions'
import DownloadView from './download-view'

export const metadata = {
    title: 'Download — CRM',
    description: 'Export CRM data',
}

export default async function DownloadPage() {
    const [leadsResult, settingsResult] = await Promise.all([
        getLeads(),
        getCrmSettings(),
    ])

    return (
        <DownloadView
            leads={leadsResult.data as any[] || []}
            settings={settingsResult.data as any[] || []}
        />
    )
}
