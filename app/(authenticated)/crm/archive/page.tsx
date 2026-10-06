import { getArchivedLeads, getCrmSettings, countStaleLeads } from '../actions'
import { requireAuth } from '@/lib/auth'
import ArchiveView from './archive-view'

export const metadata = {
    title: 'Archive — CRM',
    description: 'View archived leads',
}

export default async function ArchivePage() {
    const session = await requireAuth()
    const isAdmin = session?.role === 'admin'
    const [leadsResult, settingsResult, staleResult] = await Promise.all([
        getArchivedLeads(),
        getCrmSettings(),
        isAdmin ? countStaleLeads() : null,
    ])

    return (
        <ArchiveView
            leads={leadsResult.data as any[] || []}
            settings={settingsResult.data as any[] || []}
            stale={staleResult && !('error' in staleResult) ? staleResult : null}
        />
    )
}
