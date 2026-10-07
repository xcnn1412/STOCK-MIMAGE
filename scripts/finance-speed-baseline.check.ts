// ความเร็วของส่วนใบเบิก (ขั้น 3 · BATCH 0) — วัดค่า "ก่อน" ด้วยข้อมูลขนาดเท่า production ผ่านฟังก์ชันของหน้าตัวจริง
// Run:  npx tsx scripts/finance-speed-baseline.check.ts                  (วัดใหม่แล้วเทียบกับ scripts/fixtures/finance-speed.golden.json)
//       npx tsx scripts/finance-speed-baseline.check.ts --write-golden   (เก็บค่า "ก่อน" — เขียนครั้งเดียวจาก data functions ของ 3248bde ที่ยังไม่แก้)
//
// golden ชุดนี้เขียนจากโค้ดของ 3248bde (v1.26.0): page.tsx ของ /finance, /finance/archive, /finance/overview, /finance/download,
// /finance/payouts, /finance/[id] และ action ใน actions.ts / lifecycle-actions.ts ตามที่อยู่ในคอมมิตนั้น (ไม่มีการแก้ของขั้น 3)
//
// สิ่งที่วัด (ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง ไม่ต้องมี env):
//   - ขนาด props ที่ server ส่งให้หน้าจอ = Buffer.byteLength(JSON.stringify(props)) ของ view component ที่ page.tsx คืน
//   - rounds = จำนวนรอบของฐานข้อมูลที่ต้องรอต่อกัน: คำขอ/อัปโหลดที่เริ่มตอนไม่มีคำขออื่นค้างอยู่ = รอบใหม่
//     (ตัวจำลองตอบทุกคำขอที่ค้างพร้อมกันเป็นชุด — คำขอที่ส่งพร้อมกันอยู่รอบเดียวกัน คำขอที่รอผลของอีกอันนับเป็นรอบถัดไป ·
//     logActivity / createNotifications ตัวจำลองนับเป็นคำขอด้วย เพราะใน production เป็นการเขียนฐานข้อมูล · uploadRounds = รอบที่มีอัปโหลด)
//   - maxInFlightWrites = จำนวนสูงสุดของ insert expense_claim_logs + logActivity + createNotifications ที่ค้างพร้อมกันใน action หนึ่ง
//   - ยอดอ้างอิงคิดด้วยสูตรของหน้าจอ "ปัจจุบัน" ที่คัดลอกไว้ในไฟล์นี้ (คลังเก็บ / รายงานตรวจสอบ / หัก ณ ที่จ่าย / สรุปยอดจ่าย)
//     + getClaimChecklist / claimFileCount / filedState ตัวจริงรายแถว — หลังเปลี่ยนรูปข้อมูล (BATCH 1) ต้องได้ค่าเดิม (2 ตำแหน่ง)
// ข้อมูลสังเคราะห์สุ่มแบบกำหนด seed (ผลเหมือนเดิมทุกครั้ง) · เวลาของระบบตรึงไว้ที่ 2026-09-30 12:00 เวลาไทย
// ใบเบิก 2,000 ใบ (ใกล้ production 1,936): จ่ายแล้ว ~82% · เดือนนี้ 230 ใบ · หัก ณ ที่จ่าย ~21% · ผูกงาน 61% · ผู้เบิก 39 คน (5 คนถือ 58%)
// งาน 300 งาน · วงเงินสดย่อยเดือนละ 1 วงพร้อมรายการในกล่อง · ใบที่ซ่อน 18 ใบ — ชื่อ เลขบัญชี เลขบัตร ที่อยู่ ทั้งหมดสังเคราะห์
//
// ตัวจำลอง PostgREST แบบเข้มงวด: เพดาน 1,000 แถวต่อคำขอ · embed ผ่าน alias:table!fkey(...) · count/head · range · limit ·
// eq/neq/in/is/not/gt/gte/lt/lte/like/ilike (\ escape, * = %) · rpc (ฟังก์ชันที่ไม่มี = PGRST202) · storage upload/remove/getPublicUrl ·
// คอลัมน์ที่ "ยังไม่มี" ปิดได้ (dropped → 42703 / PGRST204) · เมธอดที่ไม่ได้ทำไว้ throw · React.cache ทำงานต่อคำขอแบบ Next
//
// โหมดไม่มีธง: วัดใหม่ → ยอดอ้างอิงต้องเท่า golden · ขนาดและรอบต้องไม่มากกว่า golden · พิมพ์ตารางก่อน/ตอนนี้/เป้าของขั้น 3
// BATCH 1 (ขั้น 3): ตัวอ่าน props รูปใหม่ (ListClaim / ArchivePageData / OverviewRow / WhtCell) คิดยอดชุดเดียวกับ golden —
//   คลังเก็บเดินทุกหน้า + 10 ตัวกรองผ่าน URL · รายงานตรวจสอบวัดทีละ preset · หัก ณ ที่จ่ายรวม cells แบบหน้าจอ (ทางสำรอง + rpc ตัวจำลอง SQL)
// แล้วตรวจเป้าของขั้น 3 (AC4 AC7 AC9 AC11 AC13 AC16 AC18 AC21 AC26 + ทางสำรองเมื่อยังไม่รัน SQL) — รูป props ที่ไม่รู้จักทำให้สคริปต์ล้มพร้อมบอกหน้า
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-speed-baseline: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { outstandingKind } from '../app/(authenticated)/finance/claim-rules'
import { dirname, join } from 'node:path'
import { isValidElement, type ReactElement } from 'react'

process.env.SESSION_SECRET = 'finance-speed-baseline-check'
const PROJECT = 'qwertyuiopasdfghjklz'
process.env.NEXT_PUBLIC_SUPABASE_URL = `https://${PROJECT}.supabase.co`
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'finance-speed-baseline-anon'

const ROOT = join(__dirname, '..')
const FINANCE = join(ROOT, 'app', '(authenticated)', 'finance')
const GOLDEN = join(ROOT, 'scripts', 'fixtures', 'finance-speed.golden.json')
const WRITE = process.argv.includes('--write-golden')

type Row = Record<string, unknown>
type DbError = { code: string; message: string; details?: string }
type Result = { data: unknown; error: DbError | null; count?: number | null }

// ── เวลาตรึง (Date.now / new Date() ไม่มีอาร์กิวเมนต์) ─────────────────────────────────
const NOW_ISO = '2026-09-30T05:00:00.000Z' // 30 ก.ย. 2569 12:00 เวลาไทย
const RealDate = Date
const FIXED_NOW = RealDate.parse(NOW_ISO)
globalThis.Date = new Proxy(RealDate, {
  construct: (target, args, newTarget) => Reflect.construct(target, args.length === 0 ? [FIXED_NOW] : args, newTarget),
  get: (target, prop, receiver) => (prop === 'now' ? () => FIXED_NOW : Reflect.get(target, prop, receiver)),
}) as DateConstructor
const HOUR = 3_600_000
const DAY = 24 * HOUR
const THAI = 7 * HOUR

// ── สุ่มแบบกำหนด seed (mulberry32) ────────────────────────────────────────────────
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = seeded(20261001)
const tieRand = seeded(7)
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
const chance = (p: number) => rand() < p
const between = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1))
function weighted<T>(items: readonly (readonly [T, number])[]): T {
  const total = items.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of items) if ((r -= w) < 0) return v
  return items[items.length - 1][0]
}
const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)))
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** timestamptz แบบที่ PostgREST คืน (ไมโครวินาที + +00:00) */
const pgTs = (ms: number, micro = 0) => `${new RealDate(ms).toISOString().slice(0, 23)}${String(micro % 1000).padStart(3, '0')}+00:00`
const isoDay = (ms: number) => new RealDate(ms).toISOString().slice(0, 10)
const thaiDayOf = (ms: number) => new RealDate(ms + THAI).toISOString().slice(0, 10)
const money2 = (n: number) => Math.round(n * 100) / 100

// ══ ข้อมูลสังเคราะห์ ═══════════════════════════════════════════════════════════════
const ADMIN = uid(1), ADMIN_B = uid(2)
const FIRST = ['สมชาย', 'สมหญิง', 'ปิยะพงษ์', 'วรรณา', 'ธนพล', 'กิตติพร', 'ณัฐวุฒิ', 'ศิริพร', 'อนุชา', 'พิมพ์ชนก', 'ชยพล', 'จิราพร', 'ธีรวัฒน์', 'สุภาวดี', 'เอกชัย', 'กมลชนก', 'ภานุวัฒน์', 'รัตนาภรณ์', 'วีรยุทธ', 'นภัสสร']
const LAST = ['ใจดี', 'ศรีสุข', 'วงศ์สวัสดิ์', 'แสงทอง', 'บุญมา', 'ทองคำ', 'พรหมมา', 'สุขสวัสดิ์', 'เจริญผล', 'รุ่งเรือง', 'ชัยมงคล', 'ศักดิ์สิทธิ์', 'กาญจนา', 'สมบูรณ์', 'อินทร์แก้ว']
const BANKS = ['ธนาคารกสิกรไทย', 'ธนาคารไทยพาณิชย์', 'ธนาคารกรุงเทพ', 'ธนาคารกรุงไทย', 'ธนาคารกรุงศรีอยุธยา', 'ธนาคารทหารไทยธนชาต']
const bankNo = () => `${between(100, 999)}-${between(0, 9)}-${between(10000, 99999)}-${between(0, 9)}`

const SUBMITTERS = Array.from({ length: 39 }, (_, i) => uid(101 + i))
/** 5 คนแรกถือ 58% ของใบ ที่เหลือ 34 คนแบ่ง 42% */
const SUBMITTER_WEIGHTS = SUBMITTERS.map((id, i) => [id, i < 5 ? 0.116 : 0.42 / 34] as const)
const STAFF_TOP = SUBMITTERS[0]

function person(id: string, i: number, role: string): Row {
  const full = `${FIRST[i % FIRST.length]} ${LAST[(i * 7 + Math.floor(i / FIRST.length)) % LAST.length]}`
  const hasBank = role === 'admin' || i % 3 !== 2
  return {
    id, full_name: full, nickname: `น้อง${FIRST[(i + 3) % FIRST.length].slice(0, 3)}`, role, department: role === 'admin' ? 'บัญชี' : 'สตาฟ',
    is_approved: true, active_session_id: `sess-${id}`,
    bank_name: hasBank ? BANKS[i % BANKS.length] : null,
    bank_account_number: hasBank ? `${100 + i}-${i % 10}-${String(10000 + i * 37).slice(-5)}-${i % 7}` : null,
    account_holder_name: hasBank ? full : null,
    national_id: `1${String(1000000000000 + i * 7919).slice(-12)}`,
    address: `${10 + i}/${i % 9 + 1} หมู่ ${i % 12 + 1} ถนนทดสอบ แขวงทดสอบ เขตทดสอบ กรุงเทพมหานคร 10${String(100 + i).slice(-3)}`,
    avatar_url: null, created_at: pgTs(RealDate.UTC(2025, 0, 1) + i * DAY),
  }
}

const EVENT_KINDS = ['งานเปิดตัวสินค้า', 'งานแต่งงาน', 'งานสัมมนาประจำปี', 'งานแสดงสินค้า', 'งานเลี้ยงบริษัท', 'งานคอนเสิร์ตการกุศล', 'งานวันเกิด', 'งานประชุมผู้ถือหุ้น', 'งานอีเวนต์ห้างสรรพสินค้า', 'งานรับปริญญา']
const CLIENTS = ['บริษัทสยามเทรดดิ้ง', 'โรงแรมริเวอร์ไซด์', 'เซ็นทรัลเวิลด์', 'ไอคอนสยาม', 'เมืองทองธานี', 'คุณนภาและคุณต้น', 'มหาวิทยาลัยเกษตรศาสตร์', 'ไบเทคบางนา', 'ศูนย์ประชุมสิริกิติ์', 'เอ็มควอเทียร์']
const EVENT_ITEMS = ['ค่าเดินทางไปติดตั้งบูธ', 'ค่าน้ำมันรถขนอุปกรณ์', 'ค่าอาหารทีมงานภาคสนาม', 'ค่าจ้างช่างภาพและผู้ช่วย', 'ค่าเช่าเครื่องเสียงเพิ่มเติม', 'ค่าพิมพ์ป้ายไวนิลหน้างาน', 'ค่าอุปกรณ์ตกแต่งโต๊ะรับแขก', 'ค่าทางด่วนและที่จอดรถ', 'ค่าน้ำดื่มและน้ำแข็งทีมงาน', 'ค่าที่พักทีมงานคืนก่อนงาน']
const OTHER_TITLES = ['ค่าอุปกรณ์สำนักงานประจำเดือน', 'ค่าซ่อมแซมเครื่องพิมพ์สำนักงาน', 'ค่าบริการอินเทอร์เน็ตรายเดือนออฟฟิศ', 'ค่าวัสดุสิ้นเปลืองห้องสตูดิโอถ่ายภาพ', 'ค่าส่งพัสดุอุปกรณ์ให้ลูกค้าต่างจังหวัด', 'ค่าที่พักทีมงานเดินทางต่างจังหวัด', 'ค่ากาแฟและของว่างรับรองลูกค้าที่ออฟฟิศ', 'ค่าไฟฟ้าโกดังเก็บอุปกรณ์ถ่ายทำ']
const BOX_TITLES = ['ค่าน้ำดื่มสำนักงาน', 'ค่าแท็กซี่ส่งเอกสาร', 'ค่าถ่ายเอกสารและเข้าเล่ม', 'ค่าไปรษณีย์ลงทะเบียน', 'ค่าอุปกรณ์ทำความสะอาด', 'ค่าขนมรับรองลูกค้า']
const DESC_PARTS = ['รายละเอียดตามใบเสร็จที่แนบมาพร้อมใบเบิกนี้', 'จ่ายเงินสดหน้างานเนื่องจากร้านไม่รับโอนเงิน', 'ใช้สำหรับงานของลูกค้าตามที่ตกลงไว้ในใบเสนอราคา', 'หัวหน้าทีมอนุมัติด้วยวาจาก่อนสั่งซื้อแล้ว', 'รวมค่าขนส่งและค่าบริการของร้านไว้แล้วทั้งหมด', 'ซื้อเพิ่มเพราะของเดิมเสียหายระหว่างขนย้าย']
const NOTES = ['แนบใบเสร็จตัวจริงส่งฝ่ายบัญชีแล้ว', 'รอใบกำกับภาษีตัวจริงจากร้านค้า', 'โอนเข้าบัญชีส่วนตัวของผู้เบิกได้เลย', 'เบิกแทนเพื่อนร่วมทีมที่ลาพักร้อน']
const STAFF_ROLES = [
  { role: 'photographer', label: 'ช่างภาพ' }, { role: 'videographer', label: 'ช่างวิดีโอ' }, { role: 'assistant', label: 'ผู้ช่วยช่างภาพ' },
  { role: 'mc', label: 'พิธีกร' }, { role: 'crew', label: 'ทีมงานติดตั้ง' },
]
const CATEGORIES: Row[] = [
  ['travel', 'Travel', 'ค่าเดินทาง', 'Car', '#f97316', 'vehicle'], ['staff', 'Staff', 'ค่าสตาฟ', 'Users', '#ef4444', 'staff'],
  ['equipment', 'Equipment', 'อุปกรณ์ออกอีเวนต์', 'Package', '#eab308', 'none'], ['food', 'Food & Beverage', 'อาหารและเครื่องดื่ม', 'UtensilsCrossed', '#22c55e', 'none'],
  ['venue', 'Venue', 'ค่าสถานที่', 'Building2', '#3b82f6', 'none'], ['marketing', 'Marketing', 'การตลาด / โฆษณา', 'Megaphone', '#8b5cf6', 'none'],
  ['printing', 'Printing', 'งานพิมพ์', 'Printer', '#0ea5e9', 'none'], ['accommodation', 'Accommodation', 'ที่พัก', 'Hotel', '#14b8a6', 'none'],
  ['fuel', 'Fuel', 'ค่าน้ำมัน', 'Fuel', '#f59e0b', 'vehicle'], ['other', 'Other', 'อื่นๆ', 'MoreHorizontal', '#6b7280', 'none'],
].map(([value, label, label_th, icon, color, detail_source], i) => ({
  id: uid(201 + i), value, label, label_th, icon, color, sort_order: i + 1, is_active: i !== 5, detail_source, created_at: pgTs(RealDate.UTC(2026, 0, 1)),
}))
const EVENT_CATEGORIES = [['travel', 3], ['staff', 2], ['equipment', 2], ['food', 2], ['venue', 1], ['printing', 1], ['accommodation', 1], ['fuel', 2]] as const
const OTHER_CATEGORIES = [['other', 4], ['marketing', 1], ['printing', 1], ['travel', 2], ['food', 1], ['accommodation', 1]] as const

const COLUMNS: Record<string, string[]> = {
  profiles: Object.keys(person(ADMIN, 0, 'admin')),
  finance_categories: Object.keys(CATEGORIES[0]),
  expense_claims: [
    'id', 'claim_number', 'original_claim_number', 'claim_type', 'job_event_id', 'title', 'description', 'category',
    'amount', 'unit_price', 'unit', 'quantity', 'total_amount', 'vat_mode', 'include_vat', 'withholding_tax_rate',
    'receipt_urls', 'tax_invoice_urls', 'tax_invoice_numbers', 'funding_source', 'actual_spent_amount',
    'actual_spent_items', 'refund_amount', 'actual_receipt_urls', 'refund_slip_urls', 'advance_settled_at',
    'advance_settled_by', 'refund_confirmed_at', 'refund_confirmed_by', 'pettycash_fund_id', 'pettycash_opening_balance',
    'pettycash_opening_from', 'pettycash_previous_claim_id', 'pettycash_period_start', 'pettycash_period_end',
    'pettycash_closed_at', 'pettycash_closed_by', 'status', 'submitted_by', 'approved_by', 'approved_at', 'reject_reason',
    'expense_date', 'notes', 'staff_roles', 'bank_name', 'bank_account_number', 'account_holder_name', 'paid_at', 'paid_by',
    'submitted_at', 'cancelled_at', 'cancelled_by', 'created_at', 'filed_at', 'filed_by', 'filed_file_count',
    'deleted_at', 'deleted_by', 'status_changed_at',
  ],
  expense_claim_logs: ['id', 'claim_id', 'action', 'changed_by', 'changes', 'note', 'created_at'],
  job_cost_events: ['id', 'event_name', 'event_date', 'event_location', 'status', 'source_event_id', 'linked_lead_id', 'created_at'],
  job_cost_items: [
    'id', 'job_event_id', 'title', 'category', 'description', 'amount', 'unit_price', 'unit', 'quantity', 'include_vat',
    'vat_mode', 'withholding_tax_rate', 'cost_date', 'recorded_by', 'notes', 'created_at',
  ],
  event_closures: ['id', 'event_name', 'event_date', 'event_location', 'created_at'],
  events: ['id', 'name', 'event_date', 'event_time', 'event_end_time', 'location', 'status', 'created_at'],
  purchase_items: ['id', 'list_id', 'title', 'quantity', 'status', 'actual_price', 'sort_order', 'created_at', 'expense_claim_id'],
  purchase_lists: ['id', 'title', 'crm_lead_id', 'created_at'],
  crm_leads: ['id', 'customer_name', 'event_location', 'event_date', 'event_end_date', 'status', 'created_at'],
}

/** ใบเบิกหนึ่งแถว (ทุกคอลัมน์ — ค่าที่ไม่ระบุ = null) */
function claimRow(over: Row): Row {
  return { ...Object.fromEntries(COLUMNS.expense_claims.map(c => [c, null])), ...over }
}

type Dataset = Record<string, Row[]>
type DatasetInfo = { normalClaim: string; fund: string; staffTop: string; paidMonth: string; topEvent: string }

