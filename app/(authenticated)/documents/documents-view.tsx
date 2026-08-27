'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Search, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  DOC_TYPES, STATUS_LABEL,
  type DocBrandRow, type DocStatus, type DocTypeCode, type DocumentRow,
} from './doc-types'

// ponytail: ข้อความไทยฮาร์ดโค้ด (ไม่ผ่าน t()) — หน้านี้ใช้ภายในทีมไทยล้วน
interface Filters {
  q: string
  brand: string
  type: string
  status: string
  month: string
}

interface Props {
  documents: DocumentRow[]
  error: string | null
  brands: DocBrandRow[]
  role: string
  filters: Filters
}

const ALL = 'all' // Radix Select ห้าม value = '' → ใช้ sentinel

const TYPE_GROUPS: { label: string; codes: DocTypeCode[] }[] = [
  { label: 'เอกสารการเงิน', codes: ['QT', 'JO', 'IV', 'TX', 'RC', 'CN', 'PO', 'CT'] },
  { label: 'ส่งมอบ/ภายใน', codes: ['DN', 'MM'] },
  { label: 'เอกสารบุคคล', codes: ['JA', 'IA', 'RS'] },
]

const STATUS_CHIPS: DocStatus[] = [
  'draft', 'pending_approval', 'rejected', 'issued', 'sent', 'closed', 'void',
]

function buildHref(f: Filters) {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.brand) p.set('brand', f.brand)
  if (f.type) p.set('type', f.type)
  if (f.status) p.set('status', f.status)
  if (f.month) p.set('month', f.month)
  const qs = p.toString()
  return qs ? `/documents?${qs}` : '/documents'
}

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' })
}

