// หน้าใบเบิก (/api/pdf/payment-voucher) — จับข้อมูลที่ส่งเข้า renderToBuffer ของ route ตัวจริง แล้วเทียบกับผลอ้างอิง
// Run:  npx tsx scripts/claim-voucher.check.ts                 (เทียบกับ scripts/fixtures/claim-voucher.golden.json)
//       npx tsx scripts/claim-voucher.check.ts --write-golden  (เก็บผลอ้างอิงใหม่ — ทำครั้งเดียวจาก route ก่อนย้ายตรรกะ)
//
// ผลอ้างอิงเก็บจาก route "ก่อน" ย้ายตรรกะไป lib/claim-voucher.ts — หลังย้ายต้องได้ข้อมูลเท่าเดิมทุกกรณี (AC1)
// เก็บใหม่หลังแก้ D2 ของ docs/specs/finance-refactor-plan.md (ยอดรวม = amount ไม่คูณจำนวนซ้ำ — กรณี (a) จำนวน 2 เปลี่ยน)
// ชี้ไปไฟล์อื่นได้ด้วย VOUCHER_ROUTE_MODULE=<path จาก repo root> (เช่นสำเนา route ต้นฉบับ) เพื่อยืนยันว่าผลอ้างอิงมาจากตัวเดิมจริง
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง: แทน next/headers, @/lib/supabase-server, @/lib/logger, fetch และ renderToBuffer
// ด้วยตัวจำลอง (เทคนิคเดียวกับ scripts/ticket-attachments.check.ts) · คนและบัญชีทั้งหมดสังเคราะห์
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-voucher: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module, { createRequire } from 'node:module'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'

process.env.SESSION_SECRET = 'claim-voucher-check'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'

const ROOT = join(__dirname, '..')
const GOLDEN = join(ROOT, 'scripts', 'fixtures', 'claim-voucher.golden.json')
const WRITE = process.argv.includes('--write-golden')
const ROUTE = process.env.VOUCHER_ROUTE_MODULE || 'app/api/pdf/payment-voucher/route.ts'

// ── คนและใบเบิก (สังเคราะห์) ─────────────────────────────────────────────────
type Row = Record<string, unknown>
type Result = { data: unknown; error: { code: string; message: string } | null }

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF_A = uid(2), STAFF_B = uid(3)
const CLAIM_NORMAL = uid(101), CLAIM_ADVANCE = uid(102), CLAIM_FUND = uid(103), CLAIM_NO_BANK = uid(104), CLAIM_RENDER_FAIL = uid(105)

