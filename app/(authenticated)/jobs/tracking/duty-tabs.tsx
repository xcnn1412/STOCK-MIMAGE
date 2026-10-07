'use client'

// แท็บใบงานรายหน้าที่เตรียมงาน — ใบงานจัดคน / ใบงานจัดรถ / ใบงานจัดกระเป๋า
// การ์ดหนึ่งใบ = หนึ่งงาน (lead) ไม่ใช่หนึ่งแถวในตาราง jobs — หน้าที่เตรียมงานผูกกับงาน ไม่ผูกกับใบงานหน้างาน

import { useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import {
    DUTY_LABELS_TH,
    VEHICLES,
    dutyKey,
    emphasizedClaims,
    isClaimWaived,
    vehicleOf,
    type ClaimGate,
    type DutyClaim,
    type KitBookingDetail,
    type KitReadiness,
    type Kit as PoolKit,
    type Person,
    type PrepDuty,
    type TrackingLead,
} from './tracking-logic'
import { ClaimSection, DutyGate, KitSummary, LeadHeader, nameOf, type KitPackingInfo } from './pool-tabs'
import { StaffEditor, VehicleCell, type StaffRole, type VehicleSyncFn } from './editors'
import {
    NO_MATCH_TEXT,
    WorkOrderToolbar,
    compareClaimer,
    matchesQuery,
    type WorkOrderSort,
} from './work-order-filters'

/** key ของ claimByDuty — ตัวจริงอยู่ใน tracking-logic (ตรรกะล้วน ใช้ร่วมกับ draft ฝั่ง view) */
export { dutyKey }

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

/** จำนวนงานที่หน้าที่นี้ "ยังไม่มีคนรับ" — ส่วน "รอรับ" บนสุดของแท็บนี้ (และตารางภาพรวม) */
export function unclaimedDutyCount(
    leads: TrackingLead[],
    duty: PrepDuty,
    claimByDuty: Map<string, DutyClaim>
): number {
    // งานที่ตั้ง "ไม่ต้องจัด" หน้าที่นี้ไว้ ไม่นับเป็นรอรับ
    return leads.filter(l => !claimByDuty.has(dutyKey(l.id, duty)) && !isClaimWaived(l, duty)).length
}

/** จำนวนงานที่หน้าที่นี้ "รับแล้ว" — ตัวเลขบนป้ายแท็บ = ขนาดคิวงานในแท็บ */
export function claimedDutyCount(
    leads: TrackingLead[],
    duty: PrepDuty,
    claimByDuty: Map<string, DutyClaim>
): number {
    return leads.filter(l => claimByDuty.has(dutyKey(l.id, duty))).length
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
    packing,
    gate,
    onVehicleSaved,
    onStaffSaved,
    onRequiredRolesSaved,
    onClaimDuty,
    onReleaseDuty,
    highlightLeadId = null,
    justClaimed,
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
    /** ใบจัดของ (แท็บจัดของ) — สถานะใบ/ปุ่มเปิดใบ · ไม่ส่ง = UI จองกระเป๋าเดิม */
    packing?: KitPackingInfo
    /** สิทธิ์รับหน้าที่นี้ของผู้ใช้ (D1) — ไม่ได้ = ปุ่มรับเป็นป้ายจาง "รอ…รับ" */
    gate?: ClaimGate
    onVehicleSaved?: VehicleSyncFn
    onStaffSaved: (
        leadId: string,
        staff: TrackingLead['staff'],
        events: TrackingLead['events'],
        requiredRoles: Record<string, number>
    ) => void
    onRequiredRolesSaved: (leadId: string, value: Record<string, number>) => void
    /** รับ/คืนหน้าที่ — เส้นทางเดียวกับตารางภาพรวม (ทับค่าทันทีแล้วค่อยเรียก server) */
    onClaimDuty: (leadId: string, duty: PrepDuty) => void
    onReleaseDuty: (leadId: string, duty: PrepDuty) => void
    /** งานที่ลิงก์มาจากการ์ด CRM (?lead=) — การ์ดของงานนี้ได้กรอบแดง + เลื่อนจอไปหาให้เอง */
    highlightLeadId?: string | null
    /** งานที่เพิ่งกดรับหน้าที่นี้ — เปิดเครื่องมือให้เองครั้งเดียวหลังรับ */
    justClaimed?: (leadId: string) => boolean
}) {
    const [mineOnly, setMineOnly] = useState(false)
    const [query, setQuery] = useState('')
    const [sort, setSort] = useState<WorkOrderSort>('date')
    // เลื่อนจอไปหาการ์ดที่ไฮไลต์ครั้งเดียวตอนเข้าหน้า — ไม่เลื่อนซ้ำทุก re-render
    const scrolledToHighlight = useRef(false)

    const label = DUTY_LABELS_TH[duty]
    const claimOf = (lead: TrackingLead) => claimByDuty.get(dutyKey(lead.id, duty))
    const claimerOf = (lead: TrackingLead) => {
        const claim = claimOf(lead)
        return claim ? nameOf(claim.claimedBy, people) : null
    }

    // แท็บนี้มีทั้งงานที่ยังรอรับหน้าที่และงานที่รับแล้ว — กดรับได้จากที่นี่ (D2)
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
        // เพิ่งกดรับหน้าที่นี้ → เปิดเครื่องมือให้เลย (กล่องจัดคน / กล่องจองกระเป๋า / โฟกัสช่องเลือกรถ)
        const opened = justClaimed?.(lead.id) ?? false
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
                    defaultOpen={opened}
                />
            )
        }
        if (duty === 'vehicle') return <VehicleCell lead={lead} all={all} onSaved={onVehicleSaved} autoFocus={opened} />
        return <KitSummary lead={lead} kits={kits} bookings={kitBookings} canManageKits={canManageKits} defaultOpen={opened} packing={packing} />
    }

    const waitingLeads = visible.filter(l => !claimOf(l) && !isClaimWaived(l, duty))
    const claimedLeads = visible.filter(l => claimOf(l))
    // เรืองแสงเฉพาะงานที่ใกล้วันงานที่สุดของหน้าที่นี้
    const emphasis = emphasizedClaims(waitingLeads.map(l => ({ key: l.id, kind: duty, date: l.event_date })))

    const renderCard = (lead: TrackingLead) => {
                        const highlighted = !!highlightLeadId && lead.id === highlightLeadId
                        return (
                        <div
                            key={lead.id}
                            ref={el => {
                                if (el && highlighted && !scrolledToHighlight.current) {
                                    scrolledToHighlight.current = true
                                    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                }
                            }}
                            className={cn(
                                'rounded-xl border bg-white dark:bg-zinc-950 p-3 space-y-2',
                                highlighted
                                    ? 'border-red-500 ring-2 ring-red-500/60 dark:border-red-500'
                                    : 'border-zinc-200 dark:border-zinc-800'
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
                                gate={gate}
                                emphasis={emphasis.has(lead.id)}
                                people={people}
                                currentUserId={currentUserId}
                                canManagePool={canManagePool}
                                summary={dutySummary(lead, duty, people, kitReadiness)}
                                onClaim={onClaimDuty}
                                onRelease={onReleaseDuty}
                            >
                                {toolFor(lead)}
                            </DutyGate>
                        </div>
                        )
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
                          : `ยังไม่มีงานในหน้าที่${label}`}
                </p>
            ) : (
                <>
                    <ClaimSection label="รอรับ" count={waitingLeads.length} waiting>
                        {waitingLeads.map(renderCard)}
                    </ClaimSection>
                    <ClaimSection label="รับแล้ว" count={claimedLeads.length}>
                        {claimedLeads.map(renderCard)}
                    </ClaimSection>
                </>
            )}
        </div>
    )
}
