// Job Costing Module — Types & Constants
import type { FinanceCategory } from '@/app/(authenticated)/finance/settings-actions'

/** @deprecated ใช้ finance_categories จาก DB แทน — เก็บไว้เป็น fallback เท่านั้น */
export const COST_CATEGORIES = [
  { value: 'staff', label: 'Staff', labelTh: 'ค่าสตาฟ', icon: 'Users', color: '#ef4444' },
  { value: 'travel', label: 'Travel', labelTh: 'ค่าเดินทาง', icon: 'Car', color: '#f97316' },
  { value: 'equipment', label: 'Equipment', labelTh: 'อุปกรณ์ออกอีเวนต์', icon: 'Package', color: '#eab308' },
  { value: 'food', label: 'Food & Beverage', labelTh: 'อาหารและเครื่องดื่ม', icon: 'UtensilsCrossed', color: '#22c55e' },
  { value: 'venue', label: 'Venue', labelTh: 'ค่าสถานที่', icon: 'Building2', color: '#3b82f6' },
  { value: 'marketing', label: 'Marketing', labelTh: 'การตลาด / โฆษณา', icon: 'Megaphone', color: '#8b5cf6' },
  { value: 'other', label: 'Other', labelTh: 'อื่นๆ', icon: 'MoreHorizontal', color: '#6b7280' },
] as const

export type CostCategory = typeof COST_CATEGORIES[number]['value']

/** สถานะ Job Event */
export const JOB_STATUSES = [
  { value: 'draft', label: 'Draft', labelTh: 'แบบร่าง' },
  { value: 'completed', label: 'Completed', labelTh: 'เสร็จสิ้น' },
] as const

export type JobStatus = typeof JOB_STATUSES[number]['value']

/** หา label ภาษาไทย ตามหมวด — ใช้ finance_categories จาก DB ก่อน, fallback เป็น hardcode */
export function getCategoryLabel(category: string, locale: 'th' | 'en' = 'th', dbCategories?: FinanceCategory[]) {
  if (dbCategories) {
    const dbCat = dbCategories.find(c => c.value === category)
    if (dbCat) return locale === 'th' ? dbCat.label_th : dbCat.label
  }
  const cat = COST_CATEGORIES.find(c => c.value === category)
  return locale === 'th' ? (cat?.labelTh || category) : (cat?.label || category)
}

/** หา color ตามหมวด — ใช้ finance_categories จาก DB ก่อน, fallback เป็น hardcode */
export function getCategoryColor(category: string, dbCategories?: FinanceCategory[]) {
  if (dbCategories) {
    const dbCat = dbCategories.find(c => c.value === category)
    if (dbCat) return dbCat.color
  }
  return COST_CATEGORIES.find(c => c.value === category)?.color || '#6b7280'
}

// ============================================================================
// Expense Claims (ระบบเบิกเงิน / Finance)
// ============================================================================

/** สถานะใบเบิก — เรียงตามลำดับ lifecycle */
export const CLAIM_STATUSES = [
  { value: 'draft',             label: 'Draft',                labelTh: 'แบบร่าง',           color: '#6b7280' },
  { value: 'pending',           label: 'Pending',              labelTh: 'รออนุมัติ',           color: '#f59e0b' },
  { value: 'approved',          label: 'Approved',             labelTh: 'อนุมัติแล้ว',         color: '#22c55e' },
  { value: 'pending_month_end', label: 'Pending End of Month', labelTh: 'รอจ่ายสิ้นเดือน',    color: '#8b5cf6' },
  { value: 'waiting_tax_invoice', label: 'Waiting Tax Invoice', labelTh: 'รอใบกำกับภาษี',       color: '#0ea5e9' },
  { value: 'paid',              label: 'Paid',                 labelTh: 'ชำระเงินแล้ว',        color: '#14b8a6' },
  { value: 'refund_confirmed',  label: 'Refund Confirmed',     labelTh: 'คืนเงินบริษัทแล้ว',   color: '#0891b2' },
  { value: 'rejected',          label: 'Rejected',             labelTh: 'ปฏิเสธ',              color: '#ef4444' },
  { value: 'cancelled',         label: 'Cancelled',            labelTh: 'ยกเลิกแล้ว',           color: '#94a3b8' },
  // legacy — no longer produced by new code, kept for existing data
  { value: 'awaiting_payment',  label: 'Awaiting Payment',     labelTh: 'รอชำระเงิน (เก่า)',   color: '#3b82f6' },
] as const

export type ClaimStatus = typeof CLAIM_STATUSES[number]['value']

/**
 * Valid transitions per actor role.
 * Key = current status. Value = set of statuses the actor may move to.
 */
