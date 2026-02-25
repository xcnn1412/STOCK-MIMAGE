import { getLeads } from '../actions'
import PaymentsView from './payments-view'

export const metadata = {
    title: 'Payments — CRM',
    description: 'Track installment payments and due dates',
}

export default async function PaymentsPage() {
    const leadsResult = await getLeads()

    return <PaymentsView leads={leadsResult.data as any[] || []} />
}
