'use client'

import { Fragment, useMemo, useState, useSyncExternalStore, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { RequiredRolesEditor, type StaffRoleOption } from './required-roles-editor'
import {
    departmentSummary,
    focusCandidates,
    focusWindow,
    hasRequiredRoles,
    layoutDay,
    layoutWeek,
    leadsOnDate,
    missingRoles,
    nextJobDate,
    staffedCounts,
    workloadOf,
    workloadTone,
    addDays,
    parseDate,
    AVAILABILITY_LABELS,
    BAR_COLORS,
    DEPARTMENT_ORDER,
    NO_DEPARTMENT_LABEL,
    type Availability,
    type Bar,
    type BarTiming,
    type Candidate,
    type Kit,
    type KitBookingDetail,
    type Lane,
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

/** เลนกระเป๋าไม่ใช้สีของงาน — สีบอกสถานะจัดกระเป๋าแทน (เหลือง = ยังไม่จัด, เขียว = จัดครบ) */
const KIT_BAR_CLASS = {
    packed: 'bg-emerald-200 text-emerald-900 dark:bg-emerald-900/50 dark:text-emerald-100',
    unpacked: 'bg-amber-200 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100',
}

/** class ของแถบ/บล็อกหนึ่งอัน — แถบกระเป๋า (packed มีค่า) ใช้สีสถานะ ที่เหลือใช้สีของงาน */
const barClass = (item: { colorIdx: number; packed?: boolean }) =>
    item.packed === undefined
        ? BAR_CLASS[item.colorIdx % BAR_COLORS]
        : item.packed
          ? KIT_BAR_CLASS.packed
          : KIT_BAR_CLASS.unpacked

const packedLabel = (packed: boolean) => (packed ? 'จัดครบ' : 'ยังไม่จัด')

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
    const packed = bar.packed === undefined ? '' : ` · ${packedLabel(bar.packed)}`
    const title = `${bar.label} ${clock(bar.startMin)}–${clock(bar.endMin)}${suffix}${packed}`

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
                barClass(bar),
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
            {bar.packed !== undefined && (
                <span className="relative truncate opacity-70">· {packedLabel(bar.packed)}</span>
            )}
        </button>
    )
}

/** ป้ายภาระงานข้างชื่อคน — 0 งานไม่แสดง */
const WORKLOAD_CLASS: Record<'low' | 'mid' | 'high', string> = {
    low: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
    mid: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
    high: 'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
}

function WorkloadBadge({ n }: { n: number }) {
    const tone = workloadTone(n)
    if (tone === 'none') return null
    return (
        <span title={`${n} งานใน 7 วัน`} className={cn('ml-1 rounded px-1 text-[10px]', WORKLOAD_CLASS[tone])}>
            {n} งาน
        </span>
    )
}

/** สีตัวอักษรของสถานะความว่าง — ใช้ร่วมกับตาราง (tracking-view) */
export const AVAIL_TEXT: Record<Availability, string> = {
    free: 'text-emerald-600 dark:text-emerald-400',
    queued: 'text-amber-600 dark:text-amber-400',
    unknown: 'text-zinc-500 dark:text-zinc-400',
    conflict: 'text-rose-600 dark:text-rose-400',
}

/** ป้ายความว่างของ "ตัวเลือก" หนึ่งคน — title = งานที่ชน/ต่อคิว */
function AvailabilityTag({ candidate }: { candidate: Candidate }) {
    const detail = candidate.clash ? `${candidate.clash.withLabel} ${candidate.clash.withTime}`.trim() : ''
    return (
        <span
            className={cn('text-[10px] font-medium whitespace-nowrap', AVAIL_TEXT[candidate.availability])}
            title={detail || undefined}
        >
            {AVAILABILITY_LABELS[candidate.availability]}
        </span>
    )
}

/** `ช่างกล้อง 1, ผู้ช่วย 1` — ตำแหน่งที่งานนี้มีคนแล้ว (นับคนไม่ซ้ำต่อตำแหน่ง ตามลำดับที่เจอ) */
function staffedRoles(lead: TrackingLead, roleLabels: Record<string, string>): string {
    return Object.entries(staffedCounts(lead))
        .map(([role, n]) => `${roleLabels[role] || role} ${n}`)
        .join(', ')
}

