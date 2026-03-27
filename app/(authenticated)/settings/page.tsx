import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '@/app/(authenticated)/finance/settings-actions'
import { getCrmSettings } from '@/app/(authenticated)/crm/actions'
import { getStaffRoleRates, getAutoCalcSettings } from '@/app/(authenticated)/finance/rate-config-actions'
import SettingsView from './settings-view'

export const revalidate = 0

export const metadata = {
  title: 'ตั้งค่าระบบ — Settings',
  description: 'จัดการการตั้งค่าทั้งหมดของระบบ',
}

export default async function SettingsPage() {
  const [categories, categoryItems, staffProfiles, { data: crmSettings }, roleRates, autoCalcSettings] = await Promise.all([
    getFinanceCategories(false), // include inactive
    getAllCategoryItems(),
    getStaffProfiles(),
    getCrmSettings(),
    getStaffRoleRates(),
    getAutoCalcSettings(),
  ])

  return (
    <SettingsView
      financeCategories={categories}
      categoryItems={categoryItems}
      staffProfiles={staffProfiles}
      crmSettings={(crmSettings as any[]) || []}
      roleRates={roleRates}
      autoCalcSettings={autoCalcSettings}
    />
  )
}
