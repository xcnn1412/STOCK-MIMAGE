'use client'

// หน้าต่าง "ผูกใบเบิกกับหลายรายการ" (เมนูของการ์ดเช็กลิสต์) — 2 ขั้น:
// 1) เลือกใบเบิกด้วย ClaimPicker  2) ติ๊กรายการของเช็กลิสต์นี้ (ยังไม่ผูก = ติ๊กให้ก่อน · ผูกใบอื่นอยู่ = ไม่ติ๊ก)
// กด "ผูกใบเบิก" แล้วปิดทันที — หน้าแสดงผลแบบชั่วคราว ('linkClaim' ผ่าน mutate ของหน้า) ข้อมูลจริงตามมาเอง
// รายการที่ยังรอ server (id ชั่วคราว) ไม่อยู่ในรายการ · เลือกเกิน 50 รายการกดผูกไม่ได้ (server ตรวจซ้ำ)

import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
    MAX_ITEMS_PER_LINK,
    formatMoney,
    isTempId,
    listTitle,
    moneyOf,
    type PurchaseClaim,
    type PurchaseClaimOption,
    type PurchaseList,
} from '../purchasing-logic'
import { ClaimPicker } from './claim-picker'

export interface LinkClaimDialogProps {
    /** เช็กลิสต์ตัวเต็ม (ไม่ผ่านตัวกรอง) */
    list: PurchaseList
    /** ใบเบิกที่รายการผูกอยู่ (จาก snapshot) — ใช้บอก "ผูกอยู่กับ …" */
    claims: Record<string, PurchaseClaim>
    /** แอดมินผูกได้ทุกใบ · คนอื่นเฉพาะใบที่ตัวเองเป็นผู้เบิก */
    isAdmin: boolean
    /** ผูก — itemIds = รายการที่ติ๊ก (id จริงเท่านั้น) · หน้าต่างปิดตัวเองก่อนเรียก */
    onLink: (claim: PurchaseClaimOption, itemIds: string[]) => void
    onOpenChange: (open: boolean) => void
    onCloseAutoFocus: (event: Event) => void
}

