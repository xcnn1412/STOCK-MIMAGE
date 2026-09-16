import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import path from 'path'
import { formatThaiDate } from '@/lib/thai-date'
import type {
  DocBrandRow, DocTemplateRow, DocumentRow, StampMode,
} from '@/app/(authenticated)/documents/doc-types'

// ============================================================================
// ชั้นครอบสำหรับเอกสารอัปโหลด (UP) — หัว/ท้ายกระดาษ + ลายน้ำ 1 หน้าต่อ 1 หน้าต้นฉบับ
// ไฟล์นี้ "ไม่มีเนื้อหา" ของเอกสาร: pdf-lib (lib/pdf-stamp.ts) เอาไปวางทับหน้าต้นฉบับ
// ที่ย่อลงมาแล้ว — จึงห้ามใส่พื้นหลังทึบ ไม่งั้นจะบังเนื้อหาข้างใต้
// ขนาดหน้าเท่าหน้าต้นฉบับทีละหน้า (รองรับไฟล์ที่มีหน้าแนวนอนปนแนวตั้ง)
// ============================================================================

// ── Font Registration (คัดลอกจาก document-pdf.tsx — side-effect เรียกซ้ำได้) ──
const fontDir = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: path.join(fontDir, 'THSarabunNew.ttf'), fontWeight: 'normal' },
    { src: path.join(fontDir, 'THSarabunNew Bold.ttf'), fontWeight: 'bold' },
    { src: path.join(fontDir, 'THSarabunNew Italic.ttf'), fontWeight: 'normal', fontStyle: 'italic' },
    { src: path.join(fontDir, 'THSarabunNew BoldItalic.ttf'), fontWeight: 'bold', fontStyle: 'italic' },
  ],
})

/** ความสูงแถบหัว/ท้าย — lib/pdf-stamp.ts ใช้ชุดเดียวกันตอนย่อหน้าต้นฉบับ */
export const HEADER_H = 70
export const FOOTER_H = 40

const s = StyleSheet.create({
  page: { fontFamily: 'THSarabunNew', fontSize: 11 },
  // ── หัวกระดาษ ──
  header: {
    position: 'absolute', top: 0, left: 0, right: 0, height: HEADER_H,
    paddingTop: 14, paddingHorizontal: 36,
    flexDirection: 'row', alignItems: 'flex-start',
  },
  headerRule: {
    position: 'absolute', top: HEADER_H - 8, left: 36, right: 36,
    borderBottomWidth: 0.8, borderBottomColor: '#333',
  },
  logo: { width: 40, height: 40, objectFit: 'contain', marginRight: 8 },
  brandCol: { flex: 1 },
  brandName: { fontSize: 15, fontWeight: 'bold' },
  brandLine: { fontSize: 9.5, color: '#444' },
  voidNote: { fontSize: 9.5, color: '#b91c1c', fontWeight: 'bold', textAlign: 'right', maxWidth: 200 },
  // ── ท้ายกระดาษ ──
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: FOOTER_H,
    paddingBottom: 12, paddingHorizontal: 36,
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between',
  },
  footerRule: {
    position: 'absolute', bottom: FOOTER_H - 6, left: 36, right: 36,
    borderBottomWidth: 0.8, borderBottomColor: '#333',
  },
  footerText: { fontSize: 9.5, color: '#555' },
  footerMid: { fontSize: 9.5, color: '#555', flex: 1, textAlign: 'center', paddingHorizontal: 8 },
  // ── ลายน้ำ ──
  watermark: {
    position: 'absolute', top: '40%', left: 0, right: 0,
    alignItems: 'center', transform: 'rotate(-30deg)',
  },
  wmDraft: { fontSize: 84, color: '#000000', opacity: 0.08, fontWeight: 'bold' },
  wmVoid: { fontSize: 76, color: '#dc2626', opacity: 0.16, fontWeight: 'bold' },
})

export interface StampChromeProps {
  /** ขนาดหน้าต้นฉบับทีละหน้า (pt) — 1 หน้าครอบต่อ 1 หน้าต้นฉบับ */
  sizes: { w: number; h: number }[]
  mode: StampMode
  doc: DocumentRow
  brand: DocBrandRow | null
  template: DocTemplateRow | null
}

export function StampChromePDF({ sizes, mode, doc, brand, template }: StampChromeProps) {
  const withHeader = mode !== 'เฉพาะท้ายกระดาษ'
  const withFooter = mode !== 'เฉพาะหัวกระดาษ'
  const isDraft = !doc.doc_no
  const isVoid = doc.status === 'void'
  const total = sizes.length
  const contact = [
    brand?.phone ? `โทร. ${brand.phone}` : '',
    brand?.email || '',
  ].filter(Boolean).join('    ')

  return (
    <Document>
      {sizes.map((sz, i) => (
        <Page key={i} size={[sz.w, sz.h]} style={s.page}>
          {isDraft && (
            <View style={s.watermark}>
              <Text style={s.wmDraft}>ร่าง / DRAFT</Text>
            </View>
          )}
          {isVoid && (
            <View style={s.watermark}>
              <Text style={s.wmVoid}>ยกเลิก / VOID</Text>
            </View>
          )}

          {withHeader && (
            <>
              <View style={s.header}>
                {brand?.logo_url ? (
                  // eslint-disable-next-line jsx-a11y/alt-text
                  <Image style={s.logo} src={brand.logo_url} />
                ) : null}
                <View style={s.brandCol}>
                  <Text style={s.brandName}>{brand?.name_th || ''}</Text>
                  {brand?.address ? <Text style={s.brandLine}>{brand.address}</Text> : null}
                  {contact ? <Text style={s.brandLine}>{contact}</Text> : null}
                </View>
                {isVoid && (
                  <Text style={s.voidNote}>
                    ยกเลิกเมื่อ {formatThaiDate(doc.void_at)}
                    {doc.void_reason ? `  เหตุผล: ${doc.void_reason}` : ''}
                  </Text>
                )}
              </View>
              <View style={s.headerRule} />
            </>
          )}

          {withFooter && (
            <>
              <View style={s.footerRule} />
              <View style={s.footer}>
                <Text style={s.footerText}>
                  {(doc.doc_no ? 'เลขที่ ' : 'เลขร่าง ') + (doc.doc_no || doc.draft_no)}
                  {'    '}
                  {formatThaiDate(doc.doc_date || doc.created_at)}
                </Text>
                <Text style={s.footerMid}>{template?.footer || ''}</Text>
                {/* ponytail: เขียนเลขหน้าเองทีละหน้า — render prop ของ react-pdf นับตาม
                    เอกสารชั้นครอบ ซึ่งตรงกับต้นฉบับอยู่แล้ว แต่เขียนตรงๆ อ่านง่ายกว่า */}
                <Text style={s.footerText}>หน้า {i + 1} / {total}</Text>
              </View>
            </>
          )}
        </Page>
      ))}
    </Document>
  )
}
