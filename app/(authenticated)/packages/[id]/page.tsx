import { notFound, redirect } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase-server'
import { getKitManager } from '@/lib/kit-bookings'
import { loadCategories } from '../../stock/categories'
import { loadCategoryUnits, loadPackageDetail } from '../queries'
import PackageEditor from './package-editor'

export const revalidate = 0

/** แก้แพ็กเกจ + ข้อกำหนด + ตัวเลือกอุปกรณ์ — admin และแผนกที่ดูแลอุปกรณ์เท่านั้น */
export default async function PackageEditPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await getKitManager())) redirect('/packages')
  const { id } = await params

  const db = createServiceClient()
  const [pkg, categories, units] = await Promise.all([loadPackageDetail(db, id), loadCategories(db, { includeInactive: true }), loadCategoryUnits(db)])
  if (!pkg) notFound()

  return <PackageEditor pkg={pkg} categories={categories} units={units} />
}
