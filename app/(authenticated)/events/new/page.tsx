import { getEventManager } from '@/lib/event-permissions'
import { redirect } from 'next/navigation'
import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import { loadOpenBookings } from '@/lib/kit-bookings'
import CreateEventForm from './create-event-form'
import { getCrmSettings } from '../../crm/actions'
import type { CrmSettingRow } from '../event-form-types'

export const revalidate = 0

interface PageProps {
  searchParams: Promise<{ from_crm?: string }>
}

export default async function NewEventPage({ searchParams }: PageProps) {
  if (!(await getEventManager('edit'))) redirect('/events')

  const params = await searchParams

  // กระเป๋าทุกใบ + การจองของงานที่ยังไม่ปิด — ฟอร์มเตือนเมื่อกระเป๋าชนวัน/เวลา (จองล่วงหน้าได้)
  const [{ data: availableKits }, kitBookings] = await Promise.all([
    supabase.from('kits').select('id, name').order('name'),
    loadOpenBookings(createServiceClient()),
  ])

  // Fetch all user profiles for staff/seller selection
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .order('full_name')

  // Fetch staff role settings
  const { data: allSettings } = await getCrmSettings()
  const staffRoles = ((allSettings || []) as CrmSettingRow[]).filter((s) => s.category === 'staff_role' && s.is_active)

  // If from_crm param, prefill identity fields from the lead (staff starts empty).
  let prefill: {
    name: string
    location: string
    eventDate: string
    eventTime: string | null
    eventEndTime: string | null
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
      .select('id, customer_name, package_name, event_date, event_location, event_time, event_end_time')
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
        // เวลาเปิด–ปิด จากการ์ด CRM (time → 'HH:mm:ss'); ฟอร์มตัดเหลือ HH:mm เอง
        eventTime: lead.event_time || null,
        eventEndTime: lead.event_end_time || null,
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
      kitBookings={kitBookings}
      profiles={profiles || []}
      prefill={prefill ?? undefined}
      staffRoles={staffRoles}
    />
  )
}
