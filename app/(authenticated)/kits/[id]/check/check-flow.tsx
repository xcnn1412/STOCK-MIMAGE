'use client'

import { useEffect, useRef, useState } from 'react'
import { checkoutItems, checkinItem, syncKitPacked, type ReturnStatus } from './actions'
import { packState } from '@/app/(authenticated)/shelves/consumable-logic'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Wrench } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'

type Kit = any
type Content = any
type Event = any

export default function CheckFlow({ kit, contents, events, initialEventId, initialPacked = false, lockEvent = false }: { kit: Kit, contents: Content[], events: Event[], initialEventId?: string, initialPacked?: boolean, lockEvent?: boolean }) {
  const { t } = useLanguage()
  const [selectedEventId, setSelectedEventId] = useState<string>(initialEventId || "")
  const [selectedItems, setSelectedItems] = useState<Set<string>>(() => new Set<string>())
  const [isProcessing, setIsProcessing] = useState(false)
  // "จัดครบ" = นำอุปกรณ์ออกครบทุกชิ้นแล้ว — server คิดให้ตอนนำออก/รับคืน (event_kits.packed_at)
  const [packedSaved, setPackedSaved] = useState(initialPacked)
  useEffect(() => setPackedSaved(initialPacked), [initialPacked])

  // วัสดุสิ้นเปลืองแยกกลุ่ม — ไม่มีนำออก/รับคืน (กรอกจำนวนใช้ไปตอนปิดงาน)
  const regular = contents.filter(c => !c.items.is_consumable)
  const consumables = contents.filter(c => c.items.is_consumable).sort((a, b) => a.items.name.localeCompare(b.items.name))
  // นำออกได้เฉพาะชิ้นที่ "ว่าง"
  const selectable = regular.filter(c => c.items.status === 'available')
  // นำออกแล้ว x/y + ชิ้นที่นำออกไม่ได้ (เสีย/ซ่อม/หาย) — จัดครบได้โดยไม่ต้องมีชิ้นเหล่านี้
  const pack = packState(contents.map(c => c.items))
  const statusLabel = (s: string) => t.items.status[s as keyof typeof t.items.status] || s
  // แถวรับคืนที่ผู้ใช้กด "เปลี่ยนสถานะ" (ชิ้นที่ไม่ได้ออกงานอยู่)
  const [changing, setChanging] = useState<Set<string>>(() => new Set<string>())

  // ป้าย "จัดครบ" ที่บันทึกไว้อาจคิดด้วยกติกาเก่า — เปิดหน้าแล้วไม่ตรงกติกาใหม่ ให้ server คิดใหม่ครั้งเดียว
  const syncedRef = useRef(false)
  useEffect(() => {
    if (syncedRef.current || !selectedEventId) return
    syncedRef.current = true
    if (pack.packed === initialPacked) return
    syncKitPacked(selectedEventId, kit.id).then(r => {
      if ('packed' in r) setPackedSaved(r.packed)
    })
  // ponytail: ตั้งใจรันครั้งเดียวตอนเปิดหน้า (ref กันซ้ำ)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleCheckout = async () => {
    if (!selectedEventId) {
      toast.error(t.checkin.selectEventFirst)
      return
    }
    if (selectedItems.size === 0) {
        toast.error(t.checkin.noItemsSelected)
        return
    }

    setIsProcessing(true)
    const result = await checkoutItems(selectedEventId, kit.id, Array.from(selectedItems))
    setIsProcessing(false)

    if (result?.error) {
        toast.error(result.error)
    } else {
        toast.success(result?.packed ? `${t.checkin.successCheckout} — จัดครบแล้ว ✓` : t.checkin.successCheckout)
        if (result?.packed) setPackedSaved(true)
        setSelectedItems(new Set())
    }
  }

  const handleCheckin = async (itemId: string, itemName: string, status: ReturnStatus) => {
    if (!selectedEventId) {
        toast.error(t.checkin.selectEventFirst)
        return
    }
    // เสียหาย / ซ่อมบำรุง / หาย ถามยืนยันก่อน (กดพลาดแล้วข้อมูลผิด) · ใช้ได้ไม่ต้องถาม
    if (status !== 'available' && !confirm(`ยืนยันรับคืน "${itemName}" เป็น "${statusLabel(status)}" ?`)) return

    toast.info(t.checkin.updating)
    const result = await checkinItem(selectedEventId, kit.id, itemId, status)

    if (result?.error) {
        toast.error(result.error)
    } else {
        // รับคืนเป็น "ใช้ได้" = ไม่ครบแล้ว · เสีย/ซ่อม/หาย ไม่นับในจัดครบ จึงไม่เปลี่ยนป้าย (server คิดให้แล้ว)
        if (status === 'available') setPackedSaved(false)
        setChanging(prev => { const next = new Set(prev); next.delete(itemId); return next })
        toast.success(`${t.checkin.successCheckin} ${t.items.status[status as keyof typeof t.items.status] || status}`)
    }
  }

  const toggleItem = (id: string) => {
    if (!selectable.some(c => c.items.id === id)) return
    const next = new Set(selectedItems)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedItems(next)
  }

    const sortedContents = [...regular].sort((a,b) => a.items.name.localeCompare(b.items.name))

  const consumableGroup = (note?: string) => consumables.length > 0 && (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border divide-y">
      <div className="p-3 text-sm font-medium bg-zinc-50 dark:bg-zinc-800">วัสดุสิ้นเปลืองประจำกระเป๋า</div>
      {note && <p className="px-3 py-2 text-xs text-zinc-500">{note}</p>}
      {consumables.map(c => (
        <div key={c.id} className="p-3 flex items-center justify-between">
          <span className="font-medium">{c.items.name}</span>
          <span className="text-sm text-zinc-600 dark:text-zinc-400">× {c.quantity || 1} {c.items.unit || ''}</span>
        </div>
      ))}
    </div>
  )

  return (
    <div className="max-w-md mx-auto space-y-4 pb-20">
        <div className="bg-zinc-100 p-4 rounded-lg dark:bg-zinc-800">
            <label className="text-sm font-medium mb-2 block">{t.checkin.selectEvent}</label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId} disabled={lockEvent}>
                <SelectTrigger className="bg-white dark:bg-zinc-900">
                    <SelectValue placeholder={t.checkin.selectEventPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                    {events?.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name} ({new Date(e.event_date).toLocaleDateString()})</SelectItem>
                    ))}
                    {(!events || events.length === 0) && <SelectItem value="none" disabled>{t.checkin.noEvents}</SelectItem>}
                </SelectContent>
            </Select>
        </div>

        {pack.blocked.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                <div className="flex items-center gap-2 font-medium">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> ขาด {pack.blocked.length} ชิ้น
                </div>
                <ul className="mt-1 space-y-0.5">
                    {pack.blocked.map(b => (
                        <li key={b.id} className="wrap-break-word">{b.name} — {statusLabel(b.status)}</li>
                    ))}
                </ul>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">จัดครบได้โดยไม่ต้องมีชิ้นเหล่านี้</p>
            </div>
        )}

        <Tabs defaultValue="checkout" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="checkout">{t.checkin.checkout}</TabsTrigger>
                <TabsTrigger value="checkin">{t.checkin.checkin}</TabsTrigger>
            </TabsList>

            <TabsContent value="checkout" className="space-y-4">
                 <div className="bg-white dark:bg-zinc-900 rounded-lg border divide-y">
                    <div className="p-3 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800">
                        <span className="text-sm font-medium">
                            {t.checkin.selectAll}
                            <span className="ml-2 text-xs font-normal text-zinc-500">
                                นำออกแล้ว {pack.out}/{pack.total}
                            </span>
                            {packedSaved && (
                                <span className="ml-2 text-xs font-medium text-green-700 dark:text-green-400">
                                    จัดครบแล้ว ✓
                                </span>
                            )}
                        </span>
                        <Checkbox
                            checked={selectable.length > 0 && selectedItems.size === selectable.length}
                            disabled={selectable.length === 0}
                            onCheckedChange={(c) => {
                                if (c) setSelectedItems(new Set(selectable.map(c => c.items.id)))
                                else setSelectedItems(new Set())
                            }}
                        />
                    </div>
                    {sortedContents.map(c => (
                        <div key={c.id} className="p-3 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer" onClick={() => toggleItem(c.items.id)}>
                            <div className="flex flex-col">
                                <span className="font-medium">{c.items.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded w-fit ${c.items.status === 'in_use' ? 'bg-blue-100 text-blue-800' : c.items.status === 'available' ? 'bg-green-100 text-green-800' : 'bg-zinc-200 text-zinc-700'}`}>
                                    {t.items.status[c.items.status as keyof typeof t.items.status] || c.items.status}
                                </span>
                            </div>
                            <Checkbox
                                checked={selectedItems.has(c.items.id)}
                                disabled={c.items.status !== 'available'}
                                onCheckedChange={() => toggleItem(c.items.id)}
                            />
                        </div>
                    ))}
                 </div>
                 {consumableGroup()}
                 <Button onClick={handleCheckout} disabled={isProcessing} className="w-full" size="lg">
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : t.checkin.checkoutSelected}
                 </Button>
            </TabsContent>

            <TabsContent value="checkin" className="space-y-4">
                <div className="space-y-3">
                    {sortedContents.map(c => (
                         <Card key={c.id}>
                            <CardContent className="p-4 flex flex-col gap-3">
                                <div className="flex justify-between items-start gap-2">
                                    <div className="font-medium min-w-0 wrap-break-word">{c.items.name}</div>
                                    <span className={`shrink-0 text-xs px-2 py-0.5 rounded ${c.items.status === 'in_use' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {statusLabel(c.items.status)}
                                    </span>
                                </div>
                                {/* 4 ปุ่มเฉพาะชิ้นที่ออกงานอยู่ — ชิ้นอื่นต้องกด "เปลี่ยนสถานะ" ก่อน */}
                                {c.items.status === 'in_use' || changing.has(c.items.id) ? (
                                <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" variant="outline" className="min-h-10 border-green-200 hover:bg-green-50 text-green-700" onClick={() => handleCheckin(c.items.id, c.items.name, 'available')}>
                                        <CheckCircle2 className="h-4 w-4 mr-1" /> {t.items.status.available}
                                    </Button>
                                    <Button size="sm" variant="outline" className="min-h-10 border-yellow-200 hover:bg-yellow-50 text-yellow-700" onClick={() => handleCheckin(c.items.id, c.items.name, 'damaged')}>
                                        <AlertTriangle className="h-4 w-4 mr-1" /> {t.items.status.damaged}
                                    </Button>
                                    <Button size="sm" variant="outline" className="min-h-10 border-orange-200 hover:bg-orange-50 text-orange-700" onClick={() => handleCheckin(c.items.id, c.items.name, 'maintenance')}>
                                        <Wrench className="h-4 w-4 mr-1" /> {t.items.status.maintenance}
                                    </Button>
                                    <Button size="sm" variant="outline" className="min-h-10 border-red-200 hover:bg-red-50 text-red-700" onClick={() => handleCheckin(c.items.id, c.items.name, 'lost')}>
                                        <XCircle className="h-4 w-4 mr-1" /> {t.items.status.lost}
                                    </Button>
                                </div>
                                ) : (
                                <Button size="sm" variant="ghost" className="min-h-10 w-full text-zinc-600" onClick={() => setChanging(prev => new Set(prev).add(c.items.id))}>
                                    เปลี่ยนสถานะ
                                </Button>
                                )}
                            </CardContent>
                         </Card>
                    ))}
                </div>
                {consumableGroup('จำนวนที่ใช้ไปกรอกตอนปิดงาน')}
            </TabsContent>
        </Tabs>
    </div>
  )
}
