'use client'

import { useEffect, useState } from 'react'
import { checkoutItems, checkinItem, type ReturnStatus } from './actions'
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

  const handleCheckin = async (itemId: string, status: ReturnStatus) => {
    if (!selectedEventId) {
        toast.error(t.checkin.selectEventFirst)
        return
    }

    toast.info(t.checkin.updating)
    const result = await checkinItem(selectedEventId, kit.id, itemId, status)

    if (result?.error) {
        toast.error(result.error)
    } else {
        setPackedSaved(false)
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
                                <div className="flex justify-between items-start">
                                    <div className="font-medium">{c.items.name}</div>
                                    <span className={`text-xs px-2 py-0.5 rounded ${c.items.status === 'in_use' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                                        {t.items.status[c.items.status as keyof typeof t.items.status] || c.items.status}
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <Button size="sm" variant="outline" className="border-green-200 hover:bg-green-50 text-green-700" onClick={() => handleCheckin(c.items.id, 'available')}>
                                        <CheckCircle2 className="h-4 w-4 mr-1" /> {t.items.status.available}
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-yellow-200 hover:bg-yellow-50 text-yellow-700" onClick={() => handleCheckin(c.items.id, 'damaged')}>
                                        <AlertTriangle className="h-4 w-4 mr-1" /> {t.items.status.damaged}
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-orange-200 hover:bg-orange-50 text-orange-700" onClick={() => handleCheckin(c.items.id, 'maintenance')}>
                                        <Wrench className="h-4 w-4 mr-1" /> {t.items.status.maintenance}
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-red-200 hover:bg-red-50 text-red-700" onClick={() => handleCheckin(c.items.id, 'lost')}>
                                        <XCircle className="h-4 w-4 mr-1" /> {t.items.status.lost}
                                    </Button>
                                </div>
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
