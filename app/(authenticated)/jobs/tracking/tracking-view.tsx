'use client'

import { Fragment, useEffect, useRef, useState, useSyncExternalStore, useTransition, type ReactNode } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertTriangle, ArrowRight, ChevronRight, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    assignLeadStaff,
    claimLeadDuty,
    claimPoolJob,
    releaseLeadDuty,
    releasePoolJob,
    updateJobDesignStatus,
    updateLeadTracking,
} from '../actions'
import {
    daysUntil,
    isPast,
    groupLeads,
    inChip,
    chipCounts,
    getMissing,
    designCellState,
    designReadyByLead,
    hasRequiredRoles,
    missingLabel,
    isUrgent,
    kitReadinessByLead,
    leadsOnDate,
    groupPoolJobs,
    applyClaimDraft,
    applyDutyDraft,
    claimGate,
    emphasizedClaims,
    myQueue,
    groupQueueByLead,
    parseDate,
    pruneClaimDraft,
    pruneDutyDraft,
    AWAITING_CLAIM_STATUS,
    CLAIMING_STATUS,
    CLAIM_LABELS,
    PREP_DUTIES,
    DUTY_LABELS_TH,
    type ClaimCandidate,
    type ClaimGate,
    type MyQueueGroup,
    type MyQueueItem,
    type ClaimDraftMap,
    type ClaimKind,
    type DutyDraftMap,
    type PoolDepartments,
    type TrackingLead,
    type Chip,
    type DutyClaim,
    type EventVehicle,
    type KitReadiness,
    type PoolJob,
    type PrepDuty,
} from './tracking-logic'
import TimelineView, { formatDate, ymd } from './timeline-view'
import PoolTabs, { ClaimButton, ClaimChip, DutyGate, KitSummary, ReleaseChip, nameOf, type JobStatusLabels, type KitBookingRow, type PoolKit } from './pool-tabs'
import { StaffEditor, VehicleCell, defaultEventId, type Person, type SaveFn, type StaffRole, type VehicleSyncFn } from './editors'
import DutyTab, { claimedDutyCount, dutyKey, dutySummary, unclaimedDutyCount } from './duty-tabs'
import { DESIGN_OPTIONS } from './design-options'

export type { TrackingLead, Person, StaffRole }

// ponytail: hydration — วันนี้ตาม timezone ของ "เครื่องผู้ใช้" ไม่ใช่ของ server
// SSR ใช้ getServerSnapshot (โซนเวลา server) แล้ว snapshot ฝั่ง client ชนะหลัง hydrate
const subscribeNever = () => () => {}
const getTodayStr = () => ymd(new Date())

const CHIPS: { chip: Chip; label: string }[] = [
    { chip: 'today', label: 'วันนี้' },
    { chip: 'week7', label: '7 วันนี้' },
    { chip: 'month', label: 'เดือนนี้' },
]

const PILL = 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium'

