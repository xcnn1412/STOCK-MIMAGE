// Runnable self-check (no test runner in this repo).
// Run: npx tsx "app/(authenticated)/packages/package-logic.check.ts"
import assert from 'node:assert/strict'
import {
  allowedUnits,
  capacityWarnings,
  checkOptionUnits,
  copyName,
  MAX_PACKAGE_NAME,
  parsePackageForm,
  parseRequirementRows,
  requirementSummary,
  sortPackages,
} from './package-logic'
import type { CapacityInput, CapacityJob, CategoryUnit } from './types'

// --- parsePackageForm -----------------------------------------------------------
assert.deepEqual(parsePackageForm({ name: '  360DSLR ', description: ' ', price: '', is_active: true }), {
  name: '360DSLR',
  description: null,
  price: null,
  is_active: true,
})
assert.deepEqual(parsePackageForm({ name: 'x', description: 'ตู้ + ไฟ', price: '12,500', is_active: false }), {
  name: 'x',
  description: 'ตู้ + ไฟ',
  price: 12500,
  is_active: false,
})
assert.equal((parsePackageForm({ name: 'x', price: 0 }) as { price: number }).price, 0)
assert.ok('error' in parsePackageForm({ name: '   ' }))
assert.ok('error' in parsePackageForm({ name: 'ก'.repeat(MAX_PACKAGE_NAME + 1) }))
assert.ok(!('error' in parsePackageForm({ name: 'ก'.repeat(MAX_PACKAGE_NAME) })))
const neg = parsePackageForm({ name: 'x', price: -1 })
assert.ok('error' in neg && neg.error.includes('ติดลบ'))
assert.ok('error' in parsePackageForm({ name: 'x', price: 'abc' }))

// --- parseRequirementRows -------------------------------------------------------
const rows = parseRequirementRows([
  { categoryId: 'cam', quantity: 2, note: ' ', optionItemIds: ['i1', 'i1', 'i2'], optionKitIds: [] },
  { categoryId: 'pc', quantity: 1, optionItemIds: [], optionKitIds: ['k1'] },
])
assert.deepEqual(rows, [
  { categoryId: 'cam', quantity: 2, note: null, optionItemIds: ['i1', 'i2'], optionKitIds: [] },
  { categoryId: 'pc', quantity: 1, note: null, optionItemIds: [], optionKitIds: ['k1'] },
])
const dupCat = parseRequirementRows([
  { categoryId: 'cam', quantity: 1, optionItemIds: [], optionKitIds: [] },
  { categoryId: 'cam', quantity: 2, optionItemIds: [], optionKitIds: [] },
])
assert.ok('error' in dupCat && dupCat.error.includes('มีในแพ็กเกจแล้ว'))
for (const quantity of [0, 51, 1.5, NaN]) {
  assert.ok('error' in parseRequirementRows([{ categoryId: 'cam', quantity, optionItemIds: [], optionKitIds: [] }]), `quantity ${quantity}`)
}
assert.ok(!('error' in parseRequirementRows([{ categoryId: 'cam', quantity: 50, optionItemIds: [], optionKitIds: [] }])))
assert.ok('error' in parseRequirementRows([{ categoryId: '', quantity: 1, optionItemIds: [], optionKitIds: [] }]))
assert.deepEqual(parseRequirementRows([]), [])

// --- checkOptionUnits: ตัวเลือกต้องอยู่ในประเภท และไม่ใช่ของในกระเป๋า ---------------------
const u = (id: string, status = 'available', extra: Partial<CategoryUnit> = {}): CategoryUnit => ({ id, kind: 'item', name: `ชิ้น ${id}`, status, ...extra })
const camUnits: CategoryUnit[] = [u('i1'), u('i2'), u('i3', 'available', { inKit: true }), { id: 'k1', kind: 'kit', name: 'กระเป๋ากล้อง', status: 'available' }]
const req = (optionItemIds: string[], optionKitIds: string[] = []) => [{ categoryId: 'cam', quantity: 1, note: null, optionItemIds, optionKitIds }]
assert.deepEqual(checkOptionUnits(req(['i1'], ['k1']), { cam: camUnits }), { ok: true })
const inKit = checkOptionUnits(req(['i3']), { cam: camUnits })
assert.ok('error' in inKit && inKit.error.includes('อยู่ในกระเป๋า'))
assert.ok('error' in checkOptionUnits(req(['zz']), { cam: camUnits }))
// id กระเป๋าส่งมาเป็นอุปกรณ์เดี่ยว = ไม่อยู่ในประเภท
assert.ok('error' in checkOptionUnits(req(['k1']), { cam: camUnits }))

