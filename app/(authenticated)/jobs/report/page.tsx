import { getTicketReportData, getJobSettings, getTicketCategories } from '../actions'
import ReportView from './report-view'

export const metadata = {
    title: 'Report — Tickets',
    description: 'Ticket usage report and analytics',
}

export default async function ReportPage() {
    const [reportData, settingsResult, categoriesResult] = await Promise.all([
        getTicketReportData(),
        getJobSettings(),
        getTicketCategories(),
    ])

    return (
        <ReportView
            report={reportData}
            settings={settingsResult.data || []}
            categories={categoriesResult.data || []}
        />
    )
}
