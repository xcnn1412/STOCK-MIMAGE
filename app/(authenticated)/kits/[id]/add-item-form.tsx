'use client'

import { useState } from 'react'
import { addItemToKit } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'
import type { Item } from '@/types'

/** วัสดุสิ้นเปลืองมี on_shelf = เหลือบนชั้น (คิดที่ page.tsx) */
export type AvailableItem = Item & { on_shelf?: number }

export default function AddItemToKitForm({ kitId, availableItems }: { kitId: string, availableItems: AvailableItem[] }) {
  const { t } = useLanguage()
  const [selectedItem, setSelectedItem] = useState<string>("")
  const [quantity, setQuantity] = useState("1")
  const [isPending, setIsPending] = useState(false)
  const selected = availableItems.find(i => i.id === selectedItem)
  const consumable = !!selected?.is_consumable

  const handleSubmit = async () => {
    if (!selectedItem) return
    setIsPending(true)
    const res = await addItemToKit(kitId, selectedItem, consumable ? Number(quantity) : 1)
    setIsPending(false)
    if (res?.error) {
      toast.error(res.error)
      return
    }
    if (res?.warning) toast.warning(res.warning)
    setSelectedItem("")
    setQuantity("1")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
           <Select value={selectedItem} onValueChange={setSelectedItem}>
            <SelectTrigger>
              <SelectValue placeholder={t.kits.selectItem} />
            </SelectTrigger>
            <SelectContent>
                {availableItems.length === 0 ? (
                    <div className="py-3 px-2 text-sm text-center text-zinc-500">{t.kits.noItems}</div>
                ) : (
                    availableItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                        {item.name} <span className="text-zinc-400 text-xs ml-2">{item.is_consumable ? `(สิ้นเปลือง · เหลือ ${item.on_shelf ?? 0} ${item.unit || ''})` : `(${item.serial_number})`}</span>
                        </SelectItem>
                    ))
                )}
            </SelectContent>
          </Select>
      </div>

      {consumable && (
        <div className="space-y-1">
          <label htmlFor="kit-item-qty" className="text-sm font-medium">จำนวนประจำกระเป๋า</label>
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
      )}

      <Button onClick={handleSubmit} disabled={!selectedItem || isPending} className="w-full">
         {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
         {t.kits.addToKit}
      </Button>
    </div>
  )
}
