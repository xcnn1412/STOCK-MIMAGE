'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { createDocument } from '../actions'
import { DOC_TYPES, type DocBrandRow, type DocTypeCode } from '../doc-types'

interface Props {
  brands: DocBrandRow[]
}

// กลุ่มประเภทเอกสารบนหน้าเลือก (13 รหัสตาม spec)
const TYPE_GROUPS: { title: string; codes: DocTypeCode[] }[] = [
  { title: 'การเงิน', codes: ['QT', 'JO', 'IV', 'TX', 'RC', 'CN', 'PO', 'CT'] },
  { title: 'ทั่วไป', codes: ['DN', 'MM'] },
  { title: 'บุคคล (HR)', codes: ['JA', 'IA', 'RS'] },
]

export default function NewDocumentView({ brands }: Props) {
  const router = useRouter()
  const [brandCode, setBrandCode] = useState<string>(brands[0]?.code || '')
  const [docType, setDocType] = useState<DocTypeCode | ''>('')
  const [pending, startTransition] = useTransition()

  const brand = brands.find(b => b.code === brandCode) || null
  const missingTax = !!brand && (!brand.tax_id?.trim() || !brand.address?.trim())

  const handleCreate = () => {
    if (!brandCode || !docType) return
    startTransition(async () => {
      const res = await createDocument({ brand_code: brandCode, doc_type: docType })
      if ('error' in res && res.error) {
        toast.error(res.error)
        return
      }
      if ('id' in res && res.id) router.push(`/documents/${res.id}`)
    })
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-4xl">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/documents">
            <ArrowLeft className="size-4" />
            กลับ
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">สร้างเอกสาร</h1>
      </div>

      {/* ── ขั้นที่ 1: แบรนด์ ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. เลือกแบรนด์</CardTitle>
        </CardHeader>
        <CardContent>
          {brands.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              ยังไม่มีแบรนด์ที่เปิดใช้งาน — ให้ admin เพิ่มแบรนด์ในหน้าตั้งค่าก่อน
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {brands.map(b => {
                const warn = !b.tax_id?.trim() || !b.address?.trim()
                const active = b.code === brandCode
                return (
                  <button
                    key={b.code}
                    type="button"
                    onClick={() => setBrandCode(b.code)}
                    className={cn(
                      'rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                      active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate">{b.name_th}</div>
                        <div className="font-mono text-xs text-muted-foreground">{b.code}</div>
                      </div>
                      {active && <Check className="size-4 shrink-0 text-primary" />}
                    </div>
                    {warn && (
                      <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                        <AlertTriangle className="size-3" />
                        ยังไม่ตั้งค่าข้อมูลภาษี
                      </span>
                    )}
                    {!b.vat_registered && (
                      <span className="mt-2 ml-1 inline-block rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        ไม่จด VAT
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── ขั้นที่ 2: ประเภท ─────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">2. เลือกประเภทเอกสาร</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {TYPE_GROUPS.map(group => (
            <div key={group.title} className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {group.title}
              </div>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {group.codes.map(code => {
                  const def = DOC_TYPES[code]
                  // TX ปิดสำหรับแบรนด์ที่ไม่ได้จด VAT (spec §ประเภทเอกสาร)
                  const disabled = code === 'TX' && !!brand && !brand.vat_registered
                  const active = docType === code
                  return (
                    <button
                      key={code}
                      type="button"
                      disabled={disabled}
                      // ponytail: ไม่มี Tooltip ใน components/ui — ใช้ title attribute
                      title={disabled ? 'แบรนด์นี้ไม่ได้จดทะเบียน VAT — ออกใบกำกับภาษีไม่ได้' : undefined}
                      onClick={() => setDocType(code)}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-colors',
                        disabled
                          ? 'cursor-not-allowed opacity-40'
                          : 'hover:bg-muted/50',
                        active ? 'border-primary ring-1 ring-primary bg-primary/5' : 'border-border'
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold">
                          {code}
                        </span>
                        <span className="truncate text-sm font-medium">{def.label.th}</span>
                        {active && <Check className="ml-auto size-4 shrink-0 text-primary" />}
                      </div>
                      {!def.requiresApproval && (
                        <span className="mt-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          ไม่ต้องอนุมัติ
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {missingTax && docType && DOC_TYPES[docType].hasAmounts && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
          แบรนด์นี้ยังไม่มีเลขผู้เสียภาษี/ที่อยู่ — สร้างร่างได้ แต่จะส่งขออนุมัติไม่ได้จนกว่าจะตั้งค่าให้ครบ
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={handleCreate} disabled={!brandCode || !docType || pending}>
          {pending && <Loader2 className="size-4 animate-spin" />}
          สร้างร่าง
        </Button>
      </div>
    </div>
  )
}
