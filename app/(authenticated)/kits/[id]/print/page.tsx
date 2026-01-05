import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import PrintView from './print-view'

export default async function PrintPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: kit } = await supabase.from('kits').select('*').eq('id', params.id).single()
  
  if (!kit) notFound()

  return <PrintView kit={kit} />
}
