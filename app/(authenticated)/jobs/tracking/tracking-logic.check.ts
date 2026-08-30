// Runnable self-check for tracking-logic.ts (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/jobs/tracking/tracking-logic.check.ts"
import assert from 'node:assert/strict'
import {
  addDays,
  availabilityOf,
  BAR_COLORS,
  bucketOf,
  chipCounts,
  dateRangesOverlap,
  daysUntil,
  DEPARTMENT_ORDER,
  getConflicts,
  getMissing,
  groupLeads,
  isPast,
  isReady,
  isUrgent,
  layoutDay,
  layoutWeek,
  leadsOnDate,
  monthLabel,
  nextJobDate,
  NO_DEPARTMENT_LABEL,
  personClashes,
  timeStatus,
  vehicleAvailability,
  vehicleOf,
  type DayLayout,
  type Person,
  type TrackingLead,
} from './tracking-logic'

const today = new Date(2026, 7, 30) // 30 Aug 2026

function mk(overrides: Partial<TrackingLead> = {}): TrackingLead {
  return {
    id: 'l1',
    customer_name: 'ลูกค้า',
    event_name: 'งาน',
    event_date: '2026-08-30',
    event_end_date: null,
    event_time: '09:00',
    event_end_time: '12:00',
    design_status: 'completed',
    supplier_note: null,
    tracking_checklist: ['car_triton'],
    events: [],
    staff: [{ user_id: 'u1', name: 'สมชาย', nickname: 'ชาย', role: 'ช่างภาพ', event_id: 'e1' }],
    ...overrides,
  }
}

// --- readiness -------------------------------------------------------------
assert.deepEqual(getMissing(mk()), [])
assert.equal(isReady(mk()), true)

assert.deepEqual(getMissing(mk({ design_status: 'not_started' })), ['design'])
assert.deepEqual(getMissing(mk({ staff: [] })), ['staff'])
assert.deepEqual(getMissing(mk({ tracking_checklist: [] })), ['vehicle'])
assert.deepEqual(getMissing(mk({ event_time: null })), ['time'])

// order is design, staff, vehicle, time
assert.deepEqual(
  getMissing(mk({ design_status: 'sent', staff: [], tracking_checklist: ['lock_queue'], event_time: null })),
  ['design', 'staff', 'vehicle', 'time']
)

// design statuses
assert.equal(isReady(mk({ design_status: 'sent_email_cf' })), true)
assert.equal(isReady(mk({ design_status: 'completed' })), true)
assert.equal(isReady(mk({ design_status: 'customer_design' })), false)
assert.equal(isReady(mk({ design_status: 'sent' })), false)

// vehicle via either key
assert.equal(isReady(mk({ tracking_checklist: ['car_champ'] })), true)
assert.equal(isReady(mk({ tracking_checklist: ['car_triton', 'on_site'] })), true)

// supplier_note is irrelevant
assert.equal(isReady(mk({ supplier_note: 'มีของ' })), true)
assert.equal(isReady(mk({ supplier_note: null })), true)

// --- daysUntil / isPast ----------------------------------------------------
assert.equal(daysUntil('2026-08-30', today), 0)
assert.equal(daysUntil('2026-08-31', today), 1)
assert.equal(daysUntil('2026-08-29', today), -1)

assert.equal(isPast(mk({ event_date: '2026-08-29', event_end_date: null }), today), true)
// end date wins: started yesterday, ends today → not past
assert.equal(isPast(mk({ event_date: '2026-08-29', event_end_date: '2026-08-30' }), today), false)
assert.equal(isPast(mk({ event_date: '2026-08-30' }), today), false)
assert.equal(isPast(mk({ event_date: null }), today), false)

