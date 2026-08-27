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
import { numberToThaiBahtText } from '@/lib/thai-baht-text'
import { formatThaiDate } from '@/lib/thai-date'
import { htmlToPdfNodes } from '@/lib/pdf-html'
import {
  DOC_TYPES,
  PARTY_LABEL,
  isHtmlEmpty,
  type DocBrandRow,
  type DocTemplateRow,
  type DocTypeCode,
  type DocumentItemRow,
  type DocumentRow,
  type MetaField,
} from '@/app/(authenticated)/documents/doc-types'

// ============================================================================
// Font Registration — TH Sarabun New
// ponytail: คัดลอกบล็อกนี้จาก payment-voucher.tsx แทนที่จะ import ข้ามไฟล์
// (Font.register เป็น global side-effect — เรียกซ้ำไม่มีผลเสีย และไม่ผูกสองเรนเดอร์เข้าด้วยกัน)
// ============================================================================
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

// THSarabun has no emoji glyphs — render emoji as Twemoji PNGs instead
Font.registerEmojiSource({
  format: 'png',
  url: 'https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/72x72/',
})

// ============================================================================
// Types
// ============================================================================
export interface DocumentPdfData {
  doc: DocumentRow
  items: DocumentItemRow[]
  brand: DocBrandRow | null
  template: DocTemplateRow | null
  approver: { full_name: string | null; signature_url: string | null } | null
  creator: { full_name: string | null } | null
  refDoc: { doc_no: string | null; doc_type: string } | null
}

// ============================================================================
// Styles
// ============================================================================
const s = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    fontSize: 13,
    paddingTop: 30,
    paddingHorizontal: 36,
    paddingBottom: 56,
  },
  // ── Header ──
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  brandCol: { flexDirection: 'row', width: '58%' },
  logo: { width: 54, height: 54, objectFit: 'contain', marginRight: 8 },
  brandName: { fontSize: 16, fontWeight: 'bold' },
  brandNameEn: { fontSize: 11, color: '#555' },
  brandLine: { fontSize: 10.5, color: '#333' },
  titleCol: { width: '40%', alignItems: 'flex-end' },
  docTitle: { fontSize: 20, fontWeight: 'bold', textAlign: 'right' },
  kvRow: { flexDirection: 'row', marginTop: 2 },
  kvLabel: { fontSize: 11, fontWeight: 'bold', textAlign: 'right' },
  kvValue: { fontSize: 11, textAlign: 'right', marginLeft: 4 },
  rule: { borderBottomWidth: 1, borderBottomColor: '#333', marginBottom: 8 },
  // ── Sections ──
  sectionTitle: { fontSize: 12, fontWeight: 'bold', marginBottom: 3 },
  block: { marginBottom: 8 },
  partyBox: {
    borderWidth: 0.5, borderColor: '#999', padding: 6, marginBottom: 8, borderRadius: 2,
  },
  line: { fontSize: 11.5, marginBottom: 1 },
  metaRow: { flexDirection: 'row', marginBottom: 1 },
  metaLabel: { fontSize: 11.5, fontWeight: 'bold', width: 120 },
  metaValue: { fontSize: 11.5, flex: 1 },
  // ── Table ──
  table: { borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  tHead: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 1, borderBottomColor: '#333' },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  cell: { paddingVertical: 3, paddingHorizontal: 4, fontSize: 11.5, borderRightWidth: 0.5, borderRightColor: '#ccc' },
  cellLast: { paddingVertical: 3, paddingHorizontal: 4, fontSize: 11.5 },
  th: { fontWeight: 'bold', textAlign: 'center' },
  cNo: { width: 32, textAlign: 'center' },
  cDesc: { flex: 1 },
  cQty: { width: 48, textAlign: 'right' },
  cUnit: { width: 48, textAlign: 'center' },
  cPrice: { width: 66, textAlign: 'right' },
  cDisc: { width: 56, textAlign: 'right' },
  cAmt: { width: 74, textAlign: 'right' },
  // ── Totals ──
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 250 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  totalLabel: { fontSize: 11.5 },
  totalValue: { fontSize: 11.5, textAlign: 'right', width: 90 },
  totalStrong: { fontSize: 12.5, fontWeight: 'bold' },
  totalDivider: { borderTopWidth: 0.5, borderTopColor: '#333', marginVertical: 2 },
  bahtText: { fontSize: 11.5, textAlign: 'right', fontWeight: 'bold', marginTop: 3 },
  // ── Signatures ──
  signWrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  signBox: { width: '45%', alignItems: 'center' },
  signImage: { width: 120, height: 50, objectFit: 'contain', marginBottom: 2 },
  signSpacer: { height: 50, justifyContent: 'flex-end' },
  signDots: { fontSize: 11.5, color: '#666' },
  signLabel: { fontSize: 11.5, fontWeight: 'bold', marginTop: 2 },
  signName: { fontSize: 11, color: '#444' },
  // ── Footer / watermark ──
  footer: {
    position: 'absolute', bottom: 20, left: 36, right: 36, textAlign: 'center',
  },
  footerText: { fontSize: 9.5, color: '#666' },
  pageNo: { fontSize: 9.5, color: '#666', marginTop: 2 },
  watermark: {
    position: 'absolute', top: 300, left: 0, right: 0,
    textAlign: 'center', transform: 'rotate(-30deg)',
  },
  wmDraft: { fontSize: 84, color: '#000000', opacity: 0.08, fontWeight: 'bold' },
  wmVoid: { fontSize: 76, color: '#dc2626', opacity: 0.16, fontWeight: 'bold' },
  voidNote: { fontSize: 11.5, color: '#b91c1c', marginBottom: 8, fontWeight: 'bold' },
})

