import { redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { getBrands, listDocuments, type DocumentFilters } from './actions'
import DocumentsView from './documents-view'

export const revalidate = 0

export const metadata = {
  title: 'เอกสาร — Document Control',
  description: 'ระบบออกเอกสารธุรกิจและ HR',
}

type SearchParams = Record<string, string | string[] | undefined>

// ponytail: ตัวกรองอยู่ใน URL ล้วน (ไม่มี state ฝั่ง client) → ลิงก์ส่งต่อกันได้ + ไม่ต้อง sync อะไร
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || ''

export default async function DocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  const sp = await searchParams
  const filters: Required<DocumentFilters> = {
    q: one(sp.q),
    brand: one(sp.brand),
    type: one(sp.type),
    status: one(sp.status),
    month: one(sp.month),
  }

  const [list, brands] = await Promise.all([listDocuments(filters), getBrands()])

  return (
    <DocumentsView
      documents={list.data}
      error={list.error || null}
      brands={brands}
      role={session.role ?? 'staff'}
      filters={filters}
    />
  )
}
