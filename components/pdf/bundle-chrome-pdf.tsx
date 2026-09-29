import React from 'react'
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from '@react-pdf/renderer'
import path from 'path'

// ============================================================================
// ชั้นครอบของชุดเอกสาร (lib/claim-bundle.ts) — แถบหัวกระดาษบนหน้าไฟล์แนบ + หน้าแจ้งไฟล์ที่รวมไม่ได้
// 1 หน้าที่นี่ = 1 หน้าที่ไม่ใช่หน้าใบเบิกในชุด (A4 เสมอ) — pdf-lib เอาไปวางทับหน้าที่วางรูป/PDF แล้ว
// จึงห้ามมีพื้นหลังทึบ ตำแหน่งแถบ (top) และข้อความทั้งหมดคำนวณมาจาก lib/claim-bundle.ts
// พิมพ์ขาวดำต้องอ่านออก: ตัวอักษรเข้มบนพื้นขาว เส้นบางใต้แถบ ไม่ใช้สีพื้น
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

/** ขนาดหน้าเดียวกับ A4 ใน lib/claim-bundle.ts (pt) */
const A4_SIZE: [number, number] = [595.28, 841.89]
/** ความสูงแถบหัวกระดาษ (รวมเส้นใต้) — lib/claim-bundle.ts วางกรอบเนื้อหาไว้ใต้ค่านี้ */
export const STRIP_H = 30
/** ขอบซ้าย/ขวาของแถบ — ตรงกับขอบกรอบเนื้อหาใน lib/claim-bundle.ts */
export const STRIP_MARGIN = 24

const s = StyleSheet.create({
  page: { fontFamily: 'THSarabunNew', fontSize: 13, color: '#000000' },
  strip: {
    position: 'absolute', left: STRIP_MARGIN, right: STRIP_MARGIN, height: STRIP_H,
    paddingTop: 8, borderBottomWidth: 0.6, borderBottomColor: '#000000',
  },
  // บรรทัดเดียวเสมอ — เลขที่ใบกำกับยาวๆ ต้องไม่ดันตัวอักษรลงไปทับเนื้อหาใต้แถบ
  stripText: { fontSize: 14, maxLines: 1, textOverflow: 'ellipsis' },
  // ── หน้าแจ้งไฟล์ที่รวมไม่ได้ ──
  notice: {
    position: 'absolute', top: 160, left: 72, right: 72,
    borderWidth: 1, borderColor: '#000000', paddingVertical: 28, paddingHorizontal: 32,
  },
  noticeTitle: { fontSize: 24, fontWeight: 'bold', marginBottom: 16, textAlign: 'center' },
  noticeRow: { flexDirection: 'row', marginBottom: 6 },
  noticeLabel: { width: 90, fontSize: 16, fontWeight: 'bold' },
  noticeValue: { flex: 1, fontSize: 16 },
  noticeAction: {
    fontSize: 17, fontWeight: 'bold', marginTop: 18, paddingTop: 12,
    borderTopWidth: 0.6, borderTopColor: '#000000', textAlign: 'center',
  },
})

export interface BundleChromeStrip {
  /** ระยะจากขอบบนกระดาษถึงแถบ (pt) */
  top: number
  text: string
}

export interface BundleChromeNotice {
  claimNumber: string
  /** เช่น "ใบกำกับภาษี 2/3 · เลขที่ INV-001" */
  fileLabel: string
  /** สาเหตุภาษาไทย */
  reason: string
}

export interface BundleChromePage {
  strips: BundleChromeStrip[]
  notice?: BundleChromeNotice
}

export function BundleChromePDF({ pages }: { pages: BundleChromePage[] }) {
  return (
    <Document>
      {pages.map((p, i) => (
        <Page key={i} size={A4_SIZE} style={s.page}>
          {p.strips.map((strip, j) => (
            <View key={j} style={[s.strip, { top: strip.top }]}>
              <Text style={s.stripText}>{strip.text}</Text>
            </View>
          ))}
          {p.notice && (
            <View style={s.notice}>
              <Text style={s.noticeTitle}>ไฟล์นี้รวมเข้าชุดเอกสารไม่ได้</Text>
              <View style={s.noticeRow}>
                <Text style={s.noticeLabel}>ใบเบิก</Text>
                <Text style={s.noticeValue}>{p.notice.claimNumber}</Text>
              </View>
              <View style={s.noticeRow}>
                <Text style={s.noticeLabel}>ไฟล์</Text>
                <Text style={s.noticeValue}>{p.notice.fileLabel}</Text>
              </View>
              <View style={s.noticeRow}>
                <Text style={s.noticeLabel}>สาเหตุ</Text>
                <Text style={s.noticeValue}>{p.notice.reason}</Text>
              </View>
              <Text style={s.noticeAction}>กรุณาเปิดไฟล์นี้จากหน้าใบเบิกแล้วพิมพ์แยก</Text>
            </View>
          )}
        </Page>
      ))}
    </Document>
  )
}
