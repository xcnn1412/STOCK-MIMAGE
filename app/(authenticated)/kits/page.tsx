import { supabaseServer as supabase } from '@/lib/supabase-server'
import KitsView from './kits-view'

import type { Kit } from '@/types'

export const revalidate = 0

export default async function KitsPage() {
  const { data: kits } = await supabase
    .from('kits')
    .select('*, kit_contents(id)')
    .order('name')

  return (
    <KitsView kits={(kits || []) as Kit[]} />
  )
}
