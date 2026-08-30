// Runnable self-check for tracking-logic.ts (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/jobs/tracking/tracking-logic.check.ts"
import assert from 'node:assert/strict'
import {
  availabilityOf,
  bucketOf,
  chipCounts,
  dateRangesOverlap,
  daysUntil,
  getConflicts,
  getMissing,
  groupLeads,
  isPast,
  isReady,
  isUrgent,
  monthLabel,
  personClashes,
  timeStatus,
  vehicleAvailability,
  vehicleOf,
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

console.log('tracking-logic.check: all passed')
