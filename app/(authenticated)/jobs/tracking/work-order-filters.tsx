'use client'

// แถบค้นหา + เรียงลำดับ ที่ใช้ร่วมกันทุกแท็บใบงาน (กราฟิก / จัดคน / จัดรถ / จัดกระเป๋า / หน้างาน)
// ไม่ import จาก pool-tabs / duty-tabs / tracking-view เพื่อไม่ให้เกิดวงจร import

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

export type WorkOrderSort = 'date' | 'claimer'

export const SEARCH_PLACEHOLDER = 'ค้นหา ลูกค้า / งาน / ผู้รับ...'

/** ไม่พบใบงานหลังกรอง — ข้อความเดียวกันทุกแท็บ */
export const NO_MATCH_TEXT = 'ไม่พบใบงานที่ตรงกับการค้นหา'

const SORT_OPTIONS: { value: WorkOrderSort; label: string }[] = [
    { value: 'date', label: 'วันงาน' },
    { value: 'claimer', label: 'ผู้รับ' },
]

/** ตรงกับคำค้นไหม — ไม่สนตัวพิมพ์เล็ก/ใหญ่, คำค้นว่าง = ตรงทุกใบ */
export function matchesQuery(query: string, fields: (string | null | undefined)[]): boolean {
    const q = query.trim().toLowerCase()
    if (!q) return true
    return fields.some(f => !!f && f.toLowerCase().includes(q))
}

/** เรียงตามผู้รับ: ยังไม่มีผู้รับมาก่อน แล้วเรียงชื่อผู้รับตามลำดับอักษรไทย */
export function compareClaimer(a: string | null, b: string | null): number {
    if (!a && !b) return 0
    if (!a) return -1
    if (!b) return 1
    return a.localeCompare(b, 'th')
}

/** แถบเครื่องมือของแท็บใบงาน — ชิป "ใบงานของฉัน" + ช่องค้นหา + ตัวเลือกการเรียง */
export function WorkOrderToolbar({
    query,
    onQueryChange,
    sort,
    onSortChange,
    mineOnly,
    onMineOnlyChange,
    mineCount,
    showMine,
}: {
    query: string
    onQueryChange: (v: string) => void
    sort: WorkOrderSort
    onSortChange: (v: WorkOrderSort) => void
    mineOnly: boolean
    onMineOnlyChange: (v: boolean) => void
    mineCount: number
    /** ไม่รู้ว่าใครล็อกอินอยู่ = ไม่ต้องมีชิป "ใบงานของฉัน" */
    showMine: boolean
}) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {showMine && (
                <button
                    type="button"
                    aria-pressed={mineOnly}
                    onClick={() => onMineOnlyChange(!mineOnly)}
                    className={cn(
                        'rounded-full px-3 py-1 text-sm',
                        mineOnly
                            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                            : 'border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    )}
                >
                    ใบงานของฉัน {mineCount} ใบ
                </button>
            )}
            <Input
                value={query}
                onChange={e => onQueryChange(e.target.value)}
                placeholder={SEARCH_PLACEHOLDER}
                aria-label={SEARCH_PLACEHOLDER}
                className="h-8 w-full sm:w-64"
            />
            <Select value={sort} onValueChange={v => onSortChange(v as WorkOrderSort)}>
                <SelectTrigger className="h-8 w-36" aria-label="เรียงตาม">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {SORT_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value}>เรียงตาม{o.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    )
}
