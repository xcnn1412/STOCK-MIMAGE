import { getLeads, getCrmSettings } from '../actions'
import DashboardView from './dashboard-view'

export const metadata = {
    title: 'Dashboard — CRM',
    description: 'CRM analytics and overview',
}

export default async function DashboardPage() {
    const [leadsResult, settingsResult] = await Promise.all([
        getLeads(),
        getCrmSettings(),
    ])

    return (
        <DashboardView
            leads={leadsResult.data as any[] || []}
            settings={settingsResult.data as any[] || []}
        />
    )
}
