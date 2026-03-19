import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { getGoalsWithActuals } from './actions'
import GoalsView from './goals-view'

export const metadata = {
  title: 'Goals — Overview',
  description: 'ตั้งเป้าหมายภาพรวมธุรกิจ ยอดขาย จำนวนงาน กำไร ต้นทุน',
}

export const revalidate = 0

export default async function GoalsPage() {
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value || 'staff'

  if (role !== 'admin') redirect('/dashboard')

  const currentYear = new Date().getFullYear()
  const { goals, actuals, error } = await getGoalsWithActuals(currentYear)

  if (error) redirect('/overview')

  return <GoalsView initialGoals={goals as any} initialActuals={actuals as any} currentYear={currentYear} />
}
