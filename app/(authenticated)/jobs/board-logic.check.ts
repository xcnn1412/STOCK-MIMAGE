// Runnable self-check for board-logic.ts (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/jobs/board-logic.check.ts"
import assert from 'node:assert/strict'
import {
  bangkokToday,
  boardJobs,
  DEFAULT_DAY_CHIP,
  inDayChip,
  inDayWindow,
  isFloatingJob,
  ONSITE_ARRIVED_STATUS,
  ONSITE_JOB_TYPE,
  shouldAdvanceToOnsite,
  sortFloating,
  splitFloating,
} from './board-logic'

const TODAY = '2026-09-01'

// ---- inDayWindow: ช่วง [today, today+days] แบบปิดหัวปิดท้าย ----
assert.equal(inDayWindow('2026-09-01', TODAY, 7), true) // วันนี้
assert.equal(inDayWindow('2026-09-08', TODAY, 7), true) // ขอบท้ายพอดี
assert.equal(inDayWindow('2026-09-09', TODAY, 7), false) // เลยขอบท้าย
assert.equal(inDayWindow('2026-08-31', TODAY, 7), false) // เมื่อวาน = งานที่ผ่านแล้ว
assert.equal(inDayWindow('2026-09-01', TODAY, 0), true) // days 0 = เฉพาะวันนี้
assert.equal(inDayWindow('2026-09-02', TODAY, 0), false)

// ไม่มีวันงาน = ไม่อยู่ในช่วงเสมอ (ไม่ขึ้นบอร์ดหลัก)
assert.equal(inDayWindow(null, TODAY, 7), false)
assert.equal(inDayWindow(undefined, TODAY, 7), false)
assert.equal(inDayWindow('', TODAY, 7), false)

// ข้ามเดือน/ข้ามปีต้องไม่พังเพราะเทียบ string เฉยๆ
assert.equal(inDayWindow('2026-10-02', '2026-09-28', 7), true)
assert.equal(inDayWindow('2027-01-02', '2026-12-31', 7), true)
assert.equal(inDayWindow('2027-01-08', '2026-12-31', 7), false)

// timestamp เต็มก็ตัดเหลือวันได้
assert.equal(inDayWindow('2026-09-03T00:00:00Z', TODAY, 7), true)

// ---- ชิป ----
assert.equal(DEFAULT_DAY_CHIP, 'week7')
assert.equal(inDayChip('2026-09-05', TODAY, 'week7'), true)
assert.equal(inDayChip('2026-09-05', TODAY, 'today'), false)
assert.equal(inDayChip('2026-09-01', TODAY, 'today'), true)
// "ทั้งหมด" เห็นครบ รวมใบที่ยังไม่ระบุวันและงานที่ผ่านแล้ว
assert.equal(inDayChip(null, TODAY, 'all'), true)
assert.equal(inDayChip('2020-01-01', TODAY, 'all'), true)
assert.equal(inDayChip(null, TODAY, 'week7'), false)

// ---- ใบงานลอย ----
const jobs = [
  { id: 'a', job_type: ONSITE_JOB_TYPE, crm_lead_id: 'lead-1', event_date: '2026-09-02', title: 'งาน A' },
  { id: 'b', job_type: 'graphic', crm_lead_id: null, event_date: null, title: 'งาน B' },
  { id: 'c', job_type: ONSITE_JOB_TYPE, crm_lead_id: null, event_date: '2026-09-20', title: 'งาน C' },
  { id: 'd', job_type: ONSITE_JOB_TYPE, crm_lead_id: 'lead-2', event_date: null, title: 'งาน D' },
]

assert.equal(isFloatingJob(jobs[1]), true)
assert.equal(isFloatingJob(jobs[0]), false)

const split = splitFloating(jobs)
// ใบงานลอย = crm_lead_id null ทุกประเภทงาน ไม่กรองสถานะ/ช่วงวัน
assert.deepEqual(split.floating.map((j) => j.id), ['b', 'c'])
assert.deepEqual(split.linked.map((j) => j.id), ['a', 'd'])
// แยกแล้วต้องไม่หายและไม่ซ้ำ
assert.equal(split.floating.length + split.linked.length, jobs.length)

