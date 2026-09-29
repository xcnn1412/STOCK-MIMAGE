import { getClaim, getClaimLogs, getJobEventsForSelect, getPettyCashChildren, getLinkablePettyClaims } from '../actions'
import { getFinanceCategories } from '../settings-actions'
import { getFinanceViewer } from '../viewer'
import { notFound, redirect } from 'next/navigation'
import ClaimDetailView from './claim-detail-view'
import type { ExpenseClaim } from '../../costs/types'
import { getClaimPurchaseItems } from '../../jobs/purchasing/data'
import { ClaimLinkedItems } from '../../jobs/purchasing/components/claim-linked-items'

export const revalidate = 0

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // บทบาทและ id จากการล็อกอินที่ยืนยันแล้ว — ปุ่มที่หน้าจอแสดงต้องไม่ขึ้นกับ cookie ที่แก้เองได้
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  const { role, userId } = viewer

  const [{ data, error }, categories, logs, jobEvents] = await Promise.all([
    getClaim(id),
    getFinanceCategories(),
    getClaimLogs(id),
    getJobEventsForSelect(),
  ])
  if (!data || error) notFound()

  // Petty-cash FUND → also load its children (box expenses + top-ups)
  const claim = data as unknown as ExpenseClaim
  const isPettyFund = claim.claim_type === 'petty_cash' && !claim.pettycash_fund_id
  const pettyChildren = isPettyFund ? await getPettyCashChildren(id) : null
  // Claims (event/other/advance) that admin can pull into this fund
  const linkableClaims = isPettyFund && role === 'admin' ? (await getLinkablePettyClaims()).data : null
  // รายการจัดซื้อที่ผูกกับใบเบิกนี้ — อ่านหลัง getClaim ผ่านสิทธิ์แล้วเท่านั้น (ฟังก์ชันนี้ไม่ตรวจสิทธิ์เอง) · พลาด = []
  const purchaseItems = await getClaimPurchaseItems(id)

  return (
    <>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- cast เดิมของหน้านี้ (มีก่อนส่วนจัดซื้อ) ไม่ได้แก้ในงานนี้ */}
      <ClaimDetailView claim={claim} role={role} categories={categories} logs={logs} userId={userId} jobEvents={jobEvents} pettyChildren={pettyChildren as any} linkableClaims={linkableClaims as any} />
      {/* ความกว้างเดียวกับ ClaimDetailView (max-w-3xl กึ่งกลาง) — ไม่มีรายการที่ผูก = ไม่แสดงอะไร */}
      <div className="max-w-3xl mx-auto">
        <ClaimLinkedItems rows={purchaseItems} claim={claim} />
      </div>
    </>
  )
}
