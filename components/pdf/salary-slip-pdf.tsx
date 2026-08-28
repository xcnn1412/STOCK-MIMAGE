import React from 'react'
import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'
import path from 'path'
import { numberToThaiBahtText } from '@/lib/thai-baht-text'
import { formatThaiDate } from '@/lib/thai-date'
import { EMPLOYMENT_LABEL, LINE_KIND_LABEL, fmtMoney, slipTitle } from '@/app/(authenticated)/salary/format'
import {
  lineAmount,
  type EmploymentType,
  type SalaryAdjustment,
  type SalaryLine,
} from '@/app/(authenticated)/salary/compute'

// ============================================================================
// Font Registration — TH Sarabun New
// ponytail: คัดลอกบล็อกนี้ตาม convention ของ repo (document-pdf.tsx / payment-voucher.tsx)
// แทนที่จะ import ข้ามไฟล์ — Font.register เป็น global side-effect เรียกซ้ำไม่มีผลเสีย
// ============================================================================
const fontDir = path.join(process.cwd(), 'public', 'fonts')

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: path.join(fontDir, 'THSarabunNew.ttf'), fontWeight: 'normal' },
    { src: path.join(fontDir, 'THSarabunNew Bold.ttf'), fontWeight: 'bold' },
  ],
})

// ============================================================================
// Types
// ============================================================================

/**
 * สลิปที่เอกสารนี้ต้องใช้ — เป็น subset ของ `SlipDetail` (salary/actions.ts) โดยตั้งใจ:
 * route ส่ง `SlipDetail` เข้ามาได้ตรงๆ ส่วนสคริปต์ตรวจสร้าง fixture ได้เองโดยไม่ต้อง
 * แตะ actions ('use server' — import เข้ามาในคอมโพเนนต์ที่ใช้ร่วมกันไม่ควรทำ)
 */
/** หนึ่งครั้งที่สลิปถูกเปิดกลับมาแก้หลังปิดงวด — subset ของ ReopenEntry ใน actions.ts */
export interface SalarySlipPdfReopen {
  at: string
  by_name: string | null
  reason: string
  total_before: number
  /** null = ยังไม่ได้ปิดงวดใหม่ */
  total_after: number | null
}

export interface SalarySlipPdfSlip {
  id: string
  status: 'draft' | 'finalized' | 'paid'
  /** ชนิดงวด — ไม่ส่ง = งวดเดือน (สลิปเก่า/fixture ของสคริปต์ตรวจ) */
  kind?: string | null
  employment_type: EmploymentType
  base_salary: number
  lines: SalaryLine[]
  adjustments: SalaryAdjustment[]
  total: number
  /** ประวัติการเปิดแก้หลังปิดงวด — ไม่ส่ง/ว่าง = ไม่พิมพ์หัวข้อ "ประวัติการแก้ไข" */
  reopen_history?: SalarySlipPdfReopen[] | null
  /** ยอดที่จ่ายไปครั้งล่าสุด — ต่างจาก total เมื่อสลิปถูกเปิดแก้หลังจ่ายแล้ว */
  paid_total?: number | null
  finalized_at: string | null
  paid_at: string | null
  period_key: string
  period_start: string
  period_end: string
  full_name: string | null
  nickname: string | null
  department?: string | null
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
}

