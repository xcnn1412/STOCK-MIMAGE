import { redirect } from 'next/navigation'
import { requireAuth } from '@/lib/auth'
import { getBrands, listDocuments } from './actions'
import DocumentsView from './documents-view'

export const revalidate = 0

export const metadata = {
  title: 'เอกสาร — Document Control',
  description: 'ระบบออกเอกสารธุรกิจและ HR',
}

export default async function DocumentsPage() {
  const session = await requireAuth()
  if (!session) redirect('/login')

  const [list, brands] = await Promise.all([listDocuments(), getBrands()])

  return (
    <DocumentsView
      documents={list.data}
      error={list.error || null}
      brands={brands}
      role={session.role}
    />
  )
}
