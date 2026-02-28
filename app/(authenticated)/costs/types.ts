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

/** สถานะใบเบิก */
export const CLAIM_STATUSES = [
  { value: 'pending', label: 'Pending', labelTh: 'รออนุมัติ', color: '#f59e0b' },
  { value: 'approved', label: 'Approved', labelTh: 'อนุมัติแล้ว', color: '#22c55e' },
  { value: 'rejected', label: 'Rejected', labelTh: 'ปฏิเสธ', color: '#ef4444' },
] as const

export type ClaimStatus = typeof CLAIM_STATUSES[number]['value']

/** ประเภทใบเบิก */
export const CLAIM_TYPES = [
  { value: 'event', label: 'Event', labelTh: 'เบิกงานอีเวนต์' },
  { value: 'other', label: 'Other', labelTh: 'เบิกค่าอื่นๆ' },
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
  status: ClaimStatus
  submitted_by: string | null
  approved_by: string | null
  approved_at: string | null
  reject_reason: string | null
  expense_date: string
  notes: string | null
  created_at: string
  // Joined
  submitter?: { id: string; full_name: string } | null
  approver?: { id: string; full_name: string } | null
  job_event?: { id: string; event_name: string } | null
}

export function getClaimStatusLabel(status: string, locale: 'th' | 'en' = 'th') {
  const s = CLAIM_STATUSES.find(c => c.value === status)
  return locale === 'th' ? (s?.labelTh || status) : (s?.label || status)
}

export function getClaimStatusColor(status: string) {
  return CLAIM_STATUSES.find(c => c.value === status)?.color || '#6b7280'
}
