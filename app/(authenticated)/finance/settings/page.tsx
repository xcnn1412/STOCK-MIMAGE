import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '../settings-actions'
import FinanceSettingsView from './finance-settings-view'

export const revalidate = 0

export default async function FinanceSettingsPage() {
  const [categories, categoryItems, staffProfiles] = await Promise.all([
    getFinanceCategories(false), // include inactive
    getAllCategoryItems(),
    getStaffProfiles(),
  ])
  return <FinanceSettingsView categories={categories} categoryItems={categoryItems} staffProfiles={staffProfiles} />
}
