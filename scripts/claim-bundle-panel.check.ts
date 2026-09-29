// หน้าต่างจับชุดเอกสาร — เรนเดอร์ BundlePanel (ส่วนแสดงผลล้วน) แบบ static ครบทุกขั้น + ตัวอ่านหัว X-Bundle-Report
// Run:  npx tsx scripts/claim-bundle-panel.check.ts
//
// ไม่แตะเครือข่าย/ฐานข้อมูล: server action (./actions) ถูกแทนด้วยตัวจำลองก่อนโหลด bundle-dialog.tsx
// ใบเบิกสังเคราะห์ทั้งหมด · ครอบคลุม AC33 ของ docs/specs/claim-document-bundle.md
// บรรทัดสุดท้ายของผลลัพธ์ต้องเป็น "claim-bundle-panel: ผ่านทั้งหมด"

import assert from 'node:assert/strict'
import Module from 'node:module'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// bundle-dialog.tsx import server action จาก ./actions — แทนด้วยตัวจำลอง (ไม่ต้องมี Supabase/cookies)
type Loader = (request: string, ...rest: unknown[]) => unknown
const M = Module as unknown as { _load: Loader }
const realLoad = M._load
M._load = function (this: unknown, request: string, ...rest: unknown[]) {
  if (request === './actions') return { markClaimsFiled: async () => assert.fail('BundlePanel ต้องไม่เรียก server action เอง') }
  return realLoad.call(this, request, ...rest)
}

/* eslint-disable @typescript-eslint/no-require-imports */
const { BundlePanel, parseBundleReport } =
  require('../app/(authenticated)/finance/bundle-dialog') as typeof import('../app/(authenticated)/finance/bundle-dialog')
const { chunkClaims } = require('../app/(authenticated)/finance/claims-filter') as typeof import('../app/(authenticated)/finance/claims-filter')
/* eslint-enable @typescript-eslint/no-require-imports */

type Panel = typeof import('../app/(authenticated)/finance/bundle-dialog')
type Props = Parameters<Panel['BundlePanel']>[0]
type Group = Props['groups'][number]
type Ref = Group['claims'][number]

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const ref = (n: number, over: Partial<Ref> = {}): Ref => ({
  id: uid(n), claim_number: `EXP-202609-${String(n).padStart(3, '0')}`, title: `ค่าใช้จ่ายทดสอบ ${n}`,
  incomplete: false, fileCount: 2, ...over,
})
const waiting = (claims: Ref[]): Group => ({ claims, status: { state: 'waiting' }, filed: { state: 'idle' } })
const noop = () => {}
const render = (over: Partial<Props>) => renderToStaticMarkup(createElement(BundlePanel, {
  step: 'options', groups: [], layout: 'one', duplex: false, isAdmin: true, isEn: false,
  onLayoutChange: noop, onDuplexChange: noop, onStart: noop, onRetry: noop, onMarkFiled: noop, onClose: noop,
  ...over,
}))
/** ข้อความล้วน (ตัดแท็ก + ถอด entity ที่ React ใส่) */
const text = (html: string) =>
  html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const count = (html: string, needle: string) => html.split(needle).length - 1
/** <input> ที่มี attribute นี้ถูกเลือกอยู่ (React เรียง checked ก่อน value) */
const inputChecked = (html: string, attr: string) =>
  (html.match(/<input[^>]*>/g) ?? []).some(tag => tag.includes(attr) && tag.includes('checked=""'))
const pass = (label: string) => console.log(`PASS  ${label}`)

