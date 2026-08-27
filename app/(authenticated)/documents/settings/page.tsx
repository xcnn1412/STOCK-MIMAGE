import { redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { listBrandsAdmin, listCounters, listLockedBrandCodes, listTemplates } from './actions'
import SettingsView from './settings-view'

export const revalidate = 0

export const metadata = {
  title: 'ตั้งค่าเอกสาร — Document Control',
  description: 'แบรนด์ · ตัวนับเลขที่เอกสาร · แม่แบบ',
}

export default async function DocumentSettingsPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  if (session.role !== 'admin') redirect('/documents')

  const [brands, counters, lockedCodes, templates] = await Promise.all([
    listBrandsAdmin(),
    listCounters(),
    listLockedBrandCodes(),
    listTemplates(),
  ])

  return (
    <SettingsView brands={brands} counters={counters} lockedCodes={lockedCodes} templates={templates} />
  )
}
