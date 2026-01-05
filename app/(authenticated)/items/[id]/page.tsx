import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import EditItemForm from './edit-item-form'

export default async function ItemDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: item } = await supabase.from('items').select('*').eq('id', params.id).single()
  
  if (!item) notFound()

  return <EditItemForm item={item} />
}