function buildDataset(): { tables: Dataset; info: DatasetInfo } {
  const profiles = [person(ADMIN, 0, 'admin'), person(ADMIN_B, 1, 'admin'), ...SUBMITTERS.map((id, i) => person(id, i + 2, 'staff'))]
  const profileById = new Map(profiles.map(p => [p.id as string, p]))

  const jobEvents: Row[] = Array.from({ length: 300 }, (_, i) => {
    const date = RealDate.UTC(2026, 1, 15) + Math.floor((i / 300) * 240) * DAY
    return {
      id: uid(5000 + i), event_name: `${pick(EVENT_KINDS)} ${pick(CLIENTS)} ครั้งที่ ${i + 1}`, event_date: isoDay(date),
      event_location: pick(CLIENTS), status: date < FIXED_NOW - 7 * DAY ? 'completed' : 'draft',
      source_event_id: chance(0.4) ? uid(7000 + i) : null, linked_lead_id: chance(0.5) ? uid(8000 + i) : null,
      created_at: pgTs(date - 20 * DAY, i),
    }
  })
  const closures: Row[] = Array.from({ length: 60 }, (_, i) => ({
    id: uid(6000 + i), event_name: `${pick(EVENT_KINDS)} (ปิดงานแล้ว) ${i + 1}`, event_date: isoDay(RealDate.UTC(2025, 9, 1) + i * 3 * DAY),
    event_location: pick(CLIENTS), created_at: pgTs(RealDate.UTC(2025, 9, 1) + i * 3 * DAY),
  }))
  const stockEvents: Row[] = Array.from({ length: 90 }, (_, i) => ({
    id: uid(7000 + i * 3), name: `${pick(EVENT_KINDS)} ${pick(CLIENTS)} (ปฏิทิน) ${i + 1}`, event_date: isoDay(RealDate.UTC(2026, 3, 1) + i * 2 * DAY),
    location: pick(CLIENTS), status: pick(['upcoming', 'confirmed', 'done']), created_at: pgTs(RealDate.UTC(2026, 2, 1) + i * DAY),
  }))

  const MONTHS: [string, number][] = [['2026-03', 248], ['2026-04', 266], ['2026-05', 283], ['2026-06', 301], ['2026-07', 319], ['2026-08', 353], ['2026-09', 230]]
  const usedCreated = new Set<number>()
  let micro = 0
  const createdAt = (ms: number) => {
    let t = Math.min(ms, FIXED_NOW - HOUR)
    while (usedCreated.has(t)) t += 1
    usedCreated.add(t)
    return pgTs(t, ++micro)
  }
  const claims: Row[] = []
  let idSeq = 0
  const nextId = () => uid(10_000 + ++idSeq)
  const receiptUrl = (folder: string, i: number, ms: number) =>
    `https://${PROJECT}.supabase.co/storage/v1/object/public/receipts/claims/${folder}/${ms}_${i}.${weighted([['jpg', 85], ['png', 8], ['pdf', 7]] as const)}`
  /** รอบจ่ายรวบถัดไปหลังเวลา after: คืนวันสุดท้ายของเดือน 22:00–02:00 (เวลาไทย) หรือวันที่ 1–3 ของเดือนถัดไป 09:00–17:00 */
  const batchTime = (after: number): number => {
    const d = new RealDate(after + THAI)
    let yy = d.getUTCFullYear(), mm = d.getUTCMonth() + 1
    for (;;) {
      const lastDay = new RealDate(RealDate.UTC(yy, mm, 0)).getUTCDate()
      const t = chance(0.4)
        ? RealDate.UTC(yy, mm - 1, lastDay, 22) - THAI + between(0, 240) * 60_000
        : RealDate.UTC(yy, mm, between(1, 3), 9) - THAI + between(0, 480) * 60_000
      if (t > after) return t
      if (++mm > 12) { mm = 1; yy++ }
    }
  }

  let prevFund: string | null = null
  for (const [month, quota] of MONTHS) {
    const [y, m] = month.split('-').map(Number)
    const monthStart = RealDate.UTC(y, m - 1, 1)
    const days = new RealDate(RealDate.UTC(y, m, 0)).getUTCDate()
    const isCurrent = month === '2026-09'
    const monthRows: Row[] = []

    // วงเงินสดย่อยของเดือน (ใบแม่) + รายการในกล่อง 10 + เติมเงิน 1
    const fundId = nextId()
    const fundCreated = monthStart + 2 * HOUR
    const fundClosed = !isCurrent
    const fundConfirmed = fundClosed && month !== '2026-08'
    const fundAmount = 10_000
    monthRows.push(claimRow({
      id: fundId, claim_type: 'petty_cash', title: `วงเงินสดย่อยประจำเดือน ${month}`, category: 'other', amount: fundAmount, unit_price: fundAmount,
      unit: 'บาท', quantity: 1, total_amount: fundAmount, vat_mode: 'none', include_vat: false, withholding_tax_rate: 0, receipt_urls: [],
      funding_source: 'company', status: fundConfirmed ? 'refund_confirmed' : 'paid', submitted_by: SUBMITTERS[1],
      approved_by: ADMIN, approved_at: pgTs(fundCreated + HOUR), paid_by: ADMIN, paid_at: pgTs(fundCreated + 2 * HOUR),
      submitted_at: pgTs(fundCreated + 10 * 60_000), expense_date: isoDay(monthStart), created_at: createdAt(fundCreated),
      pettycash_opening_balance: 0, pettycash_previous_claim_id: prevFund, pettycash_period_start: isoDay(monthStart),
      pettycash_period_end: `${month}-${String(days).padStart(2, '0')}`,
      pettycash_closed_at: fundClosed ? pgTs(RealDate.UTC(y, m - 1, days, 10)) : null, pettycash_closed_by: fundClosed ? ADMIN : null,
      refund_amount: fundClosed ? money2(between(300, 2500)) : null,
      refund_slip_urls: fundClosed ? [receiptUrl(`EXP-${y}${String(m).padStart(2, '0')}-FUND-refund`, 0, RealDate.UTC(y, m - 1, days, 9))] : null,
      refund_confirmed_at: fundConfirmed ? pgTs(RealDate.UTC(y, m, 2, 3)) : null, refund_confirmed_by: fundConfirmed ? ADMIN : null,
      status_changed_at: pgTs(fundConfirmed ? RealDate.UTC(y, m, 2, 3) : fundCreated + 2 * HOUR),
    }))
    prevFund = fundId
    for (let k = 0; k < 11; k++) {
      const isTopup = k === 10
      const day = Math.min(days, 2 + k * 2 + between(0, 1))
      const exp = RealDate.UTC(y, m - 1, day) + between(2, 10) * HOUR
      if (exp > FIXED_NOW - 2 * HOUR) continue
      const amount = isTopup ? 3000 : money2(between(40, 1500) + (chance(0.3) ? between(0, 99) / 100 : 0))
      const cancelled = !isTopup && chance(0.05)
      monthRows.push(claimRow({
        id: nextId(), claim_type: isTopup ? 'petty_cash' : 'other', pettycash_fund_id: fundId,
        title: isTopup ? `เติมเงินสดย่อย ${month}` : pick(BOX_TITLES), category: isTopup ? 'other' : pick(['other', 'food', 'travel']),
        amount, unit_price: amount, unit: 'บาท', quantity: 1, total_amount: amount, vat_mode: 'none', include_vat: false, withholding_tax_rate: 0,
        receipt_urls: isTopup ? [] : [receiptUrl(`BOX-${month}`, k, exp)], funding_source: 'company',
        status: cancelled ? 'cancelled' : 'paid', submitted_by: SUBMITTERS[1], submitted_at: pgTs(exp + 5 * 60_000),
        approved_by: isTopup ? ADMIN : null, approved_at: isTopup ? pgTs(exp + HOUR) : null,
        paid_at: cancelled ? null : pgTs(exp + (isTopup ? 2 * HOUR : 5 * 60_000)), paid_by: cancelled ? null : ADMIN,
        cancelled_at: cancelled ? pgTs(exp + DAY) : null, cancelled_by: cancelled ? SUBMITTERS[1] : null,
        expense_date: isoDay(exp), created_at: createdAt(exp), status_changed_at: pgTs(exp + 2 * HOUR),
      }))
    }

    // ใบเบิกทั่วไปของเดือน
    const regular = quota - 12
    for (let k = 0; k < regular; k++) {
      const type = weighted([['event', 0.637], ['advance', 0.0626], ['other', 0.3004]] as const)
      const day = between(1, days)
      const expMs = RealDate.UTC(y, m - 1, day)
      const created = Math.min(expMs + between(1, 12) * HOUR + between(0, 2) * DAY, FIXED_NOW - 2 * HOUR)
      // ผลสุดท้ายของใบ — ใบที่ยังไม่ถึงวันจ่าย (paid_at หลังเวลาตรึง) กลายเป็นสถานะที่ยังไม่จบ
      const outcome = weighted([['PAIDLIKE', 0.875], ['cancelled', 0.05], ['rejected', 0.03], ['draft', 0.02], ['stuck', 0.02]] as const)
      const submitter = weighted(SUBMITTER_WEIGHTS)
      const profile = profileById.get(submitter) as Row
      const id = nextId()
      let amount = type === 'advance'
        ? between(20, 200) * 100
        : Math.exp(Math.log(80) + rand() * (Math.log(45_000) - Math.log(80)))
      amount = chance(0.7) || type === 'advance' ? Math.round(amount) : money2(amount)
      const quantity = chance(0.8) ? 1 : between(2, 10)
      const unitPrice = money2(amount / quantity)
      amount = money2(unitPrice * quantity)
      const vat = type === 'advance' ? 'none' : weighted([['none', 80], ['included', 12], ['excluded', 8]] as const)
      const whtRoll = rand()
      const wht = type === 'advance' ? 0 : whtRoll < 0.235 ? weighted([[3, 85], [1, 8], [5, 4], [1.5, 3]] as const) : whtRoll < 0.285 ? null : 0
      const category = type === 'event' ? weighted(EVENT_CATEGORIES) : weighted(OTHER_CATEGORIES)
      // งานที่จัดใกล้วันที่ใช้จ่าย (งานเรียงตามวันที่ในช่วง 240 วัน)
      const eventRow = type === 'event'
        ? jobEvents[Math.min(299, Math.max(0, Math.floor(((expMs - RealDate.UTC(2026, 1, 15)) / (240 * DAY)) * 300) + between(-6, 6)))]
        : null
      const title = type === 'event'
        ? `${pick(EVENT_ITEMS)} งาน${String(eventRow?.event_location ?? '')}`
        : type === 'advance' ? `เบิกทดลองจ่าย${pick(['ค่าเดินทางออกงาน', 'ซื้ออุปกรณ์หน้างาน', 'ค่าใช้จ่ายทีมงานต่างจังหวัด'])} ${pick(CLIENTS)}`
        : pick(OTHER_TITLES)
      const approvedAt = created + between(4, 60) * HOUR
      let finalStatus: string = outcome
      let paidAt: number | null = null
      if (outcome === 'PAIDLIKE') {
        // 65% จ่ายภายใน 1–12 วันหลังอนุมัติ · 35% จ่ายรวบรอบสิ้นเดือน (คืนวันสุดท้าย 22:00–02:00 เวลาไทย ข้ามเที่ยงคืน หรือวันที่ 1–3 ของเดือนถัดไป)
        paidAt = chance(0.65) ? approvedAt + between(20, 12 * 24) * HOUR : batchTime(approvedAt)
        if (paidAt > FIXED_NOW - HOUR) {
          paidAt = null
          finalStatus = approvedAt > FIXED_NOW - HOUR
            ? weighted([['pending', 3], ['draft', 1]] as const)
            : weighted([['approved', 5], ['pending_month_end', 3], ['waiting_tax_invoice', 1.5], ['awaiting_payment', 0.3]] as const)
        }
      } else if (outcome === 'stuck') {
        finalStatus = weighted([['pending', 1], ['approved', 1], ['pending_month_end', 1]] as const)
      }
      const paidLike = paidAt !== null
      const row = claimRow({
        id, claim_type: type, job_event_id: eventRow?.id ?? null, title, category,
        description: chance(0.56) ? `${pick(DESC_PARTS)} ${pick(DESC_PARTS)} ${pick(DESC_PARTS)}` : null,
        amount, unit_price: unitPrice, unit: pick(['บาท', 'รายการ', 'ครั้ง']), quantity, total_amount: amount,
        vat_mode: vat, include_vat: vat !== 'none', withholding_tax_rate: wht,
        receipt_urls: [] as string[], funding_source: chance(0.15) ? 'personal' : 'company',
        submitted_by: submitter, expense_date: isoDay(expMs), created_at: createdAt(created),
        notes: chance(0.15) ? pick(NOTES) : null,
        staff_roles: category === 'staff' ? Array.from({ length: between(1, 3) }, () => pick(STAFF_ROLES)) : null,
        bank_name: chance(0.71) ? (profile.bank_name ?? pick(BANKS)) : null,
      })
      if (row.bank_name) {
        row.bank_account_number = chance(0.06) ? bankNo() : (profile.bank_account_number ?? bankNo())
        row.account_holder_name = profile.full_name
      }
      if (finalStatus !== 'draft') row.submitted_at = pgTs(created + between(5, 90) * 60_000)
      if (paidLike) {
        finalStatus = 'paid'
        row.approved_by = pick([ADMIN, ADMIN_B]); row.approved_at = pgTs(approvedAt)
        row.paid_by = ADMIN; row.paid_at = pgTs(paidAt as number)
      } else if (['approved', 'pending_month_end', 'waiting_tax_invoice', 'awaiting_payment', 'rejected'].includes(finalStatus)) {
        row.approved_by = pick([ADMIN, ADMIN_B]); row.approved_at = pgTs(Math.min(approvedAt, FIXED_NOW - HOUR))
      }
      if (finalStatus === 'rejected') row.reject_reason = pick(['ใบเสร็จไม่ชัด กรุณาแนบใหม่', 'ยอดไม่ตรงกับใบเสร็จ', 'เบิกซ้ำกับใบก่อนหน้า'])
      if (finalStatus === 'draft' && chance(0.3)) row.reject_reason = 'ส่งกลับให้แก้: แนบใบเสร็จตัวจริงเพิ่ม'
      if (finalStatus === 'cancelled') { row.cancelled_at = pgTs(created + DAY); row.cancelled_by = submitter }

      // ไฟล์แนบ
      const folder = `EXP-${y}${String(m).padStart(2, '0')}-${String(k + 1).padStart(3, '0')}`
      if (type !== 'advance' && !(finalStatus === 'draft' && chance(0.3))) {
        const n = weighted([[1, 50], [2, 35], [3, 15]] as const)
        row.receipt_urls = Array.from({ length: n }, (_, i) => receiptUrl(folder, i, created))
      }
      if (type !== 'advance' && ['approved', 'paid', 'pending_month_end', 'awaiting_payment'].includes(finalStatus) && chance(0.12)) {
        const n = weighted([[1, 75], [2, 25]] as const)
        const urls: string[] = [], nums: string[] = []
        for (let i = 0; i < n; i++) {
          const numberOnly = chance(0.25)
          urls.push(numberOnly ? '' : receiptUrl(`${folder}-tax-invoice`, i, approvedAt))
          nums.push(!numberOnly && chance(0.1) ? '' : `IV${y + 543}/${String(between(1, 9999)).padStart(5, '0')}`)
        }
        row.tax_invoice_urls = urls
        row.tax_invoice_numbers = nums
      }
      if (type === 'advance' && paidLike) {
        const settled = (paidAt as number) < FIXED_NOW - 5 * DAY && chance(0.92)
        if (settled) {
          const refund = chance(0.6) ? money2(between(100, Math.max(200, Number(amount) / 2))) : 0
          const spent = money2(Number(amount) - refund)
          row.actual_spent_amount = spent
          row.actual_spent_items = Array.from({ length: between(2, 4) }, (_, i) => ({ description: `${pick(EVENT_ITEMS)} (${i + 1})`, amount: money2(spent / 2) }))
          row.actual_receipt_urls = Array.from({ length: between(1, 3) }, (_, i) => receiptUrl(`${folder}-actual`, i, (paidAt as number) + 3 * DAY))
          row.advance_settled_at = pgTs((paidAt as number) + 3 * DAY); row.advance_settled_by = submitter
          row.refund_amount = refund
          if (refund > 0) {
            row.refund_slip_urls = [receiptUrl(`${folder}-refund`, 0, (paidAt as number) + 3 * DAY)]
            if (chance(0.85)) {
              finalStatus = 'refund_confirmed'
              row.refund_confirmed_at = pgTs((paidAt as number) + 5 * DAY); row.refund_confirmed_by = ADMIN
            }
          }
        }
      }
      row.status = finalStatus
      // เข้าแฟ้มแล้ว: ใบที่จ่ายเกิน 20 วัน ราว 45% · 15% ของใบที่เข้าแฟ้มมีไฟล์เปลี่ยนหลังเข้าแฟ้ม
      if (paidLike && (paidAt as number) < FIXED_NOW - 20 * DAY && chance(0.45)) {
        const files = [row.receipt_urls, row.actual_receipt_urls, row.tax_invoice_urls, row.refund_slip_urls]
          .reduce((s: number, v) => s + (Array.isArray(v) ? v.filter(u => typeof u === 'string' && u.trim() !== '').length : 0), 0)
        row.filed_at = pgTs((paidAt as number) + 5 * DAY); row.filed_by = ADMIN
        row.filed_file_count = chance(0.15) ? files + pick([-1, 1]) : files
      }
      row.status_changed_at = row.refund_confirmed_at ?? row.paid_at ?? row.approved_at ?? row.cancelled_at ?? row.submitted_at ?? row.created_at
      monthRows.push(row)
    }
    // เลขที่ใบเบิกตามลำดับเวลาที่สร้างในเดือนไทยของ created_at
    claims.push(...monthRows)
  }
  claims.sort((a, b) => (String(a.created_at) < String(b.created_at) ? -1 : 1))
  const seqByMonth = new Map<string, number>()
  for (const c of claims) {
    const ym = thaiDayOf(RealDate.parse(String(c.created_at))).slice(0, 7).replace('-', '')
    const n = (seqByMonth.get(ym) ?? 0) + 1
    seqByMonth.set(ym, n)
    c.claim_number = `EXP-${ym}-${String(n).padStart(3, '0')}`
  }
  // ใบที่ซ่อน 18 ใบ (ไม่ใช่เงินสดย่อย)
  const hideable = claims.filter(c => c.claim_type !== 'petty_cash' && !c.pettycash_fund_id)
  for (let i = 0; i < 18; i++) {
    const c = hideable[Math.floor(rand() * hideable.length)]
    if (c.deleted_at) continue
    c.deleted_at = pgTs(RealDate.parse(String(c.created_at)) + 2 * DAY); c.deleted_by = ADMIN
  }

  // ใบที่หน้า /finance/[id] เปิด: ใบงานที่จ่ายแล้วของผู้เบิกอันดับหนึ่ง (ใบเสร็จ 3 ไฟล์) และวงเงินสดย่อยของเดือนนี้
  const normal = claims.find(c => c.submitted_by === STAFF_TOP && c.claim_type === 'event' && c.status === 'paid' && !c.deleted_at && String(c.expense_date) >= '2026-08-01')
  assert.ok(normal, 'ต้องมีใบงานที่จ่ายแล้วของผู้เบิกอันดับหนึ่ง')
  normal.receipt_urls = [0, 1, 2].map(i => `https://${PROJECT}.supabase.co/storage/v1/object/public/receipts/claims/${String(normal.claim_number)}/1756000000000_${i}.jpg`)
  const fund = claims.find(c => c.claim_type === 'petty_cash' && !c.pettycash_fund_id && c.pettycash_closed_at === null)
  assert.ok(fund, 'ต้องมีวงเงินสดย่อยที่เปิดอยู่')
  const logs: Row[] = []
  const log = (claimId: string, action: string, by: string, at: number, changes: Row, note: string) =>
    logs.push({ id: uid(300_000 + logs.length), claim_id: claimId, action, changed_by: by, changes, note, created_at: pgTs(at) })
  const nAt = RealDate.parse(String(normal.created_at))
  log(String(normal.id), 'create', STAFF_TOP, nAt, { status: { from: null, to: 'draft' } }, 'สร้างใบเบิก')
  log(String(normal.id), 'submit', STAFF_TOP, nAt + HOUR, { status: { from: 'draft', to: 'pending' } }, 'ยื่นใบเบิกเพื่อขออนุมัติ')
  log(String(normal.id), 'edit', ADMIN, nAt + 2 * HOUR, { amount: { from: Number(normal.amount) + 100, to: normal.amount } }, 'แก้ยอดตามใบเสร็จ')
  log(String(normal.id), 'upload_receipt', STAFF_TOP, nAt + 3 * HOUR, { receipt_urls: { from: 2, to: 3 } }, 'แนบใบเสร็จเพิ่ม 1 ไฟล์')
  log(String(normal.id), 'approve', ADMIN, nAt + 20 * HOUR, { status: { from: 'pending', to: 'approved' } }, 'อนุมัติใบเบิก')
  log(String(normal.id), 'pay', ADMIN, nAt + 40 * HOUR, { status: { from: 'approved', to: 'paid' } }, 'ชำระเงินแล้ว')
  const fAt = RealDate.parse(String(fund.created_at))
  log(String(fund.id), 'create', SUBMITTERS[1], fAt, { status: { from: null, to: 'pending' } }, 'เปิดวงเงินสดย่อย')
  log(String(fund.id), 'approve', ADMIN, fAt + HOUR, { status: { from: 'pending', to: 'approved' } }, 'อนุมัติใบเบิก')
  log(String(fund.id), 'pay', ADMIN, fAt + 2 * HOUR, { status: { from: 'approved', to: 'paid' } }, 'ชำระเงินแล้ว')
  log(String(fund.id), 'add_expense', SUBMITTERS[1], fAt + 3 * DAY, { amount: { from: 0, to: 250 } }, 'บันทึกรายการในกล่อง')

  // งานที่มีใบจ่ายแล้วมากที่สุด (ตัวกรองงานของคลังเก็บ)
  const eventCounts = new Map<string, number>()
  for (const c of claims) if (c.job_event_id && ['paid', 'refund_confirmed'].includes(String(c.status)) && !c.deleted_at) eventCounts.set(String(c.job_event_id), (eventCounts.get(String(c.job_event_id)) ?? 0) + 1)
  const topEvent = [...eventCounts].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0]

  return {
    tables: {
      profiles, finance_categories: CATEGORIES, expense_claims: claims, expense_claim_logs: logs, job_cost_events: jobEvents,
      job_cost_items: [], event_closures: closures, events: stockEvents, purchase_items: [], purchase_lists: [], crm_leads: [],
    },
    info: { normalClaim: String(normal.id), fund: String(fund.id), staffTop: STAFF_TOP, paidMonth: '', topEvent },
  }
}

