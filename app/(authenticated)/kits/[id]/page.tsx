import { supabase } from '@/lib/supabase'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { ArrowLeft, Trash, QrCode, Pencil } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import AddItemToKitForm from './add-item-form'
import { removeItemFromKit } from './actions'
import { ItemImagePreview } from './item-image-preview'

export const revalidate = 0

export default async function KitDetailsPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { data: kit } = await supabase.from('kits').select('*, events(name)').eq('id', params.id).single()
  
  if (!kit) notFound()

  // Get contents
  const { data: contents } = await supabase
    .from('kit_contents')
    .select('id, items(*)')
    .eq('kit_id', kit.id)

  const { data: allItems } = await supabase.from('items').select('*').eq('status', 'available').order('name')
  
  const addedItemIds = new Set(contents?.map((c: any) => c.items.id))
  const availableItems = allItems?.filter(item => !addedItemIds.has(item.id)) || []
  
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
                <p className="text-zinc-500">{kit.description}</p>
            </div>
        </div>
        <Link href={`/kits/${kit.id}/print`}>
            <Button variant="outline">
                <QrCode className="mr-2 h-4 w-4" /> Print QR
            </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
            <Card>
                <CardHeader>
                    <CardTitle>Contents</CardTitle>
                    <CardDescription>Items assigned to this kit</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[80px]">Image</TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Category</TableHead>
                                <TableHead>Qty</TableHead>
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
                                         <Link href={`/items/${content.items.id}`}>
                                            <Button variant="ghost" size="icon" title="Edit Item">
                                                <Pencil className="h-4 w-4 text-zinc-500" />
                                            </Button>
                                         </Link>
                                         <form action={removeItemFromKit.bind(null, content.id, kit.id)}>
                                             <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" title="Remove">
                                                 <Trash className="h-4 w-4" />
                                             </Button>
                                         </form>
                                    </TableCell>
                                </TableRow>
                            )})}
                            {(!contents || contents.length === 0) && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center text-zinc-500 py-8">
                                        This kit is empty.
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
        
        <div className="md:col-span-1">
             <Card>
                <CardHeader>
                    <CardTitle>Add Item</CardTitle>
                    <CardDescription>Add available items</CardDescription>
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
