import { supabaseServer as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import CheckListForm from './return-checklist'

export const revalidate = 0

export default async function EventReturnPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: event } = await supabase.from('events').select('*').eq('id', params.id).single()
  
  if (!event) notFound()

  // 1. Get kits assigned to event
  const { data: kits } = await supabase
    .from('kits')
    .select('id, name')
    .eq('event_id', event.id)

  if (!kits) {
      // Should handle no kits gracefully
      return <CheckListForm event={event} itemsByKit={{}} />
  }

  // 2. Fetch contents for each kit
  // We need to fetch items for these kits.
  // kit_contents table links kit_id -> item_id
  // items table has the details
  
  const kitIds = kits.map(k => k.id)
  
  // Note: if kitIds is empty Supabase in() might fail or return nothing, strictly handled above but check just in case
  let itemsByKit: Record<string, { kitName: string, items: any[] }> = {}
  
  if (kitIds.length > 0) {
      // We want to group by Kit.
      // Let's fetch kit_contents with items joined
      const { data: contents } = await supabase
        .from('kit_contents')
        .select(`
            kit_id, 
            items (*)
        `)
        .in('kit_id', kitIds)
      
      // Group them manually
      contents?.forEach((c: any) => {
          const kitName = kits.find(k => k.id === c.kit_id)?.name || 'Unknown Kit'
          if (!itemsByKit[c.kit_id]) {
              itemsByKit[c.kit_id] = { kitName, items: [] }
          }
          if (c.items) {
              itemsByKit[c.kit_id].items.push(c.items)
          }
      })
  }

  return (
    <CheckListForm event={event} itemsByKit={itemsByKit} />
  )
}
