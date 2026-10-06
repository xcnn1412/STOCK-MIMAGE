// คิวใบเบิก (หน้าแรกของแอดมิน) — เรนเดอร์ส่วนแสดงผลล้วนแบบ static: QueueGroups/QueueHeadline, QueueRow, QueuePanelBody,
// QueueSelectionBar + ตรวจกติกาหน้าตาของไฟล์ queue-*.tsx (ขนาดตัวหนังสือ ปุ่ม ป้ายชื่อช่อง) และโครงของการทำทีละหลายใบ
// Run:  npx tsx scripts/finance-queue-view.check.ts
//
// ไม่แตะเครือข่าย/ฐานข้อมูล: server action (./lifecycle-actions, ./actions) ถูกแทนด้วยตัวจำลองที่ล้มทันทีถ้าถูกเรียก
// ใบเบิกสังเคราะห์ทั้งหมด · บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "finance-queue-view: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import fs from 'node:fs'
import Module from 'node:module'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
const mustNotCall = (name: string) => async () => assert.fail(`ส่วนแสดงผลต้องไม่เรียก server action เอง (${name})`)
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === './lifecycle-actions' || request === './actions') {
    return new Proxy({}, { get: (_t, key) => (typeof key === 'string' ? mustNotCall(key) : undefined) })
  }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { QueueGroups, QueueHeadline } = require('../app/(authenticated)/finance/queue-groups') as typeof import('../app/(authenticated)/finance/queue-groups')
const { QueueRow, rowActions } = require('../app/(authenticated)/finance/queue-row') as typeof import('../app/(authenticated)/finance/queue-row')
const { QueuePanelBody } = require('../app/(authenticated)/finance/queue-panel') as typeof import('../app/(authenticated)/finance/queue-panel')
const { QueueSelectionBar } = require('../app/(authenticated)/finance/queue-selection-bar') as typeof import('../app/(authenticated)/finance/queue-selection-bar')
const queue = require('../app/(authenticated)/finance/claim-queue') as typeof import('../app/(authenticated)/finance/claim-queue')
const { paymentLock } = require('../app/(authenticated)/finance/claim-rules') as typeof import('../app/(authenticated)/finance/claim-rules')
const { calcTax } = require('../lib/finance/money') as typeof import('../lib/finance/money')
/* eslint-enable @typescript-eslint/no-require-imports */

type QueueClaim = import('../app/(authenticated)/finance/queue-data').QueueClaim
type RowProps = Parameters<typeof QueueRow>[0]
type PanelProps = Parameters<typeof QueuePanelBody>[0]

const ROOT = path.resolve(__dirname, '..')
const FINANCE = path.join(ROOT, 'app', '(authenticated)', 'finance')
const NOW = new Date('2026-09-30T12:00:00.000Z')
const DAY = 24 * 60 * 60 * 1000
const ago = (days: number, hours = 0) => new Date(NOW.getTime() - days * DAY - hours * 3600000).toISOString()
const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const noop = () => {}

let seq = 0
function claim(status: string, ages: number, over: Partial<QueueClaim> = {}): QueueClaim {
  seq += 1
  return {
    id: uid(seq), claim_number: `EXP-202609-${String(200 + seq)}`, claim_type: 'event',
    title: `ค่าใช้จ่ายทดสอบ ${seq}`, amount: 1000, vat_mode: 'none', withholding_tax_rate: 0,
    status: status as QueueClaim['status'], category: 'food', submitted_by: uid(900), submitted_at: ago(ages),
    approved_at: null, paid_at: null, created_at: ago(ages + 1), expense_date: '2026-09-01', funding_source: 'company',
    job_event_id: null, receipt_urls: ['https://fake.supabase.co/storage/v1/object/public/receipts/r.jpg'],
    actual_receipt_urls: null, tax_invoice_urls: null, tax_invoice_numbers: null, refund_slip_urls: null,
    refund_amount: null, refund_confirmed_at: null, actual_spent_amount: null, advance_settled_at: null,
    pettycash_fund_id: null, reject_reason: null, bank_name: 'ธนาคารทดสอบ', bank_account_number: '000-0-01234-5',
    account_holder_name: 'ผู้รับทดสอบ', submitter: { id: uid(900), full_name: 'พิมพ์ชนก ทดสอบ' },
    job_event: { id: uid(800), event_name: 'งานเปิดตัวสินค้า ทดสอบ' },
    status_changed_at: ago(ages), deleted_at: null, submitter_outstanding: 0,
    ...over,
  }
}

