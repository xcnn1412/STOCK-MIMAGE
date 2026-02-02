'use client'

import { useActionState, useState } from 'react'
import { createItem } from '../actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from 'next/link'
import { ArrowLeft, X } from "lucide-react"
import { compressImage } from "@/lib/utils"
import { useLanguage } from '@/contexts/language-context'

const initialState = {
  error: '',
}

function CategorySelector({ t }: { t: any }) {
    const [value, setValue] = useState("")
    const [isCustom, setIsCustom] = useState(false)
  
    const categories = [
      "กล้องถ่ายภาพ",
      "อุปกรณ์ออกอีเวนต์",
      "ไฟต่อเนื่อง",
      "ไฟแฟลช",
      "สายไฟ"
    ]
  
    const handleSelectChange = (val: string) => {
      if (val === "other") {
        setIsCustom(true)
        setValue("")
      } else {
        setIsCustom(false)
        setValue(val)
      }
    }
  
    return (
      <div className="space-y-2">
        {!isCustom ? (
            <>
                <Select onValueChange={handleSelectChange} value={value}>
                <SelectTrigger>
                    <SelectValue placeholder={t.items.fields.category} />
                </SelectTrigger>
                <SelectContent>
                    {categories.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                    <SelectItem value="other" className="font-medium text-blue-600">
                    + Add New Category
                    </SelectItem>
                </SelectContent>
                </Select>
                {/* Hidden input to submit the value */}
                <input type="hidden" name="category" value={value} />
            </>
        ) : (
             <div className="flex gap-2">
                <Input 
                    name="category" 
                    placeholder="Enter category name" 
                    autoFocus 
                    required 
                />
                <Button 
                    type="button" 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => {
                        setIsCustom(false)
                        setValue("")
                    }}
                    title="Back to list"
                >
                    <X className="h-4 w-4" />
                </Button>
             </div>
        )}
      </div>
    )
  }

export default function NewItemPage() {
  const { t } = useLanguage()
  const [state, formAction, isPending] = useActionState(createItem, initialState)

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/items">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h2 className="text-3xl font-bold tracking-tight">{t.items.newTitle}</h2>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t.items.newTitle}</CardTitle>
          <CardDescription>Add a new item to the inventory (Max 4 images).</CardDescription>
        </CardHeader>
        <form action={formAction}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">{t.items.fields.name}</label>
              <Input id="name" name="name" placeholder={t.items.fields.name} required />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="category" className="text-sm font-medium leading-none">{t.items.fields.category}</label>
                <CategorySelector t={t} />
              </div>
              <div className="space-y-2">
                <label htmlFor="price" className="text-sm font-medium leading-none">{t.items.fields.price}</label>
                <Input id="price" name="price" type="number" step="0.01" placeholder="0.00" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                <label htmlFor="quantity" className="text-sm font-medium leading-none">{t.items.fields.quantity}</label>
                <Input id="quantity" name="quantity" type="number" min="1" defaultValue="1" required />
              </div>
               <div className="space-y-2">
                 <label htmlFor="serial_number" className="text-sm font-medium leading-none">{t.items.fields.serial}</label>
                 <Input id="serial_number" name="serial_number" placeholder="Optional" />
               </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium leading-none">{t.items.fields.status}</label>
              <Select name="status" defaultValue="available">
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">{t.items.status.available}</SelectItem>
                  <SelectItem value="in_use">{t.items.status.in_use}</SelectItem>
                  <SelectItem value="maintenance">{t.items.status.maintenance}</SelectItem>
                  <SelectItem value="lost">{t.items.status.lost}</SelectItem>
                  <SelectItem value="purchasing">{t.items.status.purchasing}</SelectItem>
                  <SelectItem value="damaged">{t.items.status.damaged}</SelectItem>
                  <SelectItem value="out_of_stock">{t.items.status.out_of_stock}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label htmlFor="images" className="text-sm font-medium leading-none">{t.items.fields.images}</label>
              <Input 
                 id="images" 
                 name="images" 
                 type="file" 
                 accept="image/*" 
                 multiple 
                 onChange={async (e) => {
                     const files = e.target.files
                     if (!files) return
                     
                     if (files.length > 4) {
                         alert("Maximum 4 files allowed")
                         e.target.value = ""
                         return
                     }

                     // Compress images
                     const dataTransfer = new DataTransfer()
                     for (let i = 0; i < files.length; i++) {
                         const file = files[i]
                         if (!file.type.startsWith('image/')) {
                             dataTransfer.items.add(file)
                             continue
                         }

                         try {
                            const compressed = await compressImage(file)
                            dataTransfer.items.add(compressed)
                         } catch (err) {
                             console.error("Compression failed for", file.name, err)
                             dataTransfer.items.add(file) // Fallback to original
                         }
                     }
                     
                     // Update input files
                     e.target.files = dataTransfer.files
                 }}
              />
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/items">
                <Button variant="outline" type="button">{t.common.cancel}</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? t.common.save + "..." : t.common.save}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