/** หัวโฟกัสงาน — ลูกค้า · เวลา · มีแล้ว/ขาด · แก้ตำแหน่งที่ต้องการ · เลือกอีเวนต์ · ออก */
function FocusHeader({ lead, roles, roleLabels, eventId, onEventChange, onRequiredRolesChange, onExit }: {
    lead: TrackingLead
    roles: StaffRoleOption[]
    roleLabels: Record<string, string>
    /** อีเวนต์เป้าหมายที่จะจัดคนเข้า — null = ยังไม่มีอีเวนต์ (จะสร้างให้) */
    eventId: string | null
    onEventChange: (eventId: string) => void
    onRequiredRolesChange: (required: Record<string, number>) => void
    onExit: () => void
}) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState<Record<string, number>>(lead.required_roles)

    const gaps = missingRoles(lead)
    const have = staffedRoles(lead, roleLabels)
    const timeText = lead.event_time
        ? `${lead.event_time}${lead.event_end_time ? `–${lead.event_end_time}` : ''}`
        : 'ยังไม่ใส่เวลา'

    // ปิด popover = บันทึก (ปุ่ม "บันทึก" แค่ปิด)
    const openChange = (next: boolean) => {
        if (next) setDraft(lead.required_roles)
        else if (JSON.stringify(draft) !== JSON.stringify(lead.required_roles)) onRequiredRolesChange(draft)
        setOpen(next)
    }

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm dark:border-violet-900 dark:bg-violet-950/30">
            <span className="font-semibold text-zinc-900 dark:text-zinc-100">{lead.customer_name || 'ไม่ระบุลูกค้า'}</span>
            <span className="text-zinc-500">· {timeText}</span>
            <span className="text-zinc-600 dark:text-zinc-300">· มีแล้ว: {have || 'ยังไม่จัดคน'}</span>
            {gaps.length > 0 ? (
                <span className="font-medium text-amber-600 dark:text-amber-400">
                    · ขาด: {gaps.map(g => `${roleLabels[g.role] || g.role} ${g.need - g.have}`).join(', ')}
                </span>
            ) : (
                !hasRequiredRoles(lead) && <span className="text-zinc-400">· ยังไม่กำหนดตำแหน่งที่ต้องการ</span>
            )}

            <Popover open={open} onOpenChange={openChange}>
                <PopoverTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="แก้ตำแหน่งที่ต้องการ">
                        <Pencil className="h-3.5 w-3.5" />
                    </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 space-y-2 p-3">
                    <div className="text-xs font-medium text-zinc-500">ตำแหน่งที่ต้องการ</div>
                    <RequiredRolesEditor value={draft} roles={roles} onChange={setDraft} />
                    <Button size="sm" className="w-full" onClick={() => openChange(false)}>บันทึก</Button>
                </PopoverContent>
            </Popover>

            {lead.events.length > 1 && (
                <Select value={eventId ?? undefined} onValueChange={onEventChange}>
                    <SelectTrigger className="h-7 w-48 text-xs" aria-label="จัดเข้าอีเวนต์">
                        <SelectValue placeholder="จัดเข้าอีเวนต์" />
                    </SelectTrigger>
                    <SelectContent>
                        {lead.events.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.name || 'ไม่ระบุชื่อ'} · {formatDate(e.event_date)}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}

            <Button variant="outline" size="sm" className="ml-auto" onClick={onExit}>ออกจากโฟกัส</Button>
        </div>
    )
}

