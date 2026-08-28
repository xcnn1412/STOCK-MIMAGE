/* eslint-disable no-console */
// โมดูลเงินเดือน — ตรวจเครื่องคำนวณ (pure) + guard triggers ของสลิปที่ปิดงวดแล้ว
//
// Run:  npx tsx scripts/salary-check.ts
//
// ส่วน A: fixture ล้วน ไม่ต้องมี DB — 11 กรณีตาม docs/specs/salary-module.md §Testing
// ส่วน B: ยิง DB จริงผ่าน service role — ข้ามอัตโนมัติถ้าไม่มี env
//         หรือถ้า URL ไม่ใช่ local stack (กันเผลอเขียนลง production)
//         ล้างของทดสอบด้วย rpc purge_test_salary_run() ตอนจบ
//
// ต่อ DB อื่นได้ด้วย env CHECK_SUPABASE_URL / CHECK_SERVICE_KEY

import { config } from 'dotenv'
import {
  computeSlip,
  hasMissingAmounts,
  lastFinishedWeek,
  periodRange,
  selectCheckinsForRun,
  type CheckinInput,
  type DutyInput,
  type RunKind,
  type SalaryLine,
  type SalaryProfileInput,
} from '../app/(authenticated)/salary/compute'
// pure ล้วน ไม่มี 'use server' → เทสต์ import ตรงได้โดยไม่ลาก next/headers เข้ามา
import { costsRowsForSlip } from '../app/(authenticated)/salary/costs-sync'

config({ path: '.env.local' })

let failures = 0

