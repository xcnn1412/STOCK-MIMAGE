'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowDown, ArrowUp, Pencil, Plus, Settings, Tags, Trash } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { useConfirm } from '../../finance/use-confirm'
import type { EquipmentCategory } from '../categories'
import CategoryDialog from './category-dialog'
import PickupSpotsSection from './pickup-spots-section'
import type { PickupSpot } from '../../packing/types'
import { deleteCategory, reorderCategories } from './actions'

export interface CategoryCounts {
  items: number
  kits: number
}

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'

export default function SettingsView({
  categories,
  counts,
  spots,
}: {
  categories: EquipmentCategory[]
  counts: Record<string, CategoryCounts>
  /** จุดรับของ (รวมที่ปิดใช้) — ไม่ส่ง = ไม่แสดงหัวข้อจุดรับของ */
  spots?: PickupSpot[]
}) {
  // undefined = ปิดกล่อง · null = เพิ่มใหม่
  const [editing, setEditing] = useState<EquipmentCategory | null | undefined>(undefined)
  const [pending, startTransition] = useTransition()
  const { confirm: ask, dialog } = useConfirm()

  const move = (index: number, dir: -1 | 1) => {
    const ids = categories.map(c => c.id)
    const to = index + dir
    if (to < 0 || to >= ids.length) return
    ;[ids[index], ids[to]] = [ids[to], ids[index]]
    startTransition(async () => {
      const res = await reorderCategories(ids)
      if ('error' in res) toast.error(res.error)
    })
  }

  const remove = async (c: EquipmentCategory) => {
    const ok = await ask({
      title: `ลบประเภท "${c.name}"?`,
      description: 'ลบได้เฉพาะประเภทที่ไม่มีอุปกรณ์และกระเป๋าอยู่ — ถ้ายังใช้อยู่ให้ปิดใช้แทน',
      variant: 'destructive',
      confirmLabel: 'ลบ',
    })
    if (!ok) return
    const res = await deleteCategory(c.id)
    if ('error' in res) toast.error(res.error)
    else toast.success(`ลบประเภท "${c.name}" แล้ว`)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-2xl font-bold tracking-tight md:text-3xl">
          <Settings className="h-6 w-6 text-zinc-500" /> ตั้งค่าคลัง
        </h2>
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Tags className="h-5 w-5 text-zinc-500" /> ประเภทอุปกรณ์
            </h3>
            <p className="text-sm text-muted-foreground">จัดกลุ่มอุปกรณ์และกระเป๋าที่ใช้แทนกันได้ · ประเภทที่ปิดใช้จะไม่ขึ้นให้เลือกในฟอร์มอุปกรณ์</p>
          </div>
          <Button onClick={() => setEditing(null)}>
            <Plus className="mr-1 h-4 w-4" /> เพิ่มประเภท
          </Button>
        </div>

        {categories.length === 0 && (
          <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">ยังไม่มีประเภทอุปกรณ์ — กด “เพิ่มประเภท” เพื่อเริ่ม</div>
        )}

        <div className="space-y-2">
          {categories.map((c, i) => {
            const n = counts[c.id] ?? { items: 0, kits: 0 }
            return (
              <Card key={c.id} className={cn('flex flex-col gap-3 p-4 sm:flex-row sm:items-center', !c.is_active && 'opacity-60')}>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold wrap-break-word">{c.name}</span>
                    {c.sales_pick && <span className={cn(PILL, 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200')}>ทีมขายเลือกชิ้นเอง</span>}
                    {!c.is_active && <span className={cn(PILL, 'bg-zinc-200 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>ปิดใช้</span>}
                  </div>
                  {c.variants.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">แบบประกอบ:</span>
                      {c.variants.map(v => (
                        <span key={v} className={cn(PILL, 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>{v}</span>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    อุปกรณ์ {n.items} · กระเป๋า {n.kits}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  <Link href={`/items/new?category=${c.id}`}>
                    <Button variant="outline" size="sm">
                      <Plus className="mr-1 h-4 w-4" /> เพิ่มอุปกรณ์
                    </Button>
                  </Link>
                  <Button variant="ghost" size="icon" aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น" disabled={pending || i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="เลื่อนลง" title="เลื่อนลง" disabled={pending || i === categories.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="แก้ไข" title="แก้ไข" onClick={() => setEditing(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" aria-label="ลบ" title="ลบ" className="text-red-600 hover:text-red-700" onClick={() => remove(c)}>
                    <Trash className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>
      </section>

      {spots && <PickupSpotsSection spots={spots} />}

      {editing !== undefined && <CategoryDialog key={editing?.id ?? 'new'} category={editing} onClose={() => setEditing(undefined)} />}
      {dialog}
    </div>
  )
}