// ══ ขั้นที่ 1: เลือกตัวเลือก ══════════════════════════════════════════════════════
{
  // ใบเดียว: เลขที่ + หัวข้อ · ไม่มีช่องพิมพ์สองหน้า · คำเตือนเอกสารไม่ครบ/ไม่มีไฟล์
  const single = [ref(7, { title: 'ค่าเช่าอุปกรณ์ถ่ายภาพ งานทดสอบ', incomplete: true, fileCount: 0 })]
  const html = render({ step: 'options', groups: [waiting(single)] })
  const t = text(html)
  assert.ok(t.includes('EXP-202609-007') && t.includes('ค่าเช่าอุปกรณ์ถ่ายภาพ งานทดสอบ'), 'ใบเดียวต้องแสดงเลขที่และหัวข้อ')
  assert.ok(t.includes('ไฟล์ละ 1 หน้า (อ่านง่าย)') && t.includes('รูป 2 รูปต่อหน้า (ประหยัดกระดาษ)'))
  assert.equal(count(html, 'type="radio"'), 2)
  assert.ok(inputChecked(html, 'value="one"'), 'layout one ต้องถูกเลือก')
  assert.ok(!t.includes('พิมพ์สองหน้า'), 'ใบเดียวไม่มีตัวเลือกพิมพ์สองหน้า')
  assert.ok(!html.includes('type="checkbox"'))
  assert.ok(t.includes('ใบเบิกนี้เอกสารยังไม่ครบ'))
  assert.ok(t.includes('ไม่มีไฟล์แนบ'))
  assert.ok(t.includes('ยกเลิก') && t.includes('จับชุดเอกสาร'))
  pass('ขั้นเลือก (1 ใบ): เลขที่ + หัวข้อ · การวางหน้า 2 แบบ · ไม่มีพิมพ์สองหน้า · เตือนเอกสารไม่ครบ/ไม่มีไฟล์ · ยกเลิก / จับชุดเอกสาร')

  // 45 ใบ → 3 ไฟล์ · เอกสารไม่ครบ 7 ใบ แสดง 5 เลขแรก + "และอีก 2 ใบ" · ไม่มีไฟล์ 3 ใบ · พิมพ์สองหน้าติ๊กอยู่
  const many = Array.from({ length: 45 }, (_, i) => ref(i + 1, { incomplete: i < 7, fileCount: i >= 40 && i < 43 ? 0 : 3 }))
  const groups = chunkClaims(many).map(waiting)
  const html2 = render({ step: 'options', groups, layout: 'two', duplex: true })
  const t2 = text(html2)
  assert.ok(t2.includes('ใบเบิก 45 ใบ'))
  assert.ok(t2.includes('แบ่งเป็น 3 ไฟล์ PDF (ไฟล์ละไม่เกิน 20 ใบ)'))
  assert.ok(inputChecked(html2, 'value="two"'), 'layout two ต้องถูกเลือก')
  assert.ok(t2.includes('พิมพ์สองหน้า — ให้ใบเบิกใหม่เริ่มที่กระดาษแผ่นใหม่'))
  assert.ok(inputChecked(html2, 'type="checkbox"'), 'พิมพ์สองหน้าต้องติ๊กอยู่')
  assert.ok(t2.includes('เอกสารยังไม่ครบ 7 ใบ: EXP-202609-001, EXP-202609-002, EXP-202609-003, EXP-202609-004, EXP-202609-005 และอีก 2 ใบ'))
  assert.ok(!t2.includes('EXP-202609-006'), 'แสดงเลขที่ไม่เกิน 5 ใบ')
  assert.ok(t2.includes('ไม่มีไฟล์แนบเลย 3 ใบ'))
  pass('ขั้นเลือก (45 ใบ): แบ่ง 3 ไฟล์ · layout two · พิมพ์สองหน้า · เอกสารไม่ครบแสดง 5 เลข + "และอีก 2 ใบ" · ไม่มีไฟล์ 3 ใบ')

  // ภาษาอังกฤษ
  const en = text(render({ step: 'options', groups, isEn: true }))
  assert.ok(en.includes('Two images per page (saves paper)') && en.includes('45 claims') && en.includes('and 2 more'))
  pass('ขั้นเลือก (อังกฤษ) เรนเดอร์ได้')
}

