import { redirect } from 'next/navigation'
import { getJobEventsForSelect } from '../actions'
import { getFinanceCategories, getAllCategoryItems, getStaffProfiles } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import CreateClaimForm from './create-claim-form'
import { getOutstandingClaims } from '../outstanding-data'
import OutstandingBlocked from './outstanding-blocked'
import { getClaimPrefill } from '../../jobs/purchasing/data'
import { parseClaimItemIds } from '../../jobs/purchasing/purchasing-logic'

export const metadata = {
  title: 'สร้างใบเบิก — Finance',
  description: 'สร้างใบเบิกเงินใหม่',
}

export default async function NewClaimPage({
  searchParams,
}: {
  searchParams?: Promise<{ items?: string; type?: string }>
} = {}) {
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  // เปิดมาจากหน้าจัดซื้อ: ?items=<id,id,…> (+ ?type=advance = ใบทดลองจ่ายทั้งเช็กลิสต์) → เติมฟอร์มให้ · ค่าเพี้ยน = ฟอร์มเปล่า
  const params = (await searchParams) ?? {}

  // ยังมีรายการค้างเคลียร์ → ไม่แสดงฟอร์ม (createClaim กันซ้ำฝั่ง server อีกชั้น) · แอดมินเบิกได้แม้มีใบค้าง
  const outstanding = viewer.isAdmin ? [] : await getOutstandingClaims(viewer.userId)
  if (outstanding.length > 0) return <OutstandingBlocked claims={outstanding} />

  // getStaffProfiles: แอดมินได้บัญชีธนาคารของทุกคน · คนอื่นได้เฉพาะของตัวเอง (ของเพื่อนร่วมงานขอทีละคนจากฟอร์ม)
  const [jobEvents, categories, categoryItems, staffProfiles, prefill] = await Promise.all([
    getJobEventsForSelect(),
    getFinanceCategories(),
    getAllCategoryItems(),
    getStaffProfiles(),
    getClaimPrefill(parseClaimItemIds(params.items), params.type === 'advance' ? 'advance' : 'other'),
  ])

  return (
    <CreateClaimForm
      jobEvents={jobEvents}
      categories={categories}
      categoryItems={categoryItems}
      staffProfiles={staffProfiles}
      isAdmin={viewer.isAdmin}
      viewerId={viewer.userId}
      prefill={prefill}
    />
  )
}
