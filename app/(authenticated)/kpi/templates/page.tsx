import { requireAuth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { supabaseServer as supabase } from '@/lib/supabase-server'
import TemplatesView from './templates-view'

export const revalidate = 0

export default async function TemplatesPage() {
  // Admin only — Staff ไม่สามารถจัดการ Templates ได้
  const session = await requireAuth()
  const role = session?.role
  if (role !== 'admin') {
    redirect('/kpi/dashboard')
  }

  const { data: templates } = await supabase
    .from('kpi_templates')
    .select('*')
    .order('created_at', { ascending: false })

  return <TemplatesView templates={templates || []} />
}
