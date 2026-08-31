'use client'

// ตัวแก้ไขของหน้าที่เตรียมงาน — ย้ายออกมาจาก tracking-view.tsx เพื่อให้แท็บใบงานรายหน้าที่ใช้ตัวเดียวกัน
// ห้าม import จาก tracking-view.tsx / pool-tabs.tsx / duty-tabs.tsx (กันวงจร import)

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Users, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { assignLeadStaff, assignLeadVehicle, updateLeadTracking } from '../actions'
import {
    VEHICLES,
    availabilityOf,
    getConflicts,
    personClashes,
    staffedCounts,
    AVAILABILITY_LABELS,
    type Availability,
    type Conflict,
    type Person,
    type TrackingLead,
} from './tracking-logic'
import { AVAIL_TEXT, formatDate } from './timeline-view'
import { RequiredRolesEditor } from './required-roles-editor'

export type { Person }
export type StaffRole = { value: string; label: string }
type Draft = { user_id: string; role: string }

/** เส้นทางบันทึกของตารางภาพรวม — ใช้ร่วมกันทุกช่องที่แก้ค่าใน crm_leads */
export type SaveFn = (
    id: string,
    patch: { design_status?: string; supplier_note?: string | null; tracking_checklist?: string[] }
) => void

const STATUS_CLASS: Record<Exclude<Availability, 'free'>, string> = {
    conflict: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200',
    queued: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100',
    unknown: 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
}

export function ConflictBadge({ conflict, showLabel }: { conflict: Conflict; showLabel?: boolean }) {
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
export function defaultEventId(lead: TrackingLead): string | null {
    if (lead.events.length === 0) return null
    const count = (id: string) => lead.staff.filter(s => s.event_id === id).length
    return lead.events.reduce((best, e) => (count(e.id) > count(best.id) ? e : best), lead.events[0]).id
}

function draftFor(lead: TrackingLead, eventId: string | null): Draft[] {
    return eventId === null ? [] : lead.staff.filter(s => s.event_id === eventId).map(s => ({ user_id: s.user_id, role: s.role }))
}

/** ช่อง "จัดคน" — กดเปิด Dialog แล้วจัดคนรายตำแหน่ง พร้อมบอกว่าใครว่าง/ต่อคิว/ชน ในวันของงานนี้ */
export function StaffEditor({ lead, all, people, roles, roleLabels, onSaved, onRequiredRolesSaved, defaultOpen = false, hideTrigger = false, onClose }: {
    lead: TrackingLead
    all: TrackingLead[]
    people: Person[]
    roles: StaffRole[]
    roleLabels: Record<string, string>
    onSaved: (
        leadId: string,
        staff: TrackingLead['staff'],
        events: TrackingLead['events'],
        requiredRoles: Record<string, number>
    ) => void
    /** ตำแหน่งที่ต้องการบันทึกลง DB แล้ว — สะท้อนเข้าตารางทันที ก่อนจะไปจัดคนต่อ */
    onRequiredRolesSaved: (leadId: string, value: Record<string, number>) => void
    /** เปิดทันทีตอน mount (ไทม์ไลน์คลิกแถบ) — คู่กับ hideTrigger/onClose */
    defaultOpen?: boolean
    hideTrigger?: boolean
    onClose?: () => void
}) {
    const [open, setOpen] = useState(defaultOpen)
    const [targetId, setTargetId] = useState<string | null>(() => defaultEventId(lead))
    const [draft, setDraft] = useState<Draft[]>(() => draftFor(lead, defaultEventId(lead)))
    const [required, setRequired] = useState<Record<string, number>>(() => lead.required_roles)
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
            setRequired(lead.required_roles)
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

    // คนที่นับเป็น "มีแล้ว" ต่อตำแหน่ง = คนของอีเวนต์อื่น + ร่างของอีเวนต์นี้ (นับคนไม่ซ้ำ)
    const haveByRole = staffedCounts({ ...lead, staff: staff.filter(s => s.event_id !== targetId) }, draft)

    /** ร่างตำแหน่งที่ต้องการเท่าเดิม → ไม่ต้องยิงบันทึก */
    const sameRequired =
        Object.keys(required).length === Object.keys(lead.required_roles).length &&
        Object.entries(required).every(([role, n]) => lead.required_roles[role] === n)

    const handleSave = async () => {
        setSaving(true)
        if (!sameRequired) {
            const rolesRes = await updateLeadTracking(lead.id, { required_roles: required })
            if (rolesRes?.error) {
                setSaving(false)
                toast.error(rolesRes.error)
                return
            }
            // บันทึกแล้ว → สะท้อนทันที เผื่อขั้นจัดคนล้มเหลว UI จะได้ตรงกับ DB
            onRequiredRolesSaved(lead.id, required)
        }
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
        onSaved(lead.id, mergedStaff, mergedEvents, required)
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

                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 space-y-1">
                        <div className="text-xs font-medium text-zinc-500">ตำแหน่งที่ต้องการ</div>
                        <RequiredRolesEditor value={required} roles={roles} onChange={setRequired} />
                    </div>

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
                            const need = required[role.value] ?? 0
                            const have = haveByRole[role.value] ?? 0
                            const options = people
                                .filter(p => !members.some(m => m.user_id === p.id))
                                .filter(p => !onlyFree || availabilityOf(p.id, lead, all) !== 'conflict')
                            return (
                                <div key={role.value} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-2 space-y-1">
                                    <div className={cn('text-xs font-medium', need >= 1 && have < need ? 'text-amber-600 dark:text-amber-400' : 'text-zinc-500')}>
                                        {role.label} ({need >= 1 ? `${have}/${need}` : members.length})
                                    </div>
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

/**
 * ซิงก์ค่ารถกลับเข้าตารางฝั่ง client หลังกดเลือก — server (assignLeadVehicle) เป็นคนเขียนจริง
 * บันทึกไม่สำเร็จจะถูกเรียกซ้ำด้วยค่าเดิมเพื่อย้อนกลับ
 */
export type VehicleSyncFn = (leadId: string, tracking_checklist: string[]) => void

/**
 * ช่อง "จัดรถ" — เลือกคันเดียวต่อหนึ่งงาน พร้อมป้ายเตือนเมื่อรถคันนั้นถูกใช้ซ้ำ
 * บันทึกผ่าน assignLeadVehicle: จองรถผูกกับอีเวนต์ของงาน (ยังไม่มีอีเวนต์ = ระบบเปิดให้) แล้ว sync checklist ให้ (ADR-0004)
 */
export function VehicleCell({ lead, all, onSaved }: { lead: TrackingLead; all: TrackingLead[]; onSaved?: VehicleSyncFn }) {
    const vehicleConflict = getConflicts(lead, all).find(c => c.kind === 'vehicle')
    return (
        <div>
            <Select
                value={VEHICLES.find(v => lead.tracking_checklist.includes(v.key))?.key ?? 'none'}
                onValueChange={async v => {
                    const before = lead.tracking_checklist
                    const rest = before.filter(k => !VEHICLES.some(c => c.key === k))
                    onSaved?.(lead.id, v === 'none' ? rest : [...rest, v])
                    const res = await assignLeadVehicle(lead.id, v === 'none' ? null : v)
                    if (res?.error) {
                        onSaved?.(lead.id, before)
                        toast.error(res.error)
                    }
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