export function LinkClaimDialog({ list, claims, isAdmin, onLink, onOpenChange, onCloseAutoFocus }: LinkClaimDialogProps) {
    const uid = useId()
    /** null = ขั้นที่ 1 (เลือกใบเบิก) */
    const [claim, setClaim] = useState<PurchaseClaimOption | null>(null)
    const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set<string>())

    const saved = list.items.filter(i => !isTempId(i.id))
    // รายการที่ผูกกับใบที่เลือกอยู่แล้วไม่ต้องผูกซ้ำ — แสดงไว้แต่เลือกไม่ได้
    const selectable = claim ? saved.filter(i => i.expense_claim_id !== claim.id) : []
    const chosen = selectable.filter(i => ticked.has(i.id))
    const chosenActual = moneyOf(chosen).actual
    const moving = chosen.filter(i => i.expense_claim_id !== null).length
    const over = chosen.length > MAX_ITEMS_PER_LINK
    const allTicked = selectable.length > 0 && chosen.length === selectable.length

    const pick = (option: PurchaseClaimOption) => {
        setClaim(option)
        // ยังไม่ผูก = ติ๊กให้ก่อน · ผูกใบอื่นอยู่ = ไม่ติ๊ก (ย้ายใบต้องตั้งใจติ๊กเอง)
        setTicked(new Set(saved.filter(i => !i.expense_claim_id).map(i => i.id)))
    }

    const toggle = (itemId: string, on: boolean) => {
        setTicked(prev => {
            const next = new Set(prev)
            if (on) next.add(itemId)
            else next.delete(itemId)
            return next
        })
    }

    const submit = () => {
        if (!claim || chosen.length === 0 || over) return
        onOpenChange(false)
        onLink(claim, chosen.map(i => i.id))
    }

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>ผูกใบเบิกกับหลายรายการ</DialogTitle>
                    <DialogDescription className="wrap-anywhere">
                        {claim
                            ? `ขั้นที่ 2 จาก 2 — เลือกรายการของ "${listTitle(list)}" ที่เบิกเงินด้วยใบเบิกนี้`
                            : `ขั้นที่ 1 จาก 2 — เลือกใบเบิกที่ใช้เบิกเงินค่ารายการของ "${listTitle(list)}"`}
                    </DialogDescription>
                </DialogHeader>

                {!claim ? (
                    <ClaimPicker isAdmin={isAdmin} onPick={pick} />
                ) : (
                    <div className="space-y-3">
                        {/* ใบเบิกที่เลือก — ผลค้นมีแต่ใบที่ผู้ใช้เห็นได้ จึงแสดงชื่อและยอดได้ */}
                        <div className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900 dark:bg-violet-950/30">
                            <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="text-xs text-zinc-500 dark:text-zinc-400">ใบเบิกที่เลือก</p>
                                <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                                    <span className="tabular-nums">{claim.claim_number}</span>
                                    <span className="font-normal text-zinc-600 dark:text-zinc-400">
                                        {' · '}
                                        <span className="sr-only">สถานะ </span>
                                        {claim.status_label}
                                    </span>
                                </p>
                                <p className="text-sm text-zinc-700 wrap-anywhere dark:text-zinc-300">{claim.title || 'ไม่มีชื่อใบเบิก'}</p>
                                <p className="text-xs tabular-nums text-zinc-600 dark:text-zinc-400">
                                    ยอดใบเบิก {formatMoney(claim.amount)} บาท
                                    {claim.linked_items > 0 && ` · ผูกอยู่แล้ว ${claim.linked_items} รายการ`}
                                </p>
                            </div>
                            {/* autoFocus: ตัวเลือกใบเบิกที่โฟกัสอยู่หายไปแล้ว — โฟกัสลงที่ต้นของขั้นที่ 2 (Tab ต่อไปถึงรายการ) */}
                            <Button type="button" variant="ghost" size="sm" className="shrink-0" autoFocus onClick={() => setClaim(null)}>
                                เปลี่ยนใบเบิก
                            </Button>
                        </div>

                        <fieldset className="space-y-2">
                            <legend className="sr-only">รายการที่จะผูกกับใบเบิก {claim.claim_number}</legend>
                            {selectable.length > 0 && (
                                <div className="flex items-center gap-2 px-3">
                                    <Checkbox
                                        id={`${uid}-all`}
                                        checked={allTicked ? true : chosen.length > 0 ? 'indeterminate' : false}
                                        onCheckedChange={() =>
                                            setTicked(allTicked ? new Set<string>() : new Set(selectable.map(i => i.id)))
                                        }
                                    />
                                    <label htmlFor={`${uid}-all`} className="cursor-pointer text-sm font-medium">
                                        เลือกทั้งหมด <span className="font-normal tabular-nums text-zinc-500">({selectable.length})</span>
                                    </label>
                                </div>
                            )}
                            {/* relative: ข้อความ sr-only (position:absolute) ต้องยึดกรอบเลื่อนนี้ ไม่หลุดออกไปดันความสูง/ความกว้างของหน้า */}
                            <ul className="relative max-h-[min(20rem,45dvh)] divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                                {saved.map(item => {
                                    const same = item.expense_claim_id === claim.id
                                    const current = item.expense_claim_id ? claims[item.expense_claim_id] : undefined
                                    const boxId = `${uid}-${item.id}`
                                    return (
                                        <li key={item.id} className="flex items-start gap-3 px-3 py-2">
                                            <Checkbox
                                                id={boxId}
                                                className="mt-0.5"
                                                checked={same || ticked.has(item.id)}
                                                disabled={same}
                                                onCheckedChange={v => toggle(item.id, v === true)}
                                            />
                                            <label htmlFor={boxId} className={cn('min-w-0 flex-1 text-sm', !same && 'cursor-pointer')}>
                                                <span className="block font-medium text-zinc-900 wrap-anywhere dark:text-zinc-100">
                                                    {item.title}
                                                    {item.quantity && (
                                                        <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {item.quantity}</span>
                                                    )}
                                                </span>
                                                <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                                    <span className="tabular-nums">
                                                        จ่ายจริง{' '}
                                                        {item.actual_price != null ? (
                                                            `${formatMoney(item.actual_price)} บาท`
                                                        ) : (
                                                            <>
                                                                —<span className="sr-only">ยังไม่ใส่</span>
                                                            </>
                                                        )}
                                                    </span>
                                                    {same ? (
                                                        <span className="text-emerald-700 dark:text-emerald-400">ผูกกับใบนี้อยู่แล้ว</span>
                                                    ) : (
                                                        item.expense_claim_id && (
                                                            <span className="text-amber-700 tabular-nums dark:text-amber-400">
                                                                ผูกอยู่กับ {current?.claim_number || 'ใบเบิกอื่น'}
                                                            </span>
                                                        )
                                                    )}
                                                </span>
                                            </label>
                                        </li>
                                    )
                                })}
                            </ul>
                        </fieldset>

                        <p className="text-sm tabular-nums text-zinc-700 dark:text-zinc-300" aria-live="polite">
                            เลือก {chosen.length} รายการ · รวมจ่ายจริง {formatMoney(chosenActual)} บาท
                        </p>
                        {over ? (
                            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                                ผูกได้ครั้งละไม่เกิน {MAX_ITEMS_PER_LINK} รายการ — เอาเครื่องหมายออกอีก {chosen.length - MAX_ITEMS_PER_LINK} รายการ
                            </p>
                        ) : (
                            moving > 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    {moving} รายการที่เลือกผูกกับใบเบิกอื่นอยู่ — จะย้ายมาผูกกับใบนี้แทน
                                </p>
                            )
                        )}
                    </div>
                )}

                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                        ยกเลิก
                    </Button>
                    <Button type="button" disabled={!claim || chosen.length === 0 || over} onClick={submit}>
                        {claim && chosen.length > 0 && !over ? `ผูกใบเบิก ${chosen.length} รายการ` : 'ผูกใบเบิก'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
