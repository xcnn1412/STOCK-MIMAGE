import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import KitDetailsView from './kit-details-view'

export const revalidate = 0

export default async function KitDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: kit } = await supabase.from('kits').select('*, events(name)').eq('id', params.id).single()
  
  if (!kit) notFound()

  // Get contents
  const { data: contents } = await supabase
    .from('kit_contents')
    .select('id, items(*)')
    .eq('kit_id', kit.id)

  // Get all items currently assigned to ANY kit to prevent duplicates
  const { data: allAssignedContents } = await supabase.from('kit_contents').select('item_id')
  const assignedItemIds = new Set(allAssignedContents?.map((c: any) => c.item_id))
  
  const { data: allItems } = await supabase.from('items').select('*').eq('status', 'available').order('name')
  
  // Filter out items that are already in ANY kit
  const availableItems = allItems?.filter(item => !assignedItemIds.has(item.id)) || []
  
  return <KitDetailsView kit={kit} contents={contents || []} availableItems={availableItems} />
}
