'use client'

import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CalendarDays, MapPin, Import, CheckCircle, Plus, Users, UserCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n/context'
import { importEventFromStock, importEventFromClosure, createJobEventManual } from '../actions'

interface EventRow {
  id: string
  name: string
  event_date: string | null
  location: string | null
  staff: string | null
  seller: string | null
  status: string | null
}

interface ClosureRow {
  id: string
  event_name: string
  event_date: string | null
  event_location: string | null
  closed_at: string | null
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '-'
  try {
    return new Date(dateStr).toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric'
    })
  } catch { return dateStr }
}

/** Generate last N months as options (ascending) */
function getMonthOptions(count: number) {
  const options: { value: string; label: string; labelTh: string }[] = []
  const now = new Date()
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    const label = d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
    const labelTh = d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long' })
    options.push({ value, label, labelTh })
  }
  return options.reverse()
}

export default function ImportView({
  events,
  closures,
  importedEventIds,
}: {
  events: EventRow[]
  closures: ClosureRow[]
  importedEventIds: string[]
}) {
  const [isPending, startTransition] = useTransition()
  const [feedback, setFeedback] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState<string>('all')
  const router = useRouter()
  const { locale } = useLocale()
  const isEn = locale === 'en'

  const monthOptions = getMonthOptions(12)
  const importedSet = new Set(importedEventIds)

  // Filter by month
  const filteredEvents = selectedMonth === 'all'
    ? events
    : events.filter(e => e.event_date?.substring(0, 7) === selectedMonth)

  const filteredClosures = selectedMonth === 'all'
    ? closures
    : closures.filter(c => c.event_date?.substring(0, 7) === selectedMonth)

  const handleImportEvent = (eventId: string) => {
    startTransition(async () => {
      const res = await importEventFromStock(eventId)
      if (res.error) {
        setFeedback(res.error)
      } else {
        setFeedback(isEn ? 'Imported successfully!' : 'นำเข้าสำเร็จ!')
        router.refresh()
      }
      setTimeout(() => setFeedback(null), 3000)
    })
  }

  const handleImportClosure = (closureId: string) => {
    startTransition(async () => {
      const res = await importEventFromClosure(closureId)
      if (res.error) {
        setFeedback(res.error)
      } else {
        setFeedback(isEn ? 'Imported successfully!' : 'นำเข้าสำเร็จ!')
        router.refresh()
      }
      setTimeout(() => setFeedback(null), 3000)
    })
  }

  const handleManualCreate = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    startTransition(async () => {
      const res = await createJobEventManual(form)
      if (res.error) {
        setFeedback(res.error)
      } else {
        setFeedback(isEn ? 'Created successfully!' : 'สร้างสำเร็จ!')
        setShowManual(false)
        router.refresh()
      }
      setTimeout(() => setFeedback(null), 3000)
    })
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{isEn ? 'Import Events' : 'นำเข้าอีเวนต์'}</h2>
          <p className="text-muted-foreground">
            {isEn ? 'Import events from the Stock system to calculate costs' : 'นำเข้าข้อมูลอีเวนต์จากระบบ Stock เพื่อคิดต้นทุน'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEn ? 'All Months' : 'ทุกเดือน'}</SelectItem>
                {monthOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {isEn ? opt.label : opt.labelTh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => setShowManual(true)} variant="outline" size="sm">
            <Plus className="h-4 w-4 mr-1" />
            {isEn ? 'Manual Entry' : 'กรอกเอง'}
          </Button>
        </div>
      </div>

      {feedback && (
        <div className="bg-zinc-100 dark:bg-zinc-800 text-sm px-4 py-2 rounded-lg text-center animate-in fade-in">
          {feedback}
        </div>
      )}

      {/* Summary Cards */}
      {(() => {
        const activeImported = filteredEvents.filter(e => importedSet.has(e.id)).length
        const closureImported = filteredClosures.filter(c => importedSet.has(c.id)).length
        const totalAll = filteredEvents.length + filteredClosures.length
        return (
          <div className="grid grid-cols-3 gap-4">
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{isEn ? 'Total Events' : 'งานทั้งหมด'}</p>
                <p className="text-2xl font-bold">{totalAll}</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{isEn ? 'Active Events' : 'งานที่ดำเนินการ'}</p>
                <p className="text-2xl font-bold text-blue-600">{filteredEvents.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isEn ? 'Costed' : 'กรอกต้นทุนแล้ว'}: <span className="font-semibold text-foreground">{activeImported}</span>/{filteredEvents.length}
                </p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <p className="text-xs text-muted-foreground">{isEn ? 'Closed Events' : 'งานที่ปิดแล้ว'}</p>
                <p className="text-2xl font-bold text-green-600">{filteredClosures.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isEn ? 'Costed' : 'กรอกต้นทุนแล้ว'}: <span className="font-semibold text-foreground">{closureImported}</span>/{filteredClosures.length}
                </p>
              </CardContent>
            </Card>
          </div>
        )
      })()}

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events">
            <CalendarDays className="h-4 w-4 mr-1" />
            {isEn ? 'Active Events' : 'อีเวนต์ที่เปิดอยู่'} ({filteredEvents.length})
          </TabsTrigger>
          <TabsTrigger value="closures">
            <CheckCircle className="h-4 w-4 mr-1" />
            {isEn ? 'Closed Events' : 'งานที่ปิดแล้ว'} ({filteredClosures.length})
          </TabsTrigger>
        </TabsList>

        {/* Active Events Tab */}
        <TabsContent value="events" className="space-y-3 mt-4">
          {events.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-8 text-center text-muted-foreground">
                {isEn ? 'No active events found' : 'ไม่พบอีเวนต์ที่เปิดอยู่'}
              </CardContent>
            </Card>
          ) : (
            filteredEvents.map((event) => {
              const isImported = importedSet.has(event.id)
              return (
                <Card key={event.id} className={`border-0 shadow-sm transition-opacity ${isImported ? 'opacity-50' : ''}`}>
                  <CardContent className="flex items-center justify-between py-4">
                    <div className="space-y-1 min-w-0 flex-1">
                      <p className="font-medium truncate">{event.name}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        {event.event_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {formatDate(event.event_date)}
                          </span>
                        )}
                        {event.location && (
                          <span className="flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {event.location}
                          </span>
                        )}
                      </div>
                      {(event.seller || event.staff) && (
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-muted-foreground mt-0.5">
                          {event.seller && (
                            <span className="flex items-center gap-1">
                              <UserCheck className="h-3 w-3 text-blue-500" />
                              <span className="font-medium text-blue-600 dark:text-blue-400">{isEn ? 'Seller' : 'ผู้ขาย'}:</span> {event.seller}
                            </span>
                          )}
                          {event.staff && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3 text-green-500" />
                              <span className="font-medium text-green-600 dark:text-green-400">{isEn ? 'Staff' : 'ทีมงาน'}:</span> {event.staff}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="ml-4 shrink-0">
                      {isImported ? (
                        <Badge variant="secondary" className="text-xs">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          {isEn ? 'Imported' : 'นำเข้าแล้ว'}
                        </Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleImportEvent(event.id)}
                          disabled={isPending}
                        >
                          <Import className="h-4 w-4 mr-1" />
                          {isEn ? 'Import' : 'นำเข้า'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })
          )}
        </TabsContent>

        {/* Closed Events Tab */}
        <TabsContent value="closures" className="space-y-3 mt-4">
          {closures.length === 0 ? (
            <Card className="border-0 shadow-sm">
              <CardContent className="py-8 text-center text-muted-foreground">
                {isEn ? 'No closed events found' : 'ไม่พบงานที่ปิดแล้ว'}
              </CardContent>
            </Card>
          ) : (
            filteredClosures.map((closure) => (
              <Card key={closure.id} className="border-0 shadow-sm">
                <CardContent className="flex items-center justify-between py-4">
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="font-medium truncate">{closure.event_name}</p>
                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      {closure.event_date && (
                        <span className="flex items-center gap-1">
                          <CalendarDays className="h-3 w-3" />
                          {formatDate(closure.event_date)}
                        </span>
                      )}
                      {closure.event_location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3" />
                          {closure.event_location}
                        </span>
                      )}
                      {closure.closed_at && (
                        <span className="text-muted-foreground">
                          {isEn ? 'Closed' : 'ปิดงาน'}: {formatDate(closure.closed_at)}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="ml-4 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleImportClosure(closure.id)}
                      disabled={isPending}
                    >
                      <Import className="h-4 w-4 mr-1" />
                      {isEn ? 'Import' : 'นำเข้า'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* Manual Entry Dialog */}
      <Dialog open={showManual} onOpenChange={setShowManual}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{isEn ? 'Create Event Manually' : 'สร้างรายการงานเอง'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleManualCreate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="event_name">{isEn ? 'Event Name' : 'ชื่องาน'} *</Label>
              <Input id="event_name" name="event_name" required placeholder={isEn ? 'e.g. Wedding Event' : 'เช่น งานแต่งงาน'} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="event_date">{isEn ? 'Date' : 'วันที่'}</Label>
                <Input id="event_date" name="event_date" type="date" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="revenue">{isEn ? 'Revenue (฿)' : 'ราคาขาย (฿)'}</Label>
                <Input id="revenue" name="revenue" type="number" min="0" step="1" placeholder="0" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="event_location">{isEn ? 'Location' : 'สถานที่'}</Label>
              <Input id="event_location" name="event_location" placeholder={isEn ? 'e.g. Bangkok' : 'เช่น กรุงเทพ'} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff">{isEn ? 'Staff' : 'ทีมงาน'}</Label>
              <Input id="staff" name="staff" placeholder={isEn ? 'e.g. John, Jane' : 'เช่น สมชาย, สมหญิง'} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="seller">{isEn ? 'Seller' : 'ผู้ขาย'}</Label>
              <Input id="seller" name="seller" placeholder={isEn ? 'e.g. John' : 'เช่น สมชาย'} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notes">{isEn ? 'Notes' : 'หมายเหตุ'}</Label>
              <Textarea id="notes" name="notes" rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowManual(false)}>
                {isEn ? 'Cancel' : 'ยกเลิก'}
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (isEn ? 'Creating...' : 'กำลังสร้าง...') : (isEn ? 'Create' : 'สร้าง')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
