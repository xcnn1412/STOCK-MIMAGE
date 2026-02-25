import { getArchivedLeads, getCrmSettings } from '../actions'
import ArchiveView from './archive-view'

export const metadata = {
    title: 'Archive — CRM',
    description: 'View archived leads',
}

export default async function ArchivePage() {
    const [leadsResult, settingsResult] = await Promise.all([
        getArchivedLeads(),
        getCrmSettings(),
    ])

    return (
        <ArchiveView
            leads={leadsResult.data as any[] || []}
            settings={settingsResult.data as any[] || []}
        />
    )
}