/** ข้อความล้วน (ตัดแท็ก + ถอด entity ที่ React ใส่) */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const count = (html: string, needle: string | RegExp) =>
  typeof needle === 'string' ? html.split(needle).length - 1 : (html.match(new RegExp(needle, 'g')) ?? []).length
/** ไอคอนหนึ่งตัว — หยุดที่ </svg> แรก (ไม่ลามข้ามไปปุ่มถัดไป) */
const SVG = '(?:<svg(?:(?!</svg>)[^])*</svg>)?'
/** <button> ทั้งปุ่มที่ข้อความข้างในตรงกับ label พอดี (มีไอคอนหน้า/หลังได้) — [0] = ทั้งปุ่ม · [1] = attribute */
const buttonMatch = (html: string, label: string) => {
  const esc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return html.match(new RegExp(`<button([^>]*)>${SVG}${esc}${SVG}</button>`))
}
const buttonTag = (html: string, label: string) => buttonMatch(html, label)?.[1] ?? null
/** ปุ่มปิดอยู่ (disabled attribute — ไม่ใช่คลาส disabled:…) */
const isDisabled = (html: string, label: string) => !!buttonTag(html, label)?.includes('disabled=""')
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
/** จำนวนบรรทัดแบบ wc -l */
const wcl = (src: string) => (src.match(/\n/g) ?? []).length
const pass = (label: string) => console.log(`PASS  ${label}`)
const LOCK = ['เอกสารไม่ครบ', 'ยังจ่ายไม่ได้'].join(' — ')

const renderRow = (over: Partial<RowProps> & { claim: QueueClaim }) => renderToStaticMarkup(createElement(QueueRow, {
  group: 'review', actions: rowActions(over.claim, false, 'row'), isEn: false, now: NOW, onOpen: noop, onAction: noop, ...over,
}))
const renderPanel = (over: Partial<PanelProps> & { claim: QueueClaim }) => renderToStaticMarkup(createElement(QueuePanelBody, {
  isEn: false, busy: null, error: null, onAction: noop, onSendBack: noop, onPrev: noop, onNext: noop, hasPrev: false, hasNext: true, ...over,
}))

// ══ AC12 กลุ่ม + หัวข้อ ══════════════════════════════════════════════════════════
{
  // สังเคราะห์: ต้องตรวจ 6 · รอใบกำกับ 3 · รอจ่าย 4 · ทดลองจ่าย 2 (รอยืนยันเงินคืน 1) · แบบร่างค้างนาน 23
  const claims = [
    ...Array.from({ length: 6 }, (_, i) => claim('pending', 1 + (i % 3))),
    ...Array.from({ length: 3 }, () => claim('waiting_tax_invoice', 5)),
    ...Array.from({ length: 4 }, () => claim('approved', 2)),
    claim('paid', 2, { claim_type: 'advance', actual_spent_amount: null }),
    claim('paid', 2, { claim_type: 'advance', actual_spent_amount: 700, refund_amount: 300 }),
    ...Array.from({ length: 23 }, () => claim('draft', 40)),
  ]
  const groups = queue.groupClaims(claims, NOW)
  const counts = queue.queueCounts(groups)
  assert.deepEqual(counts, { review: 6, tax_invoice: 3, pay: 4, advance: 2, stale: 23 })

  const html = renderToStaticMarkup(createElement(QueueGroups, { counts, active: 'review', isEn: false, onSelect: noop }))
  const buttons = html.match(/<button[^>]*>/g) ?? []
  assert.equal(buttons.length, 5, 'การ์ดกลุ่ม 5 ปุ่ม')
  assert.ok(buttons.every(b => /aria-pressed="(true|false)"/.test(b)), 'ทุกปุ่มมี aria-pressed')
  assert.equal(count(html, 'aria-pressed="true"'), 1, 'กลุ่มที่เปิดอยู่มีปุ่มเดียว')
  assert.ok(/aria-pressed="true"[^>]*>.*?6.*?ต้องตรวจ/.test(html), 'ต้องตรวจเป็นกลุ่มที่เปิด')
  const t = text(html)
  for (const [label, n] of [['ต้องตรวจ', 6], ['รอใบกำกับภาษี', 3], ['รอจ่าย', 4], ['รอเคลียร์เงินทดลองจ่าย', 2], ['ค้างนาน', 23]] as const) {
    assert.ok(t.includes(`${n}${label}`), `การ์ด ${label} = ${n}`)
  }
  const order = ['ต้องตรวจ', 'รอใบกำกับภาษี', 'รอจ่าย', 'รอเคลียร์เงินทดลองจ่าย', 'ค้างนาน'].map(l => t.indexOf(l))
  assert.deepEqual(order, [...order].sort((a, b) => a - b), 'ลำดับกลุ่มตามสัญญา')

  const head = text(renderToStaticMarkup(createElement(QueueHeadline, { waiting: queue.waitingOnAdmin(groups), stale: counts.stale, isEn: false })))
  assert.equal(head, 'งานที่รอคุณ 14 ใบ · ค้างนานเกินกำหนด 23 ใบ')
  const en = text(renderToStaticMarkup(createElement(QueueGroups, { counts, active: 'stale', isEn: true, onSelect: noop })))
  assert.ok(en.includes('To review') && en.includes('Overdue'))
  pass('QueueGroups: 5 ปุ่ม aria-pressed · ป้าย/จำนวนตามลำดับ · หัวข้อ "งานที่รอคุณ 14 ใบ · ค้างนานเกินกำหนด 23 ใบ"')
}

