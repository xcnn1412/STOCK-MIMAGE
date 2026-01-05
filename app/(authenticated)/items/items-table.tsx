'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Eye, Trash, ArrowUpDown, Search, Filter } from "lucide-react"
import { Card } from "@/components/ui/card"
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
import { useLanguage } from '@/contexts/language-context'

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
  const { t } = useLanguage()
  const [items, setItems] = useState<Item[]>(initialItems)

  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])
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
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
          <div className="relative max-w-sm flex-1 w-full">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              type="search"
              placeholder={t.items.searchPlaceholder}
              className="pl-8"
              value={filterText}
              onChange={(e) => setFilterText(e.target.value)}
            />
          </div>
          <DropdownMenu>
              <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="gap-2 w-full sm:w-auto">
                      <Filter className="h-4 w-4" />
                      {t.items.filterStatus}: {statusFilter === 'all' ? t.items.status.all : statusFilter}
                  </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                  <DropdownMenuCheckboxItem checked={statusFilter === 'all'} onCheckedChange={() => setStatusFilter('all')}>
                      {t.items.status.all}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'available'} onCheckedChange={() => setStatusFilter('available')}>
                      {t.items.status.available}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'in_use'} onCheckedChange={() => setStatusFilter('in_use')}>
                      {t.items.status.in_use}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'maintenance'} onCheckedChange={() => setStatusFilter('maintenance')}>
                      {t.items.status.maintenance}
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={statusFilter === 'lost'} onCheckedChange={() => setStatusFilter('lost')}>
                      {t.items.status.lost}
                  </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
          </DropdownMenu>
      </div>

      {/* Mobile View (Cards) */}
      <div className="md:hidden grid grid-cols-1 gap-4">
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

             return (
                 <Card key={item.id} className="overflow-hidden">
                     <div className="flex p-4 gap-4">
                         <div className="h-16 w-16 bg-zinc-100 rounded-md shrink-0 overflow-hidden border">
                             {displayImage ? (
                                <img src={displayImage} alt={item.name} className="h-full w-full object-cover" />
                             ) : (
                                <div className="h-full w-full flex items-center justify-center text-xs text-zinc-400 bg-muted">No Img</div>
                             )}
                         </div>
                         <div className="flex-1 min-w-0">
                             <div className="flex justify-between items-start gap-2">
                                 <div className="min-w-0">
                                    <h3 className="font-semibold text-base truncate">{item.name}</h3>
                                    <p className="text-sm text-foreground/60">{item.category}</p>
                                 </div>
                                 <StatusBadge status={displayStatus} t={t} />
                             </div>
                             
                             <div className="mt-2 text-sm grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                                 <div>{t.items.columns.qty}: <span className="text-foreground">{item.quantity || 1}</span></div>
                                 <div className="truncate">SN: <span className="text-foreground">{item.serial_number || '-'}</span></div>
                             </div>
                         </div>
                     </div>
                     
                     {(kit || event) && (
                         <div className="bg-muted/30 px-4 py-2 text-sm border-t border-b flex items-center gap-4">
                             {kit && <div className="flex items-center gap-1.5 truncate min-w-0"><span className="text-base shrink-0">📦</span> <span className="truncate" title={kit.name}>{kit.name}</span></div>}
                             {event && <div className="flex items-center gap-1.5 truncate text-blue-600 font-medium min-w-0"><span className="text-base shrink-0">📍</span> <span className="truncate" title={event.name}>{event.name}</span></div>}
                         </div>
                     )}

                     <div className="p-3 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900 border-t">
                         <div className="px-1 font-medium text-sm">
                            {item.price ? `$${item.price.toLocaleString()}` : <span className="text-muted-foreground">-</span>}
                         </div>
                         <div className="flex items-center gap-1">
                             <Link href={`/items/${item.id}`}>
                                <Button variant="ghost" size="sm" className="h-8 group">
                                    <Eye className="h-4 w-4 mr-1.5 text-muted-foreground group-hover:text-foreground" /> {t.common.view}
                                </Button>
                            </Link>
                            
                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="ghost" size="sm" className="h-8 text-red-500 hover:text-red-700 hover:bg-red-50">
                                         <Trash className="h-4 w-4 mr-1.5" /> {t.common.delete}
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>{t.items.deleteTitle}</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            {t.items.deleteConfirm}
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                        <AlertDialogAction 
                                            onClick={async (e) => {
                                                e.preventDefault()
                                                const btn = e.currentTarget
                                                const originalText = btn.innerText
                                                btn.innerText = "Deleting..."
                                                btn.style.opacity = "0.7"
                                                
                                                try {
                                                    await deleteItemAction(item.id)
                                                    window.location.reload()
                                                } catch (error) {
                                                    console.error("Delete failed", error)
                                                    alert("Failed to delete item. Please check logs.")
                                                    btn.innerText = originalText
                                                    btn.style.opacity = "1"
                                                }
                                            }}
                                            className="bg-red-600 hover:bg-red-700 text-white border-none"
                                        >
                                            {t.common.delete}
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>
                         </div>
                     </div>
                 </Card>
             )
        })}
        {sortedItems.length === 0 && (
            <div className="text-center py-10 text-muted-foreground bg-muted/20 rounded-lg border border-dashed">
                {t.common.noData}
            </div>
        )}
      </div>

      {/* Desktop View (Table) */}
      <div className="hidden md:block border rounded-lg bg-white dark:bg-zinc-900 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">{t.items.columns.image}</TableHead>
              <TableHead onClick={() => handleSort('name')} className="cursor-pointer hover:bg-zinc-50 md:table-cell">
                  <div className="flex items-center gap-1">{t.items.columns.name} <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('category')} className="cursor-pointer hover:bg-zinc-50 hidden md:table-cell">
                  <div className="flex items-center gap-1">{t.items.columns.category} <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('quantity')} className="cursor-pointer hover:bg-zinc-50 hidden md:table-cell">
                  <div className="flex items-center gap-1">{t.items.columns.qty} <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead className="hidden md:table-cell">{t.items.columns.serial}</TableHead>
              <TableHead onClick={() => handleSort('kit')} className="cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-1">{t.items.columns.kit} <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('event')} className="cursor-pointer hover:bg-zinc-50">
                  <div className="flex items-center gap-1">{t.items.columns.event} <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('status')} className="cursor-pointer hover:bg-zinc-50">
                   <div className="flex items-center gap-1">{t.items.columns.status} <ArrowUpDown className="h-3 w-3" /></div>
              </TableHead>
              <TableHead onClick={() => handleSort('price')} className="cursor-pointer hover:bg-zinc-50 text-right">
                  <div className="flex items-center justify-end gap-1">{t.items.columns.price} <ArrowUpDown className="h-3 w-3" /></div>
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
                  <StatusBadge status={displayStatus} t={t} />
                </TableCell>
                <TableCell className="text-right">
                  {item.price ? `$${item.price}` : '-'}
                </TableCell>
                <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                         <Link href={`/items/${item.id}`}>
                            <Button variant="ghost" size="icon" title={t.common.view}>
                                <Eye className="h-4 w-4" />
                            </Button>
                        </Link>
                        <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-700 hover:bg-red-50" title={t.common.delete}>
                                     <Trash className="h-4 w-4" />
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>{t.items.deleteTitle}</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        {t.items.deleteConfirm}
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
                                    <AlertDialogAction 
                                        onClick={async (e) => {
                                            e.preventDefault()
                                            const btn = e.currentTarget
                                            const originalText = btn.innerText
                                            btn.innerText = "Deleting..."
                                            btn.style.opacity = "0.7"
                                            
                                            try {
                                                await deleteItemAction(item.id)
                                                window.location.reload()
                                            } catch (error) {
                                                console.error("Delete failed", error)
                                                btn.innerText = originalText
                                                btn.style.opacity = "1"
                                            }
                                        }}
                                        className="bg-red-600 hover:bg-red-700 text-white border-none"
                                    >
                                        {t.common.delete}
                                    </AlertDialogAction>
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
                  {t.common.noData}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function StatusBadge({ status, t }: { status: string, t: any }) {
  const styles: Record<string, string> = {
    available: "bg-green-100 text-green-800 hover:bg-green-100 border-transparent",
    in_use: "bg-blue-100 text-blue-800 hover:bg-blue-100 border-transparent",
    maintenance: "bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-transparent",
    lost: "bg-red-100 text-red-800 hover:bg-red-100 border-transparent",
    purchasing: "bg-purple-100 text-purple-800 hover:bg-purple-100 border-transparent",
  }
  
  const statusLabel = status === 'in_use' ? t.items.status.in_use : (t.items.status[status as keyof typeof t.items.status] || status)

  return <Badge variant="outline" className={styles[status] || ""}>{statusLabel}</Badge>
}
