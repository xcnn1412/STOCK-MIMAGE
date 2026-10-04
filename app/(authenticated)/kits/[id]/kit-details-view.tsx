'use client'

import Link from 'next/link'
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card"
import { ArrowLeft, Trash, QrCode, Pencil, CalendarDays } from "lucide-react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import AddItemToKitForm, { type AvailableItem } from './add-item-form'
import EditKitDialog from './edit-kit-dialog'
import { EditQuantity } from './edit-quantity'
import { removeItemFromKit } from './actions'
import { toast } from 'sonner'
import { ItemImagePreview } from './item-image-preview'
import { useLanguage } from '@/contexts/language-context'
import { cn } from '@/lib/utils'
import { kitShelfState, PROBLEM_STATUSES } from '../../shelves/shelf-logic'
import type { Kit, Item, KitContent } from '@/types'

type KitContentWithItem = KitContent & { items: Item }

/** การจองที่ยังไม่ปิดของกระเป๋าใบนี้ (คิดที่ page.tsx) */
export interface KitBookingRow {
  eventId: string
  eventName: string
  eventDate: string | null
  packed: boolean
}

const ConsumableBadge = () => (
  <span className="ml-2 align-middle rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">สิ้นเปลือง</span>
)

const PILL = 'inline-flex items-center rounded px-2 py-0.5 text-xs font-medium'
const STATUS_TONE: Record<string, string> = {
  available: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  in_use: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  damaged: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
  maintenance: 'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  lost: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
}
const MUTED = 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
const BOOKED = 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200'

const thaiDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : ''

