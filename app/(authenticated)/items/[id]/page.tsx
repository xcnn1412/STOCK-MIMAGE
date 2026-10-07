import { supabaseServer as supabase, createServiceClient } from '@/lib/supabase-server'
import { notFound } from 'next/navigation'
import { loadCategories } from '../../stock/categories'
import EditItemForm from './edit-item-form'

export default async function ItemDetailsPage(props: { params: Promise<{ id: string }>, searchParams: Promise<{ returnTo?: string }> }) {
  const params = await props.params;
  const searchParams = await props.searchParams;
  const [{ data: item }, allCategories] = await Promise.all([
    supabase.from('items').select('*').eq('id', params.id).single(),
    loadCategories(createServiceClient(), { includeInactive: true }),
  ])
  
  if (!item) notFound()

  // ประเภทที่เปิดใช้ + ประเภทปัจจุบันของชิ้นนี้ (แม้ปิดใช้ไปแล้ว) ให้ค่าเดิมไม่หาย
  const categories = allCategories.filter(c => c.is_active || c.id === item.category_id)

  return <EditItemForm item={item} categories={categories} returnTo={searchParams.returnTo} />
}