// ══ AC12 แถว ═══════════════════════════════════════════════════════════════
{
  const review = claim('pending', 2, { title: 'ค่าอาหารทีมงาน 12 คน', amount: 3600, receipt_urls: [], status_changed_at: ago(2, 3) })
  const html = renderRow({ claim: review })
  const t = text(html)
  assert.ok(t.includes(review.claim_number) && t.includes('ค่าอาหารทีมงาน 12 คน') && t.includes('พิมพ์ชนก ทดสอบ'))
  assert.ok(t.includes('งานเปิดตัวสินค้า ทดสอบ'), 'ชื่องานในบรรทัดรอง')
  assert.ok(t.includes('฿3,600'), 'ยอด')
  assert.ok(t.includes('ยื่นเมื่อ 2 วัน ก่อน'), 'อายุของแถวต้องตรวจ')
  assert.ok(t.includes('ขาดใบเสร็จ'), 'ป้ายขาดใบเสร็จ')
  assert.deepEqual(rowActions(review, false, 'row').map(a => a.key), ['send_back', 'approve'])
  assert.ok(buttonTag(html, 'ส่งกลับให้แก้')?.includes('data-variant="outline"'), 'ส่งกลับให้แก้ = outline')
  assert.ok(buttonTag(html, 'อนุมัติ')?.includes('data-variant="default"'), 'อนุมัติ = ปุ่มหลัก')
  assert.ok(html.includes(`href="/finance/${review.id}"`) && t.includes('เปิดใบ'), 'ลิงก์เปิดใบ')
  assert.ok(!html.includes('role="checkbox"'), 'ไม่อยู่ในโหมดเลือก = ไม่มีช่องติ๊ก')

  const tax = claim('waiting_tax_invoice', 31)
  const taxHtml = renderRow({ claim: tax, group: 'tax_invoice' })
  assert.ok(text(taxHtml).includes('ต้องมีใบกำกับ') && text(taxHtml).includes('รอมาแล้ว 31 วัน'))
  const complete = claim('approved', 3)
  const okHtml = renderRow({ claim: complete, group: 'pay' })
  assert.ok(text(okHtml).includes('เอกสารครบ'))
  assert.deepEqual(rowActions(complete, false, 'row').map(a => a.key), ['request_tax_invoice', 'defer_month_end', 'pay'])
  for (const label of ['ขอใบกำกับภาษี', 'ย้ายไปจ่ายสิ้นเดือน', 'จ่าย']) {
    const tag = buttonTag(okHtml, label)
    assert.ok(tag && !tag.includes('disabled=""'), `ปุ่ม ${label} กดได้`)
  }

  // ล็อกการจ่าย: ปุ่มจ่ายปิด + title = ข้อความล็อก + ข้อความใต้ปุ่ม + มีส่งกลับให้แก้
  const locked = claim('approved', 3, { receipt_urls: [] })
  const lockHtml = renderRow({ claim: locked, group: 'pay' })
  const payTag = buttonTag(lockHtml, 'จ่าย')
  assert.ok(payTag, 'มีปุ่มจ่าย')
  assert.ok(payTag.includes('disabled=""'), 'ปุ่มจ่ายปิด')
  assert.ok(payTag.includes(`title="${paymentLock(locked).message}"`), 'title = ข้อความล็อก')
  assert.equal(paymentLock(locked).message, `${LOCK} (ขาด: ใบเสร็จ)`)
  assert.ok(text(lockHtml).includes(paymentLock(locked).message), 'ข้อความล็อกแสดงใต้ปุ่ม')
  assert.deepEqual(rowActions(locked, false, 'row').map(a => a.key), ['send_back', 'request_tax_invoice', 'defer_month_end', 'pay'])
  assert.ok(text(lockHtml).includes('อนุมัติแล้ว'), 'กลุ่มรอจ่ายแสดงป้ายสถานะ')

  // ทดลองจ่าย · แบบร่างค้างนาน · ใบที่ซ่อน · โหมดเลือก · ข้อผิดพลาด · กำลังทำงาน
  const unsettled = claim('paid', 3, { claim_type: 'advance', actual_spent_amount: null })
  const unsettledHtml = renderRow({ claim: unsettled, group: 'advance' })
  assert.ok(text(unsettledHtml).includes('รอผู้เบิกเคลียร์') && !text(unsettledHtml).includes('เอกสารครบ'))
  assert.deepEqual(rowActions(unsettled, false, 'row'), [])
  const refund = claim('paid', 3, { claim_type: 'advance', actual_spent_amount: 700, refund_amount: 300 })
  const refundHtml = renderRow({ claim: refund, group: 'advance' })
  assert.ok(text(refundHtml).includes('รอยืนยันเงินคืน') && buttonTag(refundHtml, 'ยืนยันเงินคืน'))
  const staleDraft = claim('draft', 40)
  const draftHtml = renderRow({ claim: staleDraft, group: 'stale' })
  assert.ok(buttonTag(draftHtml, 'ซ่อนใบเบิก') && text(draftHtml).includes('รอมาแล้ว 40 วัน') && text(draftHtml).includes('แบบร่าง'))
  assert.deepEqual(rowActions(claim('draft', 40, { claim_type: 'petty_cash' }), false, 'row'), [], 'เงินสดย่อยซ่อนไม่ได้')
  assert.deepEqual(rowActions(claim('draft', 40, { pettycash_fund_id: uid(5) }), false, 'row'), [])
  const hidden = claim('approved', 3, { deleted_at: ago(0, 5) })
  const hiddenHtml = renderRow({ claim: hidden, group: 'hidden', actions: [{ key: 'restore', label: 'กู้คืน', variant: 'outline' }] })
  assert.ok(text(hiddenHtml).includes('ซ่อนเมื่อ 5 ชม. ก่อน') && buttonTag(hiddenHtml, 'กู้คืน'))
  const selectHtml = renderRow({ claim: review, selecting: true, selected: true })
  assert.ok(/role="checkbox" aria-checked="true"/.test(selectHtml) && selectHtml.includes(`aria-label="เลือก ${review.claim_number}"`))
  const errHtml = renderRow({ claim: complete, group: 'pay', error: 'สถานะใบเบิกเปลี่ยนไปแล้ว' })
  assert.ok(/role="alert"[^>]*>สถานะใบเบิกเปลี่ยนไปแล้ว</.test(errHtml), 'ข้อผิดพลาดใต้ปุ่มของแถว')
  const busyHtml = renderRow({ claim: complete, group: 'pay', busyKey: 'pay' })
  assert.ok(isDisabled(busyHtml, 'จ่าย') && buttonMatch(busyHtml, 'จ่าย')?.[0].includes('animate-spin'), 'ปุ่มที่กำลังทำงานหมุนและปิด')
  assert.ok(isDisabled(busyHtml, 'ขอใบกำกับภาษี'), 'ปุ่มอื่นของแถวปิดระหว่างทำงาน')
  assert.ok(text(renderRow({ claim: review, isEn: true })).includes('Submitted 2 days ago'))
  pass('QueueRow: เลขที่/หัวข้อ/ผู้เบิก/งาน/฿3,600/"ยื่นเมื่อ 2 วัน ก่อน" · ป้ายเอกสาร 3 แบบ · ล็อกการจ่าย (disabled + title + ข้อความ) · ทดลองจ่าย · ค้างนาน · ใบที่ซ่อน · โหมดเลือก · ข้อผิดพลาด · กำลังทำงาน')
}

