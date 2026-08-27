/**
 * scripts/doc-pdf-check.ts — ตรวจว่า renderer PDF ของโมดูลเอกสารเรนเดอร์ผ่านทั้ง 3 กลุ่ม
 * (การเงิน / รายการอย่างเดียว / จดหมาย) ด้วยข้อมูลปลอมในหน่วยความจำ — ไม่แตะ DB
 *
 *   npx tsx scripts/doc-pdf-check.ts        (ต้องรันจาก repo root; ฟอนต์อ่านจาก ./public/fonts)
 *
 * ponytail: ไม่ตรวจหน้าตา — แค่ยืนยันว่าไม่ throw และได้ไฟล์ %PDF ที่ใหญ่พอ
 */
import fs from 'fs'
import path from 'path'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DocumentPDF, type DocumentPdfData } from '../components/pdf/document-pdf'
import {
  calcDocumentTotals, calcItemAmount,
  type DocBrandRow, type DocTemplateRow, type DocTypeCode,
  type DocumentItemRow, type DocumentRow, type VatMode,
} from '../app/(authenticated)/documents/doc-types'

const OUT_DIR =
  'C:\\Users\\image\\AppData\\Local\\Temp\\claude\\d---------------work-2026-stock\\61a7b605-dbc0-40e0-842d-65d35463bdb3\\scratchpad\\pdf'

const brand: DocBrandRow = {
  code: 'MIP', name_th: 'บริษัท เอ็ม อิมเมจ จำกัด', name_en: 'M Image Co., Ltd.',
  address: '123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
  tax_id: '0105551234567', branch: 'สำนักงานใหญ่',
  phone: '02-123-4567', email: 'info@mimage.co.th', website: 'www.mimage.co.th',
  logo_url: null, vat_registered: true, default_vat_mode: 'exclusive', default_wht_rate: 3,
  is_active: true, sort_order: 1,
}

function makeDoc(over: Partial<DocumentRow>): DocumentRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    draft_no: 'DR-2569-0001', doc_no: null, brand_code: 'MIP', doc_type: 'QT', status: 'draft',
    template_version_id: null,
    party_name: 'คุณสมชาย ใจดี', party_company: 'บริษัท ลูกค้าดี จำกัด',
    party_tax_id: '0107500000123', party_address: '99 หมู่ 2 ต.บางพลี อ.บางพลี จ.สมุทรปราการ 10540',
    party_phone: '081-234-5678', party_email: 'somchai@example.com',
    party_id_card: null, party_birth_date: null,
    doc_date: '2026-08-27', meta: {},
    vat_mode: 'none', wht_rate: 0,
    subtotal: 0, discount_total: 0, vat_amount: 0, wht_amount: 0, total: 0, net_payable: 0,
    currency: 'THB', ref_document_id: null, notes: null,
    created_by: null, submitted_at: null, approved_by: null, approved_at: null, issued_at: null,
    rejected_reason: null, void_reason: null, void_by: null, void_at: null,
    sent_at: null, closed_at: null,
    created_at: '2026-08-27T00:00:00Z', updated_at: '2026-08-27T00:00:00Z',
    ...over,
  }
}

function makeItems(rows: { d: string; q: number; u: string; p: number; disc?: number }[]): DocumentItemRow[] {
  return rows.map((r, i) => ({
    id: `item-${i}`, document_id: 'doc', line_no: i + 1,
    description: r.d, quantity: r.q, unit: r.u, unit_price: r.p, discount: r.disc ?? 0,
    amount: calcItemAmount({ quantity: r.q, unit_price: r.p, discount: r.disc ?? 0 }),
  }))
}

const template: DocTemplateRow = {
  id: 'tpl-1', brand_code: 'MIP', doc_type: 'QT', version: 3,
  title: null,
  terms: '<p>ราคานี้<strong>ยังไม่รวม</strong>ค่าเดินทางต่างจังหวัด</p><ul><li>ชำระมัดจำ 50% ก่อนวันงาน</li><li>ยกเลิกก่อน 7 วัน คืนเงิน 100%</li></ul><p>เงื่อนไขอื่น &amp; ข้อตกลง <em>เป็นไปตามที่ตกลงกัน</em></p>',
  footer: 'เอกสารนี้ออกโดยระบบ M Image Document Control',
  signer_label_1: null, signer_label_2: null,
  payment_info: '<p>ธนาคารกสิกรไทย สาขาสุขุมวิท</p><p>เลขที่บัญชี 123-4-56789-0 ชื่อบัญชี บริษัท เอ็ม อิมเมจ จำกัด</p>',
  is_active: true, created_by: null, created_at: '2026-08-01T00:00:00Z',
}