export interface SalarySlipPdfData {
  slip: SalarySlipPdfSlip
  /** วันที่พิมพ์ — ส่งเข้ามาได้เพื่อให้ผลลัพธ์คงที่ (สคริปต์ตรวจ) ไม่ส่ง = วันนี้ */
  printedAt?: string | Date
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { fontSize: 22, fontWeight: 'bold' },
  period: { fontSize: 12, color: '#333', marginTop: 2 },
  statusCol: { alignItems: 'flex-end', width: '42%' },
  statusText: { fontSize: 13, fontWeight: 'bold', textAlign: 'right' },
  statusDate: { fontSize: 11, color: '#555', textAlign: 'right', marginTop: 1 },
  rule: { borderBottomWidth: 1, borderBottomColor: '#333', marginTop: 8, marginBottom: 8 },
  // ── Employee block ──
  infoBox: {
    borderWidth: 0.5, borderColor: '#999', borderRadius: 2,
    paddingVertical: 5, paddingHorizontal: 7, marginBottom: 10,
    flexDirection: 'row', flexWrap: 'wrap',
  },
  infoItem: { width: '50%', flexDirection: 'row', paddingVertical: 1 },
  infoLabel: { fontSize: 11.5, fontWeight: 'bold', width: 74 },
  infoValue: { fontSize: 11.5, flex: 1 },
  // ── Table ──
  table: { borderWidth: 1, borderColor: '#333', marginBottom: 8 },
  tHead: {
    flexDirection: 'row', backgroundColor: '#f0f0f0',
    borderBottomWidth: 1, borderBottomColor: '#333',
  },
  tRow: { flexDirection: 'row', borderBottomWidth: 0.5, borderBottomColor: '#ccc' },
  cell: {
    paddingVertical: 3, paddingHorizontal: 4, fontSize: 11.5,
    borderRightWidth: 0.5, borderRightColor: '#ccc',
  },
  cellLast: { paddingVertical: 3, paddingHorizontal: 4, fontSize: 11.5 },
  th: { fontWeight: 'bold', textAlign: 'center' },
  cDate: { width: 92 },
  cDesc: { flex: 1 },
  cQty: { width: 62, textAlign: 'right' },
  cAmt: { width: 82, textAlign: 'right' },
  groupCell: {
    paddingVertical: 2, paddingHorizontal: 4, fontSize: 11, fontWeight: 'bold',
    backgroundColor: '#f7f7f7', color: '#444',
  },
  note: { fontSize: 10, color: '#666', marginTop: 1 },
  missing: { fontSize: 10.5, fontWeight: 'bold', color: '#b45309', textAlign: 'right' },
  // ── Totals ──
  totalsWrap: { flexDirection: 'row', justifyContent: 'flex-end' },
  totalsBox: { width: 260 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  totalLabel: { fontSize: 11.5 },
  totalValue: { fontSize: 11.5, textAlign: 'right', width: 100 },
  totalDivider: { borderTopWidth: 0.5, borderTopColor: '#333', marginVertical: 3 },
  netLabel: { fontSize: 15, fontWeight: 'bold' },
  netValue: { fontSize: 15, fontWeight: 'bold', textAlign: 'right', width: 110 },
  bahtText: { fontSize: 11.5, fontWeight: 'bold', textAlign: 'right', marginTop: 3 },
  // ── ประวัติการแก้ไข ──
  histBox: { marginTop: 10, borderTopWidth: 0.5, borderTopColor: '#999', paddingTop: 5 },
  histTitle: { fontSize: 11.5, fontWeight: 'bold', marginBottom: 2 },
  histLine: { fontSize: 10.5, color: '#444', marginBottom: 1 },
  histDiff: { fontSize: 10.5, fontWeight: 'bold', color: '#b45309', marginTop: 2 },
  // ── Footer / watermark ──
  footer: { position: 'absolute', bottom: 20, left: 36, right: 36, textAlign: 'center' },
  footerText: { fontSize: 9.5, color: '#666' },
  pageNo: { fontSize: 9.5, color: '#666', marginTop: 2 },
  watermark: {
    position: 'absolute', top: 300, left: 0, right: 0,
    textAlign: 'center', transform: 'rotate(-30deg)',
  },
  wmDraft: { fontSize: 84, color: '#000000', opacity: 0.08, fontWeight: 'bold' },
})

// ============================================================================
// Helpers
// ============================================================================

/** จำนวนติดลบมี '-' อยู่แล้ว — เติม '+' ให้ฝั่งบวกเพื่อให้อ่านออกว่าเป็นการปรับ ± */
function signedMoney(n: number): string {
  return `${n > 0 ? '+' : ''}${fmtMoney(n)}`
}

