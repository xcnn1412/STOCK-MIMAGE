import { supabaseServer as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import EditTemplateView from './edit-view'

export const revalidate = 0

export default async function EditExampleKitPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: template } = await supabase.from('kit_templates').select('*').eq('id', params.id).single()
  
  if (!template) notFound()

  const { data: contents } = await supabase
    .from('kit_template_contents')
    .select('*')
    .eq('template_id', template.id)
    .order('id', { ascending: true })

  return <EditTemplateView template={template} contents={contents || []} />
}
