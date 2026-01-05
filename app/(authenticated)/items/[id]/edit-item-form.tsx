'use client'

import { useActionState, useState, useEffect } from 'react'
import { updateItem, deleteItem } from './actions'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import Link from 'next/link'
import { ArrowLeft, Trash, X } from "lucide-react"
import { compressImage } from "@/lib/utils"

export default function EditItemForm({ item }: { item: any }) {
  const [state, formAction, isPending] = useActionState(updateItem.bind(null, item.id), { error: '' })
  
  // Parse existing images
  let initialImages: string[] = []
  try {
      if (item.image_url) {
          if (item.image_url.startsWith('[')) {
              initialImages = JSON.parse(item.image_url)
          } else {
              initialImages = [item.image_url]
          }
      }
  } catch (e) {}

  const [existingImages, setExistingImages] = useState<string[]>(initialImages)
  const [newFiles, setNewFiles] = useState<{file: File, preview: string}[]>([])

  // Cleanup previews on unmount
  useEffect(() => {
    return () => {
        newFiles.forEach(f => URL.revokeObjectURL(f.preview))
    }
  }, [newFiles])

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this item?")) {
        await deleteItem(item.id)
    }
  }

  const totalImagesCount = existingImages.length + newFiles.length

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
          const files = Array.from(e.target.files)
          if (totalImagesCount + files.length > 4) {
              alert("Total images cannot exceed 4")
              // Reset standard input
              e.target.value = ""
              return
          }

          const processedFiles = await Promise.all(
             files.map(async (file) => {
                 if (file.type.startsWith('image/')) {
                     try {
                         return await compressImage(file)
                     } catch (err) {
                         console.error("Compression failed", err)
                         return file
                     }
                 }
                 return file
             })
          )
          
          const newEntries = processedFiles.map(file => ({
              file,
              preview: URL.createObjectURL(file)
          }))
          
          setNewFiles(prev => [...prev, ...newEntries])
          e.target.value = "" 
      }
  }

  const removeExisting = (idx: number) => {
      setExistingImages(prev => prev.filter((_, i) => i !== idx))
  }

  const removeNew = (idx: number) => {
      setNewFiles(prev => {
          const target = prev[idx]
          URL.revokeObjectURL(target.preview)
          return prev.filter((_, i) => i !== idx)
      })
  }

  const clientAction = (formData: FormData) => {
      // Append manually managed new files
      newFiles.forEach(entry => {
          formData.append('new_images', entry.file)
      })
      formAction(formData)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <Link href="/items">
            <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            </Link>
            <h2 className="text-3xl font-bold tracking-tight">Edit Item</h2>
        </div>
        <Button variant="destructive" size="icon" onClick={handleDelete} type="button" title="Delete Item">
            <Trash className="h-4 w-4" />
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Item Details</CardTitle>
        </CardHeader>
        <form action={clientAction}>
           {/* Hidden input for existing images */}
           <input type="hidden" name="existing_images" value={JSON.stringify(existingImages)} />

          <CardContent className="space-y-6">
            
            <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Images</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {/* Existing Images */}
                    {existingImages.map((url, idx) => (
                        <div key={`existing-${idx}`} className="relative group aspect-square rounded-lg border bg-zinc-100 overflow-hidden">
                            <img src={url} alt={`Existing ${idx}`} className="w-full h-full object-cover" />
                            <button 
                                type="button" 
                                onClick={() => removeExisting(idx)}
                                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-sm transition-transform hover:scale-110"
                                title="Remove image"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}
                    
                    {/* New Images */}
                    {newFiles.map((entry, idx) => (
                        <div key={`new-${idx}`} className="relative group aspect-square rounded-lg border bg-zinc-100 overflow-hidden">
                            <img src={entry.preview} alt={`New ${idx}`} className="w-full h-full object-cover" />
                            <div className="absolute top-1 left-1 bg-green-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-medium">New</div>
                            <button 
                                type="button" 
                                onClick={() => removeNew(idx)}
                                className="absolute top-1 right-1 bg-red-500 hover:bg-red-600 text-white p-1 rounded-full shadow-sm transition-transform hover:scale-110"
                                title="Remove image"
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </div>
                    ))}

                    {/* Upload Button */}
                    {totalImagesCount < 4 && (
                        <div className="relative aspect-square rounded-lg border-2 border-dashed flex flex-col items-center justify-center p-4 text-center text-sm text-zinc-500 hover:bg-zinc-50 transition-colors">
                             <Input 
                                id="file_upload" 
                                type="file" 
                                accept="image/*" 
                                multiple 
                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                onChange={handleFileChange}
                                // No name attribute so it doesn't auto-submit empty/partial data
                             />
                             <span className="pointer-events-none">Upload New (Max {4 - totalImagesCount} remaining)</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="name" className="text-sm font-medium leading-none">Name</label>
              <Input id="name" name="name" defaultValue={item.name} required />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label htmlFor="category" className="text-sm font-medium leading-none">Category</label>
                <Input id="category" name="category" defaultValue={item.category} />
              </div>
              <div className="space-y-2">
                <label htmlFor="price" className="text-sm font-medium leading-none">Price</label>
                <Input id="price" name="price" type="number" step="0.01" defaultValue={item.price} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                   <label htmlFor="quantity" className="text-sm font-medium leading-none">Quantity</label>
                   <Input id="quantity" name="quantity" type="number" min="1" defaultValue={item.quantity || 1} required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="serial_number" className="text-sm font-medium leading-none">Serial Number</label>
                  <Input id="serial_number" name="serial_number" defaultValue={item.serial_number} />
                </div>
            </div>

            <div className="space-y-2">
              <label htmlFor="status" className="text-sm font-medium leading-none">Status</label>
              <Select name="status" defaultValue={item.status}>
                <SelectTrigger>
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="in_use">In Use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="lost">Lost</SelectItem>
                  <SelectItem value="purchasing">Purchasing</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {state?.error && (
              <p className="text-sm text-red-500">{state.error}</p>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2">
            <Link href="/items">
                <Button variant="outline" type="button">Cancel</Button>
            </Link>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Update Item"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
