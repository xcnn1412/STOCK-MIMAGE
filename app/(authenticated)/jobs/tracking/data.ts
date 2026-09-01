// การประกอบข้อมูลของ /jobs/tracking ทั้งชุด — แยกออกมาจาก page.tsx เพื่อให้หน้าอื่น
// (เช่นแดชบอร์ด) เรียกใช้ซ้ำได้โดยไม่ต้องคิวรีเองใหม่
// server-only: มี service-role client อยู่ข้างใน — ห้าม import จาก client component
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'
import type { TrackingLead } from './tracking-view'
import { VEHICLES, canActOnPool, isClosedEvent, isPrepDuty, POOL_TEAM_DEFAULTS, type DutyClaim, type EventVehicle, type PoolJob } from './tracking-logic'
import type { JobStatusLabels, KitBookingRow, PoolKit } from './pool-tabs'
// ตรรกะล้วน (ไม่มี React) — ที่เดียวที่รู้ว่าทีมไหนอ่านหมวดไหนใน job_settings
import { DUTY_TEAM_CATEGORY, DUTY_TEAM_DEFAULTS, type DutyDepartments, type DutyTeamKey } from '@/components/dashboard-alerts/duty-warnings'

/** jsonb ที่อ่านมาจาก DB → { role: count } ที่เชื่อถือได้ (null / รูปแบบแปลก → {}) */
function normalizeRequiredRoles(raw: unknown): Record<string, number> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, number> = {}
    for (const [role, count] of Object.entries(raw as Record<string, unknown>)) {
        if (typeof count === 'number' && Number.isInteger(count) && count >= 1) out[role] = count
    }
    return out
}

/** สถานะใบงานตั้งค่าเองได้ใน job_settings — สองหมวดนี้คือของแท็บกราฟิก/หน้างาน */
const JOB_STATUS_CATEGORIES: string[] = ['status_graphic', 'status_onsite']

/** 'status_graphic' → 'graphic' — key ของ statusLabels คือ `${job_type}:${status}` */
const jobTypeOfCategory = (category: string) => category.replace(/^status_/, '')

/** ตำแหน่ง (staff_role) หนึ่งค่า พร้อมป้ายที่แปลแล้ว */
export interface TrackingRole {
    value: string
    label: string
}

/** คนที่อนุมัติแล้วหนึ่งคน — เลนคนในไทม์ไลน์ / ตัวเลือกตอนจัดคน */
export interface TrackingPerson {
    id: string
    name: string
    nickname: string | null
    department: string | null
}

/** ข้อมูลทั้งชุดที่หน้าติดตามงานใช้ — ครบพอให้คำนวณความพร้อมของงานได้โดยไม่ต้องคิวรีซ้ำ */
export interface TrackingSnapshot {
    /** งานที่ลูกค้าตอบรับแล้ว พร้อมอีเวนต์/คนที่จัดไว้ (props `leads` ของ TrackingView) */
    rows: TrackingLead[]
    /**
     * id ของงานใน `rows` ที่ถูก archive แล้ว (crm_leads.archived_at)
     * — หน้าติดตามงานยังแสดงตามเดิม; ผู้เรียกที่ต้องตัดออก (เช่น แผงแจ้งเตือน) กรองด้วยรายการนี้
     */
    archivedLeadIds: string[]
    /** id ของงานที่กด "เสร็จสิ้น" คำเตือนหน้าที่แล้ว (crm_leads.prep_done_at) — แผงแจ้งเตือนตัดออก */
    prepDoneLeadIds: string[]
    /** ใบงานในพูล (props `jobs`) */
    poolJobs: PoolJob[]
    /** หน้าที่เตรียมงานที่มีคนรับแล้ว */
    dutyClaims: DutyClaim[]
    /** กระเป๋าทั้งหมด */
    kits: PoolKit[]
    /** การจองกระเป๋า (รวมของอีเวนต์อื่นในวันเดียวกัน เพื่อดูว่าชน) */
    kitBookings: KitBookingRow[]
    /** การจองรถรายอีเวนต์ (event_vehicles — ADR-0004) */
    eventVehicles: EventVehicle[]
    /** คนที่อนุมัติแล้วทั้งหมด */
    people: TrackingPerson[]
    /** ตำแหน่งจาก crm_settings เรียงตาม sort_order */
    roles: TrackingRole[]
    /** value ของตำแหน่ง → ป้ายภาษาไทย */
    roleLabels: Record<string, string>
    /** `${job_type}:${status}` → ป้าย + สี */
    jobStatusLabels: JobStatusLabels
    /** อีเวนต์ทุกใบของงานเหล่านี้ (รวมที่ปิดแล้ว) */
    leadEvents: { id: string; event_date: string | null }[]
    /** ผู้ใช้ที่ล็อกอินอยู่ */
    currentUserId: string | null
    /** แผนกของผู้ใช้ที่ล็อกอินอยู่ */
    myDepartment: string | null
    isAdmin: boolean
    canManagePool: boolean
    canManageKits: boolean
    /** แผนกที่รับผิดชอบแต่ละทีม/หน้าที่ (job_settings; ยังไม่ตั้งค่า = ค่าเริ่มต้น) */
    dutyDepartments: DutyDepartments
}