export const CLAIM_TRANSITIONS: Record<string, {
  admin: ClaimStatus[]
  owner: ClaimStatus[]   // claim submitter (non-admin)
}> = {
  draft:             { admin: ['pending', 'cancelled'], owner: ['pending', 'cancelled'] },
  pending:           { admin: ['approved', 'rejected'], owner: ['cancelled'] },
  approved:          { admin: ['waiting_tax_invoice', 'pending_month_end', 'paid', 'refund_confirmed'], owner: [] },
  waiting_tax_invoice: { admin: ['pending_month_end', 'paid', 'refund_confirmed'], owner: [] },
  pending_month_end: { admin: ['paid', 'refund_confirmed'], owner: [] },
  paid:              { admin: ['refund_confirmed'], owner: [] },
  // terminal states — no further transitions
  refund_confirmed:  { admin: [], owner: [] },
  rejected:          { admin: [], owner: [] },
  cancelled:         { admin: [], owner: [] },
  // legacy
  awaiting_payment:  { admin: ['pending_month_end', 'paid', 'refund_confirmed'], owner: [] },
}

/** Returns allowed next statuses for the given actor */
export function getAllowedTransitions(
  status: string,
  role: 'admin' | 'staff',
  isOwner: boolean,
): ClaimStatus[] {
  const t = CLAIM_TRANSITIONS[status]
  if (!t) return []
  if (role === 'admin') return t.admin
  return isOwner ? t.owner : []
}

/** Whether a given transition is allowed */
export function canTransitionTo(
  from: string,
  to: ClaimStatus,
  role: 'admin' | 'staff',
  isOwner: boolean,
): boolean {
  return getAllowedTransitions(from, role, isOwner).includes(to)
}

/** ประเภทใบเบิก */
export const CLAIM_TYPES = [
  { value: 'event',   label: 'Event',           labelTh: 'เบิกงานอีเวนต์' },
  { value: 'other',   label: 'Other',           labelTh: 'เบิกค่าอื่นๆ' },
  { value: 'advance', label: 'Advance Payment', labelTh: 'เบิกทดลองจ่าย' },
] as const

export type ClaimType = typeof CLAIM_TYPES[number]['value']

/** Type สำหรับ expense_claims row */
export interface ExpenseClaim {
  id: string
  claim_number: string
  claim_type: ClaimType
  job_event_id: string | null
  title: string
  description: string | null
  category: string
  amount: number
  unit_price: number
  unit: string
  quantity: number
  total_amount: number
  vat_mode: string
  include_vat: boolean
  withholding_tax_rate: number
  receipt_urls: string[]
  tax_invoice_urls: string[] | null
  tax_invoice_numbers: string[] | null
  /** แหล่งเงินที่ใช้เบิก: 'company' = เงินบริษัท (default), 'personal' = ผู้เบิกออกเงินส่วนตัวก่อนแล้วเบิกย้อนหลัง */
  funding_source: 'company' | 'personal'
  // Advance (ทดลองจ่าย) settlement fields — only used when claim_type = 'advance'
  actual_spent_amount: number | null
  actual_spent_items: { description: string; amount: number }[] | null
  refund_amount: number | null
  actual_receipt_urls: string[] | null
  refund_slip_urls: string[] | null
  advance_settled_at: string | null
  advance_settled_by: string | null
  refund_confirmed_at: string | null
  refund_confirmed_by: string | null
  status: ClaimStatus
  submitted_by: string | null
  approved_by: string | null
  approved_at: string | null
  reject_reason: string | null
  expense_date: string
  notes: string | null
  staff_roles: { role: string; label: string }[] | null
  bank_name: string | null
  bank_account_number: string | null
  account_holder_name: string | null
  paid_at: string | null
  paid_by: string | null
  submitted_at: string | null
  cancelled_at: string | null
  cancelled_by: string | null
  created_at: string
  // Joined
  submitter?: { id: string; full_name: string } | null
  approver?: { id: string; full_name: string } | null
  payer?: { id: string; full_name: string } | null
  job_event?: { id: string; event_name: string; source_event_id?: string | null; linked_lead_id?: string | null } | null
}

/**
 * All statuses an Admin can override to from a given current status.
 * Excludes the current status and the legacy 'awaiting_payment'.
 */
export function getAdminOverrideStatuses(currentStatus: string): ClaimStatus[] {
  return CLAIM_STATUSES
    .filter(s => s.value !== currentStatus && s.value !== 'awaiting_payment')
    .map(s => s.value as ClaimStatus)
}

/**
 * Returns true for transitions that warrant an extra confirmation warning.
 * Sensitive = reversing a finalised state or un-approving an approved claim.
 */
