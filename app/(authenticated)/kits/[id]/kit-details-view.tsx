'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { ArrowLeft, Trash, QrCode, Pencil } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import AddItemToKitForm from './add-item-form'
import { removeItemFromKit } from './actions'
import { ItemImagePreview } from './item-image-preview'
import { useLanguage } from '@/contexts/language-context'

export default function KitDetailsView({ 
    kit, 
    contents, 
    availableItems 
}: { 
    kit: any, 
    contents: any[], 
    availableItems: any[] 
}) {
  const { t } = useLanguage()

  return (
    <div className="space-y-6">
       <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
            <Link href="/kits">
            <Button variant="ghost" size="icon">
                <ArrowLeft className="h-4 w-4" />
            </Button>
            </Link>
            <div>
                <div className="flex items-center gap-3">
                    <h2 className="text-3xl font-bold tracking-tight">{kit.name}</h2>
                    {kit.events && (
                        <div className="bg-blue-100 text-blue-700 text-sm px-2 py-0.5 rounded-full font-medium">
                            in use @ {kit.events.name}
                        </div>
                    )}
                </div>
                <p className="text-zinc-500">{kit.description || t.common.noData}</p>
            </div>
        </div>
        <Link href={`/kits/${kit.id}/print`}>
            <Button variant="outline">
                <QrCode className="mr-2 h-4 w-4" /> {t.kits.printQR}
            </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>{t.kits.contents}</CardTitle>
                    <CardDescription>{t.kits.contentsSubtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Mobile View: Card List */}
                    <div className="md:hidden space-y-4">
                        {contents?.map((content: any) => {
                                let images: string[] = []
                                try {
                                    if (content.items.image_url) {
                                        if (content.items.image_url.startsWith('[')) {
                                            const parsed = JSON.parse(content.items.image_url)
                                            if (Array.isArray(parsed)) images = parsed
                                        } else {
                                            images = [content.items.image_url]
                                        }
                                    }
                                } catch (e) {}

                                return (
                                    <div key={content.id} className="flex items-start gap-4 p-4 border rounded-lg bg-zinc-50/50">
                                        <div className="shrink-0">
                                            <ItemImagePreview images={images} alt={content.items.name} />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-sm truncate">{content.items.name}</p>
                                            <p className="text-xs text-zinc-500 mb-1">{content.items.category}</p>
                                            <div className="flex items-center gap-2 text-xs font-medium bg-white border px-2 py-1 rounded w-fit">
                                                <span>{t.items.columns.qty}: {content.quantity || 1}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-col gap-1">
                                             <Link href={`/items/${content.items.id}?returnTo=/kits/${kit.id}`}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8" title={t.items.editTitle}>
                                                    <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                                                </Button>
                                             </Link>
                                             <form action={async () => { await removeItemFromKit(content.id, kit.id) }}>
                                                 <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50" title={t.common.delete}>
                                                     <Trash className="h-3.5 w-3.5" />
                                                 </Button>
                                             </form>
                                        </div>
                                    </div>
                                )
                        })}
                        {(!contents || contents.length === 0) && (
                            <p className="text-center text-zinc-500 py-8">{t.kits.noItems}</p>
                        )}
                    </div>

                    {/* Desktop View: Table */}
                    <div className="hidden md:block">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">{t.items.columns.image}</TableHead>
                                <TableHead>{t.items.columns.name}</TableHead>
                                <TableHead>{t.items.columns.category}</TableHead>
                                <TableHead>{t.items.columns.qty}</TableHead>
                                <TableHead className="w-[100px]"></TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {contents?.map((content: any) => {
                                let images: string[] = []
                                try {
                                    if (content.items.image_url) {
                                        if (content.items.image_url.startsWith('[')) {
                                            const parsed = JSON.parse(content.items.image_url)
                                            if (Array.isArray(parsed)) images = parsed
                                        } else {
                                            images = [content.items.image_url]
                                        }
                                    }
                                } catch (e) {}

                                return (
                                <TableRow key={content.id}>
                                    <TableCell>
                                        <ItemImagePreview images={images} alt={content.items.name} />
                                    </TableCell>
                                    <TableCell className="font-medium">{content.items.name}</TableCell>
                                    <TableCell>{content.items.category}</TableCell>
                                    <TableCell>{content.quantity || 1}</TableCell>
                                    <TableCell className="flex justify-end gap-2">
                                         <Link href={`/items/${content.items.id}?returnTo=/kits/${kit.id}`}>
                                            <Button variant="ghost" size="icon" title={t.items.editTitle}>
                                                <Pencil className="h-4 w-4 text-zinc-500" />
                                            </Button>
                                         </Link>
                                         <form action={async () => { await removeItemFromKit(content.id, kit.id) }}>
                                             <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" title={t.common.delete}>
                                                 <Trash className="h-4 w-4" />
                                             </Button>
                                         </form>
                                    </TableCell>
                                </TableRow>
                            )})}
                            {(!contents || contents.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={5} className="text-center text-zinc-500 py-8">
                                        {t.kits.noItems}
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                    </div>
                </CardContent>
            </Card>
        </div>
        
        <div className="md:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>{t.items.addItem}</CardTitle>
                    <CardDescription>{t.kits.addAvailable}</CardDescription>
                </CardHeader>
                <CardContent>
                    <AddItemToKitForm kitId={kit.id} availableItems={availableItems} />
                </CardContent>
            </Card>
        </div>
      </div>
    </div>
  )
}
