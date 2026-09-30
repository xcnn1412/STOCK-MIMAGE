// ขั้น 3 (v1.27.0 ความเร็ว) — หน้าจอของใบเบิกที่รับข้อมูลรูปใหม่: เรนเดอร์ SearchView, ArchiveList (ทีละหน้า), FileStatusList,
// ReceiptThumb, FinanceNav (ช่องค้นหาช่องเดียว), FinanceDownloadView (จาก cells) แบบ static + ตรวจกติกาหน้าตา (DESIGN.md)
// ของไฟล์ใหม่ และตรวจซอร์สของหน้าที่เปลี่ยนรูปข้อมูล (ไม่มี calcTax สำเนา, ตัวกรองคลังเก็บอยู่ใน URL, รายชื่องานโหลดตอนแก้ไข ฯลฯ)
// Run:  npx tsx scripts/finance-speed-view.check.ts
//
// ไม่แตะเครือข่าย/ฐานข้อมูล: server action (./actions, ../actions, ./lifecycle-actions) ถูกแทนด้วยตัวจำลองที่ล้มทันทีถ้าถูกเรียก
// next/navigation ถูกแทนด้วย router/URL จำลอง · ใบเบิกสังเคราะห์ทั้งหมด
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-speed-view: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// thumbUrlFor เทียบ host กับ NEXT_PUBLIC_SUPABASE_URL เมื่อตั้งไว้ — ตั้งค่าที่รู้แน่นอน (ไม่อ่าน .env.local)
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
const STORAGE = 'https://x.supabase.co/storage/v1/object/public/receipts'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const mustNotCall = (name: string) => async () => assert.fail(`หน้าจอต้องไม่เรียก server action ตอนเรนเดอร์ (${name})`)
let currentPath = '/finance/archive'
let currentSearch = ''
const fakeRouter = {
  push: () => assert.fail('ไม่ควรเปลี่ยนหน้าตอนเรนเดอร์'), replace: () => assert.fail('ไม่ควรเปลี่ยนหน้าตอนเรนเดอร์'),
  refresh() {}, back() {}, forward() {}, prefetch() {},
}
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (/^(\.\.?\/)+(actions|lifecycle-actions)$/.test(request)) {
    return new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? mustNotCall(key) : undefined) })
  }
  if (request === 'next/navigation') {
    const real = realLoad.call(this, request, ...rest) as object
    return {
      ...real,
      useRouter: () => fakeRouter,
      usePathname: () => currentPath,
      useSearchParams: () => new URLSearchParams(currentSearch),
    }
  }
  if (/lib\/i18n\/context$/.test(request)) {
    const real = realLoad.call(this, request, ...rest) as object
    return { ...real, useLocale: () => ({ locale: 'th', setLocale() {} }) }
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const SearchView = (require('../app/(authenticated)/finance/search/search-view') as typeof import('../app/(authenticated)/finance/search/search-view')).default
const archiveMod = require('../app/(authenticated)/finance/archive/archive-list') as typeof import('../app/(authenticated)/finance/archive/archive-list')
const fileStatus = require('../app/(authenticated)/finance/new/file-status-list') as typeof import('../app/(authenticated)/finance/new/file-status-list')
const thumbMod = require('../app/(authenticated)/finance/[id]/receipt-thumb') as typeof import('../app/(authenticated)/finance/[id]/receipt-thumb')
const FinanceNav = (require('../app/(authenticated)/finance/finance-nav') as typeof import('../app/(authenticated)/finance/finance-nav')).default
const FinanceDownloadView = (require('../app/(authenticated)/finance/download/finance-download-view') as typeof import('../app/(authenticated)/finance/download/finance-download-view')).default
const { calcTax } = require('../lib/finance/money') as typeof import('../lib/finance/money')
/* eslint-enable @typescript-eslint/no-require-imports */

type ListClaim = import('../app/(authenticated)/finance/view-data').ListClaim
type SearchHit = import('../app/(authenticated)/finance/view-data').SearchHit
type WhtCell = import('../app/(authenticated)/finance/view-data').WhtCell

const ROOT = path.resolve(__dirname, '..')
const FINANCE = path.join(ROOT, 'app', '(authenticated)', 'finance')
const read = (file: string) => fs.readFileSync(file, 'utf8')
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
/** ข้อความล้วน (ตัดแท็ก + ถอด entity ที่ React ใส่) */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const count = (hay: string, needle: string) => hay.split(needle).length - 1
/** แท็กเปิดของ JSX ตั้งแต่ตำแหน่ง start ถึง '>' ที่ปิดแท็กจริง (ข้าม '>' ใน {…} เช่น e => …) */
function openTag(src: string, start: number): string {
  let depth = 0
  for (let i = start; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') depth--
    else if (ch === '>' && depth === 0) return src.slice(start, i + 1)
  }
  return src.slice(start)
}
const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pass = (label: string) => console.log(`PASS  ${label}`)
/** การตรวจที่ต้องรอ (settleThumb) — บรรทัดสุดท้ายพิมพ์หลังทุกตัวจบ */
const pending: Promise<void>[] = []

const docs = (receipts = 1): ListClaim['docs'] => ({
  receipts: { n: receipts, files: receipts }, actualReceipts: { n: 0, files: 0 }, taxInvoices: { n: 0, files: 0 },
  refundSlips: { n: 0, files: 0 }, taxInvoiceNumbers: 0,
})
const listClaim = (n: number, over: Partial<ListClaim> = {}): ListClaim => ({
  id: uid(n), claim_number: `EXP-202609-${String(n).padStart(4, '0')}`, claim_type: 'event', title: `ค่าใช้จ่ายทดสอบ ${n}`,
  amount: 1070, vat_mode: 'included', withholding_tax_rate: 3, status: 'paid', category: 'food',
  submitted_by: uid(900), submitted_at: '2026-09-01T03:00:00+00:00', approved_at: '2026-09-02T03:00:00+00:00',
  paid_at: '2026-09-03T03:00:00+00:00', created_at: '2026-09-01T02:00:00+00:00', expense_date: '2026-09-01',
  funding_source: 'company', job_event_id: uid(800), reject_reason: null, refund_amount: null, refund_confirmed_at: null,
  actual_spent_amount: null, advance_settled_at: null, pettycash_fund_id: null, pettycash_closed_at: null,
  submitter: { id: uid(900), full_name: 'พิมพ์ชนก ทดสอบ' }, job_event: { id: uid(800), event_name: 'งานเปิดตัวสินค้า ทดสอบ', linked_lead_id: null },
  filed_at: null, filed_file_count: null, deleted_at: null, docs: docs(),
  ...over,
})

// ══ AC25 / AC19 SearchView ════════════════════════════════════════════════════════
{
  const hit = (n: number, status: string, over: Partial<SearchHit> = {}): SearchHit => {
    const c = listClaim(n, { status: status as ListClaim['status'], ...over })
    return {
      id: c.id, claim_number: c.claim_number, claim_type: c.claim_type, title: c.title, amount: c.amount, vat_mode: c.vat_mode,
      withholding_tax_rate: c.withholding_tax_rate, status: c.status, expense_date: c.expense_date, paid_at: c.paid_at,
      created_at: c.created_at, submitted_by: c.submitted_by, submitter: c.submitter, job_event: c.job_event,
    }
  }
  const hits = [hit(1, 'paid'), hit(2, 'pending', { paid_at: null }), hit(3, 'rejected', { paid_at: null, job_event: null })]
  const render = (props: Parameters<typeof SearchView>[0]) => renderToStaticMarkup(createElement(SearchView, props))
  const html = render({ q: 'ทดสอบ', hits, truncated: false, isAdmin: true })
  const t = text(html)
  assert.ok(t.includes('ผลการค้นหา “ทดสอบ” 3 ใบ'), 'หัวข้อผลการค้นหา')
  assert.equal(count(html, 'data-status='), 3, 'StatusBadge ทุกแถว')
  for (const label of ['ชำระเงินแล้ว', 'รออนุมัติ', 'ปฏิเสธ']) assert.ok(t.includes(label), `ป้ายสถานะ ${label}`)
  for (const h of hits) {
    assert.ok(html.includes(`href="/finance/${h.id}"`), 'แต่ละแถวลิงก์ไปหน้าใบเบิก')
    assert.ok(t.includes(h.claim_number) && t.includes(h.title), 'เลขที่ + หัวข้อ')
  }
  const net = calcTax(1070, 'included', 3).netPayable
  assert.equal(count(t, `฿${fmt(net)}`), 3, 'ยอดจ่ายจริงจาก money.calcTax')
  assert.ok(t.includes('พิมพ์ชนก ทดสอบ') && t.includes('งานเปิดตัวสินค้า ทดสอบ'), 'ผู้เบิก + ชื่องาน')
  assert.ok(!t.includes('แสดง 100 ใบแรก'), 'ไม่ตัด = ไม่มีคำเตือน')
  const empty = text(render({ q: 'ไม่มีคำนี้', hits: [], truncated: false, isAdmin: true }))
  assert.ok(empty.includes('ไม่พบใบเบิกที่ตรงกับ “ไม่มีคำนี้”'), 'ไม่พบ')
  const prompt = text(render({ q: '   ', hits: [], truncated: false, isAdmin: false }))
  assert.ok(prompt.includes('พิมพ์คำค้นแล้วกด Enter') && !prompt.includes('ไม่พบใบเบิก'), 'ยังไม่พิมพ์คำค้น')
  assert.ok(prompt.includes('เฉพาะใบเบิกของคุณ'), 'พนักงาน: บอกว่าค้นเฉพาะใบของตัวเอง')
  const cut = text(render({ q: 'ค่า', hits: Array.from({ length: 100 }, (_, i) => hit(10 + i, 'paid')), truncated: true, isAdmin: true }))
  assert.ok(cut.includes('แสดง 100 ใบแรก — พิมพ์ให้เจาะจงขึ้น') && cut.includes('ผลการค้นหา “ค่า” 100 ใบ'), 'เกิน 100 ใบ')
  pass('SearchView: หัวข้อ "ผลการค้นหา “ทดสอบ” 3 ใบ" · StatusBadge ชำระเงินแล้ว/รออนุมัติ/ปฏิเสธ · ลิงก์ /finance/[id] · ยอดจาก money.calcTax · ไม่พบ · ยังไม่พิมพ์ · แสดง 100 ใบแรก')
}

// ══ AC8 ArchiveList ทีละหน้า ══════════════════════════════════════════════════════════
{
  currentPath = '/finance/archive'
  currentSearch = 'page=2'
  const rows = Array.from({ length: 50 }, (_, i) => listClaim(100 + i))
  const props = {
    rows, total: 1600, page: 2, pageSize: 50 as const, pages: 32, netTotal: 1234567.891,
    submitters: [{ id: uid(900), name: 'พิมพ์ชนก ทดสอบ' }], events: [{ id: uid(800), name: 'งานเปิดตัวสินค้า ทดสอบ' }],
    query: { ...archiveMod.EMPTY_ARCHIVE_QUERY, page: 2 },
    categories: [],
  }
  const html = renderToStaticMarkup(createElement(archiveMod.default, props))
  const t = text(html)
  assert.ok(t.includes('1,600 รายการ'), 'จำนวนทั้งหมดที่ผ่านตัวกรอง')
  assert.ok(t.includes(`฿${fmt(1234567.891)}`), 'ยอดรวมทุกใบที่ผ่านตัวกรอง (server)')
  assert.ok(t.includes('หน้า 2 จาก 32'), 'เลขหน้า')
  const prev = html.match(/<button([^>]*)>(?:(?!<\/button>)[^])*ก่อนหน้า(?:(?!<\/button>)[^])*<\/button>/)
  const next = html.match(/<button([^>]*)>(?:(?!<\/button>)[^])*ถัดไป(?:(?!<\/button>)[^])*<\/button>/)
  assert.ok(prev && next, 'ปุ่มก่อนหน้า/ถัดไป')
  for (const b of [prev, next]) {
    assert.ok(/aria-label="หน้า(ก่อนหน้า|ถัดไป)"/.test(b[1]), 'ปุ่มหน้ามี aria-label')
    assert.ok(b[1].includes('data-variant="outline"') && b[1].includes('data-size="lg"'), 'Button outline size lg')
    assert.ok(!b[1].includes('disabled=""'), 'หน้า 2 จาก 32 กดได้ทั้งสองทาง')
  }
  const ids = new Set([...html.matchAll(/href="\/finance\/([0-9a-f-]{36})"/g)].map(m => m[1]))
  assert.equal(ids.size, 50, '50 แถวต่อหน้า')
  assert.ok(html.includes('aria-busy="false"'), 'พื้นที่รายการมี aria-busy')
  assert.ok(/<input[^>]*aria-label="ค้นหาในคลังเก็บ"/.test(html), 'ช่องค้นหาของคลังเก็บ')
  // หน้าเดียว = ไม่มีปุ่มเปลี่ยนหน้า · ไม่พบ = ปุ่มล้างตัวกรอง
  currentSearch = 'by=' + uid(900)
  const one = renderToStaticMarkup(createElement(archiveMod.default, { ...props, rows: [], total: 0, pages: 0, page: 1, netTotal: 0 }))
  assert.ok(!text(one).includes('หน้า 1 จาก') && text(one).includes('ไม่พบใบเบิกที่ตรงกับตัวกรอง') && text(one).includes('ล้างตัวกรอง'))
  currentSearch = ''
  // URL ⇄ ตัวกรอง: ค่าที่ไม่รู้จักถูกทิ้ง · หน้า 1 ไม่ใส่ page · ไป-กลับได้ค่าเดิม
  const full = { ...archiveMod.EMPTY_ARCHIVE_QUERY, page: 3, q: 'ค่า รถ', by: uid(900), type: 'event' as const, cat: 'food', amount: '1001-5000' as const, event: uid(800), month: '', efrom: '2026-09-01', eto: '2026-09-30', pfrom: '2026-09-01', pto: '2026-10-01' }
  const href = archiveMod.archiveHref(full)
  assert.ok(href.startsWith('/finance/archive?') && href.includes('page=3'))
  assert.deepEqual(archiveMod.archiveQueryFromParams(new URL(href, 'https://x').searchParams), full)
  assert.equal(archiveMod.archiveHref({ ...archiveMod.EMPTY_ARCHIVE_QUERY, page: 1 }), '/finance/archive')
  assert.deepEqual(
    archiveMod.archiveQueryFromParams(new URLSearchParams('page=-4&type=hack&amount=9&month=2026-13&efrom=2026-9-1&pto=x')),
    archiveMod.EMPTY_ARCHIVE_QUERY,
  )
  pass('ArchiveList: 50 แถว · "1,600 รายการ" + ยอดรวมของทุกใบ · "หน้า 2 จาก 32" · ปุ่มก่อนหน้า/ถัดไป = Button outline lg + aria-label · aria-busy · ไม่พบ + ล้างตัวกรอง · URL ⇄ ตัวกรองไป-กลับ ค่าแปลกถูกทิ้ง')
}

// ══ AC17 FileStatusList ══════════════════════════════════════════════════════════════
{
  const { default: FileStatusList, markUploadResult, failedUploadList, shownStatus } = fileStatus
  type Item = Parameters<typeof FileStatusList>[0]['items'][number]
  const item = (id: number, name: string, status: Item['status'], preview = ''): Item => ({ id, name, size: 150 * 1024, preview, status })
  const five = [
    item(1, 'a.jpg', 'ready', 'blob:a'), item(2, 'b.jpg', 'failed', 'blob:b'), item(3, 'c.png', 'compressing'),
    item(4, 'd.jpg', 'done', 'blob:d'), item(5, 'e.pdf', 'ready'),
  ]
  const html = renderToStaticMarkup(createElement(FileStatusList, { items: five, isEn: false, submitting: false, onRemove: () => {} }))
  const t = text(html)
  assert.equal(count(t, 'ไม่สำเร็จ'), 1, '"ไม่สำเร็จ" ครั้งเดียว')
  for (const label of ['กำลังย่อรูป', 'พร้อมส่ง', 'สำเร็จ']) assert.ok(t.includes(label), label)
  assert.ok(/<ul[^>]*aria-live="polite"/.test(html), 'aria-live="polite"')
  assert.equal(count(html, '<li '), 5, 'หนึ่งแถวต่อไฟล์')
  assert.ok(t.includes('5 ไฟล์ที่เลือก'))
  assert.ok(!html.includes('role="progressbar"'), 'ยังไม่ส่ง = ไม่มีแถบรอ')
  assert.equal(count(html, 'aria-label="ลบ '), 5, 'ปุ่มลบทุกแถว')
  const sending = renderToStaticMarkup(createElement(FileStatusList, { items: five, isEn: false, submitting: true }))
  assert.ok(sending.includes('role="progressbar"') && sending.includes('data-state="indeterminate"'), 'ระหว่างส่ง: Progress แบบไม่ระบุเปอร์เซ็นต์')
  assert.equal(count(text(sending), 'กำลังอัปโหลด'), 3, 'พร้อมส่ง + ไม่สำเร็จ (ส่งใหม่) → กำลังอัปโหลด')
  assert.equal(shownStatus('compressing', true), 'compressing')
  assert.equal(renderToStaticMarkup(createElement(FileStatusList, { items: [], isEn: false, submitting: false })), '')
  // ข้อความของ server (actions.ts uploadReceiptFiles) → ไฟล์ที่มีชื่อในข้อความ = ไม่สำเร็จ ที่เหลือกลับเป็นพร้อมส่ง
  const err = 'อัพโหลดไฟล์ไม่สำเร็จ 2 จาก 5 ไฟล์ (b.jpg, d.jpg) — ยังไม่ได้บันทึก กรุณาลองใหม่'
  assert.equal(failedUploadList(err), 'b.jpg, d.jpg')
  assert.equal(failedUploadList('จำนวนต้องเป็น 1 ขึ้นไป'), null)
  const all = five.map(it => ({ ...it, status: 'ready' as const }))
  assert.deepEqual(markUploadResult(all, err).map(it => it.status), ['ready', 'failed', 'ready', 'failed', 'ready'])
  assert.deepEqual(markUploadResult(all).map(it => it.status), ['done', 'done', 'done', 'done', 'done'])
  assert.deepEqual(markUploadResult(all, 'กรุณาเลือกอีเวนต์').map(it => it.status), ['ready', 'ready', 'ready', 'ready', 'ready'])
  assert.deepEqual(markUploadResult([item(1, '', 'ready'), item(2, '', 'ready')], 'อัพโหลดไฟล์ไม่สำเร็จ 1 จาก 2 ไฟล์ (ไฟล์ที่ 2) — ยังไม่ได้บันทึก กรุณาลองใหม่').map(it => it.status), ['ready', 'failed'])
  pass('FileStatusList: หนึ่งแถวต่อไฟล์ · aria-live="polite" · "ไม่สำเร็จ" ครั้งเดียว · ระหว่างส่ง Progress indeterminate + กำลังอัปโหลด · ข้อความ server → ไฟล์ที่ชื่ออยู่ในข้อความ = ไม่สำเร็จ')
}

// ══ AC15 ReceiptThumb ════════════════════════════════════════════════════════════════
{
  const { ReceiptThumb, appendFilePairs, settleThumb } = thumbMod
  const tag = (url: string) => renderToStaticMarkup(createElement(ReceiptThumb, { url, alt: 'ใบเสร็จ 1', className: 'w-full' }))
  const jpg = `${STORAGE}/claims/EXP-1/1_0.jpg`
  const html = tag(jpg)
  assert.ok(/^<img /.test(html), 'เป็น <img>')
  assert.ok(html.includes(`src="${STORAGE}/claims/EXP-1/1_0_thumb.jpg"`), 'src = รูปย่อ _thumb.jpg')
  assert.ok(html.includes('loading="lazy"') && html.includes('decoding="async"'), 'lazy + async')
  assert.ok(html.includes('alt="ใบเสร็จ 1"') && html.includes('class="w-full"'))
  assert.ok(tag(`${STORAGE}/claims/EXP-1/1_1.pdf`).includes(`src="${STORAGE}/claims/EXP-1/1_1.pdf"`), 'PDF ไม่มีรูปย่อ = ไฟล์เดิม')
  assert.ok(tag('https://evil.example/receipts/a.jpg').includes('src="https://evil.example/receipts/a.jpg"'), 'host อื่น = ไฟล์เดิม')
  // FormData: ตำแหน่งตรงกัน · ไม่มีรูปย่อ = Blob ว่าง
  const fd = new FormData()
  const f1 = new File(['x'.repeat(10)], 'a.jpg', { type: 'image/jpeg' })
  const t1 = new File(['y'], 'a.jpg', { type: 'image/jpeg' })
  const f2 = new File(['%PDF'], 'b.pdf', { type: 'application/pdf' })
  appendFilePairs(fd, 'receipt_files', 'receipt_thumbs', [{ file: f1, thumb: t1 }, { file: f2, thumb: null }])
  const files = fd.getAll('receipt_files') as File[]
  const thumbs = fd.getAll('receipt_thumbs') as File[]
  assert.deepEqual(files.map(f => f.name), ['a.jpg', 'b.pdf'])
  assert.deepEqual(thumbs.map(f => f.size), [1, 0], 'รูปย่อตรงตำแหน่ง · PDF = ว่าง')
  pass('ReceiptThumb: <img loading="lazy" decoding="async"> src = _thumb.jpg · PDF/host อื่น = ไฟล์เดิม · appendFilePairs ตำแหน่งตรงกัน (ว่าง = ไม่มีรูปย่อ)')

  // settleThumb: ไฟล์ใหม่ = รูปย่อ · ได้ไฟล์เดิม / ผิดพลาด = null
  pending.push((async () => {
    assert.equal(await settleThumb(f1, Promise.resolve(t1)), t1)
    assert.equal(await settleThumb(f1, Promise.resolve(f1)), null, 'browser ย่อไม่ได้ (คืนไฟล์เดิม) = ไม่มีรูปย่อ')
    assert.equal(await settleThumb(f1, Promise.reject(new Error('decode'))), null, 'ผิดพลาด = ไม่มีรูปย่อ')
    pass('settleThumb: ได้ไฟล์ใหม่ = รูปย่อ · คืนไฟล์เดิม/ผิดพลาด = null')
  })())
}

// ══ AC19 FinanceNav: ช่องค้นหาช่องเดียว ══════════════════════════════════════════════════
{
  currentPath = '/finance/search'
  currentSearch = 'q=' + encodeURIComponent('ค่าเดินทาง')
  const html = renderToStaticMarkup(createElement(FinanceNav, { role: 'admin' }))
  const forms = html.match(/<form[^>]*>/g) ?? []
  assert.equal(forms.length, 1, 'ฟอร์มเดียว')
  assert.ok(forms[0].includes('action="/finance/search"') && forms[0].includes('method="get"') && forms[0].includes('role="search"'))
  const input = html.match(/<input[^>]*name="q"[^>]*>/)?.[0] ?? ''
  assert.ok(input.includes('aria-label="ค้นหาใบเบิกทุกสถานะทุกเดือน"'), 'aria-label')
  assert.ok(input.includes('placeholder="ค้นหาเลขที่ หัวข้อ ชื่อผู้เบิก ชื่องาน — ทุกสถานะ ทุกเดือน"'), 'placeholder')
  assert.ok(input.includes('value="ค่าเดินทาง"') && input.includes('type="search"'), 'หน้าผลการค้นหา: ช่องแสดงคำที่ค้นอยู่')
  assert.ok(/min-h-10/.test(input), 'ช่องสูง ≥ 40px')
  currentPath = '/finance/archive'
  const other = renderToStaticMarkup(createElement(FinanceNav, { role: 'staff' }))
  assert.ok(!(other.match(/<input[^>]*name="q"[^>]*>/)?.[0] ?? '').includes('value="ค่าเดินทาง"'), 'หน้าอื่น: ช่องว่าง')
  assert.equal(count(other, '<form'), 1, 'พนักงานก็มีช่องค้นหา')
  currentSearch = ''
  pass('FinanceNav: <form action="/finance/search" method="get" role="search"> เดียว · Input name="q" aria-label/placeholder ภาษาไทย · หน้า /finance/search แสดงคำค้นเดิม · ทุกบทบาท')
}

// ══ AC11 FinanceDownloadView จาก cells ═════════════════════════════════════════════════
{
  const cell = (over: Partial<WhtCell>): WhtCell => ({
    submitted_by: uid(1), status: 'paid', month: '2026-09', n: 1, gross: 1000, wht: 30, net: 970,
    bank_name: null, bank_name_at: null, bank_account_number: null, bank_account_number_at: null,
    account_holder_name: null, account_holder_name_at: null, ...over,
  })
  const cells = [
    cell({ n: 2, gross: 2000, wht: 60, net: 1940, bank_name: 'ธนาคารเก่า', bank_name_at: '2026-08-01T00:00:00+00:00', bank_account_number: '111', bank_account_number_at: '2026-08-01T00:00:00+00:00' }),
    cell({ month: '2026-08', bank_name: 'ธนาคารใหม่', bank_name_at: '2026-09-15T00:00:00+00:00' }),
    cell({ status: 'approved', gross: 5000, wht: 150, net: 4850 }),
    cell({ submitted_by: uid(2), gross: 10000, wht: 300, net: 9700, account_holder_name: 'สมหญิง', account_holder_name_at: '2026-09-01T00:00:00+00:00' }),
    cell({ submitted_by: uid(3), status: 'pending_month_end', month: '2026-07' }),
  ]
  const people = [{ id: uid(1), name: 'สมชาย ทดสอบ' }, { id: uid(2), name: 'สมหญิง ทดสอบ' }]
  const html = renderToStaticMarkup(createElement(FinanceDownloadView, { cells, people, profileMap: {} }))
  const t = text(html)
  // ค่าเริ่มต้น = ชำระแล้ว ทุกเดือน: สมหญิง (หัก 300) ก่อน สมชาย (60 + 30 = 90)
  assert.ok(t.includes('2 คน • 4 รายการ'), 'จำนวนคน/รายการของสถานะชำระแล้ว')
  assert.ok(t.indexOf('สมหญิง ทดสอบ') < t.indexOf('สมชาย ทดสอบ'), 'เรียงตามยอดหักมาก → น้อย')
  assert.ok(t.includes(`฿${fmt(390)}`) && t.includes(`฿${fmt(12610)}`), 'หักรวม 390 · จ่ายจริงรวม 12,610')
  assert.ok(t.includes('ธนาคารใหม่') && !t.includes('ธนาคารเก่า'), 'บัญชี = ค่าของใบที่สร้างล่าสุด')
  assert.ok(t.includes('111'), 'ช่องที่ใบใหม่ไม่มีค่า ใช้ค่าที่ไม่ว่างล่าสุด')
  const months = [...html.matchAll(/<option value="(\d{4}-\d{2})"/g)].map(m => m[1])
  assert.deepEqual(months, ['2026-09', '2026-08', '2026-07'], 'เดือนใหม่ → เก่า (ทุกสถานะ)')
  const empty = text(renderToStaticMarkup(createElement(FinanceDownloadView, { cells: [], people: [], profileMap: {} })))
  assert.ok(empty.includes('ไม่มีใบเบิกที่มีหัก ณ ที่จ่ายในช่วงที่เลือก'))
  pass('FinanceDownloadView (cells): ต่อคน = ผลรวมของกลุ่มที่เลือก · เรียงตามยอดหัก · บัญชีธนาคาร = ค่าที่ *_at ใหม่สุด · เดือนใหม่ → เก่า · ว่าง')
}

// ══ AC25 กติกาหน้าตาของไฟล์ใหม่ (เหมือน scripts/finance-queue-view.check.ts) ════════════════════
{
  const uiFiles = ['search/search-view.tsx', 'finance-nav.tsx', 'new/file-status-list.tsx', '[id]/receipt-thumb.tsx']
  for (const file of uiFiles) {
    const src = read(path.join(FINANCE, file))
    const lines = src.split(/\r?\n/)
    assert.ok(!/text-\[(9|10|11)px\]/.test(src), `${file}: ตัวหนังสือเล็กกว่า 12px`)
    assert.ok(!/<button[\s>]/.test(src), `${file}: ใช้ <button> ดิบ`)
    assert.ok(!/getClaimStatusColor|getFundingSourceColor/.test(src), `${file}: สีสถานะ/แหล่งเงินนอก StatusBadge`)
    lines.forEach((line, i) => {
      if (/<Button[\s>]/.test(line)) assert.ok(/size="lg"|min-h-10/.test(line), `${file}:${i + 1} ปุ่มต้อง size="lg" หรือ min-h-10`)
    })
    for (const m of src.matchAll(/variant="([^"]+)"/g)) {
      assert.ok(['default', 'outline', 'ghost', 'destructive', 'secondary'].includes(m[1]), `${file}: variant="${m[1]}"`)
    }
    const labelled = new Set([...src.matchAll(/htmlFor="([^"]+)"/g)].map(m => m[1]))
    for (const m of src.matchAll(/<(Input|Textarea|SelectTrigger|Checkbox|input|select|textarea)\b/g)) {
      const attrs = openTag(src, m.index)
      const id = attrs.match(/\bid="([^"]+)"/)?.[1]
      assert.ok(/aria-label=/.test(attrs) || (id && labelled.has(id)), `${file}: <${m[1]}> ไม่มีป้ายชื่อ`)
    }
  }
  pass('ไฟล์ใหม่ (search-view, finance-nav, file-status-list, receipt-thumb): ไม่มี text-[9-11px] · ไม่มี <button> ดิบ · ทุก <Button> สูง ≥40px · variant ตามชุด · ช่องกรอกมีป้ายชื่อ · ไม่มีสีสถานะนอก StatusBadge')
}

