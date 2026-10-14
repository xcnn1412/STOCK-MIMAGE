'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { BAR_CLASS, STRIPES, formatDate, ymd } from './timeline-view'
import {
    addDays,
    colorMapFor,
    dayLoad,
    layoutMonth,
    leadsOnDate,
    monthGrid,
    nextJobDate,
    parseDate,
    BAR_COLORS,
    MISSING_LABELS,
    type MissingItem,
    type TrackingLead,
} from './tracking-logic'

/** แถบงานที่โชว์ได้ต่อสัปดาห์ (จอกว้าง) — เกินนี้ไปอยู่ในปุ่ม +N ของวันนั้น */
const MAX_ROWS = 3
const WEEKDAYS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']

/** วันแรกของเดือนที่ห่างจากเดือนของ date ไป n เดือน (YYYY-MM-01) */
function shiftMonth(date: string, n: number): string {
    const d = parseDate(`${date.slice(0, 7)}-01`)
    return ymd(new Date(d.getFullYear(), d.getMonth() + n, 1))
}

const timeRange = (lead: TrackingLead) =>
    lead.event_time ? (lead.event_end_time ? `${lead.event_time}–${lead.event_end_time}` : lead.event_time) : 'ยังไม่ใส่เวลา'

/** ช่วงวันของงานแบบไทย — วันเดียวแสดงวันเดียว */
const dateRange = (lead: TrackingLead) =>
    lead.event_end_date && lead.event_end_date > (lead.event_date ?? '')
        ? `${formatDate(lead.event_date)} – ${formatDate(lead.event_end_date)}`
        : formatDate(lead.event_date)

/** สีพื้นช่องวันตามภาระงาน (เบาๆ) — 0 ไม่ใส่, 1–2 จาง, 3+ เข้มขึ้น */
function heatClass(total: number, weekend: boolean): string {
    if (total >= 3) return 'bg-sky-100/80 dark:bg-sky-900/30'
    if (total >= 1) return 'bg-sky-50 dark:bg-sky-950/30'
    return weekend ? 'bg-zinc-50 dark:bg-zinc-900/50' : ''
}

interface Handlers {
    missingOf: (lead: TrackingLead) => MissingItem[]
    onOpenDay: (date: string) => void
    onEditStaff: (leadId: string) => void
    onEditVehicle: (leadId: string) => void
}

