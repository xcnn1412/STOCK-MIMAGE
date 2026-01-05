'use client'

import { useState } from 'react'
import { updateKitItemQuantity } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pencil, Check, X } from "lucide-react"

export function EditQuantity({ id, initialQty }: { id: string, initialQty: number }) {
  const [isEditing, setIsEditing] = useState(false)
  const [qty, setQty] = useState(initialQty)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
      setIsSaving(true)
      await updateKitItemQuantity(id, qty)
      setIsSaving(false)
      setIsEditing(false)
  }

  if (isEditing) {
      return (
          <div className="flex items-center gap-1">
              <Input 
                type="number" 
                min="1" 
                value={qty} 
                onChange={(e) => setQty(parseInt(e.target.value) || 1)}
                className="w-16 h-8 text-sm"
              />
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500" onClick={handleSave} disabled={isSaving}>
                  <Check className="h-4 w-4" />
              </Button>
               <Button size="icon" variant="ghost" className="h-8 w-8 text-zinc-400" onClick={() => setIsEditing(false)} disabled={isSaving}>
                  <X className="h-4 w-4" />
              </Button>
          </div>
      )
  }

  return (
      <div className="flex items-center gap-2 group">
          <span>{initialQty}</span>
          <Button 
            size="icon" 
            variant="ghost" 
            className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400" 
            onClick={() => setIsEditing(true)}
          >
              <Pencil className="h-3 w-3" />
          </Button>
      </div>
  )
}
