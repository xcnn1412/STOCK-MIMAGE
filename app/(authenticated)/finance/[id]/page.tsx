import { getFinanceViewer } from '../viewer'
import { notFound, redirect } from 'next/navigation'
import ClaimDetailView from './claim-detail-view'
import { loadClaimPage } from '../claim-page-data'
import { ClaimLinkedItems } from '../../jobs/purchasing/components/claim-linked-items'

export const revalidate = 0

export default async function ClaimDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  // บทบาทและ id จากการล็อกอินที่ยืนยันแล้ว — ปุ่มที่หน้าจอแสดงต้องไม่ขึ้นกับ cookie ที่แก้เองได้
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  const { role, userId } = viewer

  // ใบเบิก หมวดหมู่ ประวัติ รายการในวงเงิน (วงเงินสดย่อย) ใบที่ดึงเข้าวงเงินได้ (แอดมิน) และรายการจัดซื้อที่ผูก — อ่านพร้อมกันรอบเดียว
  // ใบที่ไม่มีหรือมองไม่เห็น = null · รายชื่องานของช่องแก้ไขหน้าจอขอเองตอนกดแก้ไข (ไม่อ่านตอนเปิดหน้า)
  const page = await loadClaimPage(id, viewer)
  if (!page) notFound()
  const { claim, categories, logs, pettyChildren, linkableClaims, purchaseItems } = page

  return (
    <>
      <ClaimDetailView claim={claim} role={role} categories={categories} logs={logs} userId={userId} pettyChildren={pettyChildren} linkableClaims={linkableClaims} />
      {/* ความกว้างเดียวกับ ClaimDetailView (max-w-3xl กึ่งกลาง) — ไม่มีรายการที่ผูก = ไม่แสดงอะไร */}
      <div className="max-w-3xl mx-auto">
        <ClaimLinkedItems rows={purchaseItems} claim={claim} />
      </div>
    </>
  )
}
