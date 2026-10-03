import { supabaseServer as supabase } from '@/lib/supabase-server'
import ItemsView from './items-view'

import type { Item } from '@/types'

export const revalidate = 3600 

export default async function ItemsPage() {
  const { data: items } = await supabase
    .from('items')
    .select(`
        *,
        shelves ( code ),
        kit_contents (
            quantity,
            kits (
                id,
                name,
                shelves ( code ),
                events (
                    id,
                    name
                )
            )
        )
    `)
    .order('name')

  return (
    <ItemsView items={(items || []) as Item[]} />
  )
}
