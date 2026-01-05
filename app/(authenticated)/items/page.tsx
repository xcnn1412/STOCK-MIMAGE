import { supabase } from '@/lib/supabase'
import ItemsView from './items-view'

export const revalidate = 3600 

export default async function ItemsPage() {
  const { data: items } = await supabase
    .from('items')
    .select(`
        *,
        kit_contents (
            kits (
                id,
                name,
                events (
                    id,
                    name
                )
            )
        )
    `)
    .order('name')

  return (
    <ItemsView items={items || []} />
  )
}