/** เลนหนึ่งแถวของโหมดวัน — ป้ายซ้าย + แทร็ก (แถบเวลาโฟกัส, เส้นเวลาปัจจุบัน, แถบงาน) */
function DayLane({ lane, hourStart, trackStyle, now, labelExtra, sublabelExtra, band, dim, onBarClick, onTrackClick, children }: {
    lane: Lane
    hourStart: number
    trackStyle: CSSProperties
    /** นาทีของเส้นเวลาปัจจุบัน — null = ไม่วาด */
    now: number | null
    labelExtra?: ReactNode
    sublabelExtra?: ReactNode
    band?: { startMin: number; endMin: number; striped: boolean } | null
    dim?: boolean
    onBarClick: (bar: Bar) => void
    /** คลิกพื้นที่ว่างของแทร็ก (ไม่ใช่แถบ) — มีค่า = เลนนี้กดจัดคนได้ */
    onTrackClick?: (e: MouseEvent<HTMLDivElement>) => void
    children?: ReactNode
}) {
    return (
        <div className={cn('flex border-t border-zinc-100 dark:border-zinc-900', dim && 'opacity-60')}>
            <div
                className="sticky left-0 z-10 shrink-0 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2"
                style={{ width: LANE_W }}
            >
                <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                    {lane.label}
                    {labelExtra}
                </div>
                {(lane.sublabel || sublabelExtra) && (
                    <div className="flex items-center gap-1 truncate text-[10px] text-zinc-400">
                        {lane.sublabel}
                        {sublabelExtra}
                    </div>
                )}
            </div>
            <div
                className={cn('relative shrink-0', onTrackClick && 'cursor-copy')}
                style={{ ...trackStyle, height: lane.layers * ROW_H + 8 }}
                onClick={onTrackClick}
            >
                {lane.kind === 'person' && lane.bars.length === 0 && (
                    <span className="pointer-events-none absolute left-2 top-2 text-[11px] text-zinc-400">ว่าง</span>
                )}
                {band && (
                    <span
                        className="pointer-events-none absolute inset-y-0 border-x border-violet-400 bg-violet-500/10"
                        style={{
                            left: at(band.startMin, hourStart),
                            width: `calc(var(--hour) * ${(band.endMin - band.startMin) / 60})`,
                        }}
                    >
                        {band.striped && <span className={cn('absolute inset-0', STRIPES)} />}
                    </span>
                )}
                {now !== null && (
                    <span
                        className="pointer-events-none absolute top-0 bottom-0 w-px bg-rose-500"
                        style={{ left: at(now, hourStart) }}
                    />
                )}
                {lane.bars.map((bar, bi) => (
                    <JobBar
                        key={`${bar.leadId}-${bar.role ?? ''}-${bi}`}
                        bar={bar}
                        hourStart={hourStart}
                        onClick={() => onBarClick(bar)}
                    />
                ))}
                {children}
            </div>
        </div>
    )
}

/** หัวกลุ่ม — กลุ่มแผนกส่ง onToggle มาด้วยจึงกดยุบ/ขยายได้ (กลุ่มรถและเลนงานยุบไม่ได้) */
function GroupHeader({
    title,
    className,
    onToggle,
    collapsed,
}: {
    title: string
    className?: string
    onToggle?: () => void
    collapsed?: boolean
}) {
    const box = cn('border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60', className)
    const label = (
        <span className="sticky left-0 inline-block px-3 py-1 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            {onToggle && <span className="mr-1">{collapsed ? '▸' : '▾'}</span>}
            {title}
        </span>
    )
    if (!onToggle) return <div className={box}>{label}</div>
    return (
        <button
            type="button"
            onClick={onToggle}
            aria-expanded={!collapsed}
            className={cn(box, 'block w-full text-left hover:bg-zinc-100 dark:hover:bg-zinc-800')}
        >
            {label}
        </button>
    )
}

/** ลำดับแผนกในชิป — ตาม DEPARTMENT_ORDER แล้วแผนกที่ไม่รู้จัก/ไม่ระบุท้ายสุด */
const deptRank = (d: string) => {
    const i = DEPARTMENT_ORDER.indexOf(d)
    return i === -1 ? DEPARTMENT_ORDER.length : i
}

const chipClass = (active: boolean) =>
    cn(
        'rounded-full px-3 py-1 text-xs',
        active
            ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
            : 'border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
    )

/** หัวข้อกลุ่มที่ต้องแทรกก่อนเลนนี้ (รถ / กระเป๋า / ชื่อแผนกใหม่) — null = ไม่ต้องแทรก */
function groupTitle(lanes: { kind: LaneKind; sublabel?: string }[], i: number): string | null {
    const lane = lanes[i]
    const prev = i > 0 ? lanes[i - 1] : null
    if (lane.kind === 'vehicle') return prev?.kind === 'vehicle' ? null : 'รถ'
    if (lane.kind === 'kit') return prev?.kind === 'kit' ? null : 'กระเป๋า'
    if (lane.kind === 'person') return prev?.kind === 'person' && prev.sublabel === lane.sublabel ? null : (lane.sublabel ?? null)
    return null
}

