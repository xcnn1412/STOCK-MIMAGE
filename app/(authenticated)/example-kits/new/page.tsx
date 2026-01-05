'use client'

import { useActionState, useState } from 'react'
import { createTemplate } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import Link from 'next/link'
import { ArrowLeft, Plus, X } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'

export default function NewTemplatePage() {
  const { t } = useLanguage()
  const [state, formAction, isPending] = useActionState(createTemplate, { error: '' })
  const [items, setItems] = useState<number[]>([0]) // Array of IDs for dynamic inputs

  const addItemInput = () => {
      setItems(prev => [...prev, Date.now()])
  }

  const removeItemInput = (id: number) => {
      setItems(prev => prev.filter(i => i !== id))
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
       <div className="flex items-center gap-4">
        <Link href="/example-kits">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">{t.examples.newTitle}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.examples.newTitle}</CardTitle>
          <CardDescription>{t.examples.newSubtitle}</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">{t.examples.fields.name}</label>
              <Input id="name" name="name" placeholder={t.examples.fields.name} required />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium leading-none">{t.examples.fields.description}</label>
              <Textarea id="description" name="description" placeholder={t.examples.fields.description} />
            </div>

            <div className="space-y-3 pt-2">
                <label className="text-sm font-medium leading-none">{t.examples.fields.type}</label>
                <div className="flex gap-4">
                    <label className="flex items-center gap-2 border p-3 rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors [&:has(:checked)]:border-black [&:has(:checked)]:bg-zinc-50">
                        <input type="radio" name="type" value="example" defaultChecked className="accent-black" />
                        <div>
                            <span className="block font-medium text-sm">{t.examples.example}</span>
                            <span className="block text-xs text-zinc-500">Standard item list</span>
                        </div>
                    </label>
                    <label className="flex items-center gap-2 border p-3 rounded-lg cursor-pointer hover:bg-zinc-50 transition-colors [&:has(:checked)]:border-black [&:has(:checked)]:bg-zinc-50">
                        <input type="radio" name="type" value="checklist" className="accent-black" />
                        <div>
                            <span className="block font-medium text-sm">{t.examples.checklist}</span>
                            <span className="block text-xs text-zinc-500">Track item status</span>
                        </div>
                    </label>
                </div>
            </div>

            <div className="space-y-2">
               <label className="text-sm font-medium leading-none">{t.examples.standardItems}</label>
               <div className="space-y-2">
                   {items.map((id, index) => (
                       <div key={id} className="flex gap-2">
                           <Input 
                                className="flex-1"
                                name={`item-name-${id}`} 
                                placeholder={`Item ${index + 1} Name`} 
                                required={index === 0}
                           />
                           <Input 
                                className="w-20"
                                type="number"
                                name={`item-qty-${id}`} 
                                placeholder="Qty"
                                min={1}
                                defaultValue={1}
                                required={index === 0}
                           />
                           {items.length > 1 && (
                               <Button type="button" variant="ghost" size="icon" onClick={() => removeItemInput(id)}>
                                   <X className="h-4 w-4" />
                               </Button>
                           )}
                       </div>
                   ))}
               </div>
               <Button type="button" variant="outline" size="sm" onClick={addItemInput} className="mt-2">
                   <Plus className="h-4 w-4 mr-2" /> {t.items.addItem}
               </Button>
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/example-kits">
                <Button variant="outline" type="button">{t.common.cancel}</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? t.common.save + "..." : t.examples.createTemplate}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
