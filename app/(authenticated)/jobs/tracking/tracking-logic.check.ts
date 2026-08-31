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
  focusCandidates,
  focusWindow,
  DEPARTMENT_ORDER,
  departmentSummary,
  getConflicts,
  getMissing,
  groupLeads,
  groupPoolJobs,
  hasRequiredRoles,
  isFullyStaffed,
  isPast,
  isReady,
  isUrgent,
  layoutDay,
  layoutWeek,
  leadsOnDate,
  missingLabel,
  missingRoles,
  monthLabel,
  nextJobDate,
  NO_DEPARTMENT_LABEL,
  personClashes,
  POOL_DONE_STATUSES,
  staffedCounts,
  timeStatus,
  vehicleAvailability,
  vehicleOf,
  workloadOf,
  workloadTone,
  type DayLayout,
  type Person,
  type PoolJob,
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
    required_roles: {},
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

// --- opts.departments (กรองเลนคน; เลนรถ/งานไม่ถูกกรอง) -----------------------
const dDept = layoutDay([tlA], T, people, roleLabels, { departments: ['ฝ่ายออกแบบ'] })
assert.deepEqual(dDept.lanes.filter((l) => l.kind === 'person').map((l) => l.key), ['u1', 'u3'])
assert.deepEqual(dDept.lanes.filter((l) => l.kind === 'vehicle').map((l) => l.key), ['car_triton', 'car_champ'])
assert.equal(dDept.lanes[0].key, 'jobs')
// หลายแผนก + ไม่ระบุแผนก
assert.deepEqual(
  layoutDay([tlA], T, people, roleLabels, { departments: ['ช่าง', NO_DEPARTMENT_LABEL] })
    .lanes.filter((l) => l.kind === 'person').map((l) => l.key),
  ['u2', 'u4']
)
// ว่าง / ไม่ส่ง = ไม่กรอง
assert.deepEqual(
  layoutDay([tlA], T, people, roleLabels, { departments: [] }).lanes.filter((l) => l.kind === 'person').map((l) => l.key),
  ['u2', 'u1', 'u3', 'u4']
)
assert.deepEqual(
  layoutDay([tlA], T, people, roleLabels, {}).lanes.filter((l) => l.kind === 'person').map((l) => l.key),
  ['u2', 'u1', 'u3', 'u4']
)
// แผนกที่ไม่มีใคร → ไม่มีเลนคนเลย แต่เลนรถ/งานยังอยู่
const dNone = layoutDay([tlA], T, people, roleLabels, { departments: ['ผู้บริหาร'] })
assert.deepEqual(dNone.lanes.map((l) => l.kind), ['jobs', 'vehicle', 'vehicle'])

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
  layoutWeek([tlA], T, people, roleLabels, { departments: ['ฝ่ายออกแบบ'] })
    .lanes.filter((l) => l.kind === 'person').map((l) => l.key),
  ['u1', 'u3']
)
assert.deepEqual(
  layoutWeek([tlA], T, people, roleLabels, { departments: ['ช่าง'] }).lanes.map((l) => l.key),
  ['jobs', 'car_triton', 'car_champ', 'u2']
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

// --- ตำแหน่งที่ต้องการ / จัดคนครบ --------------------------------------------
const rrLabels: Record<string, string> = { photographer: 'ช่างกล้อง', assistant: 'ผู้ช่วย' }
const rs = (userId: string, role: string) => ({ user_id: userId, name: 'ชื่อจริง', nickname: null, role, event_id: 'e1' })
const rr = (required: Record<string, number>, staff: TrackingLead['staff']) =>
  mk({ required_roles: required, staff })

// ครบ → ไม่มีตำแหน่งขาด
assert.deepEqual(missingRoles(rr({ photographer: 1 }, [rs('u1', 'photographer')])), [])
// ขาด
assert.deepEqual(missingRoles(rr({ photographer: 2 }, [rs('u1', 'photographer')])), [
  { role: 'photographer', need: 2, have: 1 },
])
// คนเกินไม่ทำให้ไม่ครบ
assert.deepEqual(missingRoles(rr({ photographer: 1 }, [rs('u1', 'photographer'), rs('u2', 'photographer')])), [])
// ตำแหน่งอื่นที่เพิ่มเข้ามาไม่นับให้ตำแหน่งที่ต้องการ
assert.deepEqual(missingRoles(rr({ photographer: 1 }, [rs('u1', 'assistant')])), [
  { role: 'photographer', need: 1, have: 0 },
])
// ยังไม่กำหนด → ไม่มีตำแหน่งขาด
assert.deepEqual(missingRoles(mk({ required_roles: {} })), [])
// จำนวน ≤ 0 = ไม่ได้กำหนดตำแหน่งนั้น
assert.deepEqual(missingRoles(rr({ photographer: 0 }, [])), [])
// คนเดิมซ้ำในตำแหน่งเดียวกัน นับครั้งเดียว
assert.deepEqual(missingRoles(rr({ photographer: 2 }, [rs('u1', 'photographer'), rs('u1', 'photographer')])), [
  { role: 'photographer', need: 2, have: 1 },
])
// ลำดับตามที่กำหนดไว้ใน required_roles
assert.deepEqual(missingRoles(rr({ assistant: 1, photographer: 2 }, [])).map((g) => g.role), ['assistant', 'photographer'])

// --- staffedCounts: นับคนไม่ซ้ำต่อตำแหน่ง -------------------------------------
assert.deepEqual(
  staffedCounts(mk({ staff: [rs('u1', 'photographer'), rs('u1', 'photographer'), rs('u2', 'photographer'), rs('u2', 'assistant')] })),
  { photographer: 2, assistant: 1 }
)
assert.deepEqual(staffedCounts(mk({ staff: [] })), {})

// --- hasRequiredRoles ------------------------------------------------------
assert.equal(hasRequiredRoles(mk({ required_roles: {} })), false)
assert.equal(hasRequiredRoles(mk({ required_roles: { photographer: 0 } })), false)
assert.equal(hasRequiredRoles(mk({ required_roles: { photographer: 1 } })), true)

// --- isFullyStaffed: สองกติกา ----------------------------------------------
assert.equal(isFullyStaffed(mk({ required_roles: {}, staff: [] })), false) // ไม่กำหนด + 0 คน
assert.equal(isFullyStaffed(mk({ required_roles: {} })), true) // ไม่กำหนด + 1 คน
assert.equal(isFullyStaffed(rr({ photographer: 2 }, [rs('u1', 'photographer')])), false)
assert.equal(isFullyStaffed(rr({ photographer: 1 }, [rs('u1', 'photographer')])), true)

// --- getMissing ใช้กติกาใหม่ ------------------------------------------------
// 3 คนแต่ผิดตำแหน่ง → ยังขาด 'staff'
assert.deepEqual(
  getMissing(rr({ photographer: 1, assistant: 2 }, [rs('u1', 'assistant'), rs('u2', 'assistant'), rs('u3', 'assistant')])),
  ['staff']
)
assert.deepEqual(getMissing(rr({ assistant: 2 }, [rs('u1', 'assistant'), rs('u2', 'assistant')])), [])

// --- missingLabel ----------------------------------------------------------
assert.equal(
  missingLabel('staff', rr({ assistant: 2, photographer: 3 }, [rs('u1', 'assistant'), rs('u2', 'photographer')]), rrLabels),
  'จัดคน (ผู้ช่วย 1, ช่างกล้อง 2)'
)
assert.equal(missingLabel('staff', mk({ staff: [] }), rrLabels), 'จัดคน') // ไม่กำหนดตำแหน่ง → ป้ายเดิม
assert.equal(missingLabel('vehicle', rr({ assistant: 2 }, []), rrLabels), 'จัดรถ')
assert.equal(missingLabel('staff', rr({ driver: 1 }, []), rrLabels), 'จัดคน (driver 1)') // ไม่มี label → ใช้ค่า role

// --- workloadOf: จำนวนงานไม่ซ้ำใน 7 วันนับจาก fromDate -----------------------
// หน้าต่าง T = 2026-08-30 .. 2026-09-05 (วันที่ 0 ถึง 6)
const wlFixture = [
  mk({ id: 'd0', event_date: '2026-08-30', staff: [st('u1', 'photographer')] }), // ขอบซ้าย: อยู่ใน
  mk({ id: 'd6', event_date: '2026-09-05', staff: [st('u1', 'photographer')] }), // ขอบขวา: อยู่ใน
  mk({ id: 'd7', event_date: '2026-09-06', staff: [st('u1', 'photographer')] }), // เลยหน้าต่าง: ไม่นับ
  mk({ id: 'dm1', event_date: '2026-08-29', staff: [st('u1', 'photographer')] }), // ก่อนหน้าต่าง: ไม่นับ
  // งานหลายวันคร่อมหลายวันในหน้าต่าง → นับครั้งเดียว
  mk({ id: 'span', event_date: '2026-09-01', event_end_date: '2026-09-03', staff: [st('u1', 'photographer')] }),
  // คนเดิมสองตำแหน่งในงานเดียว → นับครั้งเดียว
  mk({ id: 'two', event_date: '2026-09-02', staff: [st('u1', 'photographer'), st('u1', 'assistant')] }),
  mk({ id: 'other', event_date: '2026-09-02', staff: [st('u2', 'photographer')] }),
  mk({ id: 'nodate2', event_date: null, staff: [st('u1', 'photographer')] }),
]
assert.equal(workloadOf('u1', wlFixture, T), 4) // d0, d6, span, two
assert.equal(workloadOf('u2', wlFixture, T), 1)
assert.equal(workloadOf('u9', wlFixture, T), 0)
assert.equal(workloadOf('u1', [], T), 0)
// เลื่อนหน้าต่าง 1 วัน → d0 หลุด, d7 เข้า
assert.equal(workloadOf('u1', wlFixture, '2026-08-31'), 4)
// งานหลายวันที่เริ่มก่อนหน้าต่างแต่ยังคร่อมวันแรก → นับ
assert.equal(
  workloadOf('u1', [mk({ id: 'pre', event_date: '2026-08-28', event_end_date: '2026-08-31', staff: [st('u1', 'photographer')] })], T),
  1
)
// จบก่อนหน้าต่างพอดี → ไม่นับ
assert.equal(
  workloadOf('u1', [mk({ id: 'pre2', event_date: '2026-08-28', event_end_date: '2026-08-29', staff: [st('u1', 'photographer')] })], T),
  0
)

// --- departmentSummary -----------------------------------------------------
// dayAB: tlA+tlB จัด u1 เท่านั้น → ฝ่ายออกแบบ 2 คน ว่าง 1 (u3), ช่าง/ไม่ระบุแผนก ว่างหมด
assert.deepEqual(departmentSummary(dayAB.lanes), [
  { label: 'ช่าง', total: 1, free: 1 },
  { label: 'ฝ่ายออกแบบ', total: 2, free: 1 },
  { label: NO_DEPARTMENT_LABEL, total: 1, free: 1 },
])
// เลนสัปดาห์: ว่าง = ไม่มีบล็อกงานเลยทั้ง 7 วัน
assert.deepEqual(departmentSummary(wk.lanes), [
  { label: 'ช่าง', total: 1, free: 1 },
  { label: 'ฝ่ายออกแบบ', total: 2, free: 1 },
  { label: NO_DEPARTMENT_LABEL, total: 1, free: 1 },
])
// ไม่มีเลนคน → []
assert.deepEqual(departmentSummary(layoutDay([tlA], T, [], roleLabels).lanes), [])
// ลำดับตามที่แผนกโผล่ในเลน และกรองแล้วเหลือเฉพาะแผนกที่เหลือ
assert.deepEqual(departmentSummary(dDept.lanes), [{ label: 'ฝ่ายออกแบบ', total: 2, free: 1 }])

// --- workloadTone ----------------------------------------------------------
assert.equal(workloadTone(0), 'none')
assert.equal(workloadTone(1), 'low')
assert.equal(workloadTone(2), 'low')
assert.equal(workloadTone(3), 'mid')
assert.equal(workloadTone(4), 'mid')
assert.equal(workloadTone(5), 'high')
assert.equal(workloadTone(12), 'high')


// --- Bar.roleValue: เลนคนพก role ดิบไว้ด้วย (ใช้ตอนเอาคนออกจากงานโฟกัส) --------
assert.equal(bar(dayAB, 'u1', 'A').role, 'ช่างภาพ')
assert.equal(bar(dayAB, 'u1', 'A').roleValue, 'photographer')
assert.equal(bar(dayAB, 'u1', 'B').roleValue, 'assistant')
assert.equal(bar(dayAB, 'jobs', 'A').roleValue, undefined)
assert.equal(bar(dayAB, 'car_triton', 'A').roleValue, undefined)

// --- focusWindow: ช่วงเวลาของงานโฟกัส (สแปนเดียวกับแถบในเลน) -----------------
const fwLead = mk({ id: 'FW', event_date: T, event_time: '09:00', event_end_time: '12:00' })
assert.deepEqual(focusWindow(fwLead, T, 6), { startMin: 540, endMin: 720, timing: 'exact' })
// ยังไม่ใส่เวลา → พาดทั้งแกน (hourStart..24) และเป็นลายทาง
assert.deepEqual(focusWindow(mk({ id: 'FW2', event_date: T, event_time: null, event_end_time: null }), T, 6), {
  startMin: 360,
  endMin: 1440,
  timing: 'no_time',
})
// ไม่ทราบเวลาสิ้นสุด → 2 ชม. เหมือนแถบ
assert.deepEqual(focusWindow(mk({ id: 'FW3', event_date: T, event_time: '09:00', event_end_time: null }), T, 6), {
  startMin: 540,
  endMin: 660,
  timing: 'no_end',
})
// งานหลายวัน (วันต่อเนื่อง) → พาดทั้งแกน
assert.equal(focusWindow(mk({ id: 'FW4', event_date: '2026-08-29', event_end_date: T }), T, 6).timing, 'multi_day')

// --- focusCandidates -------------------------------------------------------
// งานโฟกัส 09:00–12:00 มี u1 อยู่แล้วสองตำแหน่ง
const fcLead = mk({
  id: 'F',
  customer_name: 'ลูกค้า F',
  event_date: T,
  event_time: '09:00',
  event_end_time: '12:00',
  staff: [st('u1', 'photographer'), st('u1', 'assistant')],
})
const fcConflict = mk({ id: 'FC', customer_name: 'ชนกัน', event_date: T, event_time: '10:00', event_end_time: '13:00', staff: [st('u2', 'photographer')] })
const fcQueued = mk({ id: 'FQ', customer_name: 'ต่อคิว', event_date: T, event_time: '13:00', event_end_time: '15:00', staff: [st('u3', 'photographer')] })
const fcUnknown = mk({ id: 'FU', customer_name: 'ไม่รู้เวลา', event_date: T, event_time: null, event_end_time: null, staff: [st('u4', 'photographer')] })
const fcLeads = [fcLead, fcConflict, fcQueued, fcUnknown]
const fc = focusCandidates(fcLead, people, fcLeads, T)

// คนที่จัดแล้วมาก่อนเสมอ (u1) แล้วเรียงตามความว่าง ว่าง → ต่อคิว → เช็คเวลาไม่ได้; คนที่ชนอยู่กลุ่ม "ไม่ว่าง"
assert.deepEqual(fc.candidates.map((c) => c.person.id), ['u1', 'u3', 'u4'])
assert.deepEqual(fc.candidates.map((c) => c.availability), ['free', 'queued', 'unknown'])
assert.deepEqual(fc.busy.map((c) => c.person.id), ['u2'])
assert.equal(fc.busy[0].availability, 'conflict')

// ตำแหน่งที่ถืออยู่ในงานโฟกัส (ไม่ซ้ำ) — คนอื่นเป็น []
assert.deepEqual(fc.candidates[0].assignedRoles, ['photographer', 'assistant'])
assert.deepEqual(fc.candidates[1].assignedRoles, [])

// clash: คนที่ไม่ว่างพกงานที่ชน/ต่อคิวใบแรกมาด้วย, คนว่างไม่มี
assert.equal(fc.candidates[0].clash, undefined)
assert.deepEqual(fc.candidates[1].clash, { withLabel: 'ต่อคิว', withTime: '13:00–15:00' })
assert.deepEqual(fc.busy[0].clash, { withLabel: 'ชนกัน', withTime: '10:00–13:00' })

// คนที่จัดแล้วมาก่อนแม้จะชน (ต้องเห็นเพื่อเอาออก)
const fcBusyAssigned = focusCandidates(
  { ...fcLead, staff: [st('u2', 'photographer')] },
  people,
  [{ ...fcLead, staff: [st('u2', 'photographer')] }, fcConflict],
  T
)
assert.equal(fcBusyAssigned.candidates[0].person.id, 'u2')
assert.equal(fcBusyAssigned.candidates[0].availability, 'conflict')
assert.deepEqual(fcBusyAssigned.busy.map((c) => c.person.id), [])

// ความว่างเท่ากัน → ภาระงานน้อยก่อน แล้วชื่อ (u1 ชาย / u3 อารีย์ ภาระ 0 เท่ากัน)
const fcFree = mk({ id: 'F2', event_date: T, event_time: '09:00', event_end_time: '12:00', staff: [] })
const fcLoad = [
  fcFree,
  mk({ id: 'WA', event_date: '2026-09-01', staff: [st('u2', 'photographer')] }),
  mk({ id: 'WB', event_date: '2026-09-02', staff: [st('u2', 'photographer')] }),
  mk({ id: 'WC', event_date: '2026-09-01', staff: [st('u4', 'photographer')] }),
]
const fcW = focusCandidates(fcFree, people, fcLoad, T)
assert.deepEqual(fcW.candidates.map((c) => c.person.id), ['u1', 'u3', 'u4', 'u2'])
assert.deepEqual(fcW.candidates.map((c) => c.workload), [0, 0, 1, 2])
assert.deepEqual(fcW.busy, [])

// opts.departments กรองเหมือน layoutDay
const fcDept = focusCandidates(fcLead, people, fcLeads, T, { departments: ['ฝ่ายออกแบบ'] })
assert.deepEqual(fcDept.candidates.map((c) => c.person.id), ['u1', 'u3'])
assert.deepEqual(fcDept.busy.map((c) => c.person.id), [])
assert.deepEqual(focusCandidates(fcLead, people, fcLeads, T, { departments: [] }).candidates.map((c) => c.person.id), ['u1', 'u3', 'u4'])
assert.deepEqual(focusCandidates(fcLead, [], fcLeads, T).candidates, [])

// --- groupPoolJobs: ใบงานเข้าแท็บฝ่าย ----------------------------------------
const pj = (overrides: Partial<PoolJob> = {}): PoolJob => ({
  id: 'j1',
  job_type: 'graphic',
  status: 'awaiting_claim',
  title: 'ใบงาน',
  assigned_to: [],
  crm_lead_id: 'l1',
  ...overrides,
})

// แยกตาม job_type
assert.deepEqual(
  groupPoolJobs([pj({ id: 'g1' }), pj({ id: 'o1', job_type: 'onsite' })]),
  { graphic: [pj({ id: 'g1' })], onsite: [pj({ id: 'o1', job_type: 'onsite' })] }
)
// ใบที่จบ ('done') และถูกข้าม ('skipped') ออกจากพูล
assert.deepEqual(
  groupPoolJobs([
    pj({ id: 'g1' }),
    pj({ id: 'g2', status: 'done' }),
    pj({ id: 'g3', status: 'skipped' }),
    pj({ id: 'o1', job_type: 'onsite', status: 'done' }),
    pj({ id: 'o2', job_type: 'onsite', status: 'in_progress' }),
  ]).graphic.map((j) => j.id),
  ['g1']
)
assert.deepEqual(
  groupPoolJobs([
    pj({ id: 'o1', job_type: 'onsite', status: 'skipped' }),
    pj({ id: 'o2', job_type: 'onsite', status: 'in_progress' }),
  ]).onsite.map((j) => j.id),
  ['o2']
)
// job_type ที่ไม่รู้จักไม่เข้าแท็บไหนเลย
assert.deepEqual(groupPoolJobs([pj({ id: 'x', job_type: 'other' })]), { graphic: [], onsite: [] })
// คงลำดับเดิมของ jobs
assert.deepEqual(
  groupPoolJobs([pj({ id: 'g3' }), pj({ id: 'g1' }), pj({ id: 'g2' })]).graphic.map((j) => j.id),
  ['g3', 'g1', 'g2']
)
// รายการสถานะที่ถือว่าจบส่งทับได้ (สถานะใบงานตั้งค่าเองได้)
assert.deepEqual(
  groupPoolJobs([pj({ id: 'g1', status: 'done' }), pj({ id: 'g2', status: 'sent' })], ['sent']).graphic.map((j) => j.id),
  ['g1']
)
// รายการว่าง = ไม่ตัดใบไหนเลย
assert.deepEqual(
  groupPoolJobs([pj({ id: 'g1', status: 'done' }), pj({ id: 'g2', status: 'skipped' })], []).graphic.map((j) => j.id),
  ['g1', 'g2']
)
assert.deepEqual(groupPoolJobs([]), { graphic: [], onsite: [] })
assert.deepEqual([...POOL_DONE_STATUSES], ['done', 'skipped'])

console.log('tracking-logic.check: all passed')