/**
 * ชื่อรายการในคอลัมน์ "รายการ" — ทุกบรรทัดต้องอ่านออกว่าเป็นเงินประเภทไหน
 * จึงเติมชื่อชนิดนำหน้า ยกเว้นเมื่อ label ขึ้นต้นด้วยชื่อชนิดอยู่แล้ว (compute.ts ตั้ง
 * label ว่า 'OT 2.5 ชม.' / 'เบิ้ลต่างจังหวัด · <อีเวนต์>' / 'รันเนอร์ · N เช็คอิน' —
 * เติมซ้ำจะได้ 'OT · OT 2.5 ชม.' ส่วนบรรทัดค่าสตาฟที่ label เป็นชื่อหน้าที่ยังต้องมี)
 */
function describeLine(line: SalaryLine): string {
  const kind = LINE_KIND_LABEL[line.kind]
  return line.label.startsWith(kind) ? line.label : `${kind} · ${line.label}`
}

/** ข้อความสถานะ + วันที่ของสถานะนั้น (ร่างยังไม่มีวันที่) */
function statusInfo(slip: SalarySlipPdfSlip): { label: string; date: string } {
  if (slip.status === 'paid') {
    return { label: 'จ่ายแล้ว', date: slip.paid_at ? `วันที่ ${formatThaiDate(slip.paid_at)}` : '' }
  }
  if (slip.status === 'finalized') {
    return {
      label: 'ปิดงวดแล้ว',
      date: slip.finalized_at ? `วันที่ ${formatThaiDate(slip.finalized_at)}` : '',
    }
  }
  return { label: 'ร่าง (ยังไม่ปิดงวด)', date: '' }
}

/** หนึ่งช่องข้อมูลพนักงาน — ไม่มีค่าก็ไม่ต้องพิมพ์หัวข้อทิ้งไว้ */
function InfoItem({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <View style={s.infoItem}>
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  )
}

