'use client'

// มุมมอง "ตามสถานะ" (?view=board) — รายการของทุกเช็กลิสต์แยก 4 คอลัมน์ตามสถานะ (boardColumns)
// จอตั้งแต่ md ลากการ์ดข้ามคอลัมน์ได้ (HTML5 drag แบบ jobs/components/job-kanban-board.tsx)
// จอเล็กไม่มีการลาก — คอลัมน์เลื่อนแนวนอนในกรอบของตัวเอง (หน้าไม่เลื่อนแนวนอน)
// ทุกการ์ดมีปุ่ม "เลื่อนเป็น …" — ใช้คีย์บอร์ดได้โดยไม่ต้องลาก

import { useState, useSyncExternalStore } from 'react'
import { ArrowRight, Calendar, Loader2, User } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatThaiDate } from '@/lib/thai-date'
import {
    PURCHASE_STATUSES,
    STATUS_LABELS,
    boardColumns,
    countdownLabel,
    isTempId,
    nextStatus,
    personName,
    statusTone,
    urgencyTone,
    type BoardCard,
    type PurchaseItem,
    type PurchaseList,
    type PurchasePerson,
    type PurchaseStatus,
} from '../purchasing-logic'

// ลากได้เฉพาะจอตั้งแต่ md — อ่านจาก matchMedia (server ตอบ "ลากไม่ได้" เสมอ ค่าจริงชนะหลัง hydrate)
const WIDE_QUERY = '(min-width: 768px)'
const subscribeWide = (onChange: () => void) => {
    const mq = window.matchMedia(WIDE_QUERY)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
}
const getWide = () => window.matchMedia(WIDE_QUERY).matches
const getWideOnServer = () => false