// --- bucketOf --------------------------------------------------------------
assert.equal(bucketOf(mk({ event_date: null }), today), null)
assert.equal(bucketOf(mk({ event_date: '2026-08-30' }), today), 'today') // +0
assert.equal(bucketOf(mk({ event_date: '2026-08-31' }), today), 'week') // +1
assert.equal(bucketOf(mk({ event_date: '2026-09-06' }), today), 'week') // +7
assert.equal(bucketOf(mk({ event_date: '2026-09-07' }), today), 'next') // +8
assert.equal(bucketOf(mk({ event_date: '2026-09-13' }), today), 'next') // +14
assert.equal(bucketOf(mk({ event_date: '2026-09-14' }), today), 'month:2026-09') // +15
assert.equal(bucketOf(mk({ event_date: '2026-07-10' }), today), 'month:2026-07') // past

// --- monthLabel ------------------------------------------------------------
assert.equal(monthLabel('2026-09'), 'ก.ย. 2569')
assert.equal(monthLabel('2027-01'), 'ม.ค. 2570')

// --- groupLeads ------------------------------------------------------------
const grouped = groupLeads(
  [
    mk({ id: 'oct', event_date: '2026-10-05' }),
    mk({ id: 'w-late-notime', event_date: '2026-09-01', event_time: null }),
    mk({ id: 'sep', event_date: '2026-09-14' }),
    mk({ id: 'next', event_date: '2026-09-07' }),
    mk({ id: 'w-late-time', event_date: '2026-09-01', event_time: '18:00' }),
    mk({ id: 'w-early', event_date: '2026-08-31', event_time: '08:00' }),
    mk({ id: 'today', event_date: '2026-08-30' }),
    mk({ id: 'nodate', event_date: null }),
  ],
  today
)
assert.deepEqual(
  grouped.map((g) => g.key),
  ['today', 'week', 'next', 'month:2026-09', 'month:2026-10']
)
assert.deepEqual(
  grouped.map((g) => g.label),
  ['วันนี้', '7 วันนี้', '7 วันถัดไป', 'ก.ย. 2569', 'ต.ค. 2569']
)
// within group: date asc, then time asc, null time last
assert.deepEqual(
  grouped[1].leads.map((l) => l.id),
  ['w-early', 'w-late-time', 'w-late-notime']
)
// leads without event_date are dropped
assert.equal(grouped.flatMap((g) => g.leads).some((l) => l.id === 'nodate'), false)
// empty groups omitted
assert.deepEqual(
  groupLeads([mk({ id: 'a', event_date: '2026-09-02' })], today).map((g) => g.key),
  ['week']
)
assert.deepEqual(groupLeads([], today), [])

// --- chipCounts ------------------------------------------------------------
const fixture = [
  mk({ id: 'a', event_date: '2026-08-30' }), // today, ready
  mk({ id: 'b', event_date: '2026-09-02', staff: [] }), // +3, not ready, next month
  mk({ id: 'c', event_date: '2026-08-31', design_status: 'sent' }), // +1, not ready
  mk({ id: 'd', event_date: '2026-08-10', event_time: null }), // past, not ready, still this calendar month
]
assert.deepEqual(chipCounts(fixture, today), {
  today: { total: 1, notReady: 0 },
  week7: { total: 3, notReady: 2 },
  month: { total: 3, notReady: 2 }, // calendar month includes the past 10 Aug lead
})
assert.deepEqual(chipCounts([mk({ event_date: null })], today), {
  today: { total: 0, notReady: 0 },
  week7: { total: 0, notReady: 0 },
  month: { total: 0, notReady: 0 },
})

// --- isUrgent --------------------------------------------------------------
assert.equal(isUrgent(mk({ event_date: '2026-08-30', staff: [] }), today), true) // today, not ready
assert.equal(isUrgent(mk({ event_date: '2026-09-06', staff: [] }), today), true) // +7, not ready
assert.equal(isUrgent(mk({ event_date: '2026-08-01', staff: [] }), today), true) // past, not ready
assert.equal(isUrgent(mk({ event_date: '2026-08-30' }), today), false) // ready
assert.equal(isUrgent(mk({ event_date: '2026-09-07', staff: [] }), today), false) // +8, not ready
assert.equal(isUrgent(mk({ event_date: null, staff: [] }), today), false)