// --- allowedUnits: ว่าง = ทุกหน่วยในประเภท (ไม่รวมของในกระเป๋า) ---------------------------
assert.deepEqual(allowedUnits({ optionUnitIds: null }, camUnits).map(x => x.id), ['i1', 'i2', 'k1'])
assert.deepEqual(allowedUnits({ optionUnitIds: [] }, camUnits).map(x => x.id), ['i1', 'i2', 'k1'])
assert.deepEqual(allowedUnits({ optionUnitIds: ['i2', 'k1', 'i3'] }, camUnits).map(x => x.id), ['i2', 'k1'])

// --- requirementSummary / copyName / sortPackages -------------------------------------
assert.equal(requirementSummary([{ category_name: 'คอมพิวเตอร์', quantity: 1 }, { category_name: 'กล้อง', quantity: 2 }]), 'คอมพิวเตอร์ ×1 · กล้อง ×2')
assert.equal(requirementSummary([]), 'ยังไม่ตั้งอุปกรณ์')
assert.equal(copyName('Model 1', ['Model 1']), 'Model 1 (สำเนา)')
assert.equal(copyName('Model 1', ['Model 1', 'Model 1 (สำเนา)', 'Model 1 (สำเนา 2)']), 'Model 1 (สำเนา 3)')
assert.ok(copyName('ก'.repeat(MAX_PACKAGE_NAME), []).length <= MAX_PACKAGE_NAME)
assert.deepEqual(
  sortPackages([{ sort_order: 1, name: 'ข' }, { sort_order: 0, name: 'ค' }, { sort_order: 1, name: 'ก' }]).map(p => p.name),
  ['ค', 'ก', 'ข'],
)

// --- capacityWarnings -----------------------------------------------------------------
// ประเภท: กล้อง (ทั่วไป) 3 ชิ้น หนึ่งชิ้นเสีย · ตู้ประกอบ (ทีมขายเลือกชิ้นเอง) 2 ชุด
const base = (): CapacityInput => ({
  target: job('L0', [{ packageId: 'P', quantity: 1, units: [] }]),
  others: [],
  packages: {
    P: { id: 'P', name: 'Selfie', requirements: [{ id: 'rP-cam', categoryId: 'cam', quantity: 2, optionUnitIds: null }] },
    Q: { id: 'Q', name: '360', requirements: [{ id: 'rQ-cam', categoryId: 'cam', quantity: 1, optionUnitIds: null }] },
    B: { id: 'B', name: 'ตู้ประกอบ', requirements: [{ id: 'rB-booth', categoryId: 'booth', quantity: 1, optionUnitIds: null }] },
  },
  categories: {
    cam: { id: 'cam', name: 'กล้อง', sales_pick: false },
    booth: { id: 'booth', name: 'ตู้ประกอบ', sales_pick: true },
  },
  unitsByCategory: {
    cam: [u('c1'), u('c2'), u('c3', 'damaged'), u('c4', 'available', { inKit: true })],
    booth: [u('b1', 'available', { name: 'ตู้ประกอบ ชุด 1' }), u('b2', 'available', { name: 'ตู้ประกอบ ชุด 2' })],
  },
})
function job(leadId: string, packages: CapacityJob['packages'], extra: Partial<CapacityJob> = {}): CapacityJob {
  return { leadId, name: `งาน ${leadId}`, eventDate: '2026-11-01', eventTime: '10:00', eventEndTime: '18:00', packages, ...extra }
}

// ไม่มีงานอื่น: capacity หักสถานะไม่พร้อม (c3 เสีย, c4 อยู่ในกระเป๋า) = 2 พอดีกับที่ต้องใช้ 2 → ไม่เตือน
assert.deepEqual(capacityWarnings(base()), [])

// ไม่มีวันงาน = ไม่เตือน แม้ของไม่พอ
{
  const input = base()
  input.target = job('L0', [{ packageId: 'P', quantity: 5, units: [] }], { eventDate: null })
  assert.deepEqual(capacityWarnings(input), [])
}

// ของไม่พอแม้ไม่มีงานอื่น → แดง · need คูณจำนวนชุด
{
  const input = base()
  input.target = job('L0', [{ packageId: 'P', quantity: 2, units: [] }])
  const [w] = capacityWarnings(input)
  assert.equal(w.level, 'red')
  assert.equal(w.need, 4)
  assert.equal(w.capacity, 2)
  assert.equal(w.packageName, 'Selfie')
  assert.ok(w.message.includes('กล้อง') && w.message.includes('ไม่พอ'))
}

// งานอื่นเวลาทับ ยังไม่เลือกชิ้น (ประมาณการ) → เหลือง
{
  const input = base()
  input.others = [job('L1', [{ packageId: 'Q', quantity: 1, units: [] }])]
  const [w] = capacityWarnings(input)
  assert.equal(w.level, 'yellow')
  assert.equal(w.demandSure, 0)
  assert.equal(w.demandPlanned, 1)
  assert.deepEqual(w.leadIds, ['L1'])
  assert.ok(w.message.includes('อาจไม่พอ'))
}

