import { redirect } from 'next/navigation'
import { getJobEventsForSelect } from '../actions'
import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import CreateClaimForm from './create-claim-form'

export const metadata = {
  title: 'สร้างใบเบิก — Finance',
  description: 'สร้างใบเบิกเงินใหม่',
}

export default async function NewClaimPage() {
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')

  // getStaffProfiles: แอดมินได้บัญชีธนาคารของทุกคน · คนอื่นได้เฉพาะของตัวเอง (ของเพื่อนร่วมงานขอทีละคนจากฟอร์ม)
  const [jobEvents, categories, categoryItems, staffProfiles] = await Promise.all([
    getJobEventsForSelect(),
    getFinanceCategories(),
    getAllCategoryItems(),
    getStaffProfiles(),
  ])

  return (
    <CreateClaimForm
      jobEvents={jobEvents}
      categories={categories}
      categoryItems={categoryItems}
      staffProfiles={staffProfiles}
      isAdmin={viewer.isAdmin}
      viewerId={viewer.userId}
    />
  )
}
