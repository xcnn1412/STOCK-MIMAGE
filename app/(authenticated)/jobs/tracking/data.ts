// การประกอบข้อมูลของ /jobs/tracking ทั้งชุด — แยกออกมาจาก page.tsx เพื่อให้หน้าอื่น
// (เช่นแดชบอร์ด) เรียกใช้ซ้ำได้โดยไม่ต้องคิวรีเองใหม่
// server-only: มี service-role client อยู่ข้างใน — ห้าม import จาก client component
import { createServiceClient } from '@/lib/supabase-server'
import { getSessionLight } from '@/lib/auth'
import type { TrackingLead } from './tracking-view'
import { CLAIM_CATEGORY, VEHICLES, canActOnPool, isClosedEvent, isPrepDuty, POOL_TEAM_DEFAULTS, type ClaimKind, type DutyClaim, type EventVehicle, type PoolDepartments, type PoolJob } from './tracking-logic'
import type { JobStatusLabels, KitBookingRow, PoolKit } from './pool-tabs'
// ตรรกะล้วน (ไม่มี React) — แผงเตือนอ่านแผนกชุดเดียวกัน แค่ไม่ใช้ใบงานหน้างาน
import type { DutyDepartments } from '@/components/dashboard-alerts/duty-warnings'

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
    /** แผนกที่กดรับได้ของทุกจุด (dutyDepartments + ใบงานหน้างาน) — ปุ่มรับใช้ตัดสินว่ากดได้ไหม */
    poolDepartments: PoolDepartments
}

/** ตัวเลือกของ getTrackingSnapshot — ไม่ส่ง = ค่าเดิม (ตัดงานเก่า, อ่าน session จาก cookie) */
export interface TrackingSnapshotOptions {
    /** true = โหลดงานที่จบไปแล้วเกิน 30 วันด้วย (หน้าติดตามงานเปิดด้วย ?past=1) */
    includePast?: boolean
    /**
     * session ที่ผู้เรียกมีอยู่แล้ว — ใส่มาเพื่อข้าม getSessionLight()
     * สคริปต์ที่รันนอก request ต้องส่งเอง เพราะ cookies() ใช้ได้เฉพาะใน request
     */
    session?: { userId?: string; role?: string }
}

/** งานที่จบก่อนวันนี้ − 30 วัน ไม่โหลดโดยปริยาย (แผงเตือนย้อนหลัง 14 วันยังอยู่ในช่วงนี้) */
const PAST_CUTOFF_DAYS = 30

