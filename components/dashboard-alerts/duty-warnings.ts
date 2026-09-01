// ตรรกะล้วนของแผงที่ 2 (dashboard-alerts) — "หน้าที่ยังไม่ครบ ใกล้วันงาน"
// ไม่มี React / ไม่มี I/O: เป็นฟังก์ชันของ snapshot + "วันนี้" ล้วนๆ
// จึง import เข้า server component ได้ และหน้า /jobs/tracking เอาไปใช้ซ้ำได้ (ตั๋ว 05)
//
// เกณฑ์ "ยังไม่ครบ" ไม่เขียนใหม่ — เรียก getMissing/designReadyByLead/kitReadinessByLead
// จาก tracking-logic.ts ตัวเดียวกับป้าย "สิ่งที่ยังขาด" ในพูลงาน (สเปค: docs/specs/dashboard-alerts.md)

import {
    POOL_DONE_STATUSES,
    POOL_TEAM_DEFAULTS,
    PREP_DUTY_CATEGORY,
    daysUntil,
    designReadyByLead,
    getMissing,
    kitReadinessByLead,
    missingLabel,
    type DutyClaim,
    type KitBookingDetail,
    type MissingItem,
    type PoolJob,
    type PoolTeamCategory,
    type PrepDuty,
    type TrackingLead,
} from '@/app/(authenticated)/jobs/tracking/tracking-logic'

/** ช่วงที่เข้าแผง: ย้อนหลังกี่วัน / ล่วงหน้ากี่วัน (สเปค: [วันนี้−14, วันนี้+7]) */
export const WARNING_PAST_DAYS = 14
export const WARNING_AHEAD_DAYS = 7

/** ทีม/หน้าที่ที่รับผิดชอบ "สิ่งที่ยังขาด" หนึ่งอย่าง — กราฟิกเป็นใบงาน ส่วนที่เหลือเป็นหน้าที่เตรียมงาน */
export type DutyTeamKey = 'graphic' | PrepDuty

/** ทีม → หมวดใน job_settings ที่บอกว่าแผนกไหนรับผิดชอบ */
export const DUTY_TEAM_CATEGORY: Record<DutyTeamKey, PoolTeamCategory> = {
    graphic: 'pool_team_graphic',
    staffing: PREP_DUTY_CATEGORY.staffing,
    vehicle: PREP_DUTY_CATEGORY.vehicle,
    kits: PREP_DUTY_CATEGORY.kits,
}

/** แผนกที่รับผิดชอบแต่ละทีม (อ่านจาก job_settings; ยังไม่ตั้งค่า = ค่าเริ่มต้น) */
export type DutyDepartments = Record<DutyTeamKey, string[]>

/** ค่าเริ่มต้นของทุกทีม — ชุดเดียวกับที่ server action ใช้ตอนเช็คสิทธิ์รับหน้าที่ */
export const DUTY_TEAM_DEFAULTS: DutyDepartments = {
    graphic: [...POOL_TEAM_DEFAULTS.pool_team_graphic],
    staffing: [...POOL_TEAM_DEFAULTS[PREP_DUTY_CATEGORY.staffing]],
    vehicle: [...POOL_TEAM_DEFAULTS[PREP_DUTY_CATEGORY.vehicle]],
    kits: [...POOL_TEAM_DEFAULTS[PREP_DUTY_CATEGORY.kits]],
}

/**
 * สิ่งที่ยังขาด → ทีมที่ต้องแก้
 * 'time' (เวลาเริ่ม) แก้ในบริบทของการจัดคน จึงถือเป็นหน้าที่จัดคน (ไม่มีหน้าที่ของตัวเอง)
 */
const TEAM_OF_MISSING: Record<MissingItem, DutyTeamKey> = {
    design: 'graphic',
    staff: 'staffing',
    vehicle: 'vehicle',
    time: 'staffing',
    kits: 'kits',
}

/**
 * สิ่งที่ยังขาด → แท็บใน /jobs/tracking (?tab=)
 * 'time' ไม่มีแท็บของตัวเอง — เวลาเริ่มแก้ที่ตารางภาพรวม จึงส่งไปแท็บภาพรวมพร้อมไฮไลต์งาน
 */