// ============================================================================
// SalarySlipPDF
// ============================================================================
export function SalarySlipPDF({ slip, printedAt }: SalarySlipPdfData) {
  const isDraft = slip.status === 'draft'
  const isFulltime = slip.employment_type !== 'freelance' // ประจำ + ฝึกงาน มีฐาน
  const status = statusInfo(slip)

  const name = slip.full_name || slip.nickname || '(ไม่มีชื่อ)'
  const base = isFulltime ? Number(slip.base_salary || 0) : 0
  // ฐาน = 0 คืองวดสัปดาห์/กำหนดเอง (ไม่มีเงินเดือนฐาน) → ไม่ต้องพิมพ์แถว 0.00
  const showBase = isFulltime && base > 0
  const linesTotal = slip.lines.reduce((sum, l) => sum + lineAmount(l), 0)
  const adjustTotal = slip.adjustments.reduce((sum, a) => sum + Number(a.amount || 0), 0)
  // "รวมบรรทัด" = ทุกแถวในตารางด้านบน (ฐาน + บรรทัดที่คำนวณ) — บวกกับรายการปรับมือ
  // แล้วต้องได้ยอดสุทธิพอดี ตามสูตรใน compute.ts §7
  const rowsTotal = base + linesTotal

  // วันที่ซ้ำในคอลัมน์แรกพิมพ์ครั้งเดียวต่อกลุ่ม (บรรทัดเรียงตามวันมาแล้วจากเครื่องคำนวณ)
  const rows = slip.lines.map((l, i) => ({
    line: l,
    showDate: i === 0 || l.date !== slip.lines[i - 1].date,
  }))

  const hasAdjustments = slip.adjustments.length > 0
  const printedLabel = formatThaiDate(printedAt ? new Date(printedAt) : new Date())

  // ── ประวัติการเปิดแก้ + ส่วนต่างของสลิปที่จ่ายไปแล้วแต่ถูกเปิดแก้ ──
  const reopens = slip.reopen_history || []
  const paidTotal = slip.paid_total === null || slip.paid_total === undefined
    ? null
    : Number(slip.paid_total)
  const paidDiff = paidTotal === null ? 0 : Number((Number(slip.total) - paidTotal).toFixed(2))
  const showPaidDiff = paidTotal !== null && paidDiff !== 0

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── ลายน้ำ "ร่าง" — สลิปร่างเป็นการดูตัวอย่างของ admin ไม่ใช่สลิปจริง ── */}
        {isDraft && (
          <View style={s.watermark} fixed>
            <Text style={s.wmDraft}>ร่าง / DRAFT</Text>
          </View>
        )}

        {/* ── หัวสลิป ── */}
        <View style={s.header}>
          <View>
            {/* งวดเดือน = "สลิปเงินเดือน …" · งวดสัปดาห์/กำหนดเอง = "สลิปค่าจ้าง …" */}
            <Text style={s.title}>{slipTitle(slip)}</Text>
            <Text style={s.period}>
              {formatThaiDate(slip.period_start)} – {formatThaiDate(slip.period_end)}
            </Text>
          </View>
          <View style={s.statusCol}>
            <Text style={s.statusText}>{status.label}</Text>
            {status.date ? <Text style={s.statusDate}>{status.date}</Text> : null}
          </View>
        </View>
        <View style={s.rule} />

        {/* ── ข้อมูลพนักงาน + บัญชีรับเงิน ── */}
        <View style={s.infoBox}>
          <InfoItem label="ชื่อ-นามสกุล" value={name} />
          <InfoItem label="ชื่อเล่น" value={slip.nickname} />
          <InfoItem label="แผนก" value={slip.department} />
          <InfoItem label="ประเภทการจ้าง" value={EMPLOYMENT_LABEL[slip.employment_type]} />
          <InfoItem label="ธนาคาร" value={slip.bank_name} />
          <InfoItem label="เลขที่บัญชี" value={slip.bank_account_number} />
          <InfoItem label="ชื่อบัญชี" value={slip.account_holder_name} />
        </View>

        {/* ── รายการในสลิป ── */}
        <View style={s.table}>
          <View style={s.tHead} fixed>
            <Text style={[s.cell, s.cDate, s.th]}>วันที่</Text>
            <Text style={[s.cell, s.cDesc, s.th]}>รายการ</Text>
            <Text style={[s.cell, s.cQty, s.th]}>จำนวน</Text>
            <Text style={[s.cellLast, s.cAmt, s.th]}>จำนวนเงิน</Text>
          </View>

          {/* เงินเดือนฐาน — เฉพาะพนักงานประจำ (ฟรีแลนซ์ไม่มีบรรทัดนี้ ตาม compute.ts §7) */}
          {showBase && (
            <View style={s.tRow} wrap={false}>
              <Text style={[s.cell, s.cDate]}>—</Text>
              <Text style={[s.cell, s.cDesc]}>เงินเดือนฐาน</Text>
              <Text style={[s.cell, s.cQty]}></Text>
              <Text style={[s.cellLast, s.cAmt]}>{fmtMoney(base)}</Text>
            </View>
          )}

          {rows.length === 0 && (
            <View style={s.tRow}>
              <Text style={[s.cellLast, { flex: 1, textAlign: 'center', color: '#666' }]}>
                ไม่มีรายการจากเช็คอินในงวดนี้
              </Text>
            </View>
          )}

          {rows.map(({ line, showDate }) => (
            <View style={s.tRow} key={line.key} wrap={false}>
              <Text style={[s.cell, s.cDate]}>{showDate ? formatThaiDate(line.date) : ''}</Text>
              <View style={[s.cell, s.cDesc]}>
                <Text>{describeLine(line)}</Text>
                {line.override_note ? (
                  <Text style={s.note}>
                    แก้มือ: {line.override_note} (เดิม {fmtMoney(line.computed_amount)})
                  </Text>
                ) : null}
              </View>
              <Text style={[s.cell, s.cQty]}>
                {line.kind === 'ot' && line.hours ? `${line.hours} ชม.` : ''}
              </Text>
              {line.amount === null || line.amount === undefined ? (
                <Text style={[s.cellLast, s.cAmt, s.missing]}>ยังไม่กรอก</Text>
              ) : (
                <Text style={[s.cellLast, s.cAmt]}>{fmtMoney(lineAmount(line))}</Text>
              )}
            </View>
          ))}

          {/* รายการปรับมือ — โบนัส / หัก ที่ admin เพิ่มเอง (± ได้) */}
          {hasAdjustments && (
            <>
              <View style={s.tRow}>
                <Text style={[s.groupCell, { flex: 1 }]}>รายการปรับมือ</Text>
              </View>
              {slip.adjustments.map((a, i) => (
                <View style={s.tRow} key={a.id || `adj-${i}`} wrap={false}>
                  <Text style={[s.cell, s.cDate]}></Text>
                  <Text style={[s.cell, s.cDesc]}>{a.label || '(ไม่มีชื่อรายการ)'}</Text>
                  <Text style={[s.cell, s.cQty]}></Text>
                  <Text style={[s.cellLast, s.cAmt]}>{signedMoney(Number(a.amount || 0))}</Text>
                </View>
              ))}
            </>
          )}
        </View>

        {/* ── ยอดรวม ── */}
        <View style={s.totalsWrap}>
          <View style={s.totalsBox}>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>รวมบรรทัด</Text>
              <Text style={s.totalValue}>{fmtMoney(rowsTotal)}</Text>
            </View>
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>รวมรายการปรับมือ</Text>
              <Text style={s.totalValue}>{signedMoney(adjustTotal)}</Text>
            </View>
            <View style={s.totalDivider} />
            <View style={s.totalRow}>
              <Text style={s.netLabel}>ยอดสุทธิ</Text>
              <Text style={s.netValue}>{fmtMoney(slip.total)}</Text>
            </View>
            <Text style={s.bahtText}>({numberToThaiBahtText(Number(slip.total) || 0)})</Text>
          </View>
        </View>

        {/* ── ประวัติการแก้ไข — สลิปที่ถูกเปิดกลับมาแก้หลังปิดงวดต้องตามรอยได้ ── */}
        {(reopens.length > 0 || showPaidDiff) && (
          <View style={s.histBox} wrap={false}>
            {reopens.length > 0 && (
              <>
                <Text style={s.histTitle}>ประวัติการแก้ไข</Text>
                {reopens.map((r, i) => (
                  <Text style={s.histLine} key={`${r.at}-${i}`}>
                    {`ครั้งที่ ${i + 1} วันที่ ${formatThaiDate(r.at)} `}
                    {`โดย ${r.by_name || 'ไม่ทราบชื่อ'} เหตุผล: ${r.reason} `}
                    {`ยอด ${fmtMoney(r.total_before)} → `}
                    {r.total_after === null || r.total_after === undefined
                      ? 'กำลังแก้ไข'
                      : fmtMoney(r.total_after)}
                  </Text>
                ))}
              </>
            )}
            {showPaidDiff && (
              <Text style={s.histDiff}>
                {`ยอดที่จ่ายไปแล้ว ${fmtMoney(paidTotal)} · `}
                {`ส่วนต่าง ${paidDiff > 0 ? '+' : '-'}${fmtMoney(Math.abs(paidDiff))} `}
                {paidDiff > 0 ? '(ต้องโอนเพิ่ม)' : '(ต้องหักคืน)'}
              </Text>
            )}
          </View>
        )}

        {/* ── ท้ายกระดาษ ── */}
        <View style={s.footer} fixed>
          <Text style={s.footerText}>เอกสารนี้ออกโดยระบบ · พิมพ์เมื่อ {printedLabel}</Text>
          <Text
            style={s.pageNo}
            render={({ pageNumber, totalPages }) => `หน้า ${pageNumber} / ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  )
}

export default SalarySlipPDF
