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
import { numberToThaiBahtText } from '@/lib/thai-baht-text'
import path from 'path'

// ============================================================================
// Font Registration — TH Sarabun New
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
export interface PaymentVoucherData {
  claimNumber: string
  date: string // formatted date string
  payeeName: string
  idCardNumber?: string
  address?: string
  paymentMethod: 'cash' | 'transfer' | 'cheque'
  bankName?: string
  accountName?: string
  accountNumber?: string
  description?: string
  items: {
    no: number
    description: string
    amount: number
  }[]
  totalAmount: number
  vatAmount?: number
  whtAmount?: number
  netAmount?: number
  vatMode?: string
  whtRate?: number
  receiverName?: string
  payerName?: string
  approverName?: string
  qrCodeDataUrl?: string
}

// ============================================================================
// Styles
// ============================================================================
const s = StyleSheet.create({
  page: {
    fontFamily: 'THSarabunNew',
    fontSize: 14,
    padding: 40,
    paddingTop: 30,
    paddingBottom: 30,
  },
  // Header
  headerContainer: {
    alignItems: 'center',
    marginBottom: 12,
    position: 'relative',
  },
  qrCode: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 65,
    height: 65,
  },
  companyName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 2,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 0,
  },
  titleEn: {
    fontSize: 14,
    color: '#555',
    marginBottom: 8,
  },
  // Info rows
  infoRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  infoLabel: {
    width: 120,
    fontWeight: 'bold',
  },
  infoColon: {
    width: 10,
  },
  infoValue: {
    flex: 1,
    borderBottomWidth: 0.5,
    borderBottomColor: '#999',
    paddingBottom: 1,
  },
  // Two column info
  twoColRow: {
    flexDirection: 'row',
    marginBottom: 3,
  },
  twoColLeft: {
    flex: 1,
    flexDirection: 'row',
  },
  twoColRight: {
    flex: 1,
    flexDirection: 'row',
  },
  // Payment method
  paymentMethodRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    marginBottom: 6,
  },
  checkbox: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: '#333',
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#333',
    marginRight: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkMark: {
    color: '#fff',
    fontSize: 8,
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
  },
  // Table
  table: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#333',
  },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    backgroundColor: '#f5f5f5',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    borderBottomColor: '#ccc',
    minHeight: 22,
  },
  tableRowLast: {
    flexDirection: 'row',
    minHeight: 22,
  },
  colNo: {
    width: 50,
    textAlign: 'center',
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingVertical: 3,
    paddingHorizontal: 4,
  },
  colDesc: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  colAmount: {
    width: 140,
    textAlign: 'right',
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  thText: {
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Summary rows
  summaryRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  summaryLabel: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingVertical: 3,
    paddingHorizontal: 8,
    textAlign: 'right',
    fontWeight: 'bold',
  },
  summaryAmount: {
    width: 140,
    textAlign: 'right',
    paddingVertical: 3,
    paddingHorizontal: 8,
    fontWeight: 'bold',
  },
  // Baht text row
  bahtTextRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  bahtTextLabel: {
    width: 80,
    fontWeight: 'bold',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRightWidth: 1,
    borderRightColor: '#333',
  },
  bahtTextValue: {
    flex: 1,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  // Signatures
  signaturesContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 30,
  },
  signatureBlock: {
    width: '30%',
    alignItems: 'center',
  },
  signatureLine: {
    fontSize: 14,
    marginBottom: 4,
  },
  signatureRole: {
    fontSize: 13,
  },
  signatureName: {
    fontSize: 12,
    marginTop: 2,
    color: '#666',
  },
  // Misc
  bold: {
    fontWeight: 'bold',
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#333',
    marginVertical: 8,
  },
  taxSection: {
    flexDirection: 'row',
    marginBottom: 0,
  },
  taxLabel: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: '#333',
    paddingVertical: 2,
    paddingHorizontal: 8,
    textAlign: 'right',
    fontSize: 12,
  },
  taxAmount: {
    width: 140,
    textAlign: 'right',
    paddingVertical: 2,
    paddingHorizontal: 8,
    fontSize: 12,
  },
})