function NoteCell({ note, label, title, placeholder, onSave }: {
    note: string | null
    label: string
    title: string
    placeholder: string
    onSave: (v: string | null) => void
}) {
    const [open, setOpen] = useState(false)
    const [draft, setDraft] = useState(note || '')

    return (
        <Dialog open={open} onOpenChange={o => { if (o) setDraft(note || ''); setOpen(o) }}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`แก้ไข${label}`} title={note || undefined}>
                    <Pencil className={cn('h-3.5 w-3.5', note ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-400')} />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{label} — {title}</DialogTitle>
                </DialogHeader>
                <Textarea
                    autoFocus
                    rows={8}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    placeholder={placeholder}
                />
                <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>ยกเลิก</Button>
                    <Button onClick={() => { onSave(draft.trim() || null); setOpen(false) }}>บันทึก</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function Countdown({ date, today }: { date: string | null; today: Date }) {
    if (!date) return <span className="text-zinc-300 dark:text-zinc-600">—</span>
    const d = daysUntil(date, today)
    const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'
    if (d > 0) return <span className={`${base} bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900`}>อีก {d} วัน</span>
    if (d === 0) return <span className={`${base} bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900`}>วันนี้</span>
    return <span className={`${base} bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900`}>ผ่านมา {-d} วัน</span>
}

function ReadinessCell({ lead, roleLabels, kit, designReady }: {
    lead: TrackingLead
    roleLabels: Record<string, string>
    kit?: KitReadiness
    /** ข้อออกแบบตัดสินจากใบงานกราฟิกทุกใบ — ไม่ส่ง = ใช้สถานะระดับงานตามเดิม */
    designReady?: boolean
}) {
    const missing = getMissing(lead, kit, designReady)
    // ยังไม่กำหนดตำแหน่งที่ต้องการ → ใช้กติกาหลวม (มีคน ≥ 1 = จัดคนแล้ว) บอกไว้ที่ป้าย
    const loose = !hasRequiredRoles(lead)
    const hint = loose ? 'ยังไม่กำหนดตำแหน่งที่ต้องการ — นับว่าจัดคนแล้วเมื่อมีคนอย่างน้อย 1' : undefined
    if (missing.length === 0) {
        return (
            <span title={hint} className={cn(PILL, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200')}>
                พร้อม{loose && <sup className="ml-0.5 text-[10px] font-normal opacity-60">ไม่กำหนด</sup>}
            </span>
        )
    }
    return (
        <span title={hint} className={cn(PILL, 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}>
            ขาด: {missing.map(m => missingLabel(m, lead, roleLabels)).join(', ')}
        </span>
    )
}

function JobCell({ lead, today, showEvents = true }: {
    lead: TrackingLead
    today: Date
    /** งานหลายอีเวนต์ = false — แถวย่อยมีป้ายอีเวนต์ของตัวเองแล้ว รายการในช่องงานจะเลื่อนบรรทัดไม่ตรงกัน */
    showEvents?: boolean
}) {
    return (
        <>
            <div className="font-medium text-zinc-900 dark:text-zinc-100">
                {formatDate(lead.event_date)}
                {lead.event_end_date && lead.event_end_date !== lead.event_date && ` – ${formatDate(lead.event_end_date)}`}
                <span className={cn('font-normal', lead.event_time ? 'text-zinc-500' : 'text-zinc-400 italic')}>
                    {' | '}{lead.event_time ? `${lead.event_time} น.` : 'ยังไม่ใส่เวลา'}
                </span>
                {' '}
                <Countdown date={lead.event_date} today={today} />
            </div>
            <Link
                href={`/crm/${lead.id}`}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
                {lead.customer_name || 'ไม่ระบุลูกค้า'}
                {lead.event_name ? ` / ${lead.event_name}` : ''}
            </Link>
            {showEvents && lead.events.length > 0 && (
                <div className="text-[11px] text-zinc-500 space-y-0.5 mt-0.5">
                    {lead.events.map(e => (
                        <div key={e.id} className="truncate">
                            <span className="text-zinc-400">อีเวนต์:</span>{' '}
                            <Link
                                href={`/events/${e.id}/check-kits`}
                                title="ไปหน้าเช็คของ/กระเป๋าของอีเวนต์นี้"
                                className="hover:underline text-zinc-600 dark:text-zinc-300"
                            >
                                {e.name} ↗
                            </Link>
                            {e.event_date && <span className="text-zinc-400"> · {formatDate(e.event_date)}</span>}
                        </div>
                    ))}
                </div>
            )}
        </>
    )
}

/**
 * สถานะออกแบบของ "ใบงานกราฟิกใบนี้" — งานหนึ่งเปิดได้หลายใบ แก้ใบไหนไม่กระทบใบอื่น
 * ใบเก่าที่ยังไม่มีค่าของตัวเองตกกลับไปใช้ค่าระดับงาน (crm_leads.design_status)
 */
function DesignCell({ job, lead, onChange }: {
    job: PoolJob
    lead: TrackingLead
    onChange: (jobId: string, designStatus: string) => void
}) {
    const value = job.design_status || lead.design_status
    return (
        <Select value={value} onValueChange={v => onChange(job.id, v)}>
            <SelectTrigger className={cn('w-full', DESIGN_OPTIONS.find(o => o.value === value)?.className)}>
                <SelectValue />
            </SelectTrigger>
            <SelectContent>
                {DESIGN_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value}>
                        {o.label}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    )
}

/** งานที่เปิดใบงานกราฟิกไว้หลายใบ — ช่องนี้แก้ได้ใบเดียว ที่เหลือดูที่แท็บใบงานกราฟิก */
function MoreGraphicJobsLink({ count }: { count: number }) {
    return (
        <Link
            href="?tab=graphic"
            title="งานนี้มีใบงานกราฟิกหลายใบ — แก้สถานะของใบอื่นได้ที่แท็บใบงานกราฟิก"
            className="block text-[11px] text-violet-600 dark:text-violet-400 hover:underline"
        >
            +{count} ใบ
        </Link>
    )
}

/** งานที่ยังไม่มีใบงานกราฟิก — กันงานเงียบหายเพราะลืมเปิด (เปิดจากการ์ด CRM) */
function NotOpenedPill({ leadId }: { leadId: string }) {
    return (
        <Link
            href={`/crm/${leadId}`}
            title="เปิดใบงานกราฟิกได้จากหน้าการ์ด CRM"
            className={cn(
                PILL,
                'items-center gap-1 border border-amber-300 bg-amber-100 text-amber-900 hover:bg-amber-200',
                'dark:border-amber-900 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60'
            )}
        >
            <AlertTriangle className="h-3 w-3" /> ยังไม่เปิดใบงาน
        </Link>
    )
}

/** ไทม์ไลน์: คลิกแถบในเลนรถ → เปิด VehicleCell เดิมใน Dialog */
function VehicleDialog({ lead, all, onSaved, onClose }: { lead: TrackingLead; all: TrackingLead[]; onSaved: VehicleSyncFn; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={o => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>จัดรถ — {lead.customer_name || 'ไม่ระบุลูกค้า'} · {formatDate(lead.event_date)}</DialogTitle>
                </DialogHeader>
                <VehicleCell lead={lead} all={all} onSaved={onSaved} />
                <DialogFooter>
                    <Button onClick={onClose}>ปิด</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function SupplierCell({ lead, save }: { lead: TrackingLead; save: SaveFn }) {
    return (
        <NoteCell
            note={lead.supplier_note}
            label="ซัพพลายเออร์"
            title={lead.customer_name || 'ไม่ระบุลูกค้า'}
            placeholder="ระบุซัพพลายเออร์ / รายละเอียด / เบอร์ติดต่อ ..."
            onSave={v => { if (v !== lead.supplier_note) save(lead.id, { supplier_note: v }) }}
        />
    )
}

// กรอบงานวันเดียวกันในตาราง: เส้นข้างซ้าย/ขวา (บน/ล่างใส่เฉพาะแถวแรก/ท้ายของวัน)
const DAY_FRAME = 'border-l-2 border-l-zinc-300 dark:border-l-zinc-600 border-r-2 border-r-zinc-300 dark:border-r-zinc-600'

type LeadEvent = TrackingLead['events'][number]

/** ป้ายบอกว่าช่องนี้เป็นของอีเวนต์ไหน — อยู่เหนือตัวแก้ไขในแถวรายอีเวนต์ */
function EventLabel({ event }: { event: LeadEvent }) {
    const label = `${event.name || 'ไม่ระบุชื่อ'}${event.event_date ? ` · ${formatDate(event.event_date)}` : ''}`
    return (
        <div className="mb-1 truncate text-[11px] font-medium text-zinc-500" title={label}>
            {label}
        </div>
    )
}

/** แบ่ง leads (เรียงวันแล้ว) เป็นช่วงติดกันที่ event_date เท่ากัน — ใช้ตีกรอบการ์ดมือถือ */
function runsByDate(leads: TrackingLead[]): { key: string; leads: TrackingLead[] }[] {
    const runs: { key: string; leads: TrackingLead[] }[] = []
    for (const l of leads) {
        const last = runs[runs.length - 1]
        if (last && last.leads[0].event_date === l.event_date) last.leads.push(l)
        else runs.push({ key: `${l.event_date ?? 'none'}-${l.id}`, leads: [l] })
    }
    return runs
}

/** แท็บของพูลงาน — ไม่มี ?tab หรือค่าแปลก = ภาพรวม (ตารางเดิม) */
type PoolTab = 'overview' | 'graphic' | PrepDuty | 'onsite'

/** ชิปย่อยใต้แท็บ "พูลงาน" — key ตรงกับ ?tab= ค่าเดิมทุกค่า (ลิงก์เก่าจาก dashboard/กระดิ่ง/CRM ยังใช้ได้) */
const POOL_CHIPS: { key: Exclude<PoolTab, 'overview'>; label: string }[] = [
    { key: 'graphic', label: 'กราฟิก' },
    { key: 'staffing', label: 'จัดคน' },
    { key: 'vehicle', label: 'จัดรถ' },
    { key: 'kits', label: 'กระเป๋า' },
    { key: 'onsite', label: 'หน้างาน' },
]

const TAB_KEYS: readonly string[] = POOL_CHIPS.map(t => t.key)

/** ?tab ที่รู้จักเท่านั้น — ค่าอื่น (หรือไม่มี) = ภาพรวม */
function parseTab(value: string | null): PoolTab {
    return value && value !== 'overview' && TAB_KEYS.includes(value) ? (value as PoolTab) : 'overview'
}

/** แท็บใบงานรายหน้าที่เตรียมงาน (จัดคน/จัดรถ/จัดกระเป๋า) หรือเปล่า */
const isDutyTab = (tab: PoolTab): tab is PrepDuty => (PREP_DUTIES as readonly string[]).includes(tab)

const tabCls = (active: boolean) => cn(
    '-mb-px border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap',
    active
        ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
        : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
)

// แถบ "ของฉัน" จำสถานะพับไว้ต่อเครื่อง — localStorage แตะไม่ได้ (โหมดส่วนตัว) = ไม่พับ
// อ่านผ่าน useSyncExternalStore: ฝั่ง server ตอบ "ไม่พับ" เสมอ ค่าจริงชนะหลัง hydrate (ไม่ชนกัน)
const MY_QUEUE_KEY = 'tracking:my-queue-collapsed'
const collapseListeners = new Set<() => void>()
const subscribeCollapsed = (cb: () => void) => {
    collapseListeners.add(cb)
    return () => { collapseListeners.delete(cb) }
}
const getCollapsed = () => {
    try { return localStorage.getItem(MY_QUEUE_KEY) === '1' } catch { return false }
}
const getCollapsedOnServer = () => false
const setCollapsed = (value: boolean) => {
    try { localStorage.setItem(MY_QUEUE_KEY, value ? '1' : '0') } catch { /* เขียนไม่ได้ = ไม่จำ */ }
    for (const cb of collapseListeners) cb()
}

/** ยังไม่รู้ว่าแผนกไหนรับอะไรได้ (props เก่า) — คู่กับ isAdmin เพื่อให้ยังกดรับได้ (server บังคับจริง) */
const NO_POOL_DEPARTMENTS: PoolDepartments = { graphic: [], onsite: [], staffing: [], vehicle: [], kits: [] }

/** แถบ "ของฉัน" แสดงกี่งานต่อคอลัมน์ก่อนพับส่วนที่เหลือ — แอดมินเห็นงานรอรับได้เป็นร้อย ไม่ควรยาวเป็นกำแพง */
const QUEUE_MAX_GROUPS = 8

/** วันที่แบบสั้นสำหรับรายการหนาแน่น (ไม่มีปี) */
const shortDate = (d: string | null) =>
    d ? parseDate(d).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) : 'ไม่กำหนดวัน'

/** หัวแถวของงานหนึ่งงานในแถบ "ของฉัน" — วันที่คอลัมน์แคบคงที่ + ชื่อลูกค้า */
function QueueHead({ group }: { group: MyQueueGroup }) {
    return (
        <div className="flex min-w-0 flex-1 items-baseline gap-2">
            <span className="w-14 shrink-0 text-[11px] tabular-nums text-zinc-500">{shortDate(group.date)}</span>
            <span className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">{group.customer}</span>
        </div>
    )
}

/** สิ่งที่ยังขาดของงานนั้น (รวมทุกจุด ไม่ซ้ำ) */
function QueueMissing({ group }: { group: MyQueueGroup }) {
    const missing = [...new Set(group.items.flatMap(i => i.missing))]
    if (missing.length === 0) return null
    return <span className="truncate text-[11px] text-amber-600 dark:text-amber-400">ขาด: {missing.join(', ')}</span>
}

/**
 * แถบ "ของฉัน" บนสุดของแท็บภาพรวม — "งานที่ฉันรับไว้" กับ "รอทีมฉันรับ" อย่างละคอลัมน์
 * หนึ่งแถว = หนึ่งงาน (จุดที่รับ/รับได้ของงานนั้นเรียงในแถวเดียว) · แสดง 8 งานใกล้สุดต่อคอลัมน์
 * ว่างทั้งสองกลุ่ม = ไม่แสดงเลย · พับได้และจำสถานะพับไว้ในเครื่อง
 */
function MyQueueStrip({ mine, claimable, gateOf, onGo, onClaim, onSeeAll }: {
    mine: MyQueueItem[]
    claimable: MyQueueItem[]
    gateOf: (kind: ClaimKind) => ClaimGate | undefined
    /** "ไปที่งาน" — ไฮไลต์งานนั้นในตาราง/การ์ดแล้วเลื่อนจอไปหา */
    onGo: (leadId: string) => void
    onClaim: (item: MyQueueItem) => void
    /** งานรอรับที่ไม่ได้แสดง — พาไปแท็บพูลงานของจุดนั้น */
    onSeeAll: (kind: ClaimKind) => void
}) {
    const collapsed = useSyncExternalStore(subscribeCollapsed, getCollapsed, getCollapsedOnServer)
    const [showAllMine, setShowAllMine] = useState(false)
    if (mine.length === 0 && claimable.length === 0) return null

    const mineGroups = groupQueueByLead(mine)
    const claimGroups = groupQueueByLead(claimable)
    const mineShown = showAllMine ? mineGroups : mineGroups.slice(0, QUEUE_MAX_GROUPS)
    const claimShown = claimGroups.slice(0, QUEUE_MAX_GROUPS)
    const hiddenClaim = claimGroups.length - claimShown.length

    const header = (label: string, count: number, hint?: string) => (
        <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
            <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">{label}</span>
            <span className="text-[11px] tabular-nums text-zinc-400">
                {count} งาน{hint ? ` · ${hint}` : ''}
            </span>
        </div>
    )

    return (
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-950">
            <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => setCollapsed(!collapsed)}
                className="flex w-full items-center gap-1.5 text-left text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
                <ChevronRight className={cn('h-4 w-4 text-zinc-400 transition-transform', !collapsed && 'rotate-90')} aria-hidden />
                ของฉัน
                <span className="text-xs font-normal text-zinc-500">
                    รับไว้ {mineGroups.length} งาน · รอทีมฉันรับ {claimGroups.length} งาน
                </span>
            </button>

            {!collapsed && (
                <div className="mt-2 grid gap-4 md:grid-cols-2 md:gap-6">
                    {/* งานที่ฉันรับไว้: วันที่ · ลูกค้า · จุดที่รับ · ขาด … [ไปที่งาน] */}
                    <div className="min-w-0">
                        {header('งานที่ฉันรับไว้', mineGroups.length)}
                        {mineGroups.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-zinc-400">ยังไม่ได้รับงานไหนไว้</p>
                        ) : (
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {mineShown.map(g => (
                                    <div key={g.leadId} className="flex items-center gap-2 py-1.5">
                                        <QueueHead group={g} />
                                        <span className="hidden shrink-0 gap-1 sm:flex">
                                            {g.items.map(i => (
                                                <span key={i.kind} className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                                    {CLAIM_LABELS[i.kind]}
                                                </span>
                                            ))}
                                        </span>
                                        <QueueMissing group={g} />
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-6 shrink-0 px-2 text-[11px] text-zinc-500"
                                            onClick={() => onGo(g.leadId)}
                                        >
                                            ไปที่งาน <ArrowRight className="h-3 w-3" aria-hidden />
                                        </Button>
                                    </div>
                                ))}
                                {mineGroups.length > QUEUE_MAX_GROUPS && (
                                    <button
                                        type="button"
                                        className="w-full py-1.5 text-left text-[11px] text-violet-600 hover:underline dark:text-violet-400"
                                        onClick={() => setShowAllMine(v => !v)}
                                    >
                                        {showAllMine ? 'แสดงเฉพาะที่ใกล้สุด' : `แสดงอีก ${mineGroups.length - QUEUE_MAX_GROUPS} งาน`}
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* รอทีมฉันรับ: วันที่ · ลูกค้า · ขาด … [ปุ่มรับเล็กๆ ของแต่ละจุด] */}
                    <div className="min-w-0 border-t border-zinc-100 pt-3 dark:border-zinc-800 md:border-l md:border-t-0 md:pl-6 md:pt-0">
                        {header('รอทีมฉันรับ', claimGroups.length, hiddenClaim > 0 ? `แสดง ${claimShown.length} งานใกล้สุด` : undefined)}
                        {claimGroups.length === 0 ? (
                            <p className="px-1 py-2 text-xs text-zinc-400">ไม่มีงานรอทีมฉันรับ</p>
                        ) : (
                            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                                {claimShown.map(g => (
                                    <div key={g.leadId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
                                        <div className="flex min-w-0 flex-1 basis-52 items-center gap-2">
                                            <QueueHead group={g} />
                                            <QueueMissing group={g} />
                                        </div>
                                        <div className="flex shrink-0 flex-wrap gap-1">
                                            {g.items.map(i => (
                                                <ClaimButton key={i.kind} kind={i.kind} gate={gateOf(i.kind)} compact onClick={() => onClaim(i)} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {hiddenClaim > 0 && (
                                    <button
                                        type="button"
                                        className="w-full py-1.5 text-left text-[11px] text-violet-600 hover:underline dark:text-violet-400"
                                        onClick={() => onSeeAll(claimGroups[claimShown.length].items[0].kind)}
                                    >
                                        อีก {hiddenClaim} งาน — ดูทั้งหมดในพูลงาน →
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}

export default function TrackingView({
    leads,
    roleLabels,
    roles,
    people,
    jobs: jobsProp = [],
    dutyClaims: dutyClaimsProp = [],
    jobStatusLabels = {},
    currentUserId = null,
    canManagePool = false,
    kits = [],
    kitBookings = [],
    eventVehicles = [],
    canManageKits = false,
    isAdmin = false,
    myDepartment = null,
    poolDepartments,
}: {
    leads: TrackingLead[]
    roleLabels: Record<string, string>
    roles: StaffRole[]
    people: Person[]
    /** ใบงานของงานเหล่านี้ (ตาราง jobs) — เข้าแท็บใบงานกราฟิก/หน้างาน */
    jobs?: PoolJob[]
    /** หน้าที่เตรียมงานที่มีคนรับแล้ว (lead_duty_claims) — ไม่มีในรายการ = หน้าที่นั้นยังรอรับ */
    dutyClaims?: DutyClaim[]
    jobStatusLabels?: JobStatusLabels
    /** ผู้ใช้ที่ล็อกอินอยู่ — คืนงานได้เฉพาะใบงานที่ตัวเองรับ */
    currentUserId?: string | null
    /** แอดมิน/ฝ่ายประสานงาน — ข้ามใบงานและเปลี่ยนคนรับได้ */
    canManagePool?: boolean
    /** กระเป๋าทั้งหมด — ตัวเลือกในกล่องจองกระเป๋าของใบงานหน้างาน */
    kits?: PoolKit[]
    /** การจองกระเป๋า (event_kits) ของงานเหล่านี้ + ของอีเวนต์อื่นในวันเดียวกัน (ใช้บอกว่าชน) */
    kitBookings?: KitBookingRow[]
    /** การจองรถรายอีเวนต์ (event_vehicles) — ช่อง "จัดรถ" ของแถวรายอีเวนต์อ่านค่าจากตรงนี้ */
    eventVehicles?: EventVehicle[]
    /** แอดมิน/แผนกที่ดูแลกระเป๋า — จองและยกเลิกจองได้ */
    canManageKits?: boolean
    /** role = admin เท่านั้น — แท็บใบงานหน้างาน (หัวหน้างาน) แสดงเฉพาะแอดมิน */
    isAdmin?: boolean
    /** แผนกของผู้ใช้ — ตัดสินว่าปุ่มรับจุดไหนกดได้ (D1) */
    myDepartment?: string | null
    /** แผนกที่รับได้ของแต่ละจุด (job_settings) — ไม่ส่ง = ทุกปุ่มกดได้ (สิทธิ์จริงบังคับฝั่ง server) */
    poolDepartments?: PoolDepartments
}) {
    const [rows, setRows] = useState(leads)
    /**
     * สถานะออกแบบรายใบที่เพิ่งกด — ทับค่าจาก server จนกว่าข้อมูลรอบใหม่จะมาถึง (กันช่องกระพริบกลับค่าเดิม)
     * เก็บแยกจาก `jobs` เพื่อให้ค่าอื่นของใบงาน (รับ/คืน/ข้าม) ยังไหลมาจาก server ตามปกติ
     */
    const [designDraft, setDesignDraft] = useState<Record<string, string>>({})
    /** ใบงาน/หน้าที่ที่เพิ่งกดรับหรือคืน — ทับค่าจาก server จนกว่าข้อมูลรอบใหม่จะตามมา (optimistic) */
    const [claimDraft, setClaimDraft] = useState<ClaimDraftMap>({})
    const [dutyDraft, setDutyDraft] = useState<DutyDraftMap>({})
    const [chip, setChip] = useState<Chip | null>(null)
    /** กรองเฉพาะงานที่ยังไม่เปิดใบงานกราฟิก (ชิปเตือนสีเหลือง) */
    const [notOpenedOnly, setNotOpenedOnly] = useState(false)
    /** การ์ดมือถือ: หน้าที่ที่ยุบไว้แล้วถูกแตะให้ขยาย — key = `${leadId}:${duty}:${eventId}` */
    const [expanded, setExpanded] = useState<Set<string>>(new Set())
    const [, startTransition] = useTransition()
    /** ไทม์ไลน์: แถบที่กำลังแก้ (คน หรือ รถ) */
    const [editing, setEditing] = useState<{ leadId: string; kind: 'staff' | 'vehicle' } | null>(null)

    /**
     * ข้อมูลรอบใหม่จาก server (revalidate / refresh) ต้องไหลลง `rows` ด้วย — เทียบกับ props รอบก่อน
     * แล้วปรับ state ตอน render (ไม่ใช้ setState ใน useEffect) ตามท่ามาตรฐานของ React
     * พร้อมกันนั้นล้าง draft รับ/คืน ที่ server ตามทันแล้ว
     */
    const [prevProps, setPrevProps] = useState({ leads, jobs: jobsProp, dutyClaims: dutyClaimsProp })
    if (
        prevProps.leads !== leads ||
        prevProps.jobs !== jobsProp ||
        prevProps.dutyClaims !== dutyClaimsProp
    ) {
        setPrevProps({ leads, jobs: jobsProp, dutyClaims: dutyClaimsProp })
        if (prevProps.leads !== leads) setRows(leads)
        setClaimDraft(d => pruneClaimDraft(jobsProp, d))
        setDutyDraft(d => pruneDutyDraft(dutyClaimsProp, d))
    }

    // client component: hydration mismatch is only possible exactly at midnight — acceptable
    const today = new Date()

    // สถานะมุมมองอยู่ใน URL: ?tab=graphic|onsite&view=timeline&date=YYYY-MM-DD&mode=day|week
    const router = useRouter()
    const searchParams = useSearchParams()
    // ใบงานหน้างานซ้ำซ้อนกับหน้าที่เตรียมงานสำหรับคนทั่วไป — เหลือไว้ให้แอดมินดูหัวหน้างาน/ปิดงาน
    // ไม่ใช่แอดมินพิมพ์ ?tab=onsite ตรงๆ = เด้งกลับภาพรวม (เป็นการซ่อนมุมมอง ไม่ใช่ชั้นสิทธิ์)
    const parsedTab = parseTab(searchParams.get('tab'))
    const tab: PoolTab = parsedTab === 'onsite' && !isAdmin ? 'overview' : parsedTab
    const view = searchParams.get('view') === 'timeline' ? 'timeline' : 'table'
    const mode = searchParams.get('mode') === 'week' ? 'week' : 'day'
    const dateParam = searchParams.get('date')
    const todayStr = useSyncExternalStore(subscribeNever, getTodayStr, getTodayStr)
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr
    /** ชิปแผนกของไทม์ไลน์: ?dept=ช่าง,ฝ่ายออกแบบ — ว่าง = ทุกแผนก */
    const departments = (searchParams.get('dept') ?? '').split(',').filter(Boolean)

    /** patch บาง key — อ่านจาก URL จริงตอนคลิก ไม่ใช่ searchParams ของรอบ render (สองคลิกติดกันจะได้ไม่ทับกัน) */
    const setParams = (patch: {
        tab?: string | null
        view?: string | null
        date?: string | null
        mode?: string | null
        dept?: string | null
        focus?: string | null
        past?: string | null
        lead?: string | null
        job?: string | null
    }) => {
        const p = new URLSearchParams(window.location.search)
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) p.delete(k)
            else if (v !== undefined) p.set(k, v)
        }
        const qs = p.toString()
        router.replace(qs ? `?${qs}` : '?', { scroll: false })
    }

    /** ?past=1 = server โหลดงานที่ผ่านมาแล้วเกิน 30 วันมาให้ด้วย (ค่าเริ่มต้นตัดออก) */
    const pastLoaded = searchParams.get('past') === '1'
    /** เปิดหน้าด้วย ?past=1 ตรงๆ = แสดงงานที่ผ่านแล้วตั้งแต่แรก (ไม่ต้องกดปุ่มซ้ำ) */
    const [showPast, setShowPast] = useState(pastLoaded)

    /** ปุ่มรับจุดนี้กดได้ไหม + ป้าย "รอ<แผนก>รับ" (D1) — ไม่รู้แผนกของแต่ละจุด = ปล่อยให้กดได้ */
    const gateOf = (kind: ClaimKind) =>
        poolDepartments ? claimGate(kind, myDepartment, isAdmin, poolDepartments) : undefined

    /** งานที่ถูกไฮไลต์ (?lead= จากการ์ด CRM / แผงเตือน / กระดิ่ง) — แถวและการ์ดของงานนี้ได้กรอบแดง */
    const highlightLeadId = searchParams.get('lead')

    /**
     * ?job=<jobId> จากกระดิ่ง (job_pool_*) — แปลงเป็นแท็บของใบงานนั้น + ?lead= ครั้งเดียว
     * (ไฮไลต์/เลื่อนจอใช้เส้นทางเดียวกับลิงก์อื่น) · ใบงานหน้างานของคนทั่วไปไปที่ภาพรวม
     */
    const jobParam = searchParams.get('job')
    const jobTarget = jobParam ? jobsProp.find(j => j.id === jobParam) ?? null : null
    const jobTargetTab = jobTarget?.job_type === 'graphic' ? 'graphic' : jobTarget?.job_type === 'onsite' && isAdmin ? 'onsite' : null
    const jobTargetLead = jobTarget?.crm_lead_id ?? null
    useEffect(() => {
        if (!jobParam) return
        setParams({ job: null, tab: jobTargetTab, lead: jobTargetLead })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobParam])

    // คนอื่นกดรับ/แก้งานอยู่ตลอด — ดึงข้อมูลใหม่ตอนกลับมาที่แท็บนี้ และทุก 60 วิขณะเปิดหน้าอยู่
    useEffect(() => {
        const refresh = () => {
            if (document.visibilityState === 'visible') router.refresh()
        }
        const timer = setInterval(refresh, 60_000)
        document.addEventListener('visibilitychange', refresh)
        return () => {
            clearInterval(timer)
            document.removeEventListener('visibilitychange', refresh)
        }
    }, [router])

    const editingLead = editing ? rows.find(r => r.id === editing.leadId) ?? null : null

    // --- โฟกัสงาน (?focus=<leadId>) ------------------------------------------
    const focusParam = searchParams.get('focus')
    const focusLead = focusParam ? rows.find(r => r.id === focusParam) ?? null : null
    /** โฟกัสมีผลเฉพาะไทม์ไลน์ และเฉพาะเมื่องานอยู่ในวันที่ดูอยู่ */
    const focusLeadId = focusLead && leadsOnDate(rows, date).some(l => l.id === focusLead.id) ? focusLead.id : null
    /** อีเวนต์เป้าหมายที่ผู้ใช้เลือกเองจากหัวโฟกัส (งานที่มีหลายอีเวนต์) */
    const [eventOverride, setEventOverride] = useState<string | null>(null)
    /** กติกาเดียวกับหน้าต่างจัดคน: 1 อีเวนต์ → ใช้เลย, 0 → null (สร้างให้), >1 → ที่มีคนมากสุด (เปลี่ยนได้) */
    const targetEventOf = (lead: TrackingLead) =>
        eventOverride && lead.events.some(e => e.id === eventOverride) ? eventOverride : defaultEventId(lead)

    /** เปลี่ยนวันแล้วงานที่โฟกัสไม่อยู่ในวันนั้น → ออกจากโฟกัส (patch = key อื่นที่อยากเปลี่ยนพร้อมกัน) */
    const changeDate = (next: string, patch?: { mode?: string }) =>
        setParams({
            ...patch,
            date: next,
            focus: focusParam && !leadsOnDate(rows, next).some(l => l.id === focusParam) ? null : undefined,
        })

    /** ?focus ค้างจาก URL แต่งานไม่อยู่ในวันที่ดูอยู่ (หรือไม่มีในรายการ) → ล้างทิ้งครั้งเดียว */
    const staleFocus = focusParam !== null && focusLeadId === null
    useEffect(() => {
        if (staleFocus) setParams({ focus: null })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [staleFocus])

    /** rows ล่าสุดสำหรับงานที่รออยู่ในคิว — เก็บค่า "ก่อนแก้" ตอนถึงคิวจริงๆ ไม่ใช่ตอนคลิก */
    const rowsRef = useRef(rows)
    useEffect(() => {
        rowsRef.current = rows
    })
    /** คิวต่อ 1 งาน — คลิกรัวๆ ในงานเดียวกันทำเรียงกัน ไม่ทับกัน */
    const staffQueue = useRef(new Map<string, Promise<void>>())

    // เลื่อนจอไปหางานที่ไฮไลต์ครั้งเดียวตอนเข้าหน้า — ตารางกับการ์ดมือถือแยกธงกัน (อีกฝั่งถูกซ่อนตามขนาดจอ)
    const scrolledRow = useRef(false)
    const scrolledCard = useRef(false)

    // ponytail: sends the whole event roster per click; clicks are serialized per lead so a failed call reverts only its own change
    const quickStaff = (leadId: string, userId: string, role: string, add: boolean) => {
        const run = async () => {
            const lead = rowsRef.current.find(r => r.id === leadId)
            if (!lead) return
            const eventId = targetEventOf(lead)
            const others = lead.staff.filter(s => s.event_id !== eventId)
            const mine = lead.staff.filter(s => s.event_id === eventId)
            const person = people.find(p => p.id === userId)
            const next = add
                ? mine.some(s => s.user_id === userId && s.role === role)
                    ? mine
                    : [
                          ...mine,
                          {
                              user_id: userId,
                              name: person?.name || userId,
                              nickname: person?.nickname ?? null,
                              role,
                              event_id: eventId ?? '',
                          },
                      ]
                : mine.filter(s => !(s.user_id === userId && s.role === role))

            const before = lead.staff
            setRows(prev => prev.map(r => (r.id === leadId ? { ...r, staff: [...others, ...next] } : r)))

            const res = await assignLeadStaff(leadId, eventId, next.map(s => ({ user_id: s.user_id, role: s.role })))
            if (!res || 'error' in res) {
                setRows(prev => prev.map(r => (r.id === leadId ? { ...r, staff: before } : r)))
                toast.error(res?.error || 'บันทึกไม่สำเร็จ')
                return
            }
            const savedId = String(res.eventId)
            onStaffSaved(
                leadId,
                [...others, ...next.map(s => ({ ...s, event_id: savedId }))],
                lead.events.some(e => e.id === savedId)
                    ? lead.events
                    : [...lead.events, { id: savedId, name: '', event_date: lead.event_date, status: null }],
                lead.required_roles
            )
        }
        const prev = staffQueue.current.get(leadId) ?? Promise.resolve()
        const queued = prev.then(run).catch(() => {})
        staffQueue.current.set(leadId, queued)
        return queued
    }

    const saveRequiredRoles = async (leadId: string, required: Record<string, number>) => {
        const before = rows.find(r => r.id === leadId)?.required_roles
        if (!before) return
        setRows(prev => prev.map(r => (r.id === leadId ? { ...r, required_roles: required } : r)))
        const res = await updateLeadTracking(leadId, { required_roles: required })
        if (res?.error) {
            setRows(prev => prev.map(r => (r.id === leadId ? { ...r, required_roles: before } : r)))
            toast.error(res.error)
        }
    }

    /** สถานะออกแบบบันทึกรายใบงาน — ใบที่ส่งงานแล้วจบเฉพาะใบนั้น ใบอื่นของงานเดียวกันไม่ถูกแตะ */
    const saveJobDesign = (jobId: string, designStatus: string) => {
        setDesignDraft(prev => ({ ...prev, [jobId]: designStatus }))
        startTransition(async () => {
            const res = await updateJobDesignStatus(jobId, designStatus)
            if (res?.error) {
                setDesignDraft(prev => {
                    const next = { ...prev }
                    delete next[jobId]
                    return next
                })
                toast.error(res.error)
            }
        })
    }

    /** ล้าง draft ของรายการเดียว — ใช้ตอน action ตอบ error (ช่องย้อนกลับเป็นค่าเดิมทันที) */
    const dropClaimDraft = (jobId: string) =>
        setClaimDraft(d => {
            const next = { ...d }
            delete next[jobId]
            return next
        })
    const dropDutyDraft = (key: string) =>
        setDutyDraft(d => {
            const next = { ...d }
            delete next[key]
            return next
        })

    /**
     * รับ/คืน ทั้งใบงานและหน้าที่: ทับค่าให้ช่องเปลี่ยนทันที → เรียก action →
     * ตอบ error เมื่อไหร่ก็ย้อน draft กลับพร้อม toast (ค่าจริงไหลมาทับเองตอน revalidate)
     */
    const onClaimJob = (jobId: string) => {
        setClaimDraft(d => ({ ...d, [jobId]: { status: CLAIMING_STATUS, claimed_by: currentUserId } }))
        startTransition(async () => {
            const res = (await claimPoolJob(jobId)) as { error?: string } | undefined
            if (res?.error) {
                dropClaimDraft(jobId)
                toast.error(res.error)
            } else toast.success('รับงานแล้ว')
        })
    }

    const onReleaseJob = (jobId: string) => {
        setClaimDraft(d => ({ ...d, [jobId]: { status: AWAITING_CLAIM_STATUS, claimed_by: null } }))
        startTransition(async () => {
            const res = (await releasePoolJob(jobId)) as { error?: string } | undefined
            if (res?.error) {
                dropClaimDraft(jobId)
                toast.error(res.error)
            } else toast.success('คืนงานเข้าพูลแล้ว — กลับเป็นรอรับงาน')
        })
    }

    const onClaimDuty = (leadId: string, duty: PrepDuty) => {
        const key = dutyKey(leadId, duty)
        const label = DUTY_LABELS_TH[duty]
        setDutyDraft(d => ({ ...d, [key]: { leadId, duty, claimedBy: currentUserId ?? '' } }))
        startTransition(async () => {
            const res = (await claimLeadDuty(leadId, duty)) as { error?: string } | undefined
            if (res?.error) {
                dropDutyDraft(key)
                toast.error(res.error)
            } else toast.success(`รับหน้าที่${label}แล้ว`)
        })
    }

    const onReleaseDuty = (leadId: string, duty: PrepDuty) => {
        const key = dutyKey(leadId, duty)
        const label = DUTY_LABELS_TH[duty]
        setDutyDraft(d => ({ ...d, [key]: null }))
        startTransition(async () => {
            const res = (await releaseLeadDuty(leadId, duty)) as { error?: string } | undefined
            if (res?.error) {
                dropDutyDraft(key)
                toast.error(res.error)
            } else toast.success(`คืนหน้าที่${label}แล้ว — กลับเป็นรอรับงาน`)
        })
    }

    const save = (
        id: string,
        patch: { design_status?: string; supplier_note?: string | null; tracking_checklist?: string[] }
    ) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, ...patch } : r)))
        startTransition(async () => {
            const res = await updateLeadTracking(id, patch)
            if (res?.error) toast.error(res.error)
        })
    }

    // จัดรถบันทึกผ่าน assignLeadVehicle เอง (ผูกกับอีเวนต์ — ADR-0004) ที่นี่แค่สะท้อนค่าลงตาราง
    const syncVehicle = (id: string, tracking_checklist: string[]) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, tracking_checklist } : r)))
    }

    const onStaffSaved = (
        id: string,
        staff: TrackingLead['staff'],
        events: TrackingLead['events'],
        required_roles: Record<string, number>
    ) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, staff, events, required_roles } : r)))
    }

    const onRequiredRolesSaved = (id: string, required_roles: Record<string, number>) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, required_roles } : r)))
    }

    // ใบงานที่หน้านี้ใช้ = ข้อมูลจาก server ทับด้วยการรับ/คืน และสถานะออกแบบที่เพิ่งกด (ยังไม่ revalidate)
    const claimed = applyClaimDraft(jobsProp, claimDraft)
    const jobs: PoolJob[] = Object.keys(designDraft).length === 0
        ? claimed
        : claimed.map(j => (designDraft[j.id] ? { ...j, design_status: designDraft[j.id] } : j))
    const dutyClaims = applyDutyDraft(dutyClaimsProp, dutyDraft)

    // ความพร้อมข้อ 5 (กระเป๋า) — ต้องรู้ใบงานหน้างาน (ถูกข้ามไหม) + การจองของงานนั้น
    const kitReadiness = kitReadinessByLead(rows, jobs, kitBookings)

    // ความพร้อมข้อ 1 (ออกแบบ) — ตัดสินจากใบงานกราฟิกทุกใบของงาน ไม่ใช่ค่าระดับงานอีกแล้ว
    // งานที่ยังไม่เปิดใบงานกราฟิกเลยไม่อยู่ใน map → อ่านเป็น false (ยังไม่เปิดใบงาน = ขาดออกแบบ)
    const readyByJobs = designReadyByLead(jobs)
    const designReady = new Map(rows.map(r => [r.id, readyByJobs.get(r.id) ?? false]))

    // ใบงานของแต่ละงาน — ใบแรกของแต่ละฝ่ายต่อหนึ่งงาน (ตารางภาพรวมใช้ใบกราฟิกล็อกคอลัมน์ "ออกแบบ")
    const active = (job: PoolJob) => job.status !== 'done' && job.status !== 'skipped'
    const jobsByLead = new Map<string, { graphic?: PoolJob; onsite?: PoolJob; graphicActive: number }>()
    for (const j of jobs) {
        if (!j.crm_lead_id) continue
        const entry = jobsByLead.get(j.crm_lead_id) ?? { graphicActive: 0 }
        // งานเปิดใบงานกราฟิกได้หลายใบ — ช่องออกแบบยึดใบที่ยังไม่จบเป็นหลัก (ใบจบ/ข้ามแพ้ใบที่ยังทำอยู่)
        if (j.job_type === 'graphic') {
            if (active(j)) entry.graphicActive += 1
            if (!entry.graphic || (!active(entry.graphic) && active(j))) entry.graphic = j
        }
        if (j.job_type === 'onsite' && !entry.onsite) entry.onsite = j
        jobsByLead.set(j.crm_lead_id, entry)
    }

    // คอลัมน์ "ออกแบบ" ไล่เป็นขั้น: ยังไม่เปิดใบงาน (ป้ายเตือน) → รอรับงาน (ปุ่มรับ) → ตัวแก้สถานะออกแบบ
    // งานที่ยังไม่มีใบงานกราฟิก (รวมงานเก่าก่อนยุคพูล) ไม่ได้ตัวแก้ไข แต่ชี้ไปเปิดใบงานที่การ์ด CRM
    // สิทธิ์แผนก/แอดมินบังคับใน claimPoolJob ฝั่ง server · หน้าที่เตรียมงานใช้ dutyGate ตามเดิม
    const designGate = (lead: TrackingLead) => {
        const entry = jobsByLead.get(lead.id)
        const job = entry?.graphic
        const state = designCellState(job)
        if (state === 'not_opened') return <NotOpenedPill leadId={lead.id} />
        if (state === 'awaiting') {
            return (
                <ClaimChip
                    job={job!}
                    kind="graphic"
                    gate={gateOf('graphic')}
                    emphasis={emphasis.has(job!.id)}
                    people={people}
                    currentUserId={currentUserId}
                    onClaim={onClaimJob}
                />
            )
        }
        const others = (entry?.graphicActive ?? 0) - 1
        return (
            <div className="space-y-1">
                <DesignCell job={job!} lead={lead} onChange={saveJobDesign} />
                {others > 0 && <MoreGraphicJobsLink count={others} />}
                <ReleaseChip job={job} currentUserId={currentUserId} canManagePool={canManagePool} onRelease={onReleaseJob} />
            </div>
        )
    }

    // หน้าที่เตรียมงาน: จัดคน/จัดรถ/กระเป๋า ถูกล็อกจนกว่าจะมีคนกดรับ "หน้าที่นั้น" — รับแยกกันคนละหน้าที่
    // ไม่ผูกกับใบงานหน้างาน งานเก่าที่ไม่มีใบงานจึงล็อกและกดรับได้เหมือนกัน (ไม่มีทางลัดแบบ backward compat)
    const claimByDuty = new Map(dutyClaims.map(c => [dutyKey(c.leadId, c.duty), c]))

    /**
     * แก้ของหน้าที่นี้ได้ไหม — ผู้รับหน้าที่เองหรือแอดมิน/ฝ่ายประสานงานเท่านั้น (D3)
     * ไทม์ไลน์ใช้ปิดการคลิกจัดคน/จัดรถ (server ปฏิเสธซ้ำอีกชั้นด้วย requireDutyHolder)
     */
    const canEditDuty = (leadId: string, duty: PrepDuty) =>
        canManagePool || (!!currentUserId && claimByDuty.get(dutyKey(leadId, duty))?.claimedBy === currentUserId)

    const dutyGate = (lead: TrackingLead, duty: PrepDuty, children: ReactNode) => (
        <DutyGate
            leadId={lead.id}
            duty={duty}
            claim={claimByDuty.get(dutyKey(lead.id, duty))}
            gate={gateOf(duty)}
            emphasis={emphasis.has(dutyKey(lead.id, duty))}
            people={people}
            currentUserId={currentUserId}
            canManagePool={canManagePool}
            summary={dutySummary(lead, duty, people, kitReadiness)}
            onClaim={onClaimDuty}
            onRelease={onReleaseDuty}
        >
            {children}
        </DutyGate>
    )

    /** เพิ่งกดรับหน้าที่นี้ (draft ยังรอ server ตามมา) — เปิดเครื่องมือให้เองตอนช่องสลับเป็นตัวแก้ไข */
    const justClaimedDuty = (leadId: string, duty: PrepDuty) => !!dutyDraft[dutyKey(leadId, duty)]

    /**
     * การ์ดมือถือ: หน้าที่ที่ฉันแก้ได้ (ผู้รับ/manager) หรือยังรับได้ = แสดงเต็มเหมือนเดิม
     * ที่เหลือ (คนอื่นรับไปแล้ว / แผนกฉันรับไม่ได้) ยุบเป็นบรรทัดเดียว แตะเพื่อขยาย (เนื้อในอ่านอย่างเดียวตาม D3)
     */
    const mobileDuty = (lead: TrackingLead, duty: PrepDuty, editor: ReactNode, eventId?: string) => {
        const label = DUTY_LABELS_TH[duty]
        const claim = claimByDuty.get(dutyKey(lead.id, duty))
        const gate = gateOf(duty)
        if (canEditDuty(lead.id, duty) || (!claim && gate?.allowed !== false)) {
            return (
                <div>
                    <div className="text-[11px] text-zinc-500">{label}</div>
                    {dutyGate(lead, duty, editor)}
                </div>
            )
        }
        const key = `${dutyKey(lead.id, duty)}:${eventId ?? ''}`
        const open = expanded.has(key)
        return (
            <div>
                <button
                    type="button"
                    aria-expanded={open}
                    onClick={() =>
                        setExpanded(prev => {
                            const next = new Set(prev)
                            if (!next.delete(key)) next.add(key)
                            return next
                        })
                    }
                    className="flex w-full items-center gap-1 text-left"
                >
                    <ChevronRight className={cn('h-3.5 w-3.5 shrink-0 text-zinc-400 transition-transform', open && 'rotate-90')} aria-hidden />
                    <span className="shrink-0 text-[11px] text-zinc-500">{label}</span>
                    <div className="flex min-w-0 flex-1 items-center gap-1 truncate text-xs text-zinc-500">
                        {dutySummary(lead, duty, people, kitReadiness)}
                        <span className="truncate">
                            {claim ? `· ผู้รับ: ${nameOf(claim.claimedBy, people)}` : gate ? `· ${gate.waitingFor}` : ''}
                        </span>
                    </div>
                </button>
                {open && dutyGate(lead, duty, editor)}
            </div>
        )
    }

    const base = rows.filter(r => showPast || !isPast(r, today))
    const counts = chipCounts(base, today, kitReadiness, designReady)

    // งานที่ยังไม่เปิดใบงานกราฟิกเลยสักใบ — ตัวนับเตือน + ตัวกรอง (คนละเรื่องกับใบที่เปิดแล้วแต่ยังรอรับ)
    const notOpenedGraphic = (r: TrackingLead) => !jobsByLead.get(r.id)?.graphic
    const notOpenedCount = base.filter(notOpenedGraphic).length

    const chipVisible = chip ? base.filter(r => inChip(r, chip, today)) : base
    const visible = notOpenedOnly ? chipVisible.filter(notOpenedGraphic) : chipVisible

    // ปุ่มที่ควรเรืองแสง: งานที่ใกล้วันงานที่สุดของแต่ละคอลัมน์ในชุดที่มองเห็น (คอลัมน์ละหนึ่งปุ่ม)
    // อ่านจาก designGate/dutyGate ข้างบน — ทั้งสองถูกเรียกตอน render JSX ข้างล่างนี้แล้ว
    const claimCandidates: ClaimCandidate[] = []
    for (const lead of visible) {
        const graphic = jobsByLead.get(lead.id)?.graphic
        if (graphic?.status === AWAITING_CLAIM_STATUS) {
            claimCandidates.push({ key: graphic.id, kind: 'graphic', date: lead.event_date })
        }
        for (const duty of PREP_DUTIES) {
            const key = dutyKey(lead.id, duty)
            if (!claimByDuty.has(key)) claimCandidates.push({ key, kind: duty, date: lead.event_date })
        }
    }
    const emphasis = emphasizedClaims(claimCandidates)

    // แถบ "ของฉัน" — คิดจากชุดที่โหลดมา (base) งานที่ผ่านแล้วจึงไม่โผล่มาเกะกะ
    // ไม่รู้แผนกของแต่ละจุด (props เก่า) = ปล่อยให้รับได้เหมือน gateOf (สิทธิ์จริงบังคับฝั่ง server)
    const queue = myQueue({
        leads: base,
        jobs,
        dutyClaims,
        currentUserId,
        myDepartment,
        isAdmin: isAdmin || !poolDepartments,
        poolDepartments: poolDepartments ?? NO_POOL_DEPARTMENTS,
        today,
        kitReadiness,
        designReady,
        roleLabels,
    })

    /** "ไปที่งาน" — ล้างตัวกรองให้แถวโผล่แน่ๆ แล้วไฮไลต์/เลื่อนจอด้วยเส้นทางเดียวกับ ?lead= จากกระดิ่ง */
    const goToLead = (leadId: string) => {
        setChip(null)
        setNotOpenedOnly(false)
        scrolledRow.current = false
        scrolledCard.current = false
        setParams({ lead: leadId })
    }

    /** ปุ่มรับในแถบ "ของฉัน" — ใบงานวิ่งผ่าน onClaimJob หน้าที่เตรียมงานวิ่งผ่าน onClaimDuty (optimistic ทั้งคู่) */
    const onClaimQueueItem = (item: MyQueueItem) => {
        if (item.kind === 'graphic' || item.kind === 'onsite') {
            if (item.jobId) onClaimJob(item.jobId)
            return
        }
        onClaimDuty(item.leadId, item.kind)
    }

    const undated = visible.filter(r => !r.event_date)
    const sections: { key: string; label: string; leads: TrackingLead[] }[] = [
        ...groupLeads(visible, today),
        ...(undated.length > 0 ? [{ key: 'undated', label: 'ยังไม่กำหนดวัน', leads: undated }] : []),
    ]

    let seq = 0

    // พูลงาน: ใบงานที่ยังไม่จบ/ไม่ถูกข้าม แยกตามฝ่าย
    const pool = groupPoolJobs(jobs)
    const poolJobs = tab === 'graphic' ? pool.graphic : pool.onsite

    /** ตัวเลขบนป้ายแท็บ = "รอรับ N · รับแล้ว M" ของแท็บนั้น (รับได้ทั้งสองแท็บแล้ว — D2) */
    const tabCount = (key: PoolTab): { waiting: number; claimed: number } => {
        if (key === 'graphic' || key === 'onsite') {
            const list = key === 'graphic' ? pool.graphic : pool.onsite
            const waiting = list.filter(j => j.status === AWAITING_CLAIM_STATUS).length
            return { waiting, claimed: list.length - waiting }
        }
        if (!isDutyTab(key)) return { waiting: 0, claimed: 0 }
        return {
            waiting: unclaimedDutyCount(base, key, claimByDuty),
            claimed: claimedDutyCount(base, key, claimByDuty),
        }
    }

    // ชิปย่อยของพูลงาน (หน้างานเฉพาะแอดมิน) — ป้ายบนแท็บ "พูลงาน" = รอรับรวมทุกชิปที่เห็น
    const poolChips = POOL_CHIPS.filter(c => c.key !== 'onsite' || isAdmin)
    const poolWaiting = poolChips.reduce((n, c) => n + tabCount(c.key).waiting, 0)

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">ติดตามงาน</h1>
                {tab === 'overview' ? (
                    <p className="text-sm text-zinc-500">
                        งาน {visible.length} งาน · ยังไม่พร้อม {visible.filter(r => getMissing(r, kitReadiness.get(r.id), designReady.get(r.id)).length > 0).length} งาน
                        {notOpenedCount > 0 && <span className="text-amber-600 dark:text-amber-400">{' · ยังไม่เปิดใบงานกราฟิก '}{notOpenedCount} งาน</span>}
                        {' — ดูว่างานไหนใกล้ถึง อยู่ขั้นไหน และยังขาดอะไร'}
                    </p>
                ) : isDutyTab(tab) ? (
                    <p className="text-sm text-zinc-500">
                        พูลงาน · ใบงาน{DUTY_LABELS_TH[tab]} รับแล้ว {claimedDutyCount(base, tab, claimByDuty)} งาน — อีก {unclaimedDutyCount(base, tab, claimByDuty)} งานรอรับ (กดรับได้ที่นี่)
                    </p>
                ) : (
                    <p className="text-sm text-zinc-500">
                        พูลงาน · {tab === 'graphic' ? 'ใบงานกราฟิก' : 'ใบงานหน้างาน'} รับแล้ว {poolJobs.filter(j => j.status !== AWAITING_CLAIM_STATUS).length} ใบ — อีก {poolJobs.filter(j => j.status === AWAITING_CLAIM_STATUS).length} ใบรอรับ (กดรับได้ที่นี่)
                    </p>
                )}
            </div>

            {/* แท็บหลักเหลือ 2 อัน — รายฝ่ายย้ายลงไปเป็นชิปใต้ "พูลงาน" (?tab= ค่าเดิมทุกค่ายังใช้ได้) */}
            <div className="flex items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
                <button
                    type="button"
                    aria-pressed={tab === 'overview'}
                    onClick={() => setParams({ tab: null })}
                    className={tabCls(tab === 'overview')}
                >
                    ภาพรวม
                </button>
                <button
                    type="button"
                    aria-pressed={tab !== 'overview'}
                    onClick={() => setParams({ tab: tab === 'overview' ? 'graphic' : tab })}
                    className={tabCls(tab !== 'overview')}
                >
                    พูลงาน
                    {poolWaiting > 0 && (
                        <span className="ml-1 text-xs font-semibold text-amber-600 dark:text-amber-400">รอรับ {poolWaiting}</span>
                    )}
                </button>

                {/* สลับ ตาราง / ไทม์ไลน์ อยู่ท้ายแถบแท็บ (เฉพาะภาพรวม) — ไม่กินอีกแถว */}
                {tab === 'overview' && (
                    <div className="ml-auto mb-1 flex shrink-0 rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-800">
                        {([
                            { key: 'table', label: 'ตาราง', go: () => setParams({ view: null, date: null, mode: null, dept: null, focus: null }) },
                            { key: 'timeline', label: 'ไทม์ไลน์', go: () => setParams({ view: 'timeline', date, mode }) },
                        ] as const).map(o => (
                            <button
                                key={o.key}
                                type="button"
                                aria-pressed={view === o.key}
                                onClick={o.go}
                                className={cn(
                                    'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                                    view === o.key
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'
                                )}
                            >
                                {o.label}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* มือถือ: ชิปเลื่อนแนวนอน ไม่หักบรรทัด — จอกว้างค่อยยอมให้ wrap */}
            {tab !== 'overview' && (
                <div className="flex flex-nowrap overflow-x-auto md:flex-wrap md:overflow-x-visible items-center gap-1 [&>button]:shrink-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {poolChips.map(c => {
                        const count = tabCount(c.key)
                        const active = tab === c.key
                        return (
                            <button
                                key={c.key}
                                type="button"
                                aria-pressed={active}
                                onClick={() => setParams({ tab: c.key })}
                                className={cn(
                                    'rounded-full px-3 py-1 text-sm whitespace-nowrap',
                                    active
                                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                        : 'border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                                )}
                            >
                                {c.label}{' '}
                                <span className={cn('text-[11px] font-normal', active ? 'opacity-70' : 'text-zinc-400')}>
                                    <span className={cn(count.waiting > 0 && 'font-semibold text-amber-500')}>
                                        รอรับ {count.waiting}
                                    </span>
                                    {' · รับแล้ว '}{count.claimed}
                                </span>
                            </button>
                        )
                    })}
                </div>
            )}

            {tab === 'graphic' || tab === 'onsite' ? (
                <PoolTabs
                    kind={tab}
                    jobs={poolJobs}
                    leads={rows}
                    gate={gateOf(tab)}
                    highlightLeadId={highlightLeadId}
                    people={people}
                    roleLabels={roleLabels}
                    statusLabels={jobStatusLabels}
                    today={today}
                    currentUserId={currentUserId}
                    canManagePool={canManagePool}
                    kits={kits}
                    kitBookings={kitBookings}
                    kitReadiness={kitReadiness}
                    designReady={designReady}
                    canManageKits={canManageKits}
                    onJobDesignStatusChange={saveJobDesign}
                    onClaimJob={onClaimJob}
                    onReleaseJob={onReleaseJob}
                />
            ) : isDutyTab(tab) ? (
                <DutyTab
                    duty={tab}
                    leads={base}
                    all={rows}
                    gate={gateOf(tab)}
                    highlightLeadId={highlightLeadId}
                    people={people}
                    roles={roles}
                    roleLabels={roleLabels}
                    today={today}
                    claimByDuty={claimByDuty}
                    currentUserId={currentUserId}
                    canManagePool={canManagePool}
                    kits={kits}
                    kitBookings={kitBookings}
                    kitReadiness={kitReadiness}
                    canManageKits={canManageKits}
                    onVehicleSaved={syncVehicle}
                    onStaffSaved={onStaffSaved}
                    onRequiredRolesSaved={onRequiredRolesSaved}
                    onClaimDuty={onClaimDuty}
                    onReleaseDuty={onReleaseDuty}
                    justClaimed={leadId => justClaimedDuty(leadId, tab)}
                />
            ) : (
                <>
            <MyQueueStrip
                mine={queue.mine}
                claimable={queue.claimable}
                gateOf={gateOf}
                onGo={goToLead}
                onClaim={onClaimQueueItem}
                onSeeAll={kind => setParams({ tab: kind === 'onsite' && !isAdmin ? 'graphic' : kind })}
            />

            {view === 'table' ? (
                <>
            <div className="flex flex-wrap items-center gap-2">
                {CHIPS.map(c => {
                    const active = chip === c.chip
                    const { total, notReady } = counts[c.chip]
                    return (
                        <button
                            key={c.chip}
                            type="button"
                            aria-pressed={active}
                            onClick={() => setChip(active ? null : c.chip)}
                            className={cn(
                                'rounded-full px-3 py-1 text-sm',
                                active
                                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                    : 'border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                            )}
                        >
                            {c.label} {total} งาน
                            {notReady > 0 && (
                                <span className={cn(active ? 'text-rose-400' : 'text-rose-600 dark:text-rose-400')}>
                                    {' · ยังไม่พร้อม '}{notReady}
                                </span>
                            )}
                        </button>
                    )
                })}
                {notOpenedCount > 0 && (
                    <button
                        type="button"
                        aria-pressed={notOpenedOnly}
                        onClick={() => setNotOpenedOnly(v => !v)}
                        className={cn(
                            'rounded-full px-3 py-1 text-sm',
                            notOpenedOnly
                                ? 'bg-amber-500 text-white'
                                : 'border border-amber-300 text-amber-700 dark:border-amber-800 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                        )}
                    >
                        ยังไม่เปิดใบงานกราฟิก {notOpenedCount} งาน
                    </button>
                )}
                {/* งานที่จบไปเกิน 30 วัน ไม่ถูกโหลดมาตั้งแต่ต้น — กดแสดงแล้วต้องขอ server โหลดเพิ่มด้วย (?past=1) */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        if (showPast) {
                            setShowPast(false)
                            setParams({ past: null })
                        } else {
                            if (!pastLoaded) setParams({ past: '1' })
                            setShowPast(true)
                        }
                    }}
                >
                    {showPast ? 'ซ่อนงานที่ผ่านแล้ว' : 'แสดงงานที่ผ่านแล้ว'}
                </Button>
            </div>

            <div className="hidden md:block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 overflow-hidden shadow-sm">
                <Table>
                    <TableHeader>
                        <TableRow className="bg-zinc-50/80 dark:bg-zinc-900/50 hover:bg-zinc-50/80 dark:hover:bg-zinc-900/50 [&_th]:h-10 [&_th]:text-[11px] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-zinc-500 dark:[&_th]:text-zinc-400">
                            <TableHead className="w-12">ลำดับ</TableHead>
                            <TableHead className="w-64">งาน</TableHead>
                            <TableHead className="w-48">ออกแบบ</TableHead>
                            <TableHead className="w-28">ซัพพลายเออร์</TableHead>
                            <TableHead className="w-48">จัดคน</TableHead>
                            <TableHead className="w-44">จัดรถ</TableHead>
                            <TableHead className="w-40">กระเป๋า</TableHead>
                            <TableHead className="w-56">ความพร้อม</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center text-sm text-zinc-500 py-10">
                                    ยังไม่มีงานที่ตอบรับ
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.length > 0 && visible.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={8} className="text-center text-sm text-zinc-500 py-10">
                                    ไม่มีงานในช่วงนี้
                                </TableCell>
                            </TableRow>
                        )}
                        {sections.map(section => (
                            <Fragment key={section.key}>
                                <TableRow className="hover:bg-transparent">
                                    <TableCell colSpan={8} className="bg-zinc-100/70 dark:bg-zinc-900/80 border-y border-zinc-200/70 dark:border-zinc-800 py-1.5">
                                        <span className="inline-flex items-center gap-2 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                                            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400 dark:bg-zinc-500" aria-hidden />
                                            {section.label}
                                            <span className="font-normal text-zinc-400 tabular-nums">({section.leads.length})</span>
                                        </span>
                                    </TableCell>
                                </TableRow>
                                {section.leads.map((lead, i, arr) => {
                                    seq += 1
                                    const urgent = isUrgent(lead, today, kitReadiness.get(lead.id), designReady.get(lead.id))
                                    // ตีกรอบงานวันเดียวกัน (เฉพาะวันที่มี >= 2 งาน)
                                    const sameAsPrev = i > 0 && arr[i - 1].event_date === lead.event_date
                                    const sameAsNext = i < arr.length - 1 && arr[i + 1].event_date === lead.event_date
                                    const framed = sameAsPrev || sameAsNext
                                    // งานหลายอีเวนต์: แถวหัวแสดงวัน/ลูกค้า + ช่องระดับงาน (ออกแบบ/ซัพพลายเออร์/ความพร้อม ยืด rowSpan)
                                    // แล้วหนึ่งแถวต่ออีเวนต์ — ชื่ออีเวนต์อยู่คอลัมน์ "งาน" ปุ่มจัดคน/จัดรถ/กระเป๋าเรียงแถวเดียวกัน
                                    const multi = lead.events.length >= 2
                                    const span = lead.events.length + 1
                                    // ลิงก์จากกระดิ่ง/แผงเตือน/การ์ด CRM (?lead=) — แถวของงานนี้ได้กรอบแดงและถูกเลื่อนจอไปหา
                                    const highlighted = lead.id === highlightLeadId
                                    const rowCls = (first: boolean, last: boolean, sub: boolean) => cn(
                                        'transition-colors [&_td]:py-3 [&_td]:align-top hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40',
                                        framed && DAY_FRAME,
                                        framed && !sameAsPrev && first && 'border-t-2 border-t-zinc-300 dark:border-t-zinc-600',
                                        framed && !sameAsNext && last && 'border-b-2 border-b-zinc-300 dark:border-b-zinc-600',
                                        // แถวรายอีเวนต์ของงานเดียวกันติดกันเป็นก้อน: ไม่มีเส้นคั่น + พื้นจางกว่าแถวหัวนิดหน่อย
                                        sub && 'bg-zinc-50/50 dark:bg-zinc-900/20',
                                        !last && 'border-b-0',
                                        urgent && 'bg-rose-50/70 dark:bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-100/70 dark:hover:bg-rose-950/40',
                                        highlighted && 'bg-red-50 dark:bg-red-950/30 border-l-4 border-l-red-500 hover:bg-red-100/70 dark:hover:bg-red-950/50'
                                    )
                                    if (!multi) {
                                        return (
                                            <TableRow
                                                key={lead.id}
                                                ref={el => {
                                                    if (el && highlighted && !scrolledRow.current) {
                                                        scrolledRow.current = true
                                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                                    }
                                                }}
                                                className={rowCls(true, true, false)}
                                            >
                                                <TableCell className="text-xs text-zinc-400 tabular-nums pt-3.5">{seq}</TableCell>
                                                <TableCell><JobCell lead={lead} today={today} /></TableCell>
                                                <TableCell>{designGate(lead)}</TableCell>
                                                <TableCell><SupplierCell lead={lead} save={save} /></TableCell>
                                                <TableCell>{dutyGate(lead, 'staffing', <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} onRequiredRolesSaved={onRequiredRolesSaved} pinnedEventId={null} defaultOpen={justClaimedDuty(lead.id, 'staffing')} />)}</TableCell>
                                                <TableCell>{dutyGate(lead, 'vehicle', <VehicleCell lead={lead} all={rows} onSaved={syncVehicle} eventId={null} eventVehicles={eventVehicles} autoFocus={justClaimedDuty(lead.id, 'vehicle')} />)}</TableCell>
                                                <TableCell>{dutyGate(lead, 'kits', <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} eventId={null} defaultOpen={justClaimedDuty(lead.id, 'kits')} />)}</TableCell>
                                                <TableCell><ReadinessCell lead={lead} roleLabels={roleLabels} kit={kitReadiness.get(lead.id)} designReady={designReady.get(lead.id)} /></TableCell>
                                            </TableRow>
                                        )
                                    }
                                    return (
                                        <Fragment key={lead.id}>
                                            {/* แถวหัวของงาน — ช่องจัดคน/จัดรถ/กระเป๋าเว้นว่าง ไปอยู่แถวรายอีเวนต์ข้างล่าง */}
                                            <TableRow
                                                ref={el => {
                                                    if (el && highlighted && !scrolledRow.current) {
                                                        scrolledRow.current = true
                                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                                    }
                                                }}
                                                className={rowCls(true, false, false)}
                                            >
                                                <TableCell rowSpan={span} className="text-xs text-zinc-400 tabular-nums pt-3.5">{seq}</TableCell>
                                                <TableCell><JobCell lead={lead} today={today} showEvents={false} /></TableCell>
                                                <TableCell rowSpan={span}>{designGate(lead)}</TableCell>
                                                <TableCell rowSpan={span}><SupplierCell lead={lead} save={save} /></TableCell>
                                                <TableCell colSpan={3} />
                                                <TableCell rowSpan={span}><ReadinessCell lead={lead} roleLabels={roleLabels} kit={kitReadiness.get(lead.id)} designReady={designReady.get(lead.id)} /></TableCell>
                                            </TableRow>
                                            {lead.events.map((ev, si) => (
                                                <TableRow key={ev.id} className={rowCls(false, si === lead.events.length - 1, true)}>
                                                    <TableCell>
                                                        <Link
                                                            href={`/events/${ev.id}/check-kits`}
                                                            title="ไปหน้าเช็คของ/กระเป๋าของอีเวนต์นี้"
                                                            className="text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:underline"
                                                        >
                                                            {ev.name || 'ไม่ระบุชื่อ'} ↗
                                                        </Link>
                                                        {ev.event_date && <div className="text-[11px] text-zinc-400">{formatDate(ev.event_date)}</div>}
                                                    </TableCell>
                                                    <TableCell>{dutyGate(lead, 'staffing', <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} onRequiredRolesSaved={onRequiredRolesSaved} pinnedEventId={ev.id} defaultOpen={si === 0 && justClaimedDuty(lead.id, 'staffing')} />)}</TableCell>
                                                    {/* งานหลายอีเวนต์: เปิดให้เองเฉพาะแถวอีเวนต์แรก ไม่งั้นเด้งพร้อมกันทุกใบ */}
                                                    <TableCell>{dutyGate(lead, 'vehicle', <VehicleCell lead={lead} all={rows} onSaved={syncVehicle} eventId={ev.id} eventVehicles={eventVehicles} autoFocus={si === 0 && justClaimedDuty(lead.id, 'vehicle')} />)}</TableCell>
                                                    <TableCell>{dutyGate(lead, 'kits', <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} eventId={ev.id} defaultOpen={si === 0 && justClaimedDuty(lead.id, 'kits')} />)}</TableCell>
                                                </TableRow>
                                            ))}
                                        </Fragment>
                                    )
                                })}
                            </Fragment>
                        ))}
                    </TableBody>
                </Table>
            </div>

            <div className="md:hidden space-y-3">
                {rows.length === 0 && (
                    <p className="text-center text-sm text-zinc-500 py-10">ยังไม่มีงานที่ตอบรับ</p>
                )}
                {rows.length > 0 && visible.length === 0 && (
                    <p className="text-center text-sm text-zinc-500 py-10">ไม่มีงานในช่วงนี้</p>
                )}
                {sections.map(section => (
                    <div key={section.key} className="space-y-2">
                        <div className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 px-1">
                            {section.label} <span className="font-normal text-zinc-400">({section.leads.length})</span>
                        </div>
                        {runsByDate(section.leads).map(run => (
                        <div
                            key={run.key}
                            className={cn(run.leads.length > 1 && 'rounded-2xl border-2 border-zinc-300 dark:border-zinc-600 p-2 space-y-2')}
                        >
                        {run.leads.length > 1 && (
                            <div className="text-[11px] font-medium text-zinc-500 px-1">{formatDate(run.leads[0].event_date)} · {run.leads.length} งานวันเดียวกัน</div>
                        )}
                        {run.leads.map(lead => (
                            <div
                                key={lead.id}
                                ref={el => {
                                    if (el && lead.id === highlightLeadId && !scrolledCard.current) {
                                        scrolledCard.current = true
                                        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                    }
                                }}
                                className={cn(
                                    'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-2',
                                    isUrgent(lead, today, kitReadiness.get(lead.id), designReady.get(lead.id)) && 'border-l-4 border-l-rose-500 bg-rose-50/70 dark:bg-rose-950/20',
                                    lead.id === highlightLeadId && 'border-red-500 ring-2 ring-red-500/60 dark:border-red-500'
                                )}
                            >
                                <div className="space-y-1.5">
                                    <JobCell lead={lead} today={today} showEvents={lead.events.length <= 1} />
                                    {/* ป้ายยาวได้ (ขาด: ...) — อยู่บรรทัดของตัวเอง ไม่เบียดชื่องานจนล้นจอ */}
                                    <div><ReadinessCell lead={lead} roleLabels={roleLabels} kit={kitReadiness.get(lead.id)} designReady={designReady.get(lead.id)} /></div>
                                </div>

                                {lead.events.length >= 2 ? (
                                    /* งานหลายอีเวนต์ — จัดคน/จัดรถ/กระเป๋า ซ้อนเป็นก้อนละอีเวนต์ */
                                    <>
                                        <div>
                                            <div className="text-[11px] text-zinc-500">ออกแบบ</div>
                                            {designGate(lead)}
                                        </div>
                                        {lead.events.map((ev, si) => (
                                            <div key={ev.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 space-y-2">
                                                <EventLabel event={ev} />
                                                <div className="grid grid-cols-2 gap-2">
                                                    {mobileDuty(lead, 'vehicle', <VehicleCell lead={lead} all={rows} onSaved={syncVehicle} eventId={ev.id} eventVehicles={eventVehicles} autoFocus={si === 0 && justClaimedDuty(lead.id, 'vehicle')} />, ev.id)}
                                                    {mobileDuty(lead, 'kits', <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} eventId={ev.id} defaultOpen={si === 0 && justClaimedDuty(lead.id, 'kits')} />, ev.id)}
                                                </div>
                                                {mobileDuty(lead, 'staffing', <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} onRequiredRolesSaved={onRequiredRolesSaved} pinnedEventId={ev.id} defaultOpen={si === 0 && justClaimedDuty(lead.id, 'staffing')} />, ev.id)}
                                            </div>
                                        ))}
                                    </>
                                ) : (
                                    <>
                                {/* ออกแบบเต็มแถว (dropdown ยาว) — จัดรถ/กระเป๋าค่อยแบ่งครึ่ง */}
                                <div>
                                    <div className="text-[11px] text-zinc-500">ออกแบบ</div>
                                    {designGate(lead)}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    {mobileDuty(lead, 'vehicle', <VehicleCell lead={lead} all={rows} onSaved={syncVehicle} autoFocus={justClaimedDuty(lead.id, 'vehicle')} />)}
                                    {mobileDuty(lead, 'kits', <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} defaultOpen={justClaimedDuty(lead.id, 'kits')} />)}
                                </div>

                                {mobileDuty(lead, 'staffing', <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} onRequiredRolesSaved={onRequiredRolesSaved} defaultOpen={justClaimedDuty(lead.id, 'staffing')} />)}
                                    </>
                                )}

                                <div>
                                    <div className="text-[11px] text-zinc-500">ซัพพลายเออร์</div>
                                    <div className="flex items-center gap-1">
                                        <SupplierCell lead={lead} save={save} />
                                        {lead.supplier_note ? (
                                            <span className="text-sm truncate">{lead.supplier_note.split('\n')[0]}</span>
                                        ) : (
                                            <span className="text-sm text-zinc-400">ยังไม่ระบุ</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        </div>
                        ))}
                    </div>
                ))}
            </div>
                </>
            ) : (
                <TimelineView
                    rows={rows}
                    people={people}
                    roles={roles}
                    roleLabels={roleLabels}
                    today={today}
                    date={date}
                    mode={mode}
                    departments={departments}
                    kits={kits}
                    kitBookings={kitBookings}
                    focusLeadId={focusLeadId}
                    focusEventId={focusLead ? targetEventOf(focusLead) : null}
                    canEditDuty={canEditDuty}
                    onDateChange={changeDate}
                    onModeChange={m => setParams({ mode: m })}
                    onDepartmentsChange={d => setParams({ dept: d.length > 0 ? d.join(',') : null })}
                    onOpenDay={d => changeDate(d, { mode: 'day' })}
                    onEditStaff={id => setEditing({ leadId: id, kind: 'staff' })}
                    onEditVehicle={id => setEditing({ leadId: id, kind: 'vehicle' })}
                    onFocus={id => { setEventOverride(null); setParams({ focus: id }) }}
                    onFocusEventChange={setEventOverride}
                    onRequiredRolesChange={saveRequiredRoles}
                    onQuickAssign={(leadId, userId, role) => quickStaff(leadId, userId, role, true)}
                    onQuickRemove={(leadId, userId, role) => quickStaff(leadId, userId, role, false)}
                />
            )}
                </>
            )}

            {editingLead && editing?.kind === 'staff' && (
                <StaffEditor
                    key={editingLead.id}
                    lead={editingLead}
                    all={rows}
                    people={people}
                    roles={roles}
                    roleLabels={roleLabels}
                    onSaved={(id, staff, events, required) => { onStaffSaved(id, staff, events, required); setEditing(null) }}
                    onRequiredRolesSaved={onRequiredRolesSaved}
                    defaultOpen
                    hideTrigger
                    onClose={() => setEditing(null)}
                />
            )}
            {editingLead && editing?.kind === 'vehicle' && (
                <VehicleDialog lead={editingLead} all={rows} onSaved={syncVehicle} onClose={() => setEditing(null)} />
            )}
        </div>
    )
}
