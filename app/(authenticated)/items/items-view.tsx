'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import ItemsTable from './items-table'
import { useLanguage } from '@/contexts/language-context'
import type { Item } from '@/types'

export default function ItemsView({ items }: { items: Item[] }) {
    const { t } = useLanguage()
    
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-3xl font-bold tracking-tight">{t.items.title}</h2>
                <Link href="/items/new">
                    <Button>
                        <Plus className="mr-2 h-4 w-4" /> {t.items.addItem}
                    </Button>
                </Link>
            </div>

            <ItemsTable initialItems={items} />
        </div>
    )
}