// ══ ขั้นที่ 2: กำลังจับชุด ═══════════════════════════════════════════════════════
const claims60 = Array.from({ length: 60 }, (_, i) => ref(i + 1))
const [g1, g2, g3] = chunkClaims(claims60)
const report = {
  pages: 84,
  claims: [
    { claimNumber: 'EXP-202609-001', pages: 5, included: 2, failed: [{ kind: 'receipt' as const, index: 2, reason: 'too-large' as const }] },
    { claimNumber: 'EXP-202609-003', pages: 4, included: 3, failed: [{ kind: 'tax_invoice' as const, index: 1, reason: 'unsupported' as const }] },
    { claimNumber: 'EXP-202609-004', pages: 3, included: 2, failed: [] },
  ],
}
{
  const html = render({
    step: 'working',
    groups: [
      { claims: g1, status: { state: 'done', url: 'blob:http://localhost/aaa', report }, filed: { state: 'idle' } },
      { claims: g2, status: { state: 'working' }, filed: { state: 'idle' } },
      { claims: g3, status: { state: 'waiting' }, filed: { state: 'idle' } },
    ],
  })
  const t = text(html)
  assert.ok(html.includes('aria-live="polite"'), 'ต้องมี aria-live="polite"')
  assert.ok(t.includes('กำลังจับชุดที่ 2/3'))
  assert.ok(t.includes('ชุดที่ 1/3 · EXP-202609-001 – EXP-202609-020 · 20 ใบ'))
  assert.ok(t.includes('ชุดที่ 2/3 · EXP-202609-021 – EXP-202609-040 · 20 ใบ'))
  assert.ok(t.includes('ชุดที่ 3/3 · EXP-202609-041 – EXP-202609-060 · 20 ใบ'))
  assert.ok(t.includes('84 หน้า') && t.includes('กำลังจับชุด…') && t.includes('รอคิว'))
  assert.ok(t.includes('ยกเลิก'))

  const failedHtml = render({
    step: 'working',
    groups: [
      { claims: g1, status: { state: 'failed', error: 'ไฟล์แนบรวมกันเกิน 600 หน้า — แบ่งเลือกให้น้อยลง' }, filed: { state: 'idle' } },
      { claims: g2, status: { state: 'working' }, filed: { state: 'idle' } },
    ],
  })
  const ft = text(failedHtml)
  assert.ok(ft.includes('ไม่สำเร็จ') && ft.includes('ไฟล์แนบรวมกันเกิน 600 หน้า — แบ่งเลือกให้น้อยลง') && ft.includes('ลองใหม่'))
  pass('ขั้นกำลังจับชุด: aria-live · "ชุดที่ 1/3 · EXP-…-001 – EXP-…-020 · 20 ใบ" · สถานะ 84 หน้า / กำลังจับชุด / รอคิว / ไม่สำเร็จ + ข้อความ server + ลองใหม่')
}

