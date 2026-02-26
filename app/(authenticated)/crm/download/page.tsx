import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getLeads, getCrmSettings } from '../actions'
import DownloadView from './download-view'

export const metadata = {
    title: 'Download — CRM',
    description: 'Export CRM data',
}

export default async function DownloadPage() {
    const cookieStore = await cookies()
    const role = cookieStore.get('session_role')?.value

    if (role !== 'admin') {
        redirect('/crm')
    }

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
