import { supabaseServer as supabase } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import EditItemForm from './edit-item-form'

export default async function ItemDetailsPage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ returnTo?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const { data: item } = await supabase.from('items').select('*').eq('id', params.id).single()
  
  if (!item) notFound()

  return <EditItemForm item={item} returnTo={searchParams.returnTo} />
}
