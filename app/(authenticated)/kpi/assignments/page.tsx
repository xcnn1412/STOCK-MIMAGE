import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import AssignmentsView from './assignments-view'

export const revalidate = 0

export default async function AssignmentsPage() {
  // Admin only — Staff ไม่สามารถจัดการ Assignments ได้
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value
  if (role !== 'admin') {
    redirect('/kpi/dashboard')
  }

  // ดึงข้อมูลพร้อมกัน: assignments + templates + profiles + latest evaluations
  const [
    { data: assignments },
    { data: templates },
    { data: profiles },
    { data: evaluations },
  ] = await Promise.all([
    supabase
      .from('kpi_assignments')
      .select('*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department)')
      .order('created_at', { ascending: false }),
    supabase
      .from('kpi_templates')
      .select('id, name, mode, default_target, target_unit')
      .order('name'),
    supabase
      .from('profiles')
      .select('id, full_name, department, role')
      .eq('is_approved', true)
      .order('full_name'),
    supabase
      .from('kpi_evaluations')
      .select('assignment_id, actual_value, score, achievement_pct, evaluation_date')
      .order('evaluation_date', { ascending: false }),
  ])

  return (
    <AssignmentsView
      assignments={assignments || []}
      templates={templates || []}
      profiles={profiles || []}
      evaluations={evaluations || []}
    />
  )
}