/** วันตัดงานเก่า (YYYY-MM-DD ตามเวลา server) */
function pastCutoffDate(): string {
    const d = new Date()
    d.setDate(d.getDate() - PAST_CUTOFF_DAYS)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** หมวดใน job_settings ที่หน้านี้ต้องใช้ — อ่านทีเดียวทั้งสถานะใบงานและแผนกของทีม */
const SETTING_CATEGORIES: string[] = [
    ...JOB_STATUS_CATEGORIES,
    'pool_kit_departments',
    ...Object.values(CLAIM_CATEGORY),
]

/**
 * อ่านและประกอบข้อมูลของหน้าติดตามงานทั้งหมด — 3 ระลอก (ระลอกละหลายคิวรีขนานกัน):
 * A ข้อมูลที่ไม่ต้องรออะไร · B ต้องรู้ leadIds ก่อน · C ต้องรู้อีเวนต์ของงานก่อน
 * — เรียกได้จาก server component เท่านั้น (หรือสคริปต์ที่ส่ง opts.session มาเอง)
 */
export async function getTrackingSnapshot(opts?: TrackingSnapshotOptions): Promise<TrackingSnapshot> {
    const supabase = createServiceClient()

    // --- ระลอก A: งาน + กระเป๋า + การตั้งค่า + คน + session ---------------------
    // คอลัมน์ของงานที่หน้านี้ใช้ — backdrop_note มาทีหลัง (20260925) จึงถอดออกได้ตอน fallback ข้างล่าง
    const LEAD_COLS = 'id, customer_name, event_location, event_date, event_end_date, event_time, event_end_time, design_status, supplier_note, backdrop_note, tracking_checklist, required_roles, archived_at, prep_done_at' as const
    const cutoff = pastCutoffDate()
    // cast: supabase-js type แถวได้เฉพาะจาก literal — fallback ส่ง string เดียวกันที่ถอด backdrop_note ออก
    const leadsQueryFor = (cols: string) => {
        const base = supabase.from('crm_leads').select(cols as typeof LEAD_COLS).eq('status', 'accepted')
        return (opts?.includePast
            ? base
            : base.or(`event_date.is.null,event_end_date.gte.${cutoff},and(event_end_date.is.null,event_date.gte.${cutoff})`)
        )
            .order('event_date', { ascending: true, nullsFirst: false })
            .order('event_time', { ascending: true, nullsFirst: false })
    }

    const [
        { data: leadsData, error: leadsError },
        { data: kitRows },
        { data: settingRows },
        { data: roleSettings },
        { data: profiles },
        session,
    ] = await Promise.all([
        leadsQueryFor(LEAD_COLS),
        supabase.from('kits').select('id, name').order('name', { ascending: true }),
        supabase
            .from('job_settings')
            .select('category, value, label_th, color')
            .in('category', SETTING_CATEGORIES)
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        supabase
            .from('crm_settings')
            .select('value, label_th, sort_order')
            .eq('category', 'staff_role')
            .eq('is_active', true)
            .order('sort_order', { ascending: true }),
        supabase
            .from('profiles')
            .select('id, full_name, nickname, department')
            .eq('is_approved', true)
            .order('full_name'),
        opts?.session ? Promise.resolve(opts.session) : getSessionLight(),
    ])
    let leads = leadsData
    if (leadsError) {
        // ponytail: instance ที่ยังไม่รัน migration 20260925_crm_leads_backdrop_note.sql → ถามใหม่โดยไม่เอาคอลัมน์นั้น
        // (ช่องสีฉากจะว่างและบันทึกไม่ได้จนกว่าจะ migrate) — ลบ fallback นี้ได้เมื่อทุก instance migrate แล้ว
        if (leadsError.code !== '42703' || !leadsError.message.includes('backdrop_note')) throw new Error(leadsError.message)
        const retry = await leadsQueryFor(LEAD_COLS.replace('backdrop_note, ', ''))
        if (retry.error) throw new Error(retry.error.message)
        leads = retry.data
    }

    const leadIds = (leads || []).map(l => l.id)

    // --- ระลอก B: อีเวนต์ / ใบงาน / การรับหน้าที่ ของงานชุดนี้ -------------------
    type EventRow = { id: string; name: string | null; event_date: string | null; status: string | null; crm_lead_id: string | null; event_time?: string | null; event_end_time?: string | null }
    type JobRow = { id: string; job_type: string | null; status: string | null; title: string | null; assigned_to: string[] | null; claimed_by: string | null; crm_lead_id: string | null; design_status: string | null }
    type DutyRow = { lead_id: string; duty: string; claimed_by: string }
    let events: EventRow[] = []
    let jobRows: JobRow[] = []
    let dutyRows: DutyRow[] = []
    if (leadIds.length > 0) {
        const [eventsRes, jobsRes, dutyRes] = await Promise.all([
            supabase
                .from('events')
                .select('*') // ponytail: * so instances without events.event_time (migration 20260927) still load
                .in('crm_lead_id', leadIds)
                .order('event_date', { ascending: true, nullsFirst: false }),
            supabase
                .from('jobs')
                .select('id, job_type, status, title, assigned_to, claimed_by, crm_lead_id, design_status')
                .in('crm_lead_id', leadIds)
                .is('archived_at', null)
                .order('created_at', { ascending: true }),
            supabase.from('lead_duty_claims').select('lead_id, duty, claimed_by').in('lead_id', leadIds),
        ])
        events = (eventsRes.data || []) as unknown as EventRow[]
        jobRows = (jobsRes.data || []) as unknown as JobRow[]
        dutyRows = (dutyRes.data || []) as unknown as DutyRow[]
    }

    // Staff per lead — batched: events(crm_lead_id in leadIds) → event_staff → profiles
    type LeadEvent = { id: string; name: string; event_date: string | null; status: string | null; event_time: string | null; event_end_time: string | null }
    const eventsByLead = new Map<string, LeadEvent[]>()
    const staffByLead = new Map<string, TrackingLead['staff']>()

    // อีเวนต์ที่ปิดแล้วจัดคนไม่ได้ — ตัดออกจากตัวเลือก (แต่คนที่จัดไว้แล้วยังนับอยู่)
    for (const e of events) {
        if (isClosedEvent(e.status)) continue
        const list = eventsByLead.get(e.crm_lead_id as string)
        const row: LeadEvent = { id: e.id, name: e.name || '', event_date: e.event_date, status: e.status ?? null, event_time: e.event_time ? String(e.event_time).slice(0, 5) : null, event_end_time: e.event_end_time ? String(e.event_end_time).slice(0, 5) : null }
        if (list) list.push(row)
        else eventsByLead.set(e.crm_lead_id as string, [row])
    }

    /** อีเวนต์ทุกใบของงานเหล่านี้ (รวมที่ปิดแล้ว) — ใช้หาการจองกระเป๋าและวันที่ต้องเช็คชน */
    const leadEvents: { id: string; event_date: string | null }[] = events.map(e => ({ id: e.id, event_date: e.event_date }))

    // ใบงานของงานเหล่านี้ — พูลงานอ่านจากตาราง jobs ไม่ใช่ crm_leads (ADR-0002)
    const poolJobs: PoolJob[] = jobRows.map(j => ({
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

    // หน้าที่เตรียมงานที่มีคนรับแล้ว — ไม่มีแถว = หน้าที่นั้นยังรอรับ (ล็อกช่องในตารางภาพรวม)
    const dutyClaims: DutyClaim[] = dutyRows
        .filter(r => isPrepDuty(r.duty as string))
        .map(r => ({
            leadId: r.lead_id as string,
            duty: r.duty as DutyClaim['duty'],
            claimedBy: r.claimed_by as string,
        }))

    // กระเป๋า + การจอง (event_kits) — การ์ดใบงานหน้างานแสดงสถานะจัดกระเป๋าและเปิดกล่องจองจากตรงนี้
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

    // --- ระลอก C: ของที่ต้องรู้อีเวนต์ก่อน (คนในอีเวนต์ / กระเป๋า / รถ) ----------
    let eventVehicles: EventVehicle[] = []
    if (leadEvents.length > 0) {
        const eventIds = leadEvents.map(e => e.id)
        // การจองของอีเวนต์อื่นในวันเดียวกัน — ต้องมีเพื่อบอกว่ากระเป๋าใบไหน "ชน" (ADR-0003)
        const dates = [...new Set(leadEvents.map(e => e.event_date).filter((d): d is string => !!d))]

        const [staffRes, mineRes, sameDayRes, vehicleRes] = await Promise.all([
            supabase
                .from('event_staff')
                .select('event_id, user_id, role, profiles:user_id(full_name, nickname)')
                .in('event_id', eventIds)
                .order('created_at', { ascending: true }),
            supabase.from('event_kits').select(KIT_BOOKING_SELECT).in('event_id', eventIds),
            dates.length > 0
                ? supabase.from('event_kits').select(KIT_BOOKING_SELECT).in('events.event_date', dates)
                : Promise.resolve({ data: null }),
            supabase.from('event_vehicles').select('event_id, vehicle_key').in('event_id', eventIds),
        ])

        const leadByEvent = new Map(events.map(e => [e.id, e.crm_lead_id as string]))
        const seen = new Set<string>()
        type StaffRow = { event_id: string; user_id: string; role: string; profiles?: { full_name: string | null; nickname: string | null } | null }
        for (const s of (staffRes.data || []) as unknown as StaffRow[]) {
            const leadId = leadByEvent.get(s.event_id)
            if (!leadId) continue
            const key = `${leadId}:${s.user_id}:${s.role}`
            if (seen.has(key)) continue
            seen.add(key)
            if (!staffByLead.has(leadId)) staffByLead.set(leadId, [])
            staffByLead.get(leadId)!.push({ user_id: s.user_id, name: s.profiles?.full_name || s.user_id, nickname: s.profiles?.nickname || null, role: s.role, event_id: s.event_id })
        }

        collectBookings(mineRes.data as unknown as RawBooking[])
        collectBookings(sameDayRes.data as unknown as RawBooking[])

        // การจองรถรายอีเวนต์ (event_vehicles — ADR-0004) — ช่อง "จัดรถ" ของงานที่มีหลายอีเวนต์อ่านจากตรงนี้
        // งานที่มีอีเวนต์เดียวยังอ่าน cache ระดับงาน (tracking_checklist) เหมือนเดิม
        eventVehicles = (vehicleRes.data || [])
            .map(r => ({ eventId: r.event_id as string, vehicleKey: r.vehicle_key as string }))
            .filter(v => VEHICLES.some(x => x.key === v.vehicleKey))
    }
    const kitBookings = [...bookingByPair.values()]

    // job_settings อ่านมาแล้วในระลอก A — แยกเป็นสถานะใบงาน กับ แผนกของแต่ละทีม
    const jobStatusLabels: JobStatusLabels = {}
    const deptByCategory = new Map<string, string[]>()
    for (const s of settingRows || []) {
        const category = s.category as string
        const value = s.value as string
        if (JOB_STATUS_CATEGORIES.includes(category)) {
            jobStatusLabels[`${jobTypeOfCategory(category)}:${value}`] = {
                label: (s.label_th as string) || value,
                color: (s.color as string) ?? null,
            }
            continue
        }
        if (!value) continue
        const list = deptByCategory.get(category)
        if (list) list.push(value)
        else deptByCategory.set(category, [value])
    }

    const roles = (roleSettings || []).map(r => ({ value: r.value as string, label: (r.label_th as string) || (r.value as string) }))
    const roleLabels: Record<string, string> = {}
    for (const r of roles) roleLabels[r.value] = r.label

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
        backdrop_note: l.backdrop_note ?? null,
        // กรองเหลือเฉพาะ key รถ — key checklist เก่า (lock_queue/on_site) ไม่ใช้แล้วและไม่ผ่าน validation
        tracking_checklist: (Array.isArray(l.tracking_checklist) ? (l.tracking_checklist as string[]) : []).filter(k => VEHICLES.some(v => v.key === k)),
        required_roles: normalizeRequiredRoles(l.required_roles),
        events: eventsByLead.get(l.id) || [],
        staff: staffByLead.get(l.id) || [],
    }))

    // ปุ่มในพูลงาน: คืนงานเห็นเฉพาะผู้รับ, ข้ามใบงาน/เปลี่ยนคนรับเฉพาะแอดมิน+ฝ่ายประสานงาน
    // (เป็นแค่การซ่อนปุ่ม — สิทธิ์จริงบังคับใน server action อีกชั้น)
    const { userId: currentUserId, role: sessionRole } = session
    const myDepartment = people.find(p => p.id === currentUserId)?.department ?? null
    const canManagePool = sessionRole === 'admin' || myDepartment === 'ฝ่ายประสานงาน'

    // แผนกของแต่ละหมวดในแท็บ "ทีมของพูลงาน" (ยังไม่ตั้ง = ค่าเริ่มต้น) — อ่านมาแล้วในระลอก A
    // ใช้สองที่: ซ่อนปุ่มจองกระเป๋า (สิทธิ์จริงบังคับใน server action อีกชั้นด้วย canActOnPool ตัวเดียวกัน)
    // และบอกว่าใครควรเห็นคำเตือน "หน้าที่ยังไม่ครบ" ของหน้าที่ที่ยังไม่มีคนรับ
    const departmentsOf = (category: string, fallback: readonly string[]): string[] => {
        const values = deptByCategory.get(category)
        return values && values.length > 0 ? values : [...fallback]
    }

    const kitDepartments = departmentsOf('pool_kit_departments', POOL_TEAM_DEFAULTS.pool_kit_departments)
    const canManageKits = canActOnPool(myDepartment, sessionRole === 'admin', kitDepartments)

    // แผนกที่รับได้ของทุกสิ่งที่กดรับได้ (ใบงานกราฟิก/หน้างาน + สามหน้าที่) — ปุ่มรับใช้ชุดนี้ตัดสิน D1
    const poolDepartments = Object.fromEntries(
        (Object.keys(CLAIM_CATEGORY) as ClaimKind[]).map(kind => [
            kind,
            departmentsOf(CLAIM_CATEGORY[kind], POOL_TEAM_DEFAULTS[CLAIM_CATEGORY[kind]]),
        ])
    ) as PoolDepartments

    // แผงเตือนใช้เฉพาะกราฟิก + สามหน้าที่ (ไม่มีใบงานหน้างาน) — ค่าเดียวกับ poolDepartments
    const dutyDepartments: DutyDepartments = {
        graphic: poolDepartments.graphic,
        staffing: poolDepartments.staffing,
        vehicle: poolDepartments.vehicle,
        kits: poolDepartments.kits,
    }

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
        poolDepartments,
    }
}
