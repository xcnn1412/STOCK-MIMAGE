'use client'

import { useState } from 'react'
import { addItemToKit } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Plus, Search } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Item } from '@/types'

/** วัสดุสิ้นเปลืองมี on_shelf = เหลือบนชั้น (คิดที่ page.tsx) */
export type AvailableItem = Item & { on_shelf?: number }

// ค้นหา → แตะอุปกรณ์ปกติ = เพิ่มทันที (ช่องค้นหาค้างไว้ เพิ่มชิ้นถัดไปต่อได้)
// แตะวัสดุสิ้นเปลือง = เลือกไว้ แล้วกรอกจำนวนประจำกระเป๋าก่อนกดเพิ่ม
export default function AddItemToKitForm({ kitId, availableItems }: { kitId: string, availableItems: AvailableItem[] }) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [selectedItem, setSelectedItem] = useState<string>("")
  const [quantity, setQuantity] = useState("1")
  const [isPending, setIsPending] = useState(false)
  const selected = availableItems.find(i => i.id === selectedItem)
  const consumable = !!selected?.is_consumable

  const q = query.trim().toLowerCase()
  const shown = q
    ? availableItems.filter(i => i.name.toLowerCase().includes(q) || (i.serial_number || '').toLowerCase().includes(q))
    : availableItems

  const add = async (itemId: string, qty: number) => {
    setIsPending(true)
    const res = await addItemToKit(kitId, itemId, qty)
    setIsPending(false)
    if (res?.error) {
      toast.error(res.error)
      return
    }
    if (res?.warning) toast.warning(res.warning)
    setSelectedItem("")
    setQuantity("1")
  }

  const pick = (item: AvailableItem) => {
    if (item.is_consumable) {
      setSelectedItem(item.id)
      setQuantity("1")
    } else {
      add(item.id, 1)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <Input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อหรือ serial"
            aria-label={t.kits.selectItem}
            className="h-10 pl-9"
          />
        </div>
        <div
          className={cn('max-h-72 overflow-y-auto rounded-md border divide-y', isPending && 'pointer-events-none opacity-60')}
          aria-busy={isPending}
        >
          {shown.length === 0 ? (
            <div className="py-3 px-2 text-sm text-center text-zinc-500">ไม่พบรายการ</div>
          ) : (
            shown.map(item => (
              <button
                key={item.id}
                type="button"
                disabled={isPending}
                onClick={() => pick(item)}
                className={cn(
                  'flex w-full min-h-10 items-center gap-2 px-3 py-2 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900',
                  item.id === selectedItem && 'bg-zinc-100 dark:bg-zinc-800'
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.name}</span>
                  {item.is_consumable ? (
                    <span className="block text-xs text-zinc-500">สิ้นเปลือง · เหลือ {item.on_shelf ?? 0} {item.unit || ''}</span>
                  ) : (
                    item.serial_number && <span className="block truncate text-xs text-zinc-500">{item.serial_number}</span>
                  )}
                </span>
                {!item.is_consumable && <Plus className="h-4 w-4 shrink-0 text-zinc-400" />}
              </button>
            ))
          )}
        </div>
      </div>

      {consumable && (
        <div className="space-y-2">
          <div className="space-y-1">
            <label htmlFor="kit-item-qty" className="text-sm font-medium">จำนวนประจำกระเป๋า · {selected?.name}</label>
            <Input
              id="kit-item-qty"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={quantity}
              onChange={e => setQuantity(e.target.value)}
            />
            <p className="text-xs text-zinc-500">เหลือบนชั้น {selected?.on_shelf ?? 0} {selected?.unit || ''}</p>
          </div>
          <Button onClick={() => add(selectedItem, Number(quantity))} disabled={isPending} className="w-full">
            {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            {t.kits.addToKit}
          </Button>
        </div>
      )}
    </div>
  )
}
