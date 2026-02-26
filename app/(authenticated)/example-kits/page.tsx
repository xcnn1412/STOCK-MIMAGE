import { supabaseServer as supabase } from '@/lib/supabase-server'
import ExampleKitsView from './example-kits-view'

export const revalidate = 0

export default async function ExampleKitsPage() {
  const { data: templates } = await supabase
    .from('kit_templates')
    .select('*, kit_template_contents(*)')
    .order('created_at', { ascending: false })

  // Sort contents by id ascending
  templates?.forEach(t => {
      if (t.kit_template_contents) {
          t.kit_template_contents.sort((a: any, b: any) => 
              (a.id > b.id) ? 1 : ((b.id > a.id) ? -1 : 0)
          )
      }
  })

  return (
    <ExampleKitsView templates={templates || []} />
  )
}
