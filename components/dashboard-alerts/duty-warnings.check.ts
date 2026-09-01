// Runnable self-check for duty-warnings.ts (no test runner in this repo).
// Run: npx tsx components/dashboard-alerts/duty-warnings.check.ts
import assert from 'node:assert/strict'
import {
    DUTY_TEAM_DEFAULTS,
    buildDutyWarnings,
    canSeeWarning,
    countdownText,
    severityOf,
    warningHref,
    type DutyWarningInput,
    type DutyWarningViewer,
} from './duty-warnings'
import type { PoolJob, TrackingLead } from '@/app/(authenticated)/jobs/tracking/tracking-logic'

const TODAY = new Date(2026, 8, 1) // 2026-09-01

// ---- severity / countdown ----
assert.equal(severityOf(-1), 'overdue')
assert.equal(severityOf(0), 'urgent')
assert.equal(severityOf(3), 'urgent')
assert.equal(severityOf(4), 'soon')
assert.equal(countdownText(-2), 'เลยวันงานแล้ว 2 วัน')
assert.equal(countdownText(0), 'วันนี้')
assert.equal(countdownText(5), 'อีก 5 วัน')

// ---- ลิงก์: แท็บของหน้าที่ที่ขาด + ไฮไลต์งาน ----
assert.equal(warningHref('design', 'L1'), '/jobs/tracking?tab=graphic&lead=L1')
assert.equal(warningHref('staff', 'L1'), '/jobs/tracking?tab=staffing&lead=L1')
assert.equal(warningHref('vehicle', 'L1'), '/jobs/tracking?tab=vehicle&lead=L1')
assert.equal(warningHref('kits', 'L1'), '/jobs/tracking?tab=kits&lead=L1')
assert.equal(warningHref('time', 'L1'), '/jobs/tracking?lead=L1') // เวลาเริ่มแก้ที่ตารางภาพรวม

// ---- canSeeWarning ----
const staffer: DutyWarningViewer = { userId: 'u1', department: 'ช่าง', isAdmin: false, canManagePool: false }
const admin: DutyWarningViewer = { userId: 'u9', department: null, isAdmin: true, canManagePool: false }
const coordinator: DutyWarningViewer = { userId: 'u8', department: 'ฝ่ายประสานงาน', isAdmin: false, canManagePool: true }
assert.equal(canSeeWarning(['u2'], ['ช่าง'], staffer), false) // มีคนรับแล้ว = เตือนเฉพาะเจ้าของ
assert.equal(canSeeWarning(['u1'], [], staffer), true)
assert.equal(canSeeWarning([], ['ช่าง'], staffer), true) // ยังไม่มีคนรับ = ทั้งแผนก
assert.equal(canSeeWarning([], ['ฝ่ายแอดมิน'], staffer), false)
assert.equal(canSeeWarning(['u2'], ['ฝ่ายแอดมิน'], admin), true)
assert.equal(canSeeWarning(['u2'], ['ฝ่ายแอดมิน'], coordinator), true)

// ---- buildDutyWarnings ----
const lead = (id: string, event_date: string | null): TrackingLead => ({
    id,
    customer_name: `ลูกค้า ${id}`,
    event_name: null,
    event_date,
    event_end_date: null,
    event_time: '09:00',
    event_end_time: '12:00',
    design_status: 'completed',
    supplier_note: null,
    tracking_checklist: ['car_triton'],
    required_roles: {},
    events: [],
    staff: [{ user_id: 'p1', name: 'ป', nickname: null, role: 'photographer', event_id: 'e1' }],
})

/** งานที่ครบทุกข้อยกเว้น "จัดรถ" (กระเป๋าปิดด้วยใบงานหน้างานที่ถูกข้าม) */
const onsiteSkipped = (leadId: string): PoolJob => ({
    id: `job-${leadId}`,
    job_type: 'onsite',
    status: 'skipped',
    title: '',
    assigned_to: [],
    claimed_by: null,
    crm_lead_id: leadId,
})

