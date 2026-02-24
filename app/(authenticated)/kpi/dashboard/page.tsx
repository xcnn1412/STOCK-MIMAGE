import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import DashboardView from './dashboard-view'

export const revalidate = 0

export default async function KpiDashboardPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  // ดึง stats ทั้งหมด
  const [
    { count: templateCount },
    { count: assignmentCount },
    { data: myAssignments },
    { data: recentEvaluations },
    { count: pendingEvalCount }
  ] = await Promise.all([
    supabase.from('kpi_templates').select('*', { count: 'exact', head: true }),
    supabase.from('kpi_assignments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    // ถ้า admin ดึงทั้งหมด ถ้า staff ดึงเฉพาะตัวเอง
    isAdmin
      ? supabase.from('kpi_assignments').select('*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department), kpi_evaluations(*)').eq('status', 'active').order('created_at', { ascending: false }).limit(10)
      : supabase.from('kpi_assignments').select('*, kpi_templates(*), kpi_evaluations(*)').eq('assigned_to', userId!).eq('status', 'active').order('created_at', { ascending: false }),
    supabase.from('kpi_evaluations').select('*, kpi_assignments(*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name))').order('created_at', { ascending: false }).limit(5),
    supabase.from('kpi_assignments').select('*', { count: 'exact', head: true }).eq('status', 'active'),
  ])

  return (
    <DashboardView
      isAdmin={isAdmin}
      templateCount={templateCount || 0}
      assignmentCount={assignmentCount || 0}
      myAssignments={(myAssignments || []) as any}
      recentEvaluations={(recentEvaluations || []) as any}
      pendingEvalCount={pendingEvalCount || 0}
    />
  )
}