// ── 1. QT: การเงิน — 3 รายการ, VAT exclusive, WHT 3% ────────────────────────
const qtItems = makeItems([
  { d: 'Photo Booth Premium (4 ชั่วโมง)', q: 1, u: 'งาน', p: 25000 },
  { d: 'พรินต์เพิ่มไม่จำกัด + อัลบั้ม', q: 2, u: 'ชุด', p: 3500, disc: 500 },
  { d: 'ค่าเดินทางต่างจังหวัด', q: 3, u: 'เที่ยว', p: 1200 },
])
const qtTotals = calcDocumentTotals(qtItems, 'exclusive' as VatMode, 3)
const qt: DocumentPdfData = {
  doc: makeDoc({
    doc_type: 'QT' as DocTypeCode, doc_no: 'QT-MIP-2608-0007', status: 'issued',
    approved_by: 'u1', approved_at: '2026-08-26T10:00:00Z',
    meta: { expiry_date: '2026-09-30' },
    vat_mode: 'exclusive', wht_rate: 3, ...qtTotals,
    notes: 'ขอบคุณที่ให้ความไว้วางใจ',
  }),
  items: qtItems, brand, template,
  approver: { full_name: 'คุณผู้จัดการ อนุมัติ', signature_url: null },
  creator: { full_name: 'พนักงานขาย ก' },
  refDoc: null,
}

// ── 2. DN: รายการอย่างเดียว (ไม่มียอด) + ร่าง (ลายน้ำ) ──────────────────────
const dnItems = makeItems([
  { d: 'ไฟล์ภาพต้นฉบับ (USB)', q: 1, u: 'ชิ้น', p: 0 },
  { d: 'อัลบั้มรูป 8x10', q: 2, u: 'เล่ม', p: 0 },
])
const dn: DocumentPdfData = {
  doc: makeDoc({
    id: '00000000-0000-0000-0000-000000000002',
    doc_type: 'DN' as DocTypeCode, doc_no: null, draft_no: 'DR-2569-0042', status: 'draft',
  }),
  items: dnItems, brand, template: null,
  approver: null, creator: { full_name: 'ทีมงาน ข' }, refDoc: { doc_no: 'JO-MIP-2608-0003', doc_type: 'JO' },
}

// ── 3. MM: จดหมาย + richtext มี <ul> + สถานะ void (ตราประทับยกเลิก) ─────────
const mm: DocumentPdfData = {
  doc: makeDoc({
    id: '00000000-0000-0000-0000-000000000003',
    doc_type: 'MM' as DocTypeCode, doc_no: 'MM-MIP-2608-0011', status: 'void',
    void_at: '2026-08-27T09:00:00Z', void_reason: 'ออกเอกสารผิดแผนก',
    approved_by: 'u1', approved_at: '2026-08-20T08:00:00Z',
    meta: {
      subject: 'ขออนุมัติจัดซื้ออุปกรณ์ถ่ายภาพ',
      to: 'ผู้จัดการฝ่ายบริหาร',
      body: '<h2>เหตุผลความจำเป็น</h2><p>อุปกรณ์ชุดเดิม<strong>ชำรุด</strong>และ<em>ซ่อมไม่คุ้ม</em> จึงขออนุมัติจัดซื้อดังนี้</p><ul><li>กล้อง DSLR 1 ตัว</li><li>เลนส์ 24-70mm 1 ตัว</li><li>ไฟสตูดิโอ 2 ชุด</li></ul><ol><li>ขอใบเสนอราคา 3 เจ้า</li><li>เปรียบเทียบราคา &amp; สเปก</li></ol><p>จึงเรียนมาเพื่อโปรดพิจารณา<br/>ขอแสดงความนับถือ</p>',
    },
  }),
  items: [], brand, template,
  approver: { full_name: 'คุณผู้บริหาร ใจดี', signature_url: null },
  creator: { full_name: 'ธุรการ ค' },
  refDoc: null,
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const cases: [string, DocumentPdfData][] = [['qt', qt], ['dn', dn], ['mm', mm]]
  let failed = 0

  for (const [name, data] of cases) {
    try {
      const buf = await renderToBuffer(React.createElement(DocumentPDF, data) as any)
      const file = path.join(OUT_DIR, `${name}.pdf`)
      fs.writeFileSync(file, buf)

      const magic = buf.subarray(0, 4).toString('latin1')
      if (magic !== '%PDF') throw new Error(`ไม่ใช่ไฟล์ PDF (magic = ${JSON.stringify(magic)})`)
      if (buf.length <= 5 * 1024) throw new Error(`ไฟล์เล็กเกินไป (${buf.length} bytes)`)

      console.log(`✓ ${name}.pdf  ${(buf.length / 1024).toFixed(1)} KB  → ${file}`)
    } catch (err) {
      failed++
      console.error(`✗ ${name}: ${(err as Error).message}`)
    }
  }

  if (failed) {
    console.error(`\n${failed}/${cases.length} เคสไม่ผ่าน`)
    process.exit(1)
  }
  console.log(`\n${cases.length}/${cases.length} เคสผ่าน`)
}

main().catch((e) => { console.error(e); process.exit(1) })
