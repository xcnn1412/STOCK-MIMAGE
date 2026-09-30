// ตรวจตัวช่วยป้ายเอกสารของแถวแบบเบา (claim-docs.ts) เทียบกับของเดิม — ข้อมูลสังเคราะห์ ไม่แตะฐานข้อมูล
// Run:  npx tsx "app/(authenticated)/finance/claim-docs.check.ts"
//
// ของเดิม (ตัวจริง import มาเทียบ): getClaimChecklist (costs/types.ts) · claimFileCount, filedState (claims-filter.ts)
// ใบเบิกสุ่ม 6,000 ใบ (seed คงที่): ช่อง URL เป็น ไม่มี / null / [] / รายการที่มี '' และช่องว่างปน · สถานะ ประเภท ยอดคืน
// เวลาเข้าแฟ้ม จำนวนไฟล์ตอนเข้าแฟ้ม สุ่มทั้งหมด (รวม null และไม่มีช่อง) — ทุกใบเทียบทั้งแบบแถวเต็มและแบบ { docs }
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-docs: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import { CLAIM_STATUSES, getClaimChecklist, type ExpenseClaim } from '../costs/types'
import { claimFileCount, filedState } from './claims-filter'
import { checklistFromCounts, checklistOf, docCounts, fileCountOf, filedStateOf } from './claim-docs'
import type { DocCounts } from './view-data'

const pass = (label: string) => console.log(`PASS  ${label}`)

// ── สุ่มแบบกำหนด seed (mulberry32) ─────────────────────────────────────────────
function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = seeded(20261001)
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]
const MISSING = Symbol('missing')

const URL_ENTRIES = [
  'https://x.supabase.co/storage/v1/object/public/receipts/claims/EXP-1/1_0.jpg',
  'https://x.supabase.co/storage/v1/object/public/receipts/claims/EXP-1/1_1.pdf',
  '', '', '  ', null, 7,
] as const
const NUMBER_ENTRIES = ['IV-0001', 'IV-0002', '', '  ', null] as const
const list = (entries: readonly unknown[]) => {
  const r = rand()
  if (r < 0.12) return MISSING
  if (r < 0.24) return null
  if (r < 0.36) return []
  return Array.from({ length: 1 + Math.floor(rand() * 4) }, () => pick(entries))
}
const STATUSES = [...CLAIM_STATUSES.map(s => s.value as string), 'unknown']
const TYPES = ['event', 'other', 'advance', 'advance', 'petty_cash', 'ADVANCE']

type Loose = Record<string, unknown>
function randomClaim(i: number): Loose {
  const c: Loose = { id: `c${i}`, status: pick(STATUSES), claim_type: pick(TYPES) }
  const put = (key: string, v: unknown) => { if (v !== MISSING) c[key] = v }
  put('receipt_urls', list(URL_ENTRIES))
  put('actual_receipt_urls', list(URL_ENTRIES))
  put('tax_invoice_urls', list(URL_ENTRIES))
  put('refund_slip_urls', list(URL_ENTRIES))
  put('tax_invoice_numbers', list(NUMBER_ENTRIES))
  put('refund_amount', pick([MISSING, null, 0, -5, 0.01, 250, 1200.5]))
  put('refund_confirmed_at', pick([MISSING, null, '', '2026-09-20T03:00:00+00:00']))
  put('filed_at', pick([MISSING, null, null, '', '2026-09-25T03:00:00+00:00', '2026-09-25T03:00:00+00:00']))
  put('filed_file_count', pick([MISSING, null, 0, 1, 2, 3, 4, 5, 8]))
  return c
}

const URL_FIELDS = ['receipt_urls', 'actual_receipt_urls', 'tax_invoice_urls', 'refund_slip_urls', 'tax_invoice_numbers']
/** แถวแบบเบา: ตัดรายการ URL ทิ้ง เหลือ docs ที่ server คิดให้ */
const lean = (c: Loose) => ({
  ...Object.fromEntries(Object.entries(c).filter(([k]) => !URL_FIELDS.includes(k))),
  docs: docCounts(c),
})