// ============================================================================
// Helper: Format number
// ============================================================================
const fmtNum = (n: number) =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ============================================================================
// CheckBox Component
// ============================================================================
function CheckBox({ checked, label }: { checked: boolean; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={checked ? s.checkboxChecked : s.checkbox}>
        {checked && <Text style={s.checkMark}>✓</Text>}
      </View>
      <Text style={s.checkboxLabel}>{label}</Text>
    </View>
  )
}

// ============================================================================
// Main PDF Document
// ============================================================================
export function PaymentVoucherPDF({ data }: { data: PaymentVoucherData }) {
  const emptyRows = Math.max(0, 5 - data.items.length)

  return (
    <Document>
      <Page size="A4" style={s.page}>
        {/* ── Header ── */}
        <View style={s.headerContainer}>
          <Text style={s.companyName}>บริษัท อิมเมจแลนด์ จำกัด</Text>
          <Text style={s.title}>ใบสำคัญจ่าย</Text>
          <Text style={s.titleEn}>PAYMENT VOUCHER</Text>
          {/* QR Code — top right corner */}
          {data.qrCodeDataUrl && (
            <Image style={s.qrCode} src={data.qrCodeDataUrl} />
          )}
        </View>

        {/* ── Document info ── */}
        <View style={s.twoColRow}>
          <View style={s.twoColLeft}>
            <Text style={s.infoLabel}>เลขที่</Text>
            <Text style={s.infoColon}>:</Text>
            <Text style={s.infoValue}>{data.claimNumber}</Text>
          </View>
          <View style={s.twoColRight}>
            <Text style={{ width: 50, fontWeight: 'bold' }}>วันที่</Text>
            <Text style={s.infoColon}>:</Text>
            <Text style={s.infoValue}>{data.date}</Text>
          </View>
        </View>

        <View style={s.infoRow}>
          <Text style={s.infoLabel}>จ่ายให้แก่</Text>
          <Text style={s.infoColon}>:</Text>
          <Text style={s.infoValue}>{data.payeeName || ''}</Text>
        </View>

        {data.idCardNumber && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>เลขบัตรประชาชน</Text>
            <Text style={s.infoColon}>:</Text>
            <Text style={s.infoValue}>{data.idCardNumber}</Text>
          </View>
        )}

        {data.address && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>ที่อยู่</Text>
            <Text style={s.infoColon}>:</Text>
            <Text style={s.infoValue}>{data.address}</Text>
          </View>
        )}

        {/* ── Payment Method ── */}
        <View style={s.paymentMethodRow}>
          <CheckBox checked={data.paymentMethod === 'cash'} label="เงินสด" />
          <CheckBox checked={data.paymentMethod === 'transfer'} label="โอน" />
          <CheckBox checked={data.paymentMethod === 'cheque'} label="เช็คธนาคาร" />
        </View>

        {/* ── Bank Details ── */}
        {data.paymentMethod === 'transfer' && (
          <>
            <View style={s.infoRow}>
              <Text style={s.infoLabel}>ธนาคาร</Text>
              <Text style={s.infoColon}>:</Text>
              <Text style={s.infoValue}>{data.bankName || ''}</Text>
            </View>
            <View style={s.twoColRow}>
              <View style={s.twoColLeft}>
                <Text style={s.infoLabel}>ชื่อบัญชี</Text>
                <Text style={s.infoColon}>:</Text>
                <Text style={s.infoValue}>{data.accountName || ''}</Text>
              </View>
              <View style={s.twoColRight}>
                <Text style={{ width: 80, fontWeight: 'bold' }}>เลขที่บัญชี</Text>
                <Text style={s.infoColon}>:</Text>
                <Text style={s.infoValue}>{data.accountNumber || ''}</Text>
              </View>
            </View>
          </>
        )}

        {/* ── Description ── */}
        {data.description && (
          <View style={s.infoRow}>
            <Text style={s.infoLabel}>รายละเอียด</Text>
            <Text style={s.infoColon}>:</Text>
            <Text style={s.infoValue}>{data.description}</Text>
          </View>
        )}

        {/* ── Items Table ── */}
        <View style={s.table}>
          {/* Header */}
          <View style={s.tableHeader}>
            <View style={s.colNo}>
              <Text style={s.thText}>ลำดับ</Text>
            </View>
            <View style={s.colDesc}>
              <Text style={s.thText}>รายการ</Text>
            </View>
            <View style={s.colAmount}>
              <Text style={s.thText}>จำนวนเงิน</Text>
            </View>
          </View>

          {/* Data rows */}
          {data.items.map((item, i) => (
            <View key={i} style={s.tableRow}>
              <View style={s.colNo}>
                <Text style={{ textAlign: 'center' }}>{item.no}</Text>
              </View>
              <View style={s.colDesc}>
                <Text>{item.description}</Text>
              </View>
              <View style={s.colAmount}>
                <Text>{fmtNum(item.amount)}</Text>
              </View>
            </View>
          ))}

          {/* Empty rows to fill minimum 5 rows */}
          {Array.from({ length: emptyRows }).map((_, i) => (
            <View key={`empty-${i}`} style={s.tableRow}>
              <View style={s.colNo}><Text> </Text></View>
              <View style={s.colDesc}><Text> </Text></View>
              <View style={s.colAmount}><Text> </Text></View>
            </View>
          ))}

          {/* VAT row (if applicable) */}
          {data.vatAmount && data.vatAmount > 0 ? (
            <View style={s.taxSection}>
              <Text style={s.taxLabel}>
                {data.vatMode === 'included' ? 'VAT 7% (รวมแล้ว)' : 'VAT 7%'}
              </Text>
              <Text style={s.taxAmount}>
                {data.vatMode === 'included' ? `(${fmtNum(data.vatAmount)})` : fmtNum(data.vatAmount)}
              </Text>
            </View>
          ) : null}

          {/* WHT row (if applicable) */}
          {data.whtAmount && data.whtAmount > 0 ? (
            <View style={s.taxSection}>
              <Text style={s.taxLabel}>หัก ณ ที่จ่าย {data.whtRate}%</Text>
              <Text style={s.taxAmount}>-{fmtNum(data.whtAmount)}</Text>
            </View>
          ) : null}

          {/* Total */}
          <View style={s.summaryRow}>
            <Text style={s.summaryLabel}>รวม</Text>
            <Text style={s.summaryAmount}>{fmtNum(data.netAmount ?? data.totalAmount)}</Text>
          </View>

          {/* Baht text */}
          <View style={s.bahtTextRow}>
            <Text style={s.bahtTextLabel}>ตัวอักษร :</Text>
            <Text style={s.bahtTextValue}>
              {numberToThaiBahtText(data.netAmount ?? data.totalAmount)}
            </Text>
          </View>
        </View>

        {/* ── Signatures ── */}
        <View style={s.signaturesContainer}>
          <View style={s.signatureBlock}>
            <Text style={s.signatureLine}>ลงชื่อ  ………………………………….</Text>
            <Text style={s.signatureRole}>(ผู้รับเงิน)</Text>
            {data.receiverName && (
              <Text style={s.signatureName}>( {data.receiverName} )</Text>
            )}
          </View>
          <View style={s.signatureBlock}>
            <Text style={s.signatureLine}>ลงชื่อ  ………………………………….</Text>
            <Text style={s.signatureRole}>(ผู้จ่ายเงิน)</Text>
            {data.payerName && (
              <Text style={s.signatureName}>( {data.payerName} )</Text>
            )}
          </View>
          <View style={s.signatureBlock}>
            <Text style={s.signatureLine}>ลงชื่อ  ………………………………….</Text>
            <Text style={s.signatureRole}>(ผู้อนุมัติ)</Text>
            {data.approverName && (
              <Text style={s.signatureName}>( {data.approverName} )</Text>
            )}
          </View>
        </View>
      </Page>
    </Document>
  )
}
