import { createServiceClient } from '@/lib/supabase-server'
import TrackingView, { type TrackingLead } from './tracking-view'

export const metadata = {
    title: 'ติดตามงาน — Jobs',
    description: 'ติดตามออกแบบ / ล็อคคิว / ออกหน้างาน ของดีลที่ตอบรับแล้ว',
}

export default async function TrackingPage() {
    const supabase = createServiceClient()

    const { data: leads, error: leadsError } = await supabase
        .from('crm_leads')
        .select('id, customer_name, event_location, event_date, design_status, supplier_note, tracking_checklist')
        .eq('status', 'accepted')
        .order('event_date', { ascending: true, nullsFirst: false })
    if (leadsError) throw new Error(leadsError.message)

    const leadIds = (leads || []).map(l => l.id)

    // Staff per lead — batched: events(crm_lead_id in leadIds) → event_staff → profiles
    const staffByLead = new Map<string, { name: string; role: string }[]>()
    if (leadIds.length > 0) {
        const { data: events } = await supabase
            .from('events')
            .select('id, crm_lead_id')
            .in('crm_lead_id', leadIds)

        const eventIds = (events || []).map(e => e.id)
        if (eventIds.length > 0) {
            const { data: staffRows } = await supabase
                .from('event_staff')
                .select('event_id, user_id, role, profiles:user_id(full_name)')
                .in('event_id', eventIds)
                .order('created_at', { ascending: true })

            const leadByEvent = new Map((events || []).map(e => [e.id, e.crm_lead_id as string]))
            const seen = new Set<string>()
            type StaffRow = { event_id: string; user_id: string; role: string; profiles?: { full_name: string | null } | null }
            for (const s of (staffRows || []) as unknown as StaffRow[]) {
                const leadId = leadByEvent.get(s.event_id)
                if (!leadId) continue
                const key = `${leadId}:${s.user_id}:${s.role}`
                if (seen.has(key)) continue
                seen.add(key)
                if (!staffByLead.has(leadId)) staffByLead.set(leadId, [])
                staffByLead.get(leadId)!.push({ name: s.profiles?.full_name || s.user_id, role: s.role })
            }
        }
    }

    const { data: roleSettings } = await supabase
        .from('crm_settings')
        .select('value, label_th')
        .eq('category', 'staff_role')
        .eq('is_active', true)

    const roleLabels: Record<string, string> = {}
    for (const r of roleSettings || []) roleLabels[r.value] = r.label_th || r.value

    const rows: TrackingLead[] = (leads || []).map(l => ({
        id: l.id,
        customer_name: l.customer_name,
        event_name: l.event_location,
        event_date: l.event_date,
        design_status: l.design_status || 'not_started',
        supplier_note: l.supplier_note,
        tracking_checklist: Array.isArray(l.tracking_checklist) ? (l.tracking_checklist as string[]) : [],
        staff: staffByLead.get(l.id) || [],
    }))

    return <TrackingView leads={rows} roleLabels={roleLabels} />
}
