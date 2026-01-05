import { supabase } from '@/lib/supabase'
import ExampleKitsView from './example-kits-view'

export const revalidate = 0

export default async function ExampleKitsPage() {
  const { data: templates } = await supabase
    .from('kit_templates')
    .select('*, kit_template_contents(*)')
    .order('created_at', { ascending: false })

  return (
    <ExampleKitsView templates={templates || []} />
  )
}