const { tables: BASE, info: INFO } = buildDataset()
const BASE_JSON = JSON.stringify(BASE)
const db: Dataset = {}
function resetDb() {
  const fresh = JSON.parse(BASE_JSON) as Dataset
  for (const k of Object.keys(db)) delete db[k]
  Object.assign(db, fresh)
  storage.clear()
}

// ══ ตัวจำลอง PostgREST + สตอเรจ ══════════════════════════════════════════════════════
/** db-max-rows ของ Supabase */
const MAX_ROWS = 1000
/** คอลัมน์ที่ "ยังไม่มี" ในฐานข้อมูลนี้ ('table.col') — อ่าน/กรอง = 42703 · เขียน = PGRST204 */
const dropped = new Set<string>()
const storage = new Map<string, number>()
/** error ที่ตัวจำลองเจอเอง (โค้ดจริงอาจกลืน error ไว้ใน try/catch) — ต้องว่างทุกกรณี */
const fakeErrors: string[] = []

type QueryLog = { table: string; action: string; cols: string; filters: string[]; count?: boolean; rows: number; round: number }
const meter = {
  rounds: 0, uploadRounds: 0, uploadCalls: 0, maxInFlightWrites: 0,
  rpc: [] as string[], log: [] as QueryLog[],
  uploads: [] as { bucket: string; path: string; size: number; options: unknown }[],
  removes: [] as string[][], writes: [] as string[],
}
function resetMeter() {
  meter.rounds = 0; meter.uploadRounds = 0; meter.uploadCalls = 0; meter.maxInFlightWrites = 0
  meter.rpc = []; meter.log = []; meter.uploads = []; meter.removes = []; meter.writes = []
}

// ── รอบของฐานข้อมูล: คำขอที่ค้างอยู่ทั้งหมดตอบพร้อมกันเป็นชุด (setImmediate) ────────────────────
type Pending = { run: () => unknown; resolve: (v: unknown) => void; reject: (e: unknown) => void; write: boolean; upload: boolean }
let wave: Pending[] = []
function schedule<T>(kind: { write?: boolean; upload?: boolean; label: string }, run: () => T): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (wave.length === 0) {
      meter.rounds++
      setImmediate(flush)
    }
    if (kind.upload && !wave.some(p => p.upload)) meter.uploadRounds++
    wave.push({ run, resolve: resolve as (v: unknown) => void, reject, write: !!kind.write, upload: !!kind.upload })
    if (kind.write) meter.writes.push(kind.label)
    meter.maxInFlightWrites = Math.max(meter.maxInFlightWrites, wave.filter(p => p.write).length)
  })
}
function flush() {
  const batch = wave
  wave = []
  for (const p of batch) {
    try {
      p.resolve(p.run())
    } catch (e) {
      fakeErrors.push((e as Error).message)
      p.reject(e)
    }
  }
}
/** รอจนไม่มีคำขอค้าง */
async function settle() {
  for (let i = 0; i < 50 && wave.length > 0; i++) await new Promise(r => setImmediate(r))
  assert.equal(wave.length, 0, 'ยังมีคำขอค้างหลังหน้าโหลดเสร็จ')
}

function strict<T extends object>(target: T): T {
  return new Proxy(target, {
    get(t, prop, receiver) {
      if (typeof prop === 'symbol' || prop in t) return Reflect.get(t, prop, receiver)
      throw new Error(`ตัวจำลองไม่รองรับ .${prop}() — เพิ่มให้เหมือน PostgREST ก่อนใช้`)
    },
  })
}

function splitTop(cols: string): string[] {
  const out: string[] = []
  let depth = 0, cur = ''
  for (const ch of cols) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = '' } else cur += ch
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}
const EMBED = /^(?:(\w+):)?(\w+)!(\w+)\(([\s\S]*)\)$/
/** คอลัมน์ชั้นนอกของ select (ไม่รวม embed) */
const plainCols = (cols: string) => splitTop(cols).filter(p => p !== '*' && !EMBED.test(p))

class MissingColumn extends Error {
  constructor(readonly table: string, readonly col: string) { super(`column ${table}.${col} does not exist`) }
}
function project(table: string, row: Row, cols: string): Row {
  const out: Row = {}
  for (const part of splitTop(cols)) {
    if (part === '*') {
      for (const [k, v] of Object.entries(row)) if (!dropped.has(`${table}.${k}`)) out[k] = clone(v)
      continue
    }
    const embed = EMBED.exec(part)
    if (embed) {
      const [, alias, other, fk, inner] = embed
      const col = new RegExp(`^${table}_(\\w+)_fkey$`).exec(fk)?.[1]
      assert.ok(col && COLUMNS[table].includes(col), `fk ไม่รู้จัก: ${fk}`)
      assert.ok(COLUMNS[other], `ตารางของ embed ไม่มี: ${other}`)
      const hit = row[col] == null ? undefined : (db[other] ?? []).find(r => r.id === row[col])
      out[alias ?? other] = hit ? project(other, hit, inner) : null
      continue
    }
    assert.ok(COLUMNS[table].includes(part), `select คอลัมน์ที่ไม่มีในตัวจำลอง: ${table}.${part}`)
    if (dropped.has(`${table}.${part}`)) throw new MissingColumn(table, part)
    out[part] = clone(row[part] ?? null)
  }
  return out
}

const TS_RE = /^\d{4}-\d{2}-\d{2}T/
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
/** เวลา (ms) ของ timestamptz หรือวันที่ล้วน (00:00 UTC — TimeZone ของ Supabase) · อื่นๆ = null */
const instant = (v: unknown) => (typeof v === 'string' && (TS_RE.test(v) || DATE_RE.test(v)) ? RealDate.parse(DATE_RE.test(v) ? `${v}T00:00:00Z` : v) : null)
/** เทียบค่าแบบ Postgres ตามชนิด: ตัวเลข · วันที่ล้วนกับวันที่ล้วน (ข้อความ) · เวลา · ข้อความ */
function cmp(x: unknown, y: unknown): number {
  if (typeof x === 'number' || typeof y === 'number') return Number(x) - Number(y)
  if (typeof x === 'boolean' || typeof y === 'boolean') return Number(x === true || x === 'true') - Number(y === true || y === 'true')
  const a = String(x), b = String(y)
  if (!(DATE_RE.test(a) && DATE_RE.test(b))) {
    const ia = instant(a), ib = instant(b)
    if (ia !== null && ib !== null) return ia - ib
  }
  return a < b ? -1 : a > b ? 1 : 0
}
const eqVal = (x: unknown, y: unknown) => x != null && y != null && cmp(x, y) === 0
/** รูปแบบ LIKE: % _ ตามปกติ · * = % (แบบ PostgREST) · \ ทำให้ตัวถัดไปเป็นตัวอักษรธรรมดา */
function likeRegex(pattern: string, flags: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '\\' && i + 1 < pattern.length) re += pattern[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (ch === '%' || ch === '*') re += '[\\s\\S]*'
    else if (ch === '_') re += '[\\s\\S]'
    else re += ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`^${re}$`, flags)
}

type Filter = { col: string; text: string; test: (r: Row) => boolean }
let insertSeq = 0

class Query implements PromiseLike<Result> {
  private action: 'select' | 'insert' | 'update' | 'delete' = 'select'
  private cols: string | null = null
  private countExact = false
  private head = false
  private payload: Row[] = []
  private values: Row = {}
  private filters: Filter[] = []
  private sorts: { col: string; asc: boolean; nullsFirst: boolean }[] = []
  private start = 0
  private end: number | null = null
  private max: number | null = null
  private one: 'single' | 'maybeSingle' | null = null
  constructor(private table: string) {
    assert.ok(COLUMNS[table], `ตัวจำลองไม่มีตาราง ${table}`)
  }

  select(cols = '*', options?: { count?: string; head?: boolean }) {
    if (options !== undefined) {
      for (const k of Object.keys(options)) assert.ok(k === 'count' || k === 'head', `select({ ${k} }) ไม่รองรับ`)
      if (options.count !== undefined) assert.equal(options.count, 'exact', 'รองรับเฉพาะ count: exact')
      this.countExact = options.count === 'exact'
      this.head = options.head === true
    }
    this.cols = cols
    return this
  }
  insert(rows: Row | Row[]) { this.action = 'insert'; this.payload = Array.isArray(rows) ? rows : [rows]; return this }
  update(values: Row) { this.action = 'update'; this.values = values; return this }
  delete() { this.action = 'delete'; return this }
  eq(c: string, v: unknown) { return this.where(c, `eq:${c}=${String(v)}`, r => eqVal(r[c], v)) }
  neq(c: string, v: unknown) { return this.where(c, `neq:${c}=${String(v)}`, r => r[c] != null && !eqVal(r[c], v)) }
  in(c: string, vs: readonly unknown[]) {
    assert.ok(Array.isArray(vs), 'in() ต้องได้ array')
    return this.where(c, `in:${c}=${vs.join('|')}`, r => vs.some(v => eqVal(r[c], v)))
  }
  is(c: string, v: null | boolean) {
    assert.ok(v === null || typeof v === 'boolean', 'is() รองรับ null / true / false')
    return this.where(c, `is:${c}=${String(v)}`, r => (v === null ? r[c] == null : r[c] === v))
  }
  not(c: string, op: string, v: unknown) {
    if (op === 'is') {
      assert.equal(v, null, 'not(col, "is", null) เท่านั้น')
      return this.where(c, `not.is:${c}=null`, r => r[c] != null)
    }
    if (op === 'in') {
      assert.match(String(v), /^\([^()]*\)$/, `not.in ต้องอยู่ในวงเล็บ: ${String(v)}`)
      const values = String(v).slice(1, -1).split(',')
      return this.where(c, `not.in:${c}=${values.join('|')}`, r => r[c] != null && !values.some(x => eqVal(r[c], x)))
    }
    assert.equal(op, 'eq', `ตัวจำลองไม่รองรับ not(col, "${op}")`)
    return this.where(c, `not.eq:${c}=${String(v)}`, r => r[c] != null && !eqVal(r[c], v))
  }
  gt(c: string, v: unknown) { return this.where(c, `gt:${c}=${String(v)}`, r => r[c] != null && cmp(r[c], v) > 0) }
  gte(c: string, v: unknown) { return this.where(c, `gte:${c}=${String(v)}`, r => r[c] != null && cmp(r[c], v) >= 0) }
  lt(c: string, v: unknown) { return this.where(c, `lt:${c}=${String(v)}`, r => r[c] != null && cmp(r[c], v) < 0) }
  lte(c: string, v: unknown) { return this.where(c, `lte:${c}=${String(v)}`, r => r[c] != null && cmp(r[c], v) <= 0) }
  like(c: string, pattern: string) {
    const re = likeRegex(pattern, 's')
    return this.where(c, `like:${c}=${pattern}`, r => typeof r[c] === 'string' && re.test(r[c] as string))
  }
  ilike(c: string, pattern: string) {
    const re = likeRegex(pattern, 'si')
    return this.where(c, `ilike:${c}=${pattern}`, r => typeof r[c] === 'string' && re.test(r[c] as string))
  }
  order(col: string, opts: { ascending?: boolean; nullsFirst?: boolean } = {}) {
    for (const k of Object.keys(opts)) assert.ok(k === 'ascending' || k === 'nullsFirst', `ตัวจำลองไม่รองรับ order({ ${k} })`)
    this.known(col)
    const asc = opts.ascending !== false
    this.sorts.push({ col, asc, nullsFirst: opts.nullsFirst ?? !asc })
    return this
  }
  range(from: number, to: number) {
    assert.ok(Number.isInteger(from) && Number.isInteger(to) && from >= 0 && to >= from, `range ไม่ถูกต้อง: ${from}-${to}`)
    this.start = from
    this.end = to
    return this
  }
  limit(n: number) { assert.ok(Number.isInteger(n) && n >= 0); this.max = n; return this }
  single() { this.one = 'single'; return this }
  maybeSingle() { this.one = 'maybeSingle'; return this }

  private known(col: string) {
    assert.ok(COLUMNS[this.table].includes(col), `ไม่มีคอลัมน์ ${this.table}.${col} ในตัวจำลอง`)
  }
  private where(col: string, text: string, test: (r: Row) => boolean) {
    this.known(col)
    this.filters.push({ col, text, test })
    return this
  }

  private sorted(rows: Row[]): Row[] {
    const tie = new Map(rows.map(r => [r, tieRand()]))
    return [...rows].sort((a, b) => {
      for (const s of this.sorts) {
        const x = a[s.col], y = b[s.col]
        if (x == null && y == null) continue
        if (x == null || y == null) return (x == null) === s.nullsFirst ? -1 : 1
        const d = cmp(x, y)
        if (d !== 0) return s.asc ? d : -d
      }
      return (tie.get(a) ?? 0) - (tie.get(b) ?? 0)
    })
  }

  private shape(list: Row[], total?: number): Result {
    const count = this.countExact ? (total ?? list.length) : null
    if (this.cols === null || this.head) return { data: null, error: null, count }
    const out = list.map(r => project(this.table, r, this.cols as string))
    if (!this.one) return { data: out, error: null, count }
    if (out.length === 1) return { data: out[0], error: null, count }
    if (out.length === 0 && this.one === 'maybeSingle') return { data: null, error: null, count }
    return { data: null, error: { code: 'PGRST116', message: `JSON object requested, multiple (or no) rows returned (${out.length})` }, count }
  }

  run(round: number): Result {
    const rows = db[this.table]
    const logEntry: QueryLog = { table: this.table, action: this.action, cols: (this.cols ?? '').replace(/\s+/g, ' ').trim(), filters: this.filters.map(f => f.text), rows: 0, round }
    if (this.countExact) logEntry.count = true
    meter.log.push(logEntry)
    // คอลัมน์ที่ยังไม่มี: อ้างใน select / กรอง / เรียง = 42703 (ไม่มีอะไรถูกเขียน)
    const refs = [...this.filters.map(f => f.col), ...this.sorts.map(s => s.col), ...(this.cols ? plainCols(this.cols) : [])]
    const missingRef = refs.find(c => dropped.has(`${this.table}.${c}`))
    if (missingRef) return { data: null, error: { code: '42703', message: `column ${this.table}.${missingRef} does not exist` } }

    if (this.action === 'insert') {
      for (const p of this.payload) {
        const bad = Object.keys(p).find(c => !COLUMNS[this.table].includes(c) || dropped.has(`${this.table}.${c}`))
        if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}' in the schema cache` } }
      }
      if (this.table === 'expense_claims') {
        const taken = this.payload.map(p => p.claim_number).find((n, i, all) => rows.some(r => r.claim_number === n) || all.indexOf(n) !== i)
        if (taken !== undefined) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "expense_claims_claim_number_key"', details: `Key (claim_number)=(${String(taken)}) already exists.` } }
        }
      }
      const inserted = this.payload.map(p => ({
        ...Object.fromEntries(COLUMNS[this.table].map(c => [c, null])),
        id: uid(900_000 + ++insertSeq),
        created_at: pgTs(FIXED_NOW, insertSeq),
        ...clone(p),
      }))
      rows.push(...inserted)
      logEntry.rows = inserted.length
      return this.shape(inserted)
    }

    const hits = rows.filter(r => this.filters.every(f => f.test(r)))
    if (this.action === 'update') {
      const bad = Object.keys(this.values).find(c => !COLUMNS[this.table].includes(c) || dropped.has(`${this.table}.${c}`))
      if (bad) return { data: null, error: { code: 'PGRST204', message: `Could not find the '${bad}' column of '${this.table}' in the schema cache` } }
      for (const r of hits) Object.assign(r, clone(this.values))
      logEntry.rows = hits.length
      return this.shape(hits)
    }
    if (this.action === 'delete') {
      for (const r of hits) rows.splice(rows.indexOf(r), 1)
      logEntry.rows = hits.length
      return this.shape(hits)
    }

    const ordered = this.sorted(hits)
    const limit = Math.min(this.end === null ? Number.POSITIVE_INFINITY : this.end - this.start + 1, this.max ?? Number.POSITIVE_INFINITY, MAX_ROWS)
    const page = ordered.slice(this.start, this.start + limit)
    logEntry.rows = this.head ? 0 : page.length
    try {
      return this.shape(page, hits.length)
    } catch (e) {
      if (e instanceof MissingColumn) return { data: null, error: { code: '42703', message: e.message } }
      throw e
    }
  }

  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    const write = this.action === 'insert' && this.table === 'expense_claim_logs'
    const round = meter.rounds + (wave.length === 0 ? 1 : 0)
    return schedule({ write, label: `${this.table}.${this.action}` }, () => this.run(round)).then(onfulfilled, onrejected)
  }
}

// ── rpc ──────────────────────────────────────────────────────────────────────
type RpcHandler = (args: unknown) => Result
const rpcHandlers: Record<string, RpcHandler> = {
  next_claim_number: () => {
    const prefix = `EXP-${thaiDayOf(FIXED_NOW).slice(0, 7).replace('-', '')}-`
    const max = Math.max(0, ...db.expense_claims.filter(r => String(r.claim_number).startsWith(prefix)).map(r => Number(/^EXP-\d{6}-(\d+)/.exec(String(r.claim_number))?.[1] ?? 0)))
    return { data: `${prefix}${String(max + 1).padStart(3, '0')}`, error: null }
  },
}

/**
 * finance_wht_cells() ของ supabase/migrations/20261001_finance_speed.sql เขียนแบบ SQL (ไม่ใช้โค้ดของแอป):
 * WHERE withholding_tax_rate > 0 AND deleted_at IS NULL · GROUP BY submitted_by, status, to_char(expense_date,'YYYY-MM')
 * · sum(amount::float8) / sum(finance_claim_money(...).wht_amount / net_payable) ตามลำดับแถวในตาราง (ไม่ใช่ลำดับของแอป)
 * · (array_agg(col ORDER BY created_at DESC, id) FILTER (WHERE coalesce(col,'') <> ''))[1] + created_at ของแถวนั้น
 * เปิดด้วย whtRpcInstalled (ปิด = ฟังก์ชันยังไม่มี → PGRST202 แบบฐานข้อมูลที่ยังไม่รัน SQL)
 */
