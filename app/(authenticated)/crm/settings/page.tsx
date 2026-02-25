import { getCrmSettings } from '../actions'
import CrmSettingsView from './settings-view'

export const metadata = {
  title: 'CRM Settings',
  description: 'Manage CRM packages, customer types, and lead sources'
}

export default async function CrmSettingsPage() {
  const { data: settings } = await getCrmSettings()

  return <CrmSettingsView settings={settings as any[] || []} />
}
