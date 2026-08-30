'use client'

import { Fragment, useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import {
    layoutDay,
    layoutWeek,
    leadsOnDate,
    nextJobDate,
    addDays,
    parseDate,
    BAR_COLORS,
    type Bar,
    type BarTiming,
    type LaneKind,
    type Person,
    type TrackingLead,
} from './tracking-logic'

/** palette 10 สี — index มาจาก seam (colorIdx) งานเดียวกันได้สีเดียวกันทุกเลน */
const BAR_CLASS: string[] = [
    'bg-violet-200 text-violet-900 dark:bg-violet-900/50 dark:text-violet-100',
    'bg-sky-200 text-sky-900 dark:bg-sky-900/50 dark:text-sky-100',
    'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
    'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
    'bg-rose-200 text-rose-900 dark:bg-rose-900/50 dark:text-rose-100',
    'bg-teal-200 text-teal-900 dark:bg-teal-900/50 dark:text-teal-100',
    'bg-orange-200 text-orange-900 dark:bg-orange-900/50 dark:text-orange-100',
    'bg-fuchsia-200 text-fuchsia-900 dark:bg-fuchsia-900/50 dark:text-fuchsia-100',
    'bg-lime-200 text-lime-900 dark:bg-lime-900/50 dark:text-lime-100',
    'bg-indigo-200 text-indigo-900 dark:bg-indigo-900/50 dark:text-indigo-100',
]

const STRIPES =
    'bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(0,0,0,.10)_6px_12px)] dark:bg-[repeating-linear-gradient(45deg,transparent_0_6px,rgba(255,255,255,.14)_6px_12px)]'

const LANE_W = 160
const ROW_H = 36
const BAR_H = 28

const TIMING_SUFFIX: Partial<Record<BarTiming, string>> = {
    no_time: ' · ยังไม่ใส่เวลา',
    no_end: ' · ไม่ทราบเวลาสิ้นสุด',
    multi_day: ' · หลายวัน',
}

const pad2 = (n: number) => String(n).padStart(2, '0')
const clock = (min: number) => `${pad2(Math.floor(min / 60))}:${pad2(min % 60)}`
/** px จากนาที — เป็นการ map ตำแหน่งอย่างเดียว ตรรกะเวลาอยู่ใน seam */
const hoursFrom = (min: number, hourStart: number) => (min - hourStart * 60) / 60
const at = (min: number, hourStart: number) => `calc(var(--hour) * ${hoursFrom(min, hourStart)})`

/** วันที่แบบไทยจาก YYYY-MM-DD — parseDate กัน new Date('YYYY-MM-DD') ที่อ่านเป็น UTC */
export const formatDate = (d: string | null) =>
    d ? parseDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '–'

const weekdayOf = (d: string) => parseDate(d).toLocaleDateString('th-TH', { weekday: 'long' })
const weekdayShort = (d: string) => parseDate(d).toLocaleDateString('th-TH', { weekday: 'short' })
const dayMonth = (d: string) => parseDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'numeric' })