export default function TimelineView({
    rows,
    people,
    roles,
    roleLabels,
    today,
    date,
    mode,
    departments,
    kits = [],
    kitBookings = [],
    focusLeadId,
    focusEventId,
    onDateChange,
    onModeChange,
    onDepartmentsChange,
    onOpenDay,
    onEditStaff,
    onEditVehicle,
    onFocus,
    onFocusEventChange,
    onRequiredRolesChange,
    onQuickAssign,
    onQuickRemove,
}: {
    rows: TrackingLead[]
    people: Person[]
    roles: StaffRoleOption[]
    roleLabels: Record<string, string>
    today: Date
    date: string
    mode: 'day' | 'week'
    /** แผนกที่เลือกไว้ในชิป — ว่าง = ทุกแผนก */
    departments: string[]
    /** กระเป๋าทั้งหมด — หนึ่งใบ = หนึ่งเลนกระเป๋า (ว่าง = ไม่มีกลุ่มเลนกระเป๋า) */
    kits?: Kit[]
    /** การจองกระเป๋า — แถบในเลนกระเป๋า (รวมของอีเวนต์อื่นในวันเดียวกัน เพื่อให้เห็นว่าชน) */
    kitBookings?: KitBookingDetail[]
    /** งานที่โฟกัสอยู่ (โหมดวันเท่านั้น) — null = ไม่ได้โฟกัส */
    focusLeadId: string | null
    /** อีเวนต์เป้าหมายของงานโฟกัส — null = ยังไม่มีอีเวนต์ (จะสร้างให้) */
    focusEventId: string | null
    onDateChange: (date: string) => void
    onModeChange: (mode: 'day' | 'week') => void
    onDepartmentsChange: (departments: string[]) => void
    /** คลิกหัวคอลัมน์วันในโหมดสัปดาห์ → สลับเป็นโหมดวันของวันนั้นในครั้งเดียว */
    onOpenDay: (date: string) => void
    onEditStaff: (leadId: string) => void
    onEditVehicle: (leadId: string) => void
    onFocus: (leadId: string | null) => void
    onFocusEventChange: (eventId: string) => void
    onRequiredRolesChange: (leadId: string, required: Record<string, number>) => void
    onQuickAssign: (leadId: string, userId: string, role: string) => void
    onQuickRemove: (leadId: string, userId: string, role: string) => void
}) {
    /** กลุ่มแผนกที่ผู้ใช้ยุบ/ขยายเอง — ผูกกับวัน+โหมดที่ดูอยู่ เปลี่ยนวันแล้วกลับไปใช้ค่าเริ่มต้น */
    const [collapse, setCollapse] = useState<{ sig: string; set: Set<string> } | null>(null)
    /** กลุ่ม "ไม่ว่าง" ในโฟกัส — เก็บว่ากางไว้ของงานไหน เปลี่ยนงานโฟกัสแล้วกลับไปยุบเอง */
    const [busyOpenFor, setBusyOpenFor] = useState<string | null>(null)
    /** เมนูเลือกตำแหน่งตอนคลิกเลนตัวเลือก — x = ตำแหน่งคลิกในแทร็ก */
    const [menu, setMenu] = useState<{ personId: string; x: number } | null>(null)
    // เส้นเวลาปัจจุบัน: ฝั่ง server เป็น null (กัน hydration mismatch)
    const nowMin = useSyncExternalStore(subscribeNever, getNowMin, getNowMinServer)
    const isWide = useIsWide()

    const todayStr = ymd(today)
    const isWeek = mode === 'week' && isWide
    // ponytail: cheap; memo if lanes > ~200
    const layoutOpts = { departments, kits, kitBookings }
    const layout = layoutDay(rows, date, people, roleLabels, layoutOpts)
    const { hourStart, hourEnd, lanes } = layout
    const week = isWeek ? layoutWeek(rows, date, people, roleLabels, layoutOpts) : null
    const hours = hourEnd - hourStart

    // --- โฟกัสงาน (โหมดวันเท่านั้น; งานต้องอยู่ในวันที่ดูอยู่) ---------------------
    const focused = !isWeek && focusLeadId ? leadsOnDate(rows, date).find(l => l.id === focusLeadId) ?? null : null
    const focusedId = focused?.id ?? null
    const busyOpen = busyOpenFor === focusedId
    const deptKey = departments.join(',')
    // ลำดับตัวเลือก freeze ตอนเข้าโฟกัส / เปลี่ยนวัน / เปลี่ยนชิปแผนก — ตั้งใจไม่ผูกกับ rows
    // เพื่อไม่ให้เลนสลับที่ระหว่างกำลังจัดคน (ป้ายความว่างยังสดเพราะ live คำนวณใหม่ทุก render)
    const frozen = useMemo(
        () => (focused ? focusCandidates(focused, people, rows, date, { departments }) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [focusedId, date, deptKey]
    )
    const live = focused ? focusCandidates(focused, people, rows, date, { departments }) : null
    const liveById = new Map((live ? [...live.candidates, ...live.busy] : []).map(c => [c.person.id, c]))
    const pickLive = (list: Candidate[]) =>
        list.map(c => liveById.get(c.person.id)).filter((c): c is Candidate => c !== undefined)
    const focusGroups =
        focused && frozen ? { candidates: pickLive(frozen.candidates), busy: pickLive(frozen.busy) } : null

    const fw = focused ? focusWindow(focused, date, hourStart) : null
    const band = fw ? { startMin: fw.startMin, endMin: fw.endMin, striped: fw.timing === 'no_time' } : null

    // ตำแหน่งที่ขาด → คลิกเลนแล้วใส่ได้ทันทีเมื่อขาดตำแหน่งเดียว ไม่งั้นเปิดเมนู (ที่ขาดขึ้นก่อน)
    const gaps = focused ? missingRoles(focused) : []
    const menuRoles = [
        ...gaps.map(g => ({ value: g.role, label: roleLabels[g.role] || g.role, missing: g.need - g.have })),
        ...roles.filter(r => !gaps.some(g => g.role === r.value)).map(r => ({ ...r, missing: 0 })),
    ]
    const onCandidateClick = (personId: string) => (e: MouseEvent<HTMLDivElement>) => {
        if (!focused || e.target !== e.currentTarget) return
        if (gaps.length === 1) {
            onQuickAssign(focused.id, personId, gaps[0].role)
            return
        }
        setMenu({ personId, x: e.clientX - e.currentTarget.getBoundingClientRect().left })
    }

    // ชิปแผนก — ทุกแผนกที่มีคนอยู่ เรียงแบบเดียวกับเลน
    const deptOptions = [...new Set(people.map(p => p.department ?? NO_DEPARTMENT_LABEL))].sort(
        (a, b) => deptRank(a) - deptRank(b) || a.localeCompare(b, 'th')
    )

    // ยุบเป็นค่าเริ่มต้น ยกเว้นแผนกที่มีคนถูกจัดในวัน/สัปดาห์ที่ดู
    const summaries = departmentSummary(week ? week.lanes : lanes)
    const sig = `${isWeek ? 'week' : 'day'}:${date}`
    const collapsed =
        collapse && collapse.sig === sig
            ? collapse.set
            : new Set(summaries.filter(s => s.free === s.total).map(s => s.label))
    const toggleDept = (label: string) => {
        const next = new Set(collapsed)
        if (!next.delete(label)) next.add(label)
        setCollapse({ sig, set: next })
    }
    const groupLabel = (label: string) => {
        const s = summaries.find(x => x.label === label)
        return s ? `${label} · ${s.total} คน · ว่าง ${s.free}` : label
    }

    // ภาระงาน 7 วันของทุกคน — คิดครั้งเดียวต่อ render ใช้ร่วมกันทั้งโหมดวันและสัปดาห์
    const workload = new Map(people.map(p => [p.id, workloadOf(p.id, rows, date)]))

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

    const laneByPerson = new Map(lanes.filter(l => l.kind === 'person').map(l => [l.key, l]))

    /** เลนคนหนึ่งคนในโหมดโฟกัส — คลิกแทร็ก = จัด, คลิกแถบของงานโฟกัส = เอาออก */
    const renderCandidate = (candidate: Candidate, isBusy: boolean) => {
        const lane = laneByPerson.get(candidate.person.id)
        if (!lane || !focused) return null
        return (
            <DayLane
                key={`focus-${candidate.person.id}`}
                lane={lane}
                hourStart={hourStart}
                trackStyle={trackStyle}
                now={showNow ? nowMin : null}
                band={band}
                dim={isBusy}
                labelExtra={<WorkloadBadge n={workload.get(candidate.person.id) ?? 0} />}
                sublabelExtra={<AvailabilityTag candidate={candidate} />}
                onBarClick={bar =>
                    bar.leadId === focused.id && bar.roleValue
                        ? onQuickRemove(focused.id, candidate.person.id, bar.roleValue)
                        : onEditStaff(bar.leadId)
                }
                onTrackClick={isBusy ? undefined : onCandidateClick(candidate.person.id)}
            >
                {menu?.personId === candidate.person.id && (
                    <Popover open onOpenChange={o => { if (!o) setMenu(null) }}>
                        <PopoverAnchor asChild>
                            <span className="absolute inset-y-0 block w-0" style={{ left: menu.x }} />
                        </PopoverAnchor>
                        <PopoverContent align="start" className="w-56 p-1">
                            <div className="px-2 py-1 text-[11px] text-zinc-500">
                                จัด {candidate.person.nickname || candidate.person.name} เป็น
                            </div>
                            {menuRoles.length === 0 && (
                                <div className="px-2 py-1 text-xs text-zinc-500">ยังไม่มีตำแหน่งในระบบ</div>
                            )}
                            {menuRoles.map(role => (
                                <button
                                    key={role.value}
                                    type="button"
                                    onClick={() => { onQuickAssign(focused.id, candidate.person.id, role.value); setMenu(null) }}
                                    className={cn(
                                        'block w-full rounded px-2 py-1 text-left text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800',
                                        role.missing > 0 && 'font-semibold'
                                    )}
                                >
                                    {role.label}
                                    {role.missing > 0 && (
                                        <span className="ml-1 text-xs text-amber-600 dark:text-amber-400">ขาด {role.missing}</span>
                                    )}
                                </button>
                            ))}
                        </PopoverContent>
                    </Popover>
                )}
            </DayLane>
        )
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

                <div className="ml-auto hidden md:flex items-center gap-1">
                    <Button variant={mode === 'day' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('day')}>
                        วัน
                    </Button>
                    <Button variant={mode === 'week' ? 'default' : 'outline'} size="sm" onClick={() => onModeChange('week')}>
                        สัปดาห์
                    </Button>
                </div>
            </div>

            {focused && (
                <FocusHeader
                    lead={focused}
                    roles={roles}
                    roleLabels={roleLabels}
                    eventId={focusEventId}
                    onEventChange={onFocusEventChange}
                    onRequiredRolesChange={required => onRequiredRolesChange(focused.id, required)}
                    onExit={() => onFocus(null)}
                />
            )}

            {deptOptions.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5">
                    <button
                        type="button"
                        aria-pressed={departments.length === 0}
                        onClick={() => onDepartmentsChange([])}
                        className={chipClass(departments.length === 0)}
                    >
                        ทั้งหมด
                    </button>
                    {deptOptions.map(d => {
                        const active = departments.includes(d)
                        return (
                            <button
                                key={d}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                    onDepartmentsChange(active ? departments.filter(x => x !== d) : [...departments, d])
                                }
                                className={chipClass(active)}
                            >
                                {d}
                            </button>
                        )
                    })}
                </div>
            )}

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
                            const dept = lane.kind === 'person' ? lane.sublabel ?? NO_DEPARTMENT_LABEL : null
                            const isCollapsed = dept !== null && collapsed.has(dept)
                            const free = week.days.every(d => lane.cells[d].length === 0)
                            return (
                                <Fragment key={`w-${lane.kind}-${lane.key}`}>
                                    {title &&
                                        (dept === null ? (
                                            <GroupHeader title={title} className="col-span-8" />
                                        ) : (
                                            <GroupHeader
                                                title={groupLabel(dept)}
                                                className="col-span-8"
                                                collapsed={isCollapsed}
                                                onToggle={() => toggleDept(dept)}
                                            />
                                        ))}
                                    {isCollapsed ? null : (
                                    <>
                                    <div className="sticky left-0 z-10 border-r border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2">
                                        <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                                            {lane.label}
                                            {lane.kind === 'person' && <WorkloadBadge n={workload.get(lane.key) ?? 0} />}
                                        </div>
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
                                                    title={
                                                        cell.label +
                                                        (cell.role ? ` · ${cell.role}` : '') +
                                                        (cell.packed === undefined ? '' : ` · ${packedLabel(cell.packed)}`)
                                                    }
                                                    onClick={() => {
                                                        // เลนกระเป๋า: บล็อกคือการจอง ไม่ใช่การจัดคน/รถ — ยังไม่มีอะไรให้แก้จากตรงนี้
                                                        if (lane.kind === 'kit') return
                                                        if (lane.kind === 'vehicle') onEditVehicle(cell.leadId)
                                                        else onEditStaff(cell.leadId)
                                                    }}
                                                    className={cn(
                                                        'block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px]',
                                                        barClass(cell),
                                                        cell.conflict && 'ring-1 ring-rose-500',
                                                        lane.kind === 'jobs' &&
                                                            cell.unassigned &&
                                                            'border border-dashed border-zinc-400'
                                                    )}
                                                >
                                                    {cell.label}
                                                    {cell.role && <span className="opacity-70"> · {cell.role}</span>}
                                                    {cell.packed !== undefined && (
                                                        <span className="opacity-70"> · {packedLabel(cell.packed)}</span>
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    ))}
                                    </>
                                    )}
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

                    {(focusGroups ? lanes.filter(l => l.kind !== 'person') : lanes).map((lane, i, arr) => {
                        const title = groupTitle(arr, i)
                        const dept = lane.kind === 'person' ? lane.sublabel ?? NO_DEPARTMENT_LABEL : null
                        const isCollapsed = dept !== null && collapsed.has(dept)
                        return (
                            <Fragment key={`${lane.kind}-${lane.key}`}>
                                {title &&
                                    (dept === null ? (
                                        <GroupHeader title={title} />
                                    ) : (
                                        <GroupHeader
                                            title={groupLabel(dept)}
                                            collapsed={isCollapsed}
                                            onToggle={() => toggleDept(dept)}
                                        />
                                    ))}
                                {isCollapsed ? null : (
                                    <DayLane
                                        lane={lane}
                                        hourStart={hourStart}
                                        trackStyle={trackStyle}
                                        now={showNow ? nowMin : null}
                                        band={band}
                                        labelExtra={
                                            lane.kind === 'person' ? <WorkloadBadge n={workload.get(lane.key) ?? 0} /> : null
                                        }
                                        onBarClick={bar => {
                                            // เลนกระเป๋า: แถบคือการจอง ไม่ใช่การจัดคน/รถ — ยังไม่มีอะไรให้แก้จากตรงนี้
                                            if (lane.kind === 'kit') return
                                            if (lane.kind === 'vehicle') onEditVehicle(bar.leadId)
                                            else if (lane.kind === 'jobs') onFocus(bar.leadId)
                                            else onEditStaff(bar.leadId)
                                        }}
                                    />
                                )}
                            </Fragment>
                        )
                    })}

                    {focusGroups && (
                        <>
                            <GroupHeader title={`ตัวเลือก (${focusGroups.candidates.length})`} />
                            {focusGroups.candidates.map(c => renderCandidate(c, false))}
                            <GroupHeader
                                title={`ไม่ว่าง (${focusGroups.busy.length})`}
                                collapsed={!busyOpen}
                                onToggle={() => setBusyOpenFor(busyOpen ? null : focusedId)}
                            />
                            {busyOpen && focusGroups.busy.map(c => renderCandidate(c, true))}
                        </>
                    )}
                </div>
            </div>
            )}
        </div>
    )
}
