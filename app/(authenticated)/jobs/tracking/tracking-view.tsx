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
import { AlertTriangle, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import { assignLeadStaff, updateJobDesignStatus, updateLeadTracking } from '../actions'
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
    PREP_DUTIES,
    DUTY_LABELS_TH,
    type TrackingLead,
    type Chip,
    type DutyClaim,
    type KitReadiness,
    type PoolJob,
    type PrepDuty,
} from './tracking-logic'
import TimelineView, { formatDate, ymd } from './timeline-view'
import PoolTabs, { ClaimChip, DutyGate, KitSummary, ReleaseChip, type JobStatusLabels, type KitBookingRow, type PoolKit } from './pool-tabs'
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
            {lead.events.length > 0 && (
                <div className="text-[11px] text-zinc-500 truncate">
                    อีเวนต์:{' '}
                    {lead.events.map((e, i) => (
                        <span key={e.id}>
                            {i > 0 && ' · '}
                            <Link
                                href={`/events/${e.id}/check-kits`}
                                title="ไปหน้าเช็คของ/กระเป๋าของอีเวนต์นี้"
                                className="hover:underline text-zinc-600 dark:text-zinc-300"
                            >
                                {e.name} ↗
                            </Link>
                        </span>
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

const POOL_TABS: { key: PoolTab; label: string }[] = [
    { key: 'overview', label: 'ภาพรวม' },
    { key: 'graphic', label: 'ใบงานกราฟิก' },
    ...PREP_DUTIES.map(duty => ({ key: duty as PoolTab, label: `ใบงาน${DUTY_LABELS_TH[duty]}` })),
    { key: 'onsite', label: 'ใบงานหน้างาน' },
]

const TAB_KEYS: readonly string[] = POOL_TABS.map(t => t.key)

/** ?tab ที่รู้จักเท่านั้น — ค่าอื่น (หรือไม่มี) = ภาพรวม */
function parseTab(value: string | null): PoolTab {
    return value && value !== 'overview' && TAB_KEYS.includes(value) ? (value as PoolTab) : 'overview'
}

/** แท็บใบงานรายหน้าที่เตรียมงาน (จัดคน/จัดรถ/จัดกระเป๋า) หรือเปล่า */
const isDutyTab = (tab: PoolTab): tab is PrepDuty => (PREP_DUTIES as readonly string[]).includes(tab)

export default function TrackingView({
    leads,
    roleLabels,
    roles,
    people,
    jobs: jobsProp = [],
    dutyClaims = [],
    jobStatusLabels = {},
    currentUserId = null,
    canManagePool = false,
    kits = [],
    kitBookings = [],
    canManageKits = false,
    isAdmin = false,
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
    /** แอดมิน/แผนกที่ดูแลกระเป๋า — จองและยกเลิกจองได้ */
    canManageKits?: boolean
    /** role = admin เท่านั้น — แท็บใบงานหน้างาน (หัวหน้างาน) แสดงเฉพาะแอดมิน */
    isAdmin?: boolean
}) {
    const [rows, setRows] = useState(leads)
    /**
     * สถานะออกแบบรายใบที่เพิ่งกด — ทับค่าจาก server จนกว่าข้อมูลรอบใหม่จะมาถึง (กันช่องกระพริบกลับค่าเดิม)
     * เก็บแยกจาก `jobs` เพื่อให้ค่าอื่นของใบงาน (รับ/คืน/ข้าม) ยังไหลมาจาก server ตามปกติ
     */
    const [designDraft, setDesignDraft] = useState<Record<string, string>>({})
    const [chip, setChip] = useState<Chip | null>(null)
    /** กรองเฉพาะงานที่ยังไม่เปิดใบงานกราฟิก (ชิปเตือนสีเหลือง) */
    const [notOpenedOnly, setNotOpenedOnly] = useState(false)
    const [showPast, setShowPast] = useState(false)
    const [, startTransition] = useTransition()
    /** ไทม์ไลน์: แถบที่กำลังแก้ (คน หรือ รถ) */
    const [editing, setEditing] = useState<{ leadId: string; kind: 'staff' | 'vehicle' } | null>(null)

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
    }) => {
        const p = new URLSearchParams(window.location.search)
        for (const [k, v] of Object.entries(patch)) {
            if (v === null) p.delete(k)
            else if (v !== undefined) p.set(k, v)
        }
        const qs = p.toString()
        router.replace(qs ? `?${qs}` : '?', { scroll: false })
    }

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

    // ใบงานที่หน้านี้ใช้ = ข้อมูลจาก server ทับด้วยสถานะออกแบบที่เพิ่งกด (ยังไม่ revalidate)
    const jobs: PoolJob[] = Object.keys(designDraft).length === 0
        ? jobsProp
        : jobsProp.map(j => (designDraft[j.id] ? { ...j, design_status: designDraft[j.id] } : j))

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
        if (state === 'awaiting') return <ClaimChip job={job!} people={people} currentUserId={currentUserId} />
        const others = (entry?.graphicActive ?? 0) - 1
        return (
            <div className="space-y-1">
                <DesignCell job={job!} lead={lead} onChange={saveJobDesign} />
                {others > 0 && <MoreGraphicJobsLink count={others} />}
                <ReleaseChip job={job} currentUserId={currentUserId} canManagePool={canManagePool} />
            </div>
        )
    }

    // หน้าที่เตรียมงาน: จัดคน/จัดรถ/กระเป๋า ถูกล็อกจนกว่าจะมีคนกดรับ "หน้าที่นั้น" — รับแยกกันคนละหน้าที่
    // ไม่ผูกกับใบงานหน้างาน งานเก่าที่ไม่มีใบงานจึงล็อกและกดรับได้เหมือนกัน (ไม่มีทางลัดแบบ backward compat)
    const claimByDuty = new Map(dutyClaims.map(c => [dutyKey(c.leadId, c.duty), c]))

    const dutyGate = (lead: TrackingLead, duty: PrepDuty, children: ReactNode) => (
        <DutyGate
            leadId={lead.id}
            duty={duty}
            claim={claimByDuty.get(dutyKey(lead.id, duty))}
            people={people}
            currentUserId={currentUserId}
            canManagePool={canManagePool}
            summary={dutySummary(lead, duty, people, kitReadiness)}
        >
            {children}
        </DutyGate>
    )

    const base = rows.filter(r => showPast || !isPast(r, today))
    const counts = chipCounts(base, today, kitReadiness, designReady)

    // งานที่ยังไม่เปิดใบงานกราฟิกเลยสักใบ — ตัวนับเตือน + ตัวกรอง (คนละเรื่องกับใบที่เปิดแล้วแต่ยังรอรับ)
    const notOpenedGraphic = (r: TrackingLead) => !jobsByLead.get(r.id)?.graphic
    const notOpenedCount = base.filter(notOpenedGraphic).length

    const chipVisible = chip ? base.filter(r => inChip(r, chip, today)) : base
    const visible = notOpenedOnly ? chipVisible.filter(notOpenedGraphic) : chipVisible

    const undated = visible.filter(r => !r.event_date)
    const sections: { key: string; label: string; leads: TrackingLead[] }[] = [
        ...groupLeads(visible, today),
        ...(undated.length > 0 ? [{ key: 'undated', label: 'ยังไม่กำหนดวัน', leads: undated }] : []),
    ]

    let seq = 0

    // พูลงาน: ใบงานที่ยังไม่จบ/ไม่ถูกข้าม แยกตามฝ่าย
    const pool = groupPoolJobs(jobs)
    const poolJobs = tab === 'graphic' ? pool.graphic : pool.onsite

    /** ตัวเลขบนป้ายแท็บ = ขนาดคิว "งานที่รับแล้ว" ของแท็บนั้น — งานที่ยังรอรับอยู่ที่ภาพรวม */
    const tabCount = (key: PoolTab): number => {
        if (key === 'graphic') return pool.graphic.filter(j => j.status !== 'awaiting_claim').length
        if (key === 'onsite') return pool.onsite.filter(j => j.status !== 'awaiting_claim').length
        return isDutyTab(key) ? claimedDutyCount(base, key, claimByDuty) : 0
    }

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
                        พูลงาน · ใบงาน{DUTY_LABELS_TH[tab]} รับแล้ว {claimedDutyCount(base, tab, claimByDuty)} งาน — อีก {unclaimedDutyCount(base, tab, claimByDuty)} งานรอรับที่แท็บภาพรวม
                    </p>
                ) : (
                    <p className="text-sm text-zinc-500">
                        พูลงาน · {tab === 'graphic' ? 'ใบงานกราฟิก' : 'ใบงานหน้างาน'} รับแล้ว {poolJobs.filter(j => j.status !== 'awaiting_claim').length} ใบ — อีก {poolJobs.filter(j => j.status === 'awaiting_claim').length} ใบรอรับที่แท็บภาพรวม
                    </p>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-1 border-b border-zinc-200 dark:border-zinc-800">
                {POOL_TABS.filter(t => t.key !== 'onsite' || isAdmin).map(t => (
                    <button
                        key={t.key}
                        type="button"
                        aria-pressed={tab === t.key}
                        onClick={() => setParams({ tab: t.key === 'overview' ? null : t.key })}
                        className={cn(
                            '-mb-px border-b-2 px-3 py-2 text-sm font-medium',
                            tab === t.key
                                ? 'border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100'
                                : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                        )}
                    >
                        {t.label}
                        {t.key !== 'overview' && (
                            <span className="ml-1 text-xs font-normal text-zinc-400">
                                ({tabCount(t.key)})
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {tab === 'graphic' || tab === 'onsite' ? (
                <PoolTabs
                    kind={tab}
                    jobs={poolJobs}
                    leads={rows}
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
                />
            ) : isDutyTab(tab) ? (
                <DutyTab
                    duty={tab}
                    leads={base}
                    all={rows}
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
                />
            ) : (
                <>
            <div className="flex items-center gap-1">
                <Button
                    variant={view === 'table' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setParams({ view: null, date: null, mode: null, dept: null, focus: null })}
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
                <Button variant="ghost" size="sm" onClick={() => setShowPast(p => !p)}>
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
                                    return (
                                        <TableRow
                                            key={lead.id}
                                            className={cn(
                                                'transition-colors [&_td]:py-3 [&_td]:align-top hover:bg-zinc-50/70 dark:hover:bg-zinc-900/40',
                                                framed && DAY_FRAME,
                                                framed && !sameAsPrev && 'border-t-2 border-t-zinc-300 dark:border-t-zinc-600',
                                                framed && !sameAsNext && 'border-b-2 border-b-zinc-300 dark:border-b-zinc-600',
                                                urgent && 'bg-rose-50/70 dark:bg-rose-950/20 border-l-4 border-l-rose-500 hover:bg-rose-100/70 dark:hover:bg-rose-950/40'
                                            )}
                                        >
                                            <TableCell className="text-xs text-zinc-400 tabular-nums pt-3.5">{seq}</TableCell>

                                            <TableCell>
                                                <JobCell lead={lead} today={today} />
                                            </TableCell>

                                            <TableCell>
                                                {designGate(lead)}
                                            </TableCell>

                                            <TableCell>
                                                <SupplierCell lead={lead} save={save} />
                                            </TableCell>

                                            <TableCell>
                                                {dutyGate(lead, 'staffing', <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} onRequiredRolesSaved={onRequiredRolesSaved} />)}
                                            </TableCell>

                                            <TableCell>
                                                {dutyGate(lead, 'vehicle', <VehicleCell lead={lead} all={rows} onSaved={syncVehicle} />)}
                                            </TableCell>

                                            <TableCell>
                                                {dutyGate(lead, 'kits', <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} />)}
                                            </TableCell>

                                            <TableCell>
                                                <ReadinessCell lead={lead} roleLabels={roleLabels} kit={kitReadiness.get(lead.id)} designReady={designReady.get(lead.id)} />
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
                                    isUrgent(lead, today, kitReadiness.get(lead.id), designReady.get(lead.id)) && 'border-l-4 border-l-rose-500 bg-rose-50/70 dark:bg-rose-950/20'
                                )}
                            >
                                <div className="flex justify-between items-start gap-2">
                                    <div>
                                        <JobCell lead={lead} today={today} />
                                    </div>
                                    <ReadinessCell lead={lead} roleLabels={roleLabels} kit={kitReadiness.get(lead.id)} designReady={designReady.get(lead.id)} />
                                </div>

                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <div className="text-[11px] text-zinc-500">ออกแบบ</div>
                                        {designGate(lead)}
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-zinc-500">จัดรถ</div>
                                        {dutyGate(lead, 'vehicle', <VehicleCell lead={lead} all={rows} onSaved={syncVehicle} />)}
                                    </div>
                                    <div>
                                        <div className="text-[11px] text-zinc-500">กระเป๋า</div>
                                        {dutyGate(lead, 'kits', <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} />)}
                                    </div>
                                </div>

                                <div>
                                    <div className="text-[11px] text-zinc-500">จัดคน</div>
                                    <StaffEditor lead={lead} all={rows} people={people} roles={roles} roleLabels={roleLabels} onSaved={onStaffSaved} onRequiredRolesSaved={onRequiredRolesSaved} />
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