let whtRpcInstalled = false
function sqlClaimMoney(amount: unknown, vatMode: unknown, rate: unknown) {
  const amt = amount == null ? 0 : Number(amount)
  const mode = vatMode == null ? '' : String(vatMode)
  const r = rate == null ? 0 : Number(rate)
  // (vat_amount ของ SQL ไม่ใช้ในยอดรวมหัก ณ ที่จ่าย)
  const base = mode === 'included' ? amt / 1.07 : amt
  const total = mode === 'excluded' ? amt + amt * 0.07 : amt
  return { wht: base * (r / 100), net: total - base * (r / 100) }
}
function sqlWhtCells(): Row[] {
  const groups = new Map<string, Row[]>()
  for (const c of db.expense_claims) {
    if (!(Number(c.withholding_tax_rate ?? 0) > 0) || c.deleted_at != null) continue
    const month = c.expense_date ? String(c.expense_date).slice(0, 7) : thaiDayOf(RealDate.parse(String(c.created_at))).slice(0, 7)
    const key = `${String(c.submitted_by)}|${String(c.status)}|${month}`
    groups.set(key, [...(groups.get(key) ?? []), c])
  }
  const newest = (rows: Row[]) => [...rows].sort((a, b) => cmp(b.created_at, a.created_at) || (String(a.id) < String(b.id) ? -1 : 1))
  return [...groups.values()].map(rows => {
    const first = rows[0]
    const pickField = (col: string) => newest(rows).find(r => String(r[col] ?? '') !== '')
    const out: Row = {
      submitted_by: first.submitted_by ?? null, status: first.status,
      month: first.expense_date ? String(first.expense_date).slice(0, 7) : thaiDayOf(RealDate.parse(String(first.created_at))).slice(0, 7),
      n: rows.length,
      gross: rows.reduce((s, r) => s + Number(r.amount ?? 0), 0),
      wht: rows.reduce((s, r) => s + sqlClaimMoney(r.amount, r.vat_mode, r.withholding_tax_rate).wht, 0),
      net: rows.reduce((s, r) => s + sqlClaimMoney(r.amount, r.vat_mode, r.withholding_tax_rate).net, 0),
    }
    for (const col of ['bank_name', 'bank_account_number', 'account_holder_name']) {
      const hit = pickField(col)
      out[col] = hit ? hit[col] : null
      out[`${col}_at`] = hit ? hit.created_at : null
    }
    return out
  })
}

/** ผลของ rpc แบบ PostgREST: เรียง/ตัดช่วงได้ (.order / .range / .limit) · เพดาน 1,000 แถว · นับรอบตอน .then() เหมือนคำขอตาราง */
class RpcQuery implements PromiseLike<Result> {
  private sorts: { col: string; asc: boolean }[] = []
  private start = 0
  private end: number | null = null
  constructor(private fn: string, private args: unknown) {}
  order(col: string, opts: { ascending?: boolean } = {}) { this.sorts.push({ col, asc: opts.ascending !== false }); return this }
  range(from: number, to: number) { this.start = from; this.end = to; return this }
  private run(): Result {
    meter.rpc.push(this.fn)
    const handler = this.fn === 'finance_wht_cells' ? (whtRpcInstalled ? () => ({ data: sqlWhtCells(), error: null }) : undefined) : rpcHandlers[this.fn]
    if (!handler) return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${this.fn} without parameters in the schema cache` } }
    const res = handler(this.args)
    if (res.error || !Array.isArray(res.data)) return res
    const rows = [...(res.data as Row[])].sort((a, b) => {
      for (const s of this.sorts) {
        const x = a[s.col], y = b[s.col]
        if (x == null && y == null) continue
        if (x == null || y == null) return (x == null) === s.asc ? 1 : -1
        const d = cmp(x, y)
        if (d !== 0) return s.asc ? d : -d
      }
      return 0
    })
    const limit = Math.min(this.end === null ? Number.POSITIVE_INFINITY : this.end - this.start + 1, MAX_ROWS)
    return { data: clone(rows.slice(this.start, this.start + limit)), error: null }
  }
  then<A = Result, B = never>(
    onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return schedule({ label: `rpc.${this.fn}` }, () => this.run()).then(onfulfilled, onrejected)
  }
}

// ── สตอเรจ ───────────────────────────────────────────────────────────────────
const STORAGE_BASE = `https://${PROJECT}.supabase.co/storage/v1/object/public`
/** อัปโหลดที่ path ตรงกับเงื่อนไขนี้ล้ม (ตัดสินตอนเรียก) */
let failUpload: ((path: string) => boolean) | null = null
const bucketApi = (bucket: string) => strict({
  upload: (path: string, file: File, options?: Record<string, unknown>) => {
    meter.uploadCalls++
    meter.uploads.push({ bucket, path, size: file.size, options: clone(options ?? null) })
    const fail = failUpload?.(path) ?? false
    return schedule({ upload: true, label: 'storage.upload' }, () => {
      if (fail) return { data: null, error: { message: 'จำลอง: อัปโหลดไม่สำเร็จ', statusCode: '500' } }
      const key = `${bucket}/${path}`
      if (storage.has(key) && options?.upsert !== true) return { data: null, error: { message: 'The resource already exists', statusCode: '409' } }
      storage.set(key, file.size)
      return { data: { path, id: key, fullPath: key }, error: null }
    })
  },
  getPublicUrl: (path: string) => ({ data: { publicUrl: `${STORAGE_BASE}/${bucket}/${path}` } }),
  remove: (paths: string[]) => {
    meter.removes.push([...paths])
    return schedule({ label: 'storage.remove' }, () => {
      for (const p of paths) storage.delete(`${bucket}/${p}`)
      return { data: paths.map(name => ({ name })), error: null }
    })
  },
})

const fakeClient = strict({
  from: (table: string) => strict(new Query(table)),
  rpc: (fn: string, args?: unknown) => strict(new RpcQuery(fn, args)),
  storage: strict({ from: (bucket: string) => bucketApi(bucket) }),
})

// ══ แทนโมดูลที่ต้องมี Next / ฐานข้อมูลจริง ══════════════════════════════════════════════
const cookieJar = new Map<string, string>()
const revalidated: string[] = []
const activity: { action: string; details: unknown }[] = []
const notifications: Row[] = []

/** React.cache แบบ Next: จำผลต่อหนึ่งคำขอ (newRequest() เริ่มคำขอใหม่) — requireAuth / getFinanceViewer ถามฐานข้อมูลครั้งเดียวต่อหน้า */
let requestScope = new Map<unknown, Map<string, unknown>>()
const newRequest = () => { requestScope = new Map() }
function requestCache<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args: A): R => {
    let memo = requestScope.get(fn)
    if (!memo) requestScope.set(fn, (memo = new Map()))
    const key = JSON.stringify(args)
    if (!memo.has(key)) memo.set(key, fn(...args))
    return memo.get(key) as R
  }
}

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const moduleCache = new Map<string, unknown>()
const mocks: [RegExp, (real: () => Record<string, unknown>) => unknown][] = [
  [/supabase-server$/, real => ({ createServiceClient: () => fakeClient, supabaseServer: fakeClient, removeStorageByUrls: real().removeStorageByUrls })],
  [/(^|\/)lib\/supabase$/, () => ({
    createClient: () => { throw new Error('ห้ามใช้ browser client ในสคริปต์นี้') },
    supabase: strict({}),
  })],
  [/^next\/headers$/, () => ({
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  })],
  [/^next\/cache$/, () => ({ revalidatePath(p: string) { revalidated.push(p) }, revalidateTag() {} })],
  [/(^|\/)lib\/logger$/, () => ({
    logActivity: (action: string, details: unknown) => {
      activity.push({ action, details: clone(details) })
      return schedule({ write: true, label: 'logActivity' }, () => undefined)
    },
  })],
  [/(^|\/)lib\/notifications$/, () => ({
    createNotifications: (params: Row) => {
      notifications.push(clone(params))
      return schedule({ write: true, label: 'createNotifications' }, () => undefined)
    },
  })],
  [/^react$/, real => ({ ...real(), cache: requestCache })],
]
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  if (!hit) return realLoad.call(this, request, ...rest)
  const key = hit[0].source
  if (!moduleCache.has(key)) moduleCache.set(key, hit[1](() => realLoad.call(this, request, ...rest) as Record<string, unknown>))
  return moduleCache.get(key)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const { getClaimChecklist } = require('../app/(authenticated)/costs/types') as typeof import('../app/(authenticated)/costs/types')
const claimsFilter = require('../app/(authenticated)/finance/claims-filter') as typeof import('../app/(authenticated)/finance/claims-filter')
type PageFn = (props?: unknown) => Promise<unknown>
const page = (rel: string) => (require(join(FINANCE, rel)) as { default: PageFn }).default
const FinancePage = page('page')
const ArchivePage = page('archive/page')
const OverviewPage = page('overview/page')
const DownloadPage = page('download/page')
const PayoutsPage = page('payouts/page')
const ClaimPage = page('[id]/page')
// หน้าค้นหา (BATCH 1) ใช้ search-view.tsx ของหน้าจอ — ยังไม่มีไฟล์ = ข้ามการวัดหน้า (ตัวค้นหา search-data.ts ตรวจตรงอยู่แล้ว)
const SEARCH_PAGE = join(FINANCE, 'search', 'page.tsx')
const SearchPage = existsSync(SEARCH_PAGE) && existsSync(join(FINANCE, 'search', 'search-view.tsx')) ? page('search/page') : null
const actions = {
  ...(require('../app/(authenticated)/finance/actions') as Record<string, unknown>),
  ...(require('../app/(authenticated)/finance/lifecycle-actions') as Record<string, unknown>),
} as Record<string, (...args: unknown[]) => Promise<Record<string, unknown>>>
// ไฟล์ข้อมูลของขั้น 3 (มีหลัง BATCH 1) — เรียกตรงเพื่อตรวจสิทธิ์ ค้นหา และทางสำรองเมื่อยังไม่รัน SQL
const HAS_DATA_FILES = existsSync(join(FINANCE, 'list-data.ts'))
/** claim-docs.ts (BATCH 0) — โหลดเมื่อเจอแถวแบบเบาเท่านั้น (โค้ดของ 3248bde ตอนเขียน golden ไม่มีไฟล์นี้) */
const claimDocs = new Proxy({} as typeof import('../app/(authenticated)/finance/claim-docs'), {
  get: (_t, prop) => (require('../app/(authenticated)/finance/claim-docs') as Record<string | symbol, unknown>)[prop],
})
type DataModules = {
  list: typeof import('../app/(authenticated)/finance/list-data')
  archive: typeof import('../app/(authenticated)/finance/archive-data')
  search: typeof import('../app/(authenticated)/finance/search-data')
  report: typeof import('../app/(authenticated)/finance/report-data')
  claimPage: typeof import('../app/(authenticated)/finance/claim-page-data')
  claimDb: typeof import('../app/(authenticated)/finance/claim-db')
}
const data: DataModules | null = HAS_DATA_FILES
  ? {
    list: require('../app/(authenticated)/finance/list-data'),
    archive: require('../app/(authenticated)/finance/archive-data'),
    search: require('../app/(authenticated)/finance/search-data'),
    report: require('../app/(authenticated)/finance/report-data'),
    claimPage: require('../app/(authenticated)/finance/claim-page-data'),
    claimDb: require('../app/(authenticated)/finance/claim-db'),
  }
  : null
/* eslint-enable @typescript-eslint/no-require-imports */

// ══ ตัวช่วย ═══════════════════════════════════════════════════════════════════════
function loginAs(userId: string | null) {
  cookieJar.clear()
  if (!userId) return
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}
async function quietly<T>(run: () => Promise<T>): Promise<T> {
  const { error, warn } = console
  console.error = () => {}
  console.warn = () => {}
  try {
    return await run()
  } finally {
    console.error = error
    console.warn = warn
  }
}
const bytesOf = (v: unknown) => Buffer.byteLength(JSON.stringify(v))
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const pass = (label: string) => console.log(`PASS  ${label}`)

type View = { name: string; props: Row }
/** view component ที่ page คืน (ไม่เรียก render ของ component — เก็บ props ตามที่ server ส่ง) */
function collectViews(node: unknown, out: View[] = []): View[] {
  if (Array.isArray(node)) {
    for (const n of node) collectViews(n, out)
    return out
  }
  if (!isValidElement(node)) return out
  const { type, props } = node as ReactElement<Row>
  if (typeof type === 'function') {
    const rest: Row = { ...props }
    delete rest.children
    out.push({ name: type.name || 'anonymous', props: rest })
    return out
  }
  collectViews(props.children, out)
  return out
}

type Measured = { views: View[]; bytes: number; rounds: number; log: QueryLog[]; rpc: string[] }
/** เรียกหน้าเป็นคำขอใหม่ของผู้ใช้คนนั้น แล้ววัดขนาด props และจำนวนรอบ */
async function measure(viewer: string, call: () => Promise<unknown>): Promise<Measured> {
  loginAs(viewer)
  newRequest()
  resetMeter()
  const errorsBefore = fakeErrors.length
  const el = await call()
  await settle()
  assert.deepEqual(fakeErrors.slice(errorsBefore), [], 'ตัวจำลองเจอคำขอที่ทำไม่ได้')
  const views = collectViews(el)
  assert.ok(views.length > 0, 'หน้าต้องคืน view component')
  return { views, bytes: views.reduce((s, v) => s + bytesOf(v.props), 0), rounds: meter.rounds, log: [...meter.log], rpc: [...meter.rpc] }
}
const viewNamed = (m: Measured, name: string) => {
  const v = m.views.find(x => x.name === name)
  assert.ok(v, `ไม่พบ <${name}> ในผลของหน้า (ได้ ${m.views.map(x => x.name).join(', ')})`)
  return v.props
}
/** props ต้องมี key นี้เป็น array — ไม่งั้นรูปข้อมูลของหน้าเปลี่ยนแล้ว (BATCH 1 ต้องเพิ่มตัวอ่านแบบใหม่ใน totalsOf) */
function rowsOf(props: Row, key: string, pageKey: string): Row[] {
  const v = props[key]
  assert.ok(Array.isArray(v), `${pageKey}: props.${key} ไม่ใช่รายการแถว — รูปข้อมูลของหน้าเปลี่ยน ต้องเพิ่มตัวอ่านแบบใหม่ใน totalsOf ก่อน (BATCH 1)`)
  return v as Row[]
}

// ══ สูตรของหน้าจอปัจจุบัน (คัดลอกจาก 3248bde — หน้าจอจะเปลี่ยนในขั้น 3 จึงไม่ import) ═══════════════
/** calcTax ของหน้าจอ (archive-list / overview-dashboard / payout-dashboard / claims-list-view) */
function viewCalcTax(amount: number, vatMode: string, whtRatePercent: number) {
  let baseAmount = amount
  let vatAmount = 0
  let totalWithVat = amount
  if (vatMode === 'included') {
    baseAmount = amount / 1.07
    vatAmount = amount - baseAmount
    totalWithVat = amount
  } else if (vatMode === 'excluded') {
    vatAmount = amount * 0.07
    totalWithVat = amount + vatAmount
  }
  const whtAmount = baseAmount * (whtRatePercent / 100)
  const netPayable = totalWithVat - whtAmount
  return { baseAmount, vatAmount, totalWithVat, whtAmount, netPayable }
}
type C = Row & { amount: number; vat_mode: string; withholding_tax_rate: number; status: string; claim_type: string }
const taxOf = (c: Row) => viewCalcTax((c.amount as number) || 0, (c.vat_mode as string) || 'none', (c.withholding_tax_rate as number) || 0)
/** เดือน/วันที่ตามเวลาไทย (หน้าจอใช้ getFullYear/getMonth ของเครื่องผู้ใช้ในไทย) */
const thaiParts = (value: string) => {
  const d = new RealDate(RealDate.parse(DATE_RE.test(value) ? `${value}T00:00:00Z` : value) + THAI)
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, day: d.toISOString().slice(0, 10) }
}
const round2 = (n: number) => Math.round(n * 100) / 100

/** แถวแบบเบา (ListClaim / OverviewRow ของขั้น 3) — มี docs แทนรายการ URL */
const isLean = (c: Row) => typeof c.docs === 'object' && c.docs !== null
/** ป้ายเอกสารของแถว: แถวเต็ม = getClaimChecklist ตัวจริง (golden) · แถวแบบเบา = checklistOf ของ claim-docs.ts (หน้าจอขั้น 3) */
const checklistRow = (c: Row) => (isLean(c) ? claimDocs.checklistOf(c as never) : getClaimChecklist(c as never))

/** ป้ายเอกสาร / จำนวนไฟล์ / สถานะแฟ้ม ของทุกแถว (ของจริงจาก costs/types + claims-filter · แถวแบบเบาใช้ claim-docs.ts) — '0101001|3|filed' */
function rowDocs(rows: Row[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const c of rows) {
    const ck = checklistRow(c)
    const bits = [ck.hasReceipt, ck.hasTaxInvoice, ck.taxInvoiceRequired, ck.refundRequired, ck.hasRefundSlip, ck.refundConfirmed, ck.isComplete].map(b => (b ? 1 : 0)).join('')
    const files = isLean(c) ? claimDocs.fileCountOf(c as never) : claimFileCount(c)
    const filed = isLean(c) ? claimDocs.filedStateOf(c as never) : claimsFilter.filedState(c as never)
    out[String(c.id)] = `${bits}|${files}|${filed}`
  }
  return out
}
const claimFileCount = (c: Row) => claimsFilter.claimFileCount(c)

// ── /finance ของพนักงาน (claims-list-view.tsx) ─────────────────────────────────────
function staffTotals(props: Row) {
  const claims = rowsOf(props, 'claims', 'finance-staff') as C[]
  const unsettled = (c: C) => c.claim_type === 'advance' && c.status === 'paid' && c.actual_spent_amount == null
  const openPetty = (c: C) => c.claim_type === 'petty_cash' && !c.pettycash_fund_id && c.status === 'paid' && c.pettycash_closed_at == null
  const active = claims.filter(c => (c.status !== 'paid' && c.status !== 'cancelled' && c.status !== 'refund_confirmed') || unsettled(c) || openPetty(c))
  const combos: Record<string, Partial<typeof claimsFilter.EMPTY_FILTERS>> = {
    all: {},
    pending: { status: 'pending' },
    'event+incomplete': { type: 'event', incomplete: true },
  }
  const filteredAmount: Record<string, { count: number; amount: number }> = {}
  for (const [name, patch] of Object.entries(combos)) {
    const f = { ...claimsFilter.EMPTY_FILTERS, ...patch }
    const shown = f.status === 'all' ? active : active.filter(c => c.status === f.status)
    // แถวแบบเบา: ตัวกรองสองชุดนี้ (ประเภท + เอกสารไม่ครบ) คิดด้วย checklistOf — ไม่พึ่ง claims-filter ที่หน้าจอกำลังเปลี่ยน
    const filtered = (shown.some(isLean)
      ? shown.filter(c => (f.type === 'all' || c.claim_type === f.type) && (!f.incomplete || !checklistRow(c).isComplete))
      : claimsFilter.filterClaims(shown as never, f, 'expense_date')) as unknown as C[]
    filteredAmount[name] = { count: filtered.length, amount: filtered.reduce((s, c) => s + (Number(c.amount) || 0), 0) }
  }
  return {
    active: active.length,
    draft: claims.filter(c => c.status === 'draft').length,
    pending: active.filter(c => c.status === 'pending').length,
    approved: active.filter(c => c.status === 'approved' || c.status === 'awaiting_payment').length,
    pendingMonthEnd: active.filter(c => c.status === 'pending_month_end').length,
    rejected: active.filter(c => c.status === 'rejected').length,
    filteredAmount,
    rows: rowDocs(claims),
  }
}

// ── /finance?status=paid&month=… ของแอดมิน (queue-paid-section.tsx) ────────────────────────
function adminPaidTotals(props: Row) {
  const paid = rowsOf(props, 'paidClaims', 'finance-admin-paid')
  const netOf = (c: Row) => viewCalcTax(Number(c.amount) || 0, (c.vat_mode as string) || 'none', Number(c.withholding_tax_rate) || 0).netPayable
  return {
    paidMonth: props.paidMonth,
    paidMonths: props.paidMonths,
    queueCount: rowsOf(props, 'claims', 'finance-admin-paid').length,
    hiddenCount: props.hiddenCount,
    count: paid.length,
    net: paid.reduce((s, c) => s + netOf(c), 0),
    rows: rowDocs(paid),
  }
}