// งานอื่นมีใบจัดของเลือกกล้องแล้ว (แน่นอน) → แดง · ไม่มีส่วนประมาณการ
{
  const input = base()
  input.others = [job('L1', [{ packageId: 'Q', quantity: 3, units: [] }], { packedUnits: [{ categoryId: 'cam', unitId: 'c1' }] })]
  const [w] = capacityWarnings(input)
  assert.equal(w.level, 'red')
  assert.equal(w.demandSure, 1)
  assert.equal(w.demandPlanned, 0)
}

// ชิ้นแน่นอนที่อยู่นอกชุดตัวเลือกของเราไม่นับ
{
  const input = base()
  input.packages.P.requirements[0] = { id: 'rP-cam', categoryId: 'cam', quantity: 1, optionUnitIds: ['c2'] }
  input.others = [job('L1', [], { packedUnits: [{ categoryId: 'cam', unitId: 'c1' }] })]
  assert.deepEqual(capacityWarnings(input), [])
  input.others = [job('L1', [], { packedUnits: [{ categoryId: 'cam', unitId: 'c2' }] })]
  const [w] = capacityWarnings(input)
  assert.equal(w.level, 'red')
  assert.equal(w.capacity, 1)
}

// ช่วงเวลา: จบตรงเวลาเริ่มพอดี = ไม่ทับ · วันอื่น = ไม่ทับ · ไม่มีเวลา = ทับทั้งวัน · งานปิดแล้วไม่นับ
{
  const input = base()
  const q = [{ packageId: 'Q', quantity: 1, units: [] }]
  input.others = [job('L1', q, { eventTime: '06:00', eventEndTime: '10:00' })]
  assert.deepEqual(capacityWarnings(input), [], 'จบตรงเวลาเริ่มพอดี = ไม่ทับ')
  input.others = [job('L1', q, { eventDate: '2026-11-02' })]
  assert.deepEqual(capacityWarnings(input), [], 'คนละวัน = ไม่ทับ')
  input.others = [job('L1', q, { eventTime: null, eventEndTime: null })]
  assert.equal(capacityWarnings(input)[0]?.level, 'yellow', 'ไม่มีเวลา = ทับทั้งวัน')
  input.others = [job('L1', q, { closed: true })]
  assert.deepEqual(capacityWarnings(input), [], 'งานปิดแล้วไม่นับ')
  // งาน target ที่ปนมาใน others ไม่นับตัวเอง
  input.others = [input.target]
  assert.deepEqual(capacityWarnings(input), [])
}

// ประเภทที่ทีมขายเลือกชิ้นเอง: ชุดเดียวกันให้สองงานเวลาทับ → แดงทั้งสองงาน แม้แบบประกอบต่างกัน
{
  const a = job('LA', [{ packageId: 'B', quantity: 1, units: [{ requirementId: 'rB-booth', unitId: 'b1', variant: 'ประกอบ 1' }] }], { name: 'งาน A' })
  const b = job('LB', [{ packageId: 'B', quantity: 1, units: [{ requirementId: 'rB-booth', unitId: 'b1', variant: 'ประกอบ 2' }] }], { name: 'งาน B' })
  const forA = capacityWarnings({ ...base(), target: a, others: [b] })
  assert.equal(forA.length, 1)
  assert.equal(forA[0].level, 'red')
  assert.equal(forA[0].unitId, 'b1')
  assert.equal(forA[0].message, 'ตู้ประกอบ ชุด 1 ถูกขายให้งาน งาน B (ประกอบ 2) วันเดียวกัน')
  const forB = capacityWarnings({ ...base(), target: b, others: [a] })
  assert.equal(forB[0]?.level, 'red')
  assert.ok(forB[0].message.includes('งาน A'))
  // คนละชุด → ไม่เตือน (มี 2 ชุด)
  const c = job('LC', [{ packageId: 'B', quantity: 1, units: [{ requirementId: 'rB-booth', unitId: 'b2' }] }])
  assert.deepEqual(capacityWarnings({ ...base(), target: a, others: [c] }), [])
  // ชุดเดียวกันแต่เวลาไม่ทับ → ไม่เตือน
  const late = { ...b, eventTime: '18:00', eventEndTime: '22:00' }
  assert.deepEqual(capacityWarnings({ ...base(), target: a, others: [late] }), [])
}

// หลายแพ็กเกจใช้ประเภทเดียวกัน → รวมเป็นแถวเดียว ชื่อแพ็กเกจคั่น " + "
{
  const input = base()
  input.target = job('L0', [
    { packageId: 'P', quantity: 1, units: [] },
    { packageId: 'Q', quantity: 1, units: [] },
  ])
  const ws = capacityWarnings(input)
  assert.equal(ws.length, 1)
  assert.equal(ws[0].need, 3)
  assert.equal(ws[0].packageName, 'Selfie + 360')
}

console.log('package-logic.check: ผ่านทั้งหมด')