const STORAGE = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/receipts`
const SLIP_JPG = `${STORAGE}/refund-slips/1758300000000_slip01.jpg`
const SLIP_PNG = `${STORAGE}/refund-slips/1758300000001_slip02.png`
const SLIP_PDF = `${STORAGE}/refund-slips/1758300000002_slip03.pdf`
const FUND_SLIP = `${STORAGE}/refund-slips/1758300000003_fund01.png`

// เนื้อไฟล์จิ๋ว — หัวไฟล์ถูกชนิด (ตัวดึงไฟล์รุ่นใหม่ดูชนิดจากหัวไฟล์) ไม่ต้องเป็นรูปเต็ม เพราะ renderToBuffer ถูกแทน
const JPEG_BYTES = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9])
const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52])
const remoteFiles = new Map<string, { bytes: Uint8Array; type: string }>([
  [SLIP_JPG, { bytes: JPEG_BYTES, type: 'image/jpeg' }],
  [SLIP_PNG, { bytes: PNG_BYTES, type: 'image/png' }],
  [SLIP_PDF, { bytes: new TextEncoder().encode('%PDF-1.4\n%%EOF'), type: 'application/pdf' }],
  [FUND_SLIP, { bytes: PNG_BYTES, type: 'image/png' }],
])

const person = (id: string, role: string, full_name: string): Row =>
  ({ id, role, full_name, nickname: null, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

const BASE_CLAIM: Row = {
  claim_type: 'other', status: 'pending', quantity: 1, vat_mode: 'none', withholding_tax_rate: 0,
  title: null, description: null, expense_date: null, created_at: '2026-09-10T02:00:00Z',
  bank_name: null, bank_account_number: null, account_holder_name: null,
  approved_by: null, actual_spent_items: null, actual_spent_amount: null, refund_amount: null,
  refund_slip_urls: [], refund_confirmed_at: null, advance_settled_at: null,
  pettycash_fund_id: null, pettycash_period_start: null, pettycash_period_end: null, pettycash_closed_at: null,
  receipt_urls: [], actual_receipt_urls: [], tax_invoice_urls: [], tax_invoice_numbers: [],
}
const claim = (over: Row): Row => ({ ...BASE_CLAIM, ...over })

const db: Record<string, Row[]> = {
  profiles: [
    person(ADMIN, 'admin', 'แอดมิน ทดสอบ'),
    person(STAFF_A, 'staff', 'พนักงาน ทดสอบหนึ่ง'),
    person(STAFF_B, 'staff', 'พนักงาน ทดสอบสอง'),
  ],
  expense_claims: [
    // (a) ใบปกติ VAT แยก + หัก ณ ที่จ่าย 3% + มีบัญชีธนาคาร
    claim({
      id: CLAIM_NORMAL, claim_number: 'EXP-202609-101', claim_type: 'event', status: 'paid', submitted_by: STAFF_A,
      approved_by: ADMIN, title: 'ค่าเช่าเครื่องเสียง', description: 'งานทดสอบ ห้องประชุมใหญ่',
      amount: 1250.5, quantity: 2, vat_mode: 'excluded', withholding_tax_rate: 3, expense_date: '2026-09-15',
      bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-00000-0', account_holder_name: 'พนักงาน ทดสอบหนึ่ง',
    }),
    // (b) เงินทดลองจ่าย เคลียร์แล้ว มีรายการใช้จริง ยอดคืน และสลิปคืนเงินรูป 2 ไฟล์ (+ PDF ที่หน้าใบเบิกข้าม)
    claim({
      id: CLAIM_ADVANCE, claim_number: 'EXP-202609-102', claim_type: 'advance', status: 'refund_confirmed', submitted_by: STAFF_A,
      approved_by: ADMIN, title: 'ทดลองจ่ายค่าดอกไม้', description: null,
      amount: 5000, quantity: 1, expense_date: '2026-09-12',
      actual_spent_items: [{ description: 'ดอกไม้หน้างาน', amount: 1200 }, { description: '', amount: 800.5 }, { amount: '300' }],
      actual_spent_amount: 2300.5, refund_amount: 2699.5,
      refund_slip_urls: [SLIP_JPG, SLIP_PNG, SLIP_PDF],
      refund_confirmed_at: '2026-09-20T18:30:00Z', advance_settled_at: '2026-09-19T03:00:00Z',
      bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-00000-0', account_holder_name: 'พนักงาน ทดสอบหนึ่ง',
    }),
    // (c) วงเงินสดย่อยประจำเดือน + รายการลูก (ค่าใช้จ่าย 2, เติมเงิน 1, ยกเลิก 1) + สลิปคืนเงินสิ้นเดือน
    claim({
      id: CLAIM_FUND, claim_number: 'EXP-202609-103', claim_type: 'petty_cash', status: 'paid', submitted_by: STAFF_B,
      approved_by: ADMIN, title: 'เงินสดย่อยสำรอง Office กันยายน', amount: 10000, quantity: 1, expense_date: '2026-09-01',
      pettycash_period_start: '2026-09-01', pettycash_period_end: '2026-09-30', pettycash_closed_at: '2026-09-30T10:00:00Z',
      refund_amount: 1000, refund_slip_urls: [FUND_SLIP],
      bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-00000-0', account_holder_name: 'พนักงาน ทดสอบสอง',
    }),
    claim({ id: uid(201), claim_number: 'EXP-202609-111', claim_type: 'other', status: 'paid', submitted_by: STAFF_B, pettycash_fund_id: CLAIM_FUND, title: 'ค่ากาแฟ', amount: 350.25, expense_date: '2026-09-05' }),
    claim({ id: uid(202), claim_number: 'EXP-202609-112', claim_type: 'petty_cash', status: 'paid', submitted_by: STAFF_B, pettycash_fund_id: CLAIM_FUND, title: 'เติมเงินกล่อง', amount: 3000, expense_date: '2026-09-10' }),
    claim({ id: uid(203), claim_number: 'EXP-202609-113', claim_type: 'advance', status: 'refund_confirmed', submitted_by: STAFF_A, pettycash_fund_id: CLAIM_FUND, title: 'ทดลองจ่ายจากกล่อง', amount: 1000, refund_amount: 250, expense_date: '2026-09-08' }),
    claim({ id: uid(204), claim_number: 'EXP-202609-114', claim_type: 'other', status: 'cancelled', submitted_by: STAFF_B, pettycash_fund_id: CLAIM_FUND, title: 'ใบที่ยกเลิก', amount: 999, expense_date: '2026-09-03' }),
    claim({ id: uid(205), claim_number: 'EXP-202609-115', claim_type: 'other', status: 'paid', submitted_by: STAFF_B, pettycash_fund_id: CLAIM_FUND, title: null, amount: 120, expense_date: '2026-09-02' }),
    // (d) ไม่มีบัญชีธนาคาร (จ่ายเงินสด) — ชื่อผู้รับมาจากผู้ส่งใบ, VAT รวมใน ไม่มีผู้อนุมัติ
    claim({
      id: CLAIM_NO_BANK, claim_number: 'EXP-202609-104', claim_type: 'other', status: 'approved', submitted_by: STAFF_B,
      title: 'ของใช้ส่วนกลาง', description: null, amount: 535, quantity: 1, vat_mode: 'included',
      expense_date: null, created_at: '2026-09-21T20:15:00Z',
    }),
    // render พัง → 500
    claim({ id: CLAIM_RENDER_FAIL, claim_number: 'EXP-202609-105', submitted_by: STAFF_A, title: 'เรนเดอร์พัง', amount: 1 }),
  ],
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// ── ฐานข้อมูลจำลอง: select (รวม embed profiles!fk) → eq/in → order → single ──────────────
/** แยก select ตามจุลภาคชั้นนอก (ในวงเล็บของ embed มีจุลภาค) */
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
function project(table: string, row: Row, cols: string): Row {
  const out: Row = {}
  for (const part of splitTop(cols)) {
    if (part === '*') { Object.assign(out, row); continue }
    const embed = /^(\w+):(\w+)!(\w+)\(([\s\S]*)\)$/.exec(part)
    if (embed) {
      const [, alias, other, fk, inner] = embed
      const col = new RegExp(`^${table}_(\\w+)_fkey$`).exec(fk)?.[1]
      assert.ok(col, `fk ไม่รู้จัก: ${fk}`)
      const hit = (db[other] ?? []).find(r => r.id === row[col])
      out[alias] = hit ? project(other, hit, inner) : null
      continue
    }
    assert.ok(part in row || table !== 'expense_claims', `คอลัมน์ไม่รู้จัก ${table}.${part}`)
    out[part] = row[part] ?? null
  }
  return out
}

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = []
  private cols = '*'
  private sort: { col: string; asc: boolean } | null = null
  private one = false
  constructor(private table: string) {}

  select(cols = '*') { this.cols = cols; return this }
  eq(c: string, v: unknown) { this.filters.push(r => r[c] === v); return this }
  in(c: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[c])); return this }
  order(col: string, opts?: { ascending?: boolean }) { this.sort = { col, asc: opts?.ascending !== false }; return this }
  single() { this.one = true; return this }

  private run(): Result {
    let hits = (db[this.table] ?? []).filter(r => this.filters.every(f => f(r)))
    if (this.sort) {
      const { col, asc } = this.sort
      // Postgres: ค่า null อยู่ท้ายเมื่อเรียงน้อยไปมาก
      hits = [...hits].sort((a, b) => {
        const x = a[col], y = b[col]
        if (x == null || y == null) return x == null && y == null ? 0 : x == null ? 1 : -1
        return (String(x) < String(y) ? -1 : String(x) > String(y) ? 1 : 0) * (asc ? 1 : -1)
      })
    }
    const rows = hits.map(r => project(this.table, r, this.cols))
    if (!this.one) return { data: clone(rows), error: null }
    if (rows.length === 1) return { data: clone(rows[0]), error: null }
    return { data: null, error: { code: 'PGRST116', message: `expected one row, got ${rows.length}` } }
  }

  then<X = Result, Y = never>(
    onfulfilled?: ((value: Result) => X | PromiseLike<X>) | null,
    onrejected?: ((reason: unknown) => Y | PromiseLike<Y>) | null
  ): PromiseLike<X | Y> {
    return Promise.resolve().then(() => this.run()).then(onfulfilled, onrejected)
  }
}
const fakeClient = { from: (table: string) => new Query(table) }

// ── fetch จำลอง: จดทุก URL ────────────────────────────────────────────────────
const fetched: string[] = []
globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  fetched.push(url)
  const file = remoteFiles.get(url)
  if (!file) return new Response('not found', { status: 404 })
  return new Response(file.bytes.slice(), { status: 200, headers: { 'content-type': file.type } })
}) as typeof fetch

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง + จับ props ที่ส่งเข้า renderToBuffer ──────────────
const captured: unknown[] = []
let reactPdf: Record<string, unknown> | null = null
const cookieJar = new Map<string, string>()

const requireFromRoot = createRequire(join(ROOT, 'package.json'))
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (/supabase-server$/.test(request)) return { createServiceClient: () => fakeClient }
  if (/^next\/headers$/.test(request)) {
    return {
      cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
      headers: async () => ({ get: () => null }),
    }
  }
  if (/(^|\/)lib\/logger$/.test(request)) return { logActivity: async () => {} }
  if (request === '@react-pdf/renderer') {
    if (!reactPdf) {
      const real = realLoad.call(this, requireFromRoot.resolve(request), ...rest) as Record<string, unknown>
      reactPdf = {
        ...real,
        __esModule: true,
        renderToBuffer: async (element: { props?: { data?: { claimNumber?: string } } }) => {
          const data = element?.props?.data
          captured.push(data)
          if (data?.claimNumber === 'EXP-202609-105') throw new Error('render failed (จำลอง)')
          return Buffer.from('%PDF-1.4 fake voucher')
        },
      }
    }
    return reactPdf
  }
  // สำเนา route ที่วางนอก repo (VOUCHER_ROUTE_MODULE) ใช้ alias @/ ของ tsconfig และ node_modules ของ repo ไม่ได้
  // — แปลงเป็น path เต็มเอง ให้หาเหมือน import จากใน repo
  if (request.startsWith('@/')) return realLoad.call(this, join(ROOT, request.slice(2)), ...rest)
  const parent = (rest[0] as { filename?: string } | undefined)?.filename
  const fromRoot = parent ? relative(ROOT, parent) : ''
  // ต่างไดรฟ์บน Windows relative() คืน path เต็ม ไม่ใช่ ..
  const outside = !!parent && (fromRoot.startsWith('..') || isAbsolute(fromRoot))
  if (outside && !request.startsWith('.') && !isAbsolute(request)) {
    return realLoad.call(this, requireFromRoot.resolve(request), ...rest)
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const { NextRequest } = require('next/server') as typeof import('next/server')
const route = require(resolve(ROOT, ROUTE)) as { GET: (req: InstanceType<typeof NextRequest>) => Promise<Response> }
const { buildVoucherData } = require('../lib/claim-voucher') as typeof import('../lib/claim-voucher')
/* eslint-enable @typescript-eslint/no-require-imports */

function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}

/** undefined เก็บลง JSON ไม่ได้ — แทนด้วยสตริงเพื่อให้การมี/ไม่มีคีย์ถูกเทียบด้วย */
const UNDEF = '[undefined]'
const toJson = (v: unknown) => JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? UNDEF : x)))

async function call(label: string, query: string) {
  const res = await route.GET(new NextRequest(`http://localhost:3000/api/pdf/payment-voucher${query}`))
  const type = res.headers.get('content-type') || ''
  const body = type.includes('application/json')
    ? await res.json()
    : Buffer.from(await res.arrayBuffer()).toString('latin1')
  return {
    label,
    status: res.status,
    headers: Object.fromEntries(
      ['content-type', 'content-disposition', 'x-frame-options', 'cache-control'].map(h => [h, res.headers.get(h)])
    ),
    body,
  }
}

