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
import { htmlToPdfNodes } from '@/lib/pdf-html'
import { isHtmlEmpty } from '@/app/(authenticated)/documents/doc-types'
import type { DocumentPdfData } from './document-pdf'

// ============================================================================
// จดหมายภายนอก (EL) — เลย์เอาต์หนังสือภายนอกแบบทางการ
// หัวกระดาษกลางหน้า · ที่ / วันที่ · เรื่อง เรียน สำเนาเรียน อ้างถึง สิ่งที่ส่งมาด้วย
// · เนื้อหา · "ขอแสดงความนับถือ" + ลงนามช่องเดียว (ผู้อนุมัติ = ผู้มีอำนาจลงนาม)
// ช่องเสริม (สำเนาเรียน / อ้างถึง / สิ่งที่ส่งมาด้วย) ว่าง = ไม่พิมพ์แถวนั้น
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

const BODY = 14.5

const s = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew', fontSize: BODY,
    paddingTop: 42, paddingHorizontal: 64, paddingBottom: 60,
  },
  // ── หัวกระดาษ (กลางหน้า) ──
  header: { alignItems: 'center', marginBottom: 16 },
  logo: { width: 48, height: 48, objectFit: 'contain', marginBottom: 4 },
  brandName: { fontSize: 20, fontWeight: 'bold', textAlign: 'center' },
  brandLine: { fontSize: 12, color: '#333', textAlign: 'center' },
  // ── ที่ / วันที่ ──
  docNo: { fontSize: BODY, marginBottom: 10 },
  date: { fontSize: BODY, textAlign: 'center', marginBottom: 12 },
  // ── แถวป้าย / ค่า ──
  row: { flexDirection: 'row', marginBottom: 3 },
  label: { width: 96, fontSize: BODY },
  value: { flex: 1 },
  valueLine: { fontSize: BODY },
  // ── เนื้อหา ──
  body: { marginTop: 10, marginBottom: 6 },
  // ── ลงท้าย + ลงนาม ──
  signWrap: { marginTop: 18, marginLeft: '52%', alignItems: 'center' },
  closing: { fontSize: BODY, marginBottom: 6 },
  signImage: { width: 120, height: 50, objectFit: 'contain' },
  signSpacer: { height: 50, justifyContent: 'flex-end' },
  signDots: { fontSize: BODY, color: '#666' },
  signName: { fontSize: BODY, marginTop: 2 },
  signPos: { fontSize: 12.5, color: '#444' },
  note: { fontSize: 11.5, color: '#555', marginTop: 14 },
  voidNote: { fontSize: 12, color: '#b91c1c', marginBottom: 8, fontWeight: 'bold' },
  // ── Footer / watermark ──
  footer: { position: 'absolute', bottom: 22, left: 64, right: 64, textAlign: 'center' },
  footerText: { fontSize: 9.5, color: '#666' },
  pageNo: { fontSize: 9.5, color: '#666', marginTop: 2 },
  watermark: {
    position: 'absolute', top: 300, left: 0, right: 0,
    textAlign: 'center', transform: 'rotate(-30deg)',
  },
  wmDraft: { fontSize: 84, color: '#000000', opacity: 0.08, fontWeight: 'bold' },
  wmVoid: { fontSize: 76, color: '#dc2626', opacity: 0.16, fontWeight: 'bold' },
})

/** เลขไทย ๐-๙ สำหรับเลขข้อ (ตามแบบหนังสือทางการ) */
const thaiNum = (n: number) => String(n).replace(/\d/g, (d) => '๐๑๒๓๔๕๖๗๘๙'[Number(d)])

/** ช่องบรรทัดเดียว → รายการ 0 หรือ 1 ตัว */
function single(v: unknown): string[] {
  const t = String(v ?? '').trim()
  return t ? [t] : []
}