// --- dateRangesOverlap -----------------------------------------------------
assert.equal(dateRangesOverlap(mk({ event_date: '2026-08-30' }), mk({ id: 'x', event_date: '2026-08-30' })), true)
assert.equal(dateRangesOverlap(mk({ event_date: '2026-08-30' }), mk({ id: 'x', event_date: '2026-08-31' })), false)
// multi-day range covers the other single day
assert.equal(
  dateRangesOverlap(
    mk({ event_date: '2026-08-29', event_end_date: '2026-09-01' }),
    mk({ id: 'x', event_date: '2026-08-31' })
  ),
  true
)
// ranges that only touch at the boundary still overlap (inclusive)
assert.equal(
  dateRangesOverlap(
    mk({ event_date: '2026-08-29', event_end_date: '2026-08-31' }),
    mk({ id: 'x', event_date: '2026-08-31', event_end_date: '2026-09-02' })
  ),
  true
)
assert.equal(dateRangesOverlap(mk({ event_date: null }), mk({ id: 'x' })), false)
assert.equal(dateRangesOverlap(mk(), mk({ id: 'x', event_date: null })), false)

// --- timeStatus ------------------------------------------------------------
// same day, windows overlap -> chon
assert.equal(
  timeStatus(mk({ event_time: '09:00', event_end_time: '12:00' }), mk({ id: 'x', event_time: '11:00', event_end_time: '14:00' })),
  'conflict'
)
// same day, touching at 12:00 -> queued
assert.equal(
  timeStatus(mk({ event_time: '09:00', event_end_time: '12:00' }), mk({ id: 'x', event_time: '12:00', event_end_time: '15:00' })),
  'queued'
)
// same day, clearly apart -> queued
assert.equal(
  timeStatus(mk({ event_time: '09:00', event_end_time: '10:00' }), mk({ id: 'x', event_time: '13:00', event_end_time: '15:00' })),
  'queued'
)
// a missing time on either side -> unknown
assert.equal(timeStatus(mk({ event_time: null }), mk({ id: 'x' })), 'unknown')
assert.equal(timeStatus(mk({ event_end_time: null }), mk({ id: 'x' })), 'unknown')
assert.equal(timeStatus(mk(), mk({ id: 'x', event_end_time: null })), 'unknown')
// multi-day overlap cannot be reduced to one window -> conflict
assert.equal(
  timeStatus(
    mk({ event_date: '2026-08-29', event_end_date: '2026-08-31', event_time: '09:00', event_end_time: '10:00' }),
    mk({ id: 'x', event_date: '2026-08-30', event_time: '13:00', event_end_time: '15:00' })
  ),
  'conflict'
)
// overlapping ranges with different start dates -> conflict
assert.equal(
  timeStatus(
    mk({ event_date: '2026-08-30', event_end_date: '2026-08-31', event_time: '09:00', event_end_time: '10:00' }),
    mk({ id: 'x', event_date: '2026-08-31', event_time: '13:00', event_end_time: '15:00' })
  ),
  'conflict'
)

// --- vehicleOf -------------------------------------------------------------
assert.equal(vehicleOf(mk()), 'car_triton')
assert.equal(vehicleOf(mk({ tracking_checklist: ['car_champ'] })), 'car_champ')
assert.equal(vehicleOf(mk({ tracking_checklist: [] })), null)

