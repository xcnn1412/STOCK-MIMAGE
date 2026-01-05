'use client'

import { useState } from 'react'
import { addItemToKit } from './actions'
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2, Plus } from "lucide-react"

export default function AddItemToKitForm({ kitId, availableItems }: { kitId: string, availableItems: any[] }) {
  const [selectedItem, setSelectedItem] = useState<string>("")
  const [isPending, setIsPending] = useState(false)

  const handleSubmit = async () => {
    if (!selectedItem) return
    setIsPending(true)
    await addItemToKit(kitId, selectedItem)
    setIsPending(false)
    setSelectedItem("")
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
           <Select value={selectedItem} onValueChange={setSelectedItem}>
            <SelectTrigger>
              <SelectValue placeholder="Select an item to add" />
            </SelectTrigger>
            <SelectContent>
                {availableItems.length === 0 ? (
                    <div className="py-3 px-2 text-sm text-center text-zinc-500">No available items found</div>
                ) : (
                    availableItems.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                        {item.name} <span className="text-zinc-400 text-xs ml-2">({item.serial_number})</span>
                        </SelectItem>
                    ))
                )}
            </SelectContent>
          </Select>
      </div>

      <Button onClick={async () => {
          if (!selectedItem) return
          setIsPending(true)
          await addItemToKit(kitId, selectedItem)
          setIsPending(false)
          setSelectedItem("")
      }} disabled={!selectedItem || isPending} className="w-full">
         {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
         Add to Kit
      </Button>
    </div>
  )
}
