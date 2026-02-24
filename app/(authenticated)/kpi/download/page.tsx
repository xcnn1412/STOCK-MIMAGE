import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DownloadView from './download-view'

export const revalidate = 0

export default async function DownloadPage() {
  // Admin only
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value
  if (role !== 'admin') {
    redirect('/kpi/dashboard')
  }

  // ดึงข้อมูลทั้งหมดพร้อมกัน
  const [
    { data: templates },
    { data: assignments },
    { data: evaluations },
  ] = await Promise.all([
    supabase
      .from('kpi_templates')
      .select('*')
      .order('created_at', { ascending: false }),
    supabase
      .from('kpi_assignments')
      .select('*, kpi_templates(name, mode), profiles!kpi_assignments_assigned_to_fkey(full_name, department)')
      .order('created_at', { ascending: false }),
    supabase
      .from('kpi_evaluations')
      .select('*, kpi_assignments(*, kpi_templates(name, mode), profiles!kpi_assignments_assigned_to_fkey(full_name, department))')
      .order('evaluation_date', { ascending: false }),
  ])

  return (
    <DownloadView
      templates={templates || []}
      assignments={assignments || []}
      evaluations={evaluations || []}
    />
  )
}
