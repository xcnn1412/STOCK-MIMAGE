'use client'


import { useState, useTransition } from 'react'
import { processEventReturn } from '../../actions' // Adjust path if necessary
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowLeft, Loader2, CheckCircle2 } from "lucide-react"
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useLanguage } from '@/contexts/language-context'

type ReturnProps = {
    event: any
    itemsByKit: Record<string, { kitName: string, items: any[] }>
}

export default function CheckListForm({ event, itemsByKit }: ReturnProps) {
    const { t } = useLanguage()
    const router = useRouter()
    const [isPending, startTransition] = useTransition()
    const [statuses, setStatuses] = useState<Record<string, string>>({})

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

    const handleSubmit = () => {
        if (!isComplete) return

        startTransition(async () => {
             const payload = Object.entries(statuses).map(([itemId, status]) => ({ itemId, status }))
             await processEventReturn(event.id, payload)
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
                                                <SelectTrigger className={statuses[item.id] ? "border-green-500 bg-green-50 text-green-700 font-medium" : ""}>
                                                    <SelectValue placeholder={t.common.status} />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="available">{t.items.status.available}</SelectItem>
                                                    <SelectItem value="maintenance">{t.items.status.maintenance}</SelectItem>
                                                    <SelectItem value="lost">{t.items.status.lost}</SelectItem>
                                                    <SelectItem value="in_use">{t.items.status.in_use}</SelectItem>
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

            <div className="sticky bottom-4 bg-white/80 backdrop-blur-md p-4 border rounded-xl shadow-lg flex items-center justify-between">
                <div className="text-sm font-medium">
                    {t.events.checkedCount.replace('{completed}', completedCount.toString()).replace('{total}', totalItems.toString())}
                </div>
                <Button 
                    size="lg" 
                    className={isComplete ? "bg-green-600 hover:bg-green-700" : ""}
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