// ============================================================================
// Helpers
// ============================================================================
const fmtNum = (n: unknown) =>
  (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const fmtQty = (n: unknown) => {
  const v = Number(n) || 0
  return Number.isInteger(v) ? String(v) : v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/** meta keys ที่ย้ายขึ้นไปอยู่บล็อกวันที่ตรงหัวกระดาษแทน */
const HEADER_META: Record<string, string> = {
  expiry_date: 'ใช้ได้ถึง',
  due_date: 'ครบกำหนดชำระ',
  delivery_date: 'วันส่งมอบ',
  event_date: 'วันงาน',
}

const SIGNER_1_DEFAULT: Partial<Record<DocTypeCode, string>> = {
  QT: 'ผู้เสนอราคา',
  JA: 'ผู้สมัคร',
  IA: 'ผู้สมัคร',
  RS: 'ผู้ยื่น',
}

function metaText(field: MetaField, v: unknown): string {
  if (v == null || v === '') return ''
  if (field.type === 'date') return formatThaiDate(String(v))
  if (field.type === 'number') return fmtNum(v)
  return String(v)
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue}>{value}</Text>
    </View>
  )
}

/**
 * เรนเดอร์ metaField 1 ช่อง — richtext/textarea ได้บล็อกของตัวเองพร้อมหัวข้อ
 * ที่เหลือเป็นแถว label/value
 * ponytail: ก่อนหน้านี้บล็อก "ไม่ใช่จดหมาย" ยัดทุกชนิดผ่าน metaText() ทำให้
 * เนื้อหาสัญญา (CT) พิมพ์แท็ก HTML ออกมาดิบๆ — รวมโค้ดสองที่ให้เหลือฟังก์ชันเดียว
 */
function renderMetaField(f: MetaField, v: unknown): React.ReactNode {
  if (v == null || v === '') return null

  if (f.type === 'richtext') {
    if (isHtmlEmpty(String(v))) return null
    return (
      <View style={s.block} key={f.key}>
        <Text style={s.sectionTitle}>{f.label.th}</Text>
        {htmlToPdfNodes(String(v), { text: { fontSize: 11.5 } })}
      </View>
    )
  }

  if (f.type === 'textarea') {
    return (
      <View style={s.block} key={f.key}>
        <Text style={s.sectionTitle}>{f.label.th}</Text>
        <Text style={s.line}>{String(v)}</Text>
      </View>
    )
  }

  return <KV key={f.key} label={f.label.th} value={metaText(f, v)} />
}

