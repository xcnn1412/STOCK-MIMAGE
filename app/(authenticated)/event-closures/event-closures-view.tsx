'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useLanguage } from '@/contexts/language-context'
import { CalendarDays, MapPin, User, Package, ChevronDown, ChevronUp, Clock } from "lucide-react"

interface EventClosure {
    id: string
    event_name: string
    event_date: string | null
    event_location: string | null
    closed_at: string
    closer: { id: string; full_name: string } | null
    kits_snapshot: Array<{
        kitId: string
        kitName: string
        items: Array<{
            itemId: string
            itemName: string
            serialNumber: string | null
            status: string
            quantity: number
            imageUrl: string | null
        }>
    }> | null
    notes: string | null
}

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
        available: 'bg-green-100 text-green-700 border-green-200',
        maintenance: 'bg-orange-100 text-orange-700 border-orange-200',
        lost: 'bg-red-100 text-red-700 border-red-200',
        in_use: 'bg-blue-100 text-blue-700 border-blue-200',
    }
    return (
        <Badge variant="outline" className={`text-[10px] ${colors[status] || ''}`}>
            {status}
        </Badge>
    )
}

function ClosureCard({ closure }: { closure: EventClosure }) {
    const [isExpanded, setIsExpanded] = useState(false)
    const totalItems = closure.kits_snapshot?.reduce((sum, kit) => sum + kit.items.length, 0) || 0
    const totalKits = closure.kits_snapshot?.length || 0

    return (
        <Card className="overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b">
                <div className="flex items-start justify-between">
                    <div className="space-y-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                            <CalendarDays className="h-5 w-5 text-green-600" />
                            {closure.event_name}
                        </CardTitle>
                        {closure.event_location && (
                            <CardDescription className="flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {closure.event_location}
                            </CardDescription>
                        )}
                    </div>
                    <Badge className="bg-green-600">ปิดงานแล้ว</Badge>
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
                                {closure.kits_snapshot?.map((kit) => (
                                    <div key={kit.kitId} className="border rounded-lg p-3 bg-muted/30">
                                        <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                                            📦 {kit.kitName}
                                            <Badge variant="secondary" className="text-[10px]">
                                                {kit.items.length} ชิ้น
                                            </Badge>
                                        </h4>
                                        <div className="space-y-2">
                                            {kit.items.map((item, idx) => (
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
            </CardContent>
        </Card>
    )
}

export default function EventClosuresView({ closures, error }: { closures: EventClosure[], error: any }) {
    const { t } = useLanguage()

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold tracking-tight">ประวัติปิดงาน</h2>
                    <p className="text-muted-foreground">รายการอีเวนต์ที่ปิดงานแล้วพร้อมข้อมูลกระเป๋าและของ</p>
                </div>
                <Badge variant="outline" className="text-lg px-4 py-2">
                    {closures.length} รายการ
                </Badge>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">
                    Error loading closures: {error.message}
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
