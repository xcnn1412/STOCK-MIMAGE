// ชุดตรวจ usage-logic.ts (ไม่มี test runner) · รัน: npx tsx "app/(authenticated)/packing/usage-logic.check.ts"
import assert from 'node:assert/strict'
import {
  bangkokDayOf,
  boothUsage,
  categoryUsage,
  currentCounts,
  formatHours,
  hoursByMonth,
  inUsagePeriod,
  lineHours,
  NO_CATEGORY_TH,
  NO_VARIANT_TH,
  packageSales,
  peopleUsage,
  unitUsage,
  usagePeriodRange,
  USAGE_PERIOD_LABELS_TH,
  USAGE_PERIODS,
  type SoldPackage,
  type UsageLine,
  type UsageList,
} from './usage-logic'

let n = 0
const eq = (a: unknown, b: unknown, msg?: string) => {
  assert.deepEqual(a, b, msg)
  n++
}

const line = (o: Partial<UsageLine> = {}): UsageLine => ({
  unitId: 'u1',
  kind: 'item',
  unitName: 'กล้อง A',
  serial: 'SN1',
  categoryId: 'cam',
  categoryName: 'กล้อง',
  listId: 'L1',
  leadId: 'lead1',
  customerName: 'ลูกค้า',
  eventDate: '2026-10-01',
  eventTime: '10:00',
  eventEndTime: '18:00',
  handedOverAt: '2026-10-01T02:00:00Z', // 09:00 ไทย
  returnedAt: '2026-10-01T12:30:00Z',
  variant: null,
  ...o,
})

const list = (o: Partial<UsageList> = {}): UsageList => ({
  id: 'L1',
  status: 'done',
  eventDate: '2026-10-01',
  packedBy: null,
  packedAt: null,
  handedOverBy: null,
  handedOverAt: null,
  returnedBy: null,
  returnedAt: null,
  restockedBy: null,
  restockedAt: null,
  leadId: null,
  ...o,
})

// --- ช่วงเวลา -------------------------------------------------------------------
eq([...USAGE_PERIODS], ['all', 'month', 'quarter', 'year'])
eq(USAGE_PERIODS.map(p => USAGE_PERIOD_LABELS_TH[p]), ['ภาพรวม', 'เดือนนี้', '3 เดือน', 'ปีนี้'])
eq(usagePeriodRange('all', '2026-10-07'), null)
eq(usagePeriodRange('month', '2026-10-07'), { from: '2026-10-01', to: '2026-10-31' })
eq(usagePeriodRange('quarter', '2026-10-07'), { from: '2026-08-01', to: '2026-10-07' })
// quarter คร่อมปี: ม.ค. → ย้อนไป พ.ย. ปีก่อน · ก.พ. → ธ.ค. ปีก่อน
eq(usagePeriodRange('quarter', '2026-01-15'), { from: '2025-11-01', to: '2026-01-15' })
eq(usagePeriodRange('quarter', '2026-02-28'), { from: '2025-12-01', to: '2026-02-28' })
eq(usagePeriodRange('year', '2026-10-07'), { from: '2026-01-01', to: '2026-12-31' })
eq(usagePeriodRange('month', 'ไม่ใช่วันที่'), null)

// วันตามเวลาไทย: 17:30Z = 00:30 ของวันถัดไปในไทย
eq(bangkokDayOf('2026-09-30T17:30:00Z'), '2026-10-01')
eq(bangkokDayOf('2026-09-30T16:59:00Z'), '2026-09-30')
eq(bangkokDayOf(null), null)

// inUsagePeriod อิง handedOverAt (เวลาไทย) · ใบที่ยังไม่รับใช้ packedAt
const oct = usagePeriodRange('month', '2026-10-07')
eq(inUsagePeriod(line({ handedOverAt: '2026-09-30T17:30:00Z' }), oct), true) // เวลาไทย 1 ต.ค.
eq(inUsagePeriod(line({ handedOverAt: '2026-09-30T16:00:00Z' }), oct), false) // เวลาไทย 30 ก.ย.
eq(inUsagePeriod(line({ handedOverAt: null }), oct), false)
eq(inUsagePeriod(line({ handedOverAt: null }), null), true)
eq(inUsagePeriod(list({ handedOverAt: null, packedAt: '2026-10-02T03:00:00Z' }), oct), true)
eq(inUsagePeriod(list({ handedOverAt: '2026-09-15T03:00:00Z', packedAt: '2026-10-02T03:00:00Z' }), oct), false) // handedOverAt มาก่อน packedAt
eq(inUsagePeriod(list(), oct), false)

