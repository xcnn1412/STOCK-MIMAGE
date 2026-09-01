// หน้าสถิติทีม /reports — ทุกคนที่ล็อกอินเข้าได้ (อยู่นอก MODULE_ROUTES แบบเดียวกับ /whats-new)
// server component ดึง raw 3 ชุดแล้วส่งเป็นแถวเบาๆ ให้ client รวมยอดเอง
// นิยามการนับ: docs/specs/team-reports.md
import { getSessionLight } from '@/lib/auth'
import { createServiceClient } from '@/lib/supabase-server'
import ReportsView from './reports-view'
import type { ReportPerson, StatKind, StatRow } from './report-stats'

export const metadata = {
    title: 'สถิติทีม — Reports',
    description: 'ใครออกงานอีเวนต์กี่ครั้ง ใครรับหน้าที่จัดคน/จัดรถ/จัดกระเป๋า และใครรับใบงานกราฟิก',
}

/** YYYY-MM-DD ตามเวลาไทย — เทียบกับคอลัมน์วันแบบ string ได้ตรงตัว */
function bangkokDay(date: Date): string {
    return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' })
}

/** วันถัดไปของสตริง YYYY-MM-DD — คำนวณแบบ UTC ล้วน ไม่พึ่งโซนเวลาของเครื่อง */
function nextDay(ymd: string): string {
    const [y, m, d] = ymd.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
}

/** คอลัมน์ DATE (events.event_date) — อ่านสตริงตรงๆ ห้ามผ่าน Date เพราะ timezone จะเลื่อนวัน */
function dayOfDate(value: unknown): string | null {
    return typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null
}

/** คอลัมน์ timestamptz (claimed_at) — แปลงเป็นวันตามเวลาไทย */
function dayOfTimestamp(value: unknown): string | null {
    if (typeof value !== 'string' || !value) return null
    const d = new Date(value)
    return Number.isNaN(d.getTime()) ? null : bangkokDay(d)
}

/** duty ใน lead_duty_claims ใช้ค่าเดียวกับชื่อประเภทสถิติพอดี */
const DUTY_KINDS = new Set<string>(['staffing', 'vehicle', 'kits'])

type StaffJoinRow = {
    user_id: string | null
    event_id: string | null
    // embed แบบ many-to-one คืน object แต่ typing ของ PostgREST บางเวอร์ชันมองเป็น array
    events: { event_date: string | null } | { event_date: string | null }[] | null
}
type DutyRow = { claimed_by: string | null; duty: string | null; claimed_at: string | null }
type GraphicRow = { claimed_by: string | null; claimed_at: string | null }
type ProfileRow = { id: string; full_name: string | null; nickname: string | null; department: string | null }

/** แกะ event_date ออกจากผล embed ไม่ว่าจะมาเป็น object หรือ array */
function eventDateOf(r: StaffJoinRow): string | null {
    const e = Array.isArray(r.events) ? r.events[0] : r.events
    return e?.event_date ?? null
}

export default async function ReportsPage() {
    const supabase = createServiceClient()
    const { userId } = await getSessionLight()

    const today = bangkokDay(new Date())
    const tomorrow = nextDay(today)

    const [staffRes, dutyRes, graphicRes, peopleRes] = await Promise.all([
        // ออกงานอีเวนต์: event_staff → events (inner join) กรองเฉพาะงานที่ถึงวันแล้ว
        // `< พรุ่งนี้` = `<= วันนี้` สำหรับคอลัมน์ DATE และเผื่อไว้กรณีคอลัมน์เป็น timestamp
        // (ตัดซ้ำอีกชั้นด้วย today ตอนสร้างแถวข้างล่าง) — แถวเดียวกันอาจซ้ำได้ถ้าคนเดิมถูกจัด
        // หลายตำแหน่งในอีเวนต์เดียว จึงต้อง distinct ด้วย (user_id, event_id)
        supabase
            .from('event_staff')
            .select('user_id, event_id, events!inner(event_date)')
            .lt('events.event_date', tomorrow),
        // จัดคน/จัดรถ/จัดกระเป๋า: หนึ่งแถว = หนึ่งหน้าที่ที่รับไว้ (คืนแล้ว = แถวหาย = ไม่นับ)
        supabase.from('lead_duty_claims').select('claimed_by, duty, claimed_at'),
        // รับงานกราฟิก: ใบงานกราฟิกที่มีคนกดรับ
        supabase.from('jobs').select('claimed_by, claimed_at').eq('job_type', 'graphic').not('claimed_by', 'is', null),
        supabase.from('profiles').select('id, full_name, nickname, department').eq('is_approved', true),
    ])

    const rows: StatRow[] = []

    const seenEvent = new Set<string>()
    for (const r of (staffRes.data || []) as unknown as StaffJoinRow[]) {
        if (!r.user_id || !r.event_id) continue
        const key = `${r.user_id}:${r.event_id}`
        if (seenEvent.has(key)) continue // คนเดิม อีเวนต์เดิม หลายตำแหน่ง → นับครั้งเดียว
        seenEvent.add(key)
        const date = dayOfDate(eventDateOf(r))
        if (!date || date > today) continue // ยังไม่ถึงวันงาน → ยังไม่นับ
        rows.push({ userId: r.user_id, kind: 'onsite', date })
    }

    for (const r of (dutyRes.data || []) as unknown as DutyRow[]) {
        if (!r.claimed_by || !r.duty || !DUTY_KINDS.has(r.duty)) continue
        rows.push({ userId: r.claimed_by, kind: r.duty as StatKind, date: dayOfTimestamp(r.claimed_at) })
    }

    for (const r of (graphicRes.data || []) as unknown as GraphicRow[]) {
        if (!r.claimed_by) continue
        rows.push({ userId: r.claimed_by, kind: 'graphic', date: dayOfTimestamp(r.claimed_at) })
    }

    const people: ReportPerson[] = ((peopleRes.data || []) as unknown as ProfileRow[]).map(p => ({
        id: p.id,
        fullName: p.full_name || '',
        nickname: p.nickname || null,
        department: p.department || null,
    }))

    return <ReportsView rows={rows} people={people} currentUserId={userId || null} />
}
