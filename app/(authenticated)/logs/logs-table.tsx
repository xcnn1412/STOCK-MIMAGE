'use client'

import { useState } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"
import { useLanguage } from '@/contexts/language-context'

function FormatDate({ date }: { date: string }) {
    if (!date) return null
    return <span className="whitespace-nowrap">{new Date(date).toLocaleString('th-TH')}</span>
}

function formatId(id: string) {
    if (!id) return 'Unknown'
    return id.substring(0, 8)
}

function ImagePreview({ urls }: { urls: string | string[] | null }) {
    if (!urls) return null
    let urlArray: string[] = []
    try {
        if (typeof urls === 'string') {
             urlArray = JSON.parse(urls)
        } else if (Array.isArray(urls)) {
            urlArray = urls
        }
    } catch (e) {
        return null 
    }
    
    if (!Array.isArray(urlArray) || urlArray.length === 0) return null

    return (
        <div className="flex gap-2 mt-1 flex-wrap">
            {urlArray.map((url, idx) => (
                <a key={idx} href={url} target="_blank" rel="noopener noreferrer" className="relative group block">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img 
                        src={url} 
                        alt="Preview" 
                        className="h-12 w-12 object-cover rounded border bg-background hover:scale-110 transition-transform" 
                    />
                </a>
            ))}
        </div>
    )
}

