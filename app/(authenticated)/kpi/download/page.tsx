import { cookies } from 'next/headers'
import { supabase } from '@/lib/supabase'
import DownloadView from './download-view'

export const revalidate = 0

export default async function DownloadPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  // Admin: ดึงข้อมูลทั้งหมด | Staff: ดึงเฉพาะข้อมูลตัวเอง
  const [
    { data: templates },
    { data: assignments },
    { data: evaluations },
  ] = await Promise.all([
    // Templates — Admin เท่านั้นที่เห็น (Staff ไม่มีสิทธิ์ดู template)
    isAdmin
      ? supabase
          .from('kpi_templates')
          .select('*')
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as any[] }),
    // Assignments — Admin ทั้งหมด | Staff เฉพาะของตัวเอง
    isAdmin
      ? supabase
          .from('kpi_assignments')
          .select('*, kpi_templates(name, mode), profiles!kpi_assignments_assigned_to_fkey(full_name, department)')
          .order('created_at', { ascending: false })
      : supabase
          .from('kpi_assignments')
          .select('*, kpi_templates(name, mode), profiles!kpi_assignments_assigned_to_fkey(full_name, department)')
          .eq('assigned_to', userId!)
          .order('created_at', { ascending: false }),
    // Evaluations — Admin ทั้งหมด | Staff เฉพาะของตัวเอง
    isAdmin
      ? supabase
          .from('kpi_evaluations')
          .select('*, kpi_assignments(*, kpi_templates(name, mode), profiles!kpi_assignments_assigned_to_fkey(full_name, department))')
          .order('evaluation_date', { ascending: false })
      : supabase
          .from('kpi_evaluations')
          .select('*, kpi_assignments!inner(*, kpi_templates(name, mode), profiles!kpi_assignments_assigned_to_fkey(full_name, department))')
          .eq('kpi_assignments.assigned_to', userId!)
          .order('evaluation_date', { ascending: false }),
  ])

  return (
    <DownloadView
      templates={templates || []}
      assignments={assignments || []}
      evaluations={evaluations || []}
      isAdmin={isAdmin}
    />
  )
}
