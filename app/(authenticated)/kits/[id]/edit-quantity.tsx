'use client'

import { useState } from 'react'
import { updateKitItemQuantity } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pencil, Check, X, Loader2 } from "lucide-react"
import { toast } from 'sonner'

/** จำนวนของในกระเป๋า + ปุ่มดินสอแก้จำนวน (ผู้ดูแลกระเป๋าเท่านั้น) — unit = หน่วยของวัสดุสิ้นเปลือง */
export function EditQuantity({ id, initialQty, unit }: { id: string; initialQty: number; unit?: string | null }) {
  const [isEditing, setIsEditing] = useState(false)
  const [qty, setQty] = useState(String(initialQty))
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    setIsSaving(true)
    const res = await updateKitItemQuantity(id, Number(qty))
    setIsSaving(false)
    if ('error' in res) {
      toast.error(res.error)
      return
    }
    if (res.warning) toast.warning(res.warning)
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <div className="flex items-center gap-1">
        <Input
          type="number"
          inputMode="numeric"
          min="1"
          step="1"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave() }}
          className="h-9 w-20 text-sm"
          aria-label="จำนวน"
          autoFocus
        />
        {unit && <span className="text-xs text-zinc-500">{unit}</span>}
        <Button size="icon" variant="ghost" className="h-9 w-9 text-green-600" onClick={handleSave} disabled={isSaving} aria-label="บันทึกจำนวน">
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </Button>
        <Button size="icon" variant="ghost" className="h-9 w-9 text-zinc-400" onClick={() => setIsEditing(false)} disabled={isSaving} aria-label="ยกเลิก">
          <X className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <span>{initialQty}{unit ? ` ${unit}` : ''}</span>
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 text-zinc-500"
        title="แก้จำนวน"
        aria-label="แก้จำนวน"
        onClick={() => { setQty(String(initialQty)); setIsEditing(true) }}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>
    </div>
  )
}
