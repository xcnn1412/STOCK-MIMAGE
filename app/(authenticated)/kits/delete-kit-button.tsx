'use client'

import { Button } from "@/components/ui/button"
import { Trash } from "lucide-react"
import { toast } from "sonner"
import { deleteKitAction } from "./delete-kit-action"

export function DeleteKitButton({ id }: { id: string }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="text-red-500 hover:text-red-700 hover:bg-red-50"
      onClick={async () => {
        if (!confirm('Are you sure you want to delete this kit?')) return
        const res = await deleteKitAction(id)
        if (res?.error) toast.error(res.error)
      }}
    >
      <Trash className="h-4 w-4" />
    </Button>
  )
}
