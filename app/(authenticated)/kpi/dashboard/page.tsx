import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import DashboardView from './dashboard-view'

export const revalidate = 0

export default async function KpiDashboardPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  // ดึง stats + evaluations (แยกตาม role)
  const [
    { count: templateCount },
    { count: assignmentCount },
    { data: evaluations },
    { data: profiles },
    { data: myAssignments },
  ] = await Promise.all([
    supabase.from('kpi_templates').select('*', { count: 'exact', head: true }),
    isAdmin
      ? supabase.from('kpi_assignments').select('*', { count: 'exact', head: true }).eq('status', 'active')
      : supabase.from('kpi_assignments').select('*', { count: 'exact', head: true }).eq('status', 'active').eq('assigned_to', userId!),
    // Evaluations: Admin ดูทั้งหมด, Staff ดูเฉพาะตัวเอง
    isAdmin
      ? supabase
          .from('kpi_evaluations')
          .select('*, kpi_assignments(*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department))')
          .order('evaluation_date', { ascending: false })
      : supabase
          .from('kpi_evaluations')
          .select('*, kpi_assignments!inner(*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department))')
          .eq('kpi_assignments.assigned_to', userId!)
          .order('evaluation_date', { ascending: false }),
    // Profiles for filter (admin only)
    isAdmin
      ? supabase.from('profiles').select('id, full_name, department').eq('is_approved', true).order('full_name')
      : { data: [] as any[] },
    // Staff's own assignments for self-evaluation
    !isAdmin && userId
      ? supabase
          .from('kpi_assignments')
          .select('*, kpi_templates(*), kpi_evaluations(*)')
          .eq('status', 'active')
          .eq('assigned_to', userId)
          .order('created_at', { ascending: false })
      : { data: [] as any[] },
  ])

  return (
    <DashboardView
      isAdmin={isAdmin}
      templateCount={templateCount || 0}
      assignmentCount={assignmentCount || 0}
      evaluations={(evaluations || []) as any}
      profiles={(profiles || []) as any}
      myAssignments={(myAssignments || []) as any}
    />
  )
}
