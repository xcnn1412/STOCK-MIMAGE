'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Eye, Trash, ArrowUpDown, Search, Filter } from "lucide-react"
import { deleteItemAction } from './[id]/delete-action'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
  } from "@/components/ui/alert-dialog"

type Item = {
    id: string
    name: string
    category: string
    quantity: number | null
    serial_number: string | null
    status: string
    price: number | null
    image_url: string | null
    kit_contents: any[]
}

export default function ItemsTable({ initialItems }: { initialItems: Item[] }) {
  const [items, setItems] = useState<Item[]>(initialItems)
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' } | null>(null)
  const [filterText, setFilterText] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const handleSort = (key: string) => {
      let direction: 'asc' | 'desc' = 'asc'
      if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc'
      }
      setSortConfig({ key, direction })
  }

  const getNestedValue = (item: Item, key: string) => {
      if (key === 'kit') {
          return item.kit_contents?.[0]?.kits?.name || ''
      }
      if (key === 'event') {
          return item.kit_contents?.[0]?.kits?.events?.name || ''
      }
      return (item as any)[key]
  }

  const filteredItems = items.filter(item => {
    // Text Filter (Name, Category, Serial, Kit, Event)
    const searchText = filterText.toLowerCase()
    const kitName = item.kit_contents?.[0]?.kits?.name || ''
    const eventName = item.kit_contents?.[0]?.kits?.events?.name || ''
    
    const matchesText = 
      item.name.toLowerCase().includes(searchText) ||
      (item.category || '').toLowerCase().includes(searchText) ||
      (item.serial_number || '').toLowerCase().includes(searchText) ||
      kitName.toLowerCase().includes(searchText) ||
      eventName.toLowerCase().includes(searchText)

    // Status Filter
    let matchesStatus = true
    if (statusFilter !== 'all') {
        const kitContent = item.kit_contents && item.kit_contents[0]
        const kit = kitContent?.kits
        const event = kit?.events
        const displayStatus = event ? 'in_use' : item.status
        matchesStatus = displayStatus === statusFilter
    }

    return matchesText && matchesStatus
  })

  const sortedItems = [...filteredItems].sort((a, b) => {
      if (!sortConfig) return 0
      
      const aValue = getNestedValue(a, sortConfig.key) || ''
      const bValue = getNestedValue(b, sortConfig.key) || ''

      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1
      return 0
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              type="search"
              placeholder="Filter items..."
              className="pl-8"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2">
                      <Filter className="h-4 w-4" />
                      Status: {statusFilter === 'all' ? 'All' : statusFilter}
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                  <DropdownMenuCheckboxItem checked={statusFilter === 'all'} onCheckedChange={() => setStatusFilter('all')}>
                      All
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'available'} onCheckedChange={() => setStatusFilter('available')}>
                      Available
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'in_use'} onCheckedChange={() => setStatusFilter('in_use')}>
                      In Use
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'maintenance'} onCheckedChange={() => setStatusFilter('maintenance')}>
                      Maintenance
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'lost'} onCheckedChange={() => setStatusFilter('lost')}>
                      Lost
                  </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
          </DropdownMenu>
      </div>

      <div className="border rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Image</TableHead>
              <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-zinc-50 md:table-cell">
                  <div className="flex items-center gap-1">Name <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('category')} className="cursor-pointer hover:bg-zinc-50 hidden md:table-cell">
                  <div className="flex items-center gap-1">Category <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('quantity')} className="cursor-pointer hover:bg-zinc-50 hidden md:table-cell">
                  <div className="flex items-center gap-1">Qty <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead className="hidden md:table-cell">Serial #</TableHead>
              <TableHead onClick={() => handleSort('kit')} className="cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-1">Kit <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('event')} className="cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-1">Event <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('status')} className="cursor-pointer hover:bg-zinc-50">
                   <div className="flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('price')} className="cursor-pointer hover:bg-zinc-50 text-right">
                  <div className="flex items-center justify-end gap-1">Price <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead className="w-[100px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedItems.map((item) => {
              let displayImage = null
              try {
                  if (item.image_url) {
                      if (item.image_url.startsWith('[')) {
                          const parsed = JSON.parse(item.image_url)
                          if (Array.isArray(parsed) && parsed.length > 0) displayImage = parsed[0]
                      } else {
                          displayImage = item.image_url
                      }
                  }
              } catch (e) {}

              const kitContent = item.kit_contents && item.kit_contents[0]
              const kit = kitContent?.kits
              const event = kit?.events
              const displayStatus = event ? 'in_use' : item.status

              let displaySerial = '-'
              if (item.serial_number && item.serial_number.length > 6) {
                   displaySerial = '...' + item.serial_number.slice(-6)
              } else if (item.serial_number) {
                   displaySerial = item.serial_number
              }

              return (
              <TableRow key={item.id}>
                <TableCell>
                  {displayImage ? (
                    <img 
                      src={displayImage} 
                      alt={item.name} 
                      className="h-10 w-10 object-cover rounded-md bg-zinc-100" 
                    />
                  ) : (
                    <div className="h-10 w-10 bg-zinc-100 rounded-md flex items-center justify-center text-xs text-zinc-400">No Img</div>
                  )}
                </TableCell>
                <TableCell className="font-medium">{item.name}</TableCell>
                <TableCell className="hidden md:table-cell">{item.category}</TableCell>
                <TableCell className="hidden md:table-cell">{item.quantity || 1}</TableCell>
                <TableCell className="hidden md:table-cell font-mono text-xs">{displaySerial}</TableCell>
                <TableCell>
                    {kit ? (
                        <div className="flex items-center gap-1">
                             <span className="font-medium text-sm">📦 {kit.name}</span>
                        </div>
                    ) : (
                        <span className="text-zinc-400 text-sm">-</span>
                    )}
                </TableCell>
                <TableCell>
                    {event ? (
                         <div className="flex items-center gap-1">
                             <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded font-medium">
                                 📍 {event.name}
                             </span>
                        </div>
                    ) : (
                        <span className="text-zinc-400 text-sm">-</span>
                    )}
                </TableCell>
                <TableCell>
                  <StatusBadge status={displayStatus} />
                </TableCell>
                <TableCell className="text-right">
                  {item.price ? `$${item.price}` : '-'}
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                         <Link href={`/items/${item.id}`}>
                            <Button variant="ghost" size="icon" title="View details">
                                <Eye className="h-4 w-4" />
                            </Button>
                        </Link>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" title="Delete">
                                     <Trash className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete <b>{item.name}</b> from the inventory.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <form action={deleteItemAction.bind(null, item.id)}>
                                        <AlertDialogAction type="submit" className="bg-red-600 hover:bg-red-700 text-white border-none">Delete</AlertDialogAction>
                                    </form>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    </div>
                </TableCell>
              </TableRow>
            )})}
            {sortedItems.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="h-24 text-center text-zinc-500">
                  No items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
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
