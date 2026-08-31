'use client'

// แท็บใบงานรายหน้าที่เตรียมงาน — ใบงานจัดคน / ใบงานจัดรถ / ใบงานจัดกระเป๋า
// การ์ดหนึ่งใบ = หนึ่งงาน (lead) ไม่ใช่หนึ่งแถวในตาราง jobs — หน้าที่เตรียมงานผูกกับงาน ไม่ผูกกับใบงานหน้างาน

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
    DUTY_LABELS_TH,
    VEHICLES,
    vehicleOf,
    type DutyClaim,
    type KitBookingDetail,
    type KitReadiness,
    type Kit as PoolKit,
    type Person,
    type PrepDuty,
    type TrackingLead,
} from './tracking-logic'
import { DutyGate, KitSummary, LeadHeader, nameOf } from './pool-tabs'
import { StaffEditor, VehicleCell, type SaveFn, type StaffRole } from './editors'
import {
    NO_MATCH_TEXT,
    WorkOrderToolbar,
    compareClaimer,
    matchesQuery,
    type WorkOrderSort,
} from './work-order-filters'

/** key ของ claimByDuty — งานหนึ่งงานมีได้หน้าที่ละหนึ่งการรับ */
export const dutyKey = (leadId: string, duty: PrepDuty) => `${leadId}:${duty}`

/**
 * ข้อมูลที่จัดไว้แล้วของช่องหน้าที่ — โชว์อ่านอย่างเดียวคู่ปุ่มรับงาน
 * (งานเก่าที่จัดคน/รถ/กระเป๋าไว้ก่อนเปิดระบบรับหน้าที่ ต้องไม่ดู "หาย" ไปหลังปุ่ม)
 * ตารางภาพรวมและแท็บใบงานรายหน้าที่ใช้ตัวเดียวกัน
 */
export function dutySummary(
    lead: TrackingLead,
    duty: PrepDuty,
    people: Person[],
    kitReadiness?: Map<string, KitReadiness>
): ReactNode {
    if (duty === 'staffing') {
        const names = [...new Set(lead.staff.map(s => s.user_id))]
            .map(id => {
                const p = people.find(x => x.id === id)
                return p ? p.nickname || p.name : null
            })
            .filter(Boolean)
        if (names.length === 0) return null
        return <div className="text-xs text-zinc-500 truncate max-w-44" title={names.join(', ')}>จัดไว้แล้ว {names.length} คน: {names.join(', ')}</div>
    }
    if (duty === 'vehicle') {
        const key = vehicleOf(lead)
        const v = key ? VEHICLES.find(x => x.key === key) : null
        return v ? <div className="text-xs text-zinc-500">จัดไว้แล้ว: {v.label}</div> : null
    }
    const n = kitReadiness?.get(lead.id)?.bookings.length ?? 0
    return n > 0 ? <div className="text-xs text-zinc-500">จองไว้แล้ว {n} ใบ</div> : null
}

/** จำนวนงานที่หน้าที่นี้ "ยังไม่มีคนรับ" — ตัวเลขบนป้ายแท็บ = งานที่รอคนมารับ */
export function unclaimedDutyCount(
    leads: TrackingLead[],
    duty: PrepDuty,
    claimByDuty: Map<string, DutyClaim>
): number {
    return leads.filter(l => !claimByDuty.has(dutyKey(l.id, duty))).length
}

