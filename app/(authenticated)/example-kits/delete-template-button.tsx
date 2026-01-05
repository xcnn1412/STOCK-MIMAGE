'use client'

import { Button } from "@/components/ui/button"
import { Trash } from "lucide-react"
import { deleteTemplateAction } from "./delete-action"

export function DeleteTemplateButton({ id }: { id: string }) {
  return (
    <form action={deleteTemplateAction.bind(null, id)} className="w-full" onSubmit={(e) => {
        if (!confirm('Are you sure you want to delete this template?')) {
            e.preventDefault()
        }
    }}>
      <Button variant="ghost" size="sm" className="w-full text-red-500 hover:text-red-700 hover:bg-red-50">
        <Trash className="h-4 w-4 mr-2" /> Delete
      </Button>
    </form>
  )
}
