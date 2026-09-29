'use client'

// แถวรายการหนึ่งข้อในการ์ดเช็กลิสต์ (มุมมอง "ตามงาน")
// การ์ดแคบ = บล็อกซ้อน (ชื่อ → ปุ่มสถานะ + ข้อมูลประกอบ) · การ์ดกว้างตั้งแต่ 56rem (@4xl) = แถวตาราง 8 ช่อง
// วัดจากความกว้างของการ์ดเอง (container query ที่ list-card.tsx) ไม่ใช่ความกว้างจอ — แถบเมนูซ้ายกินที่ 244px
// ตอนจอกว้างปานกลาง ตาราง 8 ช่องจึงไม่พอ ถ้าใช้ md: จะล้นแนวนอน
// แถวที่ id ชั่วคราว (เพิ่งเพิ่ม รอ server) = แสดงว่ากำลังเพิ่ม ไม่มีปุ่มสถานะและเมนู

import { useRef, useState } from 'react'
import {
    Calendar,
    ImageIcon,
    Link2,
    Loader2,
    MoreHorizontal,
    Pencil,
    Receipt,
    StickyNote,
    Store,
    Trash2,
    Truck,
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
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import {
    KIND_LABELS,
    canDelete,
    countdownLabel,
    effectiveDue,
    formatMoney,
    isTempId,
    isVoidClaimStatus,
    urgencyOf,
    urgencyTone,
    type PurchaseClaim,
    type PurchaseItem,
    type PurchaseList,
    type PurchaseStatus,
    type Viewer,
} from '../purchasing-logic'
import { StatusPill } from './status-pill'
import { ConfirmDelete, useFocusReturn } from './shared'

/** คอลัมน์ของแถวตาราง — หัวตารางใน list-card.tsx ใช้ค่าเดียวกัน (ต้องตรงกันทุกช่อง) */
export const ROW_GRID = '@4xl:grid-cols-[7rem_minmax(0,1fr)_5.5rem_6.5rem_5rem_5rem_6rem_2.25rem]'

/** ลิงก์ที่เปิดได้อย่างปลอดภัย — server ตรวจ http(s) แล้ว กันข้อมูลที่แก้มือในฐานข้อมูลอีกชั้น */
const safeUrl = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null)

export interface ItemRowProps {
    item: PurchaseItem
    /** เช็กลิสต์ตัวเต็มของรายการนี้ — กำหนด ความด่วน และสิทธิ์ลบคิดจากตัวนี้ */
    list: PurchaseList
    today: string
    viewer: Viewer
    /** ชื่อผู้รับผิดชอบที่แสดง (null = ไม่ระบุ) */
    assigneeName: string | null
    /** ใบเบิกที่รายการนี้ผูกอยู่ (จาก snapshot) — null = ไม่ผูก หรือเพิ่งผูกและข้อมูลใบยังไม่มา */
    claim: PurchaseClaim | null
    onStatus: (item: PurchaseItem, status: PurchaseStatus) => void
    /** เปิดหน้าต่างแก้รายการ — returnFocus = ปุ่มที่จะคืนโฟกัสให้ตอนปิด */
    onEdit: (itemId: string, returnFocus: HTMLElement | null) => void
    /** ลบ (ผู้ใช้ยืนยันแล้ว) */
    onDelete: (item: PurchaseItem) => void
}

