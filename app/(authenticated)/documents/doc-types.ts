// ============================================================================
// Document Control — config กลางของโมดูล "เอกสาร"
// ฟอร์ม / validation / PDF / actions อ่านไฟล์นี้ร่วมกัน (spec: docs/specs/documents-module.md)
// ponytail: plain TS ไม่มี 'use client'/'use server' — import ได้ทั้งสองฝั่ง
// ============================================================================

// ── สถานะ ────────────────────────────────────────────────────────────────────

export const DOC_STATUSES = [
  'draft', 'pending_approval', 'rejected', 'issued', 'sent', 'void', 'closed',
] as const

export type DocStatus = (typeof DOC_STATUSES)[number]

export const STATUS_LABEL: Record<DocStatus, { th: string; en: string; color: string }> = {
  draft:            { th: 'ร่าง',        en: 'Draft',            color: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300' },
  pending_approval: { th: 'รออนุมัติ',   en: 'Pending',          color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  rejected:         { th: 'ตีกลับ',      en: 'Rejected',         color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
  issued:           { th: 'ออกเลขแล้ว',  en: 'Issued',           color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
  sent:             { th: 'ส่งแล้ว',     en: 'Sent',             color: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400' },
  void:             { th: 'ยกเลิก',      en: 'Void',             color: 'bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 line-through' },
  closed:           { th: 'ปิดงาน',      en: 'Closed',           color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' },
}

/** สถานะที่ยังแก้เนื้อหาได้ */
export const EDITABLE_STATUSES: DocStatus[] = ['draft', 'rejected']

// ── ประเภทเอกสาร ─────────────────────────────────────────────────────────────

export const DOC_TYPE_CODES = [
  'QT', 'JO', 'IV', 'TX', 'RC', 'CN', 'PO', 'CT', 'DN', 'MM', 'JA', 'IA', 'RS',
] as const

export type DocTypeCode = (typeof DOC_TYPE_CODES)[number]

export type PartyKind = 'customer' | 'vendor' | 'applicant' | 'employee' | 'none'

export interface MetaField {
  key: string
  label: { th: string; en: string }
  type: 'text' | 'date' | 'number' | 'richtext' | 'textarea' | 'select'
  required?: boolean
  options?: string[]
}

export interface DocTypeDef {
  code: DocTypeCode
  label: { th: string; en: string }
  party: PartyKind
  hasItems: boolean
  hasAmounts: boolean
  requiresApproval: boolean
  counter: 'monthly' | 'yearly'
  refTypes: DocTypeCode[]
  refRequired?: boolean
  metaFields: MetaField[]
}

export const PARTY_LABEL: Record<PartyKind, { th: string; en: string }> = {
  customer:  { th: 'ลูกค้า',    en: 'Customer' },
  vendor:    { th: 'ผู้ขาย',    en: 'Vendor' },
  applicant: { th: 'ผู้สมัคร',  en: 'Applicant' },
  employee:  { th: 'พนักงาน',  en: 'Employee' },
  none:      { th: '—',        en: '—' },
}

export const DOC_TYPES: Record<DocTypeCode, DocTypeDef> = {
  QT: {
    code: 'QT', label: { th: 'ใบเสนอราคา', en: 'Quotation' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'expiry_date', label: { th: 'วันหมดอายุ', en: 'Valid until' }, type: 'date' },
    ],
  },
  JO: {
    code: 'JO', label: { th: 'ใบสั่งจ้าง/ยืนยันงาน', en: 'Job Order' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: ['QT'],
    metaFields: [
      { key: 'event_date',     label: { th: 'วันงาน',    en: 'Event date' },     type: 'date' },
      { key: 'event_location', label: { th: 'สถานที่',   en: 'Location' },       type: 'text' },
      { key: 'team',           label: { th: 'ทีมงาน',    en: 'Team' },           type: 'text' },
    ],
  },
  IV: {
    code: 'IV', label: { th: 'ใบแจ้งหนี้', en: 'Invoice' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: ['QT'],
    metaFields: [
      { key: 'due_date', label: { th: 'ครบกำหนดชำระ', en: 'Due date' }, type: 'date' },
    ],
  },
  TX: {
    code: 'TX', label: { th: 'ใบกำกับภาษี', en: 'Tax Invoice' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'yearly',
    refTypes: ['IV', 'RC'],
    metaFields: [],
  },
  RC: {
    code: 'RC', label: { th: 'ใบเสร็จรับเงิน', en: 'Receipt' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'yearly',
    refTypes: ['IV'],
    metaFields: [
      { key: 'payment_method', label: { th: 'วิธีชำระ', en: 'Payment method' }, type: 'select', options: ['โอนเงิน', 'เงินสด', 'เช็ค', 'บัตรเครดิต'] },
    ],
  },
  CN: {
    code: 'CN', label: { th: 'ใบลดหนี้', en: 'Credit Note' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'yearly',
    refTypes: ['QT', 'IV', 'TX', 'RC'], refRequired: true,
    metaFields: [
      { key: 'reason', label: { th: 'เหตุผล', en: 'Reason' }, type: 'textarea', required: true },
    ],
  },
  PO: {
    code: 'PO', label: { th: 'ใบสั่งซื้อ', en: 'Purchase Order' },
    party: 'vendor', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'delivery_date', label: { th: 'วันส่งมอบ', en: 'Delivery date' }, type: 'date' },
    ],
  },
  CT: {
    code: 'CT', label: { th: 'สัญญาจ้าง', en: 'Contract' },
    party: 'customer', hasItems: true, hasAmounts: true, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'body', label: { th: 'เนื้อหาสัญญา', en: 'Contract body' }, type: 'richtext' },
    ],
  },
  DN: {
    code: 'DN', label: { th: 'ใบส่งมอบงาน', en: 'Delivery Note' },
    party: 'customer', hasItems: true, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: ['JO'],
    metaFields: [],
  },
  MM: {
    code: 'MM', label: { th: 'บันทึกข้อความ', en: 'Memo' },
    party: 'none', hasItems: false, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'subject', label: { th: 'เรื่อง',   en: 'Subject' }, type: 'text', required: true },
      { key: 'to',      label: { th: 'ถึง',      en: 'To' },      type: 'text', required: true },
      { key: 'body',    label: { th: 'เนื้อหา',  en: 'Body' },    type: 'richtext' },
    ],
  },
  JA: {
    code: 'JA', label: { th: 'ใบสมัครงาน', en: 'Job Application' },
    party: 'applicant', hasItems: false, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'position',        label: { th: 'ตำแหน่ง',              en: 'Position' },        type: 'text', required: true },
      { key: 'expected_salary', label: { th: 'เงินเดือนที่ต้องการ',  en: 'Expected salary' }, type: 'number' },
      { key: 'available_date',  label: { th: 'วันเริ่มงานได้',       en: 'Available from' },  type: 'date' },
      { key: 'history',         label: { th: 'ประวัติ',              en: 'History' },         type: 'richtext' },
    ],
  },
  IA: {
    code: 'IA', label: { th: 'ใบสมัครนักศึกษาฝึกงาน', en: 'Internship Application' },
    party: 'applicant', hasItems: false, hasAmounts: false, requiresApproval: false, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'institution', label: { th: 'สถาบัน',            en: 'Institution' }, type: 'text', required: true },
      { key: 'faculty',     label: { th: 'คณะ/สาขา',          en: 'Faculty' },     type: 'text' },
      { key: 'intern_start',label: { th: 'เริ่มฝึกงาน',        en: 'Start date' },  type: 'date' },
      { key: 'intern_end',  label: { th: 'สิ้นสุดฝึกงาน',      en: 'End date' },    type: 'date' },
      { key: 'advisor',     label: { th: 'อาจารย์ที่ปรึกษา',   en: 'Advisor' },     type: 'text' },
    ],
  },
  RS: {
    code: 'RS', label: { th: 'ใบลาออก', en: 'Resignation' },
    party: 'employee', hasItems: false, hasAmounts: false, requiresApproval: true, counter: 'monthly',
    refTypes: [],
    metaFields: [
      { key: 'position',          label: { th: 'ตำแหน่ง',          en: 'Position' },        type: 'text' },
      { key: 'department',        label: { th: 'แผนก',             en: 'Department' },      type: 'text' },
      { key: 'last_working_day',  label: { th: 'วันทำงานสุดท้าย',  en: 'Last working day' }, type: 'date',     required: true },
      { key: 'reason',            label: { th: 'เหตุผล',           en: 'Reason' },          type: 'textarea', required: true },
    ],
  },
}

