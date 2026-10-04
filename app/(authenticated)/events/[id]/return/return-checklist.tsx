'use client'


import { useState, useTransition } from 'react'
import { processEventReturn, uploadClosureImage } from '../../actions'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2, CheckCircle2, ImagePlus, X, UploadCloud } from "lucide-react"
import { compressImage } from '@/lib/utils'
import { Input } from "@/components/ui/input"
import { parseCount } from '@/app/(authenticated)/shelves/consumable-logic'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/language-context'
import { toast } from 'sonner'

import type { Event, Item } from '@/types'

const PREFILL = ['available', 'damaged', 'maintenance', 'lost']

type ReturnProps = {
    event: Event
    itemsByKit: Record<string, { kitName: string, items: Item[], consumables?: (Item & { kitQuantity: number })[] }>
}

export default function CheckListForm({ event, itemsByKit }: ReturnProps) {
    const { t } = useLanguage()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    // เติมสถานะให้ก่อนจากสถานะปัจจุบัน (ใช้ได้/เสียหาย/ซ่อมบำรุง/หาย) — ชิ้นที่ยังออกงานอยู่ต้องเลือกเอง
    const [statuses, setStatuses] = useState<Record<string, string>>(() => {
        const init: Record<string, string> = {}
        Object.values(itemsByKit).forEach(k => k.items.forEach(item => {
            if (PREFILL.includes(item.status)) init[item.id] = item.status
        }))
        return init
    })
    
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
    // วัสดุสิ้นเปลือง: กรอก "ใช้ไป" ต่อกระเป๋า (key = kitId:itemId) — ไม่นับใน isComplete
    const consumableRows = Object.entries(itemsByKit).flatMap(([kitId, k]) => (k.consumables || []).map(item => ({ kitId, item })))
    const [usedInput, setUsedInput] = useState<Record<string, string>>({})
    const usedValue = (kitId: string, itemId: string) => usedInput[`${kitId}:${itemId}`] ?? '0'
    const usageValid = consumableRows.every(r => parseCount(usedValue(r.kitId, r.item.id)) != null)

    // Check if all items have a status selected
    const completedCount = Object.keys(statuses).length
    const isComplete = completedCount === totalItems && usageValid

    const handleStatusChange = (itemId: string, status: string) => {
        setStatuses(prev => ({ ...prev, [itemId]: status }))
    }

    // "ใช้ได้ทั้งหมด" ของกระเป๋าหนึ่งใบ — ตั้งเฉพาะชิ้นที่ยังไม่มีสถานะ
    const markKitAvailable = (items: Item[]) => {
        setStatuses(prev => {
            const next = { ...prev }
            items.forEach(item => { if (!next[item.id]) next[item.id] = 'available' })
            return next
        })
    }

    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files) {
            const rawFiles = Array.from(e.target.files)
            if (selectedFiles.length + rawFiles.length > 15) {
                toast.error('อัพโหลดได้สูงสุด 15 รูป')
                return
            }
            
            // Compress images before storing
            const files = await Promise.all(
                rawFiles.map(file =>
                    file.type.startsWith('image/') ? compressImage(file) : file
                )
            )
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
                 setUploadProgress(`กำลังอัพโหลดรูป 0/${selectedFiles.length}...`)

                 // Uploads go through a server action: the browser client is `anon`
                 // (custom cookie session, not Supabase Auth) and cannot write to the bucket.
                 const uploadPromises = selectedFiles.map(async (file) => {
                     const fd = new FormData()
                     fd.append('file', file)
                     fd.append('eventId', event.id)

                     const res = await uploadClosureImage(fd)
                     if (res.error || !res.url) {
                         console.error('Error uploading', file.name, res.error)
                         return null
                     }
                     return res.url
                 })

                 const results = await Promise.all(uploadPromises)

                 // Skip failures — a bad photo must not block the close
                 results.forEach(url => {
                     if (url) uploadedUrls.push(url)
                 })
                 setUploadProgress(`อัพโหลดรูปแล้ว ${uploadedUrls.length}/${selectedFiles.length}`)
             }

             const payload = Object.entries(statuses).map(([itemId, status]) => ({ itemId, status }))
             const consumableUse = consumableRows.map(r => ({ kitId: r.kitId, itemId: r.item.id, used: parseCount(usedValue(r.kitId, r.item.id)) ?? 0 }))
             const result = await processEventReturn(event.id, payload, uploadedUrls, consumableUse)
             if (result && 'error' in result) {
                 setUploadProgress('')
                 toast.error(result.error)
                 return
             }
             router.push('/events')
        })
    }

    // No kits/items to check in — the event can simply be closed.
    if (totalItems === 0 && consumableRows.length === 0) {
        return (
             <div className="max-w-2xl mx-auto space-y-6 text-center pt-10">
                 <h2 className="text-xl font-bold">{t.events.noItemsAssigned}</h2>
                 <p className="text-zinc-500">{t.events.canCloseDirectly}</p>
                 <Button
                    onClick={() => {
                        startTransition(async () => {
                             const result = await processEventReturn(event.id, [])
                             if (result && 'error' in result) {
                                 toast.error(result.error)
                                 return
                             }
                             router.push('/events')
                        })
                    }}
                    disabled={isPending}
                 >
                     {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                     {t.events.finalizeJob}
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
                {Object.entries(itemsByKit).map(([kitId, { kitName, items, consumables = [] }]) => (
                    <Card key={kitId}>
                        <CardHeader className="pb-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <CardTitle className="text-lg font-medium flex items-center gap-2 min-w-0 wrap-break-word">
                                    📦 {kitName}
                                </CardTitle>
                                {items.length > 0 && (
                                    <Button type="button" size="sm" variant="outline" className="min-h-10" onClick={() => markKitAvailable(items)}>
                                        <CheckCircle2 className="mr-1 h-4 w-4" /> ใช้ได้ทั้งหมด
                                    </Button>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {items.map((item) => (
                                    <div key={item.id} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg border">
                                        <div className="flex items-center gap-3 min-w-0">
                                            {item.image_url && (
                                                <img 
                                                    src={item.image_url.startsWith('[') ? JSON.parse(item.image_url)[0] : item.image_url} 
                                                    className="h-10 w-10 object-cover rounded bg-white" 
                                                />
                                            )}
                                            <div className="min-w-0">
                                                <div className="font-medium wrap-break-word">{item.name}</div>
                                                {item.serial_number && <div className="text-xs text-zinc-500 wrap-break-word">{item.serial_number}</div>}
                                            </div>
                                        </div>
                                        <div className="w-full sm:w-[180px] sm:shrink-0">
                                            <Select 
                                                value={statuses[item.id] || ""} 
                                                onValueChange={(val) => handleStatusChange(item.id, val)}
                                            >
                                                <SelectTrigger className={statuses[item.id] ? "w-full min-h-10 border-zinc-500 bg-zinc-100 text-zinc-800 font-medium dark:bg-zinc-800 dark:text-zinc-200" : "w-full min-h-10"}>
                                                    <SelectValue placeholder={t.common.status} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="available">{t.items.status.available}</SelectItem>
                                                    <SelectItem value="damaged">{t.items.status.damaged}</SelectItem>
                                                    <SelectItem value="maintenance">{t.items.status.maintenance}</SelectItem>
                                                    <SelectItem value="lost">{t.items.status.lost}</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                ))}
                                {consumables.map((item) => {
                                    const key = `${kitId}:${item.id}`
                                    const used = parseCount(usedValue(kitId, item.id))
                                    const invalid = used == null
                                    // ใช้ไปเกินจำนวนประจำกระเป๋า = เตือนอย่างเดียว ไม่บล็อกการปิดงาน
                                    const over = used != null && used > item.kitQuantity
                                    return (
                                    <div key={key} className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 p-3 bg-amber-50/60 dark:bg-amber-950/20 rounded-lg border">
                                        <div className="min-w-0">
                                            <div className="font-medium wrap-break-word">{item.name}</div>
                                            <div className="text-xs text-zinc-500">วัสดุสิ้นเปลือง · ประจำกระเป๋า {item.kitQuantity} {item.unit || ''}</div>
                                            {over && <div className="text-xs font-medium text-amber-700 dark:text-amber-400">มากกว่าจำนวนประจำกระเป๋า ({item.kitQuantity}) — ตรวจตัวเลขอีกครั้ง</div>}
                                        </div>
                                        <div className="flex flex-wrap items-center gap-2">
                                            <label htmlFor={`used-${key}`} className="text-sm">ใช้ไป</label>
                                            <Input
                                                id={`used-${key}`}
                                                type="number"
                                                inputMode="numeric"
                                                min={0}
                                                step={1}
                                                className={`w-20 ${invalid ? 'border-red-500' : over ? 'border-amber-500' : ''}`}
                                                value={usedValue(kitId, item.id)}
                                                onChange={(e) => setUsedInput(prev => ({ ...prev, [key]: e.target.value }))}
                                            />
                                            <Button type="button" size="sm" variant="outline" onClick={() => setUsedInput(prev => ({ ...prev, [key]: String(item.kitQuantity) }))}>
                                                ใช้หมด
                                            </Button>
                                        </div>
                                    </div>
                                )})}
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



            <div className="sticky bottom-4 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md p-4 border rounded-xl shadow-lg flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-medium">
                    {t.events.checkedCount.replace('{completed}', completedCount.toString()).replace('{total}', totalItems.toString())}
                    {uploadProgress && <div className="text-xs font-normal text-zinc-500">{uploadProgress}</div>}
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
