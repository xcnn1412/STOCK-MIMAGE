'use client'

import { useActionState, useState } from 'react'
import { createTemplate } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import Link from 'next/link'
import { ArrowLeft, Plus, X } from "lucide-react"

export default function NewTemplatePage() {
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
        <h2 className="text-3xl font-bold tracking-tight">New Example Kit</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Template Details</CardTitle>
          <CardDescription>Define what SHOULD be in this type of kit.</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">Template Name</label>
              <Input id="name" name="name" placeholder="e.g. Standard Wedding Kit" required />
            </div>
            
            <div className="space-y-2">
              <label htmlFor="description" className="text-sm font-medium leading-none">Description</label>
              <Textarea id="description" name="description" placeholder="Description..." />
            </div>

            <div className="space-y-2">
               <label className="text-sm font-medium leading-none">Standard Items</label>
               <div className="space-y-2">
                   {items.map((id, index) => (
                       <div key={id} className="flex gap-2">
                           <Input 
                                className="flex-1"
                                name={`item-name-${id}`} 
                                placeholder={`Item ${index + 1} name`} 
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
                   <Plus className="h-4 w-4 mr-2" /> Add Item Line
               </Button>
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/example-kits">
                <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Create Template"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
