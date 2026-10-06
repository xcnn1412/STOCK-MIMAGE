import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { getLeads, getCrmSettings } from '../actions'
import DownloadView from './download-view'

export const metadata = {
    title: 'Download — CRM',
    description: 'Export CRM data',
}

export default async function DownloadPage() {
    const session = await requireAuth()
    const role = session?.role

    if (role !== 'admin') {
        redirect('/crm')
    }

    const [leadsResult, settingsResult] = await Promise.all([
        getLeads({ includeArchived: true, full: true }),
        getCrmSettings(),
    ])

    return (
        <DownloadView
            leads={leadsResult.data as any[] || []}
            settings={settingsResult.data as any[] || []}
        />
    )
}
