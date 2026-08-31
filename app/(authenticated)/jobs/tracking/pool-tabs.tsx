'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Briefcase, UserRound, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { bookKitForLead, claimPoolJob, releasePoolJob, reassignPoolJob, skipPoolJob, unbookKitForLead } from '../actions'
import { DESIGN_OPTIONS } from './design-options'
import { formatDate } from './timeline-view'
import {
    VEHICLES,
    daysUntil,
    getMissing,
    kitBookingConflict,
    lacksTime,
    missingLabel,
    missingRoles,
    vehicleOf,
    type Kit as PoolKit,
    type KitBookingDetail as KitBookingRow,
    type KitReadiness,
    type Person,
    type PoolJob,
    type TrackingLead,
} from './tracking-logic'

/** กระเป๋าหนึ่งใบ / การจองหนึ่งครั้ง — ชื่อเดิมของหน้าพูล ตัวจริงอยู่ใน tracking-logic */
export type { PoolKit, KitBookingRow }

/** ป้ายสถานะใบงานที่ตั้งค่าไว้ใน job_settings — key คือ `${job_type}:${status}` */
export type JobStatusLabels = Record<string, { label: string; color: string | null }>

export type PoolKind = 'graphic' | 'onsite'

const PILL = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium'

const EMPTY_TEXT: Record<PoolKind, string> = {
    graphic: 'ยังไม่มีใบงานกราฟิกในพูล',
    onsite: 'ยังไม่มีใบงานหน้างานในพูล',
}

/** ใบงานคู่กับงานที่มันแตกออกมา — งานที่หาไม่เจอ (lead ถูกลบ/ปิด) ยังแสดงได้แบบไม่มีรายละเอียด */
type PoolRow = { job: PoolJob; lead: TrackingLead | null }

function StatusBadge({ job, statusLabels }: { job: PoolJob; statusLabels: JobStatusLabels }) {
    const status = statusLabels[`${job.job_type}:${job.status}`]
    return (
        <span className={cn(PILL, 'gap-1.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-200')}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: status?.color || '#a1a1aa' }} />
            {status?.label || job.status}
        </span>
    )
}

const nameOf = (id: string, people: Person[]) => {
    const p = people.find(x => x.id === id)
    return p ? p.nickname || p.name : id.slice(0, 8)
}

/**
 * ผู้รับใบงาน (claimed_by) + คนอื่นที่อยู่บนใบงาน — แปลงเป็นชื่อจากรายชื่อที่โหลดมาแล้ว
 * ใบงานหน้างาน: ผู้รับคือหัวหน้างานผู้รับผิดชอบ ส่วนลูกทีมมาจากการจัดคนตามปกติ
 */
function ClaimerLine({ job, kind, people }: { job: PoolJob; kind: PoolKind; people: Person[] }) {
    const claimer = job.claimed_by ? nameOf(job.claimed_by, people) : null
    const others = (job.assigned_to || [])
        .filter(id => id !== job.claimed_by)
        .map(id => nameOf(id, people))

    if (!claimer && others.length === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                <UserRound className="h-3.5 w-3.5" /> ยังไม่มีผู้รับ
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
            <UserRound className="h-3.5 w-3.5 text-zinc-500" />
            {claimer && (
                <span>
                    <span className="font-medium">{kind === 'onsite' ? 'หัวหน้างาน' : 'ผู้รับ'}:</span> {claimer}
                </span>
            )}
            {others.length > 0 && (
                <span className="text-zinc-500 truncate">
                    {claimer ? '· ' : ''}ทีม: {others.join(', ')}
                </span>
            )}
        </span>
    )
}

/**
 * ชิปรับงานแบบกะทัดรัดสำหรับตารางภาพรวม — หนึ่งชิปต่อหนึ่งใบงาน
 * รอรับ = ปุ่มรับงาน / รับแล้ว = ชื่อผู้รับ / ข้าม-เสร็จ = สถานะจาง
 * สิทธิ์จริงถูกบังคับใน claimPoolJob ฝั่ง server (คนผิดฝ่ายกดได้แต่จะเจอ error ภาษาไทย)
 */