async function main() {
  // ── ข้อมูลหน้าใบเบิก 4 กรณี (แอดมินขอ) ───────────────────────────────────────
  const cases: { label: string; data: unknown; response: unknown }[] = []
  const four: [string, string][] = [
    ['(a) ใบปกติ VAT แยก + หัก ณ ที่จ่าย 3% + บัญชีธนาคาร', CLAIM_NORMAL],
    ['(b) เงินทดลองจ่าย เคลียร์แล้ว + สลิปคืนเงินรูป 2 ไฟล์', CLAIM_ADVANCE],
    ['(c) วงเงินสดย่อยประจำเดือน + รายการลูก', CLAIM_FUND],
    ['(d) ไม่มีบัญชีธนาคาร', CLAIM_NO_BANK],
  ]
  for (const [label, id] of four) {
    loginAs(ADMIN)
    captured.length = 0
    const response = await call(label, `?id=${id}`)
    assert.equal(captured.length, 1, `${label}: ต้อง render หนึ่งครั้ง`)
    cases.push({ label, data: toJson(captured[0]), response })
  }

  // ── คำตอบของ route (สถานะ/หัว/เนื้อ) ต้องเหมือนเดิม ─────────────────────────────
  const responses: unknown[] = []
  cookieJar.clear()
  responses.push(await call('ไม่ได้ล็อกอิน → 401', `?id=${CLAIM_NORMAL}`))
  loginAs(ADMIN)
  responses.push(await call('ไม่ส่ง id → 400', ''))
  responses.push(await call('ไม่พบใบ → 404', `?id=${uid(999)}`))
  loginAs(STAFF_B)
  responses.push(await call('พนักงานขอใบของคนอื่น → 403', `?id=${CLAIM_NORMAL}`))
  loginAs(STAFF_A)
  responses.push(await call('พนักงานขอใบของตัวเอง → 200', `?id=${CLAIM_NORMAL}`))
  responses.push(await call('พนักงานขอใบวงเงินสดย่อยของคนอื่น → 200', `?id=${CLAIM_FUND}`))
  loginAs(ADMIN)
  const failLog = console.error
  console.error = () => {}
  try {
    responses.push(await call('render พัง → 500', `?id=${CLAIM_RENDER_FAIL}`))
  } finally {
    console.error = failLog
  }

  const snapshot = { cases, responses, fetched: [...new Set(fetched)].sort() }

  // ── D2: amount คือยอดรวมแล้ว (ราคาต่อหน่วย × จำนวน) — ห้ามคูณจำนวนซ้ำ (ตรวจทั้งตอนเก็บและตอนเทียบผลอ้างอิง) ──
  // แถวแบบที่ createClaim เก็บ: unit_price 100 × quantity 3 = amount 300
  const threeItems = {
    id: uid(106), claim_number: 'EXP-202609-106', claim_type: 'other', status: 'approved',
    unit_price: 100, quantity: 3, amount: 300, vat_mode: 'none', withholding_tax_rate: 0, title: 'ของใช้ 3 ชิ้น',
  }
  const multi = await buildVoucherData(fakeClient as unknown as Parameters<typeof buildVoucherData>[0], threeItems)
  assert.equal(multi.totalAmount, 300, `ราคาต่อหน่วย 100 × 3 = amount 300 → ยอดรวมต้องเป็น 300 (ได้ ${multi.totalAmount})`)
  assert.equal(multi.items[0].amount, 300, 'รายการในตารางต้องเป็น 300')
  assert.equal(multi.netAmount, 300, 'ยอดสุทธิ (ไม่มีภาษี) ต้องเป็น 300')
  const multiVat = await buildVoucherData(fakeClient as unknown as Parameters<typeof buildVoucherData>[0], {
    id: uid(107), claim_number: 'EXP-202609-107', claim_type: 'event', status: 'approved',
    amount: 2501, quantity: 2, vat_mode: 'excluded', withholding_tax_rate: 3, title: 'จำนวน 2 + VAT แยก',
  })
  assert.equal(multiVat.totalAmount, 2501, 'จำนวน 2 + VAT แยก: ยอดก่อนภาษีต้องเป็น amount')
  assert.equal(Math.round((multiVat.netAmount ?? NaN) * 100) / 100, Math.round((2501 * 1.07 - 2501 * 0.03) * 100) / 100, 'ยอดสุทธิคิดจาก amount')
  console.log('PASS  D2 ราคาต่อหน่วย 100 × จำนวน 3 (amount 300) → totalAmount 300 ไม่คูณจำนวนซ้ำ · VAT/หัก ณ ที่จ่ายคิดจาก amount')

  if (WRITE) {
    mkdirSync(dirname(GOLDEN), { recursive: true })
    writeFileSync(GOLDEN, JSON.stringify(snapshot, null, 2) + '\n', 'utf8')
    console.log(`เขียนผลอ้างอิง ${cases.length} กรณี + คำตอบ ${responses.length} แบบ → ${GOLDEN} (จาก ${ROUTE})`)
    return
  }

  assert.ok(existsSync(GOLDEN), `ไม่มีผลอ้างอิง ${GOLDEN} — รันด้วย --write-golden กับ route ต้นฉบับก่อน`)
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8')) as typeof snapshot
  for (let i = 0; i < golden.cases.length; i++) {
    assert.deepEqual(snapshot.cases[i], golden.cases[i], golden.cases[i].label)
    console.log(`PASS  ${golden.cases[i].label}`)
  }
  assert.equal(snapshot.cases.length, golden.cases.length)
  assert.deepEqual(snapshot.responses, golden.responses)
  console.log(`PASS  คำตอบของ route ${golden.responses.length} แบบ (401/400/404/403/200/200/500) สถานะ หัว และเนื้อเหมือนเดิม`)
  assert.deepEqual(snapshot.fetched, golden.fetched)
  console.log(`PASS  ดึงไฟล์สลิปชุดเดิม ${golden.fetched.length} URL (ข้าม .pdf)`)
  assert.deepEqual(snapshot, golden)
  console.log(`      โมดูลที่ตรวจ: ${ROUTE}`)
  console.log('\nclaim-voucher: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
