'use client'

// การ์ดเช็กลิสต์หนึ่งใบ (มุมมอง "ตามงาน") — หัวการ์ดกดพับ/กาง · แถวรายการ · ช่องเพิ่มเร็ว · เมนูของเช็กลิสต์
// ความคืบหน้า เงิน ใบเบิกที่ผูก ความด่วน และข้อความคัดลอก คิดจากเช็กลิสต์ตัวเต็ม (list) เสมอ
// — items คือรายการที่ผ่านตัวกรองแล้ว ใช้วาดแถวเท่านั้น (filterLists คืนใบที่เหลือเฉพาะรายการที่ตรง)
// กางเองเมื่อเปิดมาจากลิงก์ ?list= หรือมีรายการเลยกำหนด/ด่วน · ที่เหลือหุบ

import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import {
    BookmarkPlus,
    Calendar,
    ChevronDown,
    ClipboardCopy,
    ExternalLink,
    ListPlus,
    MapPin,
    MoreHorizontal,
    Pencil,
    Plus,
    Receipt,
    Trash2,
    User,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import {
    KIND_LABELS,
    MAX_ITEMS_PER_ADD,
    PURCHASE_KINDS,
    STATUS_LABELS,
    URGENCY_LABELS,
    budgetOf,
    canDelete,
    claimsOf,
    copyText,
    countdownLabel,
    formatMoney,
    isListFinished,
    isPurchaseKind,
    isTempId,
    listDate,
    listTitle,
    listUrgency,
    personName,
    progressOf,
    splitLines,
    statusTone,
    urgencyOf,
    urgencyTone,
    validateItemInput,
    type PurchaseClaim,
    type PurchaseClaimOption,
    type PurchaseItem,
    type PurchaseKind,
    type PurchaseList,
    type PurchaseListInput,
    type PurchasePerson,
    type PurchaseStatus,
    type PurchaseTemplate,
    type Viewer,
} from '../purchasing-logic'
import { ItemRow, ROW_GRID } from './item-row'
import { LinkClaimDialog } from './link-claim-dialog'
import { ApplyTemplateDialog, CopyTextDialog, EditListDialog, SaveTemplateDialog } from './list-dialogs'
import { ConfirmDelete, useFocusReturn } from './shared'

/** ลำดับส่วนของแถบความคืบหน้า — เสร็จแล้ว (เขียว) เริ่มจากซ้าย แล้วค่อยๆ ถอยไปขั้นต้น */
const BAR_ORDER: PurchaseStatus[] = ['done', 'awaiting_delivery', 'purchasing', 'planning']

type CardDialog = 'edit' | 'apply' | 'saveTemplate' | 'copy' | 'delete' | 'linkClaim'

export interface ListCardProps {
    /** เช็กลิสต์ตัวเต็ม (ไม่ผ่านตัวกรอง) */
    list: PurchaseList
    /** รายการที่ผ่านตัวกรอง — ไม่มีตัวกรอง = list.items */
    items: PurchaseItem[]
    /** วันนี้เวลาไทย YYYY-MM-DD */
    today: string
    viewer: Viewer
    people: PurchasePerson[]
    templates: PurchaseTemplate[]
    /** ใบเบิกที่รายการผูกอยู่ (id ใบเบิก → ใบเบิก จาก snapshot — ตัดชื่อ/ยอดตามสิทธิ์แล้ว) */
    claims: Record<string, PurchaseClaim>
    /** เปิดมาจากลิงก์ ?list= — กางเอง เลื่อนมาให้เห็น และเรืองกรอบ ~2 วินาที */
    focused: boolean
    /** มีตัวกรองระดับรายการ (สถานะ / ของฉัน / คำค้น) — เปิดตัวกรองแล้วการ์ดกางให้เห็นรายการที่ตรง */
    filtersActive: boolean
    onStatus: (item: PurchaseItem, status: PurchaseStatus) => void
    onOpenItem: (itemId: string, returnFocus: HTMLElement | null) => void
    onDeleteItem: (item: PurchaseItem) => void
    onAddItems: (list: PurchaseList, titles: string[], kind: PurchaseKind) => void
    onApplyTemplate: (list: PurchaseList, template: PurchaseTemplate) => void
    onUpdateList: (list: PurchaseList, patch: Partial<PurchaseListInput>) => void
    onDeleteList: (list: PurchaseList) => void
    /** ผูกหลายรายการของใบนี้กับใบเบิกเดียว (หน้าต่าง "ผูกใบเบิกกับหลายรายการ") */
    onLinkClaim: (list: PurchaseList, claim: PurchaseClaimOption, itemIds: string[]) => void
}

export function ListCard({
    list,
    items,
    today,
    viewer,
    people,
    templates,
    claims,
    focused,
    filtersActive,
    onStatus,
    onOpenItem,
    onDeleteItem,
    onAddItems,
    onApplyTemplate,
    onUpdateList,
    onDeleteList,
    onLinkClaim,
}: ListCardProps) {
    const bodyId = useId()
    const cardRef = useRef<HTMLElement>(null)
    const menuRef = useRef<HTMLButtonElement>(null)
    const focusReturn = useFocusReturn()

    const urgency = listUrgency(list, today)
    const [open, setOpen] = useState(() => focused || filtersActive || urgency === 'overdue' || urgency === 'urgent')
    const [flash, setFlash] = useState(focused)
    const [dialog, setDialog] = useState<CardDialog | null>(null)
    const [copyFallback, setCopyFallback] = useState('')

    // ลิงก์ ?list= เปลี่ยนมาชี้ใบนี้ทีหลัง (กดจากบอร์ด / เพิ่งสร้าง) = กาง + เรือง · เลิกชี้ = เลิกเรือง
    const [prevFocused, setPrevFocused] = useState(focused)
    if (prevFocused !== focused) {
        setPrevFocused(focused)
        setFlash(focused)
        if (focused) setOpen(true)
    }
    // เพิ่งเปิดตัวกรอง = กางการ์ดที่เหลือให้เห็นรายการที่ตรง (ปิดตัวกรองแล้วไม่หุบกลับเอง)
    const [prevFiltered, setPrevFiltered] = useState(filtersActive)
    if (prevFiltered !== filtersActive) {
        setPrevFiltered(filtersActive)
        if (filtersActive) setOpen(true)
    }

    // เลื่อนมาให้เห็นครั้งเดียวต่อการชี้ แล้วเลิกเรืองหลัง ~2 วินาที
    // การ์ดสูงกว่าจอ = ชิดบน (กลางจอจะดันหัวการ์ดหลุดขอบบน)
    useEffect(() => {
        if (!focused) return
        const el = cardRef.current
        if (el) el.scrollIntoView({ block: el.offsetHeight > window.innerHeight * 0.8 ? 'start' : 'center' })
        const timer = setTimeout(() => setFlash(false), 2000)
        return () => clearTimeout(timer)
    }, [focused])

    const title = listTitle(list)
    const date = listDate(list)
    const linked = !!list.crm_lead_id
    const finished = isListFinished(list)
    const progress = progressOf(list.items)
    const money = budgetOf(list)
    const names = new Map(people.map(p => [p.id, personName(p)]))
    const nameOf = (id: string | null) => (id ? (names.get(id) ?? 'ไม่ทราบชื่อ') : null)
    const owner = nameOf(list.owner_id)
    const worstCount = urgency ? list.items.filter(i => urgencyOf(i, list, today) === urgency).length : 0
    // สีนับถอยหลังของวันงาน/กำหนด — ใบที่ของครบแล้วไม่ต้องเร่ง
    const dateTone = urgencyTone(date && !finished ? urgencyOf({ status: 'planning', due_date: date }, list, today) : null)
    // ปุ่มลบมีเฉพาะคนที่ลบได้จริง (server ตรวจซ้ำด้วยฟังก์ชันเดียวกัน)
    const deletable = canDelete(viewer, { createdBy: list.created_by, ownerId: list.owner_id })
    const hiddenCount = list.items.length - items.length
    const openStatuses = BAR_ORDER.filter(s => s !== 'done' && progress.byStatus[s] > 0)
    const claimCount = claimsOf(list.items)
    // ผูกใบเบิกได้เฉพาะรายการที่บันทึกแล้ว (แถวที่ยังรอ server ไม่มี id จริง)
    const hasSavedItem = list.items.some(i => !isTempId(i.id))

    const openDialog = (kind: CardDialog, returnTo: HTMLElement | null = menuRef.current) => {
        focusReturn.remember(returnTo)
        setDialog(kind)
    }
    const closeDialog = (next: boolean) => {
        if (!next) setDialog(null)
    }

    /** คัดลอกเป็นข้อความส่งต่อใน LINE — คลิปบอร์ดใช้ไม่ได้/ถูกปฏิเสธ = เปิดหน้าต่างให้คัดลอกเอง */
    const copy = async () => {
        const text = copyText(list, today, Object.fromEntries(names))
        try {
            if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
            await navigator.clipboard.writeText(text)
            toast.success('คัดลอกแล้ว')
        } catch {
            setCopyFallback(text)
            openDialog('copy')
        }
    }

    const addItems = (titles: string[], kind: PurchaseKind) => {
        setOpen(true)
        onAddItems(list, titles, kind)
    }

    return (
        <article
            ref={cardRef}
            className={cn(
                'scroll-mt-20 rounded-xl border bg-white transition-[box-shadow,border-color] duration-700 dark:bg-zinc-950',
                flash
                    ? 'border-violet-400 ring-2 ring-violet-500/50 dark:border-violet-500'
                    : 'border-zinc-200 dark:border-zinc-800'
            )}
        >
            <div className="flex items-start gap-1 p-3 sm:p-4">
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={open ? bodyId : undefined}
                    onClick={() => setOpen(o => !o)}
                    className="-m-1 flex min-w-0 flex-1 items-start gap-2 rounded-lg p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
                >
                    <ChevronDown
                        className={cn('mt-1 h-4 w-4 shrink-0 text-zinc-400 transition-transform', !open && '-rotate-90')}
                        aria-hidden
                    />
                    <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="block text-base font-semibold leading-snug text-zinc-900 wrap-anywhere dark:text-zinc-100">
                            {title}
                        </span>

                        {/* ประเภทใบ · สถานที่ · วันงาน/กำหนด + นับถอยหลัง · ผู้รับผิดชอบ · ป้ายความด่วน */}
                        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {!linked && (
                                <span className="rounded-full border border-zinc-200 px-2 py-0.5 dark:border-zinc-700">เช็กลิสต์ทั่วไป</span>
                            )}
                            {list.lead?.event_location && (
                                <span className="inline-flex min-w-0 items-start gap-1">
                                    <MapPin className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="wrap-anywhere">
                                        <span className="sr-only">สถานที่ </span>
                                        {list.lead.event_location}
                                    </span>
                                </span>
                            )}
                            {date && (
                                <span className="inline-flex flex-wrap items-center gap-x-1 tabular-nums">
                                    <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    {list.lead?.event_date ? 'วันงาน' : 'กำหนด'} {formatThaiDate(date)}
                                    <span className={dateTone.text}>({countdownLabel(date, today)})</span>
                                </span>
                            )}
                            {owner && (
                                <span className="inline-flex min-w-0 items-center gap-1">
                                    <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="wrap-anywhere">
                                        <span className="sr-only">ผู้รับผิดชอบเช็กลิสต์ </span>
                                        {owner}
                                    </span>
                                </span>
                            )}
                            {urgency && (
                                <span className={cn('rounded-full border px-2 py-0.5 font-medium', urgencyTone(urgency).badge)}>
                                    {URGENCY_LABELS[urgency]} {worstCount} รายการ
                                </span>
                            )}
                        </span>

                        {/* ความคืบหน้า: แถบ 4 สีตามสถานะ + ตัวเลข (สีเป็นส่วนเสริม ตัวเลขบอกเสมอ) */}
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                            {progress.total > 0 ? (
                                <>
                                    <span
                                        className="flex h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-zinc-100 sm:w-44 dark:bg-zinc-800"
                                        aria-hidden
                                    >
                                        {BAR_ORDER.map(s =>
                                            progress.byStatus[s] > 0 ? (
                                                <span
                                                    key={s}
                                                    className={cn('h-full', statusTone(s).bar)}
                                                    style={{ width: `${(progress.byStatus[s] / progress.total) * 100}%` }}
                                                />
                                            ) : null
                                        )}
                                    </span>
                                    <span className="shrink-0 font-medium tabular-nums text-zinc-700 dark:text-zinc-300">
                                        เสร็จ {progress.done}/{progress.total}
                                    </span>
                                    {openStatuses.length > 0 && (
                                        <span className="text-zinc-500 tabular-nums dark:text-zinc-400">
                                            {openStatuses.map(s => `${STATUS_LABELS[s]} ${progress.byStatus[s]}`).join(' · ')}
                                        </span>
                                    )}
                                </>
                            ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">ยังไม่มีรายการ</span>
                            )}
                        </span>

                        {/* เงิน: งบ (ของเช็กลิสต์ หรือผลรวมงบรายการ) · จ่ายจริง · เกินงบ · ยังไม่ใส่ยอดจ่ายจริง · ผูกใบเบิกแล้ว */}
                        {(money.budget !== null || money.actual > 0 || money.missingActual > 0 || claimCount.linked > 0) && (
                            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                                {money.budget !== null && (
                                    <span title={money.source === 'items' ? 'ผลรวมงบของรายการ (เช็กลิสต์นี้ไม่ได้ตั้งงบ)' : 'งบของเช็กลิสต์'}>
                                        งบ {formatMoney(money.budget)}
                                    </span>
                                )}
                                {(money.budget !== null || money.actual > 0) && (
                                    <>
                                        {money.budget !== null && <span aria-hidden>·</span>}
                                        <span>จ่ายจริง {formatMoney(money.actual)}</span>
                                    </>
                                )}
                                {money.over && (
                                    <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 font-medium text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
                                        เกินงบ
                                    </span>
                                )}
                                {money.missingActual > 0 && (
                                    <span className="text-amber-700 dark:text-amber-400">
                                        ยังไม่ใส่ยอดจ่ายจริง {money.missingActual} รายการ
                                    </span>
                                )}
                                {claimCount.linked > 0 && (
                                    <span className="inline-flex items-center gap-1">
                                        <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                        ผูกใบเบิกแล้ว {claimCount.linked}/{claimCount.total} รายการ
                                    </span>
                                )}
                            </span>
                        )}
                    </span>
                </button>

                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            ref={menuRef}
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-zinc-500"
                            aria-label="ตัวเลือกของเช็กลิสต์"
                        >
                            <MoreHorizontal className="h-4 w-4" aria-hidden />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-56">
                        <DropdownMenuItem className="min-h-9" onSelect={() => openDialog('edit')}>
                            <Pencil aria-hidden /> แก้ไขเช็กลิสต์
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-9" onSelect={() => void copy()}>
                            <ClipboardCopy aria-hidden /> คัดลอกรายการ
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-9" disabled={templates.length === 0} onSelect={() => openDialog('apply')}>
                            <ListPlus aria-hidden /> เพิ่มจากชุดสำเร็จรูป
                            {templates.length === 0 && <span className="ml-auto pl-2 text-[11px] text-zinc-400">ยังไม่มีชุด</span>}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            className="min-h-9"
                            disabled={list.items.length === 0}
                            onSelect={() => openDialog('saveTemplate')}
                        >
                            <BookmarkPlus aria-hidden /> บันทึกเป็นชุดสำเร็จรูป
                            {list.items.length === 0 && <span className="ml-auto pl-2 text-[11px] text-zinc-400">ยังไม่มีรายการ</span>}
                        </DropdownMenuItem>
                        <DropdownMenuItem className="min-h-9" disabled={!hasSavedItem} onSelect={() => openDialog('linkClaim')}>
                            <Receipt aria-hidden /> ผูกใบเบิกกับหลายรายการ
                            {!hasSavedItem && <span className="ml-auto pl-2 text-[11px] text-zinc-400">ยังไม่มีรายการ</span>}
                        </DropdownMenuItem>
                        {list.crm_lead_id && (
                            <DropdownMenuItem className="min-h-9" asChild>
                                <Link href={`/crm/${list.crm_lead_id}`}>
                                    <ExternalLink aria-hidden /> เปิดการ์ด CRM
                                </Link>
                            </DropdownMenuItem>
                        )}
                        {deletable && (
                            <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem variant="destructive" className="min-h-9" onSelect={() => openDialog('delete')}>
                                    <Trash2 aria-hidden /> ลบเช็กลิสต์
                                </DropdownMenuItem>
                            </>
                        )}
                    </DropdownMenuContent>
                </DropdownMenu>
            </div>

            {open && (
                // @container: แถวรายการเปลี่ยนเป็นตารางตามความกว้างของการ์ด (ดู ROW_GRID ใน item-row.tsx)
                <div id={bodyId} className="@container border-t border-zinc-100 dark:border-zinc-800/80">
                    {list.note && (
                        <p className="mx-3 mt-3 rounded-lg bg-zinc-50 px-3 py-2 text-sm whitespace-pre-line text-zinc-700 wrap-anywhere sm:mx-4 dark:bg-zinc-900 dark:text-zinc-300">
                            <span className="font-medium">หมายเหตุ: </span>
                            {list.note}
                        </p>
                    )}
                    {hiddenCount > 0 && (
                        <p className="px-3 pt-2 text-xs text-zinc-500 sm:px-4 dark:text-zinc-400">
                            แสดง {items.length} จาก {list.items.length} รายการ (ตามตัวกรอง)
                        </p>
                    )}

                    {items.length > 0 ? (
                        <>
                            {/* หัวตาราง — เฉพาะตอนการ์ดกว้างพอเป็นตาราง · โปรแกรมอ่านจอได้ป้ายของแต่ละช่องจากแถวอยู่แล้ว */}
                            <div
                                aria-hidden
                                className={cn(
                                    'hidden px-4 pb-1 pt-3 text-[11px] font-medium text-zinc-500 @4xl:grid @4xl:gap-x-3 dark:text-zinc-400',
                                    ROW_GRID
                                )}
                            >
                                <span>สถานะ</span>
                                <span>รายการ</span>
                                <span>ผู้รับผิดชอบ</span>
                                <span>ต้องได้ของ</span>
                                <span className="text-right">งบ</span>
                                <span className="text-right">จ่ายจริง</span>
                                <span>อื่นๆ</span>
                                <span />
                            </div>
                            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                                {items.map(item => (
                                    <ItemRow
                                        key={item.id}
                                        item={item}
                                        list={list}
                                        today={today}
                                        viewer={viewer}
                                        assigneeName={nameOf(item.assignee_id)}
                                        claim={item.expense_claim_id ? (claims[item.expense_claim_id] ?? null) : null}
                                        onStatus={onStatus}
                                        onEdit={onOpenItem}
                                        onDelete={onDeleteItem}
                                    />
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className="px-3 py-4 text-sm text-zinc-500 sm:px-4 dark:text-zinc-400">
                            ยังไม่มีรายการ — พิมพ์ชื่อของที่ต้องซื้อหรือต้องสั่งในช่องด้านล่าง แล้วกด Enter
                            {templates.length > 0 && (
                                <>
                                    {' หรือ '}
                                    <button
                                        type="button"
                                        onClick={e => openDialog('apply', e.currentTarget)}
                                        className="font-medium text-violet-700 underline-offset-2 hover:underline dark:text-violet-300"
                                    >
                                        เพิ่มจากชุดสำเร็จรูป
                                    </button>
                                </>
                            )}
                        </p>
                    )}

                    <QuickAdd onAdd={addItems} />
                </div>
            )}

            {dialog === 'edit' && (
                <EditListDialog
                    list={list}
                    people={people}
                    currentUserId={viewer.userId}
                    onSave={patch => onUpdateList(list, patch)}
                    onOpenChange={closeDialog}
                    onCloseAutoFocus={focusReturn.restore}
                />
            )}
            {dialog === 'apply' && (
                <ApplyTemplateDialog
                    list={list}
                    templates={templates}
                    onApply={template => {
                        setOpen(true)
                        onApplyTemplate(list, template)
                    }}
                    onOpenChange={closeDialog}
                    onCloseAutoFocus={focusReturn.restore}
                />
            )}
            {dialog === 'saveTemplate' && (
                <SaveTemplateDialog list={list} onOpenChange={closeDialog} onCloseAutoFocus={focusReturn.restore} />
            )}
            {dialog === 'copy' && (
                <CopyTextDialog text={copyFallback} onOpenChange={closeDialog} onCloseAutoFocus={focusReturn.restore} />
            )}
            {dialog === 'linkClaim' && (
                <LinkClaimDialog
                    list={list}
                    claims={claims}
                    isAdmin={viewer.isAdmin}
                    onLink={(claim, itemIds) => {
                        setOpen(true)
                        onLinkClaim(list, claim, itemIds)
                    }}
                    onOpenChange={closeDialog}
                    onCloseAutoFocus={focusReturn.restore}
                />
            )}
            {dialog === 'delete' && (
                <ConfirmDelete
                    title={`ลบเช็กลิสต์ "${title}"?`}
                    description={
                        list.items.length > 0
                            ? `รายการทั้งหมด ${list.items.length} รายการในเช็กลิสต์นี้ (รวมรูปแนบ) จะถูกลบถาวร กู้คืนไม่ได้`
                            : 'เช็กลิสต์ว่างใบนี้จะถูกลบถาวร กู้คืนไม่ได้'
                    }
                    confirmLabel="ลบเช็กลิสต์"
                    onConfirm={() => onDeleteList(list)}
                    onOpenChange={closeDialog}
                    onCloseAutoFocus={focusReturn.restore}
                />
            )}
        </article>
    )
}

// ============================================================================
// ช่องเพิ่มเร็วท้ายการ์ด
// ============================================================================

/**
 * พิมพ์ชื่อแล้ว Enter = เพิ่ม 1 รายการ (ช่องยังโฟกัสอยู่ พิมพ์ต่อได้ทันที)
 * วางข้อความหลายบรรทัด = เพิ่มบรรทัดละรายการ (ครั้งละไม่เกิน 50 — เกินไม่เพิ่มเลย) · วางบรรทัดเดียว = ลงช่องตามปกติ
 */
function QuickAdd({ onAdd }: { onAdd: (titles: string[], kind: PurchaseKind) => void }) {
    const inputId = useId()
    const inputRef = useRef<HTMLInputElement>(null)
    const [text, setText] = useState('')
    const [kind, setKind] = useState<PurchaseKind>('buy')
    const [error, setError] = useState<string | null>(null)

    /** ตรวจชื่อทุกบรรทัดก่อน (1–200 ตัวอักษร) — มีบรรทัดผิด = ไม่เพิ่มเลยสักรายการ */
    const add = (titles: string[]): boolean => {
        for (let i = 0; i < titles.length; i++) {
            const checked = validateItemInput({ title: titles[i] })
            if (!checked.ok) {
                setError(titles.length > 1 ? `บรรทัดที่ ${i + 1}: ${checked.error}` : checked.error)
                return false
            }
        }
        setError(null)
        onAdd(titles, kind)
        return true
    }

    const submit = () => {
        const title = text.trim()
        if (title && add([title])) setText('')
        inputRef.current?.focus()
    }

    const paste = (e: React.ClipboardEvent<HTMLInputElement>) => {
        const raw = e.clipboardData.getData('text')
        if (!/[\r\n]/.test(raw)) return // บรรทัดเดียว — ให้วางลงช่องตามปกติ
        e.preventDefault()
        const lines = splitLines(raw)
        if (lines.length > MAX_ITEMS_PER_ADD) {
            toast.error(`วางได้ครั้งละไม่เกิน ${MAX_ITEMS_PER_ADD} รายการ — ข้อความที่วางมี ${lines.length} บรรทัด`)
            return
        }
        if (lines.length === 1) {
            // มีขึ้นบรรทัดแต่เหลือข้อความบรรทัดเดียว = ใส่ลงช่องแทนส่วนที่เลือกไว้
            const el = e.currentTarget
            const start = el.selectionStart ?? el.value.length
            const end = el.selectionEnd ?? el.value.length
            setText(el.value.slice(0, start) + lines[0] + el.value.slice(end))
            return
        }
        if (lines.length > 1) add(lines)
    }

    return (
        <form
            className="border-t border-zinc-100 px-3 py-2.5 sm:px-4 dark:border-zinc-800/80"
            onSubmit={e => {
                e.preventDefault()
                submit()
            }}
        >
            <div className="flex items-center gap-2">
                <label htmlFor={inputId} className="sr-only">
                    เพิ่มรายการใหม่ (วางหลายบรรทัดได้ บรรทัดละหนึ่งรายการ)
                </label>
                <Input
                    ref={inputRef}
                    id={inputId}
                    value={text}
                    onChange={e => {
                        setText(e.target.value)
                        if (error) setError(null)
                    }}
                    onPaste={paste}
                    placeholder="เพิ่มรายการ… แล้วกด Enter"
                    autoComplete="off"
                    enterKeyHint="enter"
                    aria-invalid={!!error || undefined}
                    aria-describedby={error ? `${inputId}-error` : `${inputId}-hint`}
                    className="h-9 min-w-0 flex-1"
                />
                <Select
                    value={kind}
                    onValueChange={v => {
                        if (isPurchaseKind(v)) setKind(v)
                    }}
                >
                    <SelectTrigger className="h-9 w-22 shrink-0" aria-label="ประเภทของรายการใหม่">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {PURCHASE_KINDS.map(k => (
                            <SelectItem key={k} value={k}>
                                {KIND_LABELS[k]}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Button type="submit" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="เพิ่มรายการ">
                    <Plus className="h-4 w-4" aria-hidden />
                </Button>
            </div>
            {error ? (
                <p id={`${inputId}-error`} className="mt-1 text-xs text-red-600 wrap-anywhere dark:text-red-400">
                    {error}
                </p>
            ) : (
                <p id={`${inputId}-hint`} className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                    วางข้อความหลายบรรทัด = เพิ่มทีละบรรทัด (ครั้งละไม่เกิน {MAX_ITEMS_PER_ADD} รายการ)
                </p>
            )}
        </form>
    )
}
