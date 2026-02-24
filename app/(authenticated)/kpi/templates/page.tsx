import { supabase } from '@/lib/supabase'
import TemplatesView from './templates-view'

export const revalidate = 0

export default async function TemplatesPage() {
  const { data: templates } = await supabase
    .from('kpi_templates')
    .select('*')
    .order('created_at', { ascending: false })

  return <TemplatesView templates={templates || []} />
}
