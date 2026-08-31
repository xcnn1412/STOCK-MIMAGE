'use client'

import Link from 'next/link'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { UserRound, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { DESIGN_OPTIONS } from './design-options'
import { formatDate } from './timeline-view'
import {
    VEHICLES,
    daysUntil,
    getMissing,
    missingLabel,
    missingRoles,
    vehicleOf,
    type Person,
    type PoolJob,
    type TrackingLead,
} from './tracking-logic'

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

/** ผู้รับใบงาน — assigned_to แปลงเป็นชื่อจากรายชื่อคนที่โหลดมาแล้ว */
function ClaimerLine({ job, people }: { job: PoolJob; people: Person[] }) {
    const names = (job.assigned_to || [])
        .map(id => {
            const p = people.find(x => x.id === id)
            return p ? p.nickname || p.name : id.slice(0, 8)
        })
    if (names.length === 0) {
        return (
            <span className="inline-flex items-center gap-1 text-xs text-zinc-400">
                <UserRound className="h-3.5 w-3.5" /> ยังไม่มีผู้รับ
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-300">
            <UserRound className="h-3.5 w-3.5 text-zinc-500" />
            <span className="font-medium">ผู้รับ:</span> {names.join(', ')}
        </span>
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

/** ป้าย "สิ่งที่ยังขาด" — กติกาเดียวกับตารางภาพรวม (getMissing/missingLabel) */
function MissingBadge({ lead, roleLabels }: { lead: TrackingLead; roleLabels: Record<string, string> }) {
    const missing = getMissing(lead)
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
    onDesignStatusChange,
}: {
    kind: PoolKind
    jobs: PoolJob[]
    leads: TrackingLead[]
    people: Person[]
    roleLabels: Record<string, string>
    statusLabels: JobStatusLabels
    today: Date
    /** เส้นทางบันทึกเดียวกับตารางภาพรวม (updateLeadTracking) */
    onDesignStatusChange: (leadId: string, patch: { design_status: string }) => void
}) {
    const leadById = new Map(leads.map(l => [l.id, l]))
    const orderOf = new Map(leads.map((l, i) => [l.id, i]))

    const rows: PoolRow[] = jobs
        .map(job => ({ job, lead: (job.crm_lead_id ? leadById.get(job.crm_lead_id) : undefined) ?? null }))
        .sort((a, b) => {
            const ai = a.lead ? orderOf.get(a.lead.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
            const bi = b.lead ? orderOf.get(b.lead.id) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER
            return ai - bi || a.job.id.localeCompare(b.job.id)
        })

    if (rows.length === 0) {
        return <p className="text-center text-sm text-zinc-500 py-10">{EMPTY_TEXT[kind]}</p>
    }

    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map(({ job, lead }) => (
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

                    <ClaimerLine job={job} people={people} />

                    {lead && (
                        <div>
                            <MissingBadge lead={lead} roleLabels={roleLabels} />
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
                        </div>
                    )}
                </div>
            ))}
        </div>
    )
}