// --- getConflicts / availability -------------------------------------------
// A: 30 Aug 09:00-12:00, Triton, u1+u2 | B: 30 Aug 11:00-14:00, Triton, u2 | C: 1 Sep, Triton, u1
const A = mk({
  id: 'A',
  customer_name: 'ลูกค้า A',
  event_date: '2026-08-30',
  event_time: '09:00',
  event_end_time: '12:00',
  tracking_checklist: ['car_triton'],
  staff: [
    { user_id: 'u1', name: 'สมชาย', nickname: 'ชาย', role: 'ช่างภาพ', event_id: 'e1' },
    { user_id: 'u2', name: 'นิคม', nickname: 'นิค', role: 'ผู้ช่วย', event_id: 'e1' },
  ],
})
const B = mk({
  id: 'B',
  customer_name: 'ลูกค้า B',
  event_date: '2026-08-30',
  event_time: '11:00',
  event_end_time: '14:00',
  tracking_checklist: ['car_triton'],
  staff: [{ user_id: 'u2', name: 'นิคม', nickname: 'นิค', role: 'ผู้ช่วย', event_id: 'e1' }],
})
const C = mk({
  id: 'C',
  customer_name: 'ลูกค้า C',
  event_date: '2026-09-01',
  event_time: '09:00',
  event_end_time: '12:00',
  tracking_checklist: ['car_triton'],
  staff: [{ user_id: 'u1', name: 'สมชาย', nickname: 'ชาย', role: 'ช่างภาพ', event_id: 'e1' }],
})
const fleet = [A, B, C]

// only B overlaps A: one vehicle conflict then one staff conflict (u2)
assert.deepEqual(getConflicts(A, fleet), [
  { kind: 'vehicle', key: 'car_triton', label: 'Mitsubishi Triton', withLeadId: 'B', withLabel: 'ลูกค้า B', withTime: '11:00–14:00', status: 'conflict' },
  { kind: 'staff', key: 'u2', label: 'นิค', withLeadId: 'B', withLabel: 'ลูกค้า B', withTime: '11:00–14:00', status: 'conflict' },
])
// vehicle entry comes first
assert.deepEqual(getConflicts(A, fleet).map(c => c.kind), ['vehicle', 'staff'])
// C shares the car and u1 with nobody on its own day
assert.deepEqual(getConflicts(C, fleet), [])
// a lead alone in the list has no conflicts
assert.deepEqual(getConflicts(A, [A]), [])
// no car assigned -> no vehicle conflict, staff conflict remains
assert.deepEqual(
  getConflicts({ ...A, tracking_checklist: [] }, fleet).map(c => c.kind),
  ['staff']
)
// withTime falls back to the start time, or '' when there is no time at all
const noEnd = { ...B, id: 'B2', event_end_time: null }
assert.equal(getConflicts(A, [A, noEnd])[0].withTime, '11:00')
assert.equal(getConflicts(A, [A, { ...B, id: 'B3', event_time: null, event_end_time: null }])[0].withTime, '')
// missing time on the other job -> unknown
assert.equal(getConflicts(A, [A, noEnd])[0].status, 'unknown')

// --- availabilityOf --------------------------------------------------------
assert.equal(availabilityOf('u2', A, fleet), 'conflict')
assert.equal(availabilityOf('u1', A, fleet), 'free') // C is a different day
assert.equal(availabilityOf('u3', A, fleet), 'free')
assert.equal(availabilityOf('u2', A, [A]), 'free')
// queued when the windows only touch
const queuedB = { ...B, id: 'Bq', event_time: '12:00', event_end_time: '15:00' }
assert.equal(availabilityOf('u2', A, [A, queuedB]), 'queued')
// worst-of wins: one queued + one conflict -> conflict
assert.equal(availabilityOf('u2', A, [A, queuedB, B]), 'conflict')
// worst-of: queued + unknown -> unknown
assert.equal(availabilityOf('u2', A, [A, queuedB, noEnd]), 'unknown')

// --- personClashes ---------------------------------------------------------
assert.deepEqual(personClashes('u2', A, fleet), [
  { withLeadId: 'B', withLabel: 'ลูกค้า B', withTime: '11:00–14:00', status: 'conflict' },
])
assert.deepEqual(personClashes('u1', A, fleet), []) // C is a different day
assert.deepEqual(personClashes('u3', A, fleet), []) // nobody else has u3
assert.equal(personClashes('u2', A, [A, queuedB, B]).length, 2) // every clash, not just the worst
assert.deepEqual(personClashes('u2', A, [A, queuedB]).map(c => c.status), ['queued'])

