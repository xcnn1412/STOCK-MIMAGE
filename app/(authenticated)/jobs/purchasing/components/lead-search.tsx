'use client'

// ช่องค้นงานจาก CRM (ใช้ร่วมกันใน "สร้างเช็กลิสต์" และ "ผูกเช็กลิสต์กับการ์ด")
// เรียก searchPurchaseLeads หลังหยุดพิมพ์ 300ms · เปิดมา = เรียกทันทีด้วยคำค้นว่าง (เสนองานที่ตอบรับแล้ว)
// คำตอบที่มาถึงหลังคำค้นใหม่กว่าถูกทิ้ง (เลขลำดับคำขอ)

import { useEffect, useRef, useState } from 'react'
import { Calendar, Loader2, MapPin } from 'lucide-react'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { formatThaiDate } from '@/lib/thai-date'
import { searchPurchaseLeads } from '../actions'
import type { PurchaseLeadOption } from '../purchasing-logic'

/** หน่วงค้นหลังหยุดพิมพ์ (ms) */
const SEARCH_DELAY = 300

export function LeadMeta({ option }: { option: PurchaseLeadOption }) {
    return (
        <span className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {option.event_date && (
                <span className="inline-flex items-center gap-1 tabular-nums">
                    <Calendar className="h-3 w-3 shrink-0" aria-hidden />
                    {formatThaiDate(option.event_date)}
                </span>
            )}
            {option.event_location && (
                <span className="inline-flex min-w-0 items-start gap-1">
                    <MapPin className="mt-px h-3 w-3 shrink-0" aria-hidden />
                    <span className="wrap-anywhere">{option.event_location}</span>
                </span>
            )}
        </span>
    )
}

export function LeadSearch({ onSelect }: { onSelect: (option: PurchaseLeadOption) => void }) {
    const [query, setQuery] = useState('')
    /** null = ยังไม่ได้คำตอบแรก */
    const [leads, setLeads] = useState<PurchaseLeadOption[] | null>(null)
    const [searching, setSearching] = useState(true)
    const [searchError, setSearchError] = useState<string | null>(null)
    /** เลขลำดับคำขอค้นล่าสุด — คำตอบของคำขอที่เก่ากว่าถูกทิ้ง */
    const latestRequest = useRef(0)

    useEffect(() => {
        const delay = latestRequest.current === 0 ? 0 : SEARCH_DELAY
        const request = ++latestRequest.current
        const timer = setTimeout(async () => {
            setSearching(true)
            try {
                const res = await searchPurchaseLeads(query)
                if (request !== latestRequest.current) return // มีคำค้นใหม่กว่าแล้ว
                if ('error' in res) {
                    setSearchError(res.error)
                    setLeads([])
                } else {
                    setSearchError(null)
                    setLeads(res.leads)
                }
            } catch (err) {
                if (request !== latestRequest.current) return
                console.error('[purchasing] search leads:', err)
                setSearchError('ค้นหางานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง')
                setLeads([])
            } finally {
                if (request === latestRequest.current) setSearching(false)
            }
        }, delay)
        return () => clearTimeout(timer)
    }, [query])

    return (
        <Command shouldFilter={false} label="ค้นหางานจาก CRM" className="rounded-lg border border-zinc-200 dark:border-zinc-800">
            <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="พิมพ์ชื่อลูกค้า หรือสถานที่…"
                aria-label="ค้นหางานจาก CRM ด้วยชื่อลูกค้าหรือสถานที่"
                autoFocus
            />
            <CommandList className="max-h-[min(18rem,40dvh)]">
                {searchError && (
                    <p role="alert" className="px-3 py-4 text-sm text-red-600 dark:text-red-400">
                        {searchError}
                    </p>
                )}
                {!searchError && leads !== null && leads.length === 0 && !searching && (
                    <p className="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
                        {query.trim()
                            ? 'ไม่พบงานที่ตรงกับคำค้น — ลองพิมพ์ชื่อลูกค้าหรือสถานที่อื่น'
                            : 'ยังไม่มีงานที่ตอบรับแล้วในช่วงนี้ — พิมพ์ชื่อลูกค้าเพื่อค้นหา'}
                    </p>
                )}
                {leads !== null && leads.length > 0 && (
                    <CommandGroup heading={query.trim() ? 'ผลการค้นหา' : 'งานที่ตอบรับแล้ว เรียงตามวันงาน'}>
                        {leads.map(option => (
                            <CommandItem
                                key={option.id}
                                value={option.id}
                                onSelect={() => onSelect(option)}
                                className="flex min-h-11 items-start gap-2 py-2"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block text-sm font-medium wrap-anywhere">
                                        {option.customer_name || 'ไม่ระบุชื่อลูกค้า'}
                                    </span>
                                    <LeadMeta option={option} />
                                </span>
                                {option.list_id && (
                                    <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        มีเช็กลิสต์แล้ว
                                    </span>
                                )}
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
    )
}
