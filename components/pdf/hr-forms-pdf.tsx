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
import { numberToThaiBahtText } from '@/lib/thai-baht-text'
import {
  DOC_TYPES, calcTenure,
  type DocTypeDef, type MetaColumn, type MetaField, type MetaTableRow,
} from '@/app/(authenticated)/documents/doc-types'
import {
  HR_THEME, IA_DECLARATION, JA_DECLARATION, RS_DECLARATION, SC_CLOSING,
  companyName, iaGuardianConsent, pdpaText, scCertificateBody,
} from '@/app/(authenticated)/documents/hr-texts'
import type { DocumentPdfData } from './document-pdf'

// ============================================================================
// แบบฟอร์ม HR — ใบสมัครงาน (JA) / ใบสมัครนักศึกษาฝึกงาน (IA) / ใบลาออก (RS)
// / หนังสือรับรองเงินเดือน (SC)
// เลย์เอาต์ตามแบบฟอร์มกระดาษของบริษัท (docs/document/template/*.pdf)
// ที่เหลืออีก 10 ประเภทยังใช้ document-pdf.tsx ตัวเดิม
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

// ============================================================================
// Styles
// ============================================================================
const s = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    fontSize: 12,
    paddingTop: 24,
    paddingHorizontal: 34,
    paddingBottom: 38,
  },
  // ── Header ──
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  brandCol: { flex: 1, paddingRight: 12 },
  logo: { width: 46, height: 46, objectFit: 'contain', marginBottom: 3 },
  brandName: { fontSize: 17, fontWeight: 'bold' },
  brandLine: { fontSize: 10.5, color: '#333', marginTop: 1 },
  photoBox: {
    width: 72, height: 96,
    borderWidth: 1, borderStyle: 'dashed', borderColor: '#aaa',
    alignItems: 'center', justifyContent: 'center',
  },
  photoText: { fontSize: 8.5, color: '#888' },
  docNoBox: { width: 130, alignItems: 'flex-end' },
  docNoLabel: { fontSize: 10, color: '#555' },
  docNoValue: {
    fontSize: 11, marginTop: 10, width: '100%', textAlign: 'center',
    borderBottomWidth: 0.7, borderBottomColor: '#888', paddingBottom: 1,
  },
  thickRule: { borderBottomWidth: 2.2, marginTop: 8, marginBottom: 10 },
  title: { fontSize: 18, fontWeight: 'bold', textAlign: 'center' },
  subtitle: { fontSize: 10.5, color: '#666', textAlign: 'center', marginTop: 1, marginBottom: 8 },
  // ── Section bar ──
  sectionBar: { paddingVertical: 2.5, paddingHorizontal: 7, marginTop: 6, marginBottom: 5 },
  sectionBarText: { fontSize: 11.5, fontWeight: 'bold', color: '#ffffff' },
  // ── Fields ──
  fieldWrap: { flexDirection: 'row', flexWrap: 'wrap' },
  field: { paddingRight: 10, marginBottom: 6 },
  fieldLabel: { fontSize: 9.5, color: '#666' },
  fieldRule: { borderBottomWidth: 0.7, borderBottomColor: '#999', minHeight: 14, justifyContent: 'flex-end' },
  fieldValue: { fontSize: 11.5, paddingBottom: 1 },
  // ── Table ──
  table: { borderWidth: 0.8, borderColor: '#999', marginBottom: 8 },
  tHead: { flexDirection: 'row', backgroundColor: '#f0f0f0', borderBottomWidth: 0.8, borderBottomColor: '#999' },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#bbb' },
  tRowLast: { flexDirection: 'row' },
  cell: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 11, borderRightWidth: 0.5, borderRightColor: '#bbb', minHeight: 20 },
  cellLast: { paddingVertical: 4, paddingHorizontal: 4, fontSize: 11, minHeight: 20 },
  th: { fontWeight: 'bold' },
  // ── Options (radio / checkbox) ──
  optRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4 },
  opt: { flexDirection: 'row', alignItems: 'center', marginRight: 16, marginBottom: 4 },
  optText: { fontSize: 11, marginLeft: 4 },
  markOuter: { width: 9, height: 9, borderWidth: 0.9, borderColor: '#444', alignItems: 'center', justifyContent: 'center' },
  markInner: { width: 4.5, height: 4.5 },
  // ── Boxes / paragraphs ──
  box: { borderWidth: 0.8, borderColor: '#bbb', padding: 7, marginBottom: 5 },
  para: { fontSize: 11, lineHeight: 1.3, marginBottom: 4, textAlign: 'left' },
  pdpaTitle: { fontSize: 10.5, fontWeight: 'bold', marginTop: 3, marginBottom: 1 },
  pdpaBody: { fontSize: 9.5, lineHeight: 1.25, textAlign: 'left' },
  pdpaItem: { fontSize: 9.5, lineHeight: 1.25, marginLeft: 10 },
  hint: { fontSize: 9, color: '#777', marginTop: 3 },
  // ── Signatures ──
  signWrap: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  signRule: { borderTopWidth: 0.8, borderTopColor: '#333', width: '88%', marginTop: 26 },
  signImage: { width: 100, height: 40, objectFit: 'contain' },
  signLabel: { fontSize: 11.5, marginTop: 3, textAlign: 'center' },
  signName: { fontSize: 10.5, color: '#444', textAlign: 'center' },
  signDate: { fontSize: 9.5, color: '#777', textAlign: 'center', marginTop: 1 },
  // ── Footer / watermark ──
  footer: { position: 'absolute', bottom: 18, left: 34, right: 34, textAlign: 'center' },
  pageNo: { fontSize: 9.5, color: '#777' },
  watermark: {
    position: 'absolute', top: 300, left: 0, right: 0,
    textAlign: 'center', transform: 'rotate(-30deg)',
  },
  wmDraft: { fontSize: 84, color: '#000000', opacity: 0.08, fontWeight: 'bold' },
  wmVoid: { fontSize: 76, color: '#dc2626', opacity: 0.16, fontWeight: 'bold' },
  voidNote: { fontSize: 11, color: '#b91c1c', marginBottom: 6, fontWeight: 'bold' },
})

