// จับชุดเอกสาร (/api/pdf/claim-bundle) — รัน GET ตัวจริงกับ Supabase จำลอง + fetch จำลองที่จดทุก URL
// + session token ที่เซ็นจริง + logActivity ที่ถูกดักไว้
// Run:  npx tsx scripts/claim-bundle-route.check.ts   (ต้องรันจาก repo root; ฟอนต์อ่านจาก ./public/fonts)
//
// ไม่แตะฐานข้อมูล สตอเรจ หรือเครือข่ายจริง: แทน next/headers, @/lib/supabase-server, @/lib/logger และ fetch
// (เทคนิคเดียวกับ scripts/ticket-attachments.check.ts) — หน้าใบเบิก/ชุดเอกสารเรนเดอร์ด้วย react-pdf + pdf-lib ตัวจริง
// ครอบคลุม AC6, AC9–AC12 ของ docs/specs/claim-document-bundle.md + เพดาน 413 + ใบเบิกเรนเดอร์พัง 500 · คน/บัญชีสังเคราะห์
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-bundle-route: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { PDFDocument } from 'pdf-lib'

process.env.SESSION_SECRET = 'claim-bundle-route-check'
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project-ref.supabase.co'

// ── ไฟล์สังเคราะห์ ────────────────────────────────────────────────────────────
const b64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))
/** JPEG 24×16 ไล่สี (ตัวจริง — react-pdf/pdf-lib ฝังได้) */
const JPEG = b64(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDABALDA4MChAODQ4SERATGCgaGBYWGDEjJR0oOjM9PDkzODdASFxOQERXRTc4UG1RV19iZ2hnPk1xeXBkeFxlZ2P/' +
  '2wBDARESEhgVGC8aGi9jQjhCY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2NjY2P/wAARCAAQABgDASIAAhEBAxEB/8QA' +
  'HwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkK' +
  'FhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXG' +
  'x8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAEC' +
  'AxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOE' +
  'hYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDirCFxco+3' +
  '5RnnPtXU2XasCy7Vv2XanjIKCsiqZ0Fl2oosu1FfJV/jO2Ox/9k='
)
/** PNG 24×16 */
const PNG = b64(
  'iVBORw0KGgoAAAANSUhEUgAAABgAAAAQCAYAAAAMJL+VAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAACDSURB' +
  'VDhPY2BgYPiPDTuYJfz3to/+H+oR+j8hMOB/dpT3/9Jk1/8NOQ7/u0qt/0+pNf0/v83g/6p+7f9bZqj+379Q4f+pVdL/r2wW/X9/j8D/V0e5/385xwoyC9Pw' +
  'UQuGnQUN/7k5q/+LCpX+V5Au+K+tkv3fVDd11IJRC0YtGEoWAADebB2UPlDOGwAAAABJRU5ErkJggg=='
)
const MB = 1024 * 1024

async function makePdf(pages: number, size: [number, number] = [595.28, 841.89]): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage(size)
  return doc.save()
}

// ── สตอเรจจำลอง (fetch) ─────────────────────────────────────────────────────────
const HOST = process.env.NEXT_PUBLIC_SUPABASE_URL
const RECEIPTS = `${HOST}/storage/v1/object/public/receipts`
const own = (name: string) => `${RECEIPTS}/claims/${name}`

type Remote = () => Response
const remote = new Map<string, Remote>()
const serve = (url: string, bytes: Uint8Array, type = 'application/octet-stream') =>
  remote.set(url, () => new Response(bytes.slice(), { status: 200, headers: { 'content-type': type, 'content-length': String(bytes.length) } }))

type FetchCall = { url: string; redirect: RequestRedirect | undefined; hasSignal: boolean }
/** คำขอที่ถึง fetch — ล้างเป็นช่วงๆ เพื่อตรวจทีละคำขอ */
const fetchLog: FetchCall[] = []
/** ทุกคำขอที่ถึง fetch ตลอดสคริปต์ (ไม่ล้าง) — ใช้พิสูจน์ AC10 */
const allFetches: FetchCall[] = []
let inFlight = 0
let maxInFlight = 0
/** react-pdf โหลด WASM ของ yoga (ตัวจัดหน้า) เป็น data: URL ผ่าน fetch — ไม่ออกเครือข่าย ส่งต่อให้ของจริง ไม่นับใน AC10 */
let dataUrlFetches = 0
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (url.startsWith('data:')) {
    dataUrlFetches++
    return realFetch(input, init)
  }
  const call: FetchCall = { url, redirect: init?.redirect, hasSignal: !!init?.signal }
  fetchLog.push(call)
  allFetches.push(call)
  inFlight++
  maxInFlight = Math.max(maxInFlight, inFlight)
  try {
    await new Promise(r => setTimeout(r, 3)) // ให้คำขอซ้อนกันจริง จะได้วัดการดึงพร้อมกัน
    const make = remote.get(url)
    return make ? make() : new Response('not found', { status: 404 })
  } finally {
    inFlight--
  }
}) as typeof fetch