const TOTAL = 6000
const tally = { complete: 0, incomplete: 0, taxRequired: 0, refundRequired: 0, none: 0, filed: 0, changed: 0, files: 0, withBlank: 0 }
for (let i = 0; i < TOTAL; i++) {
  const c = randomClaim(i)
  const label = JSON.stringify(c)
  const want = getClaimChecklist(c as unknown as ExpenseClaim)
  const wantFiles = claimFileCount(c)
  const wantFiled = filedState(c as Loose & { filed_at?: string | null; filed_file_count?: number | null })

  const full = c as Loose & { status: string; claim_type: string }
  assert.deepEqual(checklistFromCounts(docCounts(c), full), want, `checklistFromCounts(docCounts) ${label}`)
  assert.deepEqual(checklistOf(full), want, `checklistOf(แถวเต็ม) ${label}`)
  assert.equal(fileCountOf(c), wantFiles, `fileCountOf(แถวเต็ม) ${label}`)
  assert.equal(filedStateOf(c), wantFiled, `filedStateOf(แถวเต็ม) ${label}`)

  const l = lean(c) as { docs: DocCounts; status: string; claim_type: string }
  for (const k of URL_FIELDS) assert.ok(!(k in l), `แถวแบบเบาต้องไม่มี ${k}`)
  assert.deepEqual(checklistOf(l), want, `checklistOf({ docs }) ${label}`)
  assert.equal(fileCountOf(l), wantFiles, `fileCountOf({ docs }) ${label}`)
  assert.equal(filedStateOf(l), wantFiled, `filedStateOf({ docs }) ${label}`)
  // JSON ไปกลับ (แบบที่ server ส่งให้หน้าจอ) ได้ผลเดิม
  assert.deepEqual(checklistOf(JSON.parse(JSON.stringify(l))), want)

  if (want.isComplete) tally.complete++; else tally.incomplete++
  if (want.taxInvoiceRequired) tally.taxRequired++
  if (want.refundRequired) tally.refundRequired++
  tally[wantFiled]++
  tally.files += wantFiles
  if (URL_FIELDS.some(k => Array.isArray(c[k]) && (c[k] as unknown[]).some(u => typeof u !== 'string' || u.trim() === ''))) tally.withBlank++
}
// ชุดสุ่มต้องครอบคลุมทุกกิ่ง
assert.ok(tally.complete > 500 && tally.incomplete > 500, `ครบ/ไม่ครบต้องมีทั้งสองแบบ ${JSON.stringify(tally)}`)
assert.ok(tally.taxRequired > 500 && tally.refundRequired > 200, `ต้องมีใบที่ต้องมีใบกำกับและใบที่ต้องคืนเงิน ${JSON.stringify(tally)}`)
assert.ok(tally.none > 500 && tally.filed > 200 && tally.changed > 200, `สถานะแฟ้มต้องมีครบสามแบบ ${JSON.stringify(tally)}`)
assert.ok(tally.withBlank > 1000, 'ต้องมีรายการที่มี \'\' / ช่องว่าง / ค่าที่ไม่ใช่สตริงปน')
pass(`${TOTAL} ใบสุ่ม: checklistFromCounts(docCounts(c)) = checklistOf(c) = checklistOf({ docs }) = getClaimChecklist(c) · fileCountOf = claimFileCount · filedStateOf = filedState (ครบ ${tally.complete} / ไม่ครบ ${tally.incomplete} · ต้องมีใบกำกับ ${tally.taxRequired} · ต้องคืนเงิน ${tally.refundRequired} · แฟ้ม none ${tally.none} / filed ${tally.filed} / changed ${tally.changed} · มีค่าว่างปน ${tally.withBlank})`)

// ── กรณีที่ต้องจำ ──────────────────────────────────────────────────────────────
const base = { status: 'paid', claim_type: 'event' }
// '' นับเป็น "มีรายการ" ของป้าย (แบบ getClaimChecklist) แต่ไม่นับเป็นไฟล์ (แบบ claimFileCount)
assert.deepEqual(docCounts({ tax_invoice_urls: ['', 'https://a/b.pdf', '  '], tax_invoice_numbers: ['IV-1', ''] }), {
  receipts: { n: 0, files: 0 }, actualReceipts: { n: 0, files: 0 }, taxInvoices: { n: 3, files: 1 }, refundSlips: { n: 0, files: 0 }, taxInvoiceNumbers: 2,
})
assert.equal(checklistOf({ ...base, receipt_urls: [''] }).hasReceipt, true, "'' ในใบเสร็จยังนับว่ามีใบเสร็จ (ของเดิม)")
assert.equal(fileCountOf({ receipt_urls: [''] }), 0, "'' ไม่ใช่ไฟล์")
assert.deepEqual(docCounts({}), docCounts({ receipt_urls: null, actual_receipt_urls: undefined, tax_invoice_urls: 'x', refund_slip_urls: {} }))
// มีทั้ง docs และรายการ URL (ไม่ควรเกิด) → ใช้ docs
const docsOnly: DocCounts = { receipts: { n: 0, files: 0 }, actualReceipts: { n: 0, files: 0 }, taxInvoices: { n: 0, files: 0 }, refundSlips: { n: 0, files: 0 }, taxInvoiceNumbers: 0 }
assert.equal(checklistOf({ ...base, docs: docsOnly, receipt_urls: ['https://a/b.jpg'] } as never).hasReceipt, false)
assert.equal(filedStateOf({ docs: docsOnly, filed_at: '2026-09-25T03:00:00+00:00', filed_file_count: 0 }), 'filed')
assert.equal(filedStateOf({ docs: docsOnly, filed_at: '2026-09-25T03:00:00+00:00', filed_file_count: 1 }), 'changed')
assert.equal(filedStateOf({ docs: docsOnly, filed_at: '2026-09-25T03:00:00+00:00' }), 'filed', 'ไม่มีจำนวนตอนเข้าแฟ้ม = ไม่เตือน')
pass("กรณีจำ: '' นับในป้ายแต่ไม่นับเป็นไฟล์ · ค่าที่ไม่ใช่รายการ = 0 · มี docs แล้วใช้ docs · เข้าแฟ้มโดยไม่มีจำนวน = filed")

console.log('\nclaim-docs: ผ่านทั้งหมด')
