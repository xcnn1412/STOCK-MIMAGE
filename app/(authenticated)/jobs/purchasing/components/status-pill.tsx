'use client'

// ปุ่มสถานะของรายการ — กดที่ป้าย = เลื่อนขั้นถัดไป (กดครั้งเดียวจบ ใช้หน้าร้านบนมือถือได้)
// ลูกศรข้างป้าย = เลือกขั้นไหนก็ได้รวมถึงถอยกลับ · เสร็จสิ้นแล้วป้ายไม่ใช่ปุ่ม (ไม่มีขั้นถัดไป) แต่ยังเปลี่ยนผ่านลูกศรได้

import { Check, ChevronDown } from 'lucide-react'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuLabel,
    DropdownMenuRadioGroup,
    DropdownMenuRadioItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
    PURCHASE_STATUSES,
    STATUS_LABELS,
    isPurchaseStatus,
    nextStatus,
    statusTone,
    type PurchaseStatus,
} from '../purchasing-logic'

export function StatusPill({
    status,
    onChange,
}: {
    status: PurchaseStatus
    onChange: (status: PurchaseStatus) => void
}) {
    const next = nextStatus(status)
    const tone = statusTone(status)
    return (
        // สูง 36px (h-9) — เป้ากดบนมือถือ · ring แบบ inset เพราะกรอบตัดขอบ (overflow-hidden)
        <span className={cn('inline-flex h-9 shrink-0 items-stretch overflow-hidden rounded-full border text-xs font-medium', tone.pill)}>
            {next ? (
                <button
                    type="button"
                    onClick={() => onChange(next)}
                    title={`กดเพื่อเลื่อนเป็น "${STATUS_LABELS[next]}"`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap pl-3 pr-2 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:hover:bg-white/10"
                >
                    <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', tone.dot)} aria-hidden />
                    {STATUS_LABELS[status]}
                    <span className="sr-only"> — กดเพื่อเลื่อนเป็น {STATUS_LABELS[next]}</span>
                </button>
            ) : (
                <span className="inline-flex items-center gap-1 whitespace-nowrap pl-3 pr-2">
                    <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    {STATUS_LABELS[status]}
                </span>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <button
                        type="button"
                        aria-label="เปลี่ยนสถานะ"
                        title="เลือกสถานะ"
                        className="inline-flex w-7 items-center justify-center border-l border-black/10 outline-none transition-colors hover:bg-black/5 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-violet-500 dark:border-white/15 dark:hover:bg-white/10"
                    >
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                    </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-44">
                    <DropdownMenuLabel className="text-xs font-normal text-zinc-500">เปลี่ยนสถานะเป็น</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                        value={status}
                        onValueChange={v => {
                            if (isPurchaseStatus(v) && v !== status) onChange(v)
                        }}
                    >
                        {PURCHASE_STATUSES.map(s => (
                            <DropdownMenuRadioItem key={s} value={s} className="min-h-9">
                                <span className={cn('h-2 w-2 shrink-0 rounded-full', statusTone(s).dot)} aria-hidden />
                                {STATUS_LABELS[s]}
                                {s === status && <span className="ml-auto pl-3 text-[11px] text-zinc-400">ตอนนี้</span>}
                            </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                </DropdownMenuContent>
            </DropdownMenu>
        </span>
    )
}
