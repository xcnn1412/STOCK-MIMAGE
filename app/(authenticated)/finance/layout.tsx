import { redirect } from 'next/navigation'
import FinanceNav from './finance-nav'
import { getFinanceViewer } from './viewer'

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  // แท็บตามบทบาทที่ยืนยันแล้ว (cookie บทบาทแบบเก่าไม่ได้เซ็น ผู้ใช้แก้เองได้ ใช้ตัดสินไม่ได้)
  const viewer = await getFinanceViewer()
  if (!viewer) redirect('/login')

  return (
    <>
      <FinanceNav role={viewer.role} />
      <div className="mt-6">
        {children}
      </div>
    </>
  )
}
