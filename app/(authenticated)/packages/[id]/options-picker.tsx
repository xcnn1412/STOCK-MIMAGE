'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import type { CategoryUnit } from '../types'

const STATUS_LABEL: Record<string, string> = {
  available: 'ว่าง',
  in_use: 'กำลังใช้งาน',
  maintenance: 'ซ่อมบำรุง',
  damaged: 'ชำรุด',
  lost: 'หาย',
  purchasing: 'กำลังจัดซื้อ',
  out_of_stock: 'ของหมด',
}
const PILL = 'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium'

/**
 * เลือกตัวเลือกอุปกรณ์ของข้อกำหนดหนึ่งแถว — units ของประเภทนั้น (อุปกรณ์ในกระเป๋าถูกซ่อน เลือกเป็นตัวเลือกเดี่ยวไม่ได้)
 * ไม่ติ๊กเลย / "ใช้ทุกชิ้นในประเภท" = ทุกหน่วยในประเภทใช้ได้ · เปิดเมื่อ mount ปิดด้วย onClose
 */
export default function OptionsPicker({
  categoryName,
  units,
  itemIds,
  kitIds,
  onApply,
  onClose,
}: {
  categoryName: string
  units: CategoryUnit[]
  itemIds: string[]
  kitIds: string[]
  onApply: (itemIds: string[], kitIds: string[]) => void
  onClose: () => void
}) {
  const choosable = useMemo(() => units.filter(u => !u.inKit), [units])
  // ชิ้นเดิมที่ถูกย้ายเข้ากระเป๋าหรือออกจากประเภทไปแล้ว ถูกตัดทิ้ง (ไม่งั้นบันทึกไม่ผ่านและติ๊กออกไม่ได้)
  const [picked, setPicked] = useState(() => {
    const valid = new Set(units.filter(u => !u.inKit).map(u => `${u.kind}:${u.id}`))
    return new Set([...itemIds.map(id => `item:${id}`), ...kitIds.map(id => `kit:${id}`)].filter(k => valid.has(k)))
  })
  const [q, setQ] = useState('')

  const needle = q.trim().toLowerCase()
  const shown = needle ? choosable.filter(u => u.name.toLowerCase().includes(needle) || (u.serial ?? '').toLowerCase().includes(needle)) : choosable
  const hiddenInKit = units.length - choosable.length

  const toggle = (key: string, on: boolean) =>
    setPicked(prev => {
      const next = new Set(prev)
      if (on) next.add(key)
      else next.delete(key)
      return next
    })

  const apply = (keys: Set<string>) => {
    const ids = (kind: string) => [...keys].filter(k => k.startsWith(`${kind}:`)).map(k => k.slice(kind.length + 1))
    onApply(ids('item'), ids('kit'))
    onClose()
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>ตัวเลือกอุปกรณ์: {categoryName}</DialogTitle>
          <DialogDescription>ติ๊กชิ้นที่ใช้กับแพ็กเกจนี้ได้ · ไม่ติ๊กเลย = ใช้ได้ทุกชิ้นในประเภท</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="ค้นหาชื่อหรือ serial" className="pl-8" />
        </div>

        <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-md border p-1">
          {shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{choosable.length ? 'ไม่พบชิ้นที่ค้นหา' : 'ยังไม่มีอุปกรณ์หรือกระเป๋าในประเภทนี้'}</p>}
          {shown.map(u => {
            const key = `${u.kind}:${u.id}`
            const usable = u.status === 'available' || u.status === 'in_use'
            return (
              <label key={key} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-muted">
                <Checkbox checked={picked.has(key)} onCheckedChange={v => toggle(key, v === true)} className="mt-0.5" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm wrap-break-word">{u.name}</span>
                  {u.serial && <span className="block text-xs text-muted-foreground wrap-break-word">{u.serial}</span>}
                </span>
                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                  <span className={cn(PILL, u.kind === 'kit' ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200' : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300')}>
                    {u.kind === 'kit' ? 'กระเป๋า' : 'อุปกรณ์'}
                  </span>
                  {u.kind === 'item' && (
                    <span className={cn(PILL, usable ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200')}>
                      {STATUS_LABEL[u.status] ?? u.status}
                    </span>
                  )}
                </span>
              </label>
            )
          })}
        </div>
        {hiddenInKit > 0 && <p className="text-xs text-muted-foreground">ไม่แสดงอุปกรณ์ {hiddenInKit} ชิ้นที่อยู่ในกระเป๋า — เลือกกระเป๋าทั้งใบแทน</p>}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => apply(new Set())}>
            ใช้ทุกชิ้นในประเภท
          </Button>
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>ยกเลิก</Button>
            <Button type="button" onClick={() => apply(picked)}>ใช้ {picked.size ? `${picked.size} ชิ้นที่เลือก` : 'ทุกชิ้น'}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