export function ClaimChip({
    job,
    people,
    currentUserId,
}: {
    job: PoolJob | undefined
    people: Person[]
    currentUserId: string | null
}) {
    const [busy, setBusy] = useState(false)

    if (!job) return <span className="text-xs text-zinc-400">ยังไม่มีใบงาน</span>
    if (job.status === 'skipped') return <span className="text-xs text-zinc-400">ข้าม</span>

    if (job.status === 'awaiting_claim') {
        return (
            <Button
                size="sm"
                className="h-6 px-2 text-xs"
                disabled={busy}
                onClick={async () => {
                    setBusy(true)
                    try {
                        const res = (await claimPoolJob(job.id)) as { error?: string } | undefined
                        if (res?.error) toast.error(res.error)
                        else toast.success('รับงานแล้ว')
                    } finally {
                        setBusy(false)
                    }
                }}
            >
                รับงาน
            </Button>
        )
    }

    const claimer = job.claimed_by ? nameOf(job.claimed_by, people) : null
    const done = job.status === 'done'
    return (
        <span className={cn('inline-flex items-center gap-1 text-xs', done ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-600 dark:text-zinc-300')}>
            <span aria-hidden>✓</span>
            {done ? 'เสร็จ' : claimer ?? 'รับแล้ว'}
            {done && claimer && <span className="text-zinc-400">· {claimer}</span>}
            {!done && currentUserId && job.claimed_by === currentUserId && <span className="text-zinc-400">(ฉัน)</span>}
        </span>
    )
}

/**
 * ปุ่มของใบงานหนึ่งใบ — รับงาน / คืนงาน / ข้ามใบงาน / เปลี่ยนคนรับ
 * ปุ่มที่แสดงเป็นแค่การซ่อนตามบทบาท สิทธิ์จริงถูกบังคับใน server action อีกชั้น
 */
function PoolCardActions({
    job,
    people,
    currentUserId,
    canManagePool,
}: {
    job: PoolJob
    people: Person[]
    currentUserId: string | null
    canManagePool: boolean
}) {
    const [busy, setBusy] = useState(false)
    const [skipOpen, setSkipOpen] = useState(false)
    const [reason, setReason] = useState('')
    const [reassignOpen, setReassignOpen] = useState(false)
    const [newUserId, setNewUserId] = useState('')

    /** เรียก server action หนึ่งตัว — error ภาษาไทยจาก action ขึ้น toast เหมือนที่อื่นในหน้านี้ */
    const run = async (action: () => Promise<unknown>, ok: string) => {
        setBusy(true)
        try {
            const res = (await action()) as { error?: string } | undefined
            if (res?.error) {
                toast.error(res.error)
                return false
            }
            toast.success(ok)
            return true
        } finally {
            setBusy(false)
        }
    }

    const isAwaiting = job.status === 'awaiting_claim'
    const isMine = !!currentUserId && job.claimed_by === currentUserId
    // ใบงานที่คนอื่นรับไปแล้วและเราไม่ได้ดูแลพูล — ไม่มีปุ่มให้กด
    if (!isAwaiting && !isMine && !canManagePool) return null

    return (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {isAwaiting && (
                <Button size="sm" disabled={busy} onClick={() => run(() => claimPoolJob(job.id), 'รับงานแล้ว')}>
                    รับงาน
                </Button>
            )}
            {!isAwaiting && isMine && (
                <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => run(() => releasePoolJob(job.id), 'คืนงานเข้าพูลแล้ว')}
                >
                    คืนงาน
                </Button>
            )}

            {canManagePool && (
                <>
                    <Button size="sm" variant="outline" disabled={busy} onClick={() => setSkipOpen(true)}>
                        ข้ามใบงาน
                    </Button>
                    {job.claimed_by && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setReassignOpen(true)}>
                            เปลี่ยนคนรับ
                        </Button>
                    )}

                    <Dialog open={skipOpen} onOpenChange={setSkipOpen}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>ข้ามใบงาน</DialogTitle>
                            </DialogHeader>
                            <p className="text-sm text-zinc-500">
                                ใบงานจะออกจากพูลโดยไม่มีผู้รับ — ระบุเหตุผล เช่น ลูกค้าออกแบบเอง
                            </p>
                            <Textarea
                                value={reason}
                                onChange={e => setReason(e.target.value)}
                                placeholder="เหตุผลที่ข้ามใบงาน"
                                rows={3}
                            />
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setSkipOpen(false)} disabled={busy}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    disabled={busy || !reason.trim()}
                                    onClick={async () => {
                                        const ok = await run(() => skipPoolJob(job.id, reason), 'ข้ามใบงานแล้ว')
                                        if (ok) {
                                            setSkipOpen(false)
                                            setReason('')
                                        }
                                    }}
                                >
                                    ข้ามใบงาน
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>

                    <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
                        <DialogContent className="sm:max-w-md">
                            <DialogHeader>
                                <DialogTitle>เปลี่ยนคนรับใบงาน</DialogTitle>
                            </DialogHeader>
                            <Select value={newUserId} onValueChange={setNewUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="เลือกผู้รับคนใหม่" />
                                </SelectTrigger>
                                <SelectContent>
                                    {people
                                        .filter(p => p.id !== job.claimed_by)
                                        .map(p => (
                                            <SelectItem key={p.id} value={p.id}>
                                                {p.nickname ? `${p.nickname} | ${p.name}` : p.name}
                                                {p.department ? ` — ${p.department}` : ''}
                                            </SelectItem>
                                        ))}
                                </SelectContent>
                            </Select>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setReassignOpen(false)} disabled={busy}>
                                    ยกเลิก
                                </Button>
                                <Button
                                    disabled={busy || !newUserId}
                                    onClick={async () => {
                                        const ok = await run(
                                            () => reassignPoolJob(job.id, newUserId),
                                            'เปลี่ยนคนรับใบงานแล้ว'
                                        )
                                        if (ok) {
                                            setReassignOpen(false)
                                            setNewUserId('')
                                        }
                                    }}
                                >
                                    บันทึก
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </>
            )}
        </div>
    )
}

