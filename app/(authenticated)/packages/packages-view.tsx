'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, Boxes, Copy, Pencil, Plus, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useConfirm } from '../finance/use-confirm'
import { requirementSummary } from './package-logic'
import type { PackageSummary } from './types'
import { deletePackage, duplicatePackage, reorderPackages } from './actions'

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
const baht = (n: number) => `${n.toLocaleString('th-TH', { maximumFractionDigits: 2 })} บาท`

export default function PackagesView({ packages, canEdit }: { packages: PackageSummary[]; canEdit: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [busyId, setBusyId] = useState<string | null>(null)
  const { confirm: ask, dialog } = useConfirm()

  const move = (index: number, dir: -1 | 1) => {
    const ids = packages.map(p => p.id)
    const to = index + dir
    if (to < 0 || to >= ids.length) return
    ;[ids[index], ids[to]] = [ids[to], ids[index]]
    startTransition(async () => {
      const res = await reorderPackages(ids)
      if ('error' in res) toast.error(res.error)
    })
  }

  const duplicate = async (p: PackageSummary) => {
    setBusyId(p.id)
    const res = await duplicatePackage(p.id)
    setBusyId(null)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    toast.success(`คัดลอกแพ็กเกจ "${p.name}" แล้ว`)
    router.push(`/packages/${res.id}`)
  }

  const remove = async (p: PackageSummary) => {
    const ok = await ask({
      title: `ลบแพ็กเกจ "${p.name}"?`,
      description: 'ลบได้เฉพาะแพ็กเกจที่ยังไม่มีงานเลือกไว้ — ถ้ามีงานใช้อยู่ให้ปิดใช้แทน',
      variant: 'destructive',
      confirmLabel: 'ลบ',
    })
    if (!ok) return
    const res = await deletePackage(p.id)
    if ('error' in res) toast.error(res.error)
    else toast.success(`ลบแพ็กเกจ "${p.name}" แล้ว`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
            <Boxes className="h-6 w-6 text-zinc-500" /> แพ็กเกจ
          </h2>
          <p className="text-sm text-muted-foreground">แต่ละแพ็กเกจกำหนดว่าใช้ประเภทอุปกรณ์อะไร กี่ชิ้น และเลือกได้จากชิ้นไหนบ้าง</p>
        </div>
        {canEdit && (
          <Link href="/packages/new">
            <Button>
              <Plus className="mr-1 h-4 w-4" /> เพิ่มแพ็กเกจ
            </Button>
          </Link>
        )}
      </div>

      {packages.length === 0 && (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          ยังไม่มีแพ็กเกจ{canEdit ? ' — กด “เพิ่มแพ็กเกจ” เพื่อเริ่ม' : ''}
        </div>
      )}

      <div className="space-y-2">
        {packages.map((p, i) => (
          <Card key={p.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !p.is_active && 'opacity-60')}>
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {canEdit ? (
                  <Link href={`/packages/${p.id}`} className="font-semibold wrap-break-word hover:underline">
                    {p.name}
                  </Link>
                ) : (
                  <span className="font-semibold wrap-break-word">{p.name}</span>
                )}
                {p.price !== null && <span className={cn(PILL, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200')}>{baht(p.price)}</span>}
                {!p.is_active && <span className={cn(PILL, 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>ปิดใช้</span>}
              </div>
              {p.description && <p className="text-sm text-muted-foreground wrap-break-word">{p.description}</p>}
              <div className={cn('text-xs wrap-break-word', p.requirements.length ? 'text-zinc-600 dark:text-zinc-300' : 'text-amber-700 dark:text-amber-300')}>
                {requirementSummary(p.requirements)}
              </div>
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-1">
                <Button variant="ghost" size="icon" aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="เลื่อนลง" title="เลื่อนลง" disabled={pending || i === packages.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                <Link href={`/packages/${p.id}`}>
                  <Button variant="ghost" size="icon" aria-label="แก้ไข" title="แก้ไข">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </Link>
                <Button variant="ghost" size="icon" aria-label="คัดลอก" title="คัดลอกแพ็กเกจ" disabled={busyId === p.id} onClick={() => duplicate(p)}>
                  <Copy className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label="ลบ" title="ลบ" className="text-red-600 hover:text-red-700" onClick={() => remove(p)}>
                  <Trash className="h-4 w-4" />
                </Button>
              </div>
            )}
          </Card>
        ))}
      </div>
      {dialog}
    </div>
  )
}
