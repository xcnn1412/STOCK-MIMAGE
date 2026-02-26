import { supabaseServer as supabase } from '@/lib/supabase-server'
import CreateEventForm from './create-event-form'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ from_crm?: string }>
}

export default async function NewEventPage({ searchParams }: PageProps) {
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

  // If from_crm param, fetch lead data and resolve user IDs to names
  let prefill: {
    name: string
    location: string
    eventDate: string
    sellerNames: string[]
    staffNames: string[]
    crmLeadId: string
  } | null = null

  if (params.from_crm) {
    const { data: lead } = await supabase
      .from('crm_leads')
      .select('id, customer_name, package_name, event_date, event_location, assigned_sales, assigned_staff')
      .eq('id', params.from_crm)
      .single()

    if (lead) {
      // Resolve user IDs to full_name for sellers
      const sellerNames: string[] = []
      if (lead.assigned_sales?.length) {
        const matchedProfiles = (profiles || []).filter(p => lead.assigned_sales.includes(p.id))
        sellerNames.push(...matchedProfiles.map(p => p.full_name || '').filter(Boolean))
      }

      // Resolve user IDs to full_name for staff
      const staffNames: string[] = []
      if (lead.assigned_staff?.length) {
        const matchedProfiles = (profiles || []).filter(p => lead.assigned_staff.includes(p.id))
        staffNames.push(...matchedProfiles.map(p => p.full_name || '').filter(Boolean))
      }

      // Build event name: "{package_name} {customer_name} {event_date}"
      const eventName = [
        lead.package_name || '',
        lead.customer_name || '',
        lead.event_date || '',
      ].filter(Boolean).join(' ')

      prefill = {
        name: eventName,
        location: lead.event_location || '',
        eventDate: lead.event_date || '',
        sellerNames,
        staffNames,
        crmLeadId: lead.id,
      }
    }
  }

  return (
    <CreateEventForm
      availableKits={availableKits || []}
      profiles={profiles || []}
      prefill={prefill ?? undefined}
    />
  )
}
