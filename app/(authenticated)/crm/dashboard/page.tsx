import { getLeads, getCrmSettings } from '../actions'
import { createServiceClient } from '@/lib/supabase-server'
import DashboardView from './dashboard-view'

export const metadata = {
    title: 'Dashboard — CRM',
    description: 'CRM analytics and overview',
}

export default async function DashboardPage() {
    const supabase = createServiceClient()
    
    const [leadsResult, settingsResult, installmentsResult] = await Promise.all([
        getLeads(),
        getCrmSettings(),
        supabase.from('crm_lead_installments').select('lead_id, amount, due_date, is_paid'),
    ])

    // Aggregate installment stats
    const installments = installmentsResult.data || []
    const today = new Date()
    let overdueCount = 0
    let paidCount = 0
    let totalOutstanding = 0
    let totalPaid = 0

    for (const inst of installments) {
        if (!inst.amount || inst.amount <= 0) continue
        if (inst.is_paid) {
            paidCount++
            totalPaid += inst.amount
        } else {
            totalOutstanding += inst.amount
            if (inst.due_date && new Date(inst.due_date) < today) overdueCount++
        }
    }

    return (
        <DashboardView
            leads={leadsResult.data as any[] || []}
            settings={settingsResult.data as any[] || []}
            paymentStats={{ overdueCount, paidCount, totalOutstanding, totalPaid }}
        />
    )
}