export const ymd = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`

const subscribeNever = () => () => {}
/** เวลาปัจจุบันเป็นนาที (primitive → snapshot นิ่งตราบที่นาทีไม่เปลี่ยน) */
// ponytail: no interval; now-line refreshes on re-render only
const getNowMin = () => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
}
const getNowMinServer = (): number | null => null

/** จอกว้าง ≥ md — โหมดสัปดาห์ใช้ได้เฉพาะจอกว้าง (บนมือถือบังคับเป็นโหมดวัน) */
const WIDE_QUERY = '(min-width: 768px)'
const subscribeWide = (onChange: () => void) => {
    const mql = window.matchMedia(WIDE_QUERY)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
}
const useIsWide = () =>
    useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => true)

function JobBar({ bar, hourStart, onClick }: { bar: Bar; hourStart: number; onClick: () => void }) {
    const suffix = TIMING_SUFFIX[bar.timing] ?? ''
    const title = `${bar.label} ${clock(bar.startMin)}–${clock(bar.endMin)}${suffix}`

    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            style={{
                left: at(bar.startMin, hourStart),
                width: `calc(var(--hour) * ${(bar.endMin - bar.startMin) / 60})`,
                top: 4 + bar.layer * ROW_H,
                height: BAR_H,
            }}
            className={cn(
                'absolute overflow-hidden rounded-md px-2 text-xs truncate flex items-center gap-1 text-left',
                BAR_CLASS[bar.colorIdx % BAR_COLORS],
                bar.conflict && 'ring-2 ring-rose-500',
                bar.unassigned && 'border-2 border-dashed border-zinc-400'
            )}
        >
            {(bar.timing === 'no_time' || bar.timing === 'multi_day') && (
                <span className={cn('pointer-events-none absolute inset-0', STRIPES)} />
            )}
            {bar.timing === 'no_end' && (
                <span className={cn('pointer-events-none absolute inset-y-0 right-0 w-[40%]', STRIPES)} />
            )}
            <span className="relative truncate">
                {bar.label}
                {suffix}
            </span>
            {bar.role && <span className="relative truncate opacity-70">· {bar.role}</span>}
        </button>
    )
}

function GroupHeader({ title, className }: { title: string; className?: string }) {
    return (
        <div className={cn('border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60', className)}>
            <span className="sticky left-0 inline-block px-3 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                {title}
            </span>
        </div>
    )
}

/** หัวข้อกลุ่มที่ต้องแทรกก่อนเลนนี้ (รถ / ชื่อแผนกใหม่) — null = ไม่ต้องแทรก */
function groupTitle(lanes: { kind: LaneKind; sublabel?: string }[], i: number): string | null {
    const lane = lanes[i]
    const prev = i > 0 ? lanes[i - 1] : null
    if (lane.kind === 'vehicle') return prev?.kind === 'vehicle' ? null : 'รถ'
    if (lane.kind === 'person') return prev?.kind === 'person' && prev.sublabel === lane.sublabel ? null : (lane.sublabel ?? null)
    return null
}

export default function TimelineView({
    rows,
    people,
    roleLabels,
    today,
    date,
    mode,
    onDateChange,
    onModeChange,
    onOpenDay,
    onEditStaff,
    onEditVehicle,
}: {
    rows: TrackingLead[]
    people: Person[]
    roleLabels: Record<string, string>
    today: Date
    date: string
    mode: 'day' | 'week'
    onDateChange: (date: string) => void
    onModeChange: (mode: 'day' | 'week') => void
    /** คลิกหัวคอลัมน์วันในโหมดสัปดาห์ → สลับเป็นโหมดวันของวันนั้นในครั้งเดียว */
    onOpenDay: (date: string) => void
    onEditStaff: (leadId: string) => void
    onEditVehicle: (leadId: string) => void
}) {
    const [hideFree, setHideFree] = useState(false)
    // เส้นเวลาปัจจุบัน: ฝั่ง server เป็น null (กัน hydration mismatch)
    const nowMin = useSyncExternalStore(subscribeNever, getNowMin, getNowMinServer)
    const isWide = useIsWide()

    const todayStr = ymd(today)
    const isWeek = mode === 'week' && isWide
    // ponytail: cheap; memo if lanes > ~200
    const layout = layoutDay(rows, date, people, roleLabels, { hideFree })
    const { hourStart, hourEnd, lanes } = layout
    const week = isWeek ? layoutWeek(rows, date, people, roleLabels, { hideFree }) : null
    const hours = hourEnd - hourStart
    const hourList = Array.from({ length: hours }, (_, i) => hourStart + i)
    const next = nextJobDate(rows, date)
    const empty = week
        ? week.days.every(d => leadsOnDate(rows, d).length === 0)
        : leadsOnDate(rows, date).length === 0
    const showNow = nowMin !== null && date === todayStr && nowMin >= hourStart * 60 && nowMin <= hourEnd * 60

    const trackStyle = {
        width: `calc(var(--hour) * ${hours})`,
        backgroundImage: 'repeating-linear-gradient(to right, var(--line) 0 1px, transparent 1px var(--hour))',
    }

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => onDateChange(addDays(date, isWeek ? -7 : -1))}>
                    {isWeek ? '← สัปดาห์ก่อน' : '← วันก่อน'}
                </Button>
                <span className="px-1 text-sm">
                    {week ? (
                        <span className="font-bold">
                            {formatDate(week.days[0])} – {formatDate(week.days[6])}
                        </span>
                    ) : (
                        <>
                            <span className="font-bold">{formatDate(date)}</span>
                            <span className="text-zinc-500"> · {weekdayOf(date)}</span>
                        </>
                    )}
                </span>
                <Button variant="outline" size="sm" onClick={() => onDateChange(todayStr)}>
                    วันนี้
                </Button>
                <Button variant="outline" size="sm" onClick={() => onDateChange(addDays(date, isWeek ? 7 : 1))}>
                    {isWeek ? 'สัปดาห์ถัด →' : 'วันถัด →'}
                </Button>
                <Button variant="outline" size="sm" disabled={!next} onClick={() => next && onDateChange(next)}>
                    งานถัดไป
                </Button>

                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={hideFree} onCheckedChange={v => setHideFree(v === true)} />
                    ซ่อนคนว่าง
                </label>

                <div className="ml-auto hidden md:flex items-center gap-1">
                    <Button variant={mode === 'day' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('day')}>
                        วัน
                    </Button>
                    <Button variant={mode === 'week' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('week')}>
                        สัปดาห์
                    </Button>
                </div>
            </div>

            {empty && (
                <p className="text-center text-sm text-zinc-500">{isWeek ? 'ไม่มีงานในสัปดาห์นี้' : 'ไม่มีงานวันนี้'}</p>
            )}

            {week && (
                <div className="overflow-auto max-h-[75vh] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                    <div className="grid min-w-[1000px] grid-cols-[160px_repeat(7,minmax(120px,1fr))]">
                        <div className="sticky left-0 top-0 z-30 border-r border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950" />
                        {week.days.map(day => (
                            <button
                                key={day}
                                type="button"
                                title={`ดูไทม์ไลน์วัน${weekdayOf(day)} ${formatDate(day)}`}
                                onClick={() => onOpenDay(day)}
                                className={cn(
                                    'sticky top-0 z-20 border-b border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-2 py-1 text-left text-[11px] text-zinc-500',
                                    day === todayStr && 'bg-violet-50 dark:bg-violet-950/30'
                                )}
                            >
                                <span className="font-medium text-zinc-700 dark:text-zinc-300">{weekdayShort(day)}</span>{' '}
                                {dayMonth(day)}
                            </button>
                        ))}

                        {week.lanes.map((lane, i) => {
                            const title = groupTitle(week.lanes, i)
                            const free = week.days.every(d => lane.cells[d].length === 0)
                            return (
                                <Fragment key={`w-${lane.kind}-${lane.key}`}>
                                    {title && <GroupHeader title={title} className="col-span-8" />}
                                    <div className="sticky left-0 z-10 border-r border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2">
                                        <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{lane.label}</div>
                                        {lane.sublabel && <div className="truncate text-[10px] text-zinc-400">{lane.sublabel}</div>}
                                    </div>
                                    {week.days.map((day, di) => (
                                        <div
                                            key={day}
                                            className="min-h-12 border-l border-t border-zinc-100 dark:border-zinc-900 p-1 space-y-1"
                                        >
                                            {lane.kind === 'person' && free && di === 0 && (
                                                <span className="text-[11px] text-zinc-400">ว่าง</span>
                                            )}
                                            {lane.cells[day].map((cell, ci) => (
                                                <button
                                                    key={`${cell.leadId}-${cell.role ?? ''}-${ci}`}
                                                    type="button"
                                                    title={cell.role ? `${cell.label} · ${cell.role}` : cell.label}
                                                    onClick={() =>
                                                        lane.kind === 'vehicle' ? onEditVehicle(cell.leadId) : onEditStaff(cell.leadId)
                                                    }
                                                    className={cn(
                                                        'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]',
                                                        BAR_CLASS[cell.colorIdx % BAR_COLORS],
                                                        cell.conflict && 'ring-1 ring-rose-500',
                                                        lane.kind === 'jobs' &&
                                                            cell.unassigned &&
                                                            'border border-dashed border-zinc-400'
                                                    )}
                                                >
                                                    {cell.label}
                                                    {cell.role && <span className="opacity-70"> · {cell.role}</span>}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                </Fragment>
                            )
                        })}
                    </div>
                </div>
            )}

            {!isWeek && (
            <div className="overflow-auto max-h-[75vh] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 [--hour:48px] md:[--hour:64px] [--line:#e4e4e7] dark:[--line:#27272a]">
                <div style={{ minWidth: `calc(${LANE_W}px + var(--hour) * ${hours})` }}>
                    <div className="sticky top-0 z-20 flex border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                        <div
                            className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950"
                            style={{ width: LANE_W }}
                        />
                        {hourList.map(h => (
                            <div
                                key={h}
                                style={{ width: 'var(--hour)' }}
                                className="shrink-0 border-l border-zinc-100 dark:border-zinc-900 px-1 py-1 text-[11px] text-zinc-500"
                            >
                                {pad2(h)}:00
                            </div>
                        ))}
                    </div>

                    {lanes.map((lane, i) => {
                        const title = groupTitle(lanes, i)
                        return (
                            <Fragment key={`${lane.kind}-${lane.key}`}>
                                {title && <GroupHeader title={title} />}
                                <div className="flex border-t border-zinc-100 dark:border-zinc-900">
                                    <div
                                        className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2"
                                        style={{ width: LANE_W }}
                                    >
                                        <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">{lane.label}</div>
                                        {lane.sublabel && <div className="truncate text-[10px] text-zinc-400">{lane.sublabel}</div>}
                                    </div>
                                    <div
                                        className="relative shrink-0"
                                        style={{ ...trackStyle, height: lane.layers * ROW_H + 8 }}
                                    >
                                        {lane.kind === 'person' && lane.bars.length === 0 && (
                                            <span className="absolute left-2 top-2 text-[11px] text-zinc-400">ว่าง</span>
                                        )}
                                        {showNow && (
                                            <span
                                                className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-500"
                                                style={{ left: at(nowMin!, hourStart) }}
                                            />
                                        )}
                                        {lane.bars.map((bar, bi) => (
                                            <JobBar
                                                key={`${bar.leadId}-${bar.role ?? ''}-${bi}`}
                                                bar={bar}
                                                hourStart={hourStart}
                                                onClick={() =>
                                                    lane.kind === 'vehicle' ? onEditVehicle(bar.leadId) : onEditStaff(bar.leadId)
                                                }
                                            />
                                        ))}
                                    </div>
                                </div>
                            </Fragment>
                        )
                    })}
                </div>
            </div>
            )}
        </div>
    )
}