// --- vehicleAvailability ---------------------------------------------------
assert.equal(vehicleAvailability('car_triton', A, fleet), 'conflict')
assert.equal(vehicleAvailability('car_champ', A, fleet), 'free')
assert.equal(vehicleAvailability('car_triton', C, fleet), 'free') // different day
assert.equal(vehicleAvailability('car_triton', A, [A, queuedB]), 'queued')
assert.equal(vehicleAvailability('car_triton', A, [A, { ...B, id: 'Bnc', tracking_checklist: [] }]), 'free')

// --- timeline: fixtures ----------------------------------------------------
const T = '2026-08-30' // same day as `today`

const people: Person[] = [
  { id: 'u1', name: 'สมชาย', nickname: 'ชาย', department: 'ฝ่ายออกแบบ' },
  { id: 'u2', name: 'นิคม', nickname: 'นิค', department: 'ช่าง' },
  { id: 'u3', name: 'อารีย์', nickname: null, department: 'ฝ่ายออกแบบ' },
  { id: 'u4', name: 'บุญมี', nickname: 'บี', department: null },
]
const roleLabels: Record<string, string> = { photographer: 'ช่างภาพ', assistant: 'ผู้ช่วย' }
const st = (userId: string, role: string) => ({ user_id: userId, name: 'ชื่อจริง', nickname: null, role, event_id: 'e1' })

// A 09:00–12:00 and B 11:00–14:00 both use Triton and u1 → overlap in both lanes
const tlA = mk({
  id: 'A',
  customer_name: 'ลูกค้า A',
  event_date: T,
  event_time: '09:00',
  event_end_time: '12:00',
  tracking_checklist: ['car_triton'],
  staff: [st('u1', 'photographer')],
})
const tlB = mk({
  id: 'B',
  customer_name: 'ลูกค้า B',
  event_date: T,
  event_time: '11:00',
  event_end_time: '14:00',
  tracking_checklist: ['car_triton'],
  staff: [st('u1', 'assistant')],
})

const dayAB = layoutDay([tlA, tlB], T, people, roleLabels)
const bar = (day: DayLayout, laneKey: string, leadId: string) =>
  day.lanes.find((l) => l.key === laneKey)!.bars.find((b) => b.leadId === leadId)!
const lane = (day: DayLayout, laneKey: string) => day.lanes.find((l) => l.key === laneKey)!

// --- timeline constants ----------------------------------------------------
assert.equal(BAR_COLORS, 10)
assert.equal(NO_DEPARTMENT_LABEL, 'ไม่ระบุแผนก')
assert.deepEqual([...DEPARTMENT_ORDER], ['ช่าง', 'ฝ่ายประสานงาน', 'ฝ่ายออกแบบ', 'ฝ่ายแอดมิน', 'ผู้บริหาร', 'นักศึกษาฝึกงาน'])

// --- addDays ---------------------------------------------------------------
assert.equal(addDays('2026-08-30', 0), '2026-08-30')
assert.equal(addDays('2026-08-30', 2), '2026-09-01') // across month end
assert.equal(addDays('2026-09-01', -2), '2026-08-30')
assert.equal(addDays('2026-12-31', 1), '2027-01-01') // across year end

// --- leadsOnDate -----------------------------------------------------------
const onDateFixture = [
  mk({ id: 'z', event_date: T, event_time: '10:00' }),
  mk({ id: 'a', event_date: '2026-08-29', event_end_date: '2026-08-31', event_time: '08:00' }), // multi-day, covers T
  mk({ id: 'b', event_date: T, event_time: null }), // null time sorts last
  mk({ id: 'c', event_date: '2026-08-31' }),
  mk({ id: 'y', event_date: T, event_time: '10:00' }), // ties with z → by id
  mk({ id: 'nd', event_date: null }),
]
assert.deepEqual(leadsOnDate(onDateFixture, T).map((l) => l.id), ['a', 'y', 'z', 'b'])
assert.deepEqual(leadsOnDate(onDateFixture, '2026-08-31').map((l) => l.id), ['a', 'c'])
assert.deepEqual(leadsOnDate(onDateFixture, '2026-09-10').map((l) => l.id), [])

