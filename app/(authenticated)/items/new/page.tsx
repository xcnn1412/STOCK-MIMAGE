import { createServiceClient } from '@/lib/supabase-server'
import { loadCategories } from '../../stock/categories'
import NewItemForm from './new-item-form'

export default async function NewItemPage(props: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await props.searchParams
  const categories = await loadCategories(createServiceClient())
  // ?category=<id> จากหน้าตั้งค่าคลัง — ใช้เมื่อเป็นประเภทที่เปิดใช้อยู่
  const defaultCategoryId = categories.some(c => c.id === category) ? category! : null
  return <NewItemForm categories={categories} defaultCategoryId={defaultCategoryId} />
}