// ── /finance/archive (archive-list.tsx) ────────────────────────────────────────────
type ArchiveCombo = { q?: string; by?: string; type?: string; cat?: string; amount?: string; event?: string; month?: string; efrom?: string; eto?: string; pfrom?: string; pto?: string }
function archiveFilter(claims: Row[], f: ArchiveCombo): Row[] {
  const inRange = (value: unknown, from = '', to = '') => {
    if (!value) return false
    const d = thaiParts(String(value)).day
    if (from && d < from) return false
    if (to && d > to) return false
    return true
  }
  return claims.filter(c => {
    const submitter = c.submitter as { id?: string; full_name?: string } | null
    if (f.q?.trim()) {
      const q = f.q.trim().toLowerCase()
      const name = submitter?.full_name?.toLowerCase() || ''
      if (!(name.includes(q) || String(c.title ?? '').toLowerCase().includes(q) || String(c.claim_number ?? '').toLowerCase().includes(q))) return false
    }
    if (f.by && submitter?.id !== f.by) return false
    if (f.type && c.claim_type !== f.type) return false
    if (f.cat && c.category !== f.cat) return false
    if (f.amount) {
      const amt = (c.amount as number) || 0
      if (f.amount === '0' && amt !== 0) return false
      if (f.amount === '1-1000' && !(amt >= 1 && amt <= 1000)) return false
      if (f.amount === '1001-5000' && !(amt >= 1001 && amt <= 5000)) return false
      if (f.amount === '5001-10000' && !(amt >= 5001 && amt <= 10000)) return false
      if (f.amount === '10001+' && !(amt >= 10001)) return false
    }
    if (f.event && c.job_event_id !== f.event) return false
    if (f.month) {
      const [fy, fm] = f.month.split('-').map(Number)
      const p = thaiParts(String(c.expense_date))
      if (p.y !== fy || p.m !== fm) return false
    }
    if ((f.efrom || f.eto) && !inRange(c.expense_date, f.efrom, f.eto)) return false
    if ((f.pfrom || f.pto) && !inRange(c.paid_at, f.pfrom, f.pto)) return false
    return true
  })
}
function archiveCombos(): Record<string, ArchiveCombo> {
  return {
    none: {},
    by: { by: STAFF_TOP },
    'type=event': { type: 'event' },
    cat: { cat: 'travel' },
    'amount=1001-5000': { amount: '1001-5000' },
    event: { event: INFO.topEvent },
    month: { month: '2026-08' },
    'efrom/eto': { efrom: '2026-07-10', eto: '2026-08-05' },
    // วันที่จ่าย 31 ส.ค. ตามเวลาไทย = 2026-08-30T17:00Z ถึง 2026-08-31T16:59:59Z — จ่ายรวบเย็นวันสิ้นเดือนบางใบข้ามเที่ยงคืนไทย
    'pfrom/pto (Thai midnight)': { pfrom: '2026-08-31', pto: '2026-08-31' },
    q: { q: 'ที่พัก' },
  }
}
function archiveTotals(props: Row) {
  const claims = rowsOf(props, 'claims', 'archive')
  const combos: Record<string, { query: ArchiveCombo; count: number; totalNet: number }> = {}
  for (const [name, f] of Object.entries(archiveCombos())) {
    const rows = archiveFilter(claims, f)
    combos[name] = { query: f, count: rows.length, totalNet: rows.reduce((s, c) => s + taxOf(c).netPayable, 0) }
  }
  const ids = claims.map(c => String(c.id))
  return { count: claims.length, idSequenceSha256: sha256(ids.join(',')), combos }
}

// ── /finance/overview (overview-dashboard.tsx) ─────────────────────────────────────
const OVERVIEW_WINDOWS: Record<string, { from: string; to: string } | null> = {
  month: { from: '2026-09-01', to: '2026-09-30' }, // rangeFromPreset('month') ของเครื่องในไทย ณ เวลาตรึง
  year: { from: '2026-01-01', to: '2026-12-31' },
  all: null,
  custom: { from: '2026-06-15', to: '2026-08-10' },
}
type OverviewCombo = { status?: string[]; type?: string; funding?: string; category?: string; completion?: 'complete' | 'incomplete' }
const OVERVIEW_COMBOS: Record<string, OverviewCombo> = {
  none: {},
  'status set': { status: ['pending', 'approved', 'paid'] },
  'type+funding': { type: 'event', funding: 'personal' },
  'category+completion': { category: 'travel', completion: 'incomplete' },
}
function overviewSummary(claims: Row[], win: { from: string; to: string } | null, f: OverviewCombo) {
  let list = claims
  if (win) list = list.filter(c => { const d = String(c.expense_date || c.created_at || '').slice(0, 10); return d >= win.from && d <= win.to })
  if (f.status?.length) list = list.filter(c => f.status?.includes(String(c.status)))
  if (f.type) list = list.filter(c => c.claim_type === f.type)
  if (f.funding) list = list.filter(c => (c.funding_source || 'company') === f.funding)
  if (f.category) list = list.filter(c => c.category === f.category)
  if (f.completion) list = list.filter(c => { const ck = checklistRow(c); return f.completion === 'complete' ? ck.isComplete : !ck.isComplete })
  let totalGross = 0, totalNet = 0, totalWht = 0, completeCount = 0, incompleteCount = 0, pendingTaxInvoice = 0, pendingRefund = 0, personalCount = 0
  for (const c of list) {
    const amt = (c.amount as number) || 0
    const tax = taxOf(c)
    totalGross += amt
    totalNet += tax.netPayable
    totalWht += tax.whtAmount
    const ck = checklistRow(c)
    if (ck.isComplete) completeCount += 1
    else incompleteCount += 1
    if (ck.taxInvoiceRequired && !ck.hasTaxInvoice) pendingTaxInvoice += 1
    if (ck.refundRequired && (!ck.hasRefundSlip || !ck.refundConfirmed)) pendingRefund += 1
    if ((c.funding_source || 'company') === 'personal') personalCount += 1
  }
  return { total: list.length, totalGross, totalNet, totalWht, completeCount, incompleteCount, pendingTaxInvoice, pendingRefund, personalCount }
}
function overviewTotals(props: Row) {
  const claims = rowsOf(props, 'claims', 'overview')
  const out: Record<string, ReturnType<typeof overviewSummary>> = {}
  for (const [preset, win] of Object.entries(OVERVIEW_WINDOWS)) {
    for (const [name, f] of Object.entries(OVERVIEW_COMBOS)) out[`${preset}|${name}`] = overviewSummary(claims, win, f)
  }
  return { count: claims.length, summaries: out }
}

// ── /finance/download (finance-download-view.tsx) ───────────────────────────────────
const WHT_STATUSES = ['all', 'paid', 'approved', 'pending_month_end', 'awaiting_payment']
function whtMonth(c: Row) {
  const p = thaiParts(String(c.expense_date || c.created_at))
  return `${p.y}-${String(p.m).padStart(2, '0')}`
}
function downloadTotals(props: Row) {
  const claims = rowsOf(props, 'claims', 'download')
  const months = [...new Set(claims.map(whtMonth))].sort().reverse()
  const combos: Record<string, unknown> = {}
  for (const status of WHT_STATUSES) {
    for (const month of ['all', ...months.slice(0, 3)]) {
      let rows = claims.filter(c => ((c.withholding_tax_rate as number) || 0) > 0)
      if (status !== 'all') rows = rows.filter(c => c.status === status)
      if (month !== 'all') rows = rows.filter(c => whtMonth(c) === month)
      const map = new Map<string, { name: string; count: number; totalGross: number; totalWht: number; totalNet: number; bankName: string; bankAccount: string; accountHolder: string }>()
      for (const c of rows) {
        const key = String(c.submitted_by || 'unknown')
        const tax = taxOf(c)
        const amt = (c.amount as number) || 0
        if (!map.has(key)) {
          map.set(key, {
            name: (c.submitter as { full_name?: string } | null)?.full_name || 'ไม่ระบุ',
            count: 0, totalGross: 0, totalWht: 0, totalNet: 0,
            bankName: String(c.bank_name || ''), bankAccount: String(c.bank_account_number || ''), accountHolder: String(c.account_holder_name || ''),
          })
        }
        const p = map.get(key) as NonNullable<ReturnType<typeof map.get>>
        p.totalGross += amt
        p.totalWht += tax.whtAmount
        p.totalNet += tax.netPayable
        p.count += 1
        if (!p.bankName && c.bank_name) p.bankName = String(c.bank_name)
        if (!p.bankAccount && c.bank_account_number) p.bankAccount = String(c.bank_account_number)
        if (!p.accountHolder && c.account_holder_name) p.accountHolder = String(c.account_holder_name)
      }
      const people = [...map.values()].sort((a, b) => b.totalWht - a.totalWht)
      combos[`${status}|${month}`] = {
        people: people.map(p => [p.name, p.count, p.totalGross, p.totalWht, p.totalNet, p.bankName, p.bankAccount, p.accountHolder]),
        totalWht: people.reduce((s, p) => s + p.totalWht, 0),
        totalGross: people.reduce((s, p) => s + p.totalGross, 0),
        totalNet: people.reduce((s, p) => s + p.totalNet, 0),
        totalCount: people.reduce((s, p) => s + p.count, 0),
      }
    }
  }
  return { claims: claims.length, profiles: Object.keys((props.profileMap as Row) ?? {}).length, months: months.slice(0, 3), combos }
}

// ── /finance/payouts (payout-dashboard.tsx — ไม่กรอง) ─────────────────────────────────
function payoutsTotals(props: Row) {
  const claims = rowsOf(props, 'claims', 'payouts')
  let totalAmount = 0, totalWht = 0, totalNetPayable = 0
  for (const c of claims) {
    const tax = taxOf(c)
    totalAmount += (c.amount as number) || 0
    totalWht += tax.whtAmount
    totalNetPayable += tax.netPayable
  }
  const people = new Set(claims.map(c => String(c.submitted_by || 'unknown'))).size
  return { count: claims.length, people, totalAmount, totalWht, totalNetPayable }
}

// ── /finance/[id] ─────────────────────────────────────────────────────────────────
const JOB_TABLES = ['job_cost_events', 'events', 'event_closures']
function claimTotals(m: Measured) {
  const props = viewNamed(m, 'ClaimDetailView')
  const children = props.pettyChildren as { topups: Row[]; expenses: Row[]; topupPaid: number; topupPending: number; spent: number } | null
  return {
    claimId: (props.claim as Row).id,
    logs: (props.logs as Row[]).length,
    pettyChildren: children ? { topups: children.topups.length, expenses: children.expenses.length, topupPaid: children.topupPaid, topupPending: children.topupPending, spent: children.spent } : null,
    linkable: Array.isArray(props.linkableClaims) ? props.linkableClaims.length : null,
  }
}

// ══ ตัวอ่าน props รูปใหม่ของขั้น 3 (BATCH 1) — คิดยอดชุดเดียวกับ golden จาก ListClaim / ArchivePageData / OverviewRow / WhtCell ══

/** การตรวจเป้าของขั้น 3 — รันหลังเทียบยอดกับ golden เท่านั้น (โหมด --write-golden ไม่รัน) · คืนข้อความสรุปที่พิมพ์ต่อท้าย PASS */
const laterChecks: { label: string; run: (golden: Golden) => string | void }[] = []
const later = (label: string, run: (golden: Golden) => string | void) => { laterChecks.push({ label, run }) }

/** ชื่อคีย์ทุกชั้นของค่า (object / array) */
function keysDeep(v: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(v)) for (const x of v) keysDeep(x, out)
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out) }
  return out
}
/** คีย์ที่แถวแบบเบาต้องไม่มี (AC4) */
const LIST_FORBIDDEN = ['receipt_urls', 'actual_receipt_urls', 'tax_invoice_urls', 'refund_slip_urls', 'description', 'notes', 'bank_account_number', 'approver', 'payer']
const DOC_KEYS = ['actualReceipts', 'receipts', 'refundSlips', 'taxInvoiceNumbers', 'taxInvoices']
function assertLeanRows(props: Row, rows: Row[], name: string) {
  const bad = LIST_FORBIDDEN.filter(k => keysDeep(props).has(k))
  assert.deepEqual(bad, [], `${name}: props มีคีย์ต้องห้าม`)
  for (const r of rows) {
    assert.ok(isLean(r), `${name}: แถว ${String(r.id)} ไม่มี docs`)
    assert.deepEqual(Object.keys(r.docs as Row).sort(), DOC_KEYS, `${name}: docs ของแถว ${String(r.id)}`)
  }
}

/** console.warn ระหว่าง run → warned (ไม่พิมพ์) */
async function capturingWarn<T>(warned: string[], run: () => Promise<T>): Promise<T> {
  const { warn } = console
  console.warn = (...args: unknown[]) => { warned.push(args.map(String).join(' ')) }
  try {
    return await run()
  } finally {
    console.warn = warn
  }
}

/** /finance/archive รูปใหม่: เดินทุกหน้า (ลำดับ id) + 10 ตัวกรองผ่าน URL (total / netTotal) + คลังเก็บของพนักงาน */
async function archiveTotalsNew(first: Row) {
  const hidden = new Set(db.expense_claims.filter(c => c.deleted_at).map(c => String(c.id)))
  const pages = Number(first.pages)
  const ids: string[] = []
  let rpcCalls = 0
  let hiddenSeen = 0
  for (let p = 1; p <= pages; p++) {
    const m = await measure(ADMIN, () => ArchivePage({ searchParams: Promise.resolve({ page: String(p) }) }))
    rpcCalls += m.rpc.length
    for (const r of viewNamed(m, 'ArchiveList').rows as Row[]) {
      ids.push(String(r.id))
      if (hidden.has(String(r.id))) hiddenSeen++
    }
  }
  const combos: Record<string, { query: ArchiveCombo; count: number; totalNet: number }> = {}
  for (const [name, f] of Object.entries(archiveCombos())) {
    const m = await measure(ADMIN, () => ArchivePage({ searchParams: Promise.resolve(f) }))
    rpcCalls += m.rpc.length
    const props = viewNamed(m, 'ArchiveList')
    combos[name] = { query: f, count: Number(props.total), totalNet: Number(props.netTotal) }
  }
  // พนักงาน: ทุกหน้าของคลังเก็บต้องเป็นใบของตัวเองเท่านั้น
  let staffOwnOnly = true
  let staffTotal = 0
  const staffFirst = viewNamed(await measure(STAFF_TOP, () => ArchivePage({ searchParams: Promise.resolve({}) })), 'ArchiveList')
  staffTotal = Number(staffFirst.total)
  for (let p = 1; p <= Number(staffFirst.pages); p++) {
    const m = await measure(STAFF_TOP, () => ArchivePage({ searchParams: Promise.resolve({ page: String(p) }) }))
    rpcCalls += m.rpc.length
    for (const r of viewNamed(m, 'ArchiveList').rows as Row[]) {
      if (r.submitted_by !== STAFF_TOP) staffOwnOnly = false
      if (hidden.has(String(r.id))) hiddenSeen++
    }
  }
  return {
    totals: { count: Number(first.total), idSequenceSha256: sha256(ids.join(',')), combos },
    pages, duplicates: ids.length - new Set(ids).size, hiddenSeen, rpcCalls, staffOwnOnly, staffTotal,
  }
}

/** /finance/overview รูปใหม่: สรุป 9 ช่องของแต่ละ preset คิดจากแถวของ preset นั้น (ช่วงวันที่กรองในฐานข้อมูลแล้ว) · count = แถวของ 'all' */
function overviewTotalsNew(byPreset: Record<string, Row[]>) {
  const out: Record<string, ReturnType<typeof overviewSummary>> = {}
  for (const [preset, win] of Object.entries(OVERVIEW_WINDOWS)) {
    assert.ok(byPreset[preset], `overview: ไม่มีแถวของ preset ${preset}`)
    for (const [name, f] of Object.entries(OVERVIEW_COMBOS)) out[`${preset}|${name}`] = overviewSummary(byPreset[preset], win, f)
  }
  return { count: byPreset.all.length, summaries: out }
}

/** /finance/download รูปใหม่ (WhtCell): รวมกลุ่มตามตัวกรองสถานะ × เดือน แบบหน้าจอ — บัญชีธนาคาร = ค่าที่ *_at ใหม่สุดของกลุ่มที่เลือก */
function downloadTotalsNew(props: Row) {
  const cells = props.cells as Row[]
  const names = new Map(((props.people ?? []) as { id: string; name: string }[]).map(p => [p.id, p.name]))
  const months = [...new Set(cells.map(c => String(c.month)))].sort().reverse()
  const newer = (a: unknown, b: string) => {
    const d = cmp(a, b)
    return d > 0 || (d === 0 && String(a) > b)
  }
  const combos: Record<string, unknown> = {}
  for (const status of WHT_STATUSES) {
    for (const month of ['all', ...months.slice(0, 3)]) {
      const selected = cells.filter(c => (status === 'all' || c.status === status) && (month === 'all' || c.month === month))
      type Person = { name: string; count: number; totalGross: number; totalWht: number; totalNet: number; bank: Record<string, { value: string; at: string }> }
      const map = new Map<string, Person>()
      for (const c of selected) {
        const key = String(c.submitted_by || 'unknown')
        let p = map.get(key)
        if (!p) {
          p = { name: names.get(key) || 'ไม่ระบุ', count: 0, totalGross: 0, totalWht: 0, totalNet: 0, bank: {} }
          map.set(key, p)
        }
        p.count += Number(c.n)
        p.totalGross += Number(c.gross)
        p.totalWht += Number(c.wht)
        p.totalNet += Number(c.net)
        for (const f of ['bank_name', 'bank_account_number', 'account_holder_name']) {
          const at = c[`${f}_at`]
          if (c[f] && (!p.bank[f] || newer(at, p.bank[f].at))) p.bank[f] = { value: String(c[f]), at: String(at) }
        }
      }
      const people = [...map.values()].sort((a, b) => b.totalWht - a.totalWht || a.name.localeCompare(b.name))
      combos[`${status}|${month}`] = {
        people: people.map(p => [p.name, p.count, p.totalGross, p.totalWht, p.totalNet, p.bank.bank_name?.value ?? '', p.bank.bank_account_number?.value ?? '', p.bank.account_holder_name?.value ?? '']),
        totalWht: people.reduce((s, p) => s + p.totalWht, 0),
        totalGross: people.reduce((s, p) => s + p.totalGross, 0),
        totalNet: people.reduce((s, p) => s + p.totalNet, 0),
        totalCount: people.reduce((s, p) => s + p.count, 0),
      }
    }
  }
  return {
    claims: cells.reduce((s, c) => s + Number(c.n), 0),
    profiles: Object.keys((props.profileMap as Row) ?? {}).length,
    months: months.slice(0, 3),
    combos,
  }
}

// ══ เป้าของขั้น 3 (แสดงในตาราง — BATCH 1 เปิดการตรวจ) ═══════════════════════════════════
const TARGETS: Record<string, string> = {
  'finance-staff': '≤ 1,400 B/แถว และ ≤ 55% ของก่อน (AC4 ข้อแก้ 2)',
  'finance-admin-paid': 'paidClaims ≤ 320,000 B (AC4 ข้อแก้ 2)',
  archive: '≤ 153,600 B · 50 แถว/หน้า (AC7)',
  overview: 'month ≤ 358,400 B · all ≤ 3,000,000 B (AC9 ข้อแก้ 2)',
  download: '≤ 120,000 B (AC11 ข้อแก้)',
  payouts: '— (ยังส่งแถวเต็ม)',
  claim: 'รอบ ≤ 3 · อ่านตารางงาน 0 (AC13)',
  'claim-fund': 'รอบ ≤ 3 (AC13)',
}

// ══ golden ══════════════════════════════════════════════════════════════════════
/** totals = ยอดที่ต้องเท่าเดิมหลังเปลี่ยนรูปข้อมูล · metrics = ตัวเลขประกอบที่เปลี่ยนได้ (ไม่เทียบ) */
type PageGolden = {
  beforeBytes: number; rounds: number; rows?: number; bytesPerRow?: number; bytesByPreset?: Record<string, number>
  metrics: Record<string, unknown>; totals: Record<string, unknown>
}
type ActionGolden = { result: string; maxInFlightWrites: number; rounds: number; writes: string[]; uploadCalls: number; uploadRounds: number; removed?: number; uploadOptions?: unknown }
type Golden = { meta: Record<string, unknown>; pages: Record<string, PageGolden>; actions: Record<string, ActionGolden> }

/** เทียบยอด: ตัวเลขต่างกันไม่เกิน 0.005 (2 ตำแหน่ง) · อื่นๆ ต้องเท่ากัน */
function assertClose(got: unknown, want: unknown, path: string) {
  if (typeof want === 'number' && typeof got === 'number') {
    assert.ok(Math.abs(got - want) < 0.005 || (Number.isNaN(got) && Number.isNaN(want)), `${path}: ได้ ${got} แต่ golden = ${want}`)
    return
  }
  if (Array.isArray(want)) {
    assert.ok(Array.isArray(got), `${path}: ต้องเป็นรายการ`)
    assert.equal(got.length, want.length, `${path}: จำนวนไม่ตรง`)
    want.forEach((w, i) => assertClose(got[i], w, `${path}[${i}]`))
    return
  }
  if (want && typeof want === 'object') {
    assert.ok(got && typeof got === 'object', `${path}: ต้องเป็น object`)
    assert.deepEqual(Object.keys(got as Row).sort(), Object.keys(want as Row).sort(), `${path}: ชุดคีย์ไม่ตรง`)
    for (const k of Object.keys(want as Row)) assertClose((got as Row)[k], (want as Row)[k], `${path}.${k}`)
    return
  }
  assert.deepEqual(got, want, path)
}

