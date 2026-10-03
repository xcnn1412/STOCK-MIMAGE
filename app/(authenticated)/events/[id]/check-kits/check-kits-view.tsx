'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { ArrowLeft, ArrowRight, Package } from "lucide-react"
import { Card } from "@/components/ui/card"
import { useLanguage } from '@/contexts/language-context'
import type { Event, Kit } from '@/types'
import { packState, type PackItem } from '@/app/(authenticated)/shelves/consumable-logic'

export default function CheckKitsView({ event, kits }: { event: Event, kits: (Omit<Kit, 'kit_contents'> & { items: PackItem[] })[] }) {
  const { t } = useLanguage()

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6">
        <div className="flex items-center gap-4 mb-8">
            <Link href="/events">
                <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4"/></Button>
            </Link>
            <div>
                <h1 className="text-2xl font-bold">{t.kits.selectKit}</h1>
                <p className="text-muted-foreground">{event.name}</p>
            </div>
        </div>

        <div className="grid gap-4">
            {kits?.map(kit => {
                const pack = packState(kit.items)
                return (
                <Card key={kit.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                    <Link href={`/events/${event.id}/check-kits/${kit.id}`}>
                        <div className="flex items-center justify-between p-6">
                            <div className="flex items-center gap-4">
                                <div className="p-3 bg-blue-100 rounded-lg text-blue-600">
                                    <Package className="h-6 w-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-lg">{kit.name}</h3>
                                    <p className="text-sm text-muted-foreground">{kit.description || t.common.noData}</p>
                                    {pack.packed ? (
                                        <p className="text-xs font-medium text-green-700 dark:text-green-400">จัดครบแล้ว ✓</p>
                                    ) : pack.out > 0 ? (
                                        <p className="text-xs font-medium text-blue-700 dark:text-blue-400">นำออกแล้ว {pack.out}/{pack.total}</p>
                                    ) : (
                                        <p className="text-xs font-medium text-zinc-400">ยังไม่จัด</p>
                                    )}
                                    {pack.blocked.length > 0 && (
                                        <p className="text-xs font-medium text-amber-700 dark:text-amber-400">ขาด {pack.blocked.length} ชิ้น</p>
                                    )}
                                </div>
                            </div>
                            <ArrowRight className="h-5 w-5 text-zinc-400" />
                        </div>
                    </Link>
                </Card>
                )
            })}

            {(!kits || kits.length === 0) && (
                <div className="text-center py-12 bg-muted/20 border-2 border-dashed rounded-lg">
                    <p className="text-muted-foreground">{t.events.noKits}</p>
                    <Link href={`/events/${event.id}/edit`} className="mt-4 inline-block">
                        <Button variant="outline">{t.events.manageKits}</Button>
                    </Link>
                </div>
            )}
        </div>
    </div>
  )
}