function LogDetails({ log }: { log: any }) {
    const details = log.details || {}
    const action = log.action_type

    // Authentication
    if (action === 'LOGIN') {
        return (
            <div className="flex flex-col gap-1 text-xs">
                <span>Method: {details.method || 'Unknown'}</span>
                {details.latitude && (
                    <a 
                        href={`https://www.google.com/maps?q=${details.latitude},${details.longitude}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline flex items-center gap-1"
                    >
                        📍 Location
                    </a>
                )}
            </div>
        )
    }

    // Items
    if (action === 'UPDATE_ITEM') {
         const displayName = details.name || <span className="text-muted-foreground font-mono" title={details.id}>Item #{formatId(details.id)}</span>
         return (
             <div className="flex flex-col gap-1">
                 <span className="font-medium text-foreground">{displayName}</span>
                 {details.changes ? (
                    <div className="text-xs space-y-1 bg-muted/30 p-1.5 rounded border border-muted">
                        {Object.entries(details.changes).map(([key, change]: [string, any]) => {
                            let fromVal = String(change.from)
                            let toVal = String(change.to)
                            
                            // Check if values look like image/file paths arrays or long JSON
                            if (fromVal.includes('[') && fromVal.includes('http')) fromVal = '(Image list)'
                            if (toVal.includes('[') && toVal.includes('http')) toVal = '(Image list)'
                            
                            // Specific check for 'image_url' key
                            if (key === 'image_url') {
                                return (
                                    <div key={key} className="flex flex-col gap-1 w-full mt-1">
                                        <div className="flex gap-1 items-center">
                                            <span className="font-semibold capitalize">Image:</span> 
                                            <span className="text-muted-foreground italic">Updated</span>
                                        </div>
                                        <div className="flex gap-4">
                                            <div><ImagePreview urls={String(change.to)} /></div>
                                        </div>
                                    </div>
                                )
                            }

                            return (
                                <div key={key} className="flex gap-1 flex-wrap">
                                    <span className="font-semibold capitalize">{key.replace('_', ' ')}:</span> 
                                    <span className="text-red-500 line-through max-w-[100px] truncate">{fromVal}</span> 
                                    <span>&rarr;</span>
                                    <span className="text-green-600 font-medium max-w-[120px] truncate">{toVal}</span>
                                </div>
                            )
                        })}
                    </div>
                 ) : (
                     !details.name && <span className="text-xs text-muted-foreground italic">(Legacy log: No details recorded)</span>
                 )}
             </div>
         )
    }

    if (action === 'DELETE_ITEM') {
        const displayName = details.name || <span className="font-mono" title={details.id}>Item #{formatId(details.id)}</span>
        return (
            <div className="flex flex-col">
                <span className="font-medium text-red-600">Deleted: {displayName}</span>
                {details.name && <span className="text-xs text-muted-foreground">ID: {details.id}</span>}
                {details.images && <ImagePreview urls={details.images} />}
                {!details.name && <span className="text-xs text-muted-foreground italic">(Legacy log)</span>}
            </div>
        )
    }

    if (action === 'CREATE_ITEM') {
         return (
             <div className="flex flex-col gap-1">
                 <span className="font-medium text-green-600">Created: {details.name}</span>
                 <span className="text-xs text-muted-foreground">
                    Qty: {details.quantity} • SN: {details.serial_number || '-'}
                 </span>
                 {details.image_url && <ImagePreview urls={details.image_url} />}
             </div>
         )
    }

    // Events
    if (action === 'CREATE_EVENT' || action === 'UPDATE_EVENT') {
        return (
            <div className="flex flex-col gap-1">
                 <span className="font-medium">{action === 'CREATE_EVENT' ? 'New Event' : 'Updated Event'}: {details.name}</span>
                 {details.location && <span className="text-xs">Location: {details.location}</span>}
                 {details.kitIds && details.kitIds.length > 0 && (
                     <span className="text-xs text-muted-foreground">Active Kits: {details.kitIds.length}</span>
                 )}
            </div>
        )
    }

    if (action === 'DELETE_EVENT') {
        const displayName = details.name || <span className="font-mono" title={details.eventId}>Event #{formatId(details.eventId)}</span>
        return (
            <div className="flex flex-col">
                <span className="font-medium text-red-600">Deleted: {displayName}</span>
                {details.reason && <span className="text-xs text-muted-foreground">Reason: {details.reason}</span>}
                {!details.name && <span className="text-xs text-muted-foreground italic">(Legacy log)</span>}
            </div>
        )
    }

    // Kits
    if (action.includes('KIT')) {
        if (action === 'ADD_KIT_ITEM') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-green-600">Added Item to Kit</span>
                    {details.itemName ? (
                        <div className="text-sm">
                            Added <b>{details.itemName}</b> to kit <span className="font-semibold text-blue-600">{details.kitName}</span>
                            {details.quantity > 1 && <span className="text-xs text-muted-foreground ml-2">(Qty: {details.quantity})</span>}
                        </div>
                    ) : (
                         <span className="text-xs text-muted-foreground italic truncate">{JSON.stringify(details)}</span>
                    )}
                </div>
            )
        }
        
        if (action === 'REMOVE_KIT_ITEM') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-red-600">Removed Item from Kit</span>
                    {details.itemName ? (
                        <div className="text-sm">
                            Removed <b>{details.itemName}</b> from kit <span className="font-semibold text-blue-600">{details.kitName}</span>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground italic truncate">{JSON.stringify(details)}</span>
                    )}
                </div>
            )
        }

        if (action === 'UPDATE_KIT_ITEM') {
             return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-orange-600">Updated Kit Item</span>
                     {details.itemName ? (
                        <div className="text-sm">
                            <b>{details.itemName}</b> in <span className="font-semibold text-blue-600">{details.kitName}</span>
                            <div className="text-xs text-muted-foreground">
                                Qty: {details.oldQuantity} &rarr; {details.newQuantity}
                            </div>
                        </div>
                    ) : (
                        <span className="text-xs text-muted-foreground italic truncate">{JSON.stringify(details)}</span>
                    )}
                </div>
            )
        }

        if (action === 'CREATE_KIT') {
             return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-green-600">Created Kit</span>
                    <div className="text-sm font-semibold">{details.name}</div>
                    {details.description && <span className="text-xs text-muted-foreground">{details.description}</span>}
                </div>
            )
        }

        if (action === 'DELETE_KIT') {
            return (
               <div className="flex flex-col gap-1">
                   <span className="font-medium text-red-600">Deleted Kit</span>
                   <div className="text-sm font-semibold">{details.name || <span className="font-mono font-normal text-xs">{details.id}</span>}</div>
                   {!details.name && <span className="text-xs text-muted-foreground italic">(Legacy log)</span>}
               </div>
           )
       }

        return (
            <div className="flex flex-col gap-1">
                <span className="font-medium">{action.replace(/_/g, ' ')}</span>
                <span className="text-xs text-muted-foreground bg-muted/50 p-1 rounded font-mono break-all">
                    {JSON.stringify(details).slice(0, 100)}
                    {JSON.stringify(details).length > 100 && '...'}
                </span>
            </div>
        )
    }

    // Templates
    if (action.includes('TEMPLATE')) {
        if (action === 'CREATE_TEMPLATE') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-green-600">Created Template</span>
                    <div className="text-sm font-semibold">{details.name}</div>
                    <div className="text-xs text-muted-foreground">
                        Type: <span className="uppercase">{details.type}</span> • Items: {details.itemCount}
                    </div>
                </div>
            )
        }

        if (action === 'DELETE_TEMPLATE') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-red-600">Deleted Template</span>
                    <div className="text-sm font-semibold">{details.name}</div>
                    {details.id && (
                        <div className="text-xs text-muted-foreground">
                            Template ID: <span className="font-mono">{formatId(details.id)}</span>
                        </div>
                    )}
                </div>
            )
        }

        if (action === 'UPDATE_TEMPLATE') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-orange-600">Updated Template</span>
                    <div className="text-sm font-semibold">{details.name}</div>
                </div>
            )
        }

        if (action === 'ADD_TEMPLATE_ITEM') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-green-600">Added Item to Template</span>
                    <div className="text-sm">
                        Added <b>{details.itemName}</b> {details.quantity > 1 && `(${details.quantity}x)`} to <span className="font-semibold text-purple-600">{details.templateName}</span>
                    </div>
                </div>
            )
        }

        if (action === 'REMOVE_TEMPLATE_ITEM') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-red-600">Removed Item from Template</span>
                    <div className="text-sm">
                        Removed <b>{details.itemName}</b> from <span className="font-semibold text-purple-600">{details.templateName}</span>
                    </div>
                </div>
            )
        }

        if (action === 'UPDATE_TEMPLATE_STATUS') {
            return (
                <div className="flex flex-col gap-1">
                    <span className="font-medium text-blue-600">Updated Checklist Status</span>
                    <div className="text-sm">
                        <span className="font-semibold">{details.itemName}</span> in <span className="font-semibold text-purple-600">{details.templateName}</span>
                    </div>
                    <div className="text-xs">
                        Status &rarr; <Badge variant="outline" className="uppercase text-[10px]">{details.newStatus}</Badge>
                    </div>
                </div>
            )
        }
    }

    // Catch-all
    return (
        <div className="text-xs text-muted-foreground break-all">
            {JSON.stringify(details)}
        </div>
    )
}

import { Button } from "@/components/ui/button"
import { Filter, Calendar, X, ChevronLeft, ChevronRight } from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuCheckboxItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

// ... (existing helper functions: FormatDate, formatId, ImagePreview, LogDetails)

// Helper to format date for input (use local timezone, not UTC)
function formatDateForInput(date: Date): string {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// Helper to format date for display (Thai format)
function formatDateDisplay(dateStr: string | null): string {
    if (!dateStr) return ''
    // Parse as local date by adding time component
    const [year, month, day] = dateStr.split('-').map(Number)
    const date = new Date(year, month - 1, day)
    return date.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: 'numeric'
    })
}

export default function LogsTable({ initialLogs }: { initialLogs: any[] }) {
    const { t } = useLanguage()
    const [searchText, setSearchText] = useState('')
    const [selectedUser, setSelectedUser] = useState<string>('all')
    const [selectedAction, setSelectedAction] = useState<string>('all')
    const [dateFrom, setDateFrom] = useState<string | null>(null)
    const [dateTo, setDateTo] = useState<string | null>(null)
    const [datePreset, setDatePreset] = useState<string>('all')
    const [currentPage, setCurrentPage] = useState(1)
    const LOGS_PER_PAGE = 50

    // Quick date presets
    const applyDatePreset = (preset: string) => {
        setDatePreset(preset)
        const today = new Date()
        today.setHours(23, 59, 59, 999)
        
        switch (preset) {
            case 'today':
                const todayStart = new Date()
                todayStart.setHours(0, 0, 0, 0)
                setDateFrom(formatDateForInput(todayStart))
                setDateTo(formatDateForInput(today))
                break
            case '7days':
                const sevenDaysAgo = new Date()
                sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
                sevenDaysAgo.setHours(0, 0, 0, 0)
                setDateFrom(formatDateForInput(sevenDaysAgo))
                setDateTo(formatDateForInput(today))
                break
            case '30days':
                const thirtyDaysAgo = new Date()
                thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
                thirtyDaysAgo.setHours(0, 0, 0, 0)
                setDateFrom(formatDateForInput(thirtyDaysAgo))
                setDateTo(formatDateForInput(today))
                break
            case 'all':
            default:
                setDateFrom(null)
                setDateTo(null)
                break
        }
    }

    const clearDateFilter = () => {
        setDateFrom(null)
        setDateTo(null)
        setDatePreset('all')
    }

    // Extract unique users and actions for filter options
    const users = Array.from(new Set(initialLogs.map(log => log.user?.full_name || 'System'))).sort()
    // Group actions simplified (e.g. all ITEM actions, all EVENT actions) or keep distinct? Let's keep distinct for precision but maybe grouped in UI eventually.
    const actions = Array.from(new Set(initialLogs.map(log => log.action_type))).sort() as string[]

    const filteredLogs = initialLogs.filter(log => {
        const searchLower = searchText.toLowerCase()
        const userMatch = (log.user?.full_name || 'System').toLowerCase().includes(searchLower)
        const actionMatch = log.action_type.toLowerCase().includes(searchLower)
        const detailsMatch = JSON.stringify(log.details).toLowerCase().includes(searchLower)
        const targetMatch = (log.target?.full_name || '').toLowerCase().includes(searchLower)
        
        const matchesSearch = userMatch || actionMatch || detailsMatch || targetMatch
        
        const matchesUser = selectedUser === 'all' || (log.user?.full_name || 'System') === selectedUser
        const matchesAction = selectedAction === 'all' || log.action_type === selectedAction

        // Date filtering
        let matchesDate = true
        if (dateFrom || dateTo) {
            const logDate = new Date(log.created_at)
            if (dateFrom) {
                // Parse as local date
                const [year, month, day] = dateFrom.split('-').map(Number)
                const fromDate = new Date(year, month - 1, day, 0, 0, 0, 0)
                matchesDate = matchesDate && logDate >= fromDate
            }
            if (dateTo) {
                // Parse as local date
                const [year, month, day] = dateTo.split('-').map(Number)
                const toDate = new Date(year, month - 1, day, 23, 59, 59, 999)
                matchesDate = matchesDate && logDate <= toDate
            }
        }

        return matchesSearch && matchesUser && matchesAction && matchesDate
    })

    // Pagination logic
    const totalPages = Math.ceil(filteredLogs.length / LOGS_PER_PAGE)
    const startIndex = (currentPage - 1) * LOGS_PER_PAGE
    const endIndex = startIndex + LOGS_PER_PAGE
    const paginatedLogs = filteredLogs.slice(startIndex, endIndex)

    // Reset to page 1 when filters change
    const handleFilterChange = () => {
        setCurrentPage(1)
    }

    return (
        <div className="space-y-4">
             <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                <div className="relative max-w-sm flex-1 w-full">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                        type="search"
                        placeholder={t.common.search}
                        className="pl-8 w-full"
                        value={searchText}
                    onChange={(e) => {
                        setSearchText(e.target.value)
                        setCurrentPage(1) // Reset to page 1 on search
                    }}
                    />
                </div>
                <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                    {/* User Filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2 whitespace-nowrap">
                                <Filter className="h-4 w-4" />
                                {t.logs.filterUser}: {selectedUser === 'all' ? t.items.status.all : selectedUser}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto">
                            <DropdownMenuLabel>{t.logs.filterUser}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem checked={selectedUser === 'all'} onCheckedChange={() => setSelectedUser('all')}>
                                {t.items.status.all}
                            </DropdownMenuCheckboxItem>
                            {users.map(user => (
                                <DropdownMenuCheckboxItem key={user} checked={selectedUser === user} onCheckedChange={() => setSelectedUser(user)}>
                                    {user}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Action Filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className="gap-2 whitespace-nowrap">
                                <Filter className="h-4 w-4" />
                                {t.logs.filterAction}: {selectedAction === 'all' ? t.items.status.all : selectedAction}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px] max-h-[300px] overflow-y-auto">
                            <DropdownMenuLabel>{t.logs.filterAction}</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuCheckboxItem checked={selectedAction === 'all'} onCheckedChange={() => setSelectedAction('all')}>
                                {t.items.status.all}
                            </DropdownMenuCheckboxItem>
                            {actions.map(action => (
                                <DropdownMenuCheckboxItem key={action} checked={selectedAction === action} onCheckedChange={() => setSelectedAction(action)}>
                                    {action}
                                </DropdownMenuCheckboxItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    {/* Date Filter */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" className={`gap-2 whitespace-nowrap ${dateFrom || dateTo ? 'border-blue-500 bg-blue-50' : ''}`}>
                                <Calendar className="h-4 w-4" />
                                {dateFrom || dateTo ? (
                                    <span className="text-blue-600">
                                        {formatDateDisplay(dateFrom)} - {formatDateDisplay(dateTo)}
                                    </span>
                                ) : (
                                    <span>วันที่</span>
                                )}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[280px]">
                            <DropdownMenuLabel className="flex items-center justify-between">
                                <span>กรองตามวันที่</span>
                                {(dateFrom || dateTo) && (
                                    <Button 
                                        variant="ghost" 
                                        size="sm" 
                                        className="h-6 px-2 text-xs text-red-500 hover:text-red-600"
                                        onClick={clearDateFilter}
                                    >
                                        <X className="h-3 w-3 mr-1" /> ล้าง
                                    </Button>
                                )}
                            </DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            
                            {/* Quick Presets */}
                            <div className="p-2 space-y-1">
                                <p className="text-xs text-muted-foreground mb-2">เลือกด่วน</p>
                                <div className="flex flex-wrap gap-1">
                                    <Button 
                                        variant={datePreset === 'today' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-xs"
                                        onClick={() => applyDatePreset('today')}
                                    >
                                        วันนี้
                                    </Button>
                                    <Button 
                                        variant={datePreset === '7days' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-xs"
                                        onClick={() => applyDatePreset('7days')}
                                    >
                                        7 วัน
                                    </Button>
                                    <Button 
                                        variant={datePreset === '30days' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-xs"
                                        onClick={() => applyDatePreset('30days')}
                                    >
                                        30 วัน
                                    </Button>
                                    <Button 
                                        variant={datePreset === 'all' ? 'default' : 'outline'} 
                                        size="sm" 
                                        className="h-7 text-xs"
                                        onClick={() => applyDatePreset('all')}
                                    >
                                        ทั้งหมด
                                    </Button>
                                </div>
                            </div>
                            
                            <DropdownMenuSeparator />
                            
                            {/* Custom Date Range */}
                            <div className="p-2 space-y-3">
                                <p className="text-xs text-muted-foreground">หรือเลือกเอง</p>
                                <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs w-10">จาก:</label>
                                        <input
                                            type="date"
                                            value={dateFrom || ''}
                                            onChange={(e) => {
                                                setDateFrom(e.target.value || null)
                                                setDatePreset('custom')
                                            }}
                                            className="flex-1 h-8 px-2 text-sm border rounded-md bg-background"
                                        />
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs w-10">ถึง:</label>
                                        <input
                                            type="date"
                                            value={dateTo || ''}
                                            onChange={(e) => {
                                                setDateTo(e.target.value || null)
                                                setDatePreset('custom')
                                            }}
                                            className="flex-1 h-8 px-2 text-sm border rounded-md bg-background"
                                        />
                                    </div>
                                </div>
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            <Card>
                <CardHeader className="px-4 py-4 md:px-6 md:py-6">
                    <CardTitle>{t.logs.title}</CardTitle>
                <CardDescription>
                        แสดง {paginatedLogs.length} จาก {filteredLogs.length} รายการ
                        {filteredLogs.length > 0 && ` (หน้า ${currentPage}/${totalPages})`}
                    </CardDescription>
                </CardHeader>
                <CardContent className="p-0 md:p-0">
                    {/* Desktop View */}
                    <div className="hidden md:block">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[180px]">{t.logs.columns.timestamp}</TableHead>
                                    <TableHead>{t.logs.columns.user}</TableHead>
                                    <TableHead>{t.logs.columns.action}</TableHead>
                                    <TableHead>{t.logs.columns.details}</TableHead>
                                    <TableHead className="text-right">Location / IP</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {paginatedLogs.map((log) => (
                                    <TableRow key={log.id}>
                                        <TableCell className="text-muted-foreground text-sm">
                                            <FormatDate date={log.created_at} />
                                        </TableCell>
                                        <TableCell className="font-medium">
                                            {log.user?.full_name || 'System'} 
                                            {log.user?.role && <Badge variant="outline" className="ml-2 text-xs">{log.user.role}</Badge>}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="secondary">{log.action_type}</Badge>
                                        </TableCell>
                                        <TableCell className="max-w-[400px] text-sm align-top">
                                            {log.target && <div className="font-semibold mb-1 text-xs text-blue-600">Target: {log.target.full_name}</div>}
                                            <LogDetails log={log} />
                                        </TableCell>
                                        <TableCell className="text-right text-xs text-muted-foreground font-mono">
                                            <div className="flex flex-col items-end gap-0.5">
                                                {log.latitude && log.longitude ? (
                                                    <a 
                                                        href={`https://www.google.com/maps?q=${log.latitude},${log.longitude}`}
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-1 text-blue-600 hover:underline"
                                                    >
                                                        <span>Map</span>
                                                        <span className="text-[10px]">📍</span>
                                                    </a>
                                                ) : null}
                                                {log.location && <span>{log.location}</span>}
                                                <span title="IP Address">{log.ip_address}</span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                                {filteredLogs.length === 0 && (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                            {t.common.noData}
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden divide-y">
                        {paginatedLogs.map((log) => (
                            <div key={log.id} className="p-4 flex flex-col gap-2">
                                <div className="flex justify-between items-start">
                                    <div className="flex flex-col">
                                        <span className="font-semibold text-sm">{log.user?.full_name || 'System'}</span>
                                        <span className="text-xs text-muted-foreground"><FormatDate date={log.created_at} /></span>
                                    </div>
                                    <Badge variant="outline">{log.action_type}</Badge>
                                </div>
                                
                                <div className="bg-muted/30 p-3 rounded-lg border">
                                     {log.target && <div className="font-semibold mb-2 text-xs text-blue-600">Target: {log.target.full_name}</div>}
                                     <LogDetails log={log} />
                                </div>
                                
                                <div className="flex justify-end items-center gap-2 text-xs text-muted-foreground">
                                    <span>IP: {log.ip_address}</span>
                                </div>
                            </div>
                        ))}
                         {paginatedLogs.length === 0 && (
                             <div className="p-8 text-center text-muted-foreground text-sm">
                                 ไม่พบข้อมูล
                             </div>
                         )}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
                            <div className="text-sm text-muted-foreground">
                                หน้า {currentPage} จาก {totalPages}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(1)}
                                    disabled={currentPage === 1}
                                >
                                    หน้าแรก
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                    disabled={currentPage === 1}
                                >
                                    <ChevronLeft className="h-4 w-4" />
                                </Button>
                                
                                {/* Page Numbers */}
                                <div className="hidden sm:flex items-center gap-1">
                                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                        let pageNum
                                        if (totalPages <= 5) {
                                            pageNum = i + 1
                                        } else if (currentPage <= 3) {
                                            pageNum = i + 1
                                        } else if (currentPage >= totalPages - 2) {
                                            pageNum = totalPages - 4 + i
                                        } else {
                                            pageNum = currentPage - 2 + i
                                        }
                                        return (
                                            <Button
                                                key={pageNum}
                                                variant={currentPage === pageNum ? 'default' : 'outline'}
                                                size="sm"
                                                className="w-8 h-8 p-0"
                                                onClick={() => setCurrentPage(pageNum)}
                                            >
                                                {pageNum}
                                            </Button>
                                        )
                                    })}
                                </div>
                                
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    <ChevronRight className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(totalPages)}
                                    disabled={currentPage === totalPages}
                                >
                                    หน้าสุดท้าย
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
