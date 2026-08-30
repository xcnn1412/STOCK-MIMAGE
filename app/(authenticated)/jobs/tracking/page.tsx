import { Suspense } from 'react'
import { createServiceClient } from '@/lib/supabase-server'
import TrackingView, { type TrackingLead } from './tracking-view'
import { VEHICLES } from './tracking-logic'

export const metadata = {
    title: 'ติดตามงาน — Jobs',
    description: 'งานที่ลูกค้าตอบรับแล้ว — ดูว่างานไหนใกล้ถึง อยู่ขั้นไหน และยังขาดอะไร',
}

export default async function TrackingPage() {
    const supabase = createServiceClient()

    const { data: leads, error: leadsError } = await supabase
        .from('crm_leads')
        .select('id, customer_name, event_location, event_date, event_end_date, event_time, event_end_time, design_status, supplier_note, tracking_checklist')
        .eq('status', 'accepted')
        .order('event_date', { ascending: true, nullsFirst: false })
        .order('event_time', { ascending: true, nullsFirst: false })
    if (leadsError) throw new Error(leadsError.message)

    const leadIds = (leads || []).map(l => l.id)

    // Staff per lead — batched: events(crm_lead_id in leadIds) → event_staff → profiles
    type LeadEvent = { id: string; name: string; event_date: string | null; status: string | null }
    const eventsByLead = new Map<string, LeadEvent[]>()
    const staffByLead = new Map<string, TrackingLead['staff']>()
    if (leadIds.length > 0) {
        const { data: events } = await supabase
            .from('events')
            .select('id, name, event_date, status, crm_lead_id')
            .in('crm_lead_id', leadIds)
            .order('event_date', { ascending: true, nullsFirst: false })

        // อีเวนต์ที่ปิดแล้วจัดคนไม่ได้ — ตัดออกจากตัวเลือก (แต่คนที่จัดไว้แล้วยังนับอยู่)
        for (const e of events || []) {
            if (e.status === 'closed') continue
            const list = eventsByLead.get(e.crm_lead_id as string)
            const row: LeadEvent = { id: e.id, name: e.name || '', event_date: e.event_date, status: e.status ?? null }
            if (list) list.push(row)
            else eventsByLead.set(e.crm_lead_id as string, [row])
        }

        const eventIds = (events || []).map(e => e.id)
        if (eventIds.length > 0) {
            const { data: staffRows } = await supabase
                .from('event_staff')
                .select('event_id, user_id, role, profiles:user_id(full_name, nickname)')
                .in('event_id', eventIds)
                .order('created_at', { ascending: true })

            const leadByEvent = new Map((events || []).map(e => [e.id, e.crm_lead_id as string]))
            const seen = new Set<string>()
            type StaffRow = { event_id: string; user_id: string; role: string; profiles?: { full_name: string | null; nickname: string | null } | null }
            for (const s of (staffRows || []) as unknown as StaffRow[]) {
                const leadId = leadByEvent.get(s.event_id)
                if (!leadId) continue
                const key = `${leadId}:${s.user_id}:${s.role}`
                if (seen.has(key)) continue
                seen.add(key)
                if (!staffByLead.has(leadId)) staffByLead.set(leadId, [])
                staffByLead.get(leadId)!.push({ user_id: s.user_id, name: s.profiles?.full_name || s.user_id, nickname: s.profiles?.nickname || null, role: s.role, event_id: s.event_id })
            }
        }
    }

    const { data: roleSettings } = await supabase
        .from('crm_settings')
        .select('value, label_th, sort_order')
        .eq('category', 'staff_role')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    const roles = (roleSettings || []).map(r => ({ value: r.value as string, label: (r.label_th as string) || (r.value as string) }))
    const roleLabels: Record<string, string> = {}
    for (const r of roles) roleLabels[r.value] = r.label

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, nickname, department')
        .eq('is_approved', true)
        .order('full_name')

    const people = (profiles || []).map(p => ({
        id: p.id as string,
        name: (p.full_name as string) || (p.id as string).slice(0, 8),
        nickname: (p.nickname as string) || null,
        department: (p.department as string) || null,
    }))

    const rows: TrackingLead[] = (leads || []).map(l => ({
        id: l.id,
        customer_name: l.customer_name,
        event_name: l.event_location,
        event_date: l.event_date,
        event_end_date: l.event_end_date,
        event_time: l.event_time ? String(l.event_time).slice(0, 5) : null,
        event_end_time: l.event_end_time ? String(l.event_end_time).slice(0, 5) : null,
        design_status: l.design_status || 'not_started',
        supplier_note: l.supplier_note,
        // กรองเหลือเฉพาะ key รถ — key checklist เก่า (lock_queue/on_site) ไม่ใช้แล้วและไม่ผ่าน validation
        tracking_checklist: (Array.isArray(l.tracking_checklist) ? (l.tracking_checklist as string[]) : []).filter(k => VEHICLES.some(v => v.key === k)),
        events: eventsByLead.get(l.id) || [],
        staff: staffByLead.get(l.id) || [],
    }))

    // TrackingView อ่าน ?view/?date/?mode ด้วย useSearchParams — ต้องอยู่ใต้ Suspense
    return (
        <Suspense fallback={null}>
            <TrackingView leads={rows} roleLabels={roleLabels} roles={roles} people={people} />
        </Suspense>
    )
}