export function ItemRow({ item, list, today, viewer, assigneeName, claim, onStatus, onEdit, onDelete }: ItemRowProps) {
    const menuRef = useRef<HTMLButtonElement>(null)
    const [confirming, setConfirming] = useState(false)
    const focusReturn = useFocusReturn()

    const pending = isTempId(item.id)
    const done = item.status === 'done'
    const due = effectiveDue(item, list)
    const urgency = urgencyOf(item, list, today)
    // ปุ่มลบมีเฉพาะคนที่ลบได้จริง (server ตรวจซ้ำด้วยฟังก์ชันเดียวกัน)
    const deletable = !pending && canDelete(viewer, { createdBy: item.created_by, ownerId: list.owner_id })
    const overBudget = item.est_price != null && item.actual_price != null && item.actual_price > item.est_price
    const missingActual = done && item.actual_price == null
    const link = safeUrl(item.link_url)
    const hasExtras = !!(item.vendor || link || item.tracking_no || item.images.length > 0 || item.note || item.expense_claim_id)
    // ใบเบิกที่ถูกปฏิเสธ/ยกเลิกภายหลังยังผูกอยู่ — เน้นสถานะให้เห็นว่าใบนี้จะไม่ได้จ่าย
    const voidClaim = !!claim && isVoidClaimStatus(claim.status)
    // รายการที่เสร็จแล้วจางลง (ปุ่มสถานะไม่จาง — ยังเป็นตัวบอกสถานะ)
    const dim = done ? 'opacity-70' : undefined

    return (
        <li className={cn('px-3 py-2 sm:px-4', pending && 'bg-zinc-50/80 dark:bg-zinc-900/40')} aria-busy={pending || undefined}>
            <div className={cn('flex items-start gap-2 @4xl:grid @4xl:items-center @4xl:gap-x-3', ROW_GRID)}>
                {/* จอแคบ: คอลัมน์เดียวซ้อนกัน · ตาราง: display:contents ให้ลูกแต่ละช่องลงคอลัมน์ของตัวเอง */}
                <div className="min-w-0 flex-1 space-y-1 @4xl:contents">
                    {/* ชื่อ + ประเภท + จำนวน (ตาราง: ช่องที่ 2) */}
                    <div className={cn('flex min-w-0 items-start gap-2 @4xl:col-start-2 @4xl:row-start-1', dim)}>
                        <span className="mt-2.5 shrink-0 rounded border border-zinc-200 px-1 text-[11px] leading-4 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
                            {KIND_LABELS[item.kind]}
                        </span>
                        {pending ? (
                            <p className="min-w-0 py-2 text-sm leading-5 text-zinc-500 wrap-anywhere dark:text-zinc-400">
                                {item.title}
                            </p>
                        ) : (
                            <button
                                type="button"
                                onClick={e => onEdit(item.id, e.currentTarget)}
                                title="แก้ไขรายการ"
                                className="min-h-9 min-w-0 rounded py-2 text-left text-sm leading-5 outline-none wrap-anywhere focus-visible:ring-2 focus-visible:ring-violet-500/60"
                            >
                                <span
                                    className={cn(
                                        'font-medium text-zinc-900 hover:underline dark:text-zinc-100',
                                        done && 'text-zinc-500 line-through decoration-zinc-400 dark:text-zinc-400'
                                    )}
                                >
                                    {item.title}
                                </span>
                                {item.quantity && (
                                    <span className="ml-1.5 text-zinc-500 dark:text-zinc-400">· {item.quantity}</span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* สถานะ + ข้อมูลประกอบ: จอแคบเรียงเป็นบรรทัดตัดคำ · ตาราง: แยกลงคอลัมน์ 1, 3–7 */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pb-1 text-xs @4xl:contents">
                        <div className="@4xl:col-start-1 @4xl:row-start-1">
                            {pending ? (
                                <span className="inline-flex h-9 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                                    กำลังเพิ่ม…
                                </span>
                            ) : (
                                <StatusPill status={item.status} onChange={s => onStatus(item, s)} />
                            )}
                        </div>

                        {/* ผู้รับผิดชอบ */}
                        <div
                            className={cn(
                                'min-w-0 text-zinc-600 dark:text-zinc-400 @4xl:col-start-3 @4xl:row-start-1',
                                !assigneeName && 'hidden @4xl:block',
                                dim
                            )}
                        >
                            {assigneeName ? (
                                <span className="inline-flex min-w-0 items-start gap-1">
                                    <User className="mt-px h-3.5 w-3.5 shrink-0 @4xl:hidden" aria-hidden />
                                    <span className="wrap-anywhere">
                                        <span className="sr-only">ผู้รับผิดชอบ </span>
                                        {assigneeName}
                                    </span>
                                </span>
                            ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">
                                    —<span className="sr-only">ไม่ระบุผู้รับผิดชอบ</span>
                                </span>
                            )}
                        </div>

                        {/* ต้องได้ของภายใน + นับถอยหลังตามสีความด่วน */}
                        <div className={cn('@4xl:col-start-4 @4xl:row-start-1', !due && 'hidden @4xl:block', dim)}>
                            {due ? (
                                <span className="inline-flex flex-wrap items-center gap-x-1.5 @4xl:flex-col @4xl:items-start @4xl:gap-0">
                                    <span
                                        className={cn(
                                            'inline-flex items-center gap-1 tabular-nums',
                                            item.due_date ? 'text-zinc-700 dark:text-zinc-300' : 'text-zinc-500 dark:text-zinc-400'
                                        )}
                                        title={
                                            item.due_date
                                                ? 'กำหนดของรายการนี้'
                                                : list.lead?.event_date
                                                  ? 'ใช้วันงานของเช็กลิสต์'
                                                  : 'ใช้กำหนดของเช็กลิสต์'
                                        }
                                    >
                                        <Calendar className="h-3.5 w-3.5 shrink-0 @4xl:hidden" aria-hidden />
                                        <span className="sr-only">ต้องได้ของภายใน </span>
                                        {formatThaiDate(due)}
                                    </span>
                                    {!done && <span className={urgencyTone(urgency).text}>{countdownLabel(due, today)}</span>}
                                </span>
                            ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">
                                    —<span className="sr-only">ไม่มีกำหนด</span>
                                </span>
                            )}
                        </div>

                        {/* งบ */}
                        <div
                            className={cn(
                                'tabular-nums text-zinc-600 dark:text-zinc-400 @4xl:col-start-5 @4xl:row-start-1 @4xl:text-right',
                                item.est_price == null && 'hidden @4xl:block',
                                dim
                            )}
                        >
                            <span className="@4xl:sr-only">งบ </span>
                            {item.est_price == null ? (
                                <span className="text-zinc-400 dark:text-zinc-500">
                                    —<span className="sr-only">ไม่ได้ใส่</span>
                                </span>
                            ) : (
                                formatMoney(item.est_price)
                            )}
                        </div>

                        {/* จ่ายจริง — เสร็จแล้วแต่ยังไม่ใส่ = เตือนสีเหลือง (ไม่จาง) · เกินงบของรายการ = แดง */}
                        <div
                            className={cn(
                                'tabular-nums text-zinc-600 dark:text-zinc-400 @4xl:col-start-6 @4xl:row-start-1 @4xl:text-right',
                                item.actual_price == null && !missingActual && 'hidden @4xl:block',
                                !missingActual && dim
                            )}
                        >
                            <span className="@4xl:sr-only">จ่ายจริง </span>
                            {item.actual_price != null ? (
                                <span
                                    className={cn(overBudget && 'font-medium text-red-600 dark:text-red-400')}
                                    title={overBudget ? 'จ่ายเกินงบของรายการ' : undefined}
                                >
                                    {formatMoney(item.actual_price)}
                                    {overBudget && <span className="sr-only"> (เกินงบ)</span>}
                                </span>
                            ) : missingActual ? (
                                <span className="font-medium text-amber-700 dark:text-amber-400">ยังไม่ใส่</span>
                            ) : (
                                <span className="text-zinc-400 dark:text-zinc-500">
                                    —<span className="sr-only">ยังไม่มี</span>
                                </span>
                            )}
                        </div>

                        {/* ข้อมูลเสริม: ร้าน · ลิงก์สินค้า · เลขพัสดุ · รูป · หมายเหตุ · ใบเบิก (ตาราง: เหลือไอคอน ชี้ดูรายละเอียดได้) */}
                        <div
                            className={cn(
                                'flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1 text-zinc-500 dark:text-zinc-400 @4xl:col-start-7 @4xl:row-start-1 @4xl:gap-x-1.5',
                                !hasExtras && 'hidden @4xl:flex',
                                dim
                            )}
                        >
                            {item.vendor && (
                                <span className="inline-flex min-w-0 items-center gap-1" title={`ร้าน/ผู้ขาย: ${item.vendor}`}>
                                    <Store className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="wrap-anywhere @4xl:sr-only">
                                        <span className="sr-only">ร้าน </span>
                                        {item.vendor}
                                    </span>
                                </span>
                            )}
                            {link && (
                                <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="เปิดลิงก์สินค้า (แท็บใหม่)"
                                    draggable={false}
                                    className="inline-flex min-h-9 items-center gap-1 rounded text-violet-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-violet-300 @4xl:min-h-0"
                                >
                                    <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="@4xl:sr-only">ลิงก์สินค้า</span>
                                </a>
                            )}
                            {item.tracking_no && (
                                <span className="inline-flex min-w-0 items-center gap-1" title={`เลขพัสดุ: ${item.tracking_no}`}>
                                    <Truck className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="wrap-anywhere tabular-nums @4xl:sr-only">
                                        <span className="sr-only">เลขพัสดุ </span>
                                        {item.tracking_no}
                                    </span>
                                </span>
                            )}
                            {item.images.length > 0 && (
                                <span className="inline-flex items-center gap-0.5" title={`รูปแนบ ${item.images.length} รูป`}>
                                    <ImageIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="tabular-nums">{item.images.length}</span>
                                    <span className="sr-only"> รูปแนบ</span>
                                </span>
                            )}
                            {item.note && (
                                <span className="inline-flex items-center gap-1" title={`หมายเหตุ: ${item.note}`}>
                                    <StickyNote className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="@4xl:sr-only">มีหมายเหตุ</span>
                                </span>
                            )}
                            {/* ใบเบิกที่ผูก: เลขที่ + สถานะ (ไม่มีข้อมูลใบ = เพิ่งผูกบนหน้าจอ รอข้อมูลจริงจาก server) */}
                            {item.expense_claim_id && (
                                <span
                                    className={cn(
                                        'inline-flex min-w-0 items-center gap-1',
                                        voidClaim && 'font-medium text-red-700 dark:text-red-400'
                                    )}
                                    title={claim ? `ใบเบิก ${claim.claim_number} (${claim.status_label})` : 'ผูกใบเบิกแล้ว'}
                                >
                                    <Receipt className="h-3.5 w-3.5 shrink-0" aria-hidden />
                                    <span className="wrap-anywhere tabular-nums @4xl:sr-only">
                                        {claim ? (
                                            <>
                                                <span className="sr-only">ใบเบิก </span>
                                                {claim.claim_number} · <span className="sr-only">สถานะ </span>
                                                {claim.status_label}
                                            </>
                                        ) : (
                                            'ผูกใบเบิกแล้ว'
                                        )}
                                    </span>
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {/* เมนูของรายการ (ตาราง: ช่องสุดท้าย) — แถวที่รอ server ไม่มีเมนู */}
                <div className="shrink-0 @4xl:col-start-8 @4xl:row-start-1">
                    {!pending && (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    ref={menuRef}
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 text-zinc-500"
                                    aria-label={`ตัวเลือกของรายการ ${item.title}`}
                                >
                                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="min-w-40">
                                <DropdownMenuItem className="min-h-9" onSelect={() => onEdit(item.id, menuRef.current)}>
                                    <Pencil aria-hidden /> แก้ไข
                                </DropdownMenuItem>
                                {deletable && (
                                    <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem
                                            variant="destructive"
                                            className="min-h-9"
                                            onSelect={() => {
                                                focusReturn.remember(menuRef.current)
                                                setConfirming(true)
                                            }}
                                        >
                                            <Trash2 aria-hidden /> ลบรายการ
                                        </DropdownMenuItem>
                                    </>
                                )}
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>
            </div>

            {confirming && (
                <ConfirmDelete
                    title={`ลบรายการ "${item.title}"?`}
                    description={
                        item.images.length > 0
                            ? `รายการนี้และรูปแนบ ${item.images.length} รูปจะถูกลบถาวร กู้คืนไม่ได้`
                            : 'รายการนี้จะถูกลบถาวร กู้คืนไม่ได้'
                    }
                    confirmLabel="ลบรายการ"
                    onConfirm={() => onDelete(item)}
                    onOpenChange={setConfirming}
                    onCloseAutoFocus={focusReturn.restore}
                />
            )}
        </li>
    )
}
