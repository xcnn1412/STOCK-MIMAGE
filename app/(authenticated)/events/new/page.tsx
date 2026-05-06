import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import { createServiceClient } from '@/lib/supabase-server'
import CreateEventForm from './create-event-form'
import { getCrmSettings } from '../../crm/actions'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ from_crm?: string }>
}

export default async function NewEventPage({ searchParams }: PageProps) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  if (role !== 'admin') redirect('/events')

  const params = await searchParams

  // Fetch kits that are not currently assigned to an event
  const { data: availableKits } = await supabase
    .from('kits')
    .select('id, name')
    .is('event_id', null)
    .order('name')

  // Fetch all user profiles for staff/seller selection
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  // Fetch staff role settings
  const { data: allSettings } = await getCrmSettings()
  const staffRoles = (allSettings || []).filter((s: any) => s.category === 'staff_role' && s.is_active)

  // If from_crm param, fetch lead data AND crm_lead_staff with roles
  let prefill: {
    name: string
    location: string
    eventDate: string
    crmLeadId: string
    staffAssignments: { user_id: string; full_name: string; role: string }[]
    // Legacy backward-compat (also pass sellerNames & staffNames for the old hidden inputs)
    sellerNames: string[]
    staffNames: string[]
  } | null = null

  if (params.from_crm) {
    const serviceClient = createServiceClient()
    
    const [{ data: lead }, { data: leadStaff }] = await Promise.all([
      supabase
        .from('crm_leads')
        .select('id, customer_name, package_name, event_date, event_location, assigned_sales, assigned_staff')
        .eq('id', params.from_crm)
        .single(),
      serviceClient
        .from('crm_lead_staff')
        .select('user_id, role, profiles:user_id(full_name)')
        .eq('lead_id', params.from_crm)
        .order('created_at', { ascending: true }),
    ])

    if (lead) {
      // Build staff assignments from junction table
      const staffAssignments = (leadStaff || []).map((s: any) => ({
        user_id: s.user_id,
        full_name: s.profiles?.full_name || '',
        role: s.role,
      }))

      // Legacy name resolution for backward compat hidden inputs
      const sellerNames: string[] = []
      if (lead.assigned_sales?.length) {
        const matched = (profiles || []).filter(p => lead.assigned_sales.includes(p.id))
        sellerNames.push(...matched.map(p => p.full_name || '').filter(Boolean))
      }
      const staffNames: string[] = []
      if (lead.assigned_staff?.length) {
        const matched = (profiles || []).filter(p => lead.assigned_staff.includes(p.id))
        staffNames.push(...matched.map(p => p.full_name || '').filter(Boolean))
      }

      // Build event name
      const eventName = [
        lead.package_name || '',
        lead.customer_name || '',
        lead.event_date || '',
      ].filter(Boolean).join(' ')

      prefill = {
        name: eventName,
        location: lead.event_location || '',
        eventDate: lead.event_date || '',
        crmLeadId: lead.id,
        staffAssignments,
        sellerNames,
        staffNames,
      }
    }
  }

  return (
    <CreateEventForm
      availableKits={availableKits || []}
      profiles={profiles || []}
      prefill={prefill ?? undefined}
      staffRoles={staffRoles as any[]}
    />
  )
}
