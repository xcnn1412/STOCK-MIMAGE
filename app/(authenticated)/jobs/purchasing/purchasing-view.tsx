'use client'

// หน้าจัดซื้อ (/jobs/purchasing) — เช็กลิสต์ของที่ต้องซื้อ ต้องสั่ง หรือต้องจัดการของแต่ละงาน · สเปค: docs/specs/purchasing-checklist.md
// ตัวกรองอยู่ใน URL: ?view=board ?status= ?mine=1 ?q= ?done=1 ?list=<id> (ลิงก์เปิดใบ) · ?past=1 มาจาก server (โหลดใบเก่าด้วย)
// ทุกการเปลี่ยนแปลง: useOptimistic(applyOptimistic) + useTransition → หน้าจอเปลี่ยนทันที ข้อมูลจริงตามมาจาก revalidatePath
// พลาด = ค่าชั่วคราวหายเองเมื่องานจบ + toast.error · ไม่สั่งโหลดหน้าใหม่เองหลังบันทึก และไม่เก็บสำเนาเช็กลิสต์ใน state
// ห้าม import ./data (มี service-role client) — ชนิดข้อมูลมาจาก purchasing-logic.ts

import { useOptimistic, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Layers, Loader2, Plus, Search, ShoppingCart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import {
    addPurchaseItems,
    applyPurchaseTemplate,
    deletePurchaseItem,
    deletePurchaseList,
    linkPurchaseItemsToClaim,
    setPurchaseItemStatus,
    updatePurchaseItem,
    updatePurchaseList,
} from './actions'
import {
    PURCHASE_STATUSES,
    STATUS_LABELS,
    applyOptimistic,
    filterLists,
    isListFinished,
    isPurchaseStatus,
    isTempId,
    listTitle,
    listsSummary,
    progressOf,
    statusTone,
    type ListFilter,
    type OptimisticAction,
    type PurchaseClaim,
    type PurchaseClaimOption,
    type PurchaseItem,
    type PurchaseItemInput,
    type PurchaseKind,
    type PurchaseList,
    type PurchaseListInput,
    type PurchasePerson,
    type PurchaseStatus,
    type PurchaseTemplate,
    type Viewer,
} from './purchasing-logic'
import { BoardView } from './components/board-view'
import { CreateListDialog } from './components/create-list-dialog'
import { ItemDialog } from './components/item-dialog'
import { ListCard } from './components/list-card'
import { TemplatesDialog } from './components/templates-dialog'
import { SAVE_FAILED, errorOf, newTempId, useFocusReturn, type Mutate } from './components/shared'

export interface PurchasingViewProps {
    /** เช็กลิสต์จาก server (เรียงตาม sortLists แล้ว) */
    lists: PurchaseList[]
    /** คนที่อนุมัติแล้ว — ตัวเลือกผู้รับผิดชอบ */
    people: PurchasePerson[]
    templates: PurchaseTemplate[]
    /** ใบเบิกที่รายการผูกอยู่ (id ใบเบิก → ใบเบิก) — server ตัดชื่อ/ยอดตามสิทธิ์ของผู้ใช้คนนี้มาแล้ว */
    claims: Record<string, PurchaseClaim>
    currentUserId: string | null
    isAdmin: boolean
    myDepartment: string | null
    /** วันนี้เวลาไทย (YYYY-MM-DD) จาก server — กันวันเพี้ยนระหว่าง server/browser */
    today: string
}

type AddItemsAction = Extract<OptimisticAction, { type: 'addItems' }>

/** ชิปตัวกรอง/สลับ — ชุดเดียวกับหน้าติดตามงาน */
const chipClass = (active: boolean) =>
    cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-sm transition-colors',
        active
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'border border-zinc-200 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800'
    )

function ChipCount({ n, active }: { n: number; active: boolean }) {
    return <span className={cn('text-[11px] tabular-nums', active ? 'opacity-70' : 'text-zinc-400')}>{n}</span>
}

/** หารายการ (และเช็กลิสต์ของมัน) จาก id */
function findItem(lists: PurchaseList[], itemId: string): { item: PurchaseItem; list: PurchaseList } | null {
    for (const list of lists) {
        const item = list.items.find(i => i.id === itemId)
        if (item) return { item, list }
    }
    return null
}

