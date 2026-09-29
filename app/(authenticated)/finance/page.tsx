import { cookies } from 'next/headers'
import { getClaims, getPaidMonths } from './actions'
import { getFinanceCategories } from './settings-actions'
import ClaimsListView from './claims-list-view'
import type { ExpenseClaim } from '../costs/types'

export const revalidate = 0

export const metadata = {
  title: 'เบิกเงิน — Finance',
  description: 'ระบบเบิกเงินและใบเบิกค่าใช้จ่าย',
}

export default async function FinancePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'
  const userId = cookieStore.get('session_user_id')?.value || ''
  const isAdmin = role === 'admin'

  // โหลดเฉพาะใบที่ยังไม่จบ — ใบที่จ่ายแล้วโหลดทีละเดือน (ครบทุกใบราว 5MB ต่อการเปิดหน้า และโตทุกเดือน)
  const [params, { data, error }, categories, paidMonths] = await Promise.all([
    searchParams,
    getClaims({ open: true }),
    getFinanceCategories(),
    isAdmin ? getPaidMonths() : Promise.resolve([]),
  ])

  // เดือนใน URL เป็นเดือนที่จ่ายเฉพาะในแท็บชำระแล้ว (แท็บอื่นคือตัวกรองเดือนที่ใช้จ่ายของ browser)
  // ใช้ได้เมื่อมีการจ่ายในเดือนนั้น ไม่งั้นใช้เดือนล่าสุดที่มีการจ่าย
  const wanted = params.status === 'paid' && typeof params.month === 'string' ? params.month : ''
  const paidMonth = paidMonths.some(m => m.month === wanted) ? wanted : (paidMonths[0]?.month ?? '')
  const paid = isAdmin && paidMonth
    ? await getClaims({ status: ['paid', 'refund_confirmed'], paidMonth })
    : null

  return (
    <ClaimsListView
      claims={(data || []) as unknown as ExpenseClaim[]}
      error={error || null}
      categories={categories}
      isAdmin={isAdmin}
      userId={userId}
      paidClaims={(paid?.data || []) as unknown as ExpenseClaim[]}
      paidMonths={paidMonths}
      paidMonth={paidMonth}
    />
  )
}