// ============================================================================
// Main PDF Document
// ============================================================================
export function DocumentPDF({ doc, items, brand, template, approver, creator, refDoc }: DocumentPdfData) {
  const def = DOC_TYPES[doc.doc_type] ?? DOC_TYPES.MM
  const meta = (doc.meta || {}) as Record<string, unknown>
  const isDraft = !doc.doc_no
  const isVoid = doc.status === 'void'
  const signed = ['issued', 'sent', 'closed', 'void'].includes(doc.status)

  const financial = def.hasItems && def.hasAmounts
  const listOnly = def.hasItems && !def.hasAmounts
  const letter = !def.hasItems

  const title = template?.title || `${def.label.th} / ${def.label.en}`

  // metaFields ที่ยังไม่ถูกแสดงตรงหัวกระดาษ
  const bodyMetaFields = def.metaFields.filter((f) => !HEADER_META[f.key])

  const termsNodes = template?.terms ? htmlToPdfNodes(template.terms, { text: { fontSize: 11.5 } }) : null

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

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={s.brandCol}>
            {brand?.logo_url ? <Image style={s.logo} src={brand.logo_url} /> : null}
            <View style={{ flex: 1 }}>
              <Text style={s.brandName}>{brand?.name_th || ''}</Text>
              {brand?.name_en ? <Text style={s.brandNameEn}>{brand.name_en}</Text> : null}
              {brand?.address ? <Text style={s.brandLine}>{brand.address}</Text> : null}
              {brand?.tax_id ? (
                <Text style={s.brandLine}>
                  เลขประจำตัวผู้เสียภาษี {brand.tax_id}
                  {brand.branch ? ` (${brand.branch})` : ''}
                </Text>
              ) : null}
              {brand?.phone ? <Text style={s.brandLine}>โทร. {brand.phone}</Text> : null}
              {brand?.email ? <Text style={s.brandLine}>{brand.email}</Text> : null}
              {brand?.website ? <Text style={s.brandLine}>{brand.website}</Text> : null}
            </View>
          </View>

          <View style={s.titleCol}>
            <Text style={s.docTitle}>{title}</Text>
            <View style={s.kvRow}>
              <Text style={s.kvLabel}>เลขที่:</Text>
              <Text style={s.kvValue}>{doc.doc_no || doc.draft_no}</Text>
            </View>
            <View style={s.kvRow}>
              <Text style={s.kvLabel}>วันที่:</Text>
              <Text style={s.kvValue}>{formatThaiDate(doc.doc_date || doc.created_at)}</Text>
            </View>
            {Object.entries(HEADER_META).map(([key, label]) =>
              meta[key] ? (
                <View style={s.kvRow} key={key}>
                  <Text style={s.kvLabel}>{label}:</Text>
                  <Text style={s.kvValue}>{formatThaiDate(String(meta[key]))}</Text>
                </View>
              ) : null
            )}
            {refDoc?.doc_no ? (
              <View style={s.kvRow}>
                <Text style={s.kvLabel}>อ้างอิง:</Text>
                <Text style={s.kvValue}>{refDoc.doc_no}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={s.rule} />

        {/* ── VOID note ── */}
        {isVoid && (
          <Text style={s.voidNote}>
            ยกเลิกเมื่อ {formatThaiDate(doc.void_at)}
            {doc.void_reason ? `  เหตุผล: ${doc.void_reason}` : ''}
          </Text>
        )}

        {/* ── Party ── */}
        {def.party !== 'none' && (
          <View style={s.partyBox}>
            <Text style={s.sectionTitle}>{PARTY_LABEL[def.party].th}</Text>
            {doc.party_name ? <Text style={s.line}>{doc.party_name}</Text> : null}
            {doc.party_company ? <Text style={s.line}>{doc.party_company}</Text> : null}
            {doc.party_address ? <Text style={s.line}>{doc.party_address}</Text> : null}
            {doc.party_tax_id ? (
              <Text style={s.line}>เลขประจำตัวผู้เสียภาษี {doc.party_tax_id}</Text>
            ) : null}
            {(def.party === 'applicant' || def.party === 'employee') && doc.party_id_card ? (
              <Text style={s.line}>เลขบัตรประชาชน {doc.party_id_card}</Text>
            ) : null}
            {(def.party === 'applicant' || def.party === 'employee') && doc.party_birth_date ? (
              <Text style={s.line}>วันเกิด {formatThaiDate(doc.party_birth_date)}</Text>
            ) : null}
            {doc.party_phone ? <Text style={s.line}>โทร. {doc.party_phone}</Text> : null}
            {doc.party_email ? <Text style={s.line}>{doc.party_email}</Text> : null}
          </View>
        )}

        {/* ── Meta (financial / list groups) ── */}
        {!letter && bodyMetaFields.some((f) => meta[f.key]) && (
          <View style={s.block}>
            {bodyMetaFields.map((f) => renderMetaField(f, meta[f.key]))}
          </View>
        )}

        {/* ── Items ── */}
        {financial && (
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.cell, s.cNo, s.th]}>ลำดับ</Text>
              <Text style={[s.cell, s.cDesc, s.th]}>รายการ</Text>
              <Text style={[s.cell, s.cQty, s.th]}>จำนวน</Text>
              <Text style={[s.cell, s.cUnit, s.th]}>หน่วย</Text>
              <Text style={[s.cell, s.cPrice, s.th]}>ราคา/หน่วย</Text>
              <Text style={[s.cell, s.cDisc, s.th]}>ส่วนลด</Text>
              <Text style={[s.cellLast, s.cAmt, s.th]}>จำนวนเงิน</Text>
            </View>
            {items.map((it, i) => (
              <View style={s.tRow} key={it.id || i} wrap={false}>
                <Text style={[s.cell, s.cNo]}>{it.line_no ?? i + 1}</Text>
                <Text style={[s.cell, s.cDesc]}>{it.description || ''}</Text>
                <Text style={[s.cell, s.cQty]}>{fmtQty(it.quantity)}</Text>
                <Text style={[s.cell, s.cUnit]}>{it.unit || ''}</Text>
                <Text style={[s.cell, s.cPrice]}>{fmtNum(it.unit_price)}</Text>
                <Text style={[s.cell, s.cDisc]}>{fmtNum(it.discount)}</Text>
                <Text style={[s.cellLast, s.cAmt]}>{fmtNum(it.amount)}</Text>
              </View>
            ))}
          </View>
        )}

        {listOnly && (
          <View style={s.table}>
            <View style={s.tHead}>
              <Text style={[s.cell, s.cNo, s.th]}>ลำดับ</Text>
              <Text style={[s.cell, s.cDesc, s.th]}>รายการ</Text>
              <Text style={[s.cell, s.cQty, s.th]}>จำนวน</Text>
              <Text style={[s.cellLast, s.cUnit, s.th]}>หน่วย</Text>
            </View>
            {items.map((it, i) => (
              <View style={s.tRow} key={it.id || i} wrap={false}>
                <Text style={[s.cell, s.cNo]}>{it.line_no ?? i + 1}</Text>
                <Text style={[s.cell, s.cDesc]}>{it.description || ''}</Text>
                <Text style={[s.cell, s.cQty]}>{fmtQty(it.quantity)}</Text>
                <Text style={[s.cellLast, s.cUnit]}>{it.unit || ''}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Totals ── */}
        {financial && (
          <View style={s.totalsWrap}>
            <View style={s.totalsBox}>
              <View style={s.totalRow}>
                <Text style={s.totalLabel}>รวมเป็นเงิน</Text>
                <Text style={s.totalValue}>{fmtNum(doc.subtotal)}</Text>
              </View>
              {Number(doc.discount_total) > 0 && (
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>ส่วนลด</Text>
                  <Text style={s.totalValue}>{fmtNum(doc.discount_total)}</Text>
                </View>
              )}
              {doc.vat_mode !== 'none' && (
                <View style={s.totalRow}>
                  <Text style={s.totalLabel}>
                    ภาษีมูลค่าเพิ่ม 7%{doc.vat_mode === 'inclusive' ? ' (รวมใน)' : ''}
                  </Text>
                  <Text style={s.totalValue}>{fmtNum(doc.vat_amount)}</Text>
                </View>
              )}
              <View style={s.totalDivider} />
              <View style={s.totalRow}>
                <Text style={[s.totalLabel, s.totalStrong]}>จำนวนเงินรวมทั้งสิ้น</Text>
                <Text style={[s.totalValue, s.totalStrong]}>{fmtNum(doc.total)}</Text>
              </View>
              {Number(doc.wht_amount) > 0 && (
                <>
                  <View style={s.totalRow}>
                    <Text style={s.totalLabel}>หัก ณ ที่จ่าย {doc.wht_rate}%</Text>
                    <Text style={s.totalValue}>-{fmtNum(doc.wht_amount)}</Text>
                  </View>
                  <View style={s.totalRow}>
                    <Text style={[s.totalLabel, s.totalStrong]}>ยอดชำระสุทธิ</Text>
                    <Text style={[s.totalValue, s.totalStrong]}>{fmtNum(doc.net_payable)}</Text>
                  </View>
                </>
              )}
              <Text style={s.bahtText}>({numberToThaiBahtText(Number(doc.total) || 0)})</Text>
            </View>
          </View>
        )}

        {/* ── Payment info (QT/IV เท่านั้น) ── */}
        {financial && ['QT', 'IV'].includes(doc.doc_type) && template?.payment_info?.trim() ? (
          <View style={s.block}>
            <Text style={s.sectionTitle}>ข้อมูลการชำระเงิน</Text>
            {htmlToPdfNodes(template.payment_info, { text: { fontSize: 11.5 } })}
          </View>
        ) : null}

        {/* ── Letter body ── */}
        {letter && (
          <View style={s.block}>
            {doc.doc_type === 'MM' && meta.subject ? (
              <Text style={[s.line, { fontWeight: 'bold', marginBottom: 3 }]}>
                เรื่อง: {String(meta.subject)}
              </Text>
            ) : null}
            {doc.doc_type === 'MM' && meta.to ? (
              <Text style={[s.line, { marginBottom: 6 }]}>เรียน: {String(meta.to)}</Text>
            ) : null}
            {def.metaFields.map((f) => {
              if (doc.doc_type === 'MM' && (f.key === 'subject' || f.key === 'to')) return null
              return renderMetaField(f, meta[f.key])
            })}
          </View>
        )}

        {/* ── Terms / notes ── */}
        {(termsNodes || doc.notes) && (
          <View style={s.block}>
            <Text style={s.sectionTitle}>เงื่อนไข / หมายเหตุ</Text>
            {termsNodes}
            {doc.notes ? <Text style={s.line}>{doc.notes}</Text> : null}
          </View>
        )}

        {/* ── Signatures ── */}
        <View style={s.signWrap} wrap={false}>
          <View style={s.signBox}>
            <View style={s.signSpacer}>
              <Text style={s.signDots}>………………………………………</Text>
            </View>
            <Text style={s.signLabel}>
              {template?.signer_label_1 || SIGNER_1_DEFAULT[doc.doc_type] || 'ผู้ออกเอกสาร'}
            </Text>
            {creator?.full_name ? <Text style={s.signName}>( {creator.full_name} )</Text> : null}
            <Text style={s.signName}>วันที่ ......../......../........</Text>
          </View>

          <View style={s.signBox}>
            {signed && approver?.signature_url ? (
              <Image style={s.signImage} src={approver.signature_url} />
            ) : (
              <View style={s.signSpacer}>
                <Text style={s.signDots}>………………………………………</Text>
              </View>
            )}
            <Text style={s.signLabel}>{template?.signer_label_2 || 'ผู้อนุมัติ'}</Text>
            {signed && approver?.full_name ? (
              <Text style={s.signName}>( {approver.full_name} )</Text>
            ) : null}
            <Text style={s.signName}>
              {signed && doc.approved_at
                ? `วันที่ ${formatThaiDate(doc.approved_at)}`
                : 'วันที่ ......../......../........'}
            </Text>
          </View>
        </View>

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