// ============================================================================
// Helpers
// ============================================================================

type W = 'full' | 'half' | 'third' | 'quarter' | 'sixth'

const PCT: Record<W, string> = {
  full: '100%', half: '50%', third: '33.33%', quarter: '25%', sixth: '16.66%',
}

function SectionBar({ title, color }: { title: string; color: string }) {
  return (
    <View style={[s.sectionBar, { backgroundColor: color }]} wrap={false} minPresenceAhead={80}>
      <Text style={s.sectionBarText}>{title}</Text>
    </View>
  )
}

/** ช่องกรอกแบบเส้นใต้ — ว่างก็ยังเห็นเส้น (ให้พิมพ์เปล่าแล้วเขียนมือได้) */
function FieldLine({ label, value, width = 'half' }: { label: string; value?: string; width?: W }) {
  return (
    <View style={[s.field, { width: PCT[width] }]} wrap={false}>
      <Text style={s.fieldLabel}>{label}</Text>
      <View style={s.fieldRule}>
        <Text style={s.fieldValue}>{value || ' '}</Text>
      </View>
    </View>
  )
}

/** ○/● และ ☐/☑ วาดเป็นรูปทรง ไม่พึ่งกลีฟของฟอนต์ */
function Mark({ on, radio, color }: { on: boolean; radio?: boolean; color: string }) {
  return (
    <View style={[s.markOuter, radio ? { borderRadius: 4.5 } : {}]}>
      {on ? <View style={[s.markInner, radio ? { borderRadius: 2.25 } : {}, { backgroundColor: color }]} /> : null}
    </View>
  )
}

function OptionRow({
  options, selected, radio, color, otherText,
}: {
  options: string[]
  selected: string[]
  radio?: boolean
  color: string
  otherText?: string
}) {
  return (
    <View style={s.optRow}>
      {options.map((o) => (
        <View style={s.opt} key={o}>
          <Mark on={selected.includes(o)} radio={radio} color={color} />
          <Text style={s.optText}>
            {o === 'อื่นๆ' ? `อื่นๆ ระบุ ${otherText || '________________'}` : o}
          </Text>
        </View>
      ))}
    </View>
  )
}

