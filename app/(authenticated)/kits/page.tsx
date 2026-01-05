import { supabase } from '@/lib/supabase'
import KitsView from './kits-view'

export const revalidate = 0

export default async function KitsPage() {
  const { data: kits } = await supabase
    .from('kits')
    .select('*, kit_contents(id)')
    .order('name')

  return (
    <KitsView kits={kits || []} />
  )
}
