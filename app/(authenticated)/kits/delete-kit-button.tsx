'use client'

import { Button } from "@/components/ui/button"
import { Trash } from "lucide-react"
import { deleteKitAction } from "./delete-kit-action"

export function DeleteKitButton({ id }: { id: string }) {
  return (
    <form action={deleteKitAction.bind(null, id)} onSubmit={(e) => {
        if (!confirm('Are you sure you want to delete this kit?')) {
            e.preventDefault()
        }
    }}>
      <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50">
        <Trash className="h-4 w-4" />
      </Button>
    </form>
  )
}
