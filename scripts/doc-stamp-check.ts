/**
 * scripts/doc-stamp-check.ts — ตรวจตัวประทับหัว/ท้ายกระดาษของเอกสารอัปโหลด (UP)
 * สร้าง PDF ต้นทาง 2 หน้า (หน้า 2 แนวนอน) ด้วย react-pdf → ประทับครบ 3 โหมด
 * → ยืนยันว่าได้ไฟล์ %PDF และจำนวนหน้าเท่าต้นฉบับ
 *
 *   npx tsx scripts/doc-stamp-check.ts      (ต้องรันจาก repo root; ฟอนต์อ่านจาก ./public/fonts)
 *
 * ponytail: ไม่ตรวจหน้าตา — แค่ยืนยันว่าไม่ throw, ได้ %PDF และหน้าไม่หาย
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import React from 'react'
import { Document, Page, Text, View, renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { stampPdf } from '../lib/pdf-stamp'
import { STAMP_MODES, type DocBrandRow, type DocTemplateRow, type DocumentRow } from '../app/(authenticated)/documents/doc-types'

const OUT_DIR = process.env.OUT_DIR || path.join(os.tmpdir(), 'doc-stamp-check')

const brand: DocBrandRow = {
  code: 'MIP', name_th: 'บริษัท เอ็ม อิมเมจ จำกัด', name_en: 'M Image Co., Ltd.',
  address: '123/45 ถนนสุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพฯ 10110',
  tax_id: '0105551234567', branch: 'สำนักงานใหญ่',
  phone: '02-123-4567', email: 'info@mimage.co.th', website: 'www.mimage.co.th',
  logo_url: null, vat_registered: true, default_vat_mode: 'exclusive', default_wht_rate: 3,
  is_active: true, sort_order: 1,
}

const template: DocTemplateRow = {
  id: 'tpl-up', brand_code: 'MIP', doc_type: 'UP', version: 1,
  title: null, terms: null,
  footer: 'เอกสารนี้ออกโดยระบบ M Image Document Control',
  signer_label_1: null, signer_label_2: null, payment_info: null,
  is_active: true, created_by: null, created_at: '2026-09-17T00:00:00Z',
}

function makeDoc(over: Partial<DocumentRow>): DocumentRow {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    draft_no: 'DRAFT-0042', doc_no: 'MIP-UP-2609-0001', brand_code: 'MIP',
    doc_type: 'UP', status: 'issued', template_version_id: null,
    party_name: null, party_company: null, party_tax_id: null, party_address: null,
    party_phone: null, party_email: null, party_id_card: null, party_birth_date: null,
    doc_date: '2026-09-17', meta: { subject: 'สัญญาจ้างผลิตสื่อ', file: 'documents/x/y.pdf' },
    vat_mode: 'none', wht_rate: 0,
    subtotal: 0, discount_total: 0, vat_amount: 0, wht_amount: 0, total: 0, net_payable: 0,
    currency: 'THB', ref_document_id: null, notes: null,
    created_by: null, submitted_at: null, approved_by: null, approved_at: null,
    issued_at: '2026-09-17T00:00:00Z',
    rejected_reason: null, void_reason: null, void_by: null, void_at: null,
    sent_at: null, closed_at: null,
    created_at: '2026-09-17T00:00:00Z', updated_at: '2026-09-17T00:00:00Z',
    ...over,
  }
}

/** PDF ต้นทาง 2 หน้า: หน้า 1 A4 แนวตั้ง, หน้า 2 แนวนอน (842 x 595) */
function sourceDoc() {
  const pageStyle = { fontFamily: 'THSarabunNew', fontSize: 16, padding: 40 }
  const box = { borderWidth: 1, borderColor: '#333', padding: 10, marginTop: 10 }
  return React.createElement(
    Document,
    null,
    React.createElement(
      Page,
      { size: 'A4' as const, style: pageStyle },
      React.createElement(Text, null, 'หน้าที่ 1 — เอกสารต้นฉบับจาก Word (แนวตั้ง)'),
      React.createElement(
        View,
        { style: box },
        React.createElement(Text, null, 'ข้อความทดสอบภาษาไทย สระ วรรณยุกต์ ป่า ปู่ ญี่ปุ่น ฟื้นฟู'),
      ),
    ),
    React.createElement(
      Page,
      { size: [842, 595] as [number, number], style: pageStyle },
      React.createElement(Text, null, 'หน้าที่ 2 — ตารางแนวนอน (Landscape)'),
      React.createElement(
        View,
        { style: box },
        React.createElement(Text, null, 'บรรทัดยาวสำหรับดูว่าเนื้อหาถูกย่อให้พ้นแถบหัว/ท้ายกระดาษหรือไม่'),
      ),
    ),
  )
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const srcBuf = await renderToBuffer(sourceDoc() as any)
  const srcPath = path.join(OUT_DIR, 'source.pdf')
  fs.writeFileSync(srcPath, srcBuf)
  const srcPages = (await PDFDocument.load(srcBuf)).getPageCount()
  console.log(`  ต้นฉบับ ${srcPages} หน้า → ${srcPath}`)

  const source = new Uint8Array(srcBuf)
  const cases: { name: string; run: () => Promise<Uint8Array>; pages: number }[] = [
    ...STAMP_MODES.map((mode, i) => ({
      name: `mode-${i + 1}-${mode}`,
      run: () => stampPdf({ source, doc: makeDoc({}), brand, template, mode }),
      pages: srcPages,
    })),
    // ร่าง (ลายน้ำ "ร่าง") / ยกเลิก (ลายน้ำ "ยกเลิก") — ใช้โหมดเต็มทั้งสองเคส
    {
      name: 'draft-watermark',
      run: () => stampPdf({ source, doc: makeDoc({ doc_no: null, status: 'draft' }), brand, template, mode: STAMP_MODES[0] }),
      pages: srcPages,
    },
    {
      name: 'void-watermark',
      run: () => stampPdf({
        source,
        doc: makeDoc({ status: 'void', void_at: '2026-09-17T09:00:00Z', void_reason: 'อัปโหลดไฟล์ผิดฉบับ' }),
        brand, template, mode: STAMP_MODES[0],
      }),
      pages: srcPages,
    },
    // พรีวิวแม่แบบ — ไม่มีไฟล์ต้นฉบับ = หน้า A4 เปล่า 1 หน้า
    {
      name: 'blank-preview',
      run: () => stampPdf({ source: null, doc: makeDoc({}), brand, template, mode: STAMP_MODES[0] }),
      pages: 1,
    },
  ]

  let failed = 0
  for (const c of cases) {
    try {
      const out = await c.run()
      const buf = Buffer.from(out)
      const file = path.join(OUT_DIR, `${c.name}.pdf`)
      fs.writeFileSync(file, buf)

      const magic = buf.subarray(0, 4).toString('latin1')
      if (magic !== '%PDF') throw new Error(`ไม่ใช่ไฟล์ PDF (magic = ${JSON.stringify(magic)})`)
      const pages = (await PDFDocument.load(out)).getPageCount()
      if (pages !== c.pages) throw new Error(`จำนวนหน้าไม่ตรง (ได้ ${pages} ควรเป็น ${c.pages})`)

      console.log(`✓ ${c.name}.pdf  ${pages} หน้า  ${(buf.length / 1024).toFixed(1)} KB  → ${file}`)
    } catch (err) {
      failed++
      console.error(`✗ ${c.name}: ${(err as Error).message}`)
    }
  }

  if (failed) {
    console.error(`\n${failed}/${cases.length} เคสไม่ผ่าน`)
    process.exit(1)
  }
  console.log(`\n${cases.length}/${cases.length} เคสผ่าน`)
}

main().catch((e) => { console.error(e); process.exit(1) })