// --- ชั่วโมงใช้งาน ---------------------------------------------------------------
eq(lineHours(line()), 10.5) // 02:00Z → 12:30Z
eq(lineHours(line({ handedOverAt: '2026-10-01T02:00:00Z', returnedAt: '2026-10-01T03:20:00Z' })), 1.3) // 1.333… ปัด 1 ตำแหน่ง
eq(lineHours(line({ handedOverAt: '2026-10-01T02:00:00Z', returnedAt: '2026-10-01T02:03:00Z' })), 0.1) // 0.05 ปัดขึ้น
// ขาด returnedAt → ช่วงอีเวนต์ 10:00–18:00 = 8 ชม.
eq(lineHours(line({ returnedAt: null })), 8)
// fallback ข้ามเที่ยงคืน: 20:00 → 02:00 ยืดถึง 24:00 = 4 ชม.
eq(lineHours(line({ returnedAt: null, eventTime: '20:00:00', eventEndTime: '02:00:00' })), 4)
// ขาดเวลาทั้งคู่ (ไม่มีคืน และไม่มีเวลาอีเวนต์) = 0 ชั่วโมง แต่ยังนับครั้ง
const noTime = line({ returnedAt: null, eventTime: null, eventEndTime: null })
eq(lineHours(noTime), 0)
eq(unitUsage([noTime]).map(r => [r.count, r.hours]), [[1, 0]])
// ยังไม่รับของ = ไม่นับครั้ง ไม่นับชั่วโมง
eq(lineHours(line({ handedOverAt: null })), 0)
eq(unitUsage([line({ handedOverAt: null })]), [])
// คืนก่อนรับ (ข้อมูลเพี้ยน) ไม่ติดลบ
eq(lineHours(line({ returnedAt: '2026-10-01T01:00:00Z' })), 0)
eq(formatHours(12), '12.0')
eq(formatHours(1.25), '1.3')

// --- หน่วยที่ใช้บ่อย -------------------------------------------------------------
const lines: UsageLine[] = [
  line({ listId: 'L1' }), // u1 10.5
  line({ listId: 'L2', handedOverAt: '2026-10-03T02:00:00Z', returnedAt: '2026-10-03T03:20:00Z' }), // u1 1.333…
  line({ unitId: 'u2', unitName: 'กล้อง B', serial: null, listId: 'L1', returnedAt: null }), // 8
  line({ unitId: 'k1', kind: 'kit', unitName: 'กระเป๋าไฟ', categoryId: 'bag', categoryName: 'กระเป๋า', listId: 'L1' }),
  line({ unitId: 'k1', kind: 'kit', unitName: 'กระเป๋าไฟ', categoryId: 'bag', categoryName: 'กระเป๋า', listId: 'L2', handedOverAt: null }), // ยังไม่รับ
  line({ unitId: 'x1', unitName: 'สายไฟเสริม', categoryId: null, categoryName: null, listId: 'L1' }),
]
const units = unitUsage(lines)
eq(units.map(u => u.unitId), ['u1', 'k1', 'x1', 'u2']) // u1 2 ครั้ง · k1/x1 1 ครั้ง 10.5 ชม. (ชื่อ ก่อน ส) · u2 1 ครั้ง 8 ชม.
eq(units[0].count, 2)
eq(units[0].hours, 11.8) // 10.5 + 1.333 = 11.833 → 11.8 (ปัดผลรวม ไม่ใช่ 10.5 + 1.3)
eq(units[0].lastUsedAt, '2026-10-03T02:00:00Z')
eq(units[3].serial, null)

// --- ตามประเภท ------------------------------------------------------------------
const cats = categoryUsage(lines, [
  { categoryId: 'cam', categoryName: 'กล้อง', unitCount: 3 },
  { categoryId: 'bag', categoryName: 'กระเป๋า', unitCount: 2 },
  { categoryId: 'light', categoryName: 'ไฟ', unitCount: 4 },
])
eq(cats.map(c => [c.categoryName, c.unitCount, c.count, c.hours, c.unusedUnits]), [
  ['กล้อง', 3, 3, 19.8, 1], // u1 ×2 + u2 · ใช้ 2 หน่วยจาก 3
  ['กระเป๋า', 2, 1, 10.5, 1], // บรรทัดที่ยังไม่รับไม่นับ
  ['ไฟ', 4, 0, 0, 4], // ไม่ได้ใช้เลย = ทุกหน่วยอยู่ใน "ไม่ได้ใช้"
  [NO_CATEGORY_TH, 0, 1, 10.5, 0], // บรรทัดที่หน่วยไม่มีประเภท ต่อท้าย
])

// --- ตามแพ็กเกจ -----------------------------------------------------------------
const sold: SoldPackage[] = [
  { packageId: 'p1', packageName: '360DSLR', quantity: 2, eventDate: '2026-10-01', leadId: 'a', hasList: true },
  { packageId: 'p1', packageName: '360DSLR', quantity: 1, eventDate: '2026-10-07', leadId: 'b', hasList: false }, // วันนี้ = นับ
  { packageId: 'p1', packageName: '360DSLR', quantity: 5, eventDate: '2026-10-08', leadId: 'c', hasList: true }, // ยังไม่ถึงวัน
  { packageId: 'p2', packageName: 'Selfie', quantity: 1, eventDate: '2026-09-01', leadId: 'd', hasList: true },
  { packageId: 'p3', packageName: 'Slip', quantity: 1, eventDate: null, leadId: 'e', hasList: true }, // ไม่รู้วันงาน
]
eq(packageSales(sold, '2026-10-07'), [
  { packageId: 'p1', packageName: '360DSLR', soldSets: 3, listed: 1 },
  { packageId: 'p2', packageName: 'Selfie', soldSets: 1, listed: 1 },
])
eq(packageSales(sold, '2026-10-07', oct).map(r => r.packageId), ['p1']) // ชิปเดือนนี้ตัด Selfie (ก.ย.)

