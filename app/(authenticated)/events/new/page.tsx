import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer as supabase } from '@/lib/supabase-server'
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

  // If from_crm param, prefill identity fields from the lead (staff starts empty).
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
    // Prefill identity fields from the lead, but NOT staff. Staff is now assigned fresh
    // per event (event_staff keyed by event_id), so each sub-event under the same CRM
    // lead starts with an empty team. (Previously this pulled crm_lead_staff into every
    // new event, which is exactly why all sub-events ended up sharing one staff list.)
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, customer_name, package_name, event_date, event_location')
      .eq('id', params.from_crm)
      .single()

    if (lead) {
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
        staffAssignments: [],
        sellerNames: [],
        staffNames: [],
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