// ══ action: ใบเบิกสำหรับแต่ละกรณี ════════════════════════════════════════════════════
let seedSeq = 0
function seedClaim(over: Row): string {
  seedSeq++
  const id = uid(950_000 + seedSeq)
  db.expense_claims.push(claimRow({
    id, claim_number: `EXP-202609-${String(800 + seedSeq)}`, claim_type: 'event', job_event_id: uid(5000), title: `ใบทดสอบ action ${seedSeq}`,
    description: null, category: 'travel', amount: 1250, unit_price: 1250, unit: 'บาท', quantity: 1, total_amount: 1250, vat_mode: 'none',
    include_vat: false, withholding_tax_rate: 3, receipt_urls: [`${STORAGE_BASE}/receipts/claims/seed/${seedSeq}.jpg`], funding_source: 'company',
    status: 'pending', submitted_by: STAFF_TOP, submitted_at: pgTs(FIXED_NOW - 3 * DAY), expense_date: '2026-09-20',
    created_at: pgTs(FIXED_NOW - 3 * DAY, seedSeq), status_changed_at: pgTs(FIXED_NOW - 3 * DAY),
    ...over,
  }))
  return id
}
const imageFile = (name: string, bytes = 150_000) => new File([new Uint8Array(bytes).fill(7)], name, { type: 'image/jpeg' })
function claimForm(files: File[], intent: 'submit' | 'draft') {
  const fd = new FormData()
  const fields: Record<string, string> = {
    claim_type: 'other', title: 'ค่าที่พักทีมงานเดินทางต่างจังหวัด', category: 'accommodation', amount: '2400', unit_price: '1200', quantity: '2',
    unit: 'คืน', vat_mode: 'included', withholding_tax_rate: '0', expense_date: '2026-09-28', funding_source: 'personal',
    bank_name: 'ธนาคารกสิกรไทย', bank_account_number: '123-4-56789-0', account_holder_name: 'ผู้เบิก ทดสอบ', intent,
  }
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  for (const f of files) fd.append('receipt_files', f)
  return fd
}

type ActionRun = ActionGolden & { raw: Record<string, unknown> }
async function runAction(viewer: string, call: () => Promise<Record<string, unknown>>): Promise<ActionRun> {
  loginAs(viewer)
  newRequest()
  resetMeter()
  const errorsBefore = fakeErrors.length
  const raw = await quietly(call)
  await settle()
  assert.deepEqual(fakeErrors.slice(errorsBefore), [], 'ตัวจำลองเจอคำขอที่ทำไม่ได้')
  return {
    raw,
    result: raw.error ? `error: ${String(raw.error)}` : 'success',
    maxInFlightWrites: meter.maxInFlightWrites,
    rounds: meter.rounds,
    writes: [...meter.writes],
    uploadCalls: meter.uploadCalls,
    uploadRounds: meter.uploadRounds,
  }
}