/** image_url เก็บได้ทั้ง URL เดี่ยวและ JSON array */
function parseImages(url: string | null | undefined): string[] {
  if (!url) return []
  if (!url.startsWith('[')) return [url]
  try {
    const parsed = JSON.parse(url)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function KitDetailsView({
    kit,
    contents,
    availableItems,
    canManage = false,
    bookings = [],
    canOpenEvents = false,
}: {
    kit: Kit & { events: { name: string | null; event_date: string | null } | null; shelves?: { id: string; code: string } | null },
    contents: KitContentWithItem[],
    availableItems: AvailableItem[],
    /** admin หรือแผนกที่ดูแลกระเป๋า — คนอื่นดูได้อย่างเดียว */
    canManage?: boolean
    /** งานที่จองกระเป๋านี้และยังไม่ปิด เรียงตามวันงาน */
    bookings?: KitBookingRow[]
    /** ผู้ดูมีสิทธิ์โมดูลอีเวนต์ — ลิงก์จัดกระเป๋าไปหน้าอีเวนต์ ไม่งั้นไปหน้า QR ของกระเป๋า */
    canOpenEvents?: boolean
}) {
  const { t } = useLanguage()
  const statusLabels = t.items.status as Record<string, string>
  const regularStatuses = contents.filter(c => c.items && !c.items.is_consumable).map(c => c.items.status as string)
  const state = kitShelfState(regularStatuses, kit.events)

  const remove = async (content: KitContentWithItem) => {
    if (!confirm(`เอา ${content.items.name} ออกจากกระเป๋า ${kit.name}?`)) return
    const res = await removeItemFromKit(content.id, kit.id)
    if (res?.error) toast.error(res.error)
    else toast.success(`เอา ${content.items.name} ออกจากกระเป๋าแล้ว`)
  }

  const statusPill = (item: Item) =>
    item.is_consumable ? null : (
      <span className={cn(PILL, STATUS_TONE[item.status as string] ?? MUTED, PROBLEM_STATUSES.includes(item.status as string) && 'ring-1 ring-current/30')}>
        {statusLabels[item.status as string] ?? item.status}
      </span>
    )

  const quantity = (content: KitContentWithItem) => {
    const qty = content.quantity || 1
    const unit = content.items.is_consumable ? content.items.unit : null
    if (canManage) return <EditQuantity key={`${content.id}:${qty}`} id={content.id} initialQty={qty} unit={unit} />
    return content.items.is_consumable ? `× ${qty} ${unit || ''}` : qty
  }

  const packHref = (eventId: string) =>
    canOpenEvents ? `/events/${eventId}/check-kits/${kit.id}` : `/kits/${kit.id}/check?eventId=${eventId}`

  return (
    <div className="space-y-6">
       <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0 flex-1">
            <Link href="/kits">
            <Button variant="ghost" size="icon" aria-label={t.common.back}>
                <ArrowLeft className="h-4 w-4" />
            </Button>
            </Link>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-2xl md:text-3xl font-bold tracking-tight wrap-break-word">{kit.name}</h2>
                    {canManage && <EditKitDialog kit={kit} />}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                    {state.kind === 'out' && (
                        <span className={cn(PILL, STATUS_TONE.in_use)}>ออกงาน{state.eventName ? ` @ ${state.eventName}` : ''}</span>
                    )}
                    {state.kind === 'booked' && (
                        <span className={cn(PILL, BOOKED)}>จองไว้ {state.eventName} {thaiDate(state.eventDate)}</span>
                    )}
                    {kit.shelves ? (
                        <Link href={`/shelves/${kit.shelves.id}`} className={cn(PILL, MUTED, 'hover:underline')}>
                            ชั้น {kit.shelves.code}
                        </Link>
                    ) : (
                        <Link href="/shelves" className={cn(PILL, MUTED, 'text-zinc-500 hover:underline')}>ยังไม่มีชั้น</Link>
                    )}
                </div>
                <p className="mt-1 text-zinc-500">{kit.description || t.common.noData}</p>
            </div>
        </div>
        <Link href={`/kits/${kit.id}/print`}>
            <Button variant="outline">
                <QrCode className="mr-2 h-4 w-4" /> {t.kits.printQR}
            </Button>
        </Link>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6 min-w-0">
            <Card>
                <CardHeader>
                    <CardTitle>{t.kits.contents}</CardTitle>
                    <CardDescription>{t.kits.contentsSubtitle}</CardDescription>
                </CardHeader>
                <CardContent>
                    {/* Mobile View: Card List */}
                    <div className="md:hidden space-y-4">
                        {contents.map((content) => (
                            <div key={content.id} className="flex items-start gap-3 p-3 border rounded-lg bg-zinc-50/50 dark:bg-zinc-900/40">
                                <div className="shrink-0">
                                    <ItemImagePreview images={parseImages(content.items.image_url)} alt={content.items.name} />
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                    <p className="font-semibold text-sm wrap-break-word">
                                        {content.items.name}
                                        {content.items.is_consumable && <ConsumableBadge />}
                                    </p>
                                    <p className="text-xs text-zinc-500">{content.items.category}</p>
                                    {statusPill(content.items)}
                                    <div className="flex items-center gap-1 text-xs font-medium">
                                        <span className="text-zinc-500">{t.items.columns.qty}:</span>
                                        {quantity(content)}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-1">
                                     <Link href={`/items/${content.items.id}?returnTo=/kits/${kit.id}`}>
                                        <Button variant="ghost" size="icon" className="h-9 w-9" title={t.items.editTitle} aria-label={t.items.editTitle}>
                                            <Pencil className="h-3.5 w-3.5 text-zinc-500" />
                                        </Button>
                                     </Link>
                                     {canManage && (
                                         <Button variant="ghost" size="icon" className="h-9 w-9 text-red-500 hover:text-red-600 hover:bg-red-50" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(content)}>
                                             <Trash className="h-3.5 w-3.5" />
                                         </Button>
                                     )}
                                </div>
                            </div>
                        ))}
                        {contents.length === 0 && (
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
                            {contents.map((content) => (
                                <TableRow key={content.id}>
                                    <TableCell>
                                        <ItemImagePreview images={parseImages(content.items.image_url)} alt={content.items.name} />
                                    </TableCell>
                                    <TableCell className="font-medium">
                                        <div>
                                            {content.items.name}
                                            {content.items.is_consumable && <ConsumableBadge />}
                                        </div>
                                        <div className="mt-1">{statusPill(content.items)}</div>
                                    </TableCell>
                                    <TableCell>{content.items.category}</TableCell>
                                    <TableCell>{quantity(content)}</TableCell>
                                    <TableCell className="flex justify-end gap-2">
                                         <Link href={`/items/${content.items.id}?returnTo=/kits/${kit.id}`}>
                                            <Button variant="ghost" size="icon" title={t.items.editTitle} aria-label={t.items.editTitle}>
                                                <Pencil className="h-4 w-4 text-zinc-500" />
                                            </Button>
                                         </Link>
                                         {canManage && (
                                             <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600 hover:bg-red-50" title={t.common.delete} aria-label={t.common.delete} onClick={() => remove(content)}>
                                                 <Trash className="h-4 w-4" />
                                             </Button>
                                         )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {contents.length === 0 && (
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

        <div className="md:col-span-1 space-y-6 min-w-0">
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2"><CalendarDays className="h-4 w-4" /> งานที่จองกระเป๋านี้</CardTitle>
                </CardHeader>
                <CardContent>
                    {bookings.length === 0 ? (
                        <p className="text-sm text-zinc-500">ยังไม่ได้จองให้งานไหน</p>
                    ) : (
                        <ul className="divide-y">
                            {bookings.map(b => (
                                <li key={b.eventId} className="flex items-center gap-2 py-2.5">
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium wrap-break-word">{b.eventName}</p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500">
                                            {b.eventDate && <span>{thaiDate(b.eventDate)}</span>}
                                            <span className={cn(PILL, b.packed ? STATUS_TONE.available : MUTED)}>{b.packed ? 'จัดครบ' : 'ยังไม่จัด'}</span>
                                        </div>
                                    </div>
                                    <Link href={packHref(b.eventId)} className="shrink-0">
                                        <Button variant="outline" size="sm" className="h-9">จัดกระเป๋า</Button>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardContent>
            </Card>

            {canManage && (
             <Card>
                <CardHeader>
                    <CardTitle>{t.items.addItem}</CardTitle>
                    <CardDescription>{t.kits.addAvailable}</CardDescription>
                </CardHeader>
                <CardContent>
                    <AddItemToKitForm kitId={kit.id} availableItems={availableItems} />
                </CardContent>
            </Card>
            )}
        </div>
      </div>
    </div>
  )
}
