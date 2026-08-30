'use client'

import { Fragment, useState, useSyncExternalStore, useTransition } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Pencil, Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { assignLeadStaff, updateLeadTracking } from '../actions'
import {
    VEHICLES,
    daysUntil,
    isPast,
    groupLeads,
    inChip,
    chipCounts,
    getMissing,
    MISSING_LABELS,
    isUrgent,
    getConflicts,
    availabilityOf,
    personClashes,
    AVAILABILITY_LABELS,
    type TrackingLead,
    type Chip,
    type Conflict,
    type Availability,
} from './tracking-logic'
import TimelineView, { formatDate, ymd } from './timeline-view'

export type { TrackingLead }

// ponytail: hydration — วันนี้ตาม timezone ของ "เครื่องผู้ใช้" ไม่ใช่ของ server
// SSR ใช้ getServerSnapshot (โซนเวลา server) แล้ว snapshot ฝั่ง client ชนะหลัง hydrate
const subscribeNever = () => () => {}
const getTodayStr = () => ymd(new Date())

const DESIGN_OPTIONS = [
    { value: 'not_started', label: 'ยังไม่เริ่ม', className: '' },
    { value: 'waiting_info', label: 'ลูกค้ายังไม่ส่งข้อมูล', className: 'bg-rose-100 text-rose-900 dark:bg-rose-900/40 dark:text-rose-100' },
    { value: 'not_designed', label: 'ยังไม่ออกแบบ', className: 'bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100' },
    { value: 'in_progress', label: 'กำลังออกแบบ', className: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' },
    { value: 'customer_design', label: 'ลูกค้าออกแบบเอง', className: 'bg-violet-100 text-violet-900 dark:bg-violet-900/40 dark:text-violet-100' },
    { value: 'revising', label: 'กำลังแก้ไขงาน', className: 'bg-orange-100 text-orange-900 dark:bg-orange-900/40 dark:text-orange-100' },
    { value: 'sent', label: 'ส่งลูกค้าตรวจ', className: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-100' },
    { value: 'sent_email_cf', label: 'ส่งEmail+CFลูกค้า', className: 'bg-teal-100 text-teal-900 dark:bg-teal-900/40 dark:text-teal-100' },
    { value: 'completed', label: 'ส่งภาพ+เสร็จสมบูรณ์', className: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' },
]

const CHIPS: { chip: Chip; label: string }[] = [
    { chip: 'today', label: 'วันนี้' },
    { chip: 'week7', label: '7 วันนี้' },
    { chip: 'month', label: 'เดือนนี้' },
]

const PILL = 'inline-flex rounded-full px-2 py-0.5 text-xs font-medium'

const STATUS_CLASS: Record<Exclude<Availability, 'free'>, string> = {
    conflict: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    queued: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
    unknown: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

const AVAIL_TEXT: Record<Availability, string> = {
    free: 'text-emerald-600 dark:text-emerald-400',
    queued: 'text-amber-600 dark:text-amber-400',
    unknown: 'text-zinc-500 dark:text-zinc-400',
    conflict: 'text-rose-600 dark:text-rose-400',
}

export type Person = { id: string; name: string; nickname: string | null; department: string | null }
export type StaffRole = { value: string; label: string }
type Draft = { user_id: string; role: string }

function ConflictBadge({ conflict, showLabel }: { conflict: Conflict; showLabel?: boolean }) {
    return (
        <span
            className={cn('mt-1 inline-flex rounded-md px-1.5 py-0.5 text-[11px] font-medium', STATUS_CLASS[conflict.status])}
            title={`${conflict.label} — ${conflict.withLabel} ${conflict.withTime}`}
        >
            {AVAILABILITY_LABELS[conflict.status]}: {showLabel ? `${conflict.label} → ` : ''}{conflict.withLabel} {conflict.withTime}
        </span>
    )
}

function AvailabilityChip({ userId, lead, all }: { userId: string; lead: TrackingLead; all: TrackingLead[] }) {
    const av = availabilityOf(userId, lead, all)
    const clash = av === 'free' ? undefined : personClashes(userId, lead, all)[0]
    const detail = clash ? `${clash.withLabel} ${clash.withTime}`.trim() : ''
    return (
        <span className={cn('text-xs font-medium whitespace-nowrap', AVAIL_TEXT[av])} title={detail || undefined}>
            {AVAILABILITY_LABELS[av]}{detail ? ` · ${detail}` : ''}
        </span>
    )
}

// อีเวนต์ที่ถือคนของงานนี้ไว้มากที่สุด (เสมอกัน = อันแรก) คือค่าตั้งต้น
function defaultEventId(lead: TrackingLead): string | null {
    if (lead.events.length === 0) return null
    const count = (id: string) => lead.staff.filter(s => s.event_id === id).length
    return lead.events.reduce((best, e) => (count(e.id) > count(best.id) ? e : best), lead.events[0]).id
}

function draftFor(lead: TrackingLead, eventId: string | null): Draft[] {
    return eventId === null ? [] : lead.staff.filter(s => s.event_id === eventId).map(s => ({ user_id: s.user_id, role: s.role }))
}

/** ช่อง "จัดคน" — กดเปิด Dialog แล้วจัดคนรายตำแหน่ง พร้อมบอกว่าใครว่าง/ต่อคิว/ชน ในวันของงานนี้ */
function StaffEditor({ lead, all, people, roles, roleLabels, onSaved, defaultOpen = false, hideTrigger = false, onClose }: {
    lead: TrackingLead
    all: TrackingLead[]
    people: Person[]
    roles: StaffRole[]
    roleLabels: Record<string, string>
    onSaved: (leadId: string, staff: TrackingLead['staff'], events: TrackingLead['events']) => void
    /** เปิดทันทีตอน mount (ไทม์ไลน์คลิกแถบ) — คู่กับ hideTrigger/onClose */
    defaultOpen?: boolean
    hideTrigger?: boolean
    onClose?: () => void
}) {
    const [open, setOpen] = useState(defaultOpen)
    const [targetId, setTargetId] = useState<string | null>(() => defaultEventId(lead))
    const [draft, setDraft] = useState<Draft[]>(() => draftFor(lead, defaultEventId(lead)))
    const [onlyFree, setOnlyFree] = useState(false)
    const [saving, setSaving] = useState(false)
    const [addKey, setAddKey] = useState(0)

    const staff = lead.staff
    const staffConflicts = getConflicts(lead, all).filter(c => c.kind === 'staff')
    const personOf = (id: string) => people.find(p => p.id === id)

    const openChange = (o: boolean) => {
        if (o) {
            const t = defaultEventId(lead)
            setTargetId(t)
            setDraft(draftFor(lead, t))
            setOnlyFree(false)
        }
        setOpen(o)
        if (!o) onClose?.()
    }

    // ตำแหน่งจาก settings + ตำแหน่งแปลกที่ยังค้างอยู่ใน draft (กันคนหายไปเงียบๆ)
    const sections: StaffRole[] = [
        ...roles,
        ...draft
            .filter(d => !roles.some(r => r.value === d.role))
            .map(d => ({ value: d.role, label: roleLabels[d.role] || d.role }))
            .filter((r, i, arr) => arr.findIndex(x => x.value === r.value) === i),
    ]

    const handleSave = async () => {
        setSaving(true)
        const res = await assignLeadStaff(lead.id, targetId, draft)
        setSaving(false)
        if (!res || 'error' in res) {
            toast.error(res?.error || 'บันทึกไม่สำเร็จ')
            return
        }
        const eventId = String(res.eventId)
        const mergedStaff: TrackingLead['staff'] = [
            ...staff.filter(s => s.event_id !== eventId),
            ...draft.map(d => ({
                user_id: d.user_id,
                name: personOf(d.user_id)?.name || d.user_id,
                nickname: personOf(d.user_id)?.nickname ?? null,
                role: d.role,
                event_id: eventId,
            })),
        ]
        const mergedEvents: TrackingLead['events'] = lead.events.some(e => e.id === eventId)
            ? lead.events
            : [...lead.events, { id: eventId, name: '', event_date: lead.event_date, status: null }]
        onSaved(lead.id, mergedStaff, mergedEvents)
        openChange(false)
    }

    const timeLabel = lead.event_time ? `${lead.event_time}–${lead.event_end_time ?? ''} น.` : ''

    return (
        <div>
            <Dialog open={open} onOpenChange={openChange}>
                {!hideTrigger && (
                    <DialogTrigger asChild>
                        <button
                            type="button"
                            title="แก้ไขการจัดคน"
                            className="text-left w-full rounded-md px-1 -mx-1 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                        >
                            {staff.length === 0 ? (
                                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                                    <Users className="h-3.5 w-3.5" /> ยังไม่จัดคน
                                </span>
                            ) : (
                                <>
                                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                                        <Users className="h-3.5 w-3.5 text-zinc-500" /> {staff.length} คน
                                    </span>
                                    <div className="text-xs text-zinc-500 truncate">
                                        {staff.map(s => s.nickname || s.name).join(', ')}
                                    </div>
                                </>
                            )}
                        </button>
                    </DialogTrigger>
                )}

                <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>
                            จัดคน — {lead.customer_name || 'ไม่ระบุลูกค้า'} · {formatDate(lead.event_date)} {timeLabel}
                        </DialogTitle>
                    </DialogHeader>

                    {lead.events.length === 0 && (
                        <p className="text-sm text-zinc-500">ยังไม่มีอีเวนต์ — จะสร้างให้อัตโนมัติเมื่อบันทึก</p>
                    )}
                    {lead.events.length === 1 && (
                        <p className="text-sm">
                            <span className="text-zinc-500">อีเวนต์: </span>
                            {lead.events[0].name || 'ไม่ระบุชื่อ'}
                        </p>
                    )}
                    {lead.events.length > 1 && (
                        <div className="space-y-1">
                            <div className="text-xs font-medium text-zinc-500">จัดเข้าอีเวนต์</div>
                            <Select value={targetId ?? undefined} onValueChange={v => { setTargetId(v); setDraft(draftFor(lead, v)) }}>
                                <SelectTrigger className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {lead.events.map(e => (
                                        <SelectItem key={e.id} value={e.id}>
                                            {e.name || 'ไม่ระบุชื่อ'} · {formatDate(e.event_date)}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-zinc-500">แก้เฉพาะคนของอีเวนต์นี้ — คนของอีเวนต์อื่นในงานเดียวกันไม่ถูกแตะ</p>
                        </div>
                    )}

                    <div className="flex items-center gap-2">
                        <Checkbox
                            id={`only-free-${lead.id}`}
                            checked={onlyFree}
                            onCheckedChange={v => setOnlyFree(v === true)}
                        />
                        <label htmlFor={`only-free-${lead.id}`} className="text-sm">แสดงเฉพาะคนว่าง</label>
                    </div>

                    <div className="space-y-2">
                        {sections.map(role => {
                            const members = draft.filter(d => d.role === role.value)
                            const options = people
                                .filter(p => !members.some(m => m.user_id === p.id))
                                .filter(p => !onlyFree || availabilityOf(p.id, lead, all) !== 'conflict')
                            return (
                                <div key={role.value} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 space-y-1">
                                    <div className="text-xs font-medium text-zinc-500">{role.label} ({members.length})</div>
                                    {members.map(m => {
                                        const p = personOf(m.user_id)
                                        return (
                                            <div key={`${role.value}-${m.user_id}`} className="flex items-center gap-2 text-sm">
                                                <span className="flex-1 truncate">
                                                    {p?.nickname
                                                        ? <><span className="font-medium">{p.nickname}</span> | <span className="text-zinc-500">{p.name}</span></>
                                                        : (p?.name || m.user_id)}
                                                </span>
                                                <AvailabilityChip userId={m.user_id} lead={lead} all={all} />
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    aria-label={`เอา ${p?.nickname || p?.name || 'คนนี้'} ออก`}
                                                    onClick={() => setDraft(prev => prev.filter(d => !(d.user_id === m.user_id && d.role === role.value)))}
                                                >
                                                    <X className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        )
                                    })}
                                    <Select
                                        key={`${role.value}-${addKey}`}
                                        onValueChange={v => { setDraft(prev => [...prev, { user_id: v, role: role.value }]); setAddKey(k => k + 1) }}
                                    >
                                        <SelectTrigger className="w-full h-8">
                                            <SelectValue placeholder="เพิ่มคน" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {options.length === 0 && (
                                                <div className="px-2 py-1.5 text-xs text-zinc-500">ไม่มีคนให้เลือก</div>
                                            )}
                                            {options.map(p => {
                                                const av = availabilityOf(p.id, lead, all)
                                                return (
                                                    <SelectItem key={p.id} value={p.id}>
                                                        <span className="flex items-center gap-2">
                                                            <span>{p.nickname || p.name}</span>
                                                            <span className={cn('text-xs font-medium', AVAIL_TEXT[av])}>{AVAILABILITY_LABELS[av]}</span>
                                                        </span>
                                                    </SelectItem>
                                                )
                                            })}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )
                        })}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => openChange(false)} disabled={saving}>ยกเลิก</Button>
                        <Button onClick={handleSave} disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {!hideTrigger && staffConflicts.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                    {staffConflicts.slice(0, 2).map((c, i) => (
                        <ConflictBadge key={`${c.key}-${c.withLeadId}-${i}`} conflict={c} showLabel />
                    ))}
                    {staffConflicts.length > 2 && (
                        <span className="mt-1 text-[11px] text-zinc-500">+{staffConflicts.length - 2}</span>
                    )}
                </div>
            )}
        </div>
    )
}

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

function ReadinessCell({ lead }: { lead: TrackingLead }) {
    const missing = getMissing(lead)
    if (missing.length === 0) {
        return <span className={cn(PILL, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200')}>พร้อม</span>
    }
    return (
        <span className={cn(PILL, 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}>
            ขาด: {missing.map(m => MISSING_LABELS[m]).join(', ')}
        </span>
    )
}

type SaveFn = (
    id: string,
    patch: { design_status?: string; supplier_note?: string | null; tracking_checklist?: string[] }
) => void

function JobCell({ lead, today }: { lead: TrackingLead; today: Date }) {
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
        </>
    )
}

function DesignCell({ lead, save }: { lead: TrackingLead; save: SaveFn }) {
    return (
        <Select value={lead.design_status} onValueChange={v => save(lead.id, { design_status: v })}>
            <SelectTrigger className={cn('w-full', DESIGN_OPTIONS.find(o => o.value === lead.design_status)?.className)}>
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

function VehicleCell({ lead, all, save }: { lead: TrackingLead; all: TrackingLead[]; save: SaveFn }) {
    const vehicleConflict = getConflicts(lead, all).find(c => c.kind === 'vehicle')
    return (
        <div>
            <Select
                value={VEHICLES.find(v => lead.tracking_checklist.includes(v.key))?.key ?? 'none'}
                onValueChange={v => {
                    const rest = lead.tracking_checklist.filter(k => !VEHICLES.some(c => c.key === k))
                    save(lead.id, { tracking_checklist: v === 'none' ? rest : [...rest, v] })
                }}
            >
                <SelectTrigger className="w-full">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="none">ยังไม่จัดรถ</SelectItem>
                    {VEHICLES.map(c => (
                        <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {vehicleConflict && <ConflictBadge conflict={vehicleConflict} />}
        </div>
    )
}

/** ไทม์ไลน์: คลิกแถบในเลนรถ → เปิด VehicleCell เดิมใน Dialog */
function VehicleDialog({ lead, all, save, onClose }: { lead: TrackingLead; all: TrackingLead[]; save: SaveFn; onClose: () => void }) {
    return (
        <Dialog open onOpenChange={o => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-sm">
                <DialogHeader>
                    <DialogTitle>จัดรถ — {lead.customer_name || 'ไม่ระบุลูกค้า'} · {formatDate(lead.event_date)}</DialogTitle>
                </DialogHeader>
                <VehicleCell lead={lead} all={all} save={save} />
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

export default function TrackingView({
    leads,
    roleLabels,
    roles,
    people,
}: {
    leads: TrackingLead[]
    roleLabels: Record<string, string>
    roles: StaffRole[]
    people: Person[]
}) {
    const [rows, setRows] = useState(leads)
    const [chip, setChip] = useState<Chip | null>(null)
    const [showPast, setShowPast] = useState(false)
    const [, startTransition] = useTransition()
    /** ไทม์ไลน์: แถบที่กำลังแก้ (คน หรือ รถ) */
    const [editing, setEditing] = useState<{ leadId: string; kind: 'staff' | 'vehicle' } | null>(null)

    // client component: hydration mismatch is only possible exactly at midnight — acceptable
    const today = new Date()

    // สถานะมุมมองอยู่ใน URL: ?view=timeline&date=YYYY-MM-DD&mode=day|week
    const router = useRouter()
    const searchParams = useSearchParams()
    const view = searchParams.get('view') === 'timeline' ? 'timeline' : 'table'
    const mode = searchParams.get('mode') === 'week' ? 'week' : 'day'
    const dateParam = searchParams.get('date')
    const todayStr = useSyncExternalStore(subscribeNever, getTodayStr, getTodayStr)
    const date = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : todayStr

    /** patch บาง key — อ่านจาก URL จริงตอนคลิก ไม่ใช่ searchParams ของรอบ render (สองคลิกติดกันจะได้ไม่ทับกัน) */
    const setParams = (patch: { view?: string | null; date?: string | null; mode?: string | null }) => {
        const p = new URLSearchParams(window.location.search)
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) p.delete(k)
            else if (v !== undefined) p.set(k, v)
        }
        const qs = p.toString()
        router.replace(qs ? `?${qs}` : '?', { scroll: false })
    }

    const editingLead = editing ? rows.find(r => r.id === editing.leadId) ?? null : null

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

    const onStaffSaved = (id: string, staff: TrackingLead['staff'], events: TrackingLead['events']) => {
        setRows(prev => prev.map(r => (r.id === id ? { ...r, staff, events } : r)))
    }

    const base = rows.filter(r => showPast || !isPast(r, today))
    const counts = chipCounts(base, today)
    const visible = chip ? base.filter(r => inChip(r, chip, today)) : base

    const undated = visible.filter(r => !r.event_date)
    const sections: { key: string; label: string; leads: TrackingLead[] }[] = [
        ...groupLeads(visible, today),
        ...(undated.length > 0 ? [{ key: 'undated', label: 'ยังไม่กำหนดวัน', leads: undated }] : []),
    ]

    let seq = 0

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">ติดตามงาน</h1>
                <p className="text-sm text-zinc-500">
                    งาน {visible.length} งาน · ยังไม่พร้อม {visible.filter(r => getMissing(r).length > 0).length} งาน — ดูว่างานไหนใกล้ถึง อยู่ขั้นไหน และยังขาดอะไร
                </p>
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant={view === 'table' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setParams({ view: null, date: null, mode: null })}
                >
                    ตาราง
                </Button>
                <Button
                    variant={view === 'timeline' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setParams({ view: 'timeline', date, mode })}
                >
                    ไทม์ไลน์
                </Button>
            </div>

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
                <Button variant="ghost" size="sm" onClick={() => setShowPast(p => !p)}>
                    {showPast ? 'ซ่อนงานที่ผ่านแล้ว' : 'แสดงงานที่ผ่านแล้ว'}
                </Button>
            </div>

            <div className="hidden md:block rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-12">ลำดับ</TableHead>
                            <TableHead className="w-64">งาน</TableHead>
                            <TableHead className="w-48">ออกแบบ</TableHead>
                            <TableHead className="w-28">ซัพพลายเออร์</TableHead>
                            <TableHead className="w-48">จัดคน</TableHead>
                            <TableHead className="w-44">จัดรถ</TableHead>
                            <TableHead className="w-56">ความพร้อม</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {rows.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-sm text-zinc-500 py-10">
                                    ยังไม่มีงานที่ตอบรับ
                                </TableCell>
                            </TableRow>
                        )}
                        {rows.length > 0 && visible.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={7} className="text-center text-sm text-zinc-500 py-10">
                                    ไม่มีงานในช่วงนี้
                                </TableCell>
                            </TableRow>
                        )}
                        {sections.map(section => (
                            <Fragment key={section.key}>
                                <TableRow>
                                    <TableCell colSpan={7} className="bg-zinc-50 dark:bg-zinc-900/60 text-xs font-semibold text-zinc-600 dark:text-zinc-300 py-1.5">
                                        {section.label} <span className="font-normal text-zinc-400">({section.leads.length})</span>
                                    </TableCell>
                                </TableRow>
                                {section.leads.map((lead, i, arr) => {
                                    seq += 1
                                    const urgent = isUrgent(lead, today)
                                    // ตีกรอบงานวันเดียวกัน (เฉพาะวันที่มี >= 2 งาน)
                                    const sameAsPrev = i > 0 && arr[i - 1].event_date === lead.event_date
                                    const sameAsNext = i < arr.length - 1 && arr[i + 1].event_date === lead.event_date
                                    const framed = sameAsPrev || sameAsNext
                                    return (
                                        <TableRow
                                            key={lead.id}
                                            className={cn(
                                                framed && DAY_FRAME,
                                                framed && !sameAsPrev && 'border-t-2 border-t-zinc-300 dark:border-t-zinc-600',
                                                framed && !sameAsNext && 'border-b-2 border-b-zinc-300 dark:border-b-zinc-600',
                                                urgent && 'bg-rose-50/70 dark:bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-100/70 dark:hover:bg-rose-950/40'
                                            )}
                                        >
                                            <TableCell className="text-zinc-500">{seq}</TableCell>

                                            <TableCell>
                                                <JobCell lead={lead} today={today} />
                                            </TableCell>

                                            <TableCell>
                                                <DesignCell lead={lead} save={save} />
                                            </TableCell>

                                            <TableCell>
                                                <SupplierCell lead={lead} save={save} />
                                            </TableCell>

                                            <TableCell>
                                                <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} />
                                            </TableCell>

                                            <TableCell>
                                                <VehicleCell lead={lead} all={rows} save={save} />
                                            </TableCell>

                                            <TableCell>
                                                <ReadinessCell lead={lead} />
                                            </TableCell>
                                        </TableRow>
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
                                className={cn(
                                    'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-2',
                                    isUrgent(lead, today) && 'border-l-4 border-l-rose-500 bg-rose-50/70 dark:bg-rose-950/20'
                                )}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div>
                                        <JobCell lead={lead} today={today} />
                                    </div>
                                    <ReadinessCell lead={lead} />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="text-[11px] text-zinc-500">ออกแบบ</div>
                                        <DesignCell lead={lead} save={save} />
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-zinc-500">จัดรถ</div>
                                        <VehicleCell lead={lead} all={rows} save={save} />
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[11px] text-zinc-500">จัดคน</div>
                                    <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} />
                                </div>

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
                    roleLabels={roleLabels}
                    today={today}
                    date={date}
                    mode={mode}
                    onDateChange={d => setParams({ date: d })}
                    onModeChange={m => setParams({ mode: m })}
                    onOpenDay={d => setParams({ mode: 'day', date: d })}
                    onEditStaff={id => setEditing({ leadId: id, kind: 'staff' })}
                    onEditVehicle={id => setEditing({ leadId: id, kind: 'vehicle' })}
                />
            )}

            {editingLead && editing?.kind === 'staff' && (
                <StaffEditor
                    key={editingLead.id}
                    lead={editingLead}
                    all={rows}
                    people={people}
                    roles={roles}
                    roleLabels={roleLabels}
                    onSaved={(id, staff, events) => { onStaffSaved(id, staff, events); setEditing(null) }}
                    defaultOpen
                    hideTrigger
                    onClose={() => setEditing(null)}
                />
            )}
            {editingLead && editing?.kind === 'vehicle' && (
                <VehicleDialog lead={editingLead} all={rows} save={save} onClose={() => setEditing(null)} />
            )}
        </div>
    )
}