/**
 * อ่านและประกอบข้อมูลของหน้าติดตามงานทั้งหมด (~10 คิวรี เรียงตามลำดับเดิม)
 * — เรียกได้จาก server component เท่านั้น
 */
export async function getTrackingSnapshot(): Promise<TrackingSnapshot> {
    const supabase = createServiceClient()

    const { data: leads, error: leadsError } = await supabase
        .from('crm_leads')
        .select('id, customer_name, event_location, event_date, event_end_date, event_time, event_end_time, design_status, supplier_note, tracking_checklist, required_roles, archived_at, prep_done_at')
        .eq('status', 'accepted')
        .order('event_date', { ascending: true, nullsFirst: false })
        .order('event_time', { ascending: true, nullsFirst: false })
    if (leadsError) throw new Error(leadsError.message)

    const leadIds = (leads || []).map(l => l.id)

    // Staff per lead — batched: events(crm_lead_id in leadIds) → event_staff → profiles
    type LeadEvent = { id: string; name: string; event_date: string | null; status: string | null }
    const eventsByLead = new Map<string, LeadEvent[]>()
    const staffByLead = new Map<string, TrackingLead['staff']>()
    /** อีเวนต์ทุกใบของงานเหล่านี้ (รวมที่ปิดแล้ว) — ใช้หาการจองกระเป๋าและวันที่ต้องเช็คชน */
    let leadEvents: { id: string; event_date: string | null }[] = []
    if (leadIds.length > 0) {
        const { data: events } = await supabase
            .from('events')
            .select('id, name, event_date, status, crm_lead_id')
            .in('crm_lead_id', leadIds)
            .order('event_date', { ascending: true, nullsFirst: false })

        // อีเวนต์ที่ปิดแล้วจัดคนไม่ได้ — ตัดออกจากตัวเลือก (แต่คนที่จัดไว้แล้วยังนับอยู่)
        for (const e of events || []) {
            if (isClosedEvent(e.status)) continue
            const list = eventsByLead.get(e.crm_lead_id as string)
            const row: LeadEvent = { id: e.id, name: e.name || '', event_date: e.event_date, status: e.status ?? null }
            if (list) list.push(row)
            else eventsByLead.set(e.crm_lead_id as string, [row])
        }

        leadEvents = (events || []).map(e => ({ id: e.id as string, event_date: e.event_date as string | null }))

        const eventIds = (events || []).map(e => e.id)
        if (eventIds.length > 0) {
            const { data: staffRows } = await supabase
                .from('event_staff')
                .select('event_id, user_id, role, profiles:user_id(full_name, nickname)')
                .in('event_id', eventIds)
                .order('created_at', { ascending: true })

            const leadByEvent = new Map((events || []).map(e => [e.id, e.crm_lead_id as string]))
            const seen = new Set<string>()
            type StaffRow = { event_id: string; user_id: string; role: string; profiles?: { full_name: string | null; nickname: string | null } | null }
            for (const s of (staffRows || []) as unknown as StaffRow[]) {
                const leadId = leadByEvent.get(s.event_id)
                if (!leadId) continue
                const key = `${leadId}:${s.user_id}:${s.role}`
                if (seen.has(key)) continue
                seen.add(key)
                if (!staffByLead.has(leadId)) staffByLead.set(leadId, [])
                staffByLead.get(leadId)!.push({ user_id: s.user_id, name: s.profiles?.full_name || s.user_id, nickname: s.profiles?.nickname || null, role: s.role, event_id: s.event_id })
            }
        }
    }

    // ใบงานของงานเหล่านี้ — พูลงานอ่านจากตาราง jobs ไม่ใช่ crm_leads (ADR-0002)
    let poolJobs: PoolJob[] = []
    if (leadIds.length > 0) {
        const { data: jobRows } = await supabase
            .from('jobs')
            .select('id, job_type, status, title, assigned_to, claimed_by, crm_lead_id, design_status')
            .in('crm_lead_id', leadIds)
            .is('archived_at', null)
            .order('created_at', { ascending: true })

        poolJobs = (jobRows || []).map(j => ({
            id: j.id as string,
            job_type: (j.job_type as string) || '',
            status: (j.status as string) || '',
            title: (j.title as string) || '',
            assigned_to: Array.isArray(j.assigned_to) ? (j.assigned_to as string[]) : [],
            claimed_by: (j.claimed_by as string) ?? null,
            crm_lead_id: (j.crm_lead_id as string) ?? null,
            // สถานะออกแบบรายใบ — ใบเก่าก่อนแยกรายใบเป็น null (ตกกลับไปใช้ค่าระดับงาน)
            design_status: (j.design_status as string) ?? null,
        }))
    }

    // หน้าที่เตรียมงานที่มีคนรับแล้ว — ไม่มีแถว = หน้าที่นั้นยังรอรับ (ล็อกช่องในตารางภาพรวม)
    let dutyClaims: DutyClaim[] = []
    if (leadIds.length > 0) {
        const { data: dutyRows } = await supabase
            .from('lead_duty_claims')
            .select('lead_id, duty, claimed_by')
            .in('lead_id', leadIds)

        dutyClaims = (dutyRows || [])
            .filter(r => isPrepDuty(r.duty as string))
            .map(r => ({
                leadId: r.lead_id as string,
                duty: r.duty as DutyClaim['duty'],
                claimedBy: r.claimed_by as string,
            }))
    }

    // กระเป๋า + การจอง (event_kits) — การ์ดใบงานหน้างานแสดงสถานะจัดกระเป๋าและเปิดกล่องจองจากตรงนี้
    const { data: kitRows } = await supabase.from('kits').select('id, name').order('name', { ascending: true })
    const kits: PoolKit[] = (kitRows || []).map(k => ({ id: k.id as string, name: (k.name as string) || 'ไม่ระบุชื่อ' }))

    const KIT_BOOKING_SELECT = 'kit_id, event_id, packed_at, events!inner(id, name, event_date, crm_lead_id)'
    type RawBooking = {
        kit_id: string
        event_id: string
        packed_at: string | null
        events?: { id: string; name: string | null; event_date: string | null; crm_lead_id: string | null } | null
    }
    const bookingByPair = new Map<string, KitBookingRow>()
    const collectBookings = (rows: RawBooking[] | null) => {
        for (const r of rows || []) {
            const key = `${r.kit_id}:${r.event_id}`
            if (bookingByPair.has(key)) continue
            bookingByPair.set(key, {
                kitId: r.kit_id,
                eventId: r.event_id,
                eventDate: r.events?.event_date ?? null,
                eventName: r.events?.name || 'ไม่ระบุชื่ออีเวนต์',
                leadId: r.events?.crm_lead_id ?? null,
                packed: !!r.packed_at,
            })
        }
    }
    if (leadEvents.length > 0) {
        const { data: mine } = await supabase
            .from('event_kits')
            .select(KIT_BOOKING_SELECT)
            .in('event_id', leadEvents.map(e => e.id))
        collectBookings(mine as unknown as RawBooking[])

        // การจองของอีเวนต์อื่นในวันเดียวกัน — ต้องมีเพื่อบอกว่ากระเป๋าใบไหน "ชน" (ADR-0003)
        const dates = [...new Set(leadEvents.map(e => e.event_date).filter((d): d is string => !!d))]
        if (dates.length > 0) {
            const { data: sameDay } = await supabase
                .from('event_kits')
                .select(KIT_BOOKING_SELECT)
                .in('events.event_date', dates)
            collectBookings(sameDay as unknown as RawBooking[])
        }
    }
    const kitBookings = [...bookingByPair.values()]

    // การจองรถรายอีเวนต์ (event_vehicles — ADR-0004) — ช่อง "จัดรถ" ของงานที่มีหลายอีเวนต์อ่านจากตรงนี้
    // งานที่มีอีเวนต์เดียวยังอ่าน cache ระดับงาน (tracking_checklist) เหมือนเดิม
    let eventVehicles: EventVehicle[] = []
    if (leadEvents.length > 0) {
        const { data: vehicleRows } = await supabase
            .from('event_vehicles')
            .select('event_id, vehicle_key')
            .in('event_id', leadEvents.map(e => e.id))
        eventVehicles = (vehicleRows || [])
            .map(r => ({ eventId: r.event_id as string, vehicleKey: r.vehicle_key as string }))
            .filter(v => VEHICLES.some(x => x.key === v.vehicleKey))
    }

    const { data: jobStatusSettings } = await supabase
        .from('job_settings')
        .select('category, value, label_th, color')
        .in('category', JOB_STATUS_CATEGORIES)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    const jobStatusLabels: JobStatusLabels = {}
    for (const s of jobStatusSettings || []) {
        const key = `${jobTypeOfCategory(s.category as string)}:${s.value as string}`
        jobStatusLabels[key] = { label: (s.label_th as string) || (s.value as string), color: (s.color as string) ?? null }
    }

    const { data: roleSettings } = await supabase
        .from('crm_settings')
        .select('value, label_th, sort_order')
        .eq('category', 'staff_role')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    const roles = (roleSettings || []).map(r => ({ value: r.value as string, label: (r.label_th as string) || (r.value as string) }))
    const roleLabels: Record<string, string> = {}
    for (const r of roles) roleLabels[r.value] = r.label

    const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, nickname, department')
        .eq('is_approved', true)
        .order('full_name')

    const people = (profiles || []).map(p => ({
        id: p.id as string,
        name: (p.full_name as string) || (p.id as string).slice(0, 8),
        nickname: (p.nickname as string) || null,
        department: (p.department as string) || null,
    }))

    const rows: TrackingLead[] = (leads || []).map(l => ({
        id: l.id,
        customer_name: l.customer_name,
        event_name: l.event_location,
        event_date: l.event_date,
        event_end_date: l.event_end_date,
        event_time: l.event_time ? String(l.event_time).slice(0, 5) : null,
        event_end_time: l.event_end_time ? String(l.event_end_time).slice(0, 5) : null,
        design_status: l.design_status || 'not_started',
        supplier_note: l.supplier_note,
        // กรองเหลือเฉพาะ key รถ — key checklist เก่า (lock_queue/on_site) ไม่ใช้แล้วและไม่ผ่าน validation
        tracking_checklist: (Array.isArray(l.tracking_checklist) ? (l.tracking_checklist as string[]) : []).filter(k => VEHICLES.some(v => v.key === k)),
        required_roles: normalizeRequiredRoles(l.required_roles),
        events: eventsByLead.get(l.id) || [],
        staff: staffByLead.get(l.id) || [],
    }))

    // ปุ่มในพูลงาน: คืนงานเห็นเฉพาะผู้รับ, ข้ามใบงาน/เปลี่ยนคนรับเฉพาะแอดมิน+ฝ่ายประสานงาน
    // (เป็นแค่การซ่อนปุ่ม — สิทธิ์จริงบังคับใน server action อีกชั้น)
    const { userId: currentUserId, role: sessionRole } = await getSessionLight()
    const myDepartment = people.find(p => p.id === currentUserId)?.department ?? null
    const canManagePool = sessionRole === 'admin' || myDepartment === 'ฝ่ายประสานงาน'

    // แผนกของแต่ละหมวดในแท็บ "ทีมของพูลงาน" (ยังไม่ตั้ง = ค่าเริ่มต้น) — อ่านทีเดียวทุกหมวดที่ใช้
    // ใช้สองที่: ซ่อนปุ่มจองกระเป๋า (สิทธิ์จริงบังคับใน server action อีกชั้นด้วย canActOnPool ตัวเดียวกัน)
    // และบอกว่าใครควรเห็นคำเตือน "หน้าที่ยังไม่ครบ" ของหน้าที่ที่ยังไม่มีคนรับ
    const DEPARTMENT_CATEGORIES: string[] = ['pool_kit_departments', ...Object.values(DUTY_TEAM_CATEGORY)]
    const { data: deptRows } = await supabase
        .from('job_settings')
        .select('category, value')
        .in('category', DEPARTMENT_CATEGORIES)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })

    const deptByCategory = new Map<string, string[]>()
    for (const r of deptRows || []) {
        const value = r.value as string
        if (!value) continue
        const list = deptByCategory.get(r.category as string)
        if (list) list.push(value)
        else deptByCategory.set(r.category as string, [value])
    }
    const departmentsOf = (category: string, fallback: readonly string[]): string[] => {
        const values = deptByCategory.get(category)
        return values && values.length > 0 ? values : [...fallback]
    }

    const kitDepartments = departmentsOf('pool_kit_departments', POOL_TEAM_DEFAULTS.pool_kit_departments)
    const canManageKits = canActOnPool(myDepartment, sessionRole === 'admin', kitDepartments)

    const dutyDepartments = Object.fromEntries(
        (Object.keys(DUTY_TEAM_CATEGORY) as DutyTeamKey[]).map(team => [
            team,
            departmentsOf(DUTY_TEAM_CATEGORY[team], DUTY_TEAM_DEFAULTS[team]),
        ])
    ) as DutyDepartments

    return {
        rows,
        archivedLeadIds: (leads || []).filter(l => l.archived_at).map(l => l.id as string),
        prepDoneLeadIds: (leads || []).filter(l => l.prep_done_at).map(l => l.id as string),
        poolJobs,
        dutyClaims,
        kits,
        kitBookings,
        eventVehicles,
        people,
        roles,
        roleLabels,
        jobStatusLabels,
        leadEvents,
        currentUserId: currentUserId ?? null,
        myDepartment,
        isAdmin: sessionRole === 'admin',
        canManagePool,
        canManageKits,
        dutyDepartments,
    }
}
