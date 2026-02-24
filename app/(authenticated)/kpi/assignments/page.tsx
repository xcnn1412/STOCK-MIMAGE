import { supabase } from '@/lib/supabase'
import AssignmentsView from './assignments-view'

export const revalidate = 0

export default async function AssignmentsPage() {
  // ดึงข้อมูลพร้อมกัน: assignments + templates + profiles
  const [
    { data: assignments },
    { data: templates },
    { data: profiles }
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
  ])

  return (
    <AssignmentsView
      assignments={assignments || []}
      templates={templates || []}
      profiles={profiles || []}
    />
  )
}
