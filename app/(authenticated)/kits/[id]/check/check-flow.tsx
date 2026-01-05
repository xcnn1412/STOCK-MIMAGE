'use client'

import { useState } from 'react'
import { checkoutItems, checkinItem } from './actions'
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react"

type Kit = any
type Content = any
type Event = any

export default function CheckFlow({ kit, contents, events }: { kit: Kit, contents: Content[], events: Event[] }) {
  const [selectedEventId, setSelectedEventId] = useState<string>("")
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [isProcessing, setIsProcessing] = useState(false)

  const handleCheckout = async () => {
    if (!selectedEventId) {
      toast.error("Please select an event first")
      return
    }
    if (selectedItems.size === 0) {
        toast.error("No items selected")
        return
    }

    setIsProcessing(true)
    const result = await checkoutItems(selectedEventId, kit.id, Array.from(selectedItems))
    setIsProcessing(false)

    if (result?.error) {
        toast.error(result.error)
    } else {
        toast.success("Items checked out successfully")
        setSelectedItems(new Set())
    }
  }

  const handleCheckin = async (itemId: string, condition: 'good' | 'damaged' | 'lost') => {
    if (!selectedEventId) {
        toast.error("Please select an event first")
        return
    }
    
    toast.info("Updating...")
    const result = await checkinItem(selectedEventId, kit.id, itemId, condition)
    
    if (result?.error) {
        toast.error(result.error)
    } else {
        toast.success(`Item marked as ${condition}`)
    }
  }

  const toggleItem = (id: string) => {
    const next = new Set(selectedItems)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedItems(next)
  }

    const sortedContents = [...contents].sort((a,b) => a.items.name.localeCompare(b.items.name))

  return (
    <div className="max-w-md mx-auto space-y-4 pb-20">
        <div className="bg-zinc-100 p-4 rounded-lg dark:bg-zinc-800">
            <label className="text-sm font-medium mb-2 block">Active Event</label>
            <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                <SelectTrigger className="bg-white dark:bg-zinc-900">
                    <SelectValue placeholder="Select Event..." />
                </SelectTrigger>
                <SelectContent>
                    {events?.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.name} ({new Date(e.event_date).toLocaleDateString()})</SelectItem>
                    ))}
                    {(!events || events.length === 0) && <SelectItem value="none" disabled>No active events</SelectItem>}
                </SelectContent>
            </Select>
        </div>

        <Tabs defaultValue="checkout" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="checkout">Check Out</TabsTrigger>
                <TabsTrigger value="checkin">Check In</TabsTrigger>
            </TabsList>
            
            <TabsContent value="checkout" className="space-y-4">
                 <div className="bg-white dark:bg-zinc-900 rounded-lg border divide-y">
                    <div className="p-3 flex items-center justify-between bg-zinc-50 dark:bg-zinc-800">
                        <span className="text-sm font-medium">Select All</span>
                        <Checkbox 
                            checked={selectedItems.size === contents.length && contents.length > 0}
                            onCheckedChange={(c) => {
                                if (c) setSelectedItems(new Set(contents.map(c => c.items.id)))
                                else setSelectedItems(new Set())
                            }}
                        />
                    </div>
                    {sortedContents.map(c => (
                        <div key={c.id} className="p-3 flex items-center justify-between hover:bg-zinc-50 transition-colors cursor-pointer" onClick={() => toggleItem(c.items.id)}>
                            <div className="flex flex-col">
                                <span className="font-medium">{c.items.name}</span>
                                <span className={`text-xs px-2 py-0.5 rounded w-fit ${c.items.status === 'in_use' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}>
                                    {c.items.status}
                                </span>
                            </div>
                            <Checkbox 
                                checked={selectedItems.has(c.items.id)}
                                onCheckedChange={() => toggleItem(c.items.id)}
                            />
                        </div>
                    ))}
                 </div>
                 <Button onClick={handleCheckout} disabled={isProcessing} className="w-full" size="lg">
                    {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : "Checkout Selected"}
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
                                        {c.items.status}
                                    </span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                    <Button size="sm" variant="outline" className="border-green-200 hover:bg-green-50 text-green-700" onClick={() => handleCheckin(c.items.id, 'good')}>
                                        <CheckCircle2 className="h-4 w-4 mr-1" /> Good
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-yellow-200 hover:bg-yellow-50 text-yellow-700" onClick={() => handleCheckin(c.items.id, 'damaged')}>
                                        <AlertTriangle className="h-4 w-4 mr-1" /> Bad
                                    </Button>
                                    <Button size="sm" variant="outline" className="border-red-200 hover:bg-red-50 text-red-700" onClick={() => handleCheckin(c.items.id, 'lost')}>
                                        <XCircle className="h-4 w-4 mr-1" /> Lost
                                    </Button>
                                </div>
                            </CardContent>
                         </Card>
                    ))}
                </div>
            </TabsContent>
        </Tabs>
    </div>
  )
}
