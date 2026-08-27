import { redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { listPendingApprovals } from './actions'
import ApprovalsView from './approvals-view'

export const revalidate = 0

export const metadata = {
  title: 'รออนุมัติ — Document Control',
  description: 'เอกสารที่รอ admin อนุมัติ',
}

export default async function DocumentApprovalsPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')
  if (session.role !== 'admin') redirect('/documents')

  const rows = await listPendingApprovals()

  // ponytail: ส่งเวลา ณ ตอน render มาจาก server ตัวเดียว — คำนวณ "ค้างเกิน 24 ชม."
  // ให้ตรงกันทั้ง SSR และ hydration โดยไม่ต้องมี state/effect
  return <ApprovalsView rows={rows} userId={session.userId} nowIso={new Date().toISOString()} />
}
