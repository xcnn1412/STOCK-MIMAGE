import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import EvaluateView from './evaluate-view'

export const revalidate = 0

export default async function EvaluatePage() {
  // ตรวจสอบ admin only
  const cookieStore = await cookies()
  const role = cookieStore.get('session_role')?.value
  if (role !== 'admin') {
    redirect('/kpi/dashboard')
  }

  // ดึง assignments ที่ active พร้อม profile + template + evaluations
  const { data: assignments } = await supabase
    .from('kpi_assignments')
    .select('*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department), kpi_evaluations(*)')
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return <EvaluateView assignments={assignments || []} />
}