// ══ ขั้นที่ 3: เสร็จ — ชุดสำเร็จ 1 ชุด + ชุดล้มเหลว 1 ชุด + ไฟล์ที่รวมไม่ได้ ═════════════════════
{
  const doneGroups: Group[] = [
    { claims: g1, status: { state: 'done', url: 'blob:http://localhost/aaa', report }, filed: { state: 'idle' } },
    { claims: g2, status: { state: 'failed', error: 'ดึงข้อมูลใบเบิกไม่สำเร็จ' }, filed: { state: 'idle' } },
  ]
  const html = render({ step: 'done', groups: doneGroups })
  const t = text(html)
  assert.ok(t.includes('จับชุดเสร็จ 1/2 ชุด · ไม่สำเร็จ 1 ชุด'))
  assert.ok(/<a href="blob:http:\/\/localhost\/aaa" target="_blank" rel="noopener"[^>]*>.*?เปิด PDF/.test(html), 'เปิด PDF = <a target=_blank rel=noopener> ไปที่ blob URL')
  assert.ok(t.includes('ไฟล์ที่รวมเข้าชุดไม่ได้ 2 ไฟล์ — ต้องพิมพ์แยก'))
  assert.ok(t.includes('EXP-202609-001 · ใบเสร็จ/เอกสารแนบ 2 · ไฟล์ใหญ่เกิน 15MB'))
  assert.ok(t.includes('EXP-202609-003 · ใบกำกับภาษี 1 · ชนิดไฟล์ไม่รองรับ (รองรับ JPEG, PNG, PDF)'))
  assert.ok(html.includes(`href="/finance/${uid(1)}" target="_blank" rel="noopener"`), 'ลิงก์ไปหน้าใบเบิกเปิดแท็บใหม่')
  assert.ok(html.includes(`href="/finance/${uid(3)}"`))
  assert.ok(t.includes('ทำเครื่องหมายว่าเข้าแฟ้มแล้ว (20 ใบ)'))
  assert.equal(count(t, 'ทำเครื่องหมายว่าเข้าแฟ้มแล้ว'), 1, 'ชุดที่ล้มเหลวไม่มีปุ่มเข้าแฟ้ม')
  assert.ok(t.includes('ดึงข้อมูลใบเบิกไม่สำเร็จ') && t.includes('ลองใหม่'))
  assert.ok(t.includes('ปิด'))
  pass('ขั้นเสร็จ (แอดมิน): สรุป 1/2 · เปิด PDF (<a target=_blank rel=noopener>) · ไฟล์ที่รวมไม่ได้ "EXP-… · ชนิด ลำดับ · สาเหตุ" + ลิงก์ /finance/<id> แท็บใหม่ · ปุ่มเข้าแฟ้ม (20 ใบ) · ชุดล้มเหลว + ลองใหม่')

  // พนักงาน: ไม่มีปุ่มเข้าแฟ้ม
  const staff = text(render({ step: 'done', groups: doneGroups, isAdmin: false }))
  assert.ok(!staff.includes('ทำเครื่องหมาย'), 'พนักงานไม่เห็นปุ่มเข้าแฟ้ม')
  assert.ok(staff.includes('เปิด PDF'))

  // สถานะปุ่มเข้าแฟ้ม: กำลังบันทึก (disabled) / สำเร็จ / ล้มเหลว
  const withFiled = (filed: Group['filed']) =>
    render({ step: 'done', groups: [{ ...doneGroups[0], filed }] })
  assert.ok(/<button[^>]*disabled=""[^>]*>.*?ทำเครื่องหมายว่าเข้าแฟ้มแล้ว/.test(withFiled({ state: 'working' })))
  const filedDone = text(withFiled({ state: 'done' }))
  assert.ok(filedDone.includes('ทำเครื่องหมายแล้ว') && !filedDone.includes('ทำเครื่องหมายว่าเข้าแฟ้มแล้ว'))
  const filedFailed = text(withFiled({ state: 'failed', error: 'ยังใช้เครื่องหมายเข้าแฟ้มไม่ได้ — ต้องรันไฟล์ SQL 20260929_claim_filed.sql บนฐานข้อมูลก่อน' }))
  assert.ok(filedFailed.includes('ต้องรันไฟล์ SQL') && filedFailed.includes('ทำเครื่องหมายว่าเข้าแฟ้มแล้ว'))

  // ไม่มีรายงาน (หัวหาย/เสีย): ยังเปิด PDF ได้ แสดงว่าไม่มีรายละเอียด
  const noReport = text(render({ step: 'done', groups: [{ claims: g1, status: { state: 'done', url: 'blob:x', report: null }, filed: { state: 'idle' } }] }))
  assert.ok(noReport.includes('เปิด PDF') && noReport.includes('พร้อมแล้ว') && noReport.includes('ไม่ได้รับรายละเอียดของชุดนี้'))
  // รายงานที่ไม่มีไฟล์ล้ม
  const clean = text(render({ step: 'done', groups: [{ claims: g1, status: { state: 'done', url: 'blob:x', report: { pages: 40, claims: [] } }, filed: { state: 'idle' } }] }))
  assert.ok(clean.includes('รวมไฟล์แนบได้ครบทุกไฟล์') && clean.includes('40 หน้า'))
  // หัวรายงานถูกตัดรายการ (route ใส่ได้ไม่เกิน 50) — แสดงจำนวนจริงจาก failedTotal + บอกส่วนที่ไม่อยู่ในรายการ
  const truncated = text(render({ step: 'done', groups: [{ claims: g1, status: { state: 'done', url: 'blob:x', report: { ...report, failedTotal: 53 } }, filed: { state: 'idle' } }] }))
  assert.ok(truncated.includes('ไฟล์ที่รวมเข้าชุดไม่ได้ 53 ไฟล์') && truncated.includes('และอีก 51 ไฟล์ — ดูหน้าแจ้งใน PDF'))
  const exact = text(render({ step: 'done', groups: [{ claims: g1, status: { state: 'done', url: 'blob:x', report: { ...report, failedTotal: 2 } }, filed: { state: 'idle' } }] }))
  assert.ok(exact.includes('ไฟล์ที่รวมเข้าชุดไม่ได้ 2 ไฟล์') && !exact.includes('และอีก'))
  // อังกฤษ
  const en = text(render({ step: 'done', groups: doneGroups, isEn: true }))
  assert.ok(en.includes('Open PDF') && en.includes('Mark as filed (20)') && en.includes('File is larger than 15MB'))
  pass('ขั้นเสร็จ: พนักงานไม่มีปุ่มเข้าแฟ้ม · ปุ่มเข้าแฟ้ม กำลังบันทึก/สำเร็จ/ล้มเหลว · ไม่มีรายงาน = ยังเปิด PDF ได้ · ไม่มีไฟล์ล้ม · รายการถูกตัด (failedTotal) · อังกฤษ')
}