/** ช่องหลายบรรทัด (textarea) → รายการ บรรทัดละ 1 ตัว ตัดบรรทัดว่างทิ้ง */
function lines(v: unknown): string[] {
  return String(v ?? '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
}

/** แถว ป้าย/ค่า — 2 รายการขึ้นไปใส่เลขข้อ ๑. ๒. ให้ (รายการเดียวไม่ใส่ ตามธรรมเนียมหนังสือราชการ) */
function LetterRow({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  const numbered = items.length > 1
  return (
    <View style={s.row}>
      <Text style={s.label}>{label}</Text>
      <View style={s.value}>
        {items.map((t, i) => (
          <Text key={i} style={s.valueLine}>{numbered ? `${thaiNum(i + 1)}. ${t}` : t}</Text>
        ))}
      </View>
    </View>
  )
}

export function ExternalLetterPDF({ doc, brand, template, approver }: DocumentPdfData) {
  const meta = (doc.meta || {}) as Record<string, unknown>
  const isDraft = !doc.doc_no
  const isVoid = doc.status === 'void'
  const signed = ['issued', 'sent', 'closed', 'void'].includes(doc.status)
  const body = String(meta.body ?? '')
  // ตำแหน่งผู้ลงนาม = ป้ายช่องลงนาม 2 ของแม่แบบต่อแบรนด์ (ตั้งค่า → แม่แบบ) —
  // ค่าเริ่มต้นของแม่แบบคือ "ผู้อนุมัติ" ซึ่งไม่ใช่ตำแหน่ง จึงถือว่ายังไม่ได้ตั้ง
  const signerPos =
    template?.signer_label_2 && template.signer_label_2 !== 'ผู้อนุมัติ'
      ? template.signer_label_2
      : 'ผู้มีอำนาจลงนาม'
  const contact = [
    brand?.phone ? `โทรศัพท์ ${brand.phone}` : '',
    brand?.email ? `อีเมล ${brand.email}` : '',
  ].filter(Boolean).join('    ')

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Watermarks (fixed = ทุกหน้า) ── */}
        {isDraft && (
          <View style={s.watermark} fixed>
            <Text style={s.wmDraft}>ร่าง / DRAFT</Text>
          </View>
        )}
        {isVoid && (
          <View style={s.watermark} fixed>
            <Text style={s.wmVoid}>ยกเลิก / VOID</Text>
          </View>
        )}

        {/* ── หัวกระดาษ ── */}
        <View style={s.header}>
          {brand?.logo_url ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.logo} src={brand.logo_url} />
          ) : null}
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

        <Text style={s.docNo}>ที่  {doc.doc_no || doc.draft_no}</Text>
        <Text style={s.date}>{formatThaiDate(doc.doc_date || doc.created_at)}</Text>

        <LetterRow label="เรื่อง" items={single(meta.subject)} />
        <LetterRow label="เรียน" items={single(meta.to)} />
        <LetterRow label="สำเนาเรียน" items={lines(meta.cc)} />
        <LetterRow label="อ้างถึง" items={lines(meta.ref)} />
        <LetterRow label="สิ่งที่ส่งมาด้วย" items={lines(meta.attachments)} />

        {/* ── เนื้อหา ── */}
        {!isHtmlEmpty(body) ? (
          <View style={s.body}>
            {htmlToPdfNodes(body, { text: { fontSize: BODY, lineHeight: 1.45 } })}
          </View>
        ) : null}

        {/* ── ลงท้าย + ลงนาม (ช่องเดียว ฝั่งขวา) — ลายเซ็นขึ้นเมื่อออกเลขแล้ว ── */}
        <View style={s.signWrap} wrap={false}>
          <Text style={s.closing}>ขอแสดงความนับถือ</Text>
          {signed && approver?.signature_url ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image style={s.signImage} src={approver.signature_url} />
          ) : (
            <View style={s.signSpacer}>
              <Text style={s.signDots}>………………………………………</Text>
            </View>
          )}
          <Text style={s.signName}>
            {signed && approver?.full_name ? `( ${approver.full_name} )` : '(……………………………………)'}
          </Text>
          <Text style={s.signPos}>{signerPos}</Text>
        </View>

        {doc.notes ? <Text style={s.note}>หมายเหตุ: {doc.notes}</Text> : null}

        {/* ── Footer ── */}
        <View style={s.footer} fixed>
          {template?.footer ? <Text style={s.footerText}>{template.footer}</Text> : null}
          <Text
            style={s.pageNo}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}