/** ตรวจแบบอิสระ (ไม่ใช้โค้ดใน lib) ว่า URL อยู่ในบัคเก็ต receipts ของโปรเจกต์ */
function isProjectReceiptUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && u.host === 'project-ref.supabase.co' && !u.username
      && u.pathname.startsWith('/storage/v1/object/public/receipts/') && !/\.\.|%2e/i.test(url)
  } catch {
    return false
  }
}

// ── คนและใบเบิก (สังเคราะห์) ─────────────────────────────────────────────────
type Row = Record<string, unknown>
type Result = { data: unknown; error: { code: string; message: string } | null }

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ADMIN = uid(1), STAFF_A = uid(2), STAFF_B = uid(3)
const C1 = uid(401), C2 = uid(402), C3 = uid(403), C4 = uid(404), C5 = uid(405), C6 = uid(406), C7 = uid(407)
const C8 = uid(408), C9 = uid(409)
const UNKNOWN = uid(999)

const person = (id: string, role: string, full_name: string): Row =>
  ({ id, role, full_name, nickname: null, department: 'สตาฟ', is_approved: true, active_session_id: `sess-${id}` })

const claim = (over: Row): Row => ({
  claim_type: 'other', status: 'paid', quantity: 1, vat_mode: 'none', withholding_tax_rate: 0,
  title: 'ค่าใช้จ่ายทดสอบ', description: null, expense_date: '2026-09-15', created_at: '2026-09-15T02:00:00Z',
  bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-00000-0', account_holder_name: 'พนักงาน ทดสอบหนึ่ง',
  approved_by: ADMIN, actual_spent_items: null, actual_spent_amount: null, refund_amount: null,
  refund_slip_urls: [], refund_confirmed_at: null, advance_settled_at: null,
  pettycash_fund_id: null, pettycash_period_start: null, pettycash_period_end: null, pettycash_closed_at: null,
  receipt_urls: [], actual_receipt_urls: [], tax_invoice_urls: [], tax_invoice_numbers: [],
  amount: 1000, ...over,
})

// URL ที่ต้องไม่ถูกดึงเด็ดขาด (AC10)
const FOREIGN_URLS = [
  'https://evil.example.com/storage/v1/object/public/receipts/claims/x.jpg', // เว็บอื่น
  `${HOST}/storage/v1/object/public/avatars/x.jpg`, // บัคเก็ตอื่น
  `${HOST}/storage/v1/object/sign/receipts/claims/x.jpg`, // ไม่ใช่ public path
  `${RECEIPTS}/../avatars/x.jpg`, // .. ออกนอกบัคเก็ต
  `${RECEIPTS}/%2e%2e/avatars/x.jpg`, // .. แบบเข้ารหัส
  'https://project-ref.supabase.co.evil.com/storage/v1/object/public/receipts/claims/x.jpg', // host หน้าตาคล้าย
  'https://project-ref.supabase.co@evil.com/storage/v1/object/public/receipts/claims/x.jpg', // userinfo หลอก
  'http://project-ref.supabase.co/storage/v1/object/public/receipts/claims/x.jpg', // ไม่ใช่ https
  'not a url',
]
const FOREIGN_SLIP_JPG = 'https://evil.example.com/refund/slip.jpg'
const FOREIGN_SLIP_PDF = 'https://evil.example.com/refund/slip.pdf'

