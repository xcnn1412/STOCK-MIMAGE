import { createServiceClient } from '@/lib/supabase-server'
import PaymentsView from './payments-view'

export const metadata = {
    title: 'Payments — CRM',
    description: 'Track installment payments and due dates',
}

export default async function PaymentsPage() {
    const supabase = createServiceClient()
    
    // Fetch installments from normalized table with lead info
    const { data: installments } = await supabase
        .from('crm_lead_installments')
        .select('*, crm_leads!inner(id, customer_name, status)')
        .gt('amount', 0)
        .not('due_date', 'is', null)
        .order('due_date', { ascending: true })

    const payments = (installments || []).map((inst: any) => ({
        id: inst.id,
        leadId: inst.crm_leads.id,
        customerName: inst.crm_leads.customer_name,
        status: inst.crm_leads.status,
        installmentNum: inst.installment_number,
        amount: inst.amount || 0,
        dueDate: inst.due_date,
        isPaid: inst.is_paid || false,
        paidDate: inst.paid_date,
    }))

    return <PaymentsView payments={payments} />
}