// --- hour range ------------------------------------------------------------
assert.equal(dayAB.hourStart, 6) // default 06:00 even though the earliest job is 09:00
assert.equal(dayAB.hourEnd, 24)
assert.equal(layoutDay([mk({ id: 'E', event_date: T, event_time: '05:30', event_end_time: '07:00' })], T, people, roleLabels).hourStart, 5)
// no_time / multi_day bars never drag the axis earlier
assert.equal(layoutDay([mk({ id: 'X', event_date: T, event_time: null, event_end_time: null })], T, people, roleLabels).hourStart, 6)

// --- bar timing (4 kinds) --------------------------------------------------
assert.deepEqual(
  (({ timing, startMin, endMin }) => ({ timing, startMin, endMin }))(bar(dayAB, 'jobs', 'A')),
  { timing: 'exact', startMin: 540, endMin: 720 }
)
const dNoEnd = layoutDay([mk({ id: 'N', event_date: T, event_time: '09:00', event_end_time: null })], T, people, roleLabels)
assert.deepEqual(
  (({ timing, startMin, endMin }) => ({ timing, startMin, endMin }))(bar(dNoEnd, 'jobs', 'N')),
  { timing: 'no_end', startMin: 540, endMin: 660 } // start + 2 ชม.
)
const dNoTime = layoutDay([mk({ id: 'X', event_date: T, event_time: null, event_end_time: null })], T, people, roleLabels)
assert.deepEqual(
  (({ timing, startMin, endMin }) => ({ timing, startMin, endMin }))(bar(dNoTime, 'jobs', 'X')),
  { timing: 'no_time', startMin: 360, endMin: 1440 }
)
const dMulti = layoutDay(
  [mk({ id: 'M', event_date: '2026-08-29', event_end_date: '2026-08-31', event_time: '09:00', event_end_time: '10:00' })],
  T, people, roleLabels
)
assert.deepEqual(
  (({ timing, startMin, endMin }) => ({ timing, startMin, endMin }))(bar(dMulti, 'jobs', 'M')),
  { timing: 'multi_day', startMin: 360, endMin: 1440 }
)
// starts today but ends later → still multi_day
assert.equal(
  bar(layoutDay([mk({ id: 'M2', event_date: T, event_end_date: '2026-08-31' })], T, people, roleLabels), 'jobs', 'M2').timing,
  'multi_day'
)
// end ≤ start is treated as no_end
assert.equal(
  bar(layoutDay([mk({ id: 'Z', event_date: T, event_time: '09:00', event_end_time: '09:00' })], T, people, roleLabels), 'jobs', 'Z').timing,
  'no_end'
)
// customer name fallback
assert.equal(bar(layoutDay([mk({ id: 'NN', event_date: T, customer_name: null })], T, people, roleLabels), 'jobs', 'NN').label, 'ไม่ระบุลูกค้า')

// --- one colour per job, across every lane ---------------------------------
assert.deepEqual(dayAB.colorByLead, { A: 0, B: 1 })
assert.equal(bar(dayAB, 'jobs', 'B').colorIdx, 1)
assert.equal(bar(dayAB, 'car_triton', 'B').colorIdx, 1)
assert.equal(bar(dayAB, 'u1', 'B').colorIdx, 1)