const base = (leads: TrackingLead[], viewer: DutyWarningViewer): DutyWarningInput => ({
    leads,
    poolJobs: leads.map(l => onsiteSkipped(l.id)),
    kitBookings: [],
    dutyClaims: [],
    dutyDepartments: DUTY_TEAM_DEFAULTS,
    roleLabels: {},
    viewer,
    today: TODAY,
})

// งานที่ครบทุกข้อ (ออกแบบเสร็จ + มีคน + มีรถ + มีเวลา + ใบงานหน้างานถูกข้าม) = ไม่มีคำเตือน
assert.equal(buildDutyWarnings(base([lead('L1', '2026-09-03')], admin)).length, 0)

// งานที่ยังไม่จัดรถ = ขาดจริง
const noCar = lead('L2', '2026-09-03')
noCar.tracking_checklist = []
const rows = buildDutyWarnings(base([noCar], admin))
assert.equal(rows.length, 1)
assert.equal(rows[0].severity, 'urgent')
assert.deepEqual(rows[0].chips.map(c => c.key), ['vehicle'])
assert.equal(rows[0].chips[0].href, '/jobs/tracking?tab=vehicle&lead=L2')

// ขอบเขตวัน: ไม่ระบุวัน / เลย 14 วัน / ล่วงหน้าเกิน 7 วัน → ไม่เข้าแผง
const out = (date: string | null) => {
    const l = lead('LX', date)
    l.tracking_checklist = []
    return buildDutyWarnings(base([l], admin)).length
}
assert.equal(out(null), 0)
assert.equal(out('2026-08-18'), 1) // เลยมา 14 วันพอดี
assert.equal(out('2026-08-17'), 0) // เลยมา 15 วัน
assert.equal(out('2026-09-08'), 1) // ล่วงหน้า 7 วันพอดี
assert.equal(out('2026-09-09'), 0)

// เลยวันงาน = overdue
const late = lead('L3', '2026-08-30')
late.tracking_checklist = []
assert.equal(buildDutyWarnings(base([late], admin))[0].severity, 'overdue')

// archive แล้วไม่โผล่
const archived = lead('L4', '2026-09-03')
archived.tracking_checklist = []
assert.equal(buildDutyWarnings({ ...base([archived], admin), archivedLeadIds: ['L4'] }).length, 0)

// ผู้เห็น: หน้าที่จัดรถยังไม่มีคนรับ → ทีมออกหน้างานเห็น, ฝ่ายแอดมินไม่เห็น
const car = lead('L5', '2026-09-03')
car.tracking_checklist = []
const onsiteMember: DutyWarningViewer = { userId: 'u1', department: 'ทีมออกหน้างาน', isAdmin: false, canManagePool: false }
const adminDept: DutyWarningViewer = { userId: 'u2', department: 'ฝ่ายแอดมิน', isAdmin: false, canManagePool: false }
assert.equal(buildDutyWarnings(base([car], onsiteMember)).length, 1)
assert.equal(buildDutyWarnings(base([car], adminDept)).length, 0)

// มีคนรับหน้าที่จัดรถแล้ว → เห็นเฉพาะเจ้าของ (คนอื่นในแผนกเดียวกันไม่เห็น)
const claimed = { ...base([car], onsiteMember), dutyClaims: [{ leadId: 'L5', duty: 'vehicle' as const, claimedBy: 'u7' }] }
assert.equal(buildDutyWarnings(claimed).length, 0)
assert.equal(buildDutyWarnings({ ...claimed, viewer: { ...onsiteMember, userId: 'u7' } }).length, 1)

// เรียงตามวันงาน (เลยวันงานมาก่อนเอง)
const a = lead('LA', '2026-09-05')
const b = lead('LB', '2026-08-29')
a.tracking_checklist = []
b.tracking_checklist = []
assert.deepEqual(buildDutyWarnings(base([a, b], admin)).map(r => r.leadId), ['LB', 'LA'])

console.log('duty-warnings.check: all passed')
