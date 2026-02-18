'use client'


import { useState, useTransition } from 'react'
import { processEventReturn } from '../../actions' // Adjust path if necessary
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2, CheckCircle2, ImagePlus, X, UploadCloud } from "lucide-react"
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/language-context'

import type { Event, Item } from '@/types'

type ReturnProps = {
    event: Event
    itemsByKit: Record<string, { kitName: string, items: Item[] }>
}

export default function CheckListForm({ event, itemsByKit }: ReturnProps) {
    const { t } = useLanguage()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [statuses, setStatuses] = useState<Record<string, string>>({})
    
    // Image Upload State
    const [selectedFiles, setSelectedFiles] = useState<File[]>([])
    const [previewUrls, setPreviewUrls] = useState<string[]>([])
    const [uploadProgress, setUploadProgress] = useState<string>('')

    // Initialize all as 'available' or current?
    // User probably wants to mark them as 'Available' mostly. 
    // Let's default to null and force user to select? Or default to 'available'.
    
    // Flatten items to count total
    const allItems = Object.values(itemsByKit).flatMap(k => k.items)
    const totalItems = allItems.length

    // Check if all items have a status selected
    const completedCount = Object.keys(statuses).length
    const isComplete = completedCount === totalItems

    const handleStatusChange = (itemId: string, status: string) => {
        setStatuses(prev => ({ ...prev, [itemId]: status }))
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const files = Array.from(e.target.files)
            if (selectedFiles.length + files.length > 15) {
                alert('อัพโหลดได้สูงสุด 15 รูป') // Max 15 images
                return
            }
            
            setSelectedFiles(prev => [...prev, ...files])
            const newPreviews = files.map(file => URL.createObjectURL(file))
            setPreviewUrls(prev => [...prev, ...newPreviews])
        }
    }

    const removeFile = (index: number) => {
        setSelectedFiles(prev => prev.filter((_, i) => i !== index))
        setPreviewUrls(prev => {
            // Revoke URL to prevent memory leaks
             URL.revokeObjectURL(prev[index])
             return prev.filter((_, i) => i !== index)
        })
    }

    const handleSubmit = () => {
        if (!isComplete) return

        startTransition(async () => {
             const uploadedUrls: string[] = []
             
             if (selectedFiles.length > 0) {
                 setUploadProgress('Uploading images...')
                 // Process uploads sequentially or parallel
                 for (let i = 0; i < selectedFiles.length; i++) {
                     const file = selectedFiles[i]
                     const fileExt = file.name.split('.').pop()
                     const fileName = `${event.id}/${Date.now()}-${i}.${fileExt}`
                     
                     // Try upload
                     const { error: uploadError } = await supabase.storage
                        .from('event_closures')
                        .upload(fileName, file)
                     
                     if (uploadError) {
                         console.error('Error uploading', file.name, uploadError)
                         continue 
                     }

                     const { data: { publicUrl } } = supabase.storage
                        .from('event_closures')
                        .getPublicUrl(fileName)
                     
                     uploadedUrls.push(publicUrl)
                 }
             }

             const payload = Object.entries(statuses).map(([itemId, status]) => ({ itemId, status }))
             await processEventReturn(event.id, payload, uploadedUrls)
             router.push('/events') // Redirect after server action
        })
    }
    
    // If no kits/items, allow deleting event immediately?
    if (totalItems === 0) {
        return (
             <div className="max-w-2xl mx-auto space-y-6 text-center pt-10">
                 <h2 className="text-xl font-bold">{t.events.noItemsAssigned}</h2>
                 <p className="text-zinc-500">{t.events.canDeleteDirectly}</p>
                 <Button 
                    variant="destructive" 
                    onClick={() => {
                        startTransition(async () => {
                             await processEventReturn(event.id, [])
                             router.push('/events')
                        })
                    }}
                    disabled={isPending}
                 >
                     {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     {t.events.delete}
                 </Button>
                 <Link href="/events"><Button variant="ghost">{t.common.cancel}</Button></Link>
             </div>
        )
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-4">
                <Link href="/events">
                    <Button variant="ghost" size="icon">
                        <ArrowLeft className="h-4 w-4" />
                    </Button>
                </Link>
                <div>
                     <h2 className="text-3xl font-bold tracking-tight">{t.events.closeReport}</h2>
                     <p className="text-zinc-500">{t.events.title}: {event.name}</p>
                </div>
            </div>

            <div className="grid gap-6">
                {Object.entries(itemsByKit).map(([kitId, { kitName, items }]) => (
                    <Card key={kitId}>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg font-medium flex items-center gap-2">
                                📦 {kitName}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {items.map((item) => (
                                    <div key={item.id} className="flex items-center justify-between p-3 bg-zinc-50 rounded-lg border">
                                        <div className="flex items-center gap-3">
                                            {item.image_url && (
                                                <img 
                                                    src={item.image_url.startsWith('[') ? JSON.parse(item.image_url)[0] : item.image_url} 
                                                    className="h-10 w-10 object-cover rounded bg-white" 
                                                />
                                            )}
                                            <div>
                                                <div className="font-medium">{item.name}</div>
                                                <div className="text-xs text-zinc-500">{item.serial_number || 'No Serial'}</div>
                                            </div>
                                        </div>
                                        <div className="w-[180px]">
                                            <Select 
                                                value={statuses[item.id] || ""} 
                                                onValueChange={(val) => handleStatusChange(item.id, val)}
                                            >
                                                <SelectTrigger className={statuses[item.id] ? "border-zinc-500 bg-zinc-100 text-zinc-800 font-medium dark:bg-zinc-800 dark:text-zinc-200" : ""}>
                                                    <SelectValue placeholder={t.common.status} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="available">{t.items.status.available}</SelectItem>
                                                    <SelectItem value="maintenance">{t.items.status.maintenance}</SelectItem>
                                                    <SelectItem value="lost">{t.items.status.lost}</SelectItem>
                                                    <SelectItem value="in_use">{t.items.status.in_use}</SelectItem>
                                                    <SelectItem value="damaged">{t.items.status.damaged}</SelectItem>
                                                    <SelectItem value="out_of_stock">{t.items.status.out_of_stock}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Image Upload Section */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg font-medium flex items-center gap-2">
                        <ImagePlus className="h-5 w-5" />
                        รูปภาพปิดงาน (สูงสุด 15 รูป)
                    </CardTitle>
                    <CardDescription>
                        อัพโหลดรูปภาพเพื่อเป็นหลักฐานการปิดงาน เช่น รูปสินค้าคืน หรือสภาพความเสียหาย
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {previewUrls.map((url, idx) => (
                                <div key={idx} className="relative group aspect-square rounded-lg overflow-hidden border bg-zinc-100">
                                    <img src={url} alt="Preview" className="w-full h-full object-cover" />
                                    <button 
                                        onClick={() => removeFile(idx)}
                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                        <X className="h-3 w-3" />
                                    </button>
                                </div>
                            ))}
                            {selectedFiles.length < 15 && (
                                <label className="flex flex-col items-center justify-center aspect-square rounded-lg border-2 border-dashed border-zinc-300 hover:border-zinc-900 hover:bg-zinc-50 cursor-pointer transition-colors">
                                    <UploadCloud className="h-8 w-8 text-zinc-400 mb-2" />
                                    <span className="text-xs text-zinc-500">เพิ่มรูปภาพ</span>
                                    <input 
                                        type="file" 
                                        accept="image/*" 
                                        multiple 
                                        className="hidden" 
                                        onChange={handleFileSelect}
                                    />
                                </label>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>



            <div className="sticky bottom-4 bg-white/80 backdrop-blur-md p-4 border rounded-xl shadow-lg flex items-center justify-between">
                <div className="text-sm font-medium">
                    {t.events.checkedCount.replace('{completed}', completedCount.toString()).replace('{total}', totalItems.toString())}
                </div>
                <Button 
                    size="lg" 
                    className={isComplete ? "bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200" : ""}
                    disabled={!isComplete || isPending}
                    onClick={handleSubmit}
                >
                    {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                    {t.events.confirmClose}
                </Button>
            </div>
        </div>
    )
}