// ══ main ════════════════════════════════════════════════════════════════════════
async function main() {
  resetDb()

  // ── ข้อมูลทดสอบเป็นไปตามที่ตั้งใจ ───────────────────────────────────────────────
  const claims = db.expense_claims
  const visible = claims.filter(c => !c.deleted_at)
  const paidLike = claims.filter(c => c.status === 'paid' || c.status === 'refund_confirmed')
  const thisMonth = claims.filter(c => String(c.expense_date).startsWith('2026-09'))
  const wht = claims.filter(c => Number(c.withholding_tax_rate) > 0)
  const jobLinked = claims.filter(c => c.job_event_id)
  const bySubmitter = new Map<string, number>()
  for (const c of claims) bySubmitter.set(String(c.submitted_by), (bySubmitter.get(String(c.submitted_by)) ?? 0) + 1)
  const top5 = [...bySubmitter.values()].sort((a, b) => b - a).slice(0, 5).reduce((s, n) => s + n, 0)
  const avgTitle = claims.reduce((s, c) => s + String(c.title).length, 0) / claims.length
  const withDesc = claims.filter(c => c.description)
  const stats = {
    claims: claims.length,
    paidShare: round2(paidLike.length / claims.length),
    thisMonth: thisMonth.length,
    whtShare: round2(wht.length / claims.length),
    jobLinkedShare: round2(jobLinked.length / claims.length),
    submitters: bySubmitter.size,
    top5Share: round2(top5 / claims.length),
    hidden: claims.length - visible.length,
    funds: claims.filter(c => c.claim_type === 'petty_cash' && !c.pettycash_fund_id).length,
    fundChildren: claims.filter(c => c.pettycash_fund_id).length,
    jobEvents: db.job_cost_events.length,
    avgTitleChars: Math.round(avgTitle),
    descriptionShare: round2(withDesc.length / claims.length),
    avgDescriptionChars: Math.round(withDesc.reduce((s, c) => s + String(c.description).length, 0) / withDesc.length),
    notesShare: round2(claims.filter(c => c.notes).length / claims.length),
    bankShare: round2(claims.filter(c => c.bank_name).length / claims.length),
    avgReceiptUrlChars: Math.round(claims.flatMap(c => (c.receipt_urls as string[] | null) ?? []).reduce((s, u, _, a) => s + u.length / a.length, 0)),
    blankTaxInvoiceEntries: claims.flatMap(c => (c.tax_invoice_urls as string[] | null) ?? []).filter(u => u === '').length,
    filed: claims.filter(c => c.filed_at).length,
  }
  assert.equal(stats.claims, 2000)
  assert.ok(stats.paidShare >= 0.8 && stats.paidShare <= 0.84, `จ่ายแล้วราว 82% (ได้ ${stats.paidShare})`)
  assert.ok(stats.thisMonth === 230, `เดือนนี้ 230 ใบ (ได้ ${stats.thisMonth})`)
  assert.ok(stats.whtShare >= 0.18 && stats.whtShare <= 0.24, `หัก ณ ที่จ่ายราว 21% (ได้ ${stats.whtShare})`)
  assert.ok(stats.jobLinkedShare >= 0.58 && stats.jobLinkedShare <= 0.64, `ผูกงานราว 61% (ได้ ${stats.jobLinkedShare})`)
  assert.equal(stats.submitters, 39)
  assert.ok(stats.top5Share >= 0.54 && stats.top5Share <= 0.62, `5 คนถือราว 58% (ได้ ${stats.top5Share})`)
  assert.ok(stats.hidden >= 15, 'มีใบที่ซ่อน')
  assert.ok(stats.blankTaxInvoiceEntries > 0, "มีใบกำกับที่มีแต่เลขที่ ('')")
  // จ่ายรวบคืนวันที่ 31 ส.ค.: มีใบที่จ่ายก่อนและหลังเที่ยงคืนไทย (2026-08-31T17:00Z) ภายใน 2 ชั่วโมง — ตัวกรองวันที่จ่ายของคลังเก็บต้องแยกถูก
  const paidAround = (from: string, to: string) => paidLike.filter(c => String(c.paid_at) >= from && String(c.paid_at) < to && !c.deleted_at).length
  assert.ok(paidAround('2026-08-31T15:00', '2026-08-31T17:00') > 0 && paidAround('2026-08-31T17:00', '2026-08-31T19:00') > 0, 'ต้องมีใบที่จ่ายคร่อมเที่ยงคืนไทยของวันที่ 31 ส.ค.')
  pass(`ข้อมูลสังเคราะห์: ${JSON.stringify(stats)}`)

  // ตัวจำลองเอง
  assert.throws(() => (fakeClient.from('expense_claims') as unknown as { or: (s: string) => unknown }).or('status.eq.paid'), /ไม่รองรับ \.or\(\)/)
  resetMeter()
  const capped = await fakeClient.from('expense_claims').select('id').range(0, 4999)
  assert.equal((capped.data as Row[]).length, MAX_ROWS, 'เพดาน 1,000 แถว')
  const counted = await fakeClient.from('expense_claims').select('id', { count: 'exact', head: true }).eq('status', 'paid')
  assert.equal(counted.data, null)
  assert.equal(counted.count, claims.filter(c => c.status === 'paid').length)
  const escaped = await fakeClient.from('expense_claims').select('id').ilike('title', '%100\\%%')
  assert.deepEqual(escaped.data, [], "ilike: \\% เป็นตัวอักษร %")
  const both = await Promise.all([fakeClient.from('profiles').select('id').eq('id', ADMIN), fakeClient.from('finance_categories').select('id')])
  assert.ok(both.every(r => !r.error))
  assert.equal(meter.rounds, 4, 'สามคำขอต่อกัน + สองคำขอพร้อมกัน = 4 รอบ')
  assert.equal((await fakeClient.rpc('finance_wht_cells')).error?.code, 'PGRST202', 'rpc ที่ไม่มี = PGRST202')
  dropped.add('expense_claims.deleted_at')
  assert.equal((await fakeClient.from('expense_claims').select('id').is('deleted_at', null)).error?.code, '42703')
  assert.ok(!('deleted_at' in ((await fakeClient.from('expense_claims').select('*').limit(1)).data as Row[])[0]))
  dropped.clear()
  pass('ตัวจำลอง: เพดาน 1,000 แถว · count/head · ilike escape · นับรอบ (คำขอต่อกัน/พร้อมกัน) · rpc ที่ไม่มี = PGRST202 · คอลัมน์ที่ปิด = 42703 · เมธอดที่ไม่มี throw')

  // ── หน้า ───────────────────────────────────────────────────────────────────
  const now: Golden = { meta: {}, pages: {}, actions: {} }
  const record = (key: string, m: Measured, totals: Record<string, unknown>, extra: Partial<PageGolden> = {}) => {
    const reads: Record<string, number> = {}
    for (const l of m.log) reads[l.table] = (reads[l.table] ?? 0) + 1
    now.pages[key] = {
      beforeBytes: m.bytes, rounds: m.rounds, ...extra,
      metrics: { views: m.views.map(v => v.name), rpcCalls: m.rpc.length, reads, ...(extra.metrics ?? {}) },
      totals,
    }
  }
  const noParams = { searchParams: Promise.resolve({}) }

  // /finance พนักงาน (ผู้เบิกอันดับหนึ่ง)
  const staff = await measure(STAFF_TOP, () => FinancePage(noParams))
  const staffProps = viewNamed(staff, 'ClaimsListView')
  const staffRows = rowsOf(staffProps, 'claims', 'finance-staff')
  const staffBytesPerRow = Math.round(staffRows.reduce((s, r) => s + bytesOf(r), 0) / Math.max(1, staffRows.length))
  record('finance-staff', staff, staffTotals(staffProps), { rows: staffRows.length, bytesPerRow: staffBytesPerRow })
  later('AC4 /finance พนักงาน: ≤ 1,400 B/แถว และ ≤ 55% ของก่อน (ข้อแก้ 2 ของ orchestrator) · แถวไม่มีรายการ URL/รายละเอียด/หมายเหตุ/บัญชี/ผู้อนุมัติ/ผู้จ่าย · มี docs ครบ 5 ช่อง', golden => {
    const before = golden.pages['finance-staff'].beforeBytes
    // รูปแถวก่อน แล้วขนาด (ข้อความของข้อที่ไม่ผ่านบอกตัวเลขจริง)
    assertLeanRows(staffProps, staffRows, 'ClaimsListView')
    assert.ok(staffBytesPerRow <= 1400 && staff.bytes <= before * 0.55,
      `${staffBytesPerRow} B/แถว (เป้า ≤ 1,400) · ${staff.bytes} B = ${((staff.bytes / before) * 100).toFixed(1)}% ของ ${before} B (เป้า ≤ 55%) — รูปแถวถูก (ไม่มีคีย์ต้องห้าม, docs ครบ)`)
    return `${staffBytesPerRow} B/แถว · ${staff.bytes.toLocaleString()} B = ${((staff.bytes / before) * 100).toFixed(1)}% ของก่อน`
  })

  // /finance?status=paid&month=<เดือนล่าสุดที่มีการจ่าย> แอดมิน
  const admin0 = await measure(ADMIN, () => FinancePage(noParams))
  const topMonth = String((viewNamed(admin0, 'QueueView').paidMonths as { month: string }[])[0]?.month ?? '')
  assert.match(topMonth, /^\d{4}-\d{2}$/, 'ต้องมีเดือนที่จ่าย')
  INFO.paidMonth = topMonth
  const adminPaid = await measure(ADMIN, () => FinancePage({ searchParams: Promise.resolve({ status: 'paid', month: topMonth }) }))
  const adminPaidProps = viewNamed(adminPaid, 'QueueView')
  const paidRows = rowsOf(adminPaidProps, 'paidClaims', 'finance-admin-paid')
  const paidClaimsBytes = bytesOf(paidRows)
  record('finance-admin-paid', adminPaid, adminPaidTotals(adminPaidProps), {
    rows: paidRows.length,
    bytesPerRow: Math.round(paidRows.reduce((s, r) => s + bytesOf(r), 0) / Math.max(1, paidRows.length)),
    // props ของ QueueView = คิว (queue-data.ts — ขั้น 3 ไม่แก้) + ใบที่จ่ายแล้วของเดือน: แยกขนาดสองส่วนไว้ให้เห็น
    metrics: { paidClaimsBytes, queueClaimsBytes: bytesOf(adminPaidProps.claims), queueRows: rowsOf(adminPaidProps, 'claims', 'finance-admin-paid').length },
  })
  later('AC4 /finance?status=paid (แอดมิน): paidClaims ≤ 320,000 B (ข้อแก้ 2 ของ orchestrator — ไม่นับคิว) · แถวแบบเบามี docs ครบ', () => {
    assertLeanRows({ paidClaims: paidRows }, paidRows, 'QueueView.paidClaims')
    assert.ok(paidClaimsBytes <= 320_000, `paidClaims ${paidClaimsBytes} B (เป้า ≤ 320,000) · ${paidRows.length} แถว ${Math.round(paidClaimsBytes / paidRows.length)} B/แถว — รูปแถวถูก (ไม่มีคีย์ต้องห้าม, docs ครบ)`)
    return `paidClaims ${paidClaimsBytes.toLocaleString()} B (${paidRows.length} แถว)`
  })

  // /finance/archive แอดมิน
  const archive = await measure(ADMIN, () => ArchivePage(noParams))
  const archiveProps = viewNamed(archive, 'ArchiveList')
  if (Array.isArray(archiveProps.rows)) {
    const walked = await archiveTotalsNew(archiveProps)
    record('archive', archive, walked.totals, { rows: (archiveProps.rows as Row[]).length })
    later('AC7 /finance/archive: ≤ 153,600 B · 50 แถว/หน้า · เดินทุกหน้าได้ลำดับ id เดิม · 10 ตัวกรองได้ยอดเดิม · พนักงานได้เฉพาะของตัวเอง · ไม่มีใบที่ซ่อน · rpc 0 ครั้ง', () => {
      assert.ok(archive.bytes <= 153_600, `${archive.bytes} B (เป้า ≤ 153,600)`)
      assert.equal((archiveProps.rows as Row[]).length, 50, 'หน้าแรก 50 แถว')
      assert.equal(walked.duplicates, 0, 'เดินทุกหน้าแล้วมี id ซ้ำ')
      assert.equal(walked.hiddenSeen, 0, 'เจอใบที่ซ่อนในคลังเก็บ')
      assert.equal(walked.rpcCalls, 0, 'คลังเก็บเรียก rpc')
      assert.ok(walked.staffOwnOnly && walked.staffTotal > 0, 'พนักงานเห็นใบของคนอื่นในคลังเก็บ')
      assertLeanRows(archiveProps, archiveProps.rows as Row[], 'ArchiveList')
      return `${archive.bytes.toLocaleString()} B · ${walked.pages} หน้า · พนักงาน ${walked.staffTotal} ใบของตัวเอง`
    })
  } else {
    record('archive', archive, archiveTotals(archiveProps), { rows: rowsOf(archiveProps, 'claims', 'archive').length })
  }

  // /finance/overview — ทุก preset (โค้ดก่อนขั้น 3 ไม่อ่าน searchParams: ทุก preset ได้ props ชุดเดียวกัน)
  const bytesByPreset: Record<string, number> = {}
  const rowsByPreset: Record<string, Row[]> = {}
  const monthLog: QueryLog[] = []
  let overview: Measured | null = null
  for (const preset of ['month', 'year', 'all', 'custom']) {
    const params = preset === 'custom' ? { preset, from: '2026-06-15', to: '2026-08-10' } : { preset }
    const m = await measure(ADMIN, () => OverviewPage({ searchParams: Promise.resolve(params) }))
    bytesByPreset[preset] = m.bytes
    const props = viewNamed(m, 'OverviewDashboard')
    if (Array.isArray(props.rows)) rowsByPreset[preset] = props.rows as Row[]
    if (preset === 'month') {
      overview = m
      monthLog.push(...m.log)
    }
  }
  assert.ok(overview)
  const overviewProps = viewNamed(overview, 'OverviewDashboard')
  if (Array.isArray(overviewProps.rows)) {
    record('overview', overview, overviewTotalsNew(rowsByPreset), { rows: (overviewProps.rows as Row[]).length, bytesByPreset })
    later('AC9 /finance/overview: เดือนนี้กรอง expense_date ในฐานข้อมูล ≤ 358,400 B · ทั้งหมด ≤ 3,000,000 B (ข้อแก้ 2) · ไม่มีรายการ URL/รายละเอียด/บัญชี', () => {
      const read = monthLog.find(l => l.table === 'expense_claims' && l.filters.includes('gte:expense_date=2026-09-01') && l.filters.includes('lte:expense_date=2026-09-30'))
      assert.ok(read, `ต้องอ่าน expense_claims ด้วย expense_date ≥ 2026-09-01 และ ≤ 2026-09-30 (ได้ ${JSON.stringify(monthLog.filter(l => l.table === 'expense_claims').map(l => l.filters))})`)
      for (const [preset, rows] of Object.entries(rowsByPreset)) {
        const keys = keysDeep(rows)
        const bad = ['receipt_urls', 'tax_invoice_urls', 'refund_slip_urls', 'actual_receipt_urls', 'description', 'bank_name', 'bank_account_number', 'account_holder_name', 'approver', 'payer'].filter(k => keys.has(k))
        assert.deepEqual(bad, [], `${preset}: props มีคีย์ต้องห้าม`)
        assert.ok(rows.every(isLean), `${preset}: ทุกแถวต้องมี docs`)
      }
      assert.ok(bytesByPreset.month <= 358_400, `month ${bytesByPreset.month} B (เป้า ≤ 358,400)`)
      assert.ok(bytesByPreset.all <= 3_000_000, `all ${bytesByPreset.all} B (เป้า ≤ 3,000,000) · ${rowsByPreset.all.length} แถว ${Math.round(bytesByPreset.all / rowsByPreset.all.length)} B/แถว — month ${bytesByPreset.month} B ผ่าน · กรอง expense_date ในฐานข้อมูล · ไม่มีคีย์ต้องห้าม`)
      return `month ${bytesByPreset.month.toLocaleString()} B (${rowsByPreset.month.length} แถว) · all ${bytesByPreset.all.toLocaleString()} B (${rowsByPreset.all.length} แถว)`
    })
  } else {
    record('overview', overview, overviewTotals(overviewProps), { rows: rowsOf(overviewProps, 'claims', 'overview').length, bytesByPreset })
  }

  // /finance/download
  const warned: string[] = []
  const download = await capturingWarn(warned, () => measure(ADMIN, () => DownloadPage(noParams)))
  const downloadProps = viewNamed(download, 'FinanceDownloadView')
  if (Array.isArray(downloadProps.cells)) {
    const totals = downloadTotalsNew(downloadProps)
    record('download', download, totals, { rows: (downloadProps.cells as Row[]).length, metrics: { whtCells: (downloadProps.cells as Row[]).length } })
    // ทางสำรองครั้งที่สอง (ยังไม่มีฟังก์ชัน) ต้องไม่เตือนซ้ำ · แล้วติดตั้งฟังก์ชัน (ตัวจำลองแบบ SQL) → ยอดเท่ากัน
    const again = await capturingWarn(warned, () => measure(ADMIN, () => DownloadPage(noParams)))
    whtRpcInstalled = true
    const viaRpc = await capturingWarn(warned, () => measure(ADMIN, () => DownloadPage(noParams)))
    whtRpcInstalled = false
    const rpcProps = viewNamed(viaRpc, 'FinanceDownloadView')
    later('AC11 /finance/download: ≤ 120,000 B (ข้อแก้ของ orchestrator) · มี cells ไม่มี claims · rpc (ตัวจำลอง SQL) กับทางสำรองได้ยอดเท่ากัน · ทางสำรองเตือนครั้งเดียวชื่อไฟล์ SQL', () => {
      assert.ok(download.bytes <= 120_000, `${download.bytes} B (เป้า ≤ 120,000)`)
      assert.ok(!('claims' in downloadProps), 'props ยังมี claims')
      assertClose(downloadTotalsNew(viewNamed(again, 'FinanceDownloadView')), totals, 'download (ทางสำรองครั้งที่สอง)')
      assertClose(downloadTotalsNew(rpcProps), totals, 'download (rpc finance_wht_cells)')
      assert.ok(viaRpc.rpc.includes('finance_wht_cells') && !viaRpc.log.some(l => l.table === 'expense_claims'), 'ทาง rpc ต้องไม่อ่านแถวใบเบิก')
      const sqlWarns = warned.filter(w => w.includes('20261001_finance_speed.sql'))
      assert.equal(sqlWarns.length, 1, `เตือน 20261001_finance_speed.sql ${sqlWarns.length} ครั้ง (ต้อง 1)`)
      return `${download.bytes.toLocaleString()} B (${(downloadProps.cells as Row[]).length} กลุ่ม) · รอบ: ทางสำรอง ${download.rounds} / rpc ${viaRpc.rounds}`
    })
  } else {
    const whtRows = rowsOf(downloadProps, 'claims', 'download')
    // จำนวนกลุ่ม (ผู้เบิก, สถานะ, เดือนไทย) = จำนวน WhtCell ที่หน้าใหม่จะได้ — ไว้ประเมินขนาดหลังเปลี่ยน
    const whtCells = new Set(whtRows.map(c => `${String(c.submitted_by)}|${String(c.status)}|${whtMonth(c)}`)).size
    record('download', download, downloadTotals(downloadProps), { rows: whtRows.length, metrics: { whtCells } })
  }

  // /finance/payouts
  const payouts = await measure(ADMIN, () => PayoutsPage(noParams))
  record('payouts', payouts, payoutsTotals(viewNamed(payouts, 'PayoutDashboard')), { rows: rowsOf(viewNamed(payouts, 'PayoutDashboard'), 'claims', 'payouts').length })

  // /finance/[id] — ใบงานปกติ (แอดมิน) และวงเงินสดย่อยที่เปิดอยู่ (แอดมิน)
  const claimPage = await measure(ADMIN, () => ClaimPage({ params: Promise.resolve({ id: INFO.normalClaim }) }))
  const jobReads = (m: Measured) => ({ jobTableReads: m.log.filter(l => JOB_TABLES.includes(l.table)).length, jobEventsProp: 'jobEvents' in viewNamed(m, 'ClaimDetailView') })
  record('claim', claimPage, claimTotals(claimPage), { metrics: jobReads(claimPage) })
  const fundPage = await measure(ADMIN, () => ClaimPage({ params: Promise.resolve({ id: INFO.fund }) }))
  record('claim-fund', fundPage, claimTotals(fundPage), { metrics: jobReads(fundPage) })
  // getJobEventsForSelect (หน้าจอขอตอนกดแก้ไข): ตรวจตัวตน 1 รอบ + สามแหล่งพร้อมกัน 1 รอบ
  loginAs(ADMIN)
  newRequest()
  resetMeter()
  const jobEventOptions = await (actions.getJobEventsForSelect as unknown as () => Promise<Row[]>)()
  await settle()
  const jobEventRounds = meter.rounds
  later('AC13 /finance/[id]: ≤ 3 รอบ (ใบปกติและวงเงินสดย่อยของแอดมิน) · ไม่อ่านตารางงานตอนเปิดหน้า · ไม่มี prop jobEvents · getJobEventsForSelect = 2 รอบ', () => {
    for (const [name, m] of [['ใบปกติ', claimPage], ['วงเงินสดย่อย', fundPage]] as const) {
      assert.ok(m.rounds <= 3, `${name}: ${m.rounds} รอบ (เป้า ≤ 3)`)
      assert.deepEqual(jobReads(m), { jobTableReads: 0, jobEventsProp: false }, `${name}: อ่านตารางงาน / มี jobEvents`)
    }
    assert.equal(jobEventRounds, 2, `getJobEventsForSelect ${jobEventRounds} รอบ`)
    assert.ok(jobEventOptions.length > 0, 'getJobEventsForSelect ต้องได้รายชื่องาน')
    return `ใบปกติ ${claimPage.rounds} รอบ · วงเงิน ${fundPage.rounds} รอบ · getJobEventsForSelect ${jobEventRounds} รอบ (${jobEventOptions.length} งาน)`
  })

  // /finance/search (มีหลัง BATCH 1 — ต้องมี search-view.tsx ของหน้าจอด้วย) — วัดไว้ดู
  let searchLine = ''
  if (SearchPage) {
    const search = await measure(ADMIN, () => SearchPage({ searchParams: Promise.resolve({ q: 'ที่พัก' }) }))
    searchLine = `/finance/search?q=ที่พัก: ${search.bytes.toLocaleString()} B · ${search.rounds} รอบ`
  } else if (data) {
    searchLine = '/finance/search: ยังไม่มี search-view.tsx (หน้าจอของ BATCH 1 [B]) — ข้ามการวัดหน้า · ตัวค้นหาตรวจในส่วน AC18'
  }

  // ── action: การเขียนพร้อมกัน / อัปโหลด ─────────────────────────────────────────────
  resetDb()
  // v1.43.0: ยื่น/สร้างใบใหม่ถูกกันเมื่อผู้เบิกมีใบค้างเคลียร์ — ชุดนี้วัดการยื่น/สร้างตามปกติ จึงซ่อนใบค้างของ STAFF_TOP ตลอดส่วน action
  const hideOwedTop = () => { for (const r of db.expense_claims.filter(r => r.submitted_by === STAFF_TOP && !r.deleted_at && outstandingKind(r as unknown as Parameters<typeof outstandingKind>[0]))) r.deleted_at = pgTs(FIXED_NOW - DAY) }
  const act = async (name: string, viewer: string, call: () => Promise<Record<string, unknown>>, extra?: (r: ActionRun) => Partial<ActionGolden>) => {
    const r = await runAction(viewer, call)
    const rest: Partial<ActionRun> = { ...r }
    delete rest.raw
    now.actions[name] = { ...(rest as ActionGolden), ...(extra ? extra(r) : {}) }
    return r
  }
  const pendingJob = seedClaim({ status: 'pending' })
  await act('approveClaim', ADMIN, () => actions.approveClaim(pendingJob))
  const toReject = seedClaim({ status: 'pending' })
  await act('rejectClaim', ADMIN, () => actions.rejectClaim(toReject, 'ใบเสร็จไม่ชัด'))
  const approved = seedClaim({ status: 'approved', approved_by: ADMIN, approved_at: pgTs(FIXED_NOW - DAY) })
  await act('markAsPaid', ADMIN, () => actions.markAsPaid(approved))
  const draft = seedClaim({ status: 'draft', submitted_at: null })
  hideOwedTop()
  await act('submitClaim', STAFF_TOP, () => actions.submitClaim(draft))
  hideOwedTop()
  await act('createClaim(intent=submit)', STAFF_TOP, () => actions.createClaim(claimForm([imageFile('ใบเสร็จ.jpg')], 'submit')))
  const advance = seedClaim({
    claim_type: 'advance', job_event_id: null, status: 'paid', amount: 5000, unit_price: 5000, total_amount: 5000, withholding_tax_rate: 0,
    receipt_urls: [], approved_by: ADMIN, approved_at: pgTs(FIXED_NOW - 5 * DAY), paid_by: ADMIN, paid_at: pgTs(FIXED_NOW - 4 * DAY),
  })
  const settleForm = new FormData()
  settleForm.set('actual_spent_amount', '4200')
  settleForm.append('actual_receipt_files', imageFile('ใบเสร็จจริง.jpg'))
  await act('settleAdvanceClaim', STAFF_TOP, () => actions.settleAdvanceClaim(advance, settleForm))
  const waitingTax = seedClaim({ status: 'waiting_tax_invoice', approved_by: ADMIN, approved_at: pgTs(FIXED_NOW - 2 * DAY) })
  const taxForm = new FormData()
  taxForm.append('tax_invoice_files', imageFile('ใบกำกับ.jpg'))
  taxForm.append('tax_invoice_numbers', 'IV2569/00001')
  await act('uploadTaxInvoice', STAFF_TOP, () => actions.uploadTaxInvoice(waitingTax, taxForm))
  const five = () => [1, 2, 3, 4, 5].map(i => imageFile(`ใบเสร็จ-${i}.jpg`))
  hideOwedTop()
  await act('createClaim(5 images)', STAFF_TOP, () => actions.createClaim(claimForm(five(), 'draft')), r => ({
    uploadOptions: meter.uploads.map(u => u.options),
    result: r.raw.error ? `error: ${String(r.raw.error)}` : 'success',
  }))
  failUpload = path => /_1\.jpg$/.test(path)
  hideOwedTop()
  await act('createClaim(5 images, 2nd fails)', STAFF_TOP, () => actions.createClaim(claimForm(five(), 'draft')), () => ({ removed: meter.removes.flat().length }))
  failUpload = null
  // AC16 (ขั้น 3): 5 รูป + รูปย่อที่ส่งคู่มา (receipt_thumbs) — ไม่ใช่ action ของ golden (golden ไม่มีรูปย่อ)
  let thumbRun: ActionRun | null = null
  let thumbUploads: typeof meter.uploads = []
  if (!WRITE) {
    const form = claimForm(five(), 'draft')
    for (const i of [1, 2, 3, 4, 5]) form.append('receipt_thumbs', imageFile(`ใบเสร็จ-${i}-ย่อ.jpg`, 15_000))
    thumbRun = await runAction(STAFF_TOP, () => actions.createClaim(form))
    thumbUploads = [...meter.uploads]
  }
  for (const [name, a] of Object.entries(now.actions)) {
    if (name.includes('2nd fails')) assert.match(a.result, /^error: อัพโหลดไฟล์ไม่สำเร็จ 1 จาก 5 ไฟล์ \(ใบเสร็จ-2\.jpg\) — ยังไม่ได้บันทึก กรุณาลองใหม่$/, name)
    else assert.equal(a.result, 'success', `${name}: ${a.result}`)
  }

  now.meta = {
    writtenFrom: '3248bde (v1.26.0) — page.tsx / actions.ts / lifecycle-actions.ts ก่อนแก้ของขั้น 3',
    now: NOW_ISO,
    seed: 20261001,
    dataset: stats,
    normalClaim: INFO.normalClaim, fund: INFO.fund, staffTop: STAFF_TOP, paidMonth: INFO.paidMonth, topEvent: INFO.topEvent,
  }

  // ── เขียน / เทียบ golden ─────────────────────────────────────────────────────────
  if (WRITE) {
    mkdirSync(dirname(GOLDEN), { recursive: true })
    writeFileSync(GOLDEN, JSON.stringify(now, null, 1) + '\n', 'utf8')
    printTable(now, now)
    console.log(`\nเขียนค่า "ก่อน" ${Object.keys(now.pages).length} หน้า + ${Object.keys(now.actions).length} action → ${GOLDEN}`)
    return
  }

  assert.ok(existsSync(GOLDEN), `ไม่มี ${GOLDEN} — รันด้วย --write-golden กับโค้ดของ 3248bde ก่อน`)
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as Golden
  assertClose(stats, (golden.meta.dataset as Row), 'meta.dataset (ข้อมูลสังเคราะห์ต้องเหมือนตอนเขียน golden)')
  for (const k of ['normalClaim', 'fund', 'staffTop', 'paidMonth', 'topEvent']) assert.equal(now.meta[k], golden.meta[k], `meta.${k}`)
  printTable(golden, now)
  if (searchLine) console.log(`      ${searchLine}`)

  for (const [key, want] of Object.entries(golden.pages)) {
    const got = now.pages[key]
    assert.ok(got, `ไม่มีผลของหน้า ${key}`)
    assertClose(got.totals, want.totals, `pages.${key}.totals`)
    assert.ok(got.beforeBytes <= want.beforeBytes, `pages.${key}: ขนาด ${got.beforeBytes} B มากกว่าก่อน ${want.beforeBytes} B`)
    assert.ok(got.rounds <= want.rounds, `pages.${key}: ${got.rounds} รอบ มากกว่าก่อน ${want.rounds} รอบ`)
  }
  pass(`ยอดอ้างอิงของ ${Object.keys(golden.pages).length} หน้าเท่ากับ golden (2 ตำแหน่ง) · ขนาด props และจำนวนรอบไม่มากกว่าก่อน`)
  for (const [name, want] of Object.entries(golden.actions)) {
    const got = now.actions[name]
    assert.ok(got, `ไม่มีผลของ ${name}`)
    assert.equal(got.result, want.result, `${name}: ผลลัพธ์`)
    assert.ok(got.maxInFlightWrites >= want.maxInFlightWrites, `${name}: เขียนพร้อมกันน้อยลง`)
    assert.ok(got.uploadRounds <= want.uploadRounds, `${name}: รอบอัปโหลดมากขึ้น`)
    assert.equal(got.uploadCalls, want.uploadCalls, `${name}: จำนวนไฟล์ที่อัปโหลด (ไม่มีรูปย่อ = เท่าเดิม)`)
    assert.deepEqual([...got.writes].sort(), [...want.writes].sort(), `${name}: ชุดการเขียนต้องเหมือนเดิม`)
  }
  pass(`${Object.keys(golden.actions).length} action ได้ผลเดิม · เขียนพร้อมกันไม่น้อยกว่าเดิม · รอบอัปโหลดไม่มากกว่าเดิม · จำนวนไฟล์ที่อัปโหลดเท่าเดิม`)

  // ══ เป้าของขั้น 3 (BATCH 1) ═══════════════════════════════════════════════════════
  assert.ok(data, 'ยังไม่มีไฟล์ข้อมูลของขั้น 3 (list-data.ts ฯลฯ) — เป้าของ BATCH 1 ตรวจไม่ได้')

  later('AC21 approve / reject / markAsPaid / submit / createClaim(ยื่นทันที) / settleAdvance / uploadTaxInvoice เขียนประวัติ·activity·แจ้งเตือนพร้อมกัน (≥ 2)', () => {
    const names = ['approveClaim', 'rejectClaim', 'markAsPaid', 'submitClaim', 'createClaim(intent=submit)', 'settleAdvanceClaim', 'uploadTaxInvoice']
    for (const name of names) assert.ok(now.actions[name].maxInFlightWrites >= 2, `${name}: เขียนพร้อมกัน ${now.actions[name].maxInFlightWrites}`)
    return names.map(n => `${n} ${now.actions[n].maxInFlightWrites}`).join(' · ')
  })

  later('AC16 อัปโหลด 5 รูป + รูปย่อ 5 รูป = รอบเดียว 10 ไฟล์ · cacheControl 1 ปี · ไม่ทับ · ไม่มีรูปย่อ = 5 ไฟล์ · ไฟล์ที่ 2 พัง = ข้อความเดิม + ลบที่เหลือ', () => {
    assert.ok(thumbRun, 'ไม่ได้รันกรณีรูปย่อ')
    assert.equal(thumbRun.result, 'success', thumbRun.result)
    assert.equal(thumbRun.uploadRounds, 1, `รอบอัปโหลด ${thumbRun.uploadRounds}`)
    assert.equal(thumbRun.uploadCalls, 10, `จำนวนไฟล์ ${thumbRun.uploadCalls}`)
    assert.equal(thumbUploads.filter(u => u.path.endsWith('_thumb.jpg')).length, 5, 'รูปย่อ 5 ไฟล์ (_thumb.jpg)')
    for (const u of thumbUploads) assert.deepEqual({ cache: (u.options as Row).cacheControl, upsert: (u.options as Row).upsert }, { cache: '31536000', upsert: false }, u.path)
    // รูปย่ออยู่ข้างไฟล์เดิม: claims/<เลขที่>/<เวลา>_<i>_thumb.jpg
    const originals = thumbUploads.filter(u => !u.path.endsWith('_thumb.jpg')).map(u => u.path.replace(/\.[^./]+$/, '_thumb.jpg')).sort()
    assert.deepEqual(thumbUploads.filter(u => u.path.endsWith('_thumb.jpg')).map(u => u.path).sort(), originals, 'path ของรูปย่อ = path เดิม + _thumb.jpg')
    const plain = now.actions['createClaim(5 images)']
    assert.equal(plain.uploadCalls, 5)
    assert.equal(plain.uploadRounds, 1, `ไม่มีรูปย่อ: รอบอัปโหลด ${plain.uploadRounds}`)
    assert.ok((plain.uploadOptions as Row[]).every(o => o.cacheControl === '31536000' && o.upsert === false), 'ไม่มีรูปย่อ: ตัวเลือกอัปโหลด')
    assert.equal(now.actions['createClaim(5 images, 2nd fails)'].removed, 4, 'ไฟล์ที่ 2 พัง: ลบอีก 4 ไฟล์')
    return `รูปย่อ: ${thumbRun.uploadCalls} ไฟล์ / ${thumbRun.uploadRounds} รอบ · ไม่มีรูปย่อ: ${plain.uploadCalls} ไฟล์ / ${plain.uploadRounds} รอบ`
  })

  // ทุกข้อรันจนจบแม้ข้อก่อนหน้าไม่ผ่าน — เห็นตัวเลขของทุกเป้าในรอบเดียว · มีข้อไม่ผ่าน = จบด้วย exit 1
  const failed: string[] = []
  const attempt = async (label: string, run: () => string | void | Promise<string | void>) => {
    try {
      const note = await run()
      pass(`${label}${note ? ` — ${note}` : ''}`)
    } catch (e) {
      failed.push(label)
      console.log(`FAIL  ${label}\n      ${(e as Error).message.split('\n')[0]}`)
    }
  }
  for (const c of laterChecks) await attempt(c.label, () => c.run(golden))
  await attempt('AC18 ค้นหา (search-data.ts)', () => searchSection(data))
  await attempt('AC26 ตรวจผู้ใช้ก่อนอ่าน / ไม่ใช่ endpoint / หน้าจอไม่ import ค่า', () => authSection(data))
  await attempt('ทางสำรองเมื่อยังไม่รัน SQL ของขั้น 4 / เข้าแฟ้ม', () => fallbackSection(data))
  if (failed.length > 0) {
    console.log(`\nfinance-speed-baseline: ไม่ผ่าน ${failed.length} ข้อ — ${failed.join(' | ')}`)
    process.exit(1)
  }

  console.log('\nfinance-speed-baseline: ผ่านทั้งหมด')
}

