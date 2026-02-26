import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getCrmSettings } from '../actions'
import CrmSettingsView from './settings-view'

export const metadata = {
  title: 'CRM Settings',
  description: 'Manage CRM packages, customer types, and lead sources'
}

export default async function CrmSettingsPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value

  if (role !== 'admin') {
    redirect('/crm')
  }

  const { data: settings } = await getCrmSettings()

  return <CrmSettingsView settings={settings as any[] || []} />
}