// ══ parseBundleReport: หัวหาย/เสีย ต้องไม่ทำให้ขั้นสรุปพัง ════════════════════════════════
{
  const enc = (v: unknown) => encodeURIComponent(JSON.stringify(v))
  assert.deepEqual(parseBundleReport(enc(report)), report, 'ถอดกลับได้ตรง')
  assert.deepEqual(parseBundleReport(enc({ ...report, failedTotal: 53 })), { ...report, failedTotal: 53 }, 'เก็บ failedTotal')
  assert.ok(!('failedTotal' in (parseBundleReport(enc({ ...report, failedTotal: 'x' })) ?? {})), 'failedTotal ที่ไม่ใช่ตัวเลขถูกทิ้ง')
  for (const bad of [null, undefined, '', '%E0%A4%A', 'not-json', enc(null), enc(42), enc({ pages: '3', claims: [] }), enc({ pages: 3 }), enc({ pages: 3, claims: {} })]) {
    assert.equal(parseBundleReport(bad), null, `หัวเสีย ${String(bad)} → null`)
  }
  // แถวที่รูปร่างผิดถูกตัด ไม่ทำให้ทั้งรายงานหาย · ชนิด/สาเหตุที่ไม่รู้จัก (รวม key ของ prototype) ถูกตัด
  const messy = parseBundleReport(enc({
    pages: 10,
    claims: [
      null, 'x', { pages: 2 },
      { claimNumber: 'EXP-1', pages: 'x', failed: [
        { kind: 'receipt', index: 1, reason: 'fetch' },
        { kind: 'toString', index: 1, reason: 'fetch' },
        { kind: 'receipt', index: 2, reason: 'constructor' },
        { kind: 'selfie', index: 3, reason: 'fetch' },
        { kind: 'receipt', index: '4', reason: 'fetch' },
      ] },
    ],
  }))
  assert.deepEqual(messy, { pages: 10, claims: [{ claimNumber: 'EXP-1', pages: 0, included: 0, failed: [{ kind: 'receipt', index: 1, reason: 'fetch' }] }] })
  pass('parseBundleReport: ถอดกลับตรง · หัวหาย/%-encoding เสีย/ไม่ใช่ JSON/รูปร่างผิด → null · แถวผิดรูปและชนิดที่ไม่รู้จักถูกตัด')
}

console.log('\nclaim-bundle-panel: ผ่านทั้งหมด')