function ok(name: string, detail = '') {
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ''}`)
}
function fail(name: string, detail: string) {
  failures++
  console.error(`  FAIL  ${name} — ${detail}`)
}
function assert(cond: boolean, name: string, detail = '') {
  if (cond) ok(name, detail)
  else fail(name, detail || 'assertion failed')
}
/** เทียบตัวเลข/สตริงแบบตรงตัว พร้อมพิมพ์ค่าที่ได้จริงเมื่อไม่ผ่าน */
function assertEq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) ok(name, a)
  else fail(name, `expected ${e}, got ${a}`)
}

// ────────────────────────────────────────────────────────────────────────────
// ส่วน A — เครื่องคำนวณ (ไม่ต้องมี DB)
// ────────────────────────────────────────────────────────────────────────────

/** เวลาไทย → ISO instant  เช่น ts('2026-08-05','09:00') = 2026-08-05T02:00:00.000Z */
function ts(dateBangkok: string, hhmm: string): string {
  return new Date(Date.parse(`${dateBangkok}T${hhmm}:00Z`) - 7 * 60 * 60 * 1000).toISOString()
}

/** rate card เดียวกับ seed ใน migration */
const DUTIES: DutyInput[] = [
  { code: 'onsite_staff', name_th: 'ออกงานสตาฟ', rate: 700, pay_mode: 'per_checkin', is_active: true },
  { code: 'deliver_booth', name_th: 'ส่งโฟโต้บูธ', rate: 150, pay_mode: 'per_checkin', is_active: true },
  { code: 'collect_booth', name_th: 'เก็บโฟโต้บูธ', rate: 150, pay_mode: 'per_checkin', is_active: true },
  { code: 'drive_booth', name_th: 'ขับรถออกบูธ', rate: 300, pay_mode: 'per_checkin', is_active: true },
  { code: 'runner', name_th: 'รันเนอร์', rate: 0, pay_mode: 'manual_daily', is_active: true },
]

const FULLTIME: SalaryProfileInput = {
  employment_type: 'fulltime', base_salary: 15000, work_start: '10:00', work_end: '19:00', ot_rate: 100,
}
const FREELANCE: SalaryProfileInput = {
  employment_type: 'freelance', base_salary: 0, work_start: '10:00', work_end: '19:00', ot_rate: 100,
}
/** ฟรีแลนซ์ที่เวลาเลิกงานต่างจากค่าเริ่มต้น — พิสูจน์ว่า OT อ่านเวลาทำงานจากโปรไฟล์ */
const FREELANCE_LATE: SalaryProfileInput = { ...FREELANCE, work_end: '20:00' }

const PERIOD = { periodStart: '2026-07-26', periodEnd: '2026-08-25' }
/** งวดสัปดาห์ จันทร์ 31 ส.ค. – อาทิตย์ 6 ก.ย. 2026 */
const WEEK = { periodStart: '2026-08-31', periodEnd: '2026-09-06' }
const OOP_RATE = 300

let checkinSeq = 0
function checkin(p: Partial<CheckinInput> & { checked_in_at: string }): CheckinInput {
  checkinSeq++
  return {
    id: `c${checkinSeq}`,
    check_type: 'onsite',
    checked_out_at: null,
    event_id: 'e1',
    event_name: 'งานทดสอบ',
    duties: [],
    out_of_province: false,
    ...p,
  }
}

function run(profile: SalaryProfileInput, checkins: CheckinInput[], previousLines?: SalaryLine[]) {
  return computeSlip({ profile, checkins, duties: DUTIES, oopRate: OOP_RATE, ...PERIOD, previousLines })
}

const otLines = (r: { lines: SalaryLine[] }) => r.lines.filter(l => l.kind === 'ot')
const siteLines = (r: { lines: SalaryLine[] }) => r.lines.filter(l => l.kind === 'site')

function partA() {
  console.log('\n=== PART A — computeSlip (pure, no DB) ===')

  // ── 1. ประจำ: office 09:00–20:30 → OT 2.5 ชม. (ก่อนเข้า 1 + หลังเลิก 1.5) ──
  console.log('\n[A1] fulltime OT before + after work window')
  {
    const r = run(FULLTIME, [checkin({
      check_type: 'office', checked_in_at: ts('2026-08-05', '09:00'), checked_out_at: ts('2026-08-05', '20:30'),
    })])
    assertEq(r.lines.length, 1, 'มีบรรทัดเดียว (OT)')
    assertEq(otLines(r)[0]?.hours, 2.5, 'OT = 2.5 ชม.')
    assertEq(otLines(r)[0]?.amount, 250, 'ยอด OT = 2.5 × 100')
    assertEq(r.total, 15250, 'total = ฐาน 15000 + OT 250')
  }

  // ── 2. ปัดลงบล็อก 30 นาที ────────────────────────────────────────────────
  console.log('\n[A2] OT rounds down to 30-minute blocks')
  {
    const short = run(FREELANCE, [checkin({
      checked_in_at: ts('2026-08-06', '10:00'), checked_out_at: ts('2026-08-06', '19:29'),
      duties: ['onsite_staff'],
    })])
    assertEq(otLines(short).length, 0, '29 นาที → ไม่มีบรรทัด OT')
    assertEq(short.total, 700, 'ได้เฉพาะค่าสตาฟ 700')

    const long = run(FREELANCE, [checkin({
      checked_in_at: ts('2026-08-06', '10:00'), checked_out_at: ts('2026-08-06', '19:59'),
      duties: ['onsite_staff'],
    })])
    assertEq(otLines(long)[0]?.hours, 0.5, '59 นาที → OT 0.5 ชม.')
    assertEq(otLines(long)[0]?.amount, 50, 'ยอด OT = 0.5 × 100')
  }

  // ── 3. ช่วงเวลาซ้อนกันในวันเดียว → ไม่นับซ้ำ ────────────────────────────
  console.log('\n[A3] overlapping intervals merge (no double count)')
  {
    const r = run(FULLTIME, [
      checkin({ check_type: 'office', checked_in_at: ts('2026-08-10', '10:00'), checked_out_at: ts('2026-08-10', '13:00') }),
      checkin({ checked_in_at: ts('2026-08-10', '12:30'), checked_out_at: ts('2026-08-10', '22:00'), duties: ['onsite_staff'] }),
    ])
    assertEq(otLines(r).length, 1, 'OT วันเดียวได้บรรทัดเดียว')
    assertEq(otLines(r)[0]?.hours, 3, 'OT = 3 ชม. (ไม่ใช่ 3.5 / ไม่นับซ้ำ)')
    assertEq(otLines(r)[0]?.amount, 300, 'ยอด OT = 3 × 100')
  }

  // ── 4. ข้ามเที่ยงคืน → OT อยู่ในวันที่เช็คอิน ──────────────────────────
  console.log('\n[A4] overnight shift counts on the check-in date')
  {
    const r = run(FREELANCE, [checkin({
      checked_in_at: ts('2026-08-12', '15:00'), checked_out_at: ts('2026-08-13', '02:00'),
      duties: ['onsite_staff'],
    })])
    assertEq(otLines(r).length, 1, 'ได้บรรทัด OT เดียว')
    assertEq(otLines(r)[0]?.date, '2026-08-12', 'OT ลงวันที่เช็คอิน')
    assertEq(otLines(r)[0]?.hours, 7, 'OT = 7 ชม. (19:00 → 02:00)')
    assertEq(otLines(r)[0]?.amount, 700, 'ยอด OT = 7 × 100')
  }

  // ── 5. ฟรีแลนซ์: office ไม่นับ, onsite นับ, ไม่มีเงินเดือนฐาน ──────────
  console.log('\n[A5] freelance ignores office check-ins and base salary')
  {
    const office = run(FREELANCE_LATE, [checkin({
      check_type: 'office', checked_in_at: ts('2026-08-14', '08:00'), checked_out_at: ts('2026-08-14', '21:00'),
    })])
    assertEq(office.lines.length, 0, 'office ของฟรีแลนซ์ไม่มีบรรทัด')
    assertEq(office.warnings.length, 0, 'office ของฟรีแลนซ์ไม่มีคำเตือน')
    assertEq(office.total, 0, 'ไม่มีเงินเดือนฐาน')

    const onsite = run(FREELANCE_LATE, [checkin({
      checked_in_at: ts('2026-08-14', '08:00'), checked_out_at: ts('2026-08-14', '21:00'),
      duties: ['onsite_staff'],
    })])
    assertEq(otLines(onsite)[0]?.hours, 3, 'OT = 3 ชม. (ก่อน 2 + หลัง 1 ตามเวลาทำงาน 10:00–20:00)')
    assertEq(siteLines(onsite)[0]?.amount, 700, 'ค่าสตาฟ 700')
    assertEq(onsite.total, 1000, 'total = 3×100 + 700')
  }

  // ── 6. หลายหน้าที่ในเช็คอินเดียว / เช็คอินที่ไม่ระบุหน้าที่ ─────────────
  console.log('\n[A6] multiple duties per check-in, and missing duties warns')
  {
    const r = run(FREELANCE, [
      checkin({
        checked_in_at: ts('2026-08-15', '11:00'), checked_out_at: ts('2026-08-15', '17:00'),
        duties: ['deliver_booth', 'collect_booth'], event_name: 'งาน A',
      }),
      checkin({
        checked_in_at: ts('2026-08-16', '11:00'), checked_out_at: ts('2026-08-16', '17:00'),
        duties: [],
      }),
    ])
    assertEq(siteLines(r).length, 2, 'ได้ 2 บรรทัดค่าสตาฟ')
    assertEq(siteLines(r).map(l => l.amount).sort((a, b) => Number(a) - Number(b)), [150, 150], 'บรรทัดละ 150')
    assertEq(siteLines(r).filter(l => l.date === '2026-08-16').length, 0, 'เช็คอินไม่มีหน้าที่ → ไม่มีบรรทัดค่าสตาฟ')
    assert(r.warnings.some(w => w.code === 'no_duty' && w.date === '2026-08-16'), 'มีคำเตือน no_duty')
    assertEq(r.total, 300, 'total = 150 + 150')
  }

  // ── 7. เบิ้ลต่างจังหวัด ─────────────────────────────────────────────────
  console.log('\n[A7] out-of-province bonus per check-in')
  {
    const r = run(FREELANCE, [checkin({
      checked_in_at: ts('2026-08-18', '11:00'), checked_out_at: ts('2026-08-18', '17:00'),
      duties: ['onsite_staff'], out_of_province: true, event_name: 'งานต่างจังหวัด',
    })])
    const oop = r.lines.filter(l => l.kind === 'oop')
    assertEq(oop.length, 1, 'ได้บรรทัดเบิ้ลต่างจังหวัด 1 บรรทัด')
    assertEq(oop[0]?.computed_amount, OOP_RATE, 'ยอดเท่าอัตราในตั้งค่า (300)')
    assertEq(oop[0]?.amount, OOP_RATE, 'amount ถูกเติมจากค่าคำนวณ')
    assertEq(r.total, 1000, 'total = 700 + 300')
  }

  // ── 8. รันเนอร์: 3 เช็คอินในวันเดียว → 1 บรรทัดรอกรอก ────────────────
  console.log('\n[A8] runner = one unfilled line per day')
  {
    const day = '2026-08-20'
    const r = run(FREELANCE, [
      checkin({ checked_in_at: ts(day, '10:00'), checked_out_at: ts(day, '12:00'), duties: ['runner'] }),
      checkin({ checked_in_at: ts(day, '13:00'), checked_out_at: ts(day, '15:00'), duties: ['runner'] }),
      checkin({ checked_in_at: ts(day, '16:00'), checked_out_at: ts(day, '18:00'), duties: ['runner'] }),
    ])
    const runner = r.lines.filter(l => l.kind === 'runner')
    assertEq(runner.length, 1, '3 เช็คอิน → 1 บรรทัดรันเนอร์')
    assertEq(runner[0]?.amount, null, 'ยอดยังเป็น null (รอ admin กรอก)')
    assertEq(runner[0]?.label, 'รันเนอร์ · 3 เช็คอิน', 'label บอกจำนวนเช็คอิน')
    assert(r.warnings.some(w => w.code === 'runner_missing' && w.date === day), 'มีคำเตือน runner_missing')
    assertEq(hasMissingAmounts(r.lines), true, 'hasMissingAmounts = true (ห้ามปิดงวด)')
    assertEq(r.total, 0, 'total ไม่รวมบรรทัดที่ยังไม่กรอก')
  }

  // ── 9. คำนวณใหม่ไม่ทับค่าที่แก้มือ ──────────────────────────────────────
  console.log('\n[A9] recompute keeps manual overrides, refreshes the rest')
  {
    const checkins = [
      checkin({ id: 'ovr-ot', check_type: 'office', checked_in_at: ts('2026-08-05', '09:00'), checked_out_at: ts('2026-08-05', '20:30') }),
      checkin({ id: 'ovr-site', checked_in_at: ts('2026-08-06', '11:00'), checked_out_at: ts('2026-08-06', '17:00'), duties: ['onsite_staff'] }),
    ]
    const first = run(FULLTIME, checkins)
    assertEq(first.total, 15950, 'รอบแรก total = 15000 + 250 + 700')

    const previousLines: SalaryLine[] = first.lines.map(l =>
      l.kind === 'ot'
        ? { ...l, amount: 999, override_note: 'OT พิเศษตกลงกับหัวหน้า' }
        : { ...l, amount: 1 }) // แก้ยอดโดยไม่ใส่เหตุผล → ต้องถูกคำนวณใหม่ทับ

    const second = run(FULLTIME, checkins, previousLines)
    const ot = second.lines.find(l => l.kind === 'ot')
    const site = second.lines.find(l => l.kind === 'site')
    assertEq(ot?.amount, 999, 'บรรทัดที่แก้มือ (มีเหตุผล) ยังเป็น 999')
    assertEq(ot?.override_note, 'OT พิเศษตกลงกับหัวหน้า', 'เหตุผลถูกคงไว้')
    assertEq(ot?.computed_amount, 250, 'ค่าคำนวณเดิมยังเก็บไว้เทียบได้')
    assertEq(site?.amount, 700, 'บรรทัดที่ไม่มีเหตุผลถูกคำนวณใหม่')
    assertEq(second.total, 16699, 'total = 15000 + 999 + 700')

    // 9b. เช็คอินถูกย้ายไปวันอื่น → key ของบรรทัดที่แก้มือเปลี่ยน → ต้องเตือน ไม่หายเงียบ
    const moved = checkins.map(c =>
      c.id === 'ovr-ot'
        ? { ...c, checked_in_at: ts('2026-08-07', '09:00'), checked_out_at: ts('2026-08-07', '20:30') }
        : c)
    const third = run(FULLTIME, moved, second.lines)
    const movedOt = third.lines.find(l => l.kind === 'ot')
    assertEq(movedOt?.date, '2026-08-07', 'บรรทัด OT ย้ายไปวันใหม่')
    assertEq(movedOt?.amount, 250, 'บรรทัดใหม่ได้ค่าคำนวณ (override เดิมจับคู่ไม่ได้)')
    assert(
      third.warnings.some(w => w.code === 'override_dropped' && w.date === '2026-08-05'),
      'มีคำเตือน override_dropped ของวันเดิม'
    )
    assert(
      !third.warnings.some(w => w.code === 'override_dropped' && w.date === '2026-08-06'),
      'บรรทัดที่ไม่ได้แก้มือไม่ถูกเตือน'
    )
  }

  // ── 10. เช็คอินที่ยังไม่ check-out ──────────────────────────────────────
  console.log('\n[A10] missing check-out warns but still pays the site line')
  {
    const r = run(FREELANCE, [checkin({
      checked_in_at: ts('2026-08-22', '11:00'), checked_out_at: null, duties: ['onsite_staff'],
    })])
    assertEq(otLines(r).length, 0, 'ไม่มีบรรทัด OT')
    assert(r.warnings.some(w => w.code === 'no_checkout' && w.date === '2026-08-22'), 'มีคำเตือน no_checkout')
    assertEq(siteLines(r)[0]?.amount, 700, 'ค่าสตาฟ 700 ยังได้')
    assertEq(r.total, 700, 'total = 700')
  }

  // ── 11. ขอบเขตงวด 26 ก.ค. – 25 ส.ค. ────────────────────────────────────
  console.log('\n[A11] period range boundaries (cutoff day 25)')
  {
    const range = periodRange('2026-08', 25)
    assertEq(range, { start: '2026-07-26', end: '2026-08-25' }, 'periodRange(2026-08, 25)')

    const boundary: CheckinInput[] = [
      checkin({ checked_in_at: ts('2026-07-25', '23:30'), duties: ['onsite_staff'] }),
      checkin({ checked_in_at: ts('2026-07-26', '00:30'), duties: ['onsite_staff'] }),
      checkin({ checked_in_at: ts('2026-08-25', '23:59'), duties: ['onsite_staff'] }),
      checkin({ checked_in_at: ts('2026-08-26', '00:00'), duties: ['onsite_staff'] }),
    ]
    const r = computeSlip({
      profile: FREELANCE, checkins: boundary, duties: DUTIES, oopRate: OOP_RATE,
      periodStart: range.start, periodEnd: range.end,
    })
    assertEq(siteLines(r).map(l => l.date), ['2026-07-26', '2026-08-25'], 'เข้าเฉพาะ 26 ก.ค. และ 25 ส.ค.')
    assertEq(r.total, 1400, 'total = 700 × 2')
  }

  // ── 12. งวดสัปดาห์: ไม่มีเงินเดือนฐาน ไม่มี OT ออฟฟิศ แต่ได้ค่าออกงาน + OT หน้างาน ──
  console.log('\n[A12] weekly run: no base salary, no office OT, onsite still pays')
  {
    const r = computeSlip({
      profile: FULLTIME,
      checkins: [
        checkin({
          check_type: 'office',
          checked_in_at: ts('2026-09-01', '09:00'), checked_out_at: ts('2026-09-01', '20:30'),
        }),
        checkin({
          checked_in_at: ts('2026-09-02', '08:00'), checked_out_at: ts('2026-09-02', '21:00'),
          duties: ['onsite_staff'],
        }),
      ],
      duties: DUTIES,
      oopRate: OOP_RATE,
      periodStart: WEEK.periodStart,
      periodEnd: WEEK.periodEnd,
      runKind: 'weekly',
    })
    assertEq(otLines(r).map(l => l.date), ['2026-09-02'], 'OT มาจากเช็คอินหน้างานเท่านั้น')
    assertEq(otLines(r)[0]?.hours, 4, 'OT = 4 ชม. (ก่อน 2 + หลัง 2)')
    assertEq(siteLines(r)[0]?.amount, 700, 'ค่าสตาฟ 700')
    assertEq(r.total, 1100, 'total = 400 + 700 (ไม่มีเงินเดือนฐาน 15000)')
  }

  // ── 13. selectCheckinsForRun — เก็บตก 60 วัน / จ่ายแล้วไม่ซ้ำ / office เฉพาะงวดเดือน ──
  console.log('\n[A13] selectCheckinsForRun: catch-up window, paid-once, office by kind')
  {
    const rows = [
      { id: 'in40', check_type: 'onsite' as const, checked_in_at: ts('2026-07-28', '10:00'), paid_slip_id: null },
      { id: 'out61', check_type: 'onsite' as const, checked_in_at: ts('2026-07-07', '10:00'), paid_slip_id: null },
      { id: 'paidOther', check_type: 'onsite' as const, checked_in_at: ts('2026-09-02', '10:00'), paid_slip_id: 'slip-other' },
      { id: 'paidSelf', check_type: 'onsite' as const, checked_in_at: ts('2026-09-03', '10:00'), paid_slip_id: 'slip-self' },
      { id: 'office', check_type: 'office' as const, checked_in_at: ts('2026-09-04', '10:00'), paid_slip_id: null },
      { id: 'after', check_type: 'onsite' as const, checked_in_at: ts('2026-09-07', '10:00'), paid_slip_id: null },
      { id: 'remote', check_type: 'remote' as const, checked_in_at: ts('2026-09-04', '10:00'), paid_slip_id: null },
    ]
    const weekly = { kind: 'weekly' as RunKind, period_start: '2026-08-31', period_end: '2026-09-06' }

    assertEq(
      selectCheckinsForRun(rows, weekly).map(r => r.id),
      ['in40'],
      'งวดสัปดาห์: เอาเฉพาะ onsite ค้างจ่ายใน 60 วัน (61 วัน/จ่ายแล้ว/office/remote/หลังงวด ตกหมด)'
    )
    assertEq(
      selectCheckinsForRun(rows, weekly, 'slip-self').map(r => r.id),
      ['in40', 'paidSelf'],
      'เช็คอินที่สลิปใบนี้เองจ่าย ยังอยู่ตอนคำนวณใหม่'
    )
    assertEq(
      selectCheckinsForRun(rows, { ...weekly, kind: 'monthly' }).map(r => r.id),
      ['in40', 'office'],
      'งวดเดือน: office ในช่วงงวดถูกนับด้วย'
    )
    assertEq(
      selectCheckinsForRun(
        [{ id: 'officeEarly', check_type: 'office' as const, checked_in_at: ts('2026-08-20', '10:00'), paid_slip_id: null }],
        { ...weekly, kind: 'monthly' }
      ).map(r => r.id),
      [],
      'office ก่อนวันเริ่มงวดไม่ถูกนับแม้เป็นงวดเดือน'
    )
  }

  // ── 14. งวดเดือนของประจำ: ฐาน + OT ออฟฟิศเฉพาะในช่วงงวด ────────────────
  console.log('\n[A14] monthly fulltime: base salary + office OT inside the period only')
  {
    const r = run(FULLTIME, [
      checkin({
        check_type: 'office',
        checked_in_at: ts('2026-08-05', '09:00'), checked_out_at: ts('2026-08-05', '20:30'),
      }),
      checkin({
        check_type: 'office',
        checked_in_at: ts('2026-07-20', '09:00'), checked_out_at: ts('2026-07-20', '20:30'),
      }),
    ])
    assertEq(otLines(r).map(l => l.date), ['2026-08-05'], 'OT ออฟฟิศเฉพาะวันที่อยู่ในช่วงงวด')
    assertEq(r.total, 15250, 'total = ฐาน 15000 + OT 250')
  }

  // ── 15. บรรทัดสลิป → แถวต้นทุน (job_cost_items) ────────────────────────
  console.log('\n[A15] costsRowsForSlip: site/oop ผูกอีเวนต์, OT ไม่ sync, runner เฉพาะวันอีเวนต์เดียว')
  {
    // k1 = 5 ส.ค. อีเวนต์ e1 (site + oop) · k2/k3 = 6 ส.ค. คนละอีเวนต์ (รันเนอร์ผูกไม่ได้)
    // k4 = 7 ส.ค. อีเวนต์เดียว (รันเนอร์ผูกได้) · k5 = 8 ส.ค. อีเวนต์ e4 (บรรทัดยอด 0)
    const checkins = [
      { id: 'k1', event_id: 'e1', checked_in_at: ts('2026-08-05', '09:00') },
      { id: 'k2', event_id: 'e1', checked_in_at: ts('2026-08-06', '09:00') },
      { id: 'k3', event_id: 'e2', checked_in_at: ts('2026-08-06', '14:00') },
      { id: 'k4', event_id: 'e3', checked_in_at: ts('2026-08-07', '09:00') },
      { id: 'k5', event_id: 'e4', checked_in_at: ts('2026-08-08', '09:00') },
    ]
    const lines: SalaryLine[] = [
      // แก้มือทับ 700 → 900: แถวต้นทุนต้องใช้ยอดหลังแก้มือ
      {
        key: 'site:2026-08-05:k1:onsite_staff', kind: 'site', date: '2026-08-05', checkin_id: 'k1',
        duty: 'onsite_staff', label: 'ออกงานสตาฟ', computed_amount: 700, amount: 900,
        override_note: 'งานยาว',
      },
      {
        key: 'oop:2026-08-05:k1', kind: 'oop', date: '2026-08-05', checkin_id: 'k1',
        label: 'เบิ้ลต่างจังหวัด', computed_amount: 300, amount: 300,
      },
      { key: 'ot:2026-08-05', kind: 'ot', date: '2026-08-05', label: 'OT 2 ชม.', hours: 2, computed_amount: 200, amount: 200 },
      { key: 'runner:2026-08-06:runner', kind: 'runner', date: '2026-08-06', duty: 'runner', label: 'รันเนอร์ · 2 เช็คอิน', computed_amount: 0, amount: 500 },
      { key: 'runner:2026-08-07:runner', kind: 'runner', date: '2026-08-07', duty: 'runner', label: 'รันเนอร์ · 1 เช็คอิน', computed_amount: 0, amount: 400 },
      // ยอด 0 — ไม่มีประโยชน์ในต้นทุน ไม่ต้องมีแถว
      {
        key: 'site:2026-08-08:k5:deliver_booth', kind: 'site', date: '2026-08-08', checkin_id: 'k5',
        duty: 'deliver_booth', label: 'ส่งโฟโต้บูธ', computed_amount: 150, amount: 0,
      },
    ]
    const dutyNames = Object.fromEntries(DUTIES.map(d => [d.code, d.name_th]))
    const { rows, skipped } = costsRowsForSlip(
      { id: 'slip1', user_id: 'u1', lines }, checkins, 'สมชาย ใจดี', dutyNames
    )

    assertEq(rows.length, 3, 'ได้ 3 แถว (site + oop วันที่ 5 ส.ค. และรันเนอร์วันที่ 7 ส.ค.)')
    assertEq(
      rows.map(r => [r.event_id, r.amount, r.cost_date]),
      [['e1', 900, '2026-08-05'], ['e1', 300, '2026-08-05'], ['e3', 400, '2026-08-07']],
      'อีเวนต์/ยอด (หลังแก้มือ)/วันที่ของแต่ละแถว'
    )
    assertEq(
      rows.map(r => r.description),
      ['ค่าสตาฟ สมชาย ใจดี — ออกงานสตาฟ', 'เบิ้ลต่างจังหวัด สมชาย ใจดี', 'รันเนอร์ สมชาย ใจดี'],
      'คำอธิบายของแต่ละแถว'
    )
    assertEq(
      rows.map(r => r.notes),
      [
        'salary_slip::slip1::site:2026-08-05:k1:onsite_staff',
        'salary_slip::slip1::oop:2026-08-05:k1',
        'salary_slip::slip1::runner:2026-08-07:runner',
      ],
      'คีย์ notes (idempotent) ตรงรูป salary_slip::<slipId>::<line.key>'
    )
    assert(!rows.some(r => r.notes.includes('ot:')), 'บรรทัด OT ไม่ถูก sync')
    assert(!rows.some(r => r.cost_date === '2026-08-08'), 'บรรทัด site ยอด 0 ไม่ถูก sync')
    assertEq(
      skipped, [{ key: 'runner:2026-08-06:runner', reason: 'costs_runner_skipped' }],
      'รันเนอร์วันที่มี 2 อีเวนต์ถูกข้ามพร้อมเหตุผล'
    )
  }

  // ── 16. สัปดาห์ล่าสุดที่จบแล้ว (จันทร์–อาทิตย์) ────────────────────────
  console.log('\n[A16] lastFinishedWeek (Monday / Sunday / mid-week)')
  {
    const week = { start: '2026-08-31', end: '2026-09-06' }
    assertEq(lastFinishedWeek('2026-09-09'), week, 'วันพุธ 9 ก.ย. → 31 ส.ค. – 6 ก.ย.')
    assertEq(lastFinishedWeek('2026-09-07'), week, 'วันจันทร์ 7 ก.ย. → สัปดาห์ที่เพิ่งจบ')
    assertEq(
      lastFinishedWeek('2026-09-06'), { start: '2026-08-24', end: '2026-08-30' },
      'วันอาทิตย์ 6 ก.ย. → สัปดาห์ก่อนหน้า (วันนี้ยังไม่จบสัปดาห์)'
    )
  }
}

// ────────────────────────────────────────────────────────────────────────────
// ส่วน B — guard triggers บน salary_slips (ต้องมี DB)
// ────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.CHECK_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY = process.env.CHECK_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

/** ยอมยิงเฉพาะ local stack — สคริปต์นี้เขียน/ลบข้อมูลจริง */
function isLocalStack(url: string): boolean {
  const host = url.replace(/^https?:\/\//, '')
  return host.startsWith('localhost') || host.startsWith('127.0.0.1')
}

async function partB() {
  console.log('\n=== PART B — salary_slips guard triggers (DB) ===')

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.log('  SKIP  ไม่พบ NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (.env.local) — ข้ามส่วน B')
    return
  }
  if (!isLocalStack(SUPABASE_URL)) {
    console.log(`  SKIP  ${SUPABASE_URL} ไม่ใช่ local stack — ข้ามส่วน B (สคริปต์นี้ห้ามรันกับ production)`)
    console.log('        รัน local stack แล้วตั้ง CHECK_SUPABASE_URL / CHECK_SERVICE_KEY เพื่อตรวจ trigger')
    return
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const periodKey = `ZZTEST-${Date.now()}`
  const periodKeyB = `${periodKey}-b`

  try {
    const { data: profile } = await supabase.from('profiles').select('id').limit(1).single()
    if (!profile) {
      fail('ส่วน B', 'ไม่พบ profiles สักแถวสำหรับใช้ทดสอบ')
      return
    }
    const userId = profile.id as string

    // ── งวดทดสอบ + สลิปร่าง ────────────────────────────────────────────
    console.log('\n[B1] create test run + draft slip')
    const { data: run1, error: runErr } = await supabase
      .from('salary_runs')
      .insert({ period_key: periodKey, period_start: '2026-07-26', period_end: '2026-08-25' })
      .select('id').single()
    assert(!runErr && !!run1, 'สร้างงวดทดสอบได้', runErr?.message || periodKey)
    if (!run1) return

    const { data: slip, error: slipErr } = await supabase
      .from('salary_slips')
      .insert({
        run_id: run1.id, user_id: userId, status: 'draft',
        lines: [{ key: 'ot:2026-08-05', kind: 'ot', date: '2026-08-05', label: 'OT 1 ชม.', computed_amount: 100, amount: 100 }],
        total: 100,
      })
      .select('id').single()
    assert(!slipErr && !!slip, 'สร้างสลิปร่างได้', slipErr?.message || '')
    if (!slip) return
    const slipId = slip.id as string

    // ── ปิดงวด → ผ่าน ──────────────────────────────────────────────────
    console.log('\n[B2] draft → finalized is allowed')
    {
      const { error } = await supabase.from('salary_slips')
        .update({ status: 'finalized', finalized_at: new Date().toISOString() }).eq('id', slipId)
      assert(!error, 'ปิดงวดสลิปร่างได้', error?.message || '')
    }

    // ── แก้ตัวเลขของสลิปที่ปิดงวดแล้ว → ถูกปฏิเสธ ────────────────────
    console.log('\n[B3] finalized slip is immutable')
    {
      const { error: e1 } = await supabase.from('salary_slips')
        .update({ lines: [{ key: 'hack', kind: 'ot', date: '2026-08-05', label: 'x', computed_amount: 0, amount: 0 }] })
        .eq('id', slipId)
      assert(!!e1, 'แก้ lines ของสลิปที่ปิดงวดแล้วถูกปฏิเสธ', e1?.message || 'no error returned')

      const { error: e2 } = await supabase.from('salary_slips').update({ total: 99999 }).eq('id', slipId)
      assert(!!e2, 'แก้ total ของสลิปที่ปิดงวดแล้วถูกปฏิเสธ', e2?.message || 'no error returned')
    }

    // ── finalized → paid + paid_at → ผ่าน ───────────────────────────────
    console.log('\n[B4] finalized → paid is allowed')
    {
      const { error } = await supabase.from('salary_slips')
        .update({ status: 'paid', paid_at: new Date().toISOString(), paid_by: userId }).eq('id', slipId)
      assert(!error, 'กด "จ่ายแล้ว" ได้', error?.message || '')
    }

    // ── ถอยสถานะ / ลบ → ถูกปฏิเสธ ─────────────────────────────────────
    console.log('\n[B5] status cannot go backwards, paid slip cannot be deleted')
    {
      const { error: e1 } = await supabase.from('salary_slips').update({ status: 'draft' }).eq('id', slipId)
      assert(!!e1, 'ถอยสถานะกลับเป็น draft ถูกปฏิเสธ', e1?.message || 'no error returned')

      const { error: e2 } = await supabase.from('salary_slips').delete().eq('id', slipId)
      assert(!!e2, 'ลบสลิปที่ปิดงวดแล้วถูกปฏิเสธ', e2?.message || 'no error returned')

      const { data: still } = await supabase.from('salary_slips').select('status').eq('id', slipId).single()
      assertEq(still?.status, 'paid', 'สลิปยังอยู่และสถานะยังเป็น paid')
    }

    // ── สลิปร่างลบได้ปกติ (ใช้งวดที่ 2 เลี่ยง UNIQUE(run_id, user_id)) ──
    console.log('\n[B6] draft slip can still be deleted')
    {
      const { data: run2 } = await supabase.from('salary_runs')
        .insert({ period_key: periodKeyB, period_start: '2026-07-26', period_end: '2026-08-25' })
        .select('id').single()
      const { data: draft } = await supabase.from('salary_slips')
        .insert({ run_id: run2!.id, user_id: userId, status: 'draft', total: 0 })
        .select('id').single()
      const { error } = await supabase.from('salary_slips').delete().eq('id', draft!.id)
      assert(!error, 'ลบสลิปร่างได้', error?.message || '')
    }

    // ── purge — ทางออกเดียวที่ล้างงวดทดสอบได้ ─────────────────────────
    console.log('\n[B7] purge_test_salary_run cleans up')
    {
      const { error } = await supabase.rpc('purge_test_salary_run', { p_period_key: periodKey })
      assert(!error, 'purge_test_salary_run สำเร็จ', error?.message || '')

      const { data: gone } = await supabase.from('salary_runs').select('id').eq('period_key', periodKey).maybeSingle()
      assertEq(gone, null, 'งวดทดสอบถูกลบพร้อมสลิปที่ปิดงวดแล้ว')

      const { error: guardErr } = await supabase.rpc('purge_test_salary_run', { p_period_key: '2026-08' })
      assert(!!guardErr, 'purge ปฏิเสธ period_key ที่ไม่ใช่ ZZTEST-', guardErr?.message || 'no error returned')
    }
  } finally {
    for (const key of [periodKey, periodKeyB]) {
      await supabase.rpc('purge_test_salary_run', { p_period_key: key })
    }
  }
}

// ────────────────────────────────────────────────────────────────────────────

async function main() {
  partA()
  await partB()
}

main()
  .catch(err => {
    failures++
    console.error('\nUNEXPECTED ERROR:', err instanceof Error ? err.message : err)
  })
  .finally(() => {
    console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`)
    process.exit(failures === 0 ? 0 : 1)
  })