export default function PurchasingView({
    lists: serverLists,
    people,
    templates,
    claims,
    currentUserId,
    isAdmin,
    myDepartment,
    today,
}: PurchasingViewProps) {
    const router = useRouter()
    const searchParams = useSearchParams()
    const [lists, applyAction] = useOptimistic(serverLists, applyOptimistic)
    const [pending, startTransition] = useTransition()

    // --- ตัวกรองจาก URL ---
    const view = searchParams.get('view') === 'board' ? 'board' : 'lists'
    const statusParam = searchParams.get('status')
    const status: PurchaseStatus | 'all' = isPurchaseStatus(statusParam) ? statusParam : 'all'
    const mine = searchParams.get('mine') === '1' && !!currentUserId
    const showFinished = searchParams.get('done') === '1'
    const focusId = searchParams.get('list')
    const past = searchParams.get('past') === '1'
    // คำค้นเป็น state ของหน้า (พิมพ์ลื่น กรองทันที) แล้วเขียนตามลง URL — อ่านจาก URL ครั้งเดียวตอนเปิดหน้า
    const [query, setQuery] = useState(() => searchParams.get('q') ?? '')

    // --- หน้าต่าง (แต่ละอันจำปุ่มที่เปิดไว้คืนโฟกัสตอนปิด) ---
    const [createOpen, setCreateOpen] = useState(false)
    const [templatesOpen, setTemplatesOpen] = useState(false)
    const [openItemId, setOpenItemId] = useState<string | null>(null)
    const createFocus = useFocusReturn()
    const templatesFocus = useFocusReturn()
    const itemFocus = useFocusReturn()

    const viewer: Viewer = { userId: currentUserId, isAdmin, department: myDepartment }
    const filter: ListFilter = { status, mine, query, showFinished }
    const itemFiltersActive = status !== 'all' || mine || query.trim() !== ''

    /**
     * เขียนตัวกรองลง URL โดยไม่โหลดข้อมูลใหม่ — history.replaceState (Next ผูกกับ useSearchParams ให้เอง)
     * ตัวกรองทั้งหมดทำฝั่ง browser จึงไม่ต้องให้ server คิวรีเช็กลิสต์ทั้งชุดใหม่ทุกครั้งที่กดชิป/พิมพ์ค้น
     * อ่าน URL จริงตอนกด (ไม่ใช่ของรอบ render) — ?past ที่มีอยู่คงไว้เสมอ
     */
    const setParams = (patch: Record<string, string | null>) => {
        const params = new URLSearchParams(window.location.search)
        for (const [key, value] of Object.entries(patch)) {
            if (value === null) params.delete(key)
            else params.set(key, value)
        }
        const qs = params.toString()
        window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
    }
    /** เปลี่ยนตัวกรอง = เลิกโหมดลิงก์ ?list= (ใบที่ลิงก์มาไม่ต้องค้างแสดงข้ามตัวกรองอีก) */
    const setFilter = (patch: Record<string, string | null>) => setParams({ ...patch, list: null })

    const changeQuery = (value: string) => {
        setQuery(value)
        setFilter({ q: value.trim() || null })
    }
    const clearFilters = () => {
        setQuery('')
        setFilter({ status: null, mine: null, q: null })
    }

    // --- ข้อมูลที่แสดง ---
    const fullById = new Map(lists.map(l => [l.id, l]))
    /** ใบที่เสร็จครบถูกซ่อนเมื่อไม่ได้เลือก "แสดงที่เสร็จแล้ว" (ตัดสินจากใบเต็ม ไม่ใช่ใบที่กรองแล้ว) */
    const hiddenFinished = (listId: string) => {
        const full = fullById.get(listId)
        return !showFinished && !!full && isListFinished(full)
    }
    // ตัวกรองระดับรายการ (สถานะ / ของฉัน / คำค้น) — การซ่อนใบที่เสร็จแล้วทำเองข้างล่าง ให้ใบที่ลิงก์มาแสดงได้เสมอ
    const matched = filterLists(lists, { ...filter, showFinished: true }, viewer)
    const matchedById = new Map(matched.map(l => [l.id, l]))

    /** การ์ดของมุมมองตามงาน — ใบที่ลิงก์มา (?list=) แสดงเสมอแม้ตัวกรองจะซ่อน (มาจากแจ้งเตือน/หน้าแรก) */
    const cards = lists.flatMap(full => {
        const hit = matchedById.get(full.id)
        if (full.id === focusId) return [{ list: full, items: hit ? hit.items : full.items }]
        if (!hit || hiddenFinished(full.id)) return []
        return [{ list: full, items: hit.items }]
    })
    /** บอร์ด: รายการที่ผ่านตัวกรองของทุกใบที่ไม่ถูกซ่อน */
    const boardLists = matched.filter(l => !hiddenFinished(l.id))
    const boardCount = boardLists.reduce((n, l) => n + l.items.length, 0)

    // ตัวเลขบนชิปสถานะ = ผลของตัวกรองอื่น (ของฉัน / คำค้น / ซ่อนที่เสร็จ) โดยไม่นับตัวกรองสถานะเอง
    const facet = filterLists(lists, { ...filter, status: 'all', showFinished: true }, viewer).filter(l => !hiddenFinished(l.id))
    const chipCounts = progressOf(facet.flatMap(l => l.items))
    const summary = listsSummary(lists, today)
    const mineOpen = currentUserId
        ? lists.reduce((n, l) => n + l.items.filter(i => i.assignee_id === currentUserId && i.status !== 'done').length, 0)
        : 0

    const empty = lists.length === 0
    const allFinishedHidden = !showFinished && lists.length > 0 && lists.every(l => isListFinished(l))
    const noResults = !empty && (view === 'board' ? boardCount === 0 && (itemFiltersActive || allFinishedHidden) : cards.length === 0)
    // ใบที่ลิงก์มาไม่อยู่ในข้อมูลที่โหลด (เสร็จนานแล้ว / ถูกลบ) — ระหว่างบันทึกอยู่ไม่ต้องเตือน (อาจกำลังเปลี่ยน)
    const focusMissing = !!focusId && !fullById.has(focusId) && !pending && view === 'lists'

    // --- ส่งการเปลี่ยนแปลงไป server ---
    const mutate: Mutate = (optimistic, call, after) => {
        startTransition(async () => {
            for (const action of optimistic) applyAction(action)
            let failure: string | null
            try {
                failure = await call()
            } catch (err) {
                console.error('[purchasing] server action:', err)
                failure = SAVE_FAILED
            }
            if (failure) {
                toast.error(failure)
                return
            }
            if (after?.success) toast.success(after.success)
            after?.onSuccess?.()
        })
    }

    /** รายการนี้ทำให้ใบ "ของครบ" ไหม — ครบแล้วใบถูกซ่อนโดยปริยาย จึงบอกผู้ใช้และให้ปุ่มกลับไปดู */
    const finishedNotice = (item: PurchaseItem, next: PurchaseStatus) => {
        const list = fullById.get(item.list_id)
        if (!list || next !== 'done' || isListFinished(list)) return undefined
        if (!list.items.every(i => i.id === item.id || i.status === 'done')) return undefined
        const hidesNow = !showFinished && list.id !== focusId
        return {
            onSuccess: () =>
                toast.success(
                    `ของครบแล้ว: ${listTitle(list)}`,
                    hidesNow
                        ? {
                              description: 'เช็กลิสต์ที่เสร็จแล้วถูกซ่อน — กด "แสดง" เพื่อดูอีกครั้ง',
                              action: { label: 'แสดง', onClick: () => setParams({ done: '1', list: list.id }) },
                          }
                        : undefined
                ),
        }
    }

    /** รายการที่เพิ่งเพิ่มถูกตัวกรองซ่อนไหม — ซ่อน = บอก ไม่งั้นผู้ใช้จะนึกว่าเพิ่มไม่ติด */
    const hiddenByFilter = (list: PurchaseList, action: AddItemsAction) => {
        if (!itemFiltersActive) return undefined
        const probe = filterLists(applyOptimistic([list], action), { ...filter, showFinished: true }, viewer)
        const shown = new Set(probe.flatMap(l => l.items.map(i => i.id)))
        const hidden = action.items.filter(d => !shown.has(d.tempId)).length
        return hidden > 0 ? { success: `เพิ่มแล้ว ${action.items.length} รายการ (ซ่อนอยู่ ${hidden} รายการตามตัวกรอง)` } : undefined
    }

    const setStatus = (item: PurchaseItem, next: PurchaseStatus) => {
        if (isTempId(item.id) || item.status === next) return
        mutate(
            [{ type: 'status', itemId: item.id, status: next, userId: currentUserId, now: new Date().toISOString() }],
            async () => errorOf(await setPurchaseItemStatus(item.id, next)),
            finishedNotice(item, next)
        )
    }

    /** บันทึกจากหน้าต่างแก้รายการ — ช่องที่เปลี่ยน (updatePurchaseItem) แล้วสถานะ (setPurchaseItemStatus) */
    const saveItem = (item: PurchaseItem, patch: Partial<PurchaseItemInput>, next: PurchaseStatus | null) => {
        if (isTempId(item.id)) return
        const hasPatch = Object.keys(patch).length > 0
        const statusChange = next && next !== item.status ? next : null
        if (!hasPatch && !statusChange) return
        const optimistic: OptimisticAction[] = []
        if (hasPatch) optimistic.push({ type: 'updateItem', itemId: item.id, patch })
        if (statusChange) {
            optimistic.push({ type: 'status', itemId: item.id, status: statusChange, userId: currentUserId, now: new Date().toISOString() })
        }
        mutate(
            optimistic,
            async () => {
                if (hasPatch) {
                    const failure = errorOf(await updatePurchaseItem(item.id, patch))
                    if (failure) return failure
                }
                return statusChange ? errorOf(await setPurchaseItemStatus(item.id, statusChange)) : null
            },
            statusChange ? finishedNotice(item, statusChange) : undefined
        )
    }

    const deleteItem = (item: PurchaseItem) => {
        if (isTempId(item.id)) return
        mutate([{ type: 'deleteItem', itemId: item.id }], async () => errorOf(await deletePurchaseItem(item.id)), {
            success: 'ลบรายการแล้ว',
        })
    }

    const addItems = (list: PurchaseList, titles: string[], kind: PurchaseKind) => {
        const action: AddItemsAction = {
            type: 'addItems',
            listId: list.id,
            items: titles.map(title => ({ tempId: newTempId(), title, kind })),
            userId: currentUserId,
            now: new Date().toISOString(),
        }
        mutate(
            [action],
            async () => errorOf(await addPurchaseItems(list.id, titles.map(title => ({ title, kind })))),
            hiddenByFilter(list, action)
        )
    }

    const applyTemplate = (list: PurchaseList, template: PurchaseTemplate) => {
        const action: AddItemsAction = {
            type: 'addItems',
            listId: list.id,
            items: template.items.map(it => ({ tempId: newTempId(), title: it.title, kind: it.kind })),
            userId: currentUserId,
            now: new Date().toISOString(),
        }
        mutate(
            [action],
            async () => errorOf(await applyPurchaseTemplate(list.id, template.id)),
            hiddenByFilter(list, action) ?? { success: `เพิ่ม ${template.items.length} รายการจากชุด "${template.name}" แล้ว` }
        )
    }

    const updateList = (list: PurchaseList, patch: Partial<PurchaseListInput>) => {
        if (Object.keys(patch).length === 0) return
        mutate([{ type: 'updateList', listId: list.id, patch }], async () => errorOf(await updatePurchaseList(list.id, patch)), {
            success: 'บันทึกเช็กลิสต์แล้ว',
        })
    }

    const deleteList = (list: PurchaseList) => {
        // ลบใบที่ลิงก์มาอยู่ = เลิกชี้ก่อน ไม่งั้นจะขึ้นเตือน "ไม่พบเช็กลิสต์"
        if (focusId === list.id) setParams({ list: null })
        mutate([{ type: 'deleteList', listId: list.id }], async () => errorOf(await deletePurchaseList(list.id)), {
            success: `ลบเช็กลิสต์ "${listTitle(list)}" แล้ว`,
        })
    }

    /** ผูกหลายรายการของใบนี้กับใบเบิกเดียว (หน้าต่าง "ผูกใบเบิกกับหลายรายการ") — แถวขึ้นว่าผูกแล้วทันที */
    const linkClaim = (list: PurchaseList, claim: PurchaseClaimOption, itemIds: string[]) => {
        const ids = itemIds.filter(id => !isTempId(id))
        if (ids.length === 0) return
        mutate(
            [{ type: 'linkClaim', itemIds: ids, claimId: claim.id }],
            async () => errorOf(await linkPurchaseItemsToClaim(ids, claim.id)),
            { success: `ผูก ${ids.length} รายการกับใบเบิก ${claim.claim_number} แล้ว` }
        )
    }

    /**
     * เปิดเช็กลิสต์ในมุมมองตามงาน (?list=) — fresh = เพิ่งสร้าง (ข้อมูลใหม่ตามมาจาก server เอง)
     * ใบที่ไม่ได้โหลดมา (เสร็จและไม่ขยับเกิน 30 วัน) → ขอ server โหลดทั้งหมด (?past=1) ก่อน
     */
    const openList = (listId: string, opts?: { fresh?: boolean }) => {
        if (!opts?.fresh && !past && !fullById.has(listId)) {
            const params = new URLSearchParams(window.location.search)
            params.set('list', listId)
            params.set('past', '1')
            params.delete('view')
            router.replace(`?${params.toString()}`, { scroll: false })
            return
        }
        setParams({ list: listId, view: null })
    }

    /** href จริงของลิงก์เปิดเช็กลิสต์ (บอร์ด) — คลิกกลาง/เปิดแท็บใหม่ได้ */
    const listHref = (listId: string) => {
        const params = new URLSearchParams(searchParams.toString())
        params.set('list', listId)
        params.delete('view')
        return `/jobs/purchasing?${params.toString()}`
    }

    /** ลิงก์เปิด/ปิด ?past=1 — ต้องให้ server โหลดข้อมูลใหม่ จึงเป็นการนำทางจริง */
    const pastHref = (on: boolean) => {
        const params = new URLSearchParams(searchParams.toString())
        if (on) params.set('past', '1')
        else params.delete('past')
        const qs = params.toString()
        return qs ? `/jobs/purchasing?${qs}` : '/jobs/purchasing'
    }

    const openItem = (itemId: string, returnFocus: HTMLElement | null) => {
        if (isTempId(itemId)) return
        itemFocus.remember(returnFocus)
        setOpenItemId(itemId)
    }
    const openEntry = openItemId ? findItem(lists, openItemId) : null

    const openCreate = (e: React.MouseEvent<HTMLButtonElement>) => {
        createFocus.remember(e.currentTarget)
        setCreateOpen(true)
    }

    return (
        <div className="space-y-4">
            {/* หัวหน้า + ตัวเลขรวม (นับจากเช็กลิสต์ทั้งหมดที่โหลดมา ไม่ขึ้นกับตัวกรอง) */}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">เช็กลิสต์จัดซื้อ</h1>
                    <p className="text-sm text-zinc-500 dark:text-zinc-400">
                        <span className="tabular-nums">{summary.lists}</span> เช็กลิสต์ · ค้าง{' '}
                        <span className="tabular-nums">{summary.open}</span> รายการ ·{' '}
                        <span className={cn('tabular-nums', summary.urgent > 0 && 'font-medium text-red-600 dark:text-red-400')}>
                            ด่วน {summary.urgent} รายการ
                        </span>
                        {pending && (
                            <span className="ml-2 inline-flex items-center gap-1 text-xs text-zinc-400">
                                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                                กำลังบันทึก…
                            </span>
                        )}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={e => {
                            templatesFocus.remember(e.currentTarget)
                            setTemplatesOpen(true)
                        }}
                    >
                        <Layers aria-hidden /> ชุดรายการสำเร็จรูป
                    </Button>
                    {/* ยังไม่มีเช็กลิสต์ = ปุ่มหลักอยู่กลางหน้าแทน (หนึ่งปุ่มหลักต่อหน้า) */}
                    {!empty && (
                        <Button type="button" size="sm" onClick={openCreate}>
                            <Plus aria-hidden /> เพิ่มเช็กลิสต์
                        </Button>
                    )}
                </div>
            </div>

            {!empty && (
                <>
                    {/* ชิปสถานะ — มือถือเลื่อนแนวนอนในแถวของตัวเอง จอกว้างตัดบรรทัด */}
                    <div
                        role="group"
                        aria-label="กรองตามสถานะ"
                        className="flex flex-nowrap items-center gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] md:flex-wrap md:overflow-x-visible [&::-webkit-scrollbar]:hidden"
                    >
                        <button
                            type="button"
                            aria-pressed={status === 'all'}
                            onClick={() => setFilter({ status: null })}
                            className={chipClass(status === 'all')}
                        >
                            ทั้งหมด <ChipCount n={chipCounts.total} active={status === 'all'} />
                        </button>
                        {PURCHASE_STATUSES.map(s => (
                            <button
                                key={s}
                                type="button"
                                aria-pressed={status === s}
                                onClick={() => setFilter({ status: status === s ? null : s })}
                                className={chipClass(status === s)}
                            >
                                <span className={cn('h-2 w-2 shrink-0 rounded-full', statusTone(s).dot)} aria-hidden />
                                {STATUS_LABELS[s]} <ChipCount n={chipCounts.byStatus[s]} active={status === s} />
                            </button>
                        ))}
                    </div>

                    {/* ค้นหา · ของฉัน · แสดงที่เสร็จแล้ว · สลับมุมมอง */}
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="relative w-full sm:w-72">
                            <Search
                                className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
                                aria-hidden
                            />
                            <Input
                                value={query}
                                onChange={e => changeQuery(e.target.value)}
                                placeholder="ค้นหา งาน / สถานที่ / รายการ / ร้าน"
                                aria-label="ค้นหาเช็กลิสต์หรือรายการ"
                                autoComplete="off"
                                className="h-8 pl-8 pr-8"
                            />
                            {query && (
                                <button
                                    type="button"
                                    aria-label="ล้างคำค้น"
                                    onClick={() => changeQuery('')}
                                    className="absolute right-1 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                                >
                                    <X className="h-3.5 w-3.5" aria-hidden />
                                </button>
                            )}
                        </div>
                        {currentUserId && (
                            <button
                                type="button"
                                aria-pressed={mine}
                                onClick={() => setFilter({ mine: mine ? null : '1' })}
                                className={chipClass(mine)}
                                title="เฉพาะรายการที่คุณเป็นผู้รับผิดชอบ"
                            >
                                ของฉัน <ChipCount n={mineOpen} active={mine} />
                            </button>
                        )}
                        <button
                            type="button"
                            aria-pressed={showFinished}
                            onClick={() => setFilter({ done: showFinished ? null : '1' })}
                            className={chipClass(showFinished)}
                        >
                            แสดงที่เสร็จแล้ว
                        </button>
                        <div
                            role="group"
                            aria-label="มุมมอง"
                            className="ml-auto flex shrink-0 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800"
                        >
                            {(
                                [
                                    { key: 'lists', label: 'ตามงาน' },
                                    { key: 'board', label: 'ตามสถานะ' },
                                ] as const
                            ).map(o => (
                                <button
                                    key={o.key}
                                    type="button"
                                    aria-pressed={view === o.key}
                                    onClick={() => setFilter({ view: o.key === 'board' ? 'board' : null })}
                                    className={cn(
                                        'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                        view === o.key
                                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                            : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
                                    )}
                                >
                                    {o.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </>
            )}

            {focusMissing && (
                <div
                    role="status"
                    className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
                >
                    {past ? (
                        'ไม่พบเช็กลิสต์ที่เปิดมา — อาจถูกลบไปแล้ว'
                    ) : (
                        <>
                            เช็กลิสต์ที่เปิดมาไม่อยู่ในรายการล่าสุด (อาจเสร็จไปนานแล้ว) ·{' '}
                            <Link href={pastHref(true)} scroll={false} className="font-medium underline underline-offset-2">
                                แสดงทั้งหมด
                            </Link>
                        </>
                    )}
                </div>
            )}

            {empty ? (
                // ยังไม่มีเช็กลิสต์เลย — ปุ่มหลักของหน้าอยู่ที่นี่
                <div className="flex flex-col items-center rounded-xl border border-dashed border-zinc-300 bg-white px-4 py-14 text-center dark:border-zinc-700 dark:bg-zinc-950">
                    <ShoppingCart className="h-8 w-8 text-zinc-300 dark:text-zinc-600" aria-hidden />
                    <p className="mt-3 text-sm font-medium text-zinc-800 dark:text-zinc-200">ยังไม่มีเช็กลิสต์จัดซื้อ</p>
                    <p className="mt-1 max-w-sm text-xs text-zinc-500 dark:text-zinc-400">
                        เลือกงานจาก CRM แล้วจดของที่ต้องซื้อ ต้องสั่ง หรือต้องจัดการก่อนวันงาน — หรือสร้างเช็กลิสต์ทั่วไปสำหรับของใช้ส่วนกลาง
                    </p>
                    <Button type="button" className="mt-4" onClick={openCreate}>
                        <Plus aria-hidden /> เพิ่มเช็กลิสต์
                    </Button>
                </div>
            ) : noResults ? (
                <div className="rounded-xl border border-dashed border-zinc-300 px-4 py-10 text-center dark:border-zinc-700">
                    {itemFiltersActive ? (
                        <>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">ไม่พบรายการที่ตรงกับตัวกรอง</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">ลองเปลี่ยนคำค้นหรือสถานะ หรือล้างตัวกรองเพื่อดูทั้งหมด</p>
                            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={clearFilters}>
                                ล้างตัวกรอง
                            </Button>
                        </>
                    ) : (
                        <>
                            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">เช็กลิสต์ทั้งหมดของครบแล้ว</p>
                            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">เช็กลิสต์ที่เสร็จแล้วถูกซ่อนไว้</p>
                            <Button type="button" variant="outline" size="sm" className="mt-4" onClick={() => setFilter({ done: '1' })}>
                                แสดงที่เสร็จแล้ว
                            </Button>
                        </>
                    )}
                </div>
            ) : view === 'board' ? (
                <BoardView
                    lists={boardLists}
                    today={today}
                    people={people}
                    listHref={listHref}
                    onOpenList={listId => openList(listId)}
                    onOpenItem={openItem}
                    onStatus={setStatus}
                />
            ) : (
                <div className="space-y-3">
                    {cards.map(({ list, items }) => (
                        <ListCard
                            key={list.id}
                            list={list}
                            items={items}
                            today={today}
                            viewer={viewer}
                            people={people}
                            templates={templates}
                            claims={claims}
                            focused={list.id === focusId}
                            filtersActive={itemFiltersActive}
                            onStatus={setStatus}
                            onOpenItem={openItem}
                            onDeleteItem={deleteItem}
                            onAddItems={addItems}
                            onApplyTemplate={applyTemplate}
                            onUpdateList={updateList}
                            onDeleteList={deleteList}
                            onLinkClaim={linkClaim}
                        />
                    ))}
                </div>
            )}

            {/* ใบที่เสร็จและเงียบเกิน 30 วัน server ไม่โหลดมาโดยปริยาย */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {past ? (
                    <>
                        แสดงเช็กลิสต์ทั้งหมดรวมที่เก่าแล้ว ·{' '}
                        <Link href={pastHref(false)} scroll={false} className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
                            ซ่อนที่เก่า
                        </Link>
                    </>
                ) : (
                    <>
                        เช็กลิสต์ที่เสร็จและไม่ขยับเกิน 30 วันถูกซ่อน ·{' '}
                        <Link href={pastHref(true)} scroll={false} className="font-medium text-zinc-700 underline underline-offset-2 dark:text-zinc-300">
                            แสดงทั้งหมด
                        </Link>
                    </>
                )}
            </p>

            {createOpen && (
                <CreateListDialog
                    templates={templates}
                    onOpenChange={next => {
                        if (!next) setCreateOpen(false)
                    }}
                    onCloseAutoFocus={createFocus.restore}
                    onDone={(listId, existed) => {
                        setCreateOpen(false)
                        if (existed) toast.info('งานนี้มีเช็กลิสต์อยู่แล้ว — เปิดใบเดิมให้')
                        openList(listId, { fresh: !existed })
                    }}
                />
            )}
            {templatesOpen && (
                <TemplatesDialog
                    templates={templates}
                    viewer={viewer}
                    onOpenChange={next => {
                        if (!next) setTemplatesOpen(false)
                    }}
                    onCloseAutoFocus={templatesFocus.restore}
                />
            )}
            {openEntry && (
                <ItemDialog
                    key={openEntry.item.id}
                    item={openEntry.item}
                    list={openEntry.list}
                    claim={openEntry.item.expense_claim_id ? (claims[openEntry.item.expense_claim_id] ?? null) : null}
                    isAdmin={isAdmin}
                    people={people}
                    currentUserId={currentUserId}
                    onSave={saveItem}
                    onOpenChange={next => {
                        if (!next) setOpenItemId(null)
                    }}
                    onCloseAutoFocus={itemFocus.restore}
                />
            )}
        </div>
    )
}