// --- ตู้และแบบประกอบ ------------------------------------------------------------
const booths = boothUsage(
  [
    line({ unitId: 'b1', unitName: 'ตู้ประกอบ ชุด 1', categoryId: 'booth', variant: 'ประกอบ 1' }),
    line({ unitId: 'b1', unitName: 'ตู้ประกอบ ชุด 1', categoryId: 'booth', variant: 'ประกอบ 2', listId: 'L2' }),
    line({ unitId: 'b1', unitName: 'ตู้ประกอบ ชุด 1', categoryId: 'booth', variant: 'ประกอบ 1', listId: 'L3' }),
    line({ unitId: 'b2', unitName: 'ตู้ประกอบ ชุด 2', categoryId: 'booth', variant: null }),
    line({ unitId: 'b3', unitName: 'ตู้ประกอบ ชุด 3', categoryId: 'booth', handedOverAt: null }), // ยังไม่ออกงาน
    line({ unitId: 'u1', categoryId: 'cam' }), // ไม่ใช่ประเภท sales_pick
  ],
  ['booth'],
)
eq(booths, [
  { unitId: 'b1', unitName: 'ตู้ประกอบ ชุด 1', count: 3, byVariant: [{ variant: 'ประกอบ 1', count: 2 }, { variant: 'ประกอบ 2', count: 1 }] },
  { unitId: 'b2', unitName: 'ตู้ประกอบ ชุด 2', count: 1, byVariant: [{ variant: NO_VARIANT_TH, count: 1 }] },
])
eq(boothUsage(lines, []), [])

// --- คน ------------------------------------------------------------------------
const lists: UsageList[] = [
  list({ id: 'A', status: 'done', packedBy: 'p1', handedOverBy: 'p2', returnedBy: 'p2', restockedBy: 'p1' }),
  list({ id: 'B', status: 'out', packedBy: 'p1', handedOverBy: 'p3' }),
  list({ id: 'C', status: 'picking', packedBy: 'p3' }), // ยังไม่ยืนยันจัดของ → ไม่นับจัดของ
  list({ id: 'D', status: 'returned', packedBy: 'p2', restockedBy: 'p3' }), // ยังไม่ done → ไม่นับคืนชั้น
  list({ id: 'E', status: 'ready', packedBy: 'ghost' }), // ไม่อยู่ในรายชื่อ
]
const people = peopleUsage(lists, [
  { id: 'p1', name: 'เอ' },
  { id: 'p2', name: 'บี' },
  { id: 'p3', name: 'ซี' },
  { id: 'p4', name: 'ดี' },
])
// p1 กับ p2 รวม 3 เท่ากัน → เรียงชื่อไทย (บี ก่อน เอ — สระหน้าไม่นับในการเรียง)
eq(people, [
  { userId: 'p2', name: 'บี', packed: 1, restocked: 0, handedOver: 1, returned: 1 },
  { userId: 'p1', name: 'เอ', packed: 2, restocked: 1, handedOver: 0, returned: 0 },
  { userId: 'p3', name: 'ซี', packed: 0, restocked: 0, handedOver: 1, returned: 0 },
])

// --- ตอนนี้ ---------------------------------------------------------------------
eq(currentCounts(lists), { ready: 1, out: 1, returned: 1 })
eq(currentCounts([]), { ready: 0, out: 0, returned: 0 })

// --- ชั่วโมงต่อเดือน --------------------------------------------------------------
const months = hoursByMonth(
  [
    line({ handedOverAt: '2026-09-30T17:30:00Z', returnedAt: '2026-09-30T19:30:00Z' }), // ไทย 1 ต.ค. → ต.ค. 2 ชม.
    line({ handedOverAt: '2026-01-10T02:00:00Z', returnedAt: null, eventTime: null, eventEndTime: null }), // ม.ค. 0 ชม. 1 ครั้ง
    line({ handedOverAt: '2025-10-10T02:00:00Z' }), // เกิน 12 เดือน → ไม่อยู่ในกราฟ
    line({ handedOverAt: null }),
  ],
  '2026-10-07',
)
eq(months.length, 12)
eq(months[0].month, '2025-11')
eq(months[11], { month: '2026-10', hours: 2, count: 1 })
eq(months.find(m => m.month === '2026-01'), { month: '2026-01', hours: 0, count: 1 })
eq(months.reduce((s, m) => s + m.count, 0), 2)
eq(hoursByMonth([], '2026-01-31', 3).map(m => m.month), ['2025-11', '2025-12', '2026-01']) // คร่อมปี

console.log(`usage-logic.check.ts (${n} assertion): ผ่านทั้งหมด`)
