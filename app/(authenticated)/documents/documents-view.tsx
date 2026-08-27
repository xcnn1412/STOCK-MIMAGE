'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'
import { DOC_TYPES, STATUS_LABEL, type DocBrandRow, type DocumentRow } from './doc-types'

interface Props {
  documents: DocumentRow[]
  error: string | null
  brands: DocBrandRow[]
  role: string
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

// ponytail: ตารางล้วน ไม่มีตัวกรอง — ตัวกรอง/ค้นหามาใน Ticket 3
export default function DocumentsView({ documents, error, brands }: Props) {
  const { lang } = useLanguage()
  const router = useRouter()
  const brandName = (code: string) =>
    brands.find(b => b.code === code)?.name_th || code

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{lang === 'th' ? 'เอกสาร' : 'Documents'}</h1>
        <Button asChild>
          <Link href="/documents/new">
            <Plus className="size-4" />
            {lang === 'th' ? 'สร้างเอกสาร' : 'New document'}
          </Link>
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{lang === 'th' ? 'เลขที่' : 'Number'}</TableHead>
                <TableHead>{lang === 'th' ? 'ประเภท' : 'Type'}</TableHead>
                <TableHead>{lang === 'th' ? 'แบรนด์' : 'Brand'}</TableHead>
                <TableHead>{lang === 'th' ? 'คู่สัญญา' : 'Party'}</TableHead>
                <TableHead className="text-right">{lang === 'th' ? 'ยอดรวม' : 'Total'}</TableHead>
                <TableHead>{lang === 'th' ? 'สถานะ' : 'Status'}</TableHead>
                <TableHead>{lang === 'th' ? 'ผู้สร้าง' : 'Created by'}</TableHead>
                <TableHead>{lang === 'th' ? 'วันที่' : 'Date'}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documents.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-24 text-center text-muted-foreground">
                    {lang === 'th' ? 'ยังไม่มีเอกสาร' : 'No documents yet'}
                  </TableCell>
                </TableRow>
              )}
              {documents.map(doc => {
                const status = STATUS_LABEL[doc.status]
                return (
                  <TableRow
                    key={doc.id}
                    className="cursor-pointer"
                    onClick={() => router.push(`/documents/${doc.id}`)}
                  >
                    <TableCell className="font-mono">
                      <Link href={`/documents/${doc.id}`} className="hover:underline">
                        {doc.doc_no || doc.draft_no}
                      </Link>
                    </TableCell>
                    <TableCell>{DOC_TYPES[doc.doc_type]?.label[lang] || doc.doc_type}</TableCell>
                    <TableCell>{brandName(doc.brand_code)}</TableCell>
                    <TableCell>{doc.party_name || '-'}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {Number(doc.total || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium', status?.color)}>
                        {status ? status[lang] : doc.status}
                      </span>
                    </TableCell>
                    <TableCell>{doc.creator?.full_name || '-'}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatDate(doc.doc_date || doc.created_at)}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
