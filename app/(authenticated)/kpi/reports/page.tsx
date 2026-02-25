import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import ReportsView from './reports-view'

export const revalidate = 0

export default async function ReportsPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  // ดึง evaluations พร้อม assignment + template + profile
  const query = supabase
    .from('kpi_evaluations')
    .select('*, kpi_assignments(*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department))')
    .order('evaluation_date', { ascending: false })

  // Staff เห็นเฉพาะ KPI ตัวเอง
  if (!isAdmin && userId) {
    query.eq('kpi_assignments.assigned_to', userId)
  }

  const { data: evaluations } = await query

  // profiles สำหรับ filter (admin only)
  const { data: profiles } = isAdmin
    ? await supabase.from('profiles').select('id, full_name, department').eq('is_approved', true).order('full_name')
    : { data: [] }

  return (
    <ReportsView
      evaluations={evaluations || []}
      profiles={profiles || []}
      isAdmin={isAdmin}
    />
  )
}
