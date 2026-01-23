'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Pencil } from "lucide-react"
import { updateKitDetails } from './actions'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/language-context'
import type { Kit } from '@/types'

export default function EditKitDialog({ kit }: { kit: Kit }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [name, setName] = useState(kit.name)
  const [description, setDescription] = useState(kit.description || '')
  const router = useRouter()
  const { t } = useLanguage()

  const handleUpdate = async () => {
    setLoading(true)
    try {
      const result = await updateKitDetails(kit.id, name, description)
      if (result?.error) {
        alert(result.error)
      } else {
        setOpen(false)
        router.refresh()
      }
    } catch (e) {
      console.error(e)
      alert('Failed to update')
    } finally {
        setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" title={t.kits.editTitle}>
            <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{t.kits.editTitle}</DialogTitle>
          <DialogDescription>
            Make changes to the kit details here. Click save when you're done.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="name" className="text-right text-sm font-medium">
              {t.kits.fields.name}
            </label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <label htmlFor="description" className="text-right text-sm font-medium">
              {t.kits.fields.description}
            </label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="col-span-3"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t.common.cancel}</Button>
          <Button onClick={handleUpdate} disabled={loading}>{loading ? t.common.saving : t.common.save}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