const TAB_OF_MISSING: Record<MissingItem, string | null> = {
    design: 'graphic',
    staff: 'staffing',
    vehicle: 'vehicle',
    time: null,
    kits: 'kits',
}

/** ลิงก์ไปแท็บของหน้าที่ที่ขาด พร้อมไฮไลต์งานนั้น (?lead=) */
export function warningHref(item: MissingItem, leadId: string): string {
    const params = new URLSearchParams()
    const tab = TAB_OF_MISSING[item]
    if (tab) params.set('tab', tab)
    params.set('lead', leadId)
    return `/jobs/tracking?${params.toString()}`
}

/** ความแรงของคำเตือน: เลยวันงาน / เหลือ ≤3 วัน / เหลือ 4–7 วัน */
export type DutyWarningSeverity = 'overdue' | 'urgent' | 'soon'

export function severityOf(days: number): DutyWarningSeverity {
    if (days < 0) return 'overdue'
    return days <= 3 ? 'urgent' : 'soon'
}

/** ข้อความนับถอยหลังของแถวคำเตือน */
export function countdownText(days: number): string {
    if (days < 0) return `เลยวันงานแล้ว ${-days} วัน`
    if (days === 0) return 'วันนี้'
    if (days === 1) return 'พรุ่งนี้'
    return `อีก ${days} วัน`
}

/** ป้ายหนึ่งอันในแถวคำเตือน = สิ่งที่ยังขาดหนึ่งอย่าง (กดแล้วไปแท็บของหน้าที่นั้น) */
export interface DutyWarningChip {
    key: MissingItem
    label: string
    href: string
}

/** หนึ่งแถวคำเตือน — serialize ได้ทั้งก้อน (ส่งจาก server component เข้า client ได้ตรงๆ) */
export interface DutyWarningRow {
    leadId: string
    /** ชื่อลูกค้า (ไม่มีก็ใช้ชื่อ/สถานที่จัดงาน) */
    title: string
    /** สถานที่/ชื่ออีเวนต์ — บรรทัดรอง (ว่างได้) */
    subtitle: string
    eventDate: string
    /** จำนวนวันถึงวันงาน (ติดลบ = เลยมาแล้ว) */
    days: number
    severity: DutyWarningSeverity
    countdown: string
    /** เฉพาะสิ่งที่ขาดที่ "ผู้ใช้คนนี้" เกี่ยวข้อง (แอดมิน/ฝ่ายประสานงานเห็นครบ) */
    chips: DutyWarningChip[]
}

/** ผู้ใช้ที่กำลังดูแผง — แอดมิน/ฝ่ายประสานงาน (canManagePool) เห็นทุกงานทุกหน้าที่ */
export interface DutyWarningViewer {
    userId: string | null
    department: string | null
    isAdmin: boolean
    canManagePool: boolean
}

export interface DutyWarningInput {
    /** งานที่ลูกค้าตอบรับแล้ว (snapshot.rows) */
    leads: TrackingLead[]
    /** ใบงานพูล (snapshot.poolJobs) — ใช้ตัดสินออกแบบ/กระเป๋า และหาผู้รับใบงานกราฟิก */
    poolJobs: PoolJob[]
    /** การจองกระเป๋า (snapshot.kitBookings) */
    kitBookings: KitBookingDetail[]
    /** หน้าที่เตรียมงานที่มีคนรับแล้ว (snapshot.dutyClaims) */
    dutyClaims: DutyClaim[]
    /** งานที่ถูก archive — ไม่เข้าแผง (snapshot.archivedLeadIds) */
    archivedLeadIds?: string[]
    /** แผนกที่รับผิดชอบแต่ละทีม (snapshot.dutyDepartments) */
    dutyDepartments: DutyDepartments
    /** ป้ายตำแหน่งงาน — ใช้ต่อท้ายป้าย "จัดคน (ช่างกล้อง 1)" */
    roleLabels: Record<string, string>
    viewer: DutyWarningViewer
    today: Date
}

/**
 * ผู้รับผิดชอบ "ออกแบบ" ของแต่ละงาน = ผู้รับใบงานกราฟิกที่ยังไม่จบ
 * (ใบที่จบ/ถูกข้ามแล้วไม่ใช่คนที่ต้องตามงานต่อ) — ไม่มีใบงาน/ไม่มีผู้รับ = ยังไม่มีคนรับ
 */
