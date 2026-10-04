'use client'

import { Button } from "@/components/ui/button"
import { Trash } from "lucide-react"
import { toast } from "sonner"
import { deleteKitAction } from "./delete-kit-action"

export function DeleteKitButton({ id, name, itemCount }: { id: string; name: string; itemCount: number }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-red-500 hover:text-red-700 hover:bg-red-50"
      title="ลบกระเป๋า"
      aria-label={`ลบกระเป๋า ${name}`}
      onClick={async () => {
        const items = itemCount > 0 ? `\nของ ${itemCount} ชิ้นในกระเป๋ายังอยู่ในระบบ แต่จะไม่อยู่ในกระเป๋าใบไหนแล้ว` : ''
        if (!confirm(`ลบกระเป๋า "${name}"?${items}`)) return
        const res = await deleteKitAction(id)
        if (res?.error) toast.error(res.error)
        else toast.success(`ลบกระเป๋า ${name} แล้ว`)
      }}
    >
      <Trash className="h-4 w-4" />
    </Button>
  )
}
