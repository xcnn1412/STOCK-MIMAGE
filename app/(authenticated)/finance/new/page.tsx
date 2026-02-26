import { getJobEventsForSelect } from '../actions'
import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '../settings-actions'
import CreateClaimForm from './create-claim-form'

export const metadata = {
  title: 'สร้างใบเบิก — Finance',
  description: 'สร้างใบเบิกเงินใหม่',
}

export default async function NewClaimPage() {
  const [jobEvents, categories, categoryItems, staffProfiles] = await Promise.all([
    getJobEventsForSelect(),
    getFinanceCategories(),
    getAllCategoryItems(),
    getStaffProfiles(),
  ])

  return <CreateClaimForm jobEvents={jobEvents} categories={categories} categoryItems={categoryItems} staffProfiles={staffProfiles} />
}
