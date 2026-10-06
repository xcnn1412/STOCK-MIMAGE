// ตรวจ applyEventSchedule (compute.ts) — ข้อมูลสังเคราะห์ทั้งหมด ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/salary/compute-event-schedule.check.ts"
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "compute-event-schedule: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { applyEventSchedule, computeSlip, type CheckinInput } from './compute'

const base: CheckinInput = {
  id: '00000000-0000-4000-8000-000000000001',
  check_type: 'onsite',
  checked_in_at: '2026-10-06T03:30:00.000Z',
  checked_out_at: null,
  event_id: '00000000-0000-4000-8000-000000000901',
  event_name: 'งานทดสอบ',
  duties: ['booth'],
  out_of_province: false,
}
const ev = { event_date: '2026-10-06', event_time: '10:00', event_end_time: '20:00' }

// (a) หน้างาน + อีเวนต์ 10:00–20:00 → เวลาตามอีเวนต์
const a = applyEventSchedule(base, ev)
assert.equal(a.checked_in_at, '2026-10-06T03:00:00.000Z')
assert.equal(a.checked_out_at, '2026-10-06T13:00:00.000Z')
assert.equal(a.schedule_source, 'event')

// (b) ออฟฟิศ → ไม่เปลี่ยน
const b = applyEventSchedule({ ...base, check_type: 'office' }, ev)
assert.equal(b.checked_in_at, base.checked_in_at)
assert.equal(b.checked_out_at, null)
assert.equal(b.schedule_source, 'actual')

// (c) อีเวนต์ไม่มีเวลาเริ่ม → ไม่เปลี่ยน
const c = applyEventSchedule(base, { ...ev, event_time: null })
assert.equal(c.checked_in_at, base.checked_in_at)
assert.equal(c.checked_out_at, null)
assert.equal(c.schedule_source, 'actual')

// (d) ข้ามคืน 22:00 → 02:00 → ออกวันถัดไป
const d = applyEventSchedule(base, { ...ev, event_time: '22:00', event_end_time: '02:00' })
assert.equal(d.checked_in_at, '2026-10-06T15:00:00.000Z')
assert.equal(d.checked_out_at, '2026-10-06T19:00:00.000Z')

// (e) รับ 'HH:MM:SS' จาก Postgres time
const e = applyEventSchedule(base, { ...ev, event_time: '10:00:00', event_end_time: '20:00:00' })
assert.equal(e.checked_in_at, '2026-10-06T03:00:00.000Z')
assert.equal(e.checked_out_at, '2026-10-06T13:00:00.000Z')
// ไม่มีเวลาจบ → คงเวลาออกจริง
assert.equal(applyEventSchedule({ ...base, checked_out_at: '2026-10-06T10:00:00.000Z' }, { ...ev, event_end_time: null }).checked_out_at, '2026-10-06T10:00:00.000Z')
// วันที่พัง → ใช้เวลาจริง
assert.equal(applyEventSchedule(base, { ...ev, event_date: 'xx' }).schedule_source, 'actual')

// (f) ต่อกับ computeSlip: OT 18:00–20:00 = 2 ชม. × 100, บรรทัดหน้างานวันที่ 6, ไม่มี no_checkout
const r = computeSlip({
  profile: { employment_type: 'freelance', base_salary: 0, work_start: '09:00', work_end: '18:00', ot_rate: 100 },
  checkins: [applyEventSchedule(base, ev)],
  duties: [{ code: 'booth', name_th: 'บูธ', rate: 500, pay_mode: 'per_checkin', is_active: true }],
  oopRate: 0,
  periodStart: '2026-10-05',
  periodEnd: '2026-10-11',
  runKind: 'weekly',
})
const ot = r.lines.find(l => l.kind === 'ot')
assert.ok(ot, 'ต้องมีบรรทัด OT')
assert.equal(ot.hours, 2)
assert.equal(ot.computed_amount, 200)
assert.ok(r.lines.some(l => l.kind === 'site' && l.date === '2026-10-06'), 'ต้องมีบรรทัดหน้างานวันที่ 2026-10-06')
assert.equal(r.warnings.some(w => w.code === 'no_checkout'), false, 'ไม่ควรมีคำเตือน no_checkout')

console.log('compute-event-schedule: ผ่านทั้งหมด')