function graphicOwnersByLead(jobs: PoolJob[]): Map<string, string[]> {
    const finished = new Set(POOL_DONE_STATUSES)
    const out = new Map<string, string[]>()
    for (const job of jobs) {
        if (job.job_type !== 'graphic' || !job.crm_lead_id || !job.claimed_by) continue
        if (finished.has(job.status)) continue
        const list = out.get(job.crm_lead_id)
        if (list) {
            if (!list.includes(job.claimed_by)) list.push(job.claimed_by)
        } else {
            out.set(job.crm_lead_id, [job.claimed_by])
        }
    }
    return out
}

/** คนที่รับหน้าที่นี้ของงานนี้ไว้แล้ว (0 หรือ 1 คน — UNIQUE (lead_id, duty)) */
function dutyOwnersOf(claims: DutyClaim[], leadId: string, duty: PrepDuty): string[] {
    return claims.filter(c => c.leadId === leadId && c.duty === duty).map(c => c.claimedBy)
}

/**
 * ผู้ใช้คนนี้ควรเห็นคำเตือนของสิ่งที่ขาดอย่างนี้ไหม (สเปค: ผู้เห็นคำเตือน)
 * - แอดมิน + ฝ่ายประสานงาน (canManagePool) → เห็นทุกอย่าง
 * - มีคนรับหน้าที่แล้ว → เฉพาะเจ้าของหน้าที่นั้น
 * - ยังไม่มีคนรับ → ทุกคนในแผนกที่รับผิดชอบหน้าที่นั้น
 */
export function canSeeWarning(
    owners: string[],
    departments: string[],
    viewer: DutyWarningViewer
): boolean {
    if (viewer.isAdmin || viewer.canManagePool) return true
    if (owners.length > 0) return !!viewer.userId && owners.includes(viewer.userId)
    return !!viewer.department && departments.includes(viewer.department)
}

/**
 * แถวคำเตือนทั้งหมดที่ "ผู้ใช้คนนี้" ควรเห็น เรียงตามวันงาน (เลยวันงานจึงมาก่อนเอง)
 * งานไม่ระบุวัน / งาน archive / เลยวันงานเกิน 14 วัน / ล่วงหน้าเกิน 7 วัน → ไม่เข้าแผง
 */
export function buildDutyWarnings(input: DutyWarningInput): DutyWarningRow[] {
    const { leads, poolJobs, kitBookings, dutyClaims, dutyDepartments, roleLabels, viewer, today } = input

    const archived = new Set(input.archivedLeadIds ?? [])
    const designReady = designReadyByLead(poolJobs)
    const kitReadiness = kitReadinessByLead(leads, poolJobs, kitBookings)
    const graphicOwners = graphicOwnersByLead(poolJobs)

    const rows: DutyWarningRow[] = []
    for (const lead of leads) {
        if (!lead.event_date || archived.has(lead.id)) continue

        const days = daysUntil(lead.event_date, today)
        if (days < -WARNING_PAST_DAYS || days > WARNING_AHEAD_DAYS) continue

        const missing = getMissing(lead, kitReadiness.get(lead.id), designReady.get(lead.id))
        if (missing.length === 0) continue

        const chips: DutyWarningChip[] = []
        for (const item of missing) {
            const team = TEAM_OF_MISSING[item]
            const owners = team === 'graphic'
                ? graphicOwners.get(lead.id) ?? []
                : dutyOwnersOf(dutyClaims, lead.id, team)
            if (!canSeeWarning(owners, dutyDepartments[team] ?? [], viewer)) continue
            chips.push({ key: item, label: missingLabel(item, lead, roleLabels), href: warningHref(item, lead.id) })
        }
        if (chips.length === 0) continue

        rows.push({
            leadId: lead.id,
            title: lead.customer_name || lead.event_name || 'ไม่ระบุลูกค้า',
            subtitle: lead.customer_name ? lead.event_name || '' : '',
            eventDate: lead.event_date,
            days,
            severity: severityOf(days),
            countdown: countdownText(days),
            chips,
        })
    }

    return rows.sort((a, b) => a.eventDate.localeCompare(b.eventDate) || a.title.localeCompare(b.title, 'th'))
}
