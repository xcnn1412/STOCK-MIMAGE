// หน้าลูกค้า CRM (/crm/[id]) — เรนเดอร์ LeadDetail แบบ static ด้วยข้อมูลสังเคราะห์ 3 ชุด (A/B/C) เพื่อเทียบ HTML ก่อน/หลังแตกไฟล์
// + ชุด D: FinancialCard โหมดแก้ไข (ช่องจำนวนเงิน/อัปโหลดสลิปครบทุกงวด, ตัวเลขสรุปภาษี)
// Run:  npx tsx scripts/crm-lead-detail-render.check.ts [โฟลเดอร์ปลายทาง]
//
// ไม่แตะเครือข่าย/ฐานข้อมูล: server action (../actions, ../../jobs/actions) ถูกแทนด้วยตัวจำลอง (async no-op คืน { success: true })
// next/navigation, sonner, @/lib/i18n/context ถูกแทนด้วยตัวจำลอง · ใส่โฟลเดอร์ปลายทาง = เขียน A.html/B.html/C.html ไว้ cmp
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "crm-lead-detail-render: ผ่านทั้งหมด"

process.env.TZ = 'Asia/Bangkok'

import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const noopActions = () => new Proxy({}, {
  get: (_t, key) => (key === '__esModule' ? true : typeof key === 'string' ? async () => ({ success: true }) : undefined),
})
const toast = Object.assign(() => {}, { error() {}, success() {}, info() {}, warning() {} })
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (/^(\.\.\/)+(jobs\/)?actions$/.test(request) || /packages\/actions$/.test(request)) return noopActions()
  if (request === 'next/navigation') {
    const real = realLoad.call(this, request, ...rest) as object
    return { ...real, useRouter: () => ({ refresh() {}, push() {}, replace() {}, back() {}, forward() {}, prefetch() {} }) }
  }
  if (request === 'sonner') return { toast, Toaster: () => null }
  if (/lib\/i18n\/context$/.test(request)) {
    const { getDictionary } = realLoad.call(this, '@/lib/i18n/dictionaries', ...rest) as typeof import('../lib/i18n/dictionaries')
    return { useLocale: () => ({ locale: 'th', setLocale() {}, t: getDictionary('th') }), LocaleProvider: ({ children }: { children: unknown }) => children }
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const LeadDetail = (require('../app/(authenticated)/crm/[id]/lead-detail') as typeof import('../app/(authenticated)/crm/[id]/lead-detail')).default
// ไฟล์ยังไม่มีก่อนแตกไฟล์ (รันบนโค้ดเดิมได้ — ข้าม D)
const financialPath = path.join(__dirname, '../app/(authenticated)/crm/[id]/components/financial-card.tsx')
const FinancialCard = fs.existsSync(financialPath)
  ? (require('../app/(authenticated)/crm/[id]/components/financial-card') as typeof import('../app/(authenticated)/crm/[id]/components/financial-card')).FinancialCard
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

type Props = Parameters<typeof LeadDetail>[0]
type Lead = Props['lead']
type Setting = Props['settings'][number]

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
let sid = 0
const setting = (category: string, value: string, label_th: string, label_en: string, over: Partial<Setting> = {}): Setting => ({
  id: uid(500 + ++sid), category, value, label_th, label_en, color: '#10b981', price: null, description: null,
  sort_order: sid, is_active: true, created_at: '2026-01-01T00:00:00+00:00', ...over,
})
const SETTINGS: Setting[] = [
  setting('kanban_status', 'lead', 'ลูกค้าใหม่', 'Lead', { color: '#3b82f6' }),
  setting('kanban_status', 'quotation_sent', 'ส่งใบเสนอราคา', 'Quotation sent', { color: '#f59e0b' }),
  setting('kanban_status', 'accepted', 'ตอบรับ', 'Accepted', { color: '#10b981' }),
  setting('kanban_status', 'rejected', 'ปฏิเสธ', 'Rejected', { color: '#ef4444' }),
  setting('tag', 'vip', 'ลูกค้า VIP', 'VIP', { color: '#8b5cf6' }),
  setting('tag', 'rush', 'งานด่วน', 'Rush', { color: null }),
  setting('tag_accepted', 'deposit_ok', 'มัดจำแล้ว', 'Deposit paid', { color: '#0ea5e9' }),
  setting('staff_role', 'photographer', 'ช่างภาพ', 'Photographer', { color: '#f97316' }),
  setting('staff_role', 'operator', 'คนคุมตู้', 'Operator', { color: null }),
  setting('package', 'pkg_a', 'แพ็กเกจ A', 'Package A', { price: 15000 }),
  setting('lead_source', 'line', 'LINE OA', 'LINE OA'),
  setting('customer_type', 'corporate', 'บริษัท', 'Corporate'),
]
const USERS: Props['users'] = [
  { id: uid(1), full_name: 'สมชาย ใจดี', department: 'ขาย' },
  { id: uid(2), full_name: 'มานี มีสุข', department: 'สตาฟ' },
]

const baseLead = (over: Partial<Lead>): Lead => ({
  id: uid(100), created_at: '2026-08-01T03:00:00+00:00', updated_at: '2026-08-02T03:00:00+00:00', created_by: uid(1),
  status: 'lead', is_returning: false, customer_name: 'บริษัท ทดสอบ จำกัด', customer_line: '@test', customer_phone: '081-234-5678',
  customer_type: 'corporate', work_type: 'event', unit_count: 1, lead_source: 'line',
  event_date: '2099-12-20', event_end_date: '2099-12-21', event_time: '10:00:00', event_end_time: '18:30:00', event_days: 2,
  event_location: 'ไบเทค บางนา', event_details: 'บูธถ่ายรูป 2 ตู้', required_roles: { photographer: 2, operator: 1 },
  package_name: 'pkg_a', quoted_price: 15000, confirmed_price: 0, deposit: 0,
  installment_1: 0, installment_2: 0, installment_3: 0, installment_4: 0,
  installment_1_date: null, installment_2_date: null, installment_3_date: null, installment_4_date: null,
  installment_1_paid: false, installment_2_paid: false, installment_3_paid: false, installment_4_paid: false,
  installment_1_paid_date: null, installment_2_paid_date: null, installment_3_paid_date: null, installment_4_paid_date: null,
  vat_mode: 'none', wht_rate: 0, quotation_ref: null, notes: null, tags: [], archived_at: null,
  assigned_sales: [], assigned_graphics: [], assigned_staff: [], total_installments_paid: 0,
  ...over,
})

const FIXTURES: Record<'A' | 'B' | 'C', Props> = {
  // A: แอดมิน · งานตอบรับแล้ว · 2 อีเวนต์ (คู่ปฏิบัติการ+ต้นทุน phase main / ต้นทุนอย่างเดียว) · 2 งวด (จ่ายแล้วมีสลิป) · แท็ก 2 แบบ
  A: {
    role: 'admin',
    lead: baseLead({
      status: 'accepted', is_returning: true, confirmed_price: 30000, deposit: 5000, quotation_ref: 'QT-2026-001',
      notes: 'ลูกค้าขอเพิ่มพร็อพ', tags: ['vip', 'deposit_ok'], vat_mode: 'excluded', wht_rate: 3,
    }),
    activities: [
      { id: uid(201), created_at: '2026-08-03T04:15:00+00:00', activity_type: 'status_change', description: null, old_status: 'quotation_sent', new_status: 'accepted', profiles: { full_name: 'สมชาย ใจดี' } },
      { id: uid(202), created_at: '2026-08-02T08:00:00+00:00', activity_type: 'call', description: 'โทรคุยรายละเอียดงาน', old_status: null, new_status: null, profiles: null },
      { id: uid(203), created_at: '2026-08-01T09:30:00+00:00', activity_type: 'note', description: 'ลูกค้าเก่า ขอส่วนลด', old_status: null, new_status: null, profiles: { full_name: null } },
    ],
    settings: SETTINGS,
    users: USERS,
    installments: [
      { id: uid(301), lead_id: uid(100), installment_number: 1, amount: 10000, due_date: '2026-08-15', is_paid: true, paid_date: '2026-08-14', receipt_url: 'https://x.supabase.co/storage/v1/object/public/receipts/slip-1.jpg', created_at: '2026-08-01T03:00:00+00:00' },
      { id: uid(302), lead_id: uid(100), installment_number: 2, amount: 15000, due_date: '2099-12-01', is_paid: false, paid_date: null, receipt_url: null, created_at: '2026-08-01T03:00:00+00:00' },
    ],
    eventStaffGroups: [
      { eventId: uid(401), eventName: 'บริษัท ทดสอบ จำกัด — วันงาน', eventDate: '2099-12-20', phase: 'main', staff: [
        { user_id: uid(2), full_name: 'มานี มีสุข', role: 'photographer' },
        { user_id: uid(3), full_name: null, role: 'unknown_role' },
      ] },
    ],
    linkedEvents: [
      { operationalId: uid(401), costId: uid(411), name: 'บริษัท ทดสอบ จำกัด — วันงาน', date: '2099-12-20', location: 'ไบเทค บางนา', status: 'confirmed', phase: 'main' },
      { operationalId: null, costId: uid(412), name: 'ค่าขนส่งเพิ่ม', date: null, location: null, status: null, phase: null },
    ],
    costSummary: {
      revenue: 30000, totalClaimed: 8250.5, totalPaid: 5000, totalPending: 3250.5, claimCount: 3,
      byPhase: { main: { count: 2, amount: 7000 }, unphased: { count: 1, amount: 1250.5 } },
      byStatus: { paid: { count: 1, amount: 5000 }, pending: { count: 2, amount: 3250.5 } },
      byEvent: [
        { eventId: uid(411), name: 'บริษัท ทดสอบ จำกัด — วันงาน', date: '2099-12-20', phase: 'main', count: 2, amount: 7000, paid: 5000, pending: 2000 },
        { eventId: uid(412), name: 'ค่าขนส่งเพิ่ม', date: null, phase: null, count: 1, amount: 1250.5, paid: 0, pending: 1250.5 },
      ],
    },
    leadJobs: [{ id: uid(601), job_type: 'graphic', title: 'ออกแบบกรอบรูป' }],
    // แพ็กเกจของงาน 1 รายการ (2 ชุด + ตู้ที่ทีมขายเลือก 1 ชิ้นจาก 2) + คำเตือนเหลือง 1 ข้อ — การ์ดลูกค้าโหมดดูต้องเป็นชิป
    packagePicker: {
      value: [{
        id: uid(701), packageId: uid(711), packageName: 'Selfie Studio Booth', price: 15000, isActive: true, quantity: 2,
        units: [{ requirementId: uid(721), unitId: uid(731), kind: 'item', unitName: 'ตู้ประกอบ ชุด 1', variant: 'ประกอบ 2' }],
      }],
      packages: [{
        id: uid(711), name: 'Selfie Studio Booth', price: 15000, is_active: true,
        requirements: [{ id: uid(721), categoryId: uid(741), categoryName: 'ตู้ประกอบ', quantity: 1, salesPick: true, variants: ['ประกอบ 1', 'ประกอบ 2'], optionUnitIds: null }],
      }],
      categoryUnits: { [uid(741)]: [{ id: uid(731), kind: 'item', name: 'ตู้ประกอบ ชุด 1', status: 'available' }, { id: uid(732), kind: 'item', name: 'ตู้ประกอบ ชุด 2', status: 'available' }] },
      unitBookings: [],
      warnings: [{
        categoryId: uid(751), categoryName: 'คอมพิวเตอร์', packageName: 'Selfie Studio Booth', level: 'yellow', need: 2, capacity: 2,
        demandSure: 0, demandPlanned: 1, message: 'คอมพิวเตอร์ อาจไม่พอ — ต้องใช้ 2 มีที่ใช้ได้ 2 และงานอื่นที่เวลาทับอาจใช้อีก 1', leadIds: [uid(102)],
      }],
      canEdit: true,
    },
  },
  // B: สตาฟ · ลูกค้าใหม่ · ไม่มีอีเวนต์/งวด/กิจกรรม · เก็บเข้าคลังแล้ว
  B: {
    role: 'staff',
    lead: baseLead({ status: 'lead', archived_at: '2026-09-01T00:00:00+00:00', event_date: null, event_end_date: null, event_time: null, event_end_time: null, required_roles: {}, customer_line: null }),
    activities: [], settings: SETTINGS, users: USERS, installments: [], eventStaffGroups: [], linkedEvents: [], leadJobs: [],
  },
  // C: แอดมิน · ปฏิเสธ · ราคาเสนออย่างเดียว · VAT รวมแล้ว + หัก ณ ที่จ่าย 3% (สรุปภาษีต้องขึ้น)
  C: {
    role: 'admin',
    lead: baseLead({ status: 'rejected', work_type: 'sale', unit_count: 3, quoted_price: 53500, vat_mode: 'included', wht_rate: 3, package_name: null, event_date: '2020-01-01', event_end_date: null }),
    activities: [], settings: SETTINGS, users: USERS, installments: [], eventStaffGroups: [], linkedEvents: [],
    costSummary: { revenue: 53500, totalClaimed: 0, totalPaid: 0, totalPending: 0, claimCount: 0, byPhase: {}, byStatus: {}, byEvent: [] },
    leadJobs: [],
  },
}

const outDir = process.argv[2]
if (outDir) fs.mkdirSync(outDir, { recursive: true })
for (const [name, props] of Object.entries(FIXTURES)) {
  const html = renderToStaticMarkup(createElement(LeadDetail, props))
  assert.ok(html.length > 1000, `${name}: HTML ว่าง`)
  assert.ok(html.includes(props.lead.customer_name), `${name}: ต้องมีชื่อลูกค้า`)
  if (props.packagePicker?.value.length) {
    // แพ็กเกจของงาน → ชิปชื่อแพ็กเกจ ×จำนวน + ตู้ที่เลือก + แบบประกอบ + ป้ายอุปกรณ์อาจไม่พอ + ยังเลือกตู้ไม่ครบ (โหมดดู ไม่มีปุ่มแก้)
    for (const s of ['Selfie Studio Booth', '×2', 'ตู้ประกอบ ชุด 1 (ประกอบ 2)', 'อุปกรณ์อาจไม่พอ: คอมพิวเตอร์', 'ยังไม่เลือก ตู้ประกอบ 1']) {
      assert.ok(html.includes(s), `${name}: การ์ดลูกค้าต้องมี "${s}"`)
    }
    assert.ok(!html.includes('แก้แพ็กเกจ'), `${name}: โหมดดูไม่มีปุ่มแก้แพ็กเกจ`)
  } else {
    assert.ok(!html.includes('ยังไม่เลือกแพ็กเกจ'), `${name}: ไม่มีแพ็กเกจของงาน = แสดงชื่อเดิมเหมือนก่อน`)
  }
  if (outDir) fs.writeFileSync(path.join(outDir, `${name}.html`), html)
  console.log(`PASS  ${name}  sha1=${crypto.createHash('sha1').update(html).digest('hex')}  (${html.length} chars)`)
}

// D: การ์ดการเงินโหมดแก้ไข (ข้อมูลชุด A) — ช่องจำนวนเงิน + ที่อัปโหลดสลิปครบทุกงวด · ตัวเลขสรุปภาษีถูก
if (FinancialCard) {
  const a = FIXTURES.A
  const lead = a.lead
  const noop = () => {}
  const html = renderToStaticMarkup(createElement(FinancialCard, {
    lead, editing: true, collapsed: false, saving: false,
    form: {
      customer_name: lead.customer_name, customer_line: '', customer_phone: '', customer_type: '', work_type: '', unit_count: '1',
      lead_source: '', is_returning: false, event_date: '', event_end_date: '', event_time: '', event_end_time: '', event_location: '',
      event_details: '', required_roles: {}, package_name: '', quoted_price: lead.quoted_price, confirmed_price: lead.confirmed_price,
      deposit: lead.deposit, vat_mode: lead.vat_mode, wht_rate: lead.wht_rate, quotation_ref: '', notes: '', tags: [],
    },
    formInstallments: a.installments.map(i => ({ installment_number: i.installment_number, amount: i.amount, due_date: i.due_date || '', is_paid: i.is_paid, paid_date: i.paid_date || '' })),
    initialInstallments: a.installments, localReceiptUrls: {}, uploadingInstallment: null,
    updateForm: noop, setFormInstallments: noop, onEdit: noop, onToggle: noop, onSave: noop, onCancel: noop, onUploadProof: noop, onDeleteProof: noop,
  }))
  const count = (needle: string) => html.split(needle).length - 1
  const n = a.installments.length
  assert.equal(count('จำนวน (฿)'), n, 'D: ช่องจำนวนเงิน 1 ช่องต่องวด')
  assert.equal(count('value="10000"'), 1, 'D: ช่องจำนวนเงินงวด 1 = 10000')
  assert.equal(count('type="file"'), n, 'D: ที่อัปโหลดสลิป 1 ที่ต่องวด')
  assert.equal(count('คลิกหรือลากไฟล์มาวาง'), 1, 'D: งวดที่ยังไม่มีสลิป = ช่องลากวาง')
  assert.equal(count('ดูขนาดเต็ม'), 0, 'D: โหมดแก้ไขไม่มีลิงก์ดูขนาดเต็ม')
  // 30,000 ยังไม่รวม VAT · หัก ณ ที่จ่าย 3% → VAT 2,100 · หัก 900 · สุทธิ 31,200 · จ่ายแล้ว 5,000 + 10,000 → ค้าง 16,200
  for (const s of ['฿30,000', '+฿2,100', '-฿900', '฿31,200', '฿16,200', 'หัก ณ ที่จ่าย 3%']) assert.ok(html.includes(s), `D: สรุปภาษีต้องมี ${s}`)
  console.log(`PASS  D  FinancialCard แก้ไข: ${n} งวด ช่องจำนวน+อัปโหลดครบ · สรุปภาษีถูก`)
}

// E: การ์ดลูกค้าโหมดแก้ไข (ข้อมูลชุด A) — ช่องแพ็กเกจเป็น PackagePicker ที่มีปุ่ม "แก้แพ็กเกจ" (ไม่ใช่ dropdown crm_settings เดิม)
//    ชุด C (ไม่ส่ง packagePicker) ยังเห็นชื่อเดิมอ่านอย่างเดียว
{
  /* eslint-disable-next-line @typescript-eslint/no-require-imports */
  const { CustomerCard } = require('../app/(authenticated)/crm/[id]/components/customer-card') as typeof import('../app/(authenticated)/crm/[id]/components/customer-card')
  const { buildLeadForm } = require('../app/(authenticated)/crm/[id]/shared') as typeof import('../app/(authenticated)/crm/[id]/shared') // eslint-disable-line @typescript-eslint/no-require-imports
  const noop = () => {}
  const card = (p: Props) => renderToStaticMarkup(createElement(CustomerCard, {
    lead: p.lead, form: buildLeadForm(p.lead, p.settings), updateForm: noop, editing: true, collapsed: false, saving: false,
    onEdit: noop, onToggle: noop, onSave: noop, onCancel: noop,
    settings: p.settings, workTypeOptions: [{ value: 'event', label: 'อีเวนต์' }], packagePicker: p.packagePicker,
  }))
  const a = card(FIXTURES.A)
  assert.ok(a.includes('แก้แพ็กเกจ') && a.includes('Selfie Studio Booth'), 'E: โหมดแก้ของชุด A ต้องเป็น PackagePicker')
  assert.ok(!a.includes('เลือกระบบที่ใช้บริการ'), 'E: ไม่มี dropdown แพ็กเกจแบบเดิม (placeholder tc.selectPackage)')
  const c = card({ ...FIXTURES.C, lead: { ...FIXTURES.C.lead, package_name: 'pkg_a' } })
  assert.ok(c.includes('แพ็กเกจ A') && !c.includes('แก้แพ็กเกจ'), 'E: ไม่มีข้อมูลแพ็กเกจของงาน = ชื่อเดิมอ่านอย่างเดียว')
  console.log('PASS  E  CustomerCard แก้ไข: ช่องแพ็กเกจเป็น PackagePicker')
}

console.log('crm-lead-detail-render: ผ่านทั้งหมด')