const fmtMoney = (n: number) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export default function DocumentsView({ documents, error, brands, role, filters }: Props) {
  const router = useRouter()
  const [q, setQ] = useState(filters.q)

  const apply = (next: Partial<Filters>) =>
    router.replace(buildHref({ ...filters, q, ...next }), { scroll: false })

  // ค้นหาแบบ debounce → เขียนกลับลง URL (server กรองให้)
  useEffect(() => {
    if (q === filters.q) return
    const t = setTimeout(() => {
      router.replace(buildHref({ ...filters, q }), { scroll: false })
    }, 350)
    return () => clearTimeout(t)
  }, [q, filters, router])

  const brandName = (code: string) => brands.find(b => b.code === code)?.name_th || code

  // ponytail: นับจากแถวที่ได้กลับมาเท่านั้น (listDocuments limit 200 แถว และตัวกรองอื่นมีผลด้วย)
  // → ถ้าเลือกสถานะใดสถานะหนึ่งอยู่ ชิปอื่นจะเป็น 0 จึงซ่อนตัวเลขทิ้งแทนที่จะโชว์ 0 หลอกตา
  const counts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const d of documents) c[d.status] = (c[d.status] || 0) + 1
    return c
  }, [documents])

  const hasFilters = Boolean(filters.q || filters.brand || filters.type || filters.status || filters.month)

  const clearAll = () => {
    setQ('')
    router.replace('/documents', { scroll: false })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">เอกสาร</h1>
          <p className="text-sm text-muted-foreground">แสดง {documents.length} รายการ</p>
        </div>
        <Button asChild>
          <Link href="/documents/new">
            <Plus className="size-4" />
            สร้างเอกสาร
          </Link>
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {role !== 'admin' && (
        <p className="text-xs text-muted-foreground">
          คุณเห็นเอกสารที่ออกเลขแล้วทั้งหมด และร่างของคุณเอง
        </p>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="ค้นหาเลขที่ / ชื่อคู่สัญญา"
            className="pl-8"
          />
        </div>

        <Select
          value={filters.brand || ALL}
          onValueChange={v => apply({ brand: v === ALL ? '' : v })}
        >
          <SelectTrigger className="w-37.5">
            <SelectValue placeholder="ทุกแบรนด์" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกแบรนด์</SelectItem>
            {brands.map(b => (
              <SelectItem key={b.code} value={b.code}>{b.code} · {b.name_th}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.type || ALL}
          onValueChange={v => apply({ type: v === ALL ? '' : v })}
        >
          <SelectTrigger className="w-47.5">
            <SelectValue placeholder="ทุกประเภท" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกประเภท</SelectItem>
            {TYPE_GROUPS.map(group => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.codes.map(code => (
                  <SelectItem key={code} value={code}>
                    {DOC_TYPES[code].label.th}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.status || ALL}
          onValueChange={v => apply({ status: v === ALL ? '' : v })}
        >
          <SelectTrigger className="w-35">
            <SelectValue placeholder="ทุกสถานะ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>ทุกสถานะ</SelectItem>
            {STATUS_CHIPS.map(s => (
              <SelectItem key={s} value={s}>{STATUS_LABEL[s].th}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          type="month"
          value={filters.month}
          onChange={e => apply({ month: e.target.value })}
          className="w-40"
        />

        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearAll}>
            <X className="size-4" />
            ล้างตัวกรอง
          </Button>
        )}
      </div>

      {/* Quick status chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => apply({ status: '' })}
          className={cn(
            'rounded-full border px-3 py-1 text-xs transition-colors',
            !filters.status
              ? 'border-transparent bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent'
          )}
        >
          ทั้งหมด <span className="tabular-nums">{documents.length}</span>
        </button>
        {STATUS_CHIPS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => apply({ status: filters.status === s ? '' : s })}
            className={cn(
              'rounded-full border px-3 py-1 text-xs transition-colors',
              filters.status === s
                ? 'border-transparent bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {STATUS_LABEL[s].th}
            {counts[s] ? <span className="ml-1 tabular-nums">{counts[s]}</span> : null}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {documents.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-4 py-14 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {hasFilters ? 'ไม่พบเอกสารที่ตรงกับตัวกรอง' : 'ยังไม่มีเอกสาร'}
              </p>
              {hasFilters ? (
                <Button variant="outline" size="sm" onClick={clearAll}>ล้างตัวกรอง</Button>
              ) : (
                <Button asChild size="sm">
                  <Link href="/documents/new">
                    <Plus className="size-4" />
                    สร้างเอกสาร
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>เลขที่</TableHead>
                    <TableHead>ประเภท</TableHead>
                    <TableHead>คู่สัญญา</TableHead>
                    <TableHead className="text-right">ยอดสุทธิ</TableHead>
                    <TableHead>สถานะ</TableHead>
                    <TableHead>ผู้สร้าง</TableHead>
                    <TableHead>วันที่</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {documents.map(doc => {
                    const status = STATUS_LABEL[doc.status]
                    const def = DOC_TYPES[doc.doc_type]
                    return (
                      <TableRow
                        key={doc.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/documents/${doc.id}`)}
                      >
                        <TableCell className="whitespace-nowrap font-mono">
                          {doc.doc_no ? (
                            <span className="font-semibold">{doc.doc_no}</span>
                          ) : (
                            <span className="flex items-center gap-1.5">
                              <span className="text-muted-foreground">{doc.draft_no}</span>
                              <Badge variant="outline" className="font-sans">ร่าง</Badge>
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          <span className="flex items-center gap-1.5">
                            {def?.label.th || doc.doc_type}
                            <Badge variant="secondary" className="font-mono" title={brandName(doc.brand_code)}>
                              {doc.brand_code}
                            </Badge>
                          </span>
                        </TableCell>
                        <TableCell>
                          <div>{doc.party_name || '-'}</div>
                          {doc.party_company && (
                            <div className="text-xs text-muted-foreground">{doc.party_company}</div>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums whitespace-nowrap">
                          {def?.hasAmounts ? fmtMoney(doc.net_payable) : '—'}
                        </TableCell>
                        <TableCell>
                          <span className={cn('inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap', status?.color)}>
                            {status ? status.th : doc.status}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{doc.creator?.full_name || '-'}</TableCell>
                        <TableCell className="whitespace-nowrap">{formatDate(doc.doc_date || doc.created_at)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
