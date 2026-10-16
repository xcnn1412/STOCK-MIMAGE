'use client'

// หน้าต่าง "เบิกหลายรายการ" (เมนูของการ์ดเช็กลิสต์) — ติ๊กรายการก่อน แล้วเลือกทาง:
//   · สร้างใบเบิกใหม่ → เปิดฟอร์ม /finance/new?items=… (ฟอร์มรวมยอดจ่ายจริงให้ บันทึกแล้วผูกทุกรายการ + เกาะการ์ด CRM เอง)
//   · เชื่อมใบเบิกที่มีอยู่ → เลือกใบด้วย ClaimPicker แล้วผูกทันที (หน้าแสดงผลแบบชั่วคราวผ่าน mutate ข้อมูลจริงตามมาเอง)
// ติ๊กให้ก่อนเฉพาะรายการที่ยังไม่ผูก · รายการที่ผูกใบอื่นอยู่ติ๊กเองได้ = ย้ายใบ
// รายการที่ยังรอ server (id ชั่วคราว) ไม่อยู่ในรายการ · เลือกเกิน 50 รายการไปต่อไม่ได้ (server ตรวจซ้ำ)

import { useId, useState } from 'react'
import Link from 'next/link'
import { FilePlus2, Link2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
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
    const saved = list.items.filter(i => !isTempId(i.id))
    // ยังไม่ผูก = ติ๊กให้ก่อน · ผูกใบอื่นอยู่ = ไม่ติ๊ก (ย้ายใบต้องตั้งใจติ๊กเอง)
    const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(saved.filter(i => !i.expense_claim_id).map(i => i.id)))
    /** ขั้นเลือกใบเบิกที่มีอยู่ (หลังติ๊กแล้วกด "เชื่อมใบเบิกที่มีอยู่") */
    const [picking, setPicking] = useState(false)
    const [pickError, setPickError] = useState<string | null>(null)

    const chosen = saved.filter(i => ticked.has(i.id))
    const chosenActual = moneyOf(chosen).actual
    const moving = chosen.filter(i => i.expense_claim_id !== null).length
    const over = chosen.length > MAX_ITEMS_PER_LINK
    const ready = chosen.length > 0 && !over
    const allTicked = saved.length > 0 && chosen.length === saved.length
    const newClaimHref = `/finance/new?items=${chosen.map(i => i.id).join(',')}`

    const toggle = (itemId: string, on: boolean) => {
        setTicked(prev => {
            const next = new Set(prev)
            if (on) next.add(itemId)
            else next.delete(itemId)
            return next
        })
    }

    const pick = (claim: PurchaseClaimOption) => {
        // รายการที่ผูกกับใบนี้อยู่แล้วไม่ต้องผูกซ้ำ
        const ids = chosen.filter(i => i.expense_claim_id !== claim.id).map(i => i.id)
        if (ids.length === 0) {
            setPickError(`ทุกรายการที่เลือกผูกกับ ${claim.claim_number} อยู่แล้ว — เลือกใบอื่น หรือกลับไปเลือกรายการใหม่`)
            return
        }
        onOpenChange(false)
        onLink(claim, ids)
    }

    return (
        <Dialog open onOpenChange={onOpenChange}>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg" onCloseAutoFocus={onCloseAutoFocus}>
                <DialogHeader>
                    <DialogTitle>เบิกหลายรายการ</DialogTitle>
                    <DialogDescription className="wrap-anywhere">
                        {picking
                            ? `เลือกใบเบิกที่ใช้เบิกเงินค่า ${chosen.length} รายการของ "${listTitle(list)}"`
                            : `ติ๊กรายการของ "${listTitle(list)}" ที่จะเบิกในใบเดียวกัน แล้วเลือกสร้างใบใหม่ หรือเชื่อมกับใบเบิกที่มีอยู่`}
                    </DialogDescription>
                </DialogHeader>

                {picking ? (
                    <div className="space-y-3">
                        <ClaimPicker isAdmin={isAdmin} onPick={pick} />
                        {pickError && (
                            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                                {pickError}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <fieldset className="space-y-2">
                            <legend className="sr-only">รายการที่จะเบิก</legend>
                            {saved.length > 0 && (
                                <div className="flex items-center gap-2 px-3">
                                    <Checkbox
                                        id={`${uid}-all`}
                                        checked={allTicked ? true : chosen.length > 0 ? 'indeterminate' : false}
                                        onCheckedChange={() => setTicked(allTicked ? new Set<string>() : new Set(saved.map(i => i.id)))}
                                    />
                                    <label htmlFor={`${uid}-all`} className="cursor-pointer text-sm font-medium">
                                        เลือกทั้งหมด <span className="font-normal tabular-nums text-zinc-500">({saved.length})</span>
                                    </label>
                                </div>
                            )}
                            {/* relative: ข้อความ sr-only (position:absolute) ต้องยึดกรอบเลื่อนนี้ ไม่หลุดออกไปดันความสูง/ความกว้างของหน้า */}
                            <ul className="relative max-h-[min(20rem,45dvh)] divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
                                {saved.map(item => {
                                    const current = item.expense_claim_id ? claims[item.expense_claim_id] : undefined
                                    const boxId = `${uid}-${item.id}`
                                    return (
                                        <li key={item.id} className="flex items-start gap-3 px-3 py-2">
                                            <Checkbox
                                                id={boxId}
                                                className="mt-0.5"
                                                checked={ticked.has(item.id)}
                                                onCheckedChange={v => toggle(item.id, v === true)}
                                            />
                                            <label htmlFor={boxId} className="min-w-0 flex-1 cursor-pointer text-sm">
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
                                                    {item.expense_claim_id && (
                                                        <span className="text-amber-700 tabular-nums dark:text-amber-400">
                                                            ผูกอยู่กับ {current?.claim_number || 'ใบเบิกอื่น'}
                                                        </span>
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
                                เบิกได้ครั้งละไม่เกิน {MAX_ITEMS_PER_LINK} รายการ — เอาเครื่องหมายออกอีก {chosen.length - MAX_ITEMS_PER_LINK} รายการ
                            </p>
                        ) : (
                            moving > 0 && (
                                <p className="text-xs text-amber-700 dark:text-amber-400">
                                    {moving} รายการที่เลือกผูกกับใบเบิกอื่นอยู่ — จะย้ายมาผูกกับใบใหม่แทน
                                </p>
                            )
                        )}
                    </div>
                )}

                <DialogFooter className="sm:justify-between">
                    {picking ? (
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                                setPicking(false)
                                setPickError(null)
                            }}
                        >
                            กลับไปเลือกรายการ
                        </Button>
                    ) : (
                        <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                            ยกเลิก
                        </Button>
                    )}
                    {!picking && (
                        <div className="flex flex-col-reverse gap-2 sm:flex-row">
                            <Button type="button" variant="secondary" disabled={!ready} onClick={() => setPicking(true)}>
                                <Link2 aria-hidden /> เชื่อมใบเบิกที่มีอยู่
                            </Button>
                            {ready ? (
                                <Button asChild>
                                    <Link href={newClaimHref} onClick={() => onOpenChange(false)}>
                                        <FilePlus2 aria-hidden /> สร้างใบเบิกใหม่ ({chosen.length} รายการ)
                                    </Link>
                                </Button>
                            ) : (
                                <Button type="button" disabled>
                                    <FilePlus2 aria-hidden /> สร้างใบเบิกใหม่
                                </Button>
                            )}
                        </div>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