function Countdown({ date, today }: { date: string | null; today: Date }) {
    if (!date) return null
    const d = daysUntil(date, today)
    const base = 'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap'
    if (d > 0) return <span className={`${base} bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-900`}>อีก {d} วัน</span>
    if (d === 0) return <span className={`${base} bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-900`}>วันนี้</span>
    return <span className={`${base} bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900`}>ผ่านมา {-d} วัน</span>
}

/** ป้ายเตือน "ยังไม่ใส่เวลา" — งานที่ขาดเวลาเริ่มหรือเวลาสิ้นสุด (ไม่ยิงกระดิ่ง แค่ป้าย) */
function NoTimeChip({ lead }: { lead: TrackingLead }) {
    if (!lacksTime(lead)) return null
    return (
        <span
            title="ยังไม่ใส่เวลาเริ่ม/สิ้นสุด — เช็คว่าชนกับงานอื่นไม่ได้"
            className={cn(PILL, 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}
        >
            ยังไม่ใส่เวลา
        </span>
    )
}

/** ป้าย "สิ่งที่ยังขาด" — กติกาเดียวกับตารางภาพรวม (getMissing/missingLabel) */
function MissingBadge({ lead, roleLabels, kit }: { lead: TrackingLead; roleLabels: Record<string, string>; kit?: KitReadiness }) {
    const missing = getMissing(lead, kit)
    if (missing.length === 0) {
        return <span className={cn(PILL, 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200')}>พร้อม</span>
    }
    return (
        <span className={cn(PILL, 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100')}>
            ขาด: {missing.map(m => missingLabel(m, lead, roleLabels)).join(', ')}
        </span>
    )
}

/** หัวการ์ด: วันงาน เวลา สถานที่ ลูกค้า — ข้อมูลของงานที่ใบงานนี้แตกออกมา */
function LeadHeader({ lead, title, today }: { lead: TrackingLead | null; title: string; today: Date }) {
    if (!lead) {
        return <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</div>
    }
    return (
        <>
            <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {formatDate(lead.event_date)}
                {lead.event_end_date && lead.event_end_date !== lead.event_date && ` – ${formatDate(lead.event_end_date)}`}
                <span className={cn('font-normal', lead.event_time ? 'text-zinc-500' : 'text-zinc-400 italic')}>
                    {' | '}{lead.event_time ? `${lead.event_time} น.` : 'ยังไม่ใส่เวลา'}
                </span>
                {' '}
                <Countdown date={lead.event_date} today={today} />
            </div>
            <Link href={`/crm/${lead.id}`} className="text-xs text-violet-600 dark:text-violet-400 hover:underline">
                {lead.customer_name || 'ไม่ระบุลูกค้า'}
                {lead.event_name ? ` / ${lead.event_name}` : ''}
            </Link>
        </>
    )
}

/** สรุปจัดคนของใบงานหน้างาน — คนที่จัดแล้ว (event_staff) + ตำแหน่งที่ยังขาด */
function StaffSummary({ lead, roleLabels }: { lead: TrackingLead; roleLabels: Record<string, string> }) {
    const gaps = missingRoles(lead)
    return (
        <div>
            <div className="text-[11px] text-zinc-500">จัดคน</div>
            {lead.staff.length === 0 ? (
                <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                    <Users className="h-3.5 w-3.5" /> ยังไม่จัดคน
                </span>
            ) : (
                <>
                    <span className="inline-flex items-center gap-1 text-sm font-medium">
                        <Users className="h-3.5 w-3.5 text-zinc-500" /> {lead.staff.length} คน
                    </span>
                    <div className="text-xs text-zinc-500 truncate">
                        {lead.staff.map(s => s.nickname || s.name).join(', ')}
                    </div>
                </>
            )}
            {gaps.length > 0 && (
                <div className="text-xs text-amber-600 dark:text-amber-400">
                    ขาด {gaps.map(g => `${roleLabels[g.role] || g.role} ${g.need - g.have}`).join(', ')}
                </div>
            )}
        </div>
    )
}

/** สรุปจัดรถของใบงานหน้างาน — ค่าเดียวกับช่อง "จัดรถ" ในตารางภาพรวม */
function VehicleSummary({ lead }: { lead: TrackingLead }) {
    const key = vehicleOf(lead)
    const label = VEHICLES.find(v => v.key === key)?.label
    return (
        <div>
            <div className="text-[11px] text-zinc-500">จัดรถ</div>
            {label ? (
                <span className="text-sm font-medium">{label}</span>
            ) : (
                <span className="text-xs text-zinc-400">ยังไม่จัดรถ</span>
            )}
        </div>
    )
}

/** อีเวนต์ปลายทางของการจอง — ใบแรกที่ยังไม่ปิด (เรียงตามวันงานมาแล้ว) กติกาเดียวกับฝั่ง server */
const targetEventOf = (lead: TrackingLead) => lead.events[0] ?? null

/**
 * ช่อง "กระเป๋า" ของใบงานหน้างาน — ยังไม่จอง / จองแล้วยังไม่จัด (จัดแล้ว X/Y) / จัดครบ (ADR-0003)
 * กดเปิดกล่องจองกระเป๋า: จอง ยกเลิกจอง และลิงก์ไปหน้าเช็คกระเป๋าของอีเวนต์นั้น
 */
export function KitSummary({
    lead,
    kits,
    bookings,
    canManageKits,
}: {
    lead: TrackingLead
    kits: PoolKit[]
    bookings: KitBookingRow[]
    canManageKits: boolean
}) {
    const router = useRouter()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState<string | null>(null)

    const eventIds = new Set(lead.events.map(e => e.id))
    const mine = bookings.filter(b => eventIds.has(b.eventId))
    const packed = mine.filter(b => b.packed).length

    const target = targetEventOf(lead)
    const targetDate = target?.event_date ?? lead.event_date
    // ยังไม่มีอีเวนต์ → ใช้ id ว่าง: ไม่ตรงกับอีเวนต์ใดเลย ทุกการจองวันเดียวกันจึงนับเป็นชน (server สร้างอีเวนต์ให้ตอนกดจอง)
    const targetEventId = target?.id ?? ''

    const summary =
        mine.length === 0
            ? { text: 'ยังไม่จอง', tone: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200' }
            : packed === 0
              ? { text: `จองแล้ว ${mine.length} ใบ — ยังไม่จัด`, tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' }
              : packed < mine.length
                ? { text: `จัดแล้ว ${packed}/${mine.length}`, tone: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100' }
                : { text: `จัดครบ ${packed}/${mine.length}`, tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200' }

    const run = async (kitId: string, action: () => Promise<unknown>, ok: string) => {
        setBusy(kitId)
        try {
            const res = (await action()) as { error?: string } | undefined
            if (res?.error) {
                toast.error(res.error)
                return
            }
            toast.success(ok)
            router.refresh()
        } finally {
            setBusy(null)
        }
    }

    return (
        <div>
            <div className="text-[11px] text-zinc-500">กระเป๋า</div>
            <button type="button" onClick={() => setOpen(true)} className="text-left">
                <span className={cn(PILL, 'gap-1', summary.tone)}>
                    <Briefcase className="h-3.5 w-3.5" /> {summary.text}
                </span>
            </button>
            {mine.length > 0 && (
                <div className="text-xs text-zinc-500 truncate">
                    {mine.map(b => kits.find(k => k.id === b.kitId)?.name || 'กระเป๋า').join(', ')}
                </div>
            )}

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>จองกระเป๋า</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-500">
                        {target
                            ? `อีเวนต์: ${target.name || 'ไม่ระบุชื่อ'}${targetDate ? ` · ${formatDate(targetDate)}` : ''}`
                            : 'งานนี้ยังไม่มีอีเวนต์ — ระบบจะสร้างให้อัตโนมัติเมื่อกดจอง'}
                    </p>

                    <div className="max-h-80 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-800">
                        {kits.length === 0 && <p className="text-sm text-zinc-500 py-4">ยังไม่มีกระเป๋าในระบบ</p>}
                        {kits.map(kit => {
                            const booked = mine.find(b => b.kitId === kit.id) ?? null
                            const clashes = kitBookingConflict(bookings, {
                                kitId: kit.id,
                                eventId: targetEventId,
                                eventDate: targetDate,
                            })
                            const clashNames = clashes.map(
                                id => bookings.find(b => b.eventId === id)?.eventName || 'อีเวนต์อื่น'
                            )
                            return (
                                <div key={kit.id} className="py-2 flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium truncate">{kit.name}</div>
                                        {booked ? (
                                            <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                                จองแล้ว (งานนี้){booked.packed ? ' · จัดครบ' : ' · ยังไม่จัด'}
                                            </span>
                                        ) : clashNames.length > 0 ? (
                                            <span className="text-xs text-rose-600 dark:text-rose-400 truncate">
                                                ชน: {clashNames.join(', ')}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-zinc-400">ว่าง</span>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {booked && (
                                            <Link
                                                href={`/kits/${kit.id}/check?eventId=${booked.eventId}`}
                                                className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
                                            >
                                                จัดกระเป๋า
                                            </Link>
                                        )}
                                        {canManageKits &&
                                            (booked ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    disabled={busy === kit.id}
                                                    onClick={() =>
                                                        run(kit.id, () => unbookKitForLead(lead.id, kit.id), 'ยกเลิกจองแล้ว')
                                                    }
                                                >
                                                    ยกเลิกจอง
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    disabled={busy === kit.id || clashNames.length > 0}
                                                    onClick={() =>
                                                        run(kit.id, () => bookKitForLead(lead.id, kit.id), 'จองกระเป๋าแล้ว')
                                                    }
                                                >
                                                    จอง
                                                </Button>
                                            ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setOpen(false)}>
                            ปิด
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

/**
 * แท็บใบงานของหนึ่งฝ่ายในพูลงาน — การ์ดหนึ่งใบ = ใบงานหนึ่งใบ
 * เรียงตามวันงานของ leads (page.tsx เรียงมาแล้ว) งานที่หา lead ไม่เจอไว้ท้ายสุด
 */
export default function PoolTabs({
    kind,
    jobs,
    leads,
    people,
    roleLabels,
    statusLabels,
    today,
    currentUserId = null,
    canManagePool = false,
    kits = [],
    kitBookings = [],
    kitReadiness,
    canManageKits = false,
    onDesignStatusChange,
}: {
    kind: PoolKind
    jobs: PoolJob[]
    leads: TrackingLead[]
    people: Person[]
    roleLabels: Record<string, string>
    statusLabels: JobStatusLabels
    today: Date
    /** ผู้ใช้ที่ล็อกอินอยู่ — คืนงานได้เฉพาะใบงานที่ตัวเองรับ */
    currentUserId?: string | null
    /** แอดมิน/ฝ่ายประสานงาน — ข้ามใบงานและเปลี่ยนคนรับได้ */
    canManagePool?: boolean
    /** กระเป๋าทั้งหมด — ตัวเลือกในกล่องจองกระเป๋า */
    kits?: PoolKit[]
    /** การจองกระเป๋าของงานเหล่านี้ + ของอีเวนต์อื่นในวันเดียวกัน (ใช้บอกว่าชน) */
    kitBookings?: KitBookingRow[]
    /** ข้อมูลกระเป๋าต่องาน (leadId → KitReadiness) — ไม่ส่ง = ป้าย "สิ่งที่ยังขาด" ไม่ตัดสินข้อกระเป๋า */
    kitReadiness?: Map<string, KitReadiness>
    /** แอดมิน/แผนกที่ดูแลกระเป๋า — จองและยกเลิกจองได้ */
    canManageKits?: boolean
    /** เส้นทางบันทึกเดียวกับตารางภาพรวม (updateLeadTracking) */
    onDesignStatusChange: (leadId: string, patch: { design_status: string }) => void
}) {
    // ชิป "ใบงานของฉัน" — กรองในเครื่อง ไม่แตะ ?tab (สลับแท็บแล้วเริ่มที่ทุกใบเหมือนเดิม)
    const [mineOnly, setMineOnly] = useState(false)

    const leadById = new Map(leads.map(l => [l.id, l]))
    const orderOf = new Map(leads.map((l, i) => [l.id, i]))

    /** ใบงานของฉัน = ฉันเป็นผู้รับ หรืออยู่ในทีมที่ถูกจัดมาบนใบงานนั้น */
    const isMineJob = (job: PoolJob) =>
        !!currentUserId && (job.claimed_by === currentUserId || (job.assigned_to || []).includes(currentUserId))
    const mineCount = jobs.filter(isMineJob).length

    const rows: PoolRow[] = jobs
        .map(job => ({ job, lead: (job.crm_lead_id ? leadById.get(job.crm_lead_id) : undefined) ?? null }))
        .sort((a, b) => {
            const ai = a.lead ? orderOf.get(a.lead.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
            const bi = b.lead ? orderOf.get(b.lead.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
            return ai - bi || a.job.id.localeCompare(b.job.id)
        })

    const visible = mineOnly ? rows.filter(r => isMineJob(r.job)) : rows

    return (
        <div className="space-y-3">
            {currentUserId && (
                <div className="flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        aria-pressed={mineOnly}
                        onClick={() => setMineOnly(v => !v)}
                        className={cn(
                            'rounded-full px-3 py-1 text-sm',
                            mineOnly
                                ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                : 'border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        )}
                    >
                        ใบงานของฉัน {mineCount} ใบ
                    </button>
                </div>
            )}

            {visible.length === 0 ? (
                <p className="text-center text-sm text-zinc-500 py-10">
                    {mineOnly ? 'ยังไม่มีใบงานของคุณในพูลนี้' : EMPTY_TEXT[kind]}
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visible.map(({ job, lead }) => (
                    <div
                        key={job.id}
                        className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-2"
                    >
                        <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                                <LeadHeader lead={lead} title={job.title} today={today} />
                            </div>
                            <StatusBadge job={job} statusLabels={statusLabels} />
                        </div>

                        <ClaimerLine job={job} kind={kind} people={people} />

                        {lead && (
                            <div className="flex flex-wrap items-center gap-1">
                                <MissingBadge lead={lead} roleLabels={roleLabels} kit={kitReadiness?.get(lead.id)} />
                                <NoTimeChip lead={lead} />
                            </div>
                        )}

                        {kind === 'graphic' && lead && (
                            <div>
                                <div className="text-[11px] text-zinc-500">สถานะออกแบบ</div>
                                <Select
                                    value={lead.design_status}
                                    onValueChange={v => onDesignStatusChange(lead.id, { design_status: v })}
                                >
                                    <SelectTrigger className={cn('w-full', DESIGN_OPTIONS.find(o => o.value === lead.design_status)?.className)}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {DESIGN_OPTIONS.map(o => (
                                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}

                        {kind === 'onsite' && lead && (
                            <div className="grid grid-cols-2 gap-2">
                                <StaffSummary lead={lead} roleLabels={roleLabels} />
                                <VehicleSummary lead={lead} />
                                <div className="col-span-2">
                                    <KitSummary
                                        lead={lead}
                                        kits={kits}
                                        bookings={kitBookings}
                                        canManageKits={canManageKits}
                                    />
                                </div>
                            </div>
                        )}

                        <PoolCardActions
                            job={job}
                            people={people}
                            currentUserId={currentUserId}
                            canManagePool={canManagePool}
                        />
                    </div>
                ))}
                </div>
            )}
        </div>
    )
}
