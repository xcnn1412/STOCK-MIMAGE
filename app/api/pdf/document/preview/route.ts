import { NextRequest, NextResponse } from 'next/server'
import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { DocumentPDF, type DocumentPdfData } from '@/components/pdf/document-pdf'
import { createServiceClient } from '@/lib/supabase-server'
import { getSession } from '@/app/(authenticated)/documents/session'
import {
  DOC_TYPES, calcDocumentTotals, calcItemAmount,
  type DocBrandRow, type DocTemplateRow, type DocTypeCode, type DocTypeDef,
  type DocumentItemRow, type DocumentRow,
} from '@/app/(authenticated)/documents/doc-types'

// @react-pdf/renderer ต้องใช้ Node runtime (fs สำหรับฟอนต์)
export const runtime = 'nodejs'

// ponytail: คัดลอกแนวสร้างเอกสารปลอมมาจาก scripts/doc-pdf-check.ts แทนที่จะแยกเป็น
// helper กลาง — สคริปต์นั้นถูกแก้โดย agent อื่นพร้อมกัน (ห้ามแตะ) และ shape ตรงนี้
// ต่างออกไป (สร้างจาก DOC_TYPES ตามประเภทที่ admin เลือก ไม่ใช่ 3 เคสตายตัว)

const SAMPLE_ITEMS = [
  { d: 'Photo Booth Premium (4 ชั่วโมง)', q: 1, u: 'งาน', p: 25000, disc: 0 },
  { d: 'พรินต์เพิ่มไม่จำกัด + อัลบั้ม', q: 2, u: 'ชุด', p: 3500, disc: 500 },
  { d: 'ค่าเดินทางต่างจังหวัด', q: 3, u: 'เที่ยว', p: 1200, disc: 0 },
]

function sampleItems(): DocumentItemRow[] {
  return SAMPLE_ITEMS.map((r, i) => ({
    id: `sample-${i}`, document_id: 'sample', line_no: i + 1,
    description: r.d, quantity: r.q, unit: r.u, unit_price: r.p, discount: r.disc,
    amount: calcItemAmount({ quantity: r.q, unit_price: r.p, discount: r.disc }),
  }))
}

/** ค่าตัวอย่างของ metaFields ตามชนิดฟิลด์ — ครอบคลุมทุกประเภทโดยไม่ต้องเขียนทีละใบ */
function sampleMeta(def: DocTypeDef, today: string): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const f of def.metaFields) {
    out[f.key] =
      f.type === 'date' ? today
      : f.type === 'number' ? 25000
      : f.type === 'select' ? (f.options?.[0] ?? 'ตัวอย่าง')
      : f.type === 'richtext'
        ? '<p>เนื้อหาตัวอย่างสำหรับดูหน้าตาแม่แบบ <strong>ตัวหนา</strong> และ <em>ตัวเอียง</em></p>'
          + '<ul><li>หัวข้อย่อยที่หนึ่ง</li><li>หัวข้อย่อยที่สอง</li></ul>'
        : `ตัวอย่าง${f.label.th}`
  }
  return out
}

export async function POST(req: NextRequest) {
  try {
    // /api ไม่ผ่าน proxy.ts — ต้องเช็ค session เองที่นี่ และหน้าแม่แบบเป็น admin-only
    // ใช้ getSession ของโมดูลเอกสาร: รองรับคุกกี้ legacy เหมือน actions ทุกตัว
    const { userId, role } = await getSession()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (role !== 'admin') {
      return NextResponse.json({ error: 'เฉพาะ admin เท่านั้น' }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null
    if (!body) return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 })

    const brandCode = String(body.brand_code || '').trim().toUpperCase()
    const docType = String(body.doc_type || '').trim().toUpperCase() as DocTypeCode
    const def = DOC_TYPES[docType]
    if (!/^[A-Z]{3}$/.test(brandCode) || !def) {
      return NextResponse.json({ error: 'แบรนด์หรือประเภทเอกสารไม่ถูกต้อง' }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: brandRow } = await supabase.from('doc_brands').select('*').eq('code', brandCode).maybeSingle()
    if (!brandRow) return NextResponse.json({ error: `ไม่พบแบรนด์ ${brandCode}` }, { status: 404 })
    const brand = brandRow as unknown as DocBrandRow

    const str = (k: string) => {
      const v = body[k]
      const s = typeof v === 'string' ? v.trim() : ''
      return !s || s === '<p></p>' ? null : s
    }

    // แม่แบบที่ยังไม่ได้บันทึก — ใช้ค่าที่โพสต์มาตรงๆ (นี่คือจุดประสงค์ของ preview)
    const template: DocTemplateRow = {
      id: 'preview', brand_code: brandCode, doc_type: docType, version: 0,
      title: str('title'),
      terms: str('terms'),
      footer: str('footer'),
      signer_label_1: str('signer_label_1'),
      signer_label_2: str('signer_label_2'),
      payment_info: str('payment_info'),
      is_active: true, created_by: null, created_at: new Date().toISOString(),
    }

    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const yymm = `${String(now.getFullYear() % 100).padStart(2, '0')}${String(now.getMonth() + 1).padStart(2, '0')}`

    const items = def.hasItems ? sampleItems() : []
    const totals = def.hasAmounts
      ? calcDocumentTotals(items, 'exclusive', 3)
      : { subtotal: 0, discount_total: 0, vat_amount: 0, wht_amount: 0, total: 0, net_payable: 0 }

    const doc: DocumentRow = {
      id: '00000000-0000-0000-0000-0000000000ff',
      draft_no: 'DRAFT-0000',
      doc_no: `${brandCode}-${docType}-${yymm}-0001`,
      brand_code: brandCode,
      doc_type: docType,
      status: 'issued',
      template_version_id: null,
      party_name: 'คุณตัวอย่าง ทดสอบ',
      party_company: 'บริษัท ตัวอย่าง จำกัด',
      party_tax_id: '0105500000000',
      party_address: '99/9 ถนนตัวอย่าง แขวงตัวอย่าง เขตตัวอย่าง กรุงเทพฯ 10110',
      party_phone: '02-000-0000',
      party_email: 'sample@example.com',
      party_id_card: null,
      party_birth_date: null,
      doc_date: today,
      meta: sampleMeta(def, today),
      vat_mode: def.hasAmounts ? 'exclusive' : 'none',
      wht_rate: def.hasAmounts ? 3 : 0,
      ...totals,
      currency: 'THB',
      ref_document_id: null,
      notes: 'ตัวอย่างเอกสารสำหรับดูหน้าตาแม่แบบ — ไม่ใช่เอกสารจริง',
      created_by: null,
      submitted_at: null,
      approved_by: 'preview-approver',
      approved_at: now.toISOString(),
      issued_at: now.toISOString(),
      rejected_reason: null, void_reason: null, void_by: null, void_at: null,
      sent_at: null, closed_at: null,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    }

    const data: DocumentPdfData = {
      doc, items, brand, template,
      approver: { full_name: 'ชื่อผู้อนุมัติ', signature_url: null },
      creator: { full_name: 'ชื่อผู้จัดทำ' },
      refDoc: null,
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfBuffer = await renderToBuffer(React.createElement(DocumentPDF, data) as any)

    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="preview-${brandCode}-${docType}.pdf"`,
        'Cache-Control': 'no-store',
        'X-Frame-Options': 'SAMEORIGIN',
      },
    })
  } catch (err) {
    console.error('Document template preview PDF error:', err)
    return NextResponse.json(
      { error: 'สร้าง PDF ตัวอย่างไม่สำเร็จ', details: (err as Error)?.message },
      { status: 500 },
    )
  }
}