// ══ AC18: ค้นหา (search-data.ts) ═════════════════════════════════════════════════════
async function searchSection(d: DataModules): Promise<string> {
  resetDb()
  // ใบ/คน/งานที่มีคำว่า "ทดสอบ" (ข้อมูลสังเคราะห์ไม่มีคำนี้เลย) — ครอบคลุมหลายสถานะ หลายเดือน และทั้งสี่ทางที่ค้นได้
  const SEARCHER = uid(190)
  db.profiles.push({ ...person(SEARCHER, 60, 'staff'), full_name: 'ผู้ทดสอบ ระบบค้นหา' })
  const EVT = uid(5990)
  db.job_cost_events.push({ id: EVT, event_name: 'งานทดสอบระบบค้นหา ครั้งพิเศษ', event_date: '2026-08-20', event_location: 'ออฟฟิศ', status: 'completed', source_event_id: null, linked_lead_id: null, created_at: pgTs(RealDate.UTC(2026, 7, 1)) })
  let n = 0
  const plant = (over: Row) => {
    const at = RealDate.parse(`${String(over.expense_date)}T03:00:00Z`) + (++n) * 1000
    return seedClaim({ status: 'paid', job_event_id: null, claim_type: 'other', created_at: pgTs(at), submitted_at: pgTs(at), ...over })
  }
  const want = {
    t1: plant({ title: 'ค่าอุปกรณ์ทดสอบเสียง', submitted_by: STAFF_TOP, expense_date: '2026-07-10' }),
    t2: plant({ title: 'ทดสอบระบบไฟหน้างาน', status: 'draft', submitted_by: SUBMITTERS[3], expense_date: '2026-09-15' }),
    t3: plant({ title: 'ค่าเช่าชุดทดสอบ', status: 'cancelled', submitted_by: SUBMITTERS[4], expense_date: '2026-05-02' }),
    s1: plant({ title: 'ค่าเดินทางไปพบลูกค้า', submitted_by: SEARCHER, expense_date: '2026-08-03' }),
    s2: plant({ title: 'ค่าอาหารทีมงาน', status: 'pending', submitted_by: SEARCHER, expense_date: '2026-09-20' }),
    s3: plant({ title: 'ค่าที่จอดรถ', status: 'rejected', submitted_by: SEARCHER, expense_date: '2026-06-11' }),
    e1: plant({ title: 'ค่าป้ายหน้างาน', claim_type: 'event', job_event_id: EVT, submitted_by: SUBMITTERS[5], expense_date: '2026-08-20' }),
    e2: plant({ title: 'ค่าน้ำแข็ง', claim_type: 'event', job_event_id: EVT, status: 'approved', submitted_by: STAFF_TOP, expense_date: '2026-08-21' }),
  }
  const hidden = plant({ title: 'ทดสอบ ใบที่ซ่อน', submitted_by: STAFF_TOP, expense_date: '2026-09-01', deleted_at: pgTs(FIXED_NOW - DAY) })
  const lit = {
    pct: plant({ title: 'ส่วนลด 100% พิเศษ', submitted_by: SUBMITTERS[6], expense_date: '2026-09-02' }),
    pctDecoy: plant({ title: 'ค่าบริการ 1000 บาท', submitted_by: SUBMITTERS[6], expense_date: '2026-09-03' }),
    under: plant({ title: 'รหัส a_b', submitted_by: SUBMITTERS[6], expense_date: '2026-09-04' }),
    underDecoy: plant({ title: 'รหัส axb', submitted_by: SUBMITTERS[6], expense_date: '2026-09-05' }),
    star: plant({ title: 'ขนาด x*y', submitted_by: SUBMITTERS[6], expense_date: '2026-09-06' }),
    starDecoy: plant({ title: 'ขนาด xLONGy', submitted_by: SUBMITTERS[6], expense_date: '2026-09-07' }),
  }
  const admin = { userId: ADMIN, role: 'admin', isAdmin: true }
  const staffViewer = { userId: STAFF_TOP, role: 'staff', isAdmin: false }
  /** เรียกเป็นคำขอใหม่ของผู้ใช้ — ตรวจตัวตนก่อน (cache) แล้วนับรอบเฉพาะของ searchClaims */
  const run = async (q: string, viewer: typeof admin) => {
    loginAs(viewer.userId)
    newRequest()
    await d.list.authorizeViewer(viewer)
    await settle()
    resetMeter()
    const res = await d.search.searchClaims(q, viewer)
    await settle()
    return { ...res, rounds: meter.rounds, reads: meter.log.length }
  }
  const idsOf = (hits: { id: string }[]) => hits.map(h => h.id).sort()
  const sortedNewest = (hits: { id: string; created_at: string }[]) =>
    hits.every((h, i) => i === 0 || d.list.newestFirst(hits[i - 1], h) < 0)

  // ทั้งสี่ทาง หลายสถานะ หลายเดือน · ใบที่ซ่อนไม่ออก
  const all = await run('ทดสอบ', admin)
  assert.equal(all.error, undefined)
  assert.deepEqual(idsOf(all.hits), Object.values(want).sort(), `"ทดสอบ" (แอดมิน) ต้องได้ 8 ใบ: เลขที่/หัวข้อ/ชื่อผู้เบิก/ชื่องาน`)
  assert.ok(!all.hits.some(h => h.id === hidden), 'ใบที่ซ่อนต้องไม่ออก')
  assert.equal(all.truncated, false)
  assert.ok(sortedNewest(all.hits), 'เรียง created_at ใหม่ → เก่า ต่อด้วย id')
  assert.ok(all.rounds <= 2, `"ทดสอบ": ${all.rounds} รอบ (เป้า ≤ 2)`)
  const statuses = new Set<string>(all.hits.map(h => h.status))
  const months = new Set(all.hits.map(h => String(h.expense_date).slice(0, 7)))
  assert.ok(['paid', 'draft', 'cancelled'].every(s => statuses.has(s)) && months.size >= 4, 'ต้องครอบคลุมหลายสถานะและหลายเดือน')
  const avg = Math.round(bytesOf(all.hits) / all.hits.length)
  // พนักงานได้เฉพาะของตัวเอง
  const mine = await run('ทดสอบ', staffViewer)
  assert.deepEqual(idsOf(mine.hits), [want.t1, want.e2].sort(), 'พนักงานได้เฉพาะใบของตัวเอง (หัวข้อ + งาน)')
  // เลขที่ตัวพิมพ์เล็ก = ตัวพิมพ์ใหญ่
  const byNumber = await run('exp-202608-01', admin)
  const numberWant = db.expense_claims.filter(c => !c.deleted_at && String(c.claim_number).toLowerCase().includes('exp-202608-01')).map(c => String(c.id)).sort()
  assert.ok(numberWant.length >= 5)
  assert.deepEqual(idsOf(byNumber.hits), numberWant, 'ค้นเลขที่แบบตัวพิมพ์เล็กต้องเจอ EXP-202608-01x')
  // ตัวอักษรพิเศษเป็นตัวอักษรธรรมดา: % _ และ * (* ไม่ครอบทุกอย่าง)
  assert.deepEqual(idsOf((await run('100%', admin)).hits), [lit.pct], '"100%" ต้องตรงแค่ % จริง')
  assert.deepEqual(idsOf((await run('a_b', admin)).hits), [lit.under], '"a_b" ต้องตรงแค่ _ จริง')
  assert.deepEqual(idsOf((await run('x*y', admin)).hits), [lit.star], '"x*y" ต้องไม่ครอบ "xLONGy"')
  void lit.pctDecoy; void lit.underDecoy; void lit.starDecoy
  // เกิน 100 ใบ → 100 ใบแรก (ใหม่สุด) + truncated
  const many = await run('ค่า', admin)
  const names = new Map(db.profiles.map(p => [String(p.id), String(p.full_name)]))
  const events = new Map(db.job_cost_events.map(e => [String(e.id), String(e.event_name)]))
  const manyWant = db.expense_claims
    .filter(c => !c.deleted_at && [c.claim_number, c.title, names.get(String(c.submitted_by)), events.get(String(c.job_event_id))].some(t => String(t ?? '').includes('ค่า')))
    .map(c => ({ id: String(c.id), created_at: String(c.created_at) }))
    .sort(d.list.newestFirst)
  assert.ok(manyWant.length > 100)
  assert.equal(many.hits.length, 100)
  assert.equal(many.truncated, true)
  assert.deepEqual(many.hits.map(h => h.id), manyWant.slice(0, 100).map(h => h.id), '100 ใบแรกต้องเป็นใบใหม่สุดของทุกใบที่ตรง')
  assert.ok(many.rounds <= 2, `"ค่า": ${many.rounds} รอบ`)
  // คำค้นว่าง/ช่องว่าง → ไม่แตะฐานข้อมูล
  for (const q of ['', '   ']) {
    const empty = await run(q, admin)
    assert.deepEqual({ hits: empty.hits, truncated: empty.truncated }, { hits: [], truncated: false })
    assert.equal(empty.reads, 0, 'คำค้นว่างต้องไม่อ่านฐานข้อมูล')
  }
  // ขนาดท้ายสุด — ข้ออื่นของการค้นหาผ่านหมดแล้วถ้ามาถึงตรงนี้
  assert.ok(avg <= 600, `เฉลี่ย ${avg} B/ใบ (เป้า ≤ 600 — ข้อแก้ 2) — ข้ออื่นของการค้นหาผ่านทั้งหมด (4 ทาง · พนักงาน · ตัวพิมพ์ · % _ * · truncated · ≤ 2 รอบ · คำค้นว่าง)`)
  return `AC18 ค้นหา: "ทดสอบ" 8 ใบ (เลขที่/หัวข้อ/ผู้เบิก/งาน · ${[...statuses].join('/')} · ${months.size} เดือน · ไม่มีใบที่ซ่อน) ${all.rounds} รอบ เฉลี่ย ${avg} B/ใบ · พนักงานได้ของตัวเอง · ตัวพิมพ์เล็ก/ใหญ่ · % _ * เป็นตัวอักษร · "ค่า" ${manyWant.length} ใบ → 100 ใบใหม่สุด + truncated · คำค้นว่างไม่อ่านฐานข้อมูล`
}

// ══ AC26: ตรวจผู้ใช้ก่อนอ่าน · ไฟล์ข้อมูลไม่ใช่ endpoint · หน้าจอไม่ import ค่าจากไฟล์ข้อมูล ══════════════════
async function authSection(d: DataModules): Promise<string> {
  resetDb()
  const forgedAdmin = { userId: ADMIN, role: 'admin', isAdmin: true }
  const staffOwn = { userId: STAFF_TOP, role: 'staff', isAdmin: false }
  const calls: [string, (v: typeof forgedAdmin) => Promise<unknown>, (r: unknown) => boolean][] = [
    ['getStaffOpenClaims', v => d.list.getStaffOpenClaims(v), r => !!(r as { error?: string }).error],
    ['getPaidClaimsLean', v => d.list.getPaidClaimsLean(v, '2026-09'), r => !!(r as { error?: string }).error],
    ['getArchivePage', v => d.archive.getArchivePage(v, d.archive.parseArchiveQuery({})), r => (r as { data: unknown }).data === null],
    ['searchClaims', v => d.search.searchClaims('ค่า', v), r => !!(r as { error?: string }).error],
    ['getOverviewRows', v => d.report.getOverviewRows(v, { preset: 'all', from: '', to: '' }), r => !!(r as { error?: string }).error],
    ['getWhtCells', v => d.report.getWhtCells(v), r => !!(r as { error?: string }).error],
    ['getWhtPeople', v => d.report.getWhtPeople(v, [{ submitted_by: STAFF_TOP } as never]), r => !!(r as { error?: string }).error],
    ['loadClaimPage', v => d.claimPage.loadClaimPage(INFO.normalClaim, v), r => r === null],
    ['textSearchIds', v => d.search.textSearchIds(fakeClient as never, 'ค่า', v), r => !!(r as { error?: string }).error],
    ['readTextMatches', v => d.search.readTextMatches(fakeClient as never, v, {}, () => 'id, created_at', 'ค่า'), r => !!(r as { error?: string }).error],
  ]
  const claimReads = () => meter.log.filter(l => l.table === 'expense_claims' || l.table === 'profiles' && /national_id/.test(l.cols)).length
  for (const [who, session, viewer] of [['ไม่ล็อกอิน + viewer แอดมินปลอม', null, forgedAdmin], ['พนักงาน + viewer แอดมินปลอม', STAFF_TOP, forgedAdmin]] as const) {
    for (const [name, call, refused] of calls) {
      loginAs(session)
      newRequest()
      resetMeter()
      const res = await quietly(() => call(viewer))
      await settle()
      assert.ok(refused(res), `${who}: ${name} ต้องปฏิเสธ (ได้ ${JSON.stringify(res).slice(0, 120)})`)
      assert.equal(claimReads(), 0, `${who}: ${name} อ่านใบเบิก/ข้อมูลส่วนตัว`)
    }
  }
  // พนักงานตัวจริง: หัก ณ ที่จ่าย (ของทุกคน) ไม่ได้ · ไม่อ่านอะไร
  for (const name of ['getWhtCells', 'getWhtPeople']) {
    const [, call, refused] = calls.find(c => c[0] === name) as (typeof calls)[number]
    loginAs(STAFF_TOP)
    newRequest()
    resetMeter()
    const res = await quietly(() => call(staffOwn as never))
    await settle()
    assert.ok(refused(res) && claimReads() === 0, `พนักงาน: ${name} ต้องปฏิเสธโดยไม่อ่าน`)
  }
  // หน้าไม่ล็อกอิน → /login ก่อนอ่านใบเบิก
  const pages: [string, () => Promise<unknown>][] = [
    ['/finance', () => FinancePage({ searchParams: Promise.resolve({}) })],
    ['/finance/archive', () => ArchivePage({ searchParams: Promise.resolve({}) })],
    ['/finance/overview', () => OverviewPage({ searchParams: Promise.resolve({}) })],
    ['/finance/download', () => DownloadPage({ searchParams: Promise.resolve({}) })],
    ['/finance/[id]', () => ClaimPage({ params: Promise.resolve({ id: INFO.normalClaim }) })],
    ...(SearchPage ? [['/finance/search', () => (SearchPage as PageFn)({ searchParams: Promise.resolve({ q: 'ค่า' }) })] as [string, () => Promise<unknown>]] : []),
  ]
  for (const [name, call] of pages) {
    loginAs(null)
    newRequest()
    resetMeter()
    const digest = await call().then(() => 'ไม่ redirect', (e: { digest?: string }) => String(e?.digest ?? e))
    await settle()
    assert.match(digest, /^NEXT_REDIRECT;[^;]*;\/login;/, `${name}: ไม่ล็อกอินต้อง redirect ไป /login`)
    assert.equal(claimReads(), 0, `${name}: อ่านใบเบิกก่อน redirect`)
  }
  // ไฟล์ข้อมูลไม่ใช่ endpoint ('use server') และไม่มีหน้าจอ ('use client') import ค่าจากไฟล์เหล่านี้ (import type ได้)
  const DATA_FILES = ['list-data', 'archive-data', 'search-data', 'report-data', 'claim-page-data']
  for (const f of DATA_FILES) {
    const src = readFileSync(join(FINANCE, `${f}.ts`), 'utf8')
    assert.ok(!/^\s*['"]use server['"]/m.test(src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')), `${f}.ts ต้องไม่มี 'use server'`)
  }
  const clientImports: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(name)) {
        const src = readFileSync(full, 'utf8')
        if (!/^\s*['"]use client['"]/.test(src)) continue
        const re = /^import\s+(?!type\b)[^;]*?from\s+['"]([^'"]+)['"]/gm
        for (const m of src.matchAll(re)) if (DATA_FILES.some(f => m[1].endsWith(`/${f}`) || m[1] === `./${f}` || m[1] === `../${f}`)) clientImports.push(`${full}: ${m[1]}`)
      }
    }
  }
  walk(join(ROOT, 'app'))
  walk(join(ROOT, 'components'))
  assert.deepEqual(clientImports, [], 'หน้าจอ (use client) import ค่าจากไฟล์ข้อมูล')
  return `AC26 ไฟล์ข้อมูล ${calls.length} ฟังก์ชัน: ไม่ล็อกอิน / พนักงานส่ง viewer แอดมินปลอม → ปฏิเสธ อ่านใบเบิก 0 ครั้ง · หัก ณ ที่จ่ายของพนักงานถูกปฏิเสธ · ${pages.length} หน้าไม่ล็อกอิน → /login ก่อนอ่าน · ไม่มี 'use server' · ไม่มีหน้าจอ import ค่า`
}

// ══ ฐานข้อมูลที่ยังไม่รัน SQL ของขั้น 4 / เข้าแฟ้ม — ต้องทำงานได้ (รันท้ายสุด: ธงของ process เปลี่ยนถาวร) ════════════
async function fallbackSection(d: DataModules): Promise<string> {
  resetDb()
  const admin = { userId: ADMIN, role: 'admin', isAdmin: true }
  const staffViewer = { userId: STAFF_TOP, role: 'staff', isAdmin: false }
  const call = async <T>(viewer: typeof admin, run: () => Promise<T>) => {
    loginAs(viewer.userId)
    newRequest()
    const res = await run()
    await settle()
    return res
  }
  const warned: string[] = []
  dropped.add('expense_claims.deleted_at')
  const got = await capturingWarn(warned, async () => ({
    staff: await call(staffViewer, () => d.list.getStaffOpenClaims(staffViewer)),
    archive: await call(admin, () => d.archive.getArchivePage(admin, d.archive.parseArchiveQuery({}))),
    search: await call(admin, () => d.search.searchClaims('ค่า', admin)),
    download: await call(admin, () => d.report.getWhtCells(admin)),
    overview: await call(admin, () => d.report.getOverviewRows(admin, { preset: 'month', from: '2026-09-01', to: '2026-09-30' })),
  }))
  assert.ok(!got.staff.error && got.staff.data.length > 0, `รายการพนักงาน: ${got.staff.error}`)
  assert.ok(got.archive.data && got.archive.data.rows.length === 50, `คลังเก็บ: ${got.archive.error}`)
  assert.ok(!got.search.error && got.search.hits.length > 0, `ค้นหา: ${got.search.error}`)
  assert.ok(!got.download.error && got.download.data.length > 0, `หัก ณ ที่จ่าย: ${got.download.error}`)
  assert.ok(!got.overview.error && got.overview.data.length > 0, `รายงาน: ${got.overview.error}`)
  const hiddenWarns = warned.filter(w => w.includes('20260930_claim_hide_status_time.sql'))
  assert.equal(hiddenWarns.length, 1, `เตือน 20260930_claim_hide_status_time.sql ${hiddenWarns.length} ครั้ง (ต้อง 1)`)
  assert.ok(!warned.some(w => /42703/.test(w)), 'ไม่มี 42703 หลุด')

  dropped.add('expense_claims.filed_at')
  dropped.add('expense_claims.filed_file_count')
  const filedWarned: string[] = []
  const lean = await capturingWarn(filedWarned, () => call(staffViewer, () => d.list.getStaffOpenClaims(staffViewer)))
  assert.ok(!lean.error && lean.data.length > 0 && lean.data.every(r => r.filed_at === null && r.filed_file_count === null), `รายการพนักงานไม่มีคอลัมน์เข้าแฟ้ม: ${lean.error}`)
  assert.equal(filedWarned.filter(w => w.includes('20260929_claim_filed.sql')).length, 1, 'เตือน 20260929_claim_filed.sql ครั้งเดียว')
  dropped.clear()
  return `ยังไม่มีคอลัมน์ deleted_at: รายการพนักงาน ${got.staff.data.length} ใบ · คลังเก็บ ${got.archive.data?.total} ใบ · ค้นหา ${got.search.hits.length} ใบ · หัก ณ ที่จ่าย ${got.download.data.length} กลุ่ม · รายงาน ${got.overview.data.length} ใบ — เตือนครั้งเดียว · ยังไม่มีคอลัมน์เข้าแฟ้ม: รายการยังโหลดได้ (ทุกใบยังไม่เข้าแฟ้ม) เตือนครั้งเดียว`
}

function printTable(before: Golden, current: Golden) {
  const pad = (s: string, n: number) => s + ' '.repeat(Math.max(0, n - [...s].length))
  const kb = (n: number) => `${n.toLocaleString()} B`
  console.log(`\n      ${pad('หน้า', 22)}${pad('ก่อน (golden)', 26)}${pad('ตอนนี้', 26)}${pad('รอบ ก่อน→ตอนนี้', 18)}เป้าของขั้น 3`)
  for (const [key, g] of Object.entries(before.pages)) {
    const n = current.pages[key]
    const perRow = (p: PageGolden) => (p.bytesPerRow ? ` (${p.bytesPerRow.toLocaleString()} B/แถว)` : '')
    console.log(`      ${pad(key, 22)}${pad(kb(g.beforeBytes) + perRow(g), 26)}${pad(n ? kb(n.beforeBytes) + perRow(n) : '—', 26)}${pad(`${g.rounds} → ${n?.rounds ?? '—'}`, 18)}${TARGETS[key] ?? ''}`)
  }
  console.log(`\n      ${pad('action', 34)}${pad('เขียนพร้อมกัน ก่อน→ตอนนี้', 28)}${pad('อัปโหลด ครั้ง/รอบ', 22)}รอบรวม`)
  for (const [name, g] of Object.entries(before.actions)) {
    const n = current.actions[name]
    console.log(`      ${pad(name, 34)}${pad(`${g.maxInFlightWrites} → ${n?.maxInFlightWrites ?? '—'}`, 28)}${pad(`${n?.uploadCalls ?? '—'}/${n?.uploadRounds ?? '—'} (ก่อน ${g.uploadCalls}/${g.uploadRounds})`, 22)}${g.rounds} → ${n?.rounds ?? '—'}`)
  }
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
