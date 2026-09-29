'use client'

// ตัวเลือกใบเบิก — ใช้ในหน้าต่างแก้รายการ (ผูกทีละรายการ) และหน้าต่าง "ผูกใบเบิกกับหลายรายการ"
// ค้น: เรียก searchPurchaseClaims ทันทีตอนเปิด (คำค้นว่าง = ใบล่าสุด) แล้วรอหยุดพิมพ์ 300ms ทุกครั้ง
// คำตอบที่มาถึงหลังคำค้นใหม่กว่าถูกทิ้ง (เลขลำดับคำขอ) — แบบเดียวกับช่องค้นงานใน create-list-dialog.tsx
// server ส่งมาเฉพาะใบที่ผู้ใช้ผูกได้ (แอดมิน = ทุกใบ · คนอื่น = ใบที่ตัวเองเป็นผู้เบิก) — ที่นี่ไม่กรองเพิ่ม

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ExternalLink, Loader2 } from 'lucide-react'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { formatThaiDate } from '@/lib/thai-date'
import { searchPurchaseClaims } from '../actions'
import { formatMoney, type PurchaseClaimOption } from '../purchasing-logic'

/** หน่วงค้นหลังหยุดพิมพ์ (ms) */
const SEARCH_DELAY = 300
const SEARCH_FAILED = 'ค้นหาใบเบิกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'

export interface ClaimPickerProps {
    /** แอดมินค้นได้ทุกใบ · คนอื่นเห็นเฉพาะใบเบิกของตัวเอง (ใช้บอกเหตุผลตอนไม่พบ) */
    isAdmin: boolean
    /** เลือกใบเบิกแล้ว */
    onPick: (claim: PurchaseClaimOption) => void
    /** ระหว่างบันทึก — กดเลือกใบอื่นซ้ำไม่ได้ */
    disabled?: boolean
}

export function ClaimPicker({ isAdmin, onPick, disabled }: ClaimPickerProps) {
    const [query, setQuery] = useState('')
    /** null = ยังไม่ได้คำตอบแรก */
    const [claims, setClaims] = useState<PurchaseClaimOption[] | null>(null)
    const [searching, setSearching] = useState(true)
    const [error, setError] = useState<string | null>(null)
    /** เลขลำดับคำขอค้นล่าสุด — คำตอบของคำขอที่เก่ากว่าถูกทิ้ง */
    const latestRequest = useRef(0)

    // ครั้งแรกตอนเปิด (คำค้นว่าง → ใบล่าสุด) เรียกทันที · หลังจากนั้นรอหยุดพิมพ์ 300ms ทุกครั้ง
    useEffect(() => {
        const delay = latestRequest.current === 0 ? 0 : SEARCH_DELAY
        const request = ++latestRequest.current
        const timer = setTimeout(
            async () => {
                setSearching(true)
                try {
                    const res = await searchPurchaseClaims(query)
                    if (request !== latestRequest.current) return // มีคำค้นใหม่กว่าแล้ว
                    if ('error' in res) {
                        setError(res.error)
                        setClaims([])
                    } else {
                        setError(null)
                        setClaims(res.claims)
                    }
                } catch (err) {
                    if (request !== latestRequest.current) return
                    console.error('[purchasing] search claims:', err)
                    setError(SEARCH_FAILED)
                    setClaims([])
                } finally {
                    if (request === latestRequest.current) setSearching(false)
                }
            },
            delay
        )
        return () => clearTimeout(timer)
    }, [query])

    const hasQuery = query.trim() !== ''

    return (
        <div className="space-y-2">
            <Command shouldFilter={false} label="ค้นหาใบเบิก" className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                <CommandInput
                    value={query}
                    onValueChange={setQuery}
                    placeholder="พิมพ์เลขที่หรือชื่อใบเบิก…"
                    aria-label="ค้นหาใบเบิกด้วยเลขที่หรือชื่อใบเบิก"
                    autoFocus
                />
                <CommandList className="max-h-[min(18rem,40dvh)]">
                    {error && (
                        <p role="alert" className="px-3 py-4 text-sm text-red-600 wrap-anywhere dark:text-red-400">
                            {error}
                        </p>
                    )}
                    {!error && claims !== null && claims.length === 0 && !searching && (
                        <div className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                            <p>{hasQuery ? 'ไม่พบใบเบิกที่ตรงกับคำค้น' : 'ยังไม่มีใบเบิกที่ผูกได้'}</p>
                            <p className="mt-1 text-xs">
                                {isAdmin
                                    ? 'ผูกได้เฉพาะใบเบิกงานอีเวนต์ ค่าอื่นๆ หรือทดลองจ่าย ที่ยังไม่ถูกปฏิเสธหรือยกเลิก'
                                    : 'ผูกได้เฉพาะใบเบิกที่คุณเป็นผู้เบิก — ใบเบิกของคนอื่นให้ผู้เบิกหรือแอดมินผูกให้'}
                            </p>
                        </div>
                    )}
                    {claims !== null && claims.length > 0 && (
                        <CommandGroup heading={hasQuery ? 'ผลการค้นหา' : isAdmin ? 'ใบเบิกล่าสุด' : 'ใบเบิกล่าสุดของคุณ'}>
                            {claims.map(claim => (
                                <CommandItem
                                    key={claim.id}
                                    value={claim.id}
                                    disabled={disabled}
                                    onSelect={() => onPick(claim)}
                                    className="flex min-h-11 flex-col items-stretch gap-0.5 py-2"
                                >
                                    <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                                        <span className="font-medium tabular-nums">{claim.claim_number}</span>
                                        <span className="tabular-nums">{formatMoney(claim.amount)} บาท</span>
                                    </span>
                                    <span className="text-zinc-700 wrap-anywhere dark:text-zinc-300">{claim.title || 'ไม่มีชื่อใบเบิก'}</span>
                                    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                                        <span>
                                            <span className="sr-only">สถานะ </span>
                                            {claim.status_label}
                                        </span>
                                        {claim.expense_date && (
                                            <span className="tabular-nums">
                                                <span className="sr-only">วันที่ </span>
                                                {formatThaiDate(claim.expense_date)}
                                            </span>
                                        )}
                                        {claim.submitter_name && <span className="wrap-anywhere">ผู้เบิก {claim.submitter_name}</span>}
                                        {claim.linked_items > 0 && (
                                            <span className="tabular-nums">ผูกอยู่ {claim.linked_items} รายการ</span>
                                        )}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    )}
                    {searching && (
                        <p className="flex items-center gap-2 px-3 py-3 text-xs text-zinc-500 dark:text-zinc-400">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                            กำลังค้นหา…
                        </p>
                    )}
                </CommandList>
            </Command>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
                ยังไม่มีใบเบิก?{' '}
                <Link
                    href="/finance/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded font-medium text-violet-700 underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-violet-500/60 dark:text-violet-300"
                >
                    สร้างใบเบิกใหม่
                    <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="sr-only">(เปิดแท็บใหม่)</span>
                </Link>
            </p>
        </div>
    )
}
