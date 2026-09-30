import { redirect } from 'next/navigation'
import { getPaidMonths } from './actions'
import { getFinanceCategories } from './settings-actions'
import { getFinanceViewer } from './viewer'
import { getQueueClaims } from './queue-data'
import { getPaidClaimsLean, getStaffOpenClaims } from './list-data'
import ClaimsListView from './claims-list-view'
import QueueView from './queue-view'

export const revalidate = 0

export const metadata = {
  title: 'เบิกเงิน — Finance',
  description: 'ระบบเบิกเงินและใบเบิกค่าใช้จ่าย',
}

/** เวลาของ server ตอนโหลดหน้า — คิวคิดอายุของงานจากค่านี้ (ข้อความตรงกันทั้ง server และ browser) */
const serverNow = () => new Date().toISOString()

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // บทบาทและ id จากการล็อกอินที่ยืนยันแล้ว — ไม่ใช่ cookie แบบเก่าที่ไม่ได้เซ็น (ผู้ใช้แก้เองได้)
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')
  const { userId, isAdmin } = viewer

  // แอดมิน: หน้าแรกเป็นคิวใบเบิก (queue-data.ts อ่านเฉพาะคอลัมน์ที่คิวใช้) — ไม่โหลดรายการใบที่ยังไม่จบแบบเดิม
  if (isAdmin) {
    const [params, queue, categories, paidMonths] = await Promise.all([
      searchParams,
      getQueueClaims(),
      getFinanceCategories(),
      getPaidMonths(),
    ])

    // ส่วนชำระเงินแล้ว (?status=paid&month=YYYY-MM — ลิงก์เดิมยังใช้ได้): โหลดใบที่จ่ายแล้วทีละเดือนเฉพาะตอนเปิดส่วนนี้
    // เดือนใน URL ใช้ได้เมื่อมีการจ่ายในเดือนนั้น ไม่งั้นใช้เดือนล่าสุดที่มีการจ่าย
    const showPaid = params.status === 'paid'
    const wanted = showPaid && typeof params.month === 'string' ? params.month : ''
    const paidMonth = paidMonths.some(m => m.month === wanted) ? wanted : (paidMonths[0]?.month ?? '')
    // แถวแบบเบา (list-data.ts) — ไม่มีรายการ URL / รายละเอียด / บัญชีธนาคาร
    const paid = showPaid && paidMonth ? await getPaidClaimsLean(viewer, paidMonth) : null

    return (
      <QueueView
        claims={queue.data}
        hiddenCount={queue.hiddenCount}
        error={queue.error || null}
        categories={categories}
        paidClaims={paid?.data ?? []}
        paidMonths={paidMonths}
        paidMonth={paidMonth}
        showPaid={showPaid}
        userId={userId}
        now={serverNow()}
      />
    )
  }

  // พนักงาน: รายการใบเบิกของตัวเอง (เฉพาะใบที่ยังไม่จบ) เป็นแถวแบบเบา
  const [{ data, error }, categories] = await Promise.all([
    getStaffOpenClaims(viewer),
    getFinanceCategories(),
  ])

  return (
    <ClaimsListView
      claims={data}
      error={error || null}
      categories={categories}
      isAdmin={false}
      userId={userId}
      paidClaims={[]}
      paidMonths={[]}
      paidMonth=""
    />
  )
}