// ══ AC12 + AC15 แผงข้าง ═══════════════════════════════════════════════════════════
{
  const files = claim('pending', 1, {
    amount: 1070, vat_mode: 'included', withholding_tax_rate: 3,
    receipt_urls: ['https://fake.supabase.co/r/a.jpg', 'https://fake.supabase.co/r/b.png'],
    actual_receipt_urls: ['https://fake.supabase.co/r/c.jpg'],
    tax_invoice_urls: ['https://fake.supabase.co/r/tax.PDF?token=1', ''],
    refund_slip_urls: ['javascript:alert(1)'],
  })
  const html = renderPanel({ claim: files, hasPrev: false, hasNext: true })
  const t = text(html)
  assert.equal(count(html, /<img [^>]*loading="lazy"/), 3, '3 รูปโหลดเมื่อเลื่อนถึง')
  assert.equal(count(html, 'data-kind="pdf"'), 1, 'PDF เป็นลิงก์')
  assert.ok(html.includes('href="https://fake.supabase.co/r/tax.PDF?token=1" target="_blank" rel="noopener noreferrer"'))
  assert.ok(!html.includes('javascript:'), 'ลิงก์ที่ไม่ใช่ http(s) ไม่แสดง')
  const tax = calcTax(1070, 'included', 3)
  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  assert.ok(t.includes(`ยอด฿${fmt(1070)}`), 'ยอด')
  assert.ok(t.includes(`VAT฿${fmt(tax.vatAmount)}`) && fmt(tax.vatAmount) === '70.00', 'VAT')
  assert.ok(t.includes(`หัก ณ ที่จ่าย−฿${fmt(tax.whtAmount)}`) && fmt(tax.whtAmount) === '30.00', 'หัก ณ ที่จ่าย')
  assert.ok(t.includes(`ยอดจ่ายจริง฿${fmt(tax.netPayable)}`) && fmt(tax.netPayable) === '1,040.00', 'ยอดจ่ายจริง')
  assert.ok(t.includes('ผู้เบิกพิมพ์ชนก ทดสอบ') && t.includes('งานงานเปิดตัวสินค้า ทดสอบ') && t.includes('รับเงินที่ธนาคารทดสอบ ••••2345'))
  assert.ok(t.includes('แหล่งเงินเงินบริษัท'))
  assert.ok(t.includes('หมวดหมู่') && t.includes('วันที่ใช้จ่าย'))
  // ปุ่มล่าง: รออนุมัติ = ปฏิเสธ (ghost) · ส่งกลับให้แก้ (outline) · อนุมัติรอจ่ายสิ้นเดือน · อนุมัติ (หลัก) · ลิงก์หน้าใบเบิก · ก่อนหน้า/ถัดไป
  assert.ok(buttonTag(html, 'ปฏิเสธ')?.includes('data-variant="ghost"'))
  assert.ok(buttonTag(html, 'ส่งกลับให้แก้')?.includes('data-variant="outline"'))
  assert.ok(buttonTag(html, 'อนุมัติ — รอจ่ายสิ้นเดือน'))
  assert.ok(buttonTag(html, 'อนุมัติ')?.includes('data-variant="default"'))
  assert.ok(new RegExp(`<a[^>]*href="/finance/${files.id}"[^>]*>.*?เปิดหน้าใบเบิก</a>`).test(html))
  assert.ok(isDisabled(html, 'ก่อนหน้า'), 'ใบแรก: ก่อนหน้ากดไม่ได้')
  assert.ok(buttonTag(html, 'ถัดไป') && !isDisabled(html, 'ถัดไป'), 'ถัดไปกดได้')

  const primaryOf = (c: QueueClaim) => rowActions(c, false, 'panel').filter(a => a.variant === 'default').map(a => a.label)
  assert.deepEqual(primaryOf(claim('approved', 1)), ['จ่าย'], 'รอจ่าย → จ่าย')
  assert.deepEqual(primaryOf(claim('waiting_tax_invoice', 1, { tax_invoice_numbers: ['IV-1'] })), ['จ่าย'], 'รอใบกำกับ → จ่าย')
  assert.deepEqual(primaryOf(claim('paid', 1, { claim_type: 'advance', actual_spent_amount: 1, refund_amount: 5 })), ['ยืนยันเงินคืน'])
  for (const s of ['approved', 'waiting_tax_invoice', 'pending_month_end']) {
    assert.ok(rowActions(claim(s, 1), false, 'panel').some(a => a.key === 'send_back' && a.variant === 'outline'), `${s}: แผงมีส่งกลับให้แก้`)
  }

  const locked = renderPanel({ claim: claim('waiting_tax_invoice', 1, { receipt_urls: [] }), busy: null, error: 'บันทึกไม่สำเร็จ' })
  assert.ok(text(locked).includes(`${LOCK} (ขาด: ใบเสร็จ, ใบกำกับภาษี)`), 'แผงแสดงข้อความล็อก')
  assert.ok(buttonTag(locked, 'จ่าย')?.includes('disabled=""'))
  assert.ok(/role="alert"[^>]*>บันทึกไม่สำเร็จ</.test(locked), 'ข้อผิดพลาดในแผง')
  const sentBack = text(renderPanel({ claim: claim('draft', 40, { reject_reason: 'ใบเสร็จอ่านไม่ออก' }) }))
  assert.ok(sentBack.includes('ส่งกลับให้แก้: ใบเสร็จอ่านไม่ออก') && sentBack.includes('ซ่อนใบเบิก'))
  const busy = renderPanel({ claim: claim('pending', 1), busy: 'approve' })
  assert.ok(isDisabled(busy, 'อนุมัติ') && buttonMatch(busy, 'อนุมัติ')?.[0].includes('animate-spin'), 'ปุ่มที่กำลังทำงานหมุน')
  assert.ok(isDisabled(busy, 'ส่งกลับให้แก้') && isDisabled(busy, 'ปฏิเสธ'), 'ปุ่มอื่นปิดระหว่างทำงาน')
  assert.ok(text(renderPanel({ claim: claim('pending', 1, { receipt_urls: [] }) })).includes('ยังไม่มีไฟล์แนบ'))
  pass('QueuePanelBody: 3 <img loading="lazy"> + PDF เป็นลิงก์ · ไม่แสดง URL ที่ไม่ใช่ http(s) · ยอด/VAT/หัก ณ ที่จ่าย/ยอดจ่ายจริงจาก calcTax · ข้อมูลผู้เบิก/งาน/บัญชี 4 ตัวท้าย · ปุ่มหลักตามกลุ่ม + ส่งกลับให้แก้ outline + ลิงก์หน้าใบเบิก · ล็อก · เหตุผลที่ส่งกลับ')
}