// --- jobs lane: ยังไม่จัด ---------------------------------------------------
const dUn = layoutDay([mk({ id: 'U', event_date: T, staff: [], tracking_checklist: [] }), tlA], T, people, roleLabels)
assert.equal(bar(dUn, 'jobs', 'U').unassigned, true)
assert.equal(bar(dUn, 'jobs', 'A').unassigned, false)
// car only (no staff) still counts as จัดแล้ว
assert.equal(bar(layoutDay([mk({ id: 'V', event_date: T, staff: [] })], T, people, roleLabels), 'jobs', 'V').unassigned, false)

// --- layers & conflict flags -----------------------------------------------
assert.equal(lane(dayAB, 'car_triton').layers, 2)
assert.deepEqual(lane(dayAB, 'car_triton').bars.map((b) => b.layer), [0, 1])
assert.equal(lane(dayAB, 'car_triton').bars.every((b) => b.conflict), true)
assert.equal(lane(dayAB, 'u1').layers, 2)
assert.equal(lane(dayAB, 'u1').bars.every((b) => b.conflict), true)
// jobs lane never flags conflicts
assert.equal(lane(dayAB, 'jobs').bars.some((b) => b.conflict), false)
// touching windows share a layer and do not clash
const dayTouch = layoutDay([tlA, { ...tlB, id: 'Bq', event_time: '12:00', event_end_time: '15:00' }], T, people, roleLabels)
assert.equal(lane(dayTouch, 'car_triton').layers, 1)
assert.deepEqual(lane(dayTouch, 'car_triton').bars.map((b) => b.layer), [0, 0])
assert.equal(lane(dayTouch, 'car_triton').bars.some((b) => b.conflict), false)
// an empty lane still reports one layer
assert.equal(lane(dayAB, 'car_champ').layers, 1)
assert.deepEqual(lane(dayAB, 'car_champ').bars, [])
// three bars that all overlap each other → three layers, every bar flagged
const tri = (id: string, start: string, end: string) =>
  mk({ id, event_date: T, event_time: start, event_end_time: end, tracking_checklist: ['car_triton'], staff: [] })
const day3 = layoutDay([tri('P', '09:00', '12:00'), tri('Q', '10:00', '13:00'), tri('R', '11:00', '14:00')], T, people, roleLabels)
assert.equal(lane(day3, 'car_triton').layers, 3)
assert.deepEqual(lane(day3, 'car_triton').bars.map((b) => `${b.leadId}:${b.layer}`), ['P:0', 'Q:1', 'R:2'])
assert.equal(lane(day3, 'car_triton').bars.every((b) => b.conflict), true)
// 2+1: R starts exactly when P ends → reuses P's layer, but still clashes with Q
const day21 = layoutDay([tri('P', '09:00', '12:00'), tri('Q', '10:00', '13:00'), tri('R', '12:00', '14:00')], T, people, roleLabels)
assert.equal(lane(day21, 'car_triton').layers, 2)
assert.deepEqual(lane(day21, 'car_triton').bars.map((b) => `${b.leadId}:${b.layer}`), ['P:0', 'Q:1', 'R:0'])
assert.equal(bar(day21, 'car_triton', 'R').conflict, true)

// --- lane order ------------------------------------------------------------
assert.deepEqual(dayAB.lanes.map((l) => l.kind), ['jobs', 'vehicle', 'vehicle', 'person', 'person', 'person', 'person'])
assert.deepEqual(dayAB.lanes.slice(0, 3).map((l) => l.key), ['jobs', 'car_triton', 'car_champ'])
assert.equal(dayAB.lanes[0].label, 'งาน')
// person lanes: DEPARTMENT_ORDER, then label; null department last
assert.deepEqual(dayAB.lanes.filter((l) => l.kind === 'person').map((l) => l.key), ['u2', 'u1', 'u3', 'u4'])
assert.deepEqual(
  dayAB.lanes.filter((l) => l.kind === 'person').map((l) => l.sublabel),
  ['ช่าง', 'ฝ่ายออกแบบ', 'ฝ่ายออกแบบ', 'ไม่ระบุแผนก']
)
assert.deepEqual(dayAB.lanes.filter((l) => l.kind === 'person').map((l) => l.label), ['นิค', 'ชาย', 'อารีย์', 'บี'])
assert.equal(dayAB.lanes[1].sublabel, undefined)

