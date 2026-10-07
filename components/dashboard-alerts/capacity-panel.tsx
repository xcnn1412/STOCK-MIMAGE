// แผง "แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ" (dashboard-alerts) — รับแถวที่คิดเสร็จแล้ว (buildCapacityRows) ที่นี่แค่วาด
// ไม่มี hook → ใช้ได้ทั้งใน server component (/dashboard, /jobs/tracking) · ว่าง = ไม่ render อะไรเลย
// กดแถว → แถวของงานในตารางภาพรวม /jobs/tracking (?lead=) ซึ่งมีช่องแพ็กเกจให้แก้

import Link from 'next/link'
import { PackageX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { parseDate } from '@/app/(authenticated)/jobs/tracking/tracking-logic'
import { DashCard } from './dash-card'
import type { CapacityRow } from './capacity-warnings'

const formatDate = (d: string) => parseDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })

/** แถวสูงสุดที่แสดง — เกินกว่านี้บอกจำนวนที่เหลือ (ตารางภาพรวมมีป้ายบนทุกแถวอยู่แล้ว) */
const MAX_ROWS = 6

export default function CapacityPanel({ rows, className }: { rows: CapacityRow[]; className?: string }) {
    if (rows.length === 0) return null
    const anyRed = rows.some(r => r.level === 'red')
    const shown = rows.slice(0, MAX_ROWS)
    return (
        <div className={className}>
            <DashCard accent={anyRed ? 'red' : 'amber'}>
                <h2 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    <PackageX className={cn('h-4 w-4', anyRed ? 'text-red-500' : 'text-amber-500')} />
                    แพ็กเกจที่ขายแล้วแต่อุปกรณ์อาจไม่พอ
                    <span className="font-normal text-zinc-400 tabular-nums">({rows.length})</span>
                </h2>
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {shown.map(row => (
                        <li key={row.leadId}>
                            <Link
                                href={row.href}
                                className="block min-h-10 rounded-md px-1 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                            >
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                                    <span className="min-w-0 truncate text-sm font-medium text-zinc-800 dark:text-zinc-100">
                                        <span
                                            aria-hidden
                                            className={cn('mr-1.5 inline-block h-2 w-2 rounded-full align-middle', row.level === 'red' ? 'bg-red-500' : 'bg-amber-400')}
                                        />
                                        {row.customerName}
                                        {row.subtitle && <span className="font-normal text-zinc-500"> · {row.subtitle}</span>}
                                    </span>
                                    <span className="shrink-0 text-xs text-zinc-500">
                                        {formatDate(row.eventDate)} · {row.countdown}
                                    </span>
                                </div>
                                <ul className="mt-0.5 space-y-0.5 pl-3.5">
                                    {row.warnings.map((w, i) => (
                                        <li
                                            key={`${w.categoryId}:${w.unitId ?? ''}:${i}`}
                                            className={cn('text-xs', w.level === 'red' ? 'text-red-700 dark:text-red-400' : 'text-amber-700 dark:text-amber-400')}
                                        >
                                            {w.message}
                                        </li>
                                    ))}
                                </ul>
                            </Link>
                        </li>
                    ))}
                </ul>
                {rows.length > shown.length && (
                    <p className="mt-1 text-xs text-zinc-500">อีก {rows.length - shown.length} งาน — ดูป้ายบนแถวงานในหน้าติดตามงาน</p>
                )}
            </DashCard>
        </div>
    )
}
