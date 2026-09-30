// ============================================================================
// ป้ายเอกสาร / จำนวนไฟล์ / สถานะแฟ้ม ของใบเบิก — ใช้ได้ทั้งกับแถวเต็ม (มีรายการ URL) และแถวแบบเบา (มี docs แทน URL)
// ฟังก์ชันล้วน ไม่แตะฐานข้อมูล — client component import ได้
// ผลเท่ากับ getClaimChecklist (costs/types.ts), claimFileCount และ filedState (claims-filter.ts) ทุกกรณี
// ตรวจด้วย:  npx tsx "app/(authenticated)/finance/claim-docs.check.ts"
// ============================================================================

import type { ClaimChecklist } from '../costs/types'
import type { DocCount, DocCounts } from './view-data'

/** ช่องไฟล์แนบของแถวเต็ม — unknown เพราะค่าจากฐานข้อมูลเป็น null ได้ */
export interface ClaimDocFields {
  receipt_urls?: unknown
  actual_receipt_urls?: unknown
  tax_invoice_urls?: unknown
  refund_slip_urls?: unknown
  tax_invoice_numbers?: unknown
}

/** แถวเต็ม (รายการ URL) หรือแถวแบบเบา (docs) */
export type DocSource = ClaimDocFields | { docs: DocCounts }

/** ช่องที่ป้ายเอกสารใช้นอกจากไฟล์แนบ */
export interface ChecklistFields {
  status: string
  claim_type: string
  refund_amount?: number | null
  refund_confirmed_at?: string | null
}

/** ช่องของเครื่องหมายเข้าแฟ้ม (ฐานข้อมูลที่ยังไม่รัน 20260929_claim_filed.sql ไม่มีคอลัมน์ = undefined) */
export interface FiledFields {
  filed_at?: string | null
  filed_file_count?: number | null
}

/** n = ความยาวรายการดิบ · files = สตริงที่ไม่ว่างหลังตัดช่องว่าง (tax_invoice_urls ใช้ '' แทนใบกำกับที่มีแต่เลขที่) */
function countOf(v: unknown): DocCount {
  if (!Array.isArray(v)) return { n: 0, files: 0 }
  return { n: v.length, files: v.filter(u => typeof u === 'string' && u.trim() !== '').length }
}

/** สรุปไฟล์แนบของแถวเต็ม → DocCounts (server ใช้ตอนแปลงแถวก่อนส่งหน้าจอ) */
export function docCounts(c: ClaimDocFields): DocCounts {
  return {
    receipts: countOf(c.receipt_urls),
    actualReceipts: countOf(c.actual_receipt_urls),
    taxInvoices: countOf(c.tax_invoice_urls),
    refundSlips: countOf(c.refund_slip_urls),
    taxInvoiceNumbers: Array.isArray(c.tax_invoice_numbers) ? c.tax_invoice_numbers.length : 0,
  }
}

/** DocCounts ของแถวใดก็ได้ — แถวแบบเบาใช้ docs ที่ server คิดมาแล้ว */
function docsOf(c: DocSource): DocCounts {
  return 'docs' in c && c.docs ? c.docs : docCounts(c as ClaimDocFields)
}

/** ป้ายเอกสารจาก DocCounts — กติกาเดียวกับ getClaimChecklist ทุกข้อ */
export function checklistFromCounts(docs: DocCounts, c: ChecklistFields): ClaimChecklist {
  const hasReceipt = docs.receipts.n > 0 || docs.actualReceipts.n > 0
  const hasTaxInvoiceFiles = docs.taxInvoices.n > 0
  const hasTaxInvoiceNumbers = docs.taxInvoiceNumbers > 0
  const hasTaxInvoice = hasTaxInvoiceFiles || hasTaxInvoiceNumbers
  const taxInvoiceRequired = c.status === 'waiting_tax_invoice' || hasTaxInvoiceFiles || hasTaxInvoiceNumbers

  const isAdvance = c.claim_type === 'advance'
  const refundAmount = Number(c.refund_amount) || 0
  const refundRequired = isAdvance && refundAmount > 0
  const hasRefundSlip = docs.refundSlips.n > 0
  const refundConfirmed = c.status === 'refund_confirmed' || !!c.refund_confirmed_at

  let isComplete = hasReceipt
  if (taxInvoiceRequired) isComplete = isComplete && hasTaxInvoice
  if (refundRequired) isComplete = isComplete && hasRefundSlip && refundConfirmed

  return { hasReceipt, hasTaxInvoice, taxInvoiceRequired, refundRequired, hasRefundSlip, refundConfirmed, isComplete }
}

/** ป้ายเอกสารของใบเบิก (แถวเต็มหรือแถวแบบเบา) */
export function checklistOf(c: DocSource & ChecklistFields): ClaimChecklist {
  return checklistFromCounts(docsOf(c), c)
}

/** จำนวนไฟล์แนบทุกช่อง (ใบเสร็จ + ใบเสร็จตอนเคลียร์ + ใบกำกับภาษี + สลิปคืนเงิน) — นับเฉพาะไฟล์จริง */
export function fileCountOf(c: DocSource): number {
  const d = docsOf(c)
  return d.receipts.files + d.actualReceipts.files + d.taxInvoices.files + d.refundSlips.files
}

/** none = ยังไม่เข้าแฟ้ม · filed = เข้าแฟ้มแล้ว · changed = เข้าแฟ้มแล้วแต่จำนวนไฟล์แนบตอนนี้ไม่เท่ากับตอนเข้าแฟ้ม */
export function filedStateOf(c: DocSource & FiledFields): 'none' | 'filed' | 'changed' {
  if (!c.filed_at) return 'none'
  if (c.filed_file_count == null) return 'filed'
  return fileCountOf(c) === c.filed_file_count ? 'filed' : 'changed'
}
