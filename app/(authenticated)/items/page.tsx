import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Plus, Eye, Trash } from "lucide-react"
import { deleteItemAction } from './[id]/delete-action'
import ItemsTable from './items-table'

export const revalidate = 3600 

export default async function ItemsPage() {
  const { data: items } = await supabase
    .from('items')
    .select(`
        *,
        kit_contents (
            kits (
                id,
                name,
                events (
                    id,
                    name
                )
            )
        )
    `)
    .order('name')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-bold tracking-tight">Inventory</h2>
        <Link href="/items/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" /> Add Item
          </Button>
        </Link>
      </div>

      <ItemsTable initialItems={items || []} />
    </div>
  )
}


function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    available: "bg-green-100 text-green-800 hover:bg-green-100 border-transparent",
    in_use: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-transparent",
    maintenance: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-transparent",
    lost: "bg-red-100 text-red-800 hover:bg-red-100 border-transparent",
    purchasing: "bg-purple-100 text-purple-800 hover:bg-purple-100 border-transparent",
  }
  
  return <Badge variant="outline" className={styles[status] || ""}>{status}</Badge>
}
