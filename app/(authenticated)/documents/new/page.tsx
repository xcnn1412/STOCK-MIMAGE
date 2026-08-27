import { redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { getBrands } from '../actions'
import NewDocumentView from './new-document-view'

export const revalidate = 0

export const metadata = {
  title: 'สร้างเอกสาร — Document Control',
  description: 'เลือกแบรนด์และประเภทเอกสาร',
}

export default async function NewDocumentPage() {
  const session = await getSession()
  if (!session.userId) redirect('/login')

  const brands = await getBrands()

  return <NewDocumentView brands={brands} />
}
