import { cookies } from 'next/headers'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import ReportsView from './reports-view'

export const revalidate = 0

export default async function ReportsPage() {
  const cookieStore = await cookies()
  const userId = cookieStore.get('session_user_id')?.value
  const role = cookieStore.get('session_role')?.value
  const isAdmin = role === 'admin'

  // ดึง evaluations พร้อม assignment + template + profile
  // Admin: ดึงทั้งหมด | Staff: ใช้ !inner join กรองเฉพาะ KPI ของตัวเอง
  const { data: evaluations } = isAdmin
    ? await supabase
        .from('kpi_evaluations')
        .select('*, kpi_assignments(*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department)), evaluator:profiles!kpi_evaluations_evaluated_by_fkey(id, full_name)')
        .order('evaluation_date', { ascending: false })
    : await supabase
        .from('kpi_evaluations')
        .select('*, kpi_assignments!inner(*, kpi_templates(*), profiles!kpi_assignments_assigned_to_fkey(id, full_name, department)), evaluator:profiles!kpi_evaluations_evaluated_by_fkey(id, full_name)')
        .eq('kpi_assignments.assigned_to', userId!)
        .order('evaluation_date', { ascending: false })

  // ดึง replies ของทุก evaluation ในหน้านี้
  const evaluationIds = (evaluations || []).map(e => e.id)
  const { data: replies } = evaluationIds.length > 0 
    ? await supabase
        .from('kpi_evaluation_replies')
        .select('*, profiles:created_by(id, full_name, department)')
        .in('evaluation_id', evaluationIds)
        .order('created_at', { ascending: true })
    : { data: [] }

  // profiles สำหรับ filter/mention (ทุกคนที่ active)
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, full_name, department')
    .eq('is_approved', true)
    .order('full_name')
    
  // ดึง custom emojis
  const { data: customEmojis } = await supabase
    .from('custom_emojis')
    .select('*')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  return (
    <ReportsView
      evaluations={evaluations || []}
      replies={replies || []}
      profiles={allProfiles || []}
      customEmojis={customEmojis || []}
      isAdmin={isAdmin}
      currentUserId={userId || ''}
    />
  )
}
