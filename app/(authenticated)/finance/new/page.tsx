import { redirect } from 'next/navigation'
import { getJobEventsForSelect } from '../actions'
import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import CreateClaimForm from './create-claim-form'
import { getOutstandingClaims } from '../outstanding-data'
import OutstandingBlocked from './outstanding-blocked'

export const metadata = {
  title: 'สร้างใบเบิก — Finance',
  description: 'สร้างใบเบิกเงินใหม่',
}

export default async function NewClaimPage() {
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')

  // ยังมีรายการค้างเคลียร์ → ไม่แสดงฟอร์ม (createClaim กันซ้ำฝั่ง server อีกชั้น) · ทุกคนรวมแอดมิน
  const outstanding = await getOutstandingClaims(viewer.userId)
  if (outstanding.length > 0) return <OutstandingBlocked claims={outstanding} />

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