// ---- บอร์ด: หน้างานเท่านั้น + อยู่ในช่วงชิป ----
assert.deepEqual(boardJobs(jobs, TODAY, 'week7').map((j) => j.id), ['a'])
assert.deepEqual(boardJobs(jobs, TODAY, 'today').map((j) => j.id), [])
// ชิป "ทั้งหมด" เห็นใบงานหน้างานครบ (รวมใบไม่ระบุวัน) แต่ยังไม่มีใบกราฟิกหลุดเข้ามา
assert.deepEqual(boardJobs(jobs, TODAY, 'all').map((j) => j.id), ['a', 'c', 'd'])
assert.equal(boardJobs(jobs, TODAY, 'all').every((j) => j.job_type === ONSITE_JOB_TYPE), true)

// ---- เรียงใบงานลอย: มีวันงานก่อน วันใกล้สุดขึ้นก่อน ใบไม่ระบุวันไปท้าย ----
assert.deepEqual(
  sortFloating([
    { event_date: null, title: 'ไม่ระบุวัน' },
    { event_date: '2026-09-20', title: 'ไกล' },
    { event_date: '2026-09-02', title: 'ใกล้' },
  ]).map((j) => j.title),
  ['ใกล้', 'ไกล', 'ไม่ระบุวัน'],
)

// ---- วันนี้แบบ Asia/Bangkok ----
// 2026-09-01T18:30Z = 2026-09-02 01:30 ที่ไทย → ต้องได้วันถัดไป ไม่ใช่วันของ UTC
assert.equal(bangkokToday(new Date('2026-09-01T18:30:00Z')), '2026-09-02')
assert.equal(bangkokToday(new Date('2026-09-01T16:00:00Z')), '2026-09-01')
assert.match(bangkokToday(), /^\d{4}-\d{2}-\d{2}$/)

// ---- ขยับเป็น "ออกหน้างาน" อัตโนมัติเมื่อทีมเช็คอินหน้างาน ----
// ไปป์ไลน์มาตรฐานของ status_onsite (เรียงตาม sort_order)
const PIPELINE = ['awaiting_claim', 'preparing', 'loading', 'onsite', 'teardown', 'done']

assert.equal(ONSITE_ARRIVED_STATUS, 'onsite')

// ก่อนถึงออกหน้างาน = ขยับ
assert.equal(shouldAdvanceToOnsite('awaiting_claim', PIPELINE), true)
assert.equal(shouldAdvanceToOnsite('preparing', PIPELINE), true)
assert.equal(shouldAdvanceToOnsite('loading', PIPELINE), true)

// อยู่ที่ออกหน้างานแล้ว = ไม่แตะ (เช็คอินซ้ำก็ไม่เปลี่ยนอะไร — idempotent)
assert.equal(shouldAdvanceToOnsite('onsite', PIPELINE), false)

// เลยไปแล้ว = ห้ามถอยหลัง
assert.equal(shouldAdvanceToOnsite('teardown', PIPELINE), false)
assert.equal(shouldAdvanceToOnsite('done', PIPELINE), false)

// สถานะแปลกปลอม (ไม่อยู่ในไปป์ไลน์) = ไม่แตะ
assert.equal(shouldAdvanceToOnsite('unknown_status', PIPELINE), false)
assert.equal(shouldAdvanceToOnsite('', PIPELINE), false)

// ถูกข้าม = ไม่แตะ แม้จะถูกจัดลำดับไว้ก่อนออกหน้างานก็ตาม
assert.equal(shouldAdvanceToOnsite('skipped', PIPELINE), false)
assert.equal(shouldAdvanceToOnsite('skipped', ['skipped', 'onsite']), false)
assert.equal(shouldAdvanceToOnsite('done', ['done', 'onsite']), false)

// ไม่มีขั้น "ออกหน้างาน" ในลำดับ = ไม่มีปลายทางให้ขยับ
assert.equal(shouldAdvanceToOnsite('preparing', ['awaiting_claim', 'preparing', 'teardown']), false)
assert.equal(shouldAdvanceToOnsite('preparing', []), false)

// ลำดับที่แอดมินแก้เอง (ตัด/สลับขั้น) ยังตัดสินจากลำดับจริง ไม่ใช่ชื่อขั้นที่ hardcode
assert.equal(shouldAdvanceToOnsite('awaiting_claim', ['awaiting_claim', 'onsite']), true)
assert.equal(shouldAdvanceToOnsite('loading', ['onsite', 'loading']), false)

console.log('board-logic.check: all passed')