const db: Record<string, Row[]> = {
  profiles: [person(ADMIN, 'admin', 'แอดมิน ทดสอบ'), person(STAFF_A, 'staff', 'พนักงาน ทดสอบหนึ่ง'), person(STAFF_B, 'staff', 'พนักงาน ทดสอบสอง')],
  expense_claims: [
    // C1 ของ A — รูป, รูปที่ชื่อ .png แต่เนื้อ JPEG (AC6), PDF 2 หน้า, URL ต้องห้าม 9 แบบ, ใบกำกับที่มีช่องว่าง
    claim({
      id: C1, claim_number: 'EXP-202609-401', submitted_by: STAFF_A,
      receipt_urls: [own('c1-a.jpg'), own('c1-b.png'), own('c1-c.pdf'), ...FOREIGN_URLS],
      tax_invoice_urls: ['', own('c1-tax.jpg')], tax_invoice_numbers: ['ไม่มีไฟล์', 'INV-2026-0001'],
    }),
    // C2 ของ B — เงินทดลองจ่ายมีสลิปคืนเงิน: รูปของระบบ (ฝังในหน้าใบเบิก) + PDF ของระบบ (เข้าชุด) + ของเว็บอื่นทั้งสองแบบ
    claim({
      id: C2, claim_number: 'EXP-202609-402', claim_type: 'advance', status: 'refund_confirmed', submitted_by: STAFF_B,
      account_holder_name: 'พนักงาน ทดสอบสอง', amount: 3000, actual_spent_amount: 2900, refund_amount: 100,
      actual_spent_items: [{ description: 'ของใช้หน้างาน', amount: 2900 }], refund_confirmed_at: '2026-09-20T03:00:00Z',
      actual_receipt_urls: [own('c2-settle.png')],
      refund_slip_urls: [own('c2-slip.jpg'), own('c2-slip.pdf'), FOREIGN_SLIP_JPG, FOREIGN_SLIP_PDF],
    }),
    // C3 วงเงินสดย่อยของ B (พนักงานทุกคนพิมพ์ได้) + รายการลูก 1 ใบ
    claim({ id: C3, claim_number: 'EXP-202609-403', claim_type: 'petty_cash', submitted_by: STAFF_B, amount: 5000 }),
    claim({ id: uid(431), claim_number: 'EXP-202609-431', submitted_by: STAFF_B, pettycash_fund_id: C3, amount: 120, title: 'ค่ากาแฟ' }),
    // C4 ของ A — ไฟล์แนบ 61 ไฟล์ → 413 ก่อนดึงอะไร
    claim({ id: C4, claim_number: 'EXP-202609-404', submitted_by: STAFF_A, receipt_urls: Array.from({ length: 61 }, (_, i) => own(`c4-${i}.jpg`)) }),
    // C5 ของ A — PDF แนบ 600 หน้า + หน้าใบเบิก → เกิน 600 หน้า → 413
    claim({ id: C5, claim_number: 'EXP-202609-405', submitted_by: STAFF_A, receipt_urls: [own('c5-600.pdf')] }),
    // C6 ของแอดมิน — รูป 20 ไฟล์ (วัดการดึงพร้อมกัน) + ดึงไม่ได้ + ใหญ่เกิน (ประกาศขนาด / ไม่ประกาศขนาด)
    claim({
      id: C6, claim_number: 'EXP-202609-406', submitted_by: ADMIN,
      receipt_urls: [...Array.from({ length: 20 }, (_, i) => own(`c6-${i}.jpg`)), own('c6-missing.jpg'), own('c6-declared-big.jpg'), own('c6-stream-big.jpg')],
    }),
    // C7 วงเงินสดย่อยที่อ่านรายการลูกไม่ได้ → หน้าใบเบิกพัง → 500 พร้อมเลขที่
    claim({ id: C7, claim_number: 'EXP-202609-407', claim_type: 'petty_cash', submitted_by: STAFF_A }),
    // C8 ของแอดมิน — 20 ไฟล์ ไฟล์ละ 12MB (ไม่เกินเพดานต่อไฟล์) รวม 240MB → เกินเพดานรวม 100MB → 413 และหยุดดึงกลางทาง
    claim({ id: C8, claim_number: 'EXP-202609-408', submitted_by: ADMIN, receipt_urls: Array.from({ length: 20 }, (_, i) => own(`c8-${i}.pdf`)) }),
    // C9 ของแอดมิน — ไฟล์ที่ดึงไม่ได้ 55 ไฟล์ → รายการในหัว X-Bundle-Report ถูกตัดที่ 50 แต่ PDF มีหน้าแจ้งครบ
    claim({ id: C9, claim_number: 'EXP-202609-409', submitted_by: ADMIN, receipt_urls: Array.from({ length: 55 }, (_, i) => own(`c9-missing-${i}.jpg`)) }),
  ],
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

// ── ฐานข้อมูลจำลอง: select (รวม embed profiles!fk) → eq/in → order → single ──────────────
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
    out[part] = row[part] ?? null
  }
  return out
}
/** ใบวงเงินสดย่อยที่อ่านรายการลูกแล้วฐานข้อมูลล่ม */
const throwChildrenOf = new Set([C7])

