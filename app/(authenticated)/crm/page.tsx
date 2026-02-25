import { createClient } from '@supabase/supabase-js'
import CrmDashboard from './crm-dashboard'
import { getLeads, getCrmSettings, getSystemUsers } from './actions'

export const metadata = {
  title: 'CRM — Photobooth CRM',
  description: 'Manage your photobooth events and customers',
}

export default async function CrmPage() {
  const [leadsResult, settingsResult, usersResult] = await Promise.all([
    getLeads(),
    getCrmSettings(),
    getSystemUsers(),
  ])

  return (
    <CrmDashboard
      leads={leadsResult.data as any[] || []}
      settings={settingsResult.data as any[] || []}
      users={usersResult.data as any[] || []}
    />
  )
}