export function isAdminSensitiveTransition(from: string, to: string): boolean {
  if (['paid', 'rejected', 'cancelled', 'refund_confirmed'].includes(from)) return true
  if (['approved', 'waiting_tax_invoice', 'pending_month_end'].includes(from) && ['pending', 'draft', 'rejected', 'cancelled'].includes(to)) return true
  return false
}

export function getClaimStatusLabel(status: string, locale: 'th' | 'en' = 'th') {
  const s = CLAIM_STATUSES.find(c => c.value === status)
  return locale === 'th' ? (s?.labelTh || status) : (s?.label || status)
}

export function getClaimStatusColor(status: string) {
  return CLAIM_STATUSES.find(c => c.value === status)?.color || '#6b7280'
}

// ============================================================================
// Funding source (แหล่งเงินที่ใช้เบิก)
// ============================================================================

export const FUNDING_SOURCES = [
  { value: 'company',  label: 'Company Money',  labelTh: 'เงินบริษัท',     color: '#0ea5e9', descriptionTh: 'เบิกจากเงินบริษัทตามปกติ' },
  { value: 'personal', label: 'Personal Money', labelTh: 'เงินส่วนตัว',    color: '#f59e0b', descriptionTh: 'ออกเงินส่วนตัวก่อน เบิกคืนย้อนหลัง' },
] as const

export type FundingSource = typeof FUNDING_SOURCES[number]['value']

export function getFundingSourceLabel(value: string | null | undefined, locale: 'th' | 'en' = 'th') {
  const v = value || 'company'
  const f = FUNDING_SOURCES.find(s => s.value === v)
  return locale === 'th' ? (f?.labelTh || v) : (f?.label || v)
}

export function getFundingSourceColor(value: string | null | undefined) {
  const v = value || 'company'
  return FUNDING_SOURCES.find(s => s.value === v)?.color || '#0ea5e9'
}

// ============================================================================
// Document checklist — สรุปสถานะเอกสารของใบเบิกหนึ่งใบ
//
// ใช้สำหรับแสดง badge ในหน้ารายการ + checklist ในหน้ารายงาน/ตรวจสอบ
// ก่อนส่งสำนักงานบัญชี
// ============================================================================

export interface ClaimChecklist {
  /** ใบเสร็จ — แนบครบ (อย่างน้อย 1 ไฟล์) */
  hasReceipt: boolean
  /** ใบกำกับภาษี — แนบครบ (มีไฟล์อย่างน้อย 1 หรือมีเลขที่ใบกำกับ) */
  hasTaxInvoice: boolean
  /** ต้องการใบกำกับภาษีหรือไม่ — มีกรณีเดียวคือสถานะ waiting_tax_invoice หรือเคยขอแล้ว */
  taxInvoiceRequired: boolean
  /** เฉพาะ advance: ต้องคืนเงินบริษัทหรือไม่ */
  refundRequired: boolean
  /** เฉพาะ advance: แนบสลิปคืนเงินแล้ว */
  hasRefundSlip: boolean
  /** เฉพาะ advance: admin ยืนยันรับเงินคืนแล้ว */
  refundConfirmed: boolean
  /** เอกสารครบทุกอย่าง พร้อมส่งสำนักงานบัญชี */
  isComplete: boolean
}

/** สรุปสถานะเอกสารของใบเบิก ใช้กับ list/report/detail */
export function getClaimChecklist(claim: ExpenseClaim): ClaimChecklist {
  const hasReceipt = (claim.receipt_urls?.length ?? 0) > 0
    || (claim.actual_receipt_urls?.length ?? 0) > 0
  const hasTaxInvoiceFiles = (claim.tax_invoice_urls?.length ?? 0) > 0
  const hasTaxInvoiceNumbers = (claim.tax_invoice_numbers?.length ?? 0) > 0
  const hasTaxInvoice = hasTaxInvoiceFiles || hasTaxInvoiceNumbers
  const taxInvoiceRequired =
    claim.status === 'waiting_tax_invoice' || hasTaxInvoiceFiles || hasTaxInvoiceNumbers

  const isAdvance = claim.claim_type === 'advance'
  const refundAmount = Number(claim.refund_amount) || 0
  const refundRequired = isAdvance && refundAmount > 0
  const hasRefundSlip = (claim.refund_slip_urls?.length ?? 0) > 0
  const refundConfirmed = claim.status === 'refund_confirmed' || !!claim.refund_confirmed_at

  let isComplete = hasReceipt
  if (taxInvoiceRequired) isComplete = isComplete && hasTaxInvoice
  if (refundRequired) isComplete = isComplete && hasRefundSlip && refundConfirmed

  return {
    hasReceipt,
    hasTaxInvoice,
    taxInvoiceRequired,
    refundRequired,
    hasRefundSlip,
    refundConfirmed,
    isComplete,
  }
}