export default function DutyTab({
    duty,
    leads,
    all,
    people,
    roles,
    roleLabels,
    today,
    claimByDuty,
    currentUserId = null,
    canManagePool = false,
    kits = [],
    kitBookings = [],
    kitReadiness,
    canManageKits = false,
    save,
    onStaffSaved,
    onRequiredRolesSaved,
}: {
    duty: PrepDuty
    /** งานที่มองเห็นอยู่ — ชุดเดียวกับตารางภาพรวม (กรองงานที่ผ่านแล้วมาให้เรียบร้อย) */
    leads: TrackingLead[]
    /** งานทั้งหมด — ใช้คำนวณว่าคน/รถชนกันไหม */
    all: TrackingLead[]
    people: Person[]
    roles: StaffRole[]
    roleLabels: Record<string, string>
    today: Date
    /** การรับหน้าที่ทั้งหมด key = `${leadId}:${duty}` */
    claimByDuty: Map<string, DutyClaim>
    currentUserId?: string | null
    canManagePool?: boolean
    kits?: PoolKit[]
    kitBookings?: KitBookingDetail[]
    kitReadiness?: Map<string, KitReadiness>
    canManageKits?: boolean
    save: SaveFn
    onStaffSaved: (
        leadId: string,
        staff: TrackingLead['staff'],
        events: TrackingLead['events'],
        requiredRoles: Record<string, number>
    ) => void
    onRequiredRolesSaved: (leadId: string, value: Record<string, number>) => void
}) {
    const [mineOnly, setMineOnly] = useState(false)
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<WorkOrderSort>('date')

    const label = DUTY_LABELS_TH[duty]
    const claimOf = (lead: TrackingLead) => claimByDuty.get(dutyKey(lead.id, duty))
    const claimerOf = (lead: TrackingLead) => {
        const claim = claimOf(lead)
        return claim ? nameOf(claim.claimedBy, people) : null
    }

    /** ใบงานของฉัน = ฉันเป็นคนรับหน้าที่นี้ของงานนั้น */
    const isMine = (lead: TrackingLead) => !!currentUserId && claimOf(lead)?.claimedBy === currentUserId
    const mineCount = leads.filter(isMine).length

    // leads เรียงตามวันงานมาแล้วจาก page.tsx — 'ผู้รับ' เรียงใหม่โดยยังใช้ลำดับวันเป็นตัวตัดสินท้าย
    const order = new Map(leads.map((l, i) => [l.id, i]))
    const sorted = leads.slice().sort((a, b) => {
        const byDate = (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)
        if (sort === 'date') return byDate
        return compareClaimer(claimerOf(a), claimerOf(b)) || byDate
    })

    const visible = sorted
        .filter(l => !mineOnly || isMine(l))
        .filter(l =>
            matchesQuery(query, [
                l.customer_name,
                l.event_name,
                claimerOf(l),
                ...l.staff.map(s => s.nickname || s.name),
            ])
        )

    /** เครื่องมือจริงของหน้าที่นี้ — ตัวเดียวกับที่อยู่ในตารางภาพรวม */
    const toolFor = (lead: TrackingLead): ReactNode => {
        if (duty === 'staffing') {
            return (
                <StaffEditor
                    lead={lead}
                    all={all}
                    people={people}
                    roles={roles}
                    roleLabels={roleLabels}
                    onSaved={onStaffSaved}
                    onRequiredRolesSaved={onRequiredRolesSaved}
                />
            )
        }
        if (duty === 'vehicle') return <VehicleCell lead={lead} all={all} save={save} />
        return <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} />
    }

    return (
        <div className="space-y-3">
            <WorkOrderToolbar
                query={query}
                onQueryChange={setQuery}
                sort={sort}
                onSortChange={setSort}
                mineOnly={mineOnly}
                onMineOnlyChange={setMineOnly}
                mineCount={mineCount}
                showMine={!!currentUserId}
            />

            {visible.length === 0 ? (
                <p className="text-center text-sm text-zinc-500 py-10">
                    {query.trim()
                        ? NO_MATCH_TEXT
                        : mineOnly
                          ? `ยังไม่มีงานที่คุณรับหน้าที่${label}`
                          : `ยังไม่มีงานที่ต้อง${label}`}
                </p>
            ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {visible.map(lead => (
                        <div
                            key={lead.id}
                            className={cn(
                                'rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 space-y-2'
                            )}
                        >
                            <div className="min-w-0">
                                <LeadHeader lead={lead} title={lead.customer_name || 'ไม่ระบุลูกค้า'} today={today} />
                            </div>

                            {duty !== 'kits' && <div className="text-[11px] text-zinc-500">{label}</div>}

                            <DutyGate
                                leadId={lead.id}
                                duty={duty}
                                claim={claimOf(lead)}
                                people={people}
                                currentUserId={currentUserId}
                                canManagePool={canManagePool}
                                summary={dutySummary(lead, duty, people, kitReadiness)}
                            >
                                {toolFor(lead)}
                            </DutyGate>
                        </div>
                    ))}
                </div>
            )}
        </div>
    )
}