// --- hideFree --------------------------------------------------------------
const dHide = layoutDay([tlA], T, people, roleLabels, { hideFree: true })
assert.deepEqual(dHide.lanes.filter((l) => l.kind === 'person').map((l) => l.key), ['u1'])
assert.deepEqual(dHide.lanes.filter((l) => l.kind === 'vehicle').map((l) => l.key), ['car_triton', 'car_champ'])
assert.equal(dHide.lanes[0].key, 'jobs')

// --- role labels in person lanes -------------------------------------------
assert.equal(bar(dayAB, 'u1', 'A').role, 'ช่างภาพ')
assert.equal(bar(dayAB, 'u1', 'B').role, 'ผู้ช่วย')
assert.equal(bar(layoutDay([mk({ id: 'R', event_date: T, staff: [st('u1', 'driver')] })], T, people, roleLabels), 'u1', 'R').role, 'driver')
assert.equal(bar(dayAB, 'jobs', 'A').role, undefined)
assert.equal(bar(dayAB, 'car_triton', 'A').role, undefined)

// --- layoutWeek ------------------------------------------------------------
const wk = layoutWeek([tlA, tlB, mk({ id: 'W2', event_date: '2026-09-02', staff: [st('u1', 'photographer')] })], T, people, roleLabels)
assert.equal(wk.days.length, 7)
assert.deepEqual([wk.days[0], wk.days[6]], ['2026-08-30', '2026-09-05'])
assert.deepEqual(wk.colorByLead, { A: 0, B: 1, W2: 2 })
const wkU1 = wk.lanes.find((l) => l.key === 'u1')!
assert.equal(Object.keys(wkU1.cells).length, 7)
assert.deepEqual(wkU1.cells[T].map((c) => c.leadId), ['A', 'B'])
assert.equal(wkU1.cells[T].every((c) => c.conflict), true) // A and B overlap for u1 that day
assert.equal(wkU1.cells[T][0].role, 'ช่างภาพ')
assert.equal(wkU1.cells['2026-09-02'][0].conflict, false)
assert.deepEqual(wkU1.cells['2026-08-31'], [])
assert.deepEqual(wk.lanes.map((l) => l.kind), ['jobs', 'vehicle', 'vehicle', 'person', 'person', 'person', 'person'])
assert.equal(wk.lanes.find((l) => l.key === 'jobs')!.cells[T].some((c) => c.conflict), false)
assert.deepEqual(
  layoutWeek([tlA], T, people, roleLabels, { hideFree: true }).lanes.filter((l) => l.kind === 'person').map((l) => l.key),
  ['u1']
)
// week cells carry the same ยังไม่จัด flag as the day jobs lane
const wkUn = layoutWeek([mk({ id: 'U', event_date: T, staff: [], tracking_checklist: [] }), tlA], T, people, roleLabels)
assert.deepEqual(
  wkUn.lanes.find((l) => l.key === 'jobs')!.cells[T].map((c) => [c.leadId, c.unassigned]),
  [['A', false], ['U', true]]
)

// --- nextJobDate -----------------------------------------------------------
const njFixture = [
  mk({ id: 'n1', event_date: T }),
  mk({ id: 'n3', event_date: '2026-09-05' }),
  mk({ id: 'n2', event_date: '2026-09-02' }),
  mk({ id: 'n0', event_date: null }),
]
assert.equal(nextJobDate(njFixture, T), '2026-09-02') // skips the empty days between
assert.equal(nextJobDate(njFixture, '2026-09-02'), '2026-09-05')
assert.equal(nextJobDate(njFixture, '2026-09-05'), null)
assert.equal(nextJobDate(njFixture, '2026-01-01'), '2026-08-30')
assert.equal(nextJobDate([], T), null)

console.log('tracking-logic.check: all passed')
