import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '@/app/(authenticated)/finance/settings-actions'
import { getCrmSettings } from '@/app/(authenticated)/crm/actions'
import { getMetaTokenStatus } from '@/app/(authenticated)/content-planner/actions'
import SettingsView from './settings-view'

export const revalidate = 0

export const metadata = {
  title: 'ตั้งค่าระบบ — Settings',
  description: 'จัดการการตั้งค่าทั้งหมดของระบบ',
}

export default async function SettingsPage() {
  const [categories, categoryItems, staffProfiles, { data: crmSettings }, metaToken] = await Promise.all([
    getFinanceCategories(false), // include inactive
    getAllCategoryItems(),
    getStaffProfiles(),
    getCrmSettings(),
    getMetaTokenStatus(),
  ])

  return (
    <SettingsView
      financeCategories={categories}
      categoryItems={categoryItems}
      staffProfiles={staffProfiles}
      crmSettings={(crmSettings as any[]) || []}
      metaToken={metaToken}
    />
  )
}
