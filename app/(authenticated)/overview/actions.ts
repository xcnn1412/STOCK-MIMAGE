'use server'

import { createServiceClient } from '@/lib/supabase-server'
import { cookies } from 'next/headers'

async function getSession() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user')?.value || ''
  return { role, userId }
}

export async function getOverviewData() {
  const { role } = await getSession()
  if (role !== 'admin') return null

  const supabase = createServiceClient()

  const [
    eventsResult,
    costItemsResult,
    leadsResult,
    expenseClaimsResult,
    checkinsResult,
    profilesResult,
  ] = await Promise.all([
    // 1) All job_cost_events
    supabase
      .from('job_cost_events')
      .select('id, source_event_id, event_name, event_date, event_location, staff, revenue, seller, status, notes, revenue_vat_mode, revenue_wht_rate, created_at')
      .order('event_date', { ascending: false }),

    // 2) All cost items
    supabase
      .from('job_cost_items')
      .select('id, job_event_id, category, description, amount, title, unit_price, quantity, vat_mode, include_vat, withholding_tax_rate'),

    // 3) CRM leads (linked to events via event_id)
    supabase
      .from('crm_leads')
      .select('id, event_id, customer_name, confirmed_price, quoted_price, assigned_sales, assigned_graphics, assigned_staff, package_name, status, event_date, event_location, vat_mode, wht_rate'),

    // 4) Expense claims linked to events
    supabase
      .from('expense_claims')
      .select('id, job_event_id, total_amount, status, claim_type, submitted_by, category'),

    // 5) Staff checkins (for event check-in counts)
    supabase
      .from('staff_checkins')
      .select('id, event_id, user_id, checked_in_at, checked_out_at'),

    // 6) Profiles for name lookups
    supabase
      .from('profiles')
      .select('id, full_name, nickname'),
  ])

  // Build event-linked checkin map (event_id from staff_checkins → events table)
  // We also need events table to map source_event_id
  const eventsTableResult = await supabase
    .from('events')
    .select('id, name')

  return {
    jobEvents: eventsResult.data || [],
    costItems: costItemsResult.data || [],
    leads: leadsResult.data || [],
    expenseClaims: expenseClaimsResult.data || [],
    checkins: checkinsResult.data || [],
    profiles: profilesResult.data || [],
    events: eventsTableResult.data || [],
  }
}