/** ตารางมีเส้นขอบ + หัวตารางเทาอ่อน (ประวัติการศึกษา / ประวัติการทำงาน) */
function MetaTable({
  columns, rows, widths, minRows = 0, fixedRows,
}: {
  columns: MetaColumn[]
  rows: MetaTableRow[]
  /** สัดส่วนความกว้างต่อคอลัมน์ (รวมกันได้ 100%) */
  widths: string[]
  minRows?: number
  /** ป้ายชื่อคอลัมน์แรกที่ต้องขึ้นเสมอ แม้ยังไม่ได้กรอก (เช่น ระดับการศึกษา) */
  fixedRows?: string[]
}) {
  const rowCount = Math.max(rows.length, minRows, fixedRows?.length ?? 0)
  const firstKey = columns[0]?.key
  const body: MetaTableRow[] = []
  for (let i = 0; i < rowCount; i++) {
    const r = { ...(rows[i] || {}) }
    // ตารางแถวคงที่: คอลัมน์แรกเป็นป้ายชื่อเสมอ (พิมพ์เปล่าก็ยังเห็นระดับการศึกษา)
    if (fixedRows?.[i] && firstKey) r[firstKey] = fixedRows[i]
    body.push(r)
  }

  return (
    <View style={s.table} wrap={false}>
      <View style={s.tHead}>
        {columns.map((c, i) => (
          <Text
            key={c.key}
            style={[i === columns.length - 1 ? s.cellLast : s.cell, s.th, { width: widths[i] }]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {body.map((r, ri) => (
        <View style={ri === body.length - 1 ? s.tRowLast : s.tRow} key={ri} wrap={false}>
          {columns.map((c, i) => (
            <Text
              key={c.key}
              style={[i === columns.length - 1 ? s.cellLast : s.cell, { width: widths[i] }]}
            >
              {String(r?.[c.key] ?? '')}
            </Text>
          ))}
        </View>
      ))}
    </View>
  )
}

function SignBox({
  label, name, dateText, width = '46%', signatureUrl,
}: {
  label: string
  name?: string | null
  dateText?: string
  width?: string
  signatureUrl?: string | null
}) {
  return (
    <View style={{ width, alignItems: 'center' }} wrap={false}>
      {signatureUrl ? (
        // eslint-disable-next-line jsx-a11y/alt-text
        <Image style={s.signImage} src={signatureUrl} />
      ) : null}
      <View style={[s.signRule, signatureUrl ? { marginTop: 2 } : {}]} />
      <Text style={s.signLabel}>{label}</Text>
      {name ? <Text style={s.signName}>( {name} )</Text> : null}
      <Text style={s.signDate}>{dateText || 'วันที่ ......../......../........'}</Text>
    </View>
  )
}

function PdpaBlock({ kind, nameTh, address }: { kind: 'JA' | 'IA'; nameTh: string; address: string }) {
  const t = pdpaText(kind, nameTh, address)
  return (
    <View style={s.box}>
      <Text style={s.pdpaBody}>{t.intro}</Text>
      {t.sections.map((sec) => (
        <View key={sec.title}>
          <Text style={s.pdpaTitle}>{sec.title}</Text>
          {sec.body ? <Text style={s.pdpaBody}>{sec.body}</Text> : null}
          {sec.items?.map((it, i) => (
            <Text style={s.pdpaItem} key={it}>{`${i + 1}. ${it}`}</Text>
          ))}
        </View>
      ))}
    </View>
  )
}

/** บรรทัดคำยินยอม ☐/☑ + ข้อความ */
function ConsentLine({ on, text, hint, color }: { on: boolean; text: string; hint?: string; color: string }) {
  return (
    <View wrap={false}>
      <View style={{ flexDirection: 'row', marginTop: 4 }}>
        <View style={{ marginTop: 2 }}><Mark on={on} color={color} /></View>
        <Text style={[s.pdpaBody, { flex: 1, marginLeft: 5 }]}>{text}</Text>
      </View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  )
}

/** สร้างตัวช่วยอ่านค่า meta พร้อม label จาก DOC_TYPES (label อยู่ที่เดียว) */
function makeField(def: DocTypeDef, meta: Record<string, unknown>) {
  const map = new Map<string, MetaField>(def.metaFields.map((f) => [f.key, f]))

  const value = (key: string): string => {
    const f = map.get(key)
    const v = meta[key]
    if (v == null || v === '') return ''
    if (f?.type === 'date') return formatThaiDate(String(v))
    return String(v)
  }

  const F = (key: string, width?: W, override?: { label?: string; value?: string }) => (
    <FieldLine
      key={key}
      label={override?.label ?? map.get(key)?.label.th ?? key}
      value={override?.value ?? value(key)}
      width={width ?? (map.get(key)?.width as W | undefined) ?? 'half'}
    />
  )

  const field = (key: string) => map.get(key)
  const list = (key: string): string[] => (Array.isArray(meta[key]) ? (meta[key] as unknown[]).map(String) : [])
  const rows = (key: string): MetaTableRow[] =>
    Array.isArray(meta[key]) ? (meta[key] as MetaTableRow[]) : []

  return { F, field, value, list, rows, str: (k: string) => String(meta[k] ?? '') }
}

// ============================================================================
// Header / chrome ที่ใช้ร่วมกันทั้ง 3 แบบฟอร์ม
// ============================================================================

function FormHeader({
  data, color, right,
}: {
  data: DocumentPdfData
  color: string
  right: 'photo' | 'docno'
}) {
  const { doc, brand } = data
  return (
    <View style={s.header}>
      <View style={s.brandCol}>
        {/* eslint-disable-next-line jsx-a11y/alt-text */}
        {brand?.logo_url ? <Image style={s.logo} src={brand.logo_url} /> : null}
        <Text style={[s.brandName, { color }]}>{companyName(brand?.name_th || '')}</Text>
        {brand?.address ? <Text style={s.brandLine}>{brand.address}</Text> : null}
        {brand?.name_en ? <Text style={s.brandLine}>{brand.name_en.toUpperCase()}</Text> : null}
      </View>
      {right === 'photo' ? (
        <View style={s.photoBox}>
          <Text style={s.photoText}>ติดรูปถ่าย 1 นิ้ว</Text>
        </View>
      ) : (
        <View style={s.docNoBox}>
          <Text style={s.docNoLabel}>เลขที่เอกสาร</Text>
          <Text style={s.docNoValue}>{doc.doc_no || doc.draft_no}</Text>
        </View>
      )}
    </View>
  )
}

function Chrome({ doc }: { doc: DocumentPdfData['doc'] }) {
  const isDraft = !doc.doc_no
  const isVoid = doc.status === 'void'
  return (
    <>
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
      <View style={s.footer} fixed>
        <Text style={s.pageNo} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`} />
      </View>
    </>
  )
}

function VoidNote({ doc }: { doc: DocumentPdfData['doc'] }) {
  if (doc.status !== 'void') return null
  return (
    <Text style={s.voidNote}>
      ยกเลิกเมื่อ {formatThaiDate(doc.void_at)}
      {doc.void_reason ? `  เหตุผล: ${doc.void_reason}` : ''}
    </Text>
  )
}

// ============================================================================
// JA — ใบสมัครงาน / Application for Employment
// ============================================================================

export function JobApplicationPDF(data: DocumentPdfData) {
  const { doc, brand, creator } = data
  const def = DOC_TYPES.JA
  const meta = (doc.meta || {}) as Record<string, unknown>
  const color = HR_THEME.JA
  const { F, field, rows } = makeField(def, meta)
  const docDate = formatThaiDate(doc.doc_date || doc.created_at)

  const eduCols = field('education')?.columns || []
  const workCols = field('work_experience')?.columns || []
  const consent = field('pdpa_consent')

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Chrome doc={doc} />
        <FormHeader data={data} color={color} right="photo" />
        <View style={[s.thickRule, { borderBottomColor: color }]} />
        <Text style={[s.title, { color }]}>{def.label.th}</Text>
        <Text style={s.subtitle}>{def.label.en}</Text>
        <VoidNote doc={doc} />

        {/* 1. ตำแหน่งที่สมัคร */}
        <SectionBar title="1. ตำแหน่งที่สมัคร / Position Applied" color={color} />
        <View style={s.fieldWrap}>
          {F('position', 'third')}
          {F('expected_salary', 'third')}
          {F('available_date', 'third')}
        </View>

        {/* 2. ข้อมูลส่วนตัว */}
        <SectionBar title="2. ข้อมูลส่วนตัว / Personal Information" color={color} />
        <View style={s.fieldWrap}>
          <FieldLine label="ชื่อ - นามสกุล (ภาษาไทย)" value={doc.party_name || ''} width="half" />
          {F('name_en', 'half')}
          {F('nickname', 'quarter')}
          <FieldLine label="วัน/เดือน/ปีเกิด" value={formatThaiDate(doc.party_birth_date)} width="quarter" />
          {F('age', 'quarter')}
          {F('nationality', 'quarter')}
          <FieldLine label="เลขบัตรประจำตัวประชาชน" value={doc.party_id_card || ''} width="third" />
          {F('religion', 'third')}
          {F('height_cm', 'sixth')}
          {F('weight_kg', 'sixth')}
          <FieldLine label="ที่อยู่ปัจจุบัน (ที่สามารถติดต่อได้)" value={doc.party_address || ''} width="full" />
          <FieldLine label="เบอร์โทรศัพท์" value={doc.party_phone || ''} width="third" />
          <FieldLine label="อีเมล" value={doc.party_email || ''} width="third" />
          {F('line_id', 'third')}
          {F('marital_status', 'half')}
          {F('military_status', 'half')}
        </View>

        {/* 3. ประวัติการศึกษา */}
        <SectionBar title="3. ประวัติการศึกษา / Education Background" color={color} />
        <MetaTable
          columns={eduCols}
          rows={rows('education')}
          widths={['22%', '30%', '22%', '13%', '13%']}
          fixedRows={field('education')?.fixedRows}
        />

        {/* 4. ความสามารถพิเศษ */}
        <SectionBar title="4. ความสามารถพิเศษ / Skills" color={color} />
        <View style={s.fieldWrap}>
          {F('languages', 'half')}
          {F('computer_skills', 'half')}
          {F('driving_license', 'half')}
          {F('other_skills', 'half')}
        </View>

        {/* 5. ประวัติการทำงาน */}
        <SectionBar title="5. ประวัติการทำงาน / Work Experience" color={color} />
        <MetaTable
          columns={workCols}
          rows={rows('work_experience')}
          widths={['26%', '20%', '20%', '17%', '17%']}
          minRows={3}
        />

        {/* 6. บุคคลอ้างอิง */}
        <SectionBar title="6. บุคคลอ้างอิง / กรณีฉุกเฉิน" color={color} />
        <View style={s.fieldWrap}>
          {F('emergency_name', 'third')}
          {F('emergency_relation', 'third')}
          {F('emergency_phone', 'third')}
        </View>

        {/* 7. PDPA */}
        <SectionBar
          title="7. นโยบายความเป็นส่วนตัวและความยินยอมในการเก็บรวบรวมข้อมูลส่วนบุคคล (PDPA)"
          color={color}
        />
        <PdpaBlock kind="JA" nameTh={brand?.name_th || ''} address={brand?.address || ''} />
        <ConsentLine
          on={meta.pdpa_consent === true}
          text={consent?.label.th || ''}
          hint={consent?.hint}
          color={color}
        />

        {/* 8. คำรับรองผู้สมัคร */}
        <SectionBar title="8. คำรับรองผู้สมัคร" color={color} />
        <Text style={s.para}>{JA_DECLARATION}</Text>
        <View style={s.signWrap} wrap={false}>
          <SignBox label="ลงชื่อผู้สมัคร" name={doc.party_name} dateText={docDate ? `วันที่ ${docDate}` : undefined} />
          <SignBox label="ลงชื่อผู้รับสมัคร (เจ้าหน้าที่บริษัท)" name={creator?.full_name} />
        </View>
      </Page>
    </Document>
  )
}

// ============================================================================
// IA — ใบสมัครนักศึกษาฝึกงาน / Student Internship Application Form
// ============================================================================

export function InternshipApplicationPDF(data: DocumentPdfData) {
  const { doc, brand } = data
  const def = DOC_TYPES.IA
  const meta = (doc.meta || {}) as Record<string, unknown>
  const color = HR_THEME.IA
  const { F, field, value, list, str } = makeField(def, meta)
  const docDate = formatThaiDate(doc.doc_date || doc.created_at)

  const evalField = field('evaluation_format')
  const docsField = field('attached_docs')
  const consent = field('pdpa_consent')
  const under20 = field('under_20')

  const period = [value('intern_start'), value('intern_end')].filter(Boolean).join(' - ')

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Chrome doc={doc} />
        <FormHeader data={data} color={color} right="photo" />
        <View style={[s.thickRule, { borderBottomColor: color }]} />
        <Text style={[s.title, { color }]}>{def.label.th}</Text>
        <Text style={s.subtitle}>{def.label.en}</Text>
        <VoidNote doc={doc} />

        {/* 1. ตำแหน่ง / สายงาน */}
        <SectionBar title="1. ตำแหน่ง / สายงานที่ต้องการฝึกงาน" color={color} />
        <View style={s.fieldWrap}>
          {F('position', 'half')}
          <FieldLine label="ระยะเวลาฝึกงานที่ต้องการ (วันเริ่ม - วันสิ้นสุด)" value={period} width="half" />
          {F('required_hours', 'full')}
          {F('work_days', 'full')}
        </View>

        {/* 2. ข้อมูลส่วนตัว */}
        <SectionBar title="2. ข้อมูลส่วนตัว / Personal Information" color={color} />
        <View style={s.fieldWrap}>
          <FieldLine label="ชื่อ - นามสกุล (ภาษาไทย)" value={doc.party_name || ''} width="half" />
          {F('name_en', 'half')}
          {F('nickname', 'quarter')}
          <FieldLine label="วัน/เดือน/ปีเกิด" value={formatThaiDate(doc.party_birth_date)} width="quarter" />
          {F('age', 'quarter')}
          {F('nationality', 'quarter')}
          <FieldLine label="เลขบัตรประจำตัวประชาชน" value={doc.party_id_card || ''} width="third" />
          {F('blood_type', 'third')}
          {F('medical_condition', 'third')}
          {F('vehicle', 'full')}
          {F('student_insurance', 'half', { label: 'ประกันอุบัติเหตุจากสถานศึกษา (มี/ไม่มี)' })}
          {F('insurance_company', 'half')}
          <FieldLine label="ที่อยู่ปัจจุบัน (ที่สามารถติดต่อได้)" value={doc.party_address || ''} width="full" />
          <FieldLine label="เบอร์โทรศัพท์" value={doc.party_phone || ''} width="third" />
          <FieldLine label="อีเมล" value={doc.party_email || ''} width="third" />
          {F('line_id', 'third')}
        </View>

        {/* 3. ข้อมูลการศึกษา */}
        <SectionBar title="3. ข้อมูลการศึกษา / Education Information" color={color} />
        <View style={s.fieldWrap}>
          {F('institution', 'third')}
          {F('faculty', 'third')}
          {F('major', 'third')}
          {F('year_level', 'third')}
          {F('student_id', 'third')}
          {F('gpax', 'third')}
          {F('advisor', 'half')}
          {F('advisor_contact', 'half')}
        </View>
        <Text style={s.fieldLabel}>{evalField?.label.th}</Text>
        <View style={{ marginTop: 4 }}>
          <OptionRow
            options={evalField?.options || []}
            selected={list('evaluation_format')}
            color={color}
            otherText={str('evaluation_other')}
          />
        </View>

        {/* 4. ความสามารถและทักษะ */}
        <SectionBar title="4. ความสามารถและทักษะ / Skills" color={color} />
        <View style={s.fieldWrap}>
          {F('languages', 'half')}
          {F('computer_skills', 'half')}
          {F('activities', 'full')}
          {F('motivation', 'full')}
        </View>

        {/* 5. เอกสารประกอบการสมัคร */}
        <SectionBar title="5. เอกสารประกอบการสมัคร" color={color} />
        <OptionRow
          options={docsField?.options || []}
          selected={list('attached_docs')}
          color={color}
          otherText={str('attached_other')}
        />

        {/* 6. บุคคลที่ติดต่อได้กรณีฉุกเฉิน */}
        <SectionBar title="6. บุคคลที่ติดต่อได้กรณีฉุกเฉิน" color={color} />
        <View style={s.fieldWrap}>
          {F('emergency_name', 'third')}
          {F('emergency_relation', 'third')}
          {F('emergency_phone', 'third')}
        </View>

        {/* 7. PDPA */}
        <SectionBar
          title="7. นโยบายความเป็นส่วนตัวและความยินยอมในการเก็บรวบรวมข้อมูลส่วนบุคคล (PDPA)"
          color={color}
        />
        <PdpaBlock kind="IA" nameTh={brand?.name_th || ''} address={brand?.address || ''} />
        <ConsentLine
          on={meta.pdpa_consent === true}
          text={consent?.label.th || ''}
          hint={consent?.hint}
          color={color}
        />

        {/* 8. คำรับรองผู้สมัคร */}
        <SectionBar title="8. คำรับรองผู้สมัคร" color={color} />
        <Text style={s.para}>{IA_DECLARATION}</Text>
        <ConsentLine on={meta.under_20 === true} text={under20?.label.th || ''} color={color} />

        {/* 9. ความยินยอมของผู้ปกครอง */}
        <SectionBar
          title="9. ความยินยอมของผู้ปกครอง (กรณีนักศึกษาอายุต่ำกว่า 20 ปีบริบูรณ์)"
          color={color}
        />
        <View style={[s.box, { backgroundColor: '#fdf2f2', borderColor: '#e8c4c4' }]} wrap={false}>
          <Text style={s.pdpaBody}>{iaGuardianConsent(brand?.name_th || '')}</Text>
          <View style={[s.fieldWrap, { marginTop: 6 }]}>
            {F('guardian_name', 'third')}
            {F('guardian_relation', 'third')}
            {F('guardian_phone', 'third')}
          </View>
        </View>

        {/* 10. ลงลายมือชื่อ */}
        <SectionBar title="10. ลงลายมือชื่อ" color={color} />
        <View style={s.signWrap} wrap={false}>
          <SignBox
            label="ลงชื่อผู้สมัคร (นักศึกษา)"
            width="32%"
            name={doc.party_name}
            dateText={docDate ? `วันที่ ${docDate}` : undefined}
          />
          <SignBox label="ลงชื่อผู้ปกครอง" width="32%" />
          <SignBox label="ลงชื่ออาจารย์ที่ปรึกษา / ผู้ประสานงาน" width="32%" />
        </View>
      </Page>
    </Document>
  )
}

// ============================================================================
// RS — ใบลาออก / Resignation Form
// ============================================================================

/** ค่าที่ขีดเส้นใต้ในย่อหน้า — ว่างก็ยังเห็นเส้น */
function Blank({ value, min = 14 }: { value?: string; min?: number }) {
  const text = value && value.trim() ? value : ' '.repeat(min)
  return <Text style={{ textDecoration: 'underline' }}>{`  ${text}  `}</Text>
}

export function ResignationPDF(data: DocumentPdfData) {
  const { doc, brand, approver } = data
  const def = DOC_TYPES.RS
  const meta = (doc.meta || {}) as Record<string, unknown>
  const color = HR_THEME.RS
  const { field, value, str } = makeField(def, meta)
  const docDate = formatThaiDate(doc.doc_date || doc.created_at)
  const co = companyName(brand?.name_th || '')

  const reasonField = field('reason')
  const options = reasonField?.options || []
  const selected = str('reason') ? [str('reason')] : []
  const tenure = calcTenure(meta.start_date as string, meta.last_working_day as string)

  const approved = ['issued', 'sent', 'closed'].includes(doc.status)
  const notApproved = ['rejected', 'void'].includes(doc.status)
  const received = doc.submitted_at || doc.created_at

  const handoverRows: [string, string][] = [
    ['ผู้รับมอบงานต่อ (ชื่อ-ตำแหน่ง)', value('handover_to')],
    ['วันที่ส่งมอบงานแล้วเสร็จ', value('handover_date')],
    ['ทรัพย์สินที่คืนบริษัท (บัตรพนักงาน, อุปกรณ์, เอกสาร ฯลฯ)', value('assets_returned')],
  ]

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Chrome doc={doc} />
        <FormHeader data={data} color={color} right="docno" />
        <View style={[s.thickRule, { borderBottomColor: color }]} />
        <Text style={[s.title, { color }]}>{def.label.th}</Text>
        <Text style={s.subtitle}>{def.label.en}</Text>
        <VoidNote doc={doc} />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 8 }}>
          <Text style={{ fontSize: 11.5 }}>วันที่</Text>
          <Text style={{ fontSize: 11.5, textDecoration: 'underline', width: 170, textAlign: 'center' }}>
            {docDate || ' '}
          </Text>
        </View>

        <Text style={[s.para, { marginBottom: 6 }]}>{`เรียน ผู้จัดการฝ่ายทรัพยากรบุคคล ${co}`}</Text>
        <Text style={[s.para, { lineHeight: 1.7 }]}>
          {'        ข้าพเจ้า'}
          <Blank value={doc.party_name || ''} min={22} />
          {'ตำแหน่ง'}
          <Blank value={value('position')} />
          {'สังกัดแผนก/ฝ่าย'}
          <Blank value={value('department')} />
          {'รหัสพนักงาน'}
          <Blank value={value('employee_id')} min={10} />
          {`มีความประสงค์ขอลาออกจากการเป็นพนักงานของ${co} โดยจะมีผลตั้งแต่วันที่`}
          <Blank value={value('last_working_day')} min={18} />
          {'ทั้งนี้ ข้าพเจ้าได้เริ่มปฏิบัติงานกับบริษัทตั้งแต่วันที่'}
          <Blank value={value('start_date')} min={18} />
          {'รวมระยะเวลาปฏิบัติงานทั้งสิ้น'}
          <Blank value={tenure ? String(tenure.years) : ''} min={5} />
          {'ปี'}
          <Blank value={tenure ? String(tenure.months) : ''} min={5} />
          {'เดือน'}
        </Text>

        {/* เหตุผลในการลาออก */}
        <SectionBar title="เหตุผลในการลาออก" color={color} />
        <OptionRow
          options={options}
          selected={selected}
          radio
          color={color}
          otherText={str('reason_other')}
        />

        {/* การส่งมอบงาน */}
        <SectionBar title="การส่งมอบงานและทรัพย์สินของบริษัท" color={color} />
        <View style={[s.table, { borderColor: '#e8c4c4' }]} wrap={false}>
          {handoverRows.map(([label, val], i) => (
            <View
              key={label}
              style={[
                i === handoverRows.length - 1 ? s.tRowLast : s.tRow,
                { borderBottomColor: '#e8c4c4' },
              ]}
            >
              <Text
                style={[s.cell, {
                  width: '32%', backgroundColor: '#fdf2f2',
                  borderRightColor: '#e8c4c4', fontWeight: 'bold', minHeight: 28,
                }]}
              >
                {label}
              </Text>
              <Text style={[s.cellLast, { width: '68%', minHeight: 28 }]}>{val}</Text>
            </View>
          ))}
        </View>

        <Text style={s.para}>{RS_DECLARATION}</Text>

        <View style={s.signWrap} wrap={false}>
          <SignBox
            label="ลงชื่อพนักงานผู้ลาออก"
            name={doc.party_name}
            dateText={docDate ? `วันที่ ${docDate}` : undefined}
          />
          <SignBox label="ลงชื่อผู้บังคับบัญชาต้นสังกัด" />
        </View>

        {/* สำหรับฝ่ายทรัพยากรบุคคล — เติมจากตัวเอกสารเอง ไม่มีช่องให้กรอกในฟอร์ม */}
        <View
          style={[s.box, { backgroundColor: '#fdf2f2', borderColor: '#e8c4c4', marginTop: 16, padding: 0 }]}
          wrap={false}
        >
          <View style={[s.sectionBar, { backgroundColor: color, marginTop: 0, marginBottom: 0 }]}>
            <Text style={s.sectionBarText}>สำหรับฝ่ายทรัพยากรบุคคล</Text>
          </View>
          <View style={{ padding: 8 }}>
            <View style={s.fieldWrap}>
              <FieldLine label="วันที่รับเอกสาร" value={formatThaiDate(received)} width="third" />
              <FieldLine label="วันทำงานสุดท้าย (อนุมัติ)" value={value('last_working_day')} width="third" />
              <View style={[s.field, { width: PCT.third }]}>
                <Text style={s.fieldLabel}>สถานะการอนุมัติ</Text>
                <View style={[s.optRow, { marginTop: 4 }]}>
                  <View style={s.opt}>
                    <Mark on={approved} radio color={color} />
                    <Text style={s.optText}>อนุมัติ</Text>
                  </View>
                  <View style={s.opt}>
                    <Mark on={notApproved} radio color={color} />
                    <Text style={s.optText}>ไม่อนุมัติ</Text>
                  </View>
                </View>
              </View>
            </View>
            <View style={s.signWrap}>
              <SignBox label="ลงชื่อเจ้าหน้าที่ฝ่ายบุคคล" />
              <SignBox
                label="ลงชื่อกรรมการ / ผู้มีอำนาจอนุมัติ"
                name={approved ? approver?.full_name : null}
                signatureUrl={approved ? approver?.signature_url : null}
                dateText={approved && doc.approved_at ? `วันที่ ${formatThaiDate(doc.approved_at)}` : undefined}
              />
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ============================================================================
// SC — หนังสือรับรองเงินเดือน / Salary Certificate
// จดหมายหัวบริษัท: หัวกระดาษ → เลขที่/วันที่ พ.ศ. → ชื่อเรื่อง → เนื้อความ → ลงนาม
// ============================================================================

export function SalaryCertificatePDF(data: DocumentPdfData) {
  const { doc, brand, approver } = data
  const def = DOC_TYPES.SC
  const meta = (doc.meta || {}) as Record<string, unknown>
  const color = HR_THEME.SC
  const { value, str } = makeField(def, meta)

  const docDate = formatThaiDate(doc.doc_date || doc.created_at)
  const approved = ['issued', 'sent', 'closed'].includes(doc.status)
  const salary = Number(meta.base_salary ?? 0)

  const paragraphs = scCertificateBody({
    nameTh: brand?.name_th || '',
    employee: doc.party_name || '',
    idCard: doc.party_id_card || '',
    position: str('position'),
    department: str('department'),
    startDate: value('start_date'),
    salary: salary > 0 ? salary.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '',
    salaryWords: salary > 0 ? numberToThaiBahtText(salary) : '',
    purpose: str('purpose'),
  })

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <Chrome doc={doc} />
        <FormHeader data={data} color={color} right="docno" />
        <View style={[s.thickRule, { borderBottomColor: color }]} />

        <Text style={[s.title, { color }]}>{def.label.th}</Text>
        <Text style={s.subtitle}>{def.label.en}</Text>
        <VoidNote doc={doc} />

        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6, marginBottom: 14 }}>
          <Text style={{ fontSize: 11.5 }}>วันที่</Text>
          <Text style={{ fontSize: 11.5, textDecoration: 'underline', width: 170, textAlign: 'center' }}>
            {docDate || ' '}
          </Text>
        </View>

        {paragraphs.map((p, i) => (
          <Text key={i} style={[s.para, { fontSize: 12.5, lineHeight: 1.75, marginBottom: 10 }]}>
            {`        ${p}`}
          </Text>
        ))}

        <Text style={[s.para, { fontSize: 12.5, marginTop: 4 }]}>
          {`        ${SC_CLOSING} ${docDate || '......../......../........'}`}
        </Text>

        {/* ลงนามผู้มีอำนาจ — ลายเซ็นขึ้นเมื่ออนุมัติแล้วเท่านั้น (เหมือนใบลาออก) */}
        <View style={[s.signWrap, { justifyContent: 'flex-end', marginTop: 24 }]} wrap={false}>
          <SignBox
            label="ลงชื่อกรรมการ / ผู้มีอำนาจลงนาม"
            name={approved ? approver?.full_name : null}
            signatureUrl={approved ? approver?.signature_url : null}
            dateText={approved && doc.approved_at ? `วันที่ ${formatThaiDate(doc.approved_at)}` : undefined}
          />
        </View>

        <Text style={[s.hint, { marginTop: 18 }]}>
          หนังสือฉบับนี้ออกโดยระบบเอกสารของบริษัท และมีผลสมบูรณ์เมื่อผ่านการอนุมัติและมีเลขที่เอกสารกำกับ
        </Text>
      </Page>
    </Document>
  )
}

// ============================================================================
// ตัวสลับตามประเภท — document-pdf.tsx เรียกตัวนี้
// ============================================================================

export function HrFormPDF(data: DocumentPdfData) {
  if (data.doc.doc_type === 'IA') return InternshipApplicationPDF(data)
  if (data.doc.doc_type === 'RS') return ResignationPDF(data)
  if (data.doc.doc_type === 'SC') return SalaryCertificatePDF(data)
  return JobApplicationPDF(data)
}