// ── HTML (richtext meta) ─────────────────────────────────────────────────────
// ponytail: HTML ในฟิลด์ richtext มาจาก TipTap ของเราเอง (ไม่มี script/on* อยู่แล้ว)
// ตัวนี้เป็นแค่ยามที่ trust boundary — regex 3 บรรทัด พอสำหรับสิ่งที่เรา render เอง
// ไม่ใช่ sanitizer ทั่วไป ถ้าวันไหนรับ HTML จากภายนอกจริงๆ ให้เปลี่ยนไปใช้ DOMPurify

export function sanitizeHtml(html: string): string {
  return String(html)
    .replace(/<\s*\/?\s*(script|iframe|object|embed|style|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*'|javascript:[^\s>]*)/gi, '')
}

/** ล้าง string ทุกตัวใน meta ก่อนบันทึกลง DB */
export function sanitizeMeta(meta: Record<string, unknown> | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(meta || {})) out[k] = typeof v === 'string' ? sanitizeHtml(v) : v
  return out
}

/** true เมื่อ HTML ไม่มีเนื้อความจริง (TipTap คืน '<p></p>' ตอนว่าง) */
export function isHtmlEmpty(html: string | null | undefined): boolean {
  return !String(html || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim()
}

// ── State machine ────────────────────────────────────────────────────────────

export type DocAction = 'submit' | 'approve' | 'reject' | 'issue' | 'void' | 'mark_sent' | 'close'

export interface TransitionDef {
  from: DocStatus[]
  to: DocStatus
  adminOnly: boolean
  requiresNote?: boolean
}

export const TRANSITIONS: Record<DocAction, TransitionDef> = {
  submit:    { from: ['draft', 'rejected'],   to: 'pending_approval', adminOnly: false },
  approve:   { from: ['pending_approval'],    to: 'issued',           adminOnly: true },
  reject:    { from: ['pending_approval'],    to: 'rejected',         adminOnly: true, requiresNote: true },
  issue:     { from: ['draft', 'rejected'],   to: 'issued',           adminOnly: false },
  void:      { from: ['issued', 'sent'],      to: 'void',             adminOnly: true, requiresNote: true },
  mark_sent: { from: ['issued'],              to: 'sent',             adminOnly: false },
  close:     { from: ['sent'],                to: 'closed',           adminOnly: false },
}

// ── การคำนวณยอด (pure) ───────────────────────────────────────────────────────

export type VatMode = 'none' | 'exclusive' | 'inclusive'

export interface DocumentItemInput {
  quantity?: number | null
  unit_price?: number | null
  discount?: number | null
}

export interface DocumentTotals {
  subtotal: number
  discount_total: number
  vat_amount: number
  wht_amount: number
  total: number
  net_payable: number
}

const VAT_RATE = 0.07
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * exclusive: VAT 7% บวกนอกจากยอดหลังส่วนลด
 * inclusive: ยอดที่กรอกรวม VAT แล้ว → ฐาน = ยอด / 1.07
 * WHT คิดจากฐานก่อน VAT เสมอ, net_payable = total − wht
 */
export function calcDocumentTotals(
  items: DocumentItemInput[],
  vatMode: VatMode,
  whtRate: number
): DocumentTotals {
  let gross = 0
  let discount_total = 0
  for (const it of items || []) {
    const qty = Number(it.quantity ?? 0)
    const price = Number(it.unit_price ?? 0)
    const disc = Number(it.discount ?? 0)
    gross += qty * price
    discount_total += disc
  }
  const afterDiscount = gross - discount_total

  let base: number
  let vat_amount: number
  if (vatMode === 'exclusive') {
    base = afterDiscount
    vat_amount = base * VAT_RATE
  } else if (vatMode === 'inclusive') {
    base = afterDiscount / (1 + VAT_RATE)
    vat_amount = afterDiscount - base
  } else {
    base = afterDiscount
    vat_amount = 0
  }

  const total = vatMode === 'exclusive' ? base + vat_amount : afterDiscount
  const wht_amount = base * (Number(whtRate || 0) / 100)

  return {
    subtotal: round2(gross),
    discount_total: round2(discount_total),
    vat_amount: round2(vat_amount),
    wht_amount: round2(wht_amount),
    total: round2(total),
    net_payable: round2(total - wht_amount),
  }
}

/** จำนวนเงินต่อรายการ (ใช้ตอนบันทึกลง document_items.amount) */
export function calcItemAmount(it: DocumentItemInput): number {
  return round2(Number(it.quantity ?? 0) * Number(it.unit_price ?? 0) - Number(it.discount ?? 0))
}

// ── Row types ────────────────────────────────────────────────────────────────
// ponytail: ตารางชุดนี้ยังไม่อยู่ใน types/database.types.ts (ต้องใช้ supabase CLI gen)
// จึงประกาศ shape แบบเบาๆ ไว้ที่นี่แล้ว cast ใน actions — pattern เดียวกับ crm_leads

export interface DocBrandRow {
  code: string
  name_th: string
  name_en: string | null
  address: string | null
  tax_id: string | null
  branch: string | null
  phone: string | null
  email: string | null
  website: string | null
  logo_url: string | null
  vat_registered: boolean
  default_vat_mode: VatMode
  default_wht_rate: number
  is_active: boolean
  sort_order: number
}

export interface DocumentItemRow {
  id: string
  document_id: string
  line_no: number
  description: string | null
  quantity: number
  unit: string | null
  unit_price: number
  discount: number
  amount: number
}

export interface DocumentLogRow {
  id: string
  document_id: string
  action: string
  from_status: string | null
  to_status: string | null
  changed_by: string | null
  note: string | null
  self_approved: boolean
  created_at: string
  changer?: { id: string; full_name: string | null } | null
}

export interface DocTemplateRow {
  id: string
  brand_code: string
  doc_type: string
  version: number
  title: string | null
  terms: string | null
  footer: string | null
  signer_label_1: string | null
  signer_label_2: string | null
  payment_info: string | null
  is_active: boolean
  created_by: string | null
  created_at: string
}

export interface DocumentRow {
  id: string
  draft_no: string
  doc_no: string | null
  brand_code: string
  doc_type: DocTypeCode
  status: DocStatus
  template_version_id: string | null
  party_name: string | null
  party_company: string | null
  party_tax_id: string | null
  party_address: string | null
  party_phone: string | null
  party_email: string | null
  party_id_card: string | null
  party_birth_date: string | null
  doc_date: string | null
  meta: Record<string, unknown>
  vat_mode: VatMode
  wht_rate: number
  subtotal: number
  discount_total: number
  vat_amount: number
  wht_amount: number
  total: number
  net_payable: number
  currency: string
  ref_document_id: string | null
  notes: string | null
  created_by: string | null
  submitted_at: string | null
  approved_by: string | null
  approved_at: string | null
  issued_at: string | null
  rejected_reason: string | null
  void_reason: string | null
  void_by: string | null
  void_at: string | null
  sent_at: string | null
  closed_at: string | null
  created_at: string
  updated_at: string
  creator?: { id: string; full_name: string | null } | null
}
