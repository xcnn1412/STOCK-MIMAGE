import { notFound, redirect } from 'next/navigation'
import { getSession } from '@/app/(authenticated)/documents/session'
import { getDocument, listRefCandidates } from '../actions'
import { DOC_TYPES } from '../doc-types'
import DocumentDetailView from './document-view'

export const revalidate = 0

export default async function DocumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getSession()
  if (!session.userId) redirect('/login')

  const res = await getDocument(id)
  if ('error' in res) notFound()

  const def = DOC_TYPES[res.document.doc_type]
  const refCandidates = def?.refTypes.length
    ? await listRefCandidates(res.document.brand_code, def.refTypes)
    : []

  return (
    <DocumentDetailView
      doc={res.document}
      items={res.items}
      logs={res.logs}
      brand={res.brand}
      refDocument={res.refDocument}
      referencedBy={res.referencedBy}
      refCandidates={refCandidates}
      role={session.role ?? 'staff'}
      userId={session.userId}
    />
  )
}