// ══ AC14 แถบเลือกหลายใบ ════════════════════════════════════════════════════════
{
  const bar = (over: Partial<Parameters<typeof QueueSelectionBar>[0]>) => renderToStaticMarkup(createElement(QueueSelectionBar, {
    count: 3, selectAllLabel: 'เลือกทุกใบในกลุ่มนี้ (6)', selectAllDisabled: false,
    bulk: [
      { action: 'approve', label: 'อนุมัติ 3 ใบ', primary: true, disabled: false },
      { action: 'request_tax_invoice', label: 'ขอใบกำกับภาษี', disabled: true },
      { action: 'defer_month_end', label: 'ย้ายไปจ่ายสิ้นเดือน', disabled: true },
      { action: 'pay', label: 'จ่าย 0 ใบ', disabled: true },
    ],
    busy: null, overBulkMax: false, atSelectLimit: false, selectLimit: 200, isEn: false,
    onSelectAll: noop, onClear: noop, onExit: noop, onBulk: noop, onBundle: noop, ...over,
  }))
  const html = bar({})
  const t = text(html)
  for (const label of ['เลือกแล้ว 3 ใบ', 'เลือกทุกใบในกลุ่มนี้ (6)', 'อนุมัติ 3 ใบ', 'ขอใบกำกับภาษี', 'ย้ายไปจ่ายสิ้นเดือน', 'จ่าย 0 ใบ', 'จับชุดเอกสาร', 'ล้างที่เลือก', 'ออกจากโหมดเลือก']) {
    assert.ok(t.includes(label), `แถบเลือกมี "${label}"`)
  }
  assert.ok(!buttonTag(html, 'อนุมัติ 3 ใบ')?.includes('disabled=""'), 'อนุมัติกดได้')
  assert.ok(buttonTag(html, 'จ่าย 0 ใบ')?.includes('disabled=""'), 'ไม่มีใบที่จ่ายได้ = ปิด')
  assert.ok(!t.includes('ทำได้ครั้งละไม่เกิน 50 ใบ'))
  const over = bar({ count: 51, overBulkMax: true })
  for (const label of ['อนุมัติ 3 ใบ', 'ขอใบกำกับภาษี', 'ย้ายไปจ่ายสิ้นเดือน', 'จ่าย 0 ใบ']) {
    assert.ok(buttonTag(over, label)?.includes('disabled=""'), `เกิน 50 ใบ: ${label} ปิด`)
  }
  assert.ok(text(over).includes('ทำได้ครั้งละไม่เกิน 50 ใบ'), 'คำแนะนำเมื่อเลือกเกิน 50 ใบ')
  assert.ok(buttonTag(over, 'จับชุดเอกสาร') && !isDisabled(over, 'จับชุดเอกสาร'), 'จับชุดเอกสารยังทำได้ (เพดาน 200)')
  assert.equal(queue.BULK_MAX, 50)
  pass('QueueSelectionBar: ป้ายตามสัญญา · ปุ่มที่ไม่มีใบทำได้ปิด · เลือกเกิน 50 ใบ = ปุ่มทำทีละหลายใบปิดทุกปุ่ม + "ทำได้ครั้งละไม่เกิน 50 ใบ"')

  // queue-view.tsx: bulkClaimAction ถูกเรียกในฟังก์ชันเดียว ยืนยัน (askConfirm) ครั้งเดียวก่อนเรียก ไม่อยู่ในลูป
  const src = fs.readFileSync(path.join(FINANCE, 'queue-view.tsx'), 'utf8')
  assert.equal(count(src, 'bulkClaimAction('), 1, 'เรียก bulkClaimAction ที่เดียว')
  const start = src.indexOf('const runBulk = async')
  const end = src.indexOf('\n  const ', start + 1)
  assert.ok(start > 0 && end > start, 'หา runBulk ได้')
  const body = src.slice(start, end)
  assert.ok(body.includes('bulkClaimAction('), 'bulkClaimAction อยู่ใน runBulk')
  assert.equal(count(body, 'askConfirm('), 1, 'ยืนยันครั้งเดียวต่อชุด')
  assert.ok(body.indexOf('askConfirm(') < body.indexOf('bulkClaimAction('), 'ยืนยันก่อนเรียก')
  assert.ok(!/(for\s*\(|\.map\(|\.forEach\()[^\n]*(askConfirm|bulkClaimAction)\(/.test(body), 'ไม่เรียกทีละใบในลูป')
  assert.ok(body.includes('applyBulkResults(selected, res.results)') && body.includes('setSelected(applied.selected)'), 'ใบที่สำเร็จออกจากที่เลือก')
  assert.ok(body.includes('applied.errors.forEach((message, id) => next.set(id, message))'), 'ใบที่ไม่สำเร็จแสดงข้อความในแถว')
  assert.ok(src.includes('disabled: n === 0 || overBulkMax'), 'ปุ่มปิดเมื่อไม่มีใบทำได้หรือเลือกเกิน BULK_MAX')
  assert.ok(src.includes('const overBulkMax = selectedClaims.length > BULK_MAX'))
  assert.ok(/nextInGroup\(list, id\)/.test(src) && src.includes('if (fromPanel) advancePanel('), 'ทำในแผงข้างสำเร็จแล้วไปใบถัดไป (nextInGroup)')
  pass('queue-view.tsx: bulkClaimAction ที่เดียวใน runBulk · askConfirm ครั้งเดียวก่อนเรียก · ไม่มีลูป · ผลต่อใบ (ที่เลือก + ข้อความในแถว) · แผงข้างไปใบถัดไป')
}

// ══ AC13 / AC15 / AC27 กติกาหน้าตาของไฟล์ ═══════════════════════════════════════════════
{
  const uiFiles = [
    'queue-view.tsx', 'queue-groups.tsx', 'queue-row.tsx', 'queue-panel.tsx', 'queue-selection-bar.tsx', 'queue-paid-section.tsx',
    'status-badge.tsx', 'send-back-dialog.tsx',
  ]
  for (const file of uiFiles) {
    const src = fs.readFileSync(path.join(FINANCE, file), 'utf8')
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
    // ช่องกรอกทุกช่องมี aria-label หรือ id ที่ผูกกับ <Label htmlFor> · <Select> ดูที่ <SelectTrigger> ของมัน
    const labelled = new Set([...src.matchAll(/htmlFor="([^"]+)"/g)].map(m => m[1]))
    for (const m of src.matchAll(/<(Input|Textarea|SelectTrigger|Checkbox|input|select|textarea)\b/g)) {
      const attrs = openTag(src, m.index)
      const id = attrs.match(/\bid="([^"]+)"/)?.[1]
      assert.ok(/aria-label=/.test(attrs) || (id && labelled.has(id)), `${file}: <${m[1]}> ไม่มีป้ายชื่อ`)
    }
    if (file.startsWith('queue-')) assert.ok(wcl(src) <= 600, `${file}: ${wcl(src)} บรรทัด (เกิน 600)`)
  }
  for (const file of ['claim-queue.ts']) {
    const n = fs.readFileSync(path.join(FINANCE, file), 'utf8').split(/\r?\n/).length
    assert.ok(n <= 600, `${file}: ${n} บรรทัด`)
  }
  const panel = fs.readFileSync(path.join(FINANCE, 'queue-panel.tsx'), 'utf8')
  assert.ok(panel.includes("from '@/components/ui/sheet'") && panel.includes('side="right"'), 'แผงข้างเป็น Sheet ด้านขวา')
  for (const file of ['queue-row.tsx', 'queue-panel.tsx', 'claim-queue.ts']) {
    assert.ok(fs.readFileSync(path.join(FINANCE, file), 'utf8').includes('paymentLock('), `${file}: ใช้ paymentLock(`)
  }
  // ไฟล์ของหน้าจอ import ค่าจาก queue-data.ts (server-only) ไม่ได้ — import type เท่านั้น
  for (const file of uiFiles.concat('claim-queue.ts')) {
    const src = fs.readFileSync(path.join(FINANCE, file), 'utf8')
    assert.ok(!/import\s+\{[^}]*\}\s+from\s+'\.\/queue-data'/.test(src), `${file}: import ค่าจาก queue-data.ts`)
  }
  pass('ไฟล์หน้าจอ: ไม่มี text-[9-11px] · ไม่มี <button> ดิบ · ทุก <Button> สูง ≥40px · variant ตามชุด · ช่องกรอกมีป้ายชื่อ · ≤600 บรรทัด · Sheet side="right" · paymentLock( ครบ · queue-data เป็น import type')
}

// ══ AC16 page.tsx ═══════════════════════════════════════════════════════════════
{
  const src = fs.readFileSync(path.join(FINANCE, 'page.tsx'), 'utf8')
  const adminStart = src.indexOf('if (isAdmin) {')
  const staffStart = src.indexOf('// พนักงาน:')
  assert.ok(adminStart > 0 && staffStart > adminStart, 'แยกทางแอดมิน/พนักงาน')
  const admin = src.slice(adminStart, staffStart)
  const staff = src.slice(staffStart)
  assert.ok(admin.includes('getQueueClaims()') && admin.includes('<QueueView') && !admin.includes('getClaims({ open: true })'))
  // ขั้น 3: ใบที่จ่ายแล้วของเดือนโหลดด้วย getPaidClaimsLean (list-data.ts — แถวแบบเบา) เฉพาะเมื่อ status=paid · ที่อื่นในทางแอดมินไม่โหลด
  assert.ok(/const paid = showPaid && paidMonth\s*\?\s*await getPaidClaimsLean\(viewer, paidMonth\)\s*:\s*null/.test(admin), 'โหลดเดือนที่จ่ายเฉพาะ status=paid')
  assert.equal(admin.split('getPaidClaimsLean(').length - 1, 1, 'ทางแอดมินโหลดใบที่จ่ายแล้วที่เดียว (หลังเช็ก status=paid)')
  assert.ok(!admin.includes('getStaffOpenClaims'), 'ทางแอดมินไม่เรียกตัวโหลดรายการของพนักงาน')
  assert.ok(admin.includes("const showPaid = params.status === 'paid'"))
  // ขั้น 3: พนักงานโหลดเฉพาะใบที่ยังไม่จบของตัวเองด้วย getStaffOpenClaims(viewer) (list-data.ts — claimsQuery บังคับเป็นของตัวเอง)
  assert.ok(staff.includes('getStaffOpenClaims(viewer)') && staff.includes('<ClaimsListView') && !staff.includes('getQueueClaims') && !staff.includes('getPaidClaimsLean'))
  pass('page.tsx: แอดมิน = getQueueClaims → <QueueView> (ไม่มีตัวโหลดของพนักงาน) · ใบที่จ่ายแล้วโหลดด้วย getPaidClaimsLean เมื่อ status=paid เท่านั้น · พนักงาน = getStaffOpenClaims(viewer) → <ClaimsListView>')
}

console.log('\nfinance-queue-view: ผ่านทั้งหมด')