/** ป๊อปโอเวอร์รายละเอียดงาน — ครอบชิปงาน (trigger) */
function LeadPopover({ lead, children, missingOf, onOpenDay, onEditStaff, onEditVehicle }: Handlers & {
    lead: TrackingLead
    children: ReactNode
}) {
    const missing = missingOf(lead)
    const names = [...new Map(lead.staff.map(s => [s.user_id, s.nickname || s.name])).values()]
    return (
        <Popover>
            <PopoverTrigger asChild>{children}</PopoverTrigger>
            <PopoverContent align="start" className="w-72 space-y-2 p-3 text-sm">
                <div>
                    <div className="font-semibold">{lead.customer_name || 'ไม่ระบุลูกค้า'}</div>
                    {lead.event_name && <div className="text-xs text-zinc-500">{lead.event_name}</div>}
                </div>
                <div className="text-xs">
                    {dateRange(lead)} · {timeRange(lead)}
                </div>
                <div className="text-xs">
                    <span className="text-zinc-500">ทีมงาน: </span>
                    {names.length > 0 ? names.join(', ') : <span className="text-zinc-400">ยังไม่มีคน</span>}
                </div>
                <div className="flex flex-wrap gap-1">
                    {missing.length === 0 ? (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                            พร้อมแล้ว
                        </span>
                    ) : (
                        missing.map(m => (
                            <span
                                key={m}
                                className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                            >
                                ขาด{MISSING_LABELS[m]}
                            </span>
                        ))
                    )}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant="outline" onClick={() => onEditStaff(lead.id)}>
                        จัดคน
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onEditVehicle(lead.id)}>
                        จัดรถ
                    </Button>
                    {lead.event_date && (
                        <Button size="sm" variant="ghost" onClick={() => onOpenDay(lead.event_date!)}>
                            เปิดไทม์ไลน์วันนี้
                        </Button>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    )
}

/** ชิปงานหนึ่งอัน (ใช้ทั้งแถบในตาราง, รายการ +N และรายการใต้ปฏิทินบนมือถือ) */
function LeadChip({ lead, colorIdx, continuesLeft, continuesRight, className, ...h }: Handlers & {
    lead: TrackingLead
    colorIdx: number
    continuesLeft?: boolean
    continuesRight?: boolean
    className?: string
}) {
    const missing = h.missingOf(lead)
    const name = lead.customer_name || 'ไม่ระบุลูกค้า'
    const label = lead.event_time && !continuesLeft ? `${lead.event_time} · ${name}` : name
    return (
        <LeadPopover lead={lead} {...h}>
            <button
                type="button"
                title={`${name} · ${dateRange(lead)} · ${timeRange(lead)}`}
                className={cn(
                    'relative flex h-[20px] w-full min-w-0 items-center gap-1 overflow-hidden rounded px-1.5 text-left text-[11px] leading-none',
                    BAR_CLASS[colorIdx % BAR_COLORS],
                    continuesLeft && 'rounded-l-none',
                    continuesRight && 'rounded-r-none',
                    className
                )}
            >
                {!lead.event_time && <span className={cn('pointer-events-none absolute inset-0', STRIPES)} />}
                <span className="relative min-w-0 flex-1 truncate">{label}</span>
                <span
                    title={missing.length === 0 ? 'พร้อมแล้ว' : `ยังขาด: ${missing.map(m => MISSING_LABELS[m]).join(', ')}`}
                    className={cn(
                        'relative h-1.5 w-1.5 shrink-0 rounded-full',
                        missing.length === 0 ? 'bg-emerald-500' : 'bg-amber-500'
                    )}
                />
            </button>
        </LeadPopover>
    )
}

export default function CalendarView({
    rows,
    today,
    date,
    missingOf,
    onDateChange,
    onOpenDay,
    onEditStaff,
    onEditVehicle,
    pastLoaded,
    onLoadPast,
}: {
    rows: TrackingLead[]
    today: Date
    date: string
    missingOf: (lead: TrackingLead) => MissingItem[]
    onDateChange: (date: string) => void
    /** เปิดไทม์ไลน์โหมดวันของวันที่นั้น */
    onOpenDay: (date: string) => void
    onEditStaff: (leadId: string) => void
    onEditVehicle: (leadId: string) => void
    pastLoaded: boolean
    onLoadPast: () => void
}) {
    const todayStr = ymd(today)
    const [onlyMissing, setOnlyMissing] = useState(false)
    /** วันที่เลือกบนมือถือ — ไม่ได้เลือก/อยู่นอกเดือนที่ดู = ใช้ date */
    const [picked, setPicked] = useState<string | null>(null)

    const grid = monthGrid(date)
    const allDays = grid.weeks.flat()
    // สีคิดจากงานทั้งหมด (ไม่ใช่หลังกรอง) — กดกรองแล้วสีของงานไม่เปลี่ยน
    const colorByLead = colorMapFor(allDays.map(d => leadsOnDate(rows, d)))
    const shown = onlyMissing ? rows.filter(l => missingOf(l).length > 0) : rows
    const weeks = layoutMonth(shown, grid, colorByLead)
    const byId = new Map(rows.map(l => [l.id, l]))
    const selected = picked && picked.startsWith(grid.month) ? picked : date

    const firstOfMonth = `${grid.month}-01`
    const lastOfMonth = addDays(shiftMonth(date, 1), -1)
    const next = nextJobDate(rows, lastOfMonth > todayStr ? lastOfMonth : todayStr)
    const monthTitle = parseDate(firstOfMonth).toLocaleDateString('th-TH', { month: 'long', year: 'numeric' })
    const showPastBanner = !pastLoaded && lastOfMonth < addDays(todayStr, -30)

    const h: Handlers = { missingOf, onOpenDay, onEditStaff, onEditVehicle }

    // ลูกศรซ้าย/ขวา = เปลี่ยนเดือน, t = วันนี้ — ไม่ทำงานตอนพิมพ์ในช่องกรอก
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
            const el = e.target as HTMLElement | null
            if (el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return
            if (e.key === 'ArrowLeft') onDateChange(shiftMonth(date, -1))
            else if (e.key === 'ArrowRight') onDateChange(shiftMonth(date, 1))
            else if (e.key === 't' || e.key === 'T') onDateChange(todayStr)
        }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [date, todayStr, onDateChange])

    const selectedLeads = leadsOnDate(shown, selected)

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onDateChange(shiftMonth(date, -1))}>
                    ← เดือนก่อน
                </Button>
                <span className="px-1 text-sm font-bold">{monthTitle}</span>
                <Button variant="outline" size="sm" onClick={() => onDateChange(shiftMonth(date, 1))}>
                    เดือนถัด →
                </Button>
                <Button variant="outline" size="sm" onClick={() => onDateChange(todayStr)}>
                    วันนี้
                </Button>
                <Button variant="outline" size="sm" disabled={!next} onClick={() => next && onDateChange(next)}>
                    งานถัดไป
                </Button>
                <Button
                    variant={onlyMissing ? 'default' : 'outline'}
                    size="sm"
                    aria-pressed={onlyMissing}
                    onClick={() => setOnlyMissing(v => !v)}
                    className="ml-auto"
                >
                    เฉพาะที่ยังขาด
                </Button>
            </div>

            {showPastBanner && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
                    <span>งานเก่ากว่า 30 วันยังไม่ได้โหลด</span>
                    <Button size="sm" variant="outline" onClick={onLoadPast}>
                        โหลดงานที่ผ่านแล้ว
                    </Button>
                </div>
            )}

            <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
                <div className="grid grid-cols-7 border-b border-zinc-200 bg-zinc-50 text-center text-xs font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
                    {WEEKDAYS.map((d, i) => (
                        <div key={d} className={cn('py-1.5', i >= 5 && 'text-rose-500/80')}>
                            {d}
                        </div>
                    ))}
                </div>

                {weeks.map(week => (
                    <div
                        key={week.days[0]}
                        className="relative grid grid-cols-7 border-b border-zinc-200 last:border-b-0 dark:border-zinc-800 md:grid-rows-[28px_repeat(3,22px)_24px]"
                    >
                        {week.days.map((day, col) => {
                            const inMonth = day.startsWith(grid.month)
                            const weekend = col >= 5
                            const load = dayLoad(rows, day, missingOf)
                            const dayLeads = leadsOnDate(shown, day)
                            const hidden = week.bars.filter(
                                b => b.row >= MAX_ROWS && b.startCol <= col && col < b.startCol + b.span
                            ).length
                            const isToday = day === todayStr
                            const num = parseDate(day).getDate()
                            return (
                                <div
                                    key={day}
                                    style={{ gridColumn: col + 1, gridRow: '1 / -1' }}
                                    className={cn(
                                        'min-w-0 border-r border-zinc-200 last:border-r-0 dark:border-zinc-800',
                                        heatClass(load.total, weekend),
                                        !inMonth && 'bg-zinc-50/60 dark:bg-zinc-950/60'
                                    )}
                                >
                                    {/* จอกว้าง: เลขวัน (เปิดไทม์ไลน์วัน) + ปุ่ม +N */}
                                    <div className="hidden h-full flex-col md:flex">
                                        <div className="flex justify-end p-1">
                                            <button
                                                type="button"
                                                title="เปิดไทม์ไลน์วันนี้"
                                                onClick={() => onOpenDay(day)}
                                                className={cn(
                                                    'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700',
                                                    isToday && 'bg-primary font-semibold text-primary-foreground hover:bg-primary/90 dark:hover:bg-primary/90',
                                                    !isToday && !inMonth && 'text-zinc-400 dark:text-zinc-600'
                                                )}
                                            >
                                                {num}
                                            </button>
                                        </div>
                                        {hidden > 0 && (
                                            <div className="mt-auto px-1 pb-0.5">
                                                <Popover>
                                                    <PopoverTrigger asChild>
                                                        <button
                                                            type="button"
                                                            className="w-full rounded px-1 text-left text-[11px] font-medium text-zinc-600 hover:bg-zinc-200 dark:text-zinc-300 dark:hover:bg-zinc-700"
                                                        >
                                                            +{hidden} งาน
                                                        </button>
                                                    </PopoverTrigger>
                                                    <PopoverContent align="start" className="w-64 space-y-1 p-2">
                                                        <div className="px-1 pb-1 text-xs font-semibold">{formatDate(day)}</div>
                                                        {dayLeads.map(l => (
                                                            <LeadChip key={l.id} lead={l} colorIdx={colorByLead[l.id] ?? 0} {...h} />
                                                        ))}
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        )}
                                    </div>

                                    {/* มือถือ: แตะทั้งช่อง = เลือกวัน · จุดสีงานสูงสุด 3 จุด */}
                                    <button
                                        type="button"
                                        onClick={() => setPicked(day)}
                                        aria-pressed={day === selected}
                                        className={cn(
                                            'flex h-14 w-full flex-col items-center gap-1 pt-1 md:hidden',
                                            day === selected && 'ring-2 ring-inset ring-zinc-900 dark:ring-zinc-100'
                                        )}
                                    >
                                        <span
                                            className={cn(
                                                'flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs',
                                                isToday && 'bg-primary font-semibold text-primary-foreground',
                                                !isToday && !inMonth && 'text-zinc-400 dark:text-zinc-600'
                                            )}
                                        >
                                            {num}
                                        </span>
                                        <span className="flex items-center gap-0.5">
                                            {dayLeads.slice(0, 3).map(l => (
                                                <span
                                                    key={l.id}
                                                    className={cn(
                                                        'h-1.5 w-1.5 rounded-full ring-1 ring-black/10 dark:ring-white/20',
                                                        BAR_CLASS[(colorByLead[l.id] ?? 0) % BAR_COLORS]
                                                    )}
                                                />
                                            ))}
                                            {dayLeads.length > 3 && (
                                                <span className="text-[9px] leading-none text-zinc-500">+{dayLeads.length - 3}</span>
                                            )}
                                        </span>
                                    </button>
                                </div>
                            )
                        })}

                        {/* แถบงาน (จอกว้าง) — วางทับช่องวันด้วย grid-column/grid-row */}
                        {week.bars
                            .filter(b => b.row < MAX_ROWS)
                            .map(b => {
                                const lead = byId.get(b.leadId)
                                if (!lead) return null
                                return (
                                    <div
                                        key={`${b.leadId}-${b.startCol}`}
                                        style={{ gridColumn: `${b.startCol + 1} / span ${b.span}`, gridRow: b.row + 2 }}
                                        className={cn(
                                            'z-10 hidden min-w-0 py-px md:block',
                                            b.continuesLeft ? 'pl-0' : 'pl-1',
                                            b.continuesRight ? 'pr-0' : 'pr-1'
                                        )}
                                    >
                                        <LeadChip
                                            lead={lead}
                                            colorIdx={b.colorIdx}
                                            continuesLeft={b.continuesLeft}
                                            continuesRight={b.continuesRight}
                                            {...h}
                                        />
                                    </div>
                                )
                            })}
                    </div>
                ))}
            </div>

            {/* มือถือ: รายการงานของวันที่เลือก */}
            <div className="space-y-1.5 md:hidden">
                <div className="text-sm font-semibold">
                    {formatDate(selected)}
                    <span className="font-normal text-zinc-500">
                        {' '}· {parseDate(selected).toLocaleDateString('th-TH', { weekday: 'long' })}
                    </span>
                </div>
                {selectedLeads.length === 0 ? (
                    <div className="text-sm text-zinc-500">ไม่มีงานในวันนี้</div>
                ) : (
                    selectedLeads.map(l => (
                        <LeadChip key={l.id} lead={l} colorIdx={colorByLead[l.id] ?? 0} className="h-8 text-xs" {...h} />
                    ))
                )}
                <Button size="sm" variant="outline" onClick={() => onOpenDay(selected)}>
                    เปิดไทม์ไลน์วันนี้
                </Button>
            </div>
        </div>
    )
}
