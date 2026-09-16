import React from 'react'
import { renderToBuffer } from '@react-pdf/renderer'
import { PDFDocument } from 'pdf-lib'
import { StampChromePDF, HEADER_H, FOOTER_H } from '@/components/pdf/stamp-chrome-pdf'
import type {
  DocBrandRow, DocTemplateRow, DocumentRow, StampMode,
} from '@/app/(authenticated)/documents/doc-types'

// ============================================================================
// ประทับหัว/ท้ายกระดาษลงไฟล์ PDF ที่ผู้ใช้อัปโหลด (ประเภทเอกสาร UP)
// react-pdf วาด "ชั้นครอบ" (ฟอนต์ไทยถูกต้อง) → pdf-lib ประกอบ:
//   หน้าใหม่ขนาดเท่าหน้าเดิม → วาดหน้าเดิมย่อลงให้พ้นแถบ → วาดชั้นครอบทับ
// ponytail: ไม่วาดอักษรไทยด้วย pdf-lib เอง (สระ/วรรณยุกต์ลอย) และไม่แก้เนื้อหาไฟล์ต้นฉบับ
// ต้องรันบน Node runtime เท่านั้น (react-pdf อ่านฟอนต์จาก fs)
// ============================================================================

/** หน้าเปล่าเมื่อไม่มีไฟล์ต้นฉบับ (preview แม่แบบ) — A4 */
const A4 = { w: 595.28, h: 841.89 }

/** ระยะกันแถบเมื่อ "ไม่มี" แถบฝั่งนั้น — เว้นขอบนิดหน่อยไม่ให้เนื้อหาชนขอบกระดาษ */
const NO_BAND = 12

export interface StampPdfInput {
  /** ไฟล์ต้นฉบับ; null = สร้างหน้า A4 เปล่า 1 หน้า (ใช้พรีวิวแม่แบบ) */
  source: Uint8Array | null
  doc: DocumentRow
  brand: DocBrandRow | null
  template: DocTemplateRow | null
  mode: StampMode
}

/** คืนไฟล์ PDF ที่ประทับแล้ว — จำนวนหน้าเท่าต้นฉบับเสมอ (throw เมื่อไฟล์เสีย/ล็อกรหัส) */
export async function stampPdf({ source, doc, brand, template, mode }: StampPdfInput): Promise<Uint8Array> {
  const src = source ? await PDFDocument.load(source) : null
  const sizes = src
    ? src.getPages().map(p => ({ w: p.getSize().width, h: p.getSize().height }))
    : [A4]

  const chromeBuf = await renderToBuffer(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    React.createElement(StampChromePDF, { sizes, mode, doc, brand, template }) as any
  )
  const chrome = await PDFDocument.load(chromeBuf)

  const out = await PDFDocument.create()
  const srcPages = src ? await out.embedPdf(src, src.getPageIndices()) : []
  const chromePages = await out.embedPdf(chrome, chrome.getPageIndices())

  const top = mode === 'เฉพาะท้ายกระดาษ' ? NO_BAND : HEADER_H
  const bottom = mode === 'เฉพาะหัวกระดาษ' ? NO_BAND : FOOTER_H

  sizes.forEach((sz, i) => {
    const page = out.addPage([sz.w, sz.h])
    const content = srcPages[i]
    if (content) {
      const scale = (sz.h - top - bottom) / sz.h
      page.drawPage(content, {
        x: (sz.w - sz.w * scale) / 2,
        y: bottom,
        xScale: scale,
        yScale: scale,
      })
    }
    if (chromePages[i]) page.drawPage(chromePages[i], { x: 0, y: 0 })
  })

  return out.save()
}