/** คลิกธรรมดา (ไม่กด Ctrl/⌘/Shift/ปุ่มกลาง) = สลับมุมมองในหน้าเดิม · อย่างอื่นปล่อยให้เบราว์เซอร์เปิดลิงก์เอง */
const isPlainClick = (e: React.MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

export interface BoardViewProps {
    /** เช็กลิสต์หลังกรองแล้ว (items = เฉพาะรายการที่ตรงตัวกรอง) */
    lists: PurchaseList[]
    /** วันนี้เวลาไทย YYYY-MM-DD */
    today: string
    people: PurchasePerson[]
    /** ลิงก์ไปมุมมองตามงานที่เปิดเช็กลิสต์นั้น (?list=) — ใช้เป็น href จริงของลิงก์ */
    listHref: (listId: string) => string
    /** สลับไปมุมมองตามงานและเปิดเช็กลิสต์นั้น (คลิกธรรมดา) */
    onOpenList: (listId: string) => void
    onOpenItem: (itemId: string, returnFocus: HTMLElement | null) => void
    onStatus: (item: PurchaseItem, status: PurchaseStatus) => void
}

export function BoardView({ lists, today, people, listHref, onOpenList, onOpenItem, onStatus }: BoardViewProps) {
    const canDrag = useSyncExternalStore(subscribeWide, getWide, getWideOnServer)
    const [draggedId, setDraggedId] = useState<string | null>(null)
    const [overStatus, setOverStatus] = useState<PurchaseStatus | null>(null)

    const columns = boardColumns(lists, today)
    const names = new Map(people.map(p => [p.id, personName(p)]))
    const cardById = new Map(PURCHASE_STATUSES.flatMap(s => columns[s]).map(c => [c.item.id, c]))

    const drop = (e: React.DragEvent, status: PurchaseStatus) => {
        e.preventDefault()
        setOverStatus(null)
        const id = draggedId ?? e.dataTransfer.getData('text/plain')
        setDraggedId(null)
        const card = id ? cardById.get(id) : undefined
        if (!card || isTempId(card.item.id) || card.item.status === status) return
        onStatus(card.item, status)
    }

    return (
        <div
            role="region"
            aria-label="บอร์ดรายการตามสถานะ"
            tabIndex={0}
            // relative: ข้อความ sr-only (position:absolute) ในการ์ดต้องยึดกรอบนี้ ไม่งั้นหลุดการตัดขอบแล้วดันทั้งหน้าให้เลื่อนแนวนอนบนมือถือ
            className="relative overflow-x-auto rounded-xl pb-2 outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 [scrollbar-width:thin]"
        >
            <div className="flex snap-x snap-mandatory gap-3 md:snap-none">
                {PURCHASE_STATUSES.map(status => {
                    const cards = columns[status]
                    const isOver = canDrag && overStatus === status
                    return (
                        <section
                            key={status}
                            aria-label={`${STATUS_LABELS[status]} ${cards.length} รายการ`}
                            className={cn(
                                'flex w-68 shrink-0 snap-start flex-col rounded-xl border transition-colors md:w-auto md:min-w-60 md:flex-1 md:basis-0',
                                isOver
                                    ? 'border-violet-300 bg-violet-50/60 ring-2 ring-violet-300 dark:border-violet-800 dark:bg-violet-950/20 dark:ring-violet-700'
                                    : 'border-zinc-200/70 bg-zinc-50/80 dark:border-zinc-800/70 dark:bg-zinc-900/40'
                            )}
                            onDragOver={
                                canDrag
                                    ? e => {
                                          e.preventDefault()
                                          e.dataTransfer.dropEffect = 'move'
                                          if (overStatus !== status) setOverStatus(status)
                                      }
                                    : undefined
                            }
                            onDragLeave={
                                canDrag
                                    ? e => {
                                          // ออกจากคอลัมน์จริง (ไม่ใช่แค่ย้ายไปอยู่เหนือการ์ดลูก)
                                          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setOverStatus(null)
                                      }
                                    : undefined
                            }
                            onDrop={canDrag ? e => drop(e, status) : undefined}
                        >
                            <h2 className="flex items-center gap-2 border-b border-zinc-200/70 px-3 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-800/70 dark:text-zinc-300">
                                <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', statusTone(status).dot)} aria-hidden />
                                {STATUS_LABELS[status]}
                                <span className="ml-auto rounded-full bg-zinc-200/70 px-2 text-xs font-medium tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                    {cards.length}
                                </span>
                            </h2>
                            <ul className="flex-1 space-y-2 p-2">
                                {cards.map(card => (
                                    <BoardCardItem
                                        key={card.item.id}
                                        card={card}
                                        today={today}
                                        assigneeName={card.item.assignee_id ? (names.get(card.item.assignee_id) ?? 'ไม่ทราบชื่อ') : null}
                                        canDrag={canDrag}
                                        dragging={draggedId === card.item.id}
                                        listHref={listHref(card.listId)}
                                        onOpenList={onOpenList}
                                        onOpenItem={onOpenItem}
                                        onStatus={onStatus}
                                        onDragStart={id => setDraggedId(id)}
                                        onDragEnd={() => {
                                            setDraggedId(null)
                                            setOverStatus(null)
                                        }}
                                    />
                                ))}
                                {cards.length === 0 && (
                                    <li
                                        className={cn(
                                            'rounded-lg border border-dashed px-3 py-6 text-center text-xs',
                                            isOver
                                                ? 'border-violet-300 text-violet-500 dark:border-violet-700 dark:text-violet-400'
                                                : 'border-zinc-200 text-zinc-400 dark:border-zinc-800 dark:text-zinc-500'
                                        )}
                                    >
                                        {isOver ? 'วางที่นี่' : 'ไม่มีรายการ'}
                                    </li>
                                )}
                            </ul>
                        </section>
                    )
                })}
            </div>
        </div>
    )
}

function BoardCardItem({
    card,
    today,
    assigneeName,
    canDrag,
    dragging,
    listHref,
    onOpenList,
    onOpenItem,
    onStatus,
    onDragStart,
    onDragEnd,
}: {
    card: BoardCard
    today: string
    assigneeName: string | null
    canDrag: boolean
    dragging: boolean
    listHref: string
    onOpenList: (listId: string) => void
    onOpenItem: (itemId: string, returnFocus: HTMLElement | null) => void
    onStatus: (item: PurchaseItem, status: PurchaseStatus) => void
    onDragStart: (itemId: string) => void
    onDragEnd: () => void
}) {
    const { item } = card
    const pending = isTempId(item.id)
    const next = nextStatus(item.status)
    const draggable = canDrag && !pending

    return (
        <li
            draggable={draggable}
            onDragStart={
                draggable
                    ? e => {
                          e.dataTransfer.effectAllowed = 'move'
                          e.dataTransfer.setData('text/plain', item.id)
                          onDragStart(item.id)
                      }
                    : undefined
            }
            onDragEnd={draggable ? onDragEnd : undefined}
            className={cn(
                'rounded-lg border border-zinc-200 bg-white p-3 shadow-xs transition-opacity dark:border-zinc-800 dark:bg-zinc-950',
                draggable && 'cursor-grab active:cursor-grabbing',
                dragging && 'opacity-50',
                pending && 'bg-zinc-50 dark:bg-zinc-900/60'
            )}
        >
            {pending ? (
                <p className="text-sm text-zinc-500 wrap-anywhere dark:text-zinc-400">{item.title}</p>
            ) : (
                <button
                    type="button"
                    onClick={e => onOpenItem(item.id, e.currentTarget)}
                    title="แก้ไขรายการ"
                    className="block w-full rounded text-left text-sm font-medium text-zinc-900 outline-none wrap-anywhere hover:underline focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-zinc-100"
                >
                    {item.title}
                    {item.quantity && <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {item.quantity}</span>}
                </button>
            )}
            <a
                href={listHref}
                draggable={false}
                onClick={e => {
                    if (!isPlainClick(e)) return
                    e.preventDefault()
                    onOpenList(card.listId)
                }}
                className="mt-0.5 inline-block rounded text-xs text-zinc-500 underline-offset-2 outline-none wrap-anywhere hover:text-zinc-800 hover:underline focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
                <span className="sr-only">เช็กลิสต์ </span>
                {card.listTitle}
            </a>

            {(assigneeName || card.due) && (
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-zinc-600 dark:text-zinc-400">
                    {assigneeName && (
                        <span className="inline-flex min-w-0 items-start gap-1">
                            <User className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="wrap-anywhere">
                                <span className="sr-only">ผู้รับผิดชอบ </span>
                                {assigneeName}
                            </span>
                        </span>
                    )}
                    {card.due && (
                        <span className="inline-flex flex-wrap items-center gap-x-1 tabular-nums">
                            <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span className="sr-only">ต้องได้ของภายใน </span>
                            {formatThaiDate(card.due)}
                            {item.status !== 'done' && (
                                <span className={urgencyTone(card.urgency).text}>({countdownLabel(card.due, today)})</span>
                            )}
                        </span>
                    )}
                </div>
            )}

            {pending ? (
                <span className="mt-2 inline-flex h-9 items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                    กำลังเพิ่ม…
                </span>
            ) : (
                next && (
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2 h-9 w-full justify-between"
                        onClick={() => onStatus(item, next)}
                    >
                        เลื่อนเป็น &ldquo;{STATUS_LABELS[next]}&rdquo;
                        <ArrowRight aria-hidden />
                    </Button>
                )
            )}
        </li>
    )
}