// ══ ซอร์สของหน้าที่เปลี่ยนรูปข้อมูล ═══════════════════════════════════════════════════════
{
  const src = (file: string) => read(path.join(FINANCE, file))
  // AC3 (ส่วนของหน้าจอใบเบิก): ไม่มี calcTax สำเนา — ใช้ @/lib/finance/money ที่เดียว
  const views = [
    'claims-list-view.tsx', 'archive/archive-list.tsx', 'overview/overview-dashboard.tsx', 'download/finance-download-view.tsx',
    'payouts/payout-dashboard.tsx', '[id]/claim-detail-view.tsx', 'new/create-claim-form.tsx',
  ]
  for (const file of views) {
    const s = src(file)
    assert.ok(!/function calcTax/.test(s), `${file}: ยังมี calcTax สำเนา`)
    if (file !== 'download/finance-download-view.tsx') assert.match(s, /import \{ calcTax \} from '@\/lib\/finance\/money'/, `${file}: import calcTax`)
  }
  // AC8 คลังเก็บ: ตัวกรองอยู่ใน URL
  const archive = src('archive/archive-list.tsx')
  assert.ok(archive.includes('useSearchParams()') && !/useState[^\n]*(filter|Filter|q\b)/.test(archive), 'คลังเก็บ: ตัวกรองมาจาก useSearchParams ไม่ใช่ useState')
  assert.ok(/startTransition\(\(\) => \{\s*showQuery\(next\)\s*router\.replace\(/.test(archive), 'router.replace อยู่ใน startTransition')
  assert.ok(/setTimeout\([^\n]*, 300\)/.test(archive), 'ช่องค้นหารอ 300 ms')
  // AC10 รายงานตรวจสอบ / สรุปยอดจ่าย: ไม่มีช่องค้นหาของหน้า ช่วงวันที่อยู่ใน URL
  const overview = src('overview/overview-dashboard.tsx')
  assert.ok(!overview.includes('setSearch(') && overview.includes('router.replace(') && /preset=/.test(overview) && /&from=/.test(overview) && /&to=/.test(overview))
  for (const key of ['notes', 'staff_roles', 'tax_invoice_numbers']) assert.ok(overview.includes(`c.${key}`), `XLSX/PDF ยังอ่าน ${key}`)
  assert.ok(!src('payouts/payout-dashboard.tsx').includes('searchQuery'))
  // AC19: ไม่มีช่องค้นหาของหน้าเดิม (ย้ายไปหัวเมนู)
  for (const file of ['claims-list-view.tsx', 'overview/overview-dashboard.tsx', 'payouts/payout-dashboard.tsx']) {
    const s = src(file)
    for (const m of s.matchAll(/<input\b/g)) {
      const attrs = openTag(s, m.index)
      assert.ok(!/(placeholder|aria-label)=\{?[^}]*?['"](ค้นหา|Search)/.test(attrs), `${file}: ยังมีช่องค้นหา`)
    }
  }
  // AC14 / AC15 / AC16 หน้าใบเบิก + ฟอร์มสร้าง
  const detail = src('[id]/claim-detail-view.tsx')
  assert.equal(count(detail, '<img'), 0, 'หน้าใบเบิก: ไม่มี <img> ดิบ')
  assert.ok(count(detail, '<ReceiptThumb') >= 5, 'รูปทุกจุดผ่าน ReceiptThumb')
  assert.ok(!/\bjobEvents\s*=\s*\[\]/.test(detail) && !/jobEvents\?: JobEventOption\[\]/.test(detail), 'ไม่มี prop jobEvents')
  assert.ok(/import \{[^}]*getJobEventsForSelect[^}]*\} from '\.\.\/actions'/.test(detail) && detail.includes('กำลังโหลดรายชื่องาน'))
  const start = detail.indexOf('const startEditing = () => {')
  assert.ok(start > 0 && /setEditing\(true\)[\s\S]{0,200}getJobEventsForSelect\(\)/.test(detail.slice(start, start + 600)), 'โหลดรายชื่องานในปุ่มแก้ไข')
  for (const key of ['receipt_thumbs', 'actual_receipt_thumbs', 'refund_slip_thumbs', 'tax_invoice_thumbs']) assert.ok(detail.includes(key), `หน้าใบเบิกส่ง ${key}`)
  const form = src('new/create-claim-form.tsx')
  assert.ok(form.includes('receipt_thumbs') && form.includes('compressImage(file, THUMB_MAX_MB, THUMB_MAX_DIMENSION)') && form.includes('<FileStatusList'))
  assert.ok(detail.includes('compressImage(file, THUMB_MAX_MB, THUMB_MAX_DIMENSION)'))
  // AC4/AC5: หน้ารายการใช้แถวแบบเบา (docs) — ไม่อ่านรายการ URL
  for (const file of ['claims-list-view.tsx', 'queue-paid-section.tsx']) {
    const s = src(file)
    assert.ok(!/receipt_urls|tax_invoice_urls|refund_slip_urls|actual_receipt_urls|getClaimChecklist|claimFileCount\(|filedState\(/.test(s), `${file}: ยังอ่าน URL/ตัวช่วยของแถวเต็ม`)
    assert.ok(/checklistOf|filedStateOf/.test(s) && s.includes('ListClaim'), `${file}: ใช้ claim-docs + ListClaim`)
  }
  pass('ซอร์ส: ไม่มี calcTax สำเนา 7 หน้า · คลังเก็บ useSearchParams + router.replace ใน startTransition + รอพิมพ์ 300 ms · รายงาน/สรุปยอดจ่าย/รายการไม่มีช่องค้นหาของหน้า · หน้าใบเบิกไม่มี <img> ดิบ + โหลดรายชื่องานตอนแก้ไข + ส่ง *_thumbs · ฟอร์มสร้างใช้ FileStatusList · รายการใช้ docs')
}

// ══ AC26 หน้าจอไม่ import ค่าจากไฟล์ข้อมูลฝั่ง server ═════════════════════════════════════════
{
  const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true })
    .flatMap(e => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]))
  const DATA = /['"](?:\.\.?\/)+(?:[^'"]*\/)?(?:list|archive|search|report|claim-page|queue)-data['"]/
  const offenders: string[] = []
  for (const file of walk(FINANCE).filter(f => f.endsWith('.tsx'))) {
    const s = read(file)
    if (!/^\s*['"]use client['"]/.test(s)) continue
    for (const m of s.matchAll(/import\s+(type\s+)?(\{[^}]*\}|[\w$]+)(?:\s*,\s*\{[^}]*\})?\s+from\s+(['"][^'"]+['"])/g)) {
      if (!DATA.test(m[3]) || m[1]) continue
      const specifiers = m[2].startsWith('{') ? m[2].slice(1, -1).split(',').map(x => x.trim()).filter(Boolean) : [m[2]]
      if (specifiers.some(x => !x.startsWith('type '))) offenders.push(`${path.relative(ROOT, file)} ← ${m[3]}`)
    }
  }
  assert.deepEqual(offenders, [], 'หน้าจอ (use client) import ค่าจาก *-data.ts')
  pass('ไม่มีหน้าจอ (use client) ใต้ finance import ค่าจาก list/archive/search/report/claim-page/queue-data.ts (import type เท่านั้น)')
}

Promise.all(pending).then(
  () => console.log('\nfinance-speed-view: ผ่านทั้งหมด'),
  err => { console.error(err); process.exit(1) },
)
