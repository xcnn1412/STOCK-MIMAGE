// ส่วน "รายการจัดซื้อที่ผูกกับใบเบิกนี้" ใต้หน้าใบเบิก (/finance/[id]) — แถวมาจาก getClaimPurchaseItems() ใน data.ts
// component ธรรมดา ไม่มี state/hook: วาดใน server component ของหน้าใบเบิก · ไม่มีแถว = ไม่ render อะไร
// หน้าตาชุดเดียวกับการ์ด "ประวัติการแก้ไข" ของหน้าใบเบิก · ชื่อเช็กลิสต์ลิงก์ไปหน้าจัดซื้อที่เปิดใบนั้น (?list=)
// ยอดไม่ตรง (ต่างเกิน 0.01 บาท) = บอกไว้เฉยๆ ไม่บล็อก — ต้นทุนของงานยังคิดจากใบเบิกทางเดียว

import Link from 'next/link'
import { ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    STATUS_LABELS,
    claimAmountOf,
    formatMoney,
    moneyDiffers,
    statusTone,
    type ClaimPurchaseItemRow,
} from '../purchasing-logic'

export interface ClaimLinkedItemsProps {
    /** รายการที่ผูกกับใบเบิกนี้ เรียงตามเช็กลิสต์แล้วตามลำดับในใบ */
    rows: ClaimPurchaseItemRow[]
    /** ใบเบิก — ใช้คิดยอดของใบแบบเดียวกับหน้าจัดซื้อ (ใบทดลองจ่ายที่คืนเงินแล้วใช้ยอดที่ใช้จริง) */
    claim: { claim_type: string | null; status: string | null; amount: number | null; actual_spent_amount: number | null }
}

export function ClaimLinkedItems({ rows, claim }: ClaimLinkedItemsProps) {
    if (rows.length === 0) return null
    const total = Math.round(rows.reduce((sum, r) => sum + (r.actual_price ?? 0), 0) * 100) / 100
    const amount = claimAmountOf(claim)

    return (
        <section
            aria-labelledby="claim-purchase-items-heading"
            className="relative mt-6 overflow-hidden rounded-2xl border border-zinc-200 bg-white print:hidden dark:border-zinc-800 dark:bg-zinc-900"
        >
            <div className="border-b border-zinc-200 px-4 py-4 sm:px-6 dark:border-zinc-800">
                <h3
                    id="claim-purchase-items-heading"
                    className="flex items-center gap-2 text-sm font-semibold text-zinc-700 dark:text-zinc-300"
                >
                    <ShoppingCart className="h-4 w-4 shrink-0" aria-hidden />
                    รายการจัดซื้อที่ผูกกับใบเบิกนี้ <span className="tabular-nums">({rows.length})</span>
                </h3>
            </div>

            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {rows.map(row => (
                    <li key={row.item_id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 px-4 py-3 sm:px-6">
                        <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-900 wrap-anywhere dark:text-zinc-100">
                                {row.title}
                                {row.quantity && (
                                    <span className="font-normal text-zinc-500 dark:text-zinc-400"> · {row.quantity}</span>
                                )}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                <span className="inline-flex items-center gap-1.5">
                                    <span className={cn('h-2 w-2 shrink-0 rounded-full', statusTone(row.status).dot)} aria-hidden />
                                    <span className="sr-only">สถานะ </span>
                                    {STATUS_LABELS[row.status]}
                                </span>
                                <Link
                                    href={`/jobs/purchasing?list=${row.list_id}`}
                                    className="min-w-0 rounded font-medium text-violet-700 underline-offset-2 outline-none wrap-anywhere hover:underline focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-violet-300"
                                >
                                    <span className="sr-only">เช็กลิสต์ </span>
                                    {row.list_title || 'เช็กลิสต์จัดซื้อ'}
                                </Link>
                            </p>
                        </div>
                        <p className="shrink-0 text-sm tabular-nums text-zinc-700 dark:text-zinc-300">
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">จ่ายจริง </span>
                            {row.actual_price != null ? (
                                `${formatMoney(row.actual_price)} บาท`
                            ) : (
                                <span className="text-amber-700 dark:text-amber-400">ยังไม่ใส่</span>
                            )}
                        </p>
                    </li>
                ))}
            </ul>

            <div className="space-y-1 border-t border-zinc-200 px-4 py-3 sm:px-6 dark:border-zinc-800">
                <p className="text-sm font-semibold tabular-nums text-zinc-800 dark:text-zinc-200">
                    รวมจ่ายจริง {formatMoney(total)} บาท
                </p>
                {moneyDiffers(amount, total) && (
                    <p className="text-xs tabular-nums text-amber-700 dark:text-amber-400">
                        ยอดใบเบิก {formatMoney(amount)} บาท ไม่ตรงกับยอดรวมของรายการ
                    </p>
                )}
            </div>
        </section>
    )
}
