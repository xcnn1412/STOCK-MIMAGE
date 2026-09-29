// ============================================================================
// ชนิดข้อมูลและข้อความของ "ชุดเอกสารใบเบิก" ที่ฝั่ง browser ใช้ร่วมกับฝั่ง server
// ไฟล์นี้ต้องไม่ import อะไรเลย — lib/claim-bundle.ts ดึง pdf-lib และ react-pdf มาด้วย
// client component จึงเอาข้อความจากไฟล์นี้ ไม่ใช่จาก claim-bundle.ts
// ============================================================================

export type BundleFileKind = 'receipt' | 'settlement' | 'tax_invoice' | 'refund_slip'
export type BundleFailReason = 'fetch' | 'foreign-host' | 'too-large' | 'unsupported' | 'broken'
export type BundleLayout = 'one' | 'two'

/** รายงานที่ route ส่งกลับในหัว X-Bundle-Report (encodeURIComponent ของ JSON) */
export interface BundleReport {
  /** หน้าทั้งไฟล์ (รวมหน้าว่างที่คั่นตอนพิมพ์สองหน้า) */
  pages: number
  /**
   * ไฟล์ที่รวมไม่ได้ทั้งหมด — มีเฉพาะในหัว X-Bundle-Report ซึ่งใส่รายการ failed ได้ไม่เกิน 50 รายการ
   * (หัว HTTP ใหญ่เกินไปไม่ได้) ถ้ามากกว่าจำนวนที่อยู่ใน failed แปลว่ารายการถูกตัด ตัว PDF มีหน้าแจ้งครบ
   */
  failedTotal?: number
  claims: {
    claimNumber: string
    /** หน้าของชุดใบนี้ (ไม่นับหน้าว่างคั่น) */
    pages: number
    /** จำนวนไฟล์แนบที่รวมเข้าชุดได้ */
    included: number
    failed: { kind: BundleFileKind; index: number; reason: BundleFailReason }[]
  }[]
}

export const BUNDLE_KIND_LABEL: Record<BundleFileKind, string> = {
  receipt: 'ใบเสร็จ/เอกสารแนบ',
  settlement: 'ใบเสร็จเคลียร์เงินทดลองจ่าย',
  tax_invoice: 'ใบกำกับภาษี',
  refund_slip: 'สลิปคืนเงิน',
}

export const BUNDLE_FAIL_REASON_TEXT: Record<BundleFailReason, string> = {
  fetch: 'ดึงไฟล์จากระบบไม่สำเร็จ',
  'foreign-host': 'ไฟล์อยู่นอกที่เก็บไฟล์ของระบบ',
  'too-large': 'ไฟล์ใหญ่เกิน 15MB',
  unsupported: 'ชนิดไฟล์ไม่รองรับ (รองรับ JPEG, PNG, PDF)',
  broken: 'ไฟล์เสียหรือถูกล็อกรหัส',
}

/** ใบเบิกต่อไฟล์ PDF หนึ่งไฟล์ — route ปฏิเสธคำขอที่เกินนี้ */
export const BUNDLE_MAX_CLAIMS_PER_FILE = 20
