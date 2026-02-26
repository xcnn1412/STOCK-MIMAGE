'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLanguage } from '@/contexts/language-context'
import { CalendarDays, MapPin, User, Package, ChevronDown, ChevronUp, Clock, ImageIcon } from "lucide-react"
import type { EventClosure, KitSnapshot } from '@/types'
import { cleanupOldClosures } from './actions'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'

function formatThaiDate(dateStr: string | null) {
    if (!dateStr) return '-'
    const date = new Date(dateStr)
    return date.toLocaleDateString('th-TH', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
}

function StatusBadge({ status }: { status: string }) {
    const colors: Record<string, string> = {
        available: 'bg-zinc-900 text-white border-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-300',
        maintenance: 'bg-zinc-300 text-zinc-700 border-zinc-400 dark:bg-zinc-600 dark:text-zinc-200',
        lost: 'bg-zinc-400 text-zinc-100 border-zinc-500 line-through dark:bg-zinc-500 dark:text-zinc-200',
        in_use: 'bg-zinc-200 text-zinc-700 border-zinc-300 dark:bg-zinc-700 dark:text-zinc-300',
        damaged: 'bg-orange-200 text-orange-800 border-orange-400 dark:bg-orange-700 dark:text-orange-100',
        out_of_stock: 'bg-gray-200 text-gray-700 border-gray-400 dark:bg-gray-600 dark:text-gray-200',
    }
    return (
        <Badge variant="outline" className={`text-[10px] ${colors[status] || ''}`}>
            {status}
        </Badge>
    )
}

function ClosureCard({ closure }: { closure: EventClosure }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const kitsData = (closure.kits_snapshot || []) as unknown as KitSnapshot[]
    const imageUrls = (closure.image_urls || []) as unknown as string[]
    const totalItems = kitsData.reduce((sum: number, kit: KitSnapshot) => sum + kit.items.length, 0) || 0
    const totalKits = kitsData.length || 0

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-3 bg-zinc-50 dark:bg-zinc-900 border-b">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-muted-foreground" />
                            {closure.event_name}
                        </CardTitle>
                        {closure.event_location && (
                            <CardDescription className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {closure.event_location}
                            </CardDescription>
                        )}
                    </div>
                    <Badge className="bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900">ปิดงานแล้ว</Badge>
                </div>
            </CardHeader>
            <CardContent className="pt-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">วันที่งาน</p>
                        <p className="font-medium">{formatThaiDate(closure.event_date)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">ปิดงานเมื่อ</p>
                        <p className="font-medium flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatThaiDate(closure.closed_at)}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">ปิดงานโดย</p>
                        <p className="font-medium flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {closure.closer?.full_name || 'Unknown'}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-muted-foreground text-xs">รายการ</p>
                        <p className="font-medium">
                            {totalKits} กระเป๋า / {totalItems} ชิ้น
                        </p>
                    </div>
                </div>

                {/* Expandable Kit Details */}
                {totalKits > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <Button
                            variant="ghost"
                            className="w-full justify-between"
                            onClick={() => setIsExpanded(!isExpanded)}
                        >
                            <span className="flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                ดูรายละเอียดกระเป๋าและของ
                            </span>
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>

                        {isExpanded && (
                            <div className="mt-4 space-y-4">
                                {kitsData.map((kit) => (
                                    <div key={kit.kitId} className="border rounded-lg p-3 bg-muted/30">
                                        <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                                            📦 {kit.kitName}
                                            <Badge variant="secondary" className="text-[10px]">
                                                {kit.items.length} ชิ้น
                                            </Badge>
                                        </h4>
                                        <div className="space-y-2">
                                            {kit.items.map((item: any, idx: number) => (
                                                <div
                                                    key={item.itemId || idx}
                                                    className="flex items-center justify-between text-sm bg-white rounded p-2 border"
                                                >
                                                    <div className="flex items-center gap-2">
                                                        {item.imageUrl && (
                                                            <img
                                                                src={item.imageUrl.startsWith('[') ? JSON.parse(item.imageUrl)[0] : item.imageUrl}
                                                                className="h-8 w-8 rounded object-cover"
                                                                alt=""
                                                            />
                                                        )}
                                                        <div>
                                                            <p className="font-medium">{item.itemName}</p>
                                                            <p className="text-xs text-muted-foreground">
                                                                {item.serialNumber || 'No Serial'}
                                                                {item.quantity > 1 && ` × ${item.quantity}`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <StatusBadge status={item.status} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
                
                {/* Closure Images */}
                {imageUrls.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                        <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                             <ImageIcon className="h-4 w-4" />
                             รูปภาพปิดงาน ({imageUrls.length})
                        </h4>
                        <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                             {imageUrls.map((url: string, idx: number) => (
                                 <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-md overflow-hidden border bg-zinc-100 group relative">
                                     <img src={url} alt={`Closure image ${idx + 1}`} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                 </a>
                             ))}
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    )
}

export default function EventClosuresView({ closures, error }: { closures: EventClosure[], error: string | null }) {
    const { t } = useLanguage()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()

    // Calculate if any closure is older than 60 days
    const hasOldClosures = closures.some(closure => {
        const closedAt = new Date(closure.closed_at)
        const cutoff = new Date()
        cutoff.setDate(cutoff.getDate() - 60)
        return closedAt < cutoff
    })

    const handleCleanup = () => {
        if (!confirm('ยืนยันลบประวัติการปิดงานที่เก่าเกิน 60 วัน? \nข้อมูลและรูปภาพทั้งหมดที่เกี่ยวข้องจะถูกลบถาวร')) return

        startTransition(async () => {
            const result = await cleanupOldClosures()
            if (result.error) {
                alert('เกิดข้อผิดพลาดในการลบข้อมูล: ' + result.error)
            } else {
                alert(`ลบข้อมูลสำเร็จ ${result.count} รายการ`)
                router.refresh()
            }
        })
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">ประวัติปิดงาน</h2>
                    <p className="text-muted-foreground">รายการอีเวนต์ที่ปิดงานแล้วพร้อมข้อมูลกระเป๋าและของ</p>
                </div>
                <div className="flex items-center gap-4">
                    {hasOldClosures && (
                        <Button
                            variant="destructive"
                            onClick={handleCleanup}
                            disabled={isPending}
                        >
                            {isPending ? 'Deleting...' : 'ลบประวัติเก่าเกิน 60 วัน'}
                        </Button>
                    )}
                    <Badge variant="outline" className="text-lg px-4 py-2">
                        {closures.length} รายการ
                    </Badge>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
                    Error loading closures: {error}
                </div>
            )}

            <div className="grid gap-6">
                {closures.map((closure) => (
                    <ClosureCard key={closure.id} closure={closure} />
                ))}

                {closures.length === 0 && !error && (
                    <div className="text-center py-12 border rounded-lg border-dashed text-muted-foreground">
                        ยังไม่มีประวัติการปิดงาน
                    </div>
                )}
            </div>
        </div>
    )
}