class Query implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = []
  private cols = '*'
  private one = false
  private fail: Error | null = null
  constructor(private table: string) {}

  select(cols = '*') { this.cols = cols; return this }
  eq(c: string, v: unknown) {
    if (c === 'pettycash_fund_id' && throwChildrenOf.has(v as string)) this.fail = new Error('connection reset (จำลอง)')
    this.filters.push(r => r[c] === v)
    return this
  }
  in(c: string, vs: unknown[]) { this.filters.push(r => vs.includes(r[c])); return this }
  order() { return this }
  single() { this.one = true; return this }

  private run(): Result {
    if (this.fail) throw this.fail
    const rows = (db[this.table] ?? []).filter(r => this.filters.every(f => f(r))).map(r => project(this.table, r, this.cols))
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

// ── แทนโมดูลที่ต้องมี Next/ฐานข้อมูลจริง ─────────────────────────────────────
const cookieJar = new Map<string, string>()
const logCalls: unknown[][] = []
const mocks: [RegExp, unknown][] = [
  [/supabase-server$/, { createServiceClient: () => fakeClient }],
  [/^next\/headers$/, {
    cookies: async () => ({ get: (k: string) => (cookieJar.has(k) ? { name: k, value: cookieJar.get(k) } : undefined) }),
    headers: async () => ({ get: () => null }),
  }],
  [/(^|\/)lib\/logger$/, { logActivity: async (...args: unknown[]) => { logCalls.push(args) } }],
]
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  const hit = mocks.find(([re]) => re.test(request))
  return hit ? hit[1] : realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { createSessionToken } = require('../lib/session') as typeof import('../lib/session')
const { NextRequest } = require('next/server') as typeof import('next/server')
const { GET } = require('../app/api/pdf/claim-bundle/route') as typeof import('../app/api/pdf/claim-bundle/route')
/* eslint-enable @typescript-eslint/no-require-imports */

function loginAs(userId: string) {
  cookieJar.clear()
  cookieJar.set('session_token', createSessionToken(userId))
  cookieJar.set('session_id', `sess-${userId}`)
}

interface Report {
  pages: number
  claims: { claimNumber: string; pages: number; included: number; failed: { kind: string; index: number; reason: string }[] }[]
}

async function call(query: string) {
  return GET(new NextRequest(`http://localhost:3000/api/pdf/claim-bundle${query}`))
}

/** คำขอที่ต้องถูกปฏิเสธ: สถานะตรง, JSON { error } ภาษาไทย, ไม่มีบันทึก, ไม่มีการดึงไฟล์ */
async function rejected(label: string, query: string, status: number, match?: RegExp) {
  const logsBefore = logCalls.length
  const fetchesBefore = fetchLog.length
  const res = await call(query)
  assert.equal(res.status, status, `${label}: สถานะ`)
  const body = (await res.json()) as { error?: string }
  assert.ok(typeof body.error === 'string' && /[฀-๿]/.test(body.error), `${label}: ต้องมี error ภาษาไทย (ได้ ${JSON.stringify(body)})`)
  if (match) assert.match(body.error, match, label)
  assert.equal(logCalls.length, logsBefore, `${label}: ห้ามเรียก logActivity`)
  assert.equal(fetchLog.length, fetchesBefore, `${label}: ห้ามดึงไฟล์`)
  return body.error
}

/** จำนวนคำขอที่สำเร็จ — เทียบกับจำนวนครั้งที่ logActivity ถูกเรียก (AC12) */
let successes = 0

/** คำขอที่ต้องสำเร็จ: หัวครบ, รายงานตรงกับ PDF, บันทึก 1 ครั้ง */
async function succeeded(label: string, query: string, userId: string) {
  successes++
  const logsBefore = logCalls.length
  const res = await call(query)
  if (res.status !== 200) assert.fail(`${label}: สถานะ ${res.status} ${await res.text()}`)
  assert.equal(res.headers.get('content-type'), 'application/pdf')
  assert.equal(res.headers.get('cache-control'), 'private, no-store', `${label}: Cache-Control`)
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN')
  const disposition = res.headers.get('content-disposition') ?? ''
  assert.match(disposition, /^inline; filename="claim-bundle-[\x20-\x7e]+\.pdf"$/, `${label}: Content-Disposition ต้องเป็น ASCII`)
  const rawReport = res.headers.get('x-bundle-report')
  assert.ok(rawReport, `${label}: ต้องมี X-Bundle-Report`)
  const report = JSON.parse(decodeURIComponent(rawReport)) as Report
  const pdf = new Uint8Array(await res.arrayBuffer())
  const pages = (await PDFDocument.load(pdf)).getPageCount()
  assert.equal(report.pages, pages, `${label}: report.pages ต้องเท่าจำนวนหน้า PDF`)
  assert.equal(logCalls.length, logsBefore + 1, `${label}: ต้องเรียก logActivity 1 ครั้ง`)
  const [action, details, target, actor] = logCalls[logCalls.length - 1]
  assert.equal(action, 'EXPORT_CLAIM_BUNDLE')
  assert.equal(target, undefined)
  assert.equal(actor, userId)
  return { report, pages, disposition, details: details as Record<string, unknown> }
}

const pass = (label: string) => console.log(`PASS  ${label}`)

async function main() {
  // ไฟล์ของระบบ
  serve(own('c1-a.jpg'), JPEG, 'image/jpeg')
  serve(own('c1-b.png'), JPEG, 'image/png') // ชื่อ .png หัว HTTP ก็บอก png แต่เนื้อเป็น JPEG
  serve(own('c1-c.pdf'), await makePdf(2), 'application/pdf')
  serve(own('c1-tax.jpg'), JPEG, 'image/jpeg')
  serve(own('c2-settle.png'), PNG, 'image/png')
  serve(own('c2-slip.jpg'), JPEG, 'image/jpeg')
  serve(own('c2-slip.pdf'), await makePdf(1), 'application/pdf')
  for (let i = 0; i < 61; i++) serve(own(`c4-${i}.jpg`), JPEG, 'image/jpeg')
  serve(own('c5-600.pdf'), await makePdf(600, [200, 200]), 'application/pdf')
  for (let i = 0; i < 20; i++) serve(own(`c6-${i}.jpg`), JPEG, 'image/jpeg')
  remote.set(own('c6-declared-big.jpg'), () => new Response(JPEG.slice(), { headers: { 'content-type': 'image/jpeg', 'content-length': String(16 * MB) } }))
  remote.set(own('c6-stream-big.jpg'), () => {
    let sent = 0
    // ไม่ประกาศขนาด ส่งทีละ 1MB ไปเรื่อยๆ — ต้องหยุดอ่านเมื่อเกิน 15MB
    return new Response(new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent++ < 40) c.enqueue(new Uint8Array(MB))
        else c.close()
      },
    }), { headers: { 'content-type': 'image/jpeg' } })
  })
  // ของเว็บอื่น — ถ้าถูกดึงจะคืนไฟล์ดีให้ด้วย (พิสูจน์ว่าไม่ถูกดึงเพราะ URL ไม่ใช่เพราะดึงแล้วพัง)
  for (const url of [...FOREIGN_URLS, FOREIGN_SLIP_JPG]) serve(url, JPEG, 'image/jpeg')
  serve(FOREIGN_SLIP_PDF, await makePdf(1), 'application/pdf')

  const ids21 = Array.from({ length: 21 }, (_, i) => uid(700 + i)).join(',')

  // ── AC9 + AC12: คำขอที่ถูกปฏิเสธ ───────────────────────────────────────────────
  cookieJar.clear()
  await rejected('ไม่ได้ล็อกอิน', `?ids=${C1}`, 401)
  cookieJar.set('session_user_id', ADMIN)
  cookieJar.set('session_role', 'admin')
  await rejected('cookie เก่าแบบไม่เซ็น (session_user_id + session_role=admin)', `?ids=${C1}`, 401)
  loginAs(STAFF_A)
  await rejected('พนักงานขอใบของคนอื่น', `?ids=${C2}`, 403)
  await rejected('พนักงานขอ 2 ใบ (ของตัวเองทั้งคู่)', `?ids=${C1},${C4}`, 403)
  await rejected('21 ใบ', `?ids=${ids21}`, 400, /20/)
  await rejected('id ไม่ใช่ UUID', `?ids=${C1.slice(0, -1)}x`, 400)
  await rejected('id ไม่ใช่ UUID (มี ; ต่อท้าย)', `?ids=${C1};drop`, 400)
  await rejected('ไม่ส่ง ids', '', 400)
  await rejected('ids ว่าง', '?ids=', 400)
  await rejected('จุลภาคเกิน', `?ids=${C1},`, 400)
  await rejected('layout ไม่รู้จัก', `?ids=${C1}&layout=three`, 400)
  await rejected('layout ว่าง', `?ids=${C1}&layout=`, 400)
  await rejected('ใบที่ไม่มี (พนักงาน)', `?ids=${UNKNOWN}`, 404)
  loginAs(ADMIN)
  await rejected('id ซ้ำ', `?ids=${C1},${C1.toUpperCase()}`, 400)
  await rejected('ใบที่ไม่มีปนใบที่มี (แอดมิน)', `?ids=${C1},${UNKNOWN}`, 404)
  pass('AC9 ไม่ล็อกอิน / cookie ไม่เซ็น → 401 · พนักงานขอใบคนอื่น → 403 · พนักงานขอ 2 ใบ → 403 · 21 ใบ / ไม่ใช่ UUID / ว่าง / ซ้ำ / layout ผิด → 400 · ใบที่ไม่มี → 404')

  // ── เพดาน 413 (ไม่ดึง / ไม่บันทึก) ─────────────────────────────────────────────
  loginAs(STAFF_A)
  const tooManyFiles = await rejected('ไฟล์แนบ 61 ไฟล์', `?ids=${C4}`, 413, /60/)
  assert.ok(tooManyFiles.includes('EXP-202609-404'), 'ข้อความ 413 ต้องบอกเลขที่ใบเบิก')
  const fetchesBefore600 = fetchLog.length
  const logsBefore600 = logCalls.length
  const res600 = await call(`?ids=${C5}`)
  assert.equal(res600.status, 413)
  assert.match(((await res600.json()) as { error: string }).error, /600/)
  assert.equal(logCalls.length, logsBefore600, '413 หน้าเกิน: ห้ามบันทึก')
  assert.deepEqual(fetchLog.slice(fetchesBefore600).map(f => f.url), [own('c5-600.pdf')])
  pass('413 ไฟล์แนบเกิน 60 ไฟล์ต่อใบ (ไม่ดึงไฟล์เลย) · หน้ารวมเกิน 600 หน้า — ข้อความไทยบอกเพดาน ไม่บันทึก')

  // ── หน้าใบเบิกพัง → 500 บอกเลขที่ ──────────────────────────────────────────────
  loginAs(ADMIN)
  const origError = console.error
  console.error = () => {}
  try {
    await rejected('หน้าใบเบิกเรนเดอร์ไม่ได้', `?ids=${C7}`, 500, /EXP-202609-407/)
  } finally {
    console.error = origError
  }
  pass('หน้าใบเบิกของใบหนึ่งสร้างไม่ได้ → 500 ทั้งคำขอ ข้อความบอกเลขที่ EXP-202609-407 ไม่บันทึก')

  // ── เพดานขนาดรวม 100MB → 413 (หยุดดึงเมื่อเกิน ไม่บันทึก) ───────────────────────
  const big = new Uint8Array(12 * MB)
  for (let i = 0; i < 20; i++) serve(own(`c8-${i}.pdf`), big, 'application/pdf')
  const fetchesBeforeBig = fetchLog.length
  const logsBeforeBig = logCalls.length
  const resBig = await call(`?ids=${C8}`)
  assert.equal(resBig.status, 413)
  assert.match(((await resBig.json()) as { error: string }).error, /100MB/)
  assert.equal(logCalls.length, logsBeforeBig, '413 ขนาดรวมเกิน: ห้ามบันทึก')
  const fetchedBig = fetchLog.length - fetchesBeforeBig
  // 9 ไฟล์ก็เกิน 100MB แล้ว — ที่ดึงเกินมาได้มีแค่คำขอที่ออกไปก่อนรู้ผล (พร้อมกันสูงสุด 6)
  assert.ok(fetchedBig >= 9 && fetchedBig <= 9 + 5, `ต้องหยุดดึงเมื่อเกินเพดานรวม (ดึง ${fetchedBig} จาก 20 ไฟล์)`)
  for (let i = 0; i < 20; i++) remote.delete(own(`c8-${i}.pdf`))
  pass(`413 ไฟล์แนบรวมเกิน 100MB (20 ไฟล์ × 12MB หยุดที่ ${fetchedBig} ไฟล์) — ข้อความบอกเพดาน ไม่บันทึก`)

  // ── ไฟล์ที่รวมไม่ได้จำนวนมาก: หัวคำตอบไม่บวม แต่ PDF มีหน้าแจ้งครบ ─────────────────
  const many = await succeeded('ไฟล์ที่ดึงไม่ได้ 55 ไฟล์', `?ids=${C9}`, ADMIN)
  const manyHeader = many.report as Report & { failedTotal?: number }
  assert.equal(manyHeader.failedTotal, 55, 'failedTotal ต้องเป็นจำนวนจริงทั้งหมด')
  assert.equal(manyHeader.claims[0].failed.length, 50, 'รายการในหัวถูกตัดที่ 50')
  assert.equal(many.pages, 1 + 55, 'PDF ต้องมีหน้าแจ้งครบทั้ง 55 ไฟล์')
  assert.equal(many.details.failed, 55, 'บันทึกประวัติใช้จำนวนจริง')
  pass('ไฟล์ที่รวมไม่ได้ 55 ไฟล์: หัว X-Bundle-Report ใส่ 50 รายการ + failedTotal 55 · PDF มีหน้าแจ้งครบ 55 หน้า')

  // ── C1: AC6 / AC10 / AC11 / AC12 ──────────────────────────────────────────────
  loginAs(STAFF_A)
  fetchLog.length = 0
  const c1 = await succeeded('C1 ใบของตัวเอง', `?ids=${C1}`, STAFF_A)
  const c1Claim = c1.report.claims[0]
  assert.equal(c1Claim.claimNumber, 'EXP-202609-401')
  // รูป .jpg + รูป .png ที่เนื้อ JPEG + PDF 2 หน้า + ใบกำกับ (ช่องว่างถูกข้าม) = 4 ไฟล์รวมได้
  assert.equal(c1Claim.included, 4, 'AC6: ไฟล์ .png ที่เนื้อ JPEG ต้องรวมได้')
  assert.deepEqual(c1Claim.failed, FOREIGN_URLS.map((_, i) => ({ kind: 'receipt', index: 4 + i, reason: 'foreign-host' })))
  assert.equal(c1.pages, 1 + 3 + 2 + FOREIGN_URLS.length, 'ใบเบิก 1 + รูป 3 + PDF 2 หน้า + หน้าแจ้ง 9')
  assert.equal(c1.disposition, 'inline; filename="claim-bundle-EXP-202609-401.pdf"')
  assert.deepEqual(c1.details, { claims: ['EXP-202609-401'], pages: c1.pages, failed: FOREIGN_URLS.length, layout: 'one', duplex: false })
  assert.deepEqual(fetchLog.map(f => f.url).sort(), [own('c1-a.jpg'), own('c1-b.png'), own('c1-c.pdf'), own('c1-tax.jpg')].sort())
  pass(`AC6 ไฟล์ชื่อ .png ที่เนื้อเป็น JPEG รวมเป็นรูปได้ · C1: ${c1.pages} หน้า ใบกำกับที่ไม่มีไฟล์ (ช่องว่าง) ไม่นับ`)

  // ── C2: สลิปคืนเงินของเงินทดลองจ่าย (หน้าใบเบิกดึงรูป / ชุดเอกสารดึง PDF) + layout two ──
  loginAs(STAFF_B)
  fetchLog.length = 0
  const c2 = await succeeded('C2 เงินทดลองจ่ายของตัวเอง layout two', `?ids=${C2}&layout=two&duplex=1`, STAFF_B)
  assert.deepEqual(c2.report.claims[0].failed, [{ kind: 'refund_slip', index: 2, reason: 'foreign-host' }])
  assert.equal(c2.report.claims[0].included, 2, 'ใบเสร็จเคลียร์ + สลิป PDF ของระบบ')
  assert.deepEqual(fetchLog.map(f => f.url).sort(), [own('c2-settle.png'), own('c2-slip.jpg'), own('c2-slip.pdf')].sort())
  assert.deepEqual(c2.details, { claims: ['EXP-202609-402'], pages: c2.pages, failed: 1, layout: 'two', duplex: true })
  pass('C2 เงินทดลองจ่าย: สลิปรูปของระบบฝังในหน้าใบเบิก · สลิป PDF ของระบบเข้าชุด · สลิปเว็บอื่น (รูปและ PDF) ไม่ถูกดึง PDF เว็บอื่นขึ้นหน้าแจ้ง')

  // ── C3: เอกสารเงินสดย่อยของคนอื่น พนักงานพิมพ์ได้ ────────────────────────────────
  loginAs(STAFF_A)
  const c3 = await succeeded('C3 วงเงินสดย่อยของคนอื่น', `?ids=${C3}`, STAFF_A)
  assert.deepEqual(c3.report.claims, [{ claimNumber: 'EXP-202609-403', pages: c3.pages, included: 0, failed: [] }])
  pass('C3 วงเงินสดย่อยของพนักงานอื่น → พนักงานจับชุดได้ (กติกาเดียวกับหน้าใบเบิก)')

  // ── C6: ดึงพร้อมกันไม่เกิน 6 + ดึงไม่ได้ / ใหญ่เกิน ────────────────────────────────
  loginAs(ADMIN)
  fetchLog.length = 0
  maxInFlight = 0
  const c6 = await succeeded('C6 ไฟล์ 23 ไฟล์', `?ids=${C6}`, ADMIN)
  assert.ok(maxInFlight <= 6, `ดึงพร้อมกันได้ไม่เกิน 6 (ได้ ${maxInFlight})`)
  assert.ok(maxInFlight >= 2, `ต้องดึงแบบขนานจริง (ได้ ${maxInFlight})`)
  assert.deepEqual(c6.report.claims[0].failed, [
    { kind: 'receipt', index: 21, reason: 'fetch' },
    { kind: 'receipt', index: 22, reason: 'too-large' },
    { kind: 'receipt', index: 23, reason: 'too-large' },
  ])
  assert.equal(c6.report.claims[0].included, 20)
  pass(`C6 ดึงพร้อมกันสูงสุด ${maxInFlight} (เพดาน 6) · 404 → fetch · content-length 16MB → too-large · ไม่บอกขนาดแต่ส่งเกิน 15MB → too-large`)

  // ── หลายใบ (แอดมิน): เรียงตามเลขที่ + duplex + ชื่อไฟล์ ─────────────────────────────
  fetchLog.length = 0
  const multi = await succeeded('แอดมิน 3 ใบ (ส่งกลับลำดับ)', `?ids=${C3},${C2},${C1}&layout=two&duplex=1`, ADMIN)
  assert.deepEqual(multi.report.claims.map(c => c.claimNumber), ['EXP-202609-401', 'EXP-202609-402', 'EXP-202609-403'])
  assert.equal(multi.disposition, 'inline; filename="claim-bundle-EXP-202609-401-and-2-more.pdf"')
  const setPages = multi.report.claims.map(c => c.pages)
  const blanks = setPages.slice(0, -1).filter(p => p % 2 === 1).length
  assert.equal(multi.pages, setPages.reduce((a, b) => a + b, 0) + blanks, 'duplex: หน้าว่างคั่นหลังชุดหน้าคี่ (ยกเว้นใบสุดท้าย)')
  assert.deepEqual(multi.details, {
    claims: ['EXP-202609-401', 'EXP-202609-402', 'EXP-202609-403'],
    pages: multi.pages, failed: FOREIGN_URLS.length + 1, layout: 'two', duplex: true,
  })
  pass(`AC11 หลายใบ: เรียงตามเลขที่ · ชื่อไฟล์ claim-bundle-EXP-202609-401-and-2-more.pdf · X-Bundle-Report ถอดได้ ${multi.pages} หน้า = PDF · หน้าว่างคั่น ${blanks} หน้า`)

  // ── AC10: ทุกคำขอที่ถึง fetch ตลอดสคริปต์ (ทุกใบ ทุกผู้ใช้ ทั้งคำขอที่สำเร็จและ 413) ──────────
  await succeeded('แอดมิน ทุกใบที่มีไฟล์', `?ids=${C1},${C2},${C6}`, ADMIN)
  assert.ok(allFetches.length > 0)
  for (const f of allFetches) {
    assert.ok(isProjectReceiptUrl(f.url), `AC10: ห้ามดึง ${f.url}`)
    assert.equal(f.redirect, 'error', `ต้องไม่ตาม redirect: ${f.url}`)
    assert.ok(f.hasSignal, `ต้องมีหมดเวลา: ${f.url}`)
  }
  for (const bad of [...FOREIGN_URLS, FOREIGN_SLIP_JPG, FOREIGN_SLIP_PDF]) {
    assert.ok(!allFetches.some(f => f.url === bad), `AC10: ${bad} ต้องไม่ถูกดึง`)
  }
  pass(`AC10 fetch ถูกเรียกทั้งสคริปต์ ${allFetches.length} ครั้ง ทุกครั้งเป็น https://project-ref.supabase.co/storage/v1/object/public/receipts/… พร้อม redirect: 'error' + signal · URL ต้องห้าม ${FOREIGN_URLS.length + 2} แบบไม่ถูกเรียกเลย (data: URL ภายใน react-pdf ${dataUrlFetches} ครั้งไม่นับ — ไม่ออกเครือข่าย)`)

  assert.equal(logCalls.length, successes)
  assert.ok(logCalls.every(c => c[0] === 'EXPORT_CLAIM_BUNDLE'))
  pass(`AC12 logActivity('EXPORT_CLAIM_BUNDLE') ${logCalls.length} ครั้ง = คำขอที่สำเร็จ ${successes} คำขอ (ครั้งละ 1) · 0 ครั้งกับคำขอที่ถูกปฏิเสธทุกแบบ (401/400/403/404/413/500)`)

  console.log('\nclaim-bundle-route: ผ่านทั้งหมด')
}

main().catch(e => {
  console.log(`FAIL  ${(e as Error).stack || (e as Error).message}`)
  process.exit(1)
})
